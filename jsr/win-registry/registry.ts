/**
 * Registry key implementation and facade.
 *
 * @module
 */

import type { Key, KeyInfo, RegistryBackend } from "./types.ts";
import {
  HKEY_CLASSES_ROOT,
  HKEY_CURRENT_CONFIG,
  HKEY_CURRENT_USER,
  HKEY_LOCAL_MACHINE,
  HKEY_PERFORMANCE_DATA,
  HKEY_USERS,
  multiStringToWide,
  parseRegistryPath,
  Rights,
  stringToWide,
  Types,
  wideToMultiString,
  wideToString,
} from "./types.ts";

export class RegistryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RegistryError";
  }

  static throwUnsupported(): never {
    throw new RegistryError("Registry is not supported on this platform or runtime.");
  }
}

let isSupported = false;

let driver: RegistryBackend = {
  openKey(_hkey: bigint, _subKey: string, _access: number): bigint {
    RegistryError.throwUnsupported();
  },
  createKey(_hkey: bigint, _subKey: string, _access: number): { handle: bigint; created: boolean } {
    RegistryError.throwUnsupported();
  },
  deleteKey(_hkey: bigint, _subKey: string): number {
    RegistryError.throwUnsupported();
  },
  deleteValue(_hkey: bigint, _value: string): number {
    RegistryError.throwUnsupported();
  },
  enumKeyNames(_hkey: bigint, _index: number, _bufSize: number): string | null {
    RegistryError.throwUnsupported();
  },
  enumValueNames(_hkey: bigint, _index: number, _bufSize: number): string | null {
    RegistryError.throwUnsupported();
  },
  queryValue(_hkey: bigint, _value: string): { data: Uint8Array; type: number } | null {
    RegistryError.throwUnsupported();
  },
  queryInfoKey(_hkey: bigint): {
    subKeyCount: number;
    maxSubKeyLength: number;
    valueCount: number;
    maxValueNameLength: number;
    maxValueLength: number;
    lastWriteTime: number;
  } {
    RegistryError.throwUnsupported();
  },
  closeKey(_hkey: bigint): void {
    return;
  },
  setValue(_hkey: bigint, _value: string, _type: number, _data: Uint8Array): void {
    RegistryError.throwUnsupported();
  },
};

if (Deno.build.os === "windows") {
  try {
    driver = (await import("./ffi_deno.ts")).backend;
    isSupported = true;
  } catch {
    // Deno requires --allow-ffi and a loadable Windows backend.
  }
}

/**
 * Returns whether a Windows Registry backend is available in the current
 * runtime.
 *
 * @returns `true` when registry operations are supported on the current runtime.
 * @example
 * if (isRegistryAvailable()) {
 *   using key = Registry.openKey("HKCU\\Software");
 * }
 */
export function isRegistryAvailable(): boolean {
  return isSupported;
}

/**
 * Open registry key handle with convenience helpers for reading and writing values. Use `using` or `close()` to release opened and created keys.
 *
 * @example
 * using key = Registry.openKey("HKCU\\Software");
 * console.log(key.getSubKeyNames());
 */
export class RegistryKey implements Key {
  #handle: bigint;
  #path: string;
  #created: boolean;
  #closed = false;

  constructor(handle: bigint, path: string, created = false) {
    this.#handle = handle;
    this.#path = path;
    this.#created = created;
  }

  get path(): string {
    return this.#path;
  }

  get created(): boolean {
    return this.#created;
  }

  isNull(): boolean {
    return this.#handle === 0n;
  }

  unwrap(): bigint {
    return this.#handle;
  }

  close(): void {
    if (!this.#closed && !this.#isPredefined()) {
      driver.closeKey(this.#handle);
      this.#closed = true;
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }

  #isPredefined(): boolean {
    return (
      this.#handle === HKEY_CLASSES_ROOT ||
      this.#handle === HKEY_CURRENT_USER ||
      this.#handle === HKEY_LOCAL_MACHINE ||
      this.#handle === HKEY_USERS ||
      this.#handle === HKEY_PERFORMANCE_DATA ||
      this.#handle === HKEY_CURRENT_CONFIG
    );
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw new RegistryError("Registry key has been closed.");
    }
  }

