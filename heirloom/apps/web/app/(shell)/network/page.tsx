"use client";

import { ArrowRight, Ban, FileText, Lock, SendHorizonal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnswerCard } from "@/components/answer-card";
import { NetworkGraph, pairKey, type PairSummary } from "@/components/network-graph";
import { SourcePanel, type SourceRef } from "@/components/source-panel";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { api, API_URL, askStream, KEEPER_NAMES, TEAM_NAMES, timeAgo, type AnswerCard as AnswerCardT, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Call = {
  id: string;
  from_team: TeamId;
  to_team: TeamId;
  tool: string;
  question: string;
  hop_chain: TeamId[];
  shared_sources: { source_id: string; title: string | null }[];
  withheld: { item: string; team: TeamId; contact: string | null }[];
  blocked_reason: string | null;
  latency_ms: number | null;
  created_at: string;
};

const HOLD_MS = 1800; // calls take milliseconds offline; keep edges lit long enough to see
const short = (t: TeamId) => TEAM_NAMES[t].split(" &")[0];

export default function NetworkPage() {
  const { user } = useDemoUser();
  const [calls, setCalls] = useState<Call[]>([]);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [activeNodes, setActiveNodes] = useState<Set<TeamId>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [card, setCard] = useState<AnswerCardT | null>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<SourceRef | null>(null);
  const timers = useRef<number[]>([]);

  const load = useCallback(() => api<Call[]>("/network/calls").then(setCalls).catch(() => {}), []);

  const light = useCallback((from: TeamId, to: TeamId) => {
    const key = pairKey(from, to);
    setActive((s) => new Set(s).add(key));
    setActiveNodes((s) => new Set(s).add(from).add(to));
    timers.current.push(
      window.setTimeout(() => {
        setActive((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
        setActiveNodes((s) => {
          const n = new Set(s);
          n.delete(from);
          n.delete(to);
          return n;
        });
      }, HOLD_MS),
    );
  }, []);

  useEffect(() => {
    load();
    const es = new EventSource(`${API_URL}/network/stream`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.type === "edge_start") light(e.from, e.to);
      if (e.type === "edge_end") load();
    };
    const t = timers.current;
    return () => {
      es.close();
      t.forEach(clearTimeout);
    };
  }, [load, light]);

  const pairs = useMemo(() => {
    const out: Record<string, PairSummary> = {};
    // calls arrive newest first, so the first call seen per pair is the latest.
    for (const c of calls) {
      if (c.blocked_reason) continue;
      const k = pairKey(c.from_team, c.to_team);
      out[k] = out[k] ? { ...out[k], count: out[k].count + 1 } : { count: 1, lastAsked: c.to_team };
    }
    return out;
  }, [calls]);

  const latest = calls.find((c) => !c.blocked_reason && (!selected || pairKey(c.from_team, c.to_team) === selected)) ?? null;

  const ask = async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setStatus([]);
    setCard(null);
    try {
      await askStream(question, null, (e) => {
        if (e.type === "status") setStatus((s) => [...s, e.text]);
        if (e.type === "card") setCard(e.card);
      });
    } finally {
      setBusy(false);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Network</h1>
        <p className="mt-1 text-navy-600">Keepers ask each other directly. At most two hops, never in a loop, and every call is logged.</p>
      </div>

      <NetworkGraph pairs={pairs} active={active} activeNodes={activeNodes} selected={selected} onSelectPair={setSelected} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Show exchanges between</span>
        <Segmented
          label="Show exchanges between"
          value={selected ?? "all"}
          onChange={(v) => setSelected(v === "all" ? null : v)}
          options={[
            { value: "all", label: "Everyone" },
            { value: pairKey("time", "payroll"), label: "Time and Payroll" },
            { value: pairKey("time", "benefits"), label: "Time and Benefits" },
            { value: pairKey("payroll", "benefits"), label: "Payroll and Benefits" },
          ]}
        />
      </div>

      <form
        className="flex flex-col gap-3 rounded-card border border-line bg-card p-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Ask and watch the network"
          placeholder={user ? `Ask ${KEEPER_NAMES[user.team_id]} and watch the Keepers talk` : "Ask…"}
          className="min-h-tap flex-1 bg-transparent px-3 focus:outline-none"
        />
        <Button type="submit" disabled={busy || !question.trim()}>
          <SendHorizonal className="h-4 w-4" aria-hidden /> Ask
        </Button>
      </form>
      {busy && (
        <div className="space-y-0.5 px-2" aria-live="polite">
          {status.map((s, i) => (
            <p key={i} className="text-navy-600">
              {s}
            </p>
          ))}
        </div>
      )}
      {card && <AnswerCard card={card} showSources onOpenSource={setSource} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <CardTitle>Latest exchange{selected && ` · ${selected.split("~").map((t) => short(t as TeamId)).join(" and ")}`}</CardTitle>
          {!latest && <p className="text-navy-600">No questions between these Keepers yet.</p>}
          {latest && (
            <>
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-navy-600">
                {KEEPER_NAMES[latest.from_team]} <ArrowRight className="h-3.5 w-3.5" aria-hidden /> {KEEPER_NAMES[latest.to_team]} · {timeAgo(latest.created_at)}
              </p>
              <p className="font-serif text-[22px] leading-snug">{latest.question}</p>
              {latest.shared_sources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Shared</p>
                  <ul className="flex flex-wrap gap-2">
                    {latest.shared_sources.map((s) => (
                      <li key={s.source_id}>
                        <Pill tone="mute">
                          <FileText className="h-3.5 w-3.5" aria-hidden /> {s.title}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {latest.withheld.map((w, i) => (
                <Pill key={i} tone="warn">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Kept private: {w.item}
                  {w.contact && ` · ask ${w.contact}`}
                </Pill>
              ))}
            </>
          )}
        </Card>

        <Card className="p-0">
          <CardTitle className="px-7 pb-3 pt-7">Audit log</CardTitle>
          <ol className="max-h-[420px] divide-y divide-line overflow-y-auto border-t border-line">
            {calls.length === 0 && <li className="px-7 py-4 text-navy-600">No calls between Keepers yet.</li>}
            {calls.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(pairKey(c.from_team, c.to_team))}
                  className="w-full px-7 py-3 text-left hover:bg-page"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {short(c.from_team)} <ArrowRight className="h-3.5 w-3.5" aria-hidden /> {short(c.to_team)}
                    <span className="ml-auto font-normal text-navy-600">{timeAgo(c.created_at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block">{c.question}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-navy-600">
                    {c.blocked_reason ? (
                      <Pill tone="bad">
                        <Ban className="h-3.5 w-3.5" aria-hidden /> Blocked: {c.blocked_reason}
                      </Pill>
                    ) : (
                      `${c.tool === "ask" ? "Question" : "Impact check"} · ${c.shared_sources.length} shared · ${c.withheld.length} kept private · ${c.latency_ms} ms`
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <SourcePanel target={source} onClose={() => setSource(null)} />
    </div>
  );
}
