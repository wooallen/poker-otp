import {
  doc,
  getDoc,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import { db, ensureAuthUid } from "./firebase";
import {
  buildPlayerId,
  generateRandomShortId,
  random4DigitOtp,
  toRoomSlug,
} from "./codes";
import type { PublicRoom } from "./types";

function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function makeBatchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 1) Host creates a room in Firestore with a unique 6+ char ID or Name and Fixed Buy-In (default RM500).
 */
export async function createRoomInFirestore(input: {
  roomName?: string;
  fixedBuyIn?: number;
}): Promise<PublicRoom> {
  const uid = await ensureAuthUid();
  const fixedBuyIn = roundMoney(Number(input.fixedBuyIn ?? 500));
  if (!Number.isFinite(fixedBuyIn) || fixedBuyIn <= 0 || fixedBuyIn > 1_000_000) {
    throw new Error("Fixed buy-in amount must be greater than 0.");
  }

  const hasCustomName = Boolean(input.roomName?.trim());

  for (let attempt = 0; attempt < 15; attempt++) {
    const rawName = hasCustomName
      ? input.roomName!.trim()
      : generateRandomShortId();

    if (rawName.length < 6 || rawName.length > 40) {
      throw new Error(
        "Room ID or Name must be 6–40 characters (to avoid confusion with 4-digit OTPs)."
      );
    }

    const roomSlug = toRoomSlug(rawName);
    if (!roomSlug || roomSlug.length < 2) {
      throw new Error("Room ID or Name must contain letters or numbers.");
    }

    const roomRef = doc(db, "rooms", roomSlug);
    const createdAt = new Date().toISOString();

    try {
      const created = await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (snap.exists()) {
          throw new Error("ROOM_EXISTS");
        }
        const payload = {
          roomSlug,
          roomName: rawName,
          hostUid: uid,
          currency: "RM",
          fixedBuyIn,
          status: "OPEN" as const,
          createdAt,
          endedAt: null,
        };
        tx.set(roomRef, payload);
        return { id: roomSlug, ...payload };
      });
      return created;
    } catch (err) {
      if (err instanceof Error && err.message === "ROOM_EXISTS") {
        if (hasCustomName) {
          throw new Error(
            `Room "${rawName}" already exists. Choose a unique Room ID or Name.`
          );
        }
        continue;
      }
      throw err;
    }
  }

  throw new Error("Unable to allocate a unique 6-character Room ID.");
}

/**
 * 2) Player joins a room immediately (or restores their existing player document if already joined).
 */
export async function joinRoomInFirestore(input: {
  roomIdOrName: string;
  displayName: string;
  seatAlias?: string | null;
}): Promise<{ room: PublicRoom; playerId: string; restored: boolean }> {
  const uid = await ensureAuthUid();
  const roomSlug = toRoomSlug(input.roomIdOrName);
  if (!roomSlug) {
    throw new Error("Enter a valid Room ID or Name.");
  }

  const displayName = input.displayName?.trim();
  if (!displayName || displayName.length > 32) {
    throw new Error("Enter your player name (1–32 characters).");
  }

  const playerId = buildPlayerId(uid, input.seatAlias);
  const roomRef = doc(db, "rooms", roomSlug);
  const playerRef = doc(db, "rooms", roomSlug, "players", playerId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error(
        `No room found matching "${input.roomIdOrName.trim()}". Check the Room ID or Name with the host.`
      );
    }

    const roomData = roomSnap.data() as Omit<PublicRoom, "id">;
    const room: PublicRoom = { id: roomSnap.id, ...roomData };

    const existingPlayer = await tx.get(playerRef);
    if (existingPlayer.exists()) {
      return { room, playerId, restored: true };
    }

    if (room.status === "CLOSED") {
      throw new Error("This room has already been closed by the host.");
    }

    tx.set(playerRef, {
      id: playerId,
      roomSlug,
      uid,
      displayName,
      joinedAt: new Date().toISOString(),
    });

    return { room, playerId, restored: false };
  });
}

/**
 * 3) Player requests N buy-ins (multiples of fixedBuyIn).
 *    Atomically allocates N unique 4-digit OTP documents ("0000"-"9999") in Firestore.
 */
