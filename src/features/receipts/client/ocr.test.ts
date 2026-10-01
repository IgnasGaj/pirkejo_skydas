import { expect, it, vi } from "vitest";
import { ReceiptOcrSession, type OcrWorker } from "./ocr";

const file = new File(["x"], "receipt.png", { type: "image/png" });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
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

it("terminates a worker while initialization is still pending", async () => {
  const initialization = deferred<OcrWorker>();
  const spawned = deferred<void>();
  const terminate = vi.fn(async () => {});
  const session = new ReceiptOcrSession(async (_progress, onSpawn) => {
    onSpawn({ terminate });
    spawned.resolve();
    return initialization.promise;
  }, async () => 100);
  const scan = session.scan(file, () => {});
  await spawned.promise;
  session.cancel();
  await expect(scan).rejects.toThrow("cancelled");
  expect(terminate).toHaveBeenCalledTimes(1);
  initialization.resolve({ recognize: vi.fn(), terminate });
});

it("terminates a spawned worker when initialization fails", async () => {
  const terminate = vi.fn(async () => {});
  const session = new ReceiptOcrSession(async (_progress, onSpawn) => {
    onSpawn({ terminate });
    throw new Error("initialization failed");
  }, async () => 100);
  await expect(session.scan(file, () => {})).rejects.toThrow("initialization failed");
  expect(terminate).toHaveBeenCalledTimes(1);
});

it("times out and terminates a worker still preparing", async () => {
  const terminate = vi.fn(async () => {});
  const session = new ReceiptOcrSession(async (_progress, onSpawn) => {
    onSpawn({ terminate });
    return new Promise<OcrWorker>(() => {});
  }, async () => 100, 15);
  await expect(session.scan(file, () => {})).rejects.toThrow("timeout");
  expect(terminate).toHaveBeenCalledTimes(1);
});

it("stops preparation when a replacement scan starts", async () => {
  const pending = deferred<OcrWorker>();
  const firstTerminated = vi.fn(async () => {});
  const secondTerminated = vi.fn(async () => {});
  let calls = 0;
  const session = new ReceiptOcrSession(async (_progress, onSpawn) => {
    calls++;
    if (calls === 1) { onSpawn({ terminate: firstTerminated }); return pending.promise; }
    onSpawn({ terminate: secondTerminated });
    return { recognize: async () => ({ data: { text: "new", confidence: 90 } }), terminate: secondTerminated };
  }, async () => 100);
  const first = session.scan(file, () => {});
  await vi.waitFor(() => expect(calls).toBe(1));
  const second = session.scan(file, () => {});
  await expect(first).rejects.toThrow("cancelled");
  await expect(second).resolves.toMatchObject({ text: "new" });
  expect(firstTerminated).toHaveBeenCalledTimes(1);
  pending.resolve({ recognize: vi.fn(), terminate: firstTerminated });
});
