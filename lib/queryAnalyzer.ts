/**
 * Query Analyzer
 * 
 * Understands the user's medical query BEFORE skill selection:
 * - Detects language and translates to English for API calls
 * - Classifies medical intent (diagnosis, treatment, drug info, etc.)
 * - Identifies clinical context (patient population, setting, acuity)
 * - Plans optimal skill chain with fallbacks
 * - Estimates API requirements
 * 
 * This replaces the fragile "AI decides which skills to call" approach
 * with deterministic, architecture-level query understanding.
 */

import { translationPipeline } from './translationPipeline';

export type MedicalIntent = 
  | 'diagnosis_workup'
  | 'treatment_protocol'
  | 'drug_info'
  | 'guideline_recommendation'
  | 'prognosis_outcome'
  | 'differential_diagnosis'
  | 'screening_prevention'
  | 'research_evidence'
  | 'clinical_trial_search'
  | 'pathophysiology'
  | 'procedure_technique'
  | 'lab_interpretation'
  | 'imaging_interpretation'
  | 'general_medical';

export type QueryUrgency = 'routine' | 'urgent' | 'emergency';

export interface ClinicalContext {
  patientPopulation?: string;
  setting?: 'inpatient' | 'outpatient' | 'emergency' | 'icu' | 'primary_care' | 'surgery' | 'unspecified';
  comorbidities?: string[];
  acuity?: 'stable' | 'unstable' | 'critical' | 'unspecified';
}

export interface SkillChainStep {
  skillName: string;
  purpose: string;
  inputMapping: string;  // Function body as string for serialization
  outputKeys: string[];
  fallbackSkills: string[];
  isOptional: boolean;
}

export interface SkillChainPlan {
  name: string;
  description: string;
  steps: SkillChainStep[];
  requiredApis: string[];
}

export interface QueryAnalysis {
  detectedLanguage: string;
  englishQuery: string;
  originalQuery: string;
  intent: MedicalIntent;
  urgency: QueryUrgency;
  clinicalContext: ClinicalContext;
  recommendedSkillChain: SkillChainPlan;
  fallbackChains: SkillChainPlan[];
  requiredApis: string[];
  estimatedApiCalls: number;
  keyTerms: string[];
}

