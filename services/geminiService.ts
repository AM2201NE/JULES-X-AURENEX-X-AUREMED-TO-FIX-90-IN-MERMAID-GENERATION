// ... (imports remain same)
/// <reference types="vite/client" />
import { GoogleGenAI, Type, Content, Part, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";
import { extractKeywords, generateLocalTags } from '../lib/utils';
import { jsonrepair } from 'jsonrepair';
import { quotaAwareModelManager } from '../lib/quotaAwareModelManager';
import EmbeddingWorker from './embeddingWorker?worker';

let worker: Worker | null = null;
let workerReady = false;
const pendingRequests = new Map<string, { resolve: Function, reject: Function }>();

function getWorker() {
    if (!worker) {
        worker = new EmbeddingWorker();
        worker.onmessage = (event) => {
            const { id, type, payload } = event.data;
            if (type === 'ready') {
                workerReady = true;
            } else if (type === 'result') {
                const req = pendingRequests.get(id);
                if (req) {
                    req.resolve(payload);
                    pendingRequests.delete(id);
                }
            } else if (type === 'error') {
                const req = pendingRequests.get(id);
                if (req) {
                    req.reject(new Error(payload));
                    pendingRequests.delete(id);
                }
            } else if (type === 'progress') {
                // Ignore progress here, handled in init if needed
            }
        };
    }
    return worker;
}

let isWorkerInitialized = false;
let initWorkerPromise: Promise<void> | null = null;

export function initEmbeddingWorker(onProgress?: (progress: any) => void): Promise<void> {
    if (isWorkerInitialized) return Promise.resolve();
    if (initWorkerPromise) return initWorkerPromise;

    initWorkerPromise = new Promise((resolve, reject) => {
        const w = getWorker();
        const id = 'init-' + uuidv4();
        
        const initHandler = (event: MessageEvent) => {
            const { id: msgId, type, payload } = event.data;
            if (msgId === id) {
                if (type === 'ready') {
                    w.removeEventListener('message', initHandler);
                    isWorkerInitialized = true;
                    resolve();
                } else if (type === 'error') {
                    w.removeEventListener('message', initHandler);
                    initWorkerPromise = null;
                    reject(new Error(payload));
                } else if (type === 'progress' && onProgress) {
                    onProgress(payload);
                }
            }
        };
        
        w.addEventListener('message', initHandler);
        w.postMessage({ id, type: 'init' });
    });
    return initWorkerPromise;
}
import type { ChatMessage, Page, Block, Citation, NotionBlock, FormattedNotionResult, RagContextPart, ChatAttachment, TableData, AgentUpdate, ImageBlock, RichText, CalloutBlock, ChildPageBlock, ChildDatabaseBlock, BookmarkBlock, LinkPreviewBlock, TableRowBlock, NotionPageInfo, MediaToRender, Evidence, GeneratedFile, ImageAnalysis, OCRChunk, User, TaggableItem, AnkiCard, AiPersonality } from '../types';
import { dataService } from './dataService';
import { notionService, fetchWithRetry } from './notionService';
import { googleDriveService, DriveFile } from './googleDriveService';
import { BlockType } from "../types";
import { v4 as uuidv4 } from 'uuid';
import { ankiService } from './ankiService';

export type SearchScope = 'auto' | 'local' | 'online';

// Robustly get the API key. Vite will replace process.env.GEMINI_API_KEY with the string value.
const ENV_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;

let aiClientInstance: GoogleGenAI | null = null;
let lastInitializedKey: string | null = null;

function getAiClient(): GoogleGenAI | null {
    let customKey = null;
    try {
        customKey = localStorage.getItem('AURENEX_CUSTOM_API_KEY');
    } catch (e) {}

    const keyToUse = (customKey && customKey.trim() !== '') ? customKey.trim() : ENV_API_KEY;

    if (!keyToUse || keyToUse === 'undefined' || keyToUse === 'null' || keyToUse.trim() === '') {
        return null;
    }

    if (!aiClientInstance || lastInitializedKey !== keyToUse) {
        aiClientInstance = new GoogleGenAI({ apiKey: keyToUse });
        lastInitializedKey = keyToUse;
        console.log("Gemini Service: Initialized with", customKey ? "Custom API Key" : "Environment API Key");
    }

    return aiClientInstance;
}

// Removed proxy, using getAiClient() locally where needed

// --- SEMANTIC SEARCH CACHE ---
const pageEmbeddingCache = new Map<string, { text: string, embedding: number[] }>();
const blockEmbeddingCache = new Map<string, number[]>();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    const results: number[][] = new Array(texts.length).fill([]);
    const textsToEmbed: { text: string, index: number }[] = [];
    
    // Check cache first
    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const cachedEmbedding = blockEmbeddingCache.get(text);
        if (cachedEmbedding) {
            results[i] = cachedEmbedding;
        } else {
            textsToEmbed.push({ text, index: i });
        }
    }
    
    if (textsToEmbed.length === 0) {
        return results;
    }
    
    try {
        if (!getAiClient()) {
            console.warn("No Gemini API key, falling back to local worker for embeddings.");
            return await getLocalEmbeddingsBatch(textsToEmbed, results);
        }

        const BATCH_SIZE = 100; // Gemini API supports up to 100 contents per request
        for (let i = 0; i < textsToEmbed.length; i += BATCH_SIZE) {
            const batch = textsToEmbed.slice(i, i + BATCH_SIZE);
            const batchTexts = batch.map(item => item.text);
            
            try {
                // Add a timeout to the Gemini API call
                const embedPromise = getAiClient()!.models.embedContent({
                    model: 'gemini-embedding-001',
                    contents: batchTexts,
                });
                
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Gemini API timeout")), 15000)
                );
                
                const response = await Promise.race([embedPromise, timeoutPromise]) as any;
                
                const embeddings = response.embeddings;
                if (embeddings) {
                    for (let j = 0; j < embeddings.length; j++) {
                        const originalIndex = batch[j].index;
                        const embedding = embeddings[j].values || [];
                        results[originalIndex] = embedding;
                        if (embedding.length > 0) {
                            blockEmbeddingCache.set(batch[j].text, embedding);
                        }
                    }
                }
            } catch (apiError: any) {
                // Only log if it's not a known network/CORS error that we expect might happen
                const errorStr = JSON.stringify(apiError);
                if (!errorStr.includes('Rpc failed due to xhr error') && !errorStr.includes('http status code: 0')) {
                    console.warn("Gemini Embedding API error, falling back to local worker:", apiError);
                }
                return await getLocalEmbeddingsBatch(textsToEmbed, results);
            }
        }
        return results;
    } catch (e) {
        console.error("Embedding batch error:", e);
        return results;
    }
}

async function getLocalEmbeddingsBatch(textsToEmbed: { text: string, index: number }[], results: number[][]): Promise<number[][]> {
    await initEmbeddingWorker();
    const w = getWorker();
    const chunkSize = 10;
    
    for (let i = 0; i < textsToEmbed.length; i += chunkSize) {
        const chunk = textsToEmbed.slice(i, i + chunkSize);
        const chunkTexts = chunk.map(c => c.text);
        
        const chunkEmbeddings = await new Promise<number[][]>((resolve, reject) => {
            const id = uuidv4();
            
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                console.warn(`Embedding worker timed out for chunk ${i}`);
                resolve(Array(chunk.length).fill([]));
            }, 30000);

            pendingRequests.set(id, { 
                resolve: (res: any) => { clearTimeout(timeout); resolve(res); }, 
                reject: (err: any) => { clearTimeout(timeout); reject(err); } 
            });
            w.postMessage({ id, type: 'embed', payload: { texts: chunkTexts } });
        });
        
        for (let j = 0; j < chunk.length; j++) {
            const originalIndex = chunk[j].index;
            const embedding = chunkEmbeddings[j] || [];
            results[originalIndex] = embedding;
            if (embedding.length > 0) {
                blockEmbeddingCache.set(chunk[j].text, embedding);
            }
        }
        
        await delay(10);
    }
    return results;
}

async function getEmbedding(text: string): Promise<number[]> {
    try {
        // Prevent Gemini API or local transformer from crashing on massive text chunk.
        const safeText = text.length > 8000 ? text.substring(0, 8000) : text;
        const embeddings = await getEmbeddingsBatch([safeText]);
        return embeddings[0] || [];
    } catch (e: any) {
        console.error("Embedding error:", e?.message || e);
        return [];
    }
}

function cosineSimilarity(a: number[], b: number[]) {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const STOP_WORDS = new Set(['the', 'and', 'is', 'in', 'to', 'of', 'it', 'that', 'for', 'on', 'with', 'as', 'this', 'was', 'at', 'by', 'an', 'be', 'from', 'or', 'are', 'your', 'you', 'can', 'what', 'how', 'why', 'when', 'where', 'who', 'will', 'would', 'should', 'could', 'about', 'which', 'their', 'there', 'then', 'than', 'tell', 'me', 'please', 'explain', 'detail', 'detailed', 'give', 'some', 'information', 'regarding', 'based', 'provided', 'context']);

function extractSearchKeywords(query: string): string {
    const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    return words.slice(0, 5).join(' ');
}

function calculateKeywordScore(query: string, text: string): number {
    const safeQuery = query.length > 5000 ? query.substring(0, 5000) : query;
    const allWords = safeQuery.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const queryWords = Array.from(new Set(allWords)).slice(0, 30);
    
    if (queryWords.length === 0) return 0;
    
    const textLower = text.toLowerCase();
    let score = 0;
    let uniqueMatches = 0;
    
    for (const word of queryWords) {
        const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${word}([^\\p{L}\\p{N}]|$)`, 'gu');
        const matches = textLower.match(regex);
        const tf = matches ? matches.length : 0;
        
        if (tf > 0) {
            uniqueMatches++;
            score += (tf / (tf + 2)); 
        }
    }
    
    return score * (uniqueMatches * uniqueMatches);
}

interface TextMetadata {
    h1: string;
    h2: string;
    year: string;
    sourceTitle: string;
}

interface TextBlock {
    text: string;
    meta: TextMetadata;
}

function buildHierarchyMap(text: string): TextBlock[] {
    const blocks: TextBlock[] = [];
    let currentH1 = "General";
    let currentH2 = "General";
    let currentYear = "";
    let currentSourceTitle = "";
    
    const lines = (text || "").split('\n');
    let currentBlockLines: string[] = [];
    
    const flushBlock = () => {
        if (currentBlockLines.length > 0) {
            const blockText = currentBlockLines.join('\n').trim();
            if (blockText.length > 5) {
                blocks.push({
                    text: blockText,
                    meta: { h1: currentH1, h2: currentH2, year: currentYear, sourceTitle: currentSourceTitle }
                });
            }
            currentBlockLines = [];
        }
    };

    for (let line of lines) {
        let trimmedLine = (line || "").trim();
        
        if (trimmedLine.startsWith('[src_') || trimmedLine.startsWith('#')) {
            flushBlock();
            if (trimmedLine.startsWith('[src_')) {
                const match = trimmedLine.match(/\[src_\d+\]\s*Title:\s*(.*)/i);
                if (match) {
                    currentSourceTitle = (match[1] || "").replace(/\(Notion\)|\(Google Drive\)/i, '').trim();
                }
            } else if (trimmedLine.startsWith('### ')) {
                currentYear = trimmedLine.replace('###', '').replace(/\*\*/g, '').trim();
            } else if (trimmedLine.startsWith('## ')) {
                currentH2 = trimmedLine.replace('##', '').replace(/\*\*/g, '').trim();
                currentYear = "";
            } else if (trimmedLine.startsWith('# ')) {
                currentH1 = trimmedLine.replace('#', '').replace(/\*\*/g, '').trim();
                currentH2 = "General";
                currentYear = "";
            }
            continue;
        }

        // New question starts a new block
        if (/^(?:\*\*|__)*\d+[\.\)](?:\*\*|__)*\s/.test(trimmedLine) || /^(?:\*\*|__)*Q\d+/.test(trimmedLine) || /^Question\s*\d+/i.test(trimmedLine)) {
            flushBlock();
        }
        
        // We accumulate lines for the current block (question + choices text)
        if (trimmedLine) {
            currentBlockLines.push(trimmedLine);
        }
    }
    
    flushBlock();
    return blocks;
}

function processAndFixAnkiCard(card: AnkiCard, hierarchyMap: TextBlock[], fallbackRootDeck: string): AnkiCard {
    const choicesText = (card.choices || []).map(c => c.text).join(" ");
    const cardText = ((card.question || "") + " " + (card.explanation || "") + " " + choicesText).toLowerCase();
    
    let bestBlock: TextBlock | null = null;
    
    if (hierarchyMap.length > 0) {
        const yearMatchContext = card.question?.match(/[\(\[]\s*(20\d{2})\s*[\)\]]\s*$/);
        const cardYear = yearMatchContext ? yearMatchContext[1] : null;

        let qToMatch = (card.question || "").replace(/(\s*\[.*?\])+$/, '').replace(/(\s*\(.*?\))+$/, '');
        const qLower = qToMatch.toLowerCase().substring(0, 40);
        const qStripped = qLower.replace(/^\d+[\.\)]\s*/, '');

        let scoredBlocks = hierarchyMap.map(block => {
            let fullScore = calculateKeywordScore(cardText, block.text);
            let choicesScore = calculateKeywordScore(choicesText, block.text);
            
            let score = fullScore + (choicesScore * 2);

            // Boost if year matches exactly
            if (cardYear && block.meta.year === cardYear) {
                 score += 5;
            }

            // Boost heavily if question text substring matches
            const bText = block.text.toLowerCase();
            if ((qStripped.trim().length > 5 && bText.includes(qStripped.trim())) || 
                (qLower.trim().length > 5 && bText.includes(qLower.trim()))) {
                score += 15; 
            }
            
            return { block, score };
        });

        scoredBlocks.sort((a, b) => b.score - a.score);
        bestBlock = scoredBlocks.length > 0 ? scoredBlocks[0].block : null;
    }
    
    const stripMarkdown = (str: string) => (str || "").replace(/\*\*|__|#|`/g, '').trim();
    const rootName = stripMarkdown(fallbackRootDeck || "Anki Export");

    if (bestBlock) {
        const { h1, h2, year, sourceTitle } = bestBlock.meta;
        
        let deckParts = [rootName];

        if (h1 && h1 !== 'General') deckParts.push(stripMarkdown(h1));
        if (h2 && h2 !== 'General') deckParts.push(stripMarkdown(h2));
        
        card.deck_name = deckParts.join('::');
        
        if (year && year !== 'General') {
            const cleanYear = year.trim();
            // If the question doesn't explicitly contain this year
            if (!(card.question || "").includes(`(${cleanYear})`)) {
                // Remove trailing brackets or parentheses that might be wrong tags
                card.question = (card.question || "").replace(/(\s*\[.*?\])+$/, '').replace(/(\s*\(.*?\))+$/, '');
                card.question = `${card.question} (${cleanYear})`;
            }
        }
        
        if (sourceTitle) {
            if (!card.sources) card.sources = [];
            const hasSource = card.sources.some(s => s.title === sourceTitle);
            if (!hasSource) card.sources.push({ title: sourceTitle });
        }

        // RESTORE EXACT ORIGINAL QUESTION TEXT (User Request)
        // AI sometimes summarizes or drops math/text. We can pull the original prefix from bestBlock.text.
        const yearMatch = (card.question || "").match(/(\s*[\(\[].*?[\)\]])+$/);
        const optionsMatch = bestBlock.text.match(/^([\s\S]*?)(?=\n+\s*(?:\*\*|__)*[Aa][\.\)](?:\*\*|__)*\s)/);
        
        if (optionsMatch) {
            let authenticQuestion = optionsMatch[1].trim();
            authenticQuestion = authenticQuestion.replace(/\n*\s*(Réponse|Answer):\s*.*$/is, '');
            if (yearMatch) {
                authenticQuestion += yearMatch[0];
            }
            card.question = authenticQuestion;
        } else {
            // For blocks without A. B. C. choices, just use the whole block if it's not insanely long
            if (bestBlock.text.length < 500 && bestBlock.text.split('\n').length <= 3) {
                 let authenticQuestion = bestBlock.text.trim();
                 authenticQuestion = authenticQuestion.replace(/\n*\s*(Réponse|Answer):\s*.*$/is, '');
                 if (yearMatch) {
                     authenticQuestion += yearMatch[0];
                 }
                 card.question = authenticQuestion;
            } else {
                 // Fallback to ensuring numbers exist
                 const originalNumberMatch = bestBlock.text.match(/^(\d+[\.\)])\s*/);
                 if (originalNumberMatch) {
                     const numStr = originalNumberMatch[1];
                     if (!(card.question || "").startsWith(numStr)) {
                         card.question = `${numStr} ${(card.question || "").replace(/^\d+[\.\)]\s*/, '')}`;
                     }
                 }
            }
        }
    } else {
        // STRICT hierarchy: no AI-invented subdecks
        card.deck_name = rootName;
    }
    
    // Safety check: ensure NO CHOICES in the question.
    if (/\s+A[\)\.]\s/.test(card.question || "")) {
       card.question = (card.question || "").split(/\s+A[\)\.]\s/)[0].trim();
    }
    
    // Code Verification: Fix unclosed MathJax brackets that result in UI disasters
    const fixUnclosedMath = (textToFix: string) => {
        if (typeof textToFix !== 'string') return textToFix;
        // Check inline math \( ... \)
        let openInlines = textToFix.split("\\\\(").length - 1;
        let closeInlines = textToFix.split("\\\\)").length - 1;
        if (openInlines > closeInlines) {
            textToFix += " \\\\)".repeat(openInlines - closeInlines);
        }
        // Check block math \[ ... \]
        // Use string splitting to avoid complex regex compilation errors in esbuild
        let openBlocks = textToFix.split("\\\\[").length - 1;
        let closeBlocks = textToFix.split("\\\\]").length - 1;
        if (openBlocks > closeBlocks) {
            textToFix += " \\\\]".repeat(openBlocks - closeBlocks);
        }
        return textToFix;
    };

    if (card.question) card.question = fixUnclosedMath(card.question) as string;
    if (card.explanation) card.explanation = fixUnclosedMath(card.explanation) as string;
    if (card.choices && Array.isArray(card.choices)) {
        card.choices = card.choices.map((c: any) => ({
            ...c,
            text: typeof c.text === 'string' ? fixUnclosedMath(c.text) : c.text
        }));
    }
    
    return card;
}

