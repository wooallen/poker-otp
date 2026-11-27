import crypto from "node:crypto";
import { eq, asc, desc } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  rooms,
  players,
  buyIns,
  type RoomRecord,
  type PlayerRecord,
} from "@/db/schema";
import {
  generateSecretToken,
  generateUniqueShortRoomId,
  insertSingleBuyInOtp,
  toRoomSlug,
} from "./codes";
import { emitRoomUpdate } from "./events";
import type {
  BuyInOtpItem,
  GuestRoomSnapshot,
  HostRoomSnapshot,
  PlayerRoomSnapshot,
  PlayerRunningSummary,
  PublicRoom,
  RoomSnapshot,
} from "./types";

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function toPublicRoom(room: RoomRecord): PublicRoom {
  return {
    id: room.id,
    roomSlug: room.roomSlug,
    roomName: room.roomName,
    currency: room.currency,
    fixedBuyIn: room.fixedBuyIn,
    status: room.status ?? "OPEN",
    createdAt: room.createdAt,
    endedAt: room.endedAt ?? null,
  };
}

export function getRoomByIdOrName(raw: string): RoomRecord | null {
  const slug = toRoomSlug(raw);
  if (!slug) return null;
  const row = db.select().from(rooms).where(eq(rooms.roomSlug, slug)).get();
  return row ?? null;
}

export function requireHostRoom(
  rawRoom: string,
  hostToken: string | null
): RoomRecord {
  const room = getRoomByIdOrName(rawRoom);
  if (!room) {
    throw new AppError("Room not found.", 404);
  }
  if (!hostToken || room.hostToken !== hostToken) {
    throw new AppError("Unauthorized host token for this room.", 403);
  }
  return room;
}

export function requirePlayerInRoom(
  rawRoom: string,
  playerToken: string | null
): { room: RoomRecord; player: PlayerRecord } {
  const room = getRoomByIdOrName(rawRoom);
  if (!room) {
    throw new AppError("Room not found.", 404);
  }
  if (!playerToken) {
    throw new AppError("Missing player session token.", 401);
  }
  const roomPlayers = db
    .select()
    .from(players)
    .where(eq(players.roomId, room.id))
    .all();
  const player = roomPlayers.find((p) => p.playerToken === playerToken);
  if (!player) {
    throw new AppError("Player session not found in this room.", 403);
  }
  return { room, player };
}

/**
 * 1) Host creates a room with a unique ID (6 chars) or name, plus the fixed buy-in amount.
 */
export function createRoom(input: {
  roomName?: string;
  currency?: string;
  fixedBuyIn?: number;
}): { room: PublicRoom; hostToken: string } {
  const currency = "RM";
  const fixedBuyIn = roundMoney(Number(input.fixedBuyIn ?? 500));
  if (!Number.isFinite(fixedBuyIn) || fixedBuyIn <= 0 || fixedBuyIn > 1_000_000) {
    throw new AppError("Fixed buy-in amount must be greater than 0.", 400);
  }

  const tx = sqlite.transaction(() => {
    const rawName = input.roomName?.trim() || generateUniqueShortRoomId(sqlite);
    if (rawName.length < 6 || rawName.length > 40) {
      throw new AppError(
        "Room ID or Name must be 6–40 characters (to avoid confusion with 4-digit OTPs).",
        400
      );
    }

    const roomSlug = toRoomSlug(rawName);
    if (!roomSlug) {
      throw new AppError(
        "Room ID or Name must contain letters or numbers.",
        400
      );
    }

    const existing = db
      .select()
      .from(rooms)
      .where(eq(rooms.roomSlug, roomSlug))
      .get();
    if (existing) {
      throw new AppError(
        `Room "${rawName}" already exists. Choose a unique Room ID or Name.`,
        409
      );
    }

    const id = crypto.randomUUID();
    const hostToken = generateSecretToken();
    const createdAt = new Date().toISOString();

    db.insert(rooms)
      .values({
        id,
        roomSlug,
        roomName: rawName,
        hostToken,
        currency,
        fixedBuyIn,
        status: "OPEN",
        createdAt,
        endedAt: null,
      })
      .run();

    const created = db.select().from(rooms).where(eq(rooms.id, id)).get()!;
    return { room: toPublicRoom(created), hostToken };
  });

  return tx();
}

