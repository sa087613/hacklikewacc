import { Card } from "@/components/ui/card";

export function PagePlaceholder({ title, milestone, children }: { title: string; milestone: number; children: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <p>{children}</p>
        <p className="mt-2 text-xs text-muted">Arrives in milestone {milestone}.</p>
      </Card>
    </div>
  );
}
