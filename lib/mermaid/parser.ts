import { MermaidParseResult, MermaidDiagnostic } from './types';
import { getMermaid } from './mermaidRuntime';

export async function getMermaidInstance(): Promise<any> {
    return getMermaid();
}

export function normalizeMermaidDiagnostic(error: any): MermaidDiagnostic {
    const message = error?.message || (typeof error === 'string' ? error : 'Unknown syntax error');
    const lineMatch = message.match(/line\s+(\d+)/i) || message.match(/(\d+):(\d+)/);
    const colMatch = message.match(/column\s+(\d+)/i);

    return {
        stage: 'parse',
        message,
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
        column: colMatch ? parseInt(colMatch[1], 10) : undefined,
        severity: 'error',
    };
}

export async function parseMermaid(code: string): Promise<MermaidParseResult> {
    if (!code || !code.trim()) {
        return {
            valid: false,
            error: { stage: 'parse', message: 'Empty diagram code', severity: 'error' },
        };
    }

    try {
        const mermaid = await getMermaidInstance();
        const result = await mermaid.parse(code, { suppressErrors: false });
        return {
            valid: true,
            diagramType: result?.diagramType,
            error: null,
        };
    } catch (error: any) {
        return {
            valid: false,
            error: normalizeMermaidDiagnostic(error),
        };
    }
}
