"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

export type VoiceNote = { transcript?: string; audio?: Blob; durationS: number };
type Sample = { label: string; text: string; duration_s: number };

/**
 * Voice note capture. Live (Whisper configured): records audio with MediaRecorder.
 * Offline: takes a typed transcript in place of transcription, with demo samples.
 */
export function VoiceInput({ onChange }: { onChange: (v: VoiceNote | null) => void }) {
  const { config } = useDemoUser();
  const live = config?.providers.transcription === "whisper";
  const [samples, setSamples] = useState<Record<string, Sample>>({});
  const [transcript, setTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<number | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (!live) api<Record<string, Sample>>("/demo/samples").then(setSamples).catch(() => {});
  }, [live]);

  if (live) {
    const start = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = Math.round((Date.now() - started.current) / 1000);
        setRecorded(secs);
        onChange({ audio: new Blob(chunks, { type: r.mimeType }), durationS: secs });
      };
      started.current = Date.now();
      r.start();
      rec.current = r;
      setRecording(true);
    };
    return (
      <div className="flex items-center gap-3">
        {recording ? (
          <Button type="button" variant="secondary" onClick={() => (rec.current?.stop(), setRecording(false))}>
            <Square className="h-4 w-4" /> Stop recording
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={start}>
            <Mic className="h-4 w-4" /> Record voice note
          </Button>
        )}
        {recorded !== null && <span className="text-sm text-muted">Voice note recorded ({recorded}s). Whisper transcribes it on submit.</span>}
      </div>
    );
  }

  const update = (text: string, secs: number) => {
    setTranscript(text);
    setDuration(secs);
    onChange(text.trim() ? { transcript: text, durationS: secs } : null);
  };
  return (
    <div className="space-y-2 rounded-[6px] border border-dashed p-3">
      <p className="flex items-center gap-2 text-xs text-muted">
        <Mic className="h-3.5 w-3.5" /> Voice note · transcription is offline, so paste or pick a transcript.
      </p>
      {Object.keys(samples).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(samples).map(([k, s]) => (
            <button
              key={k}
              type="button"
              onClick={() => update(s.text, s.duration_s)}
              className="rounded-full bg-adp-navy-50 px-2.5 py-0.5 text-xs text-adp-navy hover:bg-border"
            >
              Use sample: {s.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={transcript}
        onChange={(e) => update(e.target.value, duration || Math.round(e.target.value.split(/\s+/).length / 2.5))}
        rows={4}
        aria-label="Voice note transcript"
        placeholder="Voice note transcript…"
        className="w-full rounded-[6px] border px-3 py-2 text-sm"
      />
    </div>
  );
}
