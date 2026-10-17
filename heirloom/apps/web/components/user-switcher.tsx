"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TEAM_NAMES, type TeamId } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useDemoUser } from "@/lib/demo-user";

export function UserSwitcher() {
  const { people, user, setUserId, error } = useDemoUser();
  const router = useRouter();

  if (error) return <span className="text-xs text-white/70">API offline</span>;

  const teams = Object.keys(TEAM_NAMES) as TeamId[];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-sm text-white hover:bg-white/10">
        {user?.name ?? "Loading…"}
        <ChevronDown className="h-4 w-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Demo: view as</DropdownMenuLabel>
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
                    <span className="text-xs text-muted">{p.title}</span>
                  </span>
                </DropdownMenuItem>
              ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
