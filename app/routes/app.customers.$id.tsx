import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import { ensureShop } from "../services/shop.server";
import prisma from "../db.server";
import { EVENT_LABELS, formatWhen, metadataPrompt } from "../lib/quiz";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const record = await prisma.quizSession.findFirst({
    where: { id: params.id || "", shopId: shop.id },
    include: {
      customer: true,
      quiz: true,
      responses: {
        include: { question: { include: { answers: true } } },
      },
      recommendations: { orderBy: { rank: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!record) {
    throw new Response("Customer session not found", { status: 404 });
  }
  return { record };
};

export default function CustomerDetail() {
  const { record } = useLoaderData<typeof loader>();
  const name = record.customer?.name || "Guest";

  return (
    <s-page heading={name}>
      <s-link slot="breadcrumb-actions" href="/app/customers">
        Customers
      </s-link>
      <s-section heading="Customer">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <Detail label="Name" value={name} />
          <Detail
            label="Age range"
            value={record.customer?.ageRange || record.customer?.age || "—"}
          />
          <Detail label="Quiz" value={record.quiz.title} />
          <Detail
            label="Status"
            value={record.status === "completed" ? "Completed" : "Started"}
          />
          <Detail label="Started" value={formatWhen(record.startedAt)} />
          <Detail
            label="Completed"
            value={record.completedAt ? formatWhen(record.completedAt) : "—"}
          />
        </s-grid>
      </s-section>
      <s-section heading="Answers">
        {record.responses.length === 0 ? (
          <s-paragraph>No answers yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {record.responses.map((response) => (
              <s-box
                key={response.id}
                padding="base"
                background="subdued"
                borderRadius="base"
              >
                <s-text type="strong">{response.question.prompt}</s-text>
                <s-paragraph>{answerText(response)}</s-paragraph>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
      <s-section heading="Recommended products">
        {record.recommendations.length === 0 ? (
          <s-paragraph>No recommendations stored for this session.</s-paragraph>
        ) : (
          <s-ordered-list>
            {record.recommendations.map((item) => (
              <s-list-item key={item.id}>
                {item.title}
                {item.explanation ? ` — ${item.explanation}` : ""}
              </s-list-item>
            ))}
          </s-ordered-list>
        )}
      </s-section>
      <s-section heading="Activity">
        {record.events.length === 0 ? (
          <s-paragraph>No activity yet.</s-paragraph>
        ) : (
          <s-unordered-list>
            {record.events.map((event) => {
              const extra = metadataPrompt(event.metadata);
              return (
                <s-list-item key={event.id}>
                  {EVENT_LABELS[event.eventType] ?? event.eventType}
                  {extra ? `: ${extra}` : ""} · {formatWhen(event.createdAt)}
                </s-list-item>
              );
            })}
          </s-unordered-list>
        )}
      </s-section>
    </s-page>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <s-stack direction="block" gap="none">
      <s-paragraph color="subdued">{label}</s-paragraph>
      <s-text type="strong">{value}</s-text>
    </s-stack>
  );
}

function answerText(response: {
  answerIds: string;
  textValue: string;
  numericValue: number | null;
  question: { answers: { id: string; label: string }[] };
}) {
  if (response.textValue) return response.textValue;
  if (response.numericValue != null) return String(response.numericValue);
  const ids = new Set(response.answerIds.split(",").filter(Boolean));
  const labels = response.question.answers
    .filter((answer) => ids.has(answer.id))
    .map((answer) => answer.label);
  return labels.join(", ") || "—";
}

export const headers: HeadersFunction = boundaryHeaders;
