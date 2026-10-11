import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  ensureShop,
  resolveAppearance,
  resolveCustomerFields,
} from "./shop.server";
import { parseConditions, visibleQuestions } from "../lib/logic";
import {
  isChoiceType,
  isSingleChoice,
  STOREFRONT_EVENTS,
  clamp,
} from "../lib/quiz";
import { recommendForSession } from "./recommendation.server";
import { trackEvent } from "./analytics.server";

const jsonHeaders = { "Content-Type": "application/json" };
const hits = new Map<string, { count: number; reset: number }>();

export function proxyJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

export async function requireProxyShop(request: Request) {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return {
      error: proxyJson(
        { error: "QuizCart is not installed on this shop." },
        401,
      ),
    };
  }
  if (
    !allow(
      `${session.shop}:${request.headers.get("x-forwarded-for") ?? "store"}`,
    )
  ) {
    return {
      error: proxyJson(
        { error: "Too many requests. Try again in a minute." },
        429,
      ),
    };
  }
  const shop = await ensureShop(session.shop);
  return { shop };
}

export async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 50_000) {
    throw proxyJson({ error: "Payload is too large." }, 413);
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw proxyJson({ error: "Invalid JSON." }, 400);
  }
}

function allow(key: string) {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.reset < now) {
    for (const [entryKey, entry] of hits) {
      if (entry.reset < now) hits.delete(entryKey);
    }
    hits.set(key, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (current.count >= 80) return false;
  current.count += 1;
  return true;
}

export async function publishedQuiz(shopId: string, handle: string) {
  const quiz = await prisma.quiz.findFirst({
    where: {
      shopId,
      status: "published",
      ...(handle ? { handle } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      questions: {
        orderBy: { position: "asc" },
        include: { answers: { orderBy: { position: "asc" } } },
      },
      rules: true,
      mappings: true,
      shop: { include: { settings: true } },
    },
  });
  return quiz;
}

function parseTextList(value: string, fallback: string[]): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const entries = parsed.filter(
        (item): item is string => typeof item === "string",
      );
      if (entries.length) return entries;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function publicQuizPayload(
  quiz: NonNullable<Awaited<ReturnType<typeof publishedQuiz>>>,
) {
  const settings = quiz.shop.settings;
  if (!settings) return null;
  return {
    id: quiz.id,
    title: quiz.title,
    handle: quiz.handle,
    description: quiz.description,
    welcomeTitle: quiz.welcomeTitle,
    welcomeBody: quiz.welcomeBody,
    welcomeImageUrl: quiz.welcomeImageUrl,
    startButtonText: quiz.startButtonText,
    showDuration: quiz.showDuration,
    durationText: quiz.durationText,
    showPersonalizedBenefit: quiz.showPersonalizedBenefit,
    welcomeBenefits: parseTextList(quiz.welcomeBenefits, [
      "Takes less than 2 minutes",
      "100% personalized results",
    ]),
    customerInfoTitle: quiz.customerInfoTitle,
    customerInfoBody: quiz.customerInfoBody,
    ageRangeOptions: parseTextList(quiz.ageRangeOptions, [
      "Under 18",
      "18 - 25",
      "26 - 35",
      "36 - 45",
      "46+",
    ]),
    resultTitle: quiz.resultTitle,
    resultBody: quiz.resultBody,
    customer: resolveCustomerFields(settings, quiz),
    appearance: resolveAppearance(settings, quiz),
    questions: quiz.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      helpText: question.helpText,
      type: question.type,
      required: question.required,
      position: question.position,
      sliderMin: question.sliderMin,
      sliderMax: question.sliderMax,
      sliderStep: question.sliderStep,
      layout: question.layout,
      answers: question.answers.map((answer) => ({
        id: answer.id,
        label: answer.label,
        description: answer.description,
        imageUrl: answer.imageUrl,
        position: answer.position,
      })),
    })),
    rules: quiz.rules.map((rule) => ({
      targetQuestionId: rule.targetQuestionId,
      match: rule.match,
      action: rule.action,
      conditions: parseConditions(rule.conditions),
    })),
  };
}

