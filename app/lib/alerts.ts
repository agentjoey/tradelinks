import { prisma } from "../../src/db/client.js";
import type { Prisma } from "@prisma/client";

export const REGIONS = [
  "north_america", "europe", "southeast_asia", "middle_east", "latin_america", "australia_nz",
] as const;
export const CATEGORIES = [
  "regulatory", "platform_policy", "logistics", "trend", "industry", "tip",
] as const;

export interface AlertFilters {
  region?: string;
  category?: string;
  platform?: string;
  cursor?: string;
  take?: number;
}

export interface AlertRow {
  id: string;
  title: string;
  summary: string;
  urgencyScore: number;
  regions: string[];
  platforms: string[];
  category: string;
  actionRequired: string | null;
  imageUrl: string | null;
  sourceUrls: string[];
  publishedAt: Date | null;
  createdAt: Date;
}

export interface AlertPage {
  items: AlertRow[];
  nextCursor: string | null;
}

/** Published alerts, newest first, cursor-paginated. Filters are AND-combined. */
export async function getAlerts(f: AlertFilters): Promise<AlertPage> {
  const take = Math.min(Math.max(f.take ?? 40, 1), 100);
  const where: Prisma.AlertWhereInput = { status: "published" };
  if (f.region && (REGIONS as readonly string[]).includes(f.region)) {
    where.regions = { has: f.region as never };
  }
  if (f.category && (CATEGORIES as readonly string[]).includes(f.category)) {
    where.category = f.category as never;
  }
  if (f.platform) where.platforms = { has: f.platform };

  const rows = await prisma.alert.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: {
      id: true, title: true, summary: true, urgencyScore: true, regions: true,
      platforms: true, category: true, actionRequired: true, imageUrl: true, sourceUrls: true,
      publishedAt: true, createdAt: true,
    },
  });

  const hasNext = rows.length > take;
  const items = hasNext ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null };
}
