import assert from "node:assert/strict";
import { test } from "node:test";
import { isElevated, isElevatedAvailable } from "./mod.ts";

test(
  "isElevated matches effective uid semantics on Unix-like systems",
  { skip: Deno.build.os === "windows" },
  () => {
    const deno = Deno as typeof Deno & { euid?: () => number };
    assert.equal(isElevated(false), (deno.euid?.() ?? Deno.uid()) === 0);
  },
);

test("isElevated returns a boolean", () => {
  if (Deno.build.os === "windows" && !isElevatedAvailable())
    return;
  assert.equal(typeof isElevated(), "boolean");
});

test("isElevatedAvailable returns a boolean", () => {
  assert.equal(typeof isElevatedAvailable(), "boolean");
});

test(
  "isElevated explains unavailable Windows FFI",
  { skip: Deno.build.os !== "windows" || isElevatedAvailable() },
  () => {
    assert.throws(() => isElevated(), /#runtime-support/);
  },
);
