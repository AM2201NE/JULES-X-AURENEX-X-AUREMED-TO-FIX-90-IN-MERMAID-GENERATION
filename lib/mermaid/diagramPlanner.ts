import { DiagramIR } from './types';

export function planDiagramType(semanticIntent: string, nodeCount: number): string {
    const lower = (semanticIntent || '').toLowerCase();

    if (lower.includes('sequence') || lower.includes('interaction') || lower.includes('protocol')) {
        return 'sequenceDiagram';
    }
    if (lower.includes('state') || lower.includes('transition') || lower.includes('lifecycle')) {
        return 'stateDiagram-v2';
    }
    if (lower.includes('mindmap') || lower.includes('brainstorm')) {
        return 'mindmap';
    }
    if (lower.includes('timeline') || lower.includes('chronology')) {
        return 'timeline';
    }
    if (lower.includes('class') || lower.includes('taxonomy')) {
        return 'classDiagram';
    }
    if (lower.includes('entity') || lower.includes('database') || lower.includes('er')) {
        return 'erDiagram';
    }

    return 'flowchart';
}
