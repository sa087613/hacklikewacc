"use client";

import { AlertTriangle, Flag, MessageSquarePlus, ShieldCheck, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { SourceRef } from "@/components/source-panel";
import { SourceChip, SourceMarker } from "@/components/source-chip";
import { CertaintyLabel, PendingBadge, ReconfirmBadge, WithheldNotice } from "@/components/status";
import { TraceTimeline } from "@/components/trace-timeline";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { isLead, KEEPER_NAMES, post, shortDate, TEAM_NAMES, type AnswerCard as Card, type TraceStep } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";
import { cn } from "@/lib/utils";

export function AnswerCard({
  card,
  steps,
  showSources,
  onOpenSource,
  onFollowUp,
}: {
  card: Card;
  steps?: TraceStep[];
  /** List sources inside the card (for pages without a Sources column). */
  showSources?: boolean;
  onOpenSource: (s: SourceRef & { n: number }) => void;
  onFollowUp?: () => void;
}) {
  const [feedback, setFeedback] = useState<null | "helpful" | "flagged" | "flagging">(null);
  const [reason, setReason] = useState("");
  const [flagResult, setFlagResult] = useState<string | null>(null);
  const [reconfirmed, setReconfirmed] = useState<string | null>(null);
  const { user } = useDemoUser();

  const open = (n: number) => {
    for (const p of card.points)
      for (const c of p.citations)
        if (c.n === n) return onOpenSource({ n, source_id: c.source_id, start: c.start, end: c.end, title: c.title });
  };
  const markers = (cits: { n: number }[]) => [...new Set(cits.map((c) => c.n))].map((n) => <SourceMarker key={n} n={n} onClick={() => open(n)} />);

  const answered = card.points.filter((p) => p.certainty !== "no_documented_answer");
  const leadPoint = answered[0]?.text === card.lead ? answered[0] : null;
  const supporting = leadPoint ? answered.slice(1) : answered;
  const pending = card.pending_expert;

  const flag = async () => {
    const res = await post<{ routed_to: string | null }>(`/answers/${card.answer_id}/flag`, { reason });
    setFeedback("flagged");
    setFlagResult(res.routed_to);
  };

  return (
    <article
      aria-label={`Answer from ${KEEPER_NAMES[card.agent_team]}`}
      className={cn("space-y-6 rounded-card border bg-card p-7", card.state === "conflict" ? "border-pill-warn-fg/40" : "border-line")}
    >
      <header className="flex flex-wrap items-center gap-3">
        <Avatar team={card.agent_team} size="md" />
        <div className="flex-1">
          <p className="font-semibold">{KEEPER_NAMES[card.agent_team]}</p>
          {card.consulted_teams.length > 0 && (
            <p className="text-sm text-navy-600">Asked {card.consulted_teams.map((t) => `${TEAM_NAMES[t].split(" &")[0]} Keeper`).join(" and ")}</p>
          )}
        </div>
        {card.needs_reconfirmation && !reconfirmed && (
          <ReconfirmBadge months={card.needs_reconfirmation.months_ago} requested={card.needs_reconfirmation.requested} />
        )}
      </header>

      {card.state === "no_answer" ? (
        <div className="space-y-3">
          <p className="font-serif text-[28px] font-medium leading-snug">Nobody has written this down yet.</p>
          {pending && (
            <p className="text-navy-600">
              I&rsquo;ve asked {pending.person} on {TEAM_NAMES[pending.team]}. You&rsquo;ll be notified when they reply.
            </p>
          )}
          {pending && <PendingBadge pending={pending} />}
        </div>
      ) : (
        <p className="font-serif text-[28px] font-medium leading-snug">
          {card.lead}
          {leadPoint && markers(leadPoint.citations)}
        </p>
      )}
      {leadPoint && !card.conflict && <CertaintyLabel certainty={leadPoint.certainty} />}

      {card.conflict && (
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-pill-warn-fg">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Conflicting answers
            {card.conflict.routed_to && <span className="font-normal">· sent to {card.conflict.routed_to} to resolve</span>}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {card.conflict.entries.map((e) => (
              <div key={e.id} className="rounded-[14px] bg-pill-warn/60 p-4">
                <p>{e.summary}</p>
                <p className="mt-2 text-sm text-pill-warn-fg">
                  Approved answer · {e.verified_by} · {shortDate(e.verified_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!card.conflict && supporting.length > 0 && (
        <ul className="space-y-3 border-t border-line pt-4">
          {supporting.map((p, i) => (
            <li key={i} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-t border-line pt-3 first:border-0 first:pt-0">
              <span className="min-w-0 flex-1">
                {p.text}
                {markers(p.citations)}
              </span>
              <CertaintyLabel certainty={p.certainty} />
            </li>
          ))}
        </ul>
      )}
      {card.state !== "no_answer" &&
        card.points
          .filter((p) => p.certainty === "no_documented_answer")
          .map((p, i) => (
            <div key={i} className="space-y-2 rounded-[14px] bg-page p-4">
              <p>
                Nobody has written this part down yet: {p.text.replace(/^No documented answer yet for: /, "").replace(/\.$/, "")}.
              </p>
              {pending && <PendingBadge pending={pending} />}
            </div>
          ))}

      {card.verified_by && (
        <figure className="border-l-4 border-pill-ok-fg/40 pl-4">
          <p className="font-serif text-[19px] italic">
            Passed down by {card.verified_by.person}
            {card.verified_by.date && `, verified ${shortDate(card.verified_by.date)}`}
          </p>
        </figure>
      )}

      {showSources && card.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Sources</span>
          {card.sources.map((src) => (
            <SourceChip key={src.n} n={src.n} title={src.title} onClick={() => open(src.n)} />
          ))}
        </div>
      )}

      {card.withheld.map((w, i) => (
        <WithheldNotice key={i} item={w.item} team={w.team} contact={w.contact} contactId={w.contact_id} />
      ))}

      {card.verification.dropped_citations > 0 && (
        <Pill tone="mute" title="Quotes that were not found word for word in their sources were removed.">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {card.verification.dropped_citations} unverifiable quote{card.verification.dropped_citations > 1 ? "s" : ""} removed
        </Pill>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="quiet"
          disabled={feedback !== null && feedback !== "flagging"}
          onClick={() => post(`/answers/${card.answer_id}/helpful`).then(() => setFeedback("helpful"))}
        >
          <ThumbsUp className="h-4 w-4" aria-hidden /> {feedback === "helpful" ? "Thanks" : "Helpful"}
        </Button>
        <Button size="sm" variant="quiet" disabled={feedback === "flagged"} onClick={() => setFeedback("flagging")}>
          <Flag className="h-4 w-4" aria-hidden /> {feedback === "flagged" ? "Flagged" : "Flag as wrong"}
        </Button>
        {onFollowUp && (
          <Button size="sm" variant="quiet" onClick={onFollowUp}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden /> Ask a follow-up
          </Button>
        )}
        {card.needs_reconfirmation && isLead(user) && !reconfirmed && (
          <Button
            size="sm"
            variant="quiet"
            onClick={() =>
              post(`/entries/${card.needs_reconfirmation!.entry_id}/reconfirm`)
                .then(() => setReconfirmed("Re-confirmed. Expiry reset."))
                .catch((e) => setReconfirmed(e.message))
            }
          >
            Re-confirm
          </Button>
        )}
        {reconfirmed && <span className="text-sm text-navy-600">{reconfirmed}</span>}
      </div>
      {feedback === "flagging" && (
        <div className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What's wrong? (optional)"
            aria-label="What's wrong with this answer"
            className="min-h-tap flex-1 rounded-btn border border-line px-3"
          />
          <Button size="sm" onClick={flag}>
            Send to owner
          </Button>
        </div>
      )}
      {feedback === "flagged" && (
        <p className="text-sm text-navy-600">
          Flagged. {flagResult ?? "The knowledge owner"} will review it, and everyone who got this answer is notified if it changes.
        </p>
      )}

      {steps && <TraceTimeline steps={steps} />}
    </article>
  );
}
