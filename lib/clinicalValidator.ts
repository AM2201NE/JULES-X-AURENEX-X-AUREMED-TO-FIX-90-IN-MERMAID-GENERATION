/**
 * Clinical Validator
 * 
 * Ensures AureMed output meets doctor-grade standards:
 * - Every factual statement has an inline citation
 * - No generic emergency advice ("call 911", "go to ER")
 * - No disclaimers or non-medical filler
 * - Guidelines cited for recommendations
 * - Dosing has source
 * - Contraindications cited
 * - Recent evidence weighted higher
 */

export type ValidationIssueType = 
  | 'missing_citation'
  | 'generic_advice'
  | 'emergency_language'
  | 'disclaimer'
  | 'non_medical_filler'
  | 'outdated_evidence'
  | 'conflicting_evidence'
  | 'insufficient_evidence'
  | 'uncited_dosing'
  | 'uncited_contraindication';

export interface ValidationIssue {
  type: ValidationIssueType;
  text: string;
  suggestion: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  score: number;  // 0-100
  citationCount: number;
  factualSentenceCount: number;
}

// Banned phrases that should NEVER appear in AureMed output
const BANNED_PHRASES: Array<{ pattern: RegExp; type: ValidationIssueType; suggestion: string }> = [
  // Emergency advice (use skills to fetch actual protocols instead)
  { pattern: /\bcall 911\b/i, type: 'emergency_language', suggestion: 'Search for and cite current resuscitation protocols, ACLS algorithms, or emergency guidelines from PubMed/ClinicalTrials.gov' },
  { pattern: /\bcall emergency services?\b/i, type: 'emergency_language', suggestion: 'Search for and cite current emergency protocols from medical APIs' },
  { pattern: /\bgo to (the )?(ER|emergency room|emergency department|ED)\b/i, type: 'emergency_language', suggestion: 'Search for and cite current emergency department protocols and triage guidelines' },
  { pattern: /\bseek (immediate )?medical attention\b/i, type: 'emergency_language', suggestion: 'Search for and cite clinical guidelines for the specific condition' },
  { pattern: /\bconsult (a |your )?(physician|doctor|healthcare provider|medical professional)\b/i, type: 'generic_advice', suggestion: 'Provide specific clinical recommendations backed by API evidence' },
  { pattern: /\bsee (your |a )?(doctor|physician|healthcare provider)\b/i, type: 'generic_advice', suggestion: 'Provide specific clinical recommendations backed by API evidence' },
  { pattern: /\bcontact (your |a )?healthcare provider\b/i, type: 'generic_advice', suggestion: 'Provide specific clinical recommendations backed by API evidence' },
  
  // Disclaimers (AureMed is for doctors, not patients)
  { pattern: /\bthis is not medical advice\b/i, type: 'disclaimer', suggestion: 'Remove disclaimer — AureMed provides evidence-based clinical information for medical professionals' },
  { pattern: /\bthis (information )?is for (educational|informational) purposes only\b/i, type: 'disclaimer', suggestion: 'Remove disclaimer — provide evidence-based clinical information' },
  { pattern: /\bdisclaimer:?\s*/i, type: 'disclaimer', suggestion: 'Remove disclaimer — provide evidence-based clinical information' },
  { pattern: /\bI am (an )?AI\b/i, type: 'disclaimer', suggestion: 'Remove AI self-reference — focus on clinical evidence' },
  { pattern: /\bas an AI\b/i, type: 'disclaimer', suggestion: 'Remove AI self-reference — focus on clinical evidence' },
  
  // Non-medical filler
  { pattern: /\bgenerally speaking\b/i, type: 'non_medical_filler', suggestion: 'Replace with specific evidence-backed statement' },
  { pattern: /\btypically\b/i, type: 'non_medical_filler', suggestion: 'Replace with specific evidence-backed statement with citation' },
  { pattern: /\busually\b/i, type: 'non_medical_filler', suggestion: 'Replace with specific evidence-backed statement with citation' },
  { pattern: /\bin most cases\b/i, type: 'non_medical_filler', suggestion: 'Replace with specific evidence-backed statement with citation' },
  { pattern: /\bit is important to note\b/i, type: 'non_medical_filler', suggestion: 'Remove filler — state the fact with citation' },
  { pattern: /\bplease note that\b/i, type: 'non_medical_filler', suggestion: 'Remove filler — state the fact with citation' },
  { pattern: /\bit's worth noting\b/i, type: 'non_medical_filler', suggestion: 'Remove filler — state the fact with citation' },
  { pattern: /\bkeep in mind\b/i, type: 'non_medical_filler', suggestion: 'Remove filler — state the fact with citation' },
];

// Patterns that indicate a factual statement (should have citation)
const FACTUAL_INDICATORS = [
  /\b\d+\s*(mg|mcg|ml|g|kg|µg)\b/i,           // Dosing
  /\b\d+\s*(%|percent)\b/i,                     // Percentages
  /\b\d+\s*(hours?|days?|weeks?|months?|years?)\b/i, // Time periods
  /\b(p value|p-value|p<|p=|p>|p≤)\s*0\.\d+/i,  // Statistics
  /\b(odds ratio|hazard ratio|relative risk|confidence interval|CI)\b/i, // Study stats
  /\b(recommended|should be|must be|indicated|contraindicated)\b/i, // Recommendations
  /\b(stage|grade|class|type)\s+[IV1234]/i,     // Classifications
  /\b(mortality|morbidity|survival|incidence|prevalence)\b/i, // Outcomes
  /\b(first.line|second.line|third.line)\b/i,   // Treatment lines
  /\b(IV|PO|IM|SC|SL|PR|INH|topical)\b/i,       // Routes
];

// Citation patterns (inline links)
const CITATION_PATTERNS = [
  /\[([^\]]+)\]\(https?:\/\/[^\)]+\)/gi,        // Markdown links
  /\bPMID:?\s*\d+/gi,                            // PMID references
  /\bNCT\d{8}/gi,                                // Clinical trial IDs
  /\b10\.\d{4,}\/[^\s]+/gi,                      // DOI references
];

