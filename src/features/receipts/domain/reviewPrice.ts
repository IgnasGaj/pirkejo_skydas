import type { ProductCandidate } from "./types";

export type ReviewPrice = { productName: string; price: string; priceOrigin: "candidate" | "manual" | null };

export function selectReviewProduct(previous: ReviewPrice, product: ProductCandidate): ReviewPrice {
  return {
    productName: product.name,
    price: previous.priceOrigin === "manual" ? previous.price : product.amountCents === null ? "" : (product.amountCents / 100).toFixed(2),
    priceOrigin: previous.priceOrigin === "manual" ? "manual" : product.amountCents === null ? null : "candidate"
  };
}

export function editReviewProductName(previous: ReviewPrice, productName: string): ReviewPrice {
  return { productName, price: previous.priceOrigin === "candidate" ? "" : previous.price,
    priceOrigin: previous.priceOrigin === "candidate" ? null : previous.priceOrigin };
}
