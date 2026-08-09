/**
 * Components describe what an Edition physically contained, and what a
 * particular Copy still has.
 *
 * Geek stores structured per-component facts rather than one overall
 * "condition" or "completeness" label. A disc in excellent shape inside a
 * cracked case with no manual is a real and common situation that a single
 * grade cannot express, and summary labels are a presentation concern derived
 * from these facts.
 */

/** One physical item the Edition was released with, such as a disc or manual. */
export type EditionComponent = {
  readonly id: string;
  readonly editionId: string;
  readonly componentKey: string;
  readonly name: string;
  /**
   * A coarse semantic type such as `disc` or `manual`.
   *
   * Left as a string on purpose: the database constrains its format but not its
   * membership of a fixed set, so Geek can catalogue an Edition that shipped
   * with something nobody has enumerated yet. Narrowing it to a union here
   * would reject catalog data the database accepts.
   */
  readonly kind: string;
  readonly requiredForComplete: boolean;
  readonly sortOrder: number;
};

/** Whether a component is still with the Copy. */
export type CopyComponentPresence = "present" | "missing" | "unknown";

/**
 * How good a present component is, on Geek's canonical 1-5 ordinal scale.
 *
 * The number is the stored truth; words like "very good" are presentation and
 * may change without a data migration.
 */
export type ConditionGrade = 1 | 2 | 3 | 4 | 5;

/**
 * What the owner recorded about one component of their Copy.
 *
 * A grade only exists when the component is present, which is why an absent
 * component carries `null` rather than a zero or a worst-case grade.
 */
export type CopyComponentState = {
  readonly editionComponentId: string;
  readonly presence: CopyComponentPresence;
  readonly conditionGrade: ConditionGrade | null;
  readonly conditionNotes: string | null;
};

/**
 * An Edition component paired with whatever the owner recorded about it.
 *
 * `state` is `null` when the owner has not assessed that component yet, which
 * is distinct from having assessed it as `unknown`. Collapsing the two would
 * turn "I haven't checked the box for the manual" into "the manual's presence
 * is unknown", and a completeness figure built on that would be fiction.
 */
export type CopyComponentAssessment = {
  readonly component: EditionComponent;
  readonly state: CopyComponentState | null;
};

const COPY_COMPONENT_PRESENCES: readonly string[] = ["present", "missing", "unknown"];

/** Narrows a stored presence value, returning `null` for anything unknown. */
export function parseCopyComponentPresence(value: string): CopyComponentPresence | null {
  return COPY_COMPONENT_PRESENCES.includes(value) ? (value as CopyComponentPresence) : null;
}

/** Narrows a stored condition grade, returning `null` outside the 1-5 scale. */
export function parseConditionGrade(value: number): ConditionGrade | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}