/**
 * 2) A player joins the room immediately (or restores their existing session if reconnecting).
 */
export function joinRoom(input: {
  roomIdOrName: string;
  displayName: string;
  existingPlayerToken?: string | null;
}): {
  room: PublicRoom;
  player: { id: string; displayName: string };
  playerToken: string;
  restored: boolean;
} {
  const room = getRoomByIdOrName(input.roomIdOrName);
  if (!room) {
    throw new AppError(
      `No room found matching "${input.roomIdOrName.trim()}". Check the Room ID or Name with the host.`,
      404
    );
  }

  const tx = sqlite.transaction(() => {
    const roomPlayers = db
      .select()
      .from(players)
      .where(eq(players.roomId, room.id))
      .all();

    if (input.existingPlayerToken) {
      const existing = roomPlayers.find(
        (p) => p.playerToken === input.existingPlayerToken
      );
      if (existing) {
        return {
          room: toPublicRoom(room),
          player: { id: existing.id, displayName: existing.displayName },
          playerToken: existing.playerToken,
          restored: true,
        };
      }
    }

    if (room.status === "CLOSED") {
      throw new AppError("This room has already been closed by the host.", 400);
    }

    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length > 32) {
      throw new AppError("Enter your player name (1–32 characters).", 400);
    }

    const id = crypto.randomUUID();
    const playerToken = generateSecretToken();
    const joinedAt = new Date().toISOString();

    db.insert(players)
      .values({
        id,
        roomId: room.id,
        playerToken,
        displayName,
        joinedAt,
      })
      .run();

    return {
      room: toPublicRoom(room),
      player: { id, displayName },
      playerToken,
      restored: false,
    };
  });

  const result = tx();
  if (!result.restored) {
    emitRoomUpdate(result.room.roomSlug);
  }
  return result;
}

/**
 * 3) Player requests N buy-ins (multiples of the room's fixedBuyIn).
 *    Generates N separate 4-digit OTP codes (1 unique OTP per fixed buy-in unit).
 */
export function createPlayerBuyIns(input: {
  roomIdOrName: string;
  playerToken: string | null;
  quantity?: number;
}): {
  batchId: string;
  quantity: number;
  unitAmount: number;
  totalBatchAmount: number;
  generatedOtps: Array<{
    id: string;
    otpCode: string;
    amount: number;
    createdAt: string;
  }>;
} {
  const qty = Math.trunc(Number(input.quantity ?? 1));
  if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
    throw new AppError("Buy-in multiplier must be between 1 and 20.", 400);
  }

  const tx = sqlite.transaction(() => {
    const { room, player } = requirePlayerInRoom(
      input.roomIdOrName,
      input.playerToken
    );

    if (room.status === "CLOSED") {
      throw new AppError(
        "This room is closed. New buy-ins can no longer be requested.",
        400
      );
    }

    const batchId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const unitAmount = room.fixedBuyIn;

    const generatedOtps: Array<{
      id: string;
      otpCode: string;
      amount: number;
      createdAt: string;
    }> = [];

    for (let i = 0; i < qty; i++) {
      const itemTimestamp = new Date(
        Date.parse(createdAt) + i
      ).toISOString();
      const { id, otpCode } = insertSingleBuyInOtp(sqlite, {
        roomId: room.id,
        playerId: player.id,
        batchId,
        amount: unitAmount,
        createdAt: itemTimestamp,
      });
      generatedOtps.push({
        id,
        otpCode,
        amount: unitAmount,
        createdAt: itemTimestamp,
      });
    }

    return {
      roomSlug: room.roomSlug,
      batchId,
      quantity: qty,
      unitAmount,
      totalBatchAmount: roundMoney(unitAmount * qty),
      generatedOtps,
    };
  });

  const res = tx();
  emitRoomUpdate(res.roomSlug);
  return {
    batchId: res.batchId,
    quantity: res.quantity,
    unitAmount: res.unitAmount,
    totalBatchAmount: res.totalBatchAmount,
    generatedOtps: res.generatedOtps,
  };
}

