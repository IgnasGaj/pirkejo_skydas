// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import type { Purchase, PurchaseDocument } from "@/features/purchases/domain/types";
import type { Row } from "@/lib/supabase/database.types";

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh }) }));
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

let testPath = 0;
afterEach(() => { cleanup(); window.history.replaceState(null, "", `/unit-${++testPath}`); window.sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); push.mockReset(); replace.mockReset(); refresh.mockReset(); });

function withoutRandomUuid() {
  let next = 0;
  vi.stubGlobal("crypto", { getRandomValues(bytes: Uint8Array) {
    for (let index = 0; index < bytes.length; index++) bytes[index] = (next++ * 17) & 255;
    return bytes;
  } });
}

it("opens a new complaint with no randomUUID and keeps the legal wizard available", () => {
  withoutRandomUuid();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialFlow="defect" />);
  expect(screen.getByRole("button", { name: "Patvirtinti patikrą" })).toBeTruthy();
});

it("reuses fallback IDs after failed saves and generations, then rotates each after success", async () => {
  withoutRandomUuid();
  const submitted: Array<{ operation: string; requestId: string }> = [];
  const responses = [
    { ok: false, json: async () => ({ error: "Ryšys nutrūko." }) },
    { ok: true, json: async () => ({ id: draft.id, draft_version: 2 }) },
    { ok: true, json: async () => ({ id: draft.id, draft_version: 3 }) },
    { ok: false, json: async () => ({ error: "Ryšys nutrūko." }) },
    { ok: true, json: async () => ({ id: "version-1", version_no: 1 }) },
    { ok: true, json: async () => ({ id: "version-2", version_no: 2 }) }
  ];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
    submitted.push(JSON.parse(options.body));
    return responses.shift();
  }));
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  const save = screen.getByRole("button", { name: "Išsaugoti juodraštį" });
  const generate = screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" });
  for (let index = 0; index < 3; index++) {
    await user.click(save);
    await waitFor(() => expect(submitted).toHaveLength(index + 1));
    await waitFor(() => expect(save.matches(":disabled")).toBe(false));
  }
  for (let index = 3; index < 6; index++) {
    await user.click(generate);
    await waitFor(() => expect(submitted).toHaveLength(index + 1));
    await waitFor(() => expect(generate.matches(":disabled")).toBe(false));
  }
  const ids = submitted.map(({ requestId }) => requestId);
  ids.forEach((id) => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  expect(ids[1]).toBe(ids[0]);
  expect(ids[2]).not.toBe(ids[1]);
  expect(ids[4]).toBe(ids[3]);
  expect(ids[5]).not.toBe(ids[4]);
  expect(submitted.map(({ operation }) => operation)).toEqual(["save", "save", "save", "generate", "generate", "generate"]);
});

it("keeps entered facts and disables requests when both secure random APIs are absent", async () => {
  vi.stubGlobal("crypto", {});
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  await user.clear(screen.getByLabelText("Vardas ir pavardė"));
  await user.type(screen.getByLabelText("Vardas ir pavardė"), "Jūratė Bandomoji");
  expect(screen.getByLabelText("Vardas ir pavardė")).toHaveProperty("value", "Jūratė Bandomoji");
  expect(screen.getByRole("alert").textContent).toContain("negalima saugiai sukurti naujos užklausos");
  expect(screen.getByRole("button", { name: "Išsaugoti juodraštį" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps successful save and generation outcomes when later ID rotation becomes unavailable", async () => {
  let calls = 0;
  vi.stubGlobal("crypto", { getRandomValues(bytes: Uint8Array) {
    if (++calls > 2) throw new Error("random source unavailable");
    bytes.fill(calls);
    return bytes;
  } });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
    const { operation } = JSON.parse(options.body);
    return { ok: true, json: async () => operation === "save" ? { id: draft.id, draft_version: 2 } : { id: "version-1", version_no: 1 } };
  }));
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
  await waitFor(() => expect(screen.getByText("Juodraštis išsaugotas.")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Išsaugoti juodraštį" }).matches(":disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }));
  await waitFor(() => expect(screen.getByText("Dokumentas parengtas.", { exact: false })).toBeTruthy());
  expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(true);
  expect(screen.getByLabelText("Vardas ir pavardė")).toHaveProperty("value", "Senas Vardas");
});