// ✅ FIXED: Helper to split massive text into logical chunks - using proper escape sequences
function splitTextIntoChunks(text: string, maxChars: number): string[] {
    if (!text || text.length <= maxChars) return [text || ""];
    const chunks: string[] = [];
    let currentStart = 0;
    while (currentStart < text.length) {
        let end = Math.min(currentStart + maxChars, text.length);
        if (end < text.length) {
            // ✅ FIXED: Use \n escape sequence instead of literal newline
            const lastHeader = text.lastIndexOf('\n#', end);
            const lastDoubleNewline = text.lastIndexOf('\n\n', end);
            // Prioritize headers, then paragraphs, then just split
            let splitPoint = -1;
            if (lastHeader > currentStart + maxChars * 0.5) splitPoint = lastHeader;
            else if (lastDoubleNewline > currentStart + maxChars * 0.5) splitPoint = lastDoubleNewline;
            if (splitPoint > currentStart) {
                end = splitPoint;
            }
        }
        chunks.push(text.substring(currentStart, end));
        currentStart = end;
    }
    return chunks;
}

async function* semanticSearchLocal(query: string, topK: number = 5, precomputedQueryEmbedding?: number[]): AsyncGenerator<any, { page: Page, score: number }[], unknown> {
    const queryEmbedding = precomputedQueryEmbedding || await getEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    const allPages = dataService.getPages();
    
    yield { type: 'progress', message: `Analyzing ${allPages.length} local pages...` };
    const candidatesWithText = allPages.map(page => {
        const text = `${page.title}\n${dataService.getBlocksText(page.content).substring(0, 3000)}`;
        const keywordScore = calculateKeywordScore(query, text);
        return { page, text, keywordScore };
    });

    const scoredPages: { page: Page, score: number }[] = [];
    const pagesToEmbed: { page: Page, text: string, keywordScore: number }[] = [];
    
    for (const item of candidatesWithText) {
        const { page, text, keywordScore } = item;
        let embedding = pageEmbeddingCache.get(page.id)?.embedding;
        
        if (!embedding || pageEmbeddingCache.get(page.id)?.text !== text) {
            pagesToEmbed.push({ page, text, keywordScore });
        } else {
            const semanticScore = cosineSimilarity(queryEmbedding, embedding);
            scoredPages.push({ page, score: semanticScore + (keywordScore * 0.1) });
        }
    }

    pagesToEmbed.sort((a, b) => b.keywordScore - a.keywordScore);
    const topPagesToEmbed = pagesToEmbed.slice(0, 15);

    if (topPagesToEmbed.length > 0) {
        yield { type: 'progress', message: `Generating embeddings for ${topPagesToEmbed.length} local pages...` };
        const texts = topPagesToEmbed.map(p => p.text);
        const embeddings = await getEmbeddingsBatch(texts);
        
        for (let i = 0; i < topPagesToEmbed.length; i++) {
            const { page, text, keywordScore } = topPagesToEmbed[i];
            const embedding = embeddings[i];
            if (embedding && embedding.length > 0) {
                pageEmbeddingCache.set(page.id, { text, embedding });
                const semanticScore = cosineSimilarity(queryEmbedding, embedding);
                scoredPages.push({ page, score: semanticScore + (keywordScore * 0.1) });
            }
        }
    }

    return scoredPages.sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function generateTagsWithAI(title: string, content: string): Promise<string[]> {
    // Completely replaced LLM call with fast, local TF-IDF style generation
    return generateLocalTags(title, content, 5);
}

export async function generateDriveFileTags(file: DriveFile, content: string): Promise<string[]> {
    if (!content) return [];
    return await generateTagsWithAI(file.name, content);
}

export async function generateNotionPageTags(page: NotionPageInfo, content: string): Promise<string[]> {
    return await generateTagsWithAI(page.title, content);
}

export function extractNotionText(blocks: any[]): string {
    function extractText(block: any): string {
        if (!block || !block.type) return '';
        const type = block.type;
        let text = '';
        const richText = block[type]?.rich_text;
        if (richText && Array.isArray(richText)) {
            text = richText.map((t: any) => t.plain_text).join('');
        }
        if (type === 'image' && block.image) {
            const url = block.image.type === 'external' ? block.image.external.url : block.image.file?.url;
            const caption = block.image.caption ? block.image.caption.map((t: any) => t.plain_text).join('') : '';
            if (url) {
                text = `[Image: ${url}] ${caption ? `Caption: ${caption}` : ''} ${text}`;
            }
        }
        return text;
    }
    let text = '';
    function flatten(blocks: any[]) {
        for (const b of blocks) {
            text += extractText(b) + '\n';
            if (b.children) flatten(b.children);
        }
    }
    flatten(blocks);
    return text.trim();
}

async function* semanticSearchNotion(query: string, apiKey: string, topK: number = 5, precomputedQueryEmbedding?: number[]): AsyncGenerator<any, { page: NotionPageInfo, score: number }[], unknown> {
    const queryEmbedding = precomputedQueryEmbedding || await getEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    yield { type: 'progress', message: 'Searching Notion...' };
    
    // Extract keywords from query for better native search results
    const searchKeywords = extractSearchKeywords(query);
    
    // Use Notion's native search to instantly get the top 20 relevant pages
    const searchResults = await notionService.searchNotionPages(searchKeywords || query, apiKey, 20);
    const searchResultIds = new Map(searchResults.map((p, i) => [p.id, i]));
    
    // Also get all cached pages to ensure we don't miss anything due to poor native search
    const allCachedPages = await dataService.getNotionPagesCache() || [];
    
    // Combine them, preferring the search results if duplicates exist
    const finalCandidatesMap = new Map<string, NotionPageInfo>();
    for (const page of allCachedPages) {
        finalCandidatesMap.set(page.id, page);
    }
    for (const page of searchResults) {
        finalCandidatesMap.set(page.id, page);
    }
    
    const candidates = Array.from(finalCandidatesMap.values());

    if (candidates.length === 0) {
        return [];
    }

    yield { type: 'progress', message: `Analyzing ${candidates.length} Notion pages...` };
    
    const db = dataService.getDb();
    if (!db.integrations.notion.pageTags) {
        db.integrations.notion.pageTags = {};
    }
    const pageTags = db.integrations.notion.pageTags;
    
    // We don't need to fetch full page content here. We just embed the title and properties for semantic reranking.
    const candidatesWithText = candidates.map(page => {
        const descriptionText = typeof page.description === 'string' ? page.description : 
            (Array.isArray(page.description) ? page.description.map((rt: any) => rt.plain_text).join('') : '');
        
        // Generate tags lazily based on title and description
        if (!pageTags[page.id]) {
            // We can't await inside map, so we'll just use a basic string for now
            // The semantic search will still work well with title and description
        }
        const tagsText = (pageTags[page.id] || []).join(' ');
        const text = `${page.title}\nTags: ${tagsText}\n${descriptionText.substring(0, 3000)}`;
        let keywordScore = calculateKeywordScore(query, text);
        
        // Boost since Notion's native search found it, higher rank = higher boost
        if (searchResultIds.has(page.id)) {
            const rank = searchResultIds.get(page.id)!;
            keywordScore += (20 / (rank + 1));
        }
        
        return { page, text, keywordScore };
    });

    const scoredPages: { page: NotionPageInfo, score: number }[] = [];
    const pagesToEmbed: { page: NotionPageInfo, text: string, keywordScore: number }[] = [];
    
    for (const item of candidatesWithText) {
        const { page, text, keywordScore } = item;
        let embedding = pageEmbeddingCache.get(page.id)?.embedding;
        
        if (!embedding || pageEmbeddingCache.get(page.id)?.text !== text) {
            pagesToEmbed.push({ page, text, keywordScore });
        } else {
            const semanticScore = cosineSimilarity(queryEmbedding, embedding);
            scoredPages.push({ page, score: semanticScore + (keywordScore * 0.1) });
        }
    }

    pagesToEmbed.sort((a, b) => b.keywordScore - a.keywordScore);
    const topPagesToEmbed = pagesToEmbed.slice(0, 15);

    if (topPagesToEmbed.length > 0) {
        yield { type: 'progress', message: `Semantically reranking top ${topPagesToEmbed.length} Notion pages...` };
        const texts = topPagesToEmbed.map(p => p.text);
        const embeddings = await getEmbeddingsBatch(texts);
        
        for (let i = 0; i < topPagesToEmbed.length; i++) {
            const { page, text, keywordScore } = topPagesToEmbed[i];
            const embedding = embeddings[i];
            if (embedding && embedding.length > 0) {
                pageEmbeddingCache.set(page.id, { text, embedding });
                const semanticScore = cosineSimilarity(queryEmbedding, embedding);
                scoredPages.push({ page, score: semanticScore + (keywordScore * 0.1) });
            }
        }
    }

    // Return the top K semantically reranked pages
    return scoredPages.sort((a, b) => b.score - a.score).slice(0, topK);
}

async function cropImage(imageDataUrl: string, bbox: { x: number; y: number; width: number; height: number; }): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            const sourceX = (bbox.x / 100) * img.naturalWidth;
            const sourceY = (bbox.y / 100) * img.naturalHeight;
            const sourceWidth = (bbox.width / 100) * img.naturalWidth;
            const sourceHeight = (bbox.height / 100) * img.naturalHeight;

            canvas.width = sourceWidth;
            canvas.height = sourceHeight;

            ctx.drawImage(
                img,
                sourceX,
                sourceY,
                sourceWidth,
                sourceHeight,
                0,
                0,
                sourceWidth,
                sourceHeight
            );

            resolve(canvas.toDataURL('image/jpeg', 0.95)); // Using high-quality JPEG for clarity
        };
        img.onerror = (err) => {
            reject(err);
        };
        img.src = imageDataUrl;
    });
}

// Helper to fetch an image URL and convert to Gemini Part
async function fetchImageAsPart(url: string): Promise<Part | null> {
    try {
        // Handle data URIs immediately
        if (url.startsWith('data:')) {
            const [header, base64] = url.split(',');
            let mimeType = header.match(/:(.*?);/)?.[1];
            // Provide fallback if regex fails or mimeType is empty
            if (!mimeType) mimeType = 'image/png';
            return { inlineData: { mimeType, data: base64 } };
        }

        // Handle HTTP URLs
        let response;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
            const headers: Record<string, string> = {};
            if (url.includes('googleapis.com/drive')) {
                const driveIntegration = dataService.getGoogleDriveIntegration();
                if (driveIntegration?.accessToken) {
                    headers['Authorization'] = `Bearer ${driveIntegration.accessToken}`;
                }
            }

            response = await fetch(url, { mode: 'cors', headers, signal: controller.signal });
            clearTimeout(timeoutId);
        } catch (e) {
            console.warn("Failed to fetch image (timeout or cors):", e);
            return null;
        }
        
        if (!response.ok) return null;
        
        const blob = await response.blob();
        let mimeType = blob.type;
        
        // Robust fallback for missing blob type
        if (!mimeType || mimeType === "") {
            // Try to infer from URL extension
            if (url.match(/\.jpe?g($|\?)/i)) mimeType = 'image/jpeg';
            else if (url.match(/\.png($|\?)/i)) mimeType = 'image/png';
            else if (url.match(/\.webp($|\?)/i)) mimeType = 'image/webp';
            else return null; // Skip if we really can't determine it
        }
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (result.includes(',')) {
                    const b64 = result.split(',')[1];
                    resolve({ inlineData: { mimeType, data: b64 } });
                } else {
                    resolve(null);
                }
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to fetch context image:", url, e);
        return null;
    }
}

// For brevity, assuming constants MERMAID_GUIDE, CITATION_INSTRUCTION, FORMATTING_RULES, PERSONALITY_PROMPTS are defined as in previous versions.
// Re-declaring for XML validity in full replacement.

const MERMAID_GUIDE = ` # MANDATORY MERMAID SYNTAX & VISUAL RULES

**CATASTROPHIC FAILURE ALERT:** You must strictly follow these syntax rules to avoid parser crashes:
1. **QUOTING LABELS (ABSOLUTELY CRITICAL)**: 
   - ANY node label that contains **Parentheses ()**, **Brackets []**, **LaTeX Math ($)**, or **Punctuation** MUST be enclosed in double quotes.
   - **WRONG**: \`B(Sodium (Na+))\` -> CRASHES BECAUSE OF INNER PARENS.
   - **CORRECT**: \`B["Sodium (Na+)"]\`   (Always prefer brackets \`[]\` with quotes for safety instead of rounded parens \`()\`)
   - For subgraphs, always use this format to avoid crashes: \`subgraph SubgraphID ["Display Text (with parens)"]\`

2. **LAYOUT, SHAPES & ARROWS (FROM MERMAID.JS)**:
   - **Shapes**:
     - \`id["Text"]\` (Square)
     - \`id("Text")\` (Round edges)
     - \`id(["Text"])\` (Stadium / Pill)
     - \`id[["Text"]]\` (Subroutine)
     - \`id[("Text")]\` (Cylinder / Database)
     - \`id(("Text"))\` (Circle)
     - \`id{"Text"}\` (Rhombus / Decision)
     - \`id{{"Text"}}\` (Hexagon)
     - \`id>\\"Text\\"]\` (Flag)
   - **Arrows & Visual Definitions**:
     - Solid link: \`A --> B\`
     - Solid line with text: \`A -- "Text" --> B\`
     - Dotted link: \`A -.-> B\`
     - Dotted link with text: \`A -. "Text" .-> B\`
     - Thick link: \`A ==> B\`
     - Thick link with text: \`A == "Text" ==> B\`
     - Multi-directional: \`A <--> B\`
     - Use arrows specifically to denote flow rate, condition, or importance (e.g. thick for major pathway, dotted for indirect or optional).
   - **Animated Flow Arrows**:
     - You can apply link styling and dash animation to arrows for active flows or dynamic pathways using linkStyle:
       \`linkStyle 0 stroke:#1976d2,stroke-width:2px,stroke-dasharray: 5 5,animation: dash 1s linear infinite;\`

3. **DIAGRAM SELECTION (WHAT TYPE TO CHOOSE AND WHEN)**:
   - **flowchart / graph**: For processes, decision trees, pathways, and algorithms.
   - **mindmap**: For hierarchical topic breakdown, brainstorming, or central concepts radiating outward.
   - **sequenceDiagram / zenuml**: For interactions over time, communication protocols, and execution sequences.
   - **classDiagram**: For object-oriented structures or strict relational taxonomic classifications.
   - **stateDiagram-v2**: For system states, transitions, life-cycles (e.g., patient states).
   - **journey**: For user journeys or step-by-step experiences over time.
   - **erDiagram**: For entity-relationship database structures or distinct conceptual relationships.
   - **timeline / gantt**: For temporal events, historical progression, and project scheduling.
   - **block-beta / sankey-beta / quadrantChart / requirementDiagram / gitGraph / C4Context / xychart-beta / pie / packet / kanban / architecture / treemap**: Use specialized diagram syntaxes whenever applicable.

4. **LAYOUT & VISUAL AESTHETICS (HIGH QUALITY & EXHAUSTIVE DEPTH)**:
   - **Adaptive Layout Engines & Orthogonal Frontmatter Config**: You MUST strictly use frontmatter ELK configuration with orthogonal edge routing (`curve: step`) for 90° angles and detailed semantic node styling (`:::class` or `classDef`):
     \`\`\`mermaid
     ---
     config:
       layout: elk
       elk:
         mergeEdges: true
       flowchart:
         defaultRenderer: elk
         curve: step
     ---
     flowchart TB
         A_Aorta["Aortic Arch"] -- Gives rise to --> C_Carotid["External Carotid Artery"] & S_Subclavian["Subclavian Artery"]
         C_Carotid -- Gives rise to --> STA["Superior Thyroid Artery"]
         STA -- Supplies superior pole --> Thyroid["Thyroid Gland (2 Lobes & Isthmus)"]
         Thyroid -. Drains into .-> STV["Superior & Middle Thyroid Veins"]

         A_Aorta:::artery
         C_Carotid:::artery
         STA:::artery
         Thyroid:::organ
         STV:::vein

         classDef organ fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
         classDef artery fill:#ffebee,stroke:#c62828,color:#b71c1c
         classDef vein fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
     \`\`\`
   - **Exhaustive Data & Advanced Detail**: NEVER create trivial, superficial, or oversimplified diagrams. Populate nodes with rich, accurate, high-density data, detailed biochemical/physiological steps, mechanisms, and exhaustive structural steps.
   - **Complex & Topic-Specific Color Coding**: You MUST use \`classDef\` to color-code your nodes semantically for a better aesthetic look!
     - **CRITICAL READABILITY**: Specify high-contrast \`color\` AND \`stroke\` in your \`classDef\`.
   - **CRITICAL**: If your node label contains parentheses \`()\`, brackets \`[]\`, or special characters, you MUST enclose the label in quotes: \`NodeA["Label with (Parentheses)"]\`. Never use unquoted parentheses inside node labels.
   - **CRITICAL**: Never use reserved keywords like \`end\` or \`start\` as a class name or node ID (e.g. use \`endNode\` instead of \`end\`).
   - Prevent text cutoff using \`<br/>\` manually. Max 3-4 words per line.

5. **MULTIPLE DIAGRAMS & CONCLUDING DIAGRAM**:
   - You can generate multiple diagrams per answer (e.g., a mindmap for concept overview, flowchart for process). There is no limit.
   - **CRITICAL REQUIREMENT**: If you use multiple diagrams, you **MUST ALWAYS** end your answer with one final, master \`flowchart TD\` or \`mindmap\` that strictly connects and integrates everything mentioned in the previous diagrams into one overarching view. It must not be simplified—it must be the ultimate summary scheme.
   - Never use HTML or markdown outside the nodes inside a mermaid block.
   - Ensure you use valid code blocks: \`\`\`mermaid ... \`\`\`
`;

