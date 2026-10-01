import { expect, test } from "@playwright/test";

test("real same-origin worker recognizes a synthetic receipt", async ({ page }) => {
  test.setTimeout(120_000);
  const external: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:3100")) external.push(request.url()); });
  await page.goto("/");
  const before = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(before.some((url) => url.includes("/ocr/"))).toBe(false);
  await page.addScriptTag({ url: "/ocr/tesseract.min.js" });
  const text = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400; canvas.height = 480;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black"; context.font = "bold 72px Arial";
    context.fillText("CEKIS NR 12345", 65, 120);
    context.fillText("PREKE KAVA", 65, 240);
    context.fillText("VISO 12,50 EUR", 65, 360);
    const tesseract = (window as unknown as { Tesseract: { createWorker: (languages: string[], mode: number, options: Record<string, unknown>) => Promise<{ recognize: (image: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }> } }).Tesseract;
    const worker = await tesseract.createWorker(["lit", "eng"], 1, {
      workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr", workerBlobURL: false
    });
    try { return (await worker.recognize(canvas.toDataURL("image/png"))).data.text; }
    finally { await worker.terminate(); }
  });
  expect(text.toUpperCase()).toContain("KAVA");
  expect(text).toContain("12,50");
  expect(external).toEqual([]);
});
