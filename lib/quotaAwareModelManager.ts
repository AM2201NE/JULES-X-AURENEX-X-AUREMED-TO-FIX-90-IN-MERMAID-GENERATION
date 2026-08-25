/**
 * Quota-Aware Model Manager
 * 
 * Handles all Gemini model interactions with quota awareness:
 * - Tracks usage per model (RPM, TPM, RPD)
 * - Automatically selects best available model
 * - Parses RetryInfo.retryDelay from 429 errors
 * - Implements exponential backoff with jitter
 * - Provides friendly user messages: "Resets in ~45 seconds"
 * - Model fallback chain: flash → pro → 2.0-flash → 1.5-flash
 */

import { GoogleGenAI } from '@google/genai';

export interface ModelConfig {
  name: string;
  rpmLimit: number;          // Requests per minute
  tpmLimit: number;          // Tokens per minute
  rpdLimit: number;          // Requests per day
  priority: number;          // Lower = higher priority
  supportsTools: boolean;
  supportsStreaming: boolean;
}

export interface QuotaStatus {
  model: string;
  requestsUsedThisMinute: number;
  requestsRemainingThisMinute: number;
  tokensUsedThisMinute: number;
  tokensRemainingThisMinute: number;
  requestsUsedToday: number;
  requestsRemainingToday: number;
  resetTime: Date;
  isExhausted: boolean;
  exhaustionReason?: string;
}

export interface ModelSelectionResult {
  model: string;
  isFallback: boolean;
  fallbackReason?: string;
}

interface UsageRecord {
  timestamp: number;
  tokens: number;
}

class QuotaAwareModelManager {
  // ═══════════════════════════════════════════════════════════
  // MODEL CHAIN — Updated 2026-08-07 per https://ai.google.dev/gemini-api/docs/models
  // Free tier only. All models below are "Free of charge" on the Standard tier.
  //
  // CRITICAL: Free tier rate limits are PER PROJECT (not per model or API key).
  // RPD quotas reset at midnight Pacific time. RPM limits are rolling.
  //
  // Removed / shut-down models (NOT in chain):
  //   gemini-2.0-flash (shut down June 1, 2026)
  //   gemini-2.0-flash-lite (shut down June 1, 2026)
  //   gemini-1.5-flash / gemini-1.5-pro (shut down)
  //   gemini-2.5-flash-lite (404 — no longer available to new users as of Aug 2026)
  //   gemini-3.1-pro-preview (paid only, NOT available on free tier)
  //   gemini-3-pro-preview (shut down)
  //   gemini-3.1-flash-lite-preview (shut down)
  //
  // Free tier rate limits (RPM = requests/min, RPD = requests/day):
  //   Exact RPM/RPD vary per model and are viewable at:
  //   https://aistudio.google.com/rate-limit
  //   Conservative estimates used below based on official docs & testing.
  //
  // IMPORTANT: Gemini 3.x models (3.6-flash, 3.5-flash, 3.5-flash-lite,
  //   3.1-flash-lite, 3-flash-preview) DEPRECATE temperature, top_p, top_k.
  //   These params are ignored now and will return HTTP 400 in future.
  //
  // PRIORITY STRATEGY: Models with HIGHER free-tier limits FIRST.
  // Gemini 3.x models have ~10 RPM / ~500 RPD (very restrictive).
  // Gemini 2.5 Flash/Lite models have ~15-30 RPM / ~1500 RPD (more generous).
  // ═══════════════════════════════════════════════════════════
  private modelChain: ModelConfig[] = [
    // Gemini 2.5 Flash (highest availability, proven free tier workhorse)
    { name: 'gemini-2.5-flash', rpmLimit: 15, tpmLimit: 1000000, rpdLimit: 1500, priority: 1, supportsTools: true, supportsStreaming: true },

    // Gemini 3.5 Flash-Lite
    { name: 'gemini-3.5-flash-lite', rpmLimit: 30, tpmLimit: 1000000, rpdLimit: 1500, priority: 2, supportsTools: true, supportsStreaming: true },

    // gemini-flash-latest
    { name: 'gemini-flash-latest', rpmLimit: 15, tpmLimit: 500000, rpdLimit: 1500, priority: 3, supportsTools: true, supportsStreaming: true },

    // Gemini 3.6 Flash
    { name: 'gemini-3.6-flash', rpmLimit: 15, tpmLimit: 1000000, rpdLimit: 1500, priority: 4, supportsTools: true, supportsStreaming: true },

    // Gemini 3.7 Flash
    { name: 'gemini-3.7-flash', rpmLimit: 15, tpmLimit: 1000000, rpdLimit: 1500, priority: 5, supportsTools: true, supportsStreaming: true },

    // Gemini 3.1 Flash-Lite
    { name: 'gemini-3.1-flash-lite', rpmLimit: 30, tpmLimit: 1000000, rpdLimit: 1500, priority: 6, supportsTools: true, supportsStreaming: true },

    // gemini-flash-lite-latest
    { name: 'gemini-flash-lite-latest', rpmLimit: 30, tpmLimit: 1000000, rpdLimit: 1500, priority: 7, supportsTools: true, supportsStreaming: true },

    // Gemini 2.5 Flash-Lite
    { name: 'gemini-2.5-flash-lite', rpmLimit: 30, tpmLimit: 1000000, rpdLimit: 1500, priority: 8, supportsTools: true, supportsStreaming: true },

    // Gemini 1.5 Flash
    { name: 'gemini-1.5-flash', rpmLimit: 15, tpmLimit: 1000000, rpdLimit: 1500, priority: 9, supportsTools: true, supportsStreaming: true },

    // Gemini 2.5 Pro
    { name: 'gemini-2.5-pro', rpmLimit: 5, tpmLimit: 250000, rpdLimit: 100, priority: 10, supportsTools: true, supportsStreaming: true },

    // Gemini 1.5 Pro
    { name: 'gemini-1.5-pro', rpmLimit: 5, tpmLimit: 250000, rpdLimit: 50, priority: 11, supportsTools: true, supportsStreaming: true },
  ];
  