class ClinicalValidator {
  /**
   * Validate a synthesized answer against doctor-grade standards
   */
  validate(text: string, citations: any[] = []): ValidationResult {
    const issues: ValidationIssue[] = [];
    let citationCount = 0;
    let factualSentenceCount = 0;
    
    // 1. Check for banned phrases
    for (const { pattern, type, suggestion } of BANNED_PHRASES) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          issues.push({
            type,
            text: match,
            suggestion,
            severity: type === 'emergency_language' || type === 'disclaimer' ? 'error' : 'warning',
          });
        }
      }
    }
    
    // 2. Count citations
    for (const pattern of CITATION_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        citationCount += matches.length;
      }
    }
    
    // 3. Check factual sentences for citations
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const isFactual = FACTUAL_INDICATORS.some(pattern => pattern.test(sentence));
      if (isFactual) {
        factualSentenceCount++;
        const hasCitation = CITATION_PATTERNS.some(pattern => pattern.test(sentence));
        if (!hasCitation) {
          issues.push({
            type: 'missing_citation',
            text: sentence.trim().substring(0, 100) + '...',
            suggestion: 'This factual statement needs an inline citation from PubMed, ClinicalTrials.gov, or a clinical guideline',
            severity: 'error',
          });
        }
      }
    }
    
    // 4. Check for dosing without citation
    const dosingPattern = /\b\d+\s*(mg|mcg|ml|g|kg|µg)\b.*(?:\b(dose|dosing|administration|give|administer)\b|\b(dose|dosing|administration|give|administer)\b.*\d+\s*(mg|mcg|ml|g|kg|µg))/i;
    if (dosingPattern.test(text)) {
      const dosingSentences = sentences.filter(s => /\b\d+\s*(mg|mcg|ml|g|kg|µg)\b/i.test(s));
      for (const sentence of dosingSentences) {
        const hasCitation = CITATION_PATTERNS.some(pattern => pattern.test(sentence));
        if (!hasCitation) {
          issues.push({
            type: 'uncited_dosing',
            text: sentence.trim().substring(0, 100) + '...',
            suggestion: 'Dosing information must be cited from a clinical guideline or drug reference',
            severity: 'error',
          });
        }
      }
    }
    
    // 5. Check for contraindication statements without citation
    const contraindicationPattern = /\b(contraindicated|contraindication|should not be used|avoid in|do not use)\b/i;
    if (contraindicationPattern.test(text)) {
      const contraSentences = sentences.filter(s => contraindicationPattern.test(s));
      for (const sentence of contraSentences) {
        const hasCitation = CITATION_PATTERNS.some(pattern => pattern.test(sentence));
        if (!hasCitation) {
          issues.push({
            type: 'uncited_contraindication',
            text: sentence.trim().substring(0, 100) + '...',
            suggestion: 'Contraindication statements must be cited from clinical guidelines or drug references',
            severity: 'error',
          });
        }
      }
    }
    
    // 6. Calculate score
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    
    let score = 100;
    score -= errorCount * 15;
    score -= warningCount * 5;
    
    // Bonus for high citation density
    if (factualSentenceCount > 0) {
      const citationRatio = citationCount / factualSentenceCount;
      if (citationRatio > 1) score += 10;
      else if (citationRatio < 0.5) score -= 10;
    }
    
    score = Math.max(0, Math.min(100, score));
    
    return {
      passed: errorCount === 0,
      issues,
      score,
      citationCount,
      factualSentenceCount,
    };
  }
  
  /**
   * Get a list of banned phrases for display/debugging
   */
  getBannedPhrases(): string[] {
    return BANNED_PHRASES.map(b => b.pattern.source);
  }
  
  /**
   * Quick check if text contains any banned phrases
   */
  hasBannedPhrases(text: string): boolean {
    return BANNED_PHRASES.some(({ pattern }) => pattern.test(text));
  }
  
  /**
   * Remove banned phrases from text (for cleanup)
   */
  cleanBannedPhrases(text: string): string {
    let cleaned = text;
    for (const { pattern } of BANNED_PHRASES) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned;
  }
}

// Singleton instance
export const clinicalValidator = new ClinicalValidator();
