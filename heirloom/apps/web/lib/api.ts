export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type TeamId = "payroll" | "benefits" | "time";
export type Certainty = "documented" | "expert_verified" | "no_documented_answer";

export type Person = {
  id: string;
  name: string;
  title: string;
  team_id: TeamId;
  role: "member" | "expert" | "lead";
  is_knowledge_owner: boolean;
  is_departing: boolean;
};

export type Citation = {
  n: number;
  source_id: string;
  quote: string;
  title: string;
  team: TeamId;
  start: number;
  end: number;
  source_type: string;
  entry_id?: string;
};

export type Point = { text: string; certainty: Certainty; citations: Citation[] };

export type EntryView = {
  id: string;
  question: string;
  summary: string;
  steps: string[];
  caveats: string[];
  status: string;
  verified_by: string | null;
  verified_by_id: string | null;
  verified_at: string | null;
  expires_at: string | null;
  team_id: TeamId;
  topic_id: string | null;
  source_id: string | null;
  entry_type: string;
  share_level: string;
  citations: { source_id: string; quote: string }[];
};

export type Pending = {
  inbox_item_id: string;
  person: string | null;
  person_id: string | null;
  team: TeamId;
  status: "pending" | "answered" | "escalated";
  asked_at: string;
  escalated_to: string | null;
  merged: boolean;
};

export type TraceStep = { kind: string; text: string; ms: number; team?: TeamId; sources?: number };

export type AnswerCard = {
  answer_id: string;
  agent_team: TeamId;
  question: string;
  state: "answer" | "no_answer" | "conflict";
  lead: string;
  points: Point[];
  sources: { n: number; source_id: string; title: string; team: TeamId; source_type: string }[];
  consulted_teams: TeamId[];
  verified_by: { person: string; person_id: string; date: string; entry_id: string } | null;
  withheld: { team: TeamId; item: string; contact: string | null; contact_id: string | null }[];
  pending_expert: Pending | null;
  needs_reconfirmation: { entry_id: string; last_verified: string; months_ago: number; requested: boolean } | null;
  conflict: { topic_id: string; entries: EntryView[]; routed_to: string | null; routed_to_id: string | null } | null;
  entry_ids: string[];
  verification: { dropped_citations: number; dropped_points: number };
  trace?: TraceStep[];
};

export const TEAM_NAMES: Record<TeamId, string> = {
  payroll: "Payroll",
  benefits: "Benefits",
  time: "Time & Attendance",
};

// Keepers are named after the short team name (§7): "Time Keeper", not "Time & Attendance Keeper".
export const KEEPER_NAMES: Record<TeamId, string> = {
  payroll: "Payroll Keeper",
  benefits: "Benefits Keeper",
  time: "Time Keeper",
};

export const TEAMS: TeamId[] = ["payroll", "benefits", "time"];

// The demo user is set by DemoUserProvider and sent with every request (§20: no real auth).
let currentPersonId = "jordan-kim";
export function setApiPerson(id: string) {
  currentPersonId = id;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Person-Id", currentPersonId);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export type AskEvent =
  | ({ type: "status" } & TraceStep)
  | { type: "card"; card: AnswerCard }
  | { type: "error"; message: string };

/** POST /ask and read the Server-Sent Events stream: status lines, then the card. */
export async function askStream(question: string, agentTeam: TeamId | null, onEvent: (e: AskEvent) => void) {
  const res = await fetch(`${API_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Person-Id": currentPersonId },
    body: JSON.stringify({ question, agent_team: agentTeam }),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, "Ask failed");
  await readSSE(res.body, (data) => onEvent(data as AskEvent));
}

export async function readSSE(body: ReadableStream<Uint8Array>, onData: (d: unknown) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) onData(JSON.parse(line.slice(6)));
      }
    }
  }
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const isLead = (p: Person | null) => !!p && (p.role === "lead" || p.is_knowledge_owner);
