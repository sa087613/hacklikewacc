"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getPeople, type Person } from "@/lib/api";

// No real auth (§20): a top-bar switcher picks who you are. Jordan is the demo default.
const DEFAULT_USER_ID = "jordan-kim";
const STORAGE_KEY = "heirloom.demoUser";

type DemoUserState = {
  people: Person[];
  user: Person | null;
  setUserId: (id: string) => void;
  error: string | null;
};

const DemoUserContext = createContext<DemoUserState | null>(null);

export function DemoUserProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [userId, setUserIdState] = useState(DEFAULT_USER_ID);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setUserIdState(saved);
    } catch {}
    getPeople()
      .then(setPeople)
      .catch((e) => setError(String(e)));
  }, []);

  const setUserId = (id: string) => {
    setUserIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  const user = people.find((p) => p.id === userId) ?? null;
  return (
    <DemoUserContext.Provider value={{ people, user, setUserId, error }}>{children}</DemoUserContext.Provider>
  );
}

export function useDemoUser() {
  const ctx = useContext(DemoUserContext);
  if (!ctx) throw new Error("useDemoUser must be used inside DemoUserProvider");
  return ctx;
}
