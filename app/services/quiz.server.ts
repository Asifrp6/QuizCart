import prisma from "../db.server";
import { parseConditions } from "../lib/logic";
import { clamp, isChoiceType, slugify } from "../lib/quiz";

export class QuizError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const quizInclude = {
  questions: {
    orderBy: { position: "asc" as const },
    include: {
      answers: { orderBy: { position: "asc" as const } },
    },
  },
  rules: { orderBy: { position: "asc" as const } },
  mappings: true,
};

export async function listQuizzes(shopId: string, status?: string) {
  return prisma.quiz.findMany({
    where: {
      shopId,
      ...(status === "draft" || status === "published" ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { questions: true, sessions: true } },
    },
  });
}

export async function getQuiz(shopId: string, id: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id, shopId },
    include: quizInclude,
  });
  if (!quiz) {
    throw new Response("Quiz not found", { status: 404 });
  }
  return quiz;
}

export async function createQuiz(
  shopId: string,
  title: string,
  description: string,
) {
  const cleanTitle = title.trim().slice(0, 120);
  if (!cleanTitle) throw new QuizError("missing-title");
  const handle = await uniqueHandle(shopId, cleanTitle);
  return prisma.quiz.create({
    data: {
      shopId,
      title: cleanTitle,
      description: description.trim().slice(0, 500),
      handle,
    },
  });
}

export async function updateQuiz(
  shopId: string,
  quizId: string,
  input: {
    title: string;
    handle: string;
    description: string;
    welcomeTitle: string;
    welcomeBody: string;
    welcomeImageUrl: string;
    startButtonText: string;
    showDuration: boolean;
    durationText: string;
    showPersonalizedBenefit: boolean;
    welcomeBenefits: string[];
    ageRangeOptions: string[];
    customerInfoTitle: string;
    customerInfoBody: string;
    resultTitle: string;
    resultBody: string;
    collectName: boolean | null;
    collectAge: boolean | null;
    nameRequired: boolean | null;
    ageRequired: boolean | null;
    aiEnabled: boolean | null;
    recommendationStyle: string | null;
    aiExplanation: boolean | null;
    maxRecommendations: number | null;
    primaryColor: string | null;
    accentColor: string | null;
  },
) {
  const quiz = await getQuiz(shopId, quizId);
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new QuizError("missing-title");
  const handle = await uniqueHandle(
    shopId,
    input.handle.trim() || title,
    quiz.id,
  );

  return prisma.quiz.update({
    where: { id: quiz.id },
    data: {
      title,
      handle,
      description: input.description.trim().slice(0, 500),
      welcomeTitle:
        input.welcomeTitle.trim().slice(0, 140) || quiz.welcomeTitle,
      welcomeBody: input.welcomeBody.trim().slice(0, 500),
      welcomeImageUrl: safeImageUrl(input.welcomeImageUrl),
      startButtonText:
        input.startButtonText.trim().slice(0, 50) || "Start Quiz",
      showDuration: input.showDuration,
      durationText: input.durationText.trim().slice(0, 50) || "2 minutes",
      showPersonalizedBenefit: input.showPersonalizedBenefit,
      welcomeBenefits: JSON.stringify(
        cleanTextList(input.welcomeBenefits, 8, 80),
      ),
      ageRangeOptions: JSON.stringify(
        cleanTextList(input.ageRangeOptions, 12, 40),
      ),
      customerInfoTitle:
        input.customerInfoTitle.trim().slice(0, 140) || "Let's get to know you",
      customerInfoBody:
        input.customerInfoBody.trim().slice(0, 500) ||
        "This helps us find the best match for your needs.",
      resultTitle: input.resultTitle.trim().slice(0, 140) || quiz.resultTitle,
      resultBody: input.resultBody.trim().slice(0, 500),
      collectName: input.collectName,
      collectAge: input.collectAge,
      nameRequired: input.nameRequired,
      ageRequired: input.ageRequired,
      aiEnabled: input.aiEnabled,
      recommendationStyle: input.recommendationStyle,
      aiExplanation: input.aiExplanation,
      maxRecommendations: input.maxRecommendations,
      primaryColor: input.primaryColor,
      accentColor: input.accentColor,
    },
  });
}

export async function setQuizStatus(
  shopId: string,
  quizId: string,
  status: "draft" | "published",
) {
  const quiz = await getQuiz(shopId, quizId);
  if (status === "published") {
    if (quiz.questions.length === 0) throw new QuizError("need-question");
    const incomplete = quiz.questions.some(
      (question) => isChoiceType(question.type) && question.answers.length < 2,
    );
    if (incomplete) throw new QuizError("incomplete-questions");
    if (!quiz.mappings.length) throw new QuizError("need-mappings");
  }
  return prisma.quiz.update({
    where: { id: quiz.id },
    data: { status },
  });
}

