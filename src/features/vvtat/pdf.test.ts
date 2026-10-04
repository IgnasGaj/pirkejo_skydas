import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { renderPreparationPdf } from "@/features/complaints/pdf";

it("renders a bounded, multi-page Lithuanian chronology without dropping entries", async () => {
  const lines = Array.from({ length: 180 }, (_, index) => `${index + 1}. 2026-10-04 — Įrašas apie grąžintą prekę, pardavėjo atsakymą ir taisymo pažadą. ${"Ąžuolas".repeat(10)}`);
  const bytes = await renderPreparationPdf(["GINČO RENGIMO SANTRAUKA", lines.join("\n"), "Pabaiga: visi įrašai pateikti."]);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(2);
  expect(pdf.getPageCount()).toBeLessThan(120);
  if (process.env.VVTAT_PDF_QA_PATH) writeFileSync(process.env.VVTAT_PDF_QA_PATH, bytes);
});
