"use client";

import { AlertTriangle, CalendarClock, Flag } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, post, shortDate, timeAgo, type EntryView } from "@/lib/api";

export type Conflict = { topic_id: string; topic: string; team_id: string; entries: EntryView[] };
export type FlagItem = {
  id: string;
  reason: string | null;
  flagged_by: string;
  created_at: string;
  entry?: EntryView;
  answer?: { question: string; lead: string };
};

function FlagCard({ f, onDone }: { f: FlagItem; onDone: (m: string) => void }) {
  const e = f.entry;
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(e?.summary ?? "");
  const [steps, setSteps] = useState((e?.steps ?? []).join("\n"));
  const [caveats, setCaveats] = useState((e?.caveats ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);

  const fix = async () => {
    try {
      const r = await api<{ notified: number }>(`/entries/${e!.id}`, {
        method: "PUT",
        body: JSON.stringify({ summary, steps: steps.split("\n").filter(Boolean), caveats: caveats.split("\n").filter(Boolean) }),
      });
      onDone(`Entry corrected. ${r.notified} ${r.notified === 1 ? "person who received" : "people who received"} the old answer ${r.notified === 1 ? "was" : "were"} notified.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <article className="rounded-card border border-status-critical/30 bg-surface">
      <header className="flex items-center gap-2 border-b px-5 py-3 text-sm">
        <Flag className="h-4 w-4 text-status-critical" />
        <span className="font-semibold">Flagged as wrong</span>
        <span className="text-muted">
          by {f.flagged_by} · {timeAgo(f.created_at)}
        </span>
      </header>
      <div className="space-y-3 px-5 py-4 text-sm">
        <p className="font-medium">{e?.question ?? f.answer?.question}</p>
        <p className="text-muted">{e?.summary ?? f.answer?.lead}</p>
        {f.reason && <p>&ldquo;{f.reason}&rdquo;</p>}
        {editing && e && (
          <div className="space-y-2">
            <textarea value={summary} onChange={(x) => setSummary(x.target.value)} rows={3} aria-label="Corrected summary" className="w-full rounded-[6px] border px-3 py-2" />
            <textarea value={steps} onChange={(x) => setSteps(x.target.value)} rows={3} aria-label="Steps, one per line" placeholder="Steps, one per line" className="w-full rounded-[6px] border px-3 py-2" />
            <textarea value={caveats} onChange={(x) => setCaveats(x.target.value)} rows={2} aria-label="Caveats, one per line" placeholder="Caveats, one per line" className="w-full rounded-[6px] border px-3 py-2" />
          </div>
        )}
        {error && <p className="text-status-critical">{error}</p>}
        <div className="flex gap-2">
          {e &&
            (editing ? (
              <Button size="sm" onClick={fix} disabled={!summary.trim()}>
                Save correction and notify
              </Button>
            ) : (
              <Button size="sm" onClick={() => setEditing(true)}>
                Correct entry
              </Button>
            ))}
          <Button size="sm" variant="secondary" onClick={() => post(`/flags/${f.id}/dismiss`).then(() => onDone("Flag dismissed."))}>
            Dismiss
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Owner review queue beyond PRs: flags, conflicting answers, entries needing re-confirmation (§6). */
export function ReviewExtras({
  conflicts,
  flags,
  reconfirm,
  onDone,
}: {
  conflicts: Conflict[];
  flags: FlagItem[];
  reconfirm: EntryView[];
  onDone: (m: string) => void;
}) {
  return (
    <>
      {conflicts.map((c) => (
        <article key={c.topic_id} className="rounded-card border border-status-warn/50 bg-status-warn/[.04]">
          <header className="flex items-center gap-2 border-b px-5 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-status-warn" />
            <span className="font-semibold">Conflicting answers · {c.topic}</span>
            <span className="text-muted">Pick the one to keep. Heirloom never picks a winner.</span>
          </header>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {c.entries.map((e) => (
              <div key={e.id} className="space-y-2 rounded-[6px] border bg-surface p-3 text-sm">
                <p className="font-medium">{e.question}</p>
                <p>{e.summary}</p>
                <p className="text-xs text-muted">
                  Verified by {e.verified_by} · {shortDate(e.verified_at)}
                </p>
                <Button size="sm" variant="secondary" onClick={() => post(`/entries/${e.id}/keep`).then(() => onDone("Conflict resolved. The other answer is retired."))}>
                  Keep this answer
                </Button>
              </div>
            ))}
          </div>
        </article>
      ))}
      {flags.map((f) => (
        <FlagCard key={f.id} f={f} onDone={onDone} />
      ))}
      {reconfirm.map((e) => (
        <article key={e.id} className="flex flex-wrap items-center gap-3 rounded-card border bg-surface px-5 py-3 text-sm">
          <CalendarClock className="h-4 w-4 text-status-warn" />
          <div className="flex-1">
            <p className="font-medium">{e.question}</p>
            <p className="text-muted">{e.summary}</p>
          </div>
          <Badge status="warn">Needs re-confirmation · last verified {shortDate(e.verified_at)}</Badge>
          <Button size="sm" onClick={() => post(`/entries/${e.id}/reconfirm`).then(() => onDone("Re-confirmed. Expiry reset."))}>
            Re-confirm
          </Button>
        </article>
      ))}
    </>
  );
}
