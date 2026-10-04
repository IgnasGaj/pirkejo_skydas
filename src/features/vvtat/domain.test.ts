import { describe, expect, it } from "vitest";
import type { Row } from "@/lib/supabase/database.types";
import { checklist, originalDemandFromText, preparationSchema, safeArchiveName } from "./domain";

const baseCase = { family: "DEFECTIVE_PRODUCT", submitted_on: "2026-10-01", received_on: "2026-10-01",
  has_substantive_response: false, latest_response_outcome: null, progress: "AWAITING_RESPONSE" } as Row<"cases">;
const input = preparationSchema.parse({ applicantName: "Vardas Pavardė", applicantEmail: "v@example.test", sellerName: "Pardavėjas",
  sellerContact: "", disputeSummary: "Neveikia prekė", escalationReason: "Noriu ginčo peržiūros", requestedOutcome: "Prašau pataisyti prekę.",
  outcomeChangedExplanation: "", routing: { ownGoodsDispute: "YES", professionalSeller: "YES", inLithuania: "YES",
    anotherBody: "NO", specialJurisdiction: "NO" }, selected: [], reviewed: true });

describe("VVTAT preparation boundaries", () => {
  it("keeps unknown receipt, interim reply and expired source window in review", () => {
    expect(checklist({ item: { ...baseCase, received_on: null }, preparation: input, today: "2026-10-10", selectedCount: 0 }).review).toContain("Pardavėjo gavimo data nežinoma.");
    expect(checklist({ item: { ...baseCase, latest_response_outcome: "MORE_INFORMATION", has_response: true }, preparation: input, today: "2026-10-10", selectedCount: 0 }).state).toBe("Reikia patikrinti");
    expect(checklist({ item: baseCase, preparation: input, today: "2026-11-01", selectedCount: 0 }).clock.state).toBe("UNAVAILABLE");
  });
  it("does not impose a new wait after refusal and marks closed cases historical", () => {
    const refused = checklist({ item: { ...baseCase, latest_response_outcome: "REFUSED", has_substantive_response: true }, preparation: input, today: "2026-10-02", selectedCount: 1 });
    expect(refused.review.join(" ")).not.toContain("dar nesibaigė");
    expect(checklist({ item: { ...baseCase, progress: "CLOSED" }, preparation: input, today: "2026-10-02", selectedCount: 1 }).review.join(" ")).toContain("istorinis");
    expect(checklist({ item: { ...baseCase, family: "DISTANCE_WITHDRAWAL" }, preparation: input, today: "2026-10-02", selectedCount: 1 }).state).toBe("Šis atvejis nepalaikomas");
  });
  it("bounds selected files and sanitizes hostile archive names", () => {
    expect(preparationSchema.safeParse({ ...input, selected: Array.from({ length: 21 }, () => ({ id: crypto.randomUUID(), purpose: "OTHER" })) }).success).toBe(false);
    expect(preparationSchema.safeParse({ ...input, selected: [{ id: crypto.randomUUID(), purpose: "OTHER" }, { id: crypto.randomUUID(), purpose: "OTHER" }] }).success).toBe(true);
    expect(safeArchiveName(1, "../../blogas\\kelias\n.pdf")).toBe("irodymai/01-__.._blogas_kelias_.pdf");
    expect(originalDemandFromText("Antraštė\nPrašau pataisyti prekę.\nPrašau raštu informuoti.")).toBe("Prašau pataisyti prekę.");
  });
});
