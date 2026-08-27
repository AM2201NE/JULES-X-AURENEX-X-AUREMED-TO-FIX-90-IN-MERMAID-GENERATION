import { MermaidDiagnostic } from './types';

export type MermaidErrorCode =
    | 'PARSE_ERROR'
    | 'UNKNOWN_DIAGRAM_TYPE'
    | 'INVALID_NODE'
    | 'INVALID_EDGE'
    | 'INVALID_SUBGRAPH'
    | 'INVALID_STYLE'
    | 'INVALID_CLASSDEF'
    | 'INVALID_DIRECTION'
    | 'INVALID_FRONTMATTER'
    | 'INVALID_MATH'
    | 'INVALID_LABEL'
    | 'INVALID_SPECIAL_CHARACTER'
    | 'UNSUPPORTED_FEATURE'
    | 'RENDER_ERROR'
    | 'SVG_ERROR'
    | 'TIMEOUT'
    | 'MEMORY_LIMIT'
    | 'UNKNOWN';

export function classifyMermaidError(error: any): { code: MermaidErrorCode; diagnostic: MermaidDiagnostic } {
    const msg = error?.message || (typeof error === 'string' ? error : 'Unknown error');
    let code: MermaidErrorCode = 'PARSE_ERROR';

    if (msg.includes('No diagram type detected') || msg.includes('Unknown diagram type')) {
        code = 'UNKNOWN_DIAGRAM_TYPE';
    } else if (msg.includes('classDef') || msg.includes('class')) {
        code = 'INVALID_CLASSDEF';
    } else if (msg.includes('subgraph') || msg.includes('end')) {
        code = 'INVALID_SUBGRAPH';
    } else if (msg.includes('SVG')) {
        code = 'SVG_ERROR';
    }

    const lineMatch = msg.match(/line\s+(\d+)/i) || msg.match(/(\d+):(\d+)/);
    const colMatch = msg.match(/column\s+(\d+)/i);

    return {
        code,
        diagnostic: {
            stage: 'parse',
            message: msg,
            line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
            column: colMatch ? parseInt(colMatch[1], 10) : undefined,
            severity: 'error',
            code,
        }
    };
}