export async function deleteQuiz(shopId: string, quizId: string) {
  const quiz = await getQuiz(shopId, quizId);
  await prisma.quiz.delete({ where: { id: quiz.id } });
}

export async function duplicateQuiz(shopId: string, quizId: string) {
  const original = await getQuiz(shopId, quizId);
  const title = `${original.title.slice(0, 113)} (copy)`;
  const handle = await uniqueHandle(shopId, title);
  return prisma.$transaction(async (tx) => {
    const {
      id: _id,
      createdAt: _created,
      updatedAt: _updated,
      questions,
      rules,
      mappings,
      ...settings
    } = original;
    void [_id, _created, _updated];
    const copy = await tx.quiz.create({
      data: { ...settings, title, handle, status: "draft" },
    });
    const questionIds = new Map<string, string>();
    const answerIds = new Map<string, string>();
    for (const question of questions) {
      const { id, quizId: _quizId, answers, ...data } = question;
      void _quizId;
      const saved = await tx.question.create({
        data: { ...data, quizId: copy.id },
      });
      questionIds.set(id, saved.id);
      for (const answer of answers) {
        const { id: answerId, questionId: _questionId, ...answerData } = answer;
        void _questionId;
        const savedAnswer = await tx.answer.create({
          data: { ...answerData, questionId: saved.id },
        });
        answerIds.set(answerId, savedAnswer.id);
      }
    }
    for (const rule of rules) {
      const targetQuestionId = questionIds.get(rule.targetQuestionId);
      const conditions = parseConditions(rule.conditions).map((condition) => ({
        questionId: questionIds.get(condition.questionId),
        answerId: answerIds.get(condition.answerId),
      }));
      if (
        !targetQuestionId ||
        !conditions.length ||
        conditions.some(
          (condition) => !condition.questionId || !condition.answerId,
        )
      )
        continue;
      await tx.logicRule.create({
        data: {
          quizId: copy.id,
          targetQuestionId,
          conditions: JSON.stringify(conditions),
          match: rule.match,
          action: rule.action,
          position: rule.position,
        },
      });
    }
    for (const mapping of mappings) {
      const answerId = mapping.answerId
        ? answerIds.get(mapping.answerId)
        : null;
      if (mapping.answerId && !answerId) continue;
      await tx.productMapping.create({
        data: {
          quizId: copy.id,
          answerId,
          shopifyProductId: mapping.shopifyProductId,
          score: mapping.score,
        },
      });
    }
    return copy;
  });
}

export async function moveQuestion(
  shopId: string,
  quizId: string,
  questionId: string,
  direction: string,
  targetQuestionId?: string,
) {
  const quiz = await getQuiz(shopId, quizId);
  const questions = [...quiz.questions];
  const index = questions.findIndex((question) => question.id === questionId);
  if (index < 0) throw new QuizError("missing-question");
  if (direction !== "up" && direction !== "down" && direction !== "drop")
    throw new QuizError("invalid-order");
  const nextIndex =
    direction === "drop"
      ? questions.findIndex((question) => question.id === targetQuestionId)
      : index + (direction === "up" ? -1 : 1);
  if (direction === "drop" && nextIndex < 0)
    throw new QuizError("missing-question");
  if (nextIndex < 0 || nextIndex >= questions.length) return;
  const [moved] = questions.splice(index, 1);
  questions.splice(nextIndex, 0, moved);
  const positions = new Map(
    questions.map((question, position) => [question.id, position]),
  );
  const invalid = quiz.rules.some((rule) =>
    parseConditions(rule.conditions).some(
      (condition) =>
        (positions.get(condition.questionId) ?? Infinity) >=
        (positions.get(rule.targetQuestionId) ?? -1),
    ),
  );
  if (invalid) throw new QuizError("invalid-order");
  await prisma.$transaction(async (tx) => {
    for (const [position, question] of questions.entries()) {
      await tx.question.update({
        where: { id: question.id },
        data: { position },
      });
    }
    await tx.quiz.update({
      where: { id: quiz.id },
      data: { updatedAt: new Date() },
    });
  });
}

