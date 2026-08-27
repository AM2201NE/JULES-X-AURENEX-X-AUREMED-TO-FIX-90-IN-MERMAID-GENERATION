export function normalizeScientificMath(text: string): string {
    if (!text || typeof text !== 'string') return '';

    // If it already has $$...$$ or \(...\), return as is
    if (text.includes('$$') || text.includes('\\(')) return text;

    let result = text;

    // Convert ions and chemical charges safely
    result = result.replace(/\bH\+/g, '$$H^+$$');
    result = result.replace(/\bH-/g, '$$H^-$$');
    result = result.replace(/\be-/g, '$$e^-$$');
    result = result.replace(/\be\u2212/g, '$$e^-$$');
    result = result.replace(/\bNa\+/g, '$$Na^+$$');
    result = result.replace(/\bCa2\+/g, '$$Ca^{2+}$$');
    result = result.replace(/\bFe3\+/g, '$$Fe^{3+}$$');
    result = result.replace(/\bCl-/g, '$$Cl^-$$');
    result = result.replace(/\bH2O\b/g, '$$H_2O$$');
    result = result.replace(/\bCO2\b/g, '$$CO_2$$');
    result = result.replace(/\bSO4\^?2-/g, '$$SO_4^{2-}$$');

    return result;
}
