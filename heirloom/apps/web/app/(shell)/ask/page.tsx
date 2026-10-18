"use client";

import { SendHorizonal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AnswerCard } from "@/components/answer-card";
import { SourcePanel, type SourceRef } from "@/components/source-panel";
import { SourcesPanel } from "@/components/sources-panel";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { askStream, KEEPER_NAMES, type AnswerCard as AnswerCardT, type TeamId, type TraceStep } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Turn = { id: number; question: string; team: TeamId; steps: TraceStep[]; card: AnswerCardT | null; error?: string };

const KEEPERS: { value: TeamId; label: string }[] = [
  { value: "time", label: "Time" },
  { value: "payroll", label: "Payroll" },
  { value: "benefits", label: "Benefits" },
];

function AskInner() {
  const { user, refreshBadges } = useDemoUser();
  const params = useSearchParams();
  const [team, setTeam] = useState<TeamId | null>(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [sourceN, setSourceN] = useState(1);
  const [sheet, setSheet] = useState<SourceRef | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);

  const agentTeam: TeamId | null = team ?? user?.team_id ?? null;

  const ask = async (question: string) => {
    if (!question.trim() || !agentTeam || busy) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, question, team: agentTeam, steps: [], card: null }]);
    setSelected(id);
    setSourceN(1);
    setInput("");
    setBusy(true);
    const update = (fn: (t: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === id ? fn(t) : t)));
    try {
      await askStream(question, agentTeam, (e) => {
        if (e.type === "status") update((t) => ({ ...t, steps: [...t.steps, e] }));
        else if (e.type === "card") update((t) => ({ ...t, card: e.card }));
        else if (e.type === "error") update((t) => ({ ...t, error: e.message }));
      });
    } catch (err) {
      update((t) => ({ ...t, error: String(err) }));
    } finally {
      setBusy(false);
      refreshBadges();
    }
  };

  useEffect(() => {
    const q = params.get("q");
    if (q && user && asked.current !== q) {
      asked.current = q;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" }); // returns a Promise in recent Chrome; don't return it
  }, [turns.length]);

  const current = turns.find((t) => t.id === selected) ?? turns[turns.length - 1] ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="page-title">Ask</h1>
          {agentTeam && (
            <Segmented
              label="Choose a Keeper"
              value={agentTeam}
              onChange={setTeam}
              options={KEEPERS.map((k) => ({
                value: k.value,
                label: k.value === user?.team_id ? `${k.label} (yours)` : k.label,
                ariaLabel: KEEPER_NAMES[k.value],
              }))}
            />
          )}
        </div>

        {turns.length === 0 && agentTeam && (
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar team={agentTeam} size="md" />
              <p className="font-semibold">{KEEPER_NAMES[agentTeam]}</p>
            </div>
            <p className="text-navy-600">Ask anything about your team or other teams. Every answer shows where it came from, and gaps go to the right expert.</p>
            <div className="flex flex-wrap gap-2">
              {[
                "How does overtime affect benefits eligibility?",
                "How do retro pay corrections handle overtime, and does it affect benefits eligibility?",
                "When is unused PTO paid out after an employee leaves?",
              ].map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} className="min-h-tap rounded-full bg-pill-mute px-4 text-left text-sm text-pill-mute-fg hover:bg-line">
                  {q}
                </button>
              ))}
            </div>
          </Card>
        )}

        {turns.map((t) => (
          <section key={t.id} className="space-y-4" onFocus={() => setSelected(t.id)} onClick={() => setSelected(t.id)}>
            <div className="ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-md bg-navy-900 px-5 py-3 text-white">{t.question}</div>
            {!t.card && !t.error && (
              <div className="space-y-1 rounded-card border border-line bg-card px-7 py-5" aria-live="polite">
                {t.steps.map((s, i) => (
                  <p key={i} className={i === t.steps.length - 1 ? "text-navy-900" : "text-navy-600"}>
                    {s.text}
                  </p>
                ))}
                {t.steps.length === 0 && <p className="text-navy-600">Thinking…</p>}
              </div>
            )}
            {t.error && <p className="rounded-card border border-pill-bad-fg/30 bg-pill-bad px-6 py-4 text-pill-bad-fg">{t.error}</p>}
            {t.card && (
              <AnswerCard
                card={t.card}
                steps={t.steps}
                onOpenSource={(s) => {
                  setSelected(t.id);
                  setSourceN(s.n);
                }}
                onFollowUp={() => {
                  setTeam(t.team);
                  inputRef.current?.focus();
                }}
              />
            )}
          </section>
        ))}
        <div ref={bottomRef} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="sticky bottom-24 flex gap-2 rounded-card border border-line bg-card p-2 nav:bottom-4"
        >
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={agentTeam ? `Ask ${KEEPER_NAMES[agentTeam]}…` : "Ask…"}
            aria-label="Question"
            className="min-h-tap flex-1 resize-none bg-transparent px-3 py-2.5 focus:outline-none"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            <SendHorizonal className="h-4 w-4" aria-hidden /> Ask
          </Button>
        </form>
      </div>

      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <SourcesPanel card={current?.card ?? null} selected={sourceN} onSelect={setSourceN} onOpenFull={setSheet} />
      </aside>
      <SourcePanel target={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense>
      <AskInner />
    </Suspense>
  );
}