export async function addQuestion(
  shopId: string,
  quizId: string,
  prompt: string,
  type: string,
  layout = "auto",
) {
  const quiz = await getQuiz(shopId, quizId);
  if (quiz.questions.length >= 30) throw new QuizError("too-many-questions");
  const cleanPrompt = prompt.trim().slice(0, 240);
  if (!cleanPrompt) throw new QuizError("missing-prompt");
  const safeType = isKnownType(type) ? type : "single";
  const position =
    quiz.questions.reduce(
      (max, question) => Math.max(max, question.position),
      -1,
    ) + 1;

  return prisma.question.create({
    data: {
      quizId: quiz.id,
      prompt: cleanPrompt,
      type: safeType,
      layout: layout === "grid" || layout === "list" ? layout : "auto",
      position,
      answers:
        safeType === "yes_no"
          ? {
              create: [
                { label: "Yes", position: 0 },
                { label: "No", position: 1 },
              ],
            }
          : undefined,
    },
  });
}

export async function updateQuestion(
  shopId: string,
  quizId: string,
  questionId: string,
  input: {
    prompt: string;
    helpText: string;
    type: string;
    required: boolean;
    position: number;
    sliderMin: number;
    sliderMax: number;
    sliderStep: number;
    layout?: string;
  },
) {
  const quiz = await getQuiz(shopId, quizId);
  const question = quiz.questions.find((item) => item.id === questionId);
  if (!question) throw new QuizError("missing-question");
  const prompt = input.prompt.trim().slice(0, 240);
  if (!prompt) throw new QuizError("missing-prompt");
  const type = isKnownType(input.type) ? input.type : question.type;
  const sliderMin = Math.round(clamp(input.sliderMin, 0, 999));
  const sliderMax = Math.round(clamp(input.sliderMax, sliderMin + 1, 1000));

  await prisma.question.update({
    where: { id: question.id },
    data: {
      prompt,
      helpText: input.helpText.trim().slice(0, 300),
      type,
      required: input.required,
      position: Math.round(clamp(input.position, 0, 100)),
      sliderMin,
      sliderMax,
      sliderStep: Math.round(clamp(input.sliderStep || 1, 1, 100)),
      layout:
        input.layout === "grid" || input.layout === "list"
          ? input.layout
          : "auto",
    },
  });

  if (type === "yes_no" && question.answers.length === 0) {
    await prisma.answer.createMany({
      data: [
        { questionId: question.id, label: "Yes", position: 0 },
        { questionId: question.id, label: "No", position: 1 },
      ],
    });
  }
}

export async function deleteQuestion(
  shopId: string,
  quizId: string,
  questionId: string,
) {
  const quiz = await getQuiz(shopId, quizId);
  const question = quiz.questions.find((item) => item.id === questionId);
  if (!question) return;

  const staleRuleIds = quiz.rules
    .filter((rule) => {
      if (rule.targetQuestionId === question.id) return true;
      return parseConditions(rule.conditions).some(
        (condition) => condition.questionId === question.id,
      );
    })
    .map((rule) => rule.id);

  if (staleRuleIds.length) {
    await prisma.logicRule.deleteMany({ where: { id: { in: staleRuleIds } } });
  }
  await prisma.question.delete({ where: { id: question.id } });
}

export async function addAnswer(
  shopId: string,
  quizId: string,
  questionId: string,
  label: string,
) {
  const question = await ownedQuestion(shopId, quizId, questionId);
  if (question.answers.length >= 12) throw new QuizError("too-many-answers");
  const clean = label.trim().slice(0, 140);
  if (!clean) throw new QuizError("missing-answer");
  const position =
    question.answers.reduce(
      (max, answer) => Math.max(max, answer.position),
      -1,
    ) + 1;
  return prisma.answer.create({
    data: { questionId: question.id, label: clean, position },
  });
}

export async function updateAnswer(
  shopId: string,
  quizId: string,
  answerId: string,
  input: {
    label: string;
    description: string;
    imageUrl: string;
    position: number;
  },
) {
  const answer = await ownedAnswer(shopId, quizId, answerId);
  const label = input.label.trim().slice(0, 140);
  if (!label) throw new QuizError("missing-answer");
  await prisma.answer.update({
    where: { id: answer.id },
    data: {
      label,
      description: input.description.trim().slice(0, 180),
      imageUrl: safeImageUrl(input.imageUrl),
      position: Math.round(clamp(input.position, 0, 50)),
    },
  });
}

export async function deleteAnswer(
  shopId: string,
  quizId: string,
  answerId: string,
) {
  const quiz = await getQuiz(shopId, quizId);
  const answer = quiz.questions
    .flatMap((question) => question.answers)
    .find((item) => item.id === answerId);
  if (!answer) return;

  const staleRuleIds = quiz.rules
    .filter((rule) =>
      parseConditions(rule.conditions).some(
        (condition) => condition.answerId === answer.id,
      ),
    )
    .map((rule) => rule.id);
  if (staleRuleIds.length) {
    await prisma.logicRule.deleteMany({ where: { id: { in: staleRuleIds } } });
  }
  await prisma.answer.delete({ where: { id: answer.id } });
}

