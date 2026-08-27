# @neotales/linux-libsecret

## Overview

`@neotales/linux-libsecret` provides simple Linux secret storage access backed by `libsecret` FFI.

![logo](https://raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neotales/linux-libsecret)](https://jsr.io/@neotales/linux-libsecret)
[![npm version](https://badge.fury.io/js/@neotales%2Flinux-libsecret.svg)](https://badge.fury.io/js/@neotales%2Flinux-libsecret)
[![GitHub version](https://badge.fury.io/gh/neotales%2Fjs-os.svg)](https://badge.fury.io/gh/neotales%2Fjs-os)

## Documentation

Documentation is available on [jsr.io](https://jsr.io/@neotales/linux-libsecret/doc).

A list of other modules can be found at [github.com/neotales/js-os](https://github.com/neotales/js-os).

## Installation

```sh
deno add jsr:@neotales/linux-libsecret
npx jsr add @neotales/linux-libsecret
npm install @neotales/linux-libsecret
```

## Usage

```typescript
import { isLinuxLibsecretAvailable, saveSecret } from "@neotales/linux-libsecret";

if (isLinuxLibsecretAvailable()) {
  saveSecret("my-service", "my-account", "my-secret");
}
```

## Examples

Write a secret:

```typescript
import { saveSecret } from "@neotales/linux-libsecret";

saveSecret("my-service", "my-account", "my-secret");
```

Read a secret:

```typescript
import { readSecret } from "@neotales/linux-libsecret";

console.log(readSecret("my-service", "my-account"));
```

Read raw bytes:

```typescript
import { getSecretBytes } from "@neotales/linux-libsecret";

console.log(getSecretBytes("my-service", "my-account"));
```

Delete a secret:

```typescript
import { removeSecret } from "@neotales/linux-libsecret";

removeSecret("my-service", "my-account");
```

List secrets for a service:

```typescript
import { listSecrets } from "@neotales/linux-libsecret";

console.log(listSecrets("my-service"));
```

## Exports

| Export                                                                                                   | Subpath                     | Description                               |
| -------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| `readSecret`, `getSecretBytes`, `saveSecret`, `removeSecret`, `listSecrets`, `isLinuxLibsecretAvailable` | `@neotales/linux-libsecret` | libsecret helpers and availability check. |
| `SecretRecord`                                                                                           | `@neotales/linux-libsecret` | libsecret list record type.               |

## Runtime Notes

This package is Linux-specific. On non-Linux runtimes `isLinuxLibsecretAvailable()` returns `false`.

Node prefers `node:ffi` and falls back to the optional `koffi` peer dependency. Bun and Deno use their native FFI support.

## License

[MIT License](./LICENSE.md)
