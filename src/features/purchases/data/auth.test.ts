import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUser: vi.fn() }));

import { safeReturnPath } from "./auth";

it("preserves only valid receipt draft IDs across login", () => {
  const draft = crypto.randomUUID();
  const document = crypto.randomUUID();
  expect(safeReturnPath(`/purchases/new?draft=${draft}&document=${document}`)).toBe(`/purchases/new?draft=${draft}&document=${document}`);
  expect(safeReturnPath(`/purchases/new?draft=${draft}&document=${document}&next=//evil.example`)).toBe("/purchases/new");
  expect(safeReturnPath("//evil.example/purchases/new")).toBe("/purchases");
});
