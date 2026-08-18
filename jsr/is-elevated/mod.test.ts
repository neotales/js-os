import { isElevated } from "./mod.ts";

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
  if (typeof isElevated() !== "boolean") {
    throw new Error("Expected a boolean");
  }
});
