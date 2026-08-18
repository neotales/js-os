import process from "node:process";

let elevated: boolean | undefined;

export function evalIsProcessElevated(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }

  const { createRequire } = process.getBuiltinModule("node:module");
  const require = createRequire(import.meta.url);
  let ffi: ReturnType<typeof require>;
  try {
    ffi = require("node:ffi");
  } catch (error) {
    throw new Error(
      "Node native FFI could not be loaded. Use a Node version that provides node:ffi.",
      {
        cause: error,
      },
    );
  }

  const advapi32 = ffi.dlopen("Advapi32.dll", {
    OpenProcessToken: { parameters: ["pointer", "u32", "pointer"], result: "u8" },
    GetTokenInformation: {
      parameters: ["pointer", "u32", "pointer", "u32", "pointer"],
      result: "u8",
    },
  });
  const kernel32 = ffi.dlopen("Kernel32.dll", {
    GetCurrentProcess: { parameters: [], result: "pointer" },
    CloseHandle: { parameters: ["pointer"], result: "u8" },
    GetLastError: { parameters: [], result: "u32" },
  });

  try {
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
      const ok = advapi32.functions.GetTokenInformation(
        tokenHandle,
        TOKEN_ELEVATION,
        tokenInfo,
        4,
        returnLength,
      );
      if (!ok) {
        throw new Error(`Failed to get token information (${kernel32.functions.GetLastError()})`);
      }

      elevated = tokenInfo[0] !== 0;
      return elevated;
    } finally {
      kernel32.functions.CloseHandle(tokenHandle);
    }
  } finally {
    advapi32.lib.close();
    kernel32.lib.close();
  }
}
