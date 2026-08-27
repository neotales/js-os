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
import { isAvailable, Security } from "@neotales/darwin-keychain/ffi";

if (!isAvailable())
  throw new Error("Keychain FFI is unavailable");

const item = Security.SecKeychainAddGenericPassword(
  "my-service",
  "native-token",
  new TextEncoder().encode("secret"),
);
try {
  Security.SecKeychainItemModifyAttributesAndData(item, new TextEncoder().encode("updated"));
  const found = Security.SecKeychainFindGenericPassword("my-service", "native-token");
  console.log(found?.secret);
  if (found)
    Security.CFRelease(found.item);
  Security.SecKeychainItemDelete(item);
} finally {
  Security.CFRelease(item);
}
```

`Security` also exposes `SecKeychainSearchCreateFromAttributes`, `SecKeychainSearchCopyNext`, and `SecKeychainItemCopyAttributesAndData` for native enumeration. Returned `KeychainHandle` instances are runtime-specific opaque references; release every item and search handle with `Security.CFRelease()`.

## Exports

| Export                                                                                     | Subpath                         | Description                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------- |
| `getSecret`, `getSecretString`, `saveSecret`, `removeSecret`, `listSecrets`, `isAvailable` | `@neotales/darwin-keychain`     | Uniform secret-store facade.                        |
| `DarwinKeychain`, `Security`, `isAvailable`, `isListAvailable`, `KeychainHandle`           | `@neotales/darwin-keychain/ffi` | Native generic-password and Security.framework API. |
| `SecretRecord`                                                                             | `@neotales/darwin-keychain`     | Keychain list record type.                          |

## Runtime Notes

This JSR package is for Deno on macOS and requires `--allow-ffi`. On non-macOS systems `isAvailable()` returns `false`; root reads, removals, and lists return safe defaults, while native `/ffi` calls throw when invoked.

## License

[MIT License](./LICENSE.md)
