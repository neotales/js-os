import process from "node:process";
let elevated;
function evalUnixElevation(cache = true) {
    if (cache && elevated !== undefined) {
        return elevated;
    }
    const uid = process.geteuid?.() ?? process.getuid?.();
    elevated = uid === 0;
    return elevated;
}
let impl = evalUnixElevation;
const runtime = globalThis;
if (process.platform === "win32") {
    const { createRequire } = process.getBuiltinModule("node:module");
    const require = createRequire(import.meta.url);
    if (runtime.Deno) {
        impl = require("./ffi_deno.js").evalIsProcessElevated;
    }
    else if (runtime.Bun) {
        impl = require("./ffi_bun.js").evalIsProcessElevated;
    }
    else {
        try {
            if (process.getBuiltinModule("node:ffi")) {
                impl = require("./ffi_node.js").evalIsProcessElevated;
            }
            else {
                impl = require("./ffi_koffi.js").evalIsProcessElevated;
            }
        }
        catch (error) {
            try {
                impl = require("./ffi_koffi.js").evalIsProcessElevated;
            }
            catch {
                if (process.env.DEBUG === "true")
                    console.debug(error);
            }
        }
    }
}
/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * import { isElevated } from "@neotales/is-elevated";
 *
 * if (isElevated()) {
 *   console.log("The process is elevated.");
 * }
 */
export function isElevated(cache = true) {
    return impl(cache);
}
