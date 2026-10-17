"use client";

import { Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, TEAM_NAMES, type TeamId } from "@/lib/api";

export type SourceRef = { source_id: string; start?: number; end?: number; title?: string };

type Source = { id: string; title: string; text: string; team_id: TeamId; type: string; share_level: string };

/** 480px right sheet showing the original source, scrolled to the cited passage (§7, §8.5). */
export function SourcePanel({ target, onClose }: { target: SourceRef | null; onClose: () => void }) {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!target) return;
    setSource(null);
    setError(null);
    api<Source>(`/sources/${target.source_id}`)
      .then(setSource)
      .catch((e) => setError(e.message));
  }, [target]);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [source]);

  if (!target) return null;
  const hasSpan = source && target.start !== undefined && target.end !== undefined && target.start >= 0;
  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l bg-surface shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <p className="text-xs text-muted">
            {source ? `${TEAM_NAMES[source.team_id]} · ${source.type.replace("_", " ")} · ${source.share_level.replace("_", "-")}` : "Source"}
          </p>
          <h2 className="text-lg font-semibold">{source?.title ?? target.title ?? "Loading…"}</h2>
        </div>
        <button onClick={onClose} aria-label="Close source" className="rounded-[6px] p-1 hover:bg-adp-navy-50">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <p className="flex items-center gap-2 text-sm text-status-warn">
            <Lock className="h-4 w-4" /> {error}
          </p>
        )}
        {source && (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-adp-navy">
            {hasSpan ? (
              <>
                {source.text.slice(0, target.start)}
                <mark ref={markRef} className="rounded bg-status-warn/20 px-0.5 text-adp-navy">
                  {source.text.slice(target.start, target.end)}
                </mark>
                {source.text.slice(target.end)}
              </>
            ) : (
              source.text
            )}
          </pre>
        )}
      </div>
    </aside>
  );
}