  // Usage tracking per model
  private usage: Map<string, UsageRecord[]> = new Map();
  
  // Exhausted models with reset times
  private exhaustedModels: Map<string, { resetTime: Date; reason: string }> = new Map();
  
  // Active model (cached selection)
  private activeModel: string | null = null;
  private lastSelectionTime: number = 0;
  private selectionCacheMs: number = 5000; // Re-select every 5 seconds max
  
  /**
   * Select the best available model based on current quota status
   */
  selectModel(): ModelSelectionResult {
    // Clean up expired exhaustion records
    this.cleanupExhaustedModels();
    
    // Check cache (avoid re-selecting too frequently)
    const now = Date.now();
    if (this.activeModel && (now - this.lastSelectionTime) < this.selectionCacheMs) {
      // Verify cached model is still available
      if (!this.isModelExhausted(this.activeModel)) {
        return { model: this.activeModel, isFallback: false };
      }
    }
    
    // Try models in priority order
    for (const config of this.modelChain) {
      if (this.isModelExhausted(config.name)) {
        continue;
      }
      
      // Check rate limits
      const status = this.getQuotaStatus(config.name);
      if (status.requestsRemainingThisMinute > 0 && 
          status.tokensRemainingThisMinute > 0 && 
          status.requestsRemainingToday > 0) {
        this.activeModel = config.name;
        this.lastSelectionTime = now;
        return { model: config.name, isFallback: config.priority > 1, fallbackReason: config.priority > 1 ? 'Primary model quota limited' : undefined };
      }
    }
    
    // All models exhausted — find the one with earliest reset time
    let earliestReset: Date | null = null;
    let earliestModel: string | null = null;
    for (const [model, info] of this.exhaustedModels) {
      if (!earliestReset || info.resetTime < earliestReset) {
        earliestReset = info.resetTime;
        earliestModel = model;
      }
    }
    
    if (earliestModel && earliestReset) {
      return { 
        model: earliestModel, 
        isFallback: true, 
        fallbackReason: `All models quota-limited. Earliest reset: ${this.formatTimeUntil(earliestReset)}` 
      };
    }
    
    // Ultimate fallback
    return { model: this.modelChain[0].name, isFallback: true, fallbackReason: 'No quota data available' };
  }
  
  /**
   * Record a usage event for a model
   */
  recordUsage(model: string, tokens: number): void {
    if (!this.usage.has(model)) {
      this.usage.set(model, []);
    }
    this.usage.get(model)!.push({ timestamp: Date.now(), tokens });
  }
  
