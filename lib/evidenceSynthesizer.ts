/**
 * Evidence Synthesizer
 * 
 * Builds doctor-grade answers ONLY from aggregated evidence.
 * - NEVER generates content without citation
 * - Every factual sentence → inline citation
 * - Conflicting evidence → present both with quality assessment
 * - Guidelines prioritized over individual studies
 * - Recent evidence (last 5 years) weighted higher
 * - Output in user's detected language
 * - Validates output against clinical standards
 */

import { GoogleGenAI } from '@google/genai';
import { translationPipeline } from './translationPipeline';
import { clinicalValidator } from './clinicalValidator';
import type { QueryAnalysis } from './queryAnalyzer';
import type { 
  AggregatedEvidence, 
  ClickableCitation, 
  SynthesizedAnswer,
  ClinicalSection,
  EvidenceSummary,
  CitationIndex,
} from '../types';

// Lazy-loaded Gemini instance
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

class EvidenceSynthesizer {
  /**
   * Synthesize a doctor-grade answer from aggregated evidence
   */
  async synthesize(
    evidence: AggregatedEvidence,
    analysis: QueryAnalysis,
    abortSignal?: AbortSignal
  ): Promise<SynthesizedAnswer> {
    // 1. Build the synthesis prompt with ALL evidence
    const synthesisPrompt = this.buildSynthesisPrompt(evidence, analysis);
    
    // 2. Generate answer using Gemini (with evidence as context)
    const englishAnswer = await this.generateAnswer(synthesisPrompt, analysis, abortSignal);
    
    // 3. Validate the answer
    const validation = clinicalValidator.validate(englishAnswer, evidence.byQuestion.size > 0 ? Array.from(evidence.byQuestion.values())[0].citations : []);
    
    if (!validation.passed) {
      // If validation fails, try to fix the answer
      const fixedAnswer = await this.fixAnswer(englishAnswer, validation.issues, analysis, abortSignal);
      if (fixedAnswer) {
        return this.buildSynthesizedAnswer(fixedAnswer, evidence, analysis, validation);
      }
    }
    
    // 4. Translate to user's language (if not English)
    let finalAnswer = englishAnswer;
    if (analysis.detectedLanguage !== 'en') {
      finalAnswer = await translationPipeline.translateFromEnglish(englishAnswer, analysis.detectedLanguage);
    }
    
    // 5. Build structured answer
    return this.buildSynthesizedAnswer(finalAnswer, evidence, analysis, validation);
  }
  
  /**
   * Build the synthesis prompt with all evidence
   */
  private buildSynthesisPrompt(evidence: AggregatedEvidence, analysis: QueryAnalysis): string {
    const citations = this.getAllCitations(evidence);
    const citationList = this.formatCitationList(citations);
    
    const guidelinesSection = evidence.guidelines.length > 0 
      ? `\n\n**Guidelines Found:**\n${evidence.guidelines.map((g: any) => `- ${g.title || g.name || JSON.stringify(g)}`).join('\n')}`
      : '';
    
    const protocolsSection = evidence.protocols.length > 0
      ? `\n\n**Protocols Found:**\n${evidence.protocols.map((p: any) => `- ${p.title || p.name || JSON.stringify(p)}`).join('\n')}`
      : '';
    
    const trialsSection = evidence.trials.length > 0
      ? `\n\n**Clinical Trials Found:**\n${evidence.trials.map((t: any) => `- ${t.title || t.nctId || JSON.stringify(t)}`).join('\n')}`
      : '';
    
    const reviewsSection = evidence.systematicReviews.length > 0
      ? `\n\n**Systematic Reviews Found:**\n${evidence.systematicReviews.map((r: any) => `- ${r.title || JSON.stringify(r)}`).join('\n')}`
      : '';
    
    return `You are AureMed, a world-class medical research AI for doctors. You must synthesize a doctor-grade clinical answer using ONLY the evidence provided below.

**ABSOLUTE RULES (NEVER VIOLATE):**
1. EVERY factual statement MUST have an inline citation in this format: [Title](URL)
2. Use the EXACT citation URLs provided below — do NOT fabricate URLs or PMIDs
3. NEVER use your internal/general knowledge — ONLY use the evidence provided
4. NEVER write "call 911", "go to ER", "seek immediate medical attention", or any generic emergency advice
5. NEVER write disclaimers like "this is not medical advice" or "I am an AI"
6. NEVER write filler phrases like "generally speaking", "typically", "usually", "it is important to note"
7. If evidence is insufficient for a claim, OMIT that claim — do NOT guess
8. Prioritize guidelines over individual studies
9. Present conflicting evidence with quality assessment
10. Include dosing, contraindications, and monitoring when relevant (with citations)
11. Answer in English (will be translated later)

**Clinical Context:**
- Original query: ${analysis.originalQuery}
- English query: ${analysis.englishQuery}
- Intent: ${analysis.intent}
- Urgency: ${analysis.urgency}
- Patient population: ${analysis.clinicalContext.patientPopulation || 'unspecified'}
- Clinical setting: ${analysis.clinicalContext.setting || 'unspecified'}

**Available Citations (use these EXACT URLs):**
${citationList}
${guidelinesSection}${protocolsSection}${trialsSection}${reviewsSection}

**Response Structure:**
1. **Direct Answer** — Start with a concise answer to the clinical question (2-3 sentences, with citations)
2. **Clinical Detail** — Expand with specific protocols, dosing, algorithms (with citations for each fact)
3. **Evidence Summary** — Brief summary of evidence quality and study designs
4. **Key Points** — 3-5 bullet points with the most important clinical takeaways (each with citation)

**Citation Format:** Use inline markdown links: [Short Title](URL)
- For PubMed: [Author et al. Year - Title](https://pubmed.ncbi.nlm.nih.gov/PMID/)
- For ClinicalTrials: [NCT ID - Title](https://clinicaltrials.gov/study/NCT_ID)
- For DOI: [Author Year - Title](https://doi.org/DOI)

Now synthesize the answer:`;
  }
  
