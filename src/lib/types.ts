import type { BuyInStatus, RoomStatus } from "@/db/schema";

export interface PublicRoom {
  id: string;
  roomSlug: string;
  roomName: string;
  currency: string;
  fixedBuyIn: number;
  status: RoomStatus;
  createdAt: string;
  endedAt: string | null;
}

export interface BuyInOtpItem {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  batchId: string;
  otpCode: string; // 4-digit string "0000"-"9999"
  amount: number;
  status: BuyInStatus;
  createdAt: string;
}

export interface PlayerRunningSummary {
  id: string;
  displayName: string;
  joinedAt: string;
  buyInCount: number; // Active buy-ins count
  runningTotal: number; // Sum of active buy-ins
  buyIns: BuyInOtpItem[]; // Newest first
}

export interface RoomTotals {
  playerCount: number;
  totalBuyInUnits: number;
  grandRunningTotal: number;
}

export interface HostRoomSnapshot {
  role: "HOST";
  room: PublicRoom;
  totals: RoomTotals;
  players: PlayerRunningSummary[];
  recentOtps: BuyInOtpItem[];
  serverTime: string;
}

export interface PlayerRoomSnapshot {
  role: "PLAYER";
  room: PublicRoom;
  totals: RoomTotals;
  me: PlayerRunningSummary;
  otherPlayers: Array<{
    id: string;
    displayName: string;
    buyInCount: number;
    runningTotal: number;
  }>;
  serverTime: string;
}

export interface GuestRoomSnapshot {
  role: "GUEST";
  room: PublicRoom;
  totals: RoomTotals;
  serverTime: string;
}

export type RoomSnapshot =
  | HostRoomSnapshot
  | PlayerRoomSnapshot
  | GuestRoomSnapshot;
