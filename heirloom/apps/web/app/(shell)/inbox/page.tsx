"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { PrCard, type PR } from "@/components/pr-card";
import { ReviewExtras, type Conflict, type FlagItem } from "@/components/review-extras";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VoiceInput, type VoiceNote } from "@/components/voice-input";
import { api, post, TEAM_NAMES, timeAgo, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  question: string;
  status: string;
  asker: string | null;
  via_team: TeamId | null;
  team: TeamId;
  created_at: string;
  merged_count: number;
  escalated_to: string | null;
  expert: string | null;
};
type Inbox = { questions: Question[]; prs: PR[]; conflicts: Conflict[]; flags: FlagItem[]; is_reviewer: boolean };

function Composer({ q, onDone }: { q: Question; onDone: (pr: PR) => void }) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const form = new FormData();
    if (mode === "text") form.set("text", text);
    else if (voice?.audio) form.set("audio", voice.audio, "voice-note.webm");
    else if (voice?.transcript) form.set("transcript", voice.transcript);
    if (mode === "voice" && voice) form.set("duration_s", String(voice.durationS));
    setBusy(true);
    setError(null);
    try {
      onDone(await post<PR>(`/inbox/${q.id}/answer`, form));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = mode === "text" ? text.trim().length > 0 : !!voice;
  return (
    <div className="space-y-3 border-t bg-surface-muted px-4 py-3">
      <div className="flex gap-2">
        <Button size="sm" variant={mode === "text" ? "primary" : "secondary"} onClick={() => setMode("text")}>
          Type answer
        </Button>
        <Button size="sm" variant={mode === "voice" ? "primary" : "secondary"} onClick={() => setMode("voice")}>
          Record voice note
        </Button>
      </div>
      {mode === "text" ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Your answer" placeholder="Your answer…" className="w-full rounded-[6px] border bg-surface px-3 py-2 text-sm" />
      ) : (
        <VoiceInput onChange={setVoice} />
      )}
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <Button size="sm" disabled={!ready || busy} onClick={submit}>
        {busy ? "Structuring…" : "Submit answer"}
      </Button>
    </div>
  );
}

function InboxInner() {
  const { user, version, refreshBadges } = useDemoUser();
  const params = useSearchParams();
  const [tab, setTab] = useState<"questions" | "prs">(params.get("tab") === "prs" ? "prs" : "questions");
  const [data, setData] = useState<Inbox | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<PR[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Inbox>("/inbox").then(setData).catch(() => setData(null));
    refreshBadges();
  }, [refreshBadges]);
  useEffect(() => {
    load();
    setDrafts([]);
  }, [load, version]);

  const reviewCount = (data?.prs.length ?? 0) + (data?.conflicts.length ?? 0) + (data?.flags.length ?? 0);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <div className="flex gap-1 border-b" role="tablist">
        {[
          ["questions", `Questions for you`, data?.questions.length ?? 0],
          ["prs", "Knowledge PRs to review", reviewCount],
        ].map(([k, label, n]) => (
          <button
            key={k as string}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k as "questions" | "prs")}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm", tab === k ? "border-adp-red font-semibold" : "border-transparent text-muted")}
          >
            {label} {Number(n) > 0 && <Badge status="count">{n}</Badge>}
          </button>
        ))}
      </div>
      {toast && (
        <p className="rounded-[6px] bg-status-good/[.1] px-3 py-2 text-sm text-status-good" role="status">
          {toast}
        </p>
      )}

      {tab === "questions" && (
        <>
          {drafts.map((pr) => (
            <div key={pr.id} className="space-y-2">
              <p className="text-sm text-muted">
                Here&rsquo;s the structured draft. Tweak it if needed; {pr.reviewer ?? "the knowledge owner"} reviews it next.
              </p>
              <PrCard pr={pr} canReview={false} onDone={(m) => setToast(m)} />
            </div>
          ))}
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Question</th>
                  <th className="px-4 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">Asked</th>
                  <th className="px-4 py-2 font-medium">Similar</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data?.questions.map((q) => (
                  <Fragment key={q.id}>
                    <tr className="border-b hover:bg-adp-navy-50">
                      <td className="px-4 py-3">
                        {q.question}
                        {q.status === "escalated" && <Badge status="warn" className="ml-2">Escalated{q.escalated_to ? ` to ${q.escalated_to}` : ""}</Badge>}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {q.via_team ? `${TEAM_NAMES[q.via_team].split(" &")[0]} Keeper` : "Direct"}
                        {q.asker && ` (for ${q.asker.split(" ")[0]})`}
                      </td>
                      <td className="px-4 py-3 text-muted">{timeAgo(q.created_at)}</td>
                      <td className="px-4 py-3 text-muted">{q.merged_count ? `${q.merged_count} merged` : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant={open === q.id ? "secondary" : "primary"} onClick={() => setOpen(open === q.id ? null : q.id)}>
                          {open === q.id ? "Close" : "Answer"}
                        </Button>
                      </td>
                    </tr>
                    {open === q.id && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <Composer
                            q={q}
                            onDone={(pr) => {
                              setOpen(null);
                              setDrafts((d) => [pr, ...d]);
                              setToast(`Answer structured into Knowledge PR #${pr.id}.`);
                              load();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {data && data.questions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      No questions waiting for {user?.name.split(" ")[0] ?? "you"}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === "prs" && data && (
        <div className="space-y-4">
          {!data.is_reviewer && data.prs.length === 0 && (
            <Card className="text-sm text-muted">Knowledge PRs go to each team&rsquo;s knowledge owner. Nothing here for you.</Card>
          )}
          {data.prs.map((pr) => (
            <PrCard key={pr.id} pr={pr} canReview={data.is_reviewer} onDone={(m) => (setToast(m), load())} />
          ))}
          {data.is_reviewer && data.prs.length === 0 && <Card className="text-sm text-muted">No knowledge PRs waiting.</Card>}
          <ReviewExtras conflicts={data.conflicts} flags={data.flags} onDone={(m) => (setToast(m), load())} />
        </div>
      )}
    </div>
  );
}


export default function InboxPage() {
  return (
    <Suspense>
      <InboxInner />
    </Suspense>
  );
}
