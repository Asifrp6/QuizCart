export const QUESTION_TYPES = [
  { value: "single", label: "Single choice" },
  { value: "multiple", label: "Multiple choice" },
  { value: "image", label: "Image choice" },
  { value: "dropdown", label: "Dropdown" },
  { value: "yes_no", label: "Yes / No" },
  { value: "slider", label: "Slider" },
  { value: "text", label: "Text input" },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]["value"];

const CHOICE_TYPES = new Set<QuestionType>([
  "single",
  "multiple",
  "image",
  "dropdown",
  "yes_no",
]);

export function isChoiceType(type: string): boolean {
  return CHOICE_TYPES.has(type as QuestionType);
}

export function isSingleChoice(type: string): boolean {
  return type !== "multiple";
}

export function questionTypeLabel(type: string): string {
  return QUESTION_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "quiz";
}

export const EVENT_LABELS: Record<string, string> = {
  quiz_viewed: "Quiz viewed",
  quiz_started: "Quiz started",
  customer_info_submitted: "Customer info submitted",
  question_viewed: "Question viewed",
  question_answered: "Question answered",
  quiz_completed: "Quiz completed",
  recommendations_viewed: "Recommendations viewed",
  product_clicked: "Product viewed",
  add_to_cart: "Added to cart",
};

export const STOREFRONT_EVENTS = new Set([
  "quiz_viewed",
  "question_viewed",
  "product_clicked",
  "add_to_cart",
]);

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatWhen(value: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function metadataPrompt(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return "";
    const metadata = parsed as Record<string, unknown>;
    return String(metadata.prompt ?? metadata.title ?? "");
  } catch {
    return "";
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
