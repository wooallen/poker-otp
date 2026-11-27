import { useSyncExternalStore } from "react";
import { toRoomSlug } from "./codes";

const HOST_MAP_KEY = "poker_otp_host_tokens";
const PLAYER_MAP_KEY = "poker_otp_player_tokens";
const SESSION_CHANGE_EVENT = "poker-session-change";

function safeReadMap(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function safeWriteMap(key: string, map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

export function notifySessionChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }
}

function subscribeStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(SESSION_CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SESSION_CHANGE_EVENT, handler);
  };
}

export function saveHostToken(roomIdOrSlug: string, hostToken: string): void {
  if (typeof window === "undefined") return;
  const slug = toRoomSlug(roomIdOrSlug);
  const map = safeReadMap(HOST_MAP_KEY);
  map[slug] = hostToken;
  safeWriteMap(HOST_MAP_KEY, map);
  try {
    window.localStorage.setItem("host_token", hostToken);
    window.localStorage.setItem(`host_token_${slug}`, hostToken);
    window.localStorage.setItem("last_host_room_slug", slug);
  } catch {}
  notifySessionChanged();
}

export function getHostToken(roomIdOrSlug: string): string | null {
  if (typeof window === "undefined") return null;
  const slug = toRoomSlug(roomIdOrSlug);
  const map = safeReadMap(HOST_MAP_KEY);
  if (map[slug]) return map[slug];
  try {
    return window.localStorage.getItem(`host_token_${slug}`);
  } catch {
    return null;
  }
}

function playerKey(roomIdOrSlug: string, seatAlias?: string | null): string {
  const slug = toRoomSlug(roomIdOrSlug);
  const alias = seatAlias?.trim().toLowerCase();
  return alias ? `${slug}::${alias}` : slug;
}

export function savePlayerToken(
  roomIdOrSlug: string,
  playerToken: string,
  seatAlias?: string | null
): void {
  if (typeof window === "undefined") return;
  const slug = toRoomSlug(roomIdOrSlug);
  const composite = playerKey(slug, seatAlias);
  const map = safeReadMap(PLAYER_MAP_KEY);
  map[composite] = playerToken;
  safeWriteMap(PLAYER_MAP_KEY, map);
  try {
    if (!seatAlias) {
      window.localStorage.setItem("player_token", playerToken);
      window.localStorage.setItem(`player_token_${slug}`, playerToken);
      window.localStorage.setItem("last_player_room_slug", slug);
    } else {
      window.localStorage.setItem(
        `player_token_${slug}_${seatAlias.trim().toLowerCase()}`,
        playerToken
      );
    }
  } catch {}
  notifySessionChanged();
}

export function getPlayerToken(
  roomIdOrSlug: string,
  seatAlias?: string | null
): string | null {
  if (typeof window === "undefined") return null;
  const slug = toRoomSlug(roomIdOrSlug);
  const composite = playerKey(slug, seatAlias);
  const map = safeReadMap(PLAYER_MAP_KEY);
  if (map[composite]) return map[composite];
  try {
    if (seatAlias) {
      return window.localStorage.getItem(
        `player_token_${slug}_${seatAlias.trim().toLowerCase()}`
      );
    }
    return window.localStorage.getItem(`player_token_${slug}`);
  } catch {
    return null;
  }
}

export function getRecentSessions(): {
  lastHostRoom: string | null;
  lastPlayerRoom: string | null;
} {
  if (typeof window === "undefined") {
    return { lastHostRoom: null, lastPlayerRoom: null };
  }
  try {
    const lastHostRoom = window.localStorage.getItem("last_host_room_slug");
    const lastPlayerRoom = window.localStorage.getItem("last_player_room_slug");
    return {
      lastHostRoom:
        lastHostRoom && getHostToken(lastHostRoom) ? lastHostRoom : null,
      lastPlayerRoom:
        lastPlayerRoom && getPlayerToken(lastPlayerRoom) ? lastPlayerRoom : null,
    };
  } catch {
    return { lastHostRoom: null, lastPlayerRoom: null };
  }
}

export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeStorage,
    () => true,
    () => false
  );
}

export function useStoredHostToken(roomIdOrSlug: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => getHostToken(roomIdOrSlug),
    () => null
  );
}

export function useStoredPlayerToken(
  roomIdOrSlug: string,
  seatAlias?: string | null
): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => getPlayerToken(roomIdOrSlug, seatAlias),
    () => null
  );
}
