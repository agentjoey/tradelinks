import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PHASE1_SOURCES, PHASE1_SOURCES_BY_ID } from "../src/config/phase1-sources.js";
import {
  FetchOutcomeSchema,
  canSatisfyPrimaryEvidence,
  type SourceContract,
} from "../src/domain/intelligence/source-contract.js";
import { toFetchOutcome } from "../src/adapters/index.js";
import { parseFeed } from "../src/adapters/rss.js";
import { parseHtml } from "../src/adapters/fetch.js";
import { parseFederalRegister } from "../src/adapters/json.js";
import { SOURCES } from "../src/config/sources.js";
import type { FetchOutcome } from "../src/adapters/types.js";
import type { RawItem } from "../src/queue/schemas.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sources");

/** Parse a source's immutable fixture offline into a FetchOutcome. */
async function parseFixture(sourceId: string, fixtureFile?: string): Promise<FetchOutcome> {
  const source = PHASE1_SOURCES_BY_ID.get(sourceId);
  if (!source) throw new Error(`unknown source ${sourceId}`);
  const file = fixtureFile ?? source.fixture;
  if (!file) throw new Error(`source ${sourceId} has no fixture`);
  const body = readFileSync(join(FIXTURES_DIR, file), "utf8");
  let items: RawItem[] = [];
  if (source.fetchMethod === "RSS") {
    items = await parseFeed(body, "en");
  } else if (source.fetchMethod === "JSON") {
    items = parseFederalRegister(JSON.parse(body));
  } else if (source.fetchMethod === "HTML" || source.fetchMethod === "SCRAPER") {
    const sel = source.selectors ?? {};
    if (!sel.item || !sel.title) throw new Error(`source ${sourceId} missing selectors`);
    items = parseHtml(
      body,
      source.url,
      { itemSelector: sel.item, titleSelector: sel.title, linkSelector: sel.link },
      "en",
    );
  }
  // PAGE_DIFF: hash-only change detection, no items — a successful fetch of a
  // page with no extracted items is still `success` (never a failure).
  return FetchOutcomeSchema.parse({
    kind: "success",
    items,
    httpStatus: 200,
    contentHash: createHash("sha256").update(body).digest("hex"),
  });
}

const byId = (id: string): SourceContract => {
  const source = PHASE1_SOURCES_BY_ID.get(id);
  if (!source) throw new Error(`missing contract for ${id}`);
  return source;
};

// Every registry ID the plan lists as out of scope for Phase 1.
const OUT_OF_SCOPE_IDS = [
  "B04", "B05", "B06", "B07", "B16",
  "D04", "D05", "D06", "D07", "D11", "D12", "D20", "D21", "D22", "D23",
  "D40", "D41", "D42", "D50", "D51", "D60", "D61", "D62",
  "F04", "F05", "F09", "F10", "F13", "F14", "F15",
  "A01", "A03", "A04", "X01",
];

// The plan's exact official allowlist (id → url).
const OFFICIAL_ALLOWLIST: Record<string, string> = {
  "US-CPSC-RECALLS": "https://www.saferproducts.gov/RestWebServices/Recall?format=json",
  "US-CPSC-RSS": "https://www.cpsc.gov/Newsroom/CPSC-RSS-Feed/Recalls-RSS",
  "US-FDA-ENFORCEMENT-DISCOVERY": "https://api.fda.gov/food/enforcement.json",
  "US-FTC-CONSUMER": "https://www.ftc.gov/feeds/press-release-consumer-protection.xml",
  "US-FTC-ALL": "https://www.ftc.gov/feeds/press-release.xml",
  "US-FCC-FR":
    "https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=federal-communications-commission",
  "US-FSIS-RECALLS": "https://www.fsis.usda.gov/fsis/api/recall/v/1",
  "US-APHIS": "https://www.aphis.usda.gov/news/releases",
  A02: "https://changelog.shopify.com/feed.xml",
  "AMZ-ANNOUNCEMENTS": "https://sell.amazon.com/blog/announcements",
  "AMZ-PRICING-PAGE": "https://sell.amazon.com/pricing",
  "AMZ-BSR-PET-SUPPLIES": "https://www.amazon.com/gp/bestsellers/pet-supplies/",
  "AMZ-BSR-FASHION": "https://www.amazon.com/gp/bestsellers/fashion/",
};

