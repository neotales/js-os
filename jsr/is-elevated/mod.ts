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

/** Returns whether the current Deno process is elevated. */
export function isElevated(cache = true): boolean {
  return impl(cache);
}
