import assert from "node:assert/strict";
import { test } from "node:test";
import { Registry, RegistryError } from "./mod.ts";
import * as denoBackend from "./ffi_deno.ts";
import { readU32, readU64, writeU32 } from "./binary.ts";

const TEST_KEY = "HKCU\\Software\\neotales-js-test-registry-lifecycle";

test("binary helpers roundtrip unsigned values", () => {
  const buf = new Uint8Array(8);
  writeU32(buf, 0xdeadbeef);
  assert.equal(readU32(buf), 0xdeadbeef);
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, 0x1122334455667788n, true);
  assert.equal(readU64(new Uint8Array(view.buffer)), 0x1122334455667788n);
});

test("deno backend exposes an open/close lifecycle", { skip: !isWindows() }, () => {
  if (!isWindows()) return;

  denoBackend.close();
  assert.equal(denoBackend.isOpened(), false);
  denoBackend.open();
  assert.equal(denoBackend.isOpened(), true);
  denoBackend.close();
  assert.equal(denoBackend.isOpened(), false);
});

test("backend loads lazily through the facade", { skip: !isWindows() }, () => {
  if (!isWindows()) return;

  denoBackend.close();
  const probe = Registry.openKey("HKCU\\Software");
  try {
    assert.equal(denoBackend.isOpened(), true);
  } finally {
    probe.close();
  }
});

test("unknown roots and missing keys throw RegistryError", () => {
  assert.throws(() => Registry.openKey("BOGUS\\Path"), RegistryError);
  assert.throws(
    () => Registry.openKey("HKCU\\Software\\definitely-missing-key-xyz"),
    RegistryError,
  );
});

test(
  "value roundtrips incl. DWORD and QWORD (Windows, dangerous)",
  { skip: !isWindows() },
  () => {
    if (!isWindows()) return;

    using key = Registry.createKey(TEST_KEY);
    key.setString("Theme", "dark");
    assert.equal(key.getString("Theme"), "dark");

    key.setInt32("Dword", 0x11223344);
    assert.equal(key.getInt32("Dword"), 0x11223344);

    key.setInt64("Qword", 9007199254740993n);
    assert.equal(key.getInt64("Qword"), 9007199254740993n);

    key.setMultiString("Multi", ["a", "b"]);
    assert.equal(key.getMultiString("Multi").join(","), "a,b");

    key.setExpandString("Logs", "%USERPROFILE%\\logs");
    assert.equal(key.getString("Logs"), "%USERPROFILE%\\logs");

    key.deleteValue("Theme");
    assert.throws(() => key.getString("Theme"), RegistryError);

    key.close();
    Registry.deleteKey(TEST_KEY);
  },
);

function isWindows(): boolean {
  return Deno.build.os === "windows";
}
