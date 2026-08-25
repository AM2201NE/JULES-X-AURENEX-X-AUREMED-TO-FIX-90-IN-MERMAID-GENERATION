import type { FormattedNotionResult, NotionPageInfo, NotionBlock, NotionTag, ImageBlock, VideoBlock, AudioBlock, FileBlock, RagContextPart, RichText, SyncedBlock } from '../types';
import { dataService } from './dataService';
import { get, set } from 'idb-keyval';
import { extractKeywords } from '../lib/utils';

// Local Proxy for Notion API (avoids CORS issues)
const LOCAL_PROXY_BASE = '/api/notion';

const NOTION_API_VERSION = '2022-06-28';

interface NotionSearchResult {
    id: string;
    url: string;
    properties: any;
    object: 'page' | 'database';
    icon: any;
    title?: RichText[];
    description?: RichText[];
    content?: NotionBlock[];
    last_edited_time?: string;
}

// --- In-memory Session Cache ---
const notionCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getFromCache<T>(key: string): T | null {
    const cached = notionCache.get(key);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data as T;
    }
    notionCache.delete(key); 
    return null;
}

function setToCache(key: string, data: any) {
    notionCache.set(key, { data, timestamp: Date.now() });
}

function formatNotionId(id: string): string {
    if (typeof id !== 'string') return '';
    let raw = id.trim();

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        return raw;
    }

    raw = raw.split('?')[0].split('#')[0];

    if (raw.includes('/')) {
        const parts = raw.split('/');
        raw = parts[parts.length - 1];
    }

    const hexMatch = raw.match(/([0-9a-fA-F]{32})$/);
    if (hexMatch) {
        raw = hexMatch[1];
    } else {
        raw = raw.replace(/^notion-/, '');
    }

    const cleaned = raw.replace(/-/g, '');
    if (cleaned.length !== 32) {
        return raw; 
    }
    
    return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
}


/**
 * Robust Fetching via Local Proxy.
 * All requests are routed through the local server to avoid CORS issues.
 */
