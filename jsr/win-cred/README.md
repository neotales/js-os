# @neotales/win-cred

## Overview

`@neotales/win-cred` provides cross-runtime access to Windows Credential Manager using runtime-specific FFI backends.
It supports reading, writing, listing, and deleting credentials on Windows from Node.js, Bun, and Deno.

![logo](https://raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neotales/win-cred)](https://jsr.io/@neotales/win-cred)
[![npm version](https://badge.fury.io/js/@neotales%2Fwin-cred.svg)](https://badge.fury.io/js/@neotales%2Fwin-cred)
[![GitHub version](https://badge.fury.io/gh/neotales%2Fjs-os.svg)](https://badge.fury.io/gh/neotales%2Fjs-os)

## Documentation

Documentation is available on [jsr.io](https://jsr.io/@neotales/win-cred/doc).

A list of other modules can be found at [github.com/neotales/js-os](https://github.com/neotales/js-os).

## Installation

```sh
deno add jsr:@neotales/win-cred
```

```ts
import { readSecret, saveCredential } from "jsr:@neotales/win-cred";
```

## Usage

```typescript
import { readSecret, saveCredential } from "@neotales/win-cred";

saveCredential({ targetName: "myapp/token", secret: "secret" });
console.log(readSecret("myapp/token"));
```

## Examples

Write a generic credential:

```typescript
import { CredPersist, CredType, saveCredential } from "@neotales/win-cred";

saveCredential({
  targetName: "myapp/token",
  secret: "secret",
  type: CredType.GENERIC,
  persist: CredPersist.LOCAL_MACHINE,
  userName: "neo",
});
```

Read a credential object:

```typescript
import { readCredential } from "@neotales/win-cred";

const credential = readCredential("myapp/token");

console.log(credential?.targetName);
console.log(credential?.userName);
```

Read and decode a secret string:

```typescript
import { readSecret } from "@neotales/win-cred";

console.log(readSecret("myapp/token"));
```

List credentials:

```typescript
import { listCredentials } from "@neotales/win-cred";

for (const credential of listCredentials()) {
  console.log(credential.targetName);
}
```

Delete a credential:

```typescript
import { removeCredential } from "@neotales/win-cred";

removeCredential("myapp/token");
```

Encode and decode secret blobs manually:

```typescript
import { decodeSecret, encodeSecret } from "@neotales/win-cred";

const blob = encodeSecret("secret");
console.log(decodeSecret(blob));
```

## Exports

| Export                                                                                                                                 | Subpath                         | Description                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------- |
| `saveCredential`, `readCredential`, `readSecret`, `removeCredential`, `listCredentials`, `encodeSecret`, `decodeSecret`, `isAvailable` | `@neotales/win-cred`            | High-level credential helpers.      |
| Same as root, plus `WriteOptions`                                                                                                      | `@neotales/win-cred/credential` | Explicit credential helper subpath. |
| `CredType`, `CredPersist`, `CredWriteFlags`, `CredEnumerateFlags`, types                                                               | `@neotales/win-cred/types`      | Credential constants and types.     |

## Runtime Support

This JSR package supports Deno on Windows. Run Deno with `--allow-ffi`; when permission is absent or the backend cannot load, `isAvailable()` returns `false`. Use `npm:@neotales/win-cred` for the cross-runtime package.

Credential writes require an interactive Windows logon session. OpenSSH sessions can fail with Win32 error `1312` (`ERROR_NO_SUCH_LOGON_SESSION`) because Credential Manager has no available logon session; validate write operations from an interactive RDP or console session.

## License

[MIT License](./LICENSE.md)
