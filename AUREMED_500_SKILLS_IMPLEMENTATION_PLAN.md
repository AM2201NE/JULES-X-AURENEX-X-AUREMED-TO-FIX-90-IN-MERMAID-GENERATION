# AureMed 500+ Skills Local Embedding - Comprehensive Implementation Plan

## Executive Summary

This plan outlines the complete implementation to embed **550+ medical research skills** locally in the AureMed codebase, with full skill definitions (instructions, execution steps, reference modules, hard rules, maturity frameworks), real API integration (PubMed, ClinicalTrials.gov), clickable citations, and image/diagram generation capabilities. **No code execution will occur until explicit user approval.**

---

## Current State Analysis

### What's Already Implemented ✅
| Component | Status | Details |
|-----------|--------|---------|
| Local skills JSON (`lib/skills/medical-skills-data.json`) | **39 skills** | 5 categories, basic structure with name, description, triggers, inputSchema |
| `MedicalSkillsRegistry.initialize()` | **Modified** | Loads from local JSON instead of GitHub |
| `executeSkillWithAPIs()` | **Partial** | Evidence Insight → PubMed, Protocol Design → ClinicalTrials.gov, Data Analysis/Academic Writing → PubMed (added recently) |
| `executeSkillChain()` | **Implemented** | Up to 5 steps, chains skills locally |
| Evidence conversion | **Implemented** | PubMed (PMID links), ClinicalTrials.gov (NCT links) |
| Timing instrumentation | **Implemented** | agent_start, model_call_start, skill_execution_start/end, agent_end |
| `evidence_ready` event | **Implemented** | Emits evidence array for UI panel |
| System prompt | **Upgraded** | CRITICAL MANDATORY REQUIREMENTS for skill usage |

### What's Missing ❌
| Gap | Impact |
|-----|--------|
| **Only 39 skills** vs 550+ required | 93% of skills missing |
| **No full skill definitions** | Missing: instructions, execution steps, reference modules, hard rules, maturity frameworks |
| **No clickable citations in UI** | Evidence panel shows raw data, not formatted citations |
| **No image/diagram generation** | Skills can't generate mermaid diagrams, charts, figures |
| **No skill-specific API call specs** | Each skill needs defined API endpoints, parameters, response handling |
| **No citation formatting standards** | Inconsistent citation formats across skills |

---

## Phase 1: Source All 550+ Skills from AIPOCH Repository

### 1.1 Repository Structure Analysis
**Source:** `https://github.com/aipoch/medical-research-skills`
- **`scientific-skills/`** - ~300 skills (detailed SKILL.md with full specifications)
- **`awesome-med-research-skills/`** - ~250 skills (curated list with descriptions)

### 1.2 Skill Categories & Distribution (Target: 550+)

| Category | Stage | Current | Target | Source Folders |
|----------|-------|---------|--------|----------------|
| **Evidence Insight** | 1 | 8 | **120+** | `scientific-skills/Evidence Insight/`, `awesome-med-research-skills/Evidence Insight/` |
| **Data Analysis** | 2 | 8 | **100+** | `scientific-skills/Data Analysis/`, `awesome-med-research-skills/Data Analysis/` |
| **Academic Writing** | 3 | 10 | **120+** | `scientific-skills/Academic Writing/`, `awesome-med-research-skills/Academic Writing/` |
| **Protocol Design** | 4 | 3 | **80+** | `scientific-skills/Protocol Design/`, `awesome-med-research-skills/Protocol Design/` |
| **Other** | 5 | 5 | **130+** | `scientific-skills/Other/`, `awesome-med-research-skills/Other/` |
| **TOTAL** | | **39** | **550+** | |

### 1.3 Skill Discovery Method
```bash
# For each category in both repo sections:
# 1. List all skill directories
# 2. Fetch SKILL.md for each
# 3. Parse full metadata (frontmatter + all sections)
# 4. Map to local JSON structure
```

---

## Phase 2: Expanded Skill JSON Schema Design

### 2.1 Current Schema (Insufficient)
```json
{
  "name": "skill-name",
  "description": "Brief description",
  "triggers": ["trigger1", "trigger2"],
  "inputSchema": { ... },
  "category": "Evidence Insight",
  "subcategory": "Biomarker Mapping"
}
```

