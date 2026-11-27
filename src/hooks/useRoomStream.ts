"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db, ensureAuthUid } from "@/lib/firebase";
import { buildPlayerId, toRoomSlug } from "@/lib/codes";
import type {
  BuyInOtpItem,
  GuestRoomSnapshot,
  HostRoomSnapshot,
  PlayerRoomSnapshot,
  PlayerRunningSummary,
  PublicRoom,
  RoomSnapshot,
} from "@/lib/types";

export type ConnectionState = "CONNECTING" | "LIVE" | "RECONNECTING" | "ERROR";

interface RawPlayerDoc {
  id: string;
  roomSlug: string;
  uid: string;
  displayName: string;
  joinedAt: string;
}

interface UseRoomStreamOptions {
  roomCode: string;
  viewRole: "HOST" | "PLAYER";
  seatAlias?: string | null;
  enabled?: boolean;
}

function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function useRoomStream<T extends RoomSnapshot = RoomSnapshot>({
  roomCode,
  viewRole,
  seatAlias = null,
  enabled = true,
}: UseRoomStreamOptions) {
  const slug = toRoomSlug(roomCode);

  const [uid, setUid] = useState<string | null>(null);
  const [roomDoc, setRoomDoc] = useState<PublicRoom | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  const [playersDocs, setPlayersDocs] = useState<RawPlayerDoc[]>([]);
  const [buyInsDocs, setBuyInsDocs] = useState<BuyInOtpItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("CONNECTING");

  useEffect(() => {
    if (!enabled || !slug) return;

    let cancelled = false;
    let unsubRoom: (() => void) | null = null;
    let unsubPlayers: (() => void) | null = null;
    let unsubBuyIns: (() => void) | null = null;

    void ensureAuthUid()
      .then((resolvedUid) => {
        if (cancelled) return;
        setUid(resolvedUid);

        unsubRoom = onSnapshot(
          doc(db, "rooms", slug),
          (snap) => {
            if (cancelled) return;
            if (!snap.exists()) {
              setRoomDoc(null);
              setRoomMissing(true);
              setError(`Room "${roomCode}" not found.`);
              setLoading(false);
              setConnectionState("LIVE");
              return;
            }
            const data = snap.data() as Omit<PublicRoom, "id">;
            setRoomDoc({ id: snap.id, ...data });
            setRoomMissing(false);
            setError(null);
            setLoading(false);
            setConnectionState("LIVE");
          },
          (err) => {
            if (cancelled) return;
            setError(err.message || "Unable to connect to room.");
            setLoading(false);
            setConnectionState("ERROR");
          }
        );

        unsubPlayers = onSnapshot(
          collection(db, "rooms", slug, "players"),
          (snap) => {
            if (cancelled) return;
            const list: RawPlayerDoc[] = snap.docs
              .map((d) => d.data() as RawPlayerDoc)
              .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
            setPlayersDocs(list);
          }
        );

        unsubBuyIns = onSnapshot(
          collection(db, "rooms", slug, "buyIns"),
          (snap) => {
            if (cancelled) return;
            const list: BuyInOtpItem[] = snap.docs
              .map((d) => d.data() as BuyInOtpItem)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            setBuyInsDocs(list);
          }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Authentication failed."
        );
        setLoading(false);
        setConnectionState("ERROR");
      });

    return () => {
      cancelled = true;
      unsubRoom?.();
      unsubPlayers?.();
      unsubBuyIns?.();
    };
  }, [slug, roomCode, enabled]);

  const snapshot = useMemo<T | null>(() => {
    if (!roomDoc || !uid) return null;

    const serverTime = new Date().toISOString();
    const playerMap = new Map(playersDocs.map((p) => [p.id, p]));

    const enrichedOtps: BuyInOtpItem[] = buyInsDocs.map((b) => ({
      ...b,
      playerName: playerMap.get(b.playerId)?.displayName ?? b.playerName,
    }));

    const summaries: PlayerRunningSummary[] = playersDocs.map((p) => {
      const myBuyIns = enrichedOtps.filter((b) => b.playerId === p.id);
      const activeBuyIns = myBuyIns.filter((b) => b.status === "ACTIVE");
      const runningTotal = roundMoney(
        activeBuyIns.reduce((sum, b) => sum + b.amount, 0)
      );
      return {
        id: p.id,
        uid: p.uid,
        displayName: p.displayName,
        joinedAt: p.joinedAt,
        buyInCount: activeBuyIns.length,
        runningTotal,
        buyIns: myBuyIns,
      };
    });

    const activeAll = enrichedOtps.filter((b) => b.status === "ACTIVE");
    const totals = {
      playerCount: playersDocs.length,
      totalBuyInUnits: activeAll.length,
      grandRunningTotal: roundMoney(
        activeAll.reduce((sum, b) => sum + b.amount, 0)
      ),
    };

    const isHostUser = roomDoc.hostUid === uid;

    if (viewRole === "HOST") {
      if (isHostUser) {
        const hostSnap: HostRoomSnapshot = {
          role: "HOST",
          room: roomDoc,
          totals,
          players: summaries,
          recentOtps: enrichedOtps,
          serverTime,
        };
        return hostSnap as unknown as T;
      }
      const unauthorizedGuest: GuestRoomSnapshot = {
        role: "GUEST",
        room: roomDoc,
        totals,
        isAlsoHost: false,
        serverTime,
      };
      return unauthorizedGuest as unknown as T;
    }

    const myPlayerId = buildPlayerId(uid, seatAlias);
    const meSummary = summaries.find((s) => s.id === myPlayerId);

    if (meSummary) {
      const otherPlayers = summaries
        .filter((s) => s.id !== myPlayerId)
        .map((s) => ({
          id: s.id,
          displayName: s.displayName,
          buyInCount: s.buyInCount,
          runningTotal: s.runningTotal,
        }));

      const playerSnap: PlayerRoomSnapshot = {
        role: "PLAYER",
        room: roomDoc,
        totals,
        me: meSummary,
        otherPlayers,
        isAlsoHost: isHostUser,
        serverTime,
      };
      return playerSnap as unknown as T;
    }

    const guestSnap: GuestRoomSnapshot = {
      role: "GUEST",
      room: roomDoc,
      totals,
      isAlsoHost: isHostUser,
      serverTime,
    };
    return guestSnap as unknown as T;
  }, [roomDoc, uid, playersDocs, buyInsDocs, viewRole, seatAlias]);

  return {
    snapshot,
    error: roomMissing ? `Room "${roomCode}" not found.` : error,
    loading,
    connectionState,
  };
}
