export type RoomStatus = "OPEN" | "CLOSED";
export type BuyInStatus = "ACTIVE" | "VOIDED";

export interface PublicRoom {
  id: string;
  roomSlug: string;
  roomName: string;
  hostUid: string;
  currency: string;
  fixedBuyIn: number;
  status: RoomStatus;
  createdAt: string;
  endedAt: string | null;
}

export interface BuyInOtpItem {
  id: string;
  roomSlug: string;
  playerId: string;
  playerUid: string;
  playerName: string;
  batchId: string;
  otpCode: string; // 4-digit string "0000"-"9999"
  amount: number;
  status: BuyInStatus;
  createdAt: string;
}

export interface PlayerRunningSummary {
  id: string;
  uid: string;
  displayName: string;
  joinedAt: string;
  buyInCount: number;
  runningTotal: number;
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
  isAlsoHost: boolean;
  serverTime: string;
}

export interface GuestRoomSnapshot {
  role: "GUEST";
  room: PublicRoom;
  totals: RoomTotals;
  isAlsoHost: boolean;
  serverTime: string;
}

export type RoomSnapshot =
  | HostRoomSnapshot
  | PlayerRoomSnapshot
  | GuestRoomSnapshot;
