import { isElevated, isElevatedAvailable } from "./mod.ts";

Deno.test(
  "isElevated matches effective uid semantics on Unix-like systems",
  { ignore: Deno.build.os === "windows" },
  () => {
    const deno = Deno as typeof Deno & { euid?: () => number };
    if (isElevated(false) !== ((deno.euid?.() ?? Deno.uid()) === 0)) {
      throw new Error("Unexpected elevation result");
    }
  },
);

Deno.test("isElevated returns a boolean", () => {
  if (Deno.build.os === "windows" && !isElevatedAvailable())
    return;
  if (typeof isElevated() !== "boolean") {
    throw new Error("Expected a boolean");
  }
});

Deno.test("isElevatedAvailable returns a boolean", () => {
  if (typeof isElevatedAvailable() !== "boolean") {
    throw new Error("Expected a boolean");
  }
});

Deno.test(
  "isElevated explains unavailable Windows FFI",
  { ignore: Deno.build.os !== "windows" || isElevatedAvailable() },
  () => {
    try {
      isElevated();
      throw new Error("Expected isElevated to throw");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("#runtime-support")) {
        throw error;
      }
    }
  },
);
