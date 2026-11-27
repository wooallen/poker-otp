import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const DB_FILE =
  process.env.DATABASE_URL || path.join(process.cwd(), "poker-otp.db");

declare global {
  var __pokerOtpSqlite: Database.Database | undefined;
  var __pokerOtpDb: BetterSQLite3Database<typeof schema> | undefined;
}

export function getSqlite(): Database.Database {
  if (globalThis.__pokerOtpSqlite) {
    return globalThis.__pokerOtpSqlite;
  }

  const sqlite = new Database(DB_FILE, { timeout: 10000 });
  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY NOT NULL,
      room_slug TEXT NOT NULL UNIQUE,
      room_name TEXT NOT NULL,
      host_token TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RM',
      fixed_buy_in REAL NOT NULL DEFAULT 500,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      player_token TEXT NOT NULL,
      display_name TEXT NOT NULL,
      joined_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS players_room_id_idx ON players(room_id);
    CREATE UNIQUE INDEX IF NOT EXISTS players_room_token_unique ON players(room_id, player_token);

    CREATE TABLE IF NOT EXISTS buy_ins (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS room_otp_unique ON buy_ins(room_id, otp_code);
    CREATE INDEX IF NOT EXISTS buy_ins_room_id_idx ON buy_ins(room_id);
    CREATE INDEX IF NOT EXISTS buy_ins_player_id_idx ON buy_ins(player_id);
  `);

  // Safe forward migration if poker-otp.db was created prior to status/ended_at columns
  const roomCols = sqlite
    .prepare("PRAGMA table_info(rooms)")
    .all() as Array<{ name: string }>;
  const colNames = new Set(roomCols.map((c) => c.name));
  if (!colNames.has("status")) {
    sqlite.exec("ALTER TABLE rooms ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN'");
  }
  if (!colNames.has("ended_at")) {
    sqlite.exec("ALTER TABLE rooms ADD COLUMN ended_at TEXT");
  }

  globalThis.__pokerOtpSqlite = sqlite;
  return sqlite;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!globalThis.__pokerOtpDb) {
    globalThis.__pokerOtpDb = drizzle(getSqlite(), { schema });
  }
  return globalThis.__pokerOtpDb;
}

export const sqlite = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const instance = getSqlite();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
