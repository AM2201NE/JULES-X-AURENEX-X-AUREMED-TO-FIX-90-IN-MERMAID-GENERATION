import { MermaidParseResult, MermaidDiagnostic } from './types';

let loadedMermaidInstance: any = null;

export async function getMermaidInstance(): Promise<any> {
    if (loadedMermaidInstance) return loadedMermaidInstance;

    let mermaidApi: any = null;
    if (typeof window !== 'undefined' && (window as any).mermaid) {
        mermaidApi = (window as any).mermaid;
    } else {
        const mermaidModule = await import('mermaid');
        mermaidApi = mermaidModule.default ?? mermaidModule;
    }

    try {
        const elkLayoutModule = await import('@mermaid-js/layout-elk');
        if (elkLayoutModule && mermaidApi.registerLayoutLoaders) {
            mermaidApi.registerLayoutLoaders(elkLayoutModule.default ?? elkLayoutModule);
        }
    } catch (e) {
        console.warn('[Mermaid] Could not register ELK layout loader:', e);
    }

    mermaidApi.initialize({
        startOnLoad: false,
        theme: document.documentElement?.classList?.contains('dark') ? 'dark' : 'default',
        securityLevel: 'strict',
        fontFamily: 'Inter, sans-serif',
        look: 'classic',
        flowchart: {
            defaultRenderer: 'elk',
            curve: 'step',
            htmlLabels: false,
            nodeSpacing: 35,
            rankSpacing: 55,
            padding: 12,
            useMaxWidth: true,
        },
    });

    loadedMermaidInstance = mermaidApi;
    return loadedMermaidInstance;
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