// Intent classification patterns
// Patterns are checked against BOTH the English-translated query AND the original query
// This ensures correct intent classification even when translation fails
const INTENT_PATTERNS: Array<{ patterns: RegExp[]; intent: MedicalIntent }> = [
  // Emergency / acute treatment (EN + FR + ES + DE + IT + PT)
  { 
    patterns: [
      // English
      /\b(manage|management|treat|treatment|handle|handling|approach to|approach for)\b.*\b(emergency|acute|arrest|cardiac|ventricular|fibrillation|tachycardia|shock|stroke|sepsis|trauma|overdose|anaphylaxis|hemorrhage|bleeding|embolism|infarction|arrest)\b/i,
      /\b(ACLS|BLS|resuscitation|code blue|crash)\b/i,
      /\b(acute|emergency)\s+(management|treatment|care|protocol)\b/i,
      // French: gérer, traitement, urgence, fibrillation, ventriculaire, cardiaque, arrêt
      /\b(gérer|gerer|gestion|traitement|prendre en charge|approche)\b.*\b(urgence|aigu|arrêt|arret|cardiaque|ventriculaire|fibrillation|tachycardie|choc|accident|sepsis|traumatisme|hémorragie|hemorragie|embolie|infarctus)\b/i,
      /\b(fibrillation ventriculaire|arrêt cardiaque|arret cardiaque|réanimation|reanimation)\b/i,
      // Spanish: manejar, tratamiento, urgencia, fibrilación, ventricular
      /\b(manejar|manejo|tratamiento|tratar|abordaje)\b.*\b(urgencia|agudo|paro|cardíaco|cardiaco|ventricular|fibrilación|fibrilacion|taquicardia|choque|derrame|sepsis|trauma|hemorragia|embolia|infarto)\b/i,
      // German: behandeln, Behandlung, Notfall, Kammerflimmern
      /\b(behandeln|behandlung|handhaben|ansatz)\b.*\b(notfall|akut|stillstand|herz|kammer|flimmern|tachykardie|schock|schlaganfall|sepsis|trauma|blutung|embolie|infarkt)\b/i,
      // Italian: gestire, trattamento, emergenza, fibrillazione
      /\b(gestire|gestione|trattamento|trattare|approccio)\b.*\b(emergenza|acuto|arresto|cardiaco|ventricolare|fibrillazione|tachicardia|shock|ictus|sepsi|trauma|emorragia|embolia|infarto)\b/i,
      // Portuguese: gerir, tratamento, emergência, fibrilação
      /\b(gerir|gerir|manejo|tratamento|tratar|abordagem)\b.*\b(emergência|emergencia|agudo|parada|cardíaco|cardiaco|ventricular|fibrilação|fibrilacao|taquicardia|choque|acidente|sepsis|trauma|hemorragia|embolia|infarto)\b/i,
    ], 
    intent: 'treatment_protocol' 
  },
  // Diagnosis workup (EN + multi-language)
  {
    patterns: [
      // English
      /\b(diagnos|workup|work.up|evaluate|evaluation|assess|assessment|investigate|investigation)\b/i,
      /\b(how to diagnose|diagnostic approach|diagnostic criteria|diagnostic workup)\b/i,
      // French
      /\b(diagnostiquer|diagnostic|évaluation|evaluation|évaluer|evaluer|investiguer|investigation|bilan)\b/i,
      // Spanish
      /\b(diagnosticar|diagnóstico|diagnostico|evaluación|evaluacion|evaluar|investigar|investigación|investigacion)\b/i,
      // German
      /\b(diagnostizieren|diagnose|bewertung|bewerten|untersuchung|untersuchen)\b/i,
      // Italian
      /\b(diagnosticare|diagnosi|valutazione|valutare|indagine|indagare)\b/i,
      // Portuguese
      /\b(diagnosticar|diagnóstico|diagnostico|avaliação|avaliacao|avaliar|investigação|investigacao)\b/i,
    ],
    intent: 'diagnosis_workup',
  },
  // Drug information (EN + multi-language)
  {
    patterns: [
      // English
      /\b(dose|dosing|dosage|medication|drug|pharmac|side effect|adverse|interaction|contraindication|indication)\b/i,
      /\b(amiodarone|lidocaine|procainamide|epinephrine|adenosine|atropine|dopamine|norepinephrine|vasopressin|heparin|warfarin|aspirin|metoprolol|carvedilol|bisoprolol|lisinopril|enalapril|losartan|valsartan|atorvastatin|rosuvastatin|simvastatin|metformin|insulin|glipizide|empagliflozin|dapagliflozin|canagliflozin)\b/i,
      // French
      /\b(dose|dosage|posologie|médicament|medicament|pharmac|effet secondaire|effet indésirable|interaction|contre.indication|indication)\b/i,
      // Spanish
      /\b(dosis|dosificación|dosificacion|medicamento|fármaco|farmaco|farmac|efecto secundario|reacción adversa|reaccion adversa|interacción|interaccion|contraindicación|contraindicacion|indicación|indicacion)\b/i,
      // German
      /\b(dosis|dosierung|medikament|arzneimittel|pharma|nebenwirkung|wechselwirkung|kontraindikation|indikation)\b/i,
      // Italian
      /\b(dose|dosaggio|farmaco|medicinale|farmac|effetto collaterale|reazione avversa|interazione|controindicazione|indicazione)\b/i,
      // Portuguese
      /\b(dose|dosagem|medicamento|fármaco|farmaco|farmac|efeito colateral|reação adversa|reacao adversa|interação|interacao|contraindicação|contraindicacao|indicação|indicacao)\b/i,
    ],
    intent: 'drug_info',
  },
  // Guideline recommendation (EN + multi-language)
  {
    patterns: [
      // English
      /\b(guideline|guidelines|recommendation|recommendations|protocol|protocols|algorithm|algorithms|consensus|statement|society|AHA|ACC|ESC|AHA\/ACC|ESC\/ACC)\b/i,
      /\b(what (do|does) (guidelines|guideline|society|societies) (say|recommend))\b/i,
      // French
      /\b(recommandation|recommandations|protocole|protocoles|algorithme|algorithmes|consensus|directive|directives|société|societe)\b/i,
      // Spanish
      /\b(guía|guia|guías|guias|recomendación|recomendacion|protocolo|protocolos|algoritmo|algoritmos|consenso|sociedad)\b/i,
      // German
      /\b(leitlinie|leitlinien|empfehlung|empfehlungen|protokoll|protokolle|algorithmus|konsens|gesellschaft)\b/i,
      // Italian
      /\b(linea guida|linee guida|raccomandazione|raccomandazioni|protocollo|protocolli|algoritmo|algoritmi|consenso|società)\b/i,
      // Portuguese
      /\b(diretriz|diretrizes|recomendação|recomendacao|protocolo|protocolos|algoritmo|algoritmos|consenso|sociedade)\b/i,
    ],
    intent: 'guideline_recommendation',
  },
  // Prognosis
  {
    patterns: [
      /\b(prognosis|prognostic|outcome|outcomes|survival|mortality|morbidity|recurrence|relapse|remission|life expectancy)\b/i,
    ],
    intent: 'prognosis_outcome',
  },
  // Differential diagnosis
  {
    patterns: [
      /\b(differential|ddx|differential diagnosis|differentials|possible causes|causes of)\b/i,
    ],
    intent: 'differential_diagnosis',
  },
  // Screening / prevention
  {
    patterns: [
      /\b(screen|screening|prevent|prevention|prophylaxis|prophylactic|risk factor|risk reduction|primary prevention|secondary prevention)\b/i,
    ],
    intent: 'screening_prevention',
  },
  // Clinical trial search
  {
    patterns: [
      /\b(trial|trials|clinical trial|clinical trials|study|studies|ongoing|recruiting|enrolling|NCT)\b/i,
    ],
    intent: 'clinical_trial_search',
  },
  // Pathophysiology
  {
    patterns: [
      /\b(mechanism|pathophysiology|pathogenesis|etiology|cause|causes|underlying|pathway|molecular|cellular)\b/i,
    ],
    intent: 'pathophysiology',
  },
  // Procedure / technique
  {
    patterns: [
      /\b(procedure|technique|how to (perform|do|insert|place|intubate|catheterize|ligate|suture|anastomose))\b/i,
      /\b(surgery|surgical|operation|operative|intubation|catheter|central line|chest tube|paracentesis|thoracentesis|lumbar puncture|LP|arthrocentesis)\b/i,
    ],
    intent: 'procedure_technique',
  },
  // Lab interpretation
  {
    patterns: [
      /\b(lab|labs|laboratory|blood test|blood work|CBC|CMP|BMP|LFT|TSH|troponin|BNP|d.dimer|INR|PT|PTT|creatinine|BUN|electrolyte)\b/i,
    ],
    intent: 'lab_interpretation',
  },
  // Imaging interpretation
  {
    patterns: [
      /\b(X.ray|xray|CT|MRI|ultrasound|echo|echocardiogram|angiogram|angiography|mammography|PET|SPECT|imaging|radiograph|radiology)\b/i,
    ],
    intent: 'imaging_interpretation',
  },
  // Research evidence
  {
    patterns: [
      /\b(evidence|research|study|studies|literature|systematic review|meta.analysis|meta analysis|review|publication|paper|article)\b/i,
    ],
    intent: 'research_evidence',
  },
];

