import prisma from "../db.server";

export async function trackEvent(input: {
  shopId: string;
  quizId?: string | null;
  sessionId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.analyticsEvent.create({
    data: {
      shopId: input.shopId,
      quizId: input.quizId ?? null,
      sessionId: input.sessionId ?? null,
      eventType: input.eventType,
      metadata: JSON.stringify(input.metadata ?? {}).slice(0, 4000),
    },
  });
}

export async function countEvents(shopId: string, quizId?: string) {
  const grouped = await prisma.analyticsEvent.groupBy({
    by: ["eventType"],
    where: { shopId, ...(quizId ? { quizId } : {}) },
    _count: { _all: true },
  });
  const counts = new Map(
    grouped.map((row) => [row.eventType, row._count._all]),
  );
  const starts = counts.get("quiz_started") ?? 0;
  const completions = counts.get("quiz_completed") ?? 0;
  return {
    views: counts.get("quiz_viewed") ?? 0,
    starts,
    completions,
    completionRate: starts ? Math.round((completions / starts) * 100) : 0,
    productClicks: counts.get("product_clicked") ?? 0,
    addToCart: counts.get("add_to_cart") ?? 0,
  };
}

export async function getDashboard(shopId: string) {
  const [quizCounts, metrics, quizzes, groupedEvents] = await Promise.all([
    prisma.quiz.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { _all: true },
    }),
    countEvents(shopId),
    prisma.quiz.findMany({
      where: { shopId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, status: true, updatedAt: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["quizId", "eventType"],
      where: { shopId, quizId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map(
    quizCounts.map((row) => [row.status, row._count._all]),
  );
  const totalQuizzes = [...byStatus.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  const quizRows = quizzes.map((quiz) => {
    const events = groupedEvents.filter((row) => row.quizId === quiz.id);
    const count = (eventType: string) =>
      events.find((row) => row.eventType === eventType)?._count._all ?? 0;
    const starts = count("quiz_started");
    const completions = count("quiz_completed");

    return {
      ...quiz,
      views: count("quiz_viewed"),
      addToCart: count("add_to_cart"),
      completionRate: starts ? Math.round((completions / starts) * 100) : 0,
    };
  });

  return {
    totalQuizzes,
    activeQuizzes: byStatus.get("published") ?? 0,
    metrics,
    quizzes: quizRows,
  };
}

export async function getAnalytics(shopId: string, quizId?: string) {
  const [quizzes, metrics, grouped, customers] = await Promise.all([
    prisma.quiz.findMany({
      where: { shopId },
      orderBy: { title: "asc" },
      select: { id: true, title: true, status: true },
    }),
    countEvents(shopId),
    prisma.analyticsEvent.groupBy({
      by: ["quizId", "eventType"],
      where: { shopId, quizId: { not: null } },
      _count: { _all: true },
    }),
    prisma.quizCustomer.count({ where: { shopId } }),
  ]);

  const selected =
    quizzes.find((quiz) => quiz.id === quizId) ?? quizzes[0] ?? null;

  const funnel = selected
    ? await getQuestionFunnel(shopId, selected.id)
    : { starts: 0, questions: [] };

  const quizRows = quizzes.map((quiz) => {
    const rows = grouped.filter((row) => row.quizId === quiz.id);
    const count = (type: string) =>
      rows.find((row) => row.eventType === type)?._count._all ?? 0;
    const starts = count("quiz_started");
    const completions = count("quiz_completed");
    return {
      ...quiz,
      starts,
      completions,
      completionRate: starts ? Math.round((completions / starts) * 100) : 0,
      productClicks: count("product_clicked"),
      addToCart: count("add_to_cart"),
    };
  });

  const productEvents = await prisma.analyticsEvent.findMany({
    where: {
      shopId,
      eventType: { in: ["product_clicked", "add_to_cart"] },
    },
    select: { eventType: true, metadata: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const products = new Map<
    string,
    { title: string; clicks: number; addToCart: number }
  >();
  for (const event of productEvents) {
    const metadata = parseMetadata(event.metadata);
    const title = String(metadata.title ?? "Product");
    const key = String(metadata.productId ?? title);
    const current = products.get(key) ?? { title, clicks: 0, addToCart: 0 };
    if (event.eventType === "product_clicked") current.clicks += 1;
    if (event.eventType === "add_to_cart") current.addToCart += 1;
    products.set(key, current);
  }

  const recommendationCount = await prisma.recommendation.count({
    where: { session: { shopId } },
  });

  return {
    metrics,
    customers,
    recommendationCount,
    quizzes: quizRows,
    selectedQuizId: selected?.id ?? "",
    funnel,
    products: [...products.values()]
      .sort((a, b) => b.clicks + b.addToCart - (a.clicks + a.addToCart))
      .slice(0, 10),
  };
}

async function getQuestionFunnel(shopId: string, quizId: string) {
  const [questions, starts, grouped] = await Promise.all([
    prisma.question.findMany({
      where: { quizId, quiz: { shopId } },
      orderBy: { position: "asc" },
      select: { id: true, prompt: true, position: true },
    }),
    prisma.analyticsEvent.count({
      where: { shopId, quizId, eventType: "quiz_started" },
    }),
    prisma.quizResponse.groupBy({
      by: ["questionId"],
      where: { session: { shopId, quizId } },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(
    grouped.map((row) => [row.questionId, row._count._all]),
  );
  return {
    starts,
    questions: questions.map((question) => ({
      ...question,
      answered: counts.get(question.id) ?? 0,
    })),
  };
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
