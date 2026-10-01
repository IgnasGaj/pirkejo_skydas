import { expect, it, vi } from "vitest";
import { saveAttempt, type SaveAdapter } from "./saveAttempt";
import { uploadDocumentWithCleanup } from "@/features/purchases/domain/upload";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  let purchase: { id: string } | null = null;
  let state: "missing" | "pending" | "ready" = "missing";
  let owner: string | null = null;
  let object = false;
  const uploadGate = deferred();
  function adapter(token: string): SaveAdapter<{ id: string }> {
    return {
      findPurchase: async () => purchase,
      createPurchase: async () => { purchase = { id: "purchase" }; return purchase; },
      claimDocument: async () => {
        if (state === "ready") return "READY";
        if (state === "pending" && owner !== null && owner !== token) return "PENDING";
        state = "pending"; owner = token; return "CLAIMED";
      },
      verifyObject: async () => object,
      uploadReceipt: vi.fn(async () => { await uploadGate.promise; object = true; }),
      finishDocument: async () => { if (owner !== token) throw new Error("claim changed"); state = "ready"; owner = null; },
      releaseClaim: async () => { if (owner === token && state === "pending") owner = null; }
    };
  }
  return { adapter, uploadGate, getState: () => ({ purchase, state, object }), setObject: (value: boolean) => { object = value; } };
}

it("keeps successful evidence when two requests overlap before upload completes", async () => {
  const { adapter, uploadGate, getState } = fixture();
  const first = adapter("first");
  const second = adapter("second");
  const requestA = saveAttempt(first, true);
  await vi.waitFor(() => expect(first.uploadReceipt).toHaveBeenCalledTimes(1));
  const requestB = await saveAttempt(second, true);
  expect(requestB.partialError).toBeInstanceOf(Error);
  expect(second.uploadReceipt).not.toHaveBeenCalled();
  uploadGate.resolve();
  expect((await requestA).partialError).toBeNull();
  expect((await saveAttempt(second, true)).partialError).toBeNull();
  expect(getState()).toEqual({ purchase: { id: "purchase" }, state: "ready", object: true });
  expect(second.uploadReceipt).not.toHaveBeenCalled();
});

it("recovers an uploaded object after the claim owner fails before marking ready", async () => {
  const { adapter, uploadGate, getState } = fixture();
  const first = adapter("first");
  const second = adapter("second");
  uploadGate.resolve();
  first.finishDocument = vi.fn(async () => { throw new Error("metadata update failed"); });
  expect((await saveAttempt(first, true)).partialError).toBeTruthy();
  expect(getState().object).toBe(true);
  expect((await saveAttempt(second, true)).partialError).toBeNull();
  expect(second.uploadReceipt).not.toHaveBeenCalled();
  expect(getState().state).toBe("ready");
});

it("does not let an overlapping retry replace evidence after upload but before finalization", async () => {
  const { adapter, uploadGate, getState } = fixture();
  const finishGate = deferred();
  const first = adapter("first");
  const finish = first.finishDocument;
  first.finishDocument = async () => { await finishGate.promise; await finish(); };
  const second = adapter("second");
  uploadGate.resolve();
  const requestA = saveAttempt(first, true);
  await vi.waitFor(() => expect(getState().object).toBe(true));
  expect((await saveAttempt(second, true)).partialError).toBeTruthy();
  expect(second.uploadReceipt).not.toHaveBeenCalled();
  finishGate.resolve();
  expect((await requestA).partialError).toBeNull();
  expect(getState().object).toBe(true);
});

it("keeps a purchase for retry after an upload failure", async () => {
  const { adapter, uploadGate } = fixture();
  const first = adapter("first");
  first.uploadReceipt = vi.fn().mockRejectedValueOnce(new Error("upload failed")).mockImplementation(async () => { await uploadGate.promise; });
  expect((await saveAttempt(first, true)).partialError).toBeTruthy();
  expect((await saveAttempt(adapter("second"), false)).purchase.id).toBe("purchase");
});

it("preserves metadata failure when ordinary upload cleanup also fails", async () => {
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: new Error("cleanup") }) };
  const file = new File(["x"], "receipt.png", { type: "image/png" });
  await expect(uploadDocumentWithCleanup(storage, async () => { throw new Error("metadata"); }, "owner/purchase/document.png", file))
    .rejects.toMatchObject({ errors: [expect.objectContaining({ message: "metadata" }), expect.objectContaining({ message: "cleanup" })] });
});
