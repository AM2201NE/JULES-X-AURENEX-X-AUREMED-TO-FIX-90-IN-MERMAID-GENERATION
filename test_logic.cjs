const fs = require('fs');
const ts = fs.readFileSync('./lib/mermaidUtils.ts', 'utf8');
const fn = ts.substring(ts.indexOf('{')+1, ts.lastIndexOf('}'));

const f = new Function('rawChartCode', `
let cleanChart = rawChartCode.trim();
console.log("0:", cleanChart);

const knownTypes = ['flowchart', 'graph', 'mindmap', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', 'timeline', 'zenuml', 'sankey-beta', 'xychart-beta', 'block-beta'];
cleanChart = cleanChart.replace(/(flowchart\\s+[A-Z]{2})\\s*[A-Za-z0-9]*flowchart\\s+[A-Z]{2}/gi, '$1');
cleanChart = cleanChart.replace(/(graph\\s+[A-Z]{2})\\s*[A-Za-z0-9]*graph\\s+[A-Z]{2}/gi, '$1');
cleanChart = cleanChart.replace(/(flowchart\\s+[A-Z]{2})\\s*(classDef|class|subgraph|style|click)/gi, '$1\\n$2');
cleanChart = cleanChart.replace(/(graph\\s+[A-Z]{2})\\s*(classDef|class|subgraph|style|click)/gi, '$1\\n$2');
console.log("1:", cleanChart);

const chartWithoutComments = cleanChart.replace(/^(?:\\s*%%.*)+/gm, '').trim();
const hasDiagramType = knownTypes.some(type => chartWithoutComments.startsWith(type));

if (!hasDiagramType && cleanChart.includes('-->')) {
    cleanChart = 'flowchart TD\\n' + cleanChart;
}
console.log("2:", cleanChart);

const isFlowchart = true;
if (isFlowchart) {
    cleanChart = cleanChart
        // Safely quote unquoted brackets and braces, and escape inner quotes
        .replace(/\\[([^\\[\\]]+)\\]/g, (m, g1) => {
            console.log("MATCH BRACKET:", g1);
            if (g1.startsWith('"') && g1.endsWith('"')) {
                const res = '["' + g1.slice(1, -1).replace(/"/g, "'") + '"]';
                console.log("  ->", res);
                return res;
            }
            if (/[\\(\\)<>{}"']/.test(g1)) return '["' + g1.replace(/"/g, "'") + '"]';
            return m;
        });
    console.log("3 bracket:", cleanChart);
        
    cleanChart = cleanChart.replace(/\\{([^{}]+)\\}/g, (m, g1) => {
            if (g1.startsWith('"') && g1.endsWith('"')) return '{"' + g1.slice(1, -1).replace(/"/g, "'") + '"}';
            if (/[\\(\\)<>\\[\\]"']/.test(g1)) return '{"' + g1.replace(/"/g, "'") + '"}';
            return m;
        })
        // For parentheses, we must ignore strings already wrapped in double quotes 
        // so we don't accidentally add parens/quotes inside brackets
        .replace(/"[^"]*"|\\(([^()]+)\\)/g, (m, g1) => {
            if (g1 === undefined) return m; // It was our \`"[^"]*"\` match, leave it
            if (/[<>{}"']/.test(g1)) return '("' + g1.replace(/"/g, "'") + '")';
            return m;
        });
    console.log("3 paren:", cleanChart);
    
    cleanChart = cleanChart
        .replace(/"]([A-Za-z])/g, '"]\\n$1')
        .replace(/\\)([A-Za-z])/g, ')\\n$1')
        .replace(/\\}([A-Za-z])/g, '}\\n$1')
        .replace(/([\\]\\)])\\s+([A-Za-z][A-Za-z0-9_]*\\[)/g, '$1\\n$2')
        .replace(/([\\]\\)])([A-Za-z][A-Za-z0-9_]*\\s*[\\(\\[\\{])/g, '$1\\n$2')
        .replace(/([\\]\\)}])([A-Za-z][A-Za-z0-9_]*)/g, '$1\\n$2');
        
    console.log("4 newlines:", cleanChart);
    cleanChart = cleanChart
        .replace(/ "([a-zA-Z0-9\\s\\.]+)" /g, " '$1' ")
        .replace(/([a-zA-Z0-9])"([a-zA-Z0-9])/g, "$1'$2") 
        .replace(/"([a-zA-Z0-9\\s?]+)"</g, "'$1'<")
        .replace(/--\\s*['"]([^'"]+)['"]\\s*--\\|\\s*['"]([^'"]+)['"]\\s*\\|/g, '-->|"$1: $2"|')
        .replace(/--\\|\\s*['"]([^'"]+)['"]\\s*\\|/g, '-->|"$1"|')
        .replace(/--\\|/g, '-->')
        .replace(/--\\(([^)]+)\\)-/g, '-->|"$1"|')
        .replace(/--\\(([^)]+)\\)-->/g, '-->|"$1"|')
        .replace(/[ \\t]+--[ \\t]+([a-zA-Z0-9_]+)[ \\t]+([a-zA-Z0-9_]+)/g, ' -- "$1" --> $2')
        .replace(/-\\.\\s*['"]?((?:[^'"\\n]|\\\\')*?)['"]?\\s*\\.(->>|->|>|-)?/g, '-.->|"$1"|')
        .replace(/"\\s*(<br\\s*\\/?>)\\s*"/gi, '$1')
        .replace(/"\\s*(<br\\s*\\/?>)/gi, '$1')
        .replace(/(<br\\s*\\/?>)\\s*"/gi, '$1');
    console.log("5 final:", cleanChart);
}
return cleanChart;
`);
console.log("RESULT", f('A["Abdominal ("PIA > 20")"]'));
