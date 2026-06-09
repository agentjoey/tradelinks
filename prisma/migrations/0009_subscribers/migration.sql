-- prisma/migrations/0009_subscribers/migration.sql
CREATE TABLE "subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "confirmToken" TEXT NOT NULL,
    "unsubToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscribers_email_key" ON "subscribers"("email");
CREATE UNIQUE INDEX "subscribers_confirmToken_key" ON "subscribers"("confirmToken");
CREATE UNIQUE INDEX "subscribers_unsubToken_key" ON "subscribers"("unsubToken");
CREATE INDEX "subscribers_status_idx" ON "subscribers"("status");
