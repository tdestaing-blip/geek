export type ListingCancellationSubmissionResult =
  | { readonly outcome: "ignored" }
  | { readonly outcome: "committed" }
  | { readonly outcome: "failed" };

/** Serializes the destructive confirmation into one effective cancellation request. */
export function createListingCancellationCoordinator(dependencies: {
  readonly cancel: (listingId: string) => Promise<boolean>;
}) {
  let pending = false;
  return {
    getStatus: () => (pending ? "pending" : "idle"),
    async submit(listingId: string): Promise<ListingCancellationSubmissionResult> {
      if (pending) return { outcome: "ignored" };
      pending = true;
      try {
        if (!(await dependencies.cancel(listingId))) {
          return { outcome: "failed" };
        }
        return { outcome: "committed" };
      } catch {
        return { outcome: "failed" };
      } finally {
        pending = false;
      }
    },
  };
}