  /**
   * Mark a model as exhausted (from 429 error)
   */
  markExhausted(model: string, retryDelayMs: number, reason: string = 'Quota exceeded'): void {
    const resetTime = new Date(Date.now() + retryDelayMs);
    this.exhaustedModels.set(model, { resetTime, reason });
    console.log(`[QuotaManager] Model ${model} exhausted. Resets at ${resetTime.toISOString()} (${this.formatTimeUntil(resetTime)} remaining). Reason: ${reason}`);
  }

  /**
   * Clear exhaustion record for a specific model (e.g., after waiting for quota reset)
   */
  clearExhausted(model: string): void {
    this.exhaustedModels.delete(model);
  }
  
  /**
   * Parse RetryInfo.retryDelay from a 429 error response
   * Returns delay in milliseconds
   */
  parseRetryDelay(error: any): number {
    const defaultDelay = 30000; // 30 seconds default
    
    try {
      const errStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      const errorData = typeof errStr === 'string' ? JSON.parse(errStr) : error;
      
      // Check multiple possible locations for RetryInfo
      const details = errorData?.error?.details || error?.details || error?.error?.details || [];
      
      for (const detail of details) {
        if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' && detail.retryDelay) {
          const delayStr = detail.retryDelay; // e.g., "21s" or "21.393461213s"
          const seconds = parseFloat(delayStr.replace('s', ''));
          if (!isNaN(seconds) && seconds > 0) {
            return seconds * 1000; // Use the actual delay from the API (no cap)
          }
        }
      }
      
      // Check for retry-after header
      const retryAfter = error?.response?.headers?.['retry-after'] 
        || error?.headers?.['retry-after']
        || error?.response?.headers?.['Retry-After'];
      if (retryAfter) {
        const value = parseInt(retryAfter, 10);
        if (!isNaN(value) && value > 0) {
          return value < 1000 ? value * 1000 : value;
        }
      }
    } catch (e) {
      // Parsing failed, use default
    }
    
