import { describe, expect, it, vi } from "vitest";
import { documentMetadataSchema, parsePriceToCents, purchaseSchema, validateDocumentFile, verifyFileSignature } from "./validation";
import { todayInVilnius } from "@/lib/date";
import { purchaseChannels } from "./types";
import { resolvePurchaseContext } from "./context";
import { uploadDocumentWithCleanup } from "./upload";
import { scanTypes } from "@/features/receipts/client/ocr";
import type { Purchase } from "./types";

const valid = () => ({ productName: "Sony headphones", sellerName: "Topo Centras", purchaseDate: todayInVilnius(),
  receivedDate: "", purchaseChannel: "PHYSICAL_STORE", price: "399,99", referenceNumber: "", notes: "" });

describe("purchase validation", () => {
  it("accepts required purchase values", () => expect(purchaseSchema.safeParse(valid()).success).toBe(true));
  it("rejects an empty product name", () => expect(purchaseSchema.safeParse({ ...valid(), productName: "  " }).success).toBe(false));
  it("rejects an empty seller name", () => expect(purchaseSchema.safeParse({ ...valid(), sellerName: "  " }).success).toBe(false));
  it("rejects a future purchase date", () => expect(purchaseSchema.safeParse({ ...valid(), purchaseDate: "2999-01-01" }).success).toBe(false));
  it("rejects a received date before purchase", () => expect(purchaseSchema.safeParse({ ...valid(), purchaseChannel: "DISTANCE", purchaseDate: todayInVilnius(), receivedDate: "2020-01-01" }).success).toBe(false));
  it("rejects a future received date", () => expect(purchaseSchema.safeParse({ ...valid(), purchaseChannel: "DISTANCE", receivedDate: "2999-01-01" }).success).toBe(false));
  it("converts comma decimal EUR values to cents", () => expect(parsePriceToCents("399,99")).toBe(39999));
  it("rejects malformed prices", () => {
    expect(() => parsePriceToCents("3,999")).toThrow();
    expect(purchaseSchema.safeParse({ ...valid(), price: "3,999" }).success).toBe(false);
  });
  it("rejects unsupported MIME types", () => expect(validateDocumentFile({ name: "script.exe", type: "application/x-msdownload", size: 10 })).toBe("unsupported"));
  it("rejects files above 15 MB", () => expect(validateDocumentFile({ name: "receipt.pdf", type: "application/pdf", size: 15 * 1024 * 1024 + 1 })).toBe("too-large"));
  it("allows PDF and HEIC evidence while excluding them from automatic scans", () => {
    for (const [name, type] of [["receipt.pdf", "application/pdf"], ["receipt.heic", "image/heic"]]) {
      expect(validateDocumentFile({ name, type, size: 100 })).toBeNull();
      expect(scanTypes).not.toContain(type);
    }
  });
  it("limits purchase channels to the legal flow values", () => {
    expect(purchaseChannels).toEqual(["PHYSICAL_STORE", "DISTANCE", "UNKNOWN"]);
    expect(purchaseSchema.safeParse({ ...valid(), purchaseChannel: "POSTAL" }).success).toBe(false);
  });
  it("validates upload metadata", () => expect(documentMetadataSchema.safeParse({ purchaseId: crypto.randomUUID(), documentType: "RECEIPT", originalFilename: "receipt.pdf", mimeType: "application/pdf", sizeBytes: 100 }).success).toBe(true));
});

it("rejects every truncated file header, including a partial PNG prefix", async () => {
  const cases: Array<[string, number[]]> = [
    ["application/pdf", [37, 80, 68, 70]], ["image/png", [137, 80, 78, 71, 13, 10, 26]],
    ["image/jpeg", [255, 216]], ["image/webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66]],
    ["image/heic", [0, 0, 0, 0, 102, 116, 121, 112, 104, 101, 105]]
  ];
  for (const [type, bytes] of cases) expect(await verifyFileSignature(new File([new Uint8Array(bytes)], "file", { type }))).toBe(false);
});

describe("legal flow purchase context", () => {
  const purchase = { id: crypto.randomUUID(), user_id: "owner" } as Purchase;
  it("does not load a purchase when no purchaseId is provided", async () => {
    const load = vi.fn().mockResolvedValue(purchase);
    expect(await resolvePurchaseContext(undefined, "owner", load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it("never accepts inaccessible purchase context", async () => {
    expect(await resolvePurchaseContext(purchase.id, "visitor", async () => purchase)).toBeNull();
    expect(await resolvePurchaseContext(purchase.id, null, async () => purchase)).toBeNull();
  });
});

it("removes an uploaded object when metadata insertion fails", async () => {
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) };
  const file = new File(["%PDF-"], "receipt.pdf", { type: "application/pdf" });
  await expect(uploadDocumentWithCleanup(storage, async () => { throw new Error("Database error"); }, "owner/purchase/file.pdf", file)).rejects.toThrow("Database error");
  expect(storage.remove).toHaveBeenCalledWith(["owner/purchase/file.pdf"]);
});