// Urgency detection patterns (EN + multi-language)
const URGENCY_PATTERNS: Array<{ patterns: RegExp[]; urgency: QueryUrgency }> = [
  {
    patterns: [
      // English
      /\b(emergency|arrest|code|crash|immediate|life.threatening|critical|unstable|crashing|dying|collapse|unconscious|unresponsive)\b/i,
      /\b(VF|ventricular fibrillation|VT|ventricular tachycardia|cardiac arrest|resuscitation|ACLS|code blue)\b/i,
      /\b(anaphylaxis|sepsis|septic shock|hemorrhage|massive bleeding|stroke|MI|STEMI|NSTEMI|PE|pulmonary embolism|aortic dissection)\b/i,
      // French
      /\b(urgence|arrêt|arret|réanimation|reanimation|immédiat|immediat|critique|instable|inconscient|sans réponse|sans reponse)\b/i,
      /\b(fibrillation ventriculaire|tachycardie ventriculaire|arrêt cardiaque|arret cardiaque|choc anaphylactique|sepsis|hémorragie|hemorragie|AVC|infarctus|embolie pulmonaire)\b/i,
      // Spanish
      /\b(emergencia|paro|reanimación|reanimacion|inmediato|crítico|critico|inestable|inconsciente|sin respuesta)\b/i,
      /\b(fibrilación ventricular|fibrilacion ventricular|taquicardia ventricular|paro cardíaco|paro cardiaco|choque anafiláctico|choque anafilactico|sepsis|hemorragia|ictus|infarto|embolia pulmonar)\b/i,
      // German
      /\b(notfall|stillstand|reanimation|sofort|kritisch|instabil|bewusstlos|reaktionslos)\b/i,
      /\b(kammerflimmern|kammertachykardie|herzstillstand|anaphylaxie|sepsis|blutung|schlaganfall|infarkt|lungenembolie)\b/i,
      // Italian
      /\b(emergenza|arresto|rianimazione|immediato|critico|instabile|incosciente|privo di sensi)\b/i,
      /\b(fibrillazione ventricolare|tachicardia ventricolare|arresto cardiaco|anafilassi|sepsi|emorragia|ictus|infarto|embolia polmonare)\b/i,
      // Portuguese
      /\b(emergência|emergencia|parada|reanimação|reanimacao|imediato|crítico|critico|instável|instavel|inconsciente)\b/i,
      /\b(fibrilação ventricular|fibrilacao ventricular|taquicardia ventricular|parada cardíaca|parada cardiaca|anafilaxia|sepsis|hemorragia|AVC|infarto|embolia pulmonar)\b/i,
    ],
    urgency: 'emergency',
  },
  {
    patterns: [
      /\b(acute|urgent|asap|quickly|soon|today|now)\b/i,
    ],
    urgency: 'urgent',
  },
];

