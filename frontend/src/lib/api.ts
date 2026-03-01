const DEFAULT_API_PORT = 8000;

export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:${DEFAULT_API_PORT}`;
  }
  // SSR fallback — only used during server-side rendering
  return `http://localhost:${DEFAULT_API_PORT}`;
}

export const API_URL = getApiUrl();
