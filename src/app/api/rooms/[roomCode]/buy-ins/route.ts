import { createPlayerBuyIns } from "@/lib/room-service";
import { handleApiError } from "@/lib/api-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const playerToken = request.headers.get("x-player-token");
    const body = await request.json().catch(() => ({}));

    const result = createPlayerBuyIns({
      roomIdOrName: roomCode,
      playerToken,
      quantity: body.quantity ?? 1,
    });

    return Response.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
