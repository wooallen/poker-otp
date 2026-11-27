import { toggleBuyInVoidByHost } from "@/lib/room-service";
import { handleApiError } from "@/lib/api-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string; buyInId: string }> }
) {
  try {
    const { roomCode, buyInId } = await params;
    const hostToken = request.headers.get("x-host-token");
    const body = await request.json().catch(() => ({}));

    toggleBuyInVoidByHost({
      roomIdOrName: roomCode,
      hostToken,
      buyInId,
      voided: Boolean(body.voided),
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
