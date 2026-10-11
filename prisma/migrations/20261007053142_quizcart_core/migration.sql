-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "collectName" BOOLEAN NOT NULL DEFAULT true,
    "collectAge" BOOLEAN NOT NULL DEFAULT true,
    "nameRequired" BOOLEAN NOT NULL DEFAULT true,
    "ageRequired" BOOLEAN NOT NULL DEFAULT false,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recommendationStyle" TEXT NOT NULL DEFAULT 'best_match',
    "aiExplanation" BOOLEAN NOT NULL DEFAULT true,
    "maxRecommendations" INTEGER NOT NULL DEFAULT 3,
    "primaryColor" TEXT NOT NULL DEFAULT '#111827',
    "accentColor" TEXT NOT NULL DEFAULT '#008060',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#111827',
    "fontFamily" TEXT NOT NULL DEFAULT 'inherit',
    "buttonRadius" INTEGER NOT NULL DEFAULT 8,
    "showProgress" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "collectName" BOOLEAN,
    "collectAge" BOOLEAN,
    "nameRequired" BOOLEAN,
    "ageRequired" BOOLEAN,
    "aiEnabled" BOOLEAN,
    "recommendationStyle" TEXT,
    "aiExplanation" BOOLEAN,
    "maxRecommendations" INTEGER,
    "welcomeTitle" TEXT NOT NULL DEFAULT 'Let''s find your match',
    "welcomeBody" TEXT NOT NULL DEFAULT 'Answer a few questions and we''ll recommend products that fit you.',
    "resultTitle" TEXT NOT NULL DEFAULT 'Your recommended products',
    "resultBody" TEXT NOT NULL DEFAULT 'Based on your answers, here are products picked for you.',
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quiz_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "helpText" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "sliderMin" INTEGER NOT NULL DEFAULT 0,
    "sliderMax" INTEGER NOT NULL DEFAULT 100,
    "sliderStep" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LogicRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "match" TEXT NOT NULL DEFAULT 'all',
    "action" TEXT NOT NULL DEFAULT 'show',
    "targetQuestionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LogicRule_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "answerId" TEXT,
    "shopifyProductId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT "ProductMapping_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductMapping_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopifyProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "price" TEXT NOT NULL DEFAULT '',
    "defaultVariantId" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopifyProduct_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopifyVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ShopifyVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopifyProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "age" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizCustomer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'started',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "QuizSession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizSession_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "QuizCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerIds" TEXT NOT NULL DEFAULT '',
    "textValue" TEXT NOT NULL DEFAULT '',
    "numericValue" INTEGER,
    CONSTRAINT "QuizResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "price" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "rank" INTEGER NOT NULL,
    CONSTRAINT "Recommendation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "quizId" TEXT,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsEvent_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shopId_key" ON "AppSettings"("shopId");

-- CreateIndex
CREATE INDEX "Quiz_shopId_status_idx" ON "Quiz"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_shopId_handle_key" ON "Quiz"("shopId", "handle");

-- CreateIndex
CREATE INDEX "Question_quizId_position_idx" ON "Question"("quizId", "position");

-- CreateIndex
CREATE INDEX "Answer_questionId_position_idx" ON "Answer"("questionId", "position");

-- CreateIndex
CREATE INDEX "LogicRule_quizId_idx" ON "LogicRule"("quizId");

-- CreateIndex
CREATE INDEX "ProductMapping_quizId_idx" ON "ProductMapping"("quizId");

-- CreateIndex
CREATE INDEX "ProductMapping_answerId_idx" ON "ProductMapping"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProduct_shopId_shopifyId_key" ON "ShopifyProduct"("shopId", "shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyVariant_productId_shopifyId_key" ON "ShopifyVariant"("productId", "shopifyId");

-- CreateIndex
CREATE INDEX "QuizCustomer_shopId_createdAt_idx" ON "QuizCustomer"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "QuizSession_shopId_startedAt_idx" ON "QuizSession"("shopId", "startedAt");

-- CreateIndex
CREATE INDEX "QuizSession_quizId_idx" ON "QuizSession"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizResponse_sessionId_questionId_key" ON "QuizResponse"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "Recommendation_sessionId_rank_idx" ON "Recommendation"("sessionId", "rank");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_shopId_eventType_idx" ON "AnalyticsEvent"("shopId", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_quizId_eventType_idx" ON "AnalyticsEvent"("quizId", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_createdAt_idx" ON "AnalyticsEvent"("sessionId", "createdAt");
