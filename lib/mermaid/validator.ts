import { DiagramIR, MermaidDiagnostic } from './types';

export interface StructuralValidationResult {
    valid: boolean;
    errors: MermaidDiagnostic[];
    warnings: MermaidDiagnostic[];
}

export function validateMermaidStructure(code: string, ir?: DiagramIR): StructuralValidationResult {
    const errors: MermaidDiagnostic[] = [];
    const warnings: MermaidDiagnostic[] = [];

    if (!code || !code.trim()) {
        errors.push({ stage: 'structure', message: 'Empty Mermaid code', severity: 'error' });
        return { valid: false, errors, warnings };
    }

    const definedIds = new Set<string>();
    const nodeDefRegex = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[|\(|\{|\{\{|\[\[|\[\(|\(\()/gm;
    let match: RegExpExecArray | null;
    while ((match = nodeDefRegex.exec(code)) !== null) {
        definedIds.add(match[1]);
    }

    if (ir) {
        for (const node of ir.nodes) {
            if (!definedIds.has(node.id) && !code.includes(node.id)) {
                errors.push({
                    stage: 'structure',
                    message: `Required node missing from diagram: ${node.id}`,
                    severity: 'error',
                });
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

export function validateSemanticIntegrity(ir: DiagramIR, code: string): StructuralValidationResult {
    return validateMermaidStructure(code, ir);
}

export function validateRenderedSvg(svg: string, expectedLabels: string[] = []): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!svg || !svg.trim()) {
        errors.push('Rendered SVG is empty');
        return { valid: false, errors };
    }

    if (svg.includes('Syntax error') || svg.includes('mermaid-error')) {
        errors.push('Rendered SVG contains Mermaid error state');
    }

    for (const label of expectedLabels) {
        if (!svg.includes(label)) {
            errors.push(`Expected label missing from rendered SVG: ${label}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
