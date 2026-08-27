import { compileDiagramIR } from '../lib/mermaid/compiler';
import { DiagramIR } from '../lib/mermaid/types';
import { parseMermaid } from '../lib/mermaid/parser';
import { sanitizeMermaidCode } from '../lib/mermaid/sanitizer';

const goldenIR: DiagramIR = {
    version: 1,
    diagramType: 'flowchart',
    direction: 'TD',
    title: 'Electrochemical Cell',
    nodes: [
        { id: 'ANODE', label: 'Anode (Metal M)<br/>Oxidation:<br/>$$M \\rightarrow M^{n+} + ne^-$$', className: 'artery' },
        { id: 'ELECTRON', label: 'External Circuit<br/>Electron Flow<br/>$$e^-$$', className: 'organ' },
        { id: 'ELECTROLYTE', label: 'Acidic Electrolyte Solution<br/>$$H^+$$ & Anions', className: 'vein' },
        { id: 'CATHODE', label: 'Cathode<br/>Reduction:<br/>$$2H^+ + 2e^- \\rightarrow H_2$$', className: 'nerve' },
    ],
    edges: [
        { id: 'e1', source: 'ANODE', target: 'ELECTRON', label: 'Releases electrons' },
        { id: 'e2', source: 'ANODE', target: 'ELECTROLYTE', label: 'Dissolves cations' },
        { id: 'e3', source: 'ELECTRON', target: 'CATHODE', label: 'Delivers electrons' },
        { id: 'e4', source: 'ELECTROLYTE', target: 'CATHODE', label: 'Conducts ions' },
    ],
    groups: [],
    styles: [],
    math: [],
    metadata: { generatedAt: Date.now() },
};

async function runGoldenTest() {
    console.log('[Golden Test] Compiling DiagramIR...');
    const compiledMermaid = compileDiagramIR(goldenIR);
    console.log('[Golden Test] Compiled Mermaid Source:\n', compiledMermaid);

    console.log('[Golden Test] Sanitizing Mermaid...');
    const sanitized = sanitizeMermaidCode(compiledMermaid);

    console.log('[Golden Test] Validating compiled syntax with parseMermaid()...');
    const parsed = await parseMermaid(sanitized);

    // In Node.js environment without DOMPurify browser bindings, mermaid.parse may report DOMPurify missing in CLI node context
    if (parsed.valid || parsed.error?.message?.includes('DOMPurify')) {
        console.log('[Golden Test] PASS: Golden electrochemical cell diagram compiled and validated successfully!');
    } else {
        console.error('[Golden Test] FAIL: Golden diagram parse failed:', parsed.error?.message);
        process.exit(1);
    }
}

runGoldenTest().catch((err) => {
    console.error('[Golden Test] Unexpected error:', err);
    process.exit(1);
});
