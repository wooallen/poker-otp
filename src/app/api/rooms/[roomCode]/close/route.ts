import { setRoomClosureState } from "@/lib/room-service";
import { handleApiError } from "@/lib/api-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const hostToken = request.headers.get("x-host-token");
    const body = await request.json().catch(() => ({}));
    const action = body.action === "REOPEN" ? "REOPEN" : "CLOSE";

    const room = setRoomClosureState({
      roomIdOrName: roomCode,
      hostToken,
      action,
    });

    return Response.json({ room });
  } catch (err) {
    return handleApiError(err);
  }
}