### 2.2 Target Schema (Complete - Matches SKILL.md Structure)
```json
{
  "name": "biomarker-landscape-scanner",
  "description": "Comprehensive biomarker landscape analysis...",
  "license": "MIT",
  "author": "AIPOCH",
  "category": "Evidence Insight",
  "subcategory": "Biomarker Mapping",
  "triggers": ["biomarker landscape", "biomarker mapping", "biomarker discovery"],
  "version": "1.0.0",
  "maturity": "production",
  
  // === FULL SKILL DEFINITION ===
  "instructions": "Complete SKILL.md content as markdown string...",
  "executionSteps": [
    {
      "stepNumber": 1,
      "title": "Define Biomarker Scope",
      "description": "Identify disease, biomarker type, use case...",
      "subSteps": [
        "Extract disease context from query",
        "Determine biomarker type (genomic/protein/imaging/etc.)",
        "Identify intended use case (diagnosis/prognosis/response)"
      ],
      "tools": ["pubmed-search", "biomarker-ontology-mapper"],
      "outputs": ["scope-definition", "search-strategy"]
    },
    {
      "stepNumber": 2,
      "title": "Execute Multi-Database Search",
      "description": "Search PubMed, Embase, ClinicalTrials.gov...",
      "subSteps": [...],
      "tools": ["pubmed-api", "clinicaltrials-api"],
      "outputs": ["raw-articles", "trial-records"]
    }
    // ... all steps from SKILL.md
  ],
  
  "referenceModules": [
    {
      "name": "biomarker-maturity-framework",
      "path": "references/biomarker-maturity-framework.md",
      "purpose": "Defines evidence tiers for biomarker validation",
      "usedInSections": ["B", "C", "D"]
    },
    {
      "name": "pubmed-search-strategy-guide",
      "path": "references/pubmed-search-strategy-guide.md",
      "purpose": "Standardized PubMed query construction",
      "usedInSections": ["A", "B"]
    }
  ],
  
  "hardRules": [
    "NEVER claim biomarker validation without Tier 3+ evidence",
    "ALWAYS specify biomarker type and use case in output",
    "MUST include PMID for every cited study",
    "MUST distinguish between analytical and clinical validity"
  ],
  
  "maturityFrameworks": [
    {
      "name": "Biomarker Maturity Framework (FDA-NIH BEST)",
      "tiers": [
        {
          "tier": 1,
          "label": "Exploratory",
          "minimumEvidence": "Single study, retrospective, small cohort",
          "cannotClaim": "Clinical utility, diagnostic accuracy, treatment guidance"
        },
        {
          "tier": 2,
          "label": "Probable",
          "minimumEvidence": "Multiple independent studies, prospective design",
          "cannotClaim": "Definitive clinical utility, regulatory approval"
        },
        {
          "tier": 3,
          "label": "Established",
          "minimumEvidence": "Large prospective trials, meta-analyses, regulatory qualification",
          "cannotClaim": "Universal applicability beyond studied populations"
        },
        {
          "tier": 4,
          "label": "Clinical Standard",
          "minimumEvidence": "Guideline-recommended, regulatory approved, standard of care",
          "cannotClaim": "Superiority over all alternatives in all contexts"
        }
      ]
    }
  ],
  
  // === API SPECIFICATIONS ===
  "apiSpecifications": {
    "primary": {
      "name": "PubMed E-utilities",
      "baseUrl": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
      "endpoints": {
        "search": "esearch.fcgi",
        "fetch": "efetch.fcgi"
      },
      "parameters": {
        "db": "pubmed",
        "retmax": 50,
        "retmode": "json",
        "term": "{constructed_query}",
        "mindate": "{date_range_start}",
        "maxdate": "{date_range_end}"
      },
      "responseFormat": "xml",
      "rateLimit": "3 requests/second (no API key), 10/second (with API key)"
    },
    "secondary": {
      "name": "ClinicalTrials.gov API v2",
      "baseUrl": "https://clinicaltrials.gov/api/v2/",
      "endpoints": {
        "search": "studies"
      },
      "parameters": {
        "query.cond": "{condition}",
        "query.term": "{intervention}",
        "filter.overallStatus": "RECRUITING|ACTIVE_NOT_RECRUITING",
        "pageSize": 50
      },
      "responseFormat": "json",
      "rateLimit": "No strict limit, be respectful"
    }
  },
  
  // === CITATION FORMATTING ===
  "citationFormat": {
    "pubmed": {
      "template": "[{authors}. {title}. {journal}. {year};{volume}({issue}):{pages}. PMID: {pmid}]({pubmed_url})",
      "clickable": true,
      "urlTemplate": "https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
      "requiredFields": ["pmid", "title", "authors", "journal", "year"]
    },
    "clinicaltrials": {
      "template": "[{title}. ClinicalTrials.gov Identifier: {nctId}]({ct_url})",
      "clickable": true,
      "urlTemplate": "https://clinicaltrials.gov/study/{nctId}",
      "requiredFields": ["nctId", "title", "status"]
    },
    "doi": {
      "template": "[{authors}. {title}. {journal}. {year}. doi:{doi}]({doi_url})",
      "clickable": true,
      "urlTemplate": "https://doi.org/{doi}",
      "requiredFields": ["doi"]
    }
  },
  
  // === IMAGE/DIAGRAM GENERATION ===
  "imageGeneration": {
    "enabled": true,
    "types": ["mermaid", "chart", "figure"],
    "mermaidTemplates": {
      "biomarker-pathway": {
        "description": "Biomarker discovery to validation pathway",
        "template": "flowchart TD\n  A[Discovery] --> B[Analytical Validation]\n  B --> C[Clinical Validation]\n  C --> D[Clinical Utility]\n  D --> E[Regulatory Approval]\n  classDef tier1 fill:#ffebee,stroke:#c62828,color:#000\n  classDef tier2 fill:#fff3e0,stroke:#ef6c00,color:#000\n  classDef tier3 fill:#e8f5e9,stroke:#2e7d32,color:#fff\n  classDef tier4 fill:#e3f2fd,stroke:#1565c0,color:#fff\n  class A tier1; class B tier2; class C tier3; class D tier3; class E tier4"
      },
      "evidence-map": {
        "description": "Evidence landscape visualization",
        "template": "mindmap\n  root((Biomarker Landscape))\n    Genomic\n      DNA\n      RNA\n    Protein\n      Plasma\n      Tissue\n    Imaging\n      PET\n      MRI\n    Clinical\n      Scores\n      Outcomes"
      }
    },
    "chartTypes": ["bar", "line", "scatter", "heatmap", "forest-plot", "km-curve"],
    "outputFormat": "mermaid_code_block"
  },
  
  // === INPUT/OUTPUT SCHEMAS (Enhanced) ===
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Research question" },
      "context": { "type": "string", "description": "Disease, population, constraints" },
      "biomarkerType": { 
        "type": "string", 
        "enum": ["genomic", "transcriptomic", "protein", "metabolite", "imaging", "pathology", "clinical score", "liquid biopsy", "multimodal"],
        "description": "Type of biomarker"
      },
      "useCase": {
        "type": "string",
        "enum": ["diagnosis", "early detection", "differential diagnosis", "prognosis", "treatment response", "recurrence", "MRD", "monitoring", "subtype stratification"],
        "description": "Intended use case"
      },
      "databases": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Databases to search"
      },
      "dateRange": { "type": "string", "description": "e.g., 'last 5 years'" },
      "maturityThreshold": {
        "type": "string",
        "enum": ["Tier 1", "Tier 2", "Tier 3", "Tier 4"],
        "description": "Minimum evidence tier"
      }
    },
    "required": ["query"]
  },
  
  "outputSchema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "sections": {
        "type": "object",
        "properties": {
          "A": { "type": "string", "description": "Biomarker Landscape Overview" },
          "B": { "type": "string", "description": "Evidence Table with Maturity Tiers" },
          "C": { "type": "string", "description": "Gap Analysis & White Space" },
          "D": { "type": "string", "description": "Validation Roadmap" },
          "E": { "type": "string", "description": "Regulatory Pathway Assessment" }
        }
      },
      "references": { "type": "array", "items": { "type": "string" } },
      "citations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "pmid": { "type": "string" },
            "nctId": { "type": "string" },
            "doi": { "type": "string" },
            "formatted": { "type": "string" },
            "clickableUrl": { "type": "string" },
            "sourceType": { "type": "string", "enum": ["pubmed", "clinicaltrials", "doi"] }
          }
        }
      },
      "images": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["mermaid", "chart"] },
            "title": { "type": "string" },
            "code": { "type": "string" },
            "description": { "type": "string" }
          }
        }
      },
      "confidence": { "type": "number" },
      "nextSteps": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

---

## Phase 3: Data Pipeline - GitHub → Local JSON

### 3.1 Skill Extraction Script (Node.js/TypeScript)
```typescript
// scripts/extract-skills-from-github.ts
// Run once to generate complete medical-skills-data.json

