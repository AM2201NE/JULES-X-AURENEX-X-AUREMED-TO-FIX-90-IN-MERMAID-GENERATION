import { protectMath } from './math';

export function sanitizeMermaidCode(rawChartCode: string): string {
    if (!rawChartCode || rawChartCode.trim() === '') return '';

    const mathProtected = protectMath(rawChartCode.trim());
    let cleanChart = mathProtected.code;

    // ═══ FRONTMATTER & DIRECTIVE SANITIZATION ═══
    cleanChart = cleanChart.replace(/^(?:config:\s*flowchart:.*?\n|layout:\s*elk\s*\n)+/gim, (match) => {
        if (match.toLowerCase().includes('elk')) {
            return `%%\x7Binit: \x7B"flowchart": \x7B"defaultRenderer": "elk"\x7D\x7D\x7D%%\n`;
        }
        return '';
    });
    cleanChart = cleanChart.replace(/^config:\s*flowchart:\s*defaultRenderer:\s*([a-z]+)\s+layout:\s*([a-z]+)/gim, '%%\x7Binit: \x7B"flowchart": \x7B"defaultRenderer": "$1"\x7D\x7D\x7D%%');

    // ═══ HEX COLOR CLEANUP (Canonical unquoted hex: fill:#HEX) ═══
    cleanChart = cleanChart.replace(/(\w+\s*:\s*)"(#[0-9a-fA-F]{3,8})"/gi, '$1$2');
    cleanChart = cleanChart.replace(/(\w+\s*:\s*)"([0-9a-fA-F]{3,8})"/gi, '$1#$2');
    cleanChart = cleanChart.replace(/(,\s*)"(#[0-9a-fA-F]{3,8})"/gi, '$1$2');
    cleanChart = cleanChart.replace(/(,\s*)"([0-9a-fA-F]{3,8})"/gi, '$1#$2');
    cleanChart = cleanChart.replace(/((?:fill|stroke|color|background|bg)\s*:\s*)([0-9][0-9a-fA-F]{5,7})(?=\s*[,;\n\r\)]|$)/gi, '$1#$2');
    cleanChart = cleanChart.replace(/((?:fill|stroke|color|background|bg)\s*:\s*)([0-9][0-9a-fA-F]{2})(?=\s*[,;\n\r\)]|$)/gi, '$1#$2');

    // ═══ ARROW SYNTAX CORRECTIONS ═══
    cleanChart = cleanChart.replace(/-{3,}>/g, '-->');
    cleanChart = cleanChart.replace(/={3,}>/g, '==>');
    cleanChart = cleanChart.replace(/\.{3,}>/g, '..>');
    cleanChart = cleanChart.replace(/-\.-/g, '-.->');
    cleanChart = cleanChart.replace(/-\.->>/g, '-.->');

    // ═══ KEYWORD SAFETY ═══
    cleanChart = cleanChart.replace(/([^\n\r])\s*\bend\b/g, '$1\nend');

    cleanChart = cleanChart.replace(/\n{3,}/g, '\n\n');
    return mathProtected.restore(cleanChart);
}

export function quickFixMermaid(code: string, errorMessage: string): string | null {
    if (!code) return null;

    let fixed = code;
    let changed = false;

    const beforeHex = fixed;
    fixed = fixed.replace(/(\w+\s*:\s*)"(#[0-9a-fA-F]{3,8})"/gi, '$1$2');
    fixed = fixed.replace(/(\w+\s*:\s*)"([0-9a-fA-F]{3,8})"/gi, '$1#$2');
    if (fixed !== beforeHex) changed = true;

    const beforeEnd = fixed;
    fixed = fixed.replace(/([^\n])\s*\bend\b/g, '$1\nend');
    if (fixed !== beforeEnd) changed = true;

    const beforeArrow = fixed;
    fixed = fixed.replace(/-\.-/g, '-.->');
    fixed = fixed.replace(/-\.->>/g, '-.->');
    if (fixed !== beforeArrow) changed = true;

    return changed ? fixed.trim() : null;
}
