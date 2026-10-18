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
    markRef.current?.scrollIntoView({ block: "center" }); // returns a Promise in recent Chrome; don't return it
  }, [source]);

  if (!target) return null;
  const hasSpan = source && target.start !== undefined && target.end !== undefined && target.start >= 0;
  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-line bg-card shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-line px-7 py-5">
        <div>
          <p className="text-sm text-navy-600">
            {source ? `${TEAM_NAMES[source.team_id]} · ${source.type.replace("_", " ")} · ${source.share_level.replace("_", "-")}` : "Source"}
          </p>
          <h2 className="font-serif text-2xl font-medium">{source?.title ?? target.title ?? "Loading…"}</h2>
        </div>
        <button onClick={onClose} aria-label="Close source" className="flex min-h-tap min-w-tap items-center justify-center rounded-btn hover:bg-pill-mute">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-7 py-5">
        {error && (
          <p className="flex items-center gap-2 text-sm text-pill-warn-fg">
            <Lock className="h-4 w-4" /> {error}
          </p>
        )}
        {source && (
          <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-navy-900">
            {hasSpan ? (
              <>
                {source.text.slice(0, target.start)}
                <mark ref={markRef} className="rounded bg-pill-warn px-0.5 text-navy-900">
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