// Clinical context patterns
const SETTING_PATTERNS: Array<{ patterns: RegExp[]; setting: ClinicalContext['setting'] }> = [
  { patterns: [/\b(ICU|intensive care|critical care|ventilated|ventilator)\b/i], setting: 'icu' },
  { patterns: [/\b(ER|ED|emergency department|emergency room|trauma bay|resuscitation)\b/i], setting: 'emergency' },
  { patterns: [/\b(inpatient|admitted|admission|hospitalized|hospital|ward|floor)\b/i], setting: 'inpatient' },
  { patterns: [/\b(outpatient|clinic|ambulatory|follow.up|office visit)\b/i], setting: 'outpatient' },
  { patterns: [/\b(OR|operating room|surgery|surgical|perioperative|post.op|pre.op)\b/i], setting: 'surgery' },
  { patterns: [/\b(primary care|family medicine|GP|general practice|community)\b/i], setting: 'primary_care' },
];

const POPULATION_PATTERNS: Array<{ patterns: RegExp[]; population: string }> = [
  { patterns: [/\b(pediatric|child|children|infant|neonatal|newborn|adolescent)\b/i], population: 'pediatric' },
  { patterns: [/\b(geriatric|elderly|older adult|senior)\b/i], population: 'geriatric' },
  { patterns: [/\b(pregnant|pregnancy|obstetric|maternal|postpartum|antenatal|perinatal)\b/i], population: 'pregnancy' },
  { patterns: [/\b(adult|adults)\b/i], population: 'adult' },
];

