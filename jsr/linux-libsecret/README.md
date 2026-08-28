# @neotales/linux-libsecret

Linux secret storage backed by the freedesktop.org Secret Service through `libsecret`.

## Installation

```sh
deno add jsr:@neotales/linux-libsecret
npx jsr add @neotales/linux-libsecret
```

## Usage

```ts
import { getSecretString, isAvailable, saveSecret } from "@neotales/linux-libsecret";

if (isAvailable()) {
  saveSecret("my-service", "my-account", "my-secret");
  console.log(getSecretString("my-service", "my-account"));
}
```

The root module provides a uniform vault API:

| Export            | Description                                        |
| ----------------- | -------------------------------------------------- |
| `isAvailable`     | Reports whether a native libsecret backend loaded. |
| `getSecret`       | Reads raw secret bytes.                            |
| `getSecretString` | Reads a UTF-8 secret string.                       |
| `saveSecret`      | Creates or updates a secret from text or bytes.    |
| `removeSecret`    | Deletes a secret.                                  |
| `listSecrets`     | Lists service records with copied secret bytes.    |

## Native FFI

```ts
import {
  Gio,
  isGioAvailable,
  isLinuxKeyringAvailable,
  Libsecret,
  LibsecretErrorHandle,
} from "@neotales/linux-libsecret/ffi";

if (isLinuxKeyringAvailable()) {
  const schema = Libsecret.secretSchemaNew(
    "org.freedesktop.Secret.Generic",
    0,
    "service",
    0,
    "account",
    0,
    null,
  );
  if (schema !== null) {
    const errorOut = new LibsecretErrorHandle();
    const password = Libsecret.secretPasswordLookupSync(
      schema,
      null,
      errorOut,
      "service",
      "my-service",
      "account",
      "my-account",
      null,
    );
    if (errorOut.error() !== null) throw errorOut.error();
    if (password !== null) Libsecret.secretPasswordFree(password);
  }
}
```

`Libsecret` exposes camelCase wrappers for libsecret's native functions. `GError**` is represented by a caller-created `LibsecretErrorHandle`, which is bound to the runtime on its first call, reset when reused there, and read with `error()`. Schemas and returned passwords are runtime-bound handles; password text is read with `password.text()` and the handle must be released with `secretPasswordFree`.

GIO cancellation is optional. Check `isGioAvailable()` before calling `Gio.cancellableNew()`, `Gio.cancellableCancel()`, or `Gio.cancellableRelease()`; those methods throw when GIO is unavailable. A `GCancellableHandle` is runtime-bound, can be passed to a synchronous password call, and must be released exactly once.

## Runtime Notes

This package is Linux-specific. On other platforms `isAvailable()` returns `false`; root reads, removals, and lists return safe defaults, while `/ffi` calls throw when invoked.

- Deno requires `--allow-ffi`, for example: `deno run --allow-ffi app.ts`.
- Node.js requires `--experimental-ffi`, for example: `node --experimental-ffi app.ts`.
- Bun uses its built-in FFI and needs no additional flag.
- `libsecret-1.so.0`, `libglib-2.0.so.0`, and `libgobject-2.0.so.0` are required for the normal backend. `libgio-2.0.so.0` may be absent unless you explicitly use `GCancellable` operations through `Gio`.
- Install your distribution's libsecret runtime or development package as appropriate; package names vary by distribution. Also run a Secret Service implementation. `libsecret` is the client library, not a Secret Service implementation.

## License

[MIT License](./LICENSE.md)
