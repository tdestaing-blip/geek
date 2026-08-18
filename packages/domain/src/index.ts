/**
 * Geek's domain model.
 *
 * These are the concepts the product is about, expressed independently of how
 * they happen to be stored. Nothing here imports Supabase, the generated schema
 * or any framework, so the model can outlive any of them.
 *
 * The parsers exported alongside the types exist because a database CHECK
 * constraint does not survive into TypeScript. They are the point where a
 * stored string becomes a domain value, and they refuse rather than guess.
 */
export type { CalendarDate, CurrencyCode, Money } from "./values";
export { createMoney, parseCalendarDate, parseCurrencyCode } from "./values";

export type { Edition, Game, Platform } from "./catalog/catalog";

export type { CatalogMedia, CatalogMediaKind, CatalogMediaRightsStatus } from "./catalog/media";
export { parseCatalogMediaKind, parseCatalogMediaRightsStatus } from "./catalog/media";

export type {
  CatalogSearchResult,
  CatalogSearchResultKind,
  EditionSearchResult,
  GameSearchResult,
} from "./catalog/search";
export { parseCatalogSearchResultKind } from "./catalog/search";

export type { Copy, CopyAvailability, CopyVisibility } from "./ownership/copy";
export { parseCopyAvailability, parseCopyVisibility } from "./ownership/copy";

export type {
  ConditionGrade,
  CopyComponentAssessment,
  CopyComponentPresence,
  CopyComponentState,
  EditionComponent,
} from "./ownership/components";
export { parseConditionGrade, parseCopyComponentPresence } from "./ownership/components";

export type { CopyPrivateDetails } from "./ownership/private-details";

export type { Profile } from "./profile/profile";
