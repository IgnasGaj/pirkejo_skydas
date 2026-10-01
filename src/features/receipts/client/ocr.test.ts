import { expect, it, vi } from "vitest";
import { ReceiptOcrSession, type OcrWorker } from "./ocr";

const file = new File(["x"], "receipt.png", { type: "image/png" });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it("cancels the worker and ignores a late recognition result", async () => {
  const result = deferred<{ data: { text: string; confidence: number } }>();
  const terminate = vi.fn(async () => {});
  const worker: OcrWorker = { recognize: vi.fn(() => result.promise), terminate };
  const progress = vi.fn();
  const session = new ReceiptOcrSession(async (notify) => { notify({ status: "recognizing text", progress: 0.5 }); return worker; }, async () => 100);
  const scan = session.scan(file, progress);
  await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalled());
  session.cancel();
  await expect(scan).rejects.toThrow("cancelled");
  result.resolve({ data: { text: "late", confidence: 99 } });
  await Promise.resolve();
  expect(terminate).toHaveBeenCalled();
});

it("times out without retrying automatically", async () => {
  const terminate = vi.fn(async () => {});
  const worker: OcrWorker = { recognize: () => new Promise(() => {}), terminate };
  const factory = vi.fn(async () => worker);
  const session = new ReceiptOcrSession(factory, async () => 100, 15);
  await expect(session.scan(file, () => {})).rejects.toThrow("timeout");
  expect(factory).toHaveBeenCalledTimes(1);
  expect(terminate).toHaveBeenCalledTimes(1);
});

it("rejects an oversized decoded image before creating a worker", async () => {
  const factory = vi.fn();
  const session = new ReceiptOcrSession(factory, async () => 20_000_001);
  await expect(session.scan(file, () => {})).rejects.toThrow("too-many-pixels");
  expect(factory).not.toHaveBeenCalled();
});
