/**
 * Registry key implementation and facade.
 *
 * @module
 */
import { HKEY_CLASSES_ROOT, HKEY_CURRENT_CONFIG, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, HKEY_PERFORMANCE_DATA, HKEY_USERS, multiStringToWide, parseRegistryPath, Rights, stringToWide, Types, wideToMultiString, wideToString, } from "./types.js";
const globals = globalThis;
/**
 * Error raised when registry operations are unavailable or fail.
 *
 * @example
 * if (!isRegistryAvailable()) throw new RegistryError("Windows Registry is unavailable");
 */
export class RegistryError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = "RegistryError";
    }
    static throwUnsupported() {
        throw new RegistryError("Registry is not supported on this platform or runtime.");
    }
}
let isSupported = false;
let driver = {
    openKey(_hkey, _subKey, _access) {
        RegistryError.throwUnsupported();
    },
    createKey(_hkey, _subKey, _access) {
        RegistryError.throwUnsupported();
    },
    deleteKey(_hkey, _subKey) {
        RegistryError.throwUnsupported();
    },
    deleteValue(_hkey, _value) {
        RegistryError.throwUnsupported();
    },
    enumKeyNames(_hkey, _index, _bufSize) {
        RegistryError.throwUnsupported();
    },
    enumValueNames(_hkey, _index, _bufSize) {
        RegistryError.throwUnsupported();
    },
    queryValue(_hkey, _value) {
        RegistryError.throwUnsupported();
    },
    queryInfoKey(_hkey) {
        RegistryError.throwUnsupported();
    },
    closeKey(_hkey) {
        return;
    },
    setValue(_hkey, _value, _type, _data) {
        RegistryError.throwUnsupported();
    },
};
if (globals.process?.platform === "win32") {
    const { createRequire } = globals.process.getBuiltinModule("node:module");
    const require = createRequire(import.meta.url);
    if (typeof globals.Deno !== "undefined") {
        try {
            driver = require("./ffi_deno.js").backend;
            isSupported = true;
        }
        catch (error) {
            if (process.env.DEBUG === "true")
                console.debug(error);
        }
    }
    else if (typeof globals.Bun !== "undefined") {
        try {
            driver = require("./ffi_bun.js").backend;
            isSupported = true;
        }
        catch (error) {
            if (process.env.DEBUG === "true")
                console.debug(error);
        }
    }
    else {
        try {
            if (process.getBuiltinModule("node:ffi")) {
                driver = require("./ffi_node.js").backend;
                isSupported = true;
            }
            else {
                driver = require("./ffi_koffi.js").backend;
                isSupported = true;
            }
        }
        catch (error) {
            if (process.env.DEBUG === "true") {
                console.debug(error);
            }
        }
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
export function isRegistryAvailable() {
    return isSupported;
}
/**
 * Open registry key handle with convenience helpers for reading and writing values. Use `using` or `close()` to release opened and created keys.
 *
 * @example
 * using key = Registry.openKey("HKCU\\Software");
 * console.log(key.getSubKeyNames());
 */
export class RegistryKey {
    #handle;
    #path;
    #created;
    #closed = false;
    constructor(handle, path, created = false) {
        this.#handle = handle;
        this.#path = path;
        this.#created = created;
    }
    get path() {
        return this.#path;
    }
    get created() {
        return this.#created;
    }
    isNull() {
        return this.#handle === 0n;
    }
    unwrap() {
        return this.#handle;
    }
    close() {
        if (!this.#closed && !this.#isPredefined()) {
            driver.closeKey(this.#handle);
            this.#closed = true;
        }
    }
    [Symbol.dispose]() {
        this.close();
    }
    #isPredefined() {
        return (this.#handle === HKEY_CLASSES_ROOT ||
            this.#handle === HKEY_CURRENT_USER ||
            this.#handle === HKEY_LOCAL_MACHINE ||
            this.#handle === HKEY_USERS ||
            this.#handle === HKEY_PERFORMANCE_DATA ||
            this.#handle === HKEY_CURRENT_CONFIG);
    }
    #ensureOpen() {
        if (this.#closed) {
            throw new RegistryError("Registry key has been closed.");
        }
    }
    openKey(path, access = Rights.READ) {
        this.#ensureOpen();
        const handle = driver.openKey(this.#handle, path, access);
        return new RegistryKey(handle, this.#path ? `${this.#path}\\${path}` : path);
    }
    createKey(path, access = Rights.ALL_ACCESS) {
        this.#ensureOpen();
        const result = driver.createKey(this.#handle, path, access);
        return new RegistryKey(result.handle, this.#path ? `${this.#path}\\${path}` : path, result.created);
    }
    deleteKey(name) {
        this.#ensureOpen();
        return driver.deleteKey(this.#handle, name) === 0;
    }
    deleteValue(name) {
        this.#ensureOpen();
        return driver.deleteValue(this.#handle, name) === 0;
    }
    stat() {
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
    getSubKeyNames(n) {
        this.#ensureOpen();
        const info = driver.queryInfoKey(this.#handle);
        const names = [];
        const limit = n ?? info.subKeyCount;
        const bufSize = info.maxSubKeyLength;
        for (let i = 0; i < limit; i++) {
            const name = driver.enumKeyNames(this.#handle, i, bufSize);
            if (name === null)
                break;
            names.push(name);
        }
        return names;
    }
    getValueNames(n) {
        this.#ensureOpen();
        const info = driver.queryInfoKey(this.#handle);
        const names = [];
        const limit = n ?? info.valueCount;
        const bufSize = info.maxValueNameLength;
        for (let i = 0; i < limit; i++) {
            const name = driver.enumValueNames(this.#handle, i, bufSize);
            if (name === null)
                break;
            names.push(name);
        }
        return names;
    }
    getValue(name, buffer) {
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
    getString(name) {
        const { data, type } = this.getValue(name);
        if (type !== Types.SZ && type !== Types.EXPAND_SZ) {
            throw new RegistryError(`Expected SZ or EXPAND_SZ but got type ${type} for "${name}".`);
        }
        return wideToString(data);
    }
    getMultiString(name) {
        const { data, type } = this.getValue(name);
        if (type !== Types.MULTI_SZ) {
            throw new RegistryError(`Expected MULTI_SZ but got type ${type} for "${name}".`);
        }
        return wideToMultiString(data);
    }
    getInt32(name) {
        const { data, type } = this.getValue(name);
        if (type !== Types.DWORD && type !== Types.DWORD_BIG_ENDIAN) {
            throw new RegistryError(`Expected DWORD but got type ${type} for "${name}".`);
        }
        if (type === Types.DWORD_BIG_ENDIAN) {
            return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
        }
        return data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    }
    getInt64(name) {
        const { data, type } = this.getValue(name);
        if (type !== Types.QWORD) {
            throw new Error(`Expected QWORD but got type ${type} for "${name}".`);
        }
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        return view.getBigInt64(0, true);
    }
    getBinary(name) {
        const { data, type } = this.getValue(name);
        if (type !== Types.BINARY) {
            throw new RegistryError(`Expected BINARY but got type ${type} for "${name}".`);
        }
        return data;
    }
    setValue(name, data, type) {
        this.#ensureOpen();
        driver.setValue(this.#handle, name, type, data);
    }
    setString(name, value) {
        this.setValue(name, stringToWide(value), Types.SZ);
    }
    setExpandString(name, value) {
        this.setValue(name, stringToWide(value), Types.EXPAND_SZ);
    }
    setMultiString(name, value) {
        this.setValue(name, multiStringToWide(value), Types.MULTI_SZ);
    }
    setBinary(name, data) {
        this.setValue(name, data, Types.BINARY);
    }
    setInt32(name, value) {
        const buf = new Uint8Array(4);
        buf[0] = value & 0xff;
        buf[1] = (value >> 8) & 0xff;
        buf[2] = (value >> 16) & 0xff;
        buf[3] = (value >> 24) & 0xff;
        this.setValue(name, buf, Types.DWORD);
    }
    setInt64(name, value) {
        const buf = new Uint8Array(8);
        const view = new DataView(buf.buffer);
        view.setBigInt64(0, value, true);
        this.setValue(name, buf, Types.QWORD);
    }
}
function predefinedKey(hkey, name) {
    return new RegistryKey(hkey, name);
}
function openRegistryKey(arg1, arg2, arg3) {
    if (typeof arg1 === "string") {
        const { hkey, subKey } = parseRegistryPath(arg1);
        const access = arg2 ?? Rights.READ;
        return new RegistryKey(driver.openKey(hkey, subKey, access), arg1);
    }
    return arg1.openKey(arg2, arg3 ?? Rights.READ);
}
function createRegistryKey(arg1, arg2, arg3) {
    if (typeof arg1 === "string") {
        const { hkey, subKey } = parseRegistryPath(arg1);
        const access = arg2 ?? Rights.ALL_ACCESS;
        const result = driver.createKey(hkey, subKey, access);
        return new RegistryKey(result.handle, arg1, result.created);
    }
    return arg1.createKey(arg2, arg3 ?? Rights.ALL_ACCESS);
}
function deleteRegistryKey(arg1, arg2) {
    if (typeof arg1 === "string") {
        const { hkey, subKey } = parseRegistryPath(arg1);
        const status = Number(driver.deleteKey(hkey, subKey));
        if (status !== 0) {
            throw new RegistryError(`Failed to delete registry key "${arg1}" with error code ${status}`);
        }
        return;
    }
    const parent = arg1;
    const path = arg2;
    if (!parent.deleteKey(path)) {
        throw new RegistryError(`Failed to delete registry key "${path}"`);
    }
}
/** Windows Registry API facade. */
export const Registry = {
    /** Returns the predefined `HKEY_CLASSES_ROOT` key. */
    get HKCR() {
        return predefinedKey(HKEY_CLASSES_ROOT, "HKEY_CLASSES_ROOT");
    },
    /** Returns the predefined `HKEY_CURRENT_USER` key. */
    get HKCU() {
        return predefinedKey(HKEY_CURRENT_USER, "HKEY_CURRENT_USER");
    },
    /** Returns the predefined `HKEY_LOCAL_MACHINE` key. */
    get HKLM() {
        return predefinedKey(HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE");
    },
    /** Returns the predefined `HKEY_USERS` key. */
    get HKU() {
        return predefinedKey(HKEY_USERS, "HKEY_USERS");
    },
    /** Returns the predefined `HKEY_PERFORMANCE_DATA` key. */
    get HKPD() {
        return predefinedKey(HKEY_PERFORMANCE_DATA, "HKEY_PERFORMANCE_DATA");
    },
    /** Returns the predefined `HKEY_CURRENT_CONFIG` key. */
    get HKCC() {
        return predefinedKey(HKEY_CURRENT_CONFIG, "HKEY_CURRENT_CONFIG");
    },
    openKey: openRegistryKey,
    createKey: createRegistryKey,
    deleteKey: deleteRegistryKey,
};
