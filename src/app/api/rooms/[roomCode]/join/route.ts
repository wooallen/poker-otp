import { joinRoom } from "@/lib/room-service";
import { handleApiError } from "@/lib/api-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const body = await request.json();
    const existingPlayerToken =
      request.headers.get("x-player-token") || body.existingPlayerToken || null;

    const result = joinRoom({
      roomIdOrName: roomCode,
      displayName: body.displayName ?? "",
      existingPlayerToken,
    });

    return Response.json(result, { status: result.restored ? 200 : 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