export async function fetchWithRetry(endpoint: string, options: RequestInit, retries = 2, timeoutMs = 10000): Promise<Response> {
    let lastError: Error | undefined;

    // Construct the proxy URL
    // endpoint should be relative to Notion API base, e.g., '/users/me' or 'users/me'
    const cleanEndpoint = endpoint.replace(/^https:\/\/api\.notion\.com\/v1\//, '').replace(/^\//, '');
    const proxyUrl = `${LOCAL_PROXY_BASE}/${cleanEndpoint}`;
    
    const doFetch = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
        try {
            const res = await fetch(proxyUrl, {
                ...options,
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return res;
        } catch (e: any) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms`);
            }
            throw e;
        }
    };

    for (let i = 0; i < retries; i++) {
        try {
            const response = await doFetch();
            
            // Retry on server errors
            if (response.status === 429 || response.status >= 500) {
                console.warn(`Proxy returned ${response.status}. Retrying...`);
                if (i < retries - 1) {
                    const retryAfter = response.headers.get('Retry-After');
                    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, i);
                    await new Promise(res => setTimeout(res, waitTime));
                    continue;
                }
            }
            
            return response; 
        } catch (error) {
            const errMessage = error instanceof Error ? error.message : String(error);
            lastError = error instanceof Error ? error : new Error(errMessage);
            
            console.warn(`Fetch attempt ${i + 1} failed: ${errMessage}`);
            
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
            }
        }
    }
    
    throw lastError ?? new Error(`Network Error: Failed to fetch ${proxyUrl} after ${retries} attempts.`);
}


function extractTextFromRichText(richTextArray: any[]): string {
    if (!Array.isArray(richTextArray)) return '';
    return richTextArray.map(rt => rt.plain_text || '').join('');
}

function extractTags(properties: any): NotionTag[] {
    const tagsProp = Object.values(properties).find((p: any) => p.type === 'multi_select') as any;
    if (tagsProp && tagsProp.multi_select && Array.isArray(tagsProp.multi_select)) {
        return tagsProp.multi_select.map((tag: any) => ({
            id: tag.id,
            name: tag.name,
            color: tag.color,
        }));
    }
    return [];
}


function extractAllProperties(properties: any): string {
    if (!properties) return '';
    let result = '';
    for (const [key, value] of Object.entries(properties)) {
        const prop = value as any;
        if (prop.type === 'title') continue; // Handled by title
        let propValue = '';
        switch (prop.type) {
            case 'rich_text':
                propValue = extractTextFromRichText(prop.rich_text);
                break;
            case 'number':
                propValue = prop.number?.toString() || '';
                break;
            case 'select':
                propValue = prop.select?.name || '';
                break;
            case 'multi_select':
                propValue = prop.multi_select?.map((s: any) => s.name).join(', ') || '';
                break;
            case 'date':
                propValue = prop.date?.start ? `${prop.date.start}${prop.date.end ? ` to ${prop.date.end}` : ''}` : '';
                break;
            case 'checkbox':
                propValue = prop.checkbox ? 'Yes' : 'No';
                break;
            case 'url':
                propValue = prop.url || '';
                break;
            case 'email':
                propValue = prop.email || '';
                break;
            case 'phone_number':
                propValue = prop.phone_number || '';
                break;
            case 'formula':
                propValue = prop.formula?.string || prop.formula?.number?.toString() || prop.formula?.boolean?.toString() || '';
                break;
            case 'relation':
                propValue = prop.relation?.map((r: any) => r.id).join(', ') || ''; // IDs only, unfortunately
                break;
            case 'rollup':
                if (prop.rollup?.type === 'number') {
                    propValue = prop.rollup.number?.toString() || '';
                } else if (prop.rollup?.type === 'date') {
                    propValue = prop.rollup.date?.start ? `${prop.rollup.date.start}${prop.rollup.date.end ? ` to ${prop.rollup.date.end}` : ''}` : '';
                } else {
                    propValue = prop.rollup?.array?.map((a: any) => {
                        if (a.type === 'title' || a.type === 'rich_text') return extractTextFromRichText(a[a.type]);
                        if (a.type === 'select') return a.select?.name;
                        if (a.type === 'multi_select') return a.multi_select?.map((s: any) => s.name).join(', ');
                        return '';
                    }).filter(Boolean).join(', ') || '';
                }
                break;
            case 'people':
                propValue = prop.people?.map((p: any) => p.name || p.id).join(', ') || '';
                break;
            case 'files':
                propValue = prop.files?.map((f: any) => f.name).join(', ') || '';
                break;
            case 'status':
                propValue = prop.status?.name || '';
                break;
            default:
                propValue = '';
        }
        if (propValue) {
            result += `${key}: ${propValue}\n`;
        }
    }
    return result.trim();
}

function extractPageTitle(properties: any): string {
    const titleProp = Object.values(properties).find((p: any) => p.type === 'title') as any;
    if (titleProp) {
        return extractTextFromRichText(titleProp.title);
    }
    return 'Untitled';
}

function extractIcon(iconObj: any): NotionPageInfo['icon'] {
    if (!iconObj) return { type: null, value: null };
    switch (iconObj.type) {
        case 'emoji':
            return { type: 'emoji', value: iconObj.emoji };
        case 'file':
            return { type: 'file', value: iconObj.file.url };
        case 'external':
            return { type: 'external', value: iconObj.external.url };
        default:
            return { type: null, value: null };
    }
}

async function handleApiResponse(response: Response, context: string): Promise<any> {
    if (!response.ok) {
        let errorMessage = `Notion API Error (${context}): ${response.status} ${response.statusText}`;
        try {
            const errorData = await response.clone().json();
            errorMessage = errorData.message || errorMessage;
        } catch (e) {
            try {
                const textError = await response.text();
                if (textError) {
                    if (textError.includes('<!doctype html>') || textError.includes('<html')) {
                        errorMessage = `Proxy Error: Received HTML instead of JSON. The request likely failed to reach the Notion API. (Status: ${response.status})`;
                    } else {
                        errorMessage = textError;
                    }
                }
            } catch (textErr) {}
        }
        if (response.status === 401) throw new Error("Invalid Notion API key. Please check your credentials.");
        if (response.status === 429) throw new Error("Notion API rate limit exceeded. Please wait a moment.");
        throw new Error(errorMessage);
    }

    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
         throw new Error(`Proxy Error: Received HTML response from ${response.url}. The request likely failed to reach the Notion API.`);
    }

    try {
        return await response.json();
    } catch (error) {
        throw new Error(`Failed to parse Notion API response: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function notionBlocksToText(blocks: NotionBlock[], depth = 0): string {
    if (!blocks) return '';
    let text = '';
    const prefix = '  '.repeat(depth);
    let olCounter = 0;

    for (const block of blocks) {
        if (!block) continue;
        let blockText = ``;

        if (block.type === 'numbered_list_item') olCounter++;
        else olCounter = 0;

        switch (block.type) {
            case 'paragraph': blockText += extractTextFromRichText(block.paragraph.rich_text); break;
            case 'heading_1': blockText += '# ' + extractTextFromRichText(block.heading_1?.rich_text || []); break;
            case 'heading_2': blockText += '## ' + extractTextFromRichText(block.heading_2?.rich_text || []); break;
            case 'heading_3': blockText += '### ' + extractTextFromRichText(block.heading_3?.rich_text || []); break;
            case 'bulleted_list_item': blockText += '* ' + extractTextFromRichText(block.bulleted_list_item?.rich_text || []); break;
            case 'numbered_list_item': blockText += `${olCounter}. ` + extractTextFromRichText(block.numbered_list_item?.rich_text || []); break;
            case 'to_do': blockText += `[${block.to_do.checked ? 'x' : ' '}] ` + extractTextFromRichText(block.to_do.rich_text); break;
            case 'toggle': blockText += '> ' + extractTextFromRichText(block.toggle.rich_text); break;
            case 'quote': blockText += '“' + extractTextFromRichText(block.quote.rich_text) + '”'; break;
            case 'callout': blockText += `(Callout: ${block.callout.icon.type === 'emoji' ? block.callout.icon.emoji : 'icon'}) ` + extractTextFromRichText(block.callout.rich_text); break;
            case 'code': blockText += `\`\`\`${block.code.language}\n${extractTextFromRichText(block.code.rich_text)}\n\`\`\``; break;
            case 'child_page': blockText += `-> Page: ${block.child_page.title}`; break;
            case 'child_database': blockText += `-> DB: ${block.child_database.title}`; break;
            case 'bookmark': blockText += `Bookmark: ${block.bookmark.url}`; break;
            case 'link_preview': blockText += `Link: ${block.link_preview.url}`; break;
            case 'table': blockText += '(Table block content follows)'; break;
            case 'table_row': blockText += `| ${block.table_row.cells.map(cell => extractTextFromRichText(cell)).join(' | ')} |`; break;
            case 'divider': blockText += '---'; break;
            case 'image': case 'video': case 'audio': case 'file': blockText = `(Media Block: ${block.type})`; break;
        }
        if (blockText.trim()) {
            text += prefix + blockText + '\n';
        }

        if (block.has_children && block.children) {
            text += notionBlocksToText(block.children, depth + 1);
        }
    }
    return text;
}


export const notionService = {

    validateApiKey: async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
        if (!apiKey) return { isValid: false, error: "API key is empty" };
        
        const trimmedKey = apiKey.trim();
        // Relaxed validation: Notion keys typically start with 'secret_' or 'ntn_'
        // We will rely on the actual API call to validate the key to be future-proof.
        
        try {
            const targetUrl = `users/me`;
            // Notion API Key validation requires header support, using AUTH_PROXY logic implicitly via headers check
            const response = await fetchWithRetry(targetUrl, {
                headers: { 
                    'Authorization': `Bearer ${trimmedKey}`, 
                    'Notion-Version': NOTION_API_VERSION,
                },
            });
            
            if (response.status === 401) {
                console.error('Notion API Validation: 401 Unauthorized');
                return { isValid: false, error: "Unauthorized. Please check your API key." };
            }
            
            if (!response.ok) {
                 return { isValid: false, error: `Notion API Error: ${response.status} ${response.statusText}` };
            }
            
            return { isValid: true };
        } catch (error) {
            console.error('API key validation failed during network request:', error);
            return { isValid: false, error: `Network error: ${error instanceof Error ? error.message : String(error)}` };
        }
    },
    
    searchNotionPages: async (query: string, apiKey: string, limit: number = 50): Promise<NotionPageInfo[]> => {
        if (!query || !apiKey) return [];

        const cacheKey = `searchNotionPages:${query}:${limit}`;
        const cached = getFromCache<NotionPageInfo[]>(cacheKey);
        if (cached) return cached;

        try {
            const persistentCached = await get(cacheKey);
            if (persistentCached && Date.now() - persistentCached.timestamp < 60 * 1000) {
                setToCache(cacheKey, persistentCached.data);
                return persistentCached.data;
            }
        } catch (e) {
            console.warn("Failed to read from persistent cache", e);
        }

        try {
            const targetUrl = `search`;
            const response = await fetchWithRetry(targetUrl, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${apiKey.trim()}`, 
                    'Notion-Version': NOTION_API_VERSION, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ query, page_size: limit }),
            }, 2, 10000); // 2 retries, 10s timeout

            const data = await handleApiResponse(response, "Search Pages");

            const results = (data.results || [])
                .filter((r: NotionSearchResult) => r.object === 'page' || r.object === 'database')
                .map((result: NotionSearchResult): NotionPageInfo => {
                    const title = result.object === 'page' ? extractPageTitle(result.properties) : extractTextFromRichText(result.title || []);
                    return {
                        id: result.id,
                        title: title || "Untitled",
                        url: result.url,
                        object: result.object,
                        icon: extractIcon(result.icon),
                        tags: result.object === 'page' ? extractTags(result.properties) : [],
                        description: result.object === 'page' ? extractAllProperties(result.properties) : result.description,
                    };
                });
            
            setToCache(cacheKey, results);
            try {
                await set(cacheKey, { data: results, timestamp: Date.now() });
            } catch (e) {
                console.warn("Failed to save to persistent cache", e);
            }
            return results;
        } catch (error) {
            console.error('Failed to fetch from Notion API (searchNotionPages):', error);
            throw error;
        }
    },

    searchNotion: async (query: string, apiKey: string): Promise<NotionPageInfo[]> => {
        if (!query || !apiKey) return [];

        const cacheKey = `searchNotion:${query}`;
        const cached = getFromCache<NotionPageInfo[]>(cacheKey);
        if (cached) return cached;

        try {
            const persistentCached = await get(cacheKey);
            if (persistentCached && Date.now() - persistentCached.timestamp < 60 * 1000) {
                setToCache(cacheKey, persistentCached.data);
                return persistentCached.data;
            }
        } catch (e) {
            console.warn("Failed to read from persistent cache", e);
        }

        try {
            const targetUrl = `search`;
            const response = await fetchWithRetry(targetUrl, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${apiKey.trim()}`, 
                    'Notion-Version': NOTION_API_VERSION, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ query, page_size: 10 }),
            }, 2, 10000);

            const data = await handleApiResponse(response, "Search");

            const results = await Promise.all(
                (data.results || []).map(async (result: NotionSearchResult): Promise<NotionPageInfo | null> => {
                    if (result.object === 'page') {
                        const content = await notionService.getBlockChildren(result.id, apiKey);
                        return {
                            id: result.id,
                            title: extractPageTitle(result.properties),
                            url: result.url,
                            object: 'page',
                            icon: extractIcon(result.icon),
                            tags: extractTags(result.properties),
                            description: extractAllProperties(result.properties),
                            content: content,
                        };
                    }
                    return null;
                })
            ).then(results => results.filter((r): r is NotionPageInfo => r !== null));
            
            setToCache(cacheKey, results);
            try {
                await set(cacheKey, { data: results, timestamp: Date.now() });
            } catch (e) {
                console.warn("Failed to save to persistent cache", e);
            }
            return results;

        } catch (error) {
            console.error('Failed to fetch from Notion API (searchNotion):', error);
            throw error;
        }
    },

    listAccessiblePages: async (apiKey: string, limit?: number): Promise<NotionPageInfo[]> => {
        if (!apiKey) return [];
        const cacheKey = `listAccessiblePages:${apiKey}:${limit || 'all'}`;
        
        const sessionCached = getFromCache<NotionPageInfo[]>(cacheKey);
        if (sessionCached) return sessionCached;

        if (!limit) {
            const persistentCached = await dataService.getNotionPagesCache();
            if (persistentCached) {
                setToCache(cacheKey, persistentCached);
                return persistentCached;
            }
        }
        
        let allResults: NotionPageInfo[] = [];
        let hasMore = true;
        let startCursor: string | undefined = undefined;

        try {
            while (hasMore) {
                const targetUrl = `search`;
                const response = await fetchWithRetry(targetUrl, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${apiKey.trim()}`, 
                        'Notion-Version': NOTION_API_VERSION, 
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({ 
                        sort: { direction: 'descending', timestamp: 'last_edited_time' }, 
                        page_size: 100,
                        ...(startCursor && { start_cursor: startCursor })
                    }),
                }, 2, 10000);
                const data = await handleApiResponse(response, "List Content");
                
                const pageInfos = (data.results || [])
                    .filter((r: NotionSearchResult) => r.object === 'page' || r.object === 'database')
                    .map((result: NotionSearchResult): NotionPageInfo => {
                        const title = result.object === 'page' ? extractPageTitle(result.properties) : extractTextFromRichText(result.title || []);
                        const description = result.object === 'page' ? extractAllProperties(result.properties) : result.description;
                        let tags = result.object === 'page' ? extractTags(result.properties) : [];
                        return {
                            id: result.id,
                            title: title || "Untitled",
                            url: result.url,
                            object: result.object,
                            icon: extractIcon(result.icon),
                            tags: tags,
                            description: description,
                            last_edited_time: result.last_edited_time,
                        };
                    });
                
                allResults = [...allResults, ...pageInfos];
                hasMore = data.has_more;
                startCursor = data.next_cursor;
                
                if (limit) hasMore = false;
            }

            const finalResults = limit ? allResults.slice(0, limit) : allResults;
            setToCache(cacheKey, finalResults);

            if (!limit) {
                await dataService.setNotionPagesCache(finalResults);
            }

            return finalResults;
        } catch (error) {
            console.error('Failed to fetch from Notion API (listAccessiblePages):', error);
            throw error;
        }
    },

    syncAllAccessiblePages: async (apiKey: string): Promise<void> => {
        if (!apiKey) return;
        try {
            const allPages = await notionService.listAccessiblePages(apiKey);
            await dataService.setNotionPagesCache(allPages);
        } catch (error) {
            console.error("Failed during Notion workspace sync:", error);
        }
    },

    getNotionObject: async (id: string, apiKey: string, maxDepth: number = 0): Promise<NotionPageInfo | null> => {
        if (!id || !apiKey) return null;
        const formattedId = formatNotionId(id);
        if (!formattedId) return null;

        const cacheKey = `getNotionObject:${formattedId}:depth${maxDepth}`;
        const cached = getFromCache<NotionPageInfo>(cacheKey);
        if (cached) return cached;

        try {
            const persistentCached = await get(cacheKey);
            if (persistentCached && Date.now() - persistentCached.timestamp < 60 * 60 * 1000) {
                setToCache(cacheKey, persistentCached.data);
                return persistentCached.data;
            }
        } catch (e) {
            console.warn("Failed to read from persistent cache", e);
        }

        let pageError: any;
        try {
            const pageTargetUrl = `pages/${formattedId}`;
            const pageResponse = await fetchWithRetry(pageTargetUrl, { 
                headers: { 
                    'Authorization': `Bearer ${apiKey.trim()}`, 
                    'Notion-Version': NOTION_API_VERSION,
                } 
            });
            
            if (pageResponse.ok) {
                const objectData = await pageResponse.json();
                const content = await notionService.getBlockChildren(formattedId, apiKey, 0, maxDepth === 0 ? 2 : maxDepth);
                const result: NotionPageInfo = {
                    id: objectData.id,
                    title: extractPageTitle(objectData.properties) || "Untitled",
                    url: objectData.url,
                    object: 'page',
                    icon: extractIcon(objectData.icon),
                    tags: extractTags(objectData.properties),
                    content: content,
                    description: extractAllProperties(objectData.properties),
                };
                setToCache(cacheKey, result);
                try {
                    await set(cacheKey, { data: result, timestamp: Date.now() });
                } catch (e) {
                    console.warn("Failed to save to persistent cache", e);
                }
                return result;
            }
            pageError = new Error(`Status ${pageResponse.status}`);
        } catch (error) {
            pageError = error;
        }

        try {
            const dbTargetUrl = `databases/${formattedId}`;
            const dbResponse = await fetchWithRetry(dbTargetUrl, { 
                headers: { 
                    'Authorization': `Bearer ${apiKey.trim()}`, 
                    'Notion-Version': NOTION_API_VERSION,
                } 
            });
            const objectData = await handleApiResponse(dbResponse, `Get Database ${formattedId}`);
            
            const result: NotionPageInfo = {
                id: objectData.id,
                title: extractTextFromRichText(objectData.title || []) || "Untitled Database",
                url: objectData.url,
                object: 'database',
                icon: extractIcon(objectData.icon),
                tags: [],
                content: [],
                description: objectData.description,
            };
            setToCache(cacheKey, result);
            try {
                await set(cacheKey, { data: result, timestamp: Date.now() });
            } catch (e) {
                console.warn("Failed to save to persistent cache", e);
            }
            return result;
        } catch (dbError) {
            throw new Error(`Could not access Notion object ${formattedId}. Check your connection and permissions.`);
        }
    },

    getBlockChildren: async (blockId: string, apiKey: string, currentDepth = 0, maxDepth = 2): Promise<NotionBlock[]> => {
        if (currentDepth >= maxDepth) return []; // Limit recursion depth
        const formattedBlockId = formatNotionId(blockId);
        const fetchDepth = maxDepth - currentDepth;
        const cacheKey = `getBlockChildren:${formattedBlockId}:depth${fetchDepth}`;
        const cached = getFromCache<NotionBlock[]>(cacheKey);
        if (cached) return cached;

        try {
            const persistentCached = await get(cacheKey);
            if (persistentCached && Date.now() - persistentCached.timestamp < 60 * 60 * 1000) {
                setToCache(cacheKey, persistentCached.data);
                return persistentCached.data;
            }
        } catch (e) {
            console.warn("Failed to read from persistent cache", e);
        }

        try {
            let children: NotionBlock[] = [];
            let hasMore = true;
            let startCursor: string | undefined = undefined;
            let pageCount = 0;

            while (hasMore && pageCount < (currentDepth === 0 ? 5 : 1)) {
                const targetUrl = `blocks/${formattedBlockId}/children?page_size=100${startCursor ? `&start_cursor=${startCursor}` : ''}`;
                const response = await fetchWithRetry(targetUrl, {
                    headers: { 
                        'Authorization': `Bearer ${apiKey.trim()}`, 
                        'Notion-Version': NOTION_API_VERSION,
                    },
                }, 2, 10000);

                const data = await handleApiResponse(response, `Get Block Children for ${formattedBlockId}`);
                children = children.concat(data.results || []);
                hasMore = data.has_more;
                startCursor = data.next_cursor;
                pageCount++;
            }
            
            const childrenWithChildren = children.filter(c => c.has_children);
            
            // Process with concurrency limit of 3 to avoid hitting Notion API rate limits (3 req/s)
            const concurrencyLimit = 3;
            let activeCount = 0;
            const queue = [...childrenWithChildren];
            
            await new Promise<void>((resolve) => {
                const processNext = async () => {
                    if (queue.length === 0 && activeCount === 0) {
                        resolve();
                        return;
                    }
                    while (queue.length > 0 && activeCount < concurrencyLimit) {
                        const child = queue.shift()!;
                        activeCount++;
                        
                        (async () => {
                            try {
                                if (child.type === 'synced_block' && (child as SyncedBlock).synced_block?.synced_from?.block_id) {
                                    child.children = await notionService.getBlockChildren((child as SyncedBlock).synced_block.synced_from!.block_id, apiKey, currentDepth + 1, maxDepth);
                                } else {
                                    child.children = await notionService.getBlockChildren(child.id, apiKey, currentDepth + 1, maxDepth);
                                }
                            } catch (e) {
                                console.warn(`Failed to fetch children for block ${child.id}:`, e);
                            } finally {
                                activeCount--;
                                processNext();
                            }
                        })();
                    }
                };
                processNext();
            });
            
            setToCache(cacheKey, children);
            try {
                await set(cacheKey, { data: children, timestamp: Date.now() });
            } catch (e) {
                console.warn("Failed to save to persistent cache", e);
            }
            return children;

        } catch (error) {
            console.warn(`Failed to fetch children for block ${blockId}:`, error);
            return [];
        }
    },
    
    getFreshBlock: async (blockId: string, apiKey: string): Promise<NotionBlock | null> => {
        if (!blockId || !apiKey) return null;
        try {
            const formattedId = formatNotionId(blockId);
            const targetUrl = `blocks/${formattedId}`;
            const response = await fetchWithRetry(targetUrl, {
                headers: { 
                    'Authorization': `Bearer ${apiKey.trim()}`, 
                    'Notion-Version': NOTION_API_VERSION,
                },
            });
            return await handleApiResponse(response, `Get Fresh Block ${formattedId}`);
        } catch (error) {
            console.error(`Failed to get fresh block data for ${blockId}:`, error);
            return null;
        }
    },

    queryDatabase: async (databaseId: string, apiKey: string): Promise<NotionPageInfo[]> => {
        if (!databaseId || !apiKey) return [];

        const formattedDbId = formatNotionId(databaseId);
        const cacheKey = `queryDatabase:${formattedDbId}`;
        const cached = getFromCache<NotionPageInfo[]>(cacheKey);
        if (cached) return cached;

        try {
            const persistentCached = await get(cacheKey);
            if (persistentCached && Date.now() - persistentCached.timestamp < 60 * 60 * 1000) {
                setToCache(cacheKey, persistentCached.data);
                return persistentCached.data;
            }
        } catch (e) {
            console.warn("Failed to read from persistent cache", e);
        }

        try {
            const targetUrl = `databases/${formattedDbId}/query`;
            const response = await fetchWithRetry(targetUrl, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${apiKey.trim()}`, 
                    'Notion-Version': NOTION_API_VERSION, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ page_size: 20 }), 
            });

            const data = await handleApiResponse(response, `Query Database ${formattedDbId}`);
            const results = (data.results || []).map((page: any): NotionPageInfo => ({
                id: page.id,
                title: extractPageTitle(page.properties),
                url: page.url,
                object: 'page',
                icon: extractIcon(page.icon),
                tags: extractTags(page.properties),
            }));
            
            setToCache(cacheKey, results);
            try {
                await set(cacheKey, { data: results, timestamp: Date.now() });
            } catch (e) {
                console.warn("Failed to save to persistent cache", e);
            }
            return results;

        } catch (error) {
            console.error(`Failed to query database ${databaseId}:`, error);
            throw error;
        }
    },
    
    notionBlocksToText,

    getPagesContentByTags: async (apiKey: string, tagNames: string[]): Promise<{id: string, title: string, content: string, url: string}[]> => {
        if (tagNames.length === 0) return [];
    
        const allPages = await notionService.listAccessiblePages(apiKey);
        
        const matchingPages = allPages.filter(page => {
            const pageTagNames = new Set(page.tags.map(t => t.name));
            return tagNames.every(requiredTag => pageTagNames.has(requiredTag));
        });
    
        const pageContents = await Promise.all(
            matchingPages.map(async (pageInfo) => {
                const fullPage = await notionService.getNotionObject(pageInfo.id, apiKey);
                if (!fullPage || !fullPage.content) return null;
                const textContent = notionBlocksToText(fullPage.content);
                return { id: fullPage.id, title: fullPage.title, content: textContent, url: fullPage.url };
            })
        );
        
        return pageContents.filter((p): p is {id: string, title: string, content: string, url: string} => p !== null);
    },
};