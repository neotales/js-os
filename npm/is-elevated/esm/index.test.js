import { strictEqual, throws } from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { isElevated, isElevatedAvailable } from "./index.js";
import { evalIsProcessElevated as evalNodeIsProcessElevated } from "./node.js";
test("isElevated returns a boolean", () => {
    if (process.platform === "win32" && !isElevatedAvailable())
        return;
    strictEqual(typeof isElevated(), "boolean");
    strictEqual(typeof isElevated(false), "boolean");
});
test("isElevatedAvailable returns a boolean", () => {
    strictEqual(typeof isElevatedAvailable(), "boolean");
});
test("isElevated caches by default", () => {
    if (process.platform === "win32" && !isElevatedAvailable())
        return;
    strictEqual(isElevated(), isElevated());
});
test("node evaluator returns a boolean", () => {
    strictEqual(typeof evalNodeIsProcessElevated(), "boolean");
    strictEqual(typeof evalNodeIsProcessElevated(false), "boolean");
});
test("node evaluator matches effective uid semantics on unix-like runtimes", { skip: process.platform === "win32" || (!process.geteuid && !process.getuid) }, () => {
    strictEqual(evalNodeIsProcessElevated(false), (process.geteuid?.() ?? process.getuid?.()) === 0);
});
test("isElevated matches effective uid semantics on unix-like runtimes", { skip: process.platform === "win32" || (!process.geteuid && !process.getuid) }, () => {
    strictEqual(isElevated(false), (process.geteuid?.() ?? process.getuid?.()) === 0);
});
test("node evaluator falls back to false when uid is unavailable", { skip: process.platform !== "win32" }, () => {
    strictEqual(evalNodeIsProcessElevated(false), false);
});
test("root helper returns a boolean on Windows-specific runtimes", { skip: process.platform !== "win32" }, () => {
    if (!isElevatedAvailable()) {
        throws(() => isElevated(), /node:ffi nor koffi.*#nodejs-ffi/);
        return;
    }
    strictEqual(typeof isElevated(false), "boolean");
});
