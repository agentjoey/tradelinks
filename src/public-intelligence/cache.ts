/**
 * Phase 1 Public Intelligence cache contract.
 *
 * All public surfaces share the same tag family so a single revalidateTag
 * call evicts every cached projection of a record.
 */

export const PUBLIC_CACHE = {
  liveChangesRevalidate: 900,
  canonicalChangeRevalidate: 3600,

  tags: {
    default: ["changes"],
    changeRecord: (id: string) => `change:${id}`,
  },
} as const;
