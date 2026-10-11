export type LogicCondition = {
  questionId: string;
  answerId: string;
};

export type LogicRuleInput = {
  targetQuestionId: string;
  match: string;
  action: string;
  conditions: LogicCondition[];
};

export type ResponseInput = {
  questionId: string;
  answerIds: string[];
};

export function parseConditions(raw: string): LogicCondition[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LogicCondition =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as LogicCondition).questionId === "string" &&
        typeof (item as LogicCondition).answerId === "string",
    );
  } catch {
    return [];
  }
}

export function ruleMatches(
  rule: LogicRuleInput,
  responses: ResponseInput[],
): boolean {
  if (rule.conditions.length === 0) return false;
  const checks = rule.conditions.map((condition) => {
    const response = responses.find(
      (item) => item.questionId === condition.questionId,
    );
    return Boolean(response?.answerIds.includes(condition.answerId));
  });
  return rule.match === "any" ? checks.some(Boolean) : checks.every(Boolean);
}

export function isQuestionVisible(
  questionId: string,
  rules: LogicRuleInput[],
  responses: ResponseInput[],
): boolean {
  const targeting = rules.filter(
    (rule) => rule.action === "show" && rule.targetQuestionId === questionId,
  );
  if (targeting.length === 0) return true;
  return targeting.some((rule) => ruleMatches(rule, responses));
}

export function visibleQuestions<T extends { id: string; position: number }>(
  questions: T[],
  rules: LogicRuleInput[],
  responses: ResponseInput[],
): T[] {
  const visible: T[] = [];
  const active: ResponseInput[] = [];
  for (const question of [...questions].sort(
    (a, b) => a.position - b.position,
  )) {
    if (!isQuestionVisible(question.id, rules, active)) continue;
    visible.push(question);
    const response = responses.find((item) => item.questionId === question.id);
    if (response) active.push(response);
  }
  return visible;
}

export type ProductScore = {
  shopifyProductId: string;
  score: number;
};

export function scoreProducts(
  mappings: {
    answerId: string | null;
    shopifyProductId: string;
    score: number;
  }[],
  responses: ResponseInput[],
): ProductScore[] {
  const selected = new Set(responses.flatMap((response) => response.answerIds));
  const scores = new Map<string, number>();

  for (const mapping of mappings) {
    const applies = mapping.answerId == null || selected.has(mapping.answerId);
    if (!applies || mapping.score <= 0) continue;
    scores.set(
      mapping.shopifyProductId,
      (scores.get(mapping.shopifyProductId) ?? 0) + mapping.score,
    );
  }

  return [...scores.entries()]
    .map(([shopifyProductId, score]) => ({ shopifyProductId, score }))
    .sort((a, b) => b.score - a.score);
}
