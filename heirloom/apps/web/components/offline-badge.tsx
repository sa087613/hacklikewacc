"use client";

import { WifiOff } from "lucide-react";
import { useDemoUser } from "@/lib/demo-user";

const LABELS: Record<string, string> = {
  database: "SQLite instead of Postgres",
  embeddings: "keyword search instead of embeddings",
  llm: "scripted mock instead of Claude",
  transcription: "typed transcripts instead of Whisper",
  storage: "local files instead of Supabase Storage",
};

/** Shown whenever any provider is running its offline implementation. */
export function OfflineBadge() {
  const { config } = useDemoUser();
  if (!config || config.offline.length === 0) return null;
  const detail = config.offline.map((k) => `${k}: ${LABELS[k] ?? "offline"}`).join("\n");
  return (
    <span
      title={detail}
      className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/30 px-2.5 py-0.5 text-xs text-white md:inline-flex"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      Demo mode: offline
    </span>
  );
}
