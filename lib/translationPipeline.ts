/**
 * Translation Pipeline
 * 
 * Handles all language translation at the architecture level.
 * - Detects user language from query
 * - Translates medical queries to English for API calls (PubMed, ClinicalTrials.gov)
 * - Translates synthesized answers back to user's language
 * - Preserves citations during translation (placeholders)
 * 
 * No hardcoded translation maps — uses Gemini Flash for all translations.
 */

import { GoogleGenAI } from '@google/genai';

// Lazy-loaded Gemini instance to avoid circular dependencies
let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) 
      || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY)
      || (typeof window !== 'undefined' && (window as any).API_KEY)
      || '';
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

// Citation placeholder format: [[CITE:pmid:12345]] or [[CITE:nct:NCT001234]]
const CITATION_PLACEHOLDER_REGEX = /\[\[CITE:(pmid|nct|doi):([^\]]+)\]\]/g;

export interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
  confidence: number;
}

export class TranslationPipeline {
  /**
   * Detect the language of the input text
   * Uses simple heuristics + optional Gemini call for accuracy
   */
  async detectLanguage(text: string): Promise<string> {
    // Fast heuristic detection for common languages
    const lowerText = text.toLowerCase();
    
    // French indicators
    if (/\b(comment|comment gérer|comment gerer|quel|quelle|quels|quelles|pourquoi|comment faire|le|la|les|une|des|du|de la|est-ce|c'est|ça|ca|téte|tête|person|personne|fibrillation|ventriculaire|cardiaque|urgence|douleur|malade|patient|traitement|médicament|medicament|prescription|diagnostic|symptôme|symptome|maladie|santé|sante|clinique|hôpital|hopital|médecin|medecin|docteur|infirmier|soin|soins)\b/i.test(lowerText)) {
      return 'fr';
    }
    
    // Spanish indicators
    if (/\b(cómo|como|qué|que|cuál|cual|por qué|porque|el|la|los|las|una|unos|unas|es|son|para|con|sin|enfermedad|paciente|tratamiento|medicamento|diagnóstico|diagnostico|síntoma|sintoma|médico|medico|hospital|urgencia|dolor|corazón|corazon|fibrilación|fibrilacion)\b/i.test(lowerText)) {
      return 'es';
    }
    
    // German indicators
    if (/\b(wie|was|warum|wann|wo|der|die|das|ein|eine|einen|krankheit|patient|behandlung|medikament|diagnose|symptom|arzt|krankenhaus|notfall|schmerz|herz|fibrillation|ventrikuläre|ventrikulare)\b/i.test(lowerText)) {
      return 'de';
    }
    
    // Italian indicators
    if (/\b(come|cosa|perché|perche|quando|dove|il|la|lo|i|gli|le|un|una|malattia|paziente|trattamento|farmaco|diagnosi|sintomo|medico|ospedale|emergenza|dolore|cuore|fibrillazione|ventricolare)\b/i.test(lowerText)) {
      return 'it';
    }
    
    // Portuguese indicators
    if (/\b(como|o que|por que|quando|onde|o|a|os|as|um|uma|doença|doenca|paciente|tratamento|medicamento|diagnóstico|diagnostico|sintoma|médico|medico|hospital|emergência|emergencia|dor|coração|coracao|fibrilação|fibrilacao)\b/i.test(lowerText)) {
      return 'pt';
    }
    
    // Arabic indicators (Arabic script)
    if (/[\u0600-\u06FF]/.test(text)) {
      return 'ar';
    }
    
    // Chinese indicators (CJK characters)
    if (/[\u4e00-\u9fff]/.test(text)) {
      return 'zh';
    }
    
    // Japanese indicators
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ja';
    }
    
    // Korean indicators
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ko';
    }
    
    // Russian/Cyrillic indicators
    if (/[\u0400-\u04FF]/.test(text)) {
      return 'ru';
    }
    