interface SkillExtractionConfig {
  repoOwner: 'aipoch';
  repoName: 'medical-research-skills';
  sections: ['scientific-skills', 'awesome-med-research-skills'];
  categories: ['Evidence Insight', 'Data Analysis', 'Academic Writing', 'Protocol Design', 'Other'];
  outputPath: 'lib/skills/medical-skills-data.json';
}

// Steps:
// 1. GitHub API: List all skill directories per category per section
// 2. For each skill: Fetch SKILL.md from raw.githubusercontent.com
// 3. Parse SKILL.md: frontmatter + all sections (instructions, execution steps, reference modules, hard rules, maturity frameworks, input/output schemas)
// 4. Map to target JSON schema (Section 2.2)
// 5. Deduplicate by skill name (prefer scientific-skills version)
// 6. Write complete JSON to lib/skills/medical-skills-data.json
// 7. Generate TypeScript types for validation
```

### 3.2 Reference Module Handling
- **Option A**: Embed reference module content directly in skill JSON (larger file, self-contained)
- **Option B**: Store reference modules as separate files in `lib/skills/references/`, reference by path
- **Recommendation**: Option B for maintainability, but include key excerpts in skill JSON

### 3.3 Estimated Output Size
- 550 skills × ~5KB average = ~2.75 MB JSON
- Gzipped: ~400 KB (acceptable for bundle)
- Load time: <100ms local vs 5-15s GitHub fetch

---

## Phase 4: MedicalSkillsRegistry Enhancements

### 4.1 Enhanced Skill Loading
```typescript
// lib/medicalSkillsRegistry.ts - Modifications needed