export async function requestBuyInsInFirestore(input: {
  roomIdOrName: string;
  seatAlias?: string | null;
  quantity: number;
}): Promise<{
  batchId: string;
  generatedOtps: Array<{ otpCode: string; amount: number; createdAt: string }>;
}> {
  const uid = await ensureAuthUid();
  const qty = Math.trunc(Number(input.quantity ?? 1));
  if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
    throw new Error("Buy-in multiplier must be between 1 and 20.");
  }

  const roomSlug = toRoomSlug(input.roomIdOrName);
  const playerId = buildPlayerId(uid, input.seatAlias);
  const roomRef = doc(db, "rooms", roomSlug);
  const playerRef = doc(db, "rooms", roomSlug, "players", playerId);

  const batchId = makeBatchId();

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error("Room not found.");
    }
    const room = roomSnap.data() as Omit<PublicRoom, "id">;
    if (room.status === "CLOSED") {
      throw new Error(
        "This room is closed. New buy-ins can no longer be requested."
      );
    }

    const playerSnap = await tx.get(playerRef);
    if (!playerSnap.exists()) {
      throw new Error("Join the room first before requesting a buy-in.");
    }
    const player = playerSnap.data() as { displayName: string; uid: string };

    const chosenCodes: string[] = [];
    const tried = new Set<string>();

    while (chosenCodes.length < qty) {
      if (tried.size >= 9999) {
        throw new Error("All 4-digit OTP codes in this room have been used.");
      }
      const candidate = random4DigitOtp();
      if (tried.has(candidate)) continue;
      tried.add(candidate);

      const otpRef = doc(db, "rooms", roomSlug, "buyIns", candidate);
      const existingOtp = await tx.get(otpRef);
      if (!existingOtp.exists()) {
        chosenCodes.push(candidate);
      }
    }

    const nowMs = Date.now();
    const generatedOtps: Array<{
      otpCode: string;
      amount: number;
      createdAt: string;
    }> = [];

    chosenCodes.forEach((otpCode, idx) => {
      const createdAt = new Date(nowMs + idx).toISOString();
      const otpRef = doc(db, "rooms", roomSlug, "buyIns", otpCode);
      tx.set(otpRef, {
        id: otpCode,
        roomSlug,
        playerId,
        playerUid: uid,
        playerName: player.displayName,
        batchId,
        otpCode,
        amount: room.fixedBuyIn,
        status: "ACTIVE",
        createdAt,
      });
      generatedOtps.push({
        otpCode,
        amount: room.fixedBuyIn,
        createdAt,
      });
    });

    return { batchId, generatedOtps };
  });
}

/**
 * Host voids or restores an accidental buy-in OTP
 */
export async function toggleBuyInVoidInFirestore(input: {
  roomIdOrName: string;
  otpCode: string;
  voided: boolean;
}): Promise<void> {
  await ensureAuthUid();
  const roomSlug = toRoomSlug(input.roomIdOrName);
  const otpRef = doc(db, "rooms", roomSlug, "buyIns", input.otpCode);
  await updateDoc(otpRef, {
    status: input.voided ? "VOIDED" : "ACTIVE",
  });
}

/**
 * Host closes the room (recording endedAt) or reopens it
 */
export async function setRoomClosureInFirestore(input: {
  roomIdOrName: string;
  action: "CLOSE" | "REOPEN";
}): Promise<PublicRoom> {
  await ensureAuthUid();
  const roomSlug = toRoomSlug(input.roomIdOrName);
  const roomRef = doc(db, "rooms", roomSlug);

  if (input.action === "CLOSE") {
    const endedAt = new Date().toISOString();
    await updateDoc(roomRef, {
      status: "CLOSED",
      endedAt,
    });
  } else {
    await updateDoc(roomRef, {
      status: "OPEN",
      endedAt: null,
    });
  }

  const updated = await getDoc(roomRef);
  return {
    id: updated.id,
    ...(updated.data() as Omit<PublicRoom, "id">),
  };
}

/**
 * Seeds a quick Demo Room in Firestore with 3 players & multi-OTP buy-ins
 */
export async function createDemoRoomInFirestore(): Promise<{
  roomSlug: string;
  roomName: string;
  demoPlayers: Array<{ seatAlias: string; displayName: string }>;
}> {
  const room = await createRoomInFirestore({ fixedBuyIn: 500 });

  const specs = [
    { seatAlias: "marcus", displayName: "Marcus", batches: [2, 1] },
    { seatAlias: "sarah", displayName: "Sarah", batches: [2] },
    { seatAlias: "david", displayName: "David", batches: [1] },
  ];

  for (const spec of specs) {
    await joinRoomInFirestore({
      roomIdOrName: room.roomSlug,
      displayName: spec.displayName,
      seatAlias: spec.seatAlias,
    });
    for (const qty of spec.batches) {
      await requestBuyInsInFirestore({
        roomIdOrName: room.roomSlug,
        seatAlias: spec.seatAlias,
        quantity: qty,
      });
    }
  }

  return {
    roomSlug: room.roomSlug,
    roomName: room.roomName,
    demoPlayers: specs.map((s) => ({
      seatAlias: s.seatAlias,
      displayName: s.displayName,
    })),
  };
}
