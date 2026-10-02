import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { renderComplaintPdf } from "./pdf";

it("renders a real selectable Lithuanian PDF with wrapped pages", async () => {
  const sections = ["2026-10-02\nJūratė Ąžuolaitė\nPardavėjas: Šiaulių įmonė", "PRETENZIJA DĖL NEKOKYBIŠKOS PREKĖS", `Trūkumas: ${"Ilgas aprašymas apie prekės gedimą. ".repeat(140)}`, `Priedai:\n${Array.from({ length: 12 }, (_, i) => `${i + 1}. labai-ilgas-dokumento-pavadinimas-${"ąčęėįšųūž".repeat(10)}.pdf`).join("\n")}`];
  const pdf = await renderComplaintPdf(sections);
  expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5000);
  if (process.env.COMPLAINT_PDF_INSPECTION_PATH) await writeFile(process.env.COMPLAINT_PDF_INSPECTION_PATH, pdf);
  if (process.env.COMPLAINT_PDF_SHORT_PATH) {
    const shortPdf = await renderComplaintPdf(["2026-10-02\nPardavėjui: Šiaulių įmonė\nVartotojas: Jūratė Ąžuolaitė", "PRANEŠIMAS APIE NUOTOLINĖS SUTARTIES ATSISAKYMĄ", "Prekė: Žąsų plunksnų pagalvė\nUžsakymo numeris: UŽS-ąčęėįšųūž-123", "Pranešu, kad atsisakau nuotoliniu būdu sudarytos šios prekės pirkimo–pardavimo sutarties.", "Pagarbiai\nJūratė Ąžuolaitė"]);
    await writeFile(process.env.COMPLAINT_PDF_SHORT_PATH, shortPdf);
  }
});
