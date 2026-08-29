import { MermaidHealingContext } from './types';
import { AURENEX_MERMAID_PALETTE } from './styles';
import { parseMermaid } from './parser';

const HEALED_CACHE_KEY = 'AURENEX_MERMAID_HEALED_CACHE';
const memoryHealedCache = new Map<string, string>();

function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(36);
}

export function getCachedHealedMermaid(rawCode: string): string | null {
    if (!rawCode || rawCode.trim() === '') return null;
    const key = hashString(rawCode.trim());
    if (memoryHealedCache.has(key)) {
        return memoryHealedCache.get(key)!;
    }
    try {
        const stored = localStorage.getItem(`${HEALED_CACHE_KEY}_${key}`);
        if (stored) {
            memoryHealedCache.set(key, stored);
            return stored;
        }
    } catch (e) { }
    return null;
}

export function setCachedHealedMermaid(rawCode: string, healedCode: string): void {
    if (!rawCode || !healedCode || rawCode.trim() === '' || healedCode.trim() === '') return;
    const key = hashString(rawCode.trim());
    const cleanHealed = healedCode.trim();
    memoryHealedCache.set(key, cleanHealed);
    try {
        localStorage.setItem(`${HEALED_CACHE_KEY}_${key}`, cleanHealed);
    } catch (e) { }
}

export function buildHealingContext(code: string, errorMessage: string): MermaidHealingContext {
    return {
        code,
        diagramType: 'flowchart',
        parserError: {
            stage: 'parse',
            message: errorMessage,
            severity: 'error',
        },
        structuralErrors: [],
        semanticErrors: [],
        expectedNodes: [],
        missingNodes: [],
        expectedEdges: [],
        missingEdges: [],
        expectedClasses: [],
        missingClasses: [],
        protectedMath: [],
        immutableColorPalette: AURENEX_MERMAID_PALETTE,
    };
}
