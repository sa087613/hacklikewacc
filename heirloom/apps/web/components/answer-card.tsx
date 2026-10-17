"use client";

import { AlertTriangle, Clock, Flag, MessageSquarePlus, ShieldCheck, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import type { SourceRef } from "@/components/source-panel";
import { SourceChip, SourceMarker } from "@/components/source-chip";
import {
  CertaintyLabel,
  PendingBadge,
  ReconfirmBadge,
  VerifiedBadge,
  WithheldNotice,
} from "@/components/status";
import { Button } from "@/components/ui/button";
import { KEEPER_NAMES, post, shortDate, TEAM_NAMES, type AnswerCard as Card, type Certainty } from "@/lib/api";
import { cn } from "@/lib/utils";

function overall(card: Card): Certainty {
  const c = card.points.map((p) => p.certainty);
  if (c.includes("expert_verified")) return "expert_verified";
  if (c.includes("documented")) return "documented";
  return "no_documented_answer";
}

export function AnswerCard({
  card,
  onOpenSource,
  onFollowUp,
}: {
  card: Card;
  onOpenSource: (s: SourceRef) => void;
  onFollowUp?: () => void;
}) {
  const [feedback, setFeedback] = useState<null | "helpful" | "flagged" | "flagging">(null);
  const [reason, setReason] = useState("");
  const [flagResult, setFlagResult] = useState<string | null>(null);

  const firstCitation = (n: number) => {
    for (const p of card.points) for (const c of p.citations) if (c.n === n) return c;
    return null;
  };
  const open = (n: number) => {
    const c = firstCitation(n);
    if (c) onOpenSource({ source_id: c.source_id, start: c.start, end: c.end, title: c.title });
  };

  const allAnswered = card.points.filter((p) => p.certainty !== "no_documented_answer");
  // When the lead is the first point, show its source markers on the lead instead of repeating it.
  const leadPoint = allAnswered[0]?.text === card.lead ? allAnswered[0] : null;
  const answered = leadPoint ? allAnswered.slice(1) : allAnswered;
  const gaps = card.points.filter((p) => p.certainty === "no_documented_answer");
  const tone =
    card.state === "conflict"
      ? "border-status-warn/60 bg-status-warn/[.04]"
      : card.state === "no_answer"
        ? "border-border bg-surface-muted"
        : "bg-surface";

  const flag = async () => {
    const res = await post<{ routed_to: string | null }>(`/answers/${card.answer_id}/flag`, { reason });
    setFeedback("flagged");
    setFlagResult(res.routed_to);
  };

  return (
    <article className={cn("rounded-card border", tone)} aria-label={`Answer from ${KEEPER_NAMES[card.agent_team]}`}>
      {/* 1. Header */}
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <AgentAvatar team={card.agent_team} />
          <span className="font-semibold">{KEEPER_NAMES[card.agent_team]}</span>
        </div>
        {card.consulted_teams.length > 0 && (
          <span className="text-xs text-muted">consulted: {card.consulted_teams.map((t) => TEAM_NAMES[t]).join(", ")}</span>
        )}
      </header>

      <div className="space-y-4 px-5 py-4">
        {/* 2. Lead sentence */}
        <p className={cn("text-[15px] font-medium leading-6", card.state === "no_answer" && "text-adp-navy-700")}>
          {card.lead}
          {leadPoint &&
            [...new Set(leadPoint.citations.map((c) => c.n))].map((n) => <SourceMarker key={n} n={n} onClick={() => open(n)} />)}
        </p>

        {/* Conflicting answers: both sides, no winner picked */}
        {card.conflict && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-status-warn">
              <AlertTriangle className="h-4 w-4" /> Conflicting answers
              {card.conflict.routed_to && <span className="font-normal text-muted">· Routed to {card.conflict.routed_to} to resolve</span>}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {card.conflict.entries.map((e) => (
                <div key={e.id} className="rounded-[6px] border bg-surface p-3 text-sm">
                  <p>{e.summary}</p>
                  <p className="mt-2 text-xs text-muted">
                    Approved answer · {e.verified_by} · {shortDate(e.verified_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Supporting points */}
        {!card.conflict && answered.length > 0 && (
          <ul className="space-y-2">
            {answered.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6">
                <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-adp-navy-700" />
                <span className="flex-1">
                  {p.text}
                  {[...new Set(p.citations.map((c) => c.n))].map((n) => (
                    <SourceMarker key={n} n={n} onClick={() => open(n)} />
                  ))}
                </span>
                <CertaintyLabel certainty={p.certainty} quiet />
              </li>
            ))}
          </ul>
        )}
        {gaps.map((p, i) => (
          <p key={i} className="flex items-start gap-2 text-sm text-status-neutral">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {p.text}
          </p>
        ))}

        {/* 4. Trust row */}
        <div className="flex flex-wrap items-center gap-2">
          {card.verified_by && <VerifiedBadge person={card.verified_by.person} date={card.verified_by.date} />}
          <CertaintyLabel certainty={overall(card)} />
          {card.needs_reconfirmation && (
            <ReconfirmBadge months={card.needs_reconfirmation.months_ago} requested={card.needs_reconfirmation.requested} />
          )}
          {card.pending_expert && <PendingBadge pending={card.pending_expert} />}
          {card.verification.dropped_citations > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted" title="Quotes that were not found verbatim in their sources were removed.">
              <ShieldCheck className="h-3.5 w-3.5" /> {card.verification.dropped_citations} unverifiable quote
              {card.verification.dropped_citations > 1 ? "s" : ""} removed
            </span>
          )}
        </div>

        {/* 5. Sources */}
        {card.sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted">Sources</span>
            {card.sources.map((s) => (
              <SourceChip key={s.n} n={s.n} title={s.title} onClick={() => open(s.n)} />
            ))}
          </div>
        )}

        {/* 6. Withheld */}
        {card.withheld.map((w, i) => (
          <WithheldNotice key={i} item={w.item} team={w.team} contact={w.contact} />
        ))}

        {/* 7. Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            disabled={feedback !== null && feedback !== "flagging"}
            onClick={() => post(`/answers/${card.answer_id}/helpful`).then(() => setFeedback("helpful"))}
          >
            <ThumbsUp className="h-4 w-4" /> {feedback === "helpful" ? "Thanks" : "Helpful"}
          </Button>
          <Button size="sm" variant="secondary" disabled={feedback === "flagged"} onClick={() => setFeedback("flagging")}>
            <Flag className="h-4 w-4" /> {feedback === "flagged" ? "Flagged" : "Flag as wrong"}
          </Button>
          {onFollowUp && (
            <Button size="sm" variant="ghost" onClick={onFollowUp}>
              <MessageSquarePlus className="h-4 w-4" /> Ask a follow-up
            </Button>
          )}
        </div>
        {feedback === "flagging" && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What's wrong? (optional)"
              className="h-8 flex-1 rounded-[6px] border px-2 text-sm"
            />
            <Button size="sm" onClick={flag}>Send to owner</Button>
          </div>
        )}
        {feedback === "flagged" && (
          <p className="text-xs text-muted">Flagged. {flagResult ?? "The knowledge owner"} will review it, and everyone who got this answer is notified if it changes.</p>
        )}
      </div>
    </article>
  );
}
