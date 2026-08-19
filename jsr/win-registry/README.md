# @neotales/win-registry

## Overview

`@neotales/win-registry` provides a cross-runtime Windows Registry API backed by runtime-specific FFI implementations.
It supports Node.js, Bun, and Deno on Windows, with helpers for opening keys, reading values, writing values, and deleting keys.

![logo](https://raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neotales/win-registry)](https://jsr.io/@neotales/win-registry)
[![npm version](https://badge.fury.io/js/@neotales%2Fwin-registry.svg)](https://badge.fury.io/js/@neotales%2Fwin-registry)
[![GitHub version](https://badge.fury.io/gh/neotales%2Fjs-os.svg)](https://badge.fury.io/gh/neotales%2Fjs-os)

## Documentation

Documentation is available on [jsr.io](https://jsr.io/@neotales/win-registry/doc).

A list of other modules can be found at [github.com/neotales/js-os](https://github.com/neotales/js-os).

## Installation

```bash
# Deno
deno add jsr:@neotales/win-registry

# npm from jsr
npx jsr add @neotales/win-registry

# from npmjs.org
npm install @neotales/win-registry
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

using key = Registry.openKey("HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion");

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

using currentVersion = Registry.HKLM.openKey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion");

console.log(currentVersion.getString("ProductName"));
```

## Exports

| Export                                                                                                | Subpath                           | Description                                                  |
| ----------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `Registry`, `RegistryKey`, `RegistryError`, `isRegistryAvailable`                                     | `@neotales/win-registry`          | Root registry facade, key wrapper, and availability helpers. |
| `Registry`, `RegistryKey`, `RegistryError`, `isRegistryAvailable`                                     | `@neotales/win-registry/registry` | Explicit registry facade subpath.                            |
| `Rights`, `Types`, `EXECUTE`, registry root constants, `parseRegistryPath`, string conversion helpers | `@neotales/win-registry/types`    | Constants, types, and encoding helpers.                      |

```typescript
import { Registry, Rights } from "@neotales/win-registry";
import { parseRegistryPath } from "@neotales/win-registry/types";

const parsed = parseRegistryPath("HKCU\\Software\\MyApp");
using key = Registry.openKey("HKCU\\Software", Rights.READ);

parsed.subKey; // "Software\\MyApp"
key.getSubKeyNames();
```

## Runtime Support

This JSR package supports Deno on Windows. On other platforms, `isRegistryAvailable()` returns `false` and registry operations throw `RegistryError`. Use `npm:@neotales/win-registry` when a project needs the cross-runtime package.

## License

[MIT License](./LICENSE.md)
