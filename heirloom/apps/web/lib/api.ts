export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type TeamId = "payroll" | "benefits" | "time";

export type Person = {
  id: string;
  name: string;
  title: string;
  team_id: TeamId;
  role: "member" | "expert" | "lead";
  is_knowledge_owner: boolean;
  is_departing: boolean;
};

export async function getPeople(): Promise<Person[]> {
  const res = await fetch(`${API_URL}/people`);
  if (!res.ok) throw new Error(`GET /people failed: ${res.status}`);
  return res.json();
}

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
