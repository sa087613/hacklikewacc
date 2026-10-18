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
import { Avatar } from "@/components/ui/avatar";
import { KEEPER_NAMES, type TeamId } from "@/lib/api";
import { cn } from "@/lib/utils";

const POS: Record<TeamId, { x: number; y: number }> = {
  time: { x: 250, y: 0 },
  payroll: { x: 0, y: 270 },
  benefits: { x: 500, y: 270 },
};

type AgentData = { team: TeamId; active: boolean };

function AgentNode({ data }: NodeProps<Node<AgentData>>) {
  return (
    <div className="flex w-[160px] flex-col items-center gap-2">
      <div className={cn("rounded-[28px] p-1 transition-shadow", data.active && "ring-4 ring-white/40")}>
        <Avatar team={data.team} size="xl" />
      </div>
      <p className="text-[15px] font-semibold text-white">{KEEPER_NAMES[data.team]}</p>
      {/* Centered handles so straight edges meet the middle of each node. */}
      <Handle type="source" position={Position.Top} className="!opacity-0" style={{ top: 48 }} />
      <Handle type="target" position={Position.Top} className="!opacity-0" style={{ top: 48 }} />
    </div>
  );
}

type PairData = { active: boolean; selected: boolean; label: string; count: number };

function PairEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<PairData>>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const live = data?.active;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: live ? "var(--red-600)" : data?.count ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)",
          strokeWidth: live || data?.selected ? 3 : 2,
          strokeDasharray: live ? "8 6" : data?.count ? undefined : "2 6",
        }}
        className={live ? "animate-[dash_0.6s_linear_infinite]" : undefined}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "pointer-events-none absolute whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium",
            live ? "bg-red-600 text-white" : data?.count ? "bg-card text-navy-900" : "bg-white/10 text-white/80",
            data?.selected && "ring-2 ring-white",
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { agent: AgentNode };
const edgeTypes = { pair: PairEdge };

export const pairKey = (a: string, b: string) => [a, b].sort().join("~");

export type PairSummary = { count: number; lastAsked: TeamId | null };

export function NetworkGraph({
  pairs,
  active,
  activeNodes,
  selected,
  onSelectPair,
}: {
  pairs: Record<string, PairSummary>;
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
        selectable: false,
      })),
    [activeNodes],
  );
  const edges: Edge<PairData>[] = useMemo(() => {
    const list: [TeamId, TeamId][] = [
      ["time", "payroll"],
      ["time", "benefits"],
      ["payroll", "benefits"],
    ];
    const name = (t: TeamId) => KEEPER_NAMES[t].replace(" Keeper", "");
    return list.map(([a, b]) => {
      const key = pairKey(a, b);
      const p = pairs[key] ?? { count: 0, lastAsked: null };
      return {
        id: key,
        source: a,
        target: b,
        type: "pair",
        ariaLabel: `${name(a)} and ${name(b)}: ${p.count} questions. Show the exchange`,
        data: {
          count: p.count,
          active: active.has(key),
          selected: selected === key,
          label: p.lastAsked ? `asking ${name(p.lastAsked)}` : "no questions between them",
        },
        interactionWidth: 28,
      };
    });
  }, [pairs, active, selected]);

  return (
    <div className="dot-grid h-[460px] overflow-hidden rounded-card bg-navy-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        nodesConnectable={false}
        nodesFocusable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        proOptions={{ hideAttribution: true }}
        onEdgeClick={(_, e) => onSelectPair(e.id)}
      />
    </div>
  );
}