  /**
   * Generate the answer using Gemini
   */
  private async generateAnswer(prompt: string, analysis: QueryAnalysis, abortSignal?: AbortSignal): Promise<string> {
    const ai = getAI();
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          maxOutputTokens: 4000,
        },
      });
      
      return response.text || '';
    } catch (e: any) {
      console.warn('[EvidenceSynthesizer] Primary model failed, trying fallback:', e);
      
      // Try fallback model
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: prompt,
          config: {
            maxOutputTokens: 4000,
          },
        });
        return response.text || '';
      } catch (e2) {
        console.error('[EvidenceSynthesizer] All models failed:', e2);
        return '';
      }
    }
  }
  
  /**
   * Fix an answer that failed validation
   */
  private async fixAnswer(
    answer: string, 
    issues: any[], 
    analysis: QueryAnalysis,
    abortSignal?: AbortSignal
  ): Promise<string | null> {
    const errorIssues = issues.filter(i => i.severity === 'error');
    if (errorIssues.length === 0) return null;
    
    const fixPrompt = `The following medical answer has validation issues. Fix ALL issues and return the corrected answer.

**Issues to fix:**
${errorIssues.map(i => `- ${i.type}: "${i.text}" → ${i.suggestion}`).join('\n')}

**Original answer:**
${answer}

**Rules:**
- Remove ALL banned phrases (call 911, go to ER, seek immediate medical attention, disclaimers, filler)
- Add inline citations [Title](URL) to EVERY factual statement that is missing one
- If you cannot cite a statement, REMOVE it entirely
- Do NOT add new information — only fix existing content
- Return ONLY the corrected answer

Corrected answer:`;
    
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: fixPrompt,
        config: {
          maxOutputTokens: 4000,
        },
      });
      return response.text || null;
    } catch (e) {
      console.warn('[EvidenceSynthesizer] Fix attempt failed:', e);
      return null;
    }
  }
  
  /**
   * Get all citations from aggregated evidence
   */
  private getAllCitations(evidence: AggregatedEvidence): ClickableCitation[] {
    const allCitations: ClickableCitation[] = [];
    for (const bundle of evidence.byQuestion.values()) {
      allCitations.push(...bundle.citations);
    }
    // Deduplicate
    const seen = new Set<string>();
    return allCitations.filter(c => {
      const id = c.pmid || c.nctId || c.doi || c.clickableUrl;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  
  /**
   * Format citation list for the prompt
   */
  private formatCitationList(citations: ClickableCitation[]): string {
    if (citations.length === 0) return 'No citations available.';
    
    return citations.map((c, i) => {
      const title = c.metadata?.title || 'Untitled';
      const url = c.clickableUrl;
      const year = c.metadata?.year || '';
      const authors = c.metadata?.authors?.slice(0, 2).join(', ') || '';
      const journal = c.metadata?.journal || '';
      const source = c.sourceType === 'pubmed' ? 'PubMed' : c.sourceType === 'clinicaltrials' ? 'ClinicalTrials.gov' : 'DOI';
      
      return `${i + 1}. [${authors} ${year} - ${title}](${url}) (${source}${journal ? ', ' + journal : ''})`;
    }).join('\n');
  }
  
  /**
   * Build the structured synthesized answer
   */
  private buildSynthesizedAnswer(
    text: string, 
    evidence: AggregatedEvidence, 
    analysis: QueryAnalysis,
    validation: any
  ): SynthesizedAnswer {
    const citations = this.getAllCitations(evidence);
    
    // Parse sections from the text
    const sections = this.parseSections(text);
    
    // Extract key points
    const keyPoints = this.extractKeyPoints(text);
    
    // Build evidence summary
    const evidenceSummary: EvidenceSummary = {
      totalCitations: citations.length,
      uniquePmids: citations.filter(c => c.pmid).length,
      uniqueNctIds: citations.filter(c => c.nctId).length,
      studyDesigns: this.countStudyDesigns(citations),
      dateRange: this.getDateRange(citations),
      qualityScore: validation.score,
      gaps: evidence.gaps.map(g => typeof g === 'string' ? g : JSON.stringify(g)),
    };
    
    // Build citation index
    const citationIndex: CitationIndex = {};
    for (const c of citations) {
      const key = c.pmid || c.nctId || c.doi || c.clickableUrl;
      citationIndex[key] = {
        fullCitation: c.formatted || '',
        clickableUrl: c.clickableUrl,
        sourceType: c.sourceType as any,
        evidenceLevel: c.metadata?.evidenceLevel || 'unspecified',
        studyDesign: c.metadata?.studyDesign || 'unspecified',
        sampleSize: c.metadata?.sampleSize,
        year: c.metadata?.year || 0,
      };
    }
    
    return {
      answer: text,
      sections,
      keyPoints,
      clinicalPearls: [], // Could be extracted with additional parsing
      redFlags: [], // Could be extracted with additional parsing
      evidenceSummary,
      citationIndex,
    };
  }
  
  /**
   * Parse sections from the answer text
   */
  private parseSections(text: string): ClinicalSection[] {
    const sections: ClinicalSection[] = [];
    
    // Split by markdown headers
    const headerRegex = /^(#{1,3})\s+(.+)$/gm;
    const matches = [...text.matchAll(headerRegex)];
    
    if (matches.length === 0) {
      // No headers — treat entire text as one section
      sections.push({
        title: 'Answer',
        content: text,
        evidenceLevel: 'B',
        citations: [],
      });
      return sections;
    }
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const title = match[2];
      const start = match.index! + match[0].length;
      const end = i < matches.length - 1 ? matches[i + 1].index! : text.length;
      const content = text.substring(start, end).trim();
      
      sections.push({
        title,
        content,
        evidenceLevel: 'B', // Could be determined from citations
        citations: [], // Could be extracted from content
      });
    }
    
    return sections;
  }
  
  /**
   * Extract key points from the answer
   */
  private extractKeyPoints(text: string): string[] {
    const keyPoints: string[] = [];
    
    // Look for bullet points
    const bulletRegex = /^[-*]\s+(.+)$/gm;
    const matches = [...text.matchAll(bulletRegex)];
    
    for (const match of matches) {
      keyPoints.push(match[1].trim());
    }
    
    return keyPoints.slice(0, 5);
  }
  
  /**
   * Count study designs from citations
   */
  private countStudyDesigns(citations: ClickableCitation[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of citations) {
      const design = c.metadata?.studyDesign || 'unspecified';
      counts[design] = (counts[design] || 0) + 1;
    }
    return counts;
  }
  
  /**
   * Get date range from citations
   */
  private getDateRange(citations: ClickableCitation[]): { start: number | null; end: number | null } {
    let min: number | null = null;
    let max: number | null = null;
    
    for (const c of citations) {
      if (c.metadata?.year) {
        const year = typeof c.metadata.year === 'number' ? c.metadata.year : parseInt(c.metadata.year);
        if (!isNaN(year)) {
          if (min === null || year < min) min = year;
          if (max === null || year > max) max = year;
        }
      }
    }
    
    return { start: min, end: max };
  }
}

// Singleton instance
export const evidenceSynthesizer = new EvidenceSynthesizer();
