import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PurchaseDocument } from "../domain/types";

const mocks = vi.hoisted(() => ({
  createPurchaseDocument: vi.fn(), deletePurchaseDocumentRow: vi.fn(), deletePurchaseRow: vi.fn(), listPurchaseDocuments: vi.fn()
}));
vi.mock("server-only", () => ({}));
vi.mock("./purchases", () => mocks);
import { removeDocument, removePurchaseAndEvidence, saveDocument } from "./document-service";

const document = { id: "33333333-3333-4333-8333-333333333333", user_id: "owner", purchase_id: "purchase", storage_path: "owner/purchase/file.pdf", upload_state: "READY" } as PurchaseDocument;
function client(storageRemove = vi.fn().mockResolvedValue({ error: null })) {
  const marked: unknown[] = [];
  const upload = vi.fn().mockResolvedValue({ error: null });
  const chain = {
    eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: document.id }, error: null }),
    then(resolve: (value: unknown) => void) { return Promise.resolve({ error: null }).then(resolve); }
  };
  const from = vi.fn(() => ({ update: (value: unknown) => { marked.push(value); return chain; }, delete: () => chain }));
  return { api: { from, storage: { from: () => ({ upload, remove: storageRemove }) } } as unknown as SupabaseClient<Database>, marked, upload, storageRemove };
}
beforeEach(() => { vi.clearAllMocks(); mocks.deletePurchaseDocumentRow.mockResolvedValue(undefined); mocks.deletePurchaseRow.mockResolvedValue(undefined); mocks.listPurchaseDocuments.mockResolvedValue([document]); });

it("reserves an ordinary upload before sending bytes and marks it ready only after upload", async () => {
  let release!: () => void;
  mocks.createPurchaseDocument.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
  const test = client();
  const save = saveDocument(test.api, { ...document, document_type: "RECEIPT", original_filename: "file.pdf", mime_type: "application/pdf", size_bytes: 5 }, new File(["%PDF-"], "file.pdf", { type: "application/pdf" }));
  expect(mocks.createPurchaseDocument).toHaveBeenCalledWith(test.api, expect.objectContaining({ upload_state: "PENDING" }));
  expect(test.upload).not.toHaveBeenCalled();
  release(); await save;
  expect(test.upload).toHaveBeenCalledOnce();
  expect(test.marked).toContainEqual({ upload_state: "READY" });
});

it("leaves a retryable tombstone when Storage removal fails", async () => {
  const remove = vi.fn().mockResolvedValueOnce({ error: new Error("Storage unavailable") }).mockResolvedValueOnce({ error: null });
  const test = client(remove);
  await expect(removeDocument(test.api, "owner", document)).rejects.toThrow("Storage unavailable");
  expect(test.marked[0]).toEqual({ upload_state: "DELETING" });
  expect(mocks.deletePurchaseDocumentRow).not.toHaveBeenCalled();
  await removeDocument(test.api, "owner", { ...document, upload_state: "DELETING" });
  expect(mocks.deletePurchaseDocumentRow).toHaveBeenCalledOnce();
});

it("keeps a purchase deletion retryable after successful Storage removal and failed row deletion", async () => {
  mocks.deletePurchaseRow.mockRejectedValueOnce(new Error("Database unavailable")).mockResolvedValueOnce(undefined);
  const test = client();
  await expect(removePurchaseAndEvidence(test.api, "owner", "purchase")).rejects.toThrow("Database unavailable");
  expect(test.marked[0]).toEqual({ deletion_state: "DELETING" });
  await removePurchaseAndEvidence(test.api, "owner", "purchase");
  expect(test.storageRemove).toHaveBeenCalledTimes(2);
  expect(mocks.deletePurchaseRow).toHaveBeenCalledTimes(2);
});
