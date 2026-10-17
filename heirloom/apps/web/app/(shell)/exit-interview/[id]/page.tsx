"use client";

import { CheckCircle2, Circle, Loader2, MinusCircle, SendHorizonal, SkipForward } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VoiceInput, type VoiceNote } from "@/components/voice-input";
import { api, post } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";
import { cn } from "@/lib/utils";

type Draft = { question: string; summary: string; steps: string[]; caveats: string[]; origin?: { kind: string; duration_s?: number | null } };
type Interview = {
  id: string;
  status: "in_progress" | "in_review" | "submitted";
  person: { id: string; name: string; title: string };
  started_by: { id: string; name: string };
  topics: { id: string; name: string; status: string; map_status: string | null }[];
  current_topic: string | null;
  messages: { role: "agent" | "person"; topic_id: string | null; text: string; kind?: string; duration_s?: number | null }[];
  drafts: Record<string, Draft>;
  prs?: { id: number }[];
};

const STATE_ICON: Record<string, typeof Circle> = { captured: CheckCircle2, in_progress: Loader2, skipped: MinusCircle, pending: Circle };

export default function ExitInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, setUserId, version } = useDemoUser();
  const [iv, setIv] = useState<Interview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState<Record<string, Draft>>({});
  const [submitted, setSubmitted] = useState<number[] | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<Interview>(`/exit-interviews/${id}`)
      .then((v) => {
        setIv(v);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load, version]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" }); // returns a Promise in recent Chrome; don't return it
  }, [iv?.messages.length]);

  if (error) return <Card className="text-sm text-status-critical">{error}</Card>;
  if (!iv) return <p className="text-sm text-muted">Loading…</p>;

  const send = async () => {
    setBusy(true);
    try {
      const body =
        mode === "voice" && voice
          ? { kind: "voice", transcript: voice.transcript, duration_s: voice.durationS }
          : { kind: "text", text };
      setIv(await post<Interview>(`/exit-interviews/${id}/message`, body));
      setText("");
      setVoice(null);
      setMode("text");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => setIv(await post<Interview>(`/exit-interviews/${id}/skip`));
  const submit = async () => {
    setBusy(true);
    try {
      const res = await post<Interview>(`/exit-interviews/${id}/submit`, { drafts: edited });
      setIv(res);
      setSubmitted((res.prs ?? []).map((p) => p.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isPerson = user?.id === iv.person.id;
  const drafts = { ...iv.drafts, ...edited };
  const topicName = (tid: string | null) => iv.topics.find((t) => t.id === tid)?.name;
  const current = iv.topics.find((t) => t.id === iv.current_topic);
  const ready = mode === "text" ? !!text.trim() : !!voice?.transcript;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Exit interview · {iv.person.name}</h1>
          <p className="text-sm text-muted">
            Started by {iv.started_by.name} with consent. Voluntary: {iv.person.name.split(" ")[0]} reviews everything before it&rsquo;s saved.
          </p>
        </div>
        <Badge status={iv.status === "submitted" ? "good" : iv.status === "in_review" ? "warn" : "info"}>
          {iv.status === "in_progress" ? "In progress" : iv.status === "in_review" ? "Ready for review" : "Submitted as knowledge PRs"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_340px]">
        {/* Left: sole-source topics */}
        <Card className="h-fit p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Only {iv.person.name.split(" ")[0]} knows</h2>
          <ul className="space-y-2">
            {iv.topics.map((t) => {
              const Icon = STATE_ICON[t.status] ?? Circle;
              return (
                <li key={t.id} className={cn("flex items-start gap-2 text-sm", t.id === iv.current_topic && "font-semibold")}>
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.status === "captured" ? "text-status-good" : t.status === "in_progress" ? "animate-spin text-status-info" : "text-muted")} aria-hidden />
                  <span>
                    {t.name}
                    <span className="block text-[11px] font-normal capitalize text-muted">{t.status.replace("_", " ")}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Center: interview chat */}
        <Card className="flex min-h-[480px] flex-col p-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {iv.messages.map((m, i) => (
              <div key={i} className={cn("max-w-[85%] rounded-card px-3 py-2 text-sm", m.role === "agent" ? "bg-adp-navy-50" : "ml-auto bg-adp-navy text-white")}>
                {m.role === "agent" && m.topic_id && <p className="mb-0.5 text-[11px] font-medium text-muted">{topicName(m.topic_id)}</p>}
                {m.kind === "voice" && <p className="mb-0.5 text-[11px] opacity-80">Voice note{m.duration_s ? ` · ${Math.floor(m.duration_s / 60)}:${String(m.duration_s % 60).padStart(2, "0")}` : ""}</p>}
                {m.text}
              </div>
            ))}
            <div ref={bottom} />
          </div>
          {iv.status === "in_progress" && (
            <div className="space-y-2 border-t p-3">
              <div className="flex gap-2">
                <Button size="sm" variant={mode === "text" ? "primary" : "secondary"} onClick={() => setMode("text")}>
                  Type
                </Button>
                <Button size="sm" variant={mode === "voice" ? "primary" : "secondary"} onClick={() => setMode("voice")}>
                  Voice note
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={skip} disabled={busy}>
                  <SkipForward className="h-4 w-4" /> Skip {current ? "topic" : ""}
                </Button>
              </div>
              {mode === "text" ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  aria-label="Answer"
                  placeholder={`${iv.person.name.split(" ")[0]}'s answer…`}
                  className="w-full rounded-[6px] border px-3 py-2 text-sm"
                />
              ) : (
                <VoiceInput onChange={setVoice} />
              )}
              <Button size="sm" onClick={send} disabled={!ready || busy}>
                <SendHorizonal className="h-4 w-4" /> {busy ? "Structuring…" : "Send"}
              </Button>
            </div>
          )}
        </Card>

        {/* Right: live structured drafts / review */}
        <Card className="h-fit space-y-4 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {iv.status === "in_progress" ? "Live draft" : "Review before saving"}
          </h2>
          {Object.keys(drafts).length === 0 && <p className="text-sm text-muted">Answers are structured into drafts here as you go.</p>}
          {Object.entries(drafts).map(([tid, d]) => (
            <div key={tid} className="space-y-1.5 text-sm">
              <p className="font-semibold">{topicName(tid)}</p>
              {iv.status === "in_review" && isPerson ? (
                <>
                  <textarea
                    value={d.summary}
                    onChange={(e) => setEdited({ ...edited, [tid]: { ...d, summary: e.target.value } })}
                    rows={3}
                    aria-label={`Summary for ${topicName(tid)}`}
                    className="w-full rounded-[6px] border px-2 py-1.5"
                  />
                  <textarea
                    value={d.steps.join("\n")}
                    onChange={(e) => setEdited({ ...edited, [tid]: { ...d, steps: e.target.value.split("\n").filter(Boolean) } })}
                    rows={4}
                    aria-label={`Steps for ${topicName(tid)}`}
                    className="w-full rounded-[6px] border px-2 py-1.5"
                  />
                </>
              ) : (
                <>
                  <p>{d.summary}</p>
                  {d.steps.length > 0 && (
                    <ol className="list-decimal space-y-0.5 pl-5 text-adp-navy-700">
                      {d.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                </>
              )}
              {d.caveats.length > 0 && (
                <ul className="text-status-warn">
                  {d.caveats.map((c, i) => (
                    <li key={i}>⚠ {c}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {iv.status === "in_review" &&
            (isPerson ? (
              <Button onClick={submit} disabled={busy}>
                Submit as knowledge PRs
              </Button>
            ) : (
              <div className="space-y-2 rounded-[6px] bg-surface-muted p-3 text-sm">
                <p>Only {iv.person.name} can review and submit these answers.</p>
                <Button size="sm" variant="secondary" onClick={() => setUserId(iv.person.id)}>
                  Switch to {iv.person.name.split(" ")[0]} to review
                </Button>
              </div>
            ))}
          {(submitted || iv.status === "submitted") && (
            <p className="text-sm text-status-good">
              Submitted{submitted?.length ? ` as Knowledge PR${submitted.length > 1 ? "s" : ""} ${submitted.map((n) => `#${n}`).join(", ")}` : ""}. The
              knowledge owner reviews them next.{" "}
              <Link href="/inbox?tab=prs" className="underline">
                Open review queue
              </Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
