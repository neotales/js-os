import { deepStrictEqual, strictEqual } from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
  CredType,
  decodeSecret,
  encodeSecret,
  isAvailable,
  listCredentials,
  readCredential,
  readSecret,
  removeCredential,
  saveCredential,
} from "./index.js";
import { stringToWide, wideToString } from "./types.js";

const WINDOWS = process.platform === "win32";
const DANGEROUS_MUTATIONS = process.env.TEST_DANGEROUS_OS_MUTATIONS === "true" ||
  process.env.CI === "true";
const TEST_TARGET = "neotales-js-test-credential";
const CREDENTIAL_MANAGER_MUTATIONS = DANGEROUS_MUTATIONS && !process.env.SSH_CONNECTION;

test("win-cred::availability reports a boolean", () => {
  strictEqual(typeof isAvailable(), "boolean");
});

test(
  "win-cred::credential manager is unavailable on non-windows runtimes",
  { skip: WINDOWS },
  () => {
    strictEqual(isAvailable(), false);
    strictEqual(readCredential(TEST_TARGET), null);
    strictEqual(readSecret(TEST_TARGET), null);
    deepStrictEqual(listCredentials(), []);
    strictEqual(removeCredential(TEST_TARGET), false);
  },
);

test("win-cred::encodeSecret and decodeSecret roundtrip", () => {
  const encoded = encodeSecret("hello");
  strictEqual(encoded.length, 10);
  strictEqual(decodeSecret(encoded), "hello");
});

test("win-cred::stringToWide and wideToString roundtrip", () => {
  const wide = stringToWide("hello");
  strictEqual(wide.length, 12);
  strictEqual(wideToString(wide), "hello");
});

test("win-cred::listCredentials is safe to call on Windows", { skip: !WINDOWS }, () => {
  if (!WINDOWS) return;

  strictEqual(Array.isArray(listCredentials()), true);
});

test(
  "win-cred::save/read/remove credential (Windows, dangerous)",
  { skip: !WINDOWS || !CREDENTIAL_MANAGER_MUTATIONS },
  () => {
    if (!WINDOWS || !CREDENTIAL_MANAGER_MUTATIONS) return;

    saveCredential({
      targetName: TEST_TARGET,
      secret: "secret",
      type: CredType.GENERIC,
      userName: "neo",
    });

    const credential = readCredential(TEST_TARGET, CredType.GENERIC);
    strictEqual(credential?.targetName, TEST_TARGET);
    strictEqual(credential?.userName, "neo");
    strictEqual(readSecret(TEST_TARGET, CredType.GENERIC), "secret");

    strictEqual(removeCredential(TEST_TARGET, CredType.GENERIC), true);
    strictEqual(readCredential(TEST_TARGET, CredType.GENERIC), null);
  },
);
