/**
 * Skill Extraction Script
 * 
 * Fetches all 550+ medical research skills from the AIPOCH GitHub repository
 * and generates the complete medical-skills-data.json with full skill definitions.
 * 
 * Run with: npx tsx scripts/extract-skills-from-github.ts
 * Requires: GITHUB_TOKEN environment variable for higher rate limits
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SkillExtractionConfig {
  repoOwner: string;
  repoName: string;
  sections: string[];
  categories: string[];
  outputPath: string;
  referencesPath: string;
  githubToken?: string;
}

const CONFIG: SkillExtractionConfig = {
  repoOwner: 'aipoch',
  repoName: 'medical-research-skills',
  sections: ['scientific-skills', 'awesome-med-research-skills'],
  categories: ['Evidence Insight', 'Data Analysis', 'Academic Writing', 'Protocol Design', 'Other'],
  outputPath: join(__dirname, '..', 'lib', 'skills', 'medical-skills-data.json'),
  referencesPath: join(__dirname, '..', 'lib', 'skills', 'references'),
  githubToken: process.env.GITHUB_TOKEN,
};

interface SkillMetadata {
  name: string;
  description: string;
  license: string;
  author: string;
  category: string;
  subcategory: string;
  triggers: string[];
  inputSchema: any;
  outputSchema: any;
  referenceModules: any[];
  executionSteps: any[];
  hardRules: string[];
  maturityFrameworks: any[];
  apiSpecifications: any;
  citationFormat: any;
  imageGeneration: any;
  sourcePath: string;
  sourceRepo: string;
}

interface CategoryData {
  description: string;
  skills: SkillMetadata[];
}

interface SkillsData {
  version: string;
  generatedAt: string;
  totalSkills: number;
  categories: Record<string, CategoryData>;
}

const GITHUB_API_BASE = 'https://api.github.com/repos/aipoch/medical-research-skills/contents';
const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com/aipoch/medical-research-skills/main';

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);
    if (response.ok || response.status === 404) {
      return response;
    }
    if (response.status === 403 || response.status === 429) {
      const waitTime = Math.pow(2, i) * 1000 + Math.random() * 1000;
      console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
      await new Promise(r => setTimeout(r, waitTime));
      continue;
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  throw new Error(`Failed after ${retries} retries`);
}

async function fetchGitHubDir(section: string, category: string): Promise<any[]> {
  const url = `${GITHUB_API_BASE}/${section}/${encodeURIComponent(category)}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
  };
  if (CONFIG.githubToken) {
    headers['Authorization'] = `Bearer ${CONFIG.githubToken}`;
  }
  
  const response = await fetchWithRetry(url, { headers });
  if (!response.ok) {
    console.warn(`Failed to fetch ${section}/${category}: ${response.status}`);
    return [];
  }
  return response.json();
}

async function fetchSkillMd(section: string, category: string, skillName: string): Promise<string | null> {
  const url = `${RAW_GITHUB_BASE}/${section}/${encodeURIComponent(category)}/${encodeURIComponent(skillName)}/SKILL.md`;
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    return null;
  }
  return response.text();
}

function parseYamlFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  
  const result: Record<string, string> = {};
  const lines = match[1].split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[match[1]] = value;
    }
  }
  return result;
}

function extractSection(content: string, sectionName: string): string | null {
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractTriggers(content: string): string[] {
  const triggers: string[] = [];
  const triggerSection = extractSection(content, 'Sample Triggers');
  if (triggerSection) {
    const lines = triggerSection.split('\n');
    for (const line of lines) {
      const match = line.match(/^[-*]\s*"([^"]+)"/);
      if (match) triggers.push(match[1]);
    }
  }
  
  // Also check frontmatter
  const frontmatter = parseYamlFrontmatter(content);
  if (frontmatter.description) {
    const quotedMatches = frontmatter.description.match(/"([^"]+)"/g);
    if (quotedMatches) {
      triggers.push(...quotedMatches.map(m => m.slice(1, -1)));
    }
  }
  
  return [...new Set(triggers)];
}

function extractReferenceModules(content: string): any[] {
  const modules: any[] = [];
  const refSection = extractSection(content, 'Reference Module');
  if (refSection) {
    const lines = refSection.split('\n');
    for (const line of lines) {
      const match = line.match(/`references\/([^`]+)`\s*[→→-]\s*(.+)/);
      if (match) {
        modules.push({
          name: match[1].replace('.md', ''),
          path: `references/${match[1]}`,
          purpose: match[2].trim(),
          usedInSections: extractSectionsFromPurpose(match[2]),
        });
      }
    }
  }
  return modules;
}

function extractSectionsFromPurpose(purpose: string): string[] {
  const sections: string[] = [];
  const sectionMatches = purpose.match(/Section[s]?\s+([A-J][–\-]?[A-J]?)/gi);
  if (sectionMatches) {
    for (const match of sectionMatches) {
      const sectionRange = match.replace(/Section[s]?\s+/i, '');
      if (sectionRange.includes('–') || sectionRange.includes('-')) {
        const [start, end] = sectionRange.split(/[–\-]/);
        for (let c = start.charCodeAt(0); c <= end.charCodeAt(0); c++) {
          sections.push(String.fromCharCode(c));
        }
      } else {
        sections.push(sectionRange);
      }
    }
  }
  return [...new Set(sections)];
}

function extractExecutionSteps(content: string): any[] {
  const steps: any[] = [];
  const execSection = extractSection(content, 'Execution');
  if (execSection) {
    const stepMatches = execSection.match(/### Step (\d+)[^#]*\n([\s\S]*?)(?=\n### Step \d+|\n## |\n---|$)/gi);
    if (stepMatches) {
      for (const stepMatch of stepMatches) {
        const stepNumMatch = stepMatch.match(/### Step (\d+)/);
        const titleMatch = stepMatch.match(/### Step \d+\s*[—\-–]\s*(.+)/);
        const subSteps = stepMatch.match(/- (.+)/g)?.map(s => s.replace('- ', '').trim()) || [];
        
        if (stepNumMatch) {
          steps.push({
            stepNumber: parseInt(stepNumMatch[1]),
            title: titleMatch ? titleMatch[1].trim() : `Step ${stepNumMatch[1]}`,
            description: stepMatch.replace(/### Step \d+[^#]*\n/, '').trim().substring(0, 500),
            subSteps,
          });
        }
      }
    }
  }
  return steps;
}

function extractHardRules(content: string): string[] {
  const rules: string[] = [];
  const hardRulesSection = extractSection(content, 'Hard Rules');
  if (hardRulesSection) {
    const ruleLines = hardRulesSection.split('\n');
    for (const line of ruleLines) {
      const match = line.match(/^\d+\.\s+(.+)/);
      if (match) rules.push(match[1].trim());
    }
  }
  return rules;
}

function extractMaturityFrameworks(content: string): any[] {
  const frameworks: any[] = [];
  const maturitySection = extractSection(content, 'Strict.*Maturity Table Standard');
  if (maturitySection) {
    const tiers: any[] = [];
    const rows = maturitySection.split('\n').filter(r => r.includes('|') && !r.includes('---'));
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 4 && cells[0] !== 'Maturity Tier') {
        tiers.push({
          tier: parseInt(cells[0].replace('Tier ', '')) || tiers.length + 1,
          label: cells[1],
          minimumEvidence: cells[2],
          cannotClaim: cells[3],
        });
      }
    }
    if (tiers.length > 0) {
      frameworks.push({
        name: 'Biomarker Maturity Framework',
        tiers,
      });
    }
  }
  return frameworks;
}

function extractDescription(content: string, skillName: string): string {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---/, '').trim();
  const paragraphs = withoutFrontmatter.split('\n\n');
  
  for (const para of paragraphs) {
    const clean = para.trim().replace(/^#+\s*/, '');
    if (clean.length > 50 && !clean.startsWith('##') && !clean.startsWith('```')) {
      return clean.substring(0, 500);
    }
  }
  return `Medical research skill: ${skillName}`;
}

function buildInputSchema(content: string, triggers: string[]): any {
  const properties: Record<string, any> = {
    query: { type: 'string', description: 'The medical research query or question to process with this skill' },
    context: { type: 'string', description: 'Additional context such as disease, population, specimen type, use case, or constraints' },
  };

  if (triggers.some(t => t.toLowerCase().includes('biomarker'))) {
    properties.biomarkerType = {
      type: 'string',
      description: 'Type of biomarker',
      enum: ['genomic', 'transcriptomic', 'protein', 'metabolite', 'imaging', 'pathology', 'clinical score', 'liquid biopsy', 'multimodal'],
    };
    properties.useCase = {
      type: 'string',
      description: 'Intended use case for the biomarker',
      enum: ['diagnosis', 'early detection', 'differential diagnosis', 'prognosis', 'treatment response', 'recurrence', 'MRD', 'monitoring', 'subtype stratification'],
    };
  }

  if (triggers.some(t => t.toLowerCase().includes('literature') || t.toLowerCase().includes('search'))) {
    properties.databases = {
      type: 'array',
      description: 'Specific databases to search (PubMed, Embase, arXiv, etc.)',
      items: { type: 'string', description: 'Database name' },
    };
    properties.dateRange = {
      type: 'string',
      description: 'Date range for literature search (e.g., "last 5 years", "2020-2024")',
    };
  }

  return { type: 'object', properties, required: ['query'] };
}

