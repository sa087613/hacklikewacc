"use client";

import { AgentAvatar } from "@/components/agent-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { KEEPER_NAMES, TEAM_NAMES } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const { user, error } = useDemoUser();
  const firstName = user?.name.split(" ")[0];

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold" suppressHydrationWarning>
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-muted">
          {error
            ? "Can't reach the Heirloom API. Start it with: uvicorn main:app --reload"
            : user
              ? `You're on: ${TEAM_NAMES[user.team_id]} · ${user.title}`
              : "Loading…"}
        </p>
      </Card>

      {user && (
        <Card>
          <div className="flex items-center gap-3">
            <AgentAvatar team={user.team_id} />
            <CardTitle>Ask {KEEPER_NAMES[user.team_id]}</CardTitle>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              disabled
              placeholder="Ask anything about your team or other teams…"
              className="h-9 flex-1 rounded-[6px] border bg-surface px-3 text-sm placeholder:text-muted disabled:bg-surface-muted"
            />
            <Button disabled>Ask</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Asking arrives in milestone 2.</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Your pending questions</CardTitle>
          <p className="mt-2 text-muted">None yet.</p>
        </Card>
        <Card>
          <CardTitle className="text-base">New insights</CardTitle>
          <p className="mt-2 text-muted">None yet.</p>
        </Card>
      </div>
    </div>
  );
}
