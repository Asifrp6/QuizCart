import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  proxyJson,
  publicQuizPayload,
  publishedQuiz,
  readJson,
  recordStorefrontEvent,
  requireProxyShop,
  saveAnswer,
  startSession,
  completeSession,
} from "../services/storefront.server";

async function shopFromProxy(request: Request) {
  const result = await requireProxyShop(request);
  if ("error" in result) return result;
  return result;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const result = await shopFromProxy(request);
  if ("error" in result) return result.error;
  const handle = new URL(request.url).searchParams.get("handle")?.trim() ?? "";
  const quiz = await publishedQuiz(result.shop.id, handle);
  const payload = quiz ? publicQuizPayload(quiz) : null;
  if (!payload) {
    return proxyJson(
      {
        error: handle
          ? "This quiz is not published."
          : "Publish a quiz in QuizCart, then refresh this page.",
      },
      404,
    );
  }
  return proxyJson({ quiz: payload });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await shopFromProxy(request);
  if ("error" in result) return result.error;
  const url = new URL(request.url);
  const body = await readJson(request);
  const path = url.pathname;

  if (path.endsWith("/session")) {
    const age = numberOrNull(body.age);
    return startSession({
      shopId: result.shop.id,
      handle: String(body.handle ?? ""),
      name: String(body.name ?? ""),
      age,
      ageRange: String(body.ageRange ?? ""),
    });
  }

  if (path.endsWith("/answer")) {
    const answerIds = Array.isArray(body.answerIds)
      ? body.answerIds.filter((id): id is string => typeof id === "string")
      : [];
    return saveAnswer({
      shopId: result.shop.id,
      sessionId: String(body.sessionId ?? ""),
      questionId: String(body.questionId ?? ""),
      answerIds,
      textValue: String(body.textValue ?? ""),
      numericValue: numberOrNull(body.numericValue),
    });
  }

  if (path.endsWith("/complete")) {
    return completeSession(result.shop.id, String(body.sessionId ?? ""));
  }

  if (path.endsWith("/event")) {
    const metadata =
      body.metadata &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    return recordStorefrontEvent({
      shopId: result.shop.id,
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      handle: body.handle ? String(body.handle) : undefined,
      eventType: String(body.eventType ?? ""),
      metadata,
    });
  }

  return proxyJson({ error: "Not found." }, 404);
};

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
