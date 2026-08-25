import { Registry, RegistryError } from "./mod.ts";
import * as denoBackend from "./ffi_deno.ts";
import { readU32, readU64, writeU32 } from "./binary.ts";

const TEST_KEY = "HKCU\\Software\\neotales-js-test-registry-lifecycle";

function assert(condition: unknown, message?: string): void {
  if (!condition) throw new Error(message ?? "Assertion failed");
}

function equal<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected}, got ${actual}`);
  }
}

Deno.test("binary helpers roundtrip unsigned values", () => {
  const buf = new Uint8Array(8);
  writeU32(buf, 0xdeadbeef);
  equal(readU32(buf), 0xdeadbeef);
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, 0x1122334455667788n, true);
  equal(readU64(new Uint8Array(view.buffer)), 0x1122334455667788n);
});

Deno.test("deno backend exposes an open/close lifecycle", () => {
  denoBackend.close();
  equal(denoBackend.isOpened(), false);
  denoBackend.open();
  equal(denoBackend.isOpened(), true);
  denoBackend.close();
  equal(denoBackend.isOpened(), false);
});

Deno.test("backend loads lazily through the facade", () => {
  denoBackend.close();
  const probe = Registry.openKey("HKCU\\Software");
  try {
    equal(denoBackend.isOpened(), true);
  } finally {
    probe.close();
  }
});

Deno.test("unknown roots and missing keys throw RegistryError", () => {
  let threw = false;
  try {
    Registry.openKey("BOGUS\\Path");
  } catch (error) {
    threw = error instanceof RegistryError;
  }
  assert(threw, "Expected RegistryError for unknown root");

  threw = false;
  try {
    Registry.openKey("HKCU\\Software\\definitely-missing-key-xyz");
  } catch (error) {
    threw = error instanceof RegistryError;
  }
  assert(threw, "Expected RegistryError for missing key");
});

Deno.test(
  "value roundtrips incl. DWORD and QWORD (Windows, dangerous)",
  { ignore: !isWindows() },
  () => {
    if (!isWindows()) return;

    using key = Registry.createKey(TEST_KEY);
    key.setString("Theme", "dark");
    equal(key.getString("Theme"), "dark");

    key.setInt32("Dword", 0x11223344);
    equal(key.getInt32("Dword"), 0x11223344);

    key.setInt64("Qword", 9007199254740993n);
    equal(key.getInt64("Qword"), 9007199254740993n);

    key.setMultiString("Multi", ["a", "b"]);
    equal(key.getMultiString("Multi").join(","), "a,b");

    key.setExpandString("Logs", "%USERPROFILE%\\logs");
    equal(key.getString("Logs"), "%USERPROFILE%\\logs");

    key.deleteValue("Theme");
    let threw = false;
    try {
      key.getString("Theme");
    } catch (error) {
      threw = error instanceof RegistryError;
    }
    assert(threw, "Expected RegistryError after deleteValue");

    key.close();
    Registry.deleteKey(TEST_KEY);
  },
);

function isWindows(): boolean {
  return Deno.build.os === "windows";
}
