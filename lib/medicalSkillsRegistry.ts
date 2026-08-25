/**
 * Medical Skills Registry Service
 * 
 * Loads 550+ medical research skills from local embedded JSON (lib/skills/medical-skills-data.json).
 * Converts skill definitions into Gemini-compatible function declarations for autonomous skill selection.
 * 
 * Local skills data: lib/skills/medical-skills-data.json (5 categories, 600+ skills)
 */

import { FunctionDeclaration, Schema, Type } from '@google/genai';
import skillsData from './skills/medical-skills-data.json';
import { skillApiExecutor } from './skillApiExecutor';
import type { 
  SkillMetadata as SkillMetadataType, 
  SkillExecutionResult as SkillExecutionResultType,
  SkillChainContext as SkillChainContextType,
  ClickableCitation, 
  MermaidDiagram,
  ApiSpecifications,
  CitationFormat,
  ImageGenerationSpec,
  ExecutionStep,
  ReferenceModule,
  MaturityFramework,
  MaturityTier
} from '../types';

// ============================================================================
// Types & Interfaces (re-export with local extensions)
// ============================================================================

export interface SkillMetadata extends SkillMetadataType {
  // Local extensions if needed
}

export type SkillCategory = 
  | 'Evidence Insight'
  | 'Data Analysis'
  | 'Academic Writing'
  | 'Protocol Design'
  | 'Other';

export interface SkillInputSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required: string[];
}

export interface SchemaProperty {
  type: Type | string;
  description: string;
  enum?: string[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

export interface SkillOutputSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
}

export interface SkillExecutionContext {
  skillName: string;
  input: Record<string, unknown>;
  previousSkillOutputs?: Record<string, unknown>;
  userQuery: string;
  chainContext?: SkillChainContextType;
}

export interface SkillChainContext extends SkillChainContextType {
  // Local extensions if needed
}

export interface SkillExecutionResult extends SkillExecutionResultType {
  citations?: ClickableCitation[];
  images?: MermaidDiagram[];
}

// ============================================================================
// API Service Interfaces
// ============================================================================

export interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  pubDate: string;
  doi?: string;
  meshTerms?: string[];
}

export interface PubMedSearchResult {
  articles: PubMedArticle[];
  totalCount: number;
  query: string;
  error?: string;
}

export interface ClinicalTrial {
  nctId: string;
  title: string;
  status: string;
  phase: string;
  conditions: string[];
  interventions: string[];
  sponsor: string;
  startDate: string;
  completionDate: string;
  locations: string[];
}

export interface ClinicalTrialsSearchResult {
  trials: ClinicalTrial[];
  totalCount: number;
  query: string;
  error?: string;
}

// ============================================================================
// Skill Category Mapping (8 Research Stages)
// ============================================================================

export const RESEARCH_STAGES = {
  'Evidence Insight': {
    stage: 1,
    name: 'Evidence Discovery & Mapping',
    description: 'Literature search, evidence mapping, biomarker landscapes, study design identification',
    skills: [
      'biomarker-landscape-scanner',
      'biomedical-search-strategy-builder',
      'clinical-question-clarifier',
      'contradictory-findings-resolver',
      'disease-mechanism-evidence-map',
      'drug-target-evidence-landscape',
      'evidence-level-ranker',
      'figure-first-paper-reader',
      'high-value-paper-screener',
      'litbase',
      'medical-research-gap-finder',
      'medical-research-literature-reader-pro',
      'medical-topic-saturation-and-whitespace-checker',
      'method-gap-detector',
      'methods-reverse-engineer',
      'multi-database-literature-collector',
      'novelty-vs-feasibility-assessor',
      'paper-to-claim-verifier',
      'population-gap-detector',
      'preprint-surveillance-finder',
      'result-reliability-checker',
      'study-design-identifier',
      'topic-evidence-mapper',
      'unmet-clinical-need-extractor',
    ]
  },
  'Data Analysis': {
    stage: 2,
    name: 'Data Processing & Statistical Analysis',
    description: 'Statistical analysis, bioinformatics, survival analysis, ML models, visualization',
    skills: [
      'batch-effect-correction',
      'cibersort-immune-infiltration-analysis',
      'cobrapy',
      'deg-screening-analysis',
      'elastic-net-feature-selection',
      'estimate-immune-score-analysis',
      'gokegg',
      'gsva-analysis-and-visualization',
      'km-survival-curve',
      'lightgbm-analysis',
      'time-dependent-roc',
      'umap-tsne-analysis',
      'wgcna-analysis',
      'xgboost-analysis',
    ]
  },
  'Academic Writing': {
    stage: 3,
    name: 'Manuscript Preparation & Writing',
    description: 'Abstract writing, discussion sections, references, posters, grants, journal matching',
    skills: [
      'arxiv-preflight',
      'conference-abstract-adaptor',
      'conference-abstract-writer',
      'discussion-composer',
      'discussion-section-architect',
      'grant-budget-justification',
      'iacuc-protocol-drafter',
      'lay-press-release-writer',
      'limitation-and-risk-writer',
      'medical-device-mdr-auditor',
      'networking-email-drafter',
      'nih-biosketch-builder',
      'poster-storyline-builder',
      'paper-sprint-review',
      'reference-integrity-checker',
      'rebuttal-letter-strategist',
      'semantic-consistency-auditor',
      'study-limitations-drafter',
      'target-journal-matcher',
    ]
  },
  'Protocol Design': {
    stage: 4,
    name: 'Study Protocol & Experimental Design',
    description: 'Hypothesis generation, trial design, docking, tox research planning',
    skills: [
      'hypothesis-generation',
      'network-tox-docking-research-planner',
    ]
  },
  'Other': {
    stage: 5,
    name: 'Specialized Utilities & Tools',
    description: 'Unit conversion, COI checking, waste disposal, treatment plans, podcast summaries',
    skills: [
      'benchling-integration',
      'chemical-storage-sorter',
      'chemical-structure-converter',
      'conflict-of-interest-checker',
      'hippocrates',
      'medical-unit-converter',
      'multi-panel-figure-assembler',
      'open-source-license-check',
      'phi-prompt-guard',
      'ppt-master',
      'scientific-podcast-summary',
      'symptom-checker-triage',
      'time-zone-planner',
      'treatment-plans',
      'vector-text-fixer',
      'virtual-patient-roleplay',
      'waste-disposal-guide',
    ]
  },
} as const;

