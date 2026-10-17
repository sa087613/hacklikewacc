"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setApiPerson, type Person } from "@/lib/api";

// No real auth (§20): a top-bar switcher picks who you are. Jordan is the demo default.
const DEFAULT_USER_ID = "jordan-kim";
const STORAGE_KEY = "heirloom.demoUser";

export type AppConfig = {
  providers: Record<string, string>;
  offline: string[];
  demo_mode: boolean;
  expert_timeout_minutes: number;
  llm_model: string;
};

type Badges = { inbox: number; insights: number; notifications: number };

type DemoUserState = {
  people: Person[];
  user: Person | null;
  setUserId: (id: string) => void;
  error: string | null;
  config: AppConfig | null;
  badges: Badges;
  refreshBadges: () => void;
  version: number; // bumps when the user switches, so pages refetch
};

const DemoUserContext = createContext<DemoUserState | null>(null);

export function DemoUserProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [userId, setUserIdState] = useState(DEFAULT_USER_ID);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [badges, setBadges] = useState<Badges>({ inbox: 0, insights: 0, notifications: 0 });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setUserIdState(saved);
        setApiPerson(saved);
      }
    } catch {}
    api<Person[]>("/people")
      .then(setPeople)
      .catch((e) => setError(String(e)));
    api<AppConfig>("/config")
      .then(setConfig)
      .catch(() => {});
  }, []);

  const refreshBadges = useCallback(() => {
    api<Badges>("/badges")
      .then(setBadges)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshBadges();
    const t = setInterval(refreshBadges, 10000);
    return () => clearInterval(t);
  }, [refreshBadges, userId]);

  const setUserId = (id: string) => {
    setApiPerson(id);
    setUserIdState(id);
    setVersion((v) => v + 1);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  const user = people.find((p) => p.id === userId) ?? null;
  return (
    <DemoUserContext.Provider
      value={{ people, user, setUserId, error, config, badges, refreshBadges, version }}
    >
      {children}
    </DemoUserContext.Provider>
  );
}

export function useDemoUser() {
  const ctx = useContext(DemoUserContext);
  if (!ctx) throw new Error("useDemoUser must be used inside DemoUserProvider");
  return ctx;
}

export function personName(people: Person[], id: string | null | undefined) {
  return people.find((p) => p.id === id)?.name ?? id ?? "";
}
