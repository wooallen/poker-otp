import type { NextRequest } from "next/server";
import { getRoomSnapshot } from "@/lib/room-service";
import { subscribeRoomUpdates } from "@/lib/events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const hostToken = request.nextUrl.searchParams.get("hostToken");
  const playerToken = request.nextUrl.searchParams.get("playerToken");

  const initialSnapshot = getRoomSnapshot({
    roomIdOrName: roomCode,
    hostToken,
    playerToken,
  });

  if (!initialSnapshot) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const sendEvent = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      sendEvent("state", initialSnapshot);

      const unsubscribe = subscribeRoomUpdates(roomCode, () => {
        if (closed) return;
        const nextSnapshot = getRoomSnapshot({
          roomIdOrName: roomCode,
          hostToken,
          playerToken,
        });
        if (nextSnapshot) {
          sendEvent("state", nextSnapshot);
        }
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener("abort", () => {
        cleanup?.();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
