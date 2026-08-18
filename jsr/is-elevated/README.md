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

On Unix-like systems, elevation means an effective user ID of `0`. The module uses an effective ID when the runtime exposes one and otherwise falls back to `Deno.uid()`. This keeps the result tied to the identity under which the process is actually executing.

On Windows, the module opens the current process token and calls `GetTokenInformation` with `TokenElevation`. The returned `TokenIsElevated` value describes the current process token, which is the relevant answer for an operation that needs administrator privileges.

This intentionally does not use `Shell32.IsUserAnAdmin`. That API is a convenience membership check and can disagree with the current token under User Account Control: an administrator account may be running with a filtered, non-elevated token. Token elevation inspection reports the process state directly.

## Runtime Support

This JSR package supports Deno only. Use `npm:@neotales/is-elevated` when running under Node, Bun, or when a Deno project explicitly needs the cross-runtime npm package.

## License

[MIT License](./LICENSE.md)