for (const existing of [false, true]) {
  it(`keeps ${existing ? "existing" : "new"} draft facts frozen through a delayed save and confirms that revision`, async () => {
    withoutRandomUuid();
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
    } else await waitFor(() => expect(replace).toHaveBeenCalledWith(`/purchases/${purchase.id}/complaints/${draft.id}`));
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

it("recovers a committed creation with changed facts before applying the edited revision", async () => {
  const submitted: Array<Record<string, unknown>> = [];
  let saves = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: { body: string }) => {
    if (!options?.body) return { ok: true, json: async () => ({ draft }) };
    const body = JSON.parse(options.body);
    submitted.push(body);
    if (++saves === 1) throw new Error("Ryšys nutrūko.");
    if (saves === 2) return { ok: false, json: async () => ({ code: "CREATION_CHANGED", error: "Ankstesnis juodraštis jau išsaugotas.", id: draft.id, draft_version: 1 }) };
    return { ok: true, json: async () => ({ id: draft.id, draft_version: 2 }) };
  }));
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialFlow="defect" />);
  await user.click(screen.getByRole("button", { name: "Patvirtinti patikrą" }));
  await user.selectOptions(screen.getByLabelText("Vienas prašymas"), "REPAIR");
  await user.type(screen.getByLabelText("Vardas ir pavardė"), "Senas Vardas");
  await user.type(screen.getByLabelText("El. paštas"), "old@example.test");
  await user.type(screen.getByLabelText("Prekės trūkumo aprašymas"), "Kėdės koja yra sulūžusi.");
  await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
  await waitFor(() => expect(submitted).toHaveLength(1));
  await user.clear(screen.getByLabelText("Vardas ir pavardė"));
  await user.type(screen.getByLabelText("Vardas ir pavardė"), "Naujas Vardas");
  await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Įkelti išsaugotą versiją" })).toBeTruthy());
  expect(submitted[1].requestId).toBe(submitted[0].requestId);
  expect((submitted[1].facts as typeof facts).consumerName).toBe("Naujas Vardas");
  await user.click(screen.getByRole("button", { name: "Įkelti išsaugotą versiją" }));
  await user.click(await screen.findByRole("button", { name: "Pritaikyti mano pakeitimus" }));
  await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
  await waitFor(() => expect(submitted).toHaveLength(3));
  expect(submitted[2].complaintId).toBe(draft.id);
  expect(submitted[2].expectedVersion).toBe(1);
  expect(submitted[2].requestId).not.toBe(submitted[1].requestId);
  expect((submitted[2].facts as typeof facts).consumerName).toBe("Naujas Vardas");
  await waitFor(() => expect(replace).toHaveBeenCalledWith(`/purchases/${purchase.id}/complaints/${draft.id}`));
});

it("keeps local edits during a refreshed revision and supports an explicit rebase", async () => {
  const revised = { ...draft, draft_version: 2, facts: { ...facts, consumerName: "Serverio Vardas" } } as Row<"complaints">;
  const submitted: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
    submitted.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: draft.id, draft_version: 3 }) };
  }));
  const user = userEvent.setup();
  const view = render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  await user.clear(screen.getByLabelText("Vardas ir pavardė"));
  await user.type(screen.getByLabelText("Vardas ir pavardė"), "Mano Vardas");
  view.rerender(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={revised} />);
  expect(screen.getByLabelText("Vardas ir pavardė")).toHaveProperty("value", "Mano Vardas");
  await user.click(screen.getByRole("button", { name: "Pritaikyti mano pakeitimus" }));
  await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
  await waitFor(() => expect(submitted).toHaveLength(1));
  expect(submitted[0].expectedVersion).toBe(2);
  expect((submitted[0].facts as typeof facts).consumerName).toBe("Mano Vardas");
});

it("deletes after reassessment clears the remedy and ignores invalid editable facts", async () => {
  const submitted: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
    submitted.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ deleted: true }) };
  }));
  vi.stubGlobal("confirm", vi.fn(() => true));
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  await user.click(screen.getByRole("button", { name: "Pakartoti teisinę patikrą" }));
  await user.click(screen.getByRole("button", { name: "Patvirtinti patikrą" }));
  await user.clear(screen.getByLabelText("Vardas ir pavardė"));
  await user.click(screen.getByRole("button", { name: "Ištrinti dokumentą" }));
  await waitFor(() => expect(submitted).toHaveLength(1));
  expect(submitted[0].operation).toBe("delete");
  expect(submitted[0].complaintId).toBe(draft.id);
});

it("protects an internal exit and retains edited facts when it is cancelled", async () => {
  vi.stubGlobal("confirm", vi.fn(() => false));
  const user = userEvent.setup();
  render(<><Link href="/purchases/other/edit">Redaguoti pirkinį</Link><ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} /></>);
  await user.clear(screen.getByLabelText("Vardas ir pavardė"));
  await user.type(screen.getByLabelText("Vardas ir pavardė"), "Mano Vardas");
  const allowed = fireEvent.click(screen.getByRole("link", { name: "Redaguoti pirkinį" }));
  expect(allowed).toBe(false);
  expect(screen.getByLabelText("Vardas ir pavardė")).toHaveProperty("value", "Mano Vardas");
});

