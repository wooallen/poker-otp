import { EventEmitter } from "node:events";
import { toRoomSlug } from "./codes";

declare global {
  var __pokerRoomEmitter: EventEmitter | undefined;
}

function getEmitter(): EventEmitter {
  if (!globalThis.__pokerRoomEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    globalThis.__pokerRoomEmitter = emitter;
  }
  return globalThis.__pokerRoomEmitter;
}

export function emitRoomUpdate(roomIdOrSlug: string): void {
  const slug = toRoomSlug(roomIdOrSlug);
  getEmitter().emit(`room:${slug}`, {
    roomSlug: slug,
    timestamp: new Date().toISOString(),
  });
}

export function subscribeRoomUpdates(
  roomIdOrSlug: string,
  listener: (payload: { roomSlug: string; timestamp: string }) => void
): () => void {
  const slug = toRoomSlug(roomIdOrSlug);
  const channel = `room:${slug}`;
  const emitter = getEmitter();
  emitter.on(channel, listener);
  return () => {
    emitter.off(channel, listener);
  };
}
