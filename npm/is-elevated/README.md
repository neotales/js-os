# @neotales/is-elevated

## Overview

`@neotales/is-elevated` detects whether the current process is running with elevated privileges.
On Unix-like systems this typically means root. On Windows it checks whether the current token is elevated.

![logo](https://raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png)

[![JSR](https://jsr.io/badges/@neotales/is-elevated)](https://jsr.io/@neotales/is-elevated)
[![npm version](https://badge.fury.io/js/@neostd%2Fis-elevated.svg)](https://badge.fury.io/js/@neostd%2Fis-elevated)
[![GitHub version](https://badge.fury.io/gh/neostd%2Fjs.svg)](https://badge.fury.io/gh/neostd%2Fjs)

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

| Export       | Subpath                 | Description                                      |
| ------------ | ----------------------- | ------------------------------------------------ |
| `isElevated` | `@neotales/is-elevated` | Detects whether the current process is elevated. |

```typescript
import { isElevated } from "@neotales/is-elevated";

const elevated = isElevated();

if (elevated) {
  console.log("ready for privileged work");
}
```

## Elevation Detection

On Unix-like systems, elevation means an effective user ID of `0`. Node and Bun check `process.geteuid()` when available, then fall back to `process.getuid()`. The result is cached so repeated checks do not need to query the runtime again.

On Windows, the package opens the current process token and calls `GetTokenInformation` with `TokenElevation`. Node uses native `node:ffi` when available and otherwise the optional `koffi` dependency; Bun and Deno use their native FFI implementations. The FFI implementations are loaded only on Windows.

This intentionally does not use `Shell32.IsUserAnAdmin`. That API checks administrator-group membership rather than the current process token, so it can disagree under User Account Control when an administrator account is running with a filtered, non-elevated token. `TokenElevation` reports the process state directly.

## Runtime Notes

Node.js uses either `node:ffi` or the optional `koffi` peer dependency when available. Bun and Deno use their native FFI support.
Tests for OS-specific behavior are skipped when the current runtime does not support the required platform semantics.

## License

[MIT License](./LICENSE.md)

## Runtime Support

This npm package supports Node, Bun, and Deno. Deno users can import it with `npm:@neotales/is-elevated`; use the JSR package for the Deno-only implementation.
