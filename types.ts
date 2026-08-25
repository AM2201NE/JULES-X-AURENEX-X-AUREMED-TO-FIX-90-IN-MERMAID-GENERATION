

export type SourceType = 'aurenex' | 'notion' | 'google';

export interface Citation {
  title: string;
  id: string; // pageId or notionId
  sourceType: SourceType;
  url?: string;
  blockId?: string; // for highlighting text blocks
  timestamp?: number; // for audio/video seeking
}

export interface ChatAttachment {
  id: string;
  type: 'image' | 'audio' | 'file';
  mimeType: string;
  name: string;
  data: string; // base64 data URL
  status: 'pending' | 'generating' | 'done' | 'error';
  errorMessage?: string;
}

export interface MediaToRender {
  cid: string;
  type: 'image' | 'pdf' | 'audio' | 'video';
  caption: string;
  previewUrl: string; // can be a URL or a base64 data URI for generated images
  source: {
    pageTitle: string;
    blockId: string;
    notionUrl?: string;
  };
}

export interface GeneratedFile {
  fileName: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md' | 'mermaid' | 'apkg';
  content: string | Blob;
  mimeType: string;
}

export type EvidenceSourceType = 'aurenex_block' | 'notion_block' | 'notion_db_row' | 'notion_image' | 'notion_audio' | 'notion_video' | 'external_webpage' | 'drive_file' | 'pubmed_article' | 'clinical_trial' | 'generated_diagram';

export interface EvidenceLocation {
    character_range?: [number, number];
    bbox?: [number, number, number, number]; // [x,y,w,h]
    vtt_segment?: { start_s: number; end_s: number; };
}

export interface Evidence {
    evidence_id: string; // uuid
    source_type: EvidenceSourceType;
    source_ref: string; // block_id, row_id, media_id, url
    page_id: string;
    source_deeplink: string;
    snippet: string;
    translatedSnippet?: string; // Translated snippet in query language
    evidence_location?: EvidenceLocation;
    media_seek_time?: number;
    confidence: number;
    pageTitle?: string; // For UI display, not from model
    clickableUrl?: string; // Direct URL to source (PubMed, ClinicalTrials, etc.)
    formattedCitation?: string; // Ready-to-render markdown with link
    citationType?: 'pubmed' | 'clinicaltrials' | 'doi' | 'diagram' | 'workspace';
    metadata?: Record<string, any>; // Additional metadata for specific source types
}

// === NEW: Enhanced Evidence Types for AureMed ===

export interface ClickableCitation {
    pmid?: string;
    nctId?: string;
    doi?: string;
    formatted: string;           // Ready-to-render markdown with link
    clickableUrl: string;        // Direct URL to PubMed/ClinicalTrials.gov/DOI
    sourceType: 'pubmed' | 'clinicaltrials' | 'doi';
    metadata: {
        title?: string;
        authors?: string[];
        journal?: string;
        year?: number;
        volume?: string;
        issue?: string;
        pages?: string;
        status?: string;
        phase?: string;
        conditions?: string[];
        doi?: string;
        sponsor?: string;
        studyDesign?: string;
        evidenceLevel?: string;
        sampleSize?: number;
        [key: string]: any;
    };
}

export interface MermaidDiagram {
    type: 'mermaid';
    title: string;
    code: string;
    description: string;
}

export interface EnhancedEvidence extends Evidence {
    clickableUrl: string;
    formattedCitation: string;   // Ready-to-render markdown with link
    citationType: 'pubmed' | 'clinicaltrials' | 'doi' | 'diagram' | 'workspace';
    metadata: {
        pmid?: string;
        nctId?: string;
        doi?: string;
        authors?: string[];
        journal?: string;
        year?: number;
        title?: string;
        diagramType?: string;
        description?: string;
        [key: string]: any;
    };
}

// Skill metadata types for full skill definitions
export interface ExecutionStep {
    stepNumber: number;
    title: string;
    description: string;
    subSteps: string[];
    tools?: string[];
    outputs?: string[];
}

export interface ReferenceModule {
    name: string;
    path: string;
    purpose: string;
    usedInSections: string[];
}

export interface MaturityFrameworkTier {
    tier: number;
    label: string;
    minimumEvidence: string;
    cannotClaim: string;
}

export interface MaturityFramework {
    name: string;
    tiers: MaturityFrameworkTier[];
}

export interface ApiSpecification {
    name: string;
    baseUrl: string;
    endpoints: Record<string, string>;
    parameters: Record<string, string>;
    responseFormat: string;
    rateLimit: string;
}

