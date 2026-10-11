import prisma from "../db.server";
import type { AppSettings, Shop } from "@prisma/client";

export type ShopWithSettings = Shop & { settings: AppSettings };

export async function ensureShop(domain: string): Promise<ShopWithSettings> {
  const shop = await prisma.shop.upsert({
    where: { domain },
    update: {},
    create: { domain },
  });

  await prisma.appSettings.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id },
  });

  return prisma.shop.findUniqueOrThrow({
    where: { id: shop.id },
    include: { settings: true },
  }) as Promise<ShopWithSettings>;
}

export function resolveCustomerFields(
  settings: AppSettings,
  quiz: {
    collectName: boolean | null;
    collectAge: boolean | null;
    nameRequired: boolean | null;
    ageRequired: boolean | null;
  },
) {
  return {
    collectName: quiz.collectName ?? settings.collectName,
    collectAge: quiz.collectAge ?? settings.collectAge,
    nameRequired: quiz.nameRequired ?? settings.nameRequired,
    ageRequired: quiz.ageRequired ?? settings.ageRequired,
  };
}

export function resolveAiSettings(
  settings: AppSettings,
  quiz: {
    aiEnabled: boolean | null;
    recommendationStyle: string | null;
    aiExplanation: boolean | null;
    maxRecommendations: number | null;
  },
) {
  return {
    aiEnabled: quiz.aiEnabled ?? settings.aiEnabled,
    recommendationStyle:
      quiz.recommendationStyle ?? settings.recommendationStyle,
    aiExplanation: quiz.aiExplanation ?? settings.aiExplanation,
    maxRecommendations: quiz.maxRecommendations ?? settings.maxRecommendations,
  };
}

export function resolveAppearance(
  settings: AppSettings,
  quiz: { primaryColor: string | null; accentColor: string | null },
) {
  return {
    matchStoreColors: settings.matchStoreColors,
    customColors: Boolean(quiz.primaryColor || quiz.accentColor),
    primaryColor: quiz.primaryColor || settings.primaryColor,
    accentColor: quiz.accentColor || settings.accentColor,
    backgroundColor: settings.backgroundColor,
    textColor: settings.textColor,
    fontFamily: settings.fontFamily,
    buttonRadius: settings.buttonRadius,
    showProgress: settings.showProgress,
  };
}
