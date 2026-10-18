"use client";

import { AlertTriangle, CalendarClock, Flag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
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
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="bad">
          <Flag className="h-3.5 w-3.5" aria-hidden /> Flagged as wrong
        </Pill>
        <span className="text-sm text-navy-600">
          by {f.flagged_by} · {timeAgo(f.created_at)}
        </span>
      </div>
      <p className="font-serif text-[22px] leading-snug">{e?.question ?? f.answer?.question}</p>
      <p className="text-navy-600">{e?.summary ?? f.answer?.lead}</p>
      {f.reason && <p>&ldquo;{f.reason}&rdquo;</p>}
      {editing && e && (
        <div className="space-y-2">
          <textarea value={summary} onChange={(x) => setSummary(x.target.value)} rows={3} aria-label="Corrected summary" className="w-full rounded-btn border border-line px-4 py-3" />
          <textarea value={steps} onChange={(x) => setSteps(x.target.value)} rows={3} aria-label="Steps, one per line" placeholder="Steps, one per line" className="w-full rounded-btn border border-line px-4 py-3" />
          <textarea value={caveats} onChange={(x) => setCaveats(x.target.value)} rows={2} aria-label="Caveats, one per line" placeholder="Caveats, one per line" className="w-full rounded-btn border border-line px-4 py-3" />
        </div>
      )}
      {error && <p className="text-pill-bad-fg">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {e &&
          (editing ? (
            <Button onClick={fix} disabled={!summary.trim()}>
              Save correction and notify
            </Button>
          ) : (
            <Button onClick={() => setEditing(true)}>Correct entry</Button>
          ))}
        <Button variant="secondary" onClick={() => post(`/flags/${f.id}/dismiss`).then(() => onDone("Flag dismissed."))}>
          Dismiss
        </Button>
      </div>
    </Card>
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
        <Card key={c.topic_id} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="warn">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Conflicting answers
            </Pill>
            <span className="font-semibold">{c.topic}</span>
          </div>
          <p className="text-navy-600">Pick the one to keep. Heirloom never picks a winner.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {c.entries.map((e) => (
              <div key={e.id} className="space-y-3 rounded-[16px] bg-page p-5">
                <p className="font-semibold">{e.question}</p>
                <p>{e.summary}</p>
                <p className="text-sm text-navy-600">
                  Verified by {e.verified_by} · {shortDate(e.verified_at)}
                </p>
                <Button variant="secondary" onClick={() => post(`/entries/${e.id}/keep`).then(() => onDone("Conflict resolved. The other answer is retired."))}>
                  Keep this answer
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {flags.map((f) => (
        <FlagCard key={f.id} f={f} onDone={onDone} />
      ))}
      {reconfirm.map((e) => (
        <Card key={e.id} className="flex flex-wrap items-center gap-4">
          <CalendarClock className="h-5 w-5 text-pill-warn-fg" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{e.question}</p>
            <p className="text-navy-600">{e.summary}</p>
          </div>
          <Pill tone="warn">Needs re-confirmation · last verified {shortDate(e.verified_at)}</Pill>
          <Button onClick={() => post(`/entries/${e.id}/reconfirm`).then(() => onDone("Re-confirmed. Expiry reset."))}>Re-confirm</Button>
        </Card>
      ))}
    </>
  );
}
