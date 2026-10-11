import prisma from "../db.server";
import { scoreProducts, visibleQuestions, parseConditions } from "../lib/logic";
import type { ResponseInput } from "../lib/logic";
import { resolveAiSettings } from "./shop.server";
import type { AppSettings, Quiz } from "@prisma/client";

type QuizForRanking = Quiz & {
  questions: {
    id: string;
    prompt: string;
    position: number;
    answers: { id: string; label: string }[];
  }[];
  rules: {
    targetQuestionId: string;
    match: string;
    action: string;
    conditions: string;
  }[];
  mappings: {
    answerId: string | null;
    shopifyProductId: string;
    score: number;
  }[];
};

type StoredResponse = {
  questionId: string;
  answerIds: string;
  textValue: string;
  numericValue: number | null;
};

export async function recommendForSession(input: {
  shopId: string;
  quiz: QuizForRanking;
  settings: AppSettings;
  responses: StoredResponse[];
}) {
  const rules = input.quiz.rules.map((rule) => ({
    targetQuestionId: rule.targetQuestionId,
    match: rule.match,
    action: rule.action,
    conditions: parseConditions(rule.conditions),
  }));
  const parsed = input.responses.map(toResponse);
  const visible = visibleQuestions(input.quiz.questions, rules, parsed);
  const visibleIds = new Set(visible.map((question) => question.id));
  const active = parsed.filter((response) =>
    visibleIds.has(response.questionId),
  );
  const rankedRules = scoreProducts(input.quiz.mappings, active);

  const products = await prisma.shopifyProduct.findMany({
    where: {
      shopId: input.shopId,
      shopifyId: { in: rankedRules.map((item) => item.shopifyProductId) },
      status: "ACTIVE",
    },
  });
  const byId = new Map(products.map((product) => [product.shopifyId, product]));
  const candidates = rankedRules
    .map((item) => {
      const product = byId.get(item.shopifyProductId);
      if (!product) return null;
      return { ...item, product };
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .slice(0, 12);

  const ai = resolveAiSettings(input.settings, input.quiz);
  const answers = describeAnswers(input.quiz, active);
  let ordered = candidates;
  const explanations = new Map<string, string>();

  if (ai.aiEnabled && candidates.length > 1) {
    const aiRank = await rankWithAi({
      answers,
      candidates: candidates.map((candidate) => ({
        id: candidate.shopifyProductId,
        title: candidate.product.title,
        score: candidate.score,
      })),
      style: ai.recommendationStyle,
      explain: ai.aiExplanation,
    });
    if (aiRank) {
      const byCandidate = new Map(
        candidates.map((candidate) => [candidate.shopifyProductId, candidate]),
      );
      const next = aiRank
        .map((row) => byCandidate.get(row.id))
        .filter((item): item is (typeof candidates)[number] => item != null);
      const seen = new Set(next.map((item) => item.shopifyProductId));
      ordered = [
        ...next,
        ...candidates.filter((item) => !seen.has(item.shopifyProductId)),
      ];
      for (const row of aiRank) {
        if (row.explanation) explanations.set(row.id, row.explanation);
      }
    }
  }

  return ordered.slice(0, ai.maxRecommendations).map((candidate, index) => ({
    shopifyProductId: candidate.shopifyProductId,
    variantId: candidate.product.defaultVariantId,
    title: candidate.product.title,
    handle: candidate.product.handle,
    imageUrl: candidate.product.imageUrl,
    price: candidate.product.price,
    score: candidate.score,
    rank: index + 1,
    explanation: ai.aiExplanation
      ? explanations.get(candidate.shopifyProductId) ||
        fallbackExplanation(candidate.shopifyProductId, input.quiz, active)
      : "",
  }));
}

function toResponse(response: StoredResponse): ResponseInput & {
  textValue: string;
  numericValue: number | null;
} {
  return {
    questionId: response.questionId,
    answerIds: response.answerIds.split(",").filter(Boolean),
    textValue: response.textValue,
    numericValue: response.numericValue,
  };
}

function describeAnswers(quiz: QuizForRanking, responses: ResponseInput[]) {
  return responses
    .map((response) => {
      const question = quiz.questions.find(
        (item) => item.id === response.questionId,
      );
      const labels = (question?.answers ?? [])
        .filter((answer) => response.answerIds.includes(answer.id))
        .map((answer) => answer.label);
      return {
        question: question?.prompt ?? "Question",
        answer:
          labels.join(", ") ||
          ("textValue" in response ? String(response.textValue ?? "") : "") ||
          ("numericValue" in response && response.numericValue != null
            ? String(response.numericValue)
            : ""),
      };
    })
    .filter((item) => item.answer);
}

function fallbackExplanation(
  productId: string,
  quiz: QuizForRanking,
  responses: ResponseInput[],
) {
  const selected = new Set(responses.flatMap((response) => response.answerIds));
  const labels = quiz.mappings
    .filter(
      (mapping) =>
        mapping.shopifyProductId === productId &&
        mapping.answerId &&
        selected.has(mapping.answerId),
    )
    .map((mapping) => {
      for (const question of quiz.questions) {
        const answer = question.answers.find(
          (item) => item.id === mapping.answerId,
        );
        if (answer) return answer.label;
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 3);

  if (!labels.length) return "This product is one of your closest matches.";
  return `This matches your preference for ${labels.join(", ")}.`;
}

async function rankWithAi(input: {
  answers: { question: string; answer: string }[];
  candidates: { id: string; title: string; score: number }[];
  style: string;
  explain: boolean;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || input.candidates.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You rank products the merchant already matched. Never invent products or ids. Return JSON {"rankings":[{"id":"candidate id","explanation":"one short sentence"}]}. Every id must come from the candidate list.',
          },
          {
            role: "user",
            content: JSON.stringify({
              style:
                input.style === "diverse"
                  ? "Prefer a varied set of product types."
                  : "Prefer the closest overall match.",
              explain: input.explain,
              answers: input.answers,
              candidates: input.candidates,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      rankings?: { id?: string; explanation?: string }[];
    };
    const allowed = new Set(input.candidates.map((candidate) => candidate.id));
    const seen = new Set<string>();
    const rankings = [];
    for (const row of parsed.rankings ?? []) {
      if (!row.id || !allowed.has(row.id) || seen.has(row.id)) continue;
      seen.add(row.id);
      rankings.push({
        id: row.id,
        explanation: input.explain
          ? String(row.explanation ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 240)
          : "",
      });
    }
    return rankings.length ? rankings : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
