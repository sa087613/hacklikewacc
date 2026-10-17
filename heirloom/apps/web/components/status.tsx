import { AlertTriangle, CheckCircle2, Clock, Info, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { shortDate, timeAgo, type Certainty, type Pending, TEAM_NAMES } from "@/lib/api";

export function VerifiedBadge({ person, date }: { person: string; date: string | null }) {
  return (
    <Badge status="good">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      Verified by {person}
      {date ? ` · ${shortDate(date)}` : ""}
    </Badge>
  );
}

const CERTAINTY: Record<Certainty, { label: string; status: "good" | "info" | "neutral" }> = {
  expert_verified: { label: "Expert-verified", status: "good" },
  documented: { label: "Documented", status: "info" },
  no_documented_answer: { label: "No documented answer", status: "neutral" },
};

export function CertaintyLabel({ certainty, quiet = false }: { certainty: Certainty; quiet?: boolean }) {
  const c = CERTAINTY[certainty];
  if (quiet) return <span className="text-[11px] text-muted">{c.label}</span>;
  return (
    <Badge status={c.status}>
      <Info className="h-3.5 w-3.5" aria-hidden />
      {c.label}
    </Badge>
  );
}

export function PendingBadge({ pending }: { pending: Pending }) {
  if (pending.status === "answered") {
    return (
      <Badge status="good">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Answered by {pending.person}
      </Badge>
    );
  }
  return (
    <Badge status="info">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {pending.status === "escalated"
        ? `Escalated to ${pending.escalated_to} · asked ${pending.person} ${timeAgo(pending.asked_at)}`
        : `Pending · asked ${pending.person} ${timeAgo(pending.asked_at)}`}
    </Badge>
  );
}

export function WithheldNotice({ item, team, contact }: { item: string; team: string; contact: string | null }) {
  const teamName = TEAM_NAMES[team as keyof typeof TEAM_NAMES] ?? team;
  return (
    <div className="flex items-start gap-2 rounded-[6px] bg-status-warn/[.08] px-3 py-2 text-sm">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden />
      <p>
        <span className="font-medium">Withheld:</span> {item} ({teamName}-only).
        {contact && ` Ask ${contact} for access.`}
      </p>
    </div>
  );
}

export function ReconfirmBadge({ months, requested }: { months: number; requested: boolean }) {
  return (
    <Badge status="warn">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      Last verified {months} month{months === 1 ? "" : "s"} ago
      {requested ? " · re-confirmation requested" : ""}
    </Badge>
  );
}