/**
 * Host can void/restore a mistakenly tapped OTP while room is open
 */
export function toggleBuyInVoidByHost(input: {
  roomIdOrName: string;
  hostToken: string | null;
  buyInId: string;
  voided: boolean;
}) {
  const tx = sqlite.transaction(() => {
    const room = requireHostRoom(input.roomIdOrName, input.hostToken);
    if (room.status === "CLOSED") {
      throw new AppError("Reopen the room before modifying buy-ins.", 400);
    }

    const target = db
      .select()
      .from(buyIns)
      .where(eq(buyIns.id, input.buyInId))
      .get();

    if (!target || target.roomId !== room.id) {
      throw new AppError("Buy-in OTP record not found.", 404);
    }

    db.update(buyIns)
      .set({ status: input.voided ? "VOIDED" : "ACTIVE" })
      .where(eq(buyIns.id, target.id))
      .run();

    return room.roomSlug;
  });

  const slug = tx();
  emitRoomUpdate(slug);
}

/**
 * Host closes the room (recording endedAt timestamp) or reopens it
 */
export function setRoomClosureState(input: {
  roomIdOrName: string;
  hostToken: string | null;
  action: "CLOSE" | "REOPEN";
}): PublicRoom {
  const tx = sqlite.transaction(() => {
    const room = requireHostRoom(input.roomIdOrName, input.hostToken);

    if (input.action === "CLOSE") {
      const endedAt =
        room.status === "CLOSED" && room.endedAt
          ? room.endedAt
          : new Date().toISOString();
      db.update(rooms)
        .set({ status: "CLOSED", endedAt })
        .where(eq(rooms.id, room.id))
        .run();
    } else {
      db.update(rooms)
        .set({ status: "OPEN", endedAt: null })
        .where(eq(rooms.id, room.id))
        .run();
    }

    const updated = db.select().from(rooms).where(eq(rooms.id, room.id)).get()!;
    return toPublicRoom(updated);
  });

  const updatedRoom = tx();
  emitRoomUpdate(updatedRoom.roomSlug);
  return updatedRoom;
}

/**
 * 4) Builds live room snapshot with each player's running total & timestamped 4-digit OTP codes
 */
