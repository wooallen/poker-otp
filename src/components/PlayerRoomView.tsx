"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Spade,
  Coins,
  ArrowRight,
  Minus,
  Plus,
  KeyRound,
  Receipt,
  Users,
  Lock,
} from "lucide-react";
import { useRoomStream } from "@/hooks/useRoomStream";
import {
  joinRoomInFirestore,
  requestBuyInsInFirestore,
} from "@/lib/firestore-service";
import { markLastPlayerRoom, useIsHydrated } from "@/lib/session";
import { formatClockTime, formatDateTime, formatMoney } from "@/lib/format";
import type { GuestRoomSnapshot, PlayerRoomSnapshot } from "@/lib/types";

interface PlayerRoomViewProps {
  roomCode: string;
  seatAlias?: string | null;
}

const QUICK_MULTIPLIERS = [1, 2, 3, 4, 5];

export function PlayerRoomView({
  roomCode,
  seatAlias = null,
}: PlayerRoomViewProps) {
  const hydrated = useIsHydrated();

  // Direct link join form state
  const [displayName, setDisplayName] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Multiplier selection (1x, 2x, 3x... of fixed buy-in)
  const [multiplier, setMultiplier] = useState<number>(1);
  const [buyInLoading, setBuyInLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [justGeneratedBatchId, setJustGeneratedBatchId] = useState<
    string | null
  >(null);

  const { snapshot, error, loading, connectionState } = useRoomStream<
    PlayerRoomSnapshot | GuestRoomSnapshot
  >({
    roomCode,
    viewRole: "PLAYER",
    seatAlias,
    enabled: hydrated && Boolean(roomCode),
  });

  const latestBatchOtps = useMemo(() => {
    if (!snapshot || snapshot.role !== "PLAYER") return [];
    const active = snapshot.me.buyIns.filter((b) => b.status === "ACTIVE");
    if (active.length === 0) return [];
    const targetBatch = justGeneratedBatchId
      ? active.some((b) => b.batchId === justGeneratedBatchId)
        ? justGeneratedBatchId
        : active[0].batchId
      : active[0].batchId;
    return active
      .filter((b) => b.batchId === targetBatch)
      .slice()
      .reverse();
  }, [snapshot, justGeneratedBatchId]);

  async function handleDirectJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    if (!displayName.trim()) {
      setJoinError("Enter your name.");
      return;
    }

    setJoinLoading(true);
    try {
      const res = await joinRoomInFirestore({
        roomIdOrName: roomCode,
        displayName: displayName.trim(),
        seatAlias,
      });
      if (!seatAlias) {
        markLastPlayerRoom(res.room.roomSlug);
      }
      setJoinLoading(false);
    } catch (err) {
      setJoinError(
        err instanceof Error ? err.message : "Unable to join room."
      );
      setJoinLoading(false);
    }
  }

  async function handleRequestBuyIns() {
    if (multiplier < 1) return;
    setBuyInLoading(true);
    setErrorMsg(null);
    try {
      const res = await requestBuyInsInFirestore({
        roomIdOrName: roomCode,
        seatAlias,
        quantity: multiplier,
      });
      setJustGeneratedBatchId(res.batchId);
      setMultiplier(1);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not generate buy-in OTP."
      );
    } finally {
      setBuyInLoading(false);
    }
  }

  if (!hydrated || (loading && !snapshot)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Connecting to room...
      </div>
    );
  }

  if (!roomCode || error || !snapshot) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h1 className="text-xl font-bold text-white">
            {error || "Room Not Found"}
          </h1>
          <p className="text-sm text-slate-400">
            Check the Room ID or Name with your host and try again.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-[48px] px-6 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm items-center justify-center"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  const { room, totals } = snapshot;
  const isClosed = room.status === "CLOSED";

  // ==================== GUEST DIRECT SHARE LINK JOIN ====================
  if (snapshot.role === "GUEST") {
    return (
      <main className="max-w-md w-full mx-auto px-4 py-8 sm:py-12">
        <div className="rounded-3xl bg-slate-900/95 border border-slate-800 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Spade className="w-4 h-4" />
              Join Poker Room
            </span>
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-300">
              {room.roomName}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-white">{room.roomName}</h1>
          <p className="text-sm text-slate-400 mt-1">
            Fixed Buy-In:{" "}
            <span className="font-mono font-semibold text-slate-200">
              {formatMoney(room.currency, room.fixedBuyIn)}
            </span>{" "}
            • {totals.playerCount} player{totals.playerCount === 1 ? "" : "s"}{" "}
            in room
          </p>

          {isClosed ? (
            <div className="mt-6 rounded-2xl bg-slate-950 border border-slate-800 p-4 text-sm text-slate-300">
              This room has already been closed by the host.
            </div>
          ) : (
            <form onSubmit={handleDirectJoin} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="direct-join-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  Your Name
                </label>
                <input
                  id="direct-join-name"
                  type="text"
                  maxLength={32}
                  placeholder="e.g. Jason"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[52px] rounded-2xl bg-slate-950 border border-slate-700 focus:border-emerald-400 px-4 text-base text-white outline-none"
                  autoFocus
                  required
                />
              </div>

              {joinError && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3.5 py-2.5 text-sm text-rose-200"
                >
                  {joinError}
                </div>
              )}

              <button
                type="submit"
                disabled={joinLoading}
                className="w-full min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-base flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {joinLoading ? "Joining..." : "Join Room"}
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          )}

          {snapshot.isAlsoHost && !seatAlias && (
            <div className="mt-5 pt-4 border-t border-slate-800 text-center">
              <Link
                href={`/host?room=${encodeURIComponent(room.roomSlug)}`}
                className="text-xs font-semibold text-amber-300 hover:text-amber-200"
              >
                Open Host View for {room.roomName} →
              </Link>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ==================== JOINED PLAYER VIEW ====================
  const { me, otherPlayers } = snapshot;
  const activeBuyIns = me.buyIns.filter((b) => b.status === "ACTIVE");
  const voidedBuyIns = me.buyIns.filter((b) => b.status === "VOIDED");
  const selectedTotal = Math.round(room.fixedBuyIn * multiplier * 100) / 100;

  return (
    <main className="max-w-md w-full mx-auto px-4 py-4 sm:py-6 pb-16 space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0"
            title="Home"
          >
            <Spade className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white truncate">
                {room.roomName}
              </h1>
              {isClosed && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-500/20 text-rose-200 border border-rose-500/30">
                  CLOSED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">
              Player:{" "}
              <span className="text-white font-semibold">{me.displayName}</span>{" "}
              • Unit:{" "}
              <span className="font-mono text-slate-200">
                {formatMoney(room.currency, room.fixedBuyIn)}
              </span>
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border shrink-0 ${
            connectionState === "LIVE"
              ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
              : "bg-amber-950/60 border-amber-500/30 text-amber-300"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connectionState === "LIVE"
                ? "bg-emerald-400 animate-pulse"
                : "bg-amber-400"
            }`}
          />
          {connectionState === "LIVE" ? "LIVE" : "SYNC"}
        </span>
      </header>

      {/* PLAYER RUNNING TOTAL CARD */}
      <section
        aria-label="Your running buy-in total"
        className="rounded-3xl bg-slate-900/95 border border-slate-800 p-4 sm:p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              My Running Total
            </div>
            <div className="font-mono text-3xl sm:text-4xl font-black text-emerald-300 mt-1 tabular-nums">
              {formatMoney(room.currency, me.runningTotal)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {me.buyInCount} buy-in{me.buyInCount === 1 ? "" : "s"} ×{" "}
              <span className="font-mono text-slate-300">
                {formatMoney(room.currency, room.fixedBuyIn)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950 border border-slate-800 px-3.5 py-3 text-right">
            <div className="text-[11px] text-slate-400">Room Total</div>
            <div className="font-mono text-lg font-bold text-white tabular-nums mt-0.5">
              {formatMoney(room.currency, totals.grandRunningTotal)}
            </div>
            <div className="text-[11px] text-slate-500">
              {totals.totalBuyInUnits} total buy-ins
            </div>
          </div>
        </div>
      </section>

      {/* LATEST GENERATED 4-DIGIT OTP TICKET(S) — TELL HOST */}
      {!isClosed && latestBatchOtps.length > 0 && (
        <section
          aria-label="Latest buy-in OTP codes"
          className="rounded-3xl bg-gradient-to-b from-amber-500/20 via-slate-900 to-slate-900 border-2 border-amber-400/60 p-5 shadow-2xl shadow-amber-950/25"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
              <KeyRound className="w-3.5 h-3.5" />
              {latestBatchOtps.length === 1
                ? "Your Latest Buy-In OTP"
                : `Your Latest ${latestBatchOtps.length} Buy-In OTPs`}
            </span>
            <span className="font-mono text-xs text-slate-400">
              {formatClockTime(latestBatchOtps[0].createdAt)}
            </span>
          </div>

          <p className="text-xs text-slate-300 mb-3.5">
            Tell the Host{" "}
            {latestBatchOtps.length === 1
              ? "this 4-digit OTP"
              : `these ${latestBatchOtps.length} OTP codes`}{" "}
            so they can write{" "}
            {latestBatchOtps.length === 1 ? "it" : "them"} down and hand you{" "}
            <span className="font-mono font-bold text-white">
              {formatMoney(
                room.currency,
                latestBatchOtps.length * room.fixedBuyIn
              )}
            </span>{" "}
            in chips:
          </p>

          <div
            className={`grid gap-2.5 ${
              latestBatchOtps.length === 1 ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {latestBatchOtps.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-2xl bg-slate-950/95 border border-amber-400/40 py-3.5 px-3 text-center"
              >
                {latestBatchOtps.length > 1 && (
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                    Buy-In {idx + 1} of {latestBatchOtps.length} (
                    {formatMoney(room.currency, item.amount)})
                  </div>
                )}
                <div className="font-mono text-4xl font-black tracking-[0.2em] text-amber-300 tabular-nums select-all">
                  {item.otpCode}
                </div>
                <div className="font-mono text-[11px] text-slate-400 mt-1">
                  {formatClockTime(item.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* REQUEST BUY-IN OR CLOSED ROOM BANNER */}
      {isClosed ? (
        <section className="rounded-3xl bg-slate-900/95 border border-rose-500/30 p-5 space-y-2">
          <div className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-300">
            <Lock className="w-4 h-4" />
            Room Closed by Host
          </div>
          <p className="text-xs text-slate-400">
            New buy-ins are now locked. Your final running total is{" "}
            <span className="font-mono font-bold text-emerald-300">
              {formatMoney(room.currency, me.runningTotal)}
            </span>{" "}
            ({me.buyInCount} buy-in{me.buyInCount === 1 ? "" : "s"}).
          </p>
          <div className="pt-2 border-t border-slate-800 text-xs font-mono text-slate-400 space-y-0.5">
            <div>Started: {formatDateTime(room.createdAt)}</div>
            {room.endedAt && <div>Ended: {formatDateTime(room.endedAt)}</div>}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl bg-slate-900/95 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                Request Buy-In
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Fixed buy-in is{" "}
                <span className="font-mono text-slate-200 font-semibold">
                  {formatMoney(room.currency, room.fixedBuyIn)}
                </span>
                . Each multiple generates its own 4-digit OTP.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {QUICK_MULTIPLIERS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMultiplier(m)}
                className={`min-h-[44px] rounded-xl font-mono text-sm font-bold border transition cursor-pointer ${
                  multiplier === m
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600"
                }`}
              >
                {m}×
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-slate-950 border border-slate-800 p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">
                {multiplier} × {formatMoney(room.currency, room.fixedBuyIn)}
              </div>
              <div className="font-mono text-lg font-extrabold text-white tabular-nums">
                {formatMoney(room.currency, selectedTotal)}{" "}
                <span className="text-xs font-sans font-semibold text-amber-300">
                  → {multiplier} OTP code{multiplier === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease buy-in multiple"
                disabled={multiplier <= 1}
                onClick={() => setMultiplier((m) => Math.max(1, m - 1))}
                className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 flex items-center justify-center text-white cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-mono text-base font-bold text-white tabular-nums">
                {multiplier}
              </span>
              <button
                type="button"
                aria-label="Increase buy-in multiple"
                disabled={multiplier >= 20}
                onClick={() => setMultiplier((m) => Math.min(20, m + 1))}
                className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 flex items-center justify-center text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3.5 py-2.5 text-sm text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            disabled={buyInLoading}
            onClick={handleRequestBuyIns}
            className="w-full min-h-[54px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 transition cursor-pointer"
          >
            {buyInLoading
              ? "Generating OTP..."
              : multiplier === 1
              ? `Buy In ${formatMoney(room.currency, selectedTotal)} (Get 1 OTP)`
              : `Buy In ${multiplier}× (${formatMoney(
                  room.currency,
                  selectedTotal
                )}) — Get ${multiplier} OTPs`}
          </button>
        </section>
      )}

      {/* MY COMPLETE TIMESTAMPED OTP & BUY-IN HISTORY */}
      <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            My Buy-Ins &amp; OTPs ({activeBuyIns.length})
          </h2>
          <span className="font-mono text-xs font-bold text-emerald-300">
            Total: {formatMoney(room.currency, me.runningTotal)}
          </span>
        </div>

        {activeBuyIns.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No buy-ins yet. Select how many buy-ins you want above to generate
            your 4-digit OTP code(s).
          </p>
        ) : (
          <div className="space-y-2">
            {activeBuyIns.map((item, idx) => {
              const buyInNumber = activeBuyIns.length - idx;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-slate-950/90 border border-slate-800 px-3.5 py-3 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-black tracking-widest text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 rounded-xl tabular-nums">
                      {item.otpCode}
                    </span>
                    <div>
                      <div className="font-mono text-sm font-bold text-white tabular-nums">
                        {formatMoney(room.currency, item.amount)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Buy-In #{buyInNumber}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono text-xs text-slate-400 text-right">
                    {formatDateTime(item.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {voidedBuyIns.length > 0 && (
          <details className="mt-4 pt-3 border-t border-slate-800/80">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
              Voided by host ({voidedBuyIns.length})
            </summary>
            <div className="mt-2 space-y-1.5">
              {voidedBuyIns.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl bg-slate-950/50 px-3 py-2 flex items-center justify-between text-xs text-slate-500"
                >
                  <span className="font-mono line-through">
                    OTP {v.otpCode} • {formatMoney(room.currency, v.amount)}
                  </span>
                  <span>{formatClockTime(v.createdAt)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* OTHER PLAYERS RUNNING TOTALS */}
      {otherPlayers.length > 0 && (
        <section className="rounded-3xl bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-3">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            Table Running Totals
          </h2>
          <div className="space-y-2">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 flex items-center justify-between text-sm">
              <span className="font-semibold text-emerald-200">
                {me.displayName} (You)
              </span>
              <span className="font-mono font-bold text-emerald-300 tabular-nums">
                {me.buyInCount}× • {formatMoney(room.currency, me.runningTotal)}
              </span>
            </div>
            {otherPlayers.map((p) => (
              <div
                key={p.id}
                className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-3.5 py-2.5 flex items-center justify-between text-sm"
              >
                <span className="text-slate-200 font-medium">
                  {p.displayName}
                </span>
                <span className="font-mono text-slate-300 font-semibold tabular-nums">
                  {p.buyInCount}× •{" "}
                  {formatMoney(room.currency, p.runningTotal)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
