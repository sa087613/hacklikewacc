import { AlertTriangle, CheckCircle2, Clock, Lock, Mail } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { shortDate, timeAgo, type Certainty, type Pending, TEAM_NAMES } from "@/lib/api";

export function VerifiedBadge({ person, date }: { person: string; date: string | null }) {
  return (
    <Pill tone="ok">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      Verified by {person}
      {date ? ` · ${shortDate(date)}` : ""}
    </Pill>
  );
}

const CERTAINTY: Record<Certainty, { label: string; tone: "ok" | "info" | "mute" }> = {
  expert_verified: { label: "Expert verified", tone: "ok" },
  documented: { label: "Documented", tone: "info" },
  no_documented_answer: { label: "Not written down yet", tone: "mute" },
};

export function CertaintyLabel({ certainty }: { certainty: Certainty }) {
  const c = CERTAINTY[certainty];
  return <Pill tone={c.tone}>{c.label}</Pill>;
}

export function PendingBadge({ pending }: { pending: Pending }) {
  if (pending.status === "answered") {
    return (
      <Pill tone="ok">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Answered by {pending.person}
      </Pill>
    );
  }
  return (
    <Pill tone="info">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {pending.status === "escalated"
        ? `Escalated to ${pending.escalated_to} · asked ${pending.person} ${timeAgo(pending.asked_at)}`
        : `Pending · asked ${pending.person} ${timeAgo(pending.asked_at)}`}
    </Pill>
  );
}

/** Seed people have no email addresses; a placeholder domain keeps the request honest about that. */
const contactEmail = (id: string) => `${id}@heirloom.example`;

export function WithheldNotice({
  item,
  team,
  contact,
  contactId,
}: {
  item: string;
  team: string;
  contact: string | null;
  contactId?: string | null;
}) {
  const teamName = TEAM_NAMES[team as keyof typeof TEAM_NAMES] ?? team;
  const href =
    contactId &&
    `mailto:${contactEmail(contactId)}?subject=${encodeURIComponent(`Access request: ${item}`)}&body=${encodeURIComponent(
      `Hi ${contact?.split(" ")[0] ?? ""},\n\nHeirloom withheld "${item}" (${teamName}-only) from an answer I received. Could you share it with me, or tell me who can?\n\nThanks`,
    )}`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-pill-warn px-4 py-3 text-pill-warn-fg">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1 text-[15px]">
        <span className="font-semibold">Kept private:</span> {item} ({teamName}-only).
        {contact && ` ${contact} can grant access.`}
      </p>
      {href && (
        <a
          href={href}
          className="inline-flex min-h-tap items-center gap-2 rounded-btn border border-pill-warn-fg/30 bg-card px-4 text-sm font-semibold text-pill-warn-fg hover:bg-page"
        >
          <Mail className="h-4 w-4" aria-hidden /> Request access
        </a>
      )}
    </div>
  );
}

export function ReconfirmBadge({ months, requested }: { months: number; requested: boolean }) {
  return (
    <Pill tone="warn">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      Last verified {months} month{months === 1 ? "" : "s"} ago
      {requested ? " · re-confirmation requested" : ""}
    </Pill>
  );
}
