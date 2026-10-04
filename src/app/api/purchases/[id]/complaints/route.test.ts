import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Purchase } from "@/features/purchases/domain/types";

const { getAuthenticatedUser, createClient, getPurchaseById } = vi.hoisted(() => ({ getAuthenticatedUser: vi.fn(), createClient: vi.fn(), getPurchaseById: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUser, createClient }));
vi.mock("@/features/purchases/data/purchases", () => ({ getPurchaseById, listPurchaseDocuments: async () => [] }));
import { POST } from "./route";
import { decide, SOURCE_VERSION, TEMPLATE_VERSION } from "@/features/complaints/domain";
import { todayInVilnius } from "@/lib/date";

const purchase = {
  id: "11111111-1111-4111-8111-111111111111", user_id: "22222222-2222-4222-8222-222222222222",
  product_name: "Kėdė", seller_name: "Pardavėjas", purchase_date: "2026-09-20", received_date: "2026-09-22",
  purchase_channel: "DISTANCE", price_cents: 4999, currency: "EUR", reference_number: null,
  updated_at: "2026-09-20T10:00:00Z", created_at: "2026-09-20T10:00:00Z", notes: null, deletion_state: "ACTIVE"
} as Purchase;
const answers = {
  buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW",
  purchasedAt: purchase.purchase_date, deliveredAt: purchase.received_date, defectDetectedAt: "2026-09-25",
  apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO"
};
const facts = {
  consumerName: "Senas Vardas", consumerEmail: "old@example.test", sellerName: purchase.seller_name,
  sellerContact: "", productName: purchase.product_name, purchaseDate: purchase.purchase_date,
  receivedDate: purchase.received_date, purchaseChannel: "DISTANCE", referenceNumber: "",
  priceCents: purchase.price_cents, documentDate: "2026-10-02", defectDescription: "Kėdės koja yra sulūžusi.",
  defectDiscoveredAt: "2026-09-25", reductionCents: null, reductionExplanation: "", confirmedNotMinor: false,
  physicalReason: null, alternativeProof: "", evidenceIds: []
};
const base = { operation: "save", requestId: "33333333-3333-4333-8333-333333333333", family: "DEFECTIVE_PRODUCT", answers, facts, remedy: "REPAIR" };
const context = { params: Promise.resolve({ id: purchase.id }) };
function request(body: unknown) { return new NextRequest(`http://localhost/api/purchases/${purchase.id}/complaints`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }); }

beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllEnvs();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  getAuthenticatedUser.mockResolvedValue({ id: purchase.user_id }); getPurchaseById.mockResolvedValue(purchase);
});
afterEach(() => vi.useRealTimers());

it("deduplicates only an identical creation operation", async () => {
  const reviewed = decide("DEFECTIVE_PRODUCT", answers, todayInVilnius())!;
  const row = { id: "44444444-4444-4444-8444-444444444444", draft_version: 1, purchase_id: purchase.id,
    family: "DEFECTIVE_PRODUCT", remedy: "REPAIR", answers: reviewed.answers, facts,
    purchase_updated_at: purchase.updated_at, template_version: TEMPLATE_VERSION, source_version: SOURCE_VERSION };
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) }));
  createClient.mockResolvedValue({ from: () => ({ insert, select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }) });
  const same = await POST(request(base), context);
  expect(same.status).toBe(200);
  expect((await same.json()).id).toBe(row.id);
  const changed = await POST(request({ ...base, facts: { ...facts, consumerName: "Naujas Vardas" } }), context);
  expect(changed.status).toBe(409);
  expect(await changed.json()).toMatchObject({ code: "CREATION_CHANGED", id: row.id });
  expect(insert).toHaveBeenCalledTimes(2);
});

it("requires review recovery when the same creation request crosses a Vilnius date boundary", async () => {
  const firstDay = todayInVilnius();
  const reviewed = decide("DEFECTIVE_PRODUCT", answers, firstDay)!;
  const row = { id: "44444444-4444-4444-8444-444444444444", draft_version: 1, purchase_id: purchase.id,
    family: "DEFECTIVE_PRODUCT", remedy: "REPAIR", answers: reviewed.answers, facts,
    purchase_updated_at: purchase.updated_at, template_version: TEMPLATE_VERSION, source_version: SOURCE_VERSION };
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) }));
  createClient.mockResolvedValue({ from: () => ({ insert, select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }) });

  vi.setSystemTime(new Date("2026-10-03T20:59:59Z"));
  expect(todayInVilnius()).toBe(firstDay);
  vi.setSystemTime(new Date("2026-10-03T21:00:01Z"));
  expect(todayInVilnius()).toBe("2026-10-04");
  const response = await POST(request(base), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "CREATION_CHANGED", id: row.id, draft_version: 1 });
  expect(insert).toHaveBeenCalledOnce();
});

it("wraps a purchase lookup exception in a private service response", async () => {
  getPurchaseById.mockRejectedValue(new Error("backend unavailable"));
  const response = await POST(request(base), context);
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});

it("deletes without remedy or valid reviewed facts", async () => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "44444444-4444-4444-8444-444444444444" }, error: null });
  const casesQuery = { eq() { return this; }, limit: async () => ({ data: [], error: null }) };
  createClient.mockResolvedValue({ from: (table: string) => table === "cases" ? { select: () => casesQuery } : { delete: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle }) }) }) }) }) } });
  const response = await POST(request({ operation: "delete", requestId: base.requestId, complaintId: "44444444-4444-4444-8444-444444444444", facts: { consumerName: "" } }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deleted: true });
});

function generationClient(rpcError: unknown = null) {
  const draft = { id: "44444444-4444-4444-8444-444444444444", family: "DEFECTIVE_PRODUCT", answers, facts, remedy: "REPAIR", draft_version: 1, purchase_updated_at: purchase.updated_at };
  const chain = (data: unknown) => ({ select: () => ({ eq: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data, error: null }) }) });
  return { from: (name: string) => chain(name === "complaints" ? draft : null), rpc: vi.fn().mockResolvedValue({ data: null, error: rpcError }) };
}

it("distinguishes missing and mismatched signing configuration", async () => {
  createClient.mockResolvedValue(generationClient());
  vi.stubEnv("COMPLAINT_SIGNING_KEY", "");
  const body = { operation: "generate", complaintId: "44444444-4444-4444-8444-444444444444", expectedVersion: 1, requestId: base.requestId };
  const missing = await POST(request(body), context);
  expect(missing.status).toBe(503);
  expect((await missing.json()).code).toBe("SIGNING_UNAVAILABLE");
  vi.stubEnv("COMPLAINT_SIGNING_KEY", "a".repeat(32));
  createClient.mockResolvedValue(generationClient({ message: "Invalid generation signature" }));
  const mismatch = await POST(request(body), context);
  expect(mismatch.status).toBe(503);
  expect((await mismatch.json()).code).toBe("SIGNING_UNAVAILABLE");
});

it("names a missing generation migration without exposing internals", async () => {
  vi.stubEnv("COMPLAINT_SIGNING_KEY", "a".repeat(32));
  createClient.mockResolvedValue(generationClient({ code: "PGRST202", message: "function missing" }));
  const response = await POST(request({ operation: "generate", complaintId: "44444444-4444-4444-8444-444444444444", expectedVersion: 1, requestId: base.requestId }), context);
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("MIGRATION_MISSING");
});
