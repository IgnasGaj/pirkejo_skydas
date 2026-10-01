import { describe, expect, it } from "vitest";
import { parseEuroCents, parseReceiptText } from "./parseReceiptText";

const today = "2026-10-01";
describe("deterministic receipt suggestions", () => {
  it("extracts a clear receipt without making a legal decision", () => {
    const result = parseReceiptText("UAB Žalias takas\nČekio Nr. AB-123\n2026-09-30\nArbata 3,50\nIŠ VISO 3,50 EUR", today);
    expect(result.seller?.value).toBe("UAB Žalias takas");
    expect(result.purchaseDate?.value).toBe("2026-09-30");
    expect(result.referenceNumber?.value).toBe("AB-123");
    expect(result.products[0]).toMatchObject({ name: "Arbata", amountCents: 350 });
    expect(result.receiptTotal?.value).toBe(350);
    expect(result).not.toHaveProperty("purchaseChannel");
    expect(result).not.toHaveProperty("receivedDate");
    expect(result).not.toHaveProperty("guarantee");
  });
  it("supports Lithuanian day-first and dotted ISO dates", () => {
    expect(parseReceiptText("Parduotuvė\n30.09.2026", today).purchaseDate?.value).toBe("2026-09-30");
    expect(parseReceiptText("Parduotuvė\n2026.09.30", today).purchaseDate?.value).toBe("2026-09-30");
  });
  it("rejects impossible/future dates and competing dates", () => {
    expect(parseReceiptText("Parduotuvė\n31.02.2026\n2030-01-01", today).purchaseDate).toBeNull();
    const competing = parseReceiptText("Parduotuvė\n2026-09-30\n2026-09-29", today);
    expect(competing.purchaseDate).toBeNull();
    expect(competing.warnings.join(" ")).toContain("kelios");
  });
  it("does not use warranty or print dates", () => {
    const result = parseReceiptText("Parduotuvė\n2026-09-30\nGarantija galioja iki 2027-09-30\nSpausdinta 2026-10-01", today);
    expect(result.purchaseDate?.value).toBe("2026-09-30");
  });
  it("keeps totals distinct from product prices on multiple-item receipts", () => {
    const result = parseReceiptText("Parduotuvė\nKava 2,50\nArbata 3,00\nIŠ VISO 5,50 EUR", today);
    expect(result.products.map((p) => p.amountCents)).toEqual([250, 300]);
    expect(result.receiptTotal?.value).toBe(550);
    expect(result.products.every((p) => p.amountCents !== 550)).toBe(true);
  });
  it("excludes VAT, subtotal, cash, change, and discount from product lines", () => {
    const result = parseReceiptText("Parduotuvė\nKava 2,50\nPVM 0,43\nTarpinė suma 2,50\nMokėta grynais 5,00\nGrąža 2,50\nNuolaida 0,30", today);
    expect(result.products.map((p) => p.name)).toEqual(["Kava"]);
  });
  it("leaves quantity and discount interpretation for review", () => {
    const result = parseReceiptText("Parduotuvė\nKava 2 vnt 5,00\nSausainiai nuolaida 1,20", today);
    expect(result.products[0].amountCents).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("leaves missing fields empty", () => {
    const result = parseReceiptText("###\nKASA 1\nPVM 2,50", today);
    expect(result.seller).toBeNull(); expect(result.purchaseDate).toBeNull(); expect(result.products).toEqual([]);
  });
  it("does not convert non-EUR or refund amounts", () => {
    const currency = parseReceiptText("Shop\nCoffee 5.00 USD\nTOTAL 5.00 USD", today);
    expect(currency.products[0]?.amountCents).toBeNull(); expect(currency.receiptTotal).toBeNull();
    const refund = parseReceiptText("Parduotuvė\nGRĄŽINIMAS\nKava -2,50", today);
    expect(refund.products.every((p) => p.amountCents === null)).toBe(true);
  });
  it("bounds and preserves noisy literal text", () => {
    const text = "<script>alert('x')</script>\n" + "x".repeat(25_000);
    const result = parseReceiptText(text, today);
    expect(result.rawText).toContain("<script>");
    expect(result.rawText.length).toBe(20_000);
    expect(result.warnings.join(" ")).toContain("sutrumpintas");
  });
});

describe("bounded EUR parser", () => {
  it("parses comma, dot, and clear grouping", () => {
    expect(parseEuroCents("1 234,56")).toBe(123456);
    expect(parseEuroCents("12.50")).toBe(1250);
  });
  it("rejects ambiguous separators, negative values, and unsafe amounts", () => {
    for (const value of ["1,234", "1.234,56", "-2,50", "9999999999,99", "2,50 USD"]) expect(parseEuroCents(value)).toBeNull();
  });
});
