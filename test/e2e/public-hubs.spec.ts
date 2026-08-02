import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Task 3 — real HTTP status gate for readiness-gated routes (pact contract,
 * "Scope extension — delete app/(public)/loading.tsx, add a 404 status gate").
 *
 * Locks the behaviour that a below-Monitored hub genuinely does not exist:
 * this spec must fail loudly if a `loading.tsx` (or anything else) ever sits
 * above a readiness-gated route again and turns the 404 into a soft-200.
 *
 * The spec sets the capability readiness it needs on the shared
 * non-production branch and restores the original values afterwards.
 */

const prisma = new PrismaClient();

type Readiness = "UNAVAILABLE" | "EXPERIMENTAL" | "MONITORED" | "VERIFIED" | "STALE";

const saved: Array<{ key: string; readiness: Readiness }> = [];

async function setReadiness(key: string, readiness: Readiness) {
  const before = await prisma.coverageCapability.findUniqueOrThrow({
    where: { key },
    select: { readiness: true },
  });
  saved.push({ key, readiness: before.readiness });
  await prisma.coverageCapability.update({ where: { key }, data: { readiness } });
}

test.beforeAll(async () => {
  // A renderable platform hub (owner ruling: publishes at MONITORED) and a
  // deliberately below-Monitored category hub.
  await setReadiness("platform:amazon-us", "MONITORED");
  await setReadiness("category:pet-supplies", "EXPERIMENTAL");
});

test.afterAll(async () => {
  for (const row of saved) {
    await prisma.coverageCapability
      .update({ where: { key: row.key }, data: { readiness: row.readiness } })
      .catch(() => {});
  }
  await prisma.$disconnect();
});

test("a below-Monitored category hub returns a real 404", async ({ page }) => {
  const response = await page.goto("/categories/pet-supplies");
  expect(response?.status()).toBe(404);
});

test("an unsupported recurring topic returns a real 404", async ({ page }) => {
  const response = await page.goto("/topics/listing-account-health");
  expect(response?.status()).toBe(404);
});

test("a renderable hub returns 200 with its content present", async ({ page }) => {
  const response = await page.goto("/amazon-us");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Amazon US" })).toBeVisible();
  // The incomplete-policy-coverage warning leads, above the changes list.
  await expect(page.getByText("What we can and cannot see here")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Changes on Amazon US/i })).toBeVisible();
});
