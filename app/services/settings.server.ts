import prisma from "../db.server";
import { clamp } from "../lib/quiz";

function text(form: FormData, name: string, max: number): string {
  return String(form.get(name) ?? "")
    .trim()
    .slice(0, max);
}

function flag(form: FormData, name: string): boolean {
  return form.get(name) === "on";
}

export async function updatePreferences(shopId: string, form: FormData) {
  return prisma.appSettings.update({
    where: { shopId },
    data: {
      collectName: flag(form, "collectName"),
      collectAge: flag(form, "collectAge"),
      nameRequired: flag(form, "nameRequired"),
      ageRequired: flag(form, "ageRequired"),
      aiEnabled: flag(form, "aiEnabled"),
      aiExplanation: flag(form, "aiExplanation"),
      recommendationStyle:
        form.get("recommendationStyle") === "diverse"
          ? "diverse"
          : "best_match",
      maxRecommendations: Math.round(
        clamp(Number(form.get("maxRecommendations") ?? 3) || 3, 1, 8),
      ),
    },
  });
}

export async function updateAppearance(shopId: string, form: FormData) {
  return prisma.appSettings.update({
    where: { shopId },
    data: {
      matchStoreColors: flag(form, "matchStoreColors"),
      primaryColor: color(form, "primaryColor", "#111827"),
      accentColor: color(form, "accentColor", "#008060"),
      backgroundColor: color(form, "backgroundColor", "#ffffff"),
      textColor: color(form, "textColor", "#111827"),
      fontFamily: text(form, "fontFamily", 80) || "inherit",
      buttonRadius: Math.round(
        clamp(Number(form.get("buttonRadius") ?? 8) || 0, 0, 32),
      ),
      showProgress: flag(form, "showProgress"),
    },
  });
}

function color(form: FormData, name: string, fallback: string): string {
  const value = text(form, name, 20);
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