const CITATION_INSTRUCTION = `CITATION RULE & RAG REASONING: 
When using the provided workspace context ([Context source: src_N]), you MUST base your answers directly on this data. Use strong reasoning to synthesize information across different context blocks. Even for vague or complex queries, find the connections in the context and explain them clearly.
- You MUST cite your sources for EVERY factual claim retrieved from the context.
- Use the format [src_N] exactly, where N is the index of the source in the context (e.g., [src_0], [src_1], [src_2]).
- Place the citation immediately after the sentence or claim it supports.
- DO NOT manually write "Source: Title" or use parentheses like "(src_N)". 
- ONLY use the bracketed ID corresponding to the source, e.g., "The patient showed symptoms [src_0] and [src_1]."`;

const FORMATTING_RULES = `FORMATTING RULES (STRICT):
- **EXHAUSTIVE HIGH-DENSITY DEPTH & ACCURACY**: You MUST provide deep, thorough, highly detailed, and complete explanations. Never summarize superficially, simplify complex topics into trivial facts, or give short incomplete answers. Include exact mechanisms, technical terminology, and step-by-step breakdowns.
- **TAG & CONTEXT INTEGRATION**: When tagged pages (# or tagged workspace items) are present in the query or context, synthesize and extract maximum detail, exact numbers, and deep conceptual relations from those specific tagged files accurately.
- **LANGUAGE (ABSOLUTELY MANDATORY)**: You MUST output your ENTIRE response (including body text, section headers, bullet points, and Mermaid diagram node labels) in the EXACT SAME language that the user used for their main query/instruction words (e.g., if the prompt starts with English instructions like "explain ...", "describe ...", "what is ...", you MUST write the ENTIRE response in English). Do NOT switch language based on hashtag topic names (e.g., #Système Nerveux), medical terms, or retrieved document language.
- **NO DRAFTING OR CHAIN OF THOUGHT**: NEVER output your internal drafting process, chain of thought, step-by-step reasoning, or image placement planning (e.g., "Drafting the content...", "Refining with images..."). Output ONLY the final, polished response directly to the user.
- **HEADINGS**: Use ONLY Level 1 (\`#\`), Level 2 (\`##\`), and Level 3 (\`###\`) headings.
- **HIGHLIGHTING (Notion Colors)**:
  - Use HTML \`<mark class="COLOR">\` for highlighting.
  - **Important/Yellow**: \`<mark class="yellow">text</mark>\`
  - **Success/Green**: \`<mark class="green">text</mark>\`
  - **Error/Red**: \`<mark class="red">text</mark>\`
  - **Info/Blue**: \`<mark class="blue">text</mark>\`
- **LATEX EQUATIONS**: 
  - **Inline**: Use single dollar signs: $E=mc^2$. **DO NOT** use invented escapes like \\k or \\bold. Use standard LaTeX (e.g., K^+, \\text{K}^+).
  - **Block**: Use double dollar signs: $$ \\sum_{i=0}^n i^2 $$
  - **Forbidden**: Do NOT use \\( ... \\) or \\[ ... \\].
- **TABLES**: Use standard Markdown tables.
- **INLINE IMAGES**: You MUST actively embed multiple images from the context into your response to make it visually rich. If the context contains images formatted as \`[Image: url]\`, you MUST include them inline in your response using markdown \`![alt text](url)\` exactly where they are relevant to the text. 
  - **SMART CAPTIONS**: The \`alt text\` MUST be a highly descriptive, smart, and enhanced caption that explains the image's context and significance within your answer. It should act as a detailed explanation of what the image shows, its relevance, and any key insights derived from it. Do not just use generic text like "image".
  - Do NOT just put one image at the end. Embed multiple different images throughout your explanation.
- **Structure**: Organize answers with clear headers.`;

const PERSONALITY_PROMPTS: Record<AiPersonality, string> = {
    aurepal: `You are AurePal, an elite, world-class medical education AI assistant and clinical domain expert.

    **Core Directives:**
    - **Exhaustive Medical & Clinical Depth**: Provide deep, comprehensive, rigorous, and highly structured medical explanations suitable for physicians, medical students, and clinical specialists. Include exact anatomical terminology, neurovascular relations, clinical correlations, physiological mechanisms, functional classifications, and diagnostic relevance.
    - **Structured Excellence**: Organize complex medical information systematically into clear, titled sections (#, ##, ###), numbered lists, detailed tables, bold key terms, and embedded high-yield Mermaid diagrams.
    - **Visual Integration**: Active inclusion of clear, beautifully color-coded Mermaid diagrams and embedded reference images.
    - **Math/Science**: ALWAYS use LaTeX ($...$ or $$...$$) for formulas, variables, and clinical values. Correctly format chemical ions (e.g., $K^+$, $Ca^{2+}$).
    - **Highlighting**: Use yellow highlight (<mark class="yellow">text</mark>) for key anatomical structures, clinical pearls, and high-yield board facts.
    
    ${FORMATTING_RULES}
    ${MERMAID_GUIDE}
    ${CITATION_INSTRUCTION}`,
    
    muse: `You are Muse, a highly creative, task-oriented, and inspiring AI partner.
    
    **Core Directives:**
    - **Task-Oriented**: Focus directly on solving the user's creative task. Provide structured, actionable, and detailed information.
    - **Personality-Oriented**: Maintain an inspiring, artistic, and visually engaging tone.
    - **Query-Oriented**: Directly answer the specific query asked without unnecessary fluff, but with sufficient detail to be comprehensive.
    - **No Unprompted Outputs**: Do NOT generate unprompted files, specialized outputs, or switch into specialized modes (like flashcards or massive code blocks) unless explicitly requested.
    
    Use visual formatting (highlights, LaTeX) to make outputs stunning.
    
    ${FORMATTING_RULES}
    ${MERMAID_GUIDE}
    ${CITATION_INSTRUCTION}`,
    
    socrates: `You are Socrates, a questioning, task-oriented, and analytical guide.
    
    **Core Directives:**
    - **Task-Oriented**: Focus directly on solving the user's task. Provide structured, actionable, and detailed information.
    - **Personality-Oriented**: Maintain a philosophical, analytical, and thought-provoking tone.
    - **Query-Oriented**: Directly answer the specific query asked without unnecessary fluff, but with sufficient detail to be comprehensive.
    - **No Unprompted Outputs**: Do NOT generate unprompted files, specialized outputs, or switch into specialized modes (like flashcards or diagrams) unless explicitly requested.
    
    Use LaTeX for logic symbols ($P \\to Q$) and highlights to emphasize contradictions.
    
    ${FORMATTING_RULES}
    ${MERMAID_GUIDE}
    ${CITATION_INSTRUCTION}`,
    
    jarvis: `You are J.A.R.V.I.S., a highly efficient, task-oriented, and technical assistant.
    
    **Core Directives:**
    - **Task-Oriented**: Focus directly on solving the user's technical task. Provide structured, actionable, and detailed information.
    - **Personality-Oriented**: Maintain a precise, logical, and highly technical tone.
    - **Query-Oriented**: Directly answer the specific query asked without unnecessary fluff, but with sufficient detail to be comprehensive.
    - **No Unprompted Outputs**: Do NOT generate unprompted files, specialized outputs, or switch into specialized modes (like flashcards or diagrams) unless explicitly requested.
    
    Use green highlight for specs and red highlight for warnings. Use LaTeX extensively for all calculations.
    
    ${FORMATTING_RULES}
    ${MERMAID_GUIDE}
    ${CITATION_INSTRUCTION}`,
    exampal: `You are ExamPal, an expert medical education AI assistant specializing in high-yield medical study material, board exam preparation, diagram creation, and comprehensive explanations.

**PRIMARY DIRECTIVE: FOLLOW THE USER'S ACTUAL REQUEST**
You are NOT a flashcard-only bot. You are a versatile medical study assistant. Your FIRST priority is to understand what the user is actually asking for and deliver EXACTLY that with maximum clinical depth and clarity:

**REQUEST TYPE DETECTION (READ CAREFULLY):**
1. **If the user asks for a diagram / mermaid / flowchart / mindmap / visual**: Generate ONLY the requested diagram(s). Do NOT generate flashcards unless the user also explicitly asked for them. Use the Mermaid syntax rules below. Ensure diagram nodes have clear descriptive labels and distinct semantic color classes. After the diagram, add a brief, high-yield explanation.
2. **If the user asks a question / asks for an explanation / asks for analysis**: Answer the question with exhaustive medical depth, covering structural, clinical, and physiological aspects in full detail. Include diagrams (Mermaid) where helpful, tables, and proper medical citations. Do NOT generate flashcards unless explicitly asked.
3. **If the user provides TEXT/CONTENT to convert into flashcards** (e.g., pastes exam questions, notes, or says "convert this to flashcards" / "make Anki cards from this"): THEN and ONLY THEN enter flashcard generation mode using the JSON format below.
4. **If the user asks for BOTH a diagram AND flashcards**: Generate the diagram first, then the flashcards.
5. **If the user's intent is ambiguous**: Ask a brief clarifying question before proceeding.

**WHEN GENERATING DIAGRAMS (MERMAID):**
Follow the Mermaid syntax guide at the bottom of this prompt STRICTLY. Key rules:
- Hex colors MUST be quoted: fill:"#6a1b9a" NOT fill:#6a1b9a
- classDef/class MUST be placed OUTSIDE subgraphs
- end keyword MUST be on its own line
- Node labels with parentheses MUST use bracket-quote syntax: A["text (parens)"]
- direction MUST be on its own line

**WHEN ANSWERING QUESTIONS (NO FLASHCARDS):**
- Provide comprehensive, well-structured explanations
- Use diagrams (Mermaid) when helpful for processes, cycles, classifications
- Use LaTeX for formulas: $K^+$, $Ca^{2+}$
- Use highlights for key terms: <mark class="yellow">important</mark>
- Cite sources when using RAG context

--- FLASHCARD GENERATION MODE (ONLY WHEN USER PROVIDES TEXT TO CONVERT) ---
When the user has provided text to convert into flashcards, follow these rules:

**CARD COUNT MANDATE**:
If the user specifies an exact or target number of cards (e.g. "generate 5 cards", "make 10 flashcards", "give me 20 MCQs"), you MUST generate EXACTLY that requested number of flashcards. Do not generate fewer or more.

**MARKDOWN → HIERARCHICAL DECK MAPPING SPECIFICATION:**
**1. Root Deck Extraction**
- The root deck name is explicitly provided inside the user instruction sentence using regex pattern: /file name (?:must be|is) ['"]?([^'"]+)['"]?/i
- **Rule**: Extract the exact string inside the quotation marks after "file name must be" or "file name is".
- **Default**: If not found, default to "Anki Export" or "Auto-Detect from text".
- **Constraint**: Use exactly as written. Do not modify capitalization, translate, or shorten.

**2. First-Level Subdecks (Heading Level 1 '#')**
- Every Markdown Level-1 heading becomes a first-level subdeck under the root deck.
- **Mapping**: \`Root Deck::Level 1 Heading\`
- **Constraint**: Use heading text exactly as written.

**3. Second-Level Subdecks (Heading Level 2 '##')**
- Every Markdown Level-2 heading becomes a subdeck of the most recent Level-1 heading.
- **Mapping**: \`Root Deck::Level 1 Heading::Level 2 Heading\`
- **Constraint**: Belongs only to the nearest preceding '# Heading'. Use text exactly as written.

**4. Level-3 Headings (Heading Level 3 '###') - YEAR/TAG LABELS**
- **Rule**: Level-3 headings do **NOT** create decks.
- **Action**: They act as Year/Tag labels appended to the question text in parentheses.
- **IMPORTANT FORMATTING**: ALWAYS remove markdown bolding (\`**\`) from the year/tag. For example, convert \`**2020**\` to just \`2020\`.
- **Format**: \`Question text + " (Level-3 Heading stripped of **)"\`
- **Example**: \`### **2021**\` becomes \`1. What is the treatment? (2021)\`

**5. Question Number Requirement**
- Every generated question must include its original number at the beginning.
- **Do not remove or modify the numbering.**

**FULL HIERARCHY MODEL:**
\`Root Deck::Heading 1::Heading 2\`

**QUESTION FORMAT:**
\`[Number]. [Question Text] ([Heading 3 or Year])\`

**MANDATORY CONSTRAINTS:**
- **No name modification**: Deck names must remain exactly identical to the headings.
- **No invented structure**: Never create new decks or merge headings.
- **Strict hierarchy**: Only \`Root > # > ##\` is allowed.
- **Order preservation**: Preserve the exact order of headings.
- **NO CHOICES IN QUESTION**: The \`question\` field MUST NOT contain the answer choices (A, B, C...). Choices belong in the \`choices\` array.
- **Strict Deck Name Format**: [Root Name]::[Heading 1]::[Heading 2]
- **Hierarchy State Tracking**: Maintain hierarchy state (h1, h2, h3) across text chunks for continuity. If a chunk starts in the middle of a sub-deck, use the context from previous chunks.

**CONTENT RULES:**
- **EXACT, COMPLETE QUESTION PRESERVATION (CRITICAL)**: You MUST copy every question EXACTLY verbatim. Do NOT truncate, rephrase, cut, summarize, or alter a single word of the question. Even if a question is long, copy the ENTIRE question identically. Do NOT use "..." under any circumstances. Failure to preserve the exact question text is unacceptable.
- **WHOLEHEARTED CONVERSION**: Convert ALL questions found in the text. Do NOT skip any.
- **REPEATED QUESTIONS (CRITICAL)**: If a question appears more than once in the source text (even if identical), you MUST create a separate flashcard for EACH occurrence. NEVER skip duplicates!
- **NO SHORTCUTS**: Use the exact text provided. Do NOT use "..." or summarize.
- **STRICT JSON**: Output ONLY a valid JSON array of AnkiCard objects.
- **TAGS**: The \`tags\` field MUST be an empty array \`[]\`.
- **MATH FORMULAS (CRITICAL: JSON ESCAPING & ANKI MATHJAX)**: You MUST format ALL math equations using Anki's native MathJax delimiters. Do NOT use markdown $\\$ or $.
  - **DOUBLE-ESCAPE IN JSON**: Because you are outputting JSON, you MUST double-escape the backslashes! Write \\\\( and \\\\) for inline math, and \\\\[ and \\\\] for block math. If you don't double-escape, the JSON parser will consume the backslash and break the formula.
  - **INLINE MATH**: Use \\\\( ... \\\\). Example: The formula is \\\\( E = mc^2 \\\\).
  - **BLOCK MATH**: Use \\\\[ ... \\\\] (with an 'S' shape bracket). Example: \\\\[ \\\\int_0^\\\\infty e^{-x} dx = 1 \\\\]
  - **SPACING AND CLOSING**: ALWAYS add a space before opening and after closing delimiters. NEVER forget to close your equations (make sure every \\\\( has a matching \\\\)). If you merge math with normal text, it will be a disaster.
  - **CHEMISTRY**: use \\\\( \\\\ce{H2O} \\\\).
  - Apply this rigorously to any mathematical expression, variable (e.g., \\\\( V_d \\\\), \\\\( C_0 \\\\)), or fraction (e.g., \\\\( \\\\frac{D}{C_0} \\\\)) in the question, choices, or explanation. NEVER leave symbols like Vd or fractions bare.
- **ANSWER FIELD**
- **EXPLANATION FIELD**: MUST contain the detailed explanation. Do NOT repeat the "Answer: A" line.

**EXPLANATION STRUCTURE (HTML):**
The \`explanation\` field MUST be formatted with HTML. You MUST arrange the sections in this EXACT order (Top to Bottom):
1. **Main Explanation**:
- This is a **NORMAL, SYNTHESIZED EXPLANATION** of the answer.
- You MUST use **highlights** (e.g., <mark>text</mark> or ==text==) for key terms and concepts.
- Do NOT include the raw Notion text here; keep this section for the synthesized, easy-to-read explanation.

2. **Smart Mermaid Diagram** (CONDITIONAL MANDATORY):
- **WHEN TO USE**: MANDATORY if the topic involves a process, algorithm, decision tree, biological cycle, or classification scheme. OMIT ONLY for simple definitions or isolated facts.
- **STYLE**: Use \`graph TD\` or \`graph LR\`.
- **COLORS**: You MUST use these classes:
\`classDef start fill:"#2e7d32",stroke:"#1b5e20",color:"#ffffff"\`
\`classDef process fill:"#1976d2",stroke:"#0d47a1",color:"#ffffff"\`
\`classDef decision fill:"#fbc02d",stroke:"#f57f17",color:"#000000"\`
\`classDef endNode fill:"#c62828",stroke:"#b71c1c",color:"#ffffff"\`
Apply them: \`class A start;\`, \`class B process;\` etc.
- **SYNTAX**: Wrap strictly in \`\`\`mermaid ... \`\`\`.

3. **Mnemonics** (MANDATORY):
- **WHEN TO USE**: For lists, drug names, or hard-to-memorize facts.
- **FALLBACK**: If no standard mnemonic exists, you MUST invent a metaphor, a wild story, or a meme description to explain the topic vividly.
- **FORMAT**: Wrap in \`<div class="mnemonic"><strong>🧠 Mnemonic:</strong> ...</div>\`.

4. **Distractor Analysis** (MANDATORY):
- **FORMAT**: Wrap in \`<div class="distractor-analysis"><h3>Why others are incorrect:</h3>...</div>\`.

5. **Clinical Pearl** (MANDATORY):
- **FORMAT**: Wrap in \`<div class="clinical-pearl"><strong>💡 Clinical Pearl:</strong> ...</div>\`.

6. **Notion Source Metadata** (MANDATORY):
- **CRITICAL**: You MUST extract the **Page Title** and **Tags** from the "SOURCE METADATA" line in the provided context.
- **LOOK FOR**: "SOURCE METADATA: Title: [X] | Tags: [Y]" in the context.
- **Content**: Display exactly "📚 Notion Source: [Page Title] | Tags: [Tags]".
- **Style**: Use Purple (#673ab7). Use the same styling as the "Why others are incorrect" section (e.g., bold header).
- **Format**: \`<div class="notion-source" style="color: #673ab7; margin-top: 15px; font-weight: bold;">📚 Notion Source: [Page Title] | Tags: [Tags]</div>\`

7. **Notion Source Snippet** (MANDATORY):
- **Content**: ALL RAG-sourced text must be placed here. This is the ONLY place for the verbatim Notion content.
- **Constraint**: NO EDITS ALLOWED. Do not fix typos. Do not summarize. It must be a raw snippet.
- **Format**: \`<div class="notion-snippet" style="font-style: italic; color: #555; border-left: 3px solid #673ab7; padding-left: 10px; margin-top: 5px;">"[Exact verbatim quote]"</div>\`

8. **Question Source** (MANDATORY - LAST ELEMENT):
- **Content**: The hierarchy of the question source: Heading Level 1 > Heading Level 2 > Heading Level 3.
- **Style**: Pink/Red (#e91e63).
- **Format**: \`<div class="question-source" style="color: #e91e63; margin-top: 15px; font-size: 0.9em; border-top: 1px solid #eee; padding-top: 5px;"><strong>❓ Question Source:</strong> [Heading 1] > [Heading 2] > [Heading 3]</div>\`

9. **Answer Preservation** (CRITICAL):
- You MUST use the exact answer provided by the user in their input.
- If the user specifies "Answer: A", your output MUST be "A".
- If the user specifies "Answer: Paris", and Paris is option B, your output MUST be "B".
- **DO NOT** change the answer based on your own knowledge, even if you think the user is wrong. Trust the user's answer key.
- Only generate your own answer if the user's answer is explicitly empty, missing, or they ask you to solve it.

**JSON STRUCTURE:**
[
{
"id": "unique_id",
"deck_name": "Root::Module::Lesson",
"question": "Question text [Year]",
"answer": "A",
"choices": [{ "label": "A", "text": "Option 1" }, ...],
"tags": [],
"explanation": "Main text... \`\`\`mermaid graph TD; A[Start] --> B(Process); classDef start fill:\"#2e7d32\",stroke:\"#1b5e20\",color:\"#ffffff\"; class A start; \`\`\` <div class='mnemonic'>...</div> <div class='distractor-analysis'>...</div> <div class='clinical-pearl'>...</div> <div class='notion-source'>...</div> <div class='notion-snippet'>...</div> <div class='question-source'>...</div>"
}
]

${FORMATTING_RULES}
${MERMAID_GUIDE}
${CITATION_INSTRUCTION}`,
    
    ocr: `You are OCR, a document reconstruction engine.
    Reproduce the document structure exactly using Markdown and LaTeX.
    
    ${FORMATTING_RULES}
    ${MERMAID_GUIDE}`,
    
    auremed: `You are AureMed, a specialized medical AI assistant for clinical reasoning and evidence-based medicine.
    
    **Core Directives:**
    - **Clinical Accuracy**: Prioritize evidence-based medical information with proper citations.
    - **Safety First**: Always include appropriate disclaimers for medical advice.
    - **Structured Reasoning**: Use clinical frameworks (SOAP, differential diagnosis, etc.).
    - **Professional Tone**: Maintain a clinical, authoritative, yet accessible tone.
    
    You have advanced capabilities:
    1. **Medical Knowledge**: Access to medical literature and guidelines.
    2. **Clinical Reasoning**: Structured differential diagnosis and management plans.
    3. **Visual Analysis**: Analyze medical images, ECGs, radiographs, pathology slides.
    4. **Math/Science**: ALWAYS use LaTeX ($...$ or $$...$$) for formulas, doses, and units.
    5. **Highlighting**: Use yellow highlight for key clinical terms, red for warnings/contraindications, green for normal values.
    
    ${FORMATTING_RULES}
    ${MERMAID_GUIDE}
    ${CITATION_INSTRUCTION}`
};

