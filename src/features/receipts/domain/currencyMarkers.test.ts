import { describe, expect, it } from "vitest";
import { hasNonEuroCurrencyMarker } from "./currencyMarkers";

describe("receipt currency markers", () => {
  it.each(["CHF", "SEK", "NOK", "DKK", "CAD", "AUD", "NZD", "JPY", "CNY", "INR", "CZK", "HUF", "RON", "BGN", "TRY", "UAH", "USD", "GBP", "PLN", "RUB"])("recognizes %s beside an amount", (code) => {
    for (const line of [`Coffee 5.00 ${code}`, `${code} 5.00 Coffee`, `Coffee 5,00\u00a0${code.toLowerCase()}`, `Coffee ${code}:5.00`, `Coffee 5.00, ${code}.`]) {
      expect(hasNonEuroCurrencyMarker(line)).toBe(true);
    }
  });
  it.each(["$5.00", "5.00£", "5,00 zł", "¥ 500", "￥500", "₹ 50.00", "₽ 50.00"])("recognizes %s without word boundaries around punctuation", (line) => {
    expect(hasNonEuroCurrencyMarker(line)).toBe(true);
  });
  it("recognizes labelled known and unresolved codes", () => {
    expect(hasNonEuroCurrencyMarker("VALIUTA: CHF\nCoffee 5.00")).toBe(true);
    expect(hasNonEuroCurrencyMarker("Currency: XYZ\nCoffee 5.00")).toBe(true);
    expect(hasNonEuroCurrencyMarker("Coffee 5.00 XYZ")).toBe(true);
    expect(hasNonEuroCurrencyMarker(`${"\n".repeat(250)}Coffee 5.00 CHF`)).toBe(true);
  });
  it.each(["Coffee 5.00 EUR", "€ 5,00", "PVM 0,43\nKAVA 5,00", "SEKUNDĖ 5,00", "NOKIA 5,00", "CADBURY 5,00", "KASA 1\nTOTAL 5.00", "Coffee 5.00 VAT", "Coffee 5.00 VNT"])("does not flag %s", (line) => {
    expect(hasNonEuroCurrencyMarker(line)).toBe(false);
  });
  it.each(["CHF", "SEK", "NOK", "CAD"])("recognizes standalone %s in a receipt", (code) => {
    expect(hasNonEuroCurrencyMarker(`SHOP\n${code}\n2026-10-01\nCoffee 5.00\nTOTAL 5.00`)).toBe(true);
    expect(hasNonEuroCurrencyMarker(`SHOP\nCoffee 5.00\n${code}\nTOTAL 5.00`)).toBe(true);
  });
});
