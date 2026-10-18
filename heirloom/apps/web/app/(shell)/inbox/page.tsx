"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { PrCard, type PR } from "@/components/pr-card";
import { ReviewExtras, type Conflict, type FlagItem } from "@/components/review-extras";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { VoiceInput, type VoiceNote } from "@/components/voice-input";
import { api, post, TEAM_NAMES, timeAgo, type EntryView, type Person, type TeamId } from "@/lib/api";
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
type Inbox = {
  questions: Question[];
  prs: PR[];
  conflicts: Conflict[];
  flags: FlagItem[];
  reconfirm: EntryView[];
  is_reviewer: boolean;
};
type Impact = { people_helped: number; teams_reached: number };

const ENTRY_TYPE: Record<string, string> = { regulation: "Regulation", process: "Process", roster: "Roster", decision: "Decision" };

function SavedPreview({ draft }: { draft: PR | null }) {
  const d = draft?.diff;
  return (
    <details className="rounded-[16px] border border-line" open={!!d}>
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between px-4 font-semibold">
        How this will be saved
        <ChevronDown className="h-4 w-4" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-4">
        {d ? (
          <>
            <p>{d.summary}</p>
            {d.steps.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5">
                {d.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
            {d.caveats.map((c, i) => (
              <p key={i} className="rounded-btn bg-pill-warn px-3 py-2 text-pill-warn-fg">
                Caveat: {c}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              <Pill tone="info">{ENTRY_TYPE[d.entry_type] ?? d.entry_type}</Pill>
              <Pill tone="mute">{d.expiry_months ? `Expires in ${d.expiry_months} months` : "No expiry"}</Pill>
            </div>
          </>
        ) : (
          <p className="text-navy-600">
            Heirloom turns your answer into a summary, numbered steps, and caveats, in your own words. It&rsquo;s saved as a process entry that
            expires in 6 months unless someone re-confirms it.
          </p>
        )}
      </div>
    </details>
  );
}

function Detail({ q, reviewer, onDone }: { q: Question; reviewer: string | null; onDone: (pr: PR) => void }) {
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
    <Card className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm text-navy-600">
          {q.asker ? `${q.asker} asked` : "Asked"}
          {q.via_team && ` through ${TEAM_NAMES[q.via_team].split(" &")[0]} Keeper`} · {timeAgo(q.created_at)}
        </p>
        <h2 className="font-serif text-[32px] font-medium leading-tight">{q.question}</h2>
        <div className="flex flex-wrap gap-2">
          {q.merged_count > 0 && <Pill tone="info">{q.merged_count + 1} people asked</Pill>}
          {q.status === "escalated" && <Pill tone="warn">Escalated{q.escalated_to ? ` to ${q.escalated_to}` : ""}</Pill>}
        </div>
      </div>

      {mode === "text" ? (
        <div className="space-y-2">
          <label htmlFor="answer" className="font-semibold">
            Your answer
          </label>
          <textarea
            id="answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Explain it the way you would to a new teammate."
            className="min-h-[170px] w-full rounded-btn border border-line px-4 py-3"
          />
          <Button variant="secondary" onClick={() => setMode("voice")}>
            Record a voice note instead
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-semibold">Your voice note</p>
          <VoiceInput onChange={setVoice} />
          <Button variant="quiet" onClick={() => setMode("text")}>
            Type your answer instead
          </Button>
        </div>
      )}

      <SavedPreview draft={null} />

      {error && <p className="text-pill-bad-fg">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={!ready || busy} onClick={submit}>
          {busy ? "Structuring…" : "Submit for review"}
        </Button>
        <p className="text-navy-600">{reviewer ?? "The knowledge owner"} reviews your answer before it goes live.</p>
      </div>
    </Card>
  );
}

function InboxInner() {
  const { user, version, refreshBadges } = useDemoUser();
  const params = useSearchParams();
  const [tab, setTab] = useState<"questions" | "prs">(params.get("tab") === "prs" ? "prs" : "questions");
  const [data, setData] = useState<Inbox | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<PR[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<Inbox>("/inbox").then(setData).catch(() => setData(null));
    refreshBadges();
  }, [refreshBadges]);
  useEffect(() => {
    load();
    setDrafts([]);
    setSelectedId(null);
    if (user) api<Impact>(`/people/${user.id}/impact`).then(setImpact).catch(() => setImpact(null));
  }, [load, version, user]);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const selected = questions.find((q) => q.id === selectedId) ?? questions[0] ?? null;

  useEffect(() => {
    const team = selected?.team;
    if (team && !owners[team])
      api<{ roster: Person[] }>(`/teams/${team}`).then((t) => {
        const owner = t.roster.find((p) => p.is_knowledge_owner) ?? t.roster.find((p) => p.role === "lead");
        if (owner) setOwners((o) => ({ ...o, [team]: owner.name }));
      });
  }, [selected?.team, owners]);

  const reviewCount = (data?.prs.length ?? 0) + (data?.conflicts.length ?? 0) + (data?.flags.length ?? 0) + (data?.reconfirm.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{tab === "prs" ? "Inbox: knowledge PR review" : "Inbox"}</h1>
          <p className="mt-1 text-navy-600">
            {tab === "prs" ? "Approve what's right, fix what isn't. Nothing goes live without you." : "Answer once. Heirloom remembers it for everyone who asks next."}
          </p>
        </div>
        {impact && impact.people_helped > 0 && (
          <Pill tone="ok" className="px-4 py-2 text-sm">
            <Sparkles className="h-4 w-4" aria-hidden />
            Your answers have helped {impact.people_helped} {impact.people_helped === 1 ? "person" : "people"} across {impact.teams_reached}{" "}
            {impact.teams_reached === 1 ? "team" : "teams"}
          </Pill>
        )}
      </div>

      <Segmented
        label="Inbox view"
        value={tab}
        onChange={setTab}
        options={[
          { value: "questions", label: `Questions for you${questions.length ? ` (${questions.length})` : ""}` },
          { value: "prs", label: `To review${reviewCount ? ` (${reviewCount})` : ""}` },
        ]}
      />

      {toast && (
        <p className="rounded-btn bg-pill-ok px-4 py-3 text-pill-ok-fg" role="status">
          {toast}
        </p>
      )}

      {tab === "questions" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <Card className="h-fit overflow-hidden p-0">
            <div className="flex items-center gap-2 px-6 pb-3 pt-6">
              <CardTitle>Questions for you</CardTitle>
              {questions.length > 0 && <Pill tone="count">{questions.length}</Pill>}
            </div>
            <ul className="border-t border-line">
              {questions.map((q) => (
                <li key={q.id} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    aria-current={selected?.id === q.id ? "true" : undefined}
                    onClick={() => setSelectedId(q.id)}
                    className={cn("w-full space-y-1.5 px-6 py-4 text-left", selected?.id === q.id ? "bg-pill-mute" : "hover:bg-page")}
                  >
                    <span className="line-clamp-2 block font-medium">{q.question}</span>
                    <span className="block text-sm text-navy-600">
                      {q.asker ?? "Someone"} · {timeAgo(q.created_at)}
                    </span>
                    {q.merged_count > 0 && <Pill tone="info">{q.merged_count + 1} people asked</Pill>}
                  </button>
                </li>
              ))}
              {data && questions.length === 0 && <li className="px-6 py-6 text-navy-600">No questions waiting for you.</li>}
            </ul>
          </Card>

          <div className="space-y-6">
            {drafts.map((pr) => (
              <div key={pr.id} className="space-y-3">
                <p className="text-navy-600">Sent for review. Here&rsquo;s how it will be saved; you can still edit it.</p>
                <PrCard pr={pr} canReview={false} onDone={(m) => setToast(m)} />
              </div>
            ))}
            {selected && (
              <Detail
                key={selected.id}
                q={selected}
                reviewer={owners[selected.team] ?? null}
                onDone={(pr) => {
                  setDrafts((d) => [pr, ...d]);
                  setToast(`Thanks. Your answer is now Knowledge PR #${pr.id}.`);
                  load();
                }}
              />
            )}
          </div>
        </div>
      )}

      {tab === "prs" && data && (
        <div className="space-y-6">
          {data.prs.map((pr) => (
            <PrCard key={pr.id} pr={pr} canReview={data.is_reviewer} onDone={(m) => (setToast(m), load())} />
          ))}
          {reviewCount === 0 && (
            <Card className="text-navy-600">{data.is_reviewer ? "Nothing to review." : "Knowledge PRs go to each team's knowledge owner. Nothing here for you."}</Card>
          )}
          <ReviewExtras conflicts={data.conflicts} flags={data.flags} reconfirm={data.reconfirm} onDone={(m) => (setToast(m), load())} />
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
