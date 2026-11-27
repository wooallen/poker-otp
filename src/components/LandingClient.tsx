"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Spade,
  ShieldCheck,
  Users,
  ArrowRight,
  Sparkles,
  KeyRound,
  Coins,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import { toRoomSlug } from "@/lib/codes";
import {
  getPlayerToken,
  getRecentSessions,
  saveHostToken,
  savePlayerToken,
  useIsHydrated,
} from "@/lib/session";

const RANDOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeClientShortId(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return out;
}

export function LandingClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"JOIN" | "CREATE">("JOIN");

  // Join Room state
  const [joinRoomInput, setJoinRoomInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Create Room state
  const [roomName, setRoomName] = useState("");
  const [fixedBuyIn, setFixedBuyIn] = useState("500");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Demo state
  const [demoLoading, setDemoLoading] = useState(false);

  const hydrated = useIsHydrated();
  const recentSessions = hydrated
    ? getRecentSessions()
    : { lastHostRoom: null, lastPlayerRoom: null };

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);

    const slug = toRoomSlug(joinRoomInput);
    if (!slug) {
      setJoinError("Enter the Room ID or Name given by your host.");
      return;
    }
    if (!displayName.trim()) {
      setJoinError("Enter your name to join the room.");
      return;
    }

    setJoinLoading(true);
    try {
      const existingPlayerToken = getPlayerToken(slug);
      const res = await fetch(`/api/rooms/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          existingPlayerToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error || "Unable to join room.");
        setJoinLoading(false);
        return;
      }

      savePlayerToken(data.room.roomSlug, data.playerToken);
      router.push(`/room/${encodeURIComponent(data.room.roomSlug)}`);
    } catch {
      setJoinError("Network error while joining room.");
      setJoinLoading(false);
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    const buyInNum = Number(fixedBuyIn);
    if (!Number.isFinite(buyInNum) || buyInNum <= 0) {
      setCreateError("Fixed buy-in amount must be greater than 0.");
      return;
    }

    setCreateLoading(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: roomName.trim(), // Blank auto-generates a unique short ID on server
          currency: "RM",
          fixedBuyIn: buyInNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create room.");
        setCreateLoading(false);
        return;
      }

      saveHostToken(data.room.roomSlug, data.hostToken);
      router.push(`/room/${encodeURIComponent(data.room.roomSlug)}/host`);
    } catch {
      setCreateError("Network error while creating room.");
      setCreateLoading(false);
    }
  }

  async function handleLaunchDemo() {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDemoLoading(false);
        return;
      }

      saveHostToken(data.roomSlug, data.hostToken);
      for (const dp of data.demoPlayers) {
        savePlayerToken(data.roomSlug, dp.playerToken, dp.seatAlias);
      }
      try {
        window.localStorage.setItem(
          `demo_roster_${data.roomSlug}`,
          JSON.stringify(data.demoPlayers)
        );
      } catch {}

      router.push(`/room/${encodeURIComponent(data.roomSlug)}/host?demo=1`);
    } catch {
      setDemoLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col justify-between max-w-lg w-full mx-auto px-4 py-6 sm:py-10">
      <div>
        {/* Brand Header */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/50">
              <Spade className="w-5 h-5 fill-emerald-400/20" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">
                Poker<span className="text-emerald-400">OTP</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                4-Digit Buy-In OTP &amp; Running Total Tracker
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/90 border border-slate-800 px-3 py-1 text-xs font-medium text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Sync
          </span>
        </header>

        {/* Resume Previous Session Banner */}
        {(recentSessions.lastHostRoom || recentSessions.lastPlayerRoom) && (
          <section
            aria-label="Saved sessions"
            className="mb-5 rounded-2xl bg-slate-900/80 border border-slate-800 p-3.5 flex flex-col gap-2"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              Resume your active room
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSessions.lastHostRoom && (
                <Link
                  href={`/room/${encodeURIComponent(
                    recentSessions.lastHostRoom
                  )}/host`}
                  className="flex-1 min-w-[160px] inline-flex items-center justify-between gap-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 px-3.5 py-2.5 text-sm font-semibold text-amber-200 transition"
                >
                  <span className="truncate">
                    Host •{" "}
                    <span className="font-mono">
                      {recentSessions.lastHostRoom}
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Link>
              )}
              {recentSessions.lastPlayerRoom && (
                <Link
                  href={`/room/${encodeURIComponent(
                    recentSessions.lastPlayerRoom
                  )}`}
                  className="flex-1 min-w-[160px] inline-flex items-center justify-between gap-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 px-3.5 py-2.5 text-sm font-semibold text-emerald-200 transition"
                >
                  <span className="truncate">
                    Player •{" "}
                    <span className="font-mono">
                      {recentSessions.lastPlayerRoom}
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Mode Switcher */}
        <div
          role="tablist"
          aria-label="Choose role"
          className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-900/95 border border-slate-800 mb-5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "JOIN"}
            onClick={() => setMode("JOIN")}
            className={`min-h-[46px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
              mode === "JOIN"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/50"
                : "text-slate-300 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            <Users className="w-4 h-4" />
            Join Room
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "CREATE"}
            onClick={() => setMode("CREATE")}
            className={`min-h-[46px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
              mode === "CREATE"
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-950/50"
                : "text-slate-300 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Create Room (Host)
          </button>
        </div>

        {/* Main Card */}
        {mode === "JOIN" ? (
          <section className="rounded-3xl bg-slate-900/90 border border-slate-800/90 p-5 sm:p-6 shadow-2xl shadow-black/50">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-white">Join Poker Room</h2>
              <p className="text-sm text-slate-400 mt-1">
                Enter the Room ID or Name from the host to request buy-in OTPs
                and track your running total.
              </p>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="join-room-id"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  Room ID or Name
                </label>
                <input
                  id="join-room-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={40}
                  placeholder="e.g. K9P2M4 or Friday Poker"
                  value={joinRoomInput}
                  onChange={(e) => setJoinRoomInput(e.target.value)}
                  className="w-full min-h-[52px] rounded-2xl bg-slate-950 border border-slate-700 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25 px-4 font-mono text-lg font-bold text-white placeholder:font-sans placeholder:font-normal placeholder:text-slate-600 outline-none transition"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="join-display-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  Your Name
                </label>
                <input
                  id="join-display-name"
                  type="text"
                  maxLength={32}
                  placeholder="e.g. Marcus"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[50px] rounded-2xl bg-slate-950 border border-slate-700 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25 px-4 text-base text-white placeholder:text-slate-600 outline-none transition"
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
                className="w-full min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 transition cursor-pointer"
              >
                {joinLoading ? "Joining Room..." : "Join Room"}
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-3xl bg-slate-900/90 border border-slate-800/90 p-5 sm:p-6 shadow-2xl shadow-black/50">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-white">
                Host Room Setup
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Pick a unique Room ID or Name and set the fixed buy-in unit
                amount.
              </p>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="room-name"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Unique Room ID or Name
                  </label>
                  <button
                    type="button"
                    onClick={() => setRoomName(makeClientShortId())}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200 cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" />
                    Generate 6-Char ID
                  </button>
                </div>
                <input
                  id="room-name"
                  type="text"
                  maxLength={40}
                  placeholder="Leave blank for 6-char ID (e.g. K9P2M4), or enter room name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full min-h-[50px] rounded-2xl bg-slate-950 border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 px-4 text-base text-white placeholder:text-slate-600 outline-none transition"
                />
              </div>

              <div>
                <label
                  htmlFor="fixed-buyin"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  Fixed Buy-In Amount (RM)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg font-bold text-slate-400 pointer-events-none">
                    RM
                  </span>
                  <input
                    id="fixed-buyin"
                    type="text"
                    inputMode="decimal"
                    value={fixedBuyIn}
                    onChange={(e) =>
                      setFixedBuyIn(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    className="w-full min-h-[52px] rounded-2xl bg-slate-950 border border-slate-700 focus:border-amber-400 pl-12 pr-4 font-mono text-xl font-bold text-white outline-none"
                    required
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Players buy in multiples of{" "}
                  <span className="font-mono text-slate-200 font-semibold">
                    RM{fixedBuyIn || "0"}
                  </span>{" "}
                  (e.g. 2× buy-in automatically generates 2 unique 4-digit OTP
                  codes).
                </p>
              </div>

              {createError && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3.5 py-2.5 text-sm text-rose-200"
                >
                  {createError}
                </div>
              )}

              <button
                type="submit"
                disabled={createLoading}
                className="w-full min-h-[52px] rounded-2xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-950/60 transition cursor-pointer"
              >
                {createLoading ? "Creating Room..." : "Create Room"}
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </section>
        )}

        {/* Simple 3-Step Flow */}
        <section className="grid grid-cols-3 gap-2.5 mt-5 text-center">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-3">
            <Users className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <div className="text-xs font-semibold text-slate-200">
              1. Join Room
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Enter Room ID/Name &amp; join instantly
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-3">
            <KeyRound className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <div className="text-xs font-semibold text-slate-200">
              2. Get OTP(s)
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              1 OTP per buy-in unit to tell Host
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-3">
            <Coins className="w-4 h-4 text-sky-400 mx-auto mb-1" />
            <div className="text-xs font-semibold text-slate-200">
              3. Running Total
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Live buy-in total per player
            </p>
          </div>
        </section>
      </div>

      {/* Quick Test Sandbox */}
      <footer className="mt-8 pt-5 border-t border-slate-800/80">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              Quick Test Demo
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Open a sample room with 3 players, multi-unit OTP codes, and
              running totals to test side-by-side tabs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLaunchDemo}
            disabled={demoLoading}
            className="w-full sm:w-auto shrink-0 min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-semibold text-white transition cursor-pointer"
          >
            {demoLoading ? "Creating..." : "Launch Demo Room"}
          </button>
        </div>
      </footer>
    </main>
  );
}