export interface ApiSpecifications {
    primary: ApiSpecification | null;
    secondary?: ApiSpecification;
}

export interface CitationFormat {
    pubmed: {
        template: string;
        clickable: boolean;
        urlTemplate: string;
        requiredFields: string[];
    };
    clinicaltrials: {
        template: string;
        clickable: boolean;
        urlTemplate: string;
        requiredFields: string[];
    };
    doi: {
        template: string;
        clickable: boolean;
        urlTemplate: string;
        requiredFields: string[];
    };
}

export interface ImageGenerationSpec {
    enabled: boolean;
    types: string[];
    mermaidTemplates: Record<string, { description: string; template: string }>;
    chartTypes: string[];
    outputFormat: string;
}

export interface SkillMetadata {
    name: string;
    description: string;
    instructions?: string;
    license: string;
    author: string;
    category: string;
    subcategory: string;
    triggers: string[];
    inputSchema: any;
    outputSchema: any;
    referenceModules: ReferenceModule[];
    executionSteps: ExecutionStep[];
    hardRules: string[];
    maturityFrameworks: MaturityFramework[];
    apiSpecifications: ApiSpecifications;
    citationFormat: CitationFormat;
    imageGeneration: ImageGenerationSpec;
    sourcePath: string;
    sourceRepo: string;
}

// Skill execution result types
export interface SkillExecutionResult {
    success: boolean;
    skillName: string;
    output?: Record<string, unknown>;
    error?: string;
    referencesUsed?: string[];
    citations?: ClickableCitation[];
    images?: MermaidDiagram[];
    nextRecommendedSkill?: string;
    nextRecommendedSkillInput?: Record<string, unknown>;
    chainContext?: SkillChainContext;
    sectionsCompleted?: string[];
}

export interface SkillChainContext {
    chainId: string;
    stepIndex: number;
    totalSteps: number;
    previousResults: Record<string, unknown>;
    originalQuery: string;
}

export type MaturityTier = MaturityFrameworkTier;

export interface CategoryData {
    description: string;
    skills: SkillMetadata[];
}

export interface SkillsData {
    version: string;
    generatedAt: string;
    totalSkills: number;
    categories: Record<string, CategoryData>;
}

// === NEW: AureMed Architecture Types ===

export interface EvidenceBundle {
    question: string;
    citations: ClickableCitation[];
    summary: string;
    evidenceLevel: 'A' | 'B' | 'C' | 'D';
    studyDesigns: string[];
    sampleSizes: number[];
    recency: { start: Date | null; end: Date | null };
    conflicts: ConflictNote[];
}

export interface ConflictNote {
    description: string;
    citations: ClickableCitation[];
    resolution: string;
}

export type EvidenceGap = string | { description: string; type: string };

export interface EvidenceQuality {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    citationCount: number;
    evidenceLevel: 'A' | 'B' | 'C' | 'D';
    hasGuidelines: boolean;
    hasTrials: boolean;
    hasSystematicReviews: boolean;
}

export interface AggregatedEvidence {
    byQuestion: Map<string, EvidenceBundle>;
    guidelines: any[];
    protocols: any[];
    drugInfo: any[];
    trials: any[];
    systematicReviews: any[];
    overallQuality: EvidenceQuality;
    gaps: EvidenceGap[];
}

export interface ExecutedStep {
    skillName: string;
    stepIndex: number;
    input: Record<string, unknown>;
    output: SkillExecutionResult;
    durationMs: number;
    apiCalls: number;
}

export interface FailedStep {
    skillName: string;
    stepIndex: number;
    error: string;
    fallbackAttempted: boolean;
    fallbackSkill?: string;
}

export interface SkillChainExecutionResult {
    success: boolean;
    evidence: AggregatedEvidence;
    executedSteps: ExecutedStep[];
    failedSteps: FailedStep[];
    citations: ClickableCitation[];
    diagrams: MermaidDiagram[];
    apiCallsMade: number;
    quotaRemaining: any;
}

export interface ClinicalSection {
    title: string;
    content: string;
    evidenceLevel: 'A' | 'B' | 'C' | 'D';
    citations: ClickableCitation[];
    subsections?: ClinicalSection[];
}

export interface EvidenceSummary {
    totalCitations: number;
    uniquePmids: number;
    uniqueNctIds: number;
    studyDesigns: Record<string, number>;
    dateRange: { start: number | null; end: number | null };
    qualityScore: number;
    gaps: string[];
}

