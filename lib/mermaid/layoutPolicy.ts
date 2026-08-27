export type MermaidLayout = "elk" | "dagre" | "tidy-tree" | "default";

export function chooseMermaidLayout(
    diagramType: string,
    nodeCount: number = 0,
    edgeCount: number = 0
): MermaidLayout {
    switch (diagramType) {
        case "flowchart":
        case "graph":
            return "elk";
        case "mindmap":
        case "treeView":
            return "tidy-tree";
        case "sequenceDiagram":
        case "classDiagram":
        case "stateDiagram":
        case "erDiagram":
            return "default";
        default:
            return "default";
    }
}