// Additional skills from scientific-skills that aren't in awesome-med-research-skills
export const SCIENTIFIC_SKILLS_ADDITIONAL = {
  'Evidence Insight': [
    'acronym-unpacker',
    'arxiv-database',
    'bio-ontology-mapper',
    'biogrid-orcs',
    'blockbuster-therapy-predictor',
    'cellosaurus-api',
    'chea-api',
    'citation-chasing-mapping',
    'clinical-study-info-extractor',
    'competitor-trial-monitor',
    'concept-explainer',
    'cosmic-database',
    'cross-disciplinary-bridge-finder',
    'ctd-api',
    'encode-api',
    'emerging-topic-scout',
    'ensembl-database',
    'encori-api',
    'fda-guideline-search',
    'funding-trend-forecaster',
    'gene-info',
    'geo-search-api',
    'grant-gantt-chart-gen',
    'hgnc-api',
    'ib-summarizer',
    'jaspar-api',
    'journal-impact-factor-trend',
    'journal-matchmaker',
    'kegg-api',
    'keyword-velocity-tracker',
    'open-source-license-check',
    'patent-claim-mapper',
    'patent-landscape',
    'pathway-introduction-expert',
    'phenotype-introduction',
    'pubmed-database',
    'pubmed-search-specialist',
    'rare-disease-hpo-mapper',
    'reagent-substitute-scout',
    'reference-search',
    'research-article-weekly',
    'scite-database',
    'scientific-podcast-summary',
    'sds-msds-risk-scanner',
    'smart-journal-monitor',
    'target-novelty-scorer',
    'translational-gap-analyzer',
    'unstructured-medical-text-miner',
  ],
  'Data Analysis': [
    'dnanexus-integration',
    'metabolomics-workbench-database',
    'metagenomic-krona-chart',
    'torchdrug',
  ],
  'Academic Writing': [
    'conference-abstract-adaptor',
    'discussion-section-architect',
    'format-references-endnote',
    'grant-budget-justification',
    'iacuc-protocol-drafter',
    'lay-press-release-writer',
    'medical-device-mdr-auditor',
    'microbiome-diversity-reporter',
    'networking-email-drafter',
    'nih-biosketch-builder',
    'rebuttal-letter-strategist',
    'semantic-consistency-auditor',
    'study-limitations-drafter',
  ],
  'Protocol Design': [
    'hypothesis-generation',
    'network-tox-docking-research-planner',
  ],
  'Other': [
    'benchling-integration',
    'chemical-storage-sorter',
    'chemical-structure-converter',
    'dnanexus-integration',
    'hippocrates',
    'medical-unit-converter',
    'multi-panel-figure-assembler',
    'open-source-license-check',
    'phi-prompt-guard',
    'ppt-master',
    'symptom-checker-triage',
    'time-zone-planner',
    'treatment-plans',
    'virtual-patient-roleplay',
    'waste-disposal-guide',
  ],
};

// ============================================================================
// Medical Skills Registry Class
// ============================================================================

export class MedicalSkillsRegistry {
  private static instance: MedicalSkillsRegistry;
  private skillsCache: Map<string, SkillMetadata> = new Map();
  private functionDeclarationsCache: FunctionDeclaration[] = [];
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly GITHUB_API_BASE = 'https://api.github.com/repos/aipoch/medical-research-skills/contents';
  private readonly RAW_GITHUB_BASE = 'https://raw.githubusercontent.com/aipoch/medical-research-skills/main';

  private constructor() {}

  static getInstance(): MedicalSkillsRegistry {
    if (!MedicalSkillsRegistry.instance) {
      MedicalSkillsRegistry.instance = new MedicalSkillsRegistry();
    }
    return MedicalSkillsRegistry.instance;
  }

  /**
   * Initialize the registry by loading skills from local JSON file
   */
  async initialize(forceRefresh = false): Promise<void> {
    const now = Date.now();
    if (!forceRefresh && this.skillsCache.size > 0 && (now - this.lastFetchTime) < this.CACHE_TTL) {
      console.log('[MedicalSkillsRegistry] Using cached skills');
      return;
    }

    console.log('[MedicalSkillsRegistry] Loading skills from local JSON...');
    await this.loadSkillsFromLocalJSON();
    this.buildFunctionDeclarations();
    this.lastFetchTime = now;
    console.log(`[MedicalSkillsRegistry] Loaded ${this.skillsCache.size} skills from local JSON`);
  }

  /**
   * Load all skills from the local medical-skills-data.json file
   */
  private async loadSkillsFromLocalJSON(): Promise<void> {
    try {
      // Import the local JSON file (fixed version)
      const skillsDataModule = await import('./skills/medical-skills-data_fixed.json');
      const data = skillsDataModule.default as any;
      
      if (!data.categories) {
        console.error('[MedicalSkillsRegistry] Invalid skills data format: missing categories');
        return;
      }

      // Iterate through all categories and skills
      for (const [categoryName, categoryData] of Object.entries(data.categories)) {
        const category = categoryName as SkillCategory;
        const catData = categoryData as any;
        
        if (!catData.skills || !Array.isArray(catData.skills)) {
          console.warn(`[MedicalSkillsRegistry] No skills array found for category: ${categoryName}`);
          continue;
        }

        for (const skill of catData.skills) {
          const skillKey = `local/${category}/${skill.name}`;
          
          // Skip if already cached
          if (this.skillsCache.has(skillKey)) continue;

          // Create SkillMetadata from the JSON skill definition
          const metadata: SkillMetadata = {
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions || '',
            license: 'MIT',
            author: 'AIPOCH',
            category: category,
            subcategory: skill.subcategory || 'General',
            triggers: skill.triggers || [],
            inputSchema: skill.inputSchema || {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'The medical research query or question to process with this skill' },
                context: { type: 'string', description: 'Additional context such as disease, population, specimen type, use case, or constraints' },
              },
              required: ['query'],
            },
            outputSchema: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Executive summary of the skill output' },
                sections: { type: 'object', description: 'Structured output sections as defined by the skill', properties: {} },
                references: { type: 'array', description: 'Retrieved and verified references', items: { type: 'string', description: 'Reference citation' } },
                confidence: { type: 'number', description: 'Confidence score (0-1) for the output' },
                nextSteps: { type: 'array', description: 'Recommended follow-up actions or skills', items: { type: 'string', description: 'Next step description' } },
              },
            },
            referenceModules: [],
            executionSteps: [],
            hardRules: [],
            maturityFrameworks: [],
            apiSpecifications: {
              primary: null,
              secondary: undefined,
            },
            citationFormat: {
              pubmed: {
                template: '',
                clickable: true,
                urlTemplate: 'https://pubmed.ncbi.nlm.nih.gov/{{pmid}}/',
                requiredFields: ['pmid'],
              },
              clinicaltrials: {
                template: '',
                clickable: true,
                urlTemplate: 'https://clinicaltrials.gov/ct2/show/{{nctId}}',
                requiredFields: ['nctId'],
              },
              doi: {
                template: '',
                clickable: true,
                urlTemplate: 'https://doi.org/{{doi}}',
                requiredFields: ['doi'],
              },
            },
            imageGeneration: {
              enabled: false,
              types: [],
              mermaidTemplates: {},
              chartTypes: [],
              outputFormat: 'svg',
            },
            sourcePath: `local/${category}/${skill.name}`,
            sourceRepo: 'local',
          };
          
          this.skillsCache.set(skillKey, metadata);
        }
      }
    } catch (error) {
      console.error('[MedicalSkillsRegistry] Error loading skills from local JSON:', error);
      // Fallback: try to fetch from GitHub if local fails
      console.log('[MedicalSkillsRegistry] Falling back to GitHub fetch...');
      await this.fetchAllSkillsFromGitHub();
    }
  }

  /**
   * Fallback: Fetch all skills from GitHub (original implementation)
   */
  private async fetchAllSkillsFromGitHub(): Promise<void> {
    const categories: SkillCategory[] = ['Evidence Insight', 'Data Analysis', 'Academic Writing', 'Protocol Design', 'Other'];
    
    for (const category of categories) {
      await this.fetchSkillsFromCategory(category, 'awesome-med-research-skills');
      await this.fetchSkillsFromCategory(category, 'scientific-skills');
    }
  }

  /**
   * Fetch skills from a specific category in a specific repo section (kept for fallback)
   */
  private async fetchSkillsFromCategory(category: SkillCategory, repoSection: 'scientific-skills' | 'awesome-med-research-skills'): Promise<void> {
    try {
      const url = `${this.GITHUB_API_BASE}/${repoSection}/${encodeURIComponent(category)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`[MedicalSkillsRegistry] Failed to fetch ${repoSection}/${category}: ${response.status}`);
        return;
      }

      const items = await response.json();
      
      for (const item of items) {
        if (item.type === 'dir') {
          await this.fetchAndParseSkill(item.name, category, repoSection);
        }
      }
    } catch (error) {
      console.error(`[MedicalSkillsRegistry] Error fetching ${repoSection}/${category}:`, error);
    }
  }

  /**
   * Fetch and parse a single skill's SKILL.md file (kept for fallback)
   */
  private async fetchAndParseSkill(skillName: string, category: SkillCategory, repoSection: 'scientific-skills' | 'awesome-med-research-skills'): Promise<void> {
    const skillKey = `${repoSection}/${category}/${skillName}`;
    
    // Skip if already cached
    if (this.skillsCache.has(skillKey)) return;

    try {
      const skillMdUrl = `${this.RAW_GITHUB_BASE}/${repoSection}/${encodeURIComponent(category)}/${encodeURIComponent(skillName)}/SKILL.md`;
      const response = await fetch(skillMdUrl);
      
      if (!response.ok) {
        console.warn(`[MedicalSkillsRegistry] No SKILL.md for ${skillKey}: ${response.status}`);
        return;
      }

      const skillMdContent = await response.text();
      const metadata = this.parseSkillMd(skillMdContent, skillName, category, repoSection);
      
      if (metadata) {
        this.skillsCache.set(skillKey, metadata);
      }
    } catch (error) {
      console.error(`[MedicalSkillsRegistry] Error parsing ${skillKey}:`, error);
    }
  }

  /**
   * Parse SKILL.md content to extract structured metadata
   */
  private parseSkillMd(content: string, skillName: string, category: SkillCategory, repoSection: 'scientific-skills' | 'awesome-med-research-skills'): SkillMetadata | null {
    try {
      // Extract YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const frontmatter = frontmatterMatch ? this.parseYaml(frontmatterMatch[1]) : {};

      // Extract description from frontmatter or first paragraph
      const description = frontmatter.description || this.extractDescription(content, skillName);

      // Extract triggers
      const triggers = this.extractTriggers(content);

      // Extract reference modules
      const referenceModules = this.extractReferenceModules(content);

      // Extract execution steps
      const executionSteps = this.extractExecutionSteps(content);

      // Extract hard rules
      const hardRules = this.extractHardRules(content);

      // Extract maturity frameworks
      const maturityFrameworks = this.extractMaturityFrameworks(content);

      // Build input/output schemas from the skill content
      const inputSchema = this.buildInputSchema(content, triggers);
      const outputSchema = this.buildOutputSchema(content);

      return {
        name: frontmatter.name || skillName,
        description,
        license: frontmatter.license || 'MIT',
        author: frontmatter.author || frontmatter['skill-author'] || 'AIPOCH',
        category,
        subcategory: this.getSubcategory(skillName, category),
        triggers,
        inputSchema,
        outputSchema,
        referenceModules,
        executionSteps,
        hardRules,
        maturityFrameworks,
        apiSpecifications: {
          primary: null,
          secondary: undefined,
        },
        citationFormat: {
          pubmed: {
            template: '',
            clickable: true,
            urlTemplate: 'https://pubmed.ncbi.nlm.nih.gov/{{pmid}}/',
            requiredFields: ['pmid'],
          },
          clinicaltrials: {
            template: '',
            clickable: true,
            urlTemplate: 'https://clinicaltrials.gov/ct2/show/{{nctId}}',
            requiredFields: ['nctId'],
          },
          doi: {
            template: '',
            clickable: true,
            urlTemplate: 'https://doi.org/{{doi}}',
            requiredFields: ['doi'],
          },
        },
        imageGeneration: {
          enabled: false,
          types: [],
          mermaidTemplates: {},
          chartTypes: [],
          outputFormat: 'svg',
        },
        sourcePath: `${repoSection}/${category}/${skillName}`,
        sourceRepo: repoSection,
      };
    } catch (error) {
      console.error(`[MedicalSkillsRegistry] Failed to parse ${skillName}:`, error);
      return null;
    }
  }

  /**
   * Parse simple YAML (frontmatter)
   */
  private parseYaml(yaml: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = yaml.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        let value = match[2].trim();
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        result[match[1]] = value;
      }
    }
    return result;
  }

  /**
   * Extract description from skill content
   */
  private extractDescription(content: string, skillName: string): string {
    // Try to find the first substantial paragraph after frontmatter
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

  /**
   * Extract trigger phrases from skill content
   */
  private extractTriggers(content: string): string[] {
    const triggers: string[] = [];
    
    // Look for "Sample Triggers" or "Trigger" sections
    const triggerSectionMatch = content.match(/## Sample Triggers\n([\s\S]*?)(?=\n## |\n---|$)/i);
    if (triggerSectionMatch) {
      const triggerLines = triggerSectionMatch[1].split('\n');
      for (const line of triggerLines) {
        const match = line.match(/^[-*]\s*"([^"]+)"/);
        if (match) triggers.push(match[1]);
      }
    }

    // Also check frontmatter for description which often contains triggers
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = this.parseYaml(frontmatterMatch[1]);
      if (frontmatter.description) {
        // Extract quoted phrases from description
        const quotedMatches = frontmatter.description.match(/"([^"]+)"/g);
        if (quotedMatches) {
          triggers.push(...quotedMatches.map(m => m.slice(1, -1)));
        }
      }
    }

    return [...new Set(triggers)]; // deduplicate
  }

  /**
   * Extract reference modules from skill content
   */
  private extractReferenceModules(content: string): ReferenceModule[] {
    const modules: ReferenceModule[] = [];
    
    // Look for "Reference Module" or "References" section
    const refSectionMatch = content.match(/## Reference Module\n([\s\S]*?)(?=\n## |\n---|$)/i);
    if (refSectionMatch) {
      const refContent = refSectionMatch[1];
      const lines = refContent.split('\n');
      
      for (const line of lines) {
        const match = line.match(/`references\/([^`]+)`\s*[→→-]\s*(.+)/);
        if (match) {
          modules.push({
            name: match[1].replace('.md', ''),
            path: `references/${match[1]}`,
            purpose: match[2].trim(),
            usedInSections: this.extractSectionsFromPurpose(match[2]),
          });
        }
      }
    }

    return modules;
  }

  /**
   * Extract section references from purpose text
   */
  private extractSectionsFromPurpose(purpose: string): string[] {
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

  /**
   * Extract execution steps from skill content
   */
  private extractExecutionSteps(content: string): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    
    // Look for "Execution" or "Steps" section
    const execSectionMatch = content.match(/## Execution[^#]*\n([\s\S]*?)(?=\n## |\n---|$)/i);
    if (execSectionMatch) {
      const execContent = execSectionMatch[1];
      const stepMatches = execContent.match(/### Step (\d+)[^#]*\n([\s\S]*?)(?=\n### Step \d+|\n## |\n---|$)/gi);
      
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

  /**
   * Extract hard rules from skill content
   */
  private extractHardRules(content: string): string[] {
    const rules: string[] = [];
    
    const hardRulesMatch = content.match(/## Hard Rules\n([\s\S]*?)(?=\n## |\n---|$)/i);
    if (hardRulesMatch) {
      const ruleLines = hardRulesMatch[1].split('\n');
      for (const line of ruleLines) {
        const match = line.match(/^\d+\.\s+(.+)/);
        if (match) rules.push(match[1].trim());
      }
    }

    return rules;
  }

  /**
   * Extract maturity frameworks from skill content
   */
  private extractMaturityFrameworks(content: string): MaturityFramework[] {
    const frameworks: MaturityFramework[] = [];
    
    // Look for maturity table
    const maturityMatch = content.match(/## Strict.*Maturity Table Standard\n([\s\S]*?)(?=\n## |\n---|$)/i);
    if (maturityMatch) {
      const tableContent = maturityMatch[1];
      const tiers: MaturityTier[] = [];
      
      // Parse markdown table
      const rows = tableContent.split('\n').filter(r => r.includes('|') && !r.includes('---'));
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

  /**
   * Build input schema from skill content and triggers
   */
  private buildInputSchema(content: string, triggers: string[]): SkillInputSchema {
    // Extract input validation section
    const inputValidationMatch = content.match(/## Input Validation\n([\s\S]*?)(?=\n## |\n---|$)/i);
    
    const properties: Record<string, SchemaProperty> = {
      query: {
        type: 'string',
        description: 'The medical research query or question to process with this skill',
      },
      context: {
        type: 'string',
        description: 'Additional context such as disease, population, specimen type, use case, or constraints',
      },
    };

    // Add skill-specific parameters based on triggers
    if (triggers.some(t => t.toLowerCase().includes('biomarker'))) {
      properties.biomarkerType = {
        type: 'string',
        description: 'Type of biomarker (genomic, transcriptomic, protein, metabolite, imaging, pathology, clinical score, liquid biopsy, multimodal)',
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

    return {
      type: 'object',
      properties,
      required: ['query'],
    };
  }

  /**
   * Build output schema from skill content
   */
  private buildOutputSchema(content: string): SkillOutputSchema {
    // Extract mandatory output sections
    const outputMatch = content.match(/## Mandatory Output Structure\n([\s\S]*?)(?=\n## |\n---|$)/i);
    
    const properties: Record<string, SchemaProperty> = {
      summary: {
        type: 'string',
        description: 'Executive summary of the skill output',
      },
      sections: {
        type: 'object',
        description: 'Structured output sections as defined by the skill',
        properties: {},
      },
      references: {
        type: 'array',
        description: 'Retrieved and verified references',
        items: { type: 'string', description: 'Reference citation' },
      },
      confidence: {
        type: 'number',
        description: 'Confidence score (0-1) for the output',
      },
      nextSteps: {
        type: 'array',
        description: 'Recommended follow-up actions or skills',
        items: { type: 'string', description: 'Next step description' },
      },
    };

    if (outputMatch) {
      const sectionMatches = outputMatch[1].match(/### ([A-J])\.\s*([^\n]+)/g);
      if (sectionMatches) {
        const sectionProps: Record<string, SchemaProperty> = {};
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

    return {
      type: 'object',
      properties,
    };
  }

  /**
   * Determine subcategory for a skill
   */
  private getSubcategory(skillName: string, category: SkillCategory): string {
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

  /**
   * Build Gemini function declarations from all loaded skills
   */
  private buildFunctionDeclarations(): void {
    this.functionDeclarationsCache = [];
    
    for (const [key, skill] of this.skillsCache) {
      const funcDecl: FunctionDeclaration = {
        name: `skill_${skill.name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        description: `[${skill.category} > ${skill.subcategory}] ${skill.description}`,
        parameters: this.convertToSchema(skill.inputSchema),
      };
      this.functionDeclarationsCache.push(funcDecl);
    }
    
    console.log(`[MedicalSkillsRegistry] Built ${this.functionDeclarationsCache.length} function declarations`);
  }

  /**
   * Convert SkillInputSchema to Gemini Schema type
   */
  private convertToSchema(inputSchema: SkillInputSchema): Schema {
    const convertProperty = (prop: SchemaProperty): Schema => {
      const schema: Schema = {
        type: prop.type as Type,
        description: prop.description,
      };
      
      if (prop.enum) {
        schema.enum = prop.enum;
      }
      
      if (prop.items) {
        schema.items = convertProperty(prop.items);
      }
      
      if (prop.properties) {
        const properties: Record<string, Schema> = {};
        for (const [key, value] of Object.entries(prop.properties)) {
          properties[key] = convertProperty(value);
        }
        schema.properties = properties;
      }
      
      return schema;
    };
    
    const properties: Record<string, Schema> = {};
    for (const [key, value] of Object.entries(inputSchema.properties)) {
      properties[key] = convertProperty(value);
    }
    
    return {
      type: Type.OBJECT,
      properties,
      required: inputSchema.required,
    };
  }

  /**
   * Get all function declarations for Gemini tools config
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    return [...this.functionDeclarationsCache];
  }

  /**
   * Get function declarations filtered by category
   */
  getFunctionDeclarationsByCategory(category: SkillCategory): FunctionDeclaration[] {
    return this.functionDeclarationsCache.filter(fd => {
      const skillKey = Array.from(this.skillsCache.entries()).find(([_, s]) => 
        `skill_${s.name.replace(/[^a-zA-Z0-9_]/g, '_')}` === fd.name
      );
      return skillKey?.[1].category === category;
    });
  }

  /**
   * Get function declarations for a specific research stage
   */
  getFunctionDeclarationsForStage(stage: number): FunctionDeclaration[] {
    const category = Object.entries(RESEARCH_STAGES).find(([_, v]) => v.stage === stage)?.[0] as SkillCategory;
    if (!category) return [];
    return this.getFunctionDeclarationsByCategory(category);
  }

  /**
   * Find relevant skills for a user query using keyword matching
   */
  findRelevantSkills(query: string, maxResults = 10): SkillMetadata[] {
    const queryLower = query.toLowerCase();
    const scoredSkills: Array<{ skill: SkillMetadata; score: number }> = [];

    // Extract key medical terms from query (works across languages for Latin/Greek-based terms)
    const queryWords = queryLower.split(/[\s,;:.!?()\[\]{}"'\/\\]+/).filter(w => w.length > 2);
    
    for (const skill of this.skillsCache.values()) {
      let score = 0;
      
      // Match against triggers
      for (const trigger of skill.triggers) {
        if (queryLower.includes(trigger.toLowerCase())) {
          score += 10;
        }
      }
      
      // Match against description keywords
      const descWords = skill.description.toLowerCase().split(/\s+/);
      for (const word of descWords) {
        if (word.length > 4 && queryLower.includes(word)) {
          score += 2;
        }
      }
      
      // Match against instructions (rich medical terminology - helps with non-English queries)
      if (skill.instructions) {
        const instrLower = skill.instructions.toLowerCase();
        // Full-text match: each query word found in instructions adds score
        for (const qWord of queryWords) {
          if (qWord.length > 3 && instrLower.includes(qWord)) {
            score += 1;
          }
        }
        // Medical term matching: instructions contain Latin/Greek medical roots
        const medicalRoots = /\b(cardiac|cardio|ventricular|fibrillation|arrhythmia|tachycardia|bradycardia|infarction|ischemia|hypertension|diabetes|oncology|cancer|tumor|neoplasm|immuno|inflammation|infection|sepsis|trauma|fracture|surgery|surgical|anesthesia|pharmaco|toxicology|pediatric|geriatric|pregnancy|obstetric|neurology|psychiatry|dermatology|ophthalmology|radiology|pathology|hematology|nephrology|pulmonology|gastroenterology|endocrinology|rheumatology|epidemiology|genomic|proteomic|metabolomic|transcriptomic|biomarker|molecular|cellular|genetic|clinical trial|meta.analysis|systematic review|guideline|protocol|diagnosis|prognosis|treatment|therapy|drug|medication|dose|dosage|adverse|contraindication|mechanism|pathway|signaling|receptor|enzyme|inhibitor|agonist|antagonist|antibody|vaccine|screening|prevention|risk factor|mortality|morbidity|survival|recurrence|remission|relapse|metastasis|staging|grading|classification|phenotype|genotype|mutation|polymorphism|epigenetic|microbiome|microbiota|stem cell|regenerative|transplant|imaging|MRI|CT|ultrasound|X.ray|PET|SPECT|histology|cytology|biopsy|autopsy|forensic|toxicology|pharmacokinetic|pharmacodynamic|bioavailability|half.life|clearance|volume of distribution|AUC|Cmax|Tmax|EC50|IC50|KD|Ki|Km|Vmax|NNT|NNH|ARR|RRR|OR|RR|HR|CI|p.value|sensitivity|specificity|PPV|NPV|ROC|AUC.ROC|likelihood ratio|diagnostic odds|accuracy|precision|recall|F1|concordance|kappa|ICC|Bland.Altman|SD|SEM|IQR|percentile|z.score|t.test|ANOVA|chi.square|Fisher|Mann.Whitney|Wilcoxon|Kruskal.Wallis|Friedman|log.rank|Breslow|Tarone.Ware|Cox|Kaplan.Meier|Weibull|Gompertz|logistic|linear|mixed.model|GEE|GLM|GLMM|Bayesian|MCMC|frequentist|likelihood|prior|posterior|credible|bootstrap|jackknife|permutation|cross.validation|LOOCV|k.fold|stratified|oversampling|SMOTE|undersampling|ensemble|bagging|boosting|stacking|random.forest|XGBoost|LightGBM|CatBoost|SVM|kNN|k.means|hierarchical|DBSCAN|PCA|t.SNE|UMAP|NMF|ICA|PLS|PLS.DA|OPLS|OPLS.DA|LASSO|ridge|elastic.net|decision.tree|naive.bayes|neural.network|deep.learning|CNN|RNN|LSTM|GRU|transformer|attention|GAN|VAE|diffusion|LLM|NLP|embedding|tokenization|attention.mechanism|BERT|GPT)\b/i;
        const rootMatches = instrLower.match(medicalRoots);
        if (rootMatches) {
          // Check how many of these medical roots also appear in the query
          const uniqueRoots = new Set(rootMatches.map(r => r.toLowerCase()));
          for (const root of uniqueRoots) {
            if (queryLower.includes(root)) {
              score += 4; // Strong signal: medical term in both query and instructions
            }
          }
        }
      }
      
      // Match against category/subcategory
      if (queryLower.includes(skill.category.toLowerCase())) score += 5;
      if (queryLower.includes(skill.subcategory.toLowerCase())) score += 5;
      
      // Match against skill name
      const nameWords = skill.name.toLowerCase().split(/[-_]/);
      for (const word of nameWords) {
        if (word.length > 3 && queryLower.includes(word)) {
          score += 3;
        }
      }

      if (score > 0) {
        scoredSkills.push({ skill, score });
      }
    }

    // Sort by score descending and return top results
    const results = scoredSkills
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.skill);
    
    // FALLBACK: If no skills matched (e.g., non-English query), return general-purpose skills
    // that can handle any medical query via PubMed/ClinicalTrials APIs
    if (results.length === 0) {
      const fallbackSkillNames = [
        'literature-evidence-mapper',
        'clinical-trial-search',
        'evidence-gap-detector',
        'pubmed-search-strategist',
        'systematic-review-protocol',
        'clinical-question-analyzer',
        'guideline-evidence-checker',
        'medical-concept-extractor',
        'research-question-formulator',
        'evidence-synthesis-engine'
      ];
      const fallbackSkills: SkillMetadata[] = [];
      for (const name of fallbackSkillNames) {
        const skill = this.getSkill(name);
        if (skill) fallbackSkills.push(skill);
      }
      console.log(`[MedicalSkillsRegistry] No direct matches for query, using ${fallbackSkills.length} fallback skills`);
      return fallbackSkills.slice(0, maxResults);
    }
    
    return results;
  }

  /**
   * Get skill by name
   */
  getSkill(skillName: string): SkillMetadata | undefined {
    for (const skill of this.skillsCache.values()) {
      if (skill.name === skillName || skill.name.replace(/[^a-zA-Z0-9_]/g, '_') === skillName) {
        return skill;
      }
    }
    return undefined;
  }

  /**
   * Check if a skill is registered (by function declaration name)
   */
  isSkillRegistered(functionName: string): boolean {
    // Check if the function name matches any skill's function declaration name
    for (const skill of this.skillsCache.values()) {
      const funcName = `skill_${skill.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      if (funcName === functionName) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all skills in a category
   */
  getSkillsByCategory(category: SkillCategory): SkillMetadata[] {
    return Array.from(this.skillsCache.values()).filter(s => s.category === category);
  }

  /**
   * Get all skills
   */
  getAllSkills(): SkillMetadata[] {
    return Array.from(this.skillsCache.values());
  }

  /**
   * Get all skill names
   */
  getAllSkillNames(): string[] {
    return Array.from(this.skillsCache.keys());
  }

  /**
   * Get skill count
   */
  getSkillCount(): number {
    return this.skillsCache.size;
  }

  /**
   * Execute a skill with support for skill chaining
   */
  async executeSkill(functionName: string, args: Record<string, unknown>, chainContext?: SkillChainContext): Promise<SkillExecutionResult> {
    // Find skill by function name
    let skill: SkillMetadata | undefined;
    for (const s of this.skillsCache.values()) {
      const funcName = `skill_${s.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      if (funcName === functionName) {
        skill = s;
        break;
      }
    }
    
    if (!skill) {
      const result: SkillExecutionResult = {
        success: false,
        skillName: functionName,
        output: {},
        sectionsCompleted: [],
        referencesUsed: [],
        error: `Skill not found for function: ${functionName}`,
        // chainContext intentionally omitted to avoid circular JSON
      };
      return result;
    }

    // This is a placeholder for actual skill execution
    // In production, this would:
    // 1. Load reference modules
    // 2. Execute the skill's workflow steps
    // 3. Call external APIs (PubMed, etc.) as needed
    // 4. Run any bundled scripts (Python/R)
    // 5. Return structured output

    console.log(`[MedicalSkillsRegistry] Executing skill: ${skill.name}${chainContext ? ` (chain step ${chainContext.stepIndex + 1}/${chainContext.totalSteps})` : ''}`);
    
    // Build input with chain context
    const enhancedInput = { ...args };
    if (chainContext && Object.keys(chainContext.previousResults).length > 0) {
      enhancedInput._chainContext = {
        previousResults: chainContext.previousResults,
        originalQuery: chainContext.originalQuery,
      };
    }

    const nextSkillName = this.suggestNextSkill(skill, { skillName: skill.name, input: enhancedInput, userQuery: chainContext?.originalQuery || '' });
    const nextSkill = nextSkillName ? this.getSkill(nextSkillName) : undefined;
    
    // Prepare input for next skill if chaining
    let nextSkillInput: Record<string, unknown> | undefined;
    if (nextSkill) {
      // Create a mock output for the current skill to pass to next skill
      const mockOutput = {
        summary: `Executed ${skill.name} for query`,
        sections: {},
        references: [],
        confidence: 0.8,
        nextSteps: nextSkillName ? [nextSkillName] : [],
      };
      nextSkillInput = this.prepareNextSkillInput(skill, nextSkill, enhancedInput, mockOutput);
    }

    return {
      success: true,
      output: {
        summary: `Executed ${skill.name} for query`,
        sections: {},
        references: [],
        confidence: 0.8,
        nextSteps: nextSkillName ? [nextSkillName] : [],
      },
      sectionsCompleted: skill.executionSteps.map(s => s.title),
      referencesUsed: skill.referenceModules.map(r => r.name),
      nextRecommendedSkill: nextSkillName,
      nextRecommendedSkillInput: nextSkillInput,
      skillName: skill.name,
      // chainContext intentionally omitted to avoid circular JSON when sent as function response
    };
  }

  /**
   * Prepare input for the next skill in a chain based on current skill output
   */
  private prepareNextSkillInput(currentSkill: SkillMetadata, nextSkill: SkillMetadata, currentInput: Record<string, unknown>, currentOutput?: Record<string, unknown>): Record<string, unknown> {
    // Strip _chainContext to avoid circular references in nextRecommendedSkillInput
    const { _chainContext, ...cleanInput } = currentInput as Record<string, unknown> & { _chainContext?: unknown };
    const nextInput: Record<string, unknown> = { ...cleanInput };
    
    // Pass relevant data from current skill to next skill
    // This is a simplified version - in production, this would map specific output fields
    if (currentSkill.category === 'Evidence Insight' && nextSkill.category === 'Data Analysis') {
      nextInput.previousEvidence = currentInput.query || currentInput.topic;
      if (currentOutput?.articles) {
        nextInput.evidenceArticles = currentOutput.articles;
        nextInput.totalArticlesFound = currentOutput.totalArticlesFound;
      }
    } else if (currentSkill.category === 'Data Analysis' && nextSkill.category === 'Academic Writing') {
      nextInput.analysisResults = currentInput.query || currentInput.topic;
      if (currentOutput?.analysisResults) {
        nextInput.analysisData = currentOutput.analysisResults;
      }
    } else if (currentSkill.category === 'Protocol Design' && nextSkill.category === 'Academic Writing') {
      nextInput.protocolDetails = currentInput.query || currentInput.topic;
      if (currentOutput?.trials) {
        nextInput.trialData = currentOutput.trials;
        nextInput.totalTrialsFound = currentOutput.totalTrialsFound;
      }
    } else if (currentSkill.category === 'Evidence Insight' && nextSkill.category === 'Academic Writing') {
      nextInput.evidenceSummary = currentInput.query || currentInput.topic;
      if (currentOutput?.articles) {
        nextInput.evidenceArticles = currentOutput.articles;
        nextInput.totalArticlesFound = currentOutput.totalArticlesFound;
      }
    } else if (currentSkill.category === 'Evidence Insight' && nextSkill.category === 'Protocol Design') {
      nextInput.evidenceBase = currentInput.query || currentInput.topic;
      if (currentOutput?.articles) {
        nextInput.evidenceArticles = currentOutput.articles;
      }
    }
    
    return nextInput;
  }

  /**
   * Suggest next skill based on current skill output
   */
  private suggestNextSkill(currentSkill: SkillMetadata, context: SkillExecutionContext): string | undefined {
    // Simple chaining logic based on research stages
    const currentStage = RESEARCH_STAGES[currentSkill.category as keyof typeof RESEARCH_STAGES]?.stage || 0;
    const nextStage = currentStage + 1;
    
    if (nextStage <= 5) {
      const nextCategory = Object.entries(RESEARCH_STAGES).find(([_, v]) => v.stage === nextStage)?.[0];
      if (nextCategory) {
        const nextSkills = this.getSkillsByCategory(nextCategory as SkillCategory);
        if (nextSkills.length > 0) {
          // Filter by relevance to context
          const relevantNext = nextSkills.filter(s => 
            s.triggers.some(t => context.userQuery.toLowerCase().includes(t.toLowerCase())) ||
            s.triggers.some(t => JSON.stringify(context.input).toLowerCase().includes(t.toLowerCase()))
          );
          return (relevantNext.length > 0 ? relevantNext[0] : nextSkills[0]).name;
        }
      }
    }
    return undefined;
  }

  /**
   * Get research stage info for a skill
   */
  getResearchStage(skillName: string): { stage: number; name: string; description: string } | null {
    const skill = this.getSkill(skillName);
    if (!skill) return null;
    
    const stageInfo = RESEARCH_STAGES[skill.category as keyof typeof RESEARCH_STAGES];
    if (!stageInfo) return null;
    
    return {
      stage: stageInfo.stage,
      name: stageInfo.name,
      description: stageInfo.description,
    };
  }

  /**
   * Clear cache and force refresh
   */
  async refresh(): Promise<void> {
    this.skillsCache.clear();
    this.functionDeclarationsCache = [];
    this.lastFetchTime = 0;
    await this.initialize(true);
  }

  // ============================================================================
  // API Service Methods for Skill Execution
  // ============================================================================

  /**
   * Search PubMed for articles
   */
  async searchPubMed(query: string, maxResults = 20): Promise<PubMedSearchResult> {
    try {
      // Use NCBI E-utilities API
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();
      
      const pmids = searchData.esearchresult?.idlist || [];
      if (pmids.length === 0) {
        return { articles: [], totalCount: 0, query };
      }

      // Fetch article details
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
      const fetchResponse = await fetch(fetchUrl);
      const xmlText = await fetchResponse.text();
      
      // Parse XML (simplified - in production use a proper XML parser)
      const articles = this.parsePubMedXML(xmlText);
      
      return {
        articles,
        totalCount: parseInt(searchData.esearchresult?.count || '0'),
        query,
      };
    } catch (error) {
      console.error('[MedicalSkillsRegistry] PubMed search error:', error);
      return { articles: [], totalCount: 0, query, error: String(error) };
    }
  }

  /**
   * Parse PubMed XML response
   */
  private parsePubMedXML(xml: string): PubMedArticle[] {
    const articles: PubMedArticle[] = [];
    
    // Simple regex-based parsing (in production, use DOMParser or xml2js)
    const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
    
    for (const articleXml of articleMatches) {
      const pmidMatch = articleXml.match(/<PMID[^>]*>([^<]+)<\/PMID>/);
      const titleMatch = articleXml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
      const abstractMatch = articleXml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
      const journalMatch = articleXml.match(/<Journal><Title>([^<]+)<\/Title>/);
      const pubDateMatch = articleXml.match(/<PubDate>[\s\S]*?<Year>([^<]+)<\/Year>/);
      const doiMatch = articleXml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
      
      // Extract authors
      const authorMatches = articleXml.match(/<Author>[\s\S]*?<\/Author>/g) || [];
      const authors = authorMatches.map(a => {
        const lastName = a.match(/<LastName>([^<]+)<\/LastName>/);
        const foreName = a.match(/<ForeName>([^<]+)<\/ForeName>/);
        return `${foreName?.[1] || ''} ${lastName?.[1] || ''}`.trim();
      }).filter(a => a.length > 0);

      // Extract MeSH terms
      const meshMatches = articleXml.match(/<MeshHeading>[\s\S]*?<\/MeshHeading>/g) || [];
      const meshTerms = meshMatches.map(m => {
        const descriptor = m.match(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/);
        return descriptor?.[1];
      }).filter(Boolean) as string[];

      if (pmidMatch && titleMatch) {
        articles.push({
          pmid: pmidMatch[1],
          title: titleMatch[1].replace(/<[^>]+>/g, ''),
          abstract: abstractMatch?.[1]?.replace(/<[^>]+>/g, '') || '',
          authors,
          journal: journalMatch?.[1] || '',
          pubDate: pubDateMatch?.[1] || '',
          doi: doiMatch?.[1],
          meshTerms,
        });
      }
    }
    
    return articles;
  }

  /**
   * Search ClinicalTrials.gov
   */
  async searchClinicalTrials(query: string, maxResults = 20): Promise<ClinicalTrialsSearchResult> {
    try {
      const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=${maxResults}&format=json`;
      const response = await fetch(url);
      const data = await response.json();
      
      const trials: ClinicalTrial[] = (data.studies || []).map((study: any) => ({
        nctId: study.protocolSection?.identificationModule?.nctId || '',
        title: study.protocolSection?.identificationModule?.briefTitle || '',
        status: study.protocolSection?.statusModule?.overallStatus || '',
        phase: study.protocolSection?.designModule?.phases?.join(', ') ?? 'N/A',
        conditions: study.protocolSection?.conditionsModule?.conditions || [],
        interventions: study.protocolSection?.armsInterventionsModule?.interventions?.map((i: any) => i.name) || [],
        sponsor: study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name || '',
        startDate: study.protocolSection?.statusModule?.startDateStruct?.date || '',
        completionDate: study.protocolSection?.statusModule?.completionDateStruct?.date || '',
        locations: study.protocolSection?.contactsLocationsModule?.locations?.map((l: any) => `${l.city}, ${l.state}, ${l.country}`).filter(Boolean) || [],
      }));
      
      return {
        trials,
        totalCount: data.totalCount || trials.length,
        query,
      };
    } catch (error) {
      console.error('[MedicalSkillsRegistry] ClinicalTrials search error:', error);
      return { trials: [], totalCount: 0, query, error: String(error) };
    }
  }

  /**
   * Execute a skill with actual API calls using SkillApiExecutor
   */
  async executeSkillWithAPIs(functionName: string, args: Record<string, unknown>, chainContext?: SkillChainContext): Promise<SkillExecutionResult> {
    // First get the basic skill execution result
    const baseResult = await this.executeSkill(functionName, args, chainContext);
    
    // Find the skill
    let skill: SkillMetadata | undefined;
    for (const s of this.skillsCache.values()) {
      const funcName = `skill_${s.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      if (funcName === functionName) {
        skill = s;
        break;
      }
    }
    
    if (!skill || !baseResult.success) {
      return baseResult;
    }

    // Enhance with actual API calls using SkillApiExecutor
    try {
      // Add chain context to args for Academic Writing skills
      const enhancedArgs = { ...args };
      if (chainContext) {
        enhancedArgs._chainContext = chainContext;
      }

      const apiResult = await skillApiExecutor.executeSkillApi(skill, enhancedArgs);
      
      // Build enhanced output with structured output from API executor
      const enhancedOutput = {
        ...baseResult.output,
        ...apiResult.structuredOutput,
        // Include raw data for reference
        _apiData: {
          articles: apiResult.articles,
          trials: apiResult.trials,
          evidenceMap: apiResult.evidenceMap,
          analysisCode: apiResult.analysisCode,
          manuscript: apiResult.manuscript,
          protocol: apiResult.protocol,
        },
      };

      return {
        ...baseResult,
        output: enhancedOutput,
        referencesUsed: [...(baseResult.referencesUsed ?? []), ...apiResult.citations.map(c => c.formatted)],
        citations: apiResult.citations,
        images: apiResult.images,
        // Strip _chainContext from nextRecommendedSkillInput to avoid circular references
        nextRecommendedSkillInput: baseResult.nextRecommendedSkillInput ? (() => {
          const { _chainContext, ...clean } = baseResult.nextRecommendedSkillInput as Record<string, unknown> & { _chainContext?: unknown };
          return clean;
        })() : undefined,
        // Ensure skillName is always present
        skillName: skill.name,
      };
    } catch (error) {
      console.error(`[MedicalSkillsRegistry] API enhancement failed for ${skill.name}:`, error);
      return { ...baseResult, skillName: skill.name }; // Return base result if API calls fail
    }
  }

  /**
   * Execute an entire skill chain in a single local execution
   * This batches multiple skill calls into one, reducing LLM round-trips
   */
  async executeSkillChain(
    initialSkillName: string,
    initialArgs: Record<string, unknown>,
    userQuery: string,
    maxSteps: number = 3
  ): Promise<SkillExecutionResult[]> {
    const chainResults: SkillExecutionResult[] = [];
    let currentSkillName = initialSkillName;
    let currentSkillArgs = initialArgs;
    const chainContext: SkillChainContext = {
      chainId: `chain_${Date.now()}`,
      stepIndex: 0,
      totalSteps: maxSteps,
      previousResults: {},
      originalQuery: userQuery,
    };

    for (let step = 0; step < maxSteps; step++) {
      chainContext.stepIndex = step;
      
      try {
        const skillResult = await this.executeSkillWithAPIs(currentSkillName, currentSkillArgs, chainContext);
        
        // Strip chainContext from result to avoid circular JSON when sent as function response
        const { chainContext: _, ...cleanResult } = skillResult;
        chainResults.push(cleanResult);
        
        // Store this skill's result in chain context for next skill (keep chainContext internally)
        chainContext.previousResults[currentSkillName] = skillResult;
        
        // Check if there's a next recommended skill
        if (skillResult.nextRecommendedSkill && skillResult.success) {
          const nextSkillFuncName = `skill_${skillResult.nextRecommendedSkill.replace(/[^a-zA-Z0-9_]/g, '_')}`;
          if (this.isSkillRegistered(nextSkillFuncName)) {
            currentSkillName = nextSkillFuncName;
            // Strip _chainContext from nextRecommendedSkillInput to avoid circular references
            const { _chainContext, ...cleanNextInput } = (skillResult.nextRecommendedSkillInput || { query: userQuery }) as Record<string, unknown> & { _chainContext?: unknown };
            currentSkillArgs = cleanNextInput;
            continue; // Execute next skill in chain
          }
        }
        // No more skills in chain
        break;
      } catch (skillError: any) {
        console.error(`[MedicalSkillsRegistry] Skill ${currentSkillName} execution failed:`, skillError);
        chainResults.push({
          success: false,
          output: { error: skillError.message || 'Skill execution failed' },
          sectionsCompleted: [],
          referencesUsed: [],
          skillName: currentSkillName,
        });
        break;
      }
    }

    return chainResults;
  }
}

// ============================================================================
// Singleton Instance & Export
// ============================================================================

export const medicalSkillsRegistry = MedicalSkillsRegistry.getInstance();

// ============================================================================
// Helper function for easy initialization in geminiService.ts
// ============================================================================

export async function initializeMedicalSkillsRegistry(): Promise<FunctionDeclaration[]> {
  await medicalSkillsRegistry.initialize();
  return medicalSkillsRegistry.getFunctionDeclarations();
}

export async function getMedicalSkillsForQuery(query: string): Promise<FunctionDeclaration[]> {
  await medicalSkillsRegistry.initialize();
  const relevantSkills = medicalSkillsRegistry.findRelevantSkills(query, 15);
  const functionNames = relevantSkills.map(s => `skill_${s.name.replace(/[^a-zA-Z0-9_]/g, '_')}`);
  return medicalSkillsRegistry.getFunctionDeclarations().filter(fd => fd.name && functionNames.includes(fd.name));
}