import { DiagramIR, DiagramNode, DiagramEdge } from './types';
import { compileAurenexStyles } from './styles';

export function safeId(id: string): string {
    return id.replace(/[^A-Za-z0-9_]/g, '_');
}

export function escapeMermaidLabel(label: string): string {
    return label
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '&quot;');
}

export function compileNode(node: DiagramNode): string {
    const id = safeId(node.id);
    const label = escapeMermaidLabel(node.label);

    switch (node.type) {
        case 'round': return `${id}("${label}")`;
        case 'stadium': return `${id}(["${label}"])`;
        case 'subroutine': return `${id}[["${label}"]]`;
        case 'database': return `${id}[("${label}")]`;
        case 'circle': return `${id}(("${label}"))`;
        case 'rhombus': return `${id}{"${label}"}`;
        default: return `${id}["${label}"]`;
    }
}

export function compileEdge(edge: DiagramEdge): string {
    const source = safeId(edge.source);
    const target = safeId(edge.target);
    const labelStr = edge.label ? `|"${escapeMermaidLabel(edge.label)}"|` : '';

    switch (edge.relationship) {
        case 'dotted':
            return edge.label ? `${source} -. ${labelStr} .-> ${target}` : `${source} -.-> ${target}`;
        case 'thick':
            return edge.label ? `${source} == ${labelStr} ==> ${target}` : `${source} ==> ${target}`;
        case 'multi':
            return `${source} <--> ${target}`;
        default:
            return edge.label ? `${source} -->${labelStr} ${target}` : `${source} --> ${target}`;
    }
}

export function compileFlowchart(ir: DiagramIR): string {
    const output: string[] = [];

    output.push('---');
    output.push('config:');
    output.push('  layout: elk');
    output.push('  look: classic');
    output.push('  elk:');
    output.push('    mergeEdges: true');
    output.push('  flowchart:');
    output.push('    defaultRenderer: elk');
    output.push('    curve: step');
    output.push('---');

    output.push(`flowchart ${ir.direction ?? 'TD'}`);
    output.push(compileAurenexStyles());

    const groups = ir.groups || [];
    const groupMap = new Map<string, DiagramNode[]>();

    for (const group of groups) {
        groupMap.set(group.id, []);
    }

    const ungroupedNodes: DiagramNode[] = [];

    for (const node of ir.nodes) {
        if (node.groupId && groupMap.has(node.groupId)) {
            groupMap.get(node.groupId)!.push(node);
        } else {
            ungroupedNodes.push(node);
        }
    }

    for (const group of groups) {
        output.push(`subgraph ${safeId(group.id)} ["${escapeMermaidLabel(group.label)}"]`);
        const groupNodes = groupMap.get(group.id) || [];
        for (const node of groupNodes) {
            output.push(`    ${compileNode(node)}`);
        }
        output.push('end');
    }

    for (const node of ungroupedNodes) {
        output.push(compileNode(node));
    }

    for (const edge of ir.edges) {
        output.push(compileEdge(edge));
    }

    for (const node of ir.nodes) {
        if (node.className) {
            output.push(`${safeId(node.id)}:::${node.className}`);
        }
    }

    return output.join('\n');
}

export function compileDiagramIR(ir: DiagramIR): string {
    switch (ir.diagramType) {
        case 'flowchart':
        case 'graph':
            return compileFlowchart(ir);
        default:
            return compileFlowchart(ir);
    }
}
