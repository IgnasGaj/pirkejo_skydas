import { expect, it } from "vitest";
import { editReviewProductName, selectReviewProduct, type ReviewPrice } from "./reviewPrice";

const empty: ReviewPrice = { productName: "", price: "", priceOrigin: null };

it("clears a previous candidate price when a different candidate has no reliable amount", () => {
  const first = selectReviewProduct(empty, { name: "Kava", amountCents: 350, source: "Kava 3,50" });
  expect(selectReviewProduct(first, { name: "Arbata", amountCents: null, source: "Arbata 2 vnt" }))
    .toEqual({ productName: "Arbata", price: "", priceOrigin: null });
});

it("clears an automatic amount when the proposed name is manually replaced", () => {
  const first = selectReviewProduct(empty, { name: "Kava", amountCents: 350, source: "Kava 3,50" });
  expect(editReviewProductName(first, "Arbata")).toEqual({ productName: "Arbata", price: "", priceOrigin: null });
});

it("preserves an intentionally entered manual price when selecting another product", () => {
  const manual: ReviewPrice = { productName: "Kava", price: "4,20", priceOrigin: "manual" };
  expect(selectReviewProduct(manual, { name: "Arbata", amountCents: null, source: "Arbata 2 vnt" }))
    .toEqual({ productName: "Arbata", price: "4,20", priceOrigin: "manual" });
});
