// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Purchase, PurchaseDocument } from "@/features/purchases/domain/types";
import type { Row } from "@/lib/supabase/database.types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const assessmentAnswers = {
  buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW",
  purchasedAt: "2026-09-20", deliveredAt: "2026-09-22", defectDetectedAt: "2026-09-25",
  apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO"
};
vi.mock("@/features/defective-product/components/DefectiveProductWizard", () => ({
  DefectiveProductWizard: ({ onPrepare }: { onPrepare: (value: typeof assessmentAnswers) => void }) =>
    <button type="button" onClick={() => onPrepare(assessmentAnswers)}>Patvirtinti patikrą</button>
}));
vi.mock("@/features/returns/components/ReturnWizard", () => ({ ReturnWizard: () => null }));
import { ComplaintComposer } from "./ComplaintComposer";

const purchase = {
  id: "11111111-1111-4111-8111-111111111111", user_id: "22222222-2222-4222-8222-222222222222",
  product_name: "Kėdė", seller_name: "Pardavėjas UAB", purchase_date: "2026-09-20", received_date: "2026-09-22",
  purchase_channel: "DISTANCE", price_cents: 4999, currency: "EUR", reference_number: "UŽS-1",
  notes: null, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z"
} as Purchase;
const facts = {
  consumerName: "Senas Vardas", consumerEmail: "old@example.test", sellerName: purchase.seller_name,
  sellerContact: "", productName: purchase.product_name, purchaseDate: purchase.purchase_date,
  receivedDate: purchase.received_date, purchaseChannel: "DISTANCE", referenceNumber: "UŽS-1",
  priceCents: purchase.price_cents, documentDate: "2026-10-02", defectDescription: "Kėdės koja yra sulūžusi.",
  defectDiscoveredAt: "2026-09-25", reductionCents: null, reductionExplanation: "", confirmedNotMinor: false,
  physicalReason: null, alternativeProof: "", evidenceIds: []
};
const draft = {
  id: "33333333-3333-4333-8333-333333333333", family: "DEFECTIVE_PRODUCT", answers: assessmentAnswers, facts,
  remedy: "REPAIR", draft_version: 1, purchase_updated_at: purchase.updated_at
} as unknown as Row<"complaints">;
const evidence = {
  id: "44444444-4444-4444-8444-444444444444", user_id: purchase.user_id, purchase_id: purchase.id,
  document_type: "RECEIPT", original_filename: "bandymas.pdf", storage_path: "synthetic/path",
  mime_type: "application/pdf", size_bytes: 100, created_at: purchase.created_at, upload_state: "READY",
  content_sha256: null, upload_claim_token: null, upload_claim_expires_at: null
} as PurchaseDocument;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); refresh.mockReset(); });

for (const existing of [false, true]) {
  it(`keeps ${existing ? "existing" : "new"} draft facts frozen through a delayed save and confirms that revision`, async () => {
    let resolve!: (value: unknown) => void;
    const submitted: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, options: { body: string }) => {
      submitted.push(JSON.parse(options.body));
      return new Promise((done) => { resolve = done; });
    }));
    const user = userEvent.setup();
    render(<ComplaintComposer purchase={purchase} documents={[evidence]} {...(existing ? { initialDraft: draft } : { initialFlow: "defect" })} />);
    if (!existing) {
      await user.click(screen.getByRole("button", { name: "Patvirtinti patikrą" }));
      await user.selectOptions(screen.getByLabelText("Vienas prašymas"), "REPAIR");
      await user.type(screen.getByLabelText("Vardas ir pavardė"), "Senas Vardas");
      await user.type(screen.getByLabelText("El. paštas"), "old@example.test");
      await user.type(screen.getByLabelText("Prekės trūkumo aprašymas"), "Kėdės koja yra sulūžusi.");
    }
    await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
    expect(screen.getByLabelText("Vardas ir pavardė").matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Prekės trūkumo aprašymas").matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Vienas prašymas").matches(":disabled")).toBe(true);
    expect(screen.getByRole("checkbox", { name: /bandymas.pdf/ }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Išsaugoti juodraštį" }).matches(":disabled")).toBe(true);
    expect((submitted[0] as { facts: typeof facts }).facts.consumerName).toBe("Senas Vardas");
    resolve({ ok: true, json: async () => ({ id: draft.id, draft_version: existing ? 2 : 1 }) });
    if (existing) {
      await waitFor(() => expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(false));
      expect(screen.getByText(/Vartotojas: Senas Vardas/)).toBeTruthy();
    } else await waitFor(() => expect(push).toHaveBeenCalledWith(`/purchases/${purchase.id}/complaints/${draft.id}`));
  });
}

it("requires explicit reassessment before rebinding an existing draft after a purchase update", async () => {
  const currentPurchase = { ...purchase, updated_at: "2026-10-03T10:00:00Z", notes: "Patikslinta pastaba" };
  const submissions: Array<{ rebind: boolean; facts: typeof facts }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
    submissions.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: draft.id, draft_version: 2 }) };
  }));
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={currentPurchase} documents={[]} initialDraft={draft} />);
  expect(screen.getByRole("button", { name: "Išsaugoti juodraštį" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Pakartoti teisinę patikrą" }));
  await user.click(screen.getByRole("button", { name: "Patvirtinti patikrą" }));
  await user.selectOptions(screen.getByLabelText("Vienas prašymas"), "REPAIR");
  await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0].rebind).toBe(true);
  expect(submissions[0].facts.consumerName).toBe("Senas Vardas");
});

it("keeps a newly entered discovery date out of the saved preview until reassessment", () => {
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={{ ...draft, answers: { ...assessmentAnswers, defectDetectedAt: undefined }, facts: { ...facts, defectDiscoveredAt: null } } as Row<"complaints">} />);
  fireEvent.change(screen.getByLabelText("Trūkumo pastebėjimo data"), { target: { value: "2026-09-25" } });
  expect(screen.getByRole("button", { name: "Išsaugoti juodraštį" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Pakartoti teisinę patikrą" })).toBeTruthy();
});

it("requires an older price-reduction draft to be resaved without the obsolete declaration", async () => {
  const older = { ...draft, remedy: "PRICE_REDUCTION", answers: { ...assessmentAnswers, writtenSellerContact: "YES", sellerClaim: { receivedAt: "2026-09-26", requestedRemedy: "REPAIR" }, sellerOutcome: "REPAIR_FAILED_OR_DEFECT_RECURRED" }, facts: { ...facts, reductionCents: 1000, reductionExplanation: "Kėdė vis dar netinkama naudoti.", confirmedNotMinor: true } } as Row<"complaints">;
  const submitted: Array<{ facts: typeof facts }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
    submitted.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: draft.id, draft_version: 2 }) };
  }));
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={older} />);
  expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(true);
  expect(screen.getByText("Kainos sumažinimui nebereikia patvirtinti", { exact: false })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
  await waitFor(() => expect(submitted).toHaveLength(1));
  expect(submitted[0].facts.confirmedNotMinor).toBe(false);
});