export interface CitationIndex {
    [citationKey: string]: {
        fullCitation: string;
        clickableUrl: string;
        sourceType: 'pubmed' | 'clinicaltrials' | 'guideline' | 'systematic_review' | 'doi';
        evidenceLevel: string;
        studyDesign: string;
        sampleSize?: number;
        year: number;
    };
}

export interface SynthesizedAnswer {
    answer: string;
    sections: ClinicalSection[];
    keyPoints: string[];
    clinicalPearls: string[];
    redFlags: string[];
    evidenceSummary: EvidenceSummary;
    citationIndex: CitationIndex;
}


export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OCRChunk {
  id: string;
  text: string;
  bbox: Bbox;
}

export interface VisualEntity {
  id: string;
  label: string;
  type: 'box' | 'mask' | 'icon' | 'arrow' | 'table_cell';
  bbox: Bbox;
}

export interface ImageAnalysis {
  imageUri: string;
  naturalWidth: number;
  naturalHeight: number;
  ocr: OCRChunk[];
  entities: VisualEntity[];
}

export interface AnkiCard {
  id: string;
  deck_name?: string;
  question: string;
  choices: { label: string; text: string; image_url?: string }[];
  answer: string | string[];
  explanation: string;
  sources: { title: string; url?: string; snippet?: string; loc?: string }[];
  media?: { filename: string; url: string; sha256?: string }[];
  confidence: number;
  evidence_chunks?: string[];
  image_bbox?: { x: number; y: number; width: number; height: number; };
  image_extraction_confidence?: number;
  question_image_b64?: string;
  image_type?: 'ECG' | 'XRay' | 'CT_MRI_Ultrasound' | 'AnatomicalDiagram' | 'Table_Graph' | 'Histology_Microscopy';
}

export type TaggableItemType = 'aurenex_page' | 'notion_page' | 'notion_tag' | 'drive_file';

export interface TaggableItem {
    id: string; // pageId or tag name
    title: string;
    type: TaggableItemType;
    subtitle?: string; // For directory paths
    notionPageId?: string; // for notion_page type
    tags?: { name: string; color: string }[];
    isFolder?: boolean; // For drive directories
    color?: string; // primarily for notion_tag color display
}

export interface ChatMessage {
  id:string;
  role: 'user' | 'model' | 'system';
  text: string; // This text can contain Markdown
  speech?: {
    textToSpeak: string;
  };
  citations?: Citation[];
  evidence?: Evidence[];
  mediaToRender?: MediaToRender[];
  generatedFiles?: GeneratedFile[];
  ankiCards?: AnkiCard[];
  isProcessing?: boolean; // To show a loading/thinking state
  thoughtProcess?: string; // Real-time thought stream from the agent (current thought)
  thoughtHistory?: { text: string; time: string }[]; // Per-message thought history for agent log
  pageCreated?: { // To show a link to a newly created page
    pageId: string;
    title: string;
  };
  groundingChunks?: { web: { uri: string; title: string; } }[];
  attachments?: ChatAttachment[];
  languageCode?: string; // IETF language code, e.g., 'en-US', 'fr-FR'
  imageAnalyses?: ImageAnalysis[];
  personality?: AiPersonality;
  audioUrl?: string; // Optional audio URL for text-to-speech output
  taggedItems?: TaggableItem[]; // For RAG Scoping
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
}

export interface RecentArticle {
    title: string;
    category: string;
    time: string;
}

export enum BlockType {
    H1 = 'h1',
    H2 = 'h2',
    H3 = 'h3',
    P = 'p',
    UL = 'ul',
    OL = 'ol',
    TODO = 'todo',
    QUOTE = 'quote',
    CODE = 'code',
    DIVIDER = 'divider',
    TOGGLE = 'toggle',
    TABLE = 'table',
    IMAGE = 'image',
}

export interface TableCell {
    id: string;
    content: string;
}

export interface TableRow {
    id: string;
    cells: TableCell[];
}
export interface TableData {
    rows: TableRow[];
}

export interface Block {
    id: string;
    type: BlockType;
    content: string;
    checked?: boolean;
    isOpen?: boolean;
    children?: Block[];
    tableData?: TableData;
    url?: string; // For images
}

export interface Page {
    id:string;
    title: string;
    content: Block[];
    createdAt: string;
    lastAccessedAt?: string;
    notionId?: string; // The ID of the original Notion page, if imported
}

