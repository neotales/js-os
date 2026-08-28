import assert from "node:assert/strict";
import { test } from "node:test";
import { backend } from "./ffi_bun.ts";

test("linux-libsecret::Bun FFI backend loads directly", () => {
  assert.equal(typeof backend.secretSchemaNew, "function");
  assert.equal(typeof backend.secretPasswordLookupSync, "function");
  assert.equal(typeof backend.secretPasswordStoreSync, "function");
  assert.equal(typeof backend.secretPasswordClearSync, "function");
  assert.equal(typeof backend.secretPasswordFree, "function");
  if (backend.gio !== undefined) {
    assert.equal(typeof backend.gio.cancellableNew, "function");
    assert.equal(typeof backend.gio.cancellableCancel, "function");
    assert.equal(typeof backend.gio.cancellableRelease, "function");
  }
  assert.equal(backend.listSecretRecords, undefined);
});
