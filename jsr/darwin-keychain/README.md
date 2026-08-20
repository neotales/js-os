# @neostd/darwin-keychain

## Overview

`@neostd/darwin-keychain` provides simple macOS keychain access for generic passwords backed by `Security.framework` FFI.

![logo](https://raw.githubusercontent.com/neostd/js/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neostd/darwin-keychain)](https://jsr.io/@neostd/darwin-keychain)
[![npm version](https://badge.fury.io/js/@neostd%2Fdarwin-keychain.svg)](https://badge.fury.io/js/@neostd%2Fdarwin-keychain)
[![GitHub version](https://badge.fury.io/gh/neostd%2Fjs.svg)](https://badge.fury.io/gh/neostd%2Fjs)

## Documentation

Documentation is available on [jsr.io](https://jsr.io/@neostd/darwin-keychain/doc).

A list of other modules can be found at [github.com/neostd/js](https://github.com/neostd/js).

## Installation

```bash
# Deno
deno add jsr:@neostd/darwin-keychain

# npm from jsr
npx jsr add @neostd/darwin-keychain

# from npmjs.org
npm install @neostd/darwin-keychain
```

## Usage

```typescript
import { isDarwinKeychainAvailable, saveSecret } from "@neostd/darwin-keychain";

if (isDarwinKeychainAvailable()) {
  saveSecret("my-service", "my-account", "my-secret");
}
```

## Examples

Write a secret:

```typescript
import { saveSecret } from "@neostd/darwin-keychain";

saveSecret("my-service", "my-account", "my-secret");
```

Read a secret:

```typescript
import { readSecret } from "@neostd/darwin-keychain";

console.log(readSecret("my-service", "my-account"));
```

Read raw bytes:

```typescript
import { getSecretBytes } from "@neostd/darwin-keychain";

console.log(getSecretBytes("my-service", "my-account"));
```

Delete a secret:

```typescript
import { removeSecret } from "@neostd/darwin-keychain";

removeSecret("my-service", "my-account");
```

List secrets for a service:

```typescript
import { listSecrets } from "@neostd/darwin-keychain";

console.log(listSecrets("my-service"));
```

`listSecrets()` is currently not supported in Bun. Attempting to enumerate keychain entries through the Bun FFI path caused Bun to panic, so Bun support for listing is disabled until that upstream issue is fixed.

## Exports

| Export                                                                                                   | Subpath                   | Description                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------- |
| `readSecret`, `getSecretBytes`, `saveSecret`, `removeSecret`, `listSecrets`, `isDarwinKeychainAvailable` | `@neostd/darwin-keychain` | macOS keychain helpers and availability check. |
| `SecretRecord`                                                                                           | `@neostd/darwin-keychain` | Keychain list record type.                     |

## Runtime Notes

This package is macOS-specific. On non-macOS runtimes `isDarwinKeychainAvailable()` returns `false`.

Node prefers `node:ffi` and falls back to the optional `koffi` peer dependency. Bun and Deno use their native FFI support.

In Bun, `readSecret`, `getSecretBytes`, `saveSecret`, and `removeSecret` are supported, but `listSecrets` is intentionally unavailable until Bun fixes the panic triggered by keychain enumeration.

## License

[MIT License](./LICENSE.md)
