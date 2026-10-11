import { useEffect, useRef, useState, type ReactNode } from "react";

export type PreviewAppearance = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  buttonRadius: number;
  showProgress: boolean;
};

export type PreviewQuestion = {
  prompt: string;
  helpText: string;
  type: string;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  layout?: string;
  required?: boolean;
  answers: {
    id: string;
    label: string;
    description?: string;
    imageUrl: string;
  }[];
};

export type PreviewProduct = {
  title: string;
  price: string;
  imageUrl: string;
};

export type PreviewScene = "welcome" | "about" | "question" | "results";

export function StorefrontPreview({
  scene,
  appearance,
  welcomeTitle,
  welcomeBody,
  welcomeImageUrl,
  startButtonText = "Start Quiz",
  showDuration = true,
  durationText = "2 minutes",
  showPersonalizedBenefit = true,
  welcomeBenefits = ["100% personalized results"],
  customerInfoTitle = "Let's get to know you",
  customerInfoBody = "This helps us find the best match for your needs.",
  ageRangeOptions = ["Under 18", "18 - 25", "26 - 35", "36 - 45", "46+"],
  resultTitle,
  resultBody,
  collectName,
  collectAge,
  question,
  questions,
  questionIndex,
  questionCount,
  products,
}: {
  scene: PreviewScene;
  appearance: PreviewAppearance;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeImageUrl: string;
  startButtonText?: string;
  showDuration?: boolean;
  durationText?: string;
  showPersonalizedBenefit?: boolean;
  welcomeBenefits?: string[];
  customerInfoTitle?: string;
  customerInfoBody?: string;
  ageRangeOptions?: string[];
  resultTitle: string;
  resultBody: string;
  collectName: boolean;
  collectAge: boolean;
  question: PreviewQuestion | null;
  questions?: PreviewQuestion[];
  questionIndex: number;
  questionCount: number;
  products: PreviewProduct[];
}) {
  const [interactiveScene, setInteractiveScene] = useState<PreviewScene | null>(
    null,
  );
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(questionIndex);
  const [addedProducts, setAddedProducts] = useState<string[]>([]);
  const previewQuestions = questions ?? (question ? [question] : []);
  const activeIndex = questions ? activeQuestionIndex : 0;
  const activeQuestion = previewQuestions[activeIndex] ?? question;
  const activeScene = interactiveScene ?? scene;
  const rootRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef<number | null>(null);
  const progressStep = activeScene === "welcome" ? 0 : activeScene === "about" ? 1 : activeScene === "question" ? activeIndex + 1 + Number(collectName || collectAge) : previewQuestions.length + 2;
  useEffect(() => {
    const previous = previousStep.current;
    previousStep.current = progressStep;
    const root = rootRef.current;
    if (!root || previous === null || previous === progressStep) return;
    root.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start", inline: "nearest" });
    const card = root.querySelector(".quizcart-card");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      card?.animate([
        { opacity: 0, transform: progressStep > previous ? "translateY(32px)" : "translateY(-32px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
  }, [progressStep]);
  const visibleWelcomeBenefits = welcomeBenefits.filter(
    (benefit) =>
      benefit.trim() &&
      (!showDuration || !/^takes less than 2 minutes$/i.test(benefit.trim())),
  );

  useEffect(() => {
    setInteractiveScene(null);
    setActiveQuestionIndex(questionIndex);
    setAddedProducts([]);
  }, [scene, questionIndex, question?.prompt]);

  const startPreview = () => {
    setActiveQuestionIndex(0);
    setInteractiveScene(
      collectName || collectAge
        ? "about"
        : previewQuestions.length > 0
          ? "question"
          : "results",
    );
  };
  const continuePreview = () => {
    if (activeIndex + 1 < previewQuestions.length) {
      setActiveQuestionIndex(activeIndex + 1);
    } else {
      setInteractiveScene("results");
    }
  };
  const backPreview = () => {
    if (activeIndex > 0) {
      setActiveQuestionIndex(activeIndex - 1);
    } else {
      setInteractiveScene(collectName || collectAge ? "about" : "welcome");
    }
  };

  return (
    <div className="quizcart-admin-preview">
      <div
        ref={rootRef}
        className="quizcart-root"
        style={{
          ["--qc-primary" as string]: appearance.primaryColor,
          ["--qc-accent" as string]: appearance.accentColor,
          ["--qc-bg" as string]: appearance.backgroundColor,
          ["--qc-text" as string]: appearance.textColor,
          ["--qc-radius" as string]: `${appearance.buttonRadius}px`,
          ["--qc-font" as string]: appearance.fontFamily || "inherit",
        }}
      >
        {activeScene === "welcome" ? (
          <PreviewCard branded>
            <h2>{welcomeTitle || "Find your perfect product"}</h2>
            <p className="quizcart-help">{welcomeBody}</p>
            {welcomeImageUrl ? (
              <img
                className="quizcart-welcome-image"
                src={welcomeImageUrl}
                alt=""
              />
            ) : null}
            <div className="quizcart-actions">
              <button
                type="button"
                className="quizcart-button"
                onClick={startPreview}
              >
                {startButtonText || "Start Quiz"} →
              </button>
            </div>
            {showDuration || showPersonalizedBenefit ? (
              <ul className="quizcart-points">
                {showDuration ? (
                  <li>Takes about {durationText || "2 minutes"}</li>
                ) : null}
                {showPersonalizedBenefit
                  ? visibleWelcomeBenefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))
                  : null}
              </ul>
            ) : null}
          </PreviewCard>
        ) : null}
        {activeScene === "about" ? (
          <PreviewCard>
            <QuizSteps
              current={1}
              total={Math.max(previewQuestions.length + 2, 2)}
              onBack={() => setInteractiveScene("welcome")}
            />
            <h2>{customerInfoTitle || "Let's get to know you"}</h2>
            <p className="quizcart-help">{customerInfoBody}</p>
            {collectName ? (
              <FakeField label="Your Name" placeholder="Enter your name" />
            ) : null}
            {collectAge ? <FakeAgeField options={ageRangeOptions} /> : null}
            {!collectName && !collectAge ? (
              <p className="quizcart-help">
                Shoppers go straight to the first question when name and age are
                disabled.
              </p>
            ) : null}
            <div className="quizcart-actions">
              <button
                type="button"
                className="quizcart-button"
                onClick={() =>
                  setInteractiveScene(
                    previewQuestions.length > 0 ? "question" : "results",
                  )
                }
              >
                Next →
              </button>
            </div>
          </PreviewCard>
        ) : null}
        {activeScene === "question" ? (
          <QuestionPreview
            appearance={appearance}
            key={`${activeIndex}-${activeQuestion?.prompt ?? ""}`}
            question={activeQuestion ?? null}
            questionIndex={activeIndex}
            questionCount={previewQuestions.length || questionCount}
            collectInfo={collectName || collectAge}
            onBack={backPreview}
            onContinue={continuePreview}
          />
        ) : null}
        {activeScene === "results" ? (
          <PreviewCard branded>
            <QuizSteps current={(previewQuestions.length || questionCount) + Number(collectName || collectAge) + 1} total={(previewQuestions.length || questionCount) + Number(collectName || collectAge) + 1} />
            <h2>{resultTitle || "Your Personalized Recommendations"}</h2>
            <p className="quizcart-help">{resultBody}</p>
            {products.length === 0 ? (
              <p className="quizcart-help">
                Products linked to answers show up here.
              </p>
            ) : (
              <div className="quizcart-products">
                {products.slice(0, 3).map((product, index) => (
                  <article key={product.title} className="quizcart-product">
                    {index === 0 ? (
                      <span className="quizcart-badge">Best Match</span>
                    ) : null}
                    {product.imageUrl.startsWith("https://") ? (
                      <img src={product.imageUrl} alt={product.title} />
                    ) : null}
                    <div>
                      <h3>{product.title}</h3>
                      {product.price ? <p>{product.price}</p> : null}
                      <button
                        type="button"
                        className="quizcart-button"
                        onClick={() =>
                          setAddedProducts((current) =>
                            current.includes(product.title)
                              ? current
                              : [...current, product.title],
                          )
                        }
                      >
                        {addedProducts.includes(product.title)
                          ? "Added (preview)"
                          : "Add to Cart"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="quizcart-actions">
              <button
                type="button"
                className="quizcart-button secondary"
                onClick={() => {
                  setActiveQuestionIndex(0);
                  setAddedProducts([]);
                  setInteractiveScene("welcome");
                }}
              >
                Retake Quiz
              </button>
            </div>
          </PreviewCard>
        ) : null}
      </div>
    </div>
  );
}

function QuestionPreview({
  question,
  questionIndex,
  questionCount,
  collectInfo,
  onBack,
  onContinue,
}: {
  appearance: PreviewAppearance;
  question: PreviewQuestion | null;
  questionIndex: number;
  questionCount: number;
  collectInfo: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [dropdownValue, setDropdownValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [error, setError] = useState("");
  if (!question) {
    return (
      <PreviewCard>
        <h2>Add a question</h2>
        <p className="quizcart-help">
          The question you write appears here, the same way a shopper will see
          it.
        </p>
      </PreviewCard>
    );
  }

  const last = questionIndex >= questionCount - 1;
  const choice =
    question.type === "single" ||
    question.type === "multiple" ||
    question.type === "image" ||
    question.type === "yes_no";

  return (
    <PreviewCard>
      <QuizSteps
        current={questionIndex + 1 + Number(collectInfo)}
        total={questionCount + Number(collectInfo) + 1}
        onBack={onBack}
      />
      <h2>{question.prompt || "Question"}</h2>
      {question.helpText ? (
        <p className="quizcart-help">{question.helpText}</p>
      ) : null}
      {question.type === "dropdown" ? (
        <select
          className="quizcart-field"
          value={dropdownValue}
          aria-label={question.prompt}
          onChange={(event) => setDropdownValue(event.currentTarget.value)}
        >
          <option value="">Choose one</option>
          {question.answers.map((answer) => (
            <option key={answer.id} value={answer.id}>
              {answer.label}
            </option>
          ))}
        </select>
      ) : null}
      {question.type === "slider" ? (
        <>
          <input
            className="quizcart-range"
            type="range"
            min={question.sliderMin}
            max={question.sliderMax}
            step={question.sliderStep}
            defaultValue={question.sliderMin}
            aria-label={question.prompt}
          />
          <p className="quizcart-help">
            {question.sliderMin} to {question.sliderMax}
          </p>
        </>
      ) : null}
      {question.type === "text" ? (
        <textarea
          className="quizcart-field"
          rows={4}
          placeholder="Type your answer"
          aria-label={question.prompt}
          value={textValue}
          onChange={(event) => setTextValue(event.currentTarget.value)}
        />
      ) : null}
      {choice ? (
        <div
          className={
            question.layout === "list" ||
            (question.layout !== "grid" && question.type === "multiple")
              ? "quizcart-options is-list"
              : "quizcart-options is-grid"
          }
        >
          {question.answers.map((answer) => {
            const selected = picked.includes(answer.id);
            return (
              <button
                key={answer.id}
                type="button"
                className={
                  selected ? "quizcart-option is-selected" : "quizcart-option"
                }
                onClick={() => {
                  setPicked((current) => {
                    if (question.type === "multiple") {
                      return current.includes(answer.id)
                        ? current.filter((id) => id !== answer.id)
                        : [...current, answer.id];
                    }
                    return [answer.id];
                  });
                }}
              >
                <span className="quizcart-check">✓</span>
                {answer.imageUrl.startsWith("https://") ? (
                  <img src={answer.imageUrl} alt="" />
                ) : question.type !== "multiple" ? (
                  <span className="quizcart-mark">
                    {answer.label.slice(0, 1).toUpperCase()}
                  </span>
                ) : null}
                <strong>{answer.label}</strong>
                {answer.description ? (
                  <small className="quizcart-option-description">
                    {answer.description}
                  </small>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {error ? <p className="quizcart-error">{error}</p> : null}
      <div className="quizcart-actions">
        <button
          type="button"
          className="quizcart-button"
          onClick={() => {
            const isChoice =
              question.type === "single" ||
              question.type === "multiple" ||
              question.type === "image" ||
              question.type === "yes_no";
            if (question.required && isChoice && picked.length === 0) {
              setError("Choose an answer to continue.");
              return;
            }
            if (
              question.required &&
              question.type === "dropdown" &&
              !dropdownValue
            ) {
              setError("Choose an answer to continue.");
              return;
            }
            if (
              question.required &&
              question.type === "text" &&
              !textValue.trim()
            ) {
              setError("Enter an answer to continue.");
              return;
            }
            setError("");
            onContinue();
          }}
        >
          {last ? "Get My Recommendations →" : "Next →"}
        </button>
      </div>
    </PreviewCard>
  );
}

function QuizSteps({
  current,
  total,
  onBack,
}: {
  current: number;
  total: number;
  onBack?: () => void;
}) {
  const maximum = Math.max(total, 1);
  const step = Math.min(Math.max(current, 1), maximum);
  return (
    <div className="quizcart-top">
      {onBack ? (
        <button
          type="button"
          className="quizcart-back"
          aria-label="Go back"
          onClick={onBack}
        >
          &larr;
        </button>
      ) : null}
      <div className="quizcart-progress">
        <div className="quizcart-progress-label"><span className="quizcart-step-label"><b>{String(step).padStart(2, "0")}</b><span>YOUR PROGRESS<small>Step {step} of {maximum}</small></span></span><span className="quizcart-progress-percent">{Math.round(step / maximum * 100)}<small>%</small></span></div>
        <div className="quizcart-progress-track" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={step}>
          {Array.from({ length: maximum }, (_, index) => <span key={index} className={index < step ? "is-filled" : ""} aria-hidden="true" />)}
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  branded,
  children,
}: {
  branded?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`quizcart-card ${branded ? "is-branded" : "is-step"}`}>
      {branded ? (
        <div className="quizcart-brand">
          <span className="quizcart-logo" />
          <span>QuizCart</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function FakeAgeField({ options }: { options: string[] }) {
  return (
    <label className="quizcart-field">
      <span>Your Age</span>
      <select defaultValue="" aria-label="Your age range">
        <option value="">Select your age range</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function FakeField({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="quizcart-field">
      <span>{label}</span>
      <input type="text" placeholder={placeholder} />
    </label>
  );
}
