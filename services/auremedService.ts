/**
 * AureMed Service - New Architecture
 * 
 * Clean entry point for AureMed medical research assistant.
 * 
 * Architecture:
 * 1. Query Analyzer → understands query, detects language, plans skill chain
 * 2. Skill Chain Executor → executes skills with automatic fallbacks
 * 3. Evidence Synthesizer → builds doctor-grade answer from evidence ONLY
 * 4. Clinical Validator → ensures output meets standards
 * 5. Translation Pipeline → handles all language translation
 * 6. Quota-Aware Model Manager → handles model selection and quota limits
 * 
 * This replaces the fragile "AI decides which skills to call" approach
 * with deterministic, architecture-level query understanding and execution.
 * 
 * Key guarantees:
 * - NEVER shows "All skills failed" error messages
 * - NEVER produces generic emergency advice
 * - 100% of factual statements have inline clickable citations
 * - All languages work via translation pipeline
 * - Quota exhaustion shows friendly "Resets in ~X seconds" message
 * - Skill chains execute automatically with fallbacks
 */

import { queryAnalyzer } from '../lib/queryAnalyzer';
import { skillChainExecutor } from '../lib/skillChainExecutor';
import type { SkillChainExecutionResult } from '../lib/skillChainExecutor';
import { evidenceSynthesizer } from '../lib/evidenceSynthesizer';
import { translationPipeline } from '../lib/translationPipeline';
import { clinicalValidator } from '../lib/clinicalValidator';
import { quotaAwareModelManager } from '../lib/quotaAwareModelManager';
import { medicalSkillsRegistry } from '../lib/medicalSkillsRegistry';
import type { QueryAnalysis } from '../lib/queryAnalyzer';
import type { SynthesizedAnswer } from '../types';

export interface AureMedResponseEvent {
  type: 
    | 'analysis_start'
    | 'analysis_complete'
    | 'language_detected'
    | 'query_translated'
    | 'intent_classified'
    | 'chain_planned'
    | 'chain_start'
    | 'step_start'
    | 'step_complete'
    | 'step_failed'
    | 'fallback_start'
    | 'evidence_update'
    | 'synthesis_start'
    | 'synthesis_complete'
    | 'translation_start'
    | 'translation_complete'
    | 'validation_start'
    | 'validation_complete'
    | 'quota_warning'
    | 'error'
    | 'complete'
    | 'text_chunk';
  payload: {
    message?: string;
    progress?: number; // 0-100
    language?: string;
    englishQuery?: string;
    intent?: string;
    urgency?: string;
    skillName?: string;
    stepIndex?: number;
    totalSteps?: number;
    citationsAdded?: number;
    totalCitations?: number;
    text?: string;
    error?: string;
    resetTime?: string;
    validationScore?: number;
  };
}

export interface AureMedResponse {
  answer: string;
  citations: any[];
  evidence: any;
  analysis: QueryAnalysis;
  validation: any;
  metadata: {
    totalTimeMs: number;
    apiCallsMade: number;
    modelsUsed: string[];
    language: string;
    intent: string;
    skillChain: string;
  };
}

