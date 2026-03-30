"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProvider = detectProvider;
/** Detect the provider from a model name prefix. */
function detectProvider(model) {
    if (/^claude/i.test(model))
        return "anthropic";
    if (/^gpt|^o\d|^chatgpt/i.test(model))
        return "openai";
    if (/^gemini/i.test(model))
        return "google";
    throw new Error(`Cannot detect provider from model name "${model}". ` +
        `Expected a name starting with claude-, gpt-, o1/o3/o4, or gemini-.`);
}
