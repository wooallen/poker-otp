"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Spade,
  Copy,
  Check,
  Users,
  Coins,
  KeyRound,
  Search,
  Lock,
  Unlock,
  ArrowRight,
  ExternalLink,
  Sparkles,
  RotateCcw,
  XCircle,
  FileDown,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useRoomStream } from "@/hooks/useRoomStream";
import { toRoomSlug, withBasePath } from "@/lib/codes";
import {
  setRoomClosureInFirestore,
  toggleBuyInVoidInFirestore,
} from "@/lib/firestore-service";
import { useIsHydrated } from "@/lib/session";
import {
  formatClockTime,
  formatDateTime,
  formatFullDate,
  formatMoney,
} from "@/lib/format";
import { downloadRoomSummaryPdf } from "@/lib/pdf-report";
import type { GuestRoomSnapshot, HostRoomSnapshot } from "@/lib/types";

interface HostConsoleProps {
  roomCode: string;
  isDemoMode?: boolean;
}

interface DemoRosterItem {
  seatAlias: string;
  displayName: string;
}

export function HostConsole({
  roomCode,
  isDemoMode = false,
}: HostConsoleProps) {
  const slug = toRoomSlug(roomCode);
  const hydrated = useIsHydrated();

  const [otpSearch, setOtpSearch] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closeLoading, setCloseLoading] = useState(false);

  const testDialogRef = useRef<HTMLDialogElement | null>(null);
  const closeDialogRef = useRef<HTMLDialogElement | null>(null);

  const demoRoster = useMemo<DemoRosterItem[]>(() => {
    if (!hydrated || typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(`demo_roster_${slug}`);
      return raw ? (JSON.parse(raw) as DemoRosterItem[]) : [];
    } catch {
      return [];
    }
  }, [hydrated, slug]);

  const { snapshot, error, loading, connectionState } = useRoomStream<
    HostRoomSnapshot | GuestRoomSnapshot
  >({
    roomCode: slug,
    viewRole: "HOST",
    enabled: hydrated && Boolean(slug),
  });

  const filteredOtps = useMemo(() => {
    if (!snapshot || snapshot.role !== "HOST") return [];
    const q = otpSearch.trim().toLowerCase();
    if (!q) return snapshot.recentOtps;
    return snapshot.recentOtps.filter(
      (b) =>
        b.otpCode.includes(q) || b.playerName.toLowerCase().includes(q)
    );
  }, [snapshot, otpSearch]);

  async function copyRoomName() {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(snapshot.room.roomName);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {}
  }

  async function copyJoinLink() {
    if (!snapshot) return;
    try {
      const path = withBasePath(
        `/room/?room=${encodeURIComponent(snapshot.room.roomSlug)}`
      );
      const url = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {}
  }

  async function handleToggleVoid(otpCode: string, voided: boolean) {
    setBusyId(otpCode);
    try {
      await toggleBuyInVoidInFirestore({
        roomIdOrName: slug,
        otpCode,
        voided,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRoomClosure(
    action: "CLOSE" | "REOPEN",
    autoDownloadPdf = false
  ) {
    if (!snapshot || snapshot.role !== "HOST") return;
    setCloseLoading(true);
    try {
      const updatedRoom = await setRoomClosureInFirestore({
        roomIdOrName: slug,
        action,
      });
      closeDialogRef.current?.close();
      if (autoDownloadPdf) {
        downloadRoomSummaryPdf({
          ...snapshot,
          room: updatedRoom,
        });
      }
    } finally {
      setCloseLoading(false);
    }
  }

  if (!hydrated || (loading && !snapshot)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Connecting to Host Console...
      </div>
    );
  }

  if (!slug || error || !snapshot) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h1 className="text-xl font-bold text-white">
            {error || "Room Unavailable"}
          </h1>
          <Link
            href="/"
            className="inline-flex min-h-[46px] px-5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm items-center justify-center"
          >
            Return Home
          </Link>
        </div>
      </main>
    );
  }

  if (snapshot.role !== "HOST") {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">
            Host Access Restricted
          </h1>
          <p className="text-sm text-slate-400">
            Only the device that created room{" "}
            <span className="font-mono text-white font-semibold">
              {snapshot.room.roomName}
            </span>{" "}
            can manage the Host Console.
          </p>
          <div className="flex flex-col gap-2.5 pt-2">
            <Link
              href={`/room?room=${encodeURIComponent(slug)}`}
              className="min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition"
            >
              Join Room as Player
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center transition"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { room, totals, players } = snapshot;
  const isClosed = room.status === "CLOSED";

  return (
    <div className="max-w-4xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6 pb-20 space-y-5">
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 hover:bg-amber-400/25 transition"
            title="Home"
          >
            <Spade className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white leading-tight">
                Host Console •{" "}
                <span className="text-amber-300 font-mono">
                  {room.roomName}
                </span>
              </h1>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                  isClosed
                    ? "bg-rose-500/20 text-rose-200 border border-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
                }`}
              >
                {room.status}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {formatFullDate(room.createdAt)} • Started{" "}
              <span className="font-mono text-slate-300">
                {formatClockTime(room.createdAt)}
              </span>
              {room.endedAt && (
                <>
                  {" "}
                  • Ended{" "}
                  <span className="font-mono text-rose-300">
                    {formatClockTime(room.endedAt)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isClosed && (
            <button
              type="button"
              onClick={() => testDialogRef.current?.showModal()}
              className="min-h-[38px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-emerald-300 inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Test Player Tabs
            </button>
          )}

          {!isClosed ? (
            <button
              type="button"
              onClick={() => closeDialogRef.current?.showModal()}
              className="min-h-[38px] px-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-lg shadow-rose-950/40 transition cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Close Room
            </button>
          ) : (
            <button
              type="button"
              onClick={() => downloadRoomSummaryPdf(snapshot)}
              className="min-h-[38px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download PDF
            </button>
          )}

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
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
            {connectionState === "LIVE" ? "LIVE" : "SYNCING"}
          </span>
        </div>
      </header>

      {/* CLOSED ROOM SUMMARY & PDF DOWNLOAD BANNER */}
      {isClosed && (
        <section
          aria-label="Closed room PDF summary"
          className="rounded-3xl bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-900 border-2 border-emerald-400/50 p-5 shadow-2xl"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                Room Closed • Final Summary Ready
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {room.roomName} — Session Summary
              </h2>
              <div className="text-xs text-slate-300 space-y-0.5 font-mono">
                <div>Started: {formatDateTime(room.createdAt)}</div>
                <div>
                  Ended:{" "}
                  {room.endedAt ? formatDateTime(room.endedAt) : "Just now"}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-2">
              <button
                type="button"
                onClick={() => downloadRoomSummaryPdf(snapshot)}
                className="min-h-[48px] px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 transition cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                Download Summary PDF
              </button>
              <button
                type="button"
                disabled={closeLoading}
                onClick={() => handleRoomClosure("REOPEN", false)}
                className="text-xs font-semibold text-slate-400 hover:text-amber-300 inline-flex items-center justify-center gap-1 py-1 cursor-pointer"
              >
                <Unlock className="w-3 h-3" />
                Reopen Room
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Side-by-Side Demo Launcher Strip */}
      {!isClosed && (isDemoMode || demoRoster.length > 0) && (
        <section className="rounded-2xl bg-emerald-950/40 border border-emerald-500/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-xs text-emerald-100">
            <span className="font-bold text-emerald-300">
              Side-by-Side Test:
            </span>{" "}
            Open any player&apos;s phone screen in a new tab:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {demoRoster.map((dp) => (
              <a
                key={dp.seatAlias}
                href={withBasePath(
                  `/room/?room=${encodeURIComponent(
                    room.roomSlug
                  )}&seat=${encodeURIComponent(dp.seatAlias)}`
                )}
                target="_blank"
                rel="noreferrer"
                className="min-h-[34px] px-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/30 text-xs font-semibold text-white inline-flex items-center gap-1 transition"
              >
                {dp.displayName}
                <ExternalLink className="w-3 h-3 text-emerald-400" />
              </a>
            ))}
            <a
              href={withBasePath(
                `/room/?room=${encodeURIComponent(room.roomSlug)}&seat=player-${
                  totals.playerCount + 1
                }`
              )}
              target="_blank"
              rel="noreferrer"
              className="min-h-[34px] px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 inline-flex items-center gap-1 transition"
            >
              + New Player Tab
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </section>
      )}

      {/* Room Invite & Grand Totals Header */}
      <section className="rounded-3xl bg-slate-900/95 border border-slate-800 p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl bg-slate-950 border border-slate-700 px-3.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Room ID / Name
              </div>
              <div className="font-mono text-xl sm:text-2xl font-black text-amber-300">
                {room.roomName}
              </div>
            </div>

            {!isClosed && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyRoomName}
                  className="min-h-[42px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      Copy Room ID
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={copyJoinLink}
                  className="min-h-[42px] px-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-xs font-semibold text-emerald-200 inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Link Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-emerald-300" />
                      Copy Join Link
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400">
            1 Buy-In ={" "}
            <span className="font-mono text-white font-bold">
              {formatMoney(room.currency, room.fixedBuyIn)}
            </span>{" "}
            (1 OTP per unit)
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="rounded-2xl bg-slate-950/90 border border-slate-800/90 p-3 sm:p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Users className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">Players</span>
            </div>
            <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
              {totals.playerCount}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/90 border border-slate-800/90 p-3 sm:p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Total OTPs / Units</span>
            </div>
            <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-amber-300 tabular-nums">
              {totals.totalBuyInUnits}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/90 border border-slate-800/90 p-3 sm:p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Room Total</span>
            </div>
            <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-emerald-300 tabular-nums truncate">
              {formatMoney(room.currency, totals.grandRunningTotal)}
            </div>
          </div>
        </div>
      </section>

      {/* PLAYERS & RUNNING TOTALS */}
      <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              Player Running Totals ({players.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live buy-in running total and timestamped 4-digit OTPs per player.
            </p>
          </div>
          {players.length > 0 && (
            <button
              type="button"
              onClick={() => downloadRoomSummaryPdf(snapshot)}
              className="self-start sm:self-auto min-h-[36px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-400" />
              Export PDF
            </button>
          )}
        </div>

        {players.length === 0 ? (
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-8 text-center">
            <p className="text-sm font-medium text-slate-300">
              No players have joined yet.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Share Room ID{" "}
              <span className="font-mono text-amber-300 font-semibold">
                {room.roomName}
              </span>{" "}
              or click Copy Join Link above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {players.map((player) => {
              const activeOtps = player.buyIns
                .filter((b) => b.status === "ACTIVE")
                .slice()
                .reverse();
              return (
                <div
                  key={player.id}
                  className="rounded-2xl bg-slate-950/95 border border-slate-800 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-white">
                        {player.displayName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {player.buyInCount} buy-in
                        {player.buyInCount === 1 ? "" : "s"} ×{" "}
                        {formatMoney(room.currency, room.fixedBuyIn)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400">
                        Running Total
                      </div>
                      <div className="font-mono text-2xl font-black text-emerald-300 tabular-nums">
                        {formatMoney(room.currency, player.runningTotal)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80">
                    {activeOtps.length === 0 ? (
                      <span className="text-xs text-slate-500">
                        No buy-ins requested yet
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {activeOtps.map((bi, idx) => (
                          <div
                            key={bi.id}
                            className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1.5 rounded-xl"
                          >
                            <span className="text-[10px] font-mono text-slate-400">
                              #{idx + 1}
                            </span>
                            <span className="font-mono text-xs font-black tracking-wider text-amber-300 tabular-nums">
                              {bi.otpCode}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 border-l border-slate-800 pl-2">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {formatClockTime(bi.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* LIVE OTP FEED & PAPER CROSS-CHECK SEARCH */}
      <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              Timestamped 4-Digit OTP Log ({snapshot.recentOtps.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cross-check any 4-digit OTP written on your paper sheet with its
              exact timestamp.
            </p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Search 4-digit OTP (e.g. 0419) or player name..."
            value={otpSearch}
            onChange={(e) => setOtpSearch(e.target.value)}
            className="w-full min-h-[48px] rounded-2xl bg-slate-950 border border-slate-700 focus:border-amber-400 pl-10 pr-20 font-mono text-base text-white placeholder:font-sans placeholder:text-sm placeholder:text-slate-500 outline-none"
          />
          {otpSearch && (
            <button
              type="button"
              onClick={() => setOtpSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-white px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>

        {filteredOtps.length === 0 ? (
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-6 text-center text-xs text-slate-400">
            {otpSearch
              ? `No OTP matches "${otpSearch}".`
              : "Generated 4-digit OTP codes will appear here in real time."}
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredOtps.map((item) => {
              const isVoided = item.status === "VOIDED";
              const isExactMatch =
                otpSearch.trim().length === 4 &&
                item.otpCode === otpSearch.trim();

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl px-3.5 py-3 border flex items-center justify-between gap-3 ${
                    isVoided
                      ? "bg-slate-950/40 border-slate-800/60 opacity-60"
                      : isExactMatch
                      ? "bg-amber-400/15 border-amber-400"
                      : "bg-slate-950/90 border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`font-mono text-lg font-black tracking-widest px-2.5 py-1 rounded-xl tabular-nums shrink-0 ${
                        isVoided
                          ? "line-through bg-slate-900 text-slate-500"
                          : "bg-amber-400/15 border border-amber-400/35 text-amber-300"
                      }`}
                    >
                      {item.otpCode}
                    </span>

                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        {item.playerName}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {formatMoney(room.currency, item.amount)} •{" "}
                        {formatDateTime(item.createdAt)}
                      </div>
                    </div>
                  </div>

                  {!isClosed && (
                    <button
                      type="button"
                      disabled={busyId === item.otpCode}
                      onClick={() =>
                        handleToggleVoid(item.otpCode, !isVoided)
                      }
                      className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer shrink-0 ${
                        isVoided
                          ? "bg-slate-800 hover:bg-slate-700 text-emerald-300"
                          : "bg-slate-900 hover:bg-rose-500/20 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-200"
                      }`}
                    >
                      {isVoided ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          Void
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CLOSE ROOM CONFIRMATION & PDF MODAL */}
      <dialog
        ref={closeDialogRef}
        aria-labelledby="close-room-dialog-title"
        className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 text-slate-100 p-5 shadow-2xl"
      >
        <h1 id="close-room-dialog-title" className="text-lg font-bold text-white">
          Close Room &amp; Finalize Summary?
        </h1>
        <p className="text-sm text-slate-300 mt-1.5">
          Closing{" "}
          <span className="font-mono font-bold text-amber-300">
            {room.roomName}
          </span>{" "}
          will lock new buy-ins, stamp the session end time, and prepare your
          downloadable PDF report.
        </p>

        <div className="mt-4 rounded-2xl bg-slate-950 border border-slate-800 p-3.5 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Started</span>
            <span className="font-mono text-slate-200">
              {formatDateTime(room.createdAt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Players</span>
            <span className="font-mono text-white font-semibold">
              {totals.playerCount}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total Buy-Ins / OTPs</span>
            <span className="font-mono text-amber-300 font-semibold">
              {totals.totalBuyInUnits}
            </span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-slate-800">
            <span className="text-slate-300 font-semibold">Room Total</span>
            <span className="font-mono text-emerald-300 font-bold text-sm">
              {formatMoney(room.currency, totals.grandRunningTotal)}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={closeLoading}
            onClick={() => handleRoomClosure("CLOSE", true)}
            className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            {closeLoading
              ? "Closing Room..."
              : "Close Room & Download PDF Summary"}
          </button>
          <button
            type="button"
            disabled={closeLoading}
            onClick={() => handleRoomClosure("CLOSE", false)}
            className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs cursor-pointer"
          >
            Close Room Only
          </button>
          <button
            type="button"
            onClick={() => closeDialogRef.current?.close()}
            className="w-full min-h-[40px] rounded-xl text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </dialog>

      {/* MULTI-TAB PLAYER TEST DIALOG */}
      <dialog
        ref={testDialogRef}
        aria-labelledby="test-dialog-title"
        className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 text-slate-100 p-5 shadow-2xl"
      >
        <h1 id="test-dialog-title" className="text-lg font-bold text-white">
          Open Simulated Player Tabs
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Each link opens an isolated player seat so you can test multiple
          players side-by-side in the same browser window.
        </p>

        <div className="mt-4 space-y-2">
          {["seat1", "seat2", "seat3"].map((slot, idx) => (
            <a
              key={slot}
              href={withBasePath(
                `/room/?room=${encodeURIComponent(room.roomSlug)}&seat=${slot}`
              )}
              target="_blank"
              rel="noreferrer"
              className="w-full min-h-[44px] rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3.5 flex items-center justify-between text-sm font-semibold text-emerald-300 transition"
            >
              <span>Open Simulated Player Tab #{idx + 1}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          ))}
        </div>

        <form method="dialog" className="mt-4">
          <button
            value="close"
            className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white cursor-pointer"
          >
            Close
          </button>
        </form>
      </dialog>
    </div>
  );
}
