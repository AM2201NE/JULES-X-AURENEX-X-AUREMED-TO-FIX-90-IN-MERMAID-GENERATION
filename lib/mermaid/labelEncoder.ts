import { protectMath } from './math';

export function encodeMermaidLabel(text: string): string {
    if (!text) return '';

    const mathProtected = protectMath(text);
    let escaped = mathProtected.code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    return mathProtected.restore(escaped);
}
