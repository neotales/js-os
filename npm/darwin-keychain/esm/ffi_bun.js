/**
 * darwin-keychain ffi_bun module.
 *
 * @module @neotales/darwin-keychain
 */
import { dlopen, ptr, read } from "bun:ffi";
const sec = dlopen("/System/Library/Frameworks/Security.framework/Security", {
    SecKeychainFindGenericPassword: {
        args: ["ptr", "u32", "ptr", "u32", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    SecKeychainAddGenericPassword: {
        args: ["ptr", "u32", "ptr", "u32", "ptr", "u32", "ptr", "ptr"],
        returns: "i32",
    },
    SecKeychainItemModifyAttributesAndData: {
        args: ["ptr", "ptr", "u32", "ptr"],
        returns: "i32",
    },
    SecKeychainItemDelete: {
        args: ["ptr"],
        returns: "i32",
    },
    SecKeychainItemFreeContent: {
        args: ["ptr", "ptr"],
        returns: "i32",
    },
    SecKeychainSearchCreateFromAttributes: {
        args: ["ptr", "i32", "ptr", "ptr"],
        returns: "i32",
    },
    SecKeychainSearchCopyNext: {
        args: ["ptr", "ptr"],
        returns: "i32",
    },
    SecKeychainItemCopyAttributesAndData: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    SecKeychainItemFreeAttributesAndData: {
        args: ["ptr", "ptr"],
        returns: "i32",
    },
});
const cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", {
    CFRelease: {
        args: ["ptr"],
        returns: "void",
    },
});
const ERR_ITEM_NOT_FOUND = -25300;
const ITEM_CLASS_GENERIC_PASSWORD = 0x67656e70;
const ATTR_SERVICE = 0x73766365;
const ATTR_ACCOUNT = 0x61636374;
const enc = new TextEncoder();
const dec = new TextDecoder();
function cbytes(value) {
    return enc.encode(value);
}
function osCheck(status, message) {
    if (status !== 0)
        throw new Error(`${message} (${status})`);
}
function readPtr(buf) {
    return Number(new DataView(buf.buffer).getBigUint64(0, true));
}
function ptrToBytes(intPtr, len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++)
        out[i] = read.u8(intPtr, i);
    return out;
}
function findRecord(service, account) {
    const serviceBytes = cbytes(service);
    const accountBytes = cbytes(account);
    const pwLenBuf = new Uint8Array(4);
    const pwDataBuf = new Uint8Array(8);
    const itemRefBuf = new Uint8Array(8);
    const status = sec.symbols.SecKeychainFindGenericPassword(null, serviceBytes.length, ptr(serviceBytes), accountBytes.length, ptr(accountBytes), ptr(pwLenBuf), ptr(pwDataBuf), ptr(itemRefBuf));
    if (status === ERR_ITEM_NOT_FOUND)
        return null;
    osCheck(status, "SecKeychainFindGenericPassword failed");
    return {
        dataPtr: readPtr(pwDataBuf),
        itemPtr: readPtr(itemRefBuf),
        passwordLength: new DataView(pwLenBuf.buffer).getUint32(0, true),
    };
}
function releaseFindResult(found) {
    if (!found)
        return;
    if (found.dataPtr)
        sec.symbols.SecKeychainItemFreeContent(null, found.dataPtr);
    if (found.itemPtr)
        cf.symbols.CFRelease(found.itemPtr);
}
function serviceAttributes(service) {
    const serviceBytes = cbytes(service);
    const attribute = new Uint8Array(16);
    const attributeView = new DataView(attribute.buffer);
    attributeView.setUint32(0, ATTR_SERVICE, true);
    attributeView.setUint32(4, serviceBytes.length, true);
    attributeView.setBigUint64(8, BigInt(ptr(serviceBytes)), true);
    const list = new Uint8Array(16);
    const listView = new DataView(list.buffer);
    listView.setUint32(0, 1, true);
    listView.setBigUint64(8, BigInt(ptr(attribute)), true);
    return { serviceBytes, attribute, list };
}
function accountForItem(item) {
    const tag = new Uint8Array(4);
    new DataView(tag.buffer).setUint32(0, ATTR_ACCOUNT, true);
    const format = new Uint8Array(4);
    const info = new Uint8Array(24);
    const infoView = new DataView(info.buffer);
    infoView.setUint32(0, 1, true);
    infoView.setBigUint64(8, BigInt(ptr(tag)), true);
    infoView.setBigUint64(16, BigInt(ptr(format)), true);
    const attributes = new Uint8Array(8);
    const length = new Uint8Array(4);
    const status = sec.symbols.SecKeychainItemCopyAttributesAndData(item, ptr(info), null, ptr(attributes), ptr(length), null);
    if (status !== 0)
        return "";
    const attributeList = readPtr(attributes);
    if (!attributeList)
        return "";
    try {
        if (read.u32(attributeList, 0) === 0)
            return "";
        const attribute = Number(read.ptr(attributeList, 8));
        if (!attribute || read.u32(attribute, 0) !== ATTR_ACCOUNT)
            return "";
        const byteLength = read.u32(attribute, 4);
        const data = Number(read.ptr(attribute, 8));
        if (!data || byteLength === 0)
            return "";
        const account = new Uint8Array(byteLength);
        for (let index = 0; index < byteLength; index++)
            account[index] = read.u8(data, index);
        return dec.decode(account);
    }
    finally {
        sec.symbols.SecKeychainItemFreeAttributesAndData(attributeList, null);
    }
}
export const backend = {
    getSecretBytes(service, account) {
        const found = findRecord(service, account);
        if (!found)
            return null;
        try {
            return ptrToBytes(found.dataPtr, found.passwordLength);
        }
        finally {
            releaseFindResult(found);
        }
    },
    saveSecretBytes(service, account, secret) {
        const found = findRecord(service, account);
        try {
            if (found && found.itemPtr) {
                osCheck(sec.symbols.SecKeychainItemModifyAttributesAndData(found.itemPtr, null, secret.length, ptr(secret)), "SecKeychainItemModifyAttributesAndData failed");
                return;
            }
            const serviceBytes = cbytes(service);
            const accountBytes = cbytes(account);
            const itemOut = new Uint8Array(8);
            osCheck(sec.symbols.SecKeychainAddGenericPassword(null, serviceBytes.length, ptr(serviceBytes), accountBytes.length, ptr(accountBytes), secret.length, ptr(secret), ptr(itemOut)), "SecKeychainAddGenericPassword failed");
            const item = readPtr(itemOut);
            if (item)
                cf.symbols.CFRelease(item);
        }
        finally {
            releaseFindResult(found);
        }
    },
    removeSecret(service, account) {
        const found = findRecord(service, account);
        if (!found)
            return false;
        try {
            osCheck(sec.symbols.SecKeychainItemDelete(found.itemPtr), "SecKeychainItemDelete failed");
            return true;
        }
        finally {
            releaseFindResult(found);
        }
    },
    listSecrets(service) {
        const { serviceBytes: _serviceBytes, attribute: _attribute, list } = serviceAttributes(service);
        const search = new Uint8Array(8);
        const status = sec.symbols.SecKeychainSearchCreateFromAttributes(null, ITEM_CLASS_GENERIC_PASSWORD, ptr(list), ptr(search));
        if (status === ERR_ITEM_NOT_FOUND)
            return [];
        osCheck(status, "SecKeychainSearchCreateFromAttributes failed");
        const searchPointer = readPtr(search);
        if (!searchPointer)
            return [];
        const records = [];
        try {
            while (true) {
                const item = new Uint8Array(8);
                const next = sec.symbols.SecKeychainSearchCopyNext(searchPointer, ptr(item));
                if (next !== 0)
                    break;
                const itemPointer = readPtr(item);
                if (!itemPointer)
                    break;
                try {
                    const account = accountForItem(itemPointer);
                    if (!account)
                        continue;
                    const secret = this.getSecretBytes(service, account);
                    if (secret !== null)
                        records.push({ service, account, secret });
                }
                finally {
                    cf.symbols.CFRelease(itemPointer);
                }
            }
        }
        finally {
            cf.symbols.CFRelease(searchPointer);
        }
        return records;
    },
};
