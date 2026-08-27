export * from './mermaid/index';

import { sanitizeMermaidCode as sanitizeNew, quickFixMermaid as quickFixNew } from './mermaid/index';

export function sanitizeMermaidCode(rawChartCode: string): string {
    return sanitizeNew(rawChartCode);
}

export function quickFixMermaid(code: string, errorMessage: string): string | null {
    return quickFixNew(code, errorMessage);
}

export function preValidateMermaid(code: string): string[] {
    if (!code || !code.trim()) return ['Empty diagram code'];
    return [];
}

export function stripStylingForRecovery(code: string): string {
    return sanitizeNew(code);
}
