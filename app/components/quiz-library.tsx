import { useEffect, useRef, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { AppRouteLink } from "./app-route-link";
import { formatDate } from "../lib/quiz";

type LibraryQuiz = {
  id: string;
  title: string;
  description: string;
  handle: string;
  status: string;
  updatedAt: Date | string;
  _count: { questions: number; sessions: number };
};
type ActionName =
  "create" | "edit" | "duplicate" | "publish" | "unpublish" | "delete";
type DialogAction = { kind: ActionName; quiz?: LibraryQuiz };

export function QuizLibrary({
  quizzes,
  initialStatus,
  creating,
  error,
}: {
  quizzes: LibraryQuiz[];
  initialStatus: string;
  creating: boolean;
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(
    ["draft", "published"].includes(initialStatus) ? initialStatus : "all",
  );
  const [dialog, setDialog] = useState<DialogAction | null>(
    creating ? { kind: "create" } : null,
  );
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (creating) setDialog({ kind: "create" });
  }, [creating]);
  const published = quizzes.filter(
    (quiz) => quiz.status === "published",
  ).length;
  const filtered = quizzes.filter(
    (quiz) =>
      (status === "all" || quiz.status === status) &&
      `${quiz.title} ${quiz.handle}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const close = () => {
    setDialog(null);
    if (params.has("create")) {
      const next = new URLSearchParams(params);
      next.delete("create");
      setParams(next, { replace: true });
    }
  };
  return (
    <main className="ql-page">
      <AppRouteLink href="/app" className="ql-back">
        <Icon name="back" /> Dashboard
      </AppRouteLink>
      <header className="ql-heading">
        <div>
          <span className="ql-eyebrow">YOUR QUIZ WORKSPACE</span>
          <h1>
            Quizzes <span>{quizzes.length}</span>
          </h1>
          <p>
            A little curiosity. A perfect product match. Manage it all here.
          </p>
        </div>
        <button
          type="button"
          className="ql-button is-primary"
          onClick={() => setDialog({ kind: "create" })}
        >
          <Icon name="create" /> Create quiz
        </button>
      </header>
      <section className="ql-overview" aria-label="Quiz overview">
        <div>
          <span className="ql-overview-icon">
            <Icon name="edit" />
          </span>
          <span>
            <strong>{quizzes.length}</strong>
            <small>Total quizzes</small>
          </span>
        </div>
        <div>
          <span className="ql-overview-icon is-green">
            <Icon name="publish" />
          </span>
          <span>
            <strong>{published}</strong>
            <small>Published</small>
          </span>
        </div>
        <div>
          <span className="ql-overview-icon is-amber">
            <Icon name="draft" />
          </span>
          <span>
            <strong>{quizzes.length - published}</strong>
            <small>Work in progress</small>
          </span>
        </div>
      </section>
      {error ? (
        <p className="ql-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ql-toolbar">
        <div className="ql-filters" role="group" aria-label="Filter quizzes">
          {[
            { value: "all", label: "All quizzes", count: quizzes.length },
            { value: "published", label: "Published", count: published },
            {
              value: "draft",
              label: "Drafts",
              count: quizzes.length - published,
            },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
            >
              {filter.label} <span>{filter.count}</span>
            </button>
          ))}
        </div>
        <label className="ql-search">
          <Icon name="search" />
          <span className="ql-sr-only">Search quizzes by title or handle</span>
          <input
            type="search"
            placeholder="Search quizzes…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </div>
      <p className="ql-result-count" role="status">
        {filtered.length} {filtered.length === 1 ? "quiz" : "quizzes"}
        {status !== "all"
          ? ` · ${status === "draft" ? "Drafts" : "Published"}`
          : " · Updated most recently"}
      </p>
      {filtered.length ? (
        <div className="ql-grid">
          {filtered.map((quiz, index) => (
            <article className="ql-card" key={quiz.id}>
              <div className={`ql-card-cover tone-${index % 3}`}>
                <span
                  className={`ql-status ${quiz.status === "published" ? "is-live" : ""}`}
                >
                  <i />
                  {quiz.status === "published" ? "Published" : "Draft"}
                </span>
                <span className="ql-cover-art" aria-hidden="true">
                  <span className="ql-art-line" />
                  <span className="ql-art-choice">
                    <i />
                    Personalized for you
                  </span>
                  <span className="ql-art-choice">
                    <i />
                    Find your match
                  </span>
                </span>
                <span className="ql-cover-mark" aria-hidden="true">
                  {quiz.title.slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div className="ql-card-body">
                <h2>
                  <AppRouteLink
                    href={`/app/quizzes/${encodeURIComponent(quiz.id)}?step=question1&pane=question`}
                  >
                    {quiz.title}
                  </AppRouteLink>
                </h2>
                <p className="ql-description">
                  {quiz.description ||
                    "Guide shoppers to the products that fit them best."}
                </p>
                <div className="ql-card-stats">
                  <span>
                    <Icon name="edit" />
                    {quiz._count.questions}{" "}
                    {quiz._count.questions === 1 ? "question" : "questions"}
                  </span>
                  <span>
                    <Icon name="people" />
                    {quiz._count.sessions}{" "}
                    {quiz._count.sessions === 1 ? "session" : "sessions"}
                  </span>
                </div>
                <span className="ql-handle" title={quiz.handle}>
                  /{quiz.handle}
                </span>
              </div>
              <footer className="ql-card-footer">
                <small>Updated {formatDate(quiz.updatedAt)}</small>
                <div className="ql-card-actions">
                  <ActionButton
                    action="edit"
                    label={`Edit ${quiz.title}`}
                    onClick={() => setDialog({ kind: "edit", quiz })}
                  />
                  <ActionButton
                    action="duplicate"
                    label={`Duplicate ${quiz.title}`}
                    onClick={() => setDialog({ kind: "duplicate", quiz })}
                  />
                  <ActionButton
                    action={quiz.status === "published" ? "draft" : "publish"}
                    label={`${quiz.status === "published" ? "Move to draft" : "Publish"}: ${quiz.title}`}
                    onClick={() =>
                      setDialog({
                        kind:
                          quiz.status === "published" ? "unpublish" : "publish",
                        quiz,
                      })
                    }
                  />
                  <ActionButton
                    action="delete"
                    label={`Delete ${quiz.title}`}
                    onClick={() => setDialog({ kind: "delete", quiz })}
                    danger
                  />
                </div>
              </footer>
            </article>
          ))}
          <button
            type="button"
            className="ql-add-card"
            onClick={() => setDialog({ kind: "create" })}
          >
            <span>
              <Icon name="create" />
            </span>
            <strong>Your next quiz starts here</strong>
            <small>Create a quiz and make shopping personal.</small>
          </button>
        </div>
      ) : (
        <section className="ql-empty">
          <span className="ql-empty-icon">
            <Icon name="search" />
          </span>
          <h2>
            {quizzes.length
              ? "No quizzes match your filters"
              : "Meet your first product quiz"}
          </h2>
          <p>
            {quizzes.length
              ? "Try a different title, handle, or quiz status."
              : "Start with a name. Add your questions and connect a few products. We’ll help with the rest."}
          </p>
          {quizzes.length ? (
            <button
              className="ql-button"
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Clear filters
            </button>
          ) : (
            <button
              className="ql-button is-primary"
              type="button"
              onClick={() => setDialog({ kind: "create" })}
            >
              <Icon name="create" />
              Create your first quiz
            </button>
          )}
        </section>
      )}
      <p className="ql-tip">
        <Icon name="info" /> New quizzes and copies start as drafts. Publish
        when your questions and products are ready.
      </p>
      {dialog ? (
        <QuizActionDialog
          key={`${dialog.kind}-${dialog.quiz?.id ?? "new"}`}
          action={dialog}
          onClose={close}
        />
      ) : null}
    </main>
  );
}

function ActionButton({
  action,
  label,
  onClick,
  danger,
}: {
  action: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ql-icon-button${danger ? " is-danger" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={action} />
    </button>
  );
}

function QuizActionDialog({
  action,
  onClose,
}: {
  action: DialogAction;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fetcher = useFetcher<{ ok: boolean; error: string | null }>();
  const pending = fetcher.state !== "idle";
  const title = {
    create: "Create a new quiz",
    edit: "What would you like to edit?",
    duplicate: "Duplicate this quiz?",
    publish: "Publish this quiz?",
    unpublish: "Move this quiz to draft?",
    delete: "Delete this quiz?",
  }[action.kind];
  const description = {
    create:
      "Give it a name. You can add questions, products, and your branding next.",
    edit: "Jump straight to the part you want to work on.",
    duplicate:
      "Copy the questions, settings, rules, and product matches into a new draft. Shopper history stays with the original.",
    publish:
      "Make this quiz available to shoppers through the QuizCart theme block. Questions and product matches must be ready.",
    unpublish:
      "This quiz will no longer be available on your storefront. You can keep editing and publish it again later.",
    delete:
      "This permanently deletes the quiz, its sessions, responses, recommendations, and quiz analytics. This cannot be undone.",
  }[action.kind];
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    if (action.kind === "create")
      dialog?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    return () => dialog?.close();
  }, [action.kind]);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) onClose();
  }, [fetcher.state, fetcher.data, onClose]);
  return (
    <dialog
      ref={ref}
      className="ql-dialog"
      aria-labelledby="ql-dialog-title"
      aria-describedby="ql-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="ql-dialog-body">
        <div className="ql-dialog-top">
          <span
            className={`ql-dialog-symbol${action.kind === "delete" ? " is-danger" : ""}`}
          >
            <Icon name={action.kind === "unpublish" ? "draft" : action.kind} />
          </span>
          <button
            type="button"
            className="ql-icon-button"
            aria-label="Close popup"
            disabled={pending}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="ql-dialog-title">{title}</h2>
        {action.quiz ? (
          <p className="ql-dialog-quiz">{action.quiz.title}</p>
        ) : null}
        <p id="ql-dialog-description">{description}</p>
        {action.kind === "edit" ? (
          <div className="ql-edit-options">
            {[
              {
                pane: "question",
                step: "question1",
                icon: "edit",
                title: "Questions & answers",
                detail: "Write questions, add answers, and set branching.",
              },
              {
                pane: "welcome",
                step: "welcome",
                icon: "create",
                title: "Welcome screen",
                detail: "Set the introduction and first impression.",
              },
              {
                pane: "products",
                step: "products",
                icon: "publish",
                title: "Products & recommendations",
                detail: "Connect answers to product matches.",
              },
              {
                pane: "results",
                step: "products",
                icon: "people",
                title: "Results page",
                detail: "Customize what shoppers see at the end.",
              },
            ].map((option) => (
              <AppRouteLink
                key={option.pane}
                href={`/app/quizzes/${encodeURIComponent(action.quiz!.id)}?pane=${option.pane}&step=${option.step}`}
              >
                <Icon name={option.icon} />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.detail}</small>
                </span>
                <span aria-hidden="true">→</span>
              </AppRouteLink>
            ))}
          </div>
        ) : (
          <fetcher.Form method="post" className="ql-dialog-form">
            <input type="hidden" name="intent" value={action.kind} />
            <input type="hidden" name="surface" value="dialog" />
            {action.quiz ? (
              <input type="hidden" name="quizId" value={action.quiz.id} />
            ) : null}
            {action.kind === "create" ? (
              <>
                <label>
                  Quiz name
                  <input
                    name="title"
                    required
                    maxLength={120}
                    placeholder="e.g. Find your skincare routine"
                  />
                </label>
                <label>
                  Description <span>(optional)</span>
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={500}
                    placeholder="What will this quiz help shoppers discover?"
                  />
                </label>
              </>
            ) : null}
            {fetcher.data?.error ? (
              <p className="ql-error" role="alert">
                {fetcher.data.error}
              </p>
            ) : null}
            <div className="ql-dialog-actions">
              <button
                type="button"
                className="ql-button"
                disabled={pending}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`ql-button ${action.kind === "delete" ? "is-danger" : "is-primary"}`}
                disabled={pending}
              >
                {pending
                  ? "Working…"
                  : {
                      create: "Create quiz",
                      duplicate: "Duplicate quiz",
                      publish: "Publish quiz",
                      unpublish: "Move to draft",
                      delete: "Delete permanently",
                    }[action.kind]}
              </button>
            </div>
          </fetcher.Form>
        )}
      </div>
    </dialog>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    create: "M12 5v14M5 12h14",
    close: "m6 6 12 12M18 6 6 18",
    back: "m12 5-7 7 7 7M5 12h14",
    edit: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z",
    duplicate: "M9 9h11v11H9zM15 5V3H3v12h2",
    publish: "m7 10 5-5 5 5M12 5v12M4 16v4h16v-4",
    draft: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
    delete: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4",
    info: "M12 10v7M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.edit} />
    </svg>
  );
}