// 1. Load reference modules from separate files
private async loadReferenceModules(skillKey: string): Promise<ReferenceModule[]> {
  const refDir = `lib/skills/references/${skillKey}/`;
  // Read all .md files in directory, parse as ReferenceModule[]
}

// 2. Parse full skill metadata from JSON (not just basic fields)
private parseSkillFromJSON(skillData: any, category: SkillCategory): SkillMetadata {
  return {
    ...basicFields,
    instructions: skillData.instructions,
    executionSteps: skillData.executionSteps,
    referenceModules: skillData.referenceModules,
    hardRules: skillData.hardRules,
    maturityFrameworks: skillData.maturityFrameworks,
    apiSpecifications: skillData.apiSpecifications,
    citationFormat: skillData.citationFormat,
    imageGeneration: skillData.imageGeneration,
    inputSchema: skillData.inputSchema,
    outputSchema: skillData.outputSchema,
  };
}

// 3. Build function declarations with full schemas
private buildFunctionDeclarations(): void {
  // Use skill.outputSchema for response validation
  // Include all inputSchema properties in function declaration
}
```

### 4.2 Real API Execution Engine
```typescript
// NEW: lib/skillApiExecutor.ts

class SkillApiExecutor {
  // PubMed API
  async searchPubMed(query: string, options: PubMedSearchOptions): Promise<PubMedResult> {
    // 1. Construct query with MeSH terms, filters
    // 2. Call esearch.fcgi → get PMIDs
    // 3. Call efetch.fcgi → get full records (XML)
    // 4. Parse XML → structured articles with PMID, title, abstract, authors, journal, date, DOI
    // 5. Return typed result
  }
  
  async fetchPubMedDetails(pmids: string[]): Promise<PubMedArticle[]> {
    // Batch fetch for efficiency
  }
  
  // ClinicalTrials.gov API
  async searchClinicalTrials(query: ClinicalTrialsSearchOptions): Promise<ClinicalTrialsResult> {
    // Call /api/v2/studies with query parameters
    // Parse JSON → structured trials with NCT ID, title, status, phase, conditions, sponsor
  }
  
  // Skill-specific API routing
  async executeSkillApi(skill: SkillMetadata, args: Record<string, unknown>): Promise<SkillApiResult> {
    const apiSpec = skill.apiSpecifications;
    switch (skill.category) {
      case 'Evidence Insight':
        return this.executeEvidenceInsightApi(skill, args);
      case 'Data Analysis':
        return this.executeDataAnalysisApi(skill, args);
      case 'Academic Writing':
        return this.executeAcademicWritingApi(skill, args);
      case 'Protocol Design':
        return this.executeProtocolDesignApi(skill, args);
      case 'Other':
        return this.executeUtilityApi(skill, args);
    }
  }
  
  // Evidence Insight: PubMed search + evidence mapping
  private async executeEvidenceInsightApi(skill: SkillMetadata, args: any): Promise<SkillApiResult> {
    const query = this.constructPubMedQuery(skill, args);
    const articles = await this.searchPubMed(query, { maxResults: 50 });
    const evidenceMap = this.mapEvidence(articles, skill.maturityFrameworks);
    const images = this.generateMermaidDiagrams(skill, evidenceMap);
    return { articles, evidenceMap, images, citations: this.formatCitations(articles, 'pubmed') };
  }
  
  // Data Analysis: Fetch data + generate analysis code
  private async executeDataAnalysisApi(skill: SkillMetadata, args: any): Promise<SkillApiResult> {
    const articles = await this.searchPubMed(args.query, { maxResults: 30 });
    const analysisCode = this.generateAnalysisCode(skill, articles, args);
    const images = this.generateCharts(skill, articles);
    return { analysisCode, articles, images, citations: this.formatCitations(articles, 'pubmed') };
  }
  
  // Academic Writing: Use evidence from chain + fetch more if needed
  private async executeAcademicWritingApi(skill: SkillMetadata, args: any): Promise<SkillApiResult> {
    const priorEvidence = args._chainContext?.previousResults;
    let articles = priorEvidence?.articles || [];
    if (articles.length < 10) {
      const more = await this.searchPubMed(args.query, { maxResults: 20 });
      articles = [...articles, ...more];
    }
    const manuscript = this.generateManuscriptSections(skill, articles, args);
    const images = this.generateFigures(skill, articles);
    return { manuscript, articles, images, citations: this.formatCitations(articles, 'pubmed') };
  }
  
  // Protocol Design: ClinicalTrials.gov search
  private async executeProtocolDesignApi(skill: SkillMetadata, args: any): Promise<SkillApiResult> {
    const trials = await this.searchClinicalTrials({ condition: args.query, maxResults: 20 });
    const protocol = this.generateProtocol(skill, trials, args);
    const images = this.generateProtocolDiagrams(skill, trials);
    return { protocol, trials, images, citations: this.formatCitations(trials, 'clinicaltrials') };
  }
  
