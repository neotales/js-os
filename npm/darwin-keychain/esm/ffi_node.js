/**
 * darwin-keychain ffi_node module.
 *
 * @module @neotales/darwin-keychain
 */
import process from "node:process";
const { createRequire } = process.getBuiltinModule("node:module");
const require = createRequire(import.meta.url ?? "file:///");
const ffi = require("node:ffi");
const sec = ffi.dlopen("/System/Library/Frameworks/Security.framework/Security", {
    SecKeychainFindGenericPassword: {
        arguments: ["pointer", "u32", "pointer", "u32", "pointer", "pointer", "pointer", "pointer"],
        return: "i32",
    },
    SecKeychainAddGenericPassword: {
        arguments: ["pointer", "u32", "pointer", "u32", "pointer", "u32", "pointer", "pointer"],
        return: "i32",
    },
    SecKeychainItemModifyAttributesAndData: {
        arguments: ["pointer", "pointer", "u32", "pointer"],
        return: "i32",
    },
    SecKeychainItemDelete: {
        arguments: ["pointer"],
        return: "i32",
    },
    SecKeychainItemFreeContent: {
        arguments: ["pointer", "pointer"],
        return: "i32",
    },
    SecKeychainSearchCreateFromAttributes: {
        arguments: ["pointer", "i32", "pointer", "pointer"],
        return: "i32",
    },
    SecKeychainSearchCopyNext: {
        arguments: ["pointer", "pointer"],
        return: "i32",
    },
    SecKeychainItemCopyAttributesAndData: {
        arguments: ["pointer", "pointer", "pointer", "pointer", "pointer", "pointer"],
        return: "i32",
    },
    SecKeychainItemFreeAttributesAndData: {
        arguments: ["pointer", "pointer"],
        return: "i32",
    },
});
const cf = ffi.dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", {
    CFRelease: {
        arguments: ["pointer"],
        return: "void",
    },
});
const ERR_ITEM_NOT_FOUND = -25300;
const ITEM_CLASS_GENERIC_PASSWORD = 0x67656e70;
const ATTR_SERVICE = 0x73766365;
const ATTR_ACCOUNT = 0x61636374;
const enc = new TextEncoder();
function cbytes(value) {
    return enc.encode(value);
}
function osCheck(status, message) {
    if (status !== 0) {
        throw new Error(`${message} (${status})`);
    }
}
function readPtr(buf) {
    return new DataView(buf.buffer).getBigUint64(0, true);
}
function ptrToBytes(ptr, length) {
    return new Uint8Array(ffi.toArrayBuffer(ptr, length));
}
function readU32(ptr, offset) {
    return ffi.getUint32(ptr, offset);
}
function readU64(ptr, offset) {
    return ffi.getUint64(ptr, offset);
}
function makeServiceAttrList(service) {
    const serviceBytes = cbytes(service);
    const attrs = new Uint8Array(16);
    const av = new DataView(attrs.buffer);
    av.setUint32(0, ATTR_SERVICE, true);
    av.setUint32(4, serviceBytes.length, true);
    av.setBigUint64(8, ffi.getRawPointer(serviceBytes), true);
    const list = new Uint8Array(16);
    const lv = new DataView(list.buffer);
    lv.setUint32(0, 1, true);
    lv.setBigUint64(8, ffi.getRawPointer(attrs), true);
    return { attrs, list, refs: [serviceBytes] };
}
function findRecord(service, account) {
    const serviceBytes = cbytes(service);
    const accountBytes = cbytes(account);
    const pwLenBuf = new Uint8Array(4);
    const pwDataBuf = new Uint8Array(8);
    const itemRefBuf = new Uint8Array(8);
    const status = sec.functions.SecKeychainFindGenericPassword(null, serviceBytes.length, serviceBytes, accountBytes.length, accountBytes, pwLenBuf, pwDataBuf, itemRefBuf);
    if (status === ERR_ITEM_NOT_FOUND) {
        return null;
    }
    osCheck(status, "SecKeychainFindGenericPassword failed");
    return {
        dataPtr: readPtr(pwDataBuf),
        itemPtr: readPtr(itemRefBuf),
        passwordLength: new DataView(pwLenBuf.buffer).getUint32(0, true),
    };
}
function getAccountAttribute(itemPtr) {
    const tag = new Uint8Array(4);
    const format = new Uint8Array(4);
    new DataView(tag.buffer).setUint32(0, ATTR_ACCOUNT, true);
    const info = new Uint8Array(24);
    const iv = new DataView(info.buffer);
    iv.setUint32(0, 1, true);
    iv.setBigUint64(8, ffi.getRawPointer(tag), true);
    iv.setBigUint64(16, ffi.getRawPointer(format), true);
    const outAttrs = new Uint8Array(8);
    const outLen = new Uint8Array(4);
    const status = sec.functions.SecKeychainItemCopyAttributesAndData(itemPtr, info, null, outAttrs, outLen, null);
    if (status !== 0) {
        return "";
    }
    const attrsPtr = readPtr(outAttrs);
    if (!attrsPtr) {
        return "";
    }
    try {
        const count = readU32(attrsPtr, 0);
        if (count === 0) {
            return "";
        }
        const attrsArrPtr = readU64(attrsPtr, 8);
        const attrTag = readU32(attrsArrPtr, 0);
        if (attrTag !== ATTR_ACCOUNT) {
            return "";
        }
        const len = readU32(attrsArrPtr, 4);
        const dataPtr = readU64(attrsArrPtr, 8);
        if (!dataPtr || len === 0) {
            return "";
        }
        return new TextDecoder().decode(ptrToBytes(dataPtr, len));
    }
    finally {
        sec.functions.SecKeychainItemFreeAttributesAndData(attrsPtr, null);
    }
}
function releaseFindResult(found) {
    if (!found)
        return;
    if (found.dataPtr) {
        sec.functions.SecKeychainItemFreeContent(null, found.dataPtr);
    }
    if (found.itemPtr) {
        cf.functions.CFRelease(found.itemPtr);
    }
}
export const backend = {
    getSecretBytes(service, account) {
        const found = findRecord(service, account);
        if (!found) {
            return null;
        }
        try {
            return ptrToBytes(found.dataPtr, found.passwordLength);
        }
        finally {
            releaseFindResult(found);
        }
    },
    setSecretBytes(service, account, secret) {
        const found = findRecord(service, account);
        try {
            if (found && found.itemPtr) {
                osCheck(sec.functions.SecKeychainItemModifyAttributesAndData(found.itemPtr, null, secret.length, secret), "SecKeychainItemModifyAttributesAndData failed");
                return;
            }
            const serviceBytes = cbytes(service);
            const accountBytes = cbytes(account);
            const itemOut = new Uint8Array(8);
            osCheck(sec.functions.SecKeychainAddGenericPassword(null, serviceBytes.length, serviceBytes, accountBytes.length, accountBytes, secret.length, secret, itemOut), "SecKeychainAddGenericPassword failed");
            const item = readPtr(itemOut);
            if (item)
                cf.functions.CFRelease(item);
        }
        finally {
            releaseFindResult(found);
        }
    },
    deleteSecret(service, account) {
        const found = findRecord(service, account);
        if (!found) {
            return false;
        }
        try {
            osCheck(sec.functions.SecKeychainItemDelete(found.itemPtr), "SecKeychainItemDelete failed");
            return true;
        }
        finally {
            releaseFindResult(found);
        }
    },
    list(service) {
        const { list, refs: _refs } = makeServiceAttrList(service);
        const searchOut = new Uint8Array(8);
        const status = sec.functions.SecKeychainSearchCreateFromAttributes(null, ITEM_CLASS_GENERIC_PASSWORD, list, searchOut);
        if (status === ERR_ITEM_NOT_FOUND) {
            return [];
        }
        osCheck(status, "SecKeychainSearchCreateFromAttributes failed");
        const searchPtr = readPtr(searchOut);
        if (!searchPtr) {
            return [];
        }
        const results = [];
        try {
            while (true) {
                const itemOut = new Uint8Array(8);
                const n = sec.functions.SecKeychainSearchCopyNext(searchPtr, itemOut);
                if (n !== 0)
                    break;
                const itemPtr = readPtr(itemOut);
                if (!itemPtr)
                    break;
                try {
                    const account = getAccountAttribute(itemPtr);
                    if (!account)
                        continue;
                    const secret = this.getSecretBytes(service, account);
                    if (secret === null)
                        continue;
                    results.push({ service, account, secret });
                }
                finally {
                    cf.functions.CFRelease(itemPtr);
                }
            }
        }
        finally {
            cf.functions.CFRelease(searchPtr);
        }
        return results;
    },
};
