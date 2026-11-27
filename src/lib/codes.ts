import crypto from "node:crypto";
import type Database from "better-sqlite3";

const SHORT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Converts a Room ID or Name (e.g. "Friday Night" or "K9P2") into a normalized
 * case-insensitive URL slug ("friday-night" or "k9p2") so players can join
 * regardless of capitalization or extra spaces.
 */
export function toRoomSlug(raw: string): string {
  return decodeURIComponent(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function generateRandomShortId(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SHORT_ID_ALPHABET[crypto.randomInt(0, SHORT_ID_ALPHABET.length)];
  }
  return code;
}

export function generateUniqueShortRoomId(sqlite: Database.Database): string {
  const checkStmt = sqlite.prepare(
    "SELECT 1 FROM rooms WHERE room_slug = ? LIMIT 1"
  );
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = generateRandomShortId();
    if (!checkStmt.get(toRoomSlug(candidate))) {
      return candidate;
    }
  }
  throw new Error("Unable to generate a unique Room ID.");
}

export function generateSecretToken(): string {
  return `${crypto.randomUUID()}-${crypto.randomBytes(12).toString("hex")}`;
}

export function format4DigitOtp(num: number): string {
  return num.toString().padStart(4, "0");
}

export function random4DigitOtp(): string {
  return format4DigitOtp(crypto.randomInt(0, 10000));
}

/**
 * Inserts a single BuyIn unit with a collision-safe, room-unique 4-digit OTP ("0000"-"9999").
 */
export function insertSingleBuyInOtp(
  sqlite: Database.Database,
  params: {
    roomId: string;
    playerId: string;
    batchId: string;
    amount: number;
    createdAt: string;
  }
): { id: string; otpCode: string } {
  const insertStmt = sqlite.prepare(`
    INSERT INTO buy_ins (id, room_id, player_id, batch_id, otp_code, amount, status, created_at)
    VALUES (@id, @roomId, @playerId, @batchId, @otpCode, @amount, 'ACTIVE', @createdAt)
  `);

  for (let attempt = 0; attempt < 40; attempt++) {
    const id = crypto.randomUUID();
    const otpCode = random4DigitOtp();
    try {
      insertStmt.run({
        id,
        roomId: params.roomId,
        playerId: params.playerId,
        batchId: params.batchId,
        otpCode,
        amount: params.amount,
        createdAt: params.createdAt,
      });
      return { id, otpCode };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === "SQLITE_CONSTRAINT_UNIQUE" ||
        code === "SQLITE_CONSTRAINT"
      ) {
        continue;
      }
      throw err;
    }
  }

  // Deterministic fallback if room has thousands of OTPs
  const usedRows = sqlite
    .prepare("SELECT otp_code FROM buy_ins WHERE room_id = ?")
    .all(params.roomId) as Array<{ otp_code: string }>;

  if (usedRows.length >= 10000) {
    throw new Error("All 10,000 4-digit OTP codes in this room have been used.");
  }

  const usedSet = new Set(usedRows.map((r) => r.otp_code));
  const available: string[] = [];
  for (let n = 0; n < 10000; n++) {
    const candidate = format4DigitOtp(n);
    if (!usedSet.has(candidate)) {
      available.push(candidate);
    }
  }

  const otpCode = available[crypto.randomInt(0, available.length)];
  const id = crypto.randomUUID();
  insertStmt.run({
    id,
    roomId: params.roomId,
    playerId: params.playerId,
    batchId: params.batchId,
    otpCode,
    amount: params.amount,
    createdAt: params.createdAt,
  });

  return { id, otpCode };
}
