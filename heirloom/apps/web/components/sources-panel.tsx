"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { SourceRef } from "@/components/source-panel";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { api, TEAM_NAMES, type AnswerCard, type TeamId } from "@/lib/api";

type Source = { id: string; title: string; text: string; team_id: TeamId; type: string };

const CONTEXT = 160;

/** Display-only cleanup of Markdown markers; offsets of the highlighted quote are untouched. */
const plain = (t: string) => t.replace(/\*\*/g, "").replace(/^\s*(---|#+)\s*/gm, "").replace(/`/g, "");

/** Persistent sources column for an answer: pick a source, read the matched passage in context. */
export function SourcesPanel({
  card,
  selected,
  onSelect,
  onOpenFull,
}: {
  card: AnswerCard | null;
  selected: number;
  onSelect: (n: number) => void;
  onOpenFull: (s: SourceRef) => void;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const meta = card?.sources.find((s) => s.n === selected) ?? card?.sources[0];
  const cite = card?.points.flatMap((p) => p.citations).find((c) => c.source_id === meta?.source_id);

  useEffect(() => {
    setSource(null);
    if (meta) api<Source>(`/sources/${meta.source_id}`).then(setSource).catch(() => {});
  }, [meta?.source_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card || !meta || !cite) {
    return (
      <Card>
        <CardTitle>Sources</CardTitle>
        <p className="mt-2 text-navy-600">{card ? "This answer has no sources yet." : "Sources for an answer show up here, with the exact passage it quotes."}</p>
      </Card>
    );
  }
  const from = Math.max(0, cite.start - CONTEXT);
  const to = cite.end + CONTEXT;
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Sources</CardTitle>
        {card.sources.length > 1 && (
          <Segmented
            label="Choose a source"
            value={String(meta.n)}
            onChange={(v) => onSelect(Number(v))}
            options={card.sources.map((s) => ({ value: String(s.n), label: String(s.n), ariaLabel: `Source ${s.n}: ${s.title}` }))}
          />
        )}
      </div>
      <div>
        <p className="font-semibold">{meta.title}</p>
        <p className="text-sm text-navy-600">
          {TEAM_NAMES[meta.team]} · {meta.source_type.replace("_", " ")}
        </p>
      </div>
      <blockquote className="font-serif text-[19px] leading-relaxed text-navy-900">
        {source ? (
          <>
            {from > 0 && "…"}
            {plain(source.text.slice(from, cite.start))}
            <mark className="rounded bg-pill-warn px-0.5 text-navy-900">{plain(source.text.slice(cite.start, cite.end))}</mark>
            {plain(source.text.slice(cite.end, to))}
            {to < source.text.length && "…"}
          </>
        ) : (
          <mark className="rounded bg-pill-warn px-0.5 text-navy-900">{plain(cite.quote)}</mark>
        )}
      </blockquote>
      <Pill tone="ok">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Quote found in this source
      </Pill>
      <Button variant="secondary" className="w-full" onClick={() => onOpenFull({ source_id: cite.source_id, start: cite.start, end: cite.end, title: meta.title })}>
        <ExternalLink className="h-4 w-4" aria-hidden /> Open full document
      </Button>
    </Card>
  );
}