  // Citation formatting per skill specification
  private formatCitations(items: any[], sourceType: 'pubmed' | 'clinicaltrials'): FormattedCitation[] {
    // Use skill.citationFormat template
    // Return clickable citations with URLs
  }
  
  // Mermaid diagram generation from templates
  private generateMermaidDiagrams(skill: SkillMetadata, data: any): MermaidDiagram[] {
    // Use skill.imageGeneration.mermaidTemplates
    // Inject data into templates
    // Return array of { type: 'mermaid', title, code, description }
  }
}
```

### 4.3 Skill Chain Execution with Full Context
```typescript
// Enhanced executeSkillChain in MedicalSkillsRegistry

async executeSkillChain(
  initialSkillName: string,
  initialArgs: Record<string, unknown>,
  userQuery: string,
  maxSteps: number = 5
): Promise<SkillExecutionResult[]> {
  const chainResults: SkillExecutionResult[] = [];
  let currentSkillName = initialSkillName;
  let currentSkillArgs = initialArgs;
  const chainContext: SkillChainContext = { ... };
  
  for (let step = 0; step < maxSteps; step++) {
    const skill = this.getSkillByFunctionName(currentSkillName);
    
    // 1. Load reference modules for this skill
    const refModules = await this.loadReferenceModules(skill.sourcePath);
    
    // 2. Execute skill with API calls
    const apiExecutor = new SkillApiExecutor();
    const apiResult = await apiExecutor.executeSkillApi(skill, currentSkillArgs);
    
    // 3. Build structured output per skill.outputSchema
    const structuredOutput = this.buildStructuredOutput(skill, apiResult, chainContext);
    
    // 4. Generate citations (clickable)
    const citations = apiResult.citations;
    
    // 5. Generate images/diagrams
    const images = apiResult.images;
    
    // 6. Determine next skill
    const nextSkill = this.suggestNextSkill(skill, structuredOutput, userQuery);
    
    chainResults.push({
      success: true,
      output: structuredOutput,
      sectionsCompleted: skill.executionSteps.map(s => s.title),
      referencesUsed: citations.map(c => c.formatted),
      citations: citations,  // NEW: clickable citations
      images: images,        // NEW: mermaid diagrams, charts
      skillName: skill.name,
      nextRecommendedSkill: nextSkill?.name,
      nextRecommendedSkillInput: this.prepareNextSkillInput(skill, nextSkill, currentSkillArgs, structuredOutput)
    });
    
    if (!nextSkill) break;
    currentSkillName = `skill_${nextSkill.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    currentSkillArgs = chainResults[chainResults.length - 1].nextRecommendedSkillInput!;
  }
  
  return chainResults;
}
```

---

## Phase 5: GeminiService Integration - Citations & Images

### 5.1 Evidence Panel - Clickable Citations
```typescript
// services/geminiService.ts - Enhanced evidence handling

// Current: evidence.push({ source_type: 'pubmed_article', source_ref: pmid, ... })
// Target: Rich citation objects with clickable URLs

interface EnhancedEvidence extends Evidence {
  // Existing fields...
  clickableUrl: string;
  formattedCitation: string;  // Ready-to-render markdown with link
  citationType: 'pubmed' | 'clinicaltrials' | 'doi' | 'workspace';
  metadata: {
    pmid?: string;
    nctId?: string;
    doi?: string;
    authors?: string[];
    journal?: string;
    year?: number;
    title?: string;
  };
}

// In skill chain execution loop:
for (const skillResult of chainResults) {
  if (skillResult.citations) {
    for (const citation of skillResult.citations) {
      evidence.push({
        evidence_id: uuidv4(),
        source_type: citation.sourceType,
        source_ref: citation.pmid || citation.nctId || citation.doi,
        page_id: citation.pmid || citation.nctId || citation.doi,
        source_deeplink: citation.clickableUrl,
        snippet: citation.formattedCitation,
        confidence: 0.95,
        pageTitle: citation.title || 'Citation',
        clickableUrl: citation.clickableUrl,
        formattedCitation: citation.formattedCitation,
        citationType: citation.sourceType,
        metadata: citation.metadata
      });
    }
  }
  
  if (skillResult.images) {
    for (const image of skillResult.images) {
      evidence.push({
        evidence_id: uuidv4(),
        source_type: 'generated_diagram',
        source_ref: `diagram_${Date.now()}`,
        page_id: 'generated',
        source_deeplink: '',
        snippet: image.code,  // Mermaid code
        confidence: 1.0,
        pageTitle: image.title,
        clickableUrl: '',
        formattedCitation: `\`\`\`mermaid\n${image.code}\n\`\`\``,
        citationType: 'diagram',
        metadata: { diagramType: image.type, description: image.description }
      });
    }
  }
}

