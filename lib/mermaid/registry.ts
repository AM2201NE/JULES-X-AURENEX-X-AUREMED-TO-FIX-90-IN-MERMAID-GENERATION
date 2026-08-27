import { DiagramIR } from './types';

export interface MermaidDiagramDefinition {
    type: string;
    aliases: string[];
    supportsMath: boolean;
    supportsClasses: boolean;
    supportsSubgraphs: boolean;
    supportsLayout: boolean;
}

export const MERMAID_DIAGRAM_TYPES = [
    'flowchart',
    'graph',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'stateDiagram-v2',
    'erDiagram',
    'journey',
    'gantt',
    'pie',
    'quadrantChart',
    'requirementDiagram',
    'gitGraph',
    'C4Context',
    'C4Container',
    'C4Component',
    'C4Dynamic',
    'C4Deployment',
    'mindmap',
    'timeline',
    'zenuml',
    'sankey',
    'sankey-beta',
    'xychart',
    'xychart-beta',
    'block',
    'block-beta',
    'architecture-beta',
    'kanban',
    'packet-beta',
    'radar-beta',
    'treemap-beta',
    'venn-beta',
    'ishikawa-beta',
    'wardley-beta',
    'cynefin-beta',
    'swimlane-beta',
    'treeView-beta',
    'eventmodeling',
];

export const MERMAID_REGISTRY: Record<string, MermaidDiagramDefinition> = {
    flowchart: {
        type: 'flowchart',
        aliases: ['graph'],
        supportsMath: true,
        supportsClasses: true,
        supportsSubgraphs: true,
        supportsLayout: true,
    },
    sequenceDiagram: {
        type: 'sequenceDiagram',
        aliases: [],
        supportsMath: true,
        supportsClasses: false,
        supportsSubgraphs: false,
        supportsLayout: true,
    },
    classDiagram: {
        type: 'classDiagram',
        aliases: [],
        supportsMath: false,
        supportsClasses: true,
        supportsSubgraphs: false,
        supportsLayout: false,
    },
    stateDiagram: {
        type: 'stateDiagram-v2',
        aliases: ['stateDiagram'],
        supportsMath: false,
        supportsClasses: true,
        supportsSubgraphs: true,
        supportsLayout: false,
    },
    erDiagram: {
        type: 'erDiagram',
        aliases: [],
        supportsMath: false,
        supportsClasses: false,
        supportsSubgraphs: false,
        supportsLayout: false,
    },
    mindmap: {
        type: 'mindmap',
        aliases: [],
        supportsMath: false,
        supportsClasses: false,
        supportsSubgraphs: false,
        supportsLayout: false,
    },
    timeline: {
        type: 'timeline',
        aliases: [],
        supportsMath: false,
        supportsClasses: false,
        supportsSubgraphs: false,
        supportsLayout: false,
    },
};
