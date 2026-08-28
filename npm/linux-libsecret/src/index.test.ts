import { deepEqual, equal, match, throws } from "node:assert/strict";
import { test } from "node:test";
import {
  getSecret,
  getSecretString,
  isAvailable,
  listSecrets,
  removeSecret,
  saveSecret,
} from "./index.js";
import {
  Gio,
  isGioAvailable,
  isLinuxKeyringAvailable,
  Libsecret,
  LibsecretErrorHandle,
} from "./ffi.js";
import { GCancellableHandle, LINUX, prepareLibsecretError, setLibsecretError } from "./types.js";

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
  equal(typeof isAvailable(), "boolean");
  equal(typeof isGioAvailable(), "boolean");
  equal(typeof isLinuxKeyringAvailable(), "boolean");
});

test("linux-libsecret::error output handles bind, reset, and reject another runtime", () => {
  const errorOut = new LibsecretErrorHandle();
  equal(errorOut.error(), null);
  prepareLibsecretError(errorOut, "deno");
  setLibsecretError(errorOut, new Error("native failure"));
  equal(errorOut.error()?.message, "native failure");
  prepareLibsecretError(errorOut, "deno");
  equal(errorOut.error(), null);
  throws(() => prepareLibsecretError(errorOut, "bun"), /different runtime/);
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
  equal(cancellable instanceof GCancellableHandle, true);
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
    equal(password, null);
    match(errorOut.error()?.message ?? "", /cancel/i);
  } finally {
    Gio.cancellableRelease(cancellable);
  }
  throws(() => Gio.cancellableCancel(cancellable), /released/);
});

test("linux-libsecret::Gio reports unavailable optional support", {
  skip: !isAvailable() || isGioAvailable(),
}, () => {
  throws(() => Gio.cancellableNew(), /GIO is unavailable/);
});

test("linux-libsecret::native FFI defers unsupported errors", { skip: isAvailable() }, () => {
  throws(() => Libsecret.secretSchemaNew("schema", 0, "service", 0, "account", 0, null));
});

test("linux-libsecret::unsupported platform returns safe defaults", { skip: LINUX }, () => {
  equal(isAvailable(), false);
  equal(getSecret("service", "account"), null);
  equal(getSecretString("service", "account"), null);
  equal(removeSecret("service", "account"), false);
  deepEqual(listSecrets("service"), []);
  saveSecret("service", "account", "secret");
});

test(
  "linux-libsecret::set/get/list/delete roundtrip (dangerous)",
  { skip: !LINUX || !dangerousMutations || !isAvailable() || "Bun" in globalThis },
  (t) => {
    const service = "neotales-js-linux-libsecret-test";
    const account = `acct-${Date.now()}`;
    try {
      saveSecret(service, account, "top-secret");
      equal(getSecretString(service, account), "top-secret");
      equal(getSecret(service, account) instanceof Uint8Array, true);
      equal(listSecrets(service).some((record) => record.account === account), true);
      equal(removeSecret(service, account), true);
    } catch (error) {
      if (shouldSkipIntegration(error)) {
        t.skip(error instanceof Error ? error.message : String(error));
        return;
      }
      throw error;
    }
  },
);
