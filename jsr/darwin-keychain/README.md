# @neotales/darwin-keychain

## Overview

`@neotales/darwin-keychain` provides simple macOS keychain access for generic passwords backed by `Security.framework` FFI.

![logo](https://raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neotales/darwin-keychain)](https://jsr.io/@neotales/darwin-keychain)
[![npm version](https://badge.fury.io/js/@neotales%2Fdarwin-keychain.svg)](https://badge.fury.io/js/@neotales%2Fdarwin-keychain)
[![GitHub version](https://badge.fury.io/gh/neotales%2Fjs-os.svg)](https://badge.fury.io/gh/neotales%2Fjs-os)

## Documentation

Documentation is available on [jsr.io](https://jsr.io/@neotales/darwin-keychain/doc).

A list of other modules can be found at [github.com/neotales/js](https://github.com/neotales/js).

## Installation

```sh
deno add jsr:@neotales/darwin-keychain
npx jsr add @neotales/darwin-keychain
npm install @neotales/darwin-keychain
```

## Usage

```typescript
import {
  getSecret,
  getSecretString,
  isAvailable,
  listSecrets,
  removeSecret,
  saveSecret,
} from "@neotales/darwin-keychain";

if (!isAvailable())
  throw new Error("Keychain FFI is unavailable");

saveSecret("my-service", "token", "my-secret");
saveSecret("my-service", "bytes", new Uint8Array([0, 255, 1]));

console.log(getSecretString("my-service", "token"));
console.log(getSecret("my-service", "bytes"));
console.log(listSecrets("my-service").map(({ account }) => account));

removeSecret("my-service", "token");
removeSecret("my-service", "bytes");
```

Services and accounts must be non-empty. The root API stores generic-password entries in the default macOS keychain and returns opaque bytes from `getSecret()` and `listSecrets()`.

## Native API

```typescript
import { isDarwinKeychainAvailable, Keychain } from "@neotales/darwin-keychain/ffi";

if (!isDarwinKeychainAvailable())
  throw new Error("Keychain FFI is unavailable");

const item = Keychain.SecKeychainAddGenericPassword(
  "my-service",
  "native-token",
  new TextEncoder().encode("secret"),
);
try {
  Keychain.SecKeychainItemModifyAttributesAndData(item, new TextEncoder().encode("updated"));
  const found = Keychain.SecKeychainFindGenericPassword("my-service", "native-token");
  console.log(found?.secret);
  if (found)
    Keychain.CFRelease(found.item);
  Keychain.SecKeychainItemDelete(item);
} finally {
  Keychain.CFRelease(item);
}
```

`Keychain` also exposes `SecKeychainSearchCreateFromAttributes`, `SecKeychainSearchCopyNext`, and `SecKeychainItemCopyAttributesAndData` for native enumeration. Returned `KeychainHandle` instances are runtime-specific opaque references; release every item and search handle with `Keychain.CFRelease()`.

## Exports

| Export                                                                                     | Subpath                         | Description                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------- |
| `getSecret`, `getSecretString`, `saveSecret`, `removeSecret`, `listSecrets`, `isAvailable` | `@neotales/darwin-keychain`     | Uniform secret-store facade.                        |
| `DarwinKeychain`, `Keychain`, `isDarwinKeychainAvailable`, `KeychainHandle`                | `@neotales/darwin-keychain/ffi` | Native generic-password and Security.framework API. |
| `SecretRecord`                                                                             | `@neotales/darwin-keychain`     | Keychain list record type.                          |

## Runtime Notes

This JSR package supports Deno, Node.js 26+, and Bun on macOS. On non-macOS systems `isAvailable()` returns `false`; root reads, removals, and lists return safe defaults, while native `/ffi` calls throw when invoked.

- Deno requires `--allow-ffi`, for example: `deno run --allow-ffi app.ts`.
- Node.js requires `--experimental-ffi`, for example: `node --experimental-ffi app.ts`.
- Bun uses its built-in FFI and needs no additional flag.

## License

[MIT License](./LICENSE.md)
