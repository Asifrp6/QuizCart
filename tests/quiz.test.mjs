/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Compile the actual services with isolated dependencies: no development DB or credentials.
function load(file, mocks = {}) {
  const filename = resolve(file);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${source}\n})`, {
    filename,
  })(
    (name) =>
      name in mocks
        ? mocks[name]
        : name.startsWith(".")
          ? load(resolve(dirname(filename), `${name}.ts`), mocks)
          : require(name),
    module,
    module.exports,
  );
  return module.exports;
}

const logic = load("app/lib/logic.ts");
const { clamp } = load("app/lib/quiz.ts");
const questions = [
  {
    id: "first",
    position: 0,
    type: "single",
    required: true,
    answers: [{ id: "yes" }, { id: "no" }],
  },
  { id: "second", position: 1, type: "text", required: true, answers: [] },
  {
    id: "third",
    position: 2,
    type: "single",
    required: true,
    answers: [{ id: "pick" }],
  },
];
const rules = [
  {
    targetQuestionId: "second",
    action: "show",
    match: "all",
    conditions: [{ questionId: "first", answerId: "yes" }],
  },
  {
    targetQuestionId: "third",
    action: "show",
    match: "all",
    conditions: [{ questionId: "second", answerId: "stale" }],
  },
];

test("changing an earlier answer hides dependent questions despite stale answers", () => {
  const responses = [
    { questionId: "first", answerIds: ["no"] },
    { questionId: "second", answerIds: ["stale"] },
  ];
  assert.deepEqual(
    logic.visibleQuestions(questions, rules, responses).map((q) => q.id),
    ["first"],
  );
});

test("branch rules support any/all and reject empty conditions", () => {
  const responses = [{ questionId: "first", answerIds: ["yes"] }];
  const conditions = [
    { questionId: "first", answerId: "yes" },
    { questionId: "first", answerId: "no" },
  ];
  assert.equal(
    logic.ruleMatches({ conditions, match: "all" }, responses),
    false,
  );
  assert.equal(
    logic.ruleMatches({ conditions, match: "any" }, responses),
    true,
  );
  assert.equal(
    logic.ruleMatches({ conditions: [], match: "all" }, responses),
    false,
  );
});

test("product scores combine matching answers without duplicate response inflation", () => {
  assert.deepEqual(
    logic.scoreProducts(
      [
        { answerId: "yes", shopifyProductId: "a", score: 10 },
        { answerId: null, shopifyProductId: "a", score: 5 },
        { answerId: "no", shopifyProductId: "b", score: 100 },
      ],
      [{ questionId: "first", answerIds: ["yes", "yes"] }],
    ),
    [{ shopifyProductId: "a", score: 15 }],
  );
});

test("numeric bounds handle invalid and infinite input", () => {
  assert.equal(clamp(NaN, 1, 8), 1);
  assert.equal(clamp(Infinity, 1, 8), 1);
  assert.equal(clamp(100, 1, 8), 8);
});

function storefront(overrides = {}) {
  const session = {
    id: "session",
    shopId: "shop",
    quizId: "quiz",
    status: "started",
    customer: { name: "Alex" },
    responses: [],
    recommendations: [],
    quiz: {
      questions: [questions[0]],
      rules: [],
      mappings: [],
      shop: { settings: {} },
      resultTitle: "Matches",
      resultBody: "For you",
    },
    ...overrides,
  };
  const events = [];
  const stored = [];
  let rankingCalls = 0;
  const prisma = {
    quizSession: {
      findFirst: async () => session,
      updateMany: async () => {
        if (session.status === "completed") return { count: 0 };
        session.status = "completed";
        return { count: 1 };
      },
    },
    quizResponse: {
      findUnique: async () => null,
      upsert: async (args) => stored.push(args),
    },
    recommendation: {
      deleteMany: async () => {},
      createMany: async ({ data }) => {
        session.recommendations = data;
      },
      findMany: async () => session.recommendations,
    },
    analyticsEvent: { createMany: async ({ data }) => events.push(...data) },
    $transaction: async (callback) => callback(prisma),
  };
  const service = load("app/services/storefront.server.ts", {
    "../db.server": { default: prisma, __esModule: true },
    "../shopify.server": { authenticate: {} },
    "./shop.server": {},
    "./analytics.server": { trackEvent: async (event) => events.push(event) },
    "./recommendation.server": {
      recommendForSession: async () => {
        rankingCalls++;
        return [{ title: "Product", rank: 1 }];
      },
    },
  });
  return { service, session, stored, events, rankingCalls: () => rankingCalls };
}

test("required answers are validated, single selections are normalized", async () => {
  const { service, stored } = storefront();
  const input = {
    shopId: "shop",
    sessionId: "session",
    questionId: "first",
    answerIds: ["foreign"],
    textValue: "",
    numericValue: null,
  };
  assert.equal((await service.saveAnswer(input)).status, 400);
  assert.equal(
    (await service.saveAnswer({ ...input, answerIds: ["yes", "no", "yes"] }))
      .status,
    200,
  );
  assert.equal(stored[0].create.answerIds, "yes");
});

test("completed sessions reject answer changes", async () => {
  const { service, stored } = storefront({ status: "completed" });
  assert.equal(
    (await service.saveAnswer({ shopId: "shop", sessionId: "session" })).status,
    409,
  );
  assert.equal(stored.length, 0);
});

test("completion rejects missing or empty required answers", async () => {
  const { service, session, rankingCalls } = storefront();
  assert.equal((await service.completeSession("shop", "session")).status, 400);
  session.responses = [{ questionId: "first", answerIds: "foreign" }];
  assert.equal((await service.completeSession("shop", "session")).status, 400);
  assert.equal(rankingCalls(), 0);
});

test("repeat completion returns stored results and records completion once", async () => {
  const { service, events, rankingCalls } = storefront({
    responses: [{ questionId: "first", answerIds: "yes" }],
  });
  const first = await (await service.completeSession("shop", "session")).json();
  const second = await (
    await service.completeSession("shop", "session")
  ).json();
  assert.equal(first.recommendations[0].title, second.recommendations[0].title);
  assert.equal(
    events.filter((e) => e.eventType === "quiz_completed").length,
    1,
  );
  assert.equal(rankingCalls(), 1);
});

test("concurrent completion records only one set of results and events", async () => {
  const { service, events } = storefront({
    responses: [{ questionId: "first", answerIds: "yes" }],
  });
  const responses = await Promise.all([
    service.completeSession("shop", "session"),
    service.completeSession("shop", "session"),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
  assert.equal(
    events.filter((e) => e.eventType === "quiz_completed").length,
    1,
  );
});

test("slider input is snapped to an integer step and bounded", async () => {
  const { service, stored } = storefront({
    quiz: {
      questions: [
        {
          ...questions[0],
          type: "slider",
          sliderMin: 0,
          sliderMax: 10,
          sliderStep: 2,
        },
      ],
    },
  });
  await service.saveAnswer({
    shopId: "shop",
    sessionId: "session",
    questionId: "first",
    answerIds: ["yes"],
    numericValue: 3.3,
  });
  assert.equal(stored[0].create.numericValue, 4);
  assert.equal(stored[0].create.answerIds, "");
});

test("proxy JSON parsing rejects malformed, array, and oversized payloads", async () => {
  const { service } = storefront();
  for (const body of ["broken", "[]", "x".repeat(50001)]) {
    await assert.rejects(
      service.readJson(
        new Request("https://example.com", { method: "POST", body }),
      ),
      (error) => error instanceof Response && [400, 413].includes(error.status),
    );
  }
});

function quizService(quiz) {
  const writes = [];
  const prisma = {
    quiz: {
      findFirst: async () => quiz,
      update: async (args) => writes.push(args),
    },
    shopifyProduct: { findFirst: async () => ({ shopifyId: "product" }) },
    productMapping: {
      create: async (args) => writes.push(args),
      update: async (args) => writes.push(args),
    },
    logicRule: { create: async (args) => writes.push(args) },
  };
  return {
    service: load("app/services/quiz.server.ts", {
      "../db.server": { default: prisma, __esModule: true },
    }),
    writes,
  };
}

test("publishing requires complete choice questions and product mappings", async () => {
  const quiz = { id: "quiz", questions: [questions[0]], mappings: [] };
  const { service, writes } = quizService(quiz);
  await assert.rejects(
    service.setQuizStatus("shop", "quiz", "published"),
    (e) => e.code === "need-mappings",
  );
  quiz.mappings = [{ id: "mapping" }];
  await service.setQuizStatus("shop", "quiz", "published");
  assert.equal(writes[0].data.status, "published");
});

test("mapping a product twice updates its score rather than doubling it", async () => {
  const { service, writes } = quizService({
    id: "quiz",
    questions: [questions[0]],
    mappings: [
      { id: "existing", answerId: "yes", shopifyProductId: "product" },
    ],
  });
  await service.addMapping("shop", "quiz", {
    answerId: "yes",
    shopifyProductId: "product",
    score: 20.4,
  });
  assert.deepEqual(writes[0], {
    where: { id: "existing" },
    data: { score: 20 },
  });
});

test("default recommendations work for text-only quizzes", async () => {
  const { service, writes } = quizService({
    id: "quiz",
    questions: [questions[1]],
    mappings: [],
  });
  await service.addMapping("shop", "quiz", {
    answerId: "",
    shopifyProductId: "product",
    score: 10,
  });
  assert.equal(writes[0].data.answerId, null);
});

test("branching rejects rules that depend on a later question", async () => {
  const { service } = quizService({
    id: "quiz",
    questions: [questions[0], questions[2]],
    rules: [],
  });
  await assert.rejects(
    service.addRule("shop", "quiz", {
      answerId: "pick",
      targetQuestionId: "first",
    }),
    (e) => e.code === "invalid-rule",
  );
});

function editingService(original) {
  const writes = [];
  let counter = 0;
  const create =
    (model) =>
    async ({ data }) => {
      const row = { ...data, id: `new-${model}-${++counter}` };
      writes.push({ model, data: row });
      return row;
    };
  const tx = {
    quiz: {
      create: create("quiz"),
      update: async (args) => writes.push({ model: "quiz-update", ...args }),
    },
    question: {
      create: create("question"),
      update: async (args) =>
        writes.push({ model: "question-update", ...args }),
    },
    answer: { create: create("answer") },
    logicRule: { create: create("rule") },
    productMapping: { create: create("mapping") },
  };
  const prisma = {
    ...tx,
    quiz: {
      ...tx.quiz,
      findFirst: async ({ where }) => (where.handle ? null : original),
    },
    $transaction: async (callback) => callback(tx),
  };
  return {
    service: load("app/services/quiz.server.ts", {
      "../db.server": { default: prisma, __esModule: true },
    }),
    writes,
  };
}

test("duplicate quiz creates a draft with new IDs and remapped rules and products", async () => {
  const original = {
    id: "original",
    shopId: "shop",
    title: "Skin finder",
    handle: "skin",
    status: "published",
    createdAt: new Date(),
    updatedAt: new Date(),
    primaryColor: "#112233",
    welcomeTitle: "Welcome",
    questions: [
      {
        ...questions[0],
        quizId: "original",
        answers: [
          { id: "yes", questionId: "first", label: "Yes", position: 0 },
        ],
      },
      { ...questions[1], quizId: "original" },
    ],
    rules: [
      {
        ...rules[0],
        id: "rule",
        quizId: "original",
        conditions: JSON.stringify(rules[0].conditions),
        position: 0,
      },
    ],
    mappings: [
      { answerId: "yes", shopifyProductId: "product", score: 20 },
      { answerId: null, shopifyProductId: "default", score: 5 },
    ],
  };
  const before = JSON.stringify(original);
  const { service, writes } = editingService(original);
  const copy = await service.duplicateQuiz("shop", "original");
  assert.equal(copy.status, "draft");
  assert.equal(copy.title, "Skin finder (copy)");
  assert.equal(copy.primaryColor, "#112233");
  assert.equal(copy.welcomeTitle, "Welcome");
  assert.ok(!("createdAt" in copy));
  const newQuestions = writes.filter((row) => row.model === "question");
  const newAnswer = writes.find((row) => row.model === "answer").data;
  const newRule = writes.find((row) => row.model === "rule").data;
  assert.equal(newAnswer.questionId, newQuestions[0].data.id);
  assert.equal(newRule.targetQuestionId, newQuestions[1].data.id);
  assert.deepEqual(JSON.parse(newRule.conditions), [
    { questionId: newQuestions[0].data.id, answerId: newAnswer.id },
  ]);
  const mappings = writes.filter((row) => row.model === "mapping");
  assert.equal(mappings[0].data.answerId, newAnswer.id);
  assert.equal(mappings[1].data.answerId, null);
  assert.ok(
    writes.every(
      (row) => !["session", "customer", "event"].includes(row.model),
    ),
  );
  assert.equal(JSON.stringify(original), before);
});

test("reordering normalizes positions and updates the quiz timestamp", async () => {
  const { service, writes } = editingService({
    id: "quiz",
    questions: [questions[0], questions[1], questions[2]],
    rules: [],
  });
  await service.moveQuestion("shop", "quiz", "third", "up");
  assert.deepEqual(
    writes
      .filter((row) => row.model === "question-update")
      .map((row) => [row.where.id, row.data.position]),
    [
      ["first", 0],
      ["third", 1],
      ["second", 2],
    ],
  );
  assert.equal(writes.at(-1).model, "quiz-update");
});

test("reordering rejects broken branching without writing any positions", async () => {
  const { service, writes } = editingService({
    id: "quiz",
    questions: [questions[0], questions[1]],
    rules: [{ ...rules[0], conditions: JSON.stringify(rules[0].conditions) }],
  });
  await assert.rejects(
    service.moveQuestion("shop", "quiz", "second", "up"),
    (error) => error.code === "invalid-order",
  );
  assert.equal(writes.length, 0);
});

test("reordering at a boundary does nothing and rejects foreign question IDs", async () => {
  const { service, writes } = editingService({
    id: "quiz",
    questions: [questions[0]],
    rules: [],
  });
  await service.moveQuestion("shop", "quiz", "first", "up");
  assert.equal(writes.length, 0);
  await assert.rejects(
    service.moveQuestion("shop", "quiz", "foreign", "down"),
    (error) => error.code === "missing-question",
  );
});

function libraryAction(overrides = {}) {
  const { QuizError } = load("app/services/quiz.server.ts", {
    "../db.server": {},
  });
  const calls = [];
  const services = {
    QuizError,
    setQuizStatus: async (...args) => calls.push(["status", ...args]),
    deleteQuiz: async (...args) => calls.push(["delete", ...args]),
    createQuiz: async () => ({ id: "created" }),
    duplicateQuiz: async () => ({ id: "copy" }),
    ...overrides,
  };
  const { action } = load("app/routes/app.quizzes._index.tsx", {
    "react-router": {
      data: (value, options) => ({
        data: value,
        status: options?.status ?? 200,
      }),
    },
    "../shopify.server": {
      authenticate: {
        admin: async () => ({ session: { shop: "demo.myshopify.com" } }),
      },
    },
    "../services/shop.server": { ensureShop: async () => ({ id: "shop" }) },
    "../services/quiz.server": services,
    "../headers.server": {},
    "../components/admin-ui": {},
    "../components/quiz-library": {},
    "../components/quiz-preview": {},
    "../components/app-route-link": {},
    "../quiz-library.css?url": {},
    "../lib/app-redirect.server": {
      appRedirect: (_, href) =>
        new Response(null, { status: 302, headers: { Location: href } }),
    },
  });
  const run = (intent, surface = "dialog") =>
    action({
      request: new Request("https://example.com/app/quizzes", {
        method: "POST",
        body: new URLSearchParams({
          intent,
          quizId: "quiz",
          surface,
          title: "My quiz",
        }),
      }),
    });
  return { run, calls, services, QuizError };
}

test("popup publish, unpublish, and delete return success for automatic dismissal", async () => {
  const { run, calls } = libraryAction();
  for (const intent of ["publish", "unpublish", "delete"]) {
    assert.deepEqual((await run(intent)).data, { ok: true, error: null });
  }
  assert.deepEqual(calls, [
    ["status", "shop", "quiz", "published"],
    ["status", "shop", "quiz", "draft"],
    ["delete", "shop", "quiz"],
  ]);
});

test("popup validation errors return inline messages instead of redirects", async () => {
  const { run, services, QuizError } = libraryAction();
  services.setQuizStatus = async () => {
    throw new QuizError("need-mappings");
  };
  const response = await run("publish");
  assert.equal(response.status, 400);
  assert.equal(response.data.ok, false);
  assert.match(response.data.error, /Connect at least one product/);
  services.createQuiz = async () => {
    throw new QuizError("missing-title");
  };
  assert.equal((await run("create")).data.error, "Add a quiz title.");
});

test("popup create and duplicate open the resulting quiz editor", async () => {
  const { run } = libraryAction();
  assert.match(
    (await run("create")).headers.get("Location"),
    /\/app\/quizzes\/created\?step=question1/,
  );
  assert.match(
    (await run("duplicate")).headers.get("Location"),
    /\/app\/quizzes\/copy\?step=question1/,
  );
});

test("regular publish forms retain their redirect behavior", async () => {
  const { run } = libraryAction();
  assert.equal(
    (await run("publish", "")).headers.get("Location"),
    "/app/quizzes?notice=published",
  );
});

test("storefront branching agrees with server visibility", () => {
  const source = readFileSync(
    "extensions/quiz-widget/assets/quizcart-runtime.js",
    "utf8",
  ).replace(
    /\}\)\(\);\s*$/,
    "globalThis.runtime = { visibleQuestions, begin }; })();",
  );
  const context = vm.createContext({
    document: {
      readyState: "loading",
      addEventListener() {},
      documentElement: {},
    },
    MutationObserver: class {
      observe() {}
    },
  });
  vm.runInContext(source, context);
  const responses = [
    { questionId: "first", answerIds: ["no"] },
    { questionId: "second", answerIds: ["stale"] },
  ];
  assert.deepEqual(
    Array.from(
      context.runtime.visibleQuestions({ questions, rules }, responses),
      (q) => q.id,
    ),
    ["first"],
  );
});

test("customer information screen renders the configured title and body", async () => {
  const nodes = [];
  const makeNode = () => {
    const node = {
      append() {},
      replaceChildren() {},
      removeAttribute() {},
      setAttribute() {},
      addEventListener() {},
    };
    nodes.push(node);
    return node;
  };
  const source = readFileSync(
    "extensions/quiz-widget/assets/quizcart-runtime.js",
    "utf8",
  ).replace(/\}\)\(\);\s*$/, "globalThis.runtime = { begin }; })();");
  const context = vm.createContext({
    document: {
      readyState: "loading",
      addEventListener() {},
      documentElement: {},
      createElement: makeNode,
    },
    MutationObserver: class {
      observe() {}
    },
  });
  vm.runInContext(source, context);
  await context.runtime.begin(makeNode(), {
    quiz: {
      customer: { collectName: true, collectAge: true },
      appearance: { showProgress: false },
      questions: [],
      customerInfoTitle: "Tell us about you",
      customerInfoBody: "Find your routine",
      ageRangeOptions: ["18 - 25"],
    },
  });
  assert.ok(nodes.some((node) => node.textContent === "Tell us about you"));
  assert.ok(nodes.some((node) => node.textContent === "Find your routine"));
});

test("dragging across multiple questions inserts at the target and normalizes serial numbers", async () => {
  const { service, writes } = editingService({
    id: "quiz",
    questions: [questions[0], questions[1], questions[2]],
    rules: [],
  });
  await service.moveQuestion("shop", "quiz", "first", "drop", "third");
  assert.deepEqual(
    writes
      .filter((row) => row.model === "question-update")
      .map((row) => [row.where.id, row.data.position]),
    [
      ["second", 0],
      ["third", 1],
      ["first", 2],
    ],
  );
});
test("dragging rejects foreign targets and broken branching before saving", async () => {
  const { service, writes } = editingService({
    id: "quiz",
    questions: [questions[0], questions[1]],
    rules: [{ ...rules[0], conditions: JSON.stringify(rules[0].conditions) }],
  });
  await assert.rejects(
    service.moveQuestion("shop", "quiz", "first", "drop", "foreign"),
    (error) => error.code === "missing-question",
  );
  await assert.rejects(
    service.moveQuestion("shop", "quiz", "first", "drop", "second"),
    (error) => error.code === "invalid-order",
  );
  assert.equal(writes.length, 0);
});
