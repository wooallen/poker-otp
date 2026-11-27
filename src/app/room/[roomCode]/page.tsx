import { Suspense } from "react";
import { PlayerRoomView } from "@/components/PlayerRoomView";

async function PlayerRouteLoader({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { roomCode } = await params;
  const sp = await searchParams;
  const seatAlias = typeof sp.seat === "string" ? sp.seat : null;
  const initialToken = typeof sp.token === "string" ? sp.token : null;

  return (
    <PlayerRoomView
      roomCode={roomCode}
      seatAlias={seatAlias}
      initialToken={initialToken}
    />
  );
}

export default function PlayerRoomPage(props: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
          Joining Poker Room...
        </div>
      }
    >
      <PlayerRouteLoader
        params={props.params}
        searchParams={props.searchParams}
      />
    </Suspense>
  );
}