export function getRoomSnapshot(params: {
  roomIdOrName: string;
  hostToken?: string | null;
  playerToken?: string | null;
}): RoomSnapshot | null {
  const room = getRoomByIdOrName(params.roomIdOrName);
  if (!room) return null;

  const publicRoom = toPublicRoom(room);
  const serverTime = new Date().toISOString();

  const roomPlayers = db
    .select()
    .from(players)
    .where(eq(players.roomId, room.id))
    .orderBy(asc(players.joinedAt))
    .all();

  const roomBuyIns = db
    .select()
    .from(buyIns)
    .where(eq(buyIns.roomId, room.id))
    .orderBy(desc(buyIns.createdAt))
    .all();

  const playerMap = new Map(roomPlayers.map((p) => [p.id, p]));

  const otpItems: BuyInOtpItem[] = roomBuyIns.map((b) => ({
    id: b.id,
    roomId: b.roomId,
    playerId: b.playerId,
    playerName: playerMap.get(b.playerId)?.displayName ?? "Unknown",
    batchId: b.batchId,
    otpCode: b.otpCode,
    amount: b.amount,
    status: b.status,
    createdAt: b.createdAt,
  }));

  const playerSummaries: PlayerRunningSummary[] = roomPlayers.map((p) => {
    const myBuyIns = otpItems.filter((b) => b.playerId === p.id);
    const activeBuyIns = myBuyIns.filter((b) => b.status === "ACTIVE");
    const runningTotal = roundMoney(
      activeBuyIns.reduce((sum, b) => sum + b.amount, 0)
    );

    return {
      id: p.id,
      displayName: p.displayName,
      joinedAt: p.joinedAt,
      buyInCount: activeBuyIns.length,
      runningTotal,
      buyIns: myBuyIns,
    };
  });

  const activeAll = otpItems.filter((b) => b.status === "ACTIVE");
  const totals = {
    playerCount: roomPlayers.length,
    totalBuyInUnits: activeAll.length,
    grandRunningTotal: roundMoney(
      activeAll.reduce((sum, b) => sum + b.amount, 0)
    ),
  };

  if (params.hostToken && params.hostToken === room.hostToken) {
    const hostSnap: HostRoomSnapshot = {
      role: "HOST",
      room: publicRoom,
      totals,
      players: playerSummaries,
      recentOtps: otpItems,
      serverTime,
    };
    return hostSnap;
  }

  if (params.playerToken) {
    const meRecord = roomPlayers.find(
      (p) => p.playerToken === params.playerToken
    );
    if (meRecord) {
      const meSummary = playerSummaries.find((s) => s.id === meRecord.id)!;
      const otherPlayers = playerSummaries
        .filter((s) => s.id !== meRecord.id)
        .map((s) => ({
          id: s.id,
          displayName: s.displayName,
          buyInCount: s.buyInCount,
          runningTotal: s.runningTotal,
        }));

      const playerSnap: PlayerRoomSnapshot = {
        role: "PLAYER",
        room: publicRoom,
        totals,
        me: meSummary,
        otherPlayers,
        serverTime,
      };
      return playerSnap;
    }
  }

  const guestSnap: GuestRoomSnapshot = {
    role: "GUEST",
    room: publicRoom,
    totals,
    serverTime,
  };
  return guestSnap;
}

/**
 * Seeds a quick Demo Room so Host + multiple Players can be tested side-by-side in 1 click
 */
export function createDemoRoom(): {
  roomSlug: string;
  roomName: string;
  hostToken: string;
  demoPlayers: Array<{
    seatAlias: string;
    displayName: string;
    playerToken: string;
  }>;
} {
  const tx = sqlite.transaction(() => {
    const roomName = generateUniqueShortRoomId(sqlite);
    const roomSlug = toRoomSlug(roomName);
    const roomId = crypto.randomUUID();
    const hostToken = generateSecretToken();
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

    db.insert(rooms)
      .values({
        id: roomId,
        roomSlug,
        roomName,
        hostToken,
        currency: "RM",
        fixedBuyIn: 500,
        status: "OPEN",
        createdAt: iso(-600_000),
        endedAt: null,
      })
      .run();

    const specs = [
      { seatAlias: "marcus", displayName: "Marcus", batches: [2, 1] },
      { seatAlias: "sarah", displayName: "Sarah", batches: [2] },
      { seatAlias: "david", displayName: "David", batches: [1] },
    ];

    const demoPlayers: Array<{
      seatAlias: string;
      displayName: string;
      playerToken: string;
    }> = [];

    specs.forEach((spec, pIdx) => {
      const playerId = crypto.randomUUID();
      const playerToken = generateSecretToken();
      db.insert(players)
        .values({
          id: playerId,
          roomId,
          playerToken,
          displayName: spec.displayName,
          joinedAt: iso(-500_000 + pIdx * 30_000),
        })
        .run();

      spec.batches.forEach((qty, bIdx) => {
        const batchId = crypto.randomUUID();
        const baseTs = -400_000 + pIdx * 40_000 + bIdx * 120_000;
        for (let u = 0; u < qty; u++) {
          insertSingleBuyInOtp(sqlite, {
            roomId,
            playerId,
            batchId,
            amount: 500,
            createdAt: iso(baseTs + u),
          });
        }
      });

      demoPlayers.push({
        seatAlias: spec.seatAlias,
        displayName: spec.displayName,
        playerToken,
      });
    });

    return { roomSlug, roomName, hostToken, demoPlayers };
  });

  return tx();
}
