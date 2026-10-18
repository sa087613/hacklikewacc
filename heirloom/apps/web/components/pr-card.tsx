"use client";

import { Check, Pencil, Play, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { formatDuration, Waveform } from "@/components/voice-input";
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

// Private = team-only, Team = other teams' Keepers can use it, Company = everyone.
const SHARE = [
  { value: "team", label: "Private" },
  { value: "cross_team", label: "Team" },
  { value: "company", label: "Company" },
];
const EXPIRY = [
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "0", label: "No expiry" },
];
const ENTRY_TYPE: Record<string, string> = { regulation: "Regulation", process: "Process", roster: "Roster", decision: "Decision" };

/** Knowledge PR (§9.4). canReview: the knowledge owner. Otherwise the expert sees their own draft. */
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
    setD({ ...d, ...patch });
    return post(`/prs/${pr.id}/edit`, patch);
  };
  const voice = d.origin?.kind === "voice";

  return (
    <article className="overflow-hidden rounded-card border border-line bg-card" aria-label={`Knowledge PR ${pr.id}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-7 py-4">
        <h2 className="text-[17px] font-semibold">
          Knowledge PR #{pr.id} · {TEAM_NAMES[pr.team_id]}
        </h2>
        {pr.exit_interview_id && <Pill tone="info">From exit interview</Pill>}
        <span className="ml-auto text-sm text-navy-600">
          Answered by {pr.proposed_by}
          {pr.asked_by && ` · asked by ${pr.asked_by}`}
        </span>
      </header>

      <div className="grid gap-6 p-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="space-y-4 rounded-[16px] bg-page p-5" aria-label={voice ? "Voice note" : "Original answer"}>
          <h3 className="font-semibold">{voice ? "Voice note" : "Original answer"}</h3>
          {voice && (
            <div className="flex items-center gap-3 text-navy-600">
              <button
                type="button"
                disabled
                title="No audio in the offline demo; the transcript is below."
                aria-label="Play voice note (no audio in the offline demo)"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white disabled:opacity-60"
              >
                <Play className="h-5 w-5" aria-hidden />
              </button>
              <Waveform />
              <span className="tabular-nums text-navy-900">{formatDuration(d.origin?.duration_s ?? 48)}</span>
            </div>
          )}
          <p className="whitespace-pre-wrap font-serif text-[17px] leading-relaxed">{d.origin?.transcript ?? d.summary}</p>
        </section>

        <section className="space-y-4" aria-label="Proposed entry">
          <h3 className="font-semibold">Proposed entry</h3>
          <p className="font-serif text-[24px] leading-snug">{d.question}</p>
          {editing ? (
            <div className="space-y-2">
              <textarea value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} rows={3} aria-label="Summary" className="w-full rounded-btn border border-line px-4 py-3" />
              <textarea
                value={d.steps.join("\n")}
                onChange={(e) => setD({ ...d, steps: e.target.value.split("\n").filter(Boolean) })}
                rows={4}
                aria-label="Steps, one per line"
                placeholder="Steps, one per line"
                className="w-full rounded-btn border border-line px-4 py-3"
              />
              <textarea
                value={d.caveats.join("\n")}
                onChange={(e) => setD({ ...d, caveats: e.target.value.split("\n").filter(Boolean) })}
                rows={2}
                aria-label="Caveats, one per line"
                placeholder="Caveats, one per line"
                className="w-full rounded-btn border border-line px-4 py-3"
              />
              <Button size="sm" disabled={busy} onClick={() => save({ summary: d.summary, steps: d.steps, caveats: d.caveats }).then(() => setEditing(false))}>
                Save edits
              </Button>
            </div>
          ) : (
            <>
              <p>{d.summary}</p>
              {d.steps.length > 0 && (
                <ol className="space-y-2">
                  {d.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pill-mute text-sm font-semibold text-pill-mute-fg">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              )}
              {d.caveats.map((c, i) => (
                <p key={i} className="rounded-btn bg-pill-warn px-4 py-2.5 text-pill-warn-fg">
                  Caveat: {c}
                </p>
              ))}
            </>
          )}
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm font-semibold">Share level</span>
              <Segmented label="Share level" value={d.share_level} disabled={!canReview} onChange={(v) => save({ share_level: v })} options={SHARE} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm font-semibold">Expiry</span>
              <Segmented
                label="Expiry"
                value={String(d.expiry_months ?? 0)}
                disabled={!canReview}
                onChange={(v) => save({ expiry_months: Number(v) || null })}
                options={EXPIRY}
              />
            </div>
            <Pill tone="mute">Type: {ENTRY_TYPE[d.entry_type] ?? d.entry_type}</Pill>
          </div>
        </section>
      </div>

      {error && <p className="px-7 pb-3 text-pill-bad-fg">{error}</p>}
      <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-page px-7 py-4">
        {canReview && (
          <Button disabled={busy} onClick={() => act(() => post(`/prs/${pr.id}/approve`), `PR #${pr.id} approved. The entry is live.`)}>
            <Check className="h-4 w-4" aria-hidden /> Approve
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => setEditing((e) => !e)}>
          <Pencil className="h-4 w-4" aria-hidden /> {editing ? "Stop editing" : "Edit"}
        </Button>
        {canReview && (
          <Button variant="secondary" disabled={busy} onClick={() => act(() => post(`/prs/${pr.id}/reject`), `PR #${pr.id} rejected. The question is open again.`)}>
            <X className="h-4 w-4" aria-hidden /> Reject
          </Button>
        )}
        {canReview && (
          <p className="text-navy-600">Approving moves Retro pay corrections from red to amber and notifies the 2 people who asked.</p>
        )}
      </footer>
    </article>
  );
}
