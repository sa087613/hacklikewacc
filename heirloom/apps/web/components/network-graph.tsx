"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { KEEPER_NAMES, TEAM_NAMES, type TeamId } from "@/lib/api";

const ACCENT: Record<TeamId, string> = { payroll: "#2E3A6E", benefits: "#0D9488", time: "#7C3AED" };
const POS: Record<TeamId, { x: number; y: number }> = {
  time: { x: 250, y: 0 },
  payroll: { x: 0, y: 260 },
  benefits: { x: 500, y: 260 },
};

type AgentData = { team: TeamId; active: boolean };

function AgentNode({ data }: NodeProps<Node<AgentData>>) {
  return (
    <div
      className="flex w-[180px] items-center gap-3 rounded-card border-2 bg-surface px-3 py-2.5 shadow-sm transition-shadow"
      style={{ borderColor: ACCENT[data.team], boxShadow: data.active ? `0 0 0 6px ${ACCENT[data.team]}33` : undefined }}
    >
      <AgentAvatar team={data.team} />
      <div className="leading-tight">
        <p className="text-sm font-semibold">{KEEPER_NAMES[data.team]}</p>
        <p className="text-[11px] text-muted">{TEAM_NAMES[data.team]}</p>
      </div>
      {/* Centered handles so straight edges meet the middle of each node. */}
      <Handle type="source" position={Position.Top} className="!opacity-0" style={{ top: "50%" }} />
      <Handle type="target" position={Position.Top} className="!opacity-0" style={{ top: "50%" }} />
    </div>
  );
}

type PairData = { count: number; active: boolean; selected: boolean; label: string };

function PairEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<PairData>>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const color = data?.active ? "#D0271D" : data?.selected ? "#121C4E" : "#9AA1B5";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: color, strokeWidth: data?.active || data?.selected ? 3 : 2, strokeDasharray: data?.active ? "6 6" : undefined }}
        className={data?.active ? "animate-[dash_0.6s_linear_infinite]" : undefined}
      />
      {data?.count ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-full border bg-surface px-2 py-0.5 text-[11px] text-adp-navy"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { agent: AgentNode };
const edgeTypes = { pair: PairEdge };

export const pairKey = (a: string, b: string) => [a, b].sort().join("~");

export function NetworkGraph({
  counts,
  active,
  activeNodes,
  selected,
  onSelectPair,
}: {
  counts: Record<string, number>;
  active: Set<string>;
  activeNodes: Set<TeamId>;
  selected: string | null;
  onSelectPair: (key: string) => void;
}) {
  const nodes: Node<AgentData>[] = useMemo(
    () =>
      (Object.keys(POS) as TeamId[]).map((t) => ({
        id: t,
        type: "agent",
        position: POS[t],
        data: { team: t, active: activeNodes.has(t) },
        draggable: false,
      })),
    [activeNodes],
  );
  const edges: Edge<PairData>[] = useMemo(() => {
    const pairs: [TeamId, TeamId][] = [
      ["time", "payroll"],
      ["time", "benefits"],
      ["payroll", "benefits"],
    ];
    return pairs.map(([a, b]) => {
      const key = pairKey(a, b);
      const n = counts[key] ?? 0;
      return {
        id: key,
        source: a,
        target: b,
        type: "pair",
        data: { count: n, active: active.has(key), selected: selected === key, label: `${n} call${n === 1 ? "" : "s"}` },
        interactionWidth: 24,
      };
    });
  }, [counts, active, selected]);

  return (
    <div className="h-[420px] rounded-card border bg-surface">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesConnectable={false}
        zoomOnScroll={false}
        panOnDrag={false}
        proOptions={{ hideAttribution: true }}
        onEdgeClick={(_, e) => onSelectPair(e.id)}
      />
    </div>
  );
}
