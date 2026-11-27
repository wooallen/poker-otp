import { createDemoRoom } from "@/lib/room-service";
import { handleApiError } from "@/lib/api-error";

export async function POST() {
  try {
    const demo = createDemoRoom();
    return Response.json(demo, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
