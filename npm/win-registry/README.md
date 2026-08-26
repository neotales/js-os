# @neotales/win-registry

## Overview

`@neotales/win-registry` provides a cross-runtime Windows Registry API backed by
runtime-specific FFI implementations. It supports Node.js, Bun, and Deno on
Windows, with helpers for opening keys, reading values, writing values, and
deleting keys.

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
pnpm add @neotales/win-registry
```

```ts
import { Registry } from "@neotales/win-registry";
```

Deno projects that need the npm package can use
`deno add npm:@neotales/win-registry` and import from
`npm:@neotales/win-registry`.

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

Open a child key relative to a root key:

```typescript
import { Registry } from "@neotales/win-registry";

using currentVersion = Registry.HKLM.openKey(
  "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
);

console.log(currentVersion.getString("ProductName"));
```

## Exports

| Export                                                                                                | Subpath                                                                                               | Description                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Registry`, `RegistryKey`, `RegistryError`, `isRegistryAvailable`                                     | `@neotales/win-registry`                                                                              | Root registry facade, key wrapper, and availability helpers.          |
| `Registry`, `RegistryKey`, `RegistryError`, `isRegistryAvailable`                                     | `@neotales/win-registry/registry`                                                                     | Explicit registry facade subpath.                                     |
| `Rights`, `Types`, `EXECUTE`, registry root constants, `parseRegistryPath`, string conversion helpers | `@neotales/win-registry/types`                                                                        | Constants, types, and encoding helpers.                               |
| `backend`, `open`, `isOpened`, `close`                                                                | `@neotales/win-registry/dist/ffi_node.js`, `dist/ffi_bun.js`, `dist/ffi_deno.js`, `dist/ffi_koffi.js` | Runtime FFI backends with an explicit open/close lifecycle. Internal. |

```typescript
import { Registry, Rights } from "@neotales/win-registry";
import { parseRegistryPath } from "@neotales/win-registry/types";

const parsed = parseRegistryPath("HKCU\\Software\\MyApp");
using key = Registry.openKey("HKCU\\Software", Rights.READ);

parsed.subKey; // "Software\\MyApp"
key.getSubKeyNames();
```

## Runtime Support

This ESM-only npm package supports Node, Bun, and Deno on Windows. Node uses
native `node:ffi` when enabled by the current Node release (run with
`--experimental-ffi` on releases that ship it behind a flag), otherwise it falls
back to the optional `koffi` dependency. Bun uses native FFI. Deno requires
`--allow-ffi`; when its backend cannot load, `isRegistryAvailable()` returns
`false`.

### Remediation

When registry operations throw `RegistryError` with "not supported":

- Ensure the optional `koffi` dependency is installed: `npm i koffi`. It is
  skipped when installing with `--omit=optional` or when native build scripts
  are blocked.
- On Node >= 26, run with `--experimental-ffi` to prefer the native `node:ffi`
  backend over koffi.
- On Deno, run with `--allow-ffi`.
- See [Backend Lifecycle](#backend-lifecycle) for how backends are detected and
  loaded.

## Backend Lifecycle

The FFI backends open `advapi32.dll` lazily on the first registry operation, so
no explicit setup is required. Each backend module also exports an explicit
lifecycle for callers who want deterministic control over the native library:

| Function     | Description                                                                   |
| ------------ | ----------------------------------------------------------------------------- |
| `open()`     | Eagerly loads the FFI module and opens `advapi32.dll`. Idempotent while open. |
| `isOpened()` | Returns `true` while the backend holds an opened library handle.              |
| `close()`    | Unloads `advapi32.dll` so a later `open()` starts from a clean state.         |

```typescript
import { Registry } from "@neotales/win-registry";
import { close, isOpened, open } from "@neotales/win-registry/dist/ffi_node.js";

open(); // fail fast if node:ffi or koffi is unavailable
console.log(isOpened()); // true

using key = Registry.openKey("HKCU\\Software");
console.log(key.getSubKeyNames());

close();
```

Use the same pattern with `dist/ffi_bun.js` (Bun), `dist/ffi_deno.js` (Deno),
and `dist/ffi_koffi.js` (koffi fallback). Close all registry keys before calling
`close()`.

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