it("keeps unsaved facts dirty through target-blank and modifier links", async () => {
  const confirm = vi.fn(() => true);
  vi.stubGlobal("confirm", confirm);
  const user = userEvent.setup();
  render(<><Link href="/purchases/other/edit" target="_blank" onClick={(event) => event.preventDefault()}>Naujas skirtukas</Link>
    <Link href="/purchases/other/edit" onClick={(event) => event.preventDefault()}>Kitas puslapis</Link>
    <Link href="/purchases/other/edit" download onClick={(event) => event.preventDefault()}>Atsisiųsti</Link>
    <a href="#reviewed-facts" onClick={(event) => event.preventDefault()}>Toje pačioje vietoje</a>
    <ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} /></>);
  await user.clear(screen.getByLabelText("Vardas ir pavardė"));
  await user.type(screen.getByLabelText("Vardas ir pavardė"), "Mano Vardas");
  const generate = screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" });
  for (const [link, options] of [
    ["Naujas skirtukas", {}], ["Kitas puslapis", { metaKey: true }],
    ["Kitas puslapis", { ctrlKey: true }], ["Kitas puslapis", { shiftKey: true }],
    ["Atsisiųsti", {}], ["Toje pačioje vietoje", {}]
  ] as const) {
    fireEvent.click(screen.getByRole("link", { name: link }), options);
    expect(screen.getByLabelText("Vardas ir pavardė")).toHaveProperty("value", "Mano Vardas");
    expect(generate.matches(":disabled")).toBe(true);
  }
  expect(confirm).not.toHaveBeenCalled();
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
});

it("rearms unload and Back after every save and later edit without accumulating sentinels", async () => {
  let version = 1;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: draft.id, draft_version: ++version }) })));
  const confirm = vi.fn(() => false);
  vi.stubGlobal("confirm", confirm);
  const pushState = vi.spyOn(window.history, "pushState");
  const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  const sentinel = (pushState.mock.calls[0][0] as { complaintLeaveSentinel: string }).complaintLeaveSentinel;
  const sentinelPushes = () => pushState.mock.calls.filter(([state]) => (state as { complaintLeaveSentinel?: string })?.complaintLeaveSentinel === sentinel).length;
  const initialPushes = sentinelPushes();
  expect(initialPushes).toBe(1);
  const baseState = { complaintLeaveBase: sentinel };
  for (const name of ["Pirmas Vardas", "Antras Vardas"]) {
    await user.clear(screen.getByLabelText("Vardas ir pavardė"));
    await user.type(screen.getByLabelText("Vardas ir pavardė"), name);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    window.dispatchEvent(new PopStateEvent("popstate", { state: baseState }));
    expect(screen.getByLabelText("Vardas ir pavardė")).toHaveProperty("value", name);
    expect(back).not.toHaveBeenCalled();
    expect(forward).toHaveBeenCalledTimes(confirm.mock.calls.length);
    await user.click(screen.getByRole("button", { name: "Išsaugoti juodraštį" }));
    await waitFor(() => expect(screen.getByText("Juodraštis išsaugotas.")).toBeTruthy());
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  }
  expect(sentinelPushes()).toBe(initialPushes); // Cancellation returns to the existing guard entry.
  await user.type(screen.getByLabelText("Vardas ir pavardė"), " trečias");
  confirm.mockReturnValue(true);
  window.dispatchEvent(new PopStateEvent("popstate", { state: baseState }));
  expect(back).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(true);
});

it("reuses the guard across StrictMode and remounts while preserving other history state", () => {
  window.history.replaceState({ __NA: true, unrelated: "kept" }, "", "/purchases/example/complaints/example");
  const pushState = vi.spyOn(window.history, "pushState");
  const view = render(<StrictMode><ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} /></StrictMode>);
  expect(pushState).toHaveBeenCalledOnce();
  const first = window.history.state;
  expect(first).toMatchObject({ __NA: true, unrelated: "kept", complaintLeaveSentinel: expect.any(String) });
  view.unmount();
  expect(window.history.state).toMatchObject({ __NA: true, unrelated: "kept", complaintLeaveSlot: window.location.pathname });
  expect(window.history.state.complaintLeaveSentinel).toBeUndefined();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  expect(pushState).toHaveBeenCalledOnce();
  expect(window.history.state.complaintLeaveSentinel).toBe(first.complaintLeaveSentinel);
});

it("restores the guard after a reload even if hydration replaced its history state", () => {
  const route = "/purchases/reload/complaints/example";
  const guardId = "complaint-before-reload";
  window.history.replaceState({ __NA: true }, "", route);
  window.sessionStorage.setItem(`complaint-leave:${route}`, guardId);
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "reload" } as unknown as PerformanceEntry]);
  const pushState = vi.spyOn(window.history, "pushState");
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  expect(pushState).not.toHaveBeenCalled();
  expect(window.history.state).toMatchObject({ __NA: true, complaintLeaveSentinel: guardId });
});

it("does not mistake Forward or hash traversal for leaving the guarded form", async () => {
  const confirm = vi.fn(() => false);
  vi.stubGlobal("confirm", confirm);
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const user = userEvent.setup();
  render(<ComplaintComposer purchase={purchase} documents={[]} initialDraft={draft} />);
  await user.type(screen.getByLabelText("Vardas ir pavardė"), " pakeista");
  const sentinel = window.history.state.complaintLeaveSentinel;
  window.dispatchEvent(new PopStateEvent("popstate", { state: { complaintLeaveSentinel: sentinel } }));
  window.dispatchEvent(new PopStateEvent("popstate", { state: { unrelated: "hash-forward" } }));
  expect(confirm).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Patvirtinti ir parengti dokumentą" }).matches(":disabled")).toBe(true);
});
