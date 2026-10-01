import type { LegalSourceId } from "@/features/returns/domain/types";
import type { RightToRepairProductCategory } from "./types";

export const rightToRepairCategorySource: { sourceId: LegalSourceId; lastVerifiedAt: string } = { sourceId: "VVTAT_RIGHT_TO_REPAIR", lastVerifiedAt: "2026-10-01" };
export const rightToRepairCategories: Record<Exclude<RightToRepairProductCategory, "OTHER" | "UNKNOWN">, string> = {
  WASHING_MACHINE_OR_WASHER_DRYER: "Skalbyklė arba skalbyklė-džiovyklė",
  DISHWASHER: "Indaplovė",
  REFRIGERATION_APPLIANCE: "Šaldymo prietaisas",
  TELEVISION: "Televizorius / elektroninis vaizduoklis",
  WELDING_EQUIPMENT: "Suvirinimo įranga",
  VACUUM_CLEANER: "Dulkių siurblys",
  SERVER_OR_DATA_STORAGE_PRODUCT: "Serveris arba duomenų saugojimo gaminys",
  MOBILE_PHONE_CORDLESS_PHONE_OR_TABLET: "Mobilusis / belaidis telefonas arba planšetinis kompiuteris",
  TUMBLE_DRYER: "Būgninė džiovyklė",
  PRODUCT_WITH_LIGHT_MEANS_OF_TRANSPORT_BATTERY: "Prekė su mažosios transporto priemonės baterija",
  LOCAL_SPACE_HEATER: "Vietinis patalpų šildytuvas"
};
export function isListedRepairCategory(value: RightToRepairProductCategory): boolean { return value !== "OTHER" && value !== "UNKNOWN" && value in rightToRepairCategories; }
