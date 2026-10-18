import type { TraceStep } from "@/lib/api";

/** "How this was answered": each step with its elapsed time (§9.2). */
export function TraceTimeline({ steps }: { steps: TraceStep[] }) {
  if (steps.length === 0) return null;
  return (
    <details open className="group rounded-[14px] bg-page px-4 py-3">
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between font-semibold">
        How this was answered
        <span className="text-sm font-normal text-navy-600">{steps[steps.length - 1].ms} ms total</span>
      </summary>
      <ol className="relative mt-1 space-y-2.5 border-l-2 border-line pl-4">
        {steps.map((s, i) => (
          <li key={i} className="relative flex gap-3 text-sm">
            <span aria-hidden className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-navy-600" />
            <span className="flex-1">{s.text}</span>
            <span className="tabular-nums text-navy-600">{s.ms} ms</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
