export type StoredReceipt = { path: string; size: number; mime: string; filename: string };
export type ReceiptObject = { size: number; mime: string };
export type SaveAdapter<Purchase> = {
  findPurchase: () => Promise<Purchase | null>;
  createPurchase: () => Promise<Purchase>;
  findDocument: () => Promise<StoredReceipt | null>;
  inspectObject: () => Promise<ReceiptObject | null>;
  removeOrphan: () => Promise<void>;
  uploadReceipt: () => Promise<void>;
};

export async function saveAttempt<Purchase>(adapter: SaveAdapter<Purchase>, expected?: StoredReceipt): Promise<{ purchase: Purchase; partialError: unknown | null }> {
  let purchase = await adapter.findPurchase();
  if (!purchase) {
    try { purchase = await adapter.createPurchase(); }
    catch (error) {
      // The first request may have succeeded while its response was lost.
      purchase = await adapter.findPurchase();
      if (!purchase) throw error;
    }
  }
  if (!expected) return { purchase, partialError: null };
  try {
    const document = await adapter.findDocument();
    if (document) {
      if (document.path !== expected.path || document.size !== expected.size || document.mime !== expected.mime || document.filename !== expected.filename) throw new Error("Conflicting document retry");
      const object = await adapter.inspectObject();
      if (!object || object.size !== expected.size || object.mime !== expected.mime) throw new Error("Saved receipt object mismatch");
    } else {
      const orphan = await adapter.inspectObject();
      if (orphan) await adapter.removeOrphan();
      await adapter.uploadReceipt();
    }
    return { purchase, partialError: null };
  } catch (error) { return { purchase, partialError: error }; }
}
