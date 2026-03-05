"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  message_type?: string;
}

interface ChatSocketOptions {
  wsUrl: string;
  nodeId: string;
  api: string;
  genesisPrompt?: string;
  onGenesisComplete?: () => void;
  onIdentityUpdate?: (identity: Record<string, unknown>) => void;
  onThinkingChange?: (thinking: boolean) => void;
  genesisTemplate: (prompt: string) => string;
  refreshSignal?: number;
}

// Module-level set — survives component remounts caused by React Flow re-renders
const genesisSentNodes = new Set<string>();

export function useChatSocket({
  wsUrl,
  nodeId,
  api,
  genesisPrompt,
  onGenesisComplete,
  onIdentityUpdate,
  onThinkingChange,
  genesisTemplate,
  refreshSignal,
}: ChatSocketOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [thinking, _setThinking] = useState(false);
  const [genesisInProgress, setGenesisInProgress] = useState(
    !!genesisPrompt && !genesisSentNodes.has(nodeId)
  );
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  // Refs for volatile values so the connect callback stays stable
  const genesisPromptRef = useRef(genesisPrompt);
  const genesisInProgressRef = useRef(genesisInProgress);
  const genesisTemplateRef = useRef(genesisTemplate);
  const onGenesisCompleteRef = useRef(onGenesisComplete);
  const onIdentityUpdateRef = useRef(onIdentityUpdate);
  const onThinkingChangeRef = useRef(onThinkingChange);

  useEffect(() => { genesisPromptRef.current = genesisPrompt; }, [genesisPrompt]);
  useEffect(() => { genesisInProgressRef.current = genesisInProgress; }, [genesisInProgress]);
  useEffect(() => { genesisTemplateRef.current = genesisTemplate; }, [genesisTemplate]);
  useEffect(() => { onGenesisCompleteRef.current = onGenesisComplete; }, [onGenesisComplete]);
  useEffect(() => { onIdentityUpdateRef.current = onIdentityUpdate; }, [onIdentityUpdate]);
  useEffect(() => { onThinkingChangeRef.current = onThinkingChange; }, [onThinkingChange]);

  // Load chat history from DB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${api}/api/nodes/${nodeId}/messages`);
        if (!res.ok || cancelled) return;
        const data: { role: "user" | "assistant"; content: string; message_type?: string; display_content?: string }[] = await res.json();
        if (cancelled) return;
        setMessages(data.map((m) => ({
          role: m.role,
          content: m.display_content || m.content,
          message_type: m.message_type,
        })));
      } catch (error) {
        console.error(`Failed to fetch chat history for node ${nodeId}:`, error);
      }
    })();
    return () => { cancelled = true; };
  }, [api, nodeId]);

  // Re-fetch chat history when an external source (e.g. agent API) adds messages
  useEffect(() => {
    if (!refreshSignal) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${api}/api/nodes/${nodeId}/messages`);
        if (!res.ok || cancelled) return;
        const data: { role: "user" | "assistant"; content: string; message_type?: string; display_content?: string }[] = await res.json();
        if (!cancelled) {
          setMessages(data.map((m) => ({
            role: m.role,
            content: m.display_content || m.content,
            message_type: m.message_type,
          })));
        }
      } catch (error) {
        console.error(`Failed to refresh chat history for node ${nodeId}:`, error);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshSignal, api, nodeId]);

  // One-shot identity check on reconnect — catches identity set while disconnected
  useEffect(() => {
    if (!connected || !genesisSentNodes.has(nodeId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${api}/api/nodes/${nodeId}/identity`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.identity && !cancelled) {
          setGenesisInProgress(false);
          onIdentityUpdateRef.current?.(data.identity);
          onGenesisCompleteRef.current?.();
        }
      } catch (error) {
        console.warn(`Failed to fetch identity for node ${nodeId} on reconnect:`, error);
      }
    })();
    return () => { cancelled = true; };
  }, [connected, api, nodeId]);

  const setThinking = useCallback((v: boolean) => {
    _setThinking(v);
    onThinkingChangeRef.current?.(v);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setInitializing(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "identity_update" && msg.identity) {
          setGenesisInProgress(false);
          onIdentityUpdateRef.current?.(msg.identity);
          onGenesisCompleteRef.current?.();
          return;
        }

        if (msg.type === "status") {
          setAgentReady(msg.ready);

          if (msg.ready && genesisPromptRef.current && !genesisSentNodes.has(nodeId) && ws.readyState === WebSocket.OPEN) {
            genesisSentNodes.add(nodeId);
            setGenesisInProgress(true);
            setThinking(true);
            const genesisMessage = genesisTemplateRef.current(genesisPromptRef.current);
            const displayText = `Genesis: ${genesisPromptRef.current}`;
            setMessages((prev) => [...prev, { role: "user", content: displayText, message_type: "genesis" }]);
            ws.send(JSON.stringify({
              type: "chat", content: genesisMessage, session_key: `paradise:${nodeId}`,
              message_type: "genesis", display_content: displayText,
            }));
          }

          if (!msg.ready) {
            setMessages((prev) => [...prev, { role: "assistant", content: msg.message || "Agent not ready" }]);
          }
          return;
        }

        if (msg.type === "progress") {
          setThinking(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), { ...last, content: msg.content }];
            }
            return [...prev, { role: "assistant", content: msg.content, streaming: true }];
          });
        } else if (msg.type === "response") {
          setThinking(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), { role: "assistant", content: msg.content }];
            }
            return [...prev, { role: "assistant", content: msg.content }];
          });
        } else if (msg.type === "tool_call") {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: msg.content, message_type: "tool_call" },
          ]);
        } else if (msg.type === "error") {
          const isConnectError = /cannot connect|connection refused|name resolution/i.test(msg.message || "");
          if (!isConnectError) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg.message}`, message_type: "error" }]);
          }
        }
      } catch (error) {
        console.warn(`Failed to parse WebSocket message for node ${nodeId}:`, error);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!mountedRef.current) return;
      // Reload history from DB to catch messages saved while disconnected
      (async () => {
        try {
          const res = await fetch(`${api}/api/nodes/${nodeId}/messages`);
          if (res.status === 404) return; // Node gone — stop retrying
          if (res.ok) {
            const data: { role: "user" | "assistant"; content: string; message_type?: string; display_content?: string }[] = await res.json();
            setMessages(data.map((m) => ({
              role: m.role,
              content: m.display_content || m.content,
              message_type: m.message_type,
            })));
          }
        } catch (error) {
          console.error(`Failed to reload chat history on WebSocket reconnect for node ${nodeId}:`, error);
        }
        if (mountedRef.current) setTimeout(connect, 2000);
      })();
    };

    ws.onerror = () => ws.close();
  }, [wsUrl, nodeId, api, setThinking]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setThinking(true);
    wsRef.current.send(JSON.stringify({ type: "chat", content: text, session_key: `paradise:${nodeId}` }));
  }, [nodeId, setThinking]);

  const sendGenesis = useCallback((prompt: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    genesisSentNodes.add(nodeId);
    setGenesisInProgress(true);
    setThinking(true);
    const genesisMessage = genesisTemplateRef.current(prompt);
    const displayText = `Genesis: ${prompt}`;
    setMessages((prev) => [...prev, { role: "user", content: displayText, message_type: "genesis" }]);
    wsRef.current.send(JSON.stringify({
      type: "chat", content: genesisMessage, session_key: `paradise:${nodeId}`,
      message_type: "genesis", display_content: displayText,
    }));
  }, [nodeId, setThinking]);

  return {
    messages,
    connected,
    agentReady,
    initializing,
    thinking,
    genesisInProgress,
    sendMessage,
    sendGenesis,
  };
}
