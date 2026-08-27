import assert from "node:assert/strict";
import { test } from "node:test";
import { isLinuxLibsecretAvailable } from "./mod.ts";

test("libsecret availability reports a boolean", () => {
  assert.equal(typeof isLinuxLibsecretAvailable(), "boolean");
});
