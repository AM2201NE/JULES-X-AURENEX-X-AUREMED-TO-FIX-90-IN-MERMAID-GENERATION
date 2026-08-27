import { VerifiedMermaidResult, DiagramIR } from './types';
import { getMermaidInstance, parseMermaid } from './parser';
import { validateRenderedSvg } from './validator';
import { sanitizeMermaidCode } from './sanitizer';

let renderGenerationToken = 0;

export function getNextRenderToken(): number {
    renderGenerationToken += 1;
    return renderGenerationToken;
}

export function isProbablyCompleteMermaid(code: string): boolean {
    if (!code || !code.trim()) return false;
    const clean = code.trim();
    const hasType = /^(?:---[\s\S]*?---[\s\S]*)?(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|mindmap|gantt|pie|timeline|zenuml|block-beta|sankey-beta|kanban|architecture)\b/i.test(clean);
    if (!hasType) return false;

    const subgraphs = (clean.match(/\bsubgraph\b/gi) || []).length;
    const ends = (clean.match(/\bend\b/gi) || []).length;
    return subgraphs <= ends;
}

export async function renderVerifiedMermaid(
    code: string,
    expectedLabels: string[] = []
): Promise<VerifiedMermaidResult> {
    const cleanCode = sanitizeMermaidCode(code);
    const parsed = await parseMermaid(cleanCode);

    if (!parsed.valid) {
        throw new Error(`[Mermaid Parser Error] ${parsed.error?.message || 'Invalid syntax'}`);
    }

    const mermaid = await getMermaidInstance();
    const renderId = `aurenex-mermaid-${Math.random().toString(36).substr(2, 9)}`;

    const result = await mermaid.render(renderId, cleanCode);
    const svg = result?.svg || '';

    const svgValidation = validateRenderedSvg(svg, expectedLabels);
    if (!svgValidation.valid) {
        throw new Error(`[Mermaid SVG Error] ${svgValidation.errors.join(', ')}`);
    }

    return {
        svg,
        code: cleanCode,
        verified: true,
    };
}
