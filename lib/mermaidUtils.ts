export function sanitizeMermaidCode(rawChartCode: string): string {
    if (!rawChartCode || rawChartCode.trim() === '') return '';
    let cleanChart = rawChartCode.trim();
    
    // Check if it has a known diagram type, ignoring leading comments (%%)
    const knownTypes = ['flowchart', 'graph', 'mindmap', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', 'timeline', 'zenuml', 'sankey-beta', 'xychart-beta', 'block-beta'];
    
    // Fix AI repeating flowchart directives or gluing them
    cleanChart = cleanChart.replace(/(flowchart\s+[A-Z]{2})\s*[A-Za-z0-9]*flowchart\s+[A-Z]{2}/gi, '$1');
    cleanChart = cleanChart.replace(/(graph\s+[A-Z]{2})\s*[A-Za-z0-9]*graph\s+[A-Z]{2}/gi, '$1');
    cleanChart = cleanChart.replace(/(flowchart\s+[A-Z]{2})\s*(classDef|class|subgraph|style|click)/gi, '$1\n$2');
    cleanChart = cleanChart.replace(/(graph\s+[A-Z]{2})\s*(classDef|class|subgraph|style|click)/gi, '$1\n$2');
    
    // Create a version of the chart without leading comments/directives for type checking
    const chartWithoutComments = cleanChart.replace(/^(?:\s*%%.*)+/gm, '').trim();
    const hasDiagramType = knownTypes.some(type => chartWithoutComments.startsWith(type));
    
    if (!hasDiagramType && cleanChart.includes('-->')) {
        // Assume it's a flowchart if it has arrows but no type
        cleanChart = 'flowchart TD\n' + cleanChart;
    }

    const isFlowchart = chartWithoutComments.startsWith('flowchart') || chartWithoutComments.startsWith('graph');
    
    if (isFlowchart) {
        cleanChart = cleanChart
            // Automatically wrap naked node text in quotes for brackets, braces, parens
            .replace(/\[([^\[\]"]+)\]/g, '["$1"]')
            .replace(/\{([^{}"]+)\}/g, '{"$1"}')
            .replace(/"[^"]*"|\(([^()]+)\)/g, (m, g1) => {
                if (g1 === undefined) return m;
                if (!g1.startsWith('"') || !g1.endsWith('"')) return `("${g1}")`;
                return m;
            })
            // Add newlines before node text brackets to please parsed rules without breaks
            .replace(/([\]\)])\s+([A-Za-z][A-Za-z0-9_]*\[)/g, '$1\n$2')
            .replace(/([\]\)])([A-Za-z][A-Za-z0-9_]*\s*[\(\[\{])/g, '$1\n$2')
            .replace(/ "([a-zA-Z0-9\s\.]+)" /g, " '$1' ")
            .replace(/([a-zA-Z0-9])"([a-zA-Z0-9])/g, "$1'$2")
            .replace(/"([a-zA-Z0-9\s?]+)"</g, "'$1'<")
            // Fix broken arrow syntax (e.g., ---> converted to -->)
            .replace(/-{3,}>/g, '-->')
            .replace(/={3,}>/g, '==>')
            .replace(/\.{3,}>/g, '..>')
            .replace(/--\s*['"]([^'"]+)['"]\s*--\|\s*['"]([^'"]+)['"]\s*\|/g, '-->|"$1: $2"|')
            .replace(/--\|\s*['"]([^'"]+)['"]\s*\|/g, '-->|"$1"|')
            .replace(/--\|/g, '-->')
            .replace(/--\(([^)]+)\)-/g, '-->|"$1"|')
            .replace(/--\(([^)]+)\)-->/g, '-->|"$1"|')
            .replace(/[ \t]+--[ \t]+([a-zA-Z0-9_]+)[ \t]+([a-zA-Z0-9_]+)/g, ' -- "$1" --> $2')
            // Fix improperly formatted dotted links (e.g. -. "text" . or -. text .->)
            .replace(/-\.\s*['"]?((?:[^'"\n]|\\\')*?)['"]?\s*\.(->>|->|>|-|\s)/g, '-.->|"$1"|')
            // Remove illegal HTML tags and trailing semicolons
            .replace(/<br>/gi, '<br/>')
            .replace(/;\s*$/gm, '');
    }
    
    return cleanChart;
}

/**
 * Quick pre-validation check for common Mermaid syntax issues.
 * Returns an array of issues found, or empty array if none.
 * This runs BEFORE mermaid.render() to catch obvious problems early.
 */
export function preValidateMermaid(code: string): string[] {
    const issues: string[] = [];
    
    if (!code || code.trim() === '') {
        return ['Empty diagram code'];
    }
    
    // Check for unquoted hex colors (the #11 cause of parse errors)
    // Pattern: fill:#xxx or stroke:#xxx or color:#xxx WITHOUT quotes
    const unquotedHex = code.match(/((?:fill|stroke|color|background|bg)\s*:\s*)(#[0-9a-fA-F]{3,8})(?!\s*["'])/gi);
    if (unquotedHex) {
        issues.push(`Unquoted hex color: ${unquotedHex[0].substring(0, 40)}`);
    }
    
    // Check for bare hex without # (starts with digit)
    const bareHex = code.match(/((?:fill|stroke|color|background|bg)\s*:\s*)([0-9][0-9a-fA-F]{5})(?=\s*[,;\n\r)]|$)/gi);
    if (bareHex) {
        issues.push(`Bare hex color without #: ${bareHex[0].substring(0, 40)}`);
    }
    
    // Check for direction on same line as content
    const directionGlued = code.match(/\bdirection\s+(TD|TB|LR|RL|BT)\s+[A-Za-z]/i);
    if (directionGlued) {
        issues.push('direction keyword has content on same line');
    }
    
    // Check for end glued to content
    const endGlued = code.match(/[^\n]\s*\bend\b/g);
    if (endGlued) {
        issues.push('end keyword glued to previous content');
    }
    
    // Check for invalid dotted arrows
    if (code.match(/-\.-/) && !code.match(/-\.->/)) {
        issues.push('Invalid dotted arrow: -.- (should be -.->)');
    }
    
    // Check for double arrowhead
    if (code.match(/-\.->>/)) {
        issues.push('Invalid double arrowhead: -.->> (should be -.->)');
    }
    
    // Check for colon-style edge labels
    const colonLabel = code.match(/-->\s+[A-Za-z_]\w*\s*:\s*["']/);
    if (colonLabel) {
        issues.push('Colon-style edge label (should use pipe syntax: -->|"label"|)');
    }
    
    return issues;
}

/**
 * Aggressive last-resort fixer for Mermaid code that won't render.
 * Strips all styling/classDef/style lines and returns just the structural diagram.
 * This ensures at least the diagram structure is visible even if styling breaks it.
 */
export function stripStylingForRecovery(code: string): string {
    if (!code) return '';
    
    let stripped = code;
    
    // Remove all classDef lines
    stripped = stripped.replace(/^\s*classDef\s+.*$/gm, '');
    
    // Remove all style lines  
    stripped = stripped.replace(/^\s*style\s+.*$/gm, '');
    
    // Remove all class assignment lines
    stripped = stripped.replace(/^\s*class\s+.*$/gm, '');
    
    // Remove all linkStyle lines
    stripped = stripped.replace(/^\s*linkStyle\s+.*$/gm, '');
    
    // Remove inline :::class annotations
    stripped = stripped.replace(/:::[a-zA-Z0-9_-]+/g, '');
    
    // Fix round-bracket nodes with nested parens (common AI mistake)
    stripped = stripped.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*)\(([^()]*\([^()]*\)[^()]*)\)/g,
        '$1["$2"]'
    );
    // Fix round-bracket nodes with special chars (colons, commas)
    stripped = stripped.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*)\(([^)]*[:,][^)]*)\)/g,
        '$1["$2"]'
    );
    
    // ═══ FIX INIT DIRECTIVES ═══
    // Move %%{init:...}%% to the very top, before flowchart declaration
    const initDirectives: string[] = [];
    stripped = stripped.replace(/^%%\{init:[\s\S]*?\}%%\s*$/gm, (match) => {
        initDirectives.push(match.trim());
        return '';
    });
    if (initDirectives.length > 0) {
        stripped = initDirectives.join('\n') + '\n' + stripped;
    }
    
    // ═══ REMOVE DUPLICATE FLOWCHART/GRAPH DECLARATIONS ═══
    let firstDeclFound = false;
    stripped = stripped.replace(/^(flowchart\s+[A-Z]{2}|graph\s+[A-Z]{2})\s*$/gim, (match) => {
        if (firstDeclFound) {
            return ''; // Remove duplicate
        }
        firstDeclFound = true;
        return match;
    });
    
    // Clean up empty lines
    stripped = stripped.replace(/\n{3,}/g, '\n\n');
    
    return stripped.trim();
}

/**
 * Quick local fixer for common Mermaid syntax errors — NO AI required.
 * This runs before AI healing to fix the most common issues instantly.
 * Returns the fixed code, or null if no fixes were applied.
 */
export function quickFixMermaid(code: string, errorMessage: string): string | null {
    if (!code) return null;
    
    let fixed = code;
    let changed = false;
    
    // Fix 1: Remove ALL quotes around hex colors (the #1 Mermaid 11 issue)
    const beforeHex = fixed;
    fixed = fixed.replace(/(\w+\s*:\s*)"(#[0-9a-fA-F]{3,8})"/gi, '$1$2');
    fixed = fixed.replace(/(\w+\s*:\s*)"([0-9a-fA-F]{3,8})"/gi, '$1#$2');
    fixed = fixed.replace(/(,\s*)"(#[0-9a-fA-F]{3,8})"/gi, '$1$2');
    fixed = fixed.replace(/(,\s*)"([0-9a-fA-F]{3,8})"/gi, '$1#$2');
    if (fixed !== beforeHex) changed = true;
    
    // Fix 2: Bare hex without # → add #
    const beforeBareHex = fixed;
    fixed = fixed.replace(
        /((?:fill|stroke|color|background|bg)\s*:\s*)([0-9][0-9a-fA-F]{5,7})(?=\s*[,;\n\r\)]|$)/gi,
        '$1#$2'
    );
    fixed = fixed.replace(
        /((?:fill|stroke|color|background|bg)\s*:\s*)([0-9][0-9a-fA-F]{2})(?=\s*[,;\n\r\)]|$)/gi,
        '$1#$2'
    );
    if (fixed !== beforeBareHex) changed = true;
    
    // Fix 3: "Expecting 'SEMI', 'NEWLINE'... got 'STR'" → quoted strings in wrong places
    if (errorMessage.includes("got 'STR'")) {
        // Remove quotes from any remaining property:value pairs
        const beforeStr = fixed;
        fixed = fixed.replace(/(\w+\s*:\s*)"([^"\n]+)"/g, '$1$2');
        if (fixed !== beforeStr) changed = true;
    }
    
    // Fix 4: direction on same line as content
    const beforeDir = fixed;
    fixed = fixed.replace(/\bdirection\s+(TD|TB|LR|RL|BT)\s*([^\n\r])/gi, 'direction $1\n    $2');
    fixed = fixed.replace(/\bdirection\s+(TD|TB|LR|RL|BT)([A-Za-z_])/gi, 'direction $1\n    $2');
    if (fixed !== beforeDir) changed = true;
    
    // Fix 5: end glued to content
    const beforeEnd = fixed;
    fixed = fixed.replace(/([^\n])\s*\bend\b/g, '$1\nend');
    fixed = fixed.replace(/(\"[^\"]*\")\s*end\b/g, '$1\nend');
    if (fixed !== beforeEnd) changed = true;
    
    // Fix 6: Invalid dotted arrows
    const beforeArrow = fixed;
    fixed = fixed.replace(/-\.-/g, '-.->');
    fixed = fixed.replace(/-\.->>/g, '-.->');
    if (fixed !== beforeArrow) changed = true;
    
    // Fix 7: Colon-style edge labels → pipe syntax
    const beforeColon = fixed;
    fixed = fixed.replace(
        /(-->|==>|\.\.>)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]*)"/g,
        '$1|"$3"| $2'
    );
    if (fixed !== beforeColon) changed = true;
    
    // Fix 8: classDef/class inside subgraphs → move to top
    const classDefLines: string[] = [];
    const classLines: string[] = [];
    const beforeClassDef = fixed;
    fixed = fixed.replace(/^\s*classDef\s+.*$/gm, (match) => {
        classDefLines.push(match.trim());
        return '';
    });
    fixed = fixed.replace(/^\s*class\s+[A-Za-z_][A-Za-z0-9_,\s]+\s+[A-Za-z_][A-Za-z0-9_]+\s*$/gm, (match) => {
        classLines.push(match.trim());
        return '';
    });
    if (classDefLines.length > 0 || classLines.length > 0) {
        const allStyleLines = [...classDefLines, ...classLines].join('\n');
        const lines = fixed.split('\n');
        const insertIdx = lines.findIndex(l => /^(flowchart|graph)\s+[A-Z]{2}/i.test(l.trim()));
        if (insertIdx >= 0) {
            lines.splice(insertIdx + 1, 0, allStyleLines);
            fixed = lines.join('\n');
        }
        if (fixed !== beforeClassDef) changed = true;
    }
    
    // Fix 9: Remove duplicate flowchart/graph declarations
    const beforeDup = fixed;
    let firstDeclFound = false;
    fixed = fixed.replace(/^(flowchart\s+[A-Z]{2}|graph\s+[A-Z]{2})\s*$/gim, (match) => {
        if (firstDeclFound) return '';
        firstDeclFound = true;
        return match;
    });
    if (fixed !== beforeDup) changed = true;
    
    // Fix 10: Node labels with unescaped parentheses → use bracket-quote syntax
    // Pattern: NodeID(text (with parens)) → NodeID["text (with parens)"]
    // This catches the "got 'PS'" error (parenthesis in wrong place)
    const beforeParens = fixed;
    fixed = fixed.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*)\(([^)]*\([^)]*\)[^)]*)\)/g,
        '$1["$2"]'
    );
    // Also catch: NodeID(text with: colons) → NodeID["text with: colons"]
    fixed = fixed.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*)\(([^)]*[:,][^)]*)\)/g,
        '$1["$2"]'
    );
    if (fixed !== beforeParens) changed = true;
    
    // Fix 11: "got 'PS'" error — unescaped parentheses in node labels
    // Any remaining (text) that's not a valid node shape → convert to ["text"]
    if (errorMessage.includes("got 'PS'") || errorMessage.includes("got 'STR'")) {
        const beforePS = fixed;
        // Convert any remaining round-bracket nodes to square-bracket quoted nodes
        fixed = fixed.replace(
            /(\b[A-Za-z_][A-Za-z0-9_]*)\(([^)\n]{2,})\)/g,
            '$1["$2"]'
        );
        if (fixed !== beforePS) changed = true;
    }
    
    // Fix 12: Ensure init directives are at the top
    const initDirectives: string[] = [];
    const beforeInit = fixed;
    fixed = fixed.replace(/^%%\{init:[\s\S]*?\}%%\s*$/gm, (match) => {
        initDirectives.push(match.trim());
        return '';
    });
    if (initDirectives.length > 0) {
        fixed = initDirectives.join('\n') + '\n' + fixed;
        if (fixed !== beforeInit) changed = true;
    }
    
    // Clean up
    fixed = fixed.replace(/\n{3,}/g, '\n\n');
    
    return changed ? fixed.trim() : null;
}