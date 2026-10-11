import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundaryHeaders } from "../headers.server";
import { appRedirect } from "../lib/app-redirect.server";
import { ensureShop } from "../services/shop.server";
import { listProducts } from "../services/products.server";
import {
  addAnswer,
  addMapping,
  addQuestion,
  addRule,
  deleteAnswer,
  deleteMapping,
  deleteQuestion,
  deleteQuiz,
  deleteRule,
  getQuiz,
  moveQuestion,
  QuizError,
  setQuizStatus,
  updateAnswer,
  updateQuestion,
  updateQuiz,
} from "../services/quiz.server";
import { clamp } from "../lib/quiz";
import studioStyles from "../components/quiz-studio.css?url";
import editorStyles from "../quiz-editor.css?url";

export const links = () => [
  { rel: "stylesheet", href: studioStyles },
  { rel: "stylesheet", href: editorStyles },
];
import { useAdminNotice } from "../components/admin-ui";
import {
  QuizStudio,
  builderPane,
  builderStep,
} from "../components/quiz-studio";

const ERRORS: Record<string, string> = {
  "invalid-order":
    "Keep questions used in branching rules before the questions they control. Remove the rule first to change this order.",
  "missing-title": "Add a quiz title.",
  "missing-prompt": "Add question text.",
  "missing-answer": "Add answer text.",
  "missing-question": "That question is no longer on this quiz.",
  "need-question": "Add at least one question before publishing.",
  "incomplete-questions":
    "Choice questions need at least two answers before publishing.",
  "too-many-questions": "A quiz can have up to 30 questions.",
  "too-many-answers": "A question can have up to 12 answers.",
  "too-many-mappings": "This quiz has the maximum number of product mappings.",
  "invalid-rule": "Choose different questions and answers for that rule.",
  "invalid-mapping": "Choose an answer on this quiz.",
  "need-products": "Sync products before mapping them.",
  "need-mappings": "Connect at least one product before publishing.",
  "invalid-options": "Enter valid welcome benefits and age ranges.",
};

const NOTICES: Record<string, string> = {
  duplicated: "Quiz duplicated as a draft",
  reordered: "Question order updated",
  saved: "Quiz saved",
  created: "Quiz created",
  published: "Quiz published",
  unpublished: "Quiz moved to drafts",
  added: "Saved",
  deleted: "Deleted",
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const quiz = await getQuiz(shop.id, params.id || "");
  const products = await listProducts(shop.id);
  let imageLibrary: ShopifyImage[] = [];
  let imageLibraryUnavailable = false;
  try {
    imageLibrary = await getImageLibrary(admin);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("QuizCart image library failed", error);
    imageLibraryUnavailable = true;
  }
  const url = new URL(request.url);
  const requestedStep = builderStep(
    url.searchParams.get("step") ?? url.searchParams.get("pane") ?? "",
  );
  const selected =
    quiz.questions.find(
      (question) => question.id === url.searchParams.get("question"),
    ) ??
    (requestedStep === "question2" ? quiz.questions[1] : quiz.questions[0]) ??
    null;
  return {
    quiz,
    products,
    imageLibrary,
    imageLibraryUnavailable,
    selectedId: selected?.id ?? "",
    settings: shop.settings,
    notice: NOTICES[url.searchParams.get("notice") ?? ""] ?? null,
    error: ERRORS[url.searchParams.get("error") ?? ""] ?? null,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    pane: builderPane(url.searchParams.get("pane") ?? "", requestedStep),
    step: requestedStep,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const quizId = params.id || "";
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const questionId = String(form.get("questionId") ?? "");
  const step = builderStep(String(form.get("step") ?? ""));
  const pane = builderPane(String(form.get("pane") ?? ""), step);
  const go = (values: {
    notice?: string;
    error?: string;
    question?: string;
    step?: string;
    pane?: string;
  }) => {
    const nextStep = values.step ?? step;
    const nextPane =
      values.pane ?? (values.step ? builderPane("", values.step) : pane);
    return appRedirect(
      request,
      back(quizId, {
        ...values,
        step: nextStep,
        pane: nextPane,
        question: values.question ?? questionId,
      }),
    );
  };

  try {
    switch (intent) {
      case "moveQuestion":
        await moveQuestion(
          shop.id,
          quizId,
          questionId,
          String(form.get("direction") ?? ""),
          String(form.get("targetQuestionId") ?? ""),
        );
        return go({ notice: "reordered", question: questionId });
      case "updateQuiz":
        await updateQuiz(shop.id, quizId, quizInput(form));
        {
          const requestedNextStep = String(form.get("nextStep") ?? "");
          const nextStep = [
            "basics",
            "welcome",
            "customer",
            "question1",
            "question2",
            "products",
          ].includes(requestedNextStep)
            ? requestedNextStep
            : undefined;
          return go({ notice: "saved", step: nextStep });
        }
      case "publish":
        await setQuizStatus(shop.id, quizId, "published");
        return go({ notice: "published", question: questionId });
      case "unpublish":
        await setQuizStatus(shop.id, quizId, "draft");
        return go({ notice: "unpublished", question: questionId });
      case "deleteQuiz":
        await deleteQuiz(shop.id, quizId);
        return appRedirect(request, "/app/quizzes?notice=deleted");
      case "addQuestion": {
        const prompt = String(form.get("prompt") ?? "").trim();
        const requestedNextStep = String(form.get("nextStep") ?? "");
        const nextStep =
          requestedNextStep ===
          (step === "question1" ? "question2" : "products")
            ? requestedNextStep
            : undefined;

        if (!prompt && nextStep) return go({ step: nextStep });

        const question = await addQuestion(
          shop.id,
          quizId,
          prompt,
          String(form.get("type") ?? "single"),
          String(form.get("layout") ?? "auto"),
        );
        return go({
          notice: "added",
          question: nextStep === "question2" ? "" : question.id,
          step: nextStep,
        });
      }
      case "updateQuestion":
        await updateQuestion(shop.id, quizId, questionId, {
          prompt: String(form.get("prompt") ?? ""),
          helpText: String(form.get("helpText") ?? ""),
          type: String(form.get("type") ?? "single"),
          required: form.get("required") === "on",
          position: Number(form.get("position") ?? 0),
          sliderMin: Number(form.get("sliderMin") ?? 0),
          sliderMax: Number(form.get("sliderMax") ?? 100),
          sliderStep: Number(form.get("sliderStep") ?? 1),
          layout: String(form.get("layout") ?? "auto"),
        });
        {
          const requestedNextStep = String(form.get("nextStep") ?? "");
          const nextStep =
            requestedNextStep ===
            (step === "question1" ? "question2" : "products")
              ? requestedNextStep
              : undefined;
          return go({
            notice: "saved",
            question: nextStep === "question2" ? "" : questionId,
            step: nextStep,
          });
        }
      case "deleteQuestion":
        await deleteQuestion(shop.id, quizId, questionId);
        return go({ notice: "deleted" });
      case "addAnswer":
        await addAnswer(
          shop.id,
          quizId,
          questionId,
          String(form.get("label") ?? ""),
        );
        return go({ notice: "added", question: questionId });
      case "updateAnswer":
        await updateAnswer(
          shop.id,
          quizId,
          String(form.get("answerId") ?? ""),
          {
            label: String(form.get("label") ?? ""),
            description: String(form.get("description") ?? ""),
            imageUrl: String(form.get("imageUrl") ?? ""),
            position: Number(form.get("position") ?? 0),
          },
        );
        return go({ notice: "saved", question: questionId });
      case "deleteAnswer":
        await deleteAnswer(shop.id, quizId, String(form.get("answerId") ?? ""));
        return go({ notice: "deleted", question: questionId });
      case "addRule":
        await addRule(shop.id, quizId, {
          answerId: String(form.get("sourceAnswerId") ?? ""),
          answerId2: String(form.get("sourceAnswerId2") ?? ""),
          match: String(form.get("match") ?? "all"),
          targetQuestionId: String(form.get("targetQuestionId") ?? ""),
        });
        return go({ notice: "added", question: questionId });
      case "deleteRule":
        await deleteRule(shop.id, quizId, String(form.get("ruleId") ?? ""));
        return go({ notice: "deleted", question: questionId });
      case "addMapping":
        await addMapping(shop.id, quizId, {
          answerId: String(form.get("answerId") ?? ""),
          shopifyProductId: String(form.get("shopifyProductId") ?? ""),
          score: Number(form.get("score") ?? 10),
        });
        return go({ notice: "added", question: questionId });
      case "deleteMapping":
        await deleteMapping(
          shop.id,
          quizId,
          String(form.get("mappingId") ?? ""),
        );
        return go({ notice: "deleted", question: questionId });
      default:
        return go({ error: "missing-question", question: questionId });
    }
  } catch (error) {
    if (error instanceof QuizError) {
      return go({ error: error.code, question: questionId });
    }
    if (error instanceof Response) throw error;
    throw error;
  }
};

function back(
  quizId: string,
  values: {
    notice?: string;
    error?: string;
    question?: string;
    step?: string;
    pane?: string;
  },
) {
  const params = new URLSearchParams();
  if (values.notice) params.set("notice", values.notice);
  if (values.error) params.set("error", values.error);
  if (values.question) params.set("question", values.question);
  if (values.step) params.set("step", values.step);
  if (values.pane) params.set("pane", values.pane);
  const qs = params.toString();
  return `/app/quizzes/${quizId}${qs ? `?${qs}` : ""}`;
}

function quizInput(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    handle: String(form.get("handle") ?? ""),
    description: String(form.get("description") ?? ""),
    welcomeTitle: String(form.get("welcomeTitle") ?? ""),
    welcomeBody: String(form.get("welcomeBody") ?? ""),
    welcomeImageUrl: String(form.get("welcomeImageUrl") ?? ""),
    startButtonText: String(form.get("startButtonText") ?? ""),
    showDuration: form.get("showDuration") === "on",
    durationText: String(form.get("durationText") ?? ""),
    showPersonalizedBenefit: form.get("showPersonalizedBenefit") === "on",
    welcomeBenefits: parseStringArray(form.get("welcomeBenefits")),
    customerInfoTitle: String(form.get("customerInfoTitle") ?? ""),
    customerInfoBody: String(form.get("customerInfoBody") ?? ""),
    ageRangeOptions: parseStringArray(form.get("ageRangeOptions")),
    resultTitle: String(form.get("resultTitle") ?? ""),
    resultBody: String(form.get("resultBody") ?? ""),
    collectName: optionalBool(form, "collectName"),
    collectAge: optionalBool(form, "collectAge"),
    nameRequired: optionalBool(form, "nameRequired"),
    ageRequired: optionalBool(form, "ageRequired"),
    aiEnabled: optionalBool(form, "aiEnabled"),
    recommendationStyle: optionalChoice(form, "recommendationStyle", [
      "best_match",
      "diverse",
    ]),
    aiExplanation: optionalBool(form, "aiExplanation"),
    maxRecommendations:
      form.get("customMax") === "on"
        ? Math.round(
            clamp(Number(form.get("maxRecommendations") ?? 3) || 3, 1, 8),
          )
        : null,
    primaryColor:
      form.get("customColors") === "on" ? hex(form, "primaryColor") : null,
    accentColor:
      form.get("customColors") === "on" ? hex(form, "accentColor") : null,
  };
}

function parseStringArray(value: FormDataEntryValue | null) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    throw new QuizError("invalid-options");
  }
}

const IMAGE_LIBRARY_QUERY = `#graphql
  query QuizImageLibrary {
    files(first: 50, query: "media_type:IMAGE") {
      nodes {
        ... on MediaImage {
          id
          alt
          image {
            url
          }
        }
      }
    }
  }
`;

type ShopifyImage = { id: string; alt: string; url: string };

async function getImageLibrary(admin: {
  graphql: (query: string) => Promise<{ json: () => Promise<unknown> }>;
}): Promise<ShopifyImage[]> {
  const response = await admin.graphql(IMAGE_LIBRARY_QUERY);
  const json = (await response.json()) as {
    data?: {
      files?: {
        nodes: {
          id: string;
          alt: string | null;
          image: { url: string } | null;
        }[];
      };
    };
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    throw new Error(
      `Could not load Shopify Files: ${json.errors.map((error) => error.message).join(", ")}`,
    );
  }
  const nodes = json.data?.files?.nodes;
  if (!nodes) throw new Error("Shopify did not return the Files library.");
  return nodes.flatMap((node) =>
    node.image?.url
      ? [{ id: node.id, alt: node.alt ?? "", url: node.image.url }]
      : [],
  );
}

function optionalBool(form: FormData, name: string): boolean | null {
  const value = String(form.get(name) ?? "inherit");
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

function optionalChoice(form: FormData, name: string, allowed: string[]) {
  const value = String(form.get(name) ?? "inherit");
  return allowed.includes(value) ? value : null;
}

function hex(form: FormData, name: string) {
  const value = String(form.get(name) ?? "");
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

export default function QuizBuilder() {
  const data = useLoaderData<typeof loader>();
  useAdminNotice(data.notice);
  return (
    <>
      {data.imageLibraryUnavailable ? (
        <s-banner tone="warning" heading="Image library unavailable">
          You can keep editing your quiz. Reload to retry Shopify Files, or use
          an image URL.
        </s-banner>
      ) : null}
      <QuizStudio
        quiz={data.quiz}
        products={data.products}
        imageLibrary={data.imageLibrary}
        selectedId={data.selectedId}
        settings={data.settings}
        error={data.error}
        aiConfigured={data.aiConfigured}
        pane={data.pane}
        step={data.step}
      />
    </>
  );
}

export const headers: HeadersFunction = boundaryHeaders;
