import assert from "node:assert/strict";
import { test } from "node:test";
import { isRegistryAvailable, Registry, RegistryError } from "./mod.ts";
import { stringToWide, wideToString } from "./types.ts";

test("registry availability matches the platform", () => {
  assert.equal(isRegistryAvailable(), Deno.build.os === "windows");
});

test("registry string conversion roundtrips", () => {
  assert.equal(wideToString(stringToWide("registry")), "registry");
});

test(
  "registry is unavailable outside Windows",
  { skip: Deno.build.os === "windows" },
  () => {
    assert.throws(() => Registry.openKey("HKCU\\Software"), RegistryError);
  },
);

test("registry reads Windows version values", {
  skip: Deno.build.os !== "windows",
}, () => {
  using key = Registry.openKey(
    "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
  );
  assert.ok(key.getString("ProductName"));
});
