import process from "node:process";

let elevated: boolean | undefined;

export function evalIsProcessElevated(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }

  const { createRequire } = process.getBuiltinModule("node:module");
  const require = createRequire(import.meta.url);
  let koffi: ReturnType<typeof require>;
  try {
    koffi = require("koffi");
  } catch (error) {
    throw new Error(
      "Koffi could not be loaded. Install the optional koffi dependency to use Windows FFI.",
      {
        cause: error,
      },
    );
  }

  const advapi32 = koffi.load("Advapi32.dll");
  const kernel32 = koffi.load("Kernel32.dll");
  try {
    const OpenProcessToken = advapi32.func(
      "int __stdcall OpenProcessToken(void *ProcessHandle, uint32 DesiredAccess, _Out_ void **TokenHandle)",
    );
    const GetTokenInformation = advapi32.func(
      "int __stdcall GetTokenInformation(void *TokenHandle, uint32 TokenInformationClass, void *TokenInformation, uint32 TokenInformationLength, _Out_ uint32 *ReturnLength)",
    );
    const GetCurrentProcess = kernel32.func("void * __stdcall GetCurrentProcess()");
    const CloseHandle = kernel32.func("int __stdcall CloseHandle(void *hObject)");
    const GetLastError = kernel32.func("uint32 __stdcall GetLastError()");
    const TOKEN_QUERY = 0x0008;
    const TOKEN_ELEVATION = 20;
    const processHandle = GetCurrentProcess();
    const tokenOut = [null];
    const opened = OpenProcessToken(processHandle, TOKEN_QUERY, tokenOut);
    if (!opened) {
      throw new Error(`Failed to open process token (${GetLastError()})`);
    }

    try {
      const tokenInfo = new Uint8Array(4);
      const returnLength = [0];
      const ok = GetTokenInformation(tokenOut[0], TOKEN_ELEVATION, tokenInfo, 4, returnLength);
      if (!ok) {
        throw new Error(`Failed to get token information (${GetLastError()})`);
      }

      elevated = tokenInfo[0] !== 0;
      return elevated;
    } finally {
      if (tokenOut[0]) CloseHandle(tokenOut[0]);
    }
  } finally {
    advapi32.unload();
    kernel32.unload();
  }
}
