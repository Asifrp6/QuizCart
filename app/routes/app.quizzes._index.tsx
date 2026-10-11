import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useState } from "react";
import { data, Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import { appRedirect } from "../lib/app-redirect.server";
import { AppRouteLink } from "../components/app-route-link";
import { ensureShop } from "../services/shop.server";
import {
  addAnswer,
  addQuestion,
  createQuiz,
  deleteAnswer,
  deleteQuestion,
  deleteQuiz,
  duplicateQuiz,
  getQuiz,
  updateQuestion,
  listQuizzes,
  QuizError,
  setQuizStatus,
} from "../services/quiz.server";
import { useAdminNotice } from "../components/admin-ui";
import { QuizLibrary } from "../components/quiz-library";
import libraryStyles from "../quiz-library.css?url";

export const links = () => [{ rel: "stylesheet", href: libraryStyles }];
import {
  StorefrontPreview,
  type PreviewScene,
} from "../components/quiz-preview";
import {
  QUESTION_TYPES,
  isChoiceType,
  questionTypeLabel,
} from "../lib/quiz";

const NOTICES: Record<string, string> = {
  deleted: "Quiz deleted",
  created: "Quiz created",
  added: "Question added",
  removed: "Removed",
  saved: "Saved",
  published: "Quiz published",
  unpublished: "Quiz moved to drafts",
};

const ERRORS: Record<string, string> = {
  "missing-title": "Add a quiz title.",
  "missing-prompt": "Add the question text.",
  "missing-answer": "Add the answer text.",
  "missing-question": "That question is no longer on this quiz.",
  "need-question": "Add at least one question before publishing.",
  "incomplete-questions":
    "Choice questions need at least two answers before publishing.",
  "too-many-questions": "A quiz can have up to 30 questions.",
  "too-many-answers": "A question can have up to 12 answers.",
  "need-mappings":
    "Connect at least one product in the quiz editor before publishing.",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const quizId = url.searchParams.get("quiz") ?? "";
  const step =
    url.searchParams.get("step") === "questions" && quizId
      ? "questions"
      : "basics";
  const quizzes = await listQuizzes(shop.id);
  const opened = step === "questions" ? await openQuiz(shop.id, quizId) : null;
  return {
    quizzes,
    status,
    step,
    creating: url.searchParams.get("create") === "1",
    opened,
    appearance: {
      primaryColor: shop.settings.primaryColor,
      accentColor: shop.settings.accentColor,
      backgroundColor: shop.settings.backgroundColor,
      textColor: shop.settings.textColor,
      fontFamily: shop.settings.fontFamily,
      buttonRadius: shop.settings.buttonRadius,
      showProgress: shop.settings.showProgress,
    },
    notice: NOTICES[url.searchParams.get("notice") ?? ""] ?? null,
    error: ERRORS[url.searchParams.get("error") ?? ""] ?? null,
  };
};

async function openQuiz(shopId: string, quizId: string) {
  try {
    const quiz = await getQuiz(shopId, quizId);
    return {
      id: quiz.id,
      title: quiz.title,
      questions: quiz.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        position: question.position,
        answers: question.answers.map((answer) => ({
          id: answer.id,
          label: answer.label,
          imageUrl: answer.imageUrl,
        })),
      })),
    };
  } catch (error) {
    if (error instanceof Response) return null;
    throw error;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");
  const quizId = String(form.get("quizId") ?? "");
  const stay = (values: { notice?: string; error?: string }) =>
    appRedirect(request, questionsUrl(quizId, values));
  const listUrl = (values: { notice?: string; error?: string }) => {
    const params = new URLSearchParams();
    const status = new URL(request.url).searchParams.get("status");
    if (status === "draft" || status === "published")
      params.set("status", status);
    if (values.notice) params.set("notice", values.notice);
    if (values.error) params.set("error", values.error);
    return `/app/quizzes?${params}`;
  };

  try {
    if (intent === "publish" || intent === "unpublish") {
      await setQuizStatus(
        shop.id,
        quizId,
        intent === "publish" ? "published" : "draft",
      );
      if (form.get("surface") === "dialog")
        return data({ ok: true, error: null });
      return appRedirect(
        request,
        listUrl({
          notice: intent === "publish" ? "published" : "unpublished",
        }),
      );
    }
    if (intent === "duplicate") {
      const copy = await duplicateQuiz(shop.id, quizId);
      return appRedirect(
        request,
        `/app/quizzes/${copy.id}?step=question1&pane=question&notice=duplicated`,
      );
    }
    if (intent === "delete") {
      await deleteQuiz(shop.id, quizId);
      if (form.get("surface") === "dialog")
        return data({ ok: true, error: null });
      return appRedirect(request, "/app/quizzes?notice=deleted");
    }
    if (intent === "addQuestion") {
      await addQuestion(
        shop.id,
        quizId,
        String(form.get("prompt") ?? ""),
        String(form.get("type") ?? "single"),
      );
      return stay({ notice: "added" });
    }
    if (intent === "updateQuestion") {
      const existingQuiz = await getQuiz(shop.id, quizId);
      const existingQuestion = existingQuiz.questions.find(
        (question) => question.id === String(form.get("questionId") ?? ""),
      );
      if (!existingQuestion) throw new QuizError("missing-question");
      await updateQuestion(
        shop.id,
        quizId,
        String(form.get("questionId") ?? ""),
        {
          prompt: String(form.get("prompt") ?? ""),
          helpText: existingQuestion.helpText,
          type: String(form.get("type") ?? "single"),
          required: existingQuestion.required,
          position: Number(form.get("position") ?? 0),
          sliderMin: existingQuestion.sliderMin,
          sliderMax: existingQuestion.sliderMax,
          sliderStep: existingQuestion.sliderStep,
          layout: existingQuestion.layout,
        },
      );
      return stay({ notice: "saved" });
    }
    if (intent === "deleteQuestion") {
      await deleteQuestion(
        shop.id,
        quizId,
        String(form.get("questionId") ?? ""),
      );
      return stay({ notice: "removed" });
    }
    if (intent === "addAnswer") {
      await addAnswer(
        shop.id,
        quizId,
        String(form.get("questionId") ?? ""),
        String(form.get("label") ?? ""),
      );
      return stay({ notice: "added" });
    }
    if (intent === "deleteAnswer") {
      await deleteAnswer(shop.id, quizId, String(form.get("answerId") ?? ""));
      return stay({ notice: "removed" });
    }
    if (intent !== "create")
      return new Response("Unknown action", { status: 400 });
    const quiz = await createQuiz(
      shop.id,
      String(form.get("title") ?? ""),
      String(form.get("description") ?? ""),
    );
    return appRedirect(
      request,
      `/app/quizzes/${quiz.id}?step=question1&pane=question&notice=created`,
    );
  } catch (error) {
    if (error instanceof QuizError) {
      if (form.get("surface") === "dialog")
        return data(
          {
            ok: false,
            error:
              ERRORS[error.code] ??
              "This action could not be completed. Open the quiz editor and try again.",
          },
          { status: 400 },
        );
      if (intent === "publish" || intent === "unpublish") {
        return appRedirect(request, listUrl({ error: error.code }));
      }
      if (quizId) return stay({ error: error.code });
      return appRedirect(request, `/app/quizzes?create=1&error=${error.code}`);
    }
    if (error instanceof Response) throw error;
    throw error;
  }
};

