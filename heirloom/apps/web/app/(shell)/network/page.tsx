"use client";

import { ArrowRight, Ban, Lock, SendHorizonal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnswerCard } from "@/components/answer-card";
import { NetworkGraph, pairKey } from "@/components/network-graph";
import { SourcePanel, type SourceRef } from "@/components/source-panel";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  api,
  API_URL,
  askStream,
  KEEPER_NAMES,
  TEAM_NAMES,
  timeAgo,
  type AnswerCard as AnswerCardT,
  type TeamId,
} from "@/lib/api";
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

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const call of calls) if (!call.blocked_reason) c[pairKey(call.from_team, call.to_team)] = (c[pairKey(call.from_team, call.to_team)] ?? 0) + 1;
    return c;
  }, [calls]);

  const exchanges = selected ? calls.filter((c) => pairKey(c.from_team, c.to_team) === selected) : [];

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
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Agent network</h1>
          <p className="text-sm text-muted">
            Keepers ask each other through a standard ask tool. Max 2 hops, no loops, and every call is logged. Click an edge to see the exchange.
          </p>
        </div>
        <NetworkGraph counts={counts} active={active} activeNodes={activeNodes} selected={selected} onSelectPair={setSelected} />

        <Card>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Ask and watch the network"
              placeholder={user ? `Ask ${KEEPER_NAMES[user.team_id]} and watch the network…` : "Ask…"}
              className="h-9 flex-1 rounded-[6px] border px-3 text-sm"
            />
            <Button type="submit" disabled={busy || !question.trim()}>
              <SendHorizonal className="h-4 w-4" /> Ask
            </Button>
          </form>
          {busy && (
            <div className="mt-3 space-y-0.5" aria-live="polite">
              {status.map((s, i) => (
                <p key={i} className="text-sm text-muted">
                  {s}
                </p>
              ))}
            </div>
          )}
        </Card>
        {card && <AnswerCard card={card} onOpenSource={setSource} />}

        {selected && (
          <Card>
            <CardTitle className="text-base">
              Exchanges: {selected.split("~").map((t) => TEAM_NAMES[t as TeamId]).join(" ↔ ")}
            </CardTitle>
            <div className="mt-3 space-y-3">
              {exchanges.length === 0 && <p className="text-sm text-muted">No calls between these agents yet.</p>}
              {exchanges.map((c) => (
                <div key={c.id} className="rounded-[6px] border p-3 text-sm">
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    {KEEPER_NAMES[c.from_team]} <ArrowRight className="h-3 w-3" /> {KEEPER_NAMES[c.to_team]} · {c.tool} ·{" "}
                    {timeAgo(c.created_at)}
                  </p>
                  <p className="mt-1 font-medium">{c.question}</p>
                  {c.shared_sources.length > 0 && (
                    <p className="mt-2 text-xs">
                      <span className="font-medium">Shared:</span> {c.shared_sources.map((s) => s.title).join(" · ")}
                    </p>
                  )}
                  {c.withheld.map((w, i) => (
                    <p key={i} className="mt-1 flex items-center gap-1 text-xs text-status-warn">
                      <Lock className="h-3 w-3" /> Withheld: {w.item} ({TEAM_NAMES[w.team]}-only){w.contact && ` · ask ${w.contact}`}
                    </p>
                  ))}
                  {c.blocked_reason && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-status-critical">
                      <Ban className="h-3 w-3" /> Blocked: {c.blocked_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <aside className="hidden w-[340px] shrink-0 lg:block">
        <div className="sticky top-20 rounded-card border bg-surface">
          <h2 className="border-b px-4 py-3 text-base font-semibold">Audit log</h2>
          <ol className="max-h-[calc(100vh-10rem)] divide-y overflow-y-auto">
            {calls.length === 0 && <li className="px-4 py-3 text-sm text-muted">No agent-to-agent calls yet.</li>}
            {calls.map((c) => (
              <li
                key={c.id}
                className="cursor-pointer px-4 py-2.5 text-sm hover:bg-adp-navy-50"
                onClick={() => setSelected(pairKey(c.from_team, c.to_team))}
              >
                <p className="flex items-center gap-1 text-xs font-medium">
                  {TEAM_NAMES[c.from_team]} <ArrowRight className="h-3 w-3" /> {TEAM_NAMES[c.to_team]}
                  <span className="ml-auto font-normal text-muted">{timeAgo(c.created_at)}</span>
                </p>
                <p className="line-clamp-2 text-adp-navy-700">{c.question}</p>
                <p className="text-[11px] text-muted">
                  {c.blocked_reason
                    ? `Blocked: ${c.blocked_reason}`
                    : `${c.tool} · shared ${c.shared_sources.length} · withheld ${c.withheld.length} · ${c.latency_ms} ms · hops ${c.hop_chain.length}`}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </aside>
      <SourcePanel target={source} onClose={() => setSource(null)} />
    </div>
  );
}
