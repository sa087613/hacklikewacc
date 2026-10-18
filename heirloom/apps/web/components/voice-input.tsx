"use client";

import { CheckCircle2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { api } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

export type VoiceNote = { transcript?: string; audio?: Blob; durationS: number };
type Sample = { label: string; text: string; duration_s: number };

export const formatDuration = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "0:00");

const BARS = [6, 14, 22, 12, 28, 18, 9, 24, 30, 16, 8, 20, 26, 12, 6, 18, 28, 22, 10, 16, 24, 14, 8, 20, 12, 26, 18, 6, 14, 22];

/** Decorative waveform for a recorded note. */
export function Waveform({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`flex h-8 items-center gap-[3px] ${className ?? ""}`}>
      {BARS.map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-current" style={{ height: h }} />
      ))}
    </span>
  );
}

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
      <div className="flex flex-wrap items-center gap-4 rounded-[16px] bg-page p-4">
        {recording ? (
          <Button type="button" variant="secondary" onClick={() => (rec.current?.stop(), setRecording(false))}>
            <Square className="h-4 w-4" aria-hidden /> Stop recording
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={start}>
            <Mic className="h-4 w-4" aria-hidden /> {recorded === null ? "Start recording" : "Record again"}
          </Button>
        )}
        {recorded !== null && (
          <>
            <Waveform className="text-navy-600" />
            <span className="tabular-nums">{formatDuration(recorded)}</span>
            <Pill tone="info">Transcribed when you submit</Pill>
          </>
        )}
      </div>
    );
  }

  const update = (text: string, secs: number) => {
    setTranscript(text);
    setDuration(secs);
    onChange(text.trim() ? { transcript: text, durationS: secs } : null);
  };
  return (
    <div className="space-y-3 rounded-[16px] bg-page p-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white">
          <Mic className="h-5 w-5" aria-hidden />
        </span>
        <Waveform className="text-navy-600" />
        <span className="tabular-nums">{formatDuration(duration)}</span>
        {transcript.trim() && (
          <Pill tone="ok">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Transcribed
          </Pill>
        )}
      </div>
      <p className="text-sm text-navy-600">Transcription is offline in this demo, so pick a sample or type what you&rsquo;d say.</p>
      {Object.keys(samples).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(samples).map(([k, s]) => (
            <button
              key={k}
              type="button"
              onClick={() => update(s.text, s.duration_s)}
              className="min-h-tap rounded-full bg-card px-4 text-left text-sm text-pill-mute-fg hover:bg-pill-mute"
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
        placeholder="Transcript"
        className="w-full rounded-btn border border-line bg-card px-4 py-3"
      />
    </div>
  );
}
