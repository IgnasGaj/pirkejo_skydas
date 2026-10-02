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
  it.each(["CHF", "SEK", "NOK", "CAD"])("suppresses %s money while preserving the product", (code) => {
    const result = parseReceiptText(`SHOP\nCoffee 5.00 ${code}\nTOTAL 5.00 ${code}`, today);
    expect(result.products[0]?.name).toContain("Coffee");
    expect(result.products[0]?.amountCents).toBeNull();
    expect(result.receiptTotal).toBeNull();
    expect(result.warnings).toContain("Čekyje aptikta kita valiuta; EUR sumos nesiūlomos.");
  });
  it.each(["CHF", "SEK", "NOK", "CAD"])("suppresses prices and totals for standalone %s", (code) => {
    for (const receipt of [`SHOP\n${code}\n2026-10-01\nCoffee 5.00\nTOTAL 5.00`, `SHOP\nCoffee 5.00\n${code}\nTOTAL 5.00`]) {
      const result = parseReceiptText(receipt, today);
      expect(result.products[0]?.amountCents).toBeNull();
      expect(result.receiptTotal).toBeNull();
      expect(result.rawText).toBe(receipt);
    }
  });
  it("keeps ordinary words and EUR controls usable", () => {
    for (const receipt of ["SHOP\nEUR\nCoffee 5.00\nTOTAL 5.00", "SHOP\nNOKIA case 5.00\nCADBURY bar 2.00\nSEKUNDĖ 1.00\nTOTAL 8.00"]) {
      const result = parseReceiptText(receipt, today);
      expect(result.products.every((product) => product.amountCents !== null)).toBe(true);
      expect(result.receiptTotal).not.toBeNull();
    }
  });
  it("suppresses every amount on mixed EUR and non-EUR receipts", () => {
    const result = parseReceiptText("Parduotuvė\nKava 2,50 EUR\nArbata 3,00 CHF\nTOTAL 5,50 €", today);
    expect(result.products).toHaveLength(2);
    expect(result.products.every((product) => product.amountCents === null)).toBe(true);
    expect(result.receiptTotal).toBeNull();
  });
  it("keeps EUR, euro-symbol and unmarked Lithuanian amounts usable", () => {
    for (const total of ["IŠ VISO 3,50 EUR", "IŠ VISO 3,50 €", "IŠ VISO 3,50"]) {
      const result = parseReceiptText(`UAB Žalias takas\nArbata 3,50\n${total}`, today);
      expect(result.products[0]?.amountCents).toBe(350);
      expect(result.receiptTotal?.value).toBe(350);
      expect(result.warnings).not.toContain("Čekyje aptikta kita valiuta; EUR sumos nesiūlomos.");
    }
  });
  it("does not mistake currency-code substrings or common headers for money markers", () => {
    const result = parseReceiptText("Parduotuvė\nCADBURY šokoladas 5,00\nNOKIA dėklas 4,00\nPVM 1,56\nKASA 1\nIŠ VISO 9,00", today);
    expect(result.products.map((product) => product.amountCents)).toEqual([500, 400]);
    expect(result.receiptTotal?.value).toBe(900);
  });
  it("treats unresolved amount suffix as unsafe currency evidence", () => {
    const result = parseReceiptText("SHOP\nCoffee 5.00 XYZ\nTOTAL 5.00 XYZ", today);
    expect(result.products[0]?.amountCents).toBeNull();
    expect(result.receiptTotal).toBeNull();
    expect(result.warnings).toContain("Čekyje aptikta kita valiuta; EUR sumos nesiūlomos.");
  });
  it.each(["$5.00", "5.00$", "£ 5.00", "5.00 £", "zł 5,00", "5,00 zł", "USD 5.00", "5.00 PLN"])("does not label %s as EUR", (amount) => {
    const result = parseReceiptText(`SHOP\nCoffee ${amount}\nTOTAL ${amount}`, today);
    expect(result.products[0]?.amountCents).toBeNull();
    expect(result.receiptTotal).toBeNull();
    expect(result.warnings.join(" ")).toContain("kita valiuta");
  });
  it("suppresses amounts when EUR and another currency are mixed", () => {
    const result = parseReceiptText("SHOP\nCoffee 5.00 EUR\nTea $2.00\nTOTAL 7.00 EUR", today);
    expect(result.products.every((product) => product.amountCents === null)).toBe(true);
    expect(result.receiptTotal).toBeNull();
  });
  it.each([
    "SHOP\nKava 5,00\nNuolaida -1,00\nTOTAL 4,00 EUR",
    "SHOP\nKava 5,00\nArbata 3,00\nBendra nuolaida -1,00\nTOTAL 7,00 EUR"
  ])("keeps discounted product prices blank", (receipt) => {
    const result = parseReceiptText(receipt, today);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((product) => product.amountCents === null)).toBe(true);
    expect(result.warnings.join(" ")).toContain("nuolaida");
  });
  it.each(["Vilniaus g. 12", "Kasininkas Jonas", "Įmonės kodas 123456789", "PVM kodas LT123456789", "Terminalas 12", "Bankas SEB", "Acquirer WORLDLINE", "Mokėjimo kortelė VISA"])("does not suggest %s as seller", (header) => {
    const result = parseReceiptText(`${header}\nUAB Žalias takas\nKava 3,50`, today);
    expect(result.seller?.value).toBe("UAB Žalias takas");
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
