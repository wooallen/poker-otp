import { useSyncExternalStore } from "react";
import { toRoomSlug } from "./codes";

const SESSION_CHANGE_EVENT = "poker-session-change";

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

export function markLastHostRoom(roomIdOrSlug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("last_host_room_slug", toRoomSlug(roomIdOrSlug));
  } catch {}
  notifySessionChanged();
}

export function markLastPlayerRoom(roomIdOrSlug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      "last_player_room_slug",
      toRoomSlug(roomIdOrSlug)
    );
  } catch {}
  notifySessionChanged();
}

export function getRecentSessions(): {
  lastHostRoom: string | null;
  lastPlayerRoom: string | null;
} {
  if (typeof window === "undefined") {
    return { lastHostRoom: null, lastPlayerRoom: null };
  }
  try {
    return {
      lastHostRoom: window.localStorage.getItem("last_host_room_slug") || null,
      lastPlayerRoom:
        window.localStorage.getItem("last_player_room_slug") || null,
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
