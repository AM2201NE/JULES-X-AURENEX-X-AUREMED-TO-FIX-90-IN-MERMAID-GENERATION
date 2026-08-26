export function sanitizeMermaidCode(rawChartCode: string): string {
    if (!rawChartCode || rawChartCode.trim() === '') return '';

    let cleanChart = rawChartCode.trim();

    // ═══════════════════════════════════════════════════════════
    // PHASE -1: FRONTMATTER & DIRECTIVE SANITIZATION
    // ═══════════════════════════════════════════════════════════
    // Fix unescaped or un-fenced frontmatter (e.g., config: flowchart: defaultRenderer: elk layout: elk)
    cleanChart = cleanChart.replace(/^(?:config:\s*flowchart:.*?\n|layout:\s*elk\s*\n)+/gim, (match) => {
        if (match.toLowerCase().includes('elk')) {
            return `%%\x7Binit: \x7B"flowchart": \x7B"defaultRenderer": "elk"\x7D\x7D\x7D%%\n`;
        }
        return '';
    });
    cleanChart = cleanChart.replace(/^config:\s*flowchart:\s*defaultRenderer:\s*([a-z]+)\s+layout:\s*([a-z]+)/gim, '%%\x7Binit: \x7B"flowchart": \x7B"defaultRenderer": "$1"\x7D\x7D\x7D%%');
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 0: GLOBAL FIXES (applied to ALL diagram types)
    // ═══════════════════════════════════════════════════════════

    // Fix hex color codes — MUST run before anything else.
    // Mermaid 11.x does NOT accept quoted hex colors in classDef/style.
    // Quoted hex like fill:"#abc" causes: "Expecting 'SEMI', 'NEWLINE'... got 'STR'"
    // Strategy: REMOVE quotes from hex values, and add # to bare hex.

    // ULTRA-AGGRESSIVE: Remove ALL quotes around hex values anywhere in the code.
    // This catches fill:"#abc", stroke:"#def", color:"#fff", and any other quoted hex.
    // Pattern: any word followed by :"#hex" or :"hex" → remove the quotes.
    cleanChart = cleanChart.replace(
        /(\w+\s*:\s*)"(#[0-9a-fA-F]{3,8})"/gi,
        '$1$2'
    );
    // Also catch bare hex in quotes: fill:"abc" → fill:#abc
    cleanChart = cleanChart.replace(
        /(\w+\s*:\s*)"([0-9a-fA-F]{3,8})"/gi,
        '$1#$2'
    );
    // Catch quoted hex after commas: ,"#abc" → ,#abc
    cleanChart = cleanChart.replace(
        /(,\s*)"(#[0-9a-fA-F]{3,8})"/gi,
        '$1$2'
    );
    // Catch bare hex after commas in quotes: ,"abc" → ,#abc
    cleanChart = cleanChart.replace(
        /(,\s*)"([0-9a-fA-F]{3,8})"/gi,
        '$1#$2'
    );
    // Bare hex without # (6 or 8 chars, starts with digit) → add #
    cleanChart = cleanChart.replace(
        /((?:fill|stroke|color|background|bg)\s*:\s*)([0-9][0-9a-fA-F]{5,7})(?=\s*[,;\n\r\)]|$)/gi,
        '$1#$2'
    );
    // Bare hex without # (3 chars, starts with digit) → add #
    cleanChart = cleanChart.replace(
        /((?:fill|stroke|color|background|bg)\s*:\s*)([0-9][0-9a-fA-F]{2})(?=\s*[,;\n\r\)]|$)/gi,
        '$1#$2'
    );

    // Check if it has a known diagram type, ignoring leading comments (%%)
    const knownTypes = ['flowchart', 'graph', 'mindmap', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', 'timeline', 'zenuml', 'sankey-beta', 'xychart-beta', 'block-beta', 'architecture-beta', 'kanban', 'packet', 'treemap', 'venn', 'cynefin', 'ishikawa', 'wardley', 'treeView'];

    // ═══ FIX INIT DIRECTIVES ═══
    // Mermaid requires %%{init:...}%% to be at the very top, BEFORE the flowchart/graph declaration.
    // AI often puts it on line 2 (after flowchart TD), which breaks parsing.
    // Strategy: extract all %%{init:...}%% directives, remove them, and prepend to the chart.
    const initDirectives: string[] = [];
    cleanChart = cleanChart.replace(/^%%\{init:[\s\S]*?\}%%\s*$/gm, (match) => {
        initDirectives.push(match.trim());
        return '';
    });
    // Re-insert init directives at the very top
    if (initDirectives.length > 0) {
        cleanChart = initDirectives.join('\n') + '\n' + cleanChart;
    }

    // ═══ REMOVE DUPLICATE FLOWCHART/GRAPH DECLARATIONS ═══
    // AI sometimes generates multiple flowchart TD lines. Keep only the first one.
    let firstDeclFound = false;
    cleanChart = cleanChart.replace(/^(flowchart\s+[A-Z]{2}|graph\s+[A-Z]{2})\s*$/gim, (match) => {
        if (firstDeclFound) {
            return ''; // Remove duplicate
        }
        firstDeclFound = true;
        return match;
    });
    
    // Fix AI repeating flowchart directives or gluing them
    // First, collapse any doubled flowchart/graph declarations on the same line
    cleanChart = cleanChart.replace(/^(flowchart\s+[A-Z]{2})\s*flowchart\s+[A-Z]{2}/gim, '$1');
    cleanChart = cleanChart.replace(/^(graph\s+[A-Z]{2})\s*graph\s+[A-Z]{2}/gim, '$1');
    // Then ensure newline between declaration and next keyword
    cleanChart = cleanChart.replace(/(flowchart\s+[A-Z]{2})\s*(classDef|class|subgraph|style|click)/gi, '$1\n$2');
    cleanChart = cleanChart.replace(/(graph\s+[A-Z]{2})\s*(classDef|class|subgraph|style|click)/gi, '$1\n$2');
    
    // ═══ AUTO-FIX MISSING NEWLINES ═══
    // Fix: "direction TD NodeID" → "direction TD\n    NodeID"
    cleanChart = cleanChart.replace(
        /\bdirection\s+(TD|TB|LR|RL|BT)\s*([^\n\r])/gi,
        'direction $1\n    $2'
    );
    // Fix glued case: "direction TDHypothalamus" → "direction TD\n    Hypothalamus"
    cleanChart = cleanChart.replace(
        /\bdirection\s+(TD|TB|LR|RL|BT)([A-Za-z_])/gi,
        'direction $1\n    $2'
    );

    // Fix: "subgraph X ["Title"] NodeID" → "subgraph X ["Title"]\n    NodeID"
    cleanChart = cleanChart.replace(
        /(\bsubgraph\s+\w+(?:\s*\[[\s\S]*?\])?)\s+([A-Za-z_][A-Za-z0-9_]*(?:\[|\(|\(|\{|\>|\"))/g,
        '$1\n    $2'
    );

    // ═══ MOVE classDef/class OUT OF SUBGRAPHS ═══
    // Mermaid requires classDef and class assignments to be at the top level,
    // NOT inside subgraph bodies. AI often puts them inside subgraphs.
    // Strategy: extract all classDef/class lines, remove them from subgraph bodies,
    // and re-insert them right after the flowchart/graph declaration.
    const classDefLines: string[] = [];
    const classLines: string[] = [];

    // Extract classDef lines
    cleanChart = cleanChart.replace(/^\s*classDef\s+.*$/gm, (match) => {
        classDefLines.push(match.trim());
        return '';
    });

    // Extract class assignment lines (class NodeID1,NodeID2 className)
    cleanChart = cleanChart.replace(/^\s*class\s+[A-Za-z_][A-Za-z0-9_,\s]+\s+[A-Za-z_][A-Za-z0-9_]+\s*$/gm, (match) => {
        classLines.push(match.trim());
        return '';
    });

    // Re-insert classDef and class lines right after the flowchart/graph declaration
    if (classDefLines.length > 0 || classLines.length > 0) {
        const allStyleLines = [...classDefLines, ...classLines].join('\n');
        // Insert after the flowchart/graph declaration line (skip init directives)
        const lines = cleanChart.split('\n');
        const insertIdx = lines.findIndex(l => /^(flowchart|graph)\s+[A-Z]{2}/i.test(l.trim()));
        if (insertIdx >= 0) {
            lines.splice(insertIdx + 1, 0, allStyleLines);
            cleanChart = lines.join('\n');
        } else {
            // Fallback: insert after first non-empty line
            const fallbackIdx = lines.findIndex(l => l.trim().length > 0);
            if (fallbackIdx >= 0) {
                lines.splice(fallbackIdx + 1, 0, allStyleLines);
                cleanChart = lines.join('\n');
            }
        }
    }

    // Clean up triple+ newlines from removals
    cleanChart = cleanChart.replace(/\n{3,}/g, '\n\n');

    // Fix: "NodeID --> NodeID2 end" → "NodeID --> NodeID2\nend"
    // Also handles: NodeID["text"]end, NodeID("text")end, NodeID{"text"}end, etc.
    cleanChart = cleanChart.replace(
        /([^\n])\s*\bend\b/g,
        '$1\nend'
    );
    // Fix: NodeID["text"]end (no space before end — bracket directly followed by end)
    cleanChart = cleanChart.replace(
        /(\][\]\)\}\>])\s*end\b/g,
        '$1\nend'
    );
    // Fix: NodeID["text"]end (no space, no bracket — label text directly followed by end)
    cleanChart = cleanChart.replace(
        /(\"[^\"]*\")\s*end\b/g,
        '$1\nend'
    );
    // But don't double-add newline if end is already on its own line
    cleanChart = cleanChart.replace(/\n\s*end\s*\n\s*end/g, '\nend');

    // ═══ FIX MARKDOWN STRING MISUSE ═══
    // Fix: A[`**text**`] → A["`**text**`"] (missing outer double quotes)
    cleanChart = cleanChart.replace(
        /(\b[A-Za-z0-9_]+)\[`([^\]`]+)`\]/g,
        '$1["`$2`"]'
    );
    // Fix: A['`text`'] → A["`text`"] (single quotes → double quotes)
    cleanChart = cleanChart.replace(
        /(\b[A-Za-z0-9_]+)\['`([^']+)`'\]/g,
        '$1["`$2`"]'
    );

    // Create a version of the chart without leading comments/directives for type checking
    const chartWithoutComments = cleanChart.replace(/^(?:\s*%%.*|\s*classDef\s+.*|\s*class\s+.*)+/gm, '').trim();
    const hasDiagramType = knownTypes.some(type => chartWithoutComments.startsWith(type));
    
    if (!hasDiagramType && cleanChart.includes('-->')) {
        // Assume it's a flowchart if it has arrows but no type
        cleanChart = 'flowchart TD\n' + cleanChart;
    }

    const isFlowchart = chartWithoutComments.startsWith('flowchart') || chartWithoutComments.startsWith('graph');
    const isMindmap = chartWithoutComments.startsWith('mindmap');

    // Preserve layout renderer preferences (e.g. elk or dagre) specified in init directives
    
    if (isFlowchart) {
        cleanChart = cleanChart
            // Fix broken arrow syntax (e.g., ---> converted to -->)
            .replace(/-{3,}>/g, '-->')
            .replace(/={3,}>/g, '==>')
            .replace(/\.{3,}>/g, '..>')
            // Fix: -.- (invalid dotted arrow) → -.->
            .replace(/-\.-/g, '-.->')
            // Fix: -.->> (double arrowhead, AI hallucination) → -.->
            .replace(/-\.->>/g, '-.->')
            // Fix: -.- text .-> or -. text .- → -.->|text|
            .replace(/-\.\s*['"]?([^'"\n.]+?)['"]?\s*\.-/g, '-.->|"$1"|')
            // Fix: NodeA --> NodeB: "Label" → NodeA -->|"Label"| NodeB
            .replace(/(-->|==>|\.\.>|--\s*x\s*--)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]*)"/g, '$1|"$3"| $2')
            .replace(/(-->|==>|\.\.>|--\s*x\s*--)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([^']*)'/g, "$1|'$3'| $2")
            // Fix: NodeA --> NodeB: Label (unquoted) → NodeA -->|Label| NodeB
            .replace(/(-->|==>|\.\.>|--\s*x\s*--)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_ ]*?)(?:\s*$|\s*\n)/gm, '$1|"$3"| $2\n')
            // Fix: NodeA -->: "Label" NodeB (colon right after arrow)
            .replace(/(-->|==>|\.\.>)\s*:\s*"([^"]*)"\s+([A-Za-z_][A-Za-z0-9_]*)/g, '$1|"$2"| $3')
            .replace(/(-->|==>|\.\.>)\s*:\s*'([^']*)'\s+([A-Za-z_][A-Za-z0-9_]*)/g, "$1|'$2'| $3")
            // Fix: NodeA --> "Label" (missing target — label where node should be)
            .replace(/(-->|==>|\.\.>)\s+"([^"]+)"\s*$/gm, '$1 $2')
            .replace(/(-->|==>|\.\.>)\s+'([^']+)'\s*$/gm, "$1 $2")
            // Fix: NODE_STRING where link expected — "text" glued to arrow
            .replace(/(-->|==>|\.\.>)"([^"]+)"\s*([A-Za-z_][A-Za-z0-9_]*)/g, '$1|"$2"| $3')
            .replace(/(-->|==>|\.\.>)"([^"]+)"/g, '$1|"$2"|')
            .replace(/--\s*['"]([^'"]+)['"]\s*--\|\s*['"]([^'"]+)['"]\s*\|/g, '-->|"$1: $2"|')
            .replace(/--\|\s*['"]([^'"]+)['"]\s*\|/g, '-->|"$1"|')
            .replace(/--\|/g, '-->')
            .replace(/--\(([^)]+)\)-/g, '-->|"$1"|')
            .replace(/--\(([^)]+)\)-->/g, '-->|"$1"|')
            .replace(/[ \t]+--[ \t]+([a-zA-Z0-9_]+)[ \t]+([a-zA-Z0-9_]+)/g, ' -- "$1" --> $2')

            // Fix improperly formatted dotted links (e.g. -. "text" . or -. text .->)
            .replace(/-\.\s*['"]?((?:[^'"\n]|\\\')*?)['"]?\s*\.(->>|->|>|-|\s)/g, '-.->|"$1"|')

            // Normalize <br> to <br/>
            .replace(/<br>/gi, '<br/>')
            // Remove trailing semicolons
            .replace(/;\s*$/gm, '')
            // Fix: NodeID[text](citation:local:X) → NodeID["text (citation:local:X)"]
            .replace(/(\b[A-Za-z_][A-Za-z0-9_]*)\[([^\]]*?)\]\(([^)]*:[^)]*)\)/g, '$1["$2 ($3)"]')
            // Fix: NodeID(citation:local:X) → NodeID["(citation:local:X)"]
            .replace(/(\b[A-Za-z_][A-Za-z0-9_]*)\(([^)]*:[^)]*)\)/g, '$1["($2)"]')
            // Fix: NodeID[text](anything with colon) → NodeID["text (anything with colon)"]
            .replace(/(\b[A-Za-z_][A-Za-z0-9_]*)\[([^\]]*?)\]\(([^)]*)\)/g, '$1["$2 ($3)"]')
            // Fix: bare parenthetical with colon after node: NodeID (text: more) → NodeID["(text: more)"]
            .replace(/(\b[A-Za-z_][A-Za-z0-9_]*)\s+\(([^)]*:[^)]*)\)/g, '$1["($2)"]')
            // Fix: round-bracket nodes with nested parens: NodeID(text (parens)) → NodeID["text (parens)"]
            // Mermaid's () syntax can't handle nested parens — convert to bracket-quote syntax
            .replace(/(\b[A-Za-z_][A-Za-z0-9_]*)\(([^()]*\([^()]*\)[^()]*)\)/g, '$1["$2"]')
            // Fix: round-bracket nodes with any parentheses in label → convert to bracket-quote
            .replace(/(\b[A-Za-z_][A-Za-z0-9_]*)\(([^()]*\([^)]*\)[^()]*)\)/g, '$1["$2"]')
            // Fix: round-bracket nodes with special chars (colons, commas, etc.) → bracket-quote
            .replace(/(\b[A-Za-z_][A-Za-z0-9_]*)\(([^)]*[:,][^)]*)\)/g, '$1["$2"]');
    } else if (isMindmap) {
        cleanChart = cleanChart.replace(/:::[a-zA-Z0-9_-]+/g, '');
    }
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 3: FINAL SAFETY NET (applied to ALL diagram types)
    // ═══════════════════════════════════════════════════════════
    // Final sweep: "direction XX <content>" on the same line
    cleanChart = cleanChart.replace(
        /\bdirection\s+(TD|TB|LR|RL|BT)\s*([^\n\r])/gi,
        'direction $1\n    $2'
    );
    // Final sweep: any line with "end" glued to content before it
    cleanChart = cleanChart.replace(
        /([^\n\r])\s*\bend\b/g,
        '$1\nend'
    );
    // Final sweep: end glued to closing bracket (e.g., NodeID["text"]end)
    cleanChart = cleanChart.replace(
        /(\][\]\)\}\>])\s*end\b/g,
        '$1\nend'
    );
    // Final sweep: end glued to quoted string (e.g., NodeID["text"]end)
    cleanChart = cleanChart.replace(
        /(\"[^\"]*\")\s*end\b/g,
        '$1\nend'
    );
    // Final sweep: catch any remaining "--> NodeID: \"text\"" patterns
    cleanChart = cleanChart.replace(
        /(-->|==>|\.\.>)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]*)"/g,
        '$1|"$3"| $2'
    );
    cleanChart = cleanChart.replace(
        /(-->|==>|\.\.>)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([^']*)'/g,
        "$1|'$3'| $2"
    );
    // Final sweep: fix any remaining -.- patterns (invalid dotted arrows)
    cleanChart = cleanChart.replace(/-\.-/g, '-.->');
    // Final sweep: fix any remaining -.->> patterns (double arrowhead hallucination)
    cleanChart = cleanChart.replace(/-\.->>/g, '-.->');
    // Final sweep: fix NODE_STRING errors — quoted strings where links expected
    cleanChart = cleanChart.replace(
        /(-->|==>|\.\.>)"([^"]+)"\s*([A-Za-z_][A-Za-z0-9_]*)/g,
        '$1|"$2"| $3'
    );
    cleanChart = cleanChart.replace(
        /(-->|==>|\.\.>)"([^"]+)"/g,
        '$1|"$2"|'
    );
    // Final sweep: fix bare quoted strings on their own line (Mermaid expects a statement)
    cleanChart = cleanChart.replace(
        /^(\s*)"([^"]+)"\s*$/gm,
        '$1N"$2"'
    );
    // Final sweep: hex colors one more time — REMOVE any quotes that may have been
    // re-introduced (e.g., by AI output or previous sanitizer versions).
    // Mermaid 11.x does NOT accept quoted hex. Period.
    cleanChart = cleanChart.replace(
        /((?:fill|stroke|color|background|bg)\s*:\s*)"(#[0-9a-fA-F]{3,8})"/gi,
        '$1$2'
    );
    cleanChart = cleanChart.replace(
        /((?:fill|stroke|color|background|bg)\s*:\s*)"([0-9a-fA-F]{3,8})"/gi,
        '$1#$2'
    );
    // Also catch any quoted hex after commas
    cleanChart = cleanChart.replace(
        /(,\s*)"(#[0-9a-fA-F]{3,8})"/gi,
        '$1$2'
    );
    cleanChart = cleanChart.replace(
        /(,\s*)"([0-9a-fA-F]{3,8})"/gi,
        '$1#$2'
    );
    // Clean up any triple+ newlines we may have introduced
    cleanChart = cleanChart.replace(/\n{3,}/g, '\n\n');

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