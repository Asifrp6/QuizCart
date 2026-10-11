ALTER TABLE "Quiz" ADD COLUMN "startButtonText" TEXT NOT NULL DEFAULT 'Start Quiz';
ALTER TABLE "Quiz" ADD COLUMN "showDuration" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Quiz" ADD COLUMN "durationText" TEXT NOT NULL DEFAULT '2 minutes';
ALTER TABLE "Quiz" ADD COLUMN "showPersonalizedBenefit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Quiz" ADD COLUMN "customerInfoTitle" TEXT NOT NULL DEFAULT 'Let''s get to know you';
ALTER TABLE "Quiz" ADD COLUMN "customerInfoBody" TEXT NOT NULL DEFAULT 'This helps us find the best match for your needs.';
ALTER TABLE "Question" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'auto';
