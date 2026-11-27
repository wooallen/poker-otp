const SHORT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBasePath(pathname: string): string {
  if (!BASE_PATH) return pathname;
  return `${BASE_PATH}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

/**
 * Converts a Room ID or Name (e.g. "Friday Night" or "K9P2M4") into a normalized
 * case-insensitive slug ("friday-night" or "k9p2m4").
 */
export function toRoomSlug(raw: string): string {
  try {
    return decodeURIComponent(raw)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  } catch {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }
}

function secureRandomInt(maxExclusive: number): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function generateRandomShortId(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SHORT_ID_ALPHABET[secureRandomInt(SHORT_ID_ALPHABET.length)];
  }
  return code;
}

export function format4DigitOtp(num: number): string {
  return num.toString().padStart(4, "0");
}

export function random4DigitOtp(): string {
  return format4DigitOtp(secureRandomInt(10000));
}

export function buildPlayerId(uid: string, seatAlias?: string | null): string {
  const cleanAlias = seatAlias
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
  return cleanAlias ? `${uid}_${cleanAlias}` : uid;
}