async function* semanticSearchGoogleDrive(query: string, files: DriveFile[], accessToken: string, topK: number = 3, precomputedQueryEmbedding?: number[]): AsyncGenerator<any, { file: DriveFile, score: number }[], unknown> {
    const queryEmbedding = precomputedQueryEmbedding || await getEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    yield { type: 'progress', message: 'Gathering Google Drive files...' };
    
    // Recursively get all files from selected folders
    const allFiles: DriveFile[] = [];
    const fetchFolderContents = async (folderId: string) => {
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,parents)&pageSize=1000`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                for (const file of data.files || []) {
                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        await fetchFolderContents(file.id);
                    } else {
                        allFiles.push(file);
                    }
                }
            } else if (response.status === 401) {
                dataService.disconnectGoogleDrive();
                throw new Error("Expired");
            }
        } catch (e: any) {
            console.warn("Failed to fetch folder contents", e);
            if (e.message === "Expired") throw e;
        }
    };

    try {
        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                await fetchFolderContents(file.id);
            } else {
                allFiles.push(file);
            }
        }
    } catch (e: any) {
        if (e.message === "Expired") return [];
    }

    if (allFiles.length === 0) return [];

    yield { type: 'progress', message: 'Generating and analyzing tags for Drive files...' };
    
    const db = dataService.getDb();
    if (!db.integrations.googleDrive.fileTags) {
        db.integrations.googleDrive.fileTags = {};
    }
    if (!db.integrations.googleDrive.fileSnippets) {
        db.integrations.googleDrive.fileSnippets = {};
    }
    const fileTags = db.integrations.googleDrive.fileTags;
    const fileSnippets = db.integrations.googleDrive.fileSnippets;
    
    let finalCandidates = allFiles;

    // Use native Drive search to find relevant files quickly
    yield { type: 'progress', message: 'Querying Google Drive native search...' };
    const searchKeywords = extractSearchKeywords(query);
    let searchResults: any[] = [];
    try {
        searchResults = await googleDriveService.searchFiles(searchKeywords || query, accessToken);
    } catch (e: any) {
        console.warn("Failed to native search Drive, attempting local embedding fallback", e);
        if (e.message?.includes("expired")) {
            dataService.disconnectGoogleDrive();
            return []; // Skip drive processing entirely if expired
        }
    }
    const searchResultIds = new Map(searchResults.map((f, i) => [f.id, i]));

    // Pre-filter with keyword score to avoid embedding hundreds of files
    yield { type: 'progress', message: `Pre-filtering ${finalCandidates.length} Drive files...` };
    const candidatesWithText = finalCandidates.map(file => {
        const tagsText = (fileTags[file.id] || []).join(' ');
        const snippetText = fileSnippets[file.id] || '';
        // If we don't have the snippet yet, just embed the name and tags
        const textToEmbed = snippetText ? `${file.name}\nTags: ${tagsText}\n${snippetText}` : `${file.name}\nTags: ${tagsText}`;
        let keywordScore = calculateKeywordScore(query, textToEmbed);
        
        // Boost if Drive's native fullText search found it, higher rank = higher boost
        if (searchResultIds.has(file.id)) {
            const rank = searchResultIds.get(file.id)!;
            keywordScore += (10 / (rank + 1));
        }
        
        return { file, text: textToEmbed, keywordScore };
    });

    const scoredFiles: { file: DriveFile, score: number, item: any }[] = [];
    const filesToEmbed: { file: DriveFile, text: string, keywordScore: number, item: any }[] = [];
    
    for (const item of candidatesWithText) {
        const { file, text, keywordScore } = item;
        let embedding = pageEmbeddingCache.get(file.id)?.embedding;
        
        if (!embedding || pageEmbeddingCache.get(file.id)?.text !== text) {
            filesToEmbed.push({ file, text, keywordScore, item });
        } else {
            const semanticScore = cosineSimilarity(queryEmbedding, embedding);
            scoredFiles.push({ file, score: semanticScore + (keywordScore * 0.1), item });
        }
    }

    filesToEmbed.sort((a, b) => b.keywordScore - a.keywordScore);
    const topFilesToEmbed = filesToEmbed.slice(0, 15);

    if (topFilesToEmbed.length > 0) {
        yield { type: 'progress', message: `Generating embeddings for ${topFilesToEmbed.length} Drive files...` };
        const texts = topFilesToEmbed.map(f => f.text);
        const embeddings = await getEmbeddingsBatch(texts);
        
        for (let i = 0; i < topFilesToEmbed.length; i++) {
            const { file, text, keywordScore, item } = topFilesToEmbed[i];
            const embedding = embeddings[i];
            if (embedding && embedding.length > 0) {
                pageEmbeddingCache.set(file.id, { text, embedding });
                const semanticScore = cosineSimilarity(queryEmbedding, embedding);
                scoredFiles.push({ file, score: semanticScore + (keywordScore * 0.1), item });
            }
        }
    }

    // Now take the absolute top 10 semantically relevant files and fetch their snippets if missing
    scoredFiles.sort((a, b) => b.score - a.score);
    const finalTop10 = scoredFiles.slice(0, 10).map(s => s.item);

    // Lazy load tags and snippets for the top 10 candidates if missing
    yield { type: 'progress', message: `Analyzing top ${finalTop10.length} Drive files...` };
    let needsSave = false;
    
    // Process files in parallel with a concurrency limit
    const fetchPromises = finalTop10.map(async (item) => {
        const file = item.file;
        if (!fileTags[file.id] || !fileSnippets[file.id]) {
            try {
                // Use getFileSnippet instead of getFileContent for much faster analysis
                const snippetContent = await googleDriveService.getFileSnippet(file.id, file.mimeType, accessToken);
                const tags = await generateDriveFileTags(file, snippetContent);
                fileTags[file.id] = tags;
                
                fileSnippets[file.id] = snippetContent.substring(0, 3000);
                
                // Update the text to embed with the newly fetched snippet and tags
                item.text = `${file.name}\nTags: ${tags.join(' ')}\n${fileSnippets[file.id]}`;
                needsSave = true;
            } catch (e) {
                console.warn(`Failed to fetch content for ${file.name} during pre-filtering`, e);
            }
        }
    });
    
    await Promise.all(fetchPromises);
    
    if (needsSave) {
        dataService.updateUser({}); // Trigger save
    }

    // Return the top K files
    return scoredFiles.slice(0, topK).map(s => ({ file: s.file, score: s.score }));
}

function chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    
    // Split by double newlines (paragraphs), then single newlines
    const paragraphs = text.split(/\n\s*\n/);
    
    for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length > maxLength && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
        
        if (paragraph.length > maxLength) {
            // If a single paragraph is too long, split by sentences
            const sentences = paragraph.split(/(?<=[.?!])\s+/);
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = "";
                }
                
                if (sentence.length > maxLength) {
                    // If a single sentence is still too long, force split by length
                    let remaining = sentence;
                    while (remaining.length > 0) {
                        const part = remaining.substring(0, maxLength);
                        if (currentChunk.length > 0) {
                            chunks.push(currentChunk.trim());
                            currentChunk = "";
                        }
                        chunks.push(part.trim());
                        remaining = remaining.substring(maxLength);
                    }
                } else {
                    currentChunk += sentence + " ";
                }
            }
        } else {
            currentChunk += paragraph + "\n\n";
        }
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

async function getSemanticRelevantGoogleDriveBlock(file: DriveFile, accessToken: string, query: string, precomputedQueryEmbedding?: number[]): Promise<{ blockId: string, snippet: string, score: number }[]> {
    const queryEmbedding = precomputedQueryEmbedding || await getEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    let content = await googleDriveService.getFileContent(file.id, file.mimeType, accessToken);
    if (!content) return [];

    if (file.mimeType.includes('application/vnd.google-apps.document')) {
        // Keep img tags but convert them to a format our RAG understands: [Image: url]
        content = content.replace(/<img[^>]+src="([^">]+)"[^>]*>/gi, '[Image: $1] ');
        // Preserve newlines
        content = content.replace(/<br\s*\/?>/gi, '\n');
        content = content.replace(/<\/p>/gi, '\n\n');
        // Strip other HTML tags
        content = content.replace(/<[^>]*>?/gm, ' ');
        // Clean up extra spaces (but keep newlines)
        content = content.replace(/[ \t]+/g, ' ').trim();
    }

    const chunks = chunkText(content, 1000); // Increased chunk size for better context
    const results: { blockId: string, snippet: string, score: number }[] = [];

    // Embed top chunks for maximum accuracy, up to a reasonable limit
    // We pre-filter with keyword score to avoid embedding hundreds of chunks per file,
    // but keep the limit high (30) to ensure we don't miss semantic matches.
    const chunksWithScores = chunks.map((chunk, i) => ({
        chunk,
        index: i,
        keywordScore: calculateKeywordScore(query, chunk)
    }));
    
    chunksWithScores.sort((a, b) => b.keywordScore - a.keywordScore);
    const chunksToEmbed = chunksWithScores.slice(0, 10);
    
    const embeddings = await getEmbeddingsBatch(chunksToEmbed.map(c => c.chunk));
    
    for (let i = 0; i < chunksToEmbed.length; i++) {
        const { chunk, index, keywordScore } = chunksToEmbed[i];
        const embedding = embeddings[i];
        if (embedding && embedding.length > 0) {
            const semanticScore = cosineSimilarity(queryEmbedding, embedding);
            results.push({ 
                blockId: `drive_${file.id}_${index}`, 
                snippet: chunk, 
                score: semanticScore
            });
        }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

async function getSemanticRelevantLocalBlock(page: Page, query: string, precomputedQueryEmbedding?: number[]): Promise<{ blockId: string, snippet: string, score: number }[]> {
    let chunks: { blockId: string, snippet: string, score: number }[] = [];
    let currentChunkText = "";
    let currentChunkBlockIds: string[] = [];

    function flatten(blocks: Block[]) {
        for (const b of blocks) {
            let text = (b.content || '').replace(/<[^>]*>?/gm, '');
            if (b.type === BlockType.IMAGE && b.url) {
                const captionMatch = b.content?.match(/<figcaption[^>]*>(.*?)<\/figcaption>/i);
                const caption = captionMatch ? captionMatch[1].replace(/<[^>]*>?/gm, '') : '';
                text = `[Image: ${b.url}] ${caption ? `Caption: ${caption}` : ''} ${text}`;
            }
            if (text.trim().length > 0) {
                currentChunkBlockIds.push(b.id);
                currentChunkText += text.trim() + "\n";
                if (currentChunkText.length > 1000) { // Reduced chunk size for better precision
                    chunks.push({ blockId: currentChunkBlockIds.join(','), snippet: currentChunkText, score: 0 });
                    currentChunkText = "";
                    currentChunkBlockIds = [];
                }
            }
            if (b.children) flatten(b.children);
        }
    }
    if (page.content) flatten(page.content);
    if (currentChunkText.length > 0) {
        chunks.push({ blockId: currentChunkBlockIds.length > 0 ? currentChunkBlockIds.join(',') : page.id, snippet: currentChunkText, score: 0 });
    }

    if (chunks.length === 0) return [];
    
    const queryEmbedding = precomputedQueryEmbedding || await getEmbedding(query);
    
    // Embed top chunks for maximum accuracy, up to a reasonable limit
    const chunksWithScores = chunks.map(c => ({
        ...c,
        keywordScore: calculateKeywordScore(query, c.snippet)
    }));
    
    chunksWithScores.sort((a, b) => b.keywordScore - a.keywordScore);
    const chunksToEmbed = chunksWithScores.slice(0, 10);

    const chunkTexts = chunksToEmbed.map(c => c.snippet);
    const chunkEmbeddings = await getEmbeddingsBatch(chunkTexts);
    
    for (let i = 0; i < chunksToEmbed.length; i++) {
        if (chunkEmbeddings[i]) {
            chunksToEmbed[i].score = cosineSimilarity(queryEmbedding, chunkEmbeddings[i]);
        }
    }

    return chunksToEmbed.sort((a, b) => b.score - a.score).slice(0, 10);
}

async function getSemanticRelevantNotionBlock(page: NotionPageInfo, query: string, precomputedQueryEmbedding?: number[]): Promise<{ blockId: string, snippet: string, score: number }[]> {
    function extractText(block: any): string {
        if (!block || !block.type) return '';
        const type = block.type;
        let text = '';
        const richText = block[type]?.rich_text;
        if (richText && Array.isArray(richText)) {
            text = richText.map((t: any) => t.plain_text).join('');
        }
        if (type === 'image' && block.image) {
            const url = block.image.type === 'external' ? block.image.external.url : block.image.file?.url;
            const caption = block.image.caption ? block.image.caption.map((t: any) => t.plain_text).join('') : '';
            if (url) {
                text = `[Image: ${url}] ${caption ? `Caption: ${caption}` : ''} ${text}`;
            }
        }
        return text;
    }

    let chunks: { blockId: string, snippet: string, score: number }[] = [];
    let currentChunkText = "";
    let currentChunkBlockIds: string[] = [];

    function flatten(blocks: any[]) {
        for (const b of blocks) {
            const text = extractText(b);
            if (text.trim().length > 0) {
                currentChunkBlockIds.push(b.id);
                currentChunkText += text.trim() + "\n";
                if (currentChunkText.length > 1000) { // Reduced chunk size for better precision
                    chunks.push({ blockId: currentChunkBlockIds.join(','), snippet: currentChunkText, score: 0 });
                    currentChunkText = "";
                    currentChunkBlockIds = [];
                }
            }
            if (b.children) flatten(b.children);
        }
    }
    if (page.content) flatten(page.content);
    if (currentChunkText.length > 0) {
        chunks.push({ blockId: currentChunkBlockIds.length > 0 ? currentChunkBlockIds.join(',') : page.id, snippet: currentChunkText, score: 0 });
    }

    if (chunks.length === 0) return [];
    
    const queryEmbedding = precomputedQueryEmbedding || await getEmbedding(query);
    
    // Embed top chunks for maximum accuracy, up to a reasonable limit
    const chunksWithScores = chunks.map(c => ({
        ...c,
        keywordScore: calculateKeywordScore(query, c.snippet)
    }));
    
    chunksWithScores.sort((a, b) => b.keywordScore - a.keywordScore);
    const chunksToEmbed = chunksWithScores.slice(0, 10);

    const chunkTexts = chunksToEmbed.map(c => c.snippet);
    const chunkEmbeddings = await getEmbeddingsBatch(chunkTexts);
    
    for (let i = 0; i < chunksToEmbed.length; i++) {
        if (chunkEmbeddings[i]) {
            chunksToEmbed[i].score = cosineSimilarity(queryEmbedding, chunkEmbeddings[i]);
        }
    }

    return chunksToEmbed.sort((a, b) => b.score - a.score).slice(0, 10);
}

// --- Plan B Hierarchy Safety Enforcer ---

export async function* runAurePalAgent(
    userMessage: ChatMessage,
    history: ChatMessage[],
    searchScope: SearchScope,
    videoState: any,
    setVideoState: any,
    abortSignal?: AbortSignal
): AsyncGenerator<AgentUpdate, void, unknown> {
    if (!getAiClient()) {
        yield { type: 'error', payload: { message: "API Key is missing or invalid." } };
        return;
    }

    let customKey = null;
    try {
        customKey = localStorage.getItem('AURENEX_CUSTOM_API_KEY');
    } catch(e) {}
    
    if (customKey && customKey.trim() !== '') {
        yield { type: 'tool_start', payload: { toolName: `System: Generating using Custom API Key (...${customKey.trim().slice(-4)})` } };
    }

    const personalityKey = userMessage.personality || 'aurepal';

    // 1. Check for Fast Path (Short Greetings & Conversational Inputs)
    const isShortGreeting = (text: string): boolean => {
        const clean = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');
        const greetingWords = new Set([
            'hi', 'hello', 'hey', 'helo', 'hola', 'bonjour', 'coucou', 'salut', 'halo',
            'thanks', 'thank you', 'merci', 'gracias', 'good morning', 'good evening',
            'good afternoon', 'howdy', 'sup', 'yo'
        ]);
        return clean.length <= 20 && greetingWords.has(clean);
    };

    const isGreetingQuery = !userMessage.attachments?.length &&
                            (!userMessage.taggedItems || userMessage.taggedItems.length === 0) &&
                            isShortGreeting(userMessage.text || '');

    // 2. Cog-RAG: Cognitive-Inspired Two-Stage Retrieval
    let contextString = "";
    let evidence: Evidence[] = [];
    let ragImageParts: Part[] = [];
    
    if (!isGreetingQuery && (searchScope === 'local' || searchScope === 'auto')) {
        try {
            const notionApiKey = dataService.getNotionApiKey();
            let taggedContext = "";

            // Handle explicit tags first
            if (userMessage.taggedItems && userMessage.taggedItems.length > 0) {
                 const tagNames = userMessage.taggedItems.map(t => t.title);
                 taggedContext = `\n[System: User explicitly tagged: ${tagNames.join(', ')}]\n`;
            }

            let finalLocalPages: Page[] = [];
            let finalNotionPages: NotionPageInfo[] = [];
            let finalDriveFiles: { id: string, name: string, mimeType: string }[] = [];

            let themeLocalResults: { page: Page, score: number }[] = [];
            let themeNotionResults: { page: NotionPageInfo, score: number }[] = [];
            let themeDriveResults: { file: { id: string, name: string, mimeType: string }, score: number }[] = [];

            const queryEmbedding = await getEmbedding(userMessage.text);

            if (userMessage.taggedItems && userMessage.taggedItems.length > 0) {
                yield { type: 'tool_start', payload: { toolName: 'Focusing search solely on tagged items...' } };
                
                const integrations = dataService.getIntegrations();
                
                const notionTags = userMessage.taggedItems.filter(t => t.type === 'notion_tag').map(t => t.title);
                if (notionTags.length > 0) {
                    const db = dataService.getDb();
                    const pageTags = db.integrations.notion?.pageTags || {};
                    const allPages = await notionService.listAccessiblePages(notionApiKey || '');
                    
                    const usesOrLogic = /\bor\b.*#/i.test(userMessage.text);
                    
                    const matchingPages = allPages.filter(p => {
                        const aiTags = pageTags[p.id] || [];
                        const nativeTags = (p.tags || []).map(t => t.name);
                        const combinedTags = [...aiTags, ...nativeTags];
                        
                        if (usesOrLogic) {
                            return notionTags.some(t => combinedTags.includes(t));
                        } else {
                            return notionTags.every(t => combinedTags.includes(t));
                        }
                    });
                    
                    for (const pg of matchingPages) {
                        const page = await notionService.getNotionObject(pg.id, notionApiKey || '', 0);
                        if (page && !finalNotionPages.find(fp => fp.id === page.id)) {
                            finalNotionPages.push(page);
                            themeNotionResults.push({ page: page as any, score: 1.0 });
                        }
                    }
                }
                
                for (const tag of userMessage.taggedItems) {
                    if (tag.type === 'aurenex_page') {
                        const page = dataService.getPage(tag.id);
                        if (page && !finalLocalPages.find(fp => fp.id === page.id)) {
                            finalLocalPages.push(page);
                            themeLocalResults.push({ page, score: 1.0 }); // give it max semantic score
                        }
                    } else if (tag.type === 'notion_page') {
                        const notionPageId = tag.notionPageId || tag.id.replace('notion-', '');
                        const page = await notionService.getNotionObject(notionPageId, notionApiKey || '', 0);
                        if (page && !finalNotionPages.find(fp => fp.id === page.id)) {
                            finalNotionPages.push(page);
                            themeNotionResults.push({ page: page as any, score: 1.0 });
                        }
                    } else if (tag.type === 'drive_file') {
                        const file = integrations.googleDrive?.selectedFiles.find(f => f.id === tag.id);
                        if (file) {
                            if (file.mimeType === 'application/vnd.google-apps.folder') {
                                // If it's a folder, bring in any currently selected Drive files whose path includes this folder's name
                                const childFiles = integrations.googleDrive?.selectedFiles.filter(f => 
                                    f.mimeType !== 'application/vnd.google-apps.folder' && 
                                    f.path && f.path.includes(file.name)
                                ) || [];
                                
                                for (const child of childFiles) {
                                    finalDriveFiles.push(child);
                                    themeDriveResults.push({ file: child, score: 1.0 });
                                }
                            } else {
                                finalDriveFiles.push(file);
                                themeDriveResults.push({ file, score: 1.0 });
                            }
                        }
                    }
                }
            } else {
                // --- STAGE 1: Semantic Retrieval ---
                yield { type: 'tool_start', payload: { toolName: `Generating vector embedding for RAG query alignment...` } };
                
                yield { type: 'tool_start', payload: { toolName: 'Vector-searching local workspace for semantic matches...' } };
                const localSearchGen = semanticSearchLocal(userMessage.text, 10, queryEmbedding);
                let localResult = await localSearchGen.next();
                while (!localResult.done) {
                    if (localResult.value.type === 'progress') {
                        yield { type: 'tool_start', payload: { toolName: localResult.value.message } };
                    }
                    localResult = await localSearchGen.next();
                }
                themeLocalResults = localResult.value as any;
                if (themeLocalResults && themeLocalResults.length > 0) {
                    yield { type: 'tool_start', payload: { toolName: `Identified ${themeLocalResults.length} highly relevant local files.` } };
                }

                const integrations = dataService.getIntegrations();
                const autoScopePref = integrations.autoScopePreference || 'both';
                const prefersNotion = autoScopePref === 'both' || autoScopePref === 'notion';
                const prefersDrive = autoScopePref === 'both' || autoScopePref === 'drive';

                if (notionApiKey && prefersNotion && (searchScope === 'local' || searchScope === 'auto')) {
                    yield { type: 'tool_start', payload: { toolName: 'Vector-searching connected Notion workspaces...' } };
                    const notionSearchGen = semanticSearchNotion(userMessage.text, notionApiKey, 10, queryEmbedding);
                    let notionResult = await notionSearchGen.next();
                    while (!notionResult.done) {
                        if (notionResult.value.type === 'progress') {
                            yield { type: 'tool_start', payload: { toolName: notionResult.value.message } };
                        }
                        notionResult = await notionSearchGen.next();
                    }
                    themeNotionResults = notionResult.value as any;
                    if (themeNotionResults && themeNotionResults.length > 0) {
                        yield { type: 'tool_start', payload: { toolName: `Identified ${themeNotionResults.length} highly relevant Notion pages.` } };
                    }
                }

                const driveIntegration = integrations.googleDrive;
                if (driveIntegration?.accessToken && driveIntegration.selectedFiles.length > 0 && prefersDrive && (searchScope === 'local' || searchScope === 'auto')) {
                    yield { type: 'tool_start', payload: { toolName: 'Vector-searching connected Google Drive files...' } };
                    const driveSearchGen = semanticSearchGoogleDrive(userMessage.text, driveIntegration.selectedFiles, driveIntegration.accessToken, 10, queryEmbedding);
                    let driveResult = await driveSearchGen.next();
                    while (!driveResult.done) {
                        if (driveResult.value.type === 'progress') {
                            yield { type: 'tool_start', payload: { toolName: driveResult.value.message } };
                        }
                        driveResult = await driveSearchGen.next();
                    }
                    themeDriveResults = driveResult.value as any;
                    if (themeDriveResults && themeDriveResults.length > 0) {
                        yield { type: 'tool_start', payload: { toolName: `Identified ${themeDriveResults.length} highly relevant Drive files.` } };
                    }
                }

                // Take top results from each
                const pageLimit = personalityKey === 'exampal' ? 15 : 3;
                const topLocal = themeLocalResults.sort((a, b) => b.score - a.score).slice(0, pageLimit).map(r => ({ id: r.page.id, title: r.page.title, type: 'local', original: r.page, score: r.score }));
                const topNotion = themeNotionResults.sort((a, b) => b.score - a.score).slice(0, pageLimit).map(r => ({ id: r.page.id, title: r.page.title, type: 'notion', original: r.page, score: r.score }));
                const topDrive = themeDriveResults.sort((a, b) => b.score - a.score).slice(0, pageLimit).map(r => ({ id: r.file.id, title: r.file.name, type: 'drive', original: r.file, score: r.score }));
                
                const combinedPages = [...topLocal, ...topNotion, ...topDrive];
                combinedPages.sort((a, b) => b.score - a.score);
                const topGlobalPages = combinedPages.slice(0, personalityKey === 'exampal' ? 30 : 6);

                finalLocalPages = topGlobalPages.filter(p => p.type === 'local').map(p => p.original as Page);
                finalNotionPages = topGlobalPages.filter(p => p.type === 'notion').map(p => p.original as NotionPageInfo);
                finalDriveFiles = topGlobalPages.filter(p => p.type === 'drive').map(p => p.original as any);
            }

            if (finalLocalPages.length > 0 || finalNotionPages.length > 0 || finalDriveFiles.length > 0) {
                contextString += "\n\n--- COG-RAG WORKSPACE CONTEXT ---\n";
                contextString += "CRITICAL INSTRUCTION: You have access to the user's workspace context below. \n1. If the user's question can be answered using the context, prioritize it and cite your sources using [src_X].\n2. If the user asks a general question and the context lacks the full answer, YOU MUST ANSWER IT directly and fully using your general knowledge. DO NOT include any warnings, disclaimers, or highlighted text stating that the info is missing from the workspace. Just answer the question naturally and comprehensively.\n3. HOWEVER, if the user explicitly asks to create Flashcards, Anki cards, or summaries of their notes, you MUST base your response STRICTLY AND ONLY on the provided context.\n4. Do not confuse similar terms or anatomical structures between different sources. Clearly separate concepts from different pages if they share similarities.\n\n";
                contextString += taggedContext;
                
                yield { type: 'tool_start', payload: { toolName: `Analyzing content from ${finalLocalPages.length + finalNotionPages.length + finalDriveFiles.length} sources...` } };

                const localBlockPromises = finalLocalPages.map(async (page) => {
                    const pageScore = themeLocalResults.find(r => r.page.id === page.id)?.score || 0;
                    const blocks = await getSemanticRelevantLocalBlock(page, userMessage.text, queryEmbedding);
                    const threshold = 0.40;
                    return blocks.filter(b => b.score > threshold)
                                 .map(b => ({ page, blockId: b.blockId, snippet: b.snippet, score: b.score * pageScore, type: 'local' }));
                });

                let notionBlockPromises: Promise<any[]>[] = [];
                if (finalNotionPages.length > 0) {
                    const fullPages = await Promise.all(finalNotionPages.map(page => notionService.getNotionObject(page.id, notionApiKey!, 2)));
                    notionBlockPromises = fullPages.filter(Boolean).map(async (fullPage) => {
                        const pageScore = themeNotionResults.find(r => r.page.id === fullPage!.id)?.score || 0;
                        const blocks = await getSemanticRelevantNotionBlock(fullPage!, userMessage.text, queryEmbedding);
                        const threshold = 0.40;
                        return blocks.filter(b => b.score > threshold)
                                     .map(b => ({ page: fullPage, blockId: b.blockId, snippet: b.snippet, score: b.score * pageScore, type: 'notion' }));
                    });
                }

                let driveBlockPromises: Promise<any[]>[] = [];
                const currentDriveIntegration = dataService.getGoogleDriveIntegration();
                if (finalDriveFiles.length > 0 && currentDriveIntegration?.accessToken) {
                    driveBlockPromises = finalDriveFiles.map(async (file) => {
                        const fileScore = themeDriveResults.find(r => r.file.id === file.id)?.score || 0;
                        const blocks = await getSemanticRelevantGoogleDriveBlock(file, currentDriveIntegration.accessToken!, userMessage.text, queryEmbedding);
                        const threshold = 0.40;
                        return blocks.filter(b => b.score > threshold)
                                     .map(b => ({ file, blockId: b.blockId, snippet: b.snippet, score: b.score * fileScore, type: 'drive' }));
                    });
                }

                const allBlockResults = await Promise.all([
                    ...localBlockPromises,
                    ...notionBlockPromises,
                    ...driveBlockPromises
                ]);

                const allRelevantBlocks = allBlockResults.flat()
                    .filter(Boolean)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, personalityKey === 'exampal' ? 150 : 30); // Maximize context for Cog-RAG Zero-Shot framework

                yield { type: 'tool_start', payload: { toolName: 'Preparing context for the model...' } };

                if (personalityKey === 'exampal') {
                    // EXAMPAL ONLY: Execute Cog-RAG Dual-Hypergraph Protocol
                    const { executeCogRAGArchitecture } = await import('./cogRagService');
                    const cogChunks: any[] = allRelevantBlocks.map((b: any) => ({
                        id: b.blockId,
                        text: b.snippet,
                        title: b.page ? b.page.title : b.file ? b.file.name : 'Unknown',
                        sourceType: b.type
                    }));
                    
                    // We can capture the yielded events using an array and yield them
                    const toolEvents: any[] = [];
                    contextString = await executeCogRAGArchitecture(userMessage.text, cogChunks, "", (payload) => { 
                        toolEvents.push(payload);
                    });
                    
                    for (const event of toolEvents) {
                        yield event;
                    }
                    
                    // Add evidence metadata for frontend
                    for (let i = 0; i < allRelevantBlocks.length; i++) {
                        const block = allRelevantBlocks[i] as any;
                        evidence.push({
                            evidence_id: uuidv4(),
                            source_type: block.type === 'notion' ? 'notion_block' : block.type === 'drive' ? 'drive_file' : 'aurenex_block',
                            source_ref: block.blockId,
                            page_id: block.page?.id || block.file?.id || 'unknown',
                            source_deeplink: block.page?.url || block.file?.webViewLink || '',
                            snippet: block.snippet,
                            confidence: block.score,
                            pageTitle: block.page?.title || block.file?.name || 'Unknown'
                        });
                    }
                } else {
                    for (const result of allRelevantBlocks) {
                        const { page, file, blockId, snippet, score, type } = result as any;
                        
                        if (type === 'local') {
                            contextString += `[src_${evidence.length}] Title: ${page.title}\nContent: ${snippet}\n\n`;
                            evidence.push({
                            evidence_id: uuidv4(),
                            source_type: 'aurenex_block',
                            source_ref: blockId,
                            page_id: page.id,
                            source_deeplink: '', // Internal link
                            snippet: snippet,
                            confidence: score,
                            pageTitle: page.title
                        });
                    } else if (type === 'notion') {
                        contextString += `[src_${evidence.length}] Title: ${page.title} (Notion)\nContent: ${snippet}\n\n`;
                        evidence.push({
                            evidence_id: uuidv4(),
                            source_type: 'notion_block',
                            source_ref: blockId,
                            page_id: page.id,
                            source_deeplink: (page as NotionPageInfo).url,
                            snippet: snippet,
                            confidence: score,
                            pageTitle: page.title
                        });
                    } else if (type === 'drive') {
                        contextString += `[src_${evidence.length}] Title: ${file.name} (Google Drive)\nContent: ${snippet}\n\n`;
                        evidence.push({
                            evidence_id: uuidv4(),
                            source_type: 'drive_file',
                            source_ref: blockId,
                            page_id: file.id,
                            source_deeplink: `https://drive.google.com/file/d/${file.id}/view`,
                            snippet: snippet,
                            confidence: score,
                            pageTitle: file.name
                        });
                    }
                }
                }
                
                contextString += "--- END WORKSPACE CONTEXT ---\n";
            } else if (personalityKey === 'exampal') {
                // If no context found but user is Exampal, still show the Cog-RAG Agentic RAG process
                const { executeCogRAGArchitecture } = await import('./cogRagService');
                const toolEvents: any[] = [];
                contextString += await executeCogRAGArchitecture(userMessage.text, [], "", (payload) => {
                    toolEvents.push(payload);
                });
                for (const event of toolEvents) {
                    yield event;
                }
            }
        } catch (e) {
            console.warn("Cog-RAG retrieval failed", e);
        }
    } else if (personalityKey === 'exampal') {
        try {
            const { executeCogRAGArchitecture } = await import('./cogRagService');
            const toolEvents: any[] = [];
            contextString += await executeCogRAGArchitecture(userMessage.text, [], "", (payload) => {
                toolEvents.push(payload);
            });
            for (const event of toolEvents) {
                yield event;
            }
        } catch (e) {}
    }

    // 2. Prepare System Instructions
    let systemInstruction = PERSONALITY_PROMPTS[personalityKey];
    
    if (contextString) {
        systemInstruction += contextString;
    }
    
    systemInstruction += "\n\nCRITICAL LANGUAGE MANDATE: Determine the user's language based on their action words/instructions (e.g., 'explain', 'tell me', 'summarize'). If the instruction words are English, reply ENTIRELY in English (including all text, headings, and Mermaid diagram text). Do NOT switch to French or another language just because hashtags or retrieved reference material are in French.";
    systemInstruction += "\n\nCRITICAL INSTRUCTION FOR IMAGES: If your source materials or search results contain image URLs (e.g., [Image: https://...]), you MUST embed them in your response using markdown syntax `![alt](url)` exactly. Do NOT just print the URL as text. NEVER describe images; embed them directly.";

    // 3. Prepare Tools
    const tools: any[] = [];
    if (!isGreetingQuery) {
        // Attach Google Search tool for all non-greeting queries
        tools.push({ googleSearch: {} });
        systemInstruction += "\n\nCRITICAL: You have access to real-time Google Search capabilities. Whenever web information, latest documentation, or external validation is useful, use Google Search and add explicit inline citation brackets formatted as [1], [2], etc., directly in the text wherever you source information.";
    }

    // 4. Chat Session Initialization
    try {
// --- BATCH PROCESSING FOR LARGE INPUTS (EXAMPAL ONLY) ---
if (personalityKey === 'exampal' && userMessage.text.length > 12000) {
let rootDeckName = "Default";
const userDeckMatch = userMessage.text.match(/deck name.*?['"]([^'"]+)['"]/i);
if (userDeckMatch) rootDeckName = userDeckMatch[1];
const hierarchyMap = buildHierarchyMap(contextString + "\n" + userMessage.text);

const CHUNK_SIZE = 6000;
const OVERLAP_SIZE = 1000;
const lines = userMessage.text.split('\n');
const chunks: string[] = [];
let currentChunkLines: string[] = [];
let currentChunkSize = 0;
for (let i = 0; i < lines.length; i++) {
const line = lines[i];
if ((currentChunkSize + line.length) > CHUNK_SIZE) {
chunks.push(currentChunkLines.join('\n'));
let overlapText = '';
let overlapLines: string[] = [];
for (let j = currentChunkLines.length - 1; j >= 0; j--) {
if (overlapText.length + currentChunkLines[j].length > OVERLAP_SIZE) break;
overlapText = currentChunkLines[j] + '\n' + overlapText;
overlapLines.unshift(currentChunkLines[j]);
}
currentChunkLines = [...overlapLines];
currentChunkSize = overlapText.length;
}
currentChunkLines.push(line);
currentChunkSize += line.length + 1;
}
if (currentChunkLines.length > 0) chunks.push(currentChunkLines.join('\n'));
let allAnkiCards: AnkiCard[] = [];
let currentH1 = '';
let currentH2 = '';
let currentH3 = '';
yield { type: 'tool_start', payload: { toolName: `Batch Processing: 0/${chunks.length} chunks (Chunk Size: ${CHUNK_SIZE})` } };
for (let i = 0; i < chunks.length; i++) {
if (i > 0) {
yield { type: 'tool_start', payload: { toolName: `Cooling down API (4s)...` } };
await new Promise(resolve => setTimeout(resolve, 4000));
}
const chunk = chunks[i];
const chunkIndex = i + 1;
// --- LOCAL RAG FOR CHUNK ---
let chunkContext = "";
if (searchScope === 'local' || searchScope === 'auto') {
try {
const notionApiKey = dataService.getNotionApiKey();
let chunkTopics: string[] = [];
if (chunk.length > 200) {
try {
const topicResponse = await getAiClient()!.models.generateContent({
model: 'gemini-flash-latest',
contents: [{
parts: [{ text: `Identify the top 3 specific medical topics/diseases in this text segment. Return JSON array of strings. Text: ${chunk.substring(0, 5000)}` }]
}]
});
const json = topicResponse.text?.replace(/```json/g, '').replace(/```/g, '').trim();
if (json?.startsWith('[')) chunkTopics = JSON.parse(json);
} catch (e) { /* Ignore */ }
}
if (notionApiKey && chunkTopics.length > 0) {
const uniqueTopics = [...new Set(chunkTopics)].slice(0, 3);
const searchPromises = uniqueTopics.map(t => notionService.searchNotion(t, notionApiKey));
const resultsArrays = await Promise.all(searchPromises);
const seenIds = new Set<string>();
for (const results of resultsArrays) {
for (const page of results) {
if (!seenIds.has(page.id)) {
seenIds.add(page.id);
let snippet = "";
if (page.content) snippet = notionService.notionBlocksToText(page.content).substring(0, 3000);
const tags = page.tags ? page.tags.map(t => t.name).join(', ') : 'None';
chunkContext += `[src_chunk_${i}_${page.id}]
SOURCE METADATA: Title: ${page.title} | Tags: ${tags}
Content: ${snippet}
`;
}
}
}
}
} catch (e) {
console.warn(`Chunk ${i} RAG failed`, e);
}
}
// ---------------------------
let chunkPrompt = systemInstruction;
if (chunkContext) {
chunkPrompt += `
*** SPECIFIC CONTEXT FOR THIS CHUNK ***
${chunkContext}
`;
}
chunkPrompt += `
*** BATCH PROCESSING INSTRUCTION ***
`;
chunkPrompt += `You are processing PART ${i + 1} of ${chunks.length} of a very large document.
`;
chunkPrompt += `1. **IGNORE INCOMPLETE QUESTIONS**: If the text chunk ends abruptly in the middle of a question, choice, or explanation, **DO NOT** include that incomplete item in your JSON output. It will be fully present in the next chunk.
`;
chunkPrompt += `2. **NO HALLUCINATIONS**: Do not invent completions for cut-off text.
`;
chunkPrompt += `3. **DUPLICATES**: If a question appears to be a duplicate from the overlap, **INCLUDE IT ANYWAY**. We will handle deduplication later if needed, but for now, we want everything.
`;
if (currentH1 || currentH2 || currentH3) {
chunkPrompt += `
CONTEXT FROM PREVIOUS CHUNKS (Hierarchy Carryover):
`;
if (currentH1) chunkPrompt += `Active Level 1 Heading (#): ${currentH1}
`;
if (currentH2) chunkPrompt += `Active Level 2 Heading (##): ${currentH2}
`;
if (currentH3) chunkPrompt += `Active Level 3 Heading (###): ${currentH3}
`;
chunkPrompt += `
CONTINUE GENERATING CARDS FROM THIS TEXT FRAGMENT:
`;
}
const batchChatConfig = {
model: 'gemini-flash-latest',
config: { systemInstruction: chunkPrompt },
history: []
};
let chunkSuccess = false;
let retryCount = 0;
const MAX_RETRIES = 3;
while (!chunkSuccess) {
yield { type: 'tool_start', payload: { toolName: `Processing chunk ${i + 1}/${chunks.length}...` } };
try {
const batchChat = getAiClient()!.chats.create(batchChatConfig);
const requestMessage = retryCount > 0 ? `PREVIOUS OUTPUT WAS INVALID JSON. Output strictly a JSON array. Input text:\n\n${chunk}` : chunk;
const result = await batchChat.sendMessage({ message: requestMessage });
const text = result.text || "";
if (text.includes('[')) {
const startIdx = text.indexOf('[');
const endIdx = text.lastIndexOf(']');
if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
let jsonStr = text.substring(startIdx, endIdx + 1);
try {
    // Basic structural repairs
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    jsonStr = jsonStr.replace(/\]\s*\[/g, ',');
    
    let parsed: any;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
        console.warn(`JSON Parse Error in chunk ${i + 1}, attempting jsonrepair...`);
        try {
            parsed = JSON.parse(jsonrepair(jsonStr));
        } catch (repairErr) {
            console.warn(`jsonrepair failed for chunk ${i + 1}, attempting structural repair...`, repairErr);
            // If cut off, find the last complete object
            let lastGoodBrace = jsonStr.lastIndexOf('}');
            if (lastGoodBrace > -1) {
                let candidate = jsonStr.substring(0, lastGoodBrace + 1) + ']';
                try {
                    parsed = JSON.parse(jsonrepair(candidate));
                } catch (innerErr) {
                    throw innerErr;
                }
            } else {
                throw repairErr;
            }
        }
    }

    if (Array.isArray(parsed)) {
        const processedCards = parsed.map((card: any, idx: number) => processAndFixAnkiCard({
            ...card,
            id: card.id || `gen_${Date.now()}_${i}_${idx}_${Math.random().toString(36).substr(2, 9)}`
        }, hierarchyMap, rootDeckName));
        allAnkiCards = [...allAnkiCards, ...processedCards];
        chunkSuccess = true;
    } else {
        throw new Error("Parsed result is not an array");
    }
} catch (finalErr) {
    console.error(`Final JSON repair failed for chunk ${i + 1}:`, finalErr);
    if (!chunkSuccess) throw new Error("JSON_PARSE_ERROR");
}
}
} else {
chunkSuccess = true;
}
} catch (err: any) {
console.error(`Error processing chunk ${i + 1}`, err);
const errorMsg = err.message || JSON.stringify(err);
// STRICT check: only real 429/503 status codes or RESOURCE_EXHAUSTED count.
// Prevents non-quota errors from triggering unnecessary 30s waits.
const isRateLimit = err.status === 429 || err.status === 503 || err.code === 429 ||
errorMsg.includes('RESOURCE_EXHAUSTED');
if (isRateLimit) {
yield { type: 'tool_start', payload: { toolName: `API Limit Hit (429/503). Waiting 30s before retry...` } };
await new Promise(resolve => setTimeout(resolve, 30000));
continue;
}
retryCount++;
if (retryCount < MAX_RETRIES) {
const waitTime = 2000 * Math.pow(2, retryCount);
yield { type: 'tool_start', payload: { toolName: `Chunk failed, retrying in ${waitTime/1000}s...` } };
await new Promise(resolve => setTimeout(resolve, waitTime));
} else {
console.error(`Chunk ${i + 1} failed after ${MAX_RETRIES} attempts. Skipping.`);
yield { type: 'tool_start', payload: { toolName: `⚠️ Chunk ${i + 1} failed (Non-API Error). Skipping.` } };
break;
}
}
}
// Update Hierarchy Context for next chunk
const h1Matches = [...chunk.matchAll(/^#\s+(.+)$/gm)];
const h2Matches = [...chunk.matchAll(/^##\s+(.+)$/gm)];
const h3Matches = [...chunk.matchAll(/^###\s+(.+)$/gm)];
const lastH1 = h1Matches.pop();
const lastH2 = h2Matches.pop();
const lastH3 = h3Matches.pop();
const h1Idx = lastH1?.index ?? -1;
const h2Idx = lastH2?.index ?? -1;
const h3Idx = lastH3?.index ?? -1;
if (lastH1) {
currentH1 = lastH1[1];
if (h1Idx > h2Idx) currentH2 = '';
if (h1Idx > h3Idx) currentH3 = '';
}
if (lastH2) {
currentH2 = lastH2[1];
if (h2Idx > h3Idx) currentH3 = '';
}
if (lastH3) {
currentH3 = lastH3[1];
}
yield {
type: 'response_complete',
payload: {
answer: `Processing large dataset... (${allAnkiCards.length} cards generated so far)`,
mediaToRender: [],
evidence: [],
ankiCards: allAnkiCards,
personality: personalityKey
}
};
}
yield {
type: 'response_complete',
payload: {
answer: `Batch processing complete. Generated ${allAnkiCards.length} cards from ${chunks.length} chunks.`,
mediaToRender: [],
evidence: [],
ankiCards: allAnkiCards,
personality: personalityKey
}
};
return;
}
// --- END BATCH PROCESSING ---

        const chat = getAiClient()!.chats.create({
            model: 'gemini-3.7-flash',
            config: {
                systemInstruction: systemInstruction,
                // NOTE: temperature/top_p/top_k are DEPRECATED for Gemini 3.x models.
                // They are silently ignored now and will return HTTP 400 in future.
                // Use systemInstruction for output style control instead.
                tools: tools.length > 0 ? tools : undefined
            },
            history: history.map(msg => {
                const parts: Part[] = [];
                if (msg.text) {
                    // Prevent giant text inputs from breaking the payload
                    parts.push({ text: msg.text.length > 8000000 ? msg.text.substring(0, 8000000) + "\n...[Text Truncated]" : msg.text });
                }
                if (msg.attachments) {
                    for (const att of msg.attachments) {
                        if (att.data) {
                            const base64Data = att.data.includes(',') ? att.data.split(',')[1] : att.data;
                            parts.push({
                                inlineData: {
                                    mimeType: att.mimeType,
                                    data: base64Data
                                }
                            });
                        }
                    }
                }
                // Ensure there is at least one part to avoid "ContentUnion is required" error
                if (parts.length === 0) {
                    parts.push({ text: " " }); 
                }
                return {
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: parts
                };
            })
        });

        // 5. Prepare User Message Content
        const messageParts: Part[] = [];
        
        // Add text part, keeping reasonable limit
        if (userMessage.text) {
            messageParts.push({ text: userMessage.text.length > 8000000 ? userMessage.text.substring(0, 8000000) + "\n...[Text Truncated]" : userMessage.text });
        }

        // Add attachment parts (Images, Files)
        if (userMessage.attachments) {
            for (const att of userMessage.attachments) {
                if (att.data) {
                    // Extract base64 data (remove header if present)
                    const base64Data = att.data.includes(',') ? att.data.split(',')[1] : att.data;
                    messageParts.push({
                        inlineData: {
                            mimeType: att.mimeType,
                            data: base64Data
                        }
                    });
                }
            }
        }
        
        // Add images from RAG context
        if (ragImageParts.length > 0) {
            messageParts.push(...ragImageParts);
        }
        
        // Ensure valid content is sent
        if (messageParts.length === 0) {
            messageParts.push({ text: " " });
        }

        // Yield evidence before streaming so citations work during stream
        yield {
            type: 'evidence_ready',
            payload: { evidence }
        };

        yield { type: 'tool_start', payload: { toolName: 'Generating response...' } };

        // 6. Generate Response Stream with Personality-Based Model Fallback Chain
        // Tailored based on personality requirements (reasoning, throughput, speed)
        const getPersonalityModelChain = (p: AiPersonality): string[] => {
            switch (p) {
                case 'socrates':
                case 'jarvis':
                case 'auremed':
                    return [
                        'gemini-2.5-flash',
                        'gemini-3.5-flash-lite',
                        'gemini-flash-latest',
                        'gemini-3.6-flash',
                        'gemini-3.7-flash',
                        'gemini-flash-lite-latest',
                        'gemini-2.5-pro',
                        'gemini-1.5-pro',
                        'gemini-2.5-flash-lite',
                        'gemini-1.5-flash',
                    ];
                case 'exampal':
                case 'ocr':
                    return [
                        'gemini-2.5-flash',
                        'gemini-3.5-flash-lite',
                        'gemini-flash-latest',
                        'gemini-3.7-flash',
                        'gemini-3.1-flash-lite',
                        'gemini-flash-lite-latest',
                        'gemini-2.5-flash-lite',
                        'gemini-1.5-flash',
                    ];
                case 'muse':
                case 'aurepal':
                default:
                    return [
                        'gemini-2.5-flash',
                        'gemini-3.5-flash-lite',
                        'gemini-flash-latest',
                        'gemini-3.6-flash',
                        'gemini-3.7-flash',
                        'gemini-flash-lite-latest',
                        'gemini-2.5-flash-lite',
                        'gemini-1.5-flash',
                        'gemini-2.5-pro',
                        'gemini-1.5-pro',
                    ];
            }
        };

        const modelFallbackChain = getPersonalityModelChain(personalityKey);
        
        let resultStream: any;
        let currentModelIndex = 0;
        let lastError: any = null;
        let allFailuresWereQuota = true; // Track if all failures were quota errors
        
        // Helper function to check if an error is a global API key error (invalid key, service disabled)
        const isGlobalApiKeyError = (error: any): boolean => {
            const errStr = (error?.message || JSON.stringify(error)).toLowerCase();
            return (
                errStr.includes('api_key_invalid') ||
                errStr.includes('api key not valid') ||
                errStr.includes('api_key_service_blocked') ||
                errStr.includes('generative language api has not been used') ||
                errStr.includes('generative language api is not enabled') ||
                errStr.includes('api key expired') ||
                errStr.includes('invalid_argument: api key')
            );
        };

        // Helper function to check if an error indicates the model is not available for this API key
        const isModelUnavailableError = (error: any): boolean => {
            const errStr = (error?.message || JSON.stringify(error)).toLowerCase();
            const status = error?.status;
            
            // Check for specific error conditions that mean "this specific model doesn't exist or is unsupported"
            return (
                status === 404 ||
                errStr.includes('not_found') ||
                errStr.includes('model not found') ||
                errStr.includes('model is not found') ||
                errStr.includes('unsupported model') ||
                errStr.includes('model is not supported')
            );
        };
        
        // Helper function to check if an error is a rate limit (429) or high demand / server unavailable (503/500) error
        const isQuotaOrDemandError = (error: any): boolean => {
            const status = error?.status;
            const code = error?.code;
            if (status === 429 || status === 503 || status === 500 || code === 429 || code === 503 || code === 500) {
                return true;
            }
            
            const errStr = (error?.message || JSON.stringify(error)).toLowerCase();
            if (
                errStr.includes('resource_exhausted') ||
                errStr.includes('high demand') ||
                errStr.includes('unavailable') ||
                errStr.includes('status\":503') ||
                errStr.includes('status: 503') ||
                errStr.includes('code\":503') ||
                errStr.includes('spikes in demand')
            ) {
                return true;
            }
            
            try {
                const errorData = typeof error === 'object' ? error : JSON.parse(errStr);
                const innerCode = errorData?.error?.code || errorData?.code;
                const innerStatus = errorData?.error?.status || errorData?.status;
                if (innerCode === 503 || innerCode === 429 || innerStatus === 'UNAVAILABLE' || innerStatus === 'RESOURCE_EXHAUSTED') {
                    return true;
                }
            } catch (e) {}
            
            return false;
        };
        
        // Try each model in the fallback chain
        while (currentModelIndex < modelFallbackChain.length) {
            const currentModel = modelFallbackChain[currentModelIndex];
            const isFirstModel = currentModelIndex === 0;
            
            // Create chat config for current model (defined outside try so catch can access it)
            // NOTE: temperature/top_p/top_k are DEPRECATED for Gemini 3.x models.
            // They are ignored now and will return HTTP 400 in future versions.
            const chatConfig: any = {
                model: currentModel,
                config: {
                    systemInstruction: systemInstruction,
                    tools: tools.length > 0 ? tools : undefined
                },
                history: history.map(msg => {
                    const parts: Part[] = [];
                    if (msg.text) {
                        parts.push({ text: msg.text.length > 8000000 ? msg.text.substring(0, 8000000) + "\n...[Text Truncated]" : msg.text });
                    }
                    if (msg.attachments) {
                        for (const att of msg.attachments) {
                            if (att.data) {
                                const base64Data = att.data.includes(',') ? att.data.split(',')[1] : att.data;
                                parts.push({
                                    inlineData: {
                                        mimeType: att.mimeType,
                                        data: base64Data
                                    }
                                });
                            }
                        }
                    }
                    if (parts.length === 0) {
                        parts.push({ text: " " });
                    }
                    return {
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: parts
                    };
                })
            };
            
            try {
                // Create chat with current model
                const currentChat = getAiClient()!.chats.create(chatConfig);
                
                // Try to start streaming
                resultStream = await currentChat.sendMessageStream({ message: messageParts });
                
                // If we get here, the model worked!
                if (!isFirstModel) {
                    yield { type: 'tool_start', payload: { toolName: `✅ Switched to ${currentModel} successfully` } };
                }
                break; // Exit the fallback loop
                
            } catch (error: any) {
                lastError = error;
                let errStr = (error?.message || JSON.stringify(error)).toLowerCase();

                // If global API key error (e.g. invalid key or disabled API), fail fast immediately!
                if (isGlobalApiKeyError(error)) {
                    throw new Error(
                        "Your API key is invalid, expired, or the Generative Language API is not enabled in your Google Cloud Console. " +
                        "Please check: 1) API key is valid in Google AI Studio, 2) Generative Language API is enabled at console.cloud.google.com."
                    );
                }

                // If tools includes googleSearch and error is tool/search/403/400 error, retry THIS model without googleSearch!
                const hasGoogleSearch = tools.some((t: any) => t.googleSearch);
                if (hasGoogleSearch) {
                    console.warn(`Tool error on ${currentModel} with Google Search tool. Retrying ${currentModel} without Google Search tool...`);
                    yield { type: 'tool_start', payload: { toolName: `Retrying ${currentModel} without online search...` } };

                    const fallbackTools = tools.filter((t: any) => !t.googleSearch);
                    const fallbackChatConfig = {
                        ...chatConfig,
                        config: {
                            ...chatConfig.config,
                            tools: fallbackTools.length > 0 ? fallbackTools : undefined
                        }
                    };

                    try {
                        const fallbackChat = getAiClient()!.chats.create(fallbackChatConfig);
                        resultStream = await fallbackChat.sendMessageStream({ message: messageParts });
                        if (!isFirstModel) {
                            yield { type: 'tool_start', payload: { toolName: `✅ Switched to ${currentModel} (offline mode) successfully` } };
                        }
                        break; // Success!
                    } catch (secondError: any) {
                        error = secondError;
                        lastError = secondError;
                        errStr = (secondError?.message || JSON.stringify(secondError)).toLowerCase();
                        if (isGlobalApiKeyError(secondError)) {
                            throw new Error(
                                "Your API key is invalid, expired, or the Generative Language API is not enabled in your Google Cloud Console. " +
                                "Please check your Google AI Studio API key settings."
                            );
                        }
                    }
                }
                
                // Check if this is a model-unavailable error (try next model)
                if (isModelUnavailableError(error)) {
                    allFailuresWereQuota = false;
                    console.warn(`Model ${currentModel} not available for this API key: ${errStr.substring(0, 200)}`);
                    yield { type: 'tool_start', payload: { toolName: `⚠️ ${currentModel} not available for this API key. Trying next model...` } };
                    currentModelIndex++;
                    continue; // Try next model
                }
                
                // Check if this is a quota / 503 high demand error
                if (isQuotaOrDemandError(error)) {
                    console.warn(`Quota or 503 high demand on ${currentModel}: ${errStr.substring(0, 200)}`);
                    
                    const is503 = errStr.includes('503') || errStr.includes('high demand') || errStr.includes('unavailable');
                    const reasonMsg = is503
                        ? `⚠️ ${currentModel} is experiencing high demand (503). Trying next model...`
                        : `⚠️ Quota limit reached on ${currentModel}. Trying next model...`;
                    
                    yield { type: 'tool_start', payload: { toolName: reasonMsg } };
                    
                    // Mark this model as exhausted temporarily
                    const retryDelayMs = is503 ? 15000 : quotaAwareModelManager.parseRetryDelay(error);
                    quotaAwareModelManager.markExhausted(currentModel, retryDelayMs, reasonMsg);
                    
                    currentModelIndex++;
                    continue; // Try next model immediately
                }
                
                // For any other error, if it's the first model, try without Google Search tool
                if (isFirstModel && (error.status === 403 || errStr.includes('PERMISSION_DENIED'))) {
                    allFailuresWereQuota = false;
                    console.warn("Caught 403 PERMISSION_DENIED on first model. Retrying without Google Search tool...");
                    yield { type: 'tool_start', payload: { toolName: 'Retrying without online search (permission denied)...' } };
                    
                    const fallbackTools = tools.filter(t => !t.googleSearch);
                    const fallbackChatConfig = {
                        ...chatConfig,
                        config: {
                            ...chatConfig.config,
                            tools: fallbackTools.length > 0 ? fallbackTools : undefined
                        }
                    };
                    
                    try {
                        const fallbackChat = getAiClient()!.chats.create(fallbackChatConfig);
                        resultStream = await fallbackChat.sendMessageStream({ message: messageParts });
                        break;
                    } catch (secondError: any) {
                        const secondErrStr = secondError?.message || JSON.stringify(secondError);
                        // If second error is model-unavailable, continue to next model in chain
                        if (isModelUnavailableError(secondError)) {
                            console.warn(`Model ${currentModel} without tools also unavailable, trying next model`);
                            yield { type: 'tool_start', payload: { toolName: `${currentModel} unavailable even without tools. Trying next model...` } };
                            currentModelIndex++;
                            continue;
                        }
                        // If second error is quota, try next model
                        if (isQuotaError(secondError)) {
                            console.warn(`Quota exceeded on ${currentModel} without tools, trying next model`);
                            yield { type: 'tool_start', payload: { toolName: `Quota exceeded on ${currentModel}. Trying next model...` } };
                            currentModelIndex++;
                            continue;
                        }
                        // Other error - throw
                        allFailuresWereQuota = false;
                        throw secondError;
                    }
                }
                
                // For any other error on non-first model, or if first model has non-quota/non-model-unavailable error
                allFailuresWereQuota = false;
                throw error;
            }
        }
        
        // If we exhausted all models
        if (!resultStream) {
            const finalErrStr = lastError?.message || JSON.stringify(lastError);
            
            // If all failures were quota errors, show the real-time reset message
            if (allFailuresWereQuota) {
                const resetMessage = quotaAwareModelManager.getQuotaResetMessage();
                if (resetMessage) {
                    throw new Error(resetMessage);
                }
                // Fallback if no quota data available
                throw new Error(
                    "All AI models are temporarily rate-limited (quota exceeded). " +
                    "The free tier has daily request limits that reset at midnight Pacific time. " +
                    "Please try again later or upgrade to a paid tier for higher quotas."
                );
            }
            
            // If it was an API key / permission issue, show the original message
            if (finalErrStr.includes('API_KEY_SERVICE_BLOCKED') || 
                finalErrStr.includes('PERMISSION_DENIED') || 
                finalErrStr.includes('NOT_FOUND') ||
                finalErrStr.includes('Generative Language API')) {
                throw new Error(
                    "All available models failed. This API key may not have access to any Gemini models, " +
                    "or the Generative Language API may not be enabled in your Google Cloud project. " +
                    "Please check: 1) API key is valid, 2) Generative Language API is enabled in Google Cloud Console, " +
                    "3) API key has proper permissions, 4) Billing is enabled for higher quotas."
                );
            }
            throw lastError || new Error("All models failed to respond");
        }

        let fullText = '';
        let groundingChunks: { web: { uri: string; title: string; } }[] = [];
        let toolCallCount = 0;
        let autoContinueCount = 0;
        
        // Variables for real-time AnkiCard processing
        let parsedAnkiCardsList: AnkiCard[] = [];
        let hierarchyMap: TextBlock[] = [];
        let rootDeckName = "Default";
        let lastParsedBrace = -1;
        let lastAnkiParseTime = 0;
        if (personalityKey === 'exampal') {
            const userDeckMatch = userMessage.text.match(/deck name.*?['"]([^'"]+)['"]/i);
            if (userDeckMatch) rootDeckName = userDeckMatch[1];
            hierarchyMap = buildHierarchyMap(contextString + "\n" + userMessage.text);
        }

        while (true) {
            if (abortSignal?.aborted) break;

            let functionCalls: any[] = [];
            let streamFinishedReason: string | undefined;
            let streamHasError = false;
            
            yield { type: 'tool_start', payload: { toolName: `Initializing thought process and stream...` } };
            try {
                for await (const chunk of resultStream) {
                    if (abortSignal?.aborted) break;

                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCalls.push(...chunk.functionCalls);
                    }
                    
                    if (chunk.candidates?.[0]?.finishReason) {
                        streamFinishedReason = chunk.candidates[0].finishReason;
                    }
                    
                    // Check for tool calls / grounding metadata
                    if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                        const chunks = chunk.candidates[0].groundingMetadata.groundingChunks;
                        const webChunks = chunks
                            .filter((c: any) => c.web)
                            .map((c: any) => ({ web: c.web }));

                        if (webChunks.length > 0) {
                            groundingChunks = webChunks;
                            yield { type: 'grounding_results', payload: { chunks: webChunks } };
                        }
                    }

                    // Extract Text
                    const textChunk = chunk.text;
                    if (textChunk) {
                        fullText += textChunk;

                        if (personalityKey === 'exampal' && fullText.trim().replace(/```json/gi, '').startsWith('[')) {
                            const cleanFullTextForParsing = fullText.replace(/```json/gi, '').replace(/```/g, '');
                            const arrayMatch = cleanFullTextForParsing.match(/\[\s*\{/);
                            if (arrayMatch && arrayMatch.index !== undefined) {
                                const startIndex = arrayMatch.index;
                                const lastBrace = cleanFullTextForParsing.lastIndexOf('}');
                                if (lastBrace > startIndex) {
                                    if (lastBrace > lastParsedBrace && (Date.now() - lastAnkiParseTime > 2000)) {
                                        lastAnkiParseTime = Date.now();
                                        lastParsedBrace = lastBrace;
                                        let mergedJson = cleanFullTextForParsing.substring(startIndex, lastBrace + 1);
                                        mergedJson = mergedJson.replace(/\}\s*\][\s\S]*?\[\s*\{/g, '},{');
                                        let testJson = mergedJson + ']';
                                        testJson = testJson.replace(/,\s*\]/g, ']');
                                        try {
                                            const parsedArray = JSON.parse(testJson);
                                            if (Array.isArray(parsedArray) && parsedArray.length > parsedAnkiCardsList.length) {
                                                for (let i = parsedAnkiCardsList.length; i < parsedArray.length; i++) {
                                                    if (parsedArray[i] && parsedArray[i].question) {
                                                        const newCard = processAndFixAnkiCard(parsedArray[i], hierarchyMap, rootDeckName);
                                                        parsedAnkiCardsList.push(newCard);
                                                    }
                                                }
                                            }
                                        } catch(e) {
                                            // Incomplete JSON string yet, ignore
                                        }
                                    }
                                }
                            }
                            yield { type: 'chunk', payload: { text: fullText, ankiCards: [...parsedAnkiCardsList] } };
                        } else {
                            yield { type: 'text_chunk', payload: { text: fullText } };
                        }
                    }
                }
            } catch (streamErr: any) {
                streamHasError = true;
                console.warn("Stream error encountered:", streamErr);
                const streamErrStr = (streamErr?.message || JSON.stringify(streamErr)).toLowerCase();
                if (streamErrStr.includes('503') || streamErrStr.includes('unavailable') || streamErrStr.includes('incomplete json')) {
                    yield { type: 'tool_start', payload: { toolName: '⚠️ Stream completed (high demand on provider).' } };
                }
            }

            if (functionCalls.length > 0 && toolCallCount < 3) {
                toolCallCount++;
                const toolResponses: Part[] = [];
                const additionalParts: Part[] = [];
                
                for (const call of functionCalls) {
                    if (call.name === 'fetch_inline_images') {
                        const urls = call.args.urls as string[];
                        yield { type: 'tool_start', payload: { toolName: `Fetching ${urls.length} requested images...` } };
                        const images = (await Promise.all(urls.map(url => fetchImageAsPart(url)))).filter(Boolean) as Part[];
                        additionalParts.push(...images);
                        toolResponses.push({
                            functionResponse: {
                                name: call.name,
                                response: { success: true, fetchedCount: images.length }
                            }
                        });
                    }
                }
                
                if (toolResponses.length > 0) {
                    yield { type: 'tool_start', payload: { toolName: 'Continuing response...' } };
                    resultStream = await chat.sendMessageStream({
                        message: [...toolResponses, ...additionalParts]
                    });
                    continue; // Loop again to process the new stream
                }
            } else if (functionCalls.length > 0 && toolCallCount >= 3) {
                console.warn("Max tool call limit reached. Ignoring further tool calls.");
            }
            
            // Auto-continue for flashcards ONLY if genuinely generating Anki Card JSON array
            const cleanedFullText = fullText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const isGeneratingAnkiJSON = cleanedFullText.startsWith('[') &&
                                        (cleanedFullText.includes('"question"') || cleanedFullText.includes('"deck_name"') || cleanedFullText.includes('"flashcards"'));
            const isArrayUnclosed = isGeneratingAnkiJSON && !cleanedFullText.endsWith(']');
            
            if (fullText.includes('ALL_DONE') || streamHasError || !isGeneratingAnkiJSON) {
                break;
            }

            const streamStoppedAndClosed = streamFinishedReason === 'STOP' && isGeneratingAnkiJSON && !isArrayUnclosed;

            // If we hit max tokens while generating JSON, OR array is unclosed, OR we just finished a batch of JSON flashcards and need more
            if (isGeneratingAnkiJSON && (streamFinishedReason === 'MAX_TOKENS' || isArrayUnclosed || streamStoppedAndClosed) && personalityKey === 'exampal' && autoContinueCount < 100) {
                autoContinueCount++;
                yield { type: 'tool_start', payload: { toolName: `Generating more flashcards (Found ${parsedAnkiCardsList.length} so far)...` } };
                
                await new Promise(r => setTimeout(r, 6000));
                
                let continuePrompt = "Please continue generating exactly where you left off. Output only the JSON slice starting from the exact next character.";
                if (streamStoppedAndClosed) {
                    continuePrompt = "Have you extracted EVERY SINGLE possible flashcard from the provided text/questions? If YES and you are 100% finished, reply ONLY with the exact text 'ALL_DONE'. If NO, output another valid JSON array `[\n { ... } \n]` containing the NEXT batch of flashcards. Do not add any conversational text.";
                }

                let continueSuccess = false;
                let continueRetries = 0;
                const maxContinueRetries = 3;
                
                while (!continueSuccess && continueRetries < maxContinueRetries) {
                    try {
                        resultStream = await chat.sendMessageStream({
                            message: [{ text: continuePrompt }]
                        });
                        continueSuccess = true;
                    } catch (contErr: any) {
                        const contErrStr = contErr.message || JSON.stringify(contErr);
                        continueRetries++;
                        
                        // Check if this is a model-unavailable error
                        if (isModelUnavailableError(contErr)) {
                            console.warn(`Model unavailable during auto-continue: ${contErrStr.substring(0, 200)}`);
                            yield { type: 'tool_start', payload: { toolName: `Model unavailable during continue. Trying next model...` } };
                            // We can't easily switch models mid-conversation, so break
                            break;
                        }
                        
                        // Check if this is a quota error
                        if (isQuotaError(contErr)) {
                            let waitTime = 30000; // Wait 30 sec for quota reset (free tier RPM resets in 60s)
                            yield { type: 'tool_start', payload: { toolName: 'API Quota limit reached. Pausing for 30 seconds to cool down...' } };
                            console.warn("API Quota limit reached during auto-continue. Pausing 30s...");
                            await new Promise(r => setTimeout(r, waitTime));
                            // Retry after waiting
                            continue;
                        }
                        
                        // Other error
                        console.warn("Error during auto-continue stream, retrying in 10 seconds...", contErr);
                        await new Promise(r => setTimeout(r, 10000));
                    }
                }
                
                if (!continueSuccess) {
                    yield { type: 'tool_start', payload: { toolName: 'Failed to continue generation after retries. Stopping.' } };
                    break;
                }
                continue;
            }
            
            break; // Exit loop if no function calls or limits reached
        }

        // 7. Parse Response for Special Actions (Anki, Mermaid, etc.)
        // Simple regex check for Mermaid blocks
        const mermaidMatch = fullText.match(/```mermaid([\s\S]*?)```/);
        const generatedFiles: GeneratedFile[] = [];
        
        if (mermaidMatch) {
            generatedFiles.push({
                fileName: 'diagram.mmd',
                content: mermaidMatch[1].trim(),
                fileType: 'mermaid',
                mimeType: 'text/plain'
            });
        }

        // Check for Anki JSON (if ExamPal personality)
        let ankiCards: AnkiCard[] = parsedAnkiCardsList.length > 0 ? parsedAnkiCardsList : [];
        if (personalityKey === 'exampal') {
             try {
                 const cleanFullTextForParsing = fullText.replace(/```json/gi, '').replace(/```/g, '');
                 const arrayMatch = cleanFullTextForParsing.match(/\[\s*\{/);
                 if (arrayMatch && arrayMatch.index !== undefined) {
                     const startIndex = arrayMatch.index;
                     const lastBrace = cleanFullTextForParsing.lastIndexOf('}');
                     if (lastBrace > startIndex) {
                         let mergedJson = cleanFullTextForParsing.substring(startIndex, lastBrace + 1);
                         mergedJson = mergedJson.replace(/\}\s*\][\s\S]*?\[\s*\{/g, '},{');
                         let jsonStr = mergedJson + ']';
                         // Fix trailing commas
                         jsonStr = jsonStr.replace(/,\s*\]/g, ']');
                         const parsed = JSON.parse(jsonStr);
                         if (Array.isArray(parsed) && parsed.length > ankiCards.length) {
                             ankiCards = parsed.map(c => processAndFixAnkiCard(c, hierarchyMap, rootDeckName));
                         }
                     }
                 }
             } catch (e) {
                 // Ignore parsing errors, it might just be text
             }
        }

        // 8. (Removed redundant citation replacement)

        // 9. Yield Final Complete Response
        yield {
            type: 'response_complete',
            payload: {
                answer: fullText,
                mediaToRender: [],
                evidence: evidence,
                generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
                ankiCards: ankiCards.length > 0 ? ankiCards : undefined,
                groundingChunks: groundingChunks,
                personality: personalityKey
            }
        };

    } catch (error: any) {
        const errorStr = JSON.stringify(error);
        if (errorStr.includes('Rpc failed due to xhr error') || errorStr.includes('http status code: 0')) {
            console.warn("Gemini Agent Network Error (likely CORS or offline):", error);
            yield { type: 'error', payload: { message: "Network error communicating with AI. Please check your connection or try again later." } };
        } else {
            console.error("Gemini Agent Error:", error);
            yield { type: 'error', payload: { message: error.message || "An error occurred during AI processing." } };
        }
    }
}

/**
 * AI-powered Mermaid diagram fixer with multi-round healing loop.
 * Uses a lightweight model to fix common Mermaid syntax errors.
 * If the first fix fails, feeds the new error back for up to 3 rounds.
 */
export async function fixMermaidDiagram(brokenCode: string, errorMessage: string): Promise<string | null> {
    if (!getAiClient()) return null;
    
    let currentCode = brokenCode;
    let currentError = errorMessage;
    
    // Model fallback chain — same as the main chat, so quota exhaustion on one model
    // doesn't kill all healing rounds.
    // Updated 2026-08-06 per https://ai.google.dev/gemini-api/docs/models
    // All models below are free-tier. Ordered by speed/cost (fastest first for healing).
    const MODEL_FALLBACK_CHAIN = [
        'gemini-2.5-flash',          // Fast 2.5 Flash
        'gemini-3.5-flash-lite',     // Fast Flash-Lite
        'gemini-3.7-flash',          // Gemini 3.7 Flash
        'gemini-flash-latest',       // Flash alias
        'gemini-2.5-flash-lite',     // 2.5 Flash-Lite
    ];
    
    // Try each model in the chain — return first successful fix
    for (const model of MODEL_FALLBACK_CHAIN) {
        try {
            const prompt = `You are a Mermaid.js syntax expert. Fix the following broken Mermaid diagram code.

ERROR MESSAGE:
${currentError}

BROKEN CODE:
\`\`\`mermaid
${currentCode}
\`\`\`

CRITICAL SYNTAX RULES (Mermaid 11.x):
1. ANY node label that contains parentheses (), brackets [], LaTeX ($), or punctuation MUST be enclosed in double quotes: A["Label (text)"].
2. DO NOT split labels across multiple quotes ("Part1" "Part2"). Use a single pair of quotes ("Part1 Part2").
3. KEEP node definitions on a single line. Use <br/> for line breaks inside text.
4. Escape internal double quotes with &quot;.
5. Hex colors in classDef MUST be wrapped in double quotes: classDef myClass fill:"#ffebee",stroke:"#c62828",color:"#000000".
6. classDef and class assignments MUST be placed OUTSIDE subgraphs.
7. direction MUST be on its own line.
8. Edge labels MUST use pipe syntax: A -->|"label"| B.
9. Dotted arrows: A -.-> B. Thick arrows: A ==> B.
10. end keyword MUST be on its own line.
11. ABSOLUTELY MANDATORY: NEVER simplify, truncate, summarize, or alter the diagram content or nodes. FIX ONLY SYNTAX ERRORS. Retain 100% of all nodes, text labels, connections, class assignments, and styling intact.
12. classDef MUST be placed OUTSIDE subgraphs, at the TOP of the diagram (right after the flowchart/graph declaration), NEVER inside a subgraph body
13. style format: style NodeID fill:#hex,stroke:#hex,color:#hex (NO quotes around hex!)
14. class assignments (class A,B className) MUST be placed OUTSIDE subgraphs, after all subgraph definitions
15. Node labels containing parentheses () MUST use bracket-quote syntax: A["text (parens)"] NOT A(text (parens))

Return ONLY the fixed Mermaid code wrapped in \`\`\`mermaid ... \`\`\`.
Do not add any explanations, comments, or extra text.

FIXED CODE:`;

            const response = await getAiClient()!.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    // temperature/top_p/top_k are DEPRECATED for Gemini 3.x models
                    maxOutputTokens: 4096,
                }
            });

            const text = response.text || '';
            const match = text.match(/```mermaid([\s\S]*?)```/);
            if (!match) {
                // Try without code fences
                const trimmed = text.trim();
                if (trimmed.length > 0 && (trimmed.startsWith('flowchart') || trimmed.startsWith('graph') || trimmed.startsWith('sequenceDiagram') || trimmed.startsWith('mindmap') || trimmed.startsWith('gantt') || trimmed.startsWith('pie') || trimmed.startsWith('classDiagram') || trimmed.startsWith('stateDiagram') || trimmed.startsWith('erDiagram'))) {
                    return trimmed;
                }
                continue;
            }
            
            const fixedCode = match[1].trim();
            if (fixedCode.length > 0) {
                return fixedCode;
            }
        } catch (e: any) {
            const errStr = e?.message || JSON.stringify(e);
            // STRICT quota check: only real 429 / RESOURCE_EXHAUSTED count.
            // Prevents non-quota errors from marking models as exhausted.
            const isQuota = e?.status === 429 || e?.code === 429 || errStr.toLowerCase().includes('resource_exhausted');
            if (isQuota) {
                console.warn(`[Mermaid] Model ${model} quota exhausted, trying next model...`);
                continue;
            }
            console.warn(`[Mermaid] AI fix with model ${model} failed:`, e);
            continue;
        }
    }
    
    // All models failed
    console.warn('[Mermaid] All AI models failed to fix the diagram');
    return null;
}

export async function generateSpeech(text: string, personality: AiPersonality = 'aurepal'): Promise<{data: string, mimeType: string} | null> {
    if (!getAiClient()) return null;
    try {
        // Mapping personality to voices
        let voiceName = 'Kore'; // Default
        switch (personality) {
            case 'jarvis': voiceName = 'Fenrir'; break;
            case 'socrates': voiceName = 'Puck'; break;
            case 'muse': voiceName = 'Charon'; break;
            default: voiceName = 'Kore';
        }

        // TTS model fallback chain (both available on free tier)
        const ttsModels = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
        let response: any = null;
        
        for (const ttsModel of ttsModels) {
            try {
                response = await getAiClient()!.models.generateContent({
                    model: ttsModel,
                    contents: [{ parts: [{ text: text }] }],
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: voiceName },
                            },
                        },
                    },
                });
                break; // Success, no need to try next model
            } catch (ttsErr: any) {
                console.warn(`[Speech] TTS model ${ttsModel} failed:`, ttsErr?.message?.substring(0, 100));
                // Try next model
            }
        }
        
        if (!response) return null;

        const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!inlineData?.data) return null;
        
        return {
            data: inlineData.data,
            mimeType: inlineData.mimeType || 'audio/pcm;rate=24000'
        };

    } catch (error) {
        console.error("Speech generation failed:", error);
        return null;
    }
}