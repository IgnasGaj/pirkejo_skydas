export const SCAN_TIMEOUT_MS = 90_000;
export const MAX_DECODED_PIXELS = 20_000_000;
export const scanTypes = ["image/jpeg", "image/png", "image/webp"];
export const scanFallback = "Šį failą galite išsaugoti kaip pirkimo įrodymą. Automatiniam nuskaitymui pasirinkite JPG, PNG arba WebP nuotrauką.";

export type OcrResult = { text: string; confidence: number };
export type OcrProgress = { status: string; progress: number };
export type OcrWorker = { recognize: (file: File) => Promise<{ data: OcrResult }>; terminate: () => Promise<unknown> };
export type WorkerFactory = (onProgress: (value: OcrProgress) => void) => Promise<OcrWorker>;

async function inspectImage(file: File) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try { return bitmap.width * bitmap.height; }
    finally { bitmap.close(); }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth * image.naturalHeight);
      image.onerror = () => reject(new Error("decode-failed"));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

const defaultFactory: WorkerFactory = async (onProgress) => {
  const { createWorker } = await import("tesseract.js");
  return createWorker(["lit", "eng"], 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr",
    workerBlobURL: false, logger: (message) => onProgress({ status: message.status, progress: message.progress })
  });
};

let activeToken: symbol | null = null;
let activeCancel: (() => void) | null = null;

export class ReceiptOcrSession {
  constructor(private readonly factory: WorkerFactory = defaultFactory, private readonly pixels: (file: File) => Promise<number> = inspectImage, private readonly timeoutMs = SCAN_TIMEOUT_MS) {}
  private readonly token = Symbol("receipt scan");
  private worker: OcrWorker | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abortReject: ((reason: Error) => void) | null = null;

  cancel() {
    this.generation++;
    if (activeToken === this.token) { activeToken = null; activeCancel = null; }
    this.abortReject?.(new Error("cancelled"));
    this.abortReject = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.worker?.terminate();
    this.worker = null;
  }

  async scan(file: File, onProgress: (value: OcrProgress) => void): Promise<OcrResult> {
    if (!scanTypes.includes(file.type)) throw new Error("unsupported");
    if (activeToken !== this.token) activeCancel?.();
    this.cancel();
    activeToken = this.token;
    activeCancel = () => this.cancel();
    const id = this.generation;
    let rejectTimeout: (reason: Error) => void = () => {};
    const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const cancelled = new Promise<never>((_, reject) => { this.abortReject = reject; });
    this.timer = setTimeout(() => { rejectTimeout(new Error("timeout")); this.cancel(); }, this.timeoutMs);
    try {
      if (await Promise.race([this.pixels(file), timeout, cancelled]) > MAX_DECODED_PIXELS) throw new Error("too-many-pixels");
      if (id !== this.generation) throw new Error("cancelled");
      const work = (async () => {
        const worker = await this.factory((value) => { if (id === this.generation) onProgress(value); });
        if (id !== this.generation) { await worker.terminate(); throw new Error("cancelled"); }
        this.worker = worker;
        const { data } = await worker.recognize(file);
        if (id !== this.generation) throw new Error("cancelled");
        return { text: data.text, confidence: data.confidence };
      })();
      return await Promise.race([work, timeout, cancelled]);
    } finally {
      if (id === this.generation) this.cancel();
    }
  }
}