export async function startSession(input: {
  shopId: string;
  handle: string;
  name: string;
  age: number | null;
  ageRange: string;
}) {
  const quiz = await publishedQuiz(input.shopId, input.handle);
  const settings = quiz?.shop.settings;
  if (!quiz || !settings) return proxyJson({ error: "Quiz not found." }, 404);
  const fields = resolveCustomerFields(settings, quiz);
  const name = input.name.trim().slice(0, 80);
  const ageRange = input.ageRange.trim();
  const allowedAgeRanges = parseTextList(quiz.ageRangeOptions, [
    "Under 18",
    "18 - 25",
    "26 - 35",
    "36 - 45",
    "46+",
  ]);
  if (fields.collectName && fields.nameRequired && !name) {
    return proxyJson({ error: "Name is required." }, 400);
  }

  if (
    fields.collectAge &&
    fields.ageRequired &&
    input.age == null &&
    !ageRange
  ) {
    return proxyJson({ error: "Age range is required." }, 400);
  }
  if (
    input.age != null &&
    (!Number.isInteger(input.age) || input.age < 1 || input.age > 120)
  ) {
    return proxyJson({ error: "Enter an age between 1 and 120." }, 400);
  }
  if (fields.collectAge && ageRange && !allowedAgeRanges.includes(ageRange)) {
    return proxyJson({ error: "Choose a valid age range." }, 400);
  }

  const customer = await prisma.quizCustomer.create({
    data: {
      shopId: input.shopId,
      name: fields.collectName ? name : "",
      age: fields.collectAge && !ageRange ? input.age : null,
      ageRange: fields.collectAge ? ageRange : "",
    },
  });
  const session = await prisma.quizSession.create({
    data: {
      shopId: input.shopId,
      quizId: quiz.id,
      customerId: customer.id,
      status: "started",
    },
  });
  await trackEvent({
    shopId: input.shopId,
    quizId: quiz.id,
    sessionId: session.id,
    eventType: "quiz_started",
  });
  await trackEvent({
    shopId: input.shopId,
    quizId: quiz.id,
    sessionId: session.id,
    eventType: "customer_info_submitted",
  });
  return proxyJson({ sessionId: session.id });
}

export async function saveAnswer(input: {
  shopId: string;
  sessionId: string;
  questionId: string;
  answerIds: string[];
  textValue: string;
  numericValue: number | null;
}) {
  const session = await loadSession(input.shopId, input.sessionId);
  if (!session) return proxyJson({ error: "Session not found." }, 404);
  if (session.status === "completed")
    return proxyJson(
      {
        error:
          "This quiz is already completed. Retake it to change your answers.",
      },
      409,
    );
  const question = session.quiz.questions.find(
    (item) => item.id === input.questionId,
  );
  if (!question) return proxyJson({ error: "Question not found." }, 404);

  const answerIds = (
    isChoiceType(question.type) ? [...new Set(input.answerIds)] : []
  ).filter((id) => question.answers.some((answer) => answer.id === id));
  if (isChoiceType(question.type)) {
    if (question.required && answerIds.length === 0) {
      return proxyJson({ error: "Choose an answer to continue." }, 400);
    }
    if (isSingleChoice(question.type) && answerIds.length > 1) {
      answerIds.splice(1);
    }
  }

  let numericValue = input.numericValue;
  if (question.type === "slider") {
    if (numericValue == null || !Number.isFinite(numericValue)) {
      return proxyJson({ error: "Choose a value to continue." }, 400);
    }
    numericValue = Math.round(
      clamp(
        question.sliderMin +
          Math.round(
            (numericValue - question.sliderMin) / question.sliderStep,
          ) *
            question.sliderStep,
        question.sliderMin,
        question.sliderMax,
      ),
    );
  } else {
    numericValue = null;
  }

  const textValue =
    question.type === "text" ? input.textValue.trim().slice(0, 500) : "";
  if (question.type === "text" && question.required && !textValue) {
    return proxyJson({ error: "Enter an answer to continue." }, 400);
  }

  const existing = await prisma.quizResponse.findUnique({
    where: {
      sessionId_questionId: {
        sessionId: session.id,
        questionId: question.id,
      },
    },
  });
  await prisma.quizResponse.upsert({
    where: {
      sessionId_questionId: {
        sessionId: session.id,
        questionId: question.id,
      },
    },
    create: {
      sessionId: session.id,
      questionId: question.id,
      answerIds: answerIds.join(","),
      textValue,
      numericValue,
    },
    update: {
      answerIds: answerIds.join(","),
      textValue,
      numericValue,
    },
  });
  if (!existing) {
    await trackEvent({
      shopId: session.shopId,
      quizId: session.quizId,
      sessionId: session.id,
      eventType: "question_answered",
      metadata: { questionId: question.id, prompt: question.prompt },
    });
  }
  return proxyJson({ ok: true });
}