export type AiPersonality = 'aurepal' | 'muse' | 'socrates' | 'jarvis' | 'exampal' | 'ocr' | 'auremed';
export type AiProvider = 'gemini' | 'mock';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export interface User {
    name: string;
    email: string;
    avatarUrl: string;
    age?: number;
    gender?: Gender;
    onboardingComplete: boolean;
    aiPersonality?: AiPersonality;
    aiProvider?: AiProvider;
}

export interface NotionIntegration {
    apiKey: string | null;
    pageTags?: Record<string, string[]>;
    pageSnippets?: Record<string, string>;
}

export interface GoogleDriveIntegration {
    accessToken: string | null;
    expiresAt?: number;
    selectedFiles: { id: string, name: string, mimeType: string, path?: string }[];
    fileTags?: Record<string, string[]>;
    fileSnippets?: Record<string, string>;
}

export interface Integrations {
    notion: NotionIntegration;
    googleDrive: GoogleDriveIntegration;
    autoScopePreference?: 'notion' | 'drive' | 'both';
}

export type View = 
  | { name: 'dashboard' }
  | { name: 'page', props: { pageId: string, highlightBlockId?: string, fromAi?: boolean, snippet?: string } }
  | { name: 'profile' }
  | { name: 'integrations' }
  | { name: 'notion_library' }
  | { name: 'drive_library' }
  | { name: 'drive_page', props: { fileId: string, mimeType: string, snippet?: string } }
  | { name: 'notion_page', props: { pageId: string, highlightBlockId?: string, fromAi?: boolean, timestamp?: number, snippet?: string } };


// --- Notion Specific Types ---

export interface Annotation {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  color: string;
}

export interface RichText {
  type: 'text' | 'mention' | 'equation';
  text?: {
    content: string;
    link: { url: string } | null;
  };
  mention?: {
    type: 'page';
    page: { id: string; };
  };
  equation?: {
    expression: string;
  };
  annotations: Annotation;
  plain_text: string;
  href: string | null;
}

interface BlockBase {
    id: string;
    type: string;
    has_children: boolean;
    children?: NotionBlock[]; // For nested blocks
}

export interface ParagraphBlock extends BlockBase { type: 'paragraph'; paragraph: { rich_text: RichText[]; color: string; }; }
export interface HeadingBlock extends BlockBase { type: 'heading_1' | 'heading_2' | 'heading_3'; heading_1?: { rich_text: RichText[]; color: string; is_toggleable?: boolean }; heading_2?: { rich_text: RichText[]; color: string; is_toggleable?: boolean }; heading_3?: { rich_text: RichText[]; color: string; is_toggleable?: boolean }; }
export interface ListItemBlock extends BlockBase { type: 'bulleted_list_item' | 'numbered_list_item'; bulleted_list_item?: { rich_text: RichText[]; color: string; }; numbered_list_item?: { rich_text: RichText[]; color: string; }; }
export interface TodoBlock extends BlockBase { type: 'to_do'; to_do: { rich_text: RichText[]; checked: boolean; color: string; }; }
export interface ToggleBlock extends BlockBase { type: 'toggle'; toggle: { rich_text: RichText[]; color: string; }; }
export interface QuoteBlock extends BlockBase { type: 'quote'; quote: { rich_text: RichText[]; color: string; }; }
export interface DividerBlock extends BlockBase { type: 'divider'; divider: {}; }
export interface ImageBlock extends BlockBase { type: 'image'; image: { type: 'external' | 'file'; caption: RichText[]; file?: { url: string; expiry_time: string }; external?: { url: string; }; }; }
export interface VideoBlock extends BlockBase { type: 'video'; video: { type: 'external' | 'file'; caption: RichText[]; file?: { url: string; expiry_time: string }; external?: { url: string; }; }; }
export interface AudioBlock extends BlockBase { type: 'audio'; audio: { type: 'external' | 'file'; caption: RichText[]; file?: { url: string; expiry_time: string }; external?: { url: string; }; }; }
export interface FileBlock extends BlockBase { type: 'file'; file: { type: 'external' | 'file'; caption: RichText[]; name: string; file?: { url: string; expiry_time: string }; external?: { url: string; }; }; }
export interface CodeBlock extends BlockBase { type: 'code'; code: { rich_text: RichText[]; caption: RichText[]; language: string; }; }
export interface EquationBlock extends BlockBase { type: 'equation'; equation: { expression: string; }; }
export interface ColumnListBlock extends BlockBase { type: 'column_list'; column_list: {}; }
export interface ColumnBlock extends BlockBase { type: 'column'; column: {}; }
export interface CalloutBlock extends BlockBase { type: 'callout'; callout: { rich_text: RichText[]; icon: { type: 'emoji'; emoji: string } | { type: 'external'; external: { url: string } }; color: string; }; }
export interface BookmarkBlock extends BlockBase { type: 'bookmark'; bookmark: { url: string; caption: RichText[]; }; }
export interface EmbedBlock extends BlockBase { type: 'embed'; embed: { url: string; caption: RichText[]; }; }
export interface ChildPageBlock extends BlockBase { type: 'child_page'; child_page: { title: string; }; }
export interface ChildDatabaseBlock extends BlockBase { type: 'child_database'; child_database: { title: string; }; }
export interface TableBlock extends BlockBase { type: 'table'; table: { table_width: number; has_column_header: boolean; has_row_header: boolean; }; }
export interface TableRowBlock extends BlockBase { type: 'table_row'; table_row: { cells: RichText[][]; }; }
export interface SyncedBlock extends BlockBase { type: 'synced_block'; synced_block: { synced_from: { block_id: string } | null; }; }
export interface LinkPreviewBlock extends BlockBase { type: 'link_preview'; link_preview: { url: string; }; }
export interface TableOfContentsBlock extends BlockBase { type: 'table_of_contents'; table_of_contents: { color: string; }; }
export interface BreadcrumbBlock extends BlockBase { type: 'breadcrumb'; breadcrumb: {}; }


