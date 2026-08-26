/**
 * Implements native Windows elevation detection for Deno.
 *
 * @module @neotales/is-elevated/ffi_deno
 */
let elevated;
const deno = globalThis.Deno;
/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * ```ts
 * import { evalIsProcessElevated } from "./ffi_deno.js";
 *
 * const elevated = evalIsProcessElevated();
 * ```
 */
export function evalIsProcessElevated(cache = true) {
    if (cache && elevated !== undefined)
        return elevated;
    const advapi32 = deno.dlopen("Advapi32.dll", {
        OpenProcessToken: { parameters: ["pointer", "u32", "pointer"], result: "bool" },
        GetTokenInformation: {
            parameters: ["u64", "u32", "pointer", "u32", "pointer"],
            result: "bool",
        },
    });
    const kernel32 = deno.dlopen("Kernel32.dll", {
        GetCurrentProcess: { parameters: [], result: "pointer" },
        CloseHandle: { parameters: ["pointer"], result: "bool" },
        GetLastError: { parameters: [], result: "i32" },
    });
    try {
        const TOKEN_QUERY = 0x0008;
        const TOKEN_ELEVATION = 20;
        const processHandle = kernel32.symbols.GetCurrentProcess();
        const tokenHandle = new BigUint64Array(1);
        const tokenHandlePtr = deno.UnsafePointer.of(tokenHandle);
        const success = advapi32.symbols.OpenProcessToken(processHandle, TOKEN_QUERY, tokenHandlePtr);
        if (!success)
            throw new Error("Failed to open process token");
        try {
            const tokenInfo = new Uint8Array(4);
            const returnLength = new Uint32Array(1);
            const result = advapi32.symbols.GetTokenInformation(tokenHandle[0], TOKEN_ELEVATION, deno.UnsafePointer.of(tokenInfo), 4, deno.UnsafePointer.of(returnLength));
            if (!result)
                throw new Error("Failed to get token information " + kernel32.symbols.GetLastError());
            elevated = tokenInfo[0] !== 0;
            return elevated;
        }
        finally {
            kernel32.symbols.CloseHandle(deno.UnsafePointer.create(tokenHandle[0]));
        }
    }
    finally {
        advapi32.close();
        kernel32.close();
    }
}
