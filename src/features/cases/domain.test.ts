import { describe, expect, it } from "vitest";
import { addCivilDays, assertPastCivilDate, civilDaysBetween, responseDeadline } from "./domain";

describe("seller response period", () => {
  const base = { family: "DEFECTIVE_PRODUCT" as const, submittedOn: "2026-10-01", substantiveResponse: false };
  it("never starts from a prepared document or submission alone", () => {
    expect(responseDeadline({ ...base, submittedOn: null, receivedOn: null }).state).toBe("UNAVAILABLE");
    expect(responseDeadline({ ...base, receivedOn: null }).state).toBe("UNAVAILABLE");
  });
  it("excludes the receipt day, includes the final day, and extends a nonworking last day", () => {
    const deadline = responseDeadline({ ...base, receivedOn: "2026-10-02", today: "2026-10-16" });
    expect(deadline).toMatchObject({ date: "2026-10-16", state: "DUE_TODAY", daysRemaining: 0 });
    expect(responseDeadline({ ...base, receivedOn: "2026-10-02", today: "2026-10-17" }).state).toBe("EXPIRED");
    expect(responseDeadline({ ...base, receivedOn: "2026-10-03", today: "2026-10-19" })).toMatchObject({ date: "2026-10-19", state: "DUE_TODAY" });
  });
  it("handles year, leap, holidays and Easter Monday", () => {
    expect(responseDeadline({ ...base, receivedOn: "2026-12-18", today: "2027-01-04" })).toMatchObject({ date: "2027-01-04" });
    expect(addCivilDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(responseDeadline({ ...base, submittedOn: "2026-03-22", receivedOn: "2026-03-23", today: "2026-04-07" })).toMatchObject({ date: "2026-04-07" });
  });
  it("does not apply this clock to withdrawal and does not erase response history", () => {
    expect(responseDeadline({ ...base, family: "DISTANCE_WITHDRAWAL", receivedOn: "2026-10-02" }).state).toBe("UNAVAILABLE");
    expect(responseDeadline({ ...base, receivedOn: "2026-10-02", substantiveResponse: true }).state).toBe("RESPONSE_RECORDED");
  });
  it("withholds dates after the verified source edition", () => {
    expect(responseDeadline({ ...base, receivedOn: "2026-10-20", today: "2026-10-20", sourceValidThrough: "2026-10-31" })).toMatchObject({ state: "UNAVAILABLE" });
  });
  it("validates real past civil dates and uses civil days across DST", () => {
    expect(() => assertPastCivilDate("2026-02-30", "2026-10-04")).toThrow();
    expect(() => assertPastCivilDate("2026-10-05", "2026-10-04")).toThrow();
    expect(civilDaysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(civilDaysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});
