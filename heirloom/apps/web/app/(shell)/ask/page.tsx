"use client";

import { PanelRightClose, PanelRightOpen, SendHorizonal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { AnswerCard } from "@/components/answer-card";
import { SourcePanel, type SourceRef } from "@/components/source-panel";
import { TracePanel } from "@/components/trace-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  askStream,
  KEEPER_NAMES,
  TEAMS,
  type AnswerCard as AnswerCardT,
  type TeamId,
  type TraceStep,
} from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Turn = { id: number; question: string; team: TeamId; steps: TraceStep[]; card: AnswerCardT | null; error?: string };

function AskInner() {
  const { user, refreshBadges } = useDemoUser();
  const params = useSearchParams();
  const [team, setTeam] = useState<TeamId | null>(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showTrace, setShowTrace] = useState(true);
  const [source, setSource] = useState<SourceRef | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);

  const agentTeam: TeamId | null = team ?? user?.team_id ?? null;

  const ask = async (question: string) => {
    if (!question.trim() || !agentTeam || busy) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, question, team: agentTeam, steps: [], card: null }]);
    setSelected(id);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const current = turns.find((t) => t.id === selected) ?? turns[turns.length - 1] ?? null;

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Ask</h1>
          <div className="flex items-center gap-2">
            <label htmlFor="agent" className="text-sm text-muted">
              Agent
            </label>
            <select
              id="agent"
              value={agentTeam ?? ""}
              onChange={(e) => setTeam(e.target.value as TeamId)}
              className="h-9 rounded-[6px] border bg-surface px-2 text-sm"
            >
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {KEEPER_NAMES[t]}
                  {t === user?.team_id ? " (your team)" : ""}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon" onClick={() => setShowTrace((s) => !s)} aria-label="Toggle trace">
              {showTrace ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {turns.length === 0 && (
          <Card className="text-sm text-muted">
            <div className="mb-2 flex items-center gap-3 text-adp-navy">
              {agentTeam && <AgentAvatar team={agentTeam} />}
              <span className="font-semibold">{agentTeam ? KEEPER_NAMES[agentTeam] : "Keeper"}</span>
            </div>
            Ask anything about your team or other teams. Answers cite their sources, and gaps go to the right expert.
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "How does overtime affect benefits eligibility?",
                "How do retro pay corrections handle overtime, and does it affect benefits eligibility?",
                "When is unused PTO paid out after an employee leaves?",
              ].map((q) => (
                <button key={q} onClick={() => ask(q)} className="rounded-full bg-adp-navy-50 px-3 py-1 text-xs text-adp-navy hover:bg-border">
                  {q}
                </button>
              ))}
            </div>
          </Card>
        )}

        {turns.map((t) => (
          <section key={t.id} className="space-y-3" onClick={() => setSelected(t.id)}>
            <div className="ml-auto w-fit max-w-[80%] rounded-card bg-adp-navy px-4 py-2 text-sm text-white">{t.question}</div>
            {!t.card && !t.error && (
              <div className="space-y-1 rounded-card border bg-surface px-5 py-3" aria-live="polite">
                {t.steps.map((s, i) => (
                  <p key={i} className={i === t.steps.length - 1 ? "text-sm text-adp-navy" : "text-sm text-muted"}>
                    {s.text}
                  </p>
                ))}
                {t.steps.length === 0 && <p className="text-sm text-muted">Thinking…</p>}
              </div>
            )}
            {t.error && <p className="rounded-card border border-status-critical/40 bg-surface px-4 py-3 text-sm text-status-critical">{t.error}</p>}
            {t.card && (
              <AnswerCard
                card={t.card}
                onOpenSource={setSource}
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
          className="sticky bottom-0 flex gap-2 border-t bg-surface-muted py-3"
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
            className="min-h-9 flex-1 resize-none rounded-[6px] border bg-surface px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            <SendHorizonal className="h-4 w-4" /> Ask
          </Button>
        </form>
      </div>

      {showTrace && (
        <aside className="sticky top-20 hidden h-fit w-[320px] shrink-0 rounded-card border bg-surface p-5 lg:block">
          <h2 className="mb-3 text-base font-semibold">How this was answered</h2>
          <TracePanel card={current?.card ?? null} steps={current?.steps ?? []} />
        </aside>
      )}
      <SourcePanel target={source} onClose={() => setSource(null)} />
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