export async function addRule(
  shopId: string,
  quizId: string,
  input: {
    answerId: string;
    answerId2?: string;
    match: string;
    targetQuestionId: string;
  },
) {
  const quiz = await getQuiz(shopId, quizId);
  const locate = (answerId: string) => {
    for (const question of quiz.questions) {
      const answer = question.answers.find((item) => item.id === answerId);
      if (answer) return { questionId: question.id, answerId: answer.id };
    }
    return null;
  };
  const first = locate(input.answerId);
  if (!first) throw new QuizError("invalid-rule");
  const conditions = [first];
  if (input.answerId2) {
    const second = locate(input.answerId2);
    if (!second) throw new QuizError("invalid-rule");
    conditions.push(second);
  }

  const target = quiz.questions.find(
    (question) => question.id === input.targetQuestionId,
  );
  if (!target) {
    throw new QuizError("invalid-rule");
  }
  if (
    conditions.some((condition) => {
      const source = quiz.questions.find(
        (question) => question.id === condition.questionId,
      );
      return (
        !source ||
        !isChoiceType(source.type) ||
        source.position >= target.position
      );
    })
  ) {
    throw new QuizError("invalid-rule");
  }

  return prisma.logicRule.create({
    data: {
      quizId: quiz.id,
      conditions: JSON.stringify(conditions),
      match: input.match === "any" ? "any" : "all",
      action: "show",
      targetQuestionId: input.targetQuestionId,
      position: quiz.rules.length,
    },
  });
}

export async function deleteRule(
  shopId: string,
  quizId: string,
  ruleId: string,
) {
  const quiz = await getQuiz(shopId, quizId);
  if (!quiz.rules.some((rule) => rule.id === ruleId)) return;
  await prisma.logicRule.delete({ where: { id: ruleId } });
}

export async function addMapping(
  shopId: string,
  quizId: string,
  input: { answerId: string; shopifyProductId: string; score: number },
) {
  const quiz = await getQuiz(shopId, quizId);
  const answer = quiz.questions
    .filter((question) => isChoiceType(question.type))
    .flatMap((question) => question.answers)
    .find((item) => item.id === input.answerId);
  if (input.answerId && !answer) throw new QuizError("invalid-mapping");
  const product = await prisma.shopifyProduct.findFirst({
    where: { shopId, shopifyId: input.shopifyProductId, status: "ACTIVE" },
  });
  if (!product) throw new QuizError("need-products");
  const existing = quiz.mappings.find(
    (mapping) =>
      mapping.answerId === (answer?.id ?? null) &&
      mapping.shopifyProductId === product.shopifyId,
  );
  const score = Math.round(clamp(input.score || 10, 1, 1000));
  if (existing) {
    return prisma.productMapping.update({
      where: { id: existing.id },
      data: { score },
    });
  }
  if (quiz.mappings.length >= 200) throw new QuizError("too-many-mappings");
  return prisma.productMapping.create({
    data: {
      quizId: quiz.id,
      answerId: answer?.id ?? null,
      shopifyProductId: product.shopifyId,
      score,
    },
  });
}

export async function deleteMapping(
  shopId: string,
  quizId: string,
  mappingId: string,
) {
  const quiz = await getQuiz(shopId, quizId);
  if (!quiz.mappings.some((mapping) => mapping.id === mappingId)) return;
  await prisma.productMapping.delete({ where: { id: mappingId } });
}

async function uniqueHandle(shopId: string, source: string, ignoreId?: string) {
  const base = slugify(source);
  let handle = base;
  let suffix = 2;
  while (suffix < 100) {
    const existing = await prisma.quiz.findFirst({
      where: {
        shopId,
        handle,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return handle;
    handle = `${base}-${suffix}`.slice(0, 60);
    suffix += 1;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function ownedQuestion(
  shopId: string,
  quizId: string,
  questionId: string,
) {
  const quiz = await getQuiz(shopId, quizId);
  const question = quiz.questions.find((item) => item.id === questionId);
  if (!question) throw new QuizError("missing-question");
  return question;
}

async function ownedAnswer(shopId: string, quizId: string, answerId: string) {
  const quiz = await getQuiz(shopId, quizId);
  const answer = quiz.questions
    .flatMap((question) => question.answers)
    .find((item) => item.id === answerId);
  if (!answer) throw new QuizError("missing-answer");
  return answer;
}

function isKnownType(type: string) {
  return [
    "single",
    "multiple",
    "image",
    "dropdown",
    "yes_no",
    "slider",
    "text",
  ].includes(type);
}

export function safeImageUrl(value: string): string {
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function cleanTextList(values: string[], maxItems: number, maxLength: number) {
  return values
    .map((value) => value.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}
