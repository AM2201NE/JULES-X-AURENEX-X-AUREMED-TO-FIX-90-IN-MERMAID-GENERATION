// lib/mermaid/document.ts
// Canonical Mermaid Document - Single source of truth for all Mermaid rendering

import { MermaidDiagnostic } from './types';

export interface MermaidDocument {
    id: string;
    originalCode: string;
    canonicalCode: string;
    diagramType: string;
    svg: string | null;
    validation: {
        valid: boolean;
        error: string | null;
        line?: number;
        column?: number;
    };
    healing: {
        attempted: boolean;
        changed: boolean;
        rounds: number;
        source: 'none' | 'local' | 'ai';
    };
    math: {
        detected: boolean;
        validated: boolean;
    };
    theme: {
        background: string;
        textColor: string;
        edgeLabelBackground: string;
    };
    generatedAt: number;
}

export interface MermaidPipelineOptions {
    code: string;
    diagramType?: string;
    maxHealingRounds?: number;
    expectedLabels?: string[];
}

export interface MermaidPipelineResult {
    document: MermaidDocument;
    success: boolean;
}

export class MermaidPipeline {
    private static instance: MermaidPipeline;
    private documentCache = new Map<string, MermaidDocument>();

    static getInstance(): MermaidPipeline {
        if (!MermaidPipeline.instance) {
            MermaidPipeline.instance = new MermaidPipeline();
        }
        return MermaidPipeline.instance;
    }

    private generateId(): string {
        return 'mermaid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async process(options: MermaidPipelineOptions): Promise<MermaidPipelineResult> {
        const { code, maxHealingRounds = 3, expectedLabels = [] } = options;
        const cacheKey = this.hashCode(code);
        const cached = this.documentCache.get(cacheKey);
        if (cached && cached.svg) {
            return { document: cached, success: true };
        }

        const id = this.generateId();
        const originalCode = code;
        const normalizedCode = this.normalizeLexical(code);
        const diagramType = this.detectDiagramType(normalizedCode);
        const validation = await this.validateMermaid(normalizedCode);
        
        let canonicalCode = normalizedCode;
        let healing = {
            attempted: false,
            changed: false,
            rounds: 0,
            source: 'none' as 'none' | 'local' | 'ai'
        };

        if (!validation.valid) {
            const healResult = await this.healMermaid({
                code: normalizedCode,
                diagramType,
                parserError: validation.error ? { stage: 'parse', message: validation.error, severity: 'error' } : undefined,
                maxRounds: maxHealingRounds
            });
            canonicalCode = healResult.code;
            healing = {
                attempted: true,
                changed: healResult.changed,
                rounds: healResult.rounds,
                source: healResult.source
            };
            const reValidation = await this.validateMermaid(canonicalCode);
            if (!reValidation.valid) {
                const document: MermaidDocument = {
                    id, originalCode, canonicalCode, diagramType, svg: null,
                    validation: reValidation, healing,
                    math: { detected: this.detectMath(canonicalCode), validated: false },
                    theme: { background: '#1b1e24', textColor: '#ffffff', edgeLabelBackground: '#3f4248' },
                    generatedAt: Date.now()
                };
                this.documentCache.set(cacheKey, document);
                return { document, success: false };
            }
        }

        const svg = await this.renderMermaid(canonicalCode);
        const svgQA = await this.validateSvg(svg, expectedLabels);
        const processedSvg = this.enforceEdgeLabelContrast(svg);

        const document: MermaidDocument = {
            id, originalCode, canonicalCode, diagramType, svg: processedSvg,
            validation: { valid: true, error: null }, healing,
            math: { detected: this.detectMath(canonicalCode), validated: svgQA.mathValid },
            theme: { background: '#1b1e24', textColor: '#ffffff', edgeLabelBackground: '#3f4248' },
            generatedAt: Date.now()
        };

        this.documentCache.set(cacheKey, document);
        return { document, success: true };
    }

