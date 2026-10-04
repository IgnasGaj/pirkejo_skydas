import { z } from "zod";
import { assertPastCivilDate, civilDate } from "./domain";

export const CASE_EVENT_PAYLOAD_MAX_BYTES = 8192;
export function caseEventPayloadBytes(payload: Record<string, unknown>) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

const withinCharacters = (maximum: number) => z.string().trim().refine((value) => Array.from(value).length <= maximum, "Įrašas per ilgas. Sutrumpinkite aprašymą arba pastabą.");
const note = withinCharacters(500).default("");
const method = z.enum(["EMAIL", "REGISTERED_POST", "IN_PERSON", "VTIS", "OTHER"]);
const evidenceId = z.uuid().nullable().default(null);
const targetEventId = z.uuid().nullable().default(null);
const common = { requestId: z.uuid(), expectedRevision: z.number().int().min(0).max(500), occurredOn: civilDate, evidenceId, targetEventId };
export const caseEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...common, kind: z.literal("SUBMITTED"), payload: z.strictObject({ method, note, receivedOn: civilDate.optional() }) }),
  z.strictObject({ ...common, kind: z.literal("SUBMISSION_CORRECTED"), payload: z.strictObject({ method, note }) }),
  z.strictObject({ ...common, kind: z.literal("RECEIPT_RECORDED"), payload: z.strictObject({ note }) }),
  z.strictObject({ ...common, kind: z.literal("RECEIPT_CORRECTED"), payload: z.strictObject({ note }) }),
  z.strictObject({ ...common, kind: z.literal("RESPONSE_RECORDED"), payload: z.strictObject({ summary: withinCharacters(1000).refine((value) => value.length > 0, "Įrašykite atsakymo aprašymą."), outcome: z.enum(["ACCEPTED", "PARTLY_ACCEPTED", "REFUSED", "MORE_INFORMATION", "OTHER"]), note }) }),
  z.strictObject({ ...common, kind: z.literal("SERVICE_STARTED"), payload: z.strictObject({ reference: withinCharacters(200).default(""), promisedOn: civilDate.optional(), note }) }),
  z.strictObject({ ...common, kind: z.literal("SERVICE_RETURNED"), payload: z.strictObject({ result: withinCharacters(500).default(""), note }) }),
  z.strictObject({ ...common, kind: z.literal("RESOLVED"), payload: z.strictObject({ outcome: z.enum(["REPAIRED", "REPLACED", "REFUND_RECEIVED", "PRICE_REDUCTION", "OTHER"]), note }) }),
  z.strictObject({ ...common, kind: z.literal("CLOSED"), payload: z.strictObject({ note }) }),
  z.strictObject({ ...common, kind: z.literal("REOPENED"), payload: z.strictObject({ note }) })
]);
export type CaseEventInput = z.infer<typeof caseEventSchema>;

export function validateCaseEvent(raw: unknown, today: string) {
  const parsed = caseEventSchema.parse(raw);
  // JSONB adds only a few separator spaces for these three-field shapes. The
  // allowed field lengths fit within the same database cap even at four UTF-8
  // bytes per character; keep an explicit boundary check for future fields.
  if (caseEventPayloadBytes(parsed.payload) > CASE_EVENT_PAYLOAD_MAX_BYTES - 16)
    throw new Error("Įrašas per ilgas. Sutrumpinkite aprašymą arba pastabą.");
  assertPastCivilDate(parsed.occurredOn, today);
  if (parsed.kind === "SUBMITTED") {
    if (parsed.payload.receivedOn) {
      assertPastCivilDate(parsed.payload.receivedOn, today);
      if (parsed.payload.receivedOn < parsed.occurredOn) throw new Error("Pardavėjo gavimo data negali būti ankstesnė už pateikimo datą.");
    }
  }
  if (parsed.kind === "SERVICE_STARTED" && parsed.payload.promisedOn && parsed.payload.promisedOn < parsed.occurredOn) throw new Error("Pardavėjo nurodyta data negali būti ankstesnė už perdavimą.");
  return parsed;
}
