import { expect, it, vi } from "vitest";
import { saveAttempt, type SaveAdapter, type StoredReceipt } from "./saveAttempt";
import { uploadDocumentWithCleanup } from "@/features/purchases/domain/upload";

const receipt: StoredReceipt = { path: "owner/purchase/document.png", size: 8, mime: "image/png", filename: "receipt.png" };
function fixture() {
  let purchase: { id: string } | null = null;
  let document: StoredReceipt | null = null;
  let object: { size: number; mime: string } | null = null;
  const adapter: SaveAdapter<{ id: string }> = {
    findPurchase: vi.fn(async () => purchase),
    createPurchase: vi.fn(async () => { purchase = { id: "purchase" }; return purchase; }),
    findDocument: vi.fn(async () => document),
    inspectObject: vi.fn(async () => object),
    removeOrphan: vi.fn(async () => { object = null; }),
    uploadReceipt: vi.fn(async () => { object = { size: 8, mime: "image/png" }; document = receipt; })
  };
  return { adapter, setPurchase: (value: { id: string } | null) => { purchase = value; }, setObject: (value: { size: number; mime: string } | null) => { object = value; } };
}

it("retries a lost response without duplicating purchase or receipt", async () => {
  const { adapter } = fixture();
  expect((await saveAttempt(adapter, receipt)).partialError).toBeNull();
  expect((await saveAttempt(adapter, receipt)).partialError).toBeNull();
  expect(adapter.createPurchase).toHaveBeenCalledTimes(1);
  expect(adapter.uploadReceipt).toHaveBeenCalledTimes(1);
});
it("recovers a purchase after an upload failure and retries the same attachment", async () => {
  const { adapter } = fixture();
  vi.mocked(adapter.uploadReceipt).mockRejectedValueOnce(new Error("upload failed"));
  const first = await saveAttempt(adapter, receipt);
  expect(first.purchase.id).toBe("purchase");
  expect(first.partialError).toBeTruthy();
  expect((await saveAttempt(adapter, receipt)).partialError).toBeNull();
  expect(adapter.createPurchase).toHaveBeenCalledTimes(1);
});
it("removes only an orphan at this attempt's stable path", async () => {
  const { adapter, setPurchase, setObject } = fixture();
  setPurchase({ id: "purchase" }); setObject({ size: 8, mime: "image/png" });
  expect((await saveAttempt(adapter, receipt)).partialError).toBeNull();
  expect(adapter.removeOrphan).toHaveBeenCalledTimes(1);
  expect(adapter.uploadReceipt).toHaveBeenCalledTimes(1);
});
it("preserves metadata failure when cleanup also fails", async () => {
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: new Error("cleanup") }) };
  const file = new File(["x"], "receipt.png", { type: "image/png" });
  await expect(uploadDocumentWithCleanup(storage, async () => { throw new Error("metadata"); }, receipt.path, file))
    .rejects.toMatchObject({ errors: [expect.objectContaining({ message: "metadata" }), expect.objectContaining({ message: "cleanup" })] });
});
