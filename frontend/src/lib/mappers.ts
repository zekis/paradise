import type { NanobotNodeData, NanobotFlowNode, NodeIdentity } from "@/types";

/**
 * Shape of a node as returned by the backend API (snake_case fields).
 */
export interface ApiNode {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
  container_status?: string | null;
  identity?: NodeIdentity | null;
  agent_status?: string | null;
  agent_status_message?: string | null;
  gauge_value?: number | null;
  gauge_label?: string | null;
  gauge_unit?: string | null;
  gauge_warn_threshold?: number | null;
  gauge_critical_threshold?: number | null;
  archived?: boolean;
  area_id?: string | null;
}

/**
 * Optional overrides applied on top of the standard API-to-data mapping.
 * Useful for genesis-related fields that come from outside the node payload.
 */
export interface NodeDataOverrides {
  genesisPrompt?: string;
  genesisActive?: boolean;
}

/**
 * Convert an API node response to the NanobotNodeData shape used by the frontend.
 */
export function mapApiNodeToNodeData(
  apiNode: ApiNode,
  overrides?: NodeDataOverrides,
): NanobotNodeData {
  return {
    label: apiNode.name,
    nodeId: apiNode.id,
    containerStatus: apiNode.container_status || null,
    identity: apiNode.identity || null,
    agentStatus: apiNode.agent_status || null,
    agentStatusMessage: apiNode.agent_status_message || null,
    gaugeValue: apiNode.gauge_value ?? null,
    gaugeLabel: apiNode.gauge_label || null,
    gaugeUnit: apiNode.gauge_unit || null,
    gaugeWarnThreshold: apiNode.gauge_warn_threshold ?? null,
    gaugeCriticalThreshold: apiNode.gauge_critical_threshold ?? null,
    archived: apiNode.archived || false,
    areaId: apiNode.area_id || null,
    ...overrides,
  };
}

/**
 * Convert an API node response to a full ReactFlow Node<NanobotNodeData>.
 */
export function mapApiNodeToFlowNode(
  apiNode: ApiNode,
  overrides?: NodeDataOverrides,
): NanobotFlowNode {
  return {
    id: apiNode.id,
    type: "nanobot" as const,
    position: { x: apiNode.position_x, y: apiNode.position_y },
    data: mapApiNodeToNodeData(apiNode, overrides),
    style: { width: 80, height: 92 },
  };
}

/**
 * Create a placeholder flow node that appears instantly on the canvas
 * before the backend API responds.
 */
export function createPlaceholderFlowNode(
  tempId: string,
  name: string,
  position: { x: number; y: number },
): NanobotFlowNode {
  return {
    id: tempId,
    type: "nanobot" as const,
    position,
    data: {
      label: name,
      nodeId: tempId,
      containerStatus: null,
      identity: null,
      agentStatus: null,
      agentStatusMessage: null,
      placeholder: true,
    },
    style: { width: 80, height: 92 },
  };
}
