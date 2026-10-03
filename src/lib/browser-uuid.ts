/** Create a UUID v4 in browsers with either Web Crypto UUID API. */
export function createBrowserUuid(): string | null {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") {
    try { return browserCrypto.randomUUID(); } catch { /* Try secure random bytes below. */ }
  }
  if (typeof browserCrypto?.getRandomValues !== "function") return null;

  try {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}
