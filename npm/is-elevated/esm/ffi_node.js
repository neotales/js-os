import process from "node:process";
const { createRequire } = process.getBuiltinModule("node:module");
const require = createRequire(import.meta.url);
const ffi = require("node:ffi");
const advapi32 = ffi.dlopen("Advapi32.dll", {
    OpenProcessToken: { arguments: ["pointer", "u32", "pointer"], return: "u8" },
    GetTokenInformation: {
        arguments: ["pointer", "u32", "pointer", "u32", "pointer"],
        return: "u8",
    },
});
const kernel32 = ffi.dlopen("Kernel32.dll", {
    GetCurrentProcess: { arguments: [], return: "pointer" },
    CloseHandle: { arguments: ["pointer"], return: "u8" },
    GetLastError: { arguments: [], return: "u32" },
});
let elevated;
/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * ```ts
 * import { evalIsProcessElevated } from "./ffi_node.js";
 *
 * const elevated = evalIsProcessElevated();
 * ```
 */
export function evalIsProcessElevated(cache = true) {
    if (cache && elevated !== undefined) {
        return elevated;
    }
    const TOKEN_QUERY = 0x0008;
    const TOKEN_ELEVATION = 20;
    const processHandle = kernel32.functions.GetCurrentProcess();
    const tokenHandleBuf = new Uint8Array(8);
    const opened = advapi32.functions.OpenProcessToken(processHandle, TOKEN_QUERY, tokenHandleBuf);
    if (!opened) {
        throw new Error(`Failed to open process token (${kernel32.functions.GetLastError()})`);
    }
    const tokenHandle = new DataView(tokenHandleBuf.buffer).getBigUint64(0, true);
    try {
        const tokenInfo = new Uint8Array(4);
        const returnLength = new Uint8Array(4);
        const ok = advapi32.functions.GetTokenInformation(tokenHandle, TOKEN_ELEVATION, tokenInfo, 4, returnLength);
        if (!ok) {
            throw new Error(`Failed to get token information (${kernel32.functions.GetLastError()})`);
        }
        elevated = tokenInfo[0] !== 0;
        return elevated;
    }
    finally {
        kernel32.functions.CloseHandle(tokenHandle);
    }
}
