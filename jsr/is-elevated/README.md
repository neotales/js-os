# @neotales/is-elevated

## Overview

`@neotales/is-elevated` detects whether the current process is running with elevated privileges.
On Unix-like systems this typically means root. On Windows it checks whether the current token is elevated.

![logo](https://raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neotales/is-elevated)](https://jsr.io/@neotales/is-elevated)
[![npm version](https://badge.fury.io/js/@neotales%2Fis-elevated.svg)](https://badge.fury.io/js/@neotales%2Fis-elevated)
[![GitHub version](https://badge.fury.io/gh/neotales%2Fjs.svg)](https://badge.fury.io/gh/neotales%2Fjs)

## Documentation

Documentation is available on [jsr.io](https://jsr.io/@neotales/is-elevated/doc).

A list of other modules can be found at [github.com/neotales/js-os](https://github.com/neotales/js-os).

## Installation

```bash
# Deno
deno add jsr:@neotales/is-elevated

# npm from jsr
npx jsr add @neotales/is-elevated

# from npmjs.org
npm install @neotales/is-elevated
```

## Usage

```typescript
import { isElevated } from "@neotales/is-elevated";

if (!isElevated()) {
  throw new Error("Run this as admin/root");
}
```

## Exports

| Export                | Subpath                 | Description                                                  |
| --------------------- | ----------------------- | ------------------------------------------------------------ |
| `isElevated`          | `@neotales/is-elevated` | Detects whether the current process is elevated.             |
| `isElevatedAvailable` | `@neotales/is-elevated` | Reports whether elevation detection can run in this runtime. |

```typescript
import { isElevated } from "@neotales/is-elevated";

const elevated = isElevated();

if (elevated) {
  console.log("ready for privileged work");
}
```

## Elevation Detection

On Unix-like systems, elevation means an effective user ID of `0`. The module uses an effective ID when the runtime exposes one and otherwise falls back to `Deno.uid()`. This keeps the result tied to the identity under which the process is actually executing.

On Windows, the module opens the current process token and calls `GetTokenInformation` with `TokenElevation`. The returned `TokenIsElevated` value describes the current process token, which is the relevant answer for an operation that needs administrator privileges.

This intentionally does not use `Shell32.IsUserAnAdmin`. That API is a convenience membership check and can disagree with the current token under User Account Control: an administrator account may be running with a filtered, non-elevated token. Token elevation inspection reports the process state directly.

## Runtime Support

This JSR package supports Deno, Bun, and Node.js on Windows. Call
`isElevatedAvailable()` before relying on Windows elevation detection when the
runtime's FFI configuration may be unknown.

- **Deno**: run with `--allow-ffi`.
- **Bun**: the native `bun:ffi` backend is selected automatically.
- **Node.js**: see [Node.js FFI](#nodejs-ffi).

## Node.js FFI

On Windows, run Node >= 26 with `--experimental-ffi` to enable `node:ffi`.
This JSR package does not import koffi; use the npm package
[`@neotales/is-elevated`](https://www.npmjs.com/package/@neotales/is-elevated)
when a Node.js project needs its koffi fallback. When `node:ffi` is unavailable,
`isElevatedAvailable()` returns `false` and `isElevated()` throws an error that
links to this section.

## License

[MIT License](./LICENSE.md)
