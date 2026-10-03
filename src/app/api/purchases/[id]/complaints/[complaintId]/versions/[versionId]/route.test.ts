import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getAuthenticatedUser: vi.fn(), getPurchaseById: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient, getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/features/purchases/data/purchases", () => ({ getPurchaseById: mocks.getPurchaseById }));
import { GET } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const complaintId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id, complaintId, versionId }) };
function query(result: { data: unknown; error: unknown }) {
  const chain = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result) };
  return { select: () => chain };
}
beforeEach(() => { vi.clearAllMocks(); mocks.getAuthenticatedUser.mockResolvedValue({ id: "owner" }); mocks.getPurchaseById.mockResolvedValue({ id }); });

it("reports an authorized complaint read failure as unavailable", async () => {
  mocks.createClient.mockResolvedValue({ from: () => query({ data: null, error: new Error("backend down") }) });
  const response = await GET(new NextRequest(`http://localhost/api/purchases/${id}/complaints/${complaintId}/versions/${versionId}`), context);
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.text()).toContain("laikinai nepasiekiamas");
});

it("reports a version query failure separately from a missing document", async () => {
  mocks.createClient.mockResolvedValue({ from: (name: string) => name === "complaints" ? query({ data: { id: complaintId }, error: null }) : query({ data: null, error: new Error("backend down") }) });
  const response = await GET(new NextRequest(`http://localhost/api/purchases/${id}/complaints/${complaintId}/versions/${versionId}`), context);
  expect(response.status).toBe(503);
  mocks.createClient.mockResolvedValue({ from: () => query({ data: null, error: null }) });
  const missing = await GET(new NextRequest(`http://localhost/api/purchases/${id}/complaints/${complaintId}/versions/${versionId}`), context);
  expect(missing.status).toBe(404);
});
