"use client";

import { Plus, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { api, KEEPER_NAMES, TEAM_NAMES, TEAMS, type Person, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Team = {
  id: TeamId;
  name: string;
  default_share_level: string;
  expiry_defaults: Record<string, number | null>;
  capability_card: { summary: string; owned_topics: string[]; contacts: { person_id: string; for: string }[] };
  roster: Person[];
  topics: { id: string; name: string }[];
  sources: { id: string; title: string; type: string; share_level: string; created_at: string }[];
  can_edit: boolean;
};

const SHARE = { team: "Team only", cross_team: "Cross-team", company: "Company" } as const;
const EXPIRY_LABEL: Record<string, string> = {
  regulation: "Regulation / tax rule",
  process: "Process / how-to",
  roster: "Team roster / ownership",
  decision: "One-off decision",
};

function ShareSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-[6px] border bg-surface px-2 text-sm">
      {Object.entries(SHARE).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

export default function SettingsPage() {
  const { user, version } = useDemoUser();
  const [teamId, setTeamId] = useState<TeamId | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadShare, setUploadShare] = useState("");
  const [error, setError] = useState<string | null>(null);

  const id = teamId ?? user?.team_id ?? null;
  const load = useCallback(() => {
    if (id) api<Team>(`/teams/${id}`).then(setTeam);
  }, [id]);
  useEffect(load, [load, version]);

  const save = async (patch: Partial<Team>) => {
    setError(null);
    try {
      await api(`/teams/${id}/settings`, { method: "PUT", body: JSON.stringify(patch) });
      setSaved("Saved");
      load();
      setTimeout(() => setSaved(null), 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doUpload = async () => {
    if (!upload || !team) return;
    const form = new FormData();
    form.set("file", upload);
    form.set("team_id", team.id);
    if (uploadShare) form.set("share_level", uploadShare);
    setError(null);
    try {
      await api("/sources/upload", { method: "POST", body: form });
      setUpload(null);
      setSaved("Source ingested");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!team) return <p className="text-sm text-muted">Loading…</p>;
  const card = team.capability_card;
  const edit = team.can_edit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <AgentAvatar team={team.id} />
          <div>
            <h1 className="text-2xl font-semibold">Team settings · {TEAM_NAMES[team.id]}</h1>
            <p className="text-sm text-muted">
              {KEEPER_NAMES[team.id]}. {edit ? "You're this team's knowledge owner." : "Read-only: only the knowledge owner can change these."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-status-good">{saved}</span>}
          <select value={team.id} onChange={(e) => setTeamId(e.target.value as TeamId)} aria-label="Team" className="h-9 rounded-[6px] border bg-surface px-2 text-sm">
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {TEAM_NAMES[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <Card className="text-sm text-status-critical">{error}</Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <CardTitle className="text-base">Capability card</CardTitle>
          <p className="text-xs text-muted">Other Keepers read this to decide whether to ask {TEAM_NAMES[team.id]}. Agents don&rsquo;t broadcast.</p>
          <textarea
            defaultValue={card.summary}
            disabled={!edit}
            onBlur={(e) => e.target.value !== card.summary && save({ capability_card: { ...card, summary: e.target.value } })}
            rows={3}
            aria-label="What this team owns"
            className="w-full rounded-[6px] border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {card.owned_topics.map((t) => (
              <Badge key={t} status="neutral">
                {team.topics.find((x) => x.id === t)?.name ?? t}
                {edit && (
                  <button aria-label={`Remove ${t}`} onClick={() => save({ capability_card: { ...card, owned_topics: card.owned_topics.filter((x) => x !== t) } })}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          {edit && (
            <div className="flex gap-2">
              <select value={newTopic} onChange={(e) => setNewTopic(e.target.value)} aria-label="Add owned topic" className="h-8 flex-1 rounded-[6px] border bg-surface px-2 text-sm">
                <option value="">Add an owned topic…</option>
                {team.topics.filter((t) => !card.owned_topics.includes(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="secondary" disabled={!newTopic} onClick={() => (save({ capability_card: { ...card, owned_topics: [...card.owned_topics, newTopic] } }), setNewTopic(""))}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="space-y-2">
            <CardTitle className="text-base">Default share level</CardTitle>
            <p className="text-xs text-muted">Applies to new entries and sources. Override per source below.</p>
            <ShareSelect value={team.default_share_level} disabled={!edit} onChange={(v) => save({ default_share_level: v })} />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-base">Expiry defaults</CardTitle>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(EXPIRY_LABEL).map(([k, label]) => (
                  <tr key={k} className="border-b last:border-0">
                    <td className="py-1.5">{label}</td>
                    <td className="py-1.5 text-right">
                      <select
                        value={team.expiry_defaults[k] ?? 0}
                        disabled={!edit}
                        aria-label={`Expiry for ${label}`}
                        onChange={(e) => save({ expiry_defaults: { ...team.expiry_defaults, [k]: Number(e.target.value) || null } })}
                        className="h-8 rounded-[6px] border bg-surface px-2"
                      >
                        {[3, 6, 12, 24].map((m) => (
                          <option key={m} value={m}>
                            {m} months
                          </option>
                        ))}
                        <option value={0}>No expiry (dated)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="space-y-3">
        <CardTitle className="text-base">Roster</CardTitle>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Title</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Contact for</th>
            </tr>
          </thead>
          <tbody>
            {team.roster.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-adp-navy-50">
                <td className="py-2">
                  {p.name} {p.is_departing && <Badge status="warn">Departing</Badge>}
                </td>
                <td className="py-2 text-muted">{p.title}</td>
                <td className="py-2 capitalize">{p.is_knowledge_owner ? "Knowledge owner" : p.role}</td>
                <td className="py-2 text-muted">{card.contacts.find((c) => c.person_id === p.id)?.for ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="text-base">Connected sources</CardTitle>
        <p className="text-xs text-muted">
          In the demo, sources are uploaded files (Markdown, text, PDF, Word). Documents that contain employee records are rejected.
        </p>
        {edit && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".md,.txt,.pdf,.docx" onChange={(e) => setUpload(e.target.files?.[0] ?? null)} aria-label="Upload a source" className="text-sm" />
            <select value={uploadShare} onChange={(e) => setUploadShare(e.target.value)} aria-label="Share level for upload" className="h-8 rounded-[6px] border bg-surface px-2 text-sm">
              <option value="">Team default</option>
              {Object.entries(SHARE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!upload} onClick={doUpload}>
              <Upload className="h-4 w-4" /> Upload and ingest
            </Button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b">
              <th className="py-2 font-medium">Source</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 text-right font-medium">Share level</th>
            </tr>
          </thead>
          <tbody>
            {team.sources.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-adp-navy-50">
                <td className="py-2">{s.title}</td>
                <td className="py-2 capitalize text-muted">{s.type.replace("_", " ")}</td>
                <td className="py-2 text-right">
                  <ShareSelect
                    value={s.share_level}
                    disabled={!edit}
                    onChange={(v) =>
                      api(`/sources/${s.id}/share-level`, { method: "PUT", body: JSON.stringify({ share_level: v }) })
                        .then(load)
                        .catch((e) => setError(e.message))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