// Yield evidence_ready with enhanced evidence
yield { type: 'evidence_ready', payload: { evidence } };
```

### 5.2 UI Panel Integration (Frontend)
```typescript
// components/AiChatWindow.tsx or new EvidencePanel.tsx

// Render evidence with clickable citations
function EvidencePanel({ evidence }: { evidence: EnhancedEvidence[] }) {
  return (
    <div className="evidence-panel">
      {evidence.map(item => (
        <div key={item.evidence_id} className="evidence-item">
          {item.citationType === 'diagram' ? (
            // Render Mermaid diagram
            <MermaidDiagram code={item.snippet} title={item.pageTitle} />
          ) : (
            <>
              <a 
                href={item.clickableUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="citation-link"
              >
                {item.formattedCitation}
              </a>
              <div className="evidence-meta">
                <span className="source-badge">{item.citationType.toUpperCase()}</span>
                <span className="confidence">{Math.round(item.confidence * 100)}%</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 5.3 Mermaid Diagram Rendering
```typescript
// lib/mermaidRenderer.ts (new or extend mermaidUtils.ts)

import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  flowchart: { defaultRenderer: 'elk' },
  securityLevel: 'loose'
});

export async function renderMermaidToSvg(code: string): Promise<string> {
  const { svg } = await mermaid.render(`diagram-${Date.now()}`, code);
  return svg;
}

export function renderMermaidToElement(element: HTMLElement, code: string): Promise<void> {
  return mermaid.render(`diagram-${Date.now()}`, code).then(({ svg }) => {
    element.innerHTML = svg;
  });
}
```

---

## Phase 6: Skill Categories - API Specifications Detail

### 6.1 Evidence Insight Skills (120+) → PubMed API
| Skill Pattern | API Call | Parameters | Output |
|---------------|----------|------------|--------|
| `*-search*`, `*-collector*`, `*-scanner*` | `esearch.fcgi` + `efetch.fcgi` | query, dateRange, databases, studyTypes | Articles with PMID, abstract, metadata |
| `*-ranker*`, `*-level*`, `*-grader*` | `efetch.fcgi` (batch) | PMIDs from prior step | Evidence tiers, quality scores |
| `*-mapper*`, `*-landscape*` | `esearch.fcgi` (multiple queries) | Faceted queries by biomarker type, disease | Structured evidence map |
| `*-gap*`, `*-whitespace*` | `esearch.fcgi` (comparative) | Topic + "review" vs "original research" | Gap analysis with missing areas |

### 6.2 Data Analysis Skills (100+) → PubMed + Code Generation
| Skill Pattern | API Call | Parameters | Output |
|---------------|----------|------------|--------|
| `*-analysis`, `*-screening` | `efetch.fcgi` (batch) | PMIDs, dataType (expression, variant, clinical) | R/Python code + data summary |
| `*-survival*`, `*-km*`, `*-cox*` | `efetch.fcgi` + ClinicalTrials | Survival endpoints, treatment arms | KM curves, Cox models, forest plots |
| `*-ml*`, `*-xgboost*`, `*-lightgbm*` | `efetch.fcgi` (large batch) | Features, outcomes, cohort specs | ML pipeline code + performance metrics |
| `*-visualization*`, `*-chart*`, `*-figure*` | N/A (uses fetched data) | Data from prior skills | Mermaid/Chart.js diagrams |

### 6.3 Academic Writing Skills (120+) → PubMed (for references)
| Skill Pattern | API Call | Parameters | Output |
|---------------|----------|------------|--------|
| `*-writer*`, `*-composer*`, `*-drafter*` | `efetch.fcgi` (targeted) | Specific PMIDs from evidence chain | Manuscript sections with inline citations |
| `*-reference*`, `*-citation*` | `efetch.fcgi` (batch) | Reference list PMIDs | Formatted bibliography (Vancouver/APA) |
| `*-journal*`, `*-matcher*` | N/A (uses local DB) | Manuscript topic, impact factor | Journal recommendations |

### 6.4 Protocol Design Skills (80+) → ClinicalTrials.gov API
| Skill Pattern | API Call | Parameters | Output |
|---------------|----------|------------|--------|
| `*-trial*`, `*-design*`, `*-planner*` | `/api/v2/studies` | Condition, intervention, phase, status | Trial designs, eligibility, endpoints |
| `*-hypothesis*`, `*-generation*` | `/api/v2/studies` + PubMed | Mechanism, target, disease | Hypothesis with supporting trials |
| `*-tox*`, `*-docking*` | PubMed (preclinical) | Target, compound, species | Preclinical protocol with safety endpoints |

### 6.5 Other Skills (130+) → Mixed/No API
| Skill Pattern | API Call | Parameters | Output |
|---------------|----------|------------|--------|
| `*-converter*` | N/A (local computation) | Value, fromUnit, toUnit | Converted value with formula |
| `*-checker*`, `*-auditor*` | PubMed (COI) / Local rules | Author names, grant IDs | COI report, compliance checklist |
| `*-presentation*`, `*-poster*`, `*-ppt*` | N/A (uses chain evidence) | Prior skill outputs | Mermaid diagrams, slide content |
| `*-summarizer*` | N/A (local LLM) | Text/audio input | Structured summary |

---

## Phase 7: Implementation Sequence

### Step 1: Skill Extraction (One-time Script)
```bash
# 1. Create extraction script
# 2. Run against GitHub API (needs GITHUB_TOKEN for rate limits)
# 3. Output: lib/skills/medical-skills-data.json (550+ skills)
# 4. Output: lib/skills/references/ (reference module files)
# 5. Validate JSON schema compliance
```

### Step 2: TypeScript Types Update
```typescript
// types.ts - Add new types
interface SkillMetadata {
  // ... existing
  instructions: string;
  executionSteps: ExecutionStep[];
  referenceModules: ReferenceModule[];
  hardRules: string[];
  maturityFrameworks: MaturityFramework[];
  apiSpecifications: ApiSpecifications;
  citationFormat: CitationFormat;
  imageGeneration: ImageGenerationSpec;
}

interface FormattedCitation {
  pmid?: string;
  nctId?: string;
  doi?: string;
  formatted: string;
  clickableUrl: string;
  sourceType: 'pubmed' | 'clinicaltrials' | 'doi';
  metadata: CitationMetadata;
}

interface MermaidDiagram {
  type: 'mermaid';
  title: string;
  code: string;
  description: string;
}

interface EnhancedEvidence extends Evidence {
  clickableUrl: string;
  formattedCitation: string;
  citationType: 'pubmed' | 'clinicaltrials' | 'doi' | 'diagram' | 'workspace';
  metadata: any;
}
```

### Step 3: MedicalSkillsRegistry Overhaul
```typescript
// lib/medicalSkillsRegistry.ts
// 1. Import SkillApiExecutor
// 2. Modify executeSkillWithAPIs to use SkillApiExecutor
// 3. Enhance executeSkillChain to return citations + images
// 4. Add loadReferenceModules method
// 5. Update function declarations to use full inputSchema
```

### Step 4: SkillApiExecutor Implementation
```typescript
// lib/skillApiExecutor.ts (NEW FILE)
// 1. PubMed API client (esearch, efetch, XML parsing)
// 2. ClinicalTrials.gov API client
// 3. Citation formatter (per skill citationFormat)
// 4. Mermaid diagram generator (per skill imageGeneration)
// 5. Analysis code generator (R/Python templates)
// 6. Protocol generator templates
```

### Step 5: GeminiService Integration
```typescript
// services/geminiService.ts
// 1. Update evidence array to EnhancedEvidence
// 2. In skill chain loop: extract citations + images from skill results
// 3. Yield evidence_ready with clickable citations and diagrams
// 4. Ensure response_complete includes all evidence
```

### Step 6: Frontend Evidence Panel
```typescript
// components/EvidencePanel.tsx (NEW or extend AiChatWindow)
// 1. Render clickable citations as links
// 2. Render Mermaid diagrams using mermaid.js
// 3. Group by skill/step
// 4. Add copy citation button
// 5. Add "Open in PubMed/ClinicalTrials.gov" buttons
```

### Step 7: Testing & Validation
```bash
# 1. npm run build - verify TypeScript compiles
# 2. Test each skill category with sample queries
# 3. Verify citations are clickable and correct
# 4. Verify diagrams render correctly
# 5. Performance test: 500+ skills load time < 200ms
# 6. End-to-end: "Scan biomarkers for Alzheimer's" → full chain
```

---

## Phase 8: File Structure Changes

### New Files to Create
```
lib/
├── skillApiExecutor.ts          # NEW: API execution engine
├── mermaidRenderer.ts           # NEW: Mermaid rendering utilities
├── citationFormatter.ts         # NEW: Citation formatting per skill spec
├── skills/
│   ├── medical-skills-data.json # EXPANDED: 550+ skills (2.75 MB)
│   ├── references/              # NEW: Reference module files
│   │   ├── biomarker-maturity-framework.md
│   │   ├── pubmed-search-strategy-guide.md
│   │   ├── clinical-trial-design-principles.md
│   │   └── ... (100+ reference files)
│   └── templates/               # NEW: Code/diagram templates
│       ├── r-analysis-templates/
│       ├── python-analysis-templates/
│       ├── mermaid-templates/
│       └── manuscript-templates/
scripts/
└── extract-skills-from-github.ts # NEW: One-time extraction script
components/
└── EvidencePanel.tsx            # NEW: Enhanced evidence UI
```

### Modified Files
```
lib/medicalSkillsRegistry.ts     # Major: Full skill metadata, API executor integration
services/geminiService.ts        # Moderate: Enhanced evidence, citations, images
types.ts                         # Moderate: New type definitions
lib/skills/medical-skills-data.json # REPLACE: 39 → 550+ skills
package.json                     # Minor: Add mermaid dependency if not present
```

---

## Phase 9: Performance Considerations

### 9.1 Bundle Size Optimization
- **Lazy load** skills JSON: `import('./skills/medical-skills-data.json')` (already dynamic)
- **Code split** SkillApiExecutor: Only loaded when auremed personality active
- **Tree-shake** reference modules: Only import when skill executed
- **Target**: < 500 KB gzipped for skills bundle

### 9.2 API Rate Limiting
```typescript
// SkillApiExecutor - Built-in rate limiting
class RateLimiter {
  private pubmedQueue: Promise<void> = Promise.resolve();
  private clinicalTrialsQueue: Promise<void> = Promise.resolve();
  
  async pubmedRequest<T>(fn: () => Promise<T>): Promise<T> {
    this.pubmedQueue = this.pubmedQueue.then(() => 
      new Promise(r => setTimeout(r, 340)) // ~3 req/sec
    ).then(fn);
    return this.pubmedQueue;
  }
  
  async clinicalTrialsRequest<T>(fn: () => Promise<T>): Promise<T> {
    this.clinicalTrialsQueue = this.clinicalTrialsQueue.then(() => 
      new Promise(r => setTimeout(r, 100)) // ~10 req/sec
    ).then(fn);
    return this.clinicalTrialsQueue;
  }
}
```

### 9.3 Caching Strategy
- **PubMed results**: Cache by query hash (TTL: 24 hours)
- **ClinicalTrials results**: Cache by query hash (TTL: 6 hours)
- **Skill metadata**: Already cached in MedicalSkillsRegistry (24h TTL)
- **Mermaid diagrams**: Cache rendered SVG by code hash

---

## Phase 10: Validation Checklist

### Pre-Execution Validation
- [ ] All 550+ skills extracted from GitHub with full metadata
- [ ] JSON schema validates against TypeScript types
- [ ] Reference modules accessible at runtime
- [ ] API clients handle errors gracefully (network, rate limit, malformed responses)
- [ ] Citation formatter produces valid markdown links
- [ ] Mermaid templates render without syntax errors
- [ ] Skill chain executes without circular references

### Post-Execution Validation
- [ ] `npm run build` passes (TypeScript, Vite)
- [ ] `npx tsc --noEmit` passes
- [ ] AureMed loads skills in < 200ms (vs 5-15s GitHub)
- [ ] Query "biomarker landscape Alzheimer's" → executes biomarker-landscape-scanner → returns PubMed articles with clickable PMIDs
- [ ] Query "design phase 2 immunotherapy trial" → executes clinical-trial-search → returns NCT links
- [ ] Query "write grant abstract" → chains search → analyze → write → returns manuscript with citations
- [ ] Evidence panel shows clickable citations that open PubMed/ClinicalTrials.gov
- [ ] Mermaid diagrams render in evidence panel
- [ ] No regression in other personalities (aurepal, muse, socrates, jarvis, exampal, ocr)

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub API rate limits during extraction | High | Medium | Use authenticated requests, batch with delays, resume capability |
| JSON file too large for bundle | Medium | High | Lazy load, code split, consider IndexedDB for skills |
| PubMed API changes | Low | High | Version API client, fallback to cached data |
| Mermaid rendering failures | Medium | Medium | Validate templates, fallback to code block display |
| Skill chain circular references | Low | High | Track executed skills in chainContext, max 5 steps |
| TypeScript compilation errors | Medium | High | Generate types from JSON schema, strict validation |

---

## Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| 1. Skill Extraction | Script + GitHub API + parsing | 2-4 hours |
| 2. Types & Schema | TypeScript interfaces, validation | 1-2 hours |
| 3. Registry Overhaul | Load full metadata, API executor integration | 3-5 hours |
| 4. SkillApiExecutor | PubMed, ClinicalTrials, citations, diagrams | 4-6 hours |
| 5. GeminiService | Evidence panel, citations, images | 2-3 hours |
| 6. Frontend Panel | EvidencePanel component, Mermaid rendering | 2-3 hours |
| 7. Testing | Unit, integration, end-to-end | 3-4 hours |
| **TOTAL** | | **17-27 hours** |

---

## Approval Required

**This plan is complete and ready for review.** 

**No code will be executed until you explicitly approve.** 

Please review and confirm:
1. ✅ Scope: 550+ skills with full definitions
2. ✅ API Integration: PubMed + ClinicalTrials.gov real calls
3. ✅ Citations: Clickable PMID/NCT/DOI links in evidence panel
4. ✅ Images: Mermaid diagrams generated from skill templates
5. ✅ Architecture: Local JSON, SkillApiExecutor, enhanced evidence panel
6. ✅ Non-regression: Other personalities unchanged

**Reply "APPROVE" to begin implementation, or request modifications.**