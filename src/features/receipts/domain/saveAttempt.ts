export type SaveAdapter<Purchase> = {
  findPurchase: () => Promise<Purchase | null>;
  createPurchase: () => Promise<Purchase>;
  claimDocument: () => Promise<"CLAIMED" | "PENDING" | "READY" | "CONFLICT" | "UNAVAILABLE">;
  verifyObject: () => Promise<boolean>;
  uploadReceipt: () => Promise<void>;
  finishDocument: () => Promise<void>;
  releaseClaim: () => Promise<void>;
};

export async function saveAttempt<Purchase>(adapter: SaveAdapter<Purchase>, withReceipt: boolean): Promise<{ purchase: Purchase; partialError: unknown | null }> {
  let purchase = await adapter.findPurchase();
  if (!purchase) {
    try { purchase = await adapter.createPurchase(); }
    catch (error) {
      purchase = await adapter.findPurchase();
      if (!purchase) throw error;
    }
  }
  if (!withReceipt) return { purchase, partialError: null };
  let ownedClaim = false;
  try {
    const claim = await adapter.claimDocument();
    if (claim === "CONFLICT" || claim === "UNAVAILABLE") throw new Error("Conflicting document retry");
    if (claim === "PENDING") throw new Error("Receipt upload in progress; retry later");
    if (claim === "READY") {
      if (!await adapter.verifyObject()) throw new Error("Saved receipt object mismatch");
    } else {
      ownedClaim = true;
      // A stale claim may have uploaded before its response was lost.
      if (!await adapter.verifyObject()) await adapter.uploadReceipt();
      await adapter.finishDocument();
    }
    return { purchase, partialError: null };
  } catch (error) {
    if (ownedClaim) {
      try { await adapter.releaseClaim(); }
      catch (releaseError) { return { purchase, partialError: new AggregateError([error, releaseError], "Receipt save and claim release failed") }; }
    }
    return { purchase, partialError: error };
  }
}
