import process from "node:process";

type ElevationEvaluator = (cache?: boolean) => boolean;

let elevated: boolean | undefined;

function evalUnixElevation(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  const uid = process.geteuid?.() ?? process.getuid?.();
  elevated = uid === 0;
  return elevated;
}

let impl: ElevationEvaluator = evalUnixElevation;
const runtime = globalThis as { Bun?: unknown; Deno?: unknown };

if (process.platform === "win32") {
  const { createRequire } = process.getBuiltinModule("node:module") as typeof import("node:module");
  const require = createRequire(import.meta.url);

  if (runtime.Deno) {
    impl = (require("./ffi_deno.js") as typeof import("./ffi_deno.js")).evalIsProcessElevated;
  } else if (runtime.Bun) {
    impl = (require("./ffi_bun.js") as typeof import("./ffi_bun.js")).evalIsProcessElevated;
  } else {
    let hasNativeFfi = false;
    try {
      hasNativeFfi = Boolean(process.getBuiltinModule("node:ffi"));
    } catch {
      // Older Node versions throw for unknown built-in modules.
    }
    impl = hasNativeFfi
      ? (require("./ffi_node.js") as typeof import("./ffi_node.js")).evalIsProcessElevated
      : (require("./ffi_koffi.js") as typeof import("./ffi_koffi.js")).evalIsProcessElevated;
  }
}

/** Returns whether the current process is elevated. */
export function isElevated(cache = true): boolean {
  return impl(cache);
}
