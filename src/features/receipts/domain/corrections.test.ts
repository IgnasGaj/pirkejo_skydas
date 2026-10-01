import { expect, it } from "vitest";
import { selectedCorrectionInput } from "./corrections";
import type { Purchase } from "@/features/purchases/domain/types";

it("applies only selected receipt corrections and keeps legal context unanswered", () => {
  const purchase = { product_name: "Old item", seller_name: "Seller", purchase_date: "2026-09-01",
    received_date: null, purchase_channel: "UNKNOWN", price_cents: 250, reference_number: null, notes: "Original note" } as Purchase;
  const proposed = { productName: "New item", sellerName: "Wrong seller", purchaseDate: "2026-09-02", price: "9,99", referenceNumber: "R123" };
  const merged = selectedCorrectionInput(purchase, ["productName", "referenceNumber"], proposed);
  expect(merged).toEqual({ productName: "New item", sellerName: "Seller", purchaseDate: "2026-09-01", price: "2.50",
    referenceNumber: "R123", receivedDate: "", purchaseChannel: "UNKNOWN", notes: "Original note" });
});
