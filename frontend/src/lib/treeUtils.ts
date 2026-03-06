import type { Node, Edge } from "@xyflow/react";
import type { NanobotNodeData } from "@/types";

export interface TreeNode {
  id: string;
  label: string;
  emoji?: string;
  icon?: string;
  color?: string;
  agentStatus: string | null;
  containerStatus: string | null;
  archived?: boolean;
  children: TreeNode[];
}

export function getStatusColor(agentStatus: string | null, containerStatus: string | null): string {
  if (agentStatus) {
    switch (agentStatus) {
      case "ok": return "var(--green)";
      case "warning": return "var(--yellow)";
      case "error": return "var(--red)";
      default: return "var(--green)";
    }
  }
  switch (containerStatus) {
    case "running": return "var(--green)";
    case "error": return "var(--red)";
    default: return "var(--yellow)";
  }
}

export function buildTree(nodes: Node[], edges: Edge[]): TreeNode[] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map<string, Node>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const childrenMap = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of edges) {
    const children = childrenMap.get(edge.source) || [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
    hasParent.add(edge.target);
  }

  const claimed = new Set<string>();

  function buildNode(id: string, visited: Set<string>): TreeNode | null {
    if (claimed.has(id) || visited.has(id)) return null;
    const node = nodeMap.get(id);
    if (!node) return null;

    claimed.add(id);
    visited.add(id);

    const data = node.data as NanobotNodeData;
    const childIds = childrenMap.get(id) || [];
    const children: TreeNode[] = [];

    for (const childId of childIds) {
      const child = buildNode(childId, new Set(visited));
      if (child) children.push(child);
    }

    children.sort((a, b) => a.label.localeCompare(b.label));

    return {
      id,
      label: data.label,
      emoji: data.identity?.emoji,
      icon: data.identity?.icon,
      color: data.identity?.color,
      agentStatus: data.agentStatus ?? null,
      containerStatus: data.containerStatus ?? null,
      archived: data.archived ?? false,
      children,
    };
  }

  const rootIds = nodes
    .filter((n) => !hasParent.has(n.id))
    .map((n) => n.id)
    .sort((a, b) => {
      const la = (nodeMap.get(a)?.data as NanobotNodeData)?.label || "";
      const lb = (nodeMap.get(b)?.data as NanobotNodeData)?.label || "";
      return la.localeCompare(lb);
    });

  const result: TreeNode[] = [];
  for (const rootId of rootIds) {
    const node = buildNode(rootId, new Set());
    if (node) result.push(node);
  }

  for (const n of nodes) {
    if (!claimed.has(n.id)) {
      const node = buildNode(n.id, new Set());
      if (node) result.push(node);
    }
  }

  return result;
}
