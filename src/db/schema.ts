import {
  sqliteTable,
  text,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export type RoomStatus = "OPEN" | "CLOSED";
export type BuyInStatus = "ACTIVE" | "VOIDED";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  // Normalized URL-safe unique lookup key (e.g. "friday-night" or "k9p2m4")
  roomSlug: text("room_slug").notNull().unique(),
  // Human-facing unique Room ID or Name chosen by host (e.g. "Friday Night" or "K9P2M4")
  roomName: text("room_name").notNull(),
  hostToken: text("host_token").notNull(),
  currency: text("currency").notNull().default("RM"),
  // Fixed buy-in unit amount set by host in room setup (default RM500)
  fixedBuyIn: real("fixed_buy_in").notNull().default(500),
  status: text("status", { enum: ["OPEN", "CLOSED"] })
    .$type<RoomStatus>()
    .notNull()
    .default("OPEN"),
  createdAt: text("created_at").notNull(),
  endedAt: text("ended_at"),
});

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    playerToken: text("player_token").notNull(),
    displayName: text("display_name").notNull(),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    index("players_room_id_idx").on(table.roomId),
    uniqueIndex("players_room_token_unique").on(
      table.roomId,
      table.playerToken
    ),
  ]
);

export const buyIns = sqliteTable(
  "buy_ins",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    batchId: text("batch_id").notNull(),
    // 4-digit OTP string ("0000"-"9999") stored as TEXT to preserve leading zeros
    otpCode: text("otp_code").notNull(),
    amount: real("amount").notNull(),
    status: text("status", { enum: ["ACTIVE", "VOIDED"] })
      .$type<BuyInStatus>()
      .notNull()
      .default("ACTIVE"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("room_otp_unique").on(table.roomId, table.otpCode),
    index("buy_ins_room_id_idx").on(table.roomId),
    index("buy_ins_player_id_idx").on(table.playerId),
  ]
);

export type RoomRecord = typeof rooms.$inferSelect;
export type PlayerRecord = typeof players.$inferSelect;
export type BuyInRecord = typeof buyIns.$inferSelect;