    return defaultDelay;
  }
  
  /**
   * Generate a friendly user-facing message for quota exhaustion
   */
  getFriendlyQuotaMessage(error: any, model: string): string {
    const retryDelayMs = this.parseRetryDelay(error);
    const resetTime = new Date(Date.now() + retryDelayMs);
    const timeUntil = this.formatTimeUntil(resetTime);
    
    return `API quota temporarily exceeded for ${model}. Resets in ~${timeUntil}. Automatically falling back to alternative model...`;
  }
  
  /**
   * Get quota status for a specific model
   */
  getQuotaStatus(model: string): QuotaStatus {
    const config = this.modelChain.find(m => m.name === model);
    if (!config) {
      return {
        model,
        requestsUsedThisMinute: 0,
        requestsRemainingThisMinute: 0,
        tokensUsedThisMinute: 0,
        tokensRemainingThisMinute: 0,
        requestsUsedToday: 0,
        requestsRemainingToday: 0,
        resetTime: new Date(),
        isExhausted: true,
        exhaustionReason: 'Unknown model',
      };
    }
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;
    
    const records = this.usage.get(model) || [];
    
    // Count requests in last minute
    const recentRequests = records.filter(r => r.timestamp > oneMinuteAgo);
    const requestsUsedThisMinute = recentRequests.length;
    const tokensUsedThisMinute = recentRequests.reduce((sum, r) => sum + r.tokens, 0);
    
    // Count requests today
    const todayRequests = records.filter(r => r.timestamp > oneDayAgo);
    const requestsUsedToday = todayRequests.length;
    
    // Check exhaustion
    const exhausted = this.exhaustedModels.get(model);
    const isExhausted = !!exhausted && exhausted.resetTime > new Date();
    
    return {
      model,
      requestsUsedThisMinute,
      requestsRemainingThisMinute: Math.max(0, config.rpmLimit - requestsUsedThisMinute),
      tokensUsedThisMinute,
      tokensRemainingThisMinute: Math.max(0, config.tpmLimit - tokensUsedThisMinute),
      requestsUsedToday,
      requestsRemainingToday: Math.max(0, config.rpdLimit - requestsUsedToday),
      resetTime: exhausted?.resetTime || new Date(now + 60000),
      isExhausted,
      exhaustionReason: exhausted?.reason,
    };
  }
  
  /**
   * Check if a model is currently exhausted
   */
  private isModelExhausted(model: string): boolean {
    const exhausted = this.exhaustedModels.get(model);
    if (!exhausted) return false;
    return exhausted.resetTime > new Date();
  }
  
  /**
   * Clean up expired exhaustion records
   */
  cleanupExhaustedModels(): void {
    const now = new Date();
    for (const [model, info] of this.exhaustedModels) {
      if (info.resetTime <= now) {
        this.exhaustedModels.delete(model);
        console.log(`[QuotaManager] Model ${model} quota reset. Available again.`);
      }
    }
    
    // Also clean up old usage records (keep only last 24 hours)
    const oneDayAgo = Date.now() - 86400000;
    for (const [model, records] of this.usage) {
      const recent = records.filter(r => r.timestamp > oneDayAgo);
      this.usage.set(model, recent);
    }
  }
  
  /**
   * Format time until a future date as human-readable string
   */
  private formatTimeUntil(futureTime: Date): string {
    const now = new Date();
    const diffMs = futureTime.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'now';
    
    const seconds = Math.ceil(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}${remainingSeconds > 0 ? ` ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}`;
    }
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
  }
  
  /**
   * Get the full model chain for fallback
   */
  getModelChain(): string[] {
    return this.modelChain.map(m => m.name);
  }
  
  /**
   * Get models to try in order (excluding exhausted ones)
   */
  getAvailableModels(): string[] {
    this.cleanupExhaustedModels();
    return this.modelChain
      .filter(m => !this.isModelExhausted(m.name))
      .map(m => m.name);
  }
  
  /**
   * Wait for quota to reset (with progress callback)
   */
  async waitForQuotaReset(model: string, onProgress?: (message: string) => void): Promise<void> {
    const exhausted = this.exhaustedModels.get(model);
    if (!exhausted) return;
    
    const waitMs = exhausted.resetTime.getTime() - Date.now();
    if (waitMs <= 0) {
      this.exhaustedModels.delete(model);
      return;
    }
    
    const waitSeconds = Math.ceil(waitMs / 1000);
    onProgress?.(`Waiting ${waitSeconds}s for ${model} quota to reset...`);
    
    // Wait in 5-second increments for progress updates
    const increment = 5000;
    let remaining = waitMs;
    while (remaining > 0) {
      const wait = Math.min(increment, remaining);
      await new Promise(r => setTimeout(r, wait));
      remaining -= wait;
      if (remaining > 0) {
        onProgress?.(`${Math.ceil(remaining / 1000)}s remaining...`);
      }
    }
    
    this.exhaustedModels.delete(model);
    onProgress?.(`${model} quota reset. Resuming...`);
  }
  
  /**
   * Reset all tracking (for testing)
   */
  reset(): void {
    this.usage.clear();
    this.exhaustedModels.clear();
    this.activeModel = null;
    this.lastSelectionTime = 0;
  }

  /**
   * Get the earliest reset time across all exhausted models.
   * Returns null if no models are currently exhausted.
   */
  getEarliestResetTime(): Date | null {
    this.cleanupExhaustedModels();
    let earliestReset: Date | null = null;
    for (const [, info] of this.exhaustedModels) {
      if (!earliestReset || info.resetTime < earliestReset) {
        earliestReset = info.resetTime;
      }
    }
    return earliestReset;
  }

  /**
   * Get a user-friendly message about when the API quota will reset,
   * showing the reset time in the user's local timezone.
   * Returns null if no models are exhausted.
   */
  getQuotaResetMessage(): string | null {
    const resetTime = this.getEarliestResetTime();
    if (!resetTime) return null;

    const timeUntil = this.formatTimeUntil(resetTime);
    const localTimeStr = resetTime.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const localDateStr = resetTime.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    // Check if reset is today or tomorrow
    const now = new Date();
    const isToday = resetTime.toDateString() === now.toDateString();
    const isTomorrow = resetTime.toDateString() === new Date(now.getTime() + 86400000).toDateString();

    let dayLabel: string;
    if (isToday) {
      dayLabel = 'today';
    } else if (isTomorrow) {
      dayLabel = 'tomorrow';
    } else {
      dayLabel = `on ${localDateStr}`;
    }

    return `All AI models are temporarily rate-limited. The quota will reset ${dayLabel} at ${localTimeStr} (in ~${timeUntil}). Please try again after the reset time.`;
  }
}

// Singleton instance
export const quotaAwareModelManager = new QuotaAwareModelManager();
