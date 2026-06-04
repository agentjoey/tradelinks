// Alert generation DB layer (Postgres). Cluster-aware create/merge.
import type { Item } from "@prisma/client";
import { prisma } from "../db/client.js";
import { routeAlertStatus } from "./route.js";
import type { ScoreResult } from "../ai/prompts/score.js";

export interface UpsertResult {
  alertId: string;
  created: boolean; // true only for a brand-new alert (not a cluster merge)
  status: string;
  urgencyScore: number;
}

/**
 * Create an alert from a scored item, or merge into the cluster's existing
 * alert (one alert per event-cluster). Status routed by urgency.
 * Returns the alert id + whether it was newly created (for push decisions).
 */
export async function upsertAlertForItem(item: Item, score: ScoreResult): Promise<UpsertResult | null> {
  if (!item.category) return null; // processed items always have a category; guard anyway

  // cluster already has an alert → merge this source in, keep the higher urgency
  if (item.clusterId) {
    const existing = await prisma.alert.findFirst({ where: { clusterId: item.clusterId } });
    if (existing) {
      const urgency = Math.max(existing.urgencyScore, score.urgencyScore);
      const status = existing.status === "rejected" ? "rejected" : routeAlertStatus(urgency);
      await prisma.alert.update({
        where: { id: existing.id },
        data: {
          urgencyScore: urgency,
          status,
          sourceUrls: existing.sourceUrls.includes(item.url)
            ? existing.sourceUrls
            : { set: [...existing.sourceUrls, item.url] },
        },
      });
      return { alertId: existing.id, created: false, status, urgencyScore: urgency };
    }
  }

  const status = routeAlertStatus(score.urgencyScore);
  const created = await prisma.alert.create({
    data: {
      clusterId: item.clusterId,
      title: item.titleEn ?? item.title,
      summary: item.summaryEn ?? "",
      urgencyScore: score.urgencyScore,
      regions: item.regions,
      platforms: item.platforms,
      category: item.category,
      actionRequired: score.recommendation,
      imageUrl: item.imageUrl,
      sourceUrls: [item.url],
      status,
    },
  });
  return { alertId: created.id, created: true, status, urgencyScore: score.urgencyScore };
}