function questionsUrl(
  quizId: string,
  values: { notice?: string; error?: string },
) {
  const params = new URLSearchParams({ quiz: quizId, step: "questions" });
  if (values.notice) params.set("notice", values.notice);
  if (values.error) params.set("error", values.error);
  return `/app/quizzes?${params}`;
}

export default function QuizzesPage() {
  const { quizzes, status, step, creating, opened, appearance, notice, error } =
    useLoaderData<typeof loader>();
  useAdminNotice(notice);
  return (
    <s-page inlineSize="large">
      <QuizLibrary
        quizzes={quizzes}
        initialStatus={status}
        creating={creating}
        error={error}
      />
      {step === "questions" && opened ? (
        <div className="qc-admin">
          <QuestionStep quiz={opened} appearance={appearance} />
        </div>
      ) : null}
    </s-page>
  );
}

function QuestionStep({
  quiz,
  appearance,
}: {
  quiz: {
    id: string;
    title: string;
    questions: {
      id: string;
      prompt: string;
      type: string;
      position: number;
      answers: { id: string; label: string; imageUrl: string }[];
    }[];
  };
  appearance: {
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
    buttonRadius: number;
    showProgress: boolean;
  };
}) {
  const [slide, setSlide] = useState(0);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const slides: { scene: PreviewScene; questionIndex: number }[] = [
    { scene: "welcome", questionIndex: 0 },
    { scene: "about", questionIndex: 0 },
    ...quiz.questions.map((_, index) => ({
      scene: "question" as const,
      questionIndex: index,
    })),
    { scene: "results", questionIndex: 0 },
  ];
  const current = slides[Math.min(slide, slides.length - 1)];
  const previewQuestion = quiz.questions[current.questionIndex];

  return (
    <section className="qc-panel">
      <div className="qc-panel-head">
        <h2>Questions · {quiz.title}</h2>
        <AppRouteLink href="/app/quizzes">
          <span className="qc-table-link">Back to list</span>
        </AppRouteLink>
      </div>
      <div className="qc-builder">
        <div>
          <StorefrontPreview
            scene={current.scene}
            appearance={appearance}
            welcomeTitle="Find Your Perfect Product"
            welcomeBody="Answer a few quick questions and get personalized recommendations just for you."
            resultTitle="Your Personalized Recommendations"
            resultBody="Based on your answers, we've selected the best products for you."
            welcomeImageUrl=""
            collectName
            collectAge
            question={
              previewQuestion
                ? {
                    prompt: previewQuestion.prompt,
                    helpText:
                      previewQuestion.type === "multiple"
                        ? "Select all that apply."
                        : "Select one option.",
                    type: previewQuestion.type,
                    sliderMin: 0,
                    sliderMax: 100,
                    sliderStep: 1,
                    required: true,
                    answers: previewQuestion.answers,
                  }
                : null
            }
            questions={quiz.questions.map((item) => ({
              prompt: item.prompt,
              helpText:
                item.type === "multiple"
                  ? "Select all that apply."
                  : "Select one option.",
              type: item.type,
              required: true,
              sliderMin: 0,
              sliderMax: 100,
              sliderStep: 1,
              answers: item.answers,
            }))}
            questionIndex={current.questionIndex}
            questionCount={Math.max(quiz.questions.length, 1)}
            products={[]}
          />
          <div className="qc-row-actions">
            <button
              className="qc-btn"
              type="button"
              disabled={slide === 0}
              onClick={() => setSlide((value) => Math.max(0, value - 1))}
            >
              Back
            </button>
            <button
              className="qc-btn is-primary"
              type="button"
              disabled={slide >= slides.length - 1}
              onClick={() =>
                setSlide((value) => Math.min(slides.length - 1, value + 1))
              }
            >
              Next
            </button>
          </div>
        </div>

        <div className="qc-editor-col">
          {quiz.questions.length === 0 ? (
            <p className="qc-muted">
              No questions yet. Add the first one below.
            </p>
          ) : (
            quiz.questions.map((question, index) => (
              <article key={question.id} className="qc-question">
                <h3>{`${index + 1}. ${questionTypeLabel(question.type)}`}</h3>
                <Form method="post" className="qc-form">
                  <input type="hidden" name="intent" value="updateQuestion" />
                  <input type="hidden" name="quizId" value={quiz.id} />
                  <input type="hidden" name="questionId" value={question.id} />
                  <input type="hidden" name="type" value={question.type} />
                  <input
                    type="hidden"
                    name="position"
                    value={String(question.position)}
                  />
                  <label>
                    Question
                    <input
                      name="prompt"
                      defaultValue={question.prompt}
                      required
                    />
                  </label>
                  <button className="qc-btn" type="submit">
                    Save edit
                  </button>
                </Form>
                <ul className="qc-answers">
                  {question.answers.map((answer) => (
                    <li key={answer.id}>
                      <span>{answer.label}</span>
                      <Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="deleteAnswer"
                        />
                        <input type="hidden" name="quizId" value={quiz.id} />
                        <input
                          type="hidden"
                          name="answerId"
                          value={answer.id}
                        />
                        <button className="qc-btn is-danger" type="submit">
                          Delete
                        </button>
                      </Form>
                    </li>
                  ))}
                </ul>
                {isChoiceType(question.type) && question.type !== "yes_no" ? (
                  <Form method="post" className="qc-inline-form">
                    <input type="hidden" name="intent" value="addAnswer" />
                    <input type="hidden" name="quizId" value={quiz.id} />
                    <input
                      type="hidden"
                      name="questionId"
                      value={question.id}
                    />
                    <input name="label" placeholder="New answer" required />
                    <button className="qc-btn" type="submit">
                      Add answer
                    </button>
                  </Form>
                ) : null}
                {deleteQuestionId === question.id ? (
                  <div role="alert">
                    <span>Delete this question?</span>
                    <Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="deleteQuestion"
                      />
                      <input type="hidden" name="quizId" value={quiz.id} />
                      <input
                        type="hidden"
                        name="questionId"
                        value={question.id}
                      />
                      <button className="qc-btn is-danger" type="submit">
                        Confirm delete
                      </button>
                    </Form>
                    <button
                      className="qc-btn"
                      type="button"
                      onClick={() => setDeleteQuestionId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="qc-btn is-danger"
                    type="button"
                    onClick={() => setDeleteQuestionId(question.id)}
                  >
                    Delete question
                  </button>
                )}
              </article>
            ))
          )}

          <Form method="post" className="qc-form qc-question">
            <input type="hidden" name="intent" value="addQuestion" />
            <input type="hidden" name="quizId" value={quiz.id} />
            <h3>Add a question</h3>
            <label>
              Question
              <input
                name="prompt"
                required
                placeholder="What is your skin type?"
              />
            </label>
            <label>
              Type
              <select name="type" defaultValue="single">
                {QUESTION_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="qc-btn is-primary" type="submit">
              Add question
            </button>
          </Form>
        </div>
      </div>
    </section>
  );
}

export const headers: HeadersFunction = boundaryHeaders;