    private hashCode(code: string): string {
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            hash = (hash << 5) - hash + code.charCodeAt(i);
            hash |= 0;
        }
        return 'h_' + Math.abs(hash).toString(36);
    }

    private normalizeLexical(code: string): string {
        if (!code || code.trim() === '') return '';
        let clean = code.trim();
        clean = clean.replace(/^\uFEFF/, '');
        clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, '');
        clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        clean = clean.replace(/^```mermaid\s*\n?/i, '');
        clean = clean.replace(/^```\s*$/gm, '');
        clean = clean.replace(/\n```\s*$/gm, '');
        clean = clean.replace(/^```mermaid\s*\n```mermaid\s*/i, '```mermaid\n');
        const lastDiagramEnd = clean.lastIndexOf('end');
        if (lastDiagramEnd !== -1) {
            const afterEnd = clean.substring(lastDiagramEnd + 3);
            if (!afterEnd.trim() || /^[\s\S]*?```/.test(afterEnd)) {
                clean = clean.substring(0, lastDiagramEnd + 3);
            }
        }
        clean = clean.replace(/^---[\s\S]*?---/gm, (match) => {
            if (match.includes('config:') || match.includes('layout:')) return match;
            return '';
        });
        clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        clean = clean.replace(/\n{4,}/g, '\n\n\n');
        return clean.trim();
    }

    private detectDiagramType(code: string): string {
        const types = [
            'flowchart', 'graph', 'sequenceDiagram', 'classDiagram',
            'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'journey',
            'gantt', 'pie', 'quadrantChart', 'requirementDiagram',
            'gitGraph', 'timeline', 'mindmap', 'sankey', 'xychart',
            'block', 'architecture', 'kanban', 'packet', 'radar',
            'treemap', 'venn', 'c4', 'zenuml', 'ishikawa',
            'cynefin', 'userJourney', 'block-beta'
        ];
        for (const type of types) {
            if (new RegExp('^\\s*' + type + '\\b', 'i').test(code)) return type;
        }
        const frontmatterMatch = code.match(/^---[\s\S]*?---/);
        if (frontmatterMatch) {
            const fm = frontmatterMatch[0];
            for (const type of types) {
                if (new RegExp('\\b' + type + '\\b', 'i').test(fm)) return type;
            }
        }
        return 'flowchart';
    }

    private async validateMermaid(code: string): Promise<{ valid: boolean; error: string | null; line?: number; column?: number }> {
        try {
            const { parseMermaid } = await import('./parser');
            const result = await parseMermaid(code);
            return {
                valid: result.valid,
                error: result.error?.message || null,
                line: result.error?.line,
                column: result.error?.column
            };
        } catch (e: any) {
            return {
                valid: false,
                error: e?.message || 'Validation failed',
                line: e?.line,
                column: e?.column
            };
        }
    }

    private async healMermaid(options: {
        code: string;
        diagramType: string;
        parserError?: MermaidDiagnostic;
        maxRounds: number;
    }): Promise<{ code: string; changed: boolean; rounds: number; source: 'none' | 'local' | 'ai' }> {
        let currentCode = options.code;
        let changed = false;
        let rounds = 0;
        let source: 'none' | 'local' | 'ai' = 'none';

        const localFixed = this.applyLocalFixes(currentCode, options.parserError);
        if (localFixed !== currentCode) {
            currentCode = localFixed;
            changed = true;
            source = 'local';
            rounds++;
        }

        const validation = await this.validateMermaid(currentCode);
        if (validation.valid) {
            return { code: currentCode, changed, rounds, source };
        }

        const { fixMermaidDiagram } = await import('../../services/geminiService');
        
        for (let round = 1; round <= options.maxRounds; round++) {
            rounds = round;
            source = 'ai';
            
            try {
                const aiFixedCode = await fixMermaidDiagram(
                    currentCode,
                    options.parserError?.message || 'Parse error'
                );
                
                if (!aiFixedCode) {
                    continue;
                }

                const { sanitizeMermaidCode } = await import('./sanitizer');
                const sanitized = sanitizeMermaidCode(aiFixedCode);
                
                const aiValidation = await this.validateMermaid(sanitized);
                if (aiValidation.valid) {
                    currentCode = sanitized;
                    changed = true;
                    break;
                }
                
                currentCode = sanitized;
            } catch (e) {
                console.warn('[Mermaid] AI healing round ' + round + ' failed:', e);
            }
        }

        return { code: currentCode, changed, rounds, source };
    }

    private applyLocalFixes(code: string, error?: MermaidDiagnostic): string {
        let fixed = code;
        
        fixed = fixed.replace(/^```mermaid\s*\n?/i, '');
        fixed = fixed.replace(/\n```\s*$/gm, '');
        
        fixed = fixed.replace(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[\\[\\(]/gm, (match, id) => {
            if (/^[0-9]/.test(id)) return match.replace(id, 'n_' + id);
            return match;
        });
        
        fixed = fixed.replace(/(\w+)\s*\(([^)]*)\)/g, '$1["$2"]');
        fixed = fixed.replace(/(\w+)\s*\[([^\\]]*)\]/g, '$1["$2"]');
        
        fixed = fixed.replace(/--- \s*>/g, '-->');
        fixed = fixed.replace(/=== \s*>/g, '==>');
        fixed = fixed.replace(/\.\.\. \s*>/g, '..>');
        fixed = fixed.replace(/-\.-/g, '-.->');
        fixed = fixed.replace(/-\.->>/g, '-.->');
        
        fixed = fixed.replace(/(%%\{init:[\s\S]*?\}\%%\s*)+/g, '$1');
        
        fixed = fixed.replace(/[^\S\n]+$/gm, '');
        
        const subgraphCount = (fixed.match(/\bsubgraph\b/gi) || []).length;
        const endCount = (fixed.match(/\bend\b/gi) || []).length;
        if (subgraphCount > endCount) {
            for (let i = 0; i < subgraphCount - endCount; i++) {
                fixed += '\nend';
            }
        }
        
        fixed = fixed.replace(/([^\n])\s*\bend\b/g, '$1\nend');
        
        fixed = fixed.replace(/(\\w+\s*:\s*)"(#[0-9a-fA-F]{3,8})"/gi, '$1$2');
        fixed = fixed.replace(/(\\w+\s*:\s*)"([0-9a-fA-F]{3,8})"/gi, '$1#$2');
        fixed = fixed.replace(/(,\s*)"(#[0-9a-fA-F]{3,8})"/gi, '$1$2');
        fixed = fixed.replace(/(,\s*)"([0-9a-fA-F]{3,8})"/gi, '$1#$2');
        
        return fixed;
    }

    private async renderMermaid(code: string): Promise<string> {
        const { getMermaid } = await import('./mermaidRuntime');
        const mermaid = getMermaid();
        const renderId = 'aurenex_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const result = await mermaid.render(renderId, code);
        return result?.svg || '';
    }

    private async validateSvg(svg: string, expectedLabels: string[]): Promise<{ valid: boolean; errors: string[]; mathValid: boolean }> {
        const errors: string[] = [];
        if (!svg || !svg.trim()) {
            errors.push('Rendered SVG is empty');
            return { valid: false, errors, mathValid: false };
        }
        
        if (svg.includes('Syntax error') || svg.includes('mermaid-error')) {
            errors.push('Rendered SVG contains Mermaid error state');
        }
        
        for (const label of expectedLabels) {
            if (!svg.includes(label)) {
                errors.push('Expected label missing from rendered SVG: ' + label);
            }
        }
        
        const hasMath = svg.includes('foreignObject') && svg.includes('katex');
        const mathValid = !hasMath || (hasMath && !svg.includes('Parse error'));
        
        return { valid: errors.length === 0, errors, mathValid };
    }

    private enforceEdgeLabelContrast(svg: string): string {
        const styleInjection = '<style>.edgeLabel, .edgeLabel > * { color: #ffffff !important; } .edgeLabel rect { fill: #3f4248 !important; } .edgeLabel text, .edgeLabel tspan, .edgeLabel span { fill: #ffffff !important; color: #ffffff !important; } .edgeLabel > g > rect { fill: #3f4248 !important; } .edgeLabel[class*="class"] { all: initial; } .edgeLabel[class*="class"] rect { fill: #3f4248 !important; } .edgeLabel[class*="class"] text, .edgeLabel[class*="class"] tspan { fill: #ffffff !important; }</style>';
        if (svg.includes('<svg')) {
            return svg.replace('<svg', styleInjection + '<svg');
        }
        return '<div style="display: inline-block;">' + styleInjection + svg + '</div>';
    }

    private detectMath(code: string): boolean {
        return /\$[\s\S]*?\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\[[\s\S]*?\\]/.test(code);
    }

    getCachedDocument(code: string): MermaidDocument | null {
        const cacheKey = this.hashCode(code);
        return this.documentCache.get(cacheKey) || null;
    }

    clearCache(): void {
        this.documentCache.clear();
    }
}

export async function createMermaidDocument(code: string, options?: Partial<MermaidPipelineOptions>): Promise<MermaidDocument> {
    const pipeline = MermaidPipeline.getInstance();
    const result = await pipeline.process({ code, ...options });
    return result.document;
}
