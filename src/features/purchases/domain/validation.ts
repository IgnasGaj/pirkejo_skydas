import { z } from "zod";
import { documentTypes, purchaseChannels } from "./types";

export function todayInVilnius() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parsePriceToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^(0|[1-9]\d{0,10})(?:[.,]\d{1,2})?$/.test(trimmed)) throw new Error("Invalid price");
  const [whole, fraction = ""] = trimmed.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid price");
  return cents;
}

const date = z.iso.date();
const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
export const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });
export const registrationSchema = z.object({
  email: z.email(), password: z.string().min(8), confirmPassword: z.string()
}).refine(({ password, confirmPassword }) => password === confirmPassword, { path: ["confirmPassword"] });

export const purchaseSchema = z.object({
  productName: z.string().trim().min(1).max(200), sellerName: z.string().trim().min(1).max(200),
  purchaseDate: date, receivedDate: z.union([date, z.literal("")]).transform((value) => value || null),
  purchaseChannel: z.enum(purchaseChannels),
  price: z.string().transform((value, context) => {
    try { return parsePriceToCents(value); }
    catch { context.addIssue({ code: "custom", message: "Invalid price" }); return z.NEVER; }
  }),
  referenceNumber: optionalText(200), notes: optionalText(2000)
}).superRefine((value, context) => {
  const today = todayInVilnius();
  if (value.purchaseDate > today) context.addIssue({ code: "custom", path: ["purchaseDate"], message: "Future purchase date" });
  if (value.receivedDate) {
    if (value.purchaseChannel !== "DISTANCE") context.addIssue({ code: "custom", path: ["receivedDate"], message: "Received date only for distance purchases" });
    if (value.receivedDate < value.purchaseDate) context.addIssue({ code: "custom", path: ["receivedDate"], message: "Received before purchase" });
    if (value.receivedDate > today) context.addIssue({ code: "custom", path: ["receivedDate"], message: "Future received date" });
  }
});
export const editPurchaseSchema = purchaseSchema;
export type PurchaseInput = z.output<typeof purchaseSchema>;

const supportedMimes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;
export const documentMetadataSchema = z.object({
  purchaseId: z.uuid(), documentType: z.enum(documentTypes),
  originalFilename: z.string().min(1).max(255), mimeType: z.enum(supportedMimes),
  sizeBytes: z.number().int().positive().max(15 * 1024 * 1024)
});

const supported: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"],
  "image/heic": ["heic"], "image/heif": ["heif"], "application/pdf": ["pdf"]
};

export function validateDocumentFile(file: { name: string; type: string; size: number }) {
  if (file.size > 15 * 1024 * 1024) return "too-large" as const;
  if (file.size <= 0) return "empty" as const;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!supported[file.type]?.includes(extension ?? "")) return "unsupported" as const;
  return null;
}

export async function verifyFileSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = String.fromCharCode(...bytes);
  if (file.type === "application/pdf") return text.startsWith("%PDF-");
  if (file.type === "image/png") return bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (file.type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (file.type === "image/webp") return text.startsWith("RIFF") && text.slice(8, 12) === "WEBP";
  if (file.type === "image/heic" || file.type === "image/heif") return text.slice(4, 8) === "ftyp" && /^(hei[cf]|mif1|msf1)/.test(text.slice(8, 12));
  return false;
}

export function extensionForMime(mime: string) { return supported[mime]?.[0] ?? null; }
