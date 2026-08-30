export type AccountSwitchSubmissionResult =
  | { readonly outcome: "ignored" }
  | { readonly outcome: "signed_out" }
  | { readonly outcome: "failed" };

/** Serializes one confirmed account switch through the canonical Auth sign-out action. */
export function createAccountSwitchCoordinator(dependencies: {
  readonly signOut: () => Promise<boolean>;
}) {
  let pending = false;
  return {
    async submit(): Promise<AccountSwitchSubmissionResult> {
      if (pending) return { outcome: "ignored" };
      pending = true;
      try {
        return (await dependencies.signOut()) ? { outcome: "signed_out" } : { outcome: "failed" };
      } catch {
        return { outcome: "failed" };
      } finally {
        pending = false;
      }
    },
  };
}
