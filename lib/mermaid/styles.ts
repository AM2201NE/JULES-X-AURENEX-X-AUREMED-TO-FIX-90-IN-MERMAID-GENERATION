import { DiagramStyle } from './types';

// Canonical AURENEX Semantic Color Palette (Immutable)
export const AURENEX_MERMAID_PALETTE: Readonly<Record<string, DiagramStyle>> = Object.freeze({
    important: Object.freeze({ className: 'important', fill: '#fffde7', stroke: '#fbc02d', color: '#f57f17' }),
    positive: Object.freeze({ className: 'positive', fill: '#e8f5e9', stroke: '#2e7d32', color: '#1b5e20' }),
    reference: Object.freeze({ className: 'reference', fill: '#e3f2fd', stroke: '#1565c0', color: '#0d47a1' }),
    warning: Object.freeze({ className: 'warning', fill: '#fff3e0', stroke: '#f57c00', color: '#e65100' }),
    critical: Object.freeze({ className: 'critical', fill: '#ffebee', stroke: '#c62828', color: '#b71c1c' }),
    caution: Object.freeze({ className: 'caution', fill: '#fff8e1', stroke: '#ffa000', color: '#ff6f00' }),
    neutral: Object.freeze({ className: 'neutral', fill: '#f5f5f5', stroke: '#616161', color: '#212121' }),
    organ: Object.freeze({ className: 'organ', fill: '#e8f5e9', stroke: '#2e7d32', color: '#1b5e20' }),
    artery: Object.freeze({ className: 'artery', fill: '#ffebee', stroke: '#c62828', color: '#b71c1c' }),
    vein: Object.freeze({ className: 'vein', fill: '#e3f2fd', stroke: '#1565c0', color: '#0d47a1' }),
    nerve: Object.freeze({ className: 'nerve', fill: '#fffde7', stroke: '#fbc02d', color: '#f57f17' }),
    pathology: Object.freeze({ className: 'pathology', fill: '#f3e5f5', stroke: '#7b1fa2', color: '#4a148c' }),
});

export function compileAurenexStyles(): string {
    return Object.entries(AURENEX_MERMAID_PALETTE)
        .map(([name, s]) => `classDef ${name} fill:${s.fill},stroke:${s.stroke},color:${s.color}`)
        .join('\n');
}

export function compileClassAssignment(nodeIds: string[], className: string): string {
    if (!nodeIds || nodeIds.length === 0) return '';
    return `class ${nodeIds.join(',')} ${className}`;
}
