import { createRoom } from "@/lib/room-service";
import { handleApiError } from "@/lib/api-error";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = createRoom({
      roomName: body.roomName,
      currency: body.currency,
      fixedBuyIn: body.fixedBuyIn,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
