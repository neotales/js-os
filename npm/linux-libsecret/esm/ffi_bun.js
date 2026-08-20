import { dlopen, ptr, read } from "bun:ffi";
const ATTR_STRING = 0;
const libsecret = dlopen("libsecret-1.so.0", {
    secret_schema_new: {
        args: ["ptr", "u32", "ptr", "u32", "ptr", "u32", "ptr"],
        returns: "ptr",
    },
    secret_password_lookup_sync: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "ptr",
    },
    secret_password_store_sync: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    secret_password_clear_sync: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    secret_password_search_sync: {
        args: ["ptr", "u32", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "ptr",
    },
    secret_password_searchv_sync: {
        args: ["ptr", "ptr", "u32", "ptr", "ptr"],
        returns: "ptr",
    },
    secret_retrievable_get_attributes: {
        args: ["ptr"],
        returns: "ptr",
    },
    secret_retrievable_retrieve_secret_sync: {
        args: ["ptr", "ptr", "ptr"],
        returns: "ptr",
    },
    secret_value_get: {
        args: ["ptr", "ptr"],
        returns: "ptr",
    },
    secret_value_unref: {
        args: ["ptr"],
        returns: "void",
    },
    secret_password_free: {
        args: ["ptr"],
        returns: "void",
    },
});
const glib = dlopen("libglib-2.0.so.0", {
    g_hash_table_new: {
        args: ["ptr", "ptr"],
        returns: "ptr",
    },
    g_hash_table_insert: {
        args: ["ptr", "ptr", "ptr"],
        returns: "i32",
    },
    g_error_free: {
        args: ["ptr"],
        returns: "void",
    },
    g_hash_table_lookup: {
        args: ["ptr", "ptr"],
        returns: "ptr",
    },
    g_hash_table_unref: {
        args: ["ptr"],
        returns: "void",
    },
    g_list_free: {
        args: ["ptr"],
        returns: "void",
    },
});
const enc = new TextEncoder();
const dec = new TextDecoder();
let schemaPtr = null;
const refs = [];
function cstr(value) {
    const b = enc.encode(value);
    const out = new Uint8Array(b.length + 1);
    out.set(b);
    return out;
}
function keep(value) {
    refs.push(value);
    return ptr(value);
}
function readErrorMessage(errorPtr) {
    const msgPtr = Number(read.ptr(errorPtr, 8));
    if (!msgPtr)
        return "Unknown libsecret error";
    return readCString(msgPtr);
}
function readCString(valuePtr) {
    const bytes = [];
    for (let i = 0;; i++) {
        const v = read.u8(valuePtr, i);
        if (v === 0)
            break;
        bytes.push(v);
    }
    return dec.decode(new Uint8Array(bytes)) || "Unknown libsecret error";
}
function throwIfError(errorOut) {
    const errPtr = Number(new DataView(errorOut.buffer).getBigUint64(0, true));
    if (!errPtr)
        return;
    const msg = readErrorMessage(errPtr);
    glib.symbols.g_error_free(errPtr);
    throw new Error(msg);
}
function getSchema() {
    if (schemaPtr !== null)
        return schemaPtr;
    schemaPtr = Number(libsecret.symbols.secret_schema_new(keep(cstr("org.freedesktop.Secret.Generic")), 0, keep(cstr("service")), ATTR_STRING, keep(cstr("account")), ATTR_STRING, null));
    return schemaPtr;
}
export const backend = {
    getSecretBytes(service, account) {
        const errorOut = new Uint8Array(8);
        const p = Number(libsecret.symbols.secret_password_lookup_sync(getSchema(), null, ptr(errorOut), ptr(cstr("service")), ptr(cstr(service)), ptr(cstr("account")), ptr(cstr(account)), null));
        throwIfError(errorOut);
        if (!p)
            return null;
        try {
            const bytes = [];
            for (let i = 0;; i++) {
                const v = read.u8(p, i);
                if (v === 0)
                    break;
                bytes.push(v);
            }
            return new Uint8Array(bytes);
        }
        finally {
            libsecret.symbols.secret_password_free(p);
        }
    },
    setSecretBytes(service, account, secret) {
        const errorOut = new Uint8Array(8);
        const ok = libsecret.symbols.secret_password_store_sync(getSchema(), ptr(cstr("default")), ptr(cstr(`${service}/${account}`)), ptr(cstr(dec.decode(secret))), null, ptr(errorOut), ptr(cstr("service")), ptr(cstr(service)), ptr(cstr("account")), ptr(cstr(account)), null);
        throwIfError(errorOut);
        if (!ok)
            throw new Error("Failed to store secret");
    },
    deleteSecret(service, account) {
        const errorOut = new Uint8Array(8);
        const ok = libsecret.symbols.secret_password_clear_sync(getSchema(), null, ptr(errorOut), ptr(cstr("service")), ptr(cstr(service)), ptr(cstr("account")), ptr(cstr(account)), null);
        throwIfError(errorOut);
        return !!ok;
    },
    list(_serviceName) {
        throw new Error("linux-keyring list is not supported on Bun because Bun FFI crashes when reading libsecret retrievable results");
    },
};