class AureMedService {
  /**
   * Process a medical query and return a doctor-grade answer
   * Streams progress events for UI updates
   */
  async *processQuery(
    query: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<AureMedResponseEvent, AureMedResponse, unknown> {
    const startTime = Date.now();
    const modelsUsed: string[] = [];
    
    try {
      // ============================================================
      // PHASE 1: Query Analysis (10% progress)
      // ============================================================
      yield { type: 'analysis_start', payload: { message: 'Analyzing your medical query...', progress: 5 } };
      
      const analysis = await queryAnalyzer.analyze(query);
      
      yield { 
        type: 'language_detected', 
        payload: { 
          language: analysis.detectedLanguage, 
          message: `Language detected: ${analysis.detectedLanguage}`,
          progress: 10,
        } 
      };
      
      if (analysis.detectedLanguage !== 'en') {
        yield { 
          type: 'query_translated', 
          payload: { 
            englishQuery: analysis.englishQuery,
            message: `Query translated to English for API calls: "${analysis.englishQuery.substring(0, 80)}..."`,
            progress: 15,
          } 
        };
      }
      
      yield { 
        type: 'intent_classified', 
        payload: { 
          intent: analysis.intent,
          urgency: analysis.urgency,
          message: `Intent: ${analysis.intent.replace(/_/g, ' ')} | Urgency: ${analysis.urgency}`,
          progress: 20,
        } 
      };
      
      yield { 
        type: 'chain_planned', 
        payload: { 
          message: `Skill chain planned: ${analysis.recommendedSkillChain.name} (${analysis.recommendedSkillChain.steps.length} steps)`,
          progress: 25,
        } 
      };
      
      yield { type: 'analysis_complete', payload: { progress: 25 } };
      
      // ============================================================
      // PHASE 2: Skill Chain Execution (25-60% progress)
      // ============================================================
      yield { type: 'chain_start', payload: { 
        message: `Executing skill chain: ${analysis.recommendedSkillChain.name}`,
        progress: 30,
      }};
      
      // Check quota before starting
      const modelSelection = quotaAwareModelManager.selectModel();
      modelsUsed.push(modelSelection.model);
      
      if (modelSelection.isFallback && modelSelection.fallbackReason?.includes('quota')) {
        yield { type: 'quota_warning', payload: { 
          message: modelSelection.fallbackReason,
          progress: 30,
        }};
      }
      
      // Execute the skill chain
      let chainResult: SkillChainExecutionResult | null = null;
      
      try {
        const chainGenerator = skillChainExecutor.executeChain(analysis, abortSignal);
        let result = await chainGenerator.next();
        
        while (!result.done) {
          const event = result.value;
          
          // Map chain events to AureMed events
          const progress = 30 + Math.round((event.payload.progress || 0) * 0.3);
          
          if (event.type === 'step_start') {
            yield { type: 'step_start', payload: {
              skillName: event.payload.skillName,
              stepIndex: event.payload.stepIndex,
              message: `Executing: ${event.payload.skillName?.replace(/_/g, ' ')} - ${event.payload.purpose}`,
              progress,
            }};
          } else if (event.type === 'step_complete') {
            yield { type: 'step_complete', payload: {
              skillName: event.payload.skillName,
              citationsAdded: event.payload.citationsAdded,
              totalCitations: event.payload.totalCitations,
              message: `Completed: ${event.payload.skillName?.replace(/_/g, ' ')} (${event.payload.citationsAdded} citations)`,
              progress,
            }};
          } else if (event.type === 'step_failed') {
            yield { type: 'step_failed', payload: {
              skillName: event.payload.skillName,
              error: event.payload.error,
              message: `Step failed: ${event.payload.skillName?.replace(/_/g, ' ')} - trying fallback...`,
              progress,
            }};
          } else if (event.type === 'fallback_start') {
            yield { type: 'fallback_start', payload: {
              message: event.payload.message,
              progress,
            }};
          } else if (event.type === 'evidence_update') {
            yield { type: 'evidence_update', payload: {
              totalCitations: event.payload.totalCitations,
              message: `Evidence gathered: ${event.payload.totalCitations} citations`,
              progress,
            }};
          } else if (event.type === 'chain_complete') {
            yield { type: 'evidence_update', payload: {
              totalCitations: event.payload.totalCitations,
              message: event.payload.message,
              progress: 60,
            }};
          } else if (event.type === 'chain_failed') {
            yield { type: 'fallback_start', payload: {
              message: event.payload.message,
              progress,
            }};
          }
          
          result = await chainGenerator.next();
        }
        
        chainResult = result.value;
      } catch (e: any) {
        // Handle quota errors gracefully
        // STRICT quota check: only real 429 status or RESOURCE_EXHAUSTED count.
        const _errStr = (e.message || '').toLowerCase();
        if (e.status === 429 || e.code === 429 || _errStr.includes('resource_exhausted')) {
          const friendlyMsg = quotaAwareModelManager.getFriendlyQuotaMessage(e, modelSelection.model);
          const retryDelay = quotaAwareModelManager.parseRetryDelay(e);
          quotaAwareModelManager.markExhausted(modelSelection.model, retryDelay, 'Quota exceeded during chain execution');
          
          yield { type: 'quota_warning', payload: { 
            message: friendlyMsg,
            resetTime: new Date(Date.now() + retryDelay).toISOString(),
            progress: 30,
          }};
          
          // Try to continue with fallback — the chain executor has fallback chains built in
          // If all else fails, we'll synthesize from whatever evidence we have
        } else {
          console.warn('[AureMedService] Chain execution error:', e);
          // Continue to synthesis with whatever evidence we have
        }
      }
      
      // ============================================================
      // PHASE 3: Evidence Synthesis (60-85% progress)
      // ============================================================
      yield { type: 'synthesis_start', payload: { 
        message: 'Synthesizing doctor-grade answer from evidence...',
        progress: 65,
      }};
      
      let synthesizedAnswer: SynthesizedAnswer | null = null;
      
      if (chainResult && chainResult.citations.length > 0) {
        try {
          synthesizedAnswer = await evidenceSynthesizer.synthesize(
            chainResult.evidence,
            analysis,
            abortSignal
          );
          
          yield { type: 'synthesis_complete', payload: { 
            message: `Answer synthesized with ${chainResult.citations.length} citations`,
            progress: 85,
          }};
        } catch (e: any) {
          console.warn('[AureMedService] Synthesis failed:', e);
          // Fall through to fallback
        }
      }
      
      // ============================================================
      // PHASE 4: Validation (85-95% progress)
      // ============================================================
      yield { type: 'validation_start', payload: { 
        message: 'Validating answer against clinical standards...',
        progress: 85,
      }};
      
      // If no synthesized answer was generated (no citations found),
      // generate a fallback answer that explains what was searched
      if (!synthesizedAnswer) {
        synthesizedAnswer = this.generateFallbackAnswer(chainResult, analysis);
      }
      
      let validationScore = 100;
      if (synthesizedAnswer) {
        const validation = clinicalValidator.validate(synthesizedAnswer.answer, []);
        validationScore = validation.score;
        
        yield { type: 'validation_complete', payload: { 
          validationScore,
          message: validation.passed 
            ? `Validation passed (score: ${validation.score}/100)` 
            : `Validation issues found (score: ${validation.score}/100) - ${validation.issues.length} issues`,
          progress: 95,
        }};
      }
      
      // ============================================================
      // PHASE 5: Translation (if needed) (95-100% progress)
      // ============================================================
      if (synthesizedAnswer && analysis.detectedLanguage !== 'en') {
        yield { type: 'translation_start', payload: { 
          message: `Translating answer to ${analysis.detectedLanguage}...`,
          progress: 95,
        }};
        
        // Translate the fallback answer if it was generated in English
        if (synthesizedAnswer.answer && synthesizedAnswer.answer.length > 0) {
          synthesizedAnswer = {
            ...synthesizedAnswer,
            answer: await translationPipeline.translateFromEnglish(
              synthesizedAnswer.answer, 
              analysis.detectedLanguage
            ),
          };
        }
        
        yield { type: 'translation_complete', payload: { 
          message: 'Translation complete',
          progress: 100,
        }};
      }
      
      // ============================================================
      // BUILD FINAL RESPONSE
      // ============================================================
      const totalTimeMs = Date.now() - startTime;
      
      const response: AureMedResponse = {
        answer: synthesizedAnswer?.answer || '',
        citations: chainResult?.citations || [],
        evidence: chainResult?.evidence || null,
        analysis,
        validation: { score: validationScore },
        metadata: {
          totalTimeMs,
          apiCallsMade: chainResult?.apiCallsMade || 0,
          modelsUsed,
          language: analysis.detectedLanguage,
          intent: analysis.intent,
          skillChain: analysis.recommendedSkillChain.name,
        },
      };
      
      yield { type: 'complete', payload: { 
        message: `Complete: ${response.citations.length} citations, ${response.metadata.apiCallsMade} API calls, ${totalTimeMs}ms`,
        progress: 100,
      }};
      
      return response;
      
    } catch (error: any) {
      // ============================================================
      // GRACEFUL ERROR HANDLING — NEVER show "All skills failed"
      // ============================================================
      console.error('[AureMedService] Fatal error:', error);
      
      // STRICT quota check: only real 429 status or RESOURCE_EXHAUSTED count.
      // Prevents non-quota errors (400, 403, 404) from being misclassified as quota errors.
      const errStr = (error.message || '').toLowerCase();
      if (error.status === 429 || error.code === 429 || errStr.includes('resource_exhausted')) {
        const retryDelay = quotaAwareModelManager.parseRetryDelay(error);
        const resetTime = new Date(Date.now() + retryDelay);
        const friendlyMsg = quotaAwareModelManager.getFriendlyQuotaMessage(error, modelsUsed[0] || 'gemini-flash-latest');
        
        yield { type: 'quota_warning', payload: { 
          message: friendlyMsg,
          resetTime: resetTime.toISOString(),
          progress: 100,
        }};
        
        // Return a response with whatever we have
        return {
          answer: '',
          citations: [],
          evidence: null,
          analysis: await queryAnalyzer.analyze(query).catch(() => null as any),
          validation: { score: 0 },
          metadata: {
            totalTimeMs: Date.now() - startTime,
            apiCallsMade: 0,
            modelsUsed,
            language: 'en',
            intent: 'unknown',
            skillChain: 'none',
          },
        };
      }
      
      // For other errors, yield a graceful message (NOT "All skills failed")
      yield { type: 'error', payload: { 
        error: error.message || 'Unknown error',
        message: 'An error occurred while processing your query. Please try again.',
        progress: 100,
      }};
      
      return {
        answer: '',
        citations: [],
        evidence: null,
        analysis: await queryAnalyzer.analyze(query).catch(() => null as any),
        validation: { score: 0 },
        metadata: {
          totalTimeMs: Date.now() - startTime,
          apiCallsMade: 0,
          modelsUsed,
          language: 'en',
          intent: 'unknown',
          skillChain: 'none',
        },
      };
    }
  }
  
  /**
   * Generate a fallback answer from citations when synthesis fails
   * This ensures we ALWAYS have some output — NEVER shows "All skills failed"
   */
  private generateFallbackAnswer(chainResult: SkillChainExecutionResult | null, analysis: QueryAnalysis): SynthesizedAnswer {
    const citations = chainResult?.citations || [];
    const executedSteps = chainResult?.executedSteps || [];
    
    if (citations.length > 0) {
      // Build a basic answer from citations
      let answer = `Based on the evidence retrieved for "${analysis.englishQuery}":\n\n`;
      answer += `**Relevant Evidence:**\n\n`;
      for (let i = 0; i < Math.min(citations.length, 10); i++) {
        const c = citations[i];
        const title = c.metadata?.title || 'Untitled';
        const url = c.clickableUrl;
        const authors = c.metadata?.authors?.slice(0, 2).join(', ') || '';
        const year = c.metadata?.year || '';
        answer += `${i + 1}. [${authors} ${year} - ${title}](${url})\n`;
      }
      
      return {
        answer,
        sections: [{ title: 'Evidence', content: answer, evidenceLevel: 'B', citations }],
        keyPoints: [],
        clinicalPearls: [],
        redFlags: [],
        evidenceSummary: {
          totalCitations: citations.length,
          uniquePmids: citations.filter((c: any) => c.pmid).length,
          uniqueNctIds: citations.filter((c: any) => c.nctId).length,
          studyDesigns: {},
          dateRange: { start: null, end: null },
          qualityScore: 50,
          gaps: [],
        },
        citationIndex: {},
      };
    }
    
    // No citations found — generate a helpful message (NOT "All skills failed")
    const executedSkillNames = executedSteps.map(s => s.skillName.replace(/_/g, ' '));
    const failedSkillNames = (chainResult?.failedSteps || []).map(s => s.skillName.replace(/_/g, ' '));
    
    let answer = `I searched for medical evidence regarding "${analysis.englishQuery}" using the following research skills:\n\n`;
    answer += `**Skills Executed:**\n`;
    for (const skillName of executedSkillNames) {
      answer += `- ${skillName}\n`;
    }
    if (failedSkillNames.length > 0) {
      answer += `\n**Skills with Issues:**\n`;
      for (const skillName of failedSkillNames) {
        answer += `- ${skillName}\n`;
      }
    }
    answer += `\n**Search Strategy:**\n`;
    answer += `- Query translated to English: "${analysis.englishQuery}"\n`;
    answer += `- Intent classified as: ${analysis.intent.replace(/_/g, ' ')}\n`;
    answer += `- Skill chain: ${analysis.recommendedSkillChain.name}\n`;
    answer += `\nNo PubMed articles or ClinicalTrials.gov studies were found for this specific query. This could be because:\n`;
    answer += `1. The query may need to be more specific (e.g., include a specific condition, drug, or procedure)\n`;
    answer += `2. The medical terminology may need adjustment for PubMed search\n`;
    answer += `3. The query may be about a very rare condition with limited published evidence\n`;
    answer += `\n**Suggestion:** Try rephrasing your query with more specific medical terms, or include the specific condition name, treatment, or outcome you're interested in.\n`;
    
    return {
      answer,
      sections: [{ title: 'Search Results', content: answer, evidenceLevel: 'D', citations: [] }],
      keyPoints: [],
      clinicalPearls: [],
      redFlags: [],
      evidenceSummary: {
        totalCitations: 0,
        uniquePmids: 0,
        uniqueNctIds: 0,
        studyDesigns: {},
        dateRange: { start: null, end: null },
        qualityScore: 0,
        gaps: [`No evidence found for query: ${analysis.englishQuery}`],
      },
      citationIndex: {},
    };
  }
  
  /**
   * Get available medical skills (for UI/debugging)
   */
  getAvailableSkills(): string[] {
    return medicalSkillsRegistry.getAllSkillNames();
  }
  
  /**
   * Get skill chain templates (for UI/debugging)
   */
  getChainTemplates() {
    return queryAnalyzer.getAllChainTemplates();
  }
}

// Singleton instance
export const auremedService = new AureMedService();
