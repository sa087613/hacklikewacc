"use client";

import { Check, Mic, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { post, TEAM_NAMES, type TeamId } from "@/lib/api";

export type PR = {
  id: number;
  entry_id: string;
  team_id: TeamId;
  status: string;
  proposed_by: string;
  reviewer: string | null;
  asked_by: string | null;
  exit_interview_id: string | null;
  diff: {
    question: string;
    summary: string;
    steps: string[];
    caveats: string[];
    entry_type: string;
    share_level: string;
    expiry_months: number | null;
    origin?: { kind: string; duration_s?: number | null; transcript?: string };
  };
};

const fmt = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");

/** Knowledge PR review card (§9.4). canReview: knowledge owner; canEdit: owner or the expert. */
export function PrCard({ pr, canReview, onDone }: { pr: PR; canReview: boolean; onDone: (msg: string) => void }) {
  const [d, setD] = useState(pr.diff);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone(msg);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const save = (patch: Partial<PR["diff"]>) => {
    const next = { ...d, ...patch };
    setD(next);
    return post(`/prs/${pr.id}/edit`, patch);
  };
  const origin = d.origin?.kind === "voice" ? `voice note${d.origin.duration_s ? ` (${fmt(d.origin.duration_s)})` : ""}` : "typed answer";

  return (
    <article className="rounded-card border bg-surface">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="font-semibold">
          Knowledge PR #{pr.id} · {TEAM_NAMES[pr.team_id]}
        </h3>
        {pr.exit_interview_id && <Badge status="info">From exit interview</Badge>}
      </header>
      <div className="space-y-3 px-5 py-4 text-sm">
        <p>
          <span className="font-semibold">Q:</span> {d.question}
        </p>
        <p className="text-xs font-medium text-muted">
          Proposed answer (structured from {pr.proposed_by}&rsquo;s {origin}): Summary · Steps ({d.steps.length}) · Caveats ({d.caveats.length})
        </p>
        {editing ? (
          <div className="space-y-2">
            <textarea value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} rows={3} aria-label="Summary" className="w-full rounded-[6px] border px-3 py-2" />
            <textarea value={d.steps.join("\n")} onChange={(e) => setD({ ...d, steps: e.target.value.split("\n").filter(Boolean) })} rows={4} aria-label="Steps, one per line" placeholder="Steps, one per line" className="w-full rounded-[6px] border px-3 py-2" />
            <textarea value={d.caveats.join("\n")} onChange={(e) => setD({ ...d, caveats: e.target.value.split("\n").filter(Boolean) })} rows={2} aria-label="Caveats, one per line" placeholder="Caveats, one per line" className="w-full rounded-[6px] border px-3 py-2" />
            <Button size="sm" disabled={busy} onClick={() => save({ summary: d.summary, steps: d.steps, caveats: d.caveats }).then(() => setEditing(false))}>
              Save edits
            </Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-[6px] bg-surface-muted p-3">
            <p>{d.summary}</p>
            {d.steps.length > 0 && (
              <ol className="list-decimal space-y-0.5 pl-5">
                {d.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
            {d.caveats.length > 0 && (
              <ul className="space-y-0.5 text-status-warn">
                {d.caveats.map((c, i) => (
                  <li key={i}>⚠ {c}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {d.origin?.transcript && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">
              <Mic className="mr-1 inline h-3 w-3" />
              Original {d.origin.kind === "voice" ? "transcript" : "answer"}
            </summary>
            <p className="mt-1 whitespace-pre-wrap">{d.origin.transcript}</p>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            Share level
            <select
              value={d.share_level}
              disabled={!canReview}
              onChange={(e) => save({ share_level: e.target.value })}
              className="h-8 rounded-[6px] border bg-surface px-2"
            >
              <option value="team">Team only</option>
              <option value="cross_team">Cross-team</option>
              <option value="company">Company</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Expiry
            <select
              value={d.expiry_months ?? 0}
              disabled={!canReview}
              onChange={(e) => save({ expiry_months: Number(e.target.value) || null })}
              className="h-8 rounded-[6px] border bg-surface px-2"
            >
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
              <option value={0}>No expiry</option>
            </select>
          </label>
          <span className="text-xs text-muted">Type: {d.entry_type}</span>
        </div>
        <p className="text-xs text-muted">
          Answered by {pr.proposed_by} · Source: {origin}
          {pr.asked_by && ` · Asked by ${pr.asked_by}`}
        </p>
        {error && <p className="text-sm text-status-critical">{error}</p>}
        <div className="flex gap-2">
          {canReview && (
            <Button size="sm" disabled={busy} onClick={() => act(() => post(`/prs/${pr.id}/approve`), `PR #${pr.id} approved. The entry is live.`)}>
              <Check className="h-4 w-4" /> Approve
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing((e) => !e)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {canReview && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => post(`/prs/${pr.id}/reject`), `PR #${pr.id} rejected. The question is open again.`)}>
              <X className="h-4 w-4" /> Reject
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
