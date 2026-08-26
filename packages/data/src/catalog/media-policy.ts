import type { CatalogMediaRightsStatus } from "@geek/domain";

/** The product context in which catalog media is being displayed. */
export type CatalogMediaUsageMode = "commercial" | "noncommercial";

const COMMERCIAL_RIGHTS: readonly CatalogMediaRightsStatus[] = ["reusable", "licensed"];
const NONCOMMERCIAL_RIGHTS: readonly CatalogMediaRightsStatus[] = [
  ...COMMERCIAL_RIGHTS,
  "noncommercial",
];

/** Unknown and absent configuration never opts a client into non-commercial media. */
export function parseCatalogMediaUsageMode(value: string | undefined): CatalogMediaUsageMode {
  return value === "noncommercial" ? "noncommercial" : "commercial";
}

/** Returns the stored rights states permitted in the requested product context. */
export function catalogMediaRightsForUsageMode(
  usageMode: CatalogMediaUsageMode,
): readonly CatalogMediaRightsStatus[] {
  return usageMode === "noncommercial" ? NONCOMMERCIAL_RIGHTS : COMMERCIAL_RIGHTS;
}

/** Pure policy check used by import/data tests and non-database consumers. */
export function isCatalogMediaDisplayable(
  rightsStatus: CatalogMediaRightsStatus,
  usageMode: CatalogMediaUsageMode,
): boolean {
  return catalogMediaRightsForUsageMode(usageMode).includes(rightsStatus);
}
