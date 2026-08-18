/** A directed, lightweight collector-to-collector relationship. */
export type Follow = {
  readonly followerId: string;
  readonly followedId: string;
  readonly createdAt: string;
};

/** Calculated graph totals; never persisted as mutable counters. */
export type FollowCounts = {
  readonly followers: number;
  readonly following: number;
};
