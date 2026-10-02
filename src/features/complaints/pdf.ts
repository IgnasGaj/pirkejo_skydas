import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 57;
const FONT_SIZE = 10.5;
const LINE_HEIGHT = 16;

function wrapLine(line: string, font: PDFFont, width: number): string[] {
  if (!line) return [""];
  const result: string[] = [];
  let current = "";
  for (const word of line.split(/\s+/u)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) <= width) { current = candidate; continue; }
    if (font.widthOfTextAtSize(word, FONT_SIZE) <= width) { if (current) result.push(current); current = word; continue; }
    let fragment = current ? `${current} ` : "";
    for (const char of word) {
      if (font.widthOfTextAtSize(fragment + char, FONT_SIZE) > width && fragment) { result.push(fragment); fragment = ""; }
      fragment += char;
    }
    current = fragment;
  }
  result.push(current);
  return result;
}

export async function renderComplaintPdf(sections: string[]): Promise<Uint8Array> {
  if (sections.length > 24 || sections.join("\n").length > 24000) throw new Error("Document too large");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "assets/fonts/Lato-Regular.ttf"));
  const font = await pdf.embedFont(fontBytes, { subset: true });
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  for (const section of sections) {
    for (const inputLine of section.split("\n")) {
      for (const line of wrapLine(inputLine, font, PAGE_WIDTH - MARGIN * 2)) {
        if (y < MARGIN + LINE_HEIGHT * 2) { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; }
        if (line) page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0.12, 0.16, 0.20) });
        y -= LINE_HEIGHT;
      }
    }
    y -= LINE_HEIGHT * 0.7;
  }
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`${i + 1} / ${pages.length}`, { x: PAGE_WIDTH - MARGIN - 32, y: MARGIN / 2, size: 8, font, color: rgb(0.4, 0.45, 0.5) });
  }
  pdf.setTitle("Dokumentas pardavėjui");
  pdf.setCreator("Pirkėjo Skydas");
  return pdf.save();
}
