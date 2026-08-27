import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
  getSecret,
  getSecretString,
  isAvailable,
  listSecrets,
  removeSecret,
  saveSecret,
} from "./index.js";
import { stringToWide, wideToString } from "./types.js";
import { isAvailable as isFfiAvailable, WinCred } from "./ffi.js";

const WINDOWS = process.platform === "win32";
const DANGEROUS_MUTATIONS = process.env.TEST_DANGEROUS_OS_MUTATIONS === "true" ||
  process.env.CI === "true";
const TEST_SERVICE = `neotales-js-test-credential-${crypto.randomUUID()}`;
const CREDENTIAL_MANAGER_MUTATIONS = DANGEROUS_MUTATIONS && !process.env.SSH_CONNECTION;

test("win-cred::availability reports a boolean", () => {
  strictEqual(typeof isAvailable(), "boolean");
});

test("win-cred::native FFI entry point defers unsupported errors", () => {
  strictEqual(typeof isFfiAvailable(), "boolean");
  if (!isFfiAvailable())
    throws(() => WinCred.enumerate(null, 0));
});

test(
  "win-cred::credential manager is unavailable on non-windows runtimes",
  { skip: WINDOWS },
  () => {
    strictEqual(isAvailable(), false);
    strictEqual(getSecret(TEST_SERVICE, "account"), null);
    strictEqual(getSecretString(TEST_SERVICE, "account"), null);
    deepStrictEqual(listSecrets(TEST_SERVICE), []);
    strictEqual(removeSecret(TEST_SERVICE, "account"), false);
  },
);

test("win-cred::stringToWide and wideToString roundtrip", () => {
  const wide = stringToWide("hello");
  strictEqual(wide.length, 12);
  strictEqual(wideToString(wide), "hello");
});

test("win-cred::listSecrets is safe to call on Windows", {
  skip: !WINDOWS || !isAvailable(),
}, () => {
  if (!WINDOWS) return;

  strictEqual(Array.isArray(listSecrets(TEST_SERVICE)), true);
});

test(
  "win-cred::save/read/remove secret (Windows, dangerous)",
  { skip: !WINDOWS || !CREDENTIAL_MANAGER_MUTATIONS },
  () => {
    if (!WINDOWS || !CREDENTIAL_MANAGER_MUTATIONS) return;

    try {
      saveSecret(TEST_SERVICE, "neo", "secret");
      saveSecret(TEST_SERVICE, "bytes", new Uint8Array([0, 255]));

      strictEqual(getSecretString(TEST_SERVICE, "neo"), "secret");
      deepStrictEqual(getSecret(TEST_SERVICE, "bytes"), new Uint8Array([0, 255]));
      strictEqual(listSecrets(TEST_SERVICE).length, 2);

      strictEqual(removeSecret(TEST_SERVICE, "neo"), true);
      strictEqual(removeSecret(TEST_SERVICE, "bytes"), true);
      strictEqual(getSecret(TEST_SERVICE, "neo"), null);
    } finally {
      removeSecret(TEST_SERVICE, "neo");
      removeSecret(TEST_SERVICE, "bytes");
    }
  },
);
