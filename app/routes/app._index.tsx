import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import { AppRouteLink } from "../components/app-route-link";
import { ensureShop } from "../services/shop.server";
import { getDashboard } from "../services/analytics.server";
import { formatDate } from "../lib/quiz";
import dashboardStyles from "../dashboard.css?url";

export const links = () => [{ rel: "stylesheet", href: dashboardStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const dashboard = await getDashboard(shop.id);
  return { shop: session.shop, ...dashboard };
};

const navigation = [
  { label: "Dashboard", href: "/app", icon: "⌂", current: true },
  { label: "Quizzes", href: "/app/quizzes", icon: "▤" },
  { label: "Products", href: "/app/products", icon: "◇" },
  { label: "Customers", href: "/app/customers", icon: "♧" },
  { label: "Analytics", href: "/app/analytics", icon: "▥" },
  { label: "Appearance", href: "/app/appearance", icon: "◉" },
  { label: "Settings", href: "/app/settings", icon: "⚙" },
];

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [visibleCount, setVisibleCount] = useState(5);
  const draftCount = data.totalQuizzes - data.activeQuizzes;
  const latestDraft = data.quizzes.find((quiz) => quiz.status === "draft");
  const filteredQuizzes = data.quizzes.filter(
    (quiz) =>
      quiz.title.toLowerCase().includes(query.trim().toLowerCase()) &&
      (status === "all" || quiz.status === status),
  );

  return (
    <s-page inlineSize="large">
      <div className="qc-dashboard qc-dashboard-refresh">
        <aside className="qc-dashboard-sidebar">
          <AppRouteLink href="/app" aria-label="QuizCart home">
            <img className="qc-app-logo" src="/quizcart-logo.png" alt="QuizCart" width={120} height={120} />
          </AppRouteLink>

          <nav className="qc-dashboard-nav" aria-label="Main navigation">
            {navigation.map((item) => (
              <AppRouteLink
                key={item.label}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
              >
                <span
                  className={`qc-dashboard-nav-link${item.current ? " is-current" : ""}`}
                >
                  <span className="qc-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </span>
              </AppRouteLink>
            ))}
          </nav>

          <section className="qc-sidebar-promo">
            <span className="qc-promo-icon" aria-hidden="true">
              ✦
            </span>
            <h2>A little guidance. A better match.</h2>
            <p>
              Connect your products and publish a quiz to guide more shoppers.
            </p>
            <AppRouteLink href="/app/quizzes?create=1">
              <span className="qc-button qc-button-primary qc-promo-button">
                Create a quiz <span aria-hidden="true">→</span>
              </span>
            </AppRouteLink>
          </section>
        </aside>

        <div className="qc-dashboard-main">
          <header className="qc-dashboard-topbar">
            <label className="qc-dashboard-search">
              <span aria-hidden="true">⌕</span>
              <span className="qc-visually-hidden">Search quizzes</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search your quizzes..."
              />
            </label>
            <div className="qc-store-chip" title={data.shop}>
              <span aria-hidden="true">◈</span>
              <span>Your store</span>
              <span className="qc-store-domain">{data.shop}</span>
            </div>
          </header>

          <main className="qc-dashboard-content">
            <div className="qc-dashboard-welcome">
              <div>
                <h1>Dashboard</h1>
                <p>Your quizzes, your shoppers, and what to do next.</p>
              </div>
              <AppRouteLink href="/app/quizzes?create=1">
                <span className="qc-button qc-button-primary">
                  <span aria-hidden="true">＋</span> Create quiz
                </span>
              </AppRouteLink>
            </div>

            <section
              className="qc-dashboard-hero"
              aria-labelledby="qc-hero-heading"
            >
              <div className="qc-hero-copy">
                <span className="qc-hero-eyebrow">
                  {latestDraft
                    ? "Pick up where you left off"
                    : data.activeQuizzes
                      ? "Your next idea starts here"
                      : "Let’s get you started"}
                </span>
                <h2 id="qc-hero-heading">
                  {latestDraft
                    ? `Keep building ${latestDraft.title}`
                    : data.activeQuizzes
                      ? "Help every shopper find their match."
                      : "Your first quiz is a few steps away."}
                </h2>
                <p>
                  {latestDraft
                    ? "Your draft is saved. Add the finishing touches, connect your products, and publish when you’re ready."
                    : "Ask a few questions. Connect your products. Give shoppers recommendations that feel personal."}
                </p>
                <AppRouteLink
                  href={
                    latestDraft
                      ? `/app/quizzes/${encodeURIComponent(latestDraft.id)}?step=question1&pane=question`
                      : "/app/quizzes?create=1"
                  }
                >
                  <span className="qc-button qc-button-primary">
                    {latestDraft ? "Continue editing" : "Build a quiz"}{" "}
                    <span aria-hidden="true">→</span>
                  </span>
                </AppRouteLink>
                <div className="qc-hero-summary">
                  <span>
                    <i className="qc-live-dot" /> {data.activeQuizzes} published
                  </span>
                  <span>
                    {draftCount} {draftCount === 1 ? "draft" : "drafts"}
                  </span>
                </div>
              </div>
              <div className="qc-hero-art" aria-hidden="true">
                <div className="qc-quiz-preview">
                  <span className="qc-preview-step">QUESTION 01</span>
                  <strong>What are you looking for?</strong>
                  <span className="qc-preview-answer">
                    <i /> A daily routine
                  </span>
                  <span className="qc-preview-answer">
                    <i /> Something specific
                  </span>
                </div>
                <div className="qc-preview-product">
                  <span className="qc-product-bottle" />
                  <strong>Personalized picks</strong>
                  <span>Made for your shoppers</span>
                </div>
              </div>
            </section>

            <div className="qc-performance-heading">
              <h2>Performance at a glance</h2>
              <span>All time · Your store</span>
            </div>
            <section
              className="qc-dashboard-metrics"
              aria-label="Quiz performance"
            >
              <MetricCard
                label="Quiz Views"
                value={data.metrics.views}
                icon="◉"
                tone="blue"
              />
              <MetricCard
                label="Quiz Starts"
                value={data.metrics.starts}
                icon="↗"
                tone="green"
              />
              <MetricCard
                label="Completions"
                value={data.metrics.completions}
                icon="▥"
                tone="purple"
              />
              <MetricCard
                label="Add to Cart"
                value={data.metrics.addToCart}
                icon="＋"
                tone="orange"
              />
            </section>

            <div className="qc-dashboard-lower">
              <section
                className="qc-dashboard-card qc-quiz-list"
                aria-labelledby="qc-quizzes-heading"
              >
                <div className="qc-card-heading">
                  <div>
                    <h2 id="qc-quizzes-heading">
                      Your quizzes{" "}
                      <span className="qc-count-badge">
                        {data.totalQuizzes}
                      </span>
                    </h2>
                    <p>Make a quick edit or keep working on a draft.</p>
                  </div>
                  <AppRouteLink href="/app/quizzes">
                    <span className="qc-text-link">
                      View All <span aria-hidden="true">→</span>
                    </span>
                  </AppRouteLink>
                </div>

                <div className="qc-quiz-toolbar">
                  <div
                    className="qc-quiz-filters"
                    role="group"
                    aria-label="Filter quizzes by status"
                  >
                    {[
                      { value: "all", label: "All", count: data.totalQuizzes },
                      {
                        value: "published",
                        label: "Published",
                        count: data.activeQuizzes,
                      },
                      { value: "draft", label: "Drafts", count: draftCount },
                    ].map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        aria-pressed={status === filter.value}
                        className={status === filter.value ? "is-active" : ""}
                        onClick={() => {
                          setStatus(filter.value);
                          setVisibleCount(5);
                        }}
                      >
                        {filter.label} <span>{filter.count}</span>
                      </button>
                    ))}
                  </div>
                  <span className="qc-results-count" role="status">
                    {filteredQuizzes.length}{" "}
                    {filteredQuizzes.length === 1 ? "quiz" : "quizzes"}
                  </span>
                </div>

                {filteredQuizzes.length === 0 ? (
                  <div className="qc-empty-quizzes">
                    <span aria-hidden="true">✦</span>
                    <p>
                      {data.quizzes.length === 0
                        ? "Your quizzes will appear here after you create one."
                        : "No quizzes match these filters. Try another search or status."}
                    </p>
                    {data.quizzes.length === 0 ? (
                      <AppRouteLink href="/app/quizzes?create=1">
                        <span className="qc-empty-link">
                          Create your first quiz →
                        </span>
                      </AppRouteLink>
                    ) : (
                      <button
                        type="button"
                        className="qc-clear-filters"
                        onClick={() => {
                          setQuery("");
                          setStatus("all");
                          setVisibleCount(5);
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="qc-quiz-table-wrap">
                    <table className="qc-dashboard-table">
                      <thead>
                        <tr>
                          <th scope="col">Quiz</th>
                          <th scope="col">Status</th>
                          <th scope="col">Views</th>
                          <th scope="col">Add to Cart</th>
                          <th scope="col">Completion</th>
                          <th scope="col">
                            <span className="qc-visually-hidden">Edit</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuizzes.slice(0, visibleCount).map((quiz) => (
                          <tr key={quiz.id}>
                            <td>
                              <AppRouteLink
                                href={`/app/quizzes/${encodeURIComponent(quiz.id)}`}
                              >
                                <span className="qc-quiz-title">
                                  <span
                                    className="qc-quiz-avatar"
                                    aria-hidden="true"
                                  >
                                    {quiz.title.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span>
                                    <strong>{quiz.title}</strong>
                                    <small>
                                      Updated {formatDate(quiz.updatedAt)}
                                    </small>
                                  </span>
                                </span>
                              </AppRouteLink>
                            </td>
                            <td>
                              <span
                                className={`qc-status-pill${quiz.status === "published" ? " is-published" : ""}`}
                              >
                                <i aria-hidden="true" />
                                {quiz.status === "published"
                                  ? "Published"
                                  : "Draft"}
                              </span>
                            </td>
                            <td data-label="Views">
                              {quiz.views.toLocaleString()}
                            </td>
                            <td data-label="Add to cart">
                              {quiz.addToCart.toLocaleString()}
                            </td>
                            <td data-label="Completion">
                              <span className="qc-completion-value">
                                {quiz.completionRate}%
                              </span>
                            </td>
                            <td>
                              <AppRouteLink
                                href={`/app/quizzes/${encodeURIComponent(quiz.id)}`}
                                aria-label={`Edit ${quiz.title}`}
                              >
                                <span className="qc-row-edit">
                                  Edit <span aria-hidden="true">↗</span>
                                </span>
                              </AppRouteLink>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {filteredQuizzes.length > visibleCount ? (
                  <button
                    type="button"
                    className="qc-show-more"
                    onClick={() => setVisibleCount((count) => count + 5)}
                  >
                    Show more quizzes <span aria-hidden="true">↓</span>
                  </button>
                ) : null}
              </section>

              <aside className="qc-dashboard-sidecards">
                <section className="qc-dashboard-card qc-quick-actions">
                  <div className="qc-card-heading">
                    <div>
                      <h2>Your workspace</h2>
                      <p>Everything you need to keep moving.</p>
                    </div>
                  </div>
                  <div className="qc-quick-grid">
                    <QuickAction
                      href="/app/quizzes?create=1"
                      icon="＋"
                      tone="blue"
                      title="Create a quiz"
                      detail="Start something new"
                    />
                    <QuickAction
                      href="/app/products"
                      icon="◇"
                      tone="purple"
                      title="Product catalog"
                      detail="Sync and connect products"
                    />
                    <QuickAction
                      href="/app/appearance"
                      icon="◉"
                      tone="pink"
                      title="Appearance"
                      detail="Make it feel like your brand"
                    />
                    <QuickAction
                      href="/app/analytics"
                      icon="▥"
                      tone="green"
                      title="Analytics"
                      detail="See how shoppers respond"
                    />
                  </div>
                </section>

                <section className="qc-dashboard-card qc-help-card">
                  <span className="qc-help-icon" aria-hidden="true">
                    ?
                  </span>
                  <div>
                    <h2>From draft to storefront</h2>
                    <ol className="qc-getting-started">
                      <li>Sync your product catalog.</li>
                      <li>Add questions and product matches.</li>
                      <li>Publish and add the QuizCart theme block.</li>
                    </ol>
                    <AppRouteLink href="/app/products">
                      <span className="qc-button qc-button-outline">
                        Open product catalog <span aria-hidden="true">→</span>
                      </span>
                    </AppRouteLink>
                  </div>
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </s-page>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: string;
  tone: string;
}) {
  return (
    <article className="qc-metric-card">
      <span className={`qc-metric-icon is-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p>{label}</p>
        <strong>{value.toLocaleString()}</strong>
        <small>All time</small>
      </div>
    </article>
  );
}

function QuickAction({
  href,
  icon,
  tone,
  title,
  detail,
}: {
  href: string;
  icon: string;
  tone: string;
  title: string;
  detail: string;
}) {
  return (
    <AppRouteLink href={href}>
      <span className="qc-quick-action">
        <span className={`qc-quick-icon is-${tone}`} aria-hidden="true">
          {icon}
        </span>
        <span>
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
      </span>
    </AppRouteLink>
  );
}

export const headers: HeadersFunction = boundaryHeaders;
