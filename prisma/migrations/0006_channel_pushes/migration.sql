-- Channel Push (BL-039): tracks items pushed to the public Telegram channel.
-- The unique constraint prevents double-push; pushedAt drives the daily budget.
CREATE TABLE "channel_pushes" (
    "id"        TEXT NOT NULL,
    "itemType"  TEXT NOT NULL,   -- "alert" | "product"
    "itemId"    TEXT NOT NULL,   -- alert.id | "bestseller:<key>" | "viral:<key>"
    "channelId" TEXT NOT NULL,   -- TELEGRAM_CHANNEL_ID at push time
    "messageId" TEXT,
    "pushedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_pushes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_pushes_itemType_itemId_channelId_key"
    ON "channel_pushes" ("itemType", "itemId", "channelId");
CREATE INDEX "channel_pushes_pushedAt_idx"
    ON "channel_pushes" ("pushedAt");
