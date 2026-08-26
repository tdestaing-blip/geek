import { parseCatalogMediaUsageMode, type CatalogMediaReadOptions } from "@geek/data";

/**
 * One application-level media policy for every mobile catalog surface.
 * The absent/unknown production default is commercial; local Hobbyist review
 * explicitly opts in through the ignored `.env.local` file.
 */
export const catalogMediaReadOptions: CatalogMediaReadOptions = {
  usageMode: parseCatalogMediaUsageMode(process.env.EXPO_PUBLIC_CATALOG_MEDIA_USAGE_MODE),
};
