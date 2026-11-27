"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlayerRoomView } from "@/components/PlayerRoomView";

function PlayerPageInner() {
  const searchParams = useSearchParams();
  const room = searchParams.get("room") || "";
  const seatAlias = searchParams.get("seat");

  return <PlayerRoomView roomCode={room} seatAlias={seatAlias} />;
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
          Connecting to Poker Room...
        </div>
      }
    >
      <PlayerPageInner />
    </Suspense>
  );
}
