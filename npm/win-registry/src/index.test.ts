import { equal, ok, strictEqual, throws } from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { isRegistryAvailable, Registry, RegistryError } from "./index.js";
import {
  HKEY_CURRENT_USER,
  HKEY_LOCAL_MACHINE,
  multiStringToWide,
  parseRegistryPath,
  stringToWide,
  wideToMultiString,
  wideToString,
} from "./types.js";

const WINDOWS = process.platform === "win32";
const DANGEROUS_MUTATIONS = process.env.TEST_DANGEROUS_OS_MUTATIONS === "true" ||
  process.env.CI === "true";
const WINDOWS_CURRENT_VERSION = "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion";
const TEST_KEY = "HKCU\\Software\\neotales-js-test-registry";

test("win-registry::availability reports a boolean", () => {
  strictEqual(typeof isRegistryAvailable(), "boolean");
});

test("win-registry::registry is unavailable on non-windows runtimes", {
  skip: WINDOWS,
}, () => {
  strictEqual(isRegistryAvailable(), false);
  throws(() => Registry.openKey("HKCU\\Software"), RegistryError);
});

test("win-registry::stringToWide and wideToString roundtrip", () => {
  const s = "hello";
  const wide = stringToWide(s);
  equal(wide.length, (s.length + 1) * 2);
  equal(wide[0], 0x68);
  equal(wide[1], 0x00);
  equal(wideToString(wide), s);
});

test("win-registry::wideToString stops at null terminator", () => {
  const buf = new Uint8Array([0x61, 0x00, 0x00, 0x00, 0x62, 0x00]);
  equal(wideToString(buf), "a");
});

test("win-registry::multiStringToWide and wideToMultiString roundtrip", () => {
  const arr = ["one", "two", "three"];
  const wide = multiStringToWide(arr);
  equal(wide[wide.length - 1], 0);
  const decoded = wideToMultiString(wide);
  equal(decoded.length, arr.length);
  equal(decoded[0], "one");
});

test("win-registry::multiStringToWide handles empty array", () => {
  const wide = multiStringToWide([]);
  equal(wide.length, 4);
  equal(wide[0], 0);
  equal(wide[1], 0);
  equal(wide[2], 0);
  equal(wide[3], 0);
  equal(wideToMultiString(wide).length, 0);
});

test("win-registry::parseRegistryPath recognizes common roots", () => {
  const p1 = parseRegistryPath("HKLM\\SOFTWARE\\Foo");
  equal(p1.hkey, HKEY_LOCAL_MACHINE);
  equal(p1.subKey, "SOFTWARE\\Foo");

  const p2 = parseRegistryPath("HKEY_CURRENT_USER\\Console");
  equal(p2.hkey, HKEY_CURRENT_USER);
  equal(p2.subKey, "Console");
});

test("win-registry::parseRegistryPath throws on unknown root", () => {
  throws(() => parseRegistryPath("UNKNOWN\\Path"));
});

test(
  "win-registry::Registry can read well-known Windows registry values",
  { skip: !WINDOWS },
  () => {
    if (!WINDOWS) return;

    const key = Registry.openKey(WINDOWS_CURRENT_VERSION);

    try {
      const productName = key.getString("ProductName");
      const systemRoot = key.getString("SystemRoot");
      const names = key.getValueNames();
      const stats = key.stat();

      strictEqual(typeof productName, "string");
      strictEqual(productName.length > 0, true);
      strictEqual(typeof systemRoot, "string");
      strictEqual(systemRoot.length > 0, true);
      ok(names.includes("ProductName"));
      ok(names.includes("SystemRoot"));
      strictEqual(typeof stats.valueCount, "number");
      strictEqual(stats.valueCount > 0, true);
    } finally {
      key.close();
    }
  },
);

test("win-registry::Registry relative open works for well-known keys", {
  skip: !WINDOWS,
}, () => {
  if (!WINDOWS) return;

  const root = Registry.HKLM;
  const currentVersion = root.openKey(
    "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
  );

  try {
    strictEqual(currentVersion.getString("ProductName").length > 0, true);
  } finally {
    currentVersion.close();
  }
});

test(
  "win-registry::Registry create/open/set/get/delete (Windows, dangerous)",
  { skip: !WINDOWS || !DANGEROUS_MUTATIONS },
  () => {
    if (!WINDOWS || !DANGEROUS_MUTATIONS) return;

    const k = Registry.createKey(TEST_KEY);
    try {
      k.setString("TestString", "hello-registry");
      equal(k.getString("TestString"), "hello-registry");

      k.setInt32("TestDword", 0x11223344);
      equal(k.getInt32("TestDword"), 0x11223344);

      k.setInt64("TestQword", 0x1122334455667788n);
      equal(k.getInt64("TestQword"), 0x1122334455667788n);

      k.setMultiString("TestMulti", ["a", "b"]);
      const ms = k.getMultiString("TestMulti");
      equal(ms.length, 2);
      equal(ms[0], "a");

      const bin = new Uint8Array([1, 2, 3, 4]);
      k.setBinary("TestBin", bin);
      equal(k.getBinary("TestBin").length, 4);

      const names = k.getValueNames();
      ok(names.includes("TestString"));

      const stats = k.stat();
      strictEqual(typeof stats.valueCount, "number");

      k.deleteValue("TestString");
      throws(() => k.getString("TestString"));
    } finally {
      k.close();
      Registry.deleteKey(TEST_KEY);
    }
  },
);

test(
  "win-registry::createKey relative operations (Windows, dangerous)",
  { skip: !WINDOWS || !DANGEROUS_MUTATIONS },
  () => {
    if (!WINDOWS || !DANGEROUS_MUTATIONS) return;

    const root = Registry.HKCU;
    const created = root.createKey(
      "Software\\neotales-js-test-registry-relative",
    );
    try {
      created.setString("Relative", "value");
      const child = root.openKey(
        "Software\\neotales-js-test-registry-relative",
      );
      equal(child.getString("Relative"), "value");
    } finally {
      created.close();
      Registry.deleteKey("HKCU\\Software\\neotales-js-test-registry-relative");
    }
  },
);

test(
  "win-registry::Registry preserves values larger than 4 KiB",
  { skip: !WINDOWS || !DANGEROUS_MUTATIONS },
  () => {
    if (!WINDOWS || !DANGEROUS_MUTATIONS) return;

    const key = Registry.createKey(TEST_KEY);
    try {
      const binary = Uint8Array.from(
        { length: 8192 },
        (_, index) => index % 256,
      );
      const string = "registry-value-".repeat(512);
      const multi = ["first-".repeat(512), "second-".repeat(512)];

      key.setBinary("LargeBinary", binary);
      key.setString("LargeString", string);
      key.setMultiString("LargeMulti", multi);

      equal(key.getBinary("LargeBinary").length, binary.length);
      equal(key.getBinary("LargeBinary")[8191], binary[8191]);
      equal(key.getString("LargeString"), string);
      equal(key.getMultiString("LargeMulti")[1], multi[1]);
    } finally {
      key.close();
      Registry.deleteKey(TEST_KEY);
    }
  },
);
