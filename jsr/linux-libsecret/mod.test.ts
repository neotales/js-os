import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSecret,
  getSecretString,
  isAvailable,
  listSecrets,
  removeSecret,
  saveSecret,
} from "./mod.ts";
import {
  Gio,
  isGioAvailable,
  isLinuxKeyringAvailable,
  Libsecret,
  LibsecretErrorHandle,
} from "./ffi.ts";
import { GCancellableHandle, LINUX, prepareLibsecretError, setLibsecretError } from "./types.ts";

const dangerousMutations = globalThis.process?.env.TEST_DANGEROUS_OS_MUTATIONS === "true";

function shouldSkipIntegration(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : String(error).toLowerCase();
  return message.includes("libsecret") || message.includes("org.freedesktop") ||
    message.includes("dbus") || message.includes("collection") ||
    message.includes("unknown libsecret error");
}

test("linux-libsecret::availability reports booleans", () => {
  assert.equal(typeof isAvailable(), "boolean");
  assert.equal(typeof isGioAvailable(), "boolean");
  assert.equal(typeof isLinuxKeyringAvailable(), "boolean");
});

test("linux-libsecret::error output handles bind, reset, and reject another runtime", () => {
  const errorOut = new LibsecretErrorHandle();
  assert.equal(errorOut.error(), null);
  prepareLibsecretError(errorOut, "deno");
  setLibsecretError(errorOut, new Error("native failure"));
  assert.equal(errorOut.error()?.message, "native failure");
  prepareLibsecretError(errorOut, "deno");
  assert.equal(errorOut.error(), null);
  assert.throws(() => prepareLibsecretError(errorOut, "bun"), /different runtime/);
});

test("linux-libsecret::cancellable handles have an owned native lifecycle", {
  skip: !isAvailable() || !isGioAvailable(),
}, () => {
  const schema = Libsecret.secretSchemaNew(
    "org.freedesktop.Secret.Generic",
    0,
    "service",
    0,
    "account",
    0,
    null,
  );
  if (schema === null)
    throw new Error("Failed to create libsecret schema.");
  const cancellable = Gio.cancellableNew();
  assert.equal(cancellable instanceof GCancellableHandle, true);
  try {
    Gio.cancellableCancel(cancellable);
    const errorOut = new LibsecretErrorHandle();
    const password = Libsecret.secretPasswordLookupSync(
      schema,
      cancellable,
      errorOut,
      "service",
      "test",
      "account",
      "test",
      null,
    );
    assert.equal(password, null);
    assert.match(errorOut.error()?.message ?? "", /cancel/i);
  } finally {
    Gio.cancellableRelease(cancellable);
  }
  assert.throws(() => Gio.cancellableCancel(cancellable), /released/);
});

test("linux-libsecret::Gio reports unavailable optional support", {
  skip: !isAvailable() || isGioAvailable(),
}, () => {
  assert.throws(() => Gio.cancellableNew(), /GIO is unavailable/);
});

test("linux-libsecret::native FFI defers unsupported errors", { skip: isAvailable() }, () => {
  assert.throws(() => Libsecret.secretSchemaNew("schema", 0, "service", 0, "account", 0, null));
});

test("linux-libsecret::unsupported platforms return safe defaults", { skip: LINUX }, () => {
  assert.equal(isAvailable(), false);
  assert.equal(getSecret("service", "account"), null);
  assert.equal(getSecretString("service", "account"), null);
  assert.equal(removeSecret("service", "account"), false);
  assert.deepEqual(listSecrets("service"), []);
  saveSecret("service", "account", "secret");
});

test(
  "linux-libsecret::set/get/list/delete roundtrip (dangerous)",
  { skip: !LINUX || !dangerousMutations || !isAvailable() },
  (t) => {
    const service = "neotales-js-linux-libsecret-test";
    const account = `acct-${Date.now()}`;
    try {
      saveSecret(service, account, "top-secret");
      assert.equal(getSecretString(service, account), "top-secret");
      assert.equal(getSecret(service, account) instanceof Uint8Array, true);
      assert.equal(listSecrets(service).some((record) => record.account === account), true);
      assert.equal(removeSecret(service, account), true);
    } catch (error) {
      if (shouldSkipIntegration(error)) {
        t.skip(error instanceof Error ? error.message : String(error));
        return;
      }
      throw error;
    }
  },
);
