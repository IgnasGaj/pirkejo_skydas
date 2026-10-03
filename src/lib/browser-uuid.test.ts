// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserUuid } from "./browser-uuid";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => vi.unstubAllGlobals());

it("uses native randomUUID with its Crypto receiver", () => {
  const browserCrypto = { randomUUID() { expect(this).toBe(browserCrypto); return "12345678-1234-4123-8123-123456789abc"; } };
  vi.stubGlobal("crypto", browserCrypto);
  expect(createBrowserUuid()).toBe("12345678-1234-4123-8123-123456789abc");
});

it("creates distinct UUID v4 values with correct version and variant when randomUUID is absent", () => {
  let count = 0;
  const browserCrypto = { getRandomValues(bytes: Uint8Array) {
    expect(this).toBe(browserCrypto);
    bytes.set(Array.from({ length: 16 }, (_, index) => (index + count++) & 255));
    return bytes;
  } };
  vi.stubGlobal("crypto", browserCrypto);
  const first = createBrowserUuid();
  const second = createBrowserUuid();
  expect(first).toMatch(uuidV4);
  expect(second).toMatch(uuidV4);
  expect(second).not.toBe(first);
});

it("returns null when secure random bytes are unavailable or fail", () => {
  vi.stubGlobal("crypto", {});
  expect(createBrowserUuid()).toBeNull();
  vi.stubGlobal("crypto", { getRandomValues: () => { throw new Error("unavailable"); } });
  expect(createBrowserUuid()).toBeNull();
});

it("recovers from a throwing native method using secure random bytes", () => {
  vi.stubGlobal("crypto", { randomUUID: () => { throw new Error("unavailable"); }, getRandomValues(bytes: Uint8Array) { bytes.fill(42); return bytes; } });
  expect(createBrowserUuid()).toMatch(uuidV4);
});
