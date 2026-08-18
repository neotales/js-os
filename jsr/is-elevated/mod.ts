/**
 * Detects whether the current Deno process is running with elevated privileges.
 *
 * @module @neotales/is-elevated
 */

type ElevationEvaluator = (cache?: boolean) => boolean;

let elevated: boolean | undefined;
const deno = Deno as typeof Deno & { euid?: () => number };

function evalUnixElevation(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  elevated = (deno.euid?.() ?? Deno.uid()) === 0;
  return elevated;
}

let impl: ElevationEvaluator = evalUnixElevation;

if (Deno.build.os === "windows") {
  impl = (await import("./ffi_deno.ts")).evalIsProcessElevated;
}

/**
 * Reports whether the current Deno process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * import { isElevated } from "jsr:@neotales/is-elevated";
 *
 * if (isElevated()) {
 *   console.log("The process is elevated.");
 * }
 */
export function isElevated(cache = true): boolean {
  return impl(cache);
}