export type NotionBlock =
  | ParagraphBlock | HeadingBlock | ListItemBlock | TodoBlock | ToggleBlock | QuoteBlock | DividerBlock | ImageBlock | VideoBlock
  | AudioBlock | FileBlock | CodeBlock | EquationBlock | ColumnListBlock | ColumnBlock | CalloutBlock | BookmarkBlock | EmbedBlock | ChildPageBlock
  | ChildDatabaseBlock | TableBlock | TableRowBlock | SyncedBlock | LinkPreviewBlock | TableOfContentsBlock | BreadcrumbBlock;

export interface NotionTag {
    id: string;
    name: string;
    color: string;
}
export interface NotionPageInfo {
  id: string;
  title: string;
  url: string;
  object: 'page' | 'database';
  icon: {
    type: 'emoji' | 'file' | 'external' | null;
    value: string | null;
  };
  tags: NotionTag[];
  content?: NotionBlock[];
  description?: string | RichText[];
  last_edited_time?: string;
}

export interface RagContextPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}
export interface FormattedNotionResult {
    id: string;
    title: string;
    url: string;
    textContext: string; // The primary textual summary
    mediaParts: RagContextPart[]; // Additional media parts
    object: 'page' | 'database';
    content?: NotionBlock[];
}

export type AgentUpdate =
  | { type: 'response_complete'; payload: { answer: string; mediaToRender: MediaToRender[]; evidence: Evidence[]; generatedFiles?: GeneratedFile[]; suggestedChatTitle?: string; speech?: { textToSpeak: string }; imagesToGenerate?: string[]; languageCode?: string; imageAnalyses?: ImageAnalysis[]; ankiCards?: AnkiCard[]; personality?: AiPersonality; groundingChunks?: { web: { uri: string; title: string; } }[]; } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'tool_start'; payload: { toolName: string; args?: any } }
  | { type: 'tool_result'; payload: { skillName: string; result: any; chainStep?: number; step?: number; totalSteps?: number; isChainStep?: boolean; success?: boolean; referencesUsed?: number; error?: boolean } }
  | { type: 'page_created'; payload: { pageId: string; title: string } }
  | { type: 'page_updated'; payload: { pageId: string; title: string } }
  | { type: 'grounding_results'; payload: { chunks: { web: { uri: string; title: string; } }[] } }
  | { type: 'attachment_start'; payload: { attachment: ChatAttachment } }
  | { type: 'attachment_complete'; payload: { attachmentId: string, data: string } }
  | { type: 'attachment_error'; payload: { attachmentId: string; message: string; } }
  | { type: 'attachment_cancelled', payload: { attachmentId: string } }
  | { type: 'evidence_ready'; payload: { evidence: Evidence[] } }
  | { type: 'text_chunk'; payload: { text: string } }
  | { type: 'chunk'; payload: { text: string; ankiCards?: AnkiCard[] } }
  | { type: 'timing'; payload: { stage: string; timestamp: number; durationMs?: number; totalDurationMs?: number; model?: string; skill?: string; steps?: number; message: string } };