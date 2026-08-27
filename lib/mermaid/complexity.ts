import { DiagramIR, DiagramComplexity } from './types';

export function analyzeComplexity(ir: DiagramIR): DiagramComplexity {
    const nodeCount = ir.nodes?.length || 0;
    const edgeCount = ir.edges?.length || 0;
    const groupCount = ir.groups?.length || 0;
    const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;
    const complexityScore = nodeCount + edgeCount * 1.5 + groupCount * 2;

    return {
        nodeCount,
        edgeCount,
        groupCount,
        maxDepth: groupCount > 0 ? 2 : 1,
        density,
        complexityScore,
        requiresDecomposition: complexityScore > 150,
    };
}
