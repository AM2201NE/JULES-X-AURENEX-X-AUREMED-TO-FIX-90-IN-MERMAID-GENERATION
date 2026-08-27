import { DiagramIR, DiagramComplexity } from './types';
import { analyzeComplexity } from './complexity';

export interface MermaidScalePolicy {
    maxVisibleNodes: number;
    maxVisibleEdges: number;
    maxLabelLength: number;
    maxDepth: number;
}

export const DEFAULT_SCALE_POLICY: MermaidScalePolicy = {
    maxVisibleNodes: 500,
    maxVisibleEdges: 800,
    maxLabelLength: 120,
    maxDepth: 6,
};

export function decomposeLargeIR(ir: DiagramIR, scalePolicy: MermaidScalePolicy = DEFAULT_SCALE_POLICY): DiagramIR {
    const complexity = analyzeComplexity(ir);
    if (!complexity.requiresDecomposition && ir.nodes.length <= scalePolicy.maxVisibleNodes) {
        return ir;
    }

    // Retain top-level groups and primary nodes for usable viewing
    const primaryNodes = ir.nodes.slice(0, scalePolicy.maxVisibleNodes);
    const primaryNodeIds = new Set(primaryNodes.map(n => n.id));
    const primaryEdges = ir.edges.filter(e => primaryNodeIds.has(e.source) && primaryNodeIds.has(e.target));

    return {
        ...ir,
        nodes: primaryNodes,
        edges: primaryEdges,
    };
}