// Pre-defined skill chain templates
const SKILL_CHAIN_TEMPLATES: Record<MedicalIntent, SkillChainPlan> = {
  treatment_protocol: {
    name: 'Treatment Protocol Chain',
    description: 'Fetches guidelines, protocols, and clinical trials for treatment questions',
    requiredApis: ['pubmed', 'clinicaltrials'],
    steps: [
      {
        skillName: 'guideline-evidence-checker',
        purpose: 'Fetch current treatment guidelines from medical societies',
        inputMapping: '({query}) => ({guidelineTopic: query, specialty: "general"})',
        outputKeys: ['guidelines', 'recommendations'],
        fallbackSkills: ['pubmed-search-strategist', 'clinical-question-analyzer'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find protocol papers and treatment algorithm studies',
        inputMapping: '({query}) => ({query: query, studyTypes: ["guideline", "protocol", "algorithm", "clinical trial"], filters: {recency: 5}})',
        outputKeys: ['protocols', 'algorithms', 'studies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'clinical-trial-search',
        purpose: 'Find relevant clinical trials for the treatment',
        inputMapping: '({query}) => ({condition: query, phase: ["Phase 2", "Phase 3", "Phase 4"], status: "COMPLETED"})',
        outputKeys: ['trials'],
        fallbackSkills: [],
        isOptional: true,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize guidelines + protocols + trials into actionable treatment protocol',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "treatment_protocol"})',
        outputKeys: ['synthesizedProtocol'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  diagnosis_workup: {
    name: 'Diagnosis Workup Chain',
    description: 'Builds diagnostic approach with criteria and algorithms',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'clinical-question-analyzer',
        purpose: 'Parse the clinical question into PICO format',
        inputMapping: '({query}) => ({clinicalQuestion: query, framework: "PICO"})',
        outputKeys: ['pico', 'keyElements'],
        fallbackSkills: ['medical-concept-extractor'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find diagnostic criteria and workup algorithms',
        inputMapping: '({query}) => ({query: query + " diagnosis criteria workup", studyTypes: ["review", "guideline", "meta-analysis"], filters: {recency: 10}})',
        outputKeys: ['diagnosticStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'guideline-evidence-checker',
        purpose: 'Check current diagnostic guidelines',
        inputMapping: '({query}) => ({guidelineTopic: query + " diagnosis", specialty: "general"})',
        outputKeys: ['guidelines'],
        fallbackSkills: ['pubmed-search-strategist'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize diagnostic workup from evidence',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "diagnostic_workup"})',
        outputKeys: ['synthesizedWorkup'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  drug_info: {
    name: 'Drug Information Chain',
    description: 'Fetches dosing, interactions, contraindications from guidelines and studies',
    requiredApis: ['pubmed', 'clinicaltrials'],
    steps: [
      {
        skillName: 'medical-concept-extractor',
        purpose: 'Extract drug name, indication, and patient context',
        inputMapping: '({query}) => ({text: query, extractTypes: ["drug", "indication", "dose", "route"]})',
        outputKeys: ['concepts', 'drugName', 'indication'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find drug dosing and pharmacology studies',
        inputMapping: '({query, prev}) => ({query: (prev.drugName || query) + " dosing pharmacology", studyTypes: ["clinical trial", "review", "guideline"], filters: {recency: 10}})',
        outputKeys: ['drugStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'guideline-evidence-checker',
        purpose: 'Check current drug prescribing guidelines',
        inputMapping: '({query, prev}) => ({guidelineTopic: (prev.drugName || query) + " prescribing guideline", specialty: "general"})',
        outputKeys: ['guidelines'],
        fallbackSkills: ['pubmed-search-strategist'],
        isOptional: false,
      },
      {
        skillName: 'clinical-trial-search',
        purpose: 'Find clinical trials for the drug',
        inputMapping: '({query, prev}) => ({condition: prev.indication || query, intervention: prev.drugName || query, phase: ["Phase 2", "Phase 3", "Phase 4"], status: "COMPLETED"})',
        outputKeys: ['trials'],
        fallbackSkills: [],
        isOptional: true,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize drug information with dosing, contraindications, interactions',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "drug_info"})',
        outputKeys: ['synthesizedDrugInfo'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  guideline_recommendation: {
    name: 'Guideline Recommendation Chain',
    description: 'Fetches and synthesizes current clinical guidelines',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'guideline-evidence-checker',
        purpose: 'Fetch current guidelines from medical societies',
        inputMapping: '({query}) => ({guidelineTopic: query, specialty: "general"})',
        outputKeys: ['guidelines', 'recommendations'],
        fallbackSkills: ['pubmed-search-strategist'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find supporting evidence for guideline recommendations',
        inputMapping: '({query}) => ({query: query + " guideline recommendation evidence", studyTypes: ["guideline", "systematic review", "meta-analysis"], filters: {recency: 5}})',
        outputKeys: ['supportingEvidence'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize guideline recommendations with evidence levels',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "guideline_recommendation"})',
        outputKeys: ['synthesizedGuidelines'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  prognosis_outcome: {
    name: 'Prognosis Outcome Chain',
    description: 'Fetches survival data, outcomes research, and prognostic factors',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find prognosis and outcome studies',
        inputMapping: '({query}) => ({query: query + " prognosis outcome survival", studyTypes: ["cohort", "clinical trial", "meta-analysis"], filters: {recency: 10}})',
        outputKeys: ['prognosisStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'clinical-trial-search',
        purpose: 'Find trials with outcome data',
        inputMapping: '({query}) => ({condition: query, status: "COMPLETED"})',
        outputKeys: ['trials'],
        fallbackSkills: [],
        isOptional: true,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize prognostic data',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "prognosis"})',
        outputKeys: ['synthesizedPrognosis'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  differential_diagnosis: {
    name: 'Differential Diagnosis Chain',
    description: 'Builds differential diagnosis with probabilities and red flags',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'clinical-question-analyzer',
        purpose: 'Parse symptoms and clinical presentation',
        inputMapping: '({query}) => ({clinicalQuestion: query, framework: "symptom_analysis"})',
        outputKeys: ['symptoms', 'presentation'],
        fallbackSkills: ['medical-concept-extractor'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find differential diagnosis papers',
        inputMapping: '({query}) => ({query: query + " differential diagnosis", studyTypes: ["review", "guideline", "systematic review"], filters: {recency: 10}})',
        outputKeys: ['ddxStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'literature-evidence-mapper',
        purpose: 'Map differential diagnoses by probability',
        inputMapping: '({query, prev}) => ({query: query, evidenceType: "differential_diagnosis"})',
        outputKeys: ['evidenceMap'],
        fallbackSkills: ['evidence-gap-detector'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize differential diagnosis list',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "differential_diagnosis"})',
        outputKeys: ['synthesizedDDx'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  screening_prevention: {
    name: 'Screening Prevention Chain',
    description: 'Fetches screening guidelines and prevention evidence',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'guideline-evidence-checker',
        purpose: 'Fetch screening guidelines',
        inputMapping: '({query}) => ({guidelineTopic: query + " screening", specialty: "general"})',
        outputKeys: ['guidelines'],
        fallbackSkills: ['pubmed-search-strategist'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find screening and prevention studies',
        inputMapping: '({query}) => ({query: query + " screening prevention", studyTypes: ["clinical trial", "systematic review", "meta-analysis"], filters: {recency: 10}})',
        outputKeys: ['screeningStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize screening recommendations',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "screening_prevention"})',
        outputKeys: ['synthesizedScreening'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  research_evidence: {
    name: 'Research Evidence Chain',
    description: 'Comprehensive evidence search with systematic review approach',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'systematic-review-protocol',
        purpose: 'Define systematic review PICO framework',
        inputMapping: '({query}) => ({researchQuestion: query, framework: "PICO"})',
        outputKeys: ['pico', 'searchStrategy'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Comprehensive PubMed search',
        inputMapping: '({query, prev}) => ({query: query, searchStrategy: prev.searchStrategy, studyTypes: ["all"], filters: {recency: 20}})',
        outputKeys: ['studies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'literature-evidence-mapper',
        purpose: 'Map evidence by outcome and study design',
        inputMapping: '({query, prev}) => ({query: query, studies: prev.studies, evidenceType: "research_evidence"})',
        outputKeys: ['evidenceMap'],
        fallbackSkills: ['evidence-gap-detector'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize evidence with GRADE assessment',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "research_evidence", grading: "GRADE"})',
        outputKeys: ['synthesizedEvidence'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  clinical_trial_search: {
    name: 'Clinical Trial Search Chain',
    description: 'Finds relevant clinical trials with eligibility and endpoints',
    requiredApis: ['clinicaltrials', 'pubmed'],
    steps: [
      {
        skillName: 'clinical-trial-search',
        purpose: 'Search ClinicalTrials.gov for relevant trials',
        inputMapping: '({query}) => ({condition: query, status: "ALL"})',
        outputKeys: ['trials'],
        fallbackSkills: [],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find published results of completed trials',
        inputMapping: '({query}) => ({query: query + " clinical trial results", studyTypes: ["clinical trial"], filters: {recency: 10}})',
        outputKeys: ['publishedResults'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'evidence-gap-detector',
        purpose: 'Identify gaps between ongoing and completed trials',
        inputMapping: '({prev}) => ({trials: prev.trials, publishedResults: prev.publishedResults})',
        outputKeys: ['gaps'],
        fallbackSkills: [],
        isOptional: true,
      },
    ],
  },
  
  pathophysiology: {
    name: 'Pathophysiology Chain',
    description: 'Fetches mechanism and pathophysiology evidence',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'medical-concept-extractor',
        purpose: 'Extract disease and mechanism concepts',
        inputMapping: '({query}) => ({text: query, extractTypes: ["disease", "mechanism", "pathway"]})',
        outputKeys: ['concepts'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find pathophysiology and mechanism studies',
        inputMapping: '({query}) => ({query: query + " pathophysiology mechanism", studyTypes: ["review", "research"], filters: {recency: 10}})',
        outputKeys: ['mechanismStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize pathophysiology explanation',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "pathophysiology"})',
        outputKeys: ['synthesizedMechanism'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  procedure_technique: {
    name: 'Procedure Technique Chain',
    description: 'Fetches procedural guidelines and technique evidence',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'guideline-evidence-checker',
        purpose: 'Fetch procedural guidelines',
        inputMapping: '({query}) => ({guidelineTopic: query + " procedure technique", specialty: "surgical"})',
        outputKeys: ['guidelines'],
        fallbackSkills: ['pubmed-search-strategist'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find procedure technique studies',
        inputMapping: '({query}) => ({query: query + " technique procedure", studyTypes: ["review", "clinical trial", "guideline"], filters: {recency: 10}})',
        outputKeys: ['procedureStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize procedural approach',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "procedure_technique"})',
        outputKeys: ['synthesizedProcedure'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  lab_interpretation: {
    name: 'Lab Interpretation Chain',
    description: 'Fetches lab value interpretation and clinical significance',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'medical-concept-extractor',
        purpose: 'Extract lab test and values',
        inputMapping: '({query}) => ({text: query, extractTypes: ["lab_test", "value", "unit"]})',
        outputKeys: ['concepts', 'labTest'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find lab interpretation studies',
        inputMapping: '({query, prev}) => ({query: (prev.labTest || query) + " interpretation clinical significance", studyTypes: ["review", "guideline"], filters: {recency: 10}})',
        outputKeys: ['labStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize lab interpretation',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "lab_interpretation"})',
        outputKeys: ['synthesizedInterpretation'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  imaging_interpretation: {
    name: 'Imaging Interpretation Chain',
    description: 'Fetches imaging interpretation guidelines',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'medical-concept-extractor',
        purpose: 'Extract imaging modality and findings',
        inputMapping: '({query}) => ({text: query, extractTypes: ["imaging_modality", "finding"]})',
        outputKeys: ['concepts', 'modality'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Find imaging interpretation studies',
        inputMapping: '({query, prev}) => ({query: (prev.modality || query) + " interpretation findings", studyTypes: ["review", "guideline", "clinical trial"], filters: {recency: 10}})',
        outputKeys: ['imagingStudies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize imaging interpretation',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "imaging_interpretation"})',
        outputKeys: ['synthesizedImaging'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
  
  general_medical: {
    name: 'General Medical Query Chain',
    description: 'General-purpose evidence search for any medical question',
    requiredApis: ['pubmed', 'clinicaltrials'],
    steps: [
      {
        skillName: 'clinical-question-analyzer',
        purpose: 'Parse the clinical question',
        inputMapping: '({query}) => ({clinicalQuestion: query, framework: "PICO"})',
        outputKeys: ['pico', 'keyElements'],
        fallbackSkills: ['medical-concept-extractor'],
        isOptional: false,
      },
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Comprehensive PubMed search',
        inputMapping: '({query}) => ({query: query, studyTypes: ["all"], filters: {recency: 10}})',
        outputKeys: ['studies'],
        fallbackSkills: ['literature-evidence-mapper'],
        isOptional: false,
      },
      {
        skillName: 'clinical-trial-search',
        purpose: 'Find relevant clinical trials',
        inputMapping: '({query}) => ({condition: query, status: "ALL"})',
        outputKeys: ['trials'],
        fallbackSkills: [],
        isOptional: true,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize evidence into comprehensive answer',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "general"})',
        outputKeys: ['synthesizedAnswer'],
        fallbackSkills: ['clinical-question-analyzer'],
        isOptional: false,
      },
    ],
  },
};

// Fallback chains (used when primary chain fails)
const FALLBACK_CHAINS: SkillChainPlan[] = [
  {
    name: 'PubMed Fallback Chain',
    description: 'Simple PubMed search when primary chain fails',
    requiredApis: ['pubmed'],
    steps: [
      {
        skillName: 'pubmed-search-strategist',
        purpose: 'Direct PubMed search',
        inputMapping: '({query}) => ({query: query, studyTypes: ["all"], filters: {recency: 10}})',
        outputKeys: ['studies'],
        fallbackSkills: [],
        isOptional: false,
      },
      {
        skillName: 'evidence-synthesis-engine',
        purpose: 'Synthesize from PubMed results',
        inputMapping: '({prev}) => ({evidenceBundles: prev, synthesisType: "general"})',
        outputKeys: ['synthesizedAnswer'],
        fallbackSkills: [],
        isOptional: false,
      },
    ],
  },
  {
    name: 'Clinical Trials Fallback Chain',
    description: 'ClinicalTrials.gov search when PubMed fails',
    requiredApis: ['clinicaltrials'],
    steps: [
      {
        skillName: 'clinical-trial-search',
        purpose: 'Direct ClinicalTrials.gov search',
        inputMapping: '({query}) => ({condition: query, status: "ALL"})',
        outputKeys: ['trials'],
        fallbackSkills: [],
        isOptional: false,
      },
    ],
  },
];

class QueryAnalyzer {
  /**
   * Analyze a user query and return a complete execution plan
   */
  async analyze(query: string): Promise<QueryAnalysis> {
    // 1. Detect language
    const detectedLanguage = await translationPipeline.detectLanguage(query);
    
    // 2. Translate to English for API calls
    const englishQuery = await translationPipeline.translateToEnglish(query, detectedLanguage);
    
    // 3. Classify intent (check both English and original for multi-language support)
    const intent = this.classifyIntent(englishQuery, query);
    
    // 4. Detect urgency (check both English and original)
    const urgency = this.detectUrgency(englishQuery, query);
    
    // 5. Extract clinical context
    const clinicalContext = this.extractClinicalContext(englishQuery);
    
    // 6. Get recommended skill chain
    const recommendedSkillChain = SKILL_CHAIN_TEMPLATES[intent];
    
    // 7. Get fallback chains
    const fallbackChains = FALLBACK_CHAINS;
    
    // 8. Extract key terms
    const keyTerms = this.extractKeyTerms(englishQuery);
    
    // 9. Estimate API calls
    const estimatedApiCalls = this.estimateApiCalls(recommendedSkillChain);
    
    return {
      detectedLanguage,
      englishQuery,
      originalQuery: query,
      intent,
      urgency,
      clinicalContext,
      recommendedSkillChain,
      fallbackChains,
      requiredApis: recommendedSkillChain.requiredApis,
      estimatedApiCalls,
      keyTerms,
    };
  }
  
  /**
   * Classify the medical intent from the query
   * Checks BOTH the English-translated query AND the original query
   * to ensure correct classification even when translation fails
   */
  private classifyIntent(englishQuery: string, originalQuery?: string): MedicalIntent {
    // First check the English query
    for (const { patterns, intent } of INTENT_PATTERNS) {
      if (patterns.some(p => p.test(englishQuery))) {
        return intent;
      }
    }
    // Fallback: check the original query (multi-language patterns)
    if (originalQuery && originalQuery !== englishQuery) {
      for (const { patterns, intent } of INTENT_PATTERNS) {
        if (patterns.some(p => p.test(originalQuery))) {
          return intent;
        }
      }
    }
    return 'general_medical';
  }
  
  /**
   * Detect urgency level
   * Checks BOTH the English-translated query AND the original query
   */
  private detectUrgency(englishQuery: string, originalQuery?: string): QueryUrgency {
    // First check the English query
    for (const { patterns, urgency } of URGENCY_PATTERNS) {
      if (patterns.some(p => p.test(englishQuery))) {
        return urgency;
      }
    }
    // Fallback: check the original query (multi-language patterns)
    if (originalQuery && originalQuery !== englishQuery) {
      for (const { patterns, urgency } of URGENCY_PATTERNS) {
        if (patterns.some(p => p.test(originalQuery))) {
          return urgency;
        }
      }
    }
    return 'routine';
  }
  
  /**
   * Extract clinical context from query
   */
  private extractClinicalContext(query: string): ClinicalContext {
    const context: ClinicalContext = {
      setting: 'unspecified',
      acuity: 'unspecified',
    };
    
    // Detect setting
    for (const { patterns, setting } of SETTING_PATTERNS) {
      if (patterns.some(p => p.test(query))) {
        context.setting = setting;
        break;
      }
    }
    
    // Detect patient population
    for (const { patterns, population } of POPULATION_PATTERNS) {
      if (patterns.some(p => p.test(query))) {
        context.patientPopulation = population;
        break;
      }
    }
    
    // Detect acuity from urgency
    context.acuity = 'stable';
    
    // Extract comorbidities (simple pattern matching)
    const comorbidityPattern = /\b(with|having|history of|hx of|comorbid|comorbidities?)\s+(.+?)(?:\.|$|,)/gi;
    const comorbMatches = [...query.matchAll(comorbidityPattern)];
    if (comorbMatches.length > 0) {
      context.comorbidities = comorbMatches.map(m => m[2].trim()).filter(c => c.length > 2);
    }
    
    return context;
  }
  
  /**
   * Extract key medical terms from query
   */
  private extractKeyTerms(query: string): string[] {
    // Remove common stop words
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'cannot', 'how', 'what', 'why', 'when', 'where', 'who', 'which', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'and', 'or', 'but', 'if', 'because', 'as', 'until', 'while', 'comment', 'gerer', 'gerer', 'une', 'des', 'du', 'de', 'la', 'le', 'les', 'un', 'pour', 'avec', 'sans', 'dans', 'sur', 'par']);
    
    const words = query.toLowerCase()
      .split(/[\s,;:.!?()\[\]{}"'\/\\-]+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    // Deduplicate and return
    return [...new Set(words)].slice(0, 20);
  }
  
  /**
   * Estimate the number of API calls for a skill chain
   */
  private estimateApiCalls(chain: SkillChainPlan): number {
    let count = 0;
    for (const step of chain.steps) {
      // Each step typically makes 1-2 API calls
      count += 1;
      // PubMed search + fetch = 2 calls
      if (step.skillName.includes('pubmed')) count += 1;
      // ClinicalTrials search = 1 call
      if (step.skillName.includes('clinical-trial')) count += 1;
    }
    return count;
  }
  
  /**
   * Get all skill chain templates (for debugging/UI)
   */
  getAllChainTemplates(): Record<MedicalIntent, SkillChainPlan> {
    return SKILL_CHAIN_TEMPLATES;
  }
}

// Singleton instance
export const queryAnalyzer = new QueryAnalyzer();