function buildOutputSchema(content: string): any {
  const outputSection = extractSection(content, 'Mandatory Output Structure');
  
  const properties: Record<string, any> = {
    summary: { type: 'string', description: 'Executive summary of the skill output' },
    sections: { type: 'object', description: 'Structured output sections as defined by the skill', properties: {} },
    references: { type: 'array', description: 'Retrieved and verified references', items: { type: 'string', description: 'Reference citation' } },
    confidence: { type: 'number', description: 'Confidence score (0-1) for the output' },
    nextSteps: { type: 'array', description: 'Recommended follow-up actions or skills', items: { type: 'string', description: 'Next step description' } },
  };

  if (outputSection) {
    const sectionMatches = outputSection.match(/### ([A-J])\.\s*([^\n]+)/g);
    if (sectionMatches) {
      const sectionProps: Record<string, any> = {};
      for (const match of sectionMatches) {
        const sectionMatch = match.match(/### ([A-J])\.\s*(.+)/);
        if (sectionMatch) {
          sectionProps[sectionMatch[1]] = {
            type: 'string',
            description: sectionMatch[2].trim(),
          };
        }
      }
      properties.sections.properties = sectionProps;
    }
  }

  return { type: 'object', properties };
}

function getSubcategory(skillName: string, category: string): string {
  const subcategoryMap: Record<string, Record<string, string>> = {
    'Evidence Insight': {
      'biomarker-landscape-scanner': 'Biomarker Mapping',
      'biomedical-search-strategy-builder': 'Search Strategy',
      'clinical-question-clarifier': 'Question Refinement',
      'contradictory-findings-resolver': 'Conflict Resolution',
      'disease-mechanism-evidence-map': 'Mechanism Mapping',
      'drug-target-evidence-landscape': 'Target Evidence',
      'evidence-level-ranker': 'Evidence Ranking',
      'figure-first-paper-reader': 'Paper Reading',
      'high-value-paper-screener': 'Paper Screening',
      'litbase': 'Literature Base',
      'medical-research-gap-finder': 'Gap Finding',
      'medical-research-literature-reader-pro': 'Literature Reading',
      'medical-topic-saturation-and-whitespace-checker': 'Topic Analysis',
      'method-gap-detector': 'Method Gap Detection',
      'methods-reverse-engineer': 'Methods Engineering',
      'multi-database-literature-collector': 'Literature Collection',
      'novelty-vs-feasibility-assessor': 'Novelty Assessment',
      'paper-to-claim-verifier': 'Claim Verification',
      'population-gap-detector': 'Population Gap Detection',
      'preprint-surveillance-finder': 'Preprint Surveillance',
      'result-reliability-checker': 'Reliability Checking',
      'study-design-identifier': 'Study Design ID',
      'topic-evidence-mapper': 'Evidence Mapping',
      'unmet-clinical-need-extractor': 'Clinical Need Extraction',
    },
    'Data Analysis': {
      'batch-effect-correction': 'Batch Correction',
      'cibersort-immune-infiltration-analysis': 'Immune Analysis',
      'cobrapy': 'Metabolic Modeling',
      'deg-screening-analysis': 'DEG Screening',
      'elastic-net-feature-selection': 'Feature Selection',
      'estimate-immune-score-analysis': 'Immune Scoring',
      'gokegg': 'Pathway Analysis',
      'gsva-analysis-and-visualization': 'GSVA Analysis',
      'km-survival-curve': 'Survival Analysis',
      'lightgbm-analysis': 'ML Analysis',
      'time-dependent-roc': 'ROC Analysis',
      'umap-tsne-analysis': 'Dimensionality Reduction',
      'wgcna-analysis': 'Network Analysis',
      'xgboost-analysis': 'ML Analysis',
    },
    'Academic Writing': {
      'arxiv-preflight': 'Preflight Check',
      'conference-abstract-adaptor': 'Abstract Adaptation',
      'conference-abstract-writer': 'Abstract Writing',
      'discussion-composer': 'Discussion Writing',
      'discussion-section-architect': 'Discussion Architecture',
      'grant-budget-justification': 'Grant Budget',
      'iacuc-protocol-drafter': 'IACUC Protocol',
      'lay-press-release-writer': 'Press Release',
      'limitation-and-risk-writer': 'Limitations Writing',
      'medical-device-mdr-auditor': 'MDR Auditing',
      'networking-email-drafter': 'Email Drafting',
      'nih-biosketch-builder': 'Biosketch Building',
      'poster-storyline-builder': 'Poster Storyline',
      'paper-sprint-review': 'Paper Review',
      'reference-integrity-checker': 'Reference Checking',
      'rebuttal-letter-strategist': 'Rebuttal Strategy',
      'semantic-consistency-auditor': 'Consistency Auditing',
      'study-limitations-drafter': 'Limitations Drafting',
      'target-journal-matcher': 'Journal Matching',
    },
    'Protocol Design': {
      'hypothesis-generation': 'Hypothesis Generation',
      'network-tox-docking-research-planner': 'Tox/Docking Planning',
    },
    'Other': {
      'benchling-integration': 'Benchling Integration',
      'chemical-storage-sorter': 'Chemical Storage',
      'chemical-structure-converter': 'Structure Conversion',
      'conflict-of-interest-checker': 'COI Checking',
      'hippocrates': 'Clinical Reasoning',
      'medical-unit-converter': 'Unit Conversion',
      'multi-panel-figure-assembler': 'Figure Assembly',
      'open-source-license-check': 'License Checking',
      'phi-prompt-guard': 'PHI Protection',
      'ppt-master': 'Presentation Master',
      'scientific-podcast-summary': 'Podcast Summary',
      'symptom-checker-triage': 'Symptom Triage',
      'time-zone-planner': 'Timezone Planning',
      'treatment-plans': 'Treatment Planning',
      'vector-text-fixer': 'Text Fixing',
      'virtual-patient-roleplay': 'Patient Roleplay',
      'waste-disposal-guide': 'Waste Disposal',
    },
  };

  return subcategoryMap[category]?.[skillName] || 'General';
}

function buildApiSpecifications(category: string): any {
  const basePubMed = {
    name: 'PubMed E-utilities',
    baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    endpoints: {
      search: 'esearch.fcgi',
      fetch: 'efetch.fcgi',
    },
    parameters: {
      db: 'pubmed',
      retmax: 50,
      retmode: 'json',
      term: '{constructed_query}',
      mindate: '{date_range_start}',
      maxdate: '{date_range_end}',
    },
    responseFormat: 'xml',
    rateLimit: '3 requests/second (no API key), 10/second (with API key)',
  };

  const baseClinicalTrials = {
    name: 'ClinicalTrials.gov API v2',
    baseUrl: 'https://clinicaltrials.gov/api/v2/',
    endpoints: {
      search: 'studies',
    },
    parameters: {
      'query.cond': '{condition}',
      'query.term': '{intervention}',
      'filter.overallStatus': 'RECRUITING|ACTIVE_NOT_RECRUITING',
      pageSize: 50,
    },
    responseFormat: 'json',
    rateLimit: 'No strict limit, be respectful',
  };

  switch (category) {
    case 'Evidence Insight':
      return { primary: basePubMed, secondary: baseClinicalTrials };
    case 'Data Analysis':
      return { primary: basePubMed };
    case 'Academic Writing':
      return { primary: basePubMed };
    case 'Protocol Design':
      return { primary: baseClinicalTrials, secondary: basePubMed };
    case 'Other':
      return { primary: null };
    default:
      return { primary: basePubMed };
  }
}

function buildCitationFormat(): any {
  return {
    pubmed: {
      template: '[{authors}. {title}. {journal}. {year};{volume}({issue}):{pages}. PMID: {pmid}]({pubmed_url})',
      clickable: true,
      urlTemplate: 'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',
      requiredFields: ['pmid', 'title', 'authors', 'journal', 'year'],
    },
    clinicaltrials: {
      template: '[{title}. ClinicalTrials.gov Identifier: {nctId}]({ct_url})',
      clickable: true,
      urlTemplate: 'https://clinicaltrials.gov/study/{nctId}',
      requiredFields: ['nctId', 'title', 'status'],
    },
    doi: {
      template: '[{authors}. {title}. {journal}. {year}. doi:{doi}]({doi_url})',
      clickable: true,
      urlTemplate: 'https://doi.org/{doi}',
      requiredFields: ['doi'],
    },
  };
}

function buildImageGeneration(category: string): any {
  const mermaidTemplates: Record<string, any> = {
    'biomarker-pathway': {
      description: 'Biomarker discovery to validation pathway',
      template: `flowchart TD
  A[Discovery] --> B[Analytical Validation]
  B --> C[Clinical Validation]
  C --> D[Clinical Utility]
  D --> E[Regulatory Approval]
  classDef tier1 fill:#ffebee,stroke:#c62828,color:#000
  classDef tier2 fill:#fff3e0,stroke:#ef6c00,color:#000
  classDef tier3 fill:#e8f5e9,stroke:#2e7d32,color:#fff
  classDef tier4 fill:#e3f2fd,stroke:#1565c0,color:#fff
  class A tier1; class B tier2; class C tier3; class D tier3; class E tier4`,
    },
    'evidence-map': {
      description: 'Evidence landscape visualization',
      template: `mindmap
  root((Biomarker Landscape))
    Genomic
      DNA
      RNA
    Protein
      Plasma
      Tissue
    Imaging
      PET
      MRI
    Clinical
      Scores
      Outcomes`,
    },
    'clinical-trial-flow': {
      description: 'Clinical trial design flow',
      template: `flowchart TD
  A[Hypothesis] --> B[Protocol Design]
  B --> C[Ethics Approval]
  C --> D[Patient Recruitment]
  D --> E[Treatment/Intervention]
  E --> F[Data Collection]
  F --> G[Statistical Analysis]
  G --> H[Publication]
  classDef design fill:#e3f2fd,stroke:#1565c0,color:#000
  classDef execute fill:#e8f5e9,stroke:#2e7d32,color:#000
  classDef analyze fill:#fff3e0,stroke:#ef6c00,color:#000
  class A,B,C design; class D,E,F execute; class G,H analyze`,
    },
    'survival-analysis': {
      description: 'Kaplan-Meier survival curve',
      template: `flowchart LR
  A[Cohort Definition] --> B[Time-to-Event Data]
  B --> C[KM Estimator]
  C --> D[Survival Curves]
  D --> E[Log-Rank Test]
  E --> F[Cox Regression]
  F --> G[Hazard Ratios]
  classDef data fill:#fce4ec,stroke:#c2185b,color:#000
  classDef stats fill:#e8f5e9,stroke:#2e7d32,color:#000
  class A,B data; class C,D,E,F,G stats`,
    },
  };

  const chartTypes = ['bar', 'line', 'scatter', 'heatmap', 'forest-plot', 'km-curve'];

  return {
    enabled: true,
    types: ['mermaid', 'chart', 'figure'],
    mermaidTemplates,
    chartTypes,
    outputFormat: 'mermaid_code_block',
  };
}

async function processSkill(section: string, category: string, skillName: string): Promise<SkillMetadata | null> {
  const skillMd = await fetchSkillMd(section, category, skillName);
  if (!skillMd) {
    console.warn(`  No SKILL.md for ${section}/${category}/${skillName}`);
    return null;
  }

  const frontmatter = parseYamlFrontmatter(skillMd);
  const description = frontmatter.description || extractDescription(skillMd, skillName);
  const triggers = extractTriggers(skillMd);
  const referenceModules = extractReferenceModules(skillMd);
  const executionSteps = extractExecutionSteps(skillMd);
  const hardRules = extractHardRules(skillMd);
  const maturityFrameworks = extractMaturityFrameworks(skillMd);
  const inputSchema = buildInputSchema(skillMd, triggers);
  const outputSchema = buildOutputSchema(skillMd);
  const apiSpecifications = buildApiSpecifications(category);
  const citationFormat = buildCitationFormat();
  const imageGeneration = buildImageGeneration(category);

  return {
    name: frontmatter.name || skillName,
    description,
    license: frontmatter.license || 'MIT',
    author: frontmatter.author || frontmatter['skill-author'] || 'AIPOCH',
    category,
    subcategory: getSubcategory(skillName, category),
    triggers,
    inputSchema,
    outputSchema,
    referenceModules,
    executionSteps,
    hardRules,
    maturityFrameworks,
    apiSpecifications,
    citationFormat,
    imageGeneration,
    sourcePath: `${section}/${category}/${skillName}`,
    sourceRepo: section,
  };
}

async function extractAllSkills(): Promise<SkillsData> {
  const allSkills: Map<string, SkillMetadata> = new Map();
  let totalProcessed = 0;
  let totalSuccessful = 0;

  for (const section of CONFIG.sections) {
    console.log(`\n=== Processing section: ${section} ===`);
    
    for (const category of CONFIG.categories) {
      console.log(`  Category: ${category}`);
      const skillDirs = await fetchGitHubDir(section, category);
      
      for (const item of skillDirs) {
        if (item.type === 'dir') {
          totalProcessed++;
          const skill = await processSkill(section, category, item.name);
          
          if (skill) {
            const key = skill.name.toLowerCase();
            // Prefer scientific-skills version if duplicate
            if (!allSkills.has(key) || section === 'scientific-skills') {
              allSkills.set(key, skill);
              totalSuccessful++;
              console.log(`    ✓ ${skill.name} (${skill.subcategory})`);
            } else {
              console.log(`    ⊘ ${skill.name} (duplicate, keeping scientific-skills version)`);
            }
          }
          
          // Small delay to be respectful to GitHub API
          await new Promise(r => setTimeout(r, 50));
        }
      }
    }
  }

  // Organize by category
  const categories: Record<string, CategoryData> = {};
  for (const cat of CONFIG.categories) {
    categories[cat] = { description: '', skills: [] };
  }

  for (const skill of allSkills.values()) {
    categories[skill.category].skills.push(skill);
  }

  // Sort skills within each category by name
  for (const cat of CONFIG.categories) {
    categories[cat].skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Set category descriptions
  const categoryDescriptions: Record<string, string> = {
    'Evidence Insight': 'Literature search, evidence mapping, biomarker landscapes, study design identification, gap detection',
    'Data Analysis': 'Statistical analysis, bioinformatics, survival analysis, ML models, visualization, omics analysis',
    'Academic Writing': 'Abstract writing, discussion sections, references, posters, grants, journal matching, manuscript preparation',
    'Protocol Design': 'Hypothesis generation, trial design, docking, tox research planning, experimental design',
    'Other': 'Unit conversion, COI checking, PHI protection, presentations, podcast summaries, utilities',
  };

  for (const cat of CONFIG.categories) {
    categories[cat].description = categoryDescriptions[cat] || '';
  }

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalSkills: allSkills.size,
    categories,
  };
}

async function saveReferenceModules(skillsData: SkillsData): Promise<void> {
  // Create references directory
  if (!existsSync(CONFIG.referencesPath)) {
    mkdirSync(CONFIG.referencesPath, { recursive: true });
  }

  // Collect all unique reference modules
  const refModules: Map<string, any> = new Map();
  
  for (const cat of CONFIG.categories) {
    for (const skill of skillsData.categories[cat].skills) {
      for (const ref of skill.referenceModules) {
        if (!refModules.has(ref.name)) {
          refModules.set(ref.name, ref);
        }
      }
    }
  }

  // Create placeholder reference files
  for (const [name, ref] of refModules) {
    const filePath = join(CONFIG.referencesPath, `${name}.md`);
    const content = `# ${name}\n\n${ref.purpose}\n\n## Used In Sections\n${ref.usedInSections.join(', ')}\n\n## Source\n${ref.path}\n\n---\n*This is a placeholder. Replace with actual reference module content from the AIPOCH repository.*\n`;
    writeFileSync(filePath, content);
  }

  console.log(`\nCreated ${refModules.size} reference module placeholders in ${CONFIG.referencesPath}`);
}

async function main() {
  console.log('=== AIPOCH Medical Research Skills Extraction ===');
  console.log(`Repository: ${CONFIG.repoOwner}/${CONFIG.repoName}`);
  console.log(`Sections: ${CONFIG.sections.join(', ')}`);
  console.log(`Categories: ${CONFIG.categories.join(', ')}`);
  console.log(`Output: ${CONFIG.outputPath}`);
  console.log(`GitHub Token: ${CONFIG.githubToken ? 'SET' : 'NOT SET (rate limited)'}`);
  
  if (!CONFIG.githubToken) {
    console.warn('\n⚠️  WARNING: No GITHUB_TOKEN set. GitHub API rate limit is 60 requests/hour.');
    console.warn('   For 550+ skills, you NEED a token. Set GITHUB_TOKEN environment variable.');
    console.warn('   Get one at: https://github.com/settings/tokens (classic, public_repo scope)\n');
  }

  try {
    const skillsData = await extractAllSkills();
    
    console.log(`\n=== Extraction Complete ===`);
    console.log(`Total skills extracted: ${skillsData.totalSkills}`);
    
    for (const cat of CONFIG.categories) {
      console.log(`  ${cat}: ${skillsData.categories[cat].skills.length} skills`);
    }

    // Save main skills data
    writeFileSync(CONFIG.outputPath, JSON.stringify(skillsData, null, 2));
    console.log(`\nSaved skills data to ${CONFIG.outputPath}`);

    // Save reference modules
    await saveReferenceModules(skillsData);

    console.log('\n✅ Done! Next steps:');
    console.log('1. Review the generated medical-skills-data.json');
    console.log('2. Fill in reference module content from the actual repository');
    console.log('3. Run npm run build to verify TypeScript compilation');
    
  } catch (error) {
    console.error('Extraction failed:', error);
    process.exit(1);
  }
}

main();