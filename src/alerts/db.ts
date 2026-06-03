// Alert generation DB layer (Postgres). Cluster-aware create/merge.
import type { Item } from "@prisma/client";
import { prisma } from "../db/client.js";
import { routeAlertStatus } from "./route.js";
import type { ScoreResult } from "../ai/prompts/score.js";

/**
 * Create an alert from a scored item, or merge into the cluster's existing
 * alert (one alert per event-cluster). Status routed by urgency.
 */
export async function upsertAlertForItem(item: Item, score: ScoreResult): Promise<void> {
  if (!item.category) return; // processed items always have a category; guard anyway

  // cluster already has an alert → merge this source in, keep the higher urgency
  if (item.clusterId) {
    const existing = await prisma.alert.findFirst({ where: { clusterId: item.clusterId } });
    if (existing) {
      const urgency = Math.max(existing.urgencyScore, score.urgencyScore);
      await prisma.alert.update({
        where: { id: existing.id },
        data: {
          urgencyScore: urgency,
          status: existing.status === "rejected" ? "rejected" : routeAlertStatus(urgency),
          sourceUrls: existing.sourceUrls.includes(item.url)
            ? existing.sourceUrls
            : { set: [...existing.sourceUrls, item.url] },
        },
      });
      return;
    }
  }

  await prisma.alert.create({
    data: {
      clusterId: item.clusterId,
      title: item.titleEn ?? item.title,
      summary: item.summaryEn ?? "",
      urgencyScore: score.urgencyScore,
      regions: item.regions,
      platforms: item.platforms,
      category: item.category,
      actionRequired: score.recommendation,
      sourceUrls: [item.url],
      status: routeAlertStatus(score.urgencyScore),
    },
  });
}
