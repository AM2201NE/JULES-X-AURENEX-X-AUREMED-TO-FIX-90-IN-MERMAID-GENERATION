export function extractStyles(code: string): Set<string> {
    const styles = new Set<string>();
    const matches = code.match(/classDef\s+[A-Za-z0-9_-]+\s+fill:[^\n\r]+/g);
    if (matches) {
        matches.forEach(m => styles.add(m.trim()));
    }
    return styles;
}

export function validateStyleIntegrity(originalCode: string, candidateCode: string): { valid: boolean; missingStyles: string[] } {
    const originalStyles = extractStyles(originalCode);
    const candidateStyles = extractStyles(candidateCode);
    const missingStyles: string[] = [];

    for (const style of originalStyles) {
        if (!candidateStyles.has(style)) {
            missingStyles.push(style);
        }
    }

    return {
        valid: missingStyles.length === 0,
        missingStyles,
    };
}
