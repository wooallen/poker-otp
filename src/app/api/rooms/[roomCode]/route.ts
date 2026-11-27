import type { NextRequest } from "next/server";
import { getRoomSnapshot } from "@/lib/room-service";
import { handleApiError } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const hostToken =
      request.headers.get("x-host-token") ||
      request.nextUrl.searchParams.get("hostToken");
    const playerToken =
      request.headers.get("x-player-token") ||
      request.nextUrl.searchParams.get("playerToken");

    const snapshot = getRoomSnapshot({
      roomIdOrName: roomCode,
      hostToken,
      playerToken,
    });

    if (!snapshot) {
      return Response.json({ error: "Room not found." }, { status: 404 });
    }

    return Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
