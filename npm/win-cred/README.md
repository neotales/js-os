# @neotales/win-cred

Windows Credential Manager secret storage.

[![GitHub version](https://badge.fury.io/gh/neotales%2Fjs-os.svg)](https://badge.fury.io/gh/neotales%2Fjs-os)

## Installation

```sh
deno add jsr:@neotales/win-cred
npx jsr add @neotales/win-cred
npm install @neotales/win-cred
```

## Secret Store API

The package root stores opaque secrets by service and account. `getSecret()` returns bytes and `getSecretString()` decodes UTF-8.

```ts
import {
  getSecret,
  getSecretString,
  isAvailable,
  listSecrets,
  removeSecret,
  saveSecret,
} from "@neotales/win-cred";

if (!isAvailable())
  throw new Error("Credential Manager FFI is unavailable");

saveSecret("myapp", "token", "secret");
saveSecret("myapp", "key", new Uint8Array([0, 255, 1]));

console.log(getSecretString("myapp", "token"));
console.log(getSecret("myapp", "key"));
console.log(listSecrets("myapp").map(({ account }) => account));

removeSecret("myapp", "token");
removeSecret("myapp", "key");
```

Services and accounts must be non-empty. The root API encodes them into an internal Credential Manager target name, so it lists only records created through this API.

## Native API

`@neotales/win-cred/ffi` exposes raw Credential Manager operations for callers that need native target names, credential types, persistence scopes, or raw credential blobs. Unlike the root API, `WinCred` does not namespace targets. It is safe to import on unsupported runtimes; call `isAvailable()` before invoking it.

```ts
import {
  CredEnumerateFlags,
  CredPersist,
  CredType,
  CredWriteFlags,
  isAvailable,
  WinCred,
} from "@neotales/win-cred/ffi";

if (!isAvailable())
  throw new Error("Credential Manager FFI is unavailable");

const targetName = "myapp/native-token";
const credentialBlob = new TextEncoder().encode("secret");

WinCred.write({
  flags: 0,
  type: CredType.GENERIC,
  targetName,
  comment: "Native Credential Manager example",
  lastWritten: 0n,
  credentialBlobSize: credentialBlob.length,
  credentialBlob,
  persist: CredPersist.LOCAL_MACHINE,
  attributeCount: 0,
  targetAlias: "",
  userName: "token",
}, CredWriteFlags.NONE);

const credential = WinCred.read(targetName, CredType.GENERIC);
console.log(credential?.userName);
console.log(new TextDecoder().decode(credential?.credentialBlob));

const credentials = WinCred.enumerate("myapp/*", CredEnumerateFlags.NONE);
console.log(credentials.map(({ targetName }) => targetName));

WinCred.delete(targetName, CredType.GENERIC);
```

`WinCred.write`, `WinCred.read`, `WinCred.delete`, and `WinCred.enumerate` throw when the OS or runtime FFI backend is unavailable.

## Runtime Support

Node.js uses native FFI on Node 26 or later with `--experimental-ffi`; otherwise install the optional fallback with `npm install koffi`. Bun uses native FFI. Deno requires `--allow-ffi`.

Credential writes require an interactive Windows logon session. OpenSSH sessions can fail with Win32 error `1312` (`ERROR_NO_SUCH_LOGON_SESSION`); validate writes from an interactive RDP or console session.

## License

[MIT License](./LICENSE.md)
