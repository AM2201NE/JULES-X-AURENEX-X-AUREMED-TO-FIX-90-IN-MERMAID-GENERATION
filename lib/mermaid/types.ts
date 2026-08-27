export type MermaidDirection = 'TB' | 'TD' | 'BT' | 'LR' | 'RL';

export interface DiagramNode {
    id: string;
    label: string;
    type?: string;
    groupId?: string;
    className?: string;
    importance?: number;
    metadata?: Record<string, unknown>;
    math?: string;
}

export interface DiagramEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    relationship?: 'solid' | 'dotted' | 'thick' | 'multi' | string;
    type?: string;
    style?: string;
    metadata?: Record<string, unknown>;
}

export interface DiagramGroup {
    id: string;
    label: string;
    parentId?: string;
    direction?: MermaidDirection;
}

export interface DiagramStyle {
    className: string;
    fill: string;
    stroke: string;
    color: string;
    strokeWidth?: number;
}

export interface DiagramMath {
    id: string;
    expression: string;
    location: 'node' | 'edge' | 'note' | 'participant' | 'annotation';
}

export interface DiagramIR {
    version: 1;
    diagramType: string;
    direction?: MermaidDirection;
    title?: string;
    description?: string;
    nodes: DiagramNode[];
    edges: DiagramEdge[];
    groups: DiagramGroup[];
    styles: DiagramStyle[];
    math: DiagramMath[];
    metadata: {
        sourceHash?: string;
        generatedAt: number;
        sourceSize?: number;
        nodeCount?: number;
        edgeCount?: number;
    };
}

export interface MermaidDiagnostic {
    stage: 'extraction' | 'compile' | 'parse' | 'structure' | 'semantic' | 'render' | 'svg';
    message: string;
    line?: number;
    column?: number;
    token?: string;
    expected?: string[];
    severity: 'error' | 'warning';
    code?: string;
}

export interface MermaidParseResult {
    valid: boolean;
    diagramType?: string;
    error: MermaidDiagnostic | null;
}

export interface MermaidHealingContext {
    code: string;
    diagramType: string;
    parserError?: MermaidDiagnostic;
    structuralErrors: MermaidDiagnostic[];
    semanticErrors: MermaidDiagnostic[];
    expectedNodes: string[];
    missingNodes: string[];
    expectedEdges: string[];
    missingEdges: string[];
    expectedClasses: string[];
    missingClasses: string[];
    protectedMath: string[];
    immutableColorPalette: Record<string, DiagramStyle>;
}

export interface DiagramComplexity {
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
    maxDepth: number;
    density: number;
    complexityScore: number;
    requiresDecomposition: boolean;
}

export interface ProtectedRegion {
    token: string;
    original: string;
    type: 'math' | 'quoted-label' | 'directive' | 'frontmatter';
}

export interface VerifiedMermaidResult {
    svg: string;
    code: string;
    verified: boolean;
}
