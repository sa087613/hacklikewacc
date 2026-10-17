"use client";

import type { EntryView } from "@/lib/api";

export type Conflict = { topic_id: string; topic: string; team_id: string; entries: EntryView[] };
export type FlagItem = {
  id: string;
  reason: string | null;
  flagged_by: string;
  created_at: string;
  entry?: EntryView;
  answer?: { question: string; lead: string };
};

/** Conflicts and flags for knowledge owners (completed in milestone 5). */
export function ReviewExtras({ conflicts, flags }: { conflicts: Conflict[]; flags: FlagItem[]; onDone: (m: string) => void }) {
  if (!conflicts.length && !flags.length) return null;
  return null;
}
