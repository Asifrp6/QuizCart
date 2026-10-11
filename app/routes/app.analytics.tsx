import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import { ensureShop } from "../services/shop.server";
import { getAnalytics } from "../services/analytics.server";
import { MetricGrid } from "../components/admin-ui";
import { percent } from "../lib/quiz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const quizId = new URL(request.url).searchParams.get("quiz") ?? undefined;
  return getAnalytics(shop.id, quizId);
};

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics" inlineSize="large">
      <s-section heading="Overview">
        <MetricGrid
          items={[
            { label: "Quiz views", value: String(data.metrics.views) },
            { label: "Quiz starts", value: String(data.metrics.starts) },
            { label: "Completions", value: String(data.metrics.completions) },
            {
              label: "Completion rate",
              value: `${data.metrics.completionRate}%`,
            },
            {
              label: "Product clicks",
              value: String(data.metrics.productClicks),
            },
            { label: "Add to cart", value: String(data.metrics.addToCart) },
            { label: "Customers", value: String(data.customers) },
            {
              label: "Recommendations",
              value: String(data.recommendationCount),
            },
          ]}
        />
      </s-section>
      <s-section heading="Quiz performance">
        {data.quizzes.length === 0 ? (
          <s-paragraph>Publish a quiz to start collecting performance.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Quiz</s-table-header>
              <s-table-header listSlot="labeled">Starts</s-table-header>
              <s-table-header listSlot="labeled">Completions</s-table-header>
              <s-table-header listSlot="labeled">Rate</s-table-header>
              <s-table-header listSlot="labeled">Clicks</s-table-header>
              <s-table-header listSlot="labeled">Cart</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.quizzes.map((quiz) => (
                <s-table-row key={quiz.id}>
                  <s-table-cell>
                    <s-link href={`/app/analytics?quiz=${quiz.id}`}>
                      {quiz.title}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>{quiz.starts}</s-table-cell>
                  <s-table-cell>{quiz.completions}</s-table-cell>
                  <s-table-cell>{quiz.completionRate}%</s-table-cell>
                  <s-table-cell>{quiz.productClicks}</s-table-cell>
                  <s-table-cell>{quiz.addToCart}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      <s-section heading="Question drop-off">
        {data.funnel.questions.length === 0 ? (
          <s-paragraph>Select a quiz after customers start answering.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {data.funnel.questions.map((question, index) => (
              <s-paragraph key={question.id}>
                Question {index + 1}: {question.prompt} —{" "}
                {percent(question.answered, data.funnel.starts)} answered (
                {question.answered} of {data.funnel.starts} starts)
              </s-paragraph>
            ))}
          </s-stack>
        )}
      </s-section>
      <s-section heading="Product actions">
        {data.products.length === 0 ? (
          <s-paragraph>Product clicks and add to cart events show up here.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="labeled">Clicks</s-table-header>
              <s-table-header listSlot="labeled">Add to cart</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.products.map((product) => (
                <s-table-row key={product.title}>
                  <s-table-cell>{product.title}</s-table-cell>
                  <s-table-cell>{product.clicks}</s-table-cell>
                  <s-table-cell>{product.addToCart}</s-table-cell>
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