export async function completeSession(shopId: string, sessionId: string) {
  const session = await loadSession(shopId, sessionId);
  const settings = session?.quiz.shop.settings;
  if (!session || !settings)
    return proxyJson({ error: "Session not found." }, 404);
  const result = (recommendations: unknown) =>
    proxyJson({
      customerName: session.customer?.name ?? "",
      resultTitle: session.quiz.resultTitle,
      resultBody: session.quiz.resultBody,
      recommendations,
    });
  if (session.status === "completed") return result(session.recommendations);

  const rules = session.quiz.rules.map((rule) => ({
    targetQuestionId: rule.targetQuestionId,
    match: rule.match,
    action: rule.action,
    conditions: parseConditions(rule.conditions),
  }));
  const responses = session.responses.map((response) => ({
    questionId: response.questionId,
    answerIds: response.answerIds.split(",").filter(Boolean),
  }));
  const visible = visibleQuestions(session.quiz.questions, rules, responses);
  const missing = visible.filter((question) => {
    if (!question.required) return false;
    const response = session.responses.find(
      (item) => item.questionId === question.id,
    );
    if (!response) return true;
    if (question.type === "text") return !response.textValue.trim();
    if (question.type === "slider") return response.numericValue == null;
    return !response.answerIds
      .split(",")
      .some((id) => question.answers.some((answer) => answer.id === id));
  });
  if (missing.length) {
    return proxyJson({ error: "Answer the required questions first." }, 400);
  }

  const recommendations = await recommendForSession({
    shopId,
    quiz: session.quiz,
    settings,
    responses: session.responses,
  });

  const completed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.quizSession.updateMany({
      where: { id: session.id, status: "started" },
      data: { status: "completed", completedAt: new Date() },
    });
    if (!claimed.count) return false;
    await tx.recommendation.deleteMany({ where: { sessionId: session.id } });
    if (recommendations.length)
      await tx.recommendation.createMany({
        data: recommendations.map((item) => ({
          ...item,
          sessionId: session.id,
        })),
      });
    await tx.analyticsEvent.createMany({
      data: ["quiz_completed", "recommendations_viewed"].map((eventType) => ({
        shopId,
        quizId: session.quizId,
        sessionId: session.id,
        eventType,
      })),
    });
    return true;
  });
  return result(
    completed
      ? recommendations
      : await prisma.recommendation.findMany({
          where: { sessionId: session.id },
          orderBy: { rank: "asc" },
        }),
  );
}

export async function recordStorefrontEvent(input: {
  shopId: string;
  sessionId?: string;
  handle?: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  if (!STOREFRONT_EVENTS.has(input.eventType)) {
    return proxyJson({ error: "Unknown event." }, 400);
  }

  if (input.eventType === "quiz_viewed" && input.handle) {
    const quiz = await prisma.quiz.findFirst({
      where: {
        shopId: input.shopId,
        handle: input.handle,
        status: "published",
      },
      select: { id: true },
    });
    if (!quiz) return proxyJson({ error: "Quiz not found." }, 404);
    await trackEvent({
      shopId: input.shopId,
      quizId: quiz.id,
      eventType: "quiz_viewed",
    });
    return proxyJson({ ok: true });
  }

  if (!input.sessionId) return proxyJson({ error: "Session not found." }, 404);
  const session = await prisma.quizSession.findFirst({
    where: { id: input.sessionId, shopId: input.shopId },
    select: { id: true, quizId: true },
  });
  if (!session) return proxyJson({ error: "Session not found." }, 404);

  const metadata: Record<string, unknown> = {};
  if (typeof input.metadata?.questionId === "string") {
    metadata.questionId = input.metadata.questionId.slice(0, 80);
  }
  if (typeof input.metadata?.prompt === "string") {
    metadata.prompt = input.metadata.prompt.slice(0, 180);
  }
  if (typeof input.metadata?.productId === "string") {
    metadata.productId = input.metadata.productId.slice(0, 120);
  }
  if (typeof input.metadata?.title === "string") {
    metadata.title = input.metadata.title.slice(0, 180);
  }

  await trackEvent({
    shopId: input.shopId,
    quizId: session.quizId,
    sessionId: session.id,
    eventType: input.eventType,
    metadata,
  });
  return proxyJson({ ok: true });
}

async function loadSession(shopId: string, sessionId: string) {
  return prisma.quizSession.findFirst({
    where: { id: sessionId, shopId },
    include: {
      customer: true,
      responses: true,
      recommendations: { orderBy: { rank: "asc" } },
      quiz: {
        include: {
          shop: { include: { settings: true } },
          questions: { include: { answers: true } },
          rules: true,
          mappings: true,
        },
      },
    },
  });
}
