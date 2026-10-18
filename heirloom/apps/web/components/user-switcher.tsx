"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { post, TEAM_NAMES, type TeamId } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useDemoUser } from "@/lib/demo-user";

export function UserSwitcher() {
  const { people, user, setUserId, error, config } = useDemoUser();
  const router = useRouter();

  if (error) return <span className="text-sm text-white/80">Can&rsquo;t reach the API</span>;

  const teams = Object.keys(TEAM_NAMES) as TeamId[];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={user ? `Signed in as ${user.name}. Switch role` : "Switch role"}
        className="flex min-h-tap w-full items-center gap-3 rounded-btn px-2 py-2 text-left text-white hover:bg-white/10"
      >
        {user ? <Avatar name={user.name} size="md" /> : <span className="h-10 w-10" />}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-semibold">{user?.name ?? "Loading…"}</span>
          <span className="block truncate text-[13px] text-white/70">{user?.title}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuLabel>Switch role (demo)</DropdownMenuLabel>
        {teams.map((team, i) => (
          <div key={team}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{TEAM_NAMES[team]}</DropdownMenuLabel>
            {people
              .filter((p) => p.team_id === team)
              .map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => {
                    setUserId(p.id);
                    router.refresh();
                  }}>
                  <span className="w-4">{p.id === user?.id && <Check className="h-4 w-4" aria-hidden />}</span>
                  <span className="flex flex-col">
                    <span>{p.name}</span>
                    <span className="text-xs text-navy-600">{p.title}</span>
                  </span>
                </DropdownMenuItem>
              ))}
          </div>
        ))}
        {config?.demo_mode && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                if (!window.confirm("Reset all demo data to the seed state?")) return;
                await post("/demo/reset");
                setUserId("jordan-kim");
                window.location.href = "/";
              }}
            >
              <span className="w-4" />
              <span className="text-red-600">Reset demo data</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