describe("Phase 1 source contracts", () => {
  it("gives every enabled source an SLA and a truthful promise", () => {
    for (const source of PHASE1_SOURCES.filter((value) => value.enabled)) {
      expect(source.freshnessSlaMinutes, source.id).toBeGreaterThan(0);
      expect(source.userPromise.length, source.id).toBeGreaterThan(20);
      expect(source.degradationPolicy.length, source.id).toBeGreaterThan(20);
    }
  });

  it("has unique registry IDs", () => {
    const ids = PHASE1_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("implements the plan's exact official allowlist", () => {
    for (const [id, url] of Object.entries(OFFICIAL_ALLOWLIST)) {
      expect(byId(id).url, id).toBe(url);
    }
  });

  it("disables every out-of-scope ID and marks it UNAVAILABLE", () => {
    for (const id of OUT_OF_SCOPE_IDS) {
      const source = byId(id);
      expect(source.enabled, id).toBe(false);
      expect(source.readiness, id).toBe("UNAVAILABLE");
    }
  });

  it("keeps bot-gated / unproven demand sources UNAVAILABLE with no schedule", () => {
    for (const id of ["D01", "D03"]) {
      const source = byId(id);
      expect(source.enabled, id).toBe(false);
      expect(source.readiness, id).toBe("UNAVAILABLE");
      expect(source.refreshCron, id).toBeNull();
    }
  });

  it("keeps the new Experimental BSR IDs disabled until fixtures pass", () => {
    for (const id of ["AMZ-BSR-PET-SUPPLIES", "AMZ-BSR-FASHION"]) {
      expect(byId(id).enabled, id).toBe(false);
    }
  });

  it("never lets secondary or discovery sources claim primary evidence", () => {
    for (const source of PHASE1_SOURCES) {
      if (
        source.authorityLevel === "REPUTABLE_SECONDARY" ||
        source.authorityLevel === "COMMUNITY"
      ) {
        expect(canSatisfyPrimaryEvidence(source), source.id).toBe(false);
      }
    }
    // openFDA enforcement is discovery-only; the pricing page diff is not
    // seller-policy coverage.
    expect(canSatisfyPrimaryEvidence(byId("US-FDA-ENFORCEMENT-DISCOVERY"))).toBe(false);
    expect(canSatisfyPrimaryEvidence(byId("AMZ-PRICING-PAGE"))).toBe(false);
  });

  it("does not treat an empty official feed as a failure", async () => {
    const outcome = await parseFixture("B03", "b03-federal-register.empty.json");
    expect(outcome).toMatchObject({ kind: "success", items: [] });
  });

  it("gives every enabled source an immutable fixture that parses offline", async () => {
    for (const source of PHASE1_SOURCES.filter((value) => value.enabled)) {
      expect(source.fixture, source.id).not.toBeNull();
      expect(existsSync(join(FIXTURES_DIR, source.fixture!)), source.id).toBe(true);
      const outcome = await parseFixture(source.id);
      expect(outcome.kind, source.id).toBe("success");
      if (source.fetchMethod !== "PAGE_DIFF") {
        expect(outcome.kind === "success" && outcome.items.length, source.id).toBeGreaterThan(0);
      }
      if (outcome.kind === "success") {
        for (const item of outcome.items) {
          expect(item.url, source.id).toMatch(/^https:\/\//);
          expect(item.title.length, source.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("links the legacy registry to the contracts (single source of truth)", () => {
    for (const legacy of SOURCES) {
      const contract = PHASE1_SOURCES_BY_ID.get(legacy.id);
      expect(contract, `legacy ${legacy.id} has no Phase 1 contract`).toBeDefined();
      if (contract && !contract.enabled) {
        expect(legacy.enabled ?? true, `legacy ${legacy.id} must be disabled`).toBe(false);
      }
    }
  });
});

describe("FetchOutcome failure semantics", () => {
  it("keeps a successful empty page successful", () => {
    const outcome = toFetchOutcome(
      { ok: true, blocked: false, items: [] },
      { httpStatus: 200, body: "{}" },
    );
    expect(outcome).toMatchObject({ kind: "success", items: [], httpStatus: 200 });
    expect(outcome.kind === "success" && outcome.contentHash.length).toBeGreaterThan(0);
  });

  it("preserves blocked outcomes as non-retryable with their code", () => {
    const outcome = toFetchOutcome(
      { ok: false, blocked: true, items: [], error: "blocked: bot-wall detected" },
      { httpStatus: 403 },
    );
    expect(outcome).toMatchObject({
      kind: "blocked",
      code: "BOT_WALL",
      retryable: false,
      httpStatus: 403,
    });
  });

  it("marks 5xx/429 failures retryable and other HTTP failures non-retryable", () => {
    expect(
      toFetchOutcome({ ok: false, blocked: false, items: [], error: "HTTP 500" }, { httpStatus: 500 }),
    ).toMatchObject({ kind: "failed", code: "HTTP_500", retryable: true, httpStatus: 500 });
    expect(
      toFetchOutcome({ ok: false, blocked: false, items: [], error: "HTTP 429" }, { httpStatus: 429 }),
    ).toMatchObject({ kind: "failed", code: "HTTP_429", retryable: true });
    expect(
      toFetchOutcome({ ok: false, blocked: false, items: [], error: "HTTP 404" }, { httpStatus: 404 }),
    ).toMatchObject({ kind: "failed", code: "HTTP_404", retryable: false });
  });

  it("treats network errors as retryable fetch failures", () => {
    const outcome = toFetchOutcome(
      { ok: false, blocked: false, items: [], error: "fetch failed" },
      {},
    );
    expect(outcome).toMatchObject({ kind: "failed", code: "FETCH_ERROR", retryable: true });
  });

  it("produces schema-valid outcomes for every branch", () => {
    const outcomes = [
      toFetchOutcome({ ok: true, blocked: false, items: [] }, { httpStatus: 200, body: "x" }),
      toFetchOutcome({ ok: false, blocked: true, items: [], error: "blocked" }, { httpStatus: 403 }),
      toFetchOutcome({ ok: false, blocked: false, items: [], error: "HTTP 500" }, { httpStatus: 500 }),
    ];
    for (const outcome of outcomes) {
      expect(() => FetchOutcomeSchema.parse(outcome)).not.toThrow();
    }
  });
});
