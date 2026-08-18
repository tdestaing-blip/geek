import type {
  ConditionGrade,
  Copy,
  CopyComponentState,
  CopyPrivateDetails,
  EditionComponent,
  Money,
} from "@geek/domain";
import {
  createMoney,
  parseConditionGrade,
  parseCopyComponentPresence,
  parseCopyAvailability,
  parseCopyVisibility,
  parseCurrencyCode,
} from "@geek/domain";
import type { Tables } from "@geek/supabase";

import { toOptionalCalendarDate } from "../catalog/mapping";
import { InvalidRowError } from "../result";

/**
 * Turning ownership rows into ownership models.
 *
 * The database constrains visibility, trade availability, presence and
 * condition grade with CHECK constraints, none of which survive into the
 * generated types: they arrive as `string` and `number | null`. Each one is
 * narrowed here, and an unrecognised value stops the read.
 *
 * Refusing is the whole point. A Copy whose visibility is some fourth value
 * cannot be rendered safely — treating it as public would expose something its
 * owner never agreed to, and treating it as private would hide a Copy they
 * expect to see. There is no correct guess, so the layer does not guess.
 */

type CopyFields = Pick<
  Tables<"copies">,
  "id" | "game_id" | "edition_id" | "owner_id" | "visibility" | "availability" | "created_at"
>;

type EditionComponentFields = Pick<
  Tables<"edition_components">,
  "id" | "edition_id" | "component_key" | "name" | "kind" | "required_for_complete" | "sort_order"
>;

type CopyComponentStateFields = Pick<
  Tables<"copy_component_states">,
  "edition_component_id" | "presence" | "condition_grade" | "condition_notes"
>;

type CopyPrivateDetailsFields = Pick<
  Tables<"copy_private_details">,
  | "copy_id"
  | "owner_id"
  | "acquired_at"
  | "purchase_amount_minor"
  | "purchase_currency"
  | "provenance"
  | "private_notes"
  | "storage_location"
>;

export function toCopy(row: CopyFields): Copy {
  const visibility = parseCopyVisibility(row.visibility);

  if (visibility === null) {
    throw new InvalidRowError("copies.visibility", `unknown visibility "${row.visibility}"`);
  }

  const availability = parseCopyAvailability(row.availability);

  if (availability === null) {
    throw new InvalidRowError("copies.availability", `unknown availability "${row.availability}"`);
  }

  return {
    id: row.id,
    gameId: row.game_id,
    editionId: row.edition_id,
    ownerId: row.owner_id,
    visibility,
    availability,
    createdAt: row.created_at,
  };
}

export function toEditionComponent(row: EditionComponentFields): EditionComponent {
  return {
    id: row.id,
    editionId: row.edition_id,
    componentKey: row.component_key,
    name: row.name,
    kind: row.kind,
    requiredForComplete: row.required_for_complete,
    sortOrder: row.sort_order,
  };
}

/**
 * Reads one recorded component state.
 *
 * A grade is only meaningful for a component that is actually there, which the
 * database also enforces. Checking it again here means a present-only grade is
 * a property of the model rather than a rule the caller has to remember.
 */
export function toCopyComponentState(row: CopyComponentStateFields): CopyComponentState {
  const presence = parseCopyComponentPresence(row.presence);

  if (presence === null) {
    throw new InvalidRowError(
      "copy_component_states.presence",
      `unknown presence "${row.presence}"`,
    );
  }

  let conditionGrade: ConditionGrade | null = null;

  if (row.condition_grade !== null) {
    conditionGrade = parseConditionGrade(row.condition_grade);

    if (conditionGrade === null) {
      throw new InvalidRowError(
        "copy_component_states.condition_grade",
        `expected a grade of 1-5, got ${row.condition_grade}`,
      );
    }

    if (presence !== "present") {
      throw new InvalidRowError(
        "copy_component_states.condition_grade",
        `a "${presence}" component cannot carry a condition grade`,
      );
    }
  }

  return {
    editionComponentId: row.edition_component_id,
    presence,
    conditionGrade,
    conditionNotes: row.condition_notes,
  };
}

/**
 * Reads one owner's private record for a Copy.
 *
 * Amount and currency are stored in two columns and are only meaningful
 * together, so they become one `Money` value or nothing. Half a price — an
 * amount with no currency — is not something a caller should have to think
 * about, and the database already refuses to store it.
 */
export function toCopyPrivateDetails(row: CopyPrivateDetailsFields): CopyPrivateDetails {
  return {
    copyId: row.copy_id,
    ownerId: row.owner_id,
    acquiredAt: toOptionalCalendarDate(row.acquired_at, "copy_private_details.acquired_at"),
    purchasePrice: toPurchasePrice(row.purchase_amount_minor, row.purchase_currency),
    provenance: row.provenance,
    privateNotes: row.private_notes,
    storageLocation: row.storage_location,
  };
}

function toPurchasePrice(amountMinor: number | null, currency: string | null): Money | null {
  if (amountMinor === null && currency === null) {
    return null;
  }

  if (amountMinor === null || currency === null) {
    throw new InvalidRowError(
      "copy_private_details.purchase_amount_minor",
      "a purchase price needs both an amount and a currency",
    );
  }

  if (amountMinor < 0) {
    throw new InvalidRowError(
      "copy_private_details.purchase_amount_minor",
      `expected a non-negative amount, got ${amountMinor}`,
    );
  }

  const currencyCode = parseCurrencyCode(currency);

  if (currencyCode === null) {
    throw new InvalidRowError(
      "copy_private_details.purchase_currency",
      `expected an ISO 4217 code, got "${currency}"`,
    );
  }

  const money = createMoney(amountMinor, currencyCode);

  if (money === null) {
    throw new InvalidRowError(
      "copy_private_details.purchase_amount_minor",
      `expected whole minor units within the safe integer range, got ${amountMinor}`,
    );
  }

  return money;
}
