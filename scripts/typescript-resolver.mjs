/**
 * Resolve hook that lets Node import the workspace's TypeScript sources.
 *
 * The packages are written for a bundler, so their relative imports carry no
 * file extension. Node's ESM resolver requires one, and Node's type stripping
 * only removes types — it does not change how specifiers resolve. This fills
 * that one gap by retrying a failed relative specifier with `.ts`, and then as
 * a directory index.
 *
 * It exists so the smoke scripts can exercise the real `@geek/data` functions
 * instead of a copy of them. No application uses it: their bundlers already
 * resolve extensionless imports.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      throw error;
    }

    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Try the next shape before giving up with the original failure.
      }
    }

    throw error;
  }
}