  openKey(path: string, access: number = Rights.READ): Key {
    this.#ensureOpen();
    const handle = driver.openKey(this.#handle, path, access);
    return new RegistryKey(handle, this.#path ? `${this.#path}\\${path}` : path);
  }

  createKey(path: string, access: number = Rights.ALL_ACCESS): Key {
    this.#ensureOpen();
    const result = driver.createKey(this.#handle, path, access);
    return new RegistryKey(
      result.handle,
      this.#path ? `${this.#path}\\${path}` : path,
      result.created,
    );
  }

  deleteKey(name: string): boolean {
    this.#ensureOpen();
    return driver.deleteKey(this.#handle, name) === 0;
  }

  deleteValue(name: string): boolean {
    this.#ensureOpen();
    return driver.deleteValue(this.#handle, name) === 0;
  }

  stat(): KeyInfo {
    this.#ensureOpen();
    const info = driver.queryInfoKey(this.#handle);
    return {
      subKeyCount: info.subKeyCount,
      maxSubKeyLength: info.maxSubKeyLength,
      valueCount: info.valueCount,
      maxValueNameLength: info.maxValueNameLength,
      maxValueLength: info.maxValueLength,
      lastWriteTime: info.lastWriteTime || undefined,
    };
  }

  getSubKeyNames(n?: number): string[] {
    this.#ensureOpen();
    const info = driver.queryInfoKey(this.#handle);
    const names: string[] = [];
    const limit = n ?? info.subKeyCount;
    const bufSize = info.maxSubKeyLength;

    for (let i = 0; i < limit; i++) {
      const name = driver.enumKeyNames(this.#handle, i, bufSize);
      if (name === null) break;
      names.push(name);
    }

    return names;
  }

  getValueNames(n?: number): string[] {
    this.#ensureOpen();
    const info = driver.queryInfoKey(this.#handle);
    const names: string[] = [];
    const limit = n ?? info.valueCount;
    const bufSize = info.maxValueNameLength;

    for (let i = 0; i < limit; i++) {
      const name = driver.enumValueNames(this.#handle, i, bufSize);
      if (name === null) break;
      names.push(name);
    }

    return names;
  }

  getValue(name: string, buffer?: Uint8Array): { data: Uint8Array; type: number } {
    this.#ensureOpen();
    const result = driver.queryValue(this.#handle, name);
    if (!result) {
      throw new RegistryError(`Registry value "${name}" not found under "${this.#path}".`);
    }

    if (buffer && buffer.length >= result.data.length) {
      buffer.set(result.data);
      return { data: buffer.subarray(0, result.data.length), type: result.type };
    }

    return result;
  }

  getString(name: string): string {
    const { data, type } = this.getValue(name);
    if (type !== Types.SZ && type !== Types.EXPAND_SZ) {
      throw new RegistryError(`Expected SZ or EXPAND_SZ but got type ${type} for "${name}".`);
    }
    return wideToString(data);
  }

  getMultiString(name: string): string[] {
    const { data, type } = this.getValue(name);
    if (type !== Types.MULTI_SZ) {
      throw new RegistryError(`Expected MULTI_SZ but got type ${type} for "${name}".`);
    }
    return wideToMultiString(data);
  }

  getInt32(name: string): number {
    const { data, type } = this.getValue(name);
    if (type !== Types.DWORD && type !== Types.DWORD_BIG_ENDIAN) {
      throw new RegistryError(`Expected DWORD but got type ${type} for "${name}".`);
    }
    if (type === Types.DWORD_BIG_ENDIAN) {
      return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
    }
    return data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
  }

  getInt64(name: string): bigint {
    const { data, type } = this.getValue(name);
    if (type !== Types.QWORD) {
      throw new Error(`Expected QWORD but got type ${type} for "${name}".`);
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return view.getBigInt64(0, true);
  }

  getBinary(name: string): Uint8Array {
    const { data, type } = this.getValue(name);
    if (type !== Types.BINARY) {
      throw new RegistryError(`Expected BINARY but got type ${type} for "${name}".`);
    }
    return data;
  }

  setValue(name: string, data: Uint8Array, type: number): void {
    this.#ensureOpen();
    driver.setValue(this.#handle, name, type, data);
  }

  setString(name: string, value: string): void {
    this.setValue(name, stringToWide(value), Types.SZ);
  }

  setExpandString(name: string, value: string): void {
    this.setValue(name, stringToWide(value), Types.EXPAND_SZ);
  }

  setMultiString(name: string, value: string[]): void {
    this.setValue(name, multiStringToWide(value), Types.MULTI_SZ);
  }

  setBinary(name: string, data: Uint8Array): void {
    this.setValue(name, data, Types.BINARY);
  }

  setInt32(name: string, value: number): void {
    const buf = new Uint8Array(4);
    buf[0] = value & 0xff;
    buf[1] = (value >> 8) & 0xff;
    buf[2] = (value >> 16) & 0xff;
    buf[3] = (value >> 24) & 0xff;
    this.setValue(name, buf, Types.DWORD);
  }

  setInt64(name: string, value: bigint): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigInt64(0, value, true);
    this.setValue(name, buf, Types.QWORD);
  }
}

function predefinedKey(hkey: bigint, name: string): Key {
  return new RegistryKey(hkey, name);
}

/**
 * Opens an existing registry key.
 *
 * @param path Registry path to open.
 * @param access Requested access rights.
 * @returns The opened registry key.
 */
function openRegistryKey(path: string, access?: number): Key;
/**
 * Opens a child key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 * @param access Requested access rights.
 * @returns The opened registry key.
 */
function openRegistryKey(key: Key, path: string, access?: number): Key;
function openRegistryKey(arg1: Key | string, arg2?: string | number, arg3?: number): Key {
  if (typeof arg1 === "string") {
    const { hkey, subKey } = parseRegistryPath(arg1);
    const access = (arg2 as number | undefined) ?? Rights.READ;
    return new RegistryKey(driver.openKey(hkey, subKey, access), arg1);
  }

  return arg1.openKey(arg2 as string, arg3 ?? Rights.READ);
}

/**
 * Creates a registry key if needed and opens it.
 *
 * @param path Registry path to create.
 * @param access Requested access rights.
 * @returns The created or opened registry key.
 */
function createRegistryKey(path: string, access?: number): Key;
/**
 * Creates a child registry key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 * @param access Requested access rights.
 * @returns The created or opened registry key.
 */
function createRegistryKey(key: Key, path: string, access?: number): Key;
function createRegistryKey(arg1: Key | string, arg2?: string | number, arg3?: number): Key {
  if (typeof arg1 === "string") {
    const { hkey, subKey } = parseRegistryPath(arg1);
    const access = (arg2 as number | undefined) ?? Rights.ALL_ACCESS;
    const result = driver.createKey(hkey, subKey, access);
    return new RegistryKey(result.handle, arg1, result.created);
  }

  return arg1.createKey(arg2 as string, arg3 ?? Rights.ALL_ACCESS);
}

/**
 * Deletes a registry key.
 *
 * @param path Registry path to delete.
 */
function deleteRegistryKey(path: string): void;
/**
 * Deletes a child key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 */
function deleteRegistryKey(key: Key, path: string): void;
function deleteRegistryKey(arg1: Key | string, arg2?: string): void {
  if (typeof arg1 === "string") {
    const { hkey, subKey } = parseRegistryPath(arg1);
    const status = Number(driver.deleteKey(hkey, subKey));
    if (status !== 0) {
      throw new RegistryError(`Failed to delete registry key "${arg1}" with error code ${status}`);
    }
    return;
  }

  const parent = arg1;
  const path = arg2 as string;
  if (!parent.deleteKey(path)) {
    throw new RegistryError(`Failed to delete registry key "${path}"`);
  }
}

type RegistryApi = {
  readonly HKCR: Key;
  readonly HKCU: Key;
  readonly HKLM: Key;
  readonly HKU: Key;
  readonly HKPD: Key;
  readonly HKCC: Key;
  openKey: typeof openRegistryKey;
  createKey: typeof createRegistryKey;
  deleteKey: typeof deleteRegistryKey;
};

/** Windows Registry API facade. */
export const Registry: RegistryApi = {
  /** Returns the predefined `HKEY_CLASSES_ROOT` key. */
  get HKCR(): Key {
    return predefinedKey(HKEY_CLASSES_ROOT, "HKEY_CLASSES_ROOT");
  },
  /** Returns the predefined `HKEY_CURRENT_USER` key. */
  get HKCU(): Key {
    return predefinedKey(HKEY_CURRENT_USER, "HKEY_CURRENT_USER");
  },
  /** Returns the predefined `HKEY_LOCAL_MACHINE` key. */
  get HKLM(): Key {
    return predefinedKey(HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE");
  },
  /** Returns the predefined `HKEY_USERS` key. */
  get HKU(): Key {
    return predefinedKey(HKEY_USERS, "HKEY_USERS");
  },
  /** Returns the predefined `HKEY_PERFORMANCE_DATA` key. */
  get HKPD(): Key {
    return predefinedKey(HKEY_PERFORMANCE_DATA, "HKEY_PERFORMANCE_DATA");
  },
  /** Returns the predefined `HKEY_CURRENT_CONFIG` key. */
  get HKCC(): Key {
    return predefinedKey(HKEY_CURRENT_CONFIG, "HKEY_CURRENT_CONFIG");
  },
  openKey: openRegistryKey,
  createKey: createRegistryKey,
  deleteKey: deleteRegistryKey,
} as const;
