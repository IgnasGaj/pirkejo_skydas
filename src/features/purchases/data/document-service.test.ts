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

const document = { id: "33333333-3333-4333-8333-333333333333", user_id: "owner", purchase_id: "purchase",
  storage_path: "owner/purchase/file.pdf", upload_state: "READY", upload_claim_expires_at: null } as PurchaseDocument;
type Result = { data?: Record<string, unknown> | null; error: Error | null };
function client(options: { ready?: Result; mark?: Result; deleteRow?: Result; remove?: ReturnType<typeof vi.fn>; list?: ReturnType<typeof vi.fn> } = {}) {
  const marked: unknown[] = [];
  const deleted: string[] = [];
  const upload = vi.fn().mockResolvedValue({ error: null });
  const storageRemove = options.remove ?? vi.fn().mockResolvedValue({ error: null });
  const storageList = options.list ?? vi.fn().mockResolvedValue({ data: [], error: null });
  const chain = (operation: "ready" | "mark" | "delete") => ({
    eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => operation === "ready"
      ? options.ready ?? { data: { id: document.id }, error: null }
      : options.mark ?? { data: { id: document.id, storage_path: document.storage_path, upload_claim_expires_at: null }, error: null }),
    then(resolve: (value: Result) => void) { return Promise.resolve(operation === "delete" ? options.deleteRow ?? { error: null } : { error: null }).then(resolve); }
  });
  const from = vi.fn(() => ({
    update: (value: { upload_state?: string }) => { marked.push(value); return chain(value.upload_state === "READY" ? "ready" : "mark"); },
    delete: () => { deleted.push("delete"); return chain("delete"); }
  }));
  return { api: { from, storage: { from: () => ({ upload, remove: storageRemove, list: storageList }) } } as unknown as SupabaseClient<Database>,
    marked, deleted, upload, storageRemove, storageList };
}
beforeEach(() => { vi.clearAllMocks(); mocks.createPurchaseDocument.mockResolvedValue(undefined);
  mocks.deletePurchaseDocumentRow.mockResolvedValue(undefined); mocks.deletePurchaseRow.mockResolvedValue(undefined);
  mocks.listPurchaseDocuments.mockResolvedValue([document]); });

it("reserves an ordinary upload before sending bytes and clears its claim only when ready", async () => {
  let release!: () => void;
  mocks.createPurchaseDocument.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
  const test = client();
  const save = saveDocument(test.api, { ...document, document_type: "RECEIPT", original_filename: "file.pdf", mime_type: "application/pdf", size_bytes: 5 }, new File(["%PDF-"], "file.pdf", { type: "application/pdf" }));
  expect(mocks.createPurchaseDocument).toHaveBeenCalledWith(test.api, expect.objectContaining({ upload_state: "PENDING", upload_claim_token: expect.any(String), upload_claim_expires_at: expect.any(String) }));
  expect(test.upload).not.toHaveBeenCalled();
  release(); await save;
  expect(test.upload).toHaveBeenCalledOnce();
  expect(test.marked).toContainEqual({ upload_state: "READY", upload_claim_token: null, upload_claim_expires_at: null });
});

it("retains a non-READY tombstone after READY and Storage cleanup fail, then retries", async () => {
  const remove = vi.fn().mockResolvedValueOnce({ error: new Error("Storage unavailable") }).mockResolvedValueOnce({ error: null });
  const test = client({ ready: { data: null, error: new Error("READY unavailable") }, remove });
  await expect(saveDocument(test.api, { ...document, document_type: "RECEIPT", original_filename: "file.pdf", mime_type: "application/pdf", size_bytes: 5 }, new File(["%PDF-"], "file.pdf", { type: "application/pdf" }))).rejects.toThrow("Document upload cleanup failed");
  expect(test.marked).toContainEqual({ upload_state: "DELETING", upload_claim_token: null, upload_claim_expires_at: null });
  expect(test.deleted).toHaveLength(0);
  await removeDocument(test.api, "owner", { ...document, upload_state: "DELETING" });
  expect(mocks.deletePurchaseDocumentRow).toHaveBeenCalledOnce();
});

it("keeps metadata when Storage cleanup succeeds but its row deletion fails", async () => {
  const test = client({ ready: { data: null, error: new Error("READY unavailable") }, deleteRow: { error: new Error("Database unavailable") } });
  await expect(saveDocument(test.api, { ...document, document_type: "RECEIPT", original_filename: "file.pdf", mime_type: "application/pdf", size_bytes: 5 }, new File(["%PDF-"], "file.pdf", { type: "application/pdf" }))).rejects.toThrow("Document upload cleanup failed");
  expect(test.deleted).toHaveLength(1);
  await removeDocument(test.api, "owner", { ...document, upload_state: "DELETING" });
  expect(test.storageRemove).toHaveBeenCalledTimes(2);
  expect(mocks.deletePurchaseDocumentRow).toHaveBeenCalledOnce();
});

it("keeps retryable metadata when Storage reports success but the object is still listed", async () => {
  const list = vi.fn().mockResolvedValue({ data: [{ name: "file.pdf" }], error: null });
  const test = client({ ready: { data: null, error: new Error("READY unavailable") }, list });
  await expect(saveDocument(test.api, { ...document, document_type: "RECEIPT", original_filename: "file.pdf", mime_type: "application/pdf", size_bytes: 5 }, new File(["%PDF-"], "file.pdf", { type: "application/pdf" }))).rejects.toThrow("Document upload cleanup failed");
  expect(test.deleted).toHaveLength(0);
  expect(test.marked).toContainEqual({ upload_state: "DELETING", upload_claim_token: null, upload_claim_expires_at: null });
});

it("blocks another account before Storage removal and retains an active upload claim", async () => {
  const denied = client({ mark: { data: null, error: null } });
  await expect(removeDocument(denied.api, "other", document)).rejects.toThrow("no owned row");
  expect(denied.storageRemove).not.toHaveBeenCalled();
  const active = client({ mark: { data: { storage_path: document.storage_path, upload_claim_expires_at: new Date(Date.now() + 60_000).toISOString() }, error: null } });
  await expect(removeDocument(active.api, "owner", { ...document, upload_state: "PENDING" })).rejects.toThrow("still in progress");
  expect(active.storageRemove).toHaveBeenCalledOnce();
  expect(mocks.deletePurchaseDocumentRow).not.toHaveBeenCalled();
});

it("leaves a retryable tombstone when ordinary file Storage removal fails", async () => {
  const remove = vi.fn().mockResolvedValueOnce({ error: new Error("Storage unavailable") }).mockResolvedValueOnce({ error: null });
  const test = client({ remove });
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

it("keeps a deleting purchase until an in-flight upload finishes or its claim expires", async () => {
  mocks.listPurchaseDocuments.mockResolvedValue([{ ...document, upload_state: "PENDING", upload_claim_expires_at: new Date(Date.now() + 60_000).toISOString() }]);
  const test = client();
  await expect(removePurchaseAndEvidence(test.api, "owner", "purchase")).rejects.toThrow("still in progress");
  expect(mocks.deletePurchaseRow).not.toHaveBeenCalled();
});
