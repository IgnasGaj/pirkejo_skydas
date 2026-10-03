// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReceiptSuggestions } from "../domain/types";
import type { Purchase, PurchaseDocument } from "@/features/purchases/domain/types";

const suggestions: ReceiptSuggestions = {
  seller: null, purchaseDate: null, referenceNumber: null, receiptTotal: null, rawText: "",
  warnings: [], products: [
    { name: "Kava", amountCents: 350, source: "Kava 3,50" },
    { name: "Arbata", amountCents: null, source: "Arbata 2 vnt 4,00" }
  ]
};
vi.mock("./ReceiptScanner", () => ({
  ReceiptScanner: ({ file, onResult }: { file: File | null; onResult: (result: ReceiptSuggestions) => void }) =>
    <><span data-testid="loaded-file">{file?.name ?? "Nėra failo"}</span><button type="button" onClick={() => onResult(suggestions)}>Pateikti bandymo OCR</button></>
}));

import { ExistingReceiptScanner } from "./ExistingReceiptScanner";

const purchase: Purchase = {
  id: "purchase", user_id: "owner", product_name: "Sena prekė", seller_name: "Parduotuvė",
  purchase_date: "2026-09-30", received_date: null, purchase_channel: "UNKNOWN",
  price_cents: null, currency: "EUR", reference_number: null, notes: null,
  created_at: "2026-09-30T12:00:00Z", updated_at: "2026-09-30T12:00:00Z", deletion_state: "ACTIVE"
};
const document: PurchaseDocument = {
  id: "document", user_id: "owner", purchase_id: "purchase", document_type: "RECEIPT",
  original_filename: "receipt.png", storage_path: "owner/purchase/document.png",
  mime_type: "image/png", size_bytes: 3, created_at: "2026-09-30T12:00:00Z",
  upload_state: "READY", content_sha256: null, upload_claim_token: null, upload_claim_expires_at: null
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function review() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: { get: () => "3" }, blob: async () => new Blob(["png"], { type: "image/png" }) })));
  const user = userEvent.setup();
  render(<ExistingReceiptScanner purchase={purchase} document={document} action={async () => ({ error: null })} />);
  await user.click(screen.getByRole("button", { name: "Nuskaityti čekį" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Pateikti bandymo OCR" })).toBeTruthy());
  await user.click(screen.getByRole("button", { name: "Pateikti bandymo OCR" }));
  return user;
}

it("clears a candidate price when an uncertain product is selected in the review", async () => {
  const user = await review();
  const price = screen.getByLabelText("Siūloma: Prekės kaina (EUR)") as HTMLInputElement;
  await user.click(screen.getByRole("button", { name: /Kava · 3\.50 EUR/ }));
  expect(price.value).toBe("3.50");
  await user.click(screen.getByRole("button", { name: /Arbata/ }));
  expect(price.value).toBe("");
  expect((screen.getByLabelText("Siūloma: Prekė") as HTMLInputElement).value).toBe("Arbata");
});

it("clears an OCR price after manual name replacement and preserves a manual price", async () => {
  const user = await review();
  const price = screen.getByLabelText("Siūloma: Prekės kaina (EUR)") as HTMLInputElement;
  const name = screen.getByLabelText("Siūloma: Prekė") as HTMLInputElement;
  await user.click(screen.getByRole("button", { name: /Kava · 3\.50 EUR/ }));
  fireEvent.change(name, { target: { value: "Puodelis" } });
  expect(price.value).toBe("");
  fireEvent.change(price, { target: { value: "4,20" } });
  await user.click(screen.getByRole("button", { name: /Arbata/ }));
  expect(price.value).toBe("4,20");
});

it("ignores an old fetch after close and starts a clean scan session", async () => {
  let finishFirst!: (value: unknown) => void;
  let calls = 0;
  vi.stubGlobal("fetch", vi.fn(() => {
    const response = { ok: true, headers: { get: () => "3" }, blob: async () => new Blob(["png"], { type: "image/png" }) };
    return ++calls === 1 ? new Promise((resolve) => { finishFirst = resolve; }) : Promise.resolve(response);
  }));
  const user = userEvent.setup();
  render(<ExistingReceiptScanner purchase={purchase} document={document} action={async () => ({ error: null })} />);
  await user.click(screen.getByRole("button", { name: "Nuskaityti čekį" }));
  await user.click(screen.getByRole("button", { name: "Uždaryti nuskaitymą" }));
  await user.click(screen.getByRole("button", { name: "Nuskaityti čekį" }));
  await waitFor(() => expect(screen.getByTestId("loaded-file").textContent).toBe("receipt.png"));
  finishFirst({ ok: false });
  await waitFor(() => expect(screen.getByTestId("loaded-file").textContent).toBe("receipt.png"));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("clears a manually selected price when the scan is closed and reopened", async () => {
  const user = await review();
  await user.click(screen.getByRole("button", { name: /Kava · 3\.50 EUR/ }));
  fireEvent.change(screen.getByLabelText("Siūloma: Prekės kaina (EUR)"), { target: { value: "4,20" } });
  await user.click(screen.getByRole("button", { name: "Uždaryti nuskaitymą" }));
  await user.click(screen.getByRole("button", { name: "Nuskaityti čekį" }));
  await user.click(screen.getByRole("button", { name: "Pateikti bandymo OCR" }));
  expect(screen.getByLabelText("Siūloma: Prekės kaina (EUR)")).toHaveProperty("value", "");
});
