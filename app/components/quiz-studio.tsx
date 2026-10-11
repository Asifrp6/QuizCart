import { useEffect, useRef, useState } from "react";
import type { AppSettings } from "@prisma/client";
import { Form, useNavigation, useSubmit } from "react-router";
import { parseConditions } from "../lib/logic";
import {
  QUESTION_TYPES,
  isChoiceType,
  questionTypeLabel,
  formatDate,
} from "../lib/quiz";
import { ErrorBanner } from "./admin-ui";
import { AppRouteLink } from "./app-route-link";
import { StorefrontPreview, type PreviewScene } from "./quiz-preview";

const PANES = [
  "basics",
  "welcome",
  "customer",
  "question",
  "products",
  "results",
] as const;
export type StudioPane = (typeof PANES)[number];

const STEPS = [
  "basics",
  "welcome",
  "customer",
  "question1",
  "question2",
  "products",
] as const;
export type StudioStep = (typeof STEPS)[number] | "results";

type StudioQuestion = {
  id: string;
  prompt: string;
  helpText: string;
  type: string;
  required: boolean;
  position: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  layout: string;
  answers: {
    id: string;
    label: string;
    description: string;
    imageUrl: string;
    position: number;
  }[];
};

type StudioQuiz = {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: string;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeImageUrl: string;
  startButtonText: string;
  showDuration: boolean;
  durationText: string;
  showPersonalizedBenefit: boolean;
  welcomeBenefits: string;
  customerInfoTitle: string;
  customerInfoBody: string;
  ageRangeOptions: string;
  resultTitle: string;
  resultBody: string;
  collectName: boolean | null;
  collectAge: boolean | null;
  nameRequired: boolean | null;
  ageRequired: boolean | null;
  aiEnabled: boolean | null;
  recommendationStyle: string | null;
  aiExplanation: boolean | null;
  maxRecommendations: number | null;
  primaryColor: string | null;
  accentColor: string | null;
  updatedAt: string | Date;
  questions: StudioQuestion[];
  rules: {
    id: string;
    conditions: string;
    match: string;
    targetQuestionId: string;
  }[];
  mappings: {
    id: string;
    answerId: string | null;
    shopifyProductId: string;
    score: number;
  }[];
};

type StudioProduct = {
  id: string;
  shopifyId: string;
  title: string;
  price: string;
  imageUrl: string;
};

type Live = {
  title: string;
  description: string;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeImageUrl: string;
  startButtonText: string;
  showDuration: boolean;
  durationText: string;
  showPersonalizedBenefit: boolean;
  customerInfoTitle: string;
  customerInfoBody: string;
  resultTitle: string;
  resultBody: string;
  collectName: string;
  collectAge: string;
  nameRequired: string;
  ageRequired: string;
  customColors: string;
  primaryColor: string;
  accentColor: string;
  prompt: string;
  helpText: string;
  type: string;
  required: string;
  aiEnabled: string;
  recommendationStyle: string;
  aiExplanation: string;
  customMax: string;
  labels: Record<string, string>;
  descriptions: Record<string, string>;
  answerImages: Record<string, string>;
  layout: string;
  benefits: string[];
  ageRanges: string[];
};

type ShopifyImage = { id: string; alt: string; url: string };

