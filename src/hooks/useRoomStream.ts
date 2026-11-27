"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toRoomSlug } from "@/lib/codes";
import type { RoomSnapshot } from "@/lib/types";

export type ConnectionState = "CONNECTING" | "LIVE" | "RECONNECTING" | "ERROR";

interface UseRoomStreamOptions {
  roomCode: string;
  hostToken?: string | null;
  playerToken?: string | null;
  enabled?: boolean;
}

export function useRoomStream<T extends RoomSnapshot = RoomSnapshot>({
  roomCode,
  hostToken,
  playerToken,
  enabled = true,
}: UseRoomStreamOptions) {
  const [snapshot, setSnapshot] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("CONNECTING");

  const slug = toRoomSlug(roomCode);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!enabled || !slug) return;
    try {
      const headers: Record<string, string> = {};
      if (hostToken) headers["x-host-token"] = hostToken;
      if (playerToken) headers["x-player-token"] = playerToken;

      const res = await fetch(`/api/rooms/${encodeURIComponent(slug)}`, {
        headers,
        cache: "no-store",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Room "${roomCode}" not found.`);
        setLoading(false);
        return;
      }

      const data = (await res.json()) as T;
      setSnapshot(data);
      setError(null);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [slug, roomCode, enabled, hostToken, playerToken]);

  useEffect(() => {
    if (!enabled || !slug) return;

    let cancelled = false;
    let es: EventSource | null = null;

    const connect = () => {
      if (cancelled) return;
      if (es) {
        es.close();
        es = null;
      }

      const qs = new URLSearchParams();
      if (hostToken) qs.set("hostToken", hostToken);
      if (playerToken) qs.set("playerToken", playerToken);
      const query = qs.toString();
      const url = `/api/rooms/${encodeURIComponent(slug)}/events${
        query ? `?${query}` : ""
      }`;

      es = new EventSource(url);

      es.addEventListener("state", (evt) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse((evt as MessageEvent).data) as T;
          setSnapshot(parsed);
          setError(null);
          setLoading(false);
          setConnectionState("LIVE");
        } catch {}
      });

      es.onopen = () => {
        if (cancelled) return;
        setConnectionState("LIVE");
      };

      es.onerror = () => {
        if (cancelled) return;
        setConnectionState("RECONNECTING");
        es?.close();
        es = null;
        void fetchSnapshot();
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          connect();
        }, 2000);
      };
    };

    connect();
    queueMicrotask(() => {
      if (!cancelled) {
        void fetchSnapshot();
      }
    });

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === "visible") {
        void fetchSnapshot();
        if (!es || es.readyState === EventSource.CLOSED) {
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrOnline);
    window.addEventListener("online", handleVisibilityOrOnline);

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      es?.close();
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityOrOnline
      );
      window.removeEventListener("online", handleVisibilityOrOnline);
    };
  }, [slug, enabled, hostToken, playerToken, fetchSnapshot]);

  return {
    snapshot,
    error,
    loading,
    connectionState,
    refresh: fetchSnapshot,
  };
}