    // Default to English
    return 'en';
  }
  
  /**
   * Translate medical query to English for API calls
   * Preserves medical terminology, drug names, gene names
   * Handles common medical abbreviations across languages
   */
  async translateToEnglish(text: string, sourceLang?: string): Promise<string> {
    // If already English, return as-is
    const lang = sourceLang || await this.detectLanguage(text);
    if (lang === 'en') return text;
    
    // Pre-process: expand common medical abbreviations before translation
    const expandedText = this.expandMedicalAbbreviations(text, lang);
    
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `You are a medical translation expert. Translate the following medical query to English for use with PubMed and ClinicalTrials.gov APIs.

Rules:
- Preserve all medical terminology (drug names, gene names, disease names, anatomical terms)
- Preserve any numbers, dosages, units
- Preserve any abbreviations (e.g., AF, VF, CPR, ACLS, ECG)
- Translate drug brand names to their international non-proprietary names (INN) when possible (e.g., Lasilix → furosemide, Lasix → furosemide)
- Translate disease abbreviations to their English full form (e.g., OAP → acute pulmonary edema, AVC → stroke, IAM → myocardial infarction)
- Do NOT add explanations or notes
- Output ONLY the translated English text, nothing else

Query (${lang}): ${expandedText}

English translation:`,
        config: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      });
      
      const translated = response.text?.trim() || text;
      return translated;
    } catch (e) {
      console.warn('[TranslationPipeline] translateToEnglish failed, returning original:', e);
      // Fallback: try to do a basic expansion of known abbreviations
      return expandedText;
    }
  }
  
  /**
   * Expand common medical abbreviations for better PubMed search
   * This helps when translation API is unavailable
   */
  private expandMedicalAbbreviations(text: string, lang: string): string {
    let expanded = text;
    
    // French medical abbreviations
    if (lang === 'fr') {
      const frAbbreviations: Record<string, string> = {
        'OAP': 'œdème aigu du poumon',
        'AVC': 'accident vasculaire cérébral',
        'IAM': 'infarctus aigu du myocarde',
        'IC': 'insuffisance cardiaque',
        'IR': 'insuffisance rénale',
        'BPCO': 'bronchopneumopathie chronique obstructive',
        'FA': 'fibrillation auriculaire',
        'FV': 'fibrillation ventriculaire',
        'TV': 'tachycardie ventriculaire',
        'ACR': 'arrêt cardiaque respiratoire',
        'SDRA': 'syndrome de détresse respiratoire aiguë',
        'SIRS': 'syndrome de réponse inflammatoire systémique',
        'HTA': 'hypertension artérielle',
        'DDB': 'détresse respiratoire',
        'Lasilix': 'furosémide',
        'Lasix': 'furosémide',
        'Aldactone': 'spironolactone',
        'Coversyl': 'périndopril',
        'Lopressor': 'métoprolol',
        'Cordarone': 'amiodarone',
        'Tareg': 'valsartan',
        'Crestor': 'rosuvastatine',
        'Augmentin': 'amoxicilline acide clavulanique',
      };
      
      for (const [abbrev, expansion] of Object.entries(frAbbreviations)) {
        const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        expanded = expanded.replace(regex, `${abbrev} (${expansion})`);
      }
    }
    
    // Spanish medical abbreviations
    if (lang === 'es') {
      const esAbbreviations: Record<string, string> = {
        'EAP': 'edema agudo de pulmón',
        'ACV': 'accidente cerebrovascular',
        'IAM': 'infarto agudo de miocardio',
        'IC': 'insuficiencia cardíaca',
        'FA': 'fibrilación auricular',
        'FV': 'fibrilación ventricular',
        'HTA': 'hipertensión arterial',
      };
      
      for (const [abbrev, expansion] of Object.entries(esAbbreviations)) {
        const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        expanded = expanded.replace(regex, `${abbrev} (${expansion})`);
      }
    }
    
    return expanded;
  }
  
  /**
   * Translate synthesized answer from English back to user's language
   * Preserves citations using placeholder system
   */
  async translateFromEnglish(text: string, targetLang: string): Promise<string> {
    if (targetLang === 'en') return text;
    
    // Step 1: Extract citations and replace with placeholders
    const { textWithPlaceholders, citationMap } = this.preserveCitations(text);
    
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `You are a medical translation expert. Translate the following medical text from English to ${this.getLanguageName(targetLang)}.

Rules:
- Preserve ALL citation placeholders in their exact format: [[CITE:pmid:XXXXX]] or [[CITE:nct:XXXXX]] or [[CITE:doi:XXXXX]]
- Preserve all medical terminology accuracy (drug names, gene names, disease names)
- Preserve any numbers, dosages, units
- Preserve markdown formatting (bold, italic, headers, lists, links)
- Do NOT add explanations or notes
- Output ONLY the translated text, nothing else

English text:
${textWithPlaceholders}

${this.getLanguageName(targetLang)} translation:`,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
        },
      });
      
      const translated = response.text?.trim() || text;
      
      // Step 2: Restore citations from placeholders
      return this.restoreCitations(translated, citationMap);
    } catch (e) {
      console.warn('[TranslationPipeline] translateFromEnglish failed, returning original:', e);
      return text; // Fallback to English
    }
  }
  
  /**
   * Replace inline citations with placeholders to preserve them during translation
   */
  preserveCitations(text: string): { textWithPlaceholders: string; citationMap: Map<string, string> } {
    const citationMap = new Map<string, string>();
    let placeholderIndex = 0;
    
    // Match markdown links: [Title](URL) where URL contains pubmed, clinicaltrials, doi
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]*(?:pubmed|clinicaltrials|doi|ncbi)[^\)]*)\)/gi;
    const textWithPlaceholders = text.replace(linkRegex, (match, title, url) => {
      // Determine citation type
      let type = 'doi';
      let id = '';
      
      if (url.includes('pubmed.ncbi.nlm.nih.gov') || url.match(/\/\d{5,}\/?$/)) {
        type = 'pmid';
        id = url.match(/\/(\d{5,})\/?$/)?.[1] || '';
      } else if (url.includes('clinicaltrials.gov')) {
        type = 'nct';
        id = url.match(/NCT\d+/i)?.[0] || '';
      } else if (url.includes('doi.org')) {
        type = 'doi';
        id = url.match(/doi\.org\/(.+)/)?.[1] || '';
      }
      
      const placeholder = `[[CITE:${type}:${id}]]`;
      citationMap.set(placeholder, match);
      return placeholder;
    });
    
    return { textWithPlaceholders, citationMap };
  }
  
  /**
   * Restore citations from placeholders after translation
   */
  restoreCitations(text: string, citationMap: Map<string, string>): string {
    let restored = text;
    for (const [placeholder, original] of citationMap) {
      // The placeholder may have been slightly modified by translation, use flexible matching
      const flexiblePlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(flexiblePlaceholder, 'gi');
      restored = restored.replace(regex, original);
    }
    
    // Also handle any remaining placeholders that weren't in the map (shouldn't happen, but safety)
    restored = restored.replace(CITATION_PLACEHOLDER_REGEX, (match, type, id) => {
      if (type === 'pmid') return `[PubMed ${id}](https://pubmed.ncbi.nlm.nih.gov/${id}/)`;
      if (type === 'nct') return `[ClinicalTrials ${id}](https://clinicaltrials.gov/study/${id})`;
      if (type === 'doi') return `[DOI ${id}](https://doi.org/${id})`;
      return match;
    });
    
    return restored;
  }
  
  /**
   * Get human-readable language name from ISO code
   */
  private getLanguageName(code: string): string {
    const names: Record<string, string> = {
      'en': 'English',
      'fr': 'French',
      'es': 'Spanish',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ar': 'Arabic',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ru': 'Russian',
      'nl': 'Dutch',
      'pl': 'Polish',
      'tr': 'Turkish',
      'hi': 'Hindi',
    };
    return names[code] || 'English';
  }
  
  /**
   * Check if text is likely English (async, uses detectLanguage)
   */
  async isEnglish(text: string): Promise<boolean> {
    const lang = await this.detectLanguage(text);
    return lang === 'en';
  }
  
  /**
   * Synchronous English check (fast heuristic)
   */
  isEnglishSync(text: string): boolean {
    // If no non-ASCII characters and common English words present, likely English
    const hasNonAscii = /[^\x00-\x7F]/.test(text);
    if (!hasNonAscii) {
      // Check for common English medical words
      if (/\b(the|how|what|why|when|where|treatment|diagnosis|patient|disease|symptom|drug|dose|clinical|medical|guideline|protocol|ventricular|fibrillation|cardiac|emergency)\b/i.test(text)) {
        return true;
      }
    }
    return false;
  }
}

// Singleton instance
export const translationPipeline = new TranslationPipeline();
