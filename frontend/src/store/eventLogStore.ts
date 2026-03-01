import { create } from "zustand";

export interface EventLogEntry {
  id: string;
  event_type: string;
  node_id: string | null;
  node_name: string | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface EventLogStore {
  events: EventLogEntry[];
  polling: boolean;
  startPolling: (api: string) => void;
  stopPolling: () => void;
  clearEvents: (api: string) => void;
}

const MAX_EVENTS = 500;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useEventLogStore = create<EventLogStore>((set, get) => ({
  events: [],
  polling: false,

  startPolling: (api: string) => {
    if (get().polling) return;
    set({ polling: true });

    const poll = async () => {
      try {
        const events = get().events;
        const since = events.length > 0 ? events[events.length - 1].created_at : "";
        const url = since
          ? `${api}/api/events?limit=100&since=${encodeURIComponent(since)}`
          : `${api}/api/events?limit=100`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data: EventLogEntry[] = await res.json();
        if (data.length === 0) return;
        // API returns newest-first, reverse to get chronological order
        const newEvents = data.reverse();
        set((state) => {
          const merged = [...state.events, ...newEvents];
          return { events: merged.slice(-MAX_EVENTS) };
        });
      } catch {
        // Silently ignore polling errors
      }
    };

    // Initial fetch (all events, no since filter)
    poll();
    pollTimer = setInterval(poll, 3000);
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    set({ polling: false });
  },

  clearEvents: async (api: string) => {
    try {
      await fetch(`${api}/api/events`, { method: "DELETE" });
    } catch {
      // ignore
    }
    set({ events: [] });
  },
}));
