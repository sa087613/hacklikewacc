"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, post, timeAgo } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Note = { id: string; kind: string; title: string; body: string; link: string | null; created_at: string; read: boolean };

export function Notifications() {
  const { badges, refreshBadges } = useDemoUser();
  const [items, setItems] = useState<Note[]>([]);

  const open = (isOpen: boolean) => {
    if (isOpen) {
      api<Note[]>("/notifications").then(setItems).catch(() => {});
    } else if (badges.notifications) {
      post("/notifications/read").then(refreshBadges);
    }
  };

  return (
    <DropdownMenu onOpenChange={open}>
      <DropdownMenuTrigger
        aria-label={badges.notifications ? `Notifications, ${badges.notifications} unread` : "Notifications"}
        className="relative flex min-h-tap min-w-tap items-center justify-center rounded-btn border border-line bg-card text-navy-900 hover:bg-pill-mute"
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        {badges.notifications > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {badges.notifications}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {items.length === 0 && <p className="px-2 py-3 text-sm text-navy-600">Nothing new.</p>}
        <div className="max-h-96 overflow-y-auto">
          {items.map((n) => (
            <DropdownMenuItem key={n.id} asChild>
              <Link href={n.link ?? "#"} className="flex flex-col items-start gap-0.5">
                <span className={n.read ? "text-navy-600" : "font-semibold"}>{n.title}</span>
                {n.body && <span className="line-clamp-2 text-xs text-navy-600">{n.body}</span>}
                <span className="text-xs text-navy-600">{timeAgo(n.created_at)}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
