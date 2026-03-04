import type { Node } from "@xyflow/react";

export interface NodeIdentityTab {
  name: string;
  file: string;
}

export interface NodeIdentityShortcut {
  label: string;
  url: string;
  icon?: string;
}

export interface NodeIdentity {
  emoji?: string;
  icon?: string;
  color?: string;
  description?: string;
  tabs?: NodeIdentityTab[];
  shortcuts?: NodeIdentityShortcut[];
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
  rebuilding?: boolean;
  archived?: boolean;
  placeholder?: boolean;
  gaugeValue?: number | null;
  gaugeLabel?: string | null;
  gaugeUnit?: string | null;
}

export type NanobotFlowNode = Node<NanobotNodeData, "nanobot">;

export interface Recommendation {
  name: string;
  genesis_prompt: string;
  icon: string;
  emoji: string;
  description: string;
}
