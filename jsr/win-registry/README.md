# @neotales/win-registry

## Overview

`@neotales/win-registry` provides a cross-runtime Windows Registry API backed by
runtime-specific FFI implementations.

The registry module supports Node.js, Bun, and Deno on Windows, with helpers for
opening keys, reading values, writing values, and deleting keys.

![logo](https://raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neotales/win-registry)](https://jsr.io/@neotales/win-registry)
[![npm version](https://badge.fury.io/js/@neotales%2Fwin-registry.svg)](https://badge.fury.io/js/@neotales%2Fwin-registry)
[![GitHub version](https://badge.fury.io/gh/neotales%2Fjs-os.svg)](https://badge.fury.io/gh/neotales%2Fjs-os)

## Documentation

Documentation is available on
[jsr.io](https://jsr.io/@neotales/win-registry/doc).

A list of other modules can be found at
[github.com/neotales/js-os](https://github.com/neotales/js-os).

## Installation

```sh
deno add jsr:@neotales/win-registry
```

```ts
import { Registry } from "jsr:@neotales/win-registry";
```

## Usage

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.createKey("HKCU\\Software\\MyApp");

key.setString("Theme", "dark");
key.setInt32("LaunchCount", 3);

console.log(key.getString("Theme"));
```

## Examples

Read a string value:

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.openKey(
  "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
);

console.log(key.getString("ProductName"));
console.log(key.getString("SystemRoot"));
```

Enumerate subkeys and values:

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.openKey("HKCU\\Software");

console.log(key.getSubKeyNames());
console.log(key.getValueNames());
console.log(key.stat());
```

Create a key and write string and DWORD values:

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.createKey("HKCU\\Software\\MyApp");

key.setString("Theme", "dark");
key.setExpandString("Logs", "%USERPROFILE%\\AppData\\Local\\MyApp\\logs");
key.setInt32("LaunchCount", 3);
```

Update an existing value:

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.openKey("HKCU\\Software\\MyApp");
const current = key.getInt32("LaunchCount");

key.setInt32("LaunchCount", current + 1);
```

Write multi-string and binary values:

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.createKey("HKCU\\Software\\MyApp");

key.setMultiString("RecentFiles", ["a.txt", "b.txt"]);
key.setBinary("State", new Uint8Array([1, 2, 3, 4]));
```

Delete a value or key:

```typescript
import { Registry } from "@neotales/win-registry";

const key = Registry.openKey("HKCU\\Software\\MyApp");

try {
  key.deleteValue("Theme");
} finally {
  key.close();
}

Registry.deleteKey("HKCU\\Software\\MyApp");
```

Open a child key relative to a predefined root key:

```typescript
import { Registry } from "@neotales/win-registry";

using currentVersion = Registry.HKLM.openKey(
  "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
);

console.log(currentVersion.getString("ProductName"));
```

Use a predefined root key property directly, such as `HKCU`:

```typescript
import { Registry, Rights } from "@neotales/win-registry";

using myApp = Registry.HKCU.openKey("Software\\MyApp", Rights.ALL_ACCESS);

myApp.setString("Theme", "dark");
console.log(myApp.path); // "HKEY_CURRENT_USER\Software\MyApp"
```

Other root key properties follow the same pattern:

```typescript
import { Registry } from "@neotales/win-registry";

console.log(Registry.HKCR.path); // file associations and COM classes
console.log(Registry.HKCU.path); // settings for the current user
console.log(Registry.HKLM.path); // machine-wide settings
console.log(Registry.HKU.path); // all loaded user hives
console.log(Registry.HKPD.path); // performance data
console.log(Registry.HKCC.path); // current hardware profile
```

## Data Types

The registry stores typed values. The most common types map to JavaScript types
as follows:

| Registry type   | Constant          | JavaScript type | Helper                              |
| --------------- | ----------------- | --------------- | ----------------------------------- |
| `REG_SZ`        | `Types.SZ`        | `string`        | `setString` / `getString`           |
| `REG_EXPAND_SZ` | `Types.EXPAND_SZ` | `string`        | `setExpandString` / `getString`     |
| `REG_MULTI_SZ`  | `Types.MULTI_SZ`  | `string[]`      | `setMultiString` / `getMultiString` |
| `REG_BINARY`    | `Types.BINARY`    | `Uint8Array`    | `setBinary` / `getBinary`           |
| `REG_DWORD`     | `Types.DWORD`     | `number`        | `setInt32` / `getInt32`             |
| `REG_QWORD`     | `Types.QWORD`     | `bigint`        | `setInt64` / `getInt64`             |

### DWORD vs QWORD

A **DWORD** ("double word") is an unsigned 32-bit integer stored in exactly four
bytes (`REG_DWORD`). It fits comfortably in JavaScript's `number`, so it maps to
`number` via `setInt32`/`getInt32`.

A **QWORD** ("quadruple word") is an unsigned 64-bit integer stored in exactly
eight bytes (`REG_QWORD`). It can exceed `Number.MAX_SAFE_INTEGER`, so it maps
to JavaScript's arbitrary-precision `bigint` via `setInt64`/`getInt64`.

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.createKey("HKCU\\Software\\MyApp");

// REG_DWORD (32-bit) -> number
key.setInt32("LaunchCount", 3);
console.log(key.getInt32("LaunchCount")); // 3

// REG_QWORD (64-bit) -> bigint
key.setInt64("Timestamp", 9007199254740993n);
console.log(key.getInt64("Timestamp")); // 9007199254740993n
```

Strings, expandable strings, multi-strings, and binary values cover the
remaining common cases:

```typescript
import { Registry } from "@neotales/win-registry";

using key = Registry.createKey("HKCU\\Software\\MyApp");

key.setString("Theme", "dark"); // REG_SZ -> string
key.setExpandString("Logs", "%USERPROFILE%\\AppData\\Local\\MyApp\\logs"); // REG_EXPAND_SZ -> string
key.setMultiString("RecentFiles", ["a.txt", "b.txt"]); // REG_MULTI_SZ -> string[]
key.setBinary("State", new Uint8Array([1, 2, 3, 4])); // REG_BINARY -> Uint8Array

console.log(key.getString("Theme"));
console.log(key.getMultiString("RecentFiles"));
```

## Exports

| Export                                                                                                | Subpath                           | Description                                                            |
| ----------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `Registry`, `RegistryKey`, `RegistryError`, `isRegistryAvailable`                                     | `@neotales/win-registry`          | Root registry facade, key wrapper, and availability helpers.           |
| `Registry`, `RegistryKey`, `RegistryError`, `isRegistryAvailable`                                     | `@neotales/win-registry/registry` | Explicit registry facade subpath.                                      |
| `Rights`, `Types`, `EXECUTE`, registry root constants, `parseRegistryPath`, string conversion helpers | `@neotales/win-registry/types`    | Constants, types, and encoding helpers.                                |
| `backend`, `open`, `isOpened`, `close`                                                                | `@neotales/win-registry/ffi-deno` | Deno FFI backend (`advapi32.dll`) with open/close lifecycle. Internal. |
| `backend`, `open`, `isOpened`, `close`                                                                | `@neotales/win-registry/ffi-bun`  | Bun FFI backend (`bun:ffi`) with open/close lifecycle. Internal.       |
| `backend`, `open`, `isOpened`, `close`                                                                | `@neotales/win-registry/ffi-node` | Node.js FFI backend (`node:ffi`) with open/close lifecycle. Internal.  |

```typescript
import { Registry, Rights } from "@neotales/win-registry";
import { parseRegistryPath } from "@neotales/win-registry/types";

const parsed = parseRegistryPath("HKCU\\Software\\MyApp");
using key = Registry.openKey("HKCU\\Software", Rights.READ);

parsed.subKey; // "Software\\MyApp"
key.getSubKeyNames();
```

## Runtime Support

The registry backend is selected automatically at import time: Deno uses
`advapi32.dll` through Deno FFI, Bun uses `bun:ffi`, and Node.js uses
`node:ffi`. On Windows the correct FFI module is loaded lazily; on other
platforms, or when FFI permissions are absent, `isRegistryAvailable()` returns
`false` and registry operations throw `RegistryError`.

Run Deno with `--allow-ffi`. Run Node.js with `--experimental-ffi` to use the
native `node:ffi` backend; without it, the koffi fallback (npm package) is used.
Use `npm:@neotales/win-registry` when a project needs the cross-runtime npm
package.

## Backend Lifecycle

The FFI backends open `advapi32.dll` lazily on the first registry operation, so
no explicit setup is required. Each backend module also exports an explicit
lifecycle for callers who want deterministic control over the native library:

| Function     | Description                                                                   |
| ------------ | ----------------------------------------------------------------------------- |
| `open()`     | Eagerly loads the FFI module and opens `advapi32.dll`. Idempotent while open. |
| `isOpened()` | Returns `true` while the backend holds an opened library handle.              |
| `close()`    | Unloads `advapi32.dll` so a later `open()` starts from a clean state.         |

```ts
import { Registry } from "@neotales/win-registry";
import { close, isOpened, open } from "@neotales/win-registry/ffi-deno";

open(); // fail fast if --allow-ffi is missing
console.log(isOpened()); // true

using key = Registry.openKey("HKCU\\Software");
console.log(key.getSubKeyNames());

close();
```

Use the same pattern with `@neotales/win-registry/ffi-bun` (Bun) and
`@neotales/win-registry/ffi-node` (Node.js). Close all registry keys before
calling `close()`.

## Resource Management

Every key returned by `Registry.openKey()` or `Registry.createKey()` owns a
Windows registry handle. Prefer `using` so the handle closes at the end of its
lexical scope, even when an operation throws. Predefined root keys such as
`Registry.HKCU` do not need closing.

```ts
using key = Registry.openKey("HKCU\\Software");
console.log(key.getValueNames());
```

When `using` is unavailable, close the key in `finally`:

```ts
const key = Registry.openKey("HKCU\\Software");
try {
  console.log(key.getValueNames());
} finally {
  key.close();
}
```

## License

[MIT License](./LICENSE.md)
