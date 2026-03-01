import type { Node } from "@xyflow/react";

export interface NodeIdentityTab {
  name: string;
  file: string;
}

export interface NodeIdentity {
  emoji?: string;
  color?: string;
  description?: string;
  tabs?: NodeIdentityTab[];
}

export interface NanobotNodeData extends Record<string, unknown> {
  label: string;
  nodeId: string;
  containerStatus: string | null;
  identity: NodeIdentity | null;
  agentStatus: string | null;
  agentStatusMessage: string | null;
  genesisPrompt?: string;
  genesisActive?: boolean;
}

export type NanobotFlowNode = Node<NanobotNodeData, "nanobot">;
