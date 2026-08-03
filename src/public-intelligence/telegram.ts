/**
 * Phase 1 Public Intelligence — public Telegram distribution (Task 8).
 *
 * Sends only VERIFIED, current, reviewed canonical versions with
 * urgency >= 70 to the public channel, once per version per channel
 * (ChannelPush idempotency, the same tracking table BL-039 uses — a
 * `canonical:` itemId prefix keeps the two item namespaces disjoint).
 *
 * The read path is the accepted read model unchanged: searchPublicChanges
 * (verified pool) — no new query shape, no recomputed fingerprint, and the
 * permalink rendered into the message is the serializer's own bytes. The
 * send path is strictly additive over src/push/*: legacy selection,
 * rendering and gating are untouched; this module is a separate entry point
 * that reuses sendToChannel through an injectable sender so tests can
 * substitute a fake and no real send is possible in test runs.
 *
 * The message carries title, concise public impact, readiness, effective
 * date and the canonical permalink. It never carries personal impact,
 * relevance, or actions — CanonicalPublicRecord exposes no personal fields,
 * and generalActionTemplate is deliberately never rendered.
 */

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { alreadyPushedKeys, recordChannelPush } from "../push/channel-db.js";
import type { ChannelSendOpts, ChannelSendResult } from "../push/send.js";
import { resolveChannelId, sendToChannel } from "../push/send.js";
import { searchPublicChanges } from "./search.js";
import type { PublicSearchFilters } from "./search.js";
import type { CanonicalPublicRecord } from "./types.js";

/** Plan contract: only urgency >= 70 crosses into the public channel. */
export const PUBLIC_TELEGRAM_MIN_URGENCY = 70;

/** Small fixed cap per run — the channel is curated, never a firehose. */
export const PUBLIC_TELEGRAM_MAX_PER_RUN = 3;

/** ChannelPush itemType for this entry point (legacy uses alert/product). */
export const PUBLIC_TELEGRAM_ITEM_TYPE = "canonical-change";

/** Read page size: the read model's own maximum page, filtered locally. */
const READ_PAGE_SIZE = 50;

/** Stable idempotency key: one send per version per channel. */
export function publicTelegramItemId(record: Pick<CanonicalPublicRecord, "versionId">): string {
  return `canonical:${record.versionId}`;
}

/** Scope filters reuse the read model's own filter vocabulary — nothing new. */
export type PublicTelegramScope = Partial<
  Pick<PublicSearchFilters, "signal" | "platform" | "category" | "from" | "to" | "q">
>;

export type SelectPublicTelegramOpts = {
  alreadyPushed: ReadonlySet<string>;
  limit?: number;
} & PublicTelegramScope;

/**
 * Eligible public-channel records: VERIFIED (the verified pool is enforced
 * by the read model — a Monitored row cannot pass), current, reviewed,
 * urgency >= 70, not already pushed to this channel. Ordered by the read
 * model (reviewedAt desc), capped at limit.
 */
export async function selectPublicTelegramChanges(
  opts: SelectPublicTelegramOpts,
): Promise<CanonicalPublicRecord[]> {
  const limit = opts.limit ?? PUBLIC_TELEGRAM_MAX_PER_RUN;
  const page = await searchPublicChanges({
    pool: "verified",
    signal: opts.signal ?? null,
    platform: opts.platform ?? null,
    category: opts.category ?? null,
    from: opts.from ?? null,
    to: opts.to ?? null,
    q: opts.q ?? null,
    cursor: null,
    limit: READ_PAGE_SIZE,
  });
  return page.items
    .filter(
      (record) =>
        record.urgency >= PUBLIC_TELEGRAM_MIN_URGENCY &&
        !opts.alreadyPushed.has(publicTelegramItemId(record)),
    )
    .slice(0, limit);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const READINESS_LABELS: Record<CanonicalPublicRecord["readiness"], string> = {
  MONITORED: "Monitored",
  VERIFIED: "Verified",
};

/**
 * News-card caption for one canonical change. Fields: title, concise public
 * impact, readiness, effective date (when the record carries one), and the
 * canonical permalink — the serializer's own bytes, so the channel can never
 * drift from the web/RSS/API surfaces. No actions, no personal impact.
 */
export function renderPublicTelegramMessage(record: CanonicalPublicRecord): string {
  const meta = [
    `Readiness: ${READINESS_LABELS[record.readiness]}`,
    record.effectiveAt ? `Effective: ${record.effectiveAt.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    `<b>${esc(record.title)}</b>`,
    "",
    esc(record.generalImpact),
    "",
    `<i>${esc(meta)}</i>`,
    `<a href="${esc(record.permalink)}">Full record →</a>`,
  ].join("\n");
}

export type PublicTelegramSender = (
  text: string,
  opts: ChannelSendOpts,
) => Promise<ChannelSendResult>;

export type PublicTelegramPushResult = {
  posted: number;
  failed: number;
  eligible: number;
};

export type RunPublicTelegramPushOpts = {
  /** Injected in tests — the ONLY way this module sends without Telegram env. */
  sender?: PublicTelegramSender;
  /** Defaults to env.TELEGRAM_CHANNEL_ID. Run-scoped in tests. */
  channelId?: string;
  limit?: number;
} & PublicTelegramScope;

/**
 * One public-Telegram run: select → render → send → record. Idempotent per
 * version per channel; a failed send is not recorded, so the next run
 * retries it. Gated on Telegram env unless a sender is injected (tests) —
 * with no token/channel and no injected sender this is a logged no-op.
 */
export async function runPublicTelegramPush(
  opts: RunPublicTelegramPushOpts = {},
): Promise<PublicTelegramPushResult> {
  const rawChannelId = opts.channelId ?? env.TELEGRAM_CHANNEL_ID;
  const sender = opts.sender ?? sendToChannel;
  if (!rawChannelId || (!opts.sender && !env.TELEGRAM_BOT_TOKEN)) {
    logger.info("public-telegram disabled (no channel id, or no bot token without injected sender)");
    return { posted: 0, failed: 0, eligible: 0 };
  }

  const channelId = await resolveChannelId(rawChannelId);
  const alreadyPushed = await alreadyPushedKeys(
    channelId === rawChannelId ? channelId : [channelId, rawChannelId],
  );

  const batch = await selectPublicTelegramChanges({
    alreadyPushed,
    limit: opts.limit,
    signal: opts.signal,
    platform: opts.platform,
    category: opts.category,
    from: opts.from,
    to: opts.to,
    q: opts.q,
  });

  let posted = 0;
  let failed = 0;
  for (const record of batch) {
    const text = renderPublicTelegramMessage(record);
    // Tappable link preview resolves to the canonical permalink — the public
    // record, never a third-party source URL.
    const res = await sender(text, { previewUrl: record.permalink });
    if (res.status === "sent") {
      await recordChannelPush(
        PUBLIC_TELEGRAM_ITEM_TYPE,
        publicTelegramItemId(record),
        channelId,
        res.messageId,
      );
      posted++;
      logger.info({ itemId: publicTelegramItemId(record) }, "public-telegram sent");
    } else {
      failed++;
      logger.warn(
        { itemId: publicTelegramItemId(record), status: res.status },
        "public-telegram send failed",
      );
    }
  }

  const result = { posted, failed, eligible: batch.length };
  logger.info(result, "public-telegram run complete");
  return result;
}