export function QuizStudio({
  quiz,
  products,
  imageLibrary,
  selectedId,
  settings,
  error,
  aiConfigured,
  pane,
  step,
}: {
  quiz: StudioQuiz;
  products: StudioProduct[];
  imageLibrary: ShopifyImage[];
  selectedId: string;
  settings: AppSettings;
  error: string | null;
  aiConfigured: boolean;
  pane: StudioPane;
  step: StudioStep;
}) {
  const [popup, setPopup] = useState<{
    kind: "add" | "edit" | "delete";
    id?: string;
  } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const submit = useSubmit();
  const selected = quiz.questions.find(
    (question) => question.id === (popup?.id ?? selectedId),
  );
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";
  const [previewDevice, setPreviewDevice] = useState<"phone" | "wide">("phone");
  const savedAt = `${quiz.updatedAt}-${JSON.stringify(quiz.questions)}`;
  const [live, setLive] = useState<Live>(() =>
    liveFrom(quiz, settings, selected),
  );

  useEffect(() => {
    setLive(liveFrom(quiz, settings, selected));
    // Refresh the preview from saved data when the merchant opens another page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id, savedAt, selected?.id]);

  const previousQuestionCount = useRef(quiz.questions.length);
  useEffect(() => {
    if (
      popup?.kind === "add" &&
      quiz.questions.length > previousQuestionCount.current
    )
      setPopup({ kind: "edit", id: selectedId });
    if (
      popup?.kind === "delete" &&
      !quiz.questions.some((question) => question.id === popup.id)
    )
      setPopup(null);
    previousQuestionCount.current = quiz.questions.length;
  }, [quiz.questions, popup, selectedId]);
  const productName = new Map(
    products.map((product) => [product.shopifyId, product.title]),
  );
  const publishIssues = [
    ...(quiz.questions.length ? [] : ["Add at least one question."]),
    ...quiz.questions
      .filter(
        (question) =>
          isChoiceType(question.type) && question.answers.length < 2,
      )
      .map((question) => `Add at least two answers to “${question.prompt}”.`),
    ...(quiz.mappings.length
      ? []
      : ["Connect a product on the Products step."]),
  ];
  const scene: PreviewScene =
    pane === "customer"
      ? "about"
      : pane === "question"
        ? "question"
        : pane === "results"
          ? "results"
          : pane === "products"
            ? "results"
            : "welcome";
  const selectedStageQuestion = Boolean(selected);
  const previewQuestion =
    selected && selectedStageQuestion
      ? {
          prompt: live.prompt,
          helpText: live.helpText,
          type: live.type,
          required: live.required === "on",
          sliderMin: selected.sliderMin,
          sliderMax: selected.sliderMax,
          sliderStep: selected.sliderStep,
          layout: live.layout,
          answers:
            selected.answers.length > 0
              ? selected.answers.map((answer) => ({
                  id: answer.id,
                  label: live.labels[answer.id] ?? answer.label,
                  description:
                    live.descriptions[answer.id] ?? answer.description,
                  imageUrl: live.answerImages[answer.id] ?? answer.imageUrl,
                }))
              : live.type === "yes_no"
                ? [
                    { id: "yes", label: "Yes", imageUrl: "" },
                    { id: "no", label: "No", imageUrl: "" },
                  ]
                : [],
        }
      : null;
  const previewQuestions = quiz.questions.map((question) => {
    const isSelected = question.id === selectedId;
    const type = isSelected ? live.type : question.type;
    const answers = question.answers.map((answer) => ({
      id: answer.id,
      label: isSelected
        ? (live.labels[answer.id] ?? answer.label)
        : answer.label,
      description: isSelected
        ? (live.descriptions[answer.id] ?? answer.description)
        : answer.description,
      imageUrl: isSelected
        ? (live.answerImages[answer.id] ?? answer.imageUrl)
        : answer.imageUrl,
    }));

    return {
      prompt: isSelected ? live.prompt || question.prompt : question.prompt,
      helpText: isSelected ? live.helpText : question.helpText,
      type,
      required: isSelected ? live.required === "on" : question.required,
      sliderMin: question.sliderMin,
      sliderMax: question.sliderMax,
      sliderStep: question.sliderStep,
      layout: isSelected ? live.layout : question.layout,
      answers:
        answers.length > 0
          ? answers
          : type === "yes_no"
            ? [
                { id: "yes", label: "Yes", description: "", imageUrl: "" },
                { id: "no", label: "No", description: "", imageUrl: "" },
              ]
            : [],
    };
  });
  return (
    <div className="qc-frame qc-editor-refresh">
      <div className="qc-builder-layout">
        <aside className="qc-app-sidebar">
          <AppRouteLink href="/app" className="qc-brand">
            <span className="qc-brand-mark">Q</span>
            <span>QuizCart</span>
          </AppRouteLink>
          <nav aria-label="QuizCart navigation" className="qc-side-links">
            <AppRouteLink href="/app">
              ⌂ <span>Dashboard</span>
            </AppRouteLink>
            <AppRouteLink href="/app/quizzes" aria-current="page">
              ▦ <span>Quizzes</span>
            </AppRouteLink>
            <AppRouteLink href="/app/products">
              ◇ <span>Products</span>
            </AppRouteLink>
            <AppRouteLink href="/app/customers">
              ♙ <span>Customers</span>
            </AppRouteLink>
            <AppRouteLink href="/app/analytics">
              ◷ <span>Analytics</span>
            </AppRouteLink>
            <AppRouteLink href="/app/appearance">
              ✧ <span>Design</span>
            </AppRouteLink>
            <AppRouteLink href="/app/settings">
              ⚙ <span>Settings</span>
            </AppRouteLink>
          </nav>
        </aside>
        <main className="qc-builder-main">
          <div className="qc-builder-topline">
            <AppRouteLink href="/app/quizzes">← All quizzes</AppRouteLink>
            <span className="qc-editor-updated">
              {saving ? "Updating…" : `Updated ${formatDate(quiz.updatedAt)}`}
            </span>
          </div>
          <header className="qc-editor-header">
            <div className="qc-editor-heading-copy">
              <span className="qc-editor-eyebrow">QUIZ STUDIO</span>
              <h1>{quiz.title}</h1>
              <p>
                <span
                  className={`qc-editor-status${quiz.status === "published" ? " is-live" : ""}`}
                >
                  <i />
                  {quiz.status === "published" ? "Published" : "Draft"}
                </span>
                <span>
                  {quiz.questions.length}{" "}
                  {quiz.questions.length === 1 ? "question" : "questions"}
                </span>
                <span>
                  {quiz.mappings.length} product{" "}
                  {quiz.mappings.length === 1 ? "match" : "matches"}
                </span>
              </p>
            </div>
            <div className="qc-editor-header-actions">
              <button
                type="button"
                className="qc-editor-button"
                onClick={() =>
                  document.getElementById("qc-live-preview")?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "auto"
                      : "smooth",
                    block: "start",
                  })
                }
              >
                Preview quiz ↗
              </button>
              <div className="qc-publish-action">
                {quiz.status === "published" ? (
                  <Form method="post">
                    <Hidden pane={pane} questionId={selectedId} step={step} />
                    <input type="hidden" name="intent" value="unpublish" />
                    <button
                      className="qc-editor-button"
                      type="submit"
                      disabled={saving}
                    >
                      Move to draft
                    </button>
                  </Form>
                ) : (
                  <Form method="post">
                    <Hidden pane={pane} questionId={selectedId} step={step} />
                    <input type="hidden" name="intent" value="publish" />
                    <button
                      className="qc-editor-button is-primary"
                      type="submit"
                      disabled={saving || publishIssues.length > 0}
                    >
                      Publish quiz ↑
                    </button>
                  </Form>
                )}
              </div>
            </div>
          </header>
          <ErrorBanner message={error} />
          {quiz.status === "draft" ? (
            <details
              className={`qc-editor-readiness${publishIssues.length ? "" : " is-ready"}`}
            >
              <summary>
                <span aria-hidden="true">
                  {publishIssues.length ? "○" : "✓"}
                </span>
                <strong>
                  {publishIssues.length
                    ? `${publishIssues.length} ${publishIssues.length === 1 ? "thing" : "things"} to finish before publishing`
                    : "Ready to publish"}
                </strong>
                <span className="qc-readiness-hint">View checklist</span>
              </summary>
              {publishIssues.length ? (
                <ul>
                  {publishIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  Your questions and product recommendations are set up. Preview
                  your quiz, then publish.
                </p>
              )}
            </details>
          ) : null}
          <ol className="qc-workflow">
            {STEPS.map((item, index) => {
              const info = stepInfo(item);
              const question = quiz.questions[item === "question2" ? 1 : 0];
              const current = step === item;
              return (
                <li key={item} className={current ? "is-current" : ""}>
                  <AppRouteLink
                    href={workflowHref(quiz.id, item, question?.id ?? "")}
                    aria-current={current ? "page" : undefined}
                  >
                    <span className="qc-workflow-number">{index + 1}</span>
                    <span className="qc-workflow-copy">
                      <strong>{info.title}</strong>
                      <small>{info.description}</small>
                    </span>
                  </AppRouteLink>
                </li>
              );
            })}
          </ol>
          <header className="qc-stage-heading">
            <span className="qc-stage-number">{stagePosition(step) + 1}</span>
            <div>
              <h2>{stepInfo(step).title}</h2>
              <p>{stepInfo(step).description}</p>
            </div>
          </header>
          <div className="qc-studio">
            <div className="qc-editor">
              {step === "basics" ? (
                <BasicsEditor
                  quiz={quiz}
                  settings={settings}
                  selectedId={selectedId}
                  savedAt={savedAt}
                  imageLibrary={imageLibrary}
                  live={live}
                  onLive={setLive}
                />
              ) : null}
              {step === "welcome" ? (
                <WelcomeEditor
                  quiz={quiz}
                  settings={settings}
                  selectedId={selectedId}
                  savedAt={savedAt}
                  imageLibrary={imageLibrary}
                  live={live}
                  onLive={setLive}
                />
              ) : null}
              {step === "customer" ? (
                <CustomerEditor
                  quiz={quiz}
                  settings={settings}
                  selectedId={selectedId}
                  savedAt={savedAt}
                  live={live}
                  onLive={setLive}
                />
              ) : null}
              {step === "question1" || step === "question2" ? (
                <>
                  <div className="qc-card">
                    <div className="qc-questions-heading">
                      <s-heading>
                        Your questions ({quiz.questions.length}/30)
                      </s-heading>
                      <button
                        type="button"
                        className="qc-btn"
                        disabled={saving || quiz.questions.length >= 30}
                        onClick={() => setPopup({ kind: "add" })}
                      >
                        + Add question
                      </button>
                    </div>
                    <p>
                      Drag a handle to reorder. Click a question to edit its
                      details and answers.
                    </p>
                    <div className="qc-question-list">
                      {quiz.questions.map((question, index) => (
                        <div
                          key={question.id}
                          className={
                            "qc-question-row" +
                            (dropTarget === question.id
                              ? " is-drop-target"
                              : "")
                          }
                          onDragOver={(event) => {
                            if (dragged && !saving) {
                              event.preventDefault();
                              setDropTarget(question.id);
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (dragged && dragged !== question.id && !saving)
                              submit(
                                {
                                  intent: "moveQuestion",
                                  questionId: dragged,
                                  targetQuestionId: question.id,
                                  direction: "drop",
                                  pane: "question",
                                  step,
                                },
                                { method: "post" },
                              );
                            setDragged(null);
                            setDropTarget(null);
                          }}
                        >
                          <button
                            type="button"
                            className="qc-question-handle"
                            draggable={!saving}
                            disabled={saving}
                            aria-label={
                              "Reorder question " +
                              (index + 1) +
                              ". Use arrow keys to move."
                            }
                            title="Drag or use arrow keys to reorder"
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                "text/plain",
                                question.id,
                              );
                              event.dataTransfer.effectAllowed = "move";
                              setDragged(question.id);
                            }}
                            onDragEnd={() => {
                              setDragged(null);
                              setDropTarget(null);
                            }}
                            onKeyDown={(event) => {
                              const offset =
                                event.key === "ArrowUp"
                                  ? -1
                                  : event.key === "ArrowDown"
                                    ? 1
                                    : 0;
                              if (offset) {
                                event.preventDefault();
                                const target = quiz.questions[index + offset];
                                if (target && !saving)
                                  submit(
                                    {
                                      intent: "moveQuestion",
                                      questionId: question.id,
                                      targetQuestionId: target.id,
                                      direction: "drop",
                                      pane: "question",
                                      step,
                                    },
                                    { method: "post" },
                                  );
                              }
                            }}
                          >
                            ?
                          </button>
                          <span className="qc-question-number">
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            className="qc-question-title"
                            disabled={saving}
                            onClick={() =>
                              setPopup({ kind: "edit", id: question.id })
                            }
                          >
                            <strong>{question.prompt}</strong>
                            <span>
                              {questionTypeLabel(question.type)} ?{" "}
                              {question.answers.length} answers
                            </span>
                          </button>
                          <button
                            type="button"
                            className="qc-question-icon"
                            disabled={saving}
                            aria-label={"Edit question " + (index + 1)}
                            onClick={() =>
                              setPopup({ kind: "edit", id: question.id })
                            }
                          >
                            <QuestionIcon kind="edit" />
                          </button>
                          <button
                            type="button"
                            className="qc-question-icon qc-question-delete"
                            disabled={saving}
                            aria-label={"Delete question " + (index + 1)}
                            onClick={() =>
                              setPopup({ kind: "delete", id: question.id })
                            }
                          >
                            <QuestionIcon kind="delete" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {!quiz.questions.length ? (
                      <p>
                        Add your first question to start building your quiz.
                      </p>
                    ) : null}
                  </div>
                  {popup ? (
                    <QuestionPopup
                      title={
                        popup.kind === "add"
                          ? "Add question"
                          : popup.kind === "delete"
                            ? "Delete question"
                            : "Edit question"
                      }
                      saving={saving}
                      onClose={() => setPopup(null)}
                    >
                      <ErrorBanner message={error} />
                      {popup.kind === "add" ? (
                        <AddQuestionForm
                          stage={step}
                          layout="auto"
                          formId="question-popup-add"
                        />
                      ) : selected ? (
                        popup.kind === "delete" ? (
                          <Form method="post">
                            <Hidden
                              pane="question"
                              questionId={selected.id}
                              step={step}
                            />
                            <input
                              type="hidden"
                              name="intent"
                              value="deleteQuestion"
                            />
                            <p>
                              Delete ?{selected.prompt}?? Its answers and
                              related rules and product mappings will also be
                              removed.
                            </p>
                            <button
                              type="submit"
                              className="qc-btn"
                              disabled={saving}
                            >
                              Delete question
                            </button>
                          </Form>
                        ) : (
                          <QuestionEditor
                            quiz={quiz}
                            question={selected}
                            products={products}
                            productName={productName}
                            savedAt={savedAt}
                            imageLibrary={imageLibrary}
                            live={live}
                            onLive={setLive}
                            stage={step}
                            formId={"question-editor-" + selected.id}
                          />
                        )
                      ) : null}
                    </QuestionPopup>
                  ) : null}
                  <div className="qc-stage-actions">
                    <AppRouteLink
                      href={workflowHref(
                        quiz.id,
                        step === "question1" ? "customer" : "question1",
                        step === "question1"
                          ? ""
                          : (quiz.questions[0]?.id ?? ""),
                      )}
                    >
                      ← Back
                    </AppRouteLink>
                    <AppRouteLink
                      href={workflowHref(
                        quiz.id,
                        step === "question1" ? "question2" : "products",
                        "",
                      )}
                    >
                      <span className="qc-next-button">Next ?</span>
                    </AppRouteLink>
                  </div>
                </>
              ) : null}
              {step === "products" || step === "results" ? (
                <ProductsEditor
                  quiz={quiz}
                  products={products}
                  selectedId={selectedId}
                  settings={settings}
                  savedAt={savedAt}
                  aiConfigured={aiConfigured}
                  live={live}
                  onLive={setLive}
                  activeTab={pane === "results" ? "results" : "rules"}
                />
              ) : null}
            </div>
            <div className="qc-preview" id="qc-live-preview">
              <div className="qc-preview-title">
                <div>
                  <strong>Shopper preview</strong>
                  <small>See your changes as you edit.</small>
                </div>
                <span className="qc-preview-live">
                  <i />
                  Live
                </span>
              </div>
              <div
                className="qc-device-switch"
                role="group"
                aria-label="Preview size"
              >
                <button
                  type="button"
                  aria-pressed={previewDevice === "phone"}
                  onClick={() => setPreviewDevice("phone")}
                >
                  Phone
                </button>
                <button
                  type="button"
                  aria-pressed={previewDevice === "wide"}
                  onClick={() => setPreviewDevice("wide")}
                >
                  Wide
                </button>
              </div>
              <div className={`qc-preview-frame is-${previewDevice}`}>
                <StorefrontPreview
                  key={`${scene}-${selectedId}`}
                  scene={scene}
                  appearance={{
                    primaryColor:
                      live.customColors === "on"
                        ? live.primaryColor
                        : settings.primaryColor,
                    accentColor:
                      live.customColors === "on"
                        ? live.accentColor
                        : settings.accentColor,
                    backgroundColor: settings.backgroundColor,
                    textColor: settings.textColor,
                    fontFamily: settings.fontFamily,
                    buttonRadius: settings.buttonRadius,
                    showProgress: settings.showProgress,
                  }}
                  welcomeTitle={live.welcomeTitle}
                  welcomeBody={live.welcomeBody}
                  welcomeImageUrl={live.welcomeImageUrl}
                  startButtonText={live.startButtonText}
                  showDuration={live.showDuration}
                  durationText={live.durationText}
                  showPersonalizedBenefit={live.showPersonalizedBenefit}
                  welcomeBenefits={live.benefits}
                  customerInfoTitle={live.customerInfoTitle}
                  customerInfoBody={live.customerInfoBody}
                  ageRangeOptions={live.ageRanges}
                  resultTitle={live.resultTitle}
                  resultBody={live.resultBody}
                  collectName={flag(
                    live.collectName,
                    quiz.collectName,
                    settings.collectName,
                  )}
                  collectAge={flag(
                    live.collectAge,
                    quiz.collectAge,
                    settings.collectAge,
                  )}
                  question={previewQuestion}
                  questions={previewQuestions}
                  questionIndex={Math.max(
                    quiz.questions.findIndex(
                      (question) => question.id === selectedId,
                    ),
                    0,
                  )}
                  questionCount={quiz.questions.length}
                  products={previewProducts(
                    quiz.mappings,
                    products,
                    quiz.maxRecommendations ?? settings.maxRecommendations,
                  )}
                />
              </div>
              <p className="qc-preview-footnote">
                Preview only. Save each section to apply your changes.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function BasicsEditor({
  quiz,
  settings,
  selectedId,
  savedAt,
  imageLibrary,
  live,
  onLive,
}: {
  quiz: StudioQuiz;
  settings: AppSettings;
  selectedId: string;
  savedAt: string;
  imageLibrary: ShopifyImage[];
  live: Live;
  onLive: (next: Live) => void;
}) {
  return (
    <div className="qc-card">
      <s-heading>Basic quiz information</s-heading>
      <s-paragraph>
        Start with a name and a short description for your quiz.
      </s-paragraph>
      <Form method="post" key={`basics-${savedAt}`}>
        <Hidden pane="basics" questionId={selectedId} step="basics" />
        <input type="hidden" name="intent" value="updateQuiz" />
        <input type="hidden" name="nextStep" value="welcome" />
        <QuizTail quiz={quiz} settings={settings} live={live} mode="basics" />
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Quiz title"
            name="title"
            defaultValue={quiz.title}
            onInput={(event) => onLive({ ...live, title: readField(event) })}
          />
          <s-text-area
            label="Description"
            name="description"
            defaultValue={quiz.description}
            rows={2}
            onInput={(event) =>
              onLive({ ...live, description: readField(event) })
            }
          />
          <s-text-field
            label="Button text"
            name="startButtonText"
            defaultValue={quiz.startButtonText}
            onInput={(event) =>
              onLive({ ...live, startButtonText: readField(event) })
            }
          />
          <ImagePicker
            label="Cover image (Optional)"
            name="welcomeImageUrl"
            value={live.welcomeImageUrl}
            imageLibrary={imageLibrary}
            onChange={(value) => onLive({ ...live, welcomeImageUrl: value })}
          />
          <div className="qc-stage-actions">
            <span />
            <button className="qc-next-button" type="submit">
              Next <span>→</span>
            </button>
          </div>
        </s-stack>
      </Form>
    </div>
  );
}

function WelcomeEditor({
  quiz,
  settings,
  selectedId,
  savedAt,
  imageLibrary,
  live,
  onLive,
}: {
  quiz: StudioQuiz;
  settings: AppSettings;
  selectedId: string;
  savedAt: string;
  imageLibrary: ShopifyImage[];
  live: Live;
  onLive: (next: Live) => void;
}) {
  return (
    <div className="qc-card">
      <s-heading>Start screen</s-heading>
      <Form method="post" key={`welcome-${savedAt}`}>
        <Hidden pane="welcome" questionId={selectedId} step="welcome" />
        <input type="hidden" name="intent" value="updateQuiz" />
        <input type="hidden" name="nextStep" value="customer" />
        <QuizTail quiz={quiz} settings={settings} live={live} mode="welcome" />
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Welcome title"
            name="welcomeTitle"
            defaultValue={quiz.welcomeTitle}
            onInput={(event) =>
              onLive({ ...live, welcomeTitle: readField(event) })
            }
          />
          <s-text-area
            label="Welcome message"
            name="welcomeBody"
            defaultValue={quiz.welcomeBody}
            rows={3}
            onInput={(event) =>
              onLive({ ...live, welcomeBody: readField(event) })
            }
          />
          <ImagePicker
            label="Welcome cover image"
            name="welcomeImageUrl"
            value={live.welcomeImageUrl}
            imageLibrary={imageLibrary}
            onChange={(value) => onLive({ ...live, welcomeImageUrl: value })}
          />
          <s-text-field
            label="Start button"
            name="startButtonText"
            defaultValue={quiz.startButtonText}
            onInput={(event) =>
              onLive({ ...live, startButtonText: readField(event) })
            }
          />
          <s-checkbox
            label="Show estimated time"
            name="showDuration"
            value="on"
            checked={live.showDuration}
            onChange={(event) =>
              onLive({ ...live, showDuration: checkedField(event) })
            }
          />
          <StringListEditor
            label="Welcome benefits"
            name="welcomeBenefits"
            values={live.benefits}
            onChange={(benefits) => onLive({ ...live, benefits })}
          />
          <s-text-field
            label="Estimated time"
            name="durationText"
            defaultValue={quiz.durationText}
            onInput={(event) =>
              onLive({ ...live, durationText: readField(event) })
            }
          />
          <s-checkbox
            label="Show welcome benefits"
            name="showPersonalizedBenefit"
            value="on"
            checked={live.showPersonalizedBenefit}
            onChange={(event) =>
              onLive({
                ...live,
                showPersonalizedBenefit: checkedField(event),
              })
            }
          />
          <s-heading>Brand colors</s-heading>
          <s-select
            label="Colors"
            name="customColors"
            value={live.customColors}
            onChange={(event) =>
              onLive({ ...live, customColors: readField(event) })
            }
          >
            <s-option value="off">Use shop appearance</s-option>
            <s-option value="on">Custom colors</s-option>
          </s-select>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-color-field
              label="Primary"
              name="primaryColor"
              defaultValue={quiz.primaryColor || settings.primaryColor}
              onInput={(event) =>
                onLive({ ...live, primaryColor: readField(event) })
              }
            />
            <s-color-field
              label="Accent"
              name="accentColor"
              defaultValue={quiz.accentColor || settings.accentColor}
              onInput={(event) =>
                onLive({ ...live, accentColor: readField(event) })
              }
            />
          </s-grid>
          <div className="qc-stage-actions">
            <AppRouteLink href={workflowHref(quiz.id, "basics", "")}>
              ← Back
            </AppRouteLink>
            <button className="qc-next-button" type="submit">
              Next <span>→</span>
            </button>
          </div>
        </s-stack>
      </Form>
    </div>
  );
}

function CustomerEditor({
  quiz,
  settings,
  selectedId,
  savedAt,
  live,
  onLive,
}: {
  quiz: StudioQuiz;
  settings: AppSettings;
  selectedId: string;
  savedAt: string;
  live: Live;
  onLive: (next: Live) => void;
}) {
  return (
    <div className="qc-card">
      <s-heading>Customer information</s-heading>
      <s-paragraph>
        Choose whether to ask for a name or age before the first question.
      </s-paragraph>
      <Form method="post" key={`customer-${savedAt}`}>
        <Hidden pane="customer" questionId={selectedId} step="customer" />
        <input type="hidden" name="intent" value="updateQuiz" />
        <input type="hidden" name="nextStep" value="question1" />
        <QuizTail quiz={quiz} settings={settings} live={live} mode="customer" />
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Screen title"
            name="customerInfoTitle"
            defaultValue={quiz.customerInfoTitle}
            onInput={(event) =>
              onLive({ ...live, customerInfoTitle: readField(event) })
            }
          />
          <s-text-area
            label="Screen description"
            name="customerInfoBody"
            defaultValue={quiz.customerInfoBody}
            rows={3}
            onInput={(event) =>
              onLive({ ...live, customerInfoBody: readField(event) })
            }
          />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <InheritSelect
              label="Collect name"
              name="collectName"
              value={live.collectName}
              onChange={(value) => onLive({ ...live, collectName: value })}
            />
            <InheritSelect
              label="Name required"
              name="nameRequired"
              value={live.nameRequired}
              onChange={(value) => onLive({ ...live, nameRequired: value })}
            />
            <InheritSelect
              label="Collect age"
              name="collectAge"
              value={live.collectAge}
              onChange={(value) => onLive({ ...live, collectAge: value })}
            />
            <InheritSelect
              label="Age required"
              name="ageRequired"
              value={live.ageRequired}
              onChange={(value) => onLive({ ...live, ageRequired: value })}
            />
          </s-grid>
          <StringListEditor
            label="Age range options"
            name="ageRangeOptions"
            values={live.ageRanges}
            onChange={(ageRanges) => onLive({ ...live, ageRanges })}
          />
          <div className="qc-stage-actions">
            <AppRouteLink href={workflowHref(quiz.id, "welcome", "")}>
              ← Back
            </AppRouteLink>
            <button className="qc-next-button" type="submit">
              Next <span>→</span>
            </button>
          </div>
        </s-stack>
      </Form>
    </div>
  );
}

function QuestionEditor({
  quiz,
  question,
  products,
  productName,
  savedAt,
  imageLibrary,
  live,
  onLive,
  stage,
  formId,
}: {
  quiz: StudioQuiz;
  question: StudioQuestion;
  products: StudioProduct[];
  productName: Map<string, string>;
  savedAt: string;
  imageLibrary: ShopifyImage[];
  live: Live;
  onLive: (next: Live) => void;
  stage: "question1" | "question2";
  formId: string;
}) {
  const otherAnswers = quiz.questions
    .filter(
      (item) => item.position < question.position && isChoiceType(item.type),
    )
    .flatMap((item) =>
      item.answers.map((answer) => ({
        id: answer.id,
        label: answer.label,
        questionPrompt: item.prompt,
      })),
    );
  const rulesHere = quiz.rules.filter(
    (rule) => rule.targetQuestionId === question.id,
  );

  return (
    <div className="qc-edit-question">
      <div className="qc-card">
        <s-heading>Question</s-heading>
        <Form id={formId} method="post" key={`${question.id}-${savedAt}`}>
          <Hidden pane="question" questionId={question.id} step={stage} />
          <input type="hidden" name="intent" value="updateQuestion" />
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Question text"
              name="prompt"
              defaultValue={question.prompt}
              onInput={(event) => onLive({ ...live, prompt: readField(event) })}
            />
            <s-text-field
              label="Help text (optional)"
              name="helpText"
              defaultValue={question.helpText}
              onInput={(event) =>
                onLive({ ...live, helpText: readField(event) })
              }
            />
            <s-select
              label="Type"
              name="type"
              value={live.type}
              onChange={(event) => onLive({ ...live, type: readField(event) })}
            >
              {QUESTION_TYPES.map((type) => (
                <s-option key={type.value} value={type.value}>
                  {type.label}
                </s-option>
              ))}
            </s-select>
            <s-paragraph color="subdued">
              {questionTypeLabel(live.type)}
            </s-paragraph>
            <s-select
              label="Required"
              name="required"
              value={live.required}
              onChange={(event) =>
                onLive({ ...live, required: readField(event) })
              }
            >
              <s-option value="on">Required</s-option>
              <s-option value="off">Optional</s-option>
            </s-select>
            <s-select
              label="Answer layout"
              name="layout"
              value={live.layout}
              onChange={(event) =>
                onLive({ ...live, layout: readField(event) })
              }
            >
              <s-option value="auto">Automatic</s-option>
              <s-option value="list">List</s-option>
              <s-option value="grid">Grid</s-option>
            </s-select>
            <input
              type="hidden"
              name="position"
              value={String(question.position)}
            />
            {live.type === "slider" ? (
              <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                <s-number-field
                  label="Minimum"
                  name="sliderMin"
                  defaultValue={String(question.sliderMin)}
                />
                <s-number-field
                  label="Maximum"
                  name="sliderMax"
                  defaultValue={String(question.sliderMax)}
                />
                <s-number-field
                  label="Step"
                  name="sliderStep"
                  defaultValue={String(question.sliderStep)}
                  min={1}
                />
              </s-grid>
            ) : (
              <>
                <input
                  type="hidden"
                  name="sliderMin"
                  value={String(question.sliderMin)}
                />
                <input
                  type="hidden"
                  name="sliderMax"
                  value={String(question.sliderMax)}
                />
                <input
                  type="hidden"
                  name="sliderStep"
                  value={String(question.sliderStep)}
                />
              </>
            )}
            <s-button type="submit" variant="primary">
              Save question
            </s-button>
          </s-stack>
        </Form>
      </div>

      {isChoiceType(live.type) ? (
        <div className="qc-card">
          <s-heading>Answers and products</s-heading>
          <s-paragraph>
            Each answer can recommend a product. Scores add up from every answer
            the shopper picks.
          </s-paragraph>
          {question.answers.map((answer, index) => {
            const mappings = quiz.mappings.filter(
              (mapping) => mapping.answerId === answer.id,
            );
            return (
              <details
                key={answer.id}
                className="qc-edit-answer"
                open={question.answers.length === 1}
              >
                <summary>
                  <span className="qc-edit-answer-number">{index + 1}</span>
                  <span className="qc-edit-answer-label">
                    {answer.label}
                    <small>
                      {mappings.length} linked{" "}
                      {mappings.length === 1 ? "product" : "products"}
                    </small>
                  </span>
                  <span className="qc-edit-answer-toggle" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="qc-edit-answer-body">
                  <s-stack direction="block" gap="base">
                    <Form method="post">
                      <Hidden
                        pane="question"
                        questionId={question.id}
                        step={stage}
                      />
                      <input type="hidden" name="intent" value="updateAnswer" />
                      <input type="hidden" name="answerId" value={answer.id} />
                      <input
                        type="hidden"
                        name="position"
                        value={String(answer.position)}
                      />
                      <s-stack direction="block" gap="base">
                        <s-text-field
                          label="Answer"
                          name="label"
                          defaultValue={answer.label}
                          onInput={(event) =>
                            onLive({
                              ...live,
                              labels: {
                                ...live.labels,
                                [answer.id]: readField(event),
                              },
                            })
                          }
                        />
                        <s-text-field
                          label="Answer description"
                          name="description"
                          defaultValue={answer.description}
                          onInput={(event) =>
                            onLive({
                              ...live,
                              descriptions: {
                                ...live.descriptions,
                                [answer.id]: readField(event),
                              },
                            })
                          }
                        />
                        <ImagePicker
                          label="Optional answer icon or image"
                          name="imageUrl"
                          value={
                            live.answerImages[answer.id] ?? answer.imageUrl
                          }
                          imageLibrary={imageLibrary}
                          onChange={(value) =>
                            onLive({
                              ...live,
                              answerImages: {
                                ...live.answerImages,
                                [answer.id]: value,
                              },
                            })
                          }
                        />
                        <s-button type="submit">Save answer</s-button>
                      </s-stack>
                    </Form>
                    {mappings.map((mapping) => (
                      <s-grid
                        key={mapping.id}
                        gridTemplateColumns="1fr auto"
                        gap="base"
                        alignItems="center"
                      >
                        <s-text>
                          {productName.get(mapping.shopifyProductId) ??
                            "Product"}{" "}
                          · score {mapping.score}
                        </s-text>
                        <Form method="post">
                          <Hidden
                            pane="question"
                            questionId={question.id}
                            step={stage}
                          />
                          <input
                            type="hidden"
                            name="intent"
                            value="deleteMapping"
                          />
                          <input
                            type="hidden"
                            name="mappingId"
                            value={mapping.id}
                          />
                          <s-button
                            type="submit"
                            tone="critical"
                            variant="tertiary"
                          >
                            Remove
                          </s-button>
                        </Form>
                      </s-grid>
                    ))}
                    {products.length === 0 ? (
                      <s-paragraph>
                        <AppRouteLink href="/app/products">
                          Sync products
                        </AppRouteLink>{" "}
                        before linking this answer.
                      </s-paragraph>
                    ) : (
                      <Form method="post">
                        <Hidden
                          pane="question"
                          questionId={question.id}
                          step={stage}
                        />
                        <input type="hidden" name="intent" value="addMapping" />
                        <input
                          type="hidden"
                          name="answerId"
                          value={answer.id}
                        />
                        <s-stack direction="block" gap="base">
                          <s-select
                            label="Recommend this product"
                            name="shopifyProductId"
                          >
                            {products.map((product) => (
                              <s-option
                                key={product.id}
                                value={product.shopifyId}
                              >
                                {product.title}
                              </s-option>
                            ))}
                          </s-select>
                          <s-number-field
                            label="Score"
                            name="score"
                            defaultValue="10"
                            min={1}
                            max={1000}
                          />
                          <s-button type="submit" variant="primary">
                            Add product
                          </s-button>
                        </s-stack>
                      </Form>
                    )}
                    <Form method="post">
                      <Hidden
                        pane="question"
                        questionId={question.id}
                        step={stage}
                      />
                      <input type="hidden" name="intent" value="deleteAnswer" />
                      <input type="hidden" name="answerId" value={answer.id} />
                      <s-button
                        type="submit"
                        tone="critical"
                        variant="tertiary"
                      >
                        Delete answer
                      </s-button>
                    </Form>
                  </s-stack>
                </div>
              </details>
            );
          })}
          <Form method="post">
            <Hidden pane="question" questionId={question.id} step={stage} />
            <input type="hidden" name="intent" value="addAnswer" />
            <s-stack direction="block" gap="base">
              <s-text-field
                label="New answer"
                name="label"
                placeholder="Dry skin"
              />
              <s-button type="submit" variant="primary">
                Add answer
              </s-button>
            </s-stack>
          </Form>
        </div>
      ) : null}

      {otherAnswers.length > 0 ? (
        <div className="qc-card">
          <s-heading>Only show this question when</s-heading>
          {rulesHere.length === 0 ? (
            <s-paragraph color="subdued">
              With no rule, this question is shown to everyone.
            </s-paragraph>
          ) : (
            rulesHere.map((rule) => (
              <s-grid
                key={rule.id}
                gridTemplateColumns="1fr auto"
                gap="base"
                alignItems="center"
              >
                <s-text>
                  If {describeRule(rule.conditions, rule.match, quiz.questions)}
                </s-text>
                <Form method="post">
                  <Hidden
                    pane="question"
                    questionId={question.id}
                    step={stage}
                  />
                  <input type="hidden" name="intent" value="deleteRule" />
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <s-button type="submit" tone="critical" variant="tertiary">
                    Remove
                  </s-button>
                </Form>
              </s-grid>
            ))
          )}
          <Form method="post">
            <Hidden pane="question" questionId={question.id} step={stage} />
            <input type="hidden" name="intent" value="addRule" />
            <input type="hidden" name="targetQuestionId" value={question.id} />
            <s-stack direction="block" gap="base">
              <s-select label="If this answer" name="sourceAnswerId">
                {otherAnswers.map((answer) => (
                  <s-option key={answer.id} value={answer.id}>
                    {answer.questionPrompt}: {answer.label}
                  </s-option>
                ))}
              </s-select>
              <s-button type="submit">Add rule</s-button>
            </s-stack>
          </Form>
        </div>
      ) : null}

      <Form method="post">
        <Hidden pane="question" questionId={question.id} step={stage} />
        <input type="hidden" name="intent" value="deleteQuestion" />
        <s-button type="submit" tone="critical" variant="tertiary">
          Delete question
        </s-button>
      </Form>
    </div>
  );
}

function ProductsEditor({
  quiz,
  products,
  selectedId,
  settings,
  savedAt,
  aiConfigured,
  live,
  onLive,
  activeTab,
}: {
  quiz: StudioQuiz;
  products: StudioProduct[];
  selectedId: string;
  settings: AppSettings;
  savedAt: string;
  aiConfigured: boolean;
  live: Live;
  onLive: (next: Live) => void;
  activeTab: "rules" | "results";
}) {
  const [tab, setTab] = useState(activeTab);
  useEffect(() => setTab(activeTab), [activeTab]);
  const answers = quiz.questions
    .filter((question) => isChoiceType(question.type))
    .flatMap((question) =>
      question.answers.map((answer) => ({
        id: answer.id,
        label: `${question.prompt}: ${answer.label}`,
      })),
    );
  const productTitles = new Map(
    products.map((product) => [product.shopifyId, product.title]),
  );
  const answerTitles = new Map(
    answers.map((answer) => [answer.id, answer.label]),
  );

  return (
    <div className="qc-product-stage">
      <div
        className="qc-stage-tabs"
        role="tablist"
        aria-label="Final quiz setup"
      >
        <AppRouteLink
          className={tab === "rules" ? "is-active" : ""}
          href={workflowHref(quiz.id, "products", selectedId)}
          role="tab"
          aria-selected={tab === "rules"}
        >
          Product Rules
        </AppRouteLink>
        <AppRouteLink
          className={tab === "results" ? "is-active" : ""}
          href={paneHref(quiz.id, "results", selectedId)}
          role="tab"
          aria-selected={tab === "results"}
        >
          Result Page
        </AppRouteLink>
      </div>
      {tab === "results" ? (
        <ResultsEditor
          quiz={quiz}
          settings={settings}
          selectedId={selectedId}
          savedAt={savedAt}
          aiConfigured={aiConfigured}
          live={live}
          onLive={onLive}
        />
      ) : (
        <s-stack direction="block" gap="base">
          <div className="qc-card">
            <s-heading>Product recommendations</s-heading>
            <s-paragraph>
              Connect shopper answers to products. Matching scores are combined
              to choose recommendations on the results screen.
            </s-paragraph>
            {quiz.mappings.length ? (
              quiz.mappings.map((mapping) => (
                <s-grid
                  key={mapping.id}
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  alignItems="center"
                >
                  <s-text>
                    {answerTitles.get(mapping.answerId ?? "") ?? "Any answer"} →{" "}
                    {productTitles.get(mapping.shopifyProductId) ?? "Product"} ·
                    score {mapping.score}
                  </s-text>
                  <Form method="post">
                    <Hidden pane="products" questionId={selectedId} />
                    <input type="hidden" name="intent" value="deleteMapping" />
                    <input type="hidden" name="mappingId" value={mapping.id} />
                    <s-button type="submit" tone="critical" variant="tertiary">
                      Remove
                    </s-button>
                  </Form>
                </s-grid>
              ))
            ) : (
              <s-paragraph color="subdued">
                No product recommendations yet. Add a link below.
              </s-paragraph>
            )}
          </div>
          <div className="qc-card">
            <s-heading>Connect an answer to a product</s-heading>
            {!products.length ? (
              <>
                <s-paragraph color="subdued">
                  Sync products before creating recommendations.
                </s-paragraph>
                <div className="qc-prerequisite-links">
                  {!answers.length ? (
                    <AppRouteLink
                      href={workflowHref(
                        quiz.id,
                        "question1",
                        quiz.questions[0]?.id ?? "",
                      )}
                    >
                      Add answer choices
                    </AppRouteLink>
                  ) : null}
                  {!products.length ? (
                    <AppRouteLink href="/app/products">
                      Sync products
                    </AppRouteLink>
                  ) : null}
                </div>
              </>
            ) : (
              <Form method="post">
                <Hidden pane="products" questionId={selectedId} />
                <input type="hidden" name="intent" value="addMapping" />
                <s-stack direction="block" gap="base">
                  <s-select label="Answer" name="answerId">
                    <s-option value="">
                      Any answer (default recommendation)
                    </s-option>
                    {answers.map((answer) => (
                      <s-option key={answer.id} value={answer.id}>
                        {answer.label}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select label="Product" name="shopifyProductId">
                    {products.map((product) => (
                      <s-option key={product.id} value={product.shopifyId}>
                        {product.title}
                      </s-option>
                    ))}
                  </s-select>
                  <s-number-field
                    label="Recommendation score"
                    name="score"
                    defaultValue="10"
                    min={1}
                    max={1000}
                  />
                  <s-button type="submit" variant="primary">
                    Add recommendation
                  </s-button>
                </s-stack>
              </Form>
            )}
          </div>
        </s-stack>
      )}
      <div className="qc-stage-actions">
        <AppRouteLink
          href={workflowHref(quiz.id, "question2", quiz.questions[1]?.id ?? "")}
        >
          ← Back
        </AppRouteLink>
        <span className="qc-stage-complete-note">
          {tab === "results" ? "Changes save as you edit." : "Step 6 of 6"}
        </span>
      </div>
    </div>
  );
}

function ImagePicker({
  label,
  name,
  value,
  imageLibrary,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  imageLibrary: ShopifyImage[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = imageLibrary.find((image) => image.url === value);
  return (
    <div className="qc-image-picker">
      <input type="hidden" name={name} value={value} />
      <s-text>{label}</s-text>
      {selected ? (
        <img
          className="qc-image-picker-selected"
          src={selected.url}
          alt={selected.alt || label}
        />
      ) : null}
      <s-stack direction="inline" gap="base">
        <s-button type="button" onClick={() => setOpen(true)}>
          {value ? "Change image" : "Choose from Shopify Files"}
        </s-button>
        {value ? (
          <s-button
            type="button"
            variant="tertiary"
            onClick={() => onChange("")}
          >
            Remove image
          </s-button>
        ) : null}
      </s-stack>
      {open ? (
        <div className="qc-image-picker-backdrop">
          <div
            className="qc-image-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Choose ${label}`}
          >
            <s-heading>Choose an image from Shopify Files</s-heading>
            {imageLibrary.length ? (
              <div className="qc-image-picker-grid">
                {imageLibrary.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className="qc-image-picker-option"
                    onClick={() => {
                      onChange(image.url);
                      setOpen(false);
                    }}
                  >
                    <img src={image.url} alt={image.alt || "Shopify file"} />
                    <span>{image.alt || "Select image"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <s-paragraph>No images found in Shopify Files.</s-paragraph>
            )}
            <s-button
              type="button"
              variant="tertiary"
              onClick={() => setOpen(false)}
            >
              Close
            </s-button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultsEditor({
  quiz,
  settings,
  selectedId,
  savedAt,
  aiConfigured,
  live,
  onLive,
}: {
  quiz: StudioQuiz;
  settings: AppSettings;
  selectedId: string;
  savedAt: string;
  aiConfigured: boolean;
  live: Live;
  onLive: (next: Live) => void;
}) {
  const incomplete = quiz.questions.some(
    (question) => isChoiceType(question.type) && question.answers.length < 2,
  );
  return (
    <div className="qc-card">
      <s-heading>Results</s-heading>
      <Form method="post" key={`results-${savedAt}`}>
        <Hidden pane="results" questionId={selectedId} />
        <input type="hidden" name="intent" value="updateQuiz" />
        <QuizTail quiz={quiz} settings={settings} live={live} mode="results" />
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Result title"
            name="resultTitle"
            defaultValue={quiz.resultTitle}
            onInput={(event) =>
              onLive({ ...live, resultTitle: readField(event) })
            }
          />
          <s-text-area
            label="Result message"
            name="resultBody"
            defaultValue={quiz.resultBody}
            rows={3}
            onInput={(event) =>
              onLive({ ...live, resultBody: readField(event) })
            }
          />
          <s-paragraph color="subdued">
            {aiConfigured
              ? "AI only reorders products you attached to answers."
              : "Rule scores work without an AI key. Add OPENAI_API_KEY to rank with AI."}
          </s-paragraph>
          <InheritSelect
            label="AI ranking"
            name="aiEnabled"
            value={live.aiEnabled}
            onChange={(value) => onLive({ ...live, aiEnabled: value })}
          />
          <s-select
            label="Recommendation style"
            name="recommendationStyle"
            value={live.recommendationStyle}
            onChange={(event) =>
              onLive({ ...live, recommendationStyle: readField(event) })
            }
          >
            <s-option value="inherit">Use shop default</s-option>
            <s-option value="best_match">Best match</s-option>
            <s-option value="diverse">Diverse set</s-option>
          </s-select>
          <InheritSelect
            label="AI explanation"
            name="aiExplanation"
            value={live.aiExplanation}
            onChange={(value) => onLive({ ...live, aiExplanation: value })}
          />
          <s-select
            label="Result count"
            name="customMax"
            value={live.customMax}
            onChange={(event) =>
              onLive({ ...live, customMax: readField(event) })
            }
          >
            <s-option value="off">Use shop default</s-option>
            <s-option value="on">Custom</s-option>
          </s-select>
          <s-number-field
            label="Maximum products"
            name="maxRecommendations"
            defaultValue={String(
              quiz.maxRecommendations ?? settings.maxRecommendations,
            )}
            min={1}
            max={8}
          />
          <s-button type="submit" variant="primary">
            Save results
          </s-button>
        </s-stack>
      </Form>
      <s-unordered-list>
        <s-list-item>
          {quiz.questions.length > 0
            ? `${quiz.questions.length} questions`
            : "Add a question"}
        </s-list-item>
        <s-list-item>
          {incomplete
            ? "Choice questions need two answers"
            : "Answers are ready"}
        </s-list-item>
        <s-list-item>
          {quiz.mappings.length > 0
            ? `${quiz.mappings.length} product links`
            : "Link a product on an answer"}
        </s-list-item>
      </s-unordered-list>
      <s-paragraph>
        Theme handle: <s-text type="strong">{quiz.handle}</s-text>
      </s-paragraph>
      <s-paragraph>
        After publishing, add the QuizCart quiz block in Online Store → Themes →
        Customize to show this quiz to shoppers.
      </s-paragraph>
      <Form method="post">
        <Hidden pane="results" questionId={selectedId} />
        <input type="hidden" name="intent" value="deleteQuiz" />
        <s-button type="submit" tone="critical" variant="tertiary">
          Delete quiz
        </s-button>
      </Form>
    </div>
  );
}

function QuizTail({
  quiz,
  settings,
  live,
  mode,
}: {
  quiz: StudioQuiz;
  settings: AppSettings;
  live: Live;
  mode: "basics" | "welcome" | "customer" | "results";
}) {
  const fields: Record<string, string> = {
    title: live.title,
    handle: quiz.handle,
    description: live.description,
    welcomeTitle: live.welcomeTitle,
    welcomeBody: live.welcomeBody,
    welcomeImageUrl: live.welcomeImageUrl,
    startButtonText: live.startButtonText,
    showDuration: live.showDuration ? "on" : "off",
    durationText: live.durationText,
    showPersonalizedBenefit: live.showPersonalizedBenefit ? "on" : "off",
    welcomeBenefits: JSON.stringify(live.benefits),
    customerInfoTitle: live.customerInfoTitle,
    customerInfoBody: live.customerInfoBody,
    ageRangeOptions: JSON.stringify(live.ageRanges),
    collectName: tri(quiz.collectName),
    collectAge: tri(quiz.collectAge),
    nameRequired: tri(quiz.nameRequired),
    ageRequired: tri(quiz.ageRequired),
    customColors: quiz.primaryColor ? "on" : "off",
    primaryColor: quiz.primaryColor || settings.primaryColor,
    accentColor: quiz.accentColor || settings.accentColor,
    resultTitle: quiz.resultTitle,
    resultBody: quiz.resultBody,
    aiEnabled: tri(quiz.aiEnabled),
    recommendationStyle: quiz.recommendationStyle ?? "inherit",
    aiExplanation: tri(quiz.aiExplanation),
    customMax: quiz.maxRecommendations == null ? "off" : "on",
    maxRecommendations: String(
      quiz.maxRecommendations ?? settings.maxRecommendations,
    ),
  };
  const edited: Record<typeof mode, string[]> = {
    basics: [
      "title",
      "handle",
      "description",
      "startButtonText",
      "welcomeImageUrl",
    ],
    welcome: [
      "welcomeTitle",
      "welcomeBody",
      "welcomeImageUrl",
      "startButtonText",
      "showDuration",
      "durationText",
      "showPersonalizedBenefit",
      "welcomeBenefits",
      "customColors",
      "primaryColor",
      "accentColor",
    ],
    customer: [
      "customerInfoTitle",
      "customerInfoBody",
      "collectName",
      "collectAge",
      "nameRequired",
      "ageRequired",
      "ageRangeOptions",
    ],
    results: [
      "resultTitle",
      "resultBody",
      "aiEnabled",
      "recommendationStyle",
      "aiExplanation",
      "customMax",
      "maxRecommendations",
    ],
  };
  return (
    <>
      {Object.entries(fields)
        .filter(([name]) => !edited[mode].includes(name))
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
    </>
  );
}

function AddQuestionForm({
  stage,
  layout,
  formId,
}: {
  stage: "question1" | "question2";
  layout: "grid" | "list" | "auto";
  formId: string;
}) {
  const [type, setType] = useState("single");
  return (
    <Form id={formId} method="post">
      <Hidden pane="question" step={stage} />
      <input type="hidden" name="intent" value="addQuestion" />
      <input type="hidden" name="layout" value={layout} />
      <s-stack direction="block" gap="base">
        <s-text-field
          label="Question"
          name="prompt"
          placeholder="What's your goal?"
        />
        <s-select
          label="Type"
          name="type"
          value={type}
          onChange={(event) => setType(readField(event))}
        >
          {QUESTION_TYPES.map((item) => (
            <s-option key={item.value} value={item.value}>
              {item.label}
            </s-option>
          ))}
        </s-select>
        <button className="qc-next-button" type="submit">
          Add question <span>→</span>
        </button>
      </s-stack>
    </Form>
  );
}

function InheritSelect({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange?: (value: string) => void;
}) {
  return (
    <s-select
      label={label}
      name={name}
      value={value}
      onChange={onChange ? (event) => onChange(readField(event)) : undefined}
    >
      <s-option value="inherit">Use shop default</s-option>
      <s-option value="on">On</s-option>
      <s-option value="off">Off</s-option>
    </s-select>
  );
}

function Hidden({
  pane,
  questionId,
  step,
}: {
  pane: string;
  questionId?: string;
  step?: string;
}) {
  const activeStep = step ?? (pane === "question" ? "questions" : pane);
  return (
    <>
      <input type="hidden" name="pane" value={pane} />
      <input type="hidden" name="step" value={activeStep} />
      {questionId ? (
        <input type="hidden" name="questionId" value={questionId} />
      ) : null}
    </>
  );
}

function StringListEditor({
  label,
  name,
  values,
  onChange,
}: {
  label: string;
  name: "welcomeBenefits" | "ageRangeOptions";
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="qc-string-list">
      <input type="hidden" name={name} value={JSON.stringify(values)} />
      <s-text>{label}</s-text>
      {values.map((value, index) => (
        <div className="qc-string-list-row" key={`${name}-${index}`}>
          <input
            aria-label={`${label} ${index + 1}`}
            className="qc-native-input"
            value={value}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.currentTarget.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="qc-icon-button"
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(values.filter((_, item) => item !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="qc-text-button"
        onClick={() => onChange([...values, ""])}
      >
        + Add {name === "welcomeBenefits" ? "benefit" : "age option"}
      </button>
    </div>
  );
}

function liveFrom(
  quiz: StudioQuiz,
  settings: AppSettings,
  selected: StudioQuestion | undefined,
): Live {
  return {
    title: quiz.title,
    description: quiz.description,
    welcomeTitle: quiz.welcomeTitle,
    welcomeBody: quiz.welcomeBody,
    welcomeImageUrl: quiz.welcomeImageUrl,
    startButtonText: quiz.startButtonText,
    showDuration: quiz.showDuration,
    durationText: quiz.durationText,
    showPersonalizedBenefit: quiz.showPersonalizedBenefit,
    benefits: readStringList(quiz.welcomeBenefits, [
      "Takes less than 2 minutes",
      "100% personalized results",
    ]),
    customerInfoTitle: quiz.customerInfoTitle,
    customerInfoBody: quiz.customerInfoBody,
    ageRanges: readStringList(quiz.ageRangeOptions, [
      "Under 18",
      "18 - 25",
      "26 - 35",
      "36 - 45",
      "46+",
    ]),
    resultTitle: quiz.resultTitle,
    resultBody: quiz.resultBody,
    collectName: tri(quiz.collectName),
    collectAge: tri(quiz.collectAge),
    nameRequired: tri(quiz.nameRequired),
    ageRequired: tri(quiz.ageRequired),
    customColors: quiz.primaryColor ? "on" : "off",
    primaryColor: quiz.primaryColor || settings.primaryColor,
    accentColor: quiz.accentColor || settings.accentColor,
    prompt: selected?.prompt ?? "",
    helpText: selected?.helpText ?? "",
    type: selected?.type ?? "single",
    required: selected?.required ? "on" : "off",
    layout: selected?.layout ?? "auto",
    aiEnabled: tri(quiz.aiEnabled),
    recommendationStyle: quiz.recommendationStyle ?? "inherit",
    aiExplanation: tri(quiz.aiExplanation),
    customMax: quiz.maxRecommendations == null ? "off" : "on",
    labels: Object.fromEntries(
      (selected?.answers ?? []).map((answer) => [answer.id, answer.label]),
    ),
    descriptions: Object.fromEntries(
      (selected?.answers ?? []).map((answer) => [
        answer.id,
        answer.description,
      ]),
    ),
    answerImages: Object.fromEntries(
      (selected?.answers ?? []).map((answer) => [answer.id, answer.imageUrl]),
    ),
  };
}

function readStringList(value: string, fallback: string[]) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    const items = parsed.filter(
      (item): item is string => typeof item === "string",
    );
    return items.length ? items : fallback;
  } catch {
    return fallback;
  }
}

function flag(choice: string, quizValue: boolean | null, shopDefault: boolean) {
  if (choice === "on") return true;
  if (choice === "off") return false;
  return quizValue ?? shopDefault;
}

function tri(value: boolean | null) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "inherit";
}

function paneHref(quizId: string, pane: StudioPane, questionId: string) {
  const params = new URLSearchParams({ pane, step: stepForPane(pane) });
  if (questionId) params.set("question", questionId);
  return `/app/quizzes/${quizId}?${params}`;
}

function stepForPane(pane: StudioPane): StudioStep {
  if (pane === "question") return "question1";
  if (pane === "results") return "products";
  return pane;
}

function readField(event: Event) {
  const target = event.currentTarget as { value?: string };
  return target.value ?? "";
}

function checkedField(event: Event) {
  return Boolean((event.currentTarget as { checked?: boolean }).checked);
}

function previewProducts(
  mappings: { shopifyProductId: string; score: number }[],
  products: StudioProduct[],
  max: number,
) {
  const scores = new Map<string, number>();
  for (const mapping of mappings) {
    scores.set(
      mapping.shopifyProductId,
      (scores.get(mapping.shopifyProductId) ?? 0) + mapping.score,
    );
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, max)
    .flatMap(([id]) => {
      const product = products.find((item) => item.shopifyId === id);
      return product
        ? [
            {
              title: product.title,
              price: product.price,
              imageUrl: product.imageUrl,
            },
          ]
        : [];
    });
}

function describeRule(
  raw: string,
  match: string,
  questions: {
    id: string;
    prompt: string;
    answers: { id: string; label: string }[];
  }[],
) {
  const parts = parseConditions(raw).map((condition) => {
    const question = questions.find((item) => item.id === condition.questionId);
    const answer = question?.answers.find(
      (item) => item.id === condition.answerId,
    );
    return `${question?.prompt ?? "Question"} is ${answer?.label ?? "answer"}`;
  });
  return (
    parts.join(match === "any" ? " OR " : " AND ") || "the condition matches"
  );
}

export function builderStep(value: string): StudioStep {
  if (value === "logic" || value === "questions") return "question1";
  if (value === "publish" || value === "results") return "products";
  return (STEPS as readonly string[]).includes(value)
    ? (value as StudioStep)
    : "basics";
}

export function builderPane(value: string, step: string): StudioPane {
  if ((PANES as readonly string[]).includes(value)) return value as StudioPane;
  if (step === "products") return "products";
  if (step === "results") return "products";
  if (
    step === "question1" ||
    step === "question2" ||
    step === "questions" ||
    step === "logic"
  )
    return "question";
  if (step === "basics" || step === "welcome" || step === "customer")
    return step;
  return "basics";
}

function stepInfo(step: StudioStep) {
  const items: Record<string, { title: string; description: string }> = {
    basics: {
      title: "Quiz settings",
      description: "Set the basic information for your quiz.",
    },
    welcome: {
      title: "Welcome screen",
      description: "Customize the first screen that users will see.",
    },
    customer: {
      title: "Customer details",
      description: "Choose what to ask before the first question.",
    },
    question1: {
      title: "Questions",
      description: "Add product-related questions with custom options.",
    },
    question2: {
      title: "More questions",
      description: "Add more questions like concern, lifestyle, etc.",
    },
    products: {
      title: "Products & results",
      description: "Set recommendation rules and customize the final screen.",
    },
    results: {
      title: "Products & results",
      description: "Set recommendation rules and customize the final screen.",
    },
  };
  return items[step];
}

function stagePosition(step: StudioStep) {
  const normalized = step === "results" ? "products" : step;
  const index = STEPS.indexOf(normalized as (typeof STEPS)[number]);
  return Math.max(index, 0);
}

function workflowHref(
  quizId: string,
  step: (typeof STEPS)[number],
  questionId: string,
) {
  const pane = step === "question1" || step === "question2" ? "question" : step;
  const params = new URLSearchParams({ pane, step });
  if (questionId) params.set("question", questionId);
  return `/app/quizzes/${quizId}?${params}`;
}

function QuestionIcon({ kind }: { kind: "edit" | "delete" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "edit" ? (
        <>
          <path d="m16 3 5 5-12 12-6 1 1-6Z" />
          <path d="m14 5 5 5" />
        </>
      ) : (
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      )}
    </svg>
  );
}
function QuestionPopup({
  title,
  saving,
  onClose,
  children,
}: {
  title: string;
  saving: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="qc-question-dialog"
      aria-labelledby="qc-question-popup-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="qc-questions-heading">
        <h2 id="qc-question-popup-title">{title}</h2>
        <button
          type="button"
          className="qc-question-icon"
          disabled={saving}
          aria-label="Close popup"
          onClick={onClose}
        >
          ?
        </button>
      </div>
      <fieldset className="qc-question-popup-fields" disabled={saving}>
        {children}
      </fieldset>
    </dialog>
  );
}
