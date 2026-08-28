import assert from "node:assert/strict";
import { test } from "node:test";
import { backend } from "./ffi_node.ts";

test("darwin-keychain::Node FFI backend exposes enumeration", () => {
  assert.equal(typeof backend.listSecrets, "function");
});
