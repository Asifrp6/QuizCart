import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import { ensureShop } from "../services/shop.server";
import prisma from "../db.server";
import { formatDate } from "../lib/quiz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const sessions = await prisma.quizSession.findMany({
    where: { shopId: shop.id },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { customer: true, quiz: true },
  });
  return { sessions };
};

export default function CustomersPage() {
  const { sessions } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Customers">
      <s-section heading="Quiz takers">
        {sessions.length === 0 ? (
          <s-paragraph>
            Name, age, and answers appear after a customer starts a quiz.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header listSlot="labeled">Age range</s-table-header>
              <s-table-header listSlot="labeled">Quiz</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="labeled">Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {sessions.map((session) => (
                <s-table-row key={session.id}>
                  <s-table-cell>
                    <s-link href={`/app/customers/${session.id}`}>
                      {session.customer?.name || "Guest"}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>
                    {session.customer?.ageRange || session.customer?.age || "—"}
                  </s-table-cell>
                  <s-table-cell>{session.quiz.title}</s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={session.status === "completed" ? "success" : "info"}
                    >
                      {session.status === "completed" ? "Completed" : "Started"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{formatDate(session.startedAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = boundaryHeaders;
