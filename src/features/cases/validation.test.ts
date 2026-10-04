import { expect, it } from "vitest";
import { CASE_EVENT_PAYLOAD_MAX_BYTES, caseEventPayloadBytes, validateCaseEvent } from "./validation";

const base = { requestId: "b03c65d1-b5c6-4c7c-9b1b-bb2468d6d8e8", expectedRevision: 1, kind: "RESPONSE_RECORDED" as const, occurredOn: "2026-10-04", evidenceId: null, targetEventId: null };

it("accepts maximum Lithuanian and emoji text without exceeding the JSONB byte cap", () => {
  const payload = { summary: "🙂".repeat(1000), outcome: "OTHER" as const, note: "🙂".repeat(500) };
  expect(caseEventPayloadBytes(payload)).toBeLessThan(CASE_EVENT_PAYLOAD_MAX_BYTES - 16);
  expect(validateCaseEvent({ ...base, payload }, "2026-10-04").payload).toEqual(payload);
});

it("rejects overlong combined fields and invalid civil dates", () => {
  expect(() => validateCaseEvent({ ...base, payload: { summary: "Ą".repeat(1001), outcome: "OTHER", note: "" } }, "2026-10-04")).toThrow();
  expect(() => validateCaseEvent({ ...base, occurredOn: "2026-02-30", payload: { summary: "Atsakymas", outcome: "OTHER", note: "" } }, "2026-10-04")).toThrow();
});

it("counts escaped JSON text by UTF-8 bytes while keeping valid field limits", () => {
  const payload = { summary: '\\"'.repeat(500), outcome: "OTHER" as const, note: "Ž".repeat(500) };
  expect(caseEventPayloadBytes(payload)).toBeGreaterThan(payload.summary.length + payload.note.length);
  expect(validateCaseEvent({ ...base, payload }, "2026-10-04").payload).toEqual(payload);
});
