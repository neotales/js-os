import assert from "node:assert/strict";
import { test } from "node:test";
import { isDarwinKeychainAvailable } from "./mod.ts";

test("keychain availability reports a boolean", () => {
  assert.equal(typeof isDarwinKeychainAvailable(), "boolean");
});
