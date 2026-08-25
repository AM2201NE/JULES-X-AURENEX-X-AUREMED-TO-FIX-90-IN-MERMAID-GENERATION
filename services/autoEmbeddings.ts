import { dataService } from './dataService';
import { notionService } from './notionService';
import { googleDriveService, DriveFile } from './googleDriveService';
import { getEmbeddingsBatch } from './geminiService';
import { embeddingStore, StoredEmbedding } from './embeddingStore';
import { 
    detectNotionChanges, 
    detectDriveChanges, 
    detectLocalChanges,
    fetchNotionPagesWithMetadata,
    fetchDriveFilesWithMetadata,
    fetchLocalPagesWithMetadata
} from './embeddingSync';
import { v4 as uuidv4 } from 'uuid';

interface EmbeddingProgress {
    stage: 'fetching' | 'processing' | 'embedding' | 'storing' | 'complete' | 'error';
    current: number;
    total: number;
    message: string;
    sourceType: 'notion' | 'drive' | 'local';
}

type ProgressCallback = (progress: EmbeddingProgress) => void;

/**
 * Extract text content from Notion page blocks
 */
function extractTextFromNotionBlocks(blocks: any[]): string {
    if (!blocks || !Array.isArray(blocks)) return '';
    
    let text = '';
    for (const block of blocks) {
        if (!block) continue;
        
        // Extract text from rich_text arrays
        const extractRichText = (richText: any[]): string => {
            if (!richText || !Array.isArray(richText)) return '';
            return richText.map(rt => rt.plain_text || '').join(' ');
        };
        
        switch (block.type) {
            case 'paragraph':
            case 'heading_1':
            case 'heading_2':
            case 'heading_3':
            case 'bulleted_list_item':
            case 'numbered_list_item':
            case 'to_do':
            case 'quote':
            case 'callout':
            case 'toggle':
                text += extractRichText(block[block.type]?.rich_text) + ' ';
                break;
            case 'code':
                text += extractRichText(block.code?.rich_text) + ' ';
                break;
            case 'table':
            case 'table_row':
                // Tables handled by children
                break;
            case 'image':
            case 'video':
            case 'file':
            case 'pdf':
            case 'bookmark':
            case 'link_preview':
                // Media files - just add caption if any
                const caption = block[block.type]?.caption;
                if (caption) text += extractRichText(caption) + ' ';
                break;
        }
        
        // Recursively process children
        if (block.has_children && block.children) {
            text += extractTextFromNotionBlocks(block.children) + ' ';
        }
    }
    
    return text.trim();
}

/**
 * Extract text from Google Drive file
 */
async function extractTextFromDriveFile(file: DriveFile, accessToken: string): Promise<string> {
    try {
        const snippet = await googleDriveService.getFileSnippet(file.id, file.mimeType, accessToken);
        return snippet || '';
    } catch (error) {
        console.warn(`Failed to extract text from Drive file ${file.name}:`, error);
        return '';
    }
}

/**
 * Chunk text into overlapping segments for better retrieval
 * Uses semantic boundaries (paragraphs, sentences) when possible
 */
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    if (!text || text.length <= chunkSize) return text ? [text] : [];
    
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
        let end = Math.min(start + chunkSize, text.length);
        let chunk = text.slice(start, end);
        
        // Try to break at sentence boundary if not at the end
        if (end < text.length) {
            const lastPeriod = chunk.lastIndexOf('. ');
            const lastNewline = chunk.lastIndexOf('\n');
            const breakPoint = Math.max(lastPeriod, lastNewline);
            if (breakPoint > chunkSize * 0.5) { // Only break if we're not losing too much
                chunk = chunk.slice(0, breakPoint + 1);
                end = start + breakPoint + 1;
            }
        }
        
        chunks.push(chunk);
        start = end - overlap;
        if (start < 0) start = 0;
    }
    
    return chunks;
}

/**
 * Generate content hash for change detection
 */
async function generateContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate embeddings for a single Notion page (for incremental updates)
 */
export async function generateNotionPageEmbeddings(
    pageId: string,
    apiKey: string,
    onProgress?: ProgressCallback
): Promise<StoredEmbedding[]> {
    try {
        const pageData = await notionService.getNotionObject(pageId, apiKey);
        if (!pageData || !pageData.content) {
            return [];
        }
        
        const text = extractTextFromNotionBlocks(pageData.content);
        if (!text || text.length < 50) {
            return [];
        }
        
        const chunks = chunkText(text);
        const chunkEmbeddings = await getEmbeddingsBatch(chunks);
        const contentHash = await generateContentHash(text);
        
        const embeddings: StoredEmbedding[] = [];
        for (let j = 0; j < chunks.length; j++) {
            if (chunkEmbeddings[j] && chunkEmbeddings[j].length > 0) {
                embeddings.push({
                    id: `${pageId}_chunk_${j}`,
                    sourceType: 'notion',
                    title: pageData.title,
                    text: chunks[j],
                    embedding: chunkEmbeddings[j],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    contentHash,
                    pageId,
                    chunkIndex: j,
                    totalChunks: chunks.length,
                    metadata: {
                        lastEditedTime: pageData.last_edited_time,
                        sectionHeader: chunks[j].split('\n')[0].slice(0, 100),
                        blockType: 'text'
                    }
                });
            }
        }
        
        return embeddings;
    } catch (error) {
        console.warn(`Failed to generate embeddings for Notion page ${pageId}:`, error);
        return [];
    }
}

/**
 * Generate embeddings for a single Drive file (for incremental updates)
 */
export async function generateDriveFileEmbeddings(
    file: DriveFile,
    accessToken: string,
    onProgress?: ProgressCallback
): Promise<StoredEmbedding[]> {
    try {
        // Extract text content
        const text = await extractTextFromDriveFile(file, accessToken);
        if (!text || text.length < 50) {
            return [];
        }
        
        const chunks = chunkText(text);
        const chunkEmbeddings = await getEmbeddingsBatch(chunks);
        const contentHash = await generateContentHash(text);
        
        const embeddings: StoredEmbedding[] = [];
        for (let j = 0; j < chunks.length; j++) {
            if (chunkEmbeddings[j] && chunkEmbeddings[j].length > 0) {
                embeddings.push({
                    id: `${file.id}_chunk_${j}`,
                    sourceType: 'drive',
                    title: file.name,
                    text: chunks[j],
                    embedding: chunkEmbeddings[j],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    contentHash,
                    pageId: file.id,
                    chunkIndex: j,
                    totalChunks: chunks.length,
                    metadata: {
                        modifiedTime: file.modifiedTime,
                        mimeType: file.mimeType,
                        sectionHeader: chunks[j].split('\n')[0].slice(0, 100),
                        blockType: 'text'
                    }
                });
            }
        }
        
        // Also generate image embeddings if it's an image file
        if (file.mimeType.startsWith('image/')) {
            const imageEmbeddings = await generateDriveImageEmbeddings(file, accessToken);
            embeddings.push(...imageEmbeddings);
        }
        
        return embeddings;
    } catch (error) {
        console.warn(`Failed to generate embeddings for Drive file ${file.name}:`, error);
        return [];
    }
}

/**
 * Generate embeddings for Drive images using multimodal model
 */
async function generateDriveImageEmbeddings(file: DriveFile, accessToken: string): Promise<StoredEmbedding[]> {
    try {
        // Get image URL (thumbnail or direct)
        const imageUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
        
        // For now, create a text-based embedding from the filename and metadata
        // In production, this would use a multimodal model like Gemini Vision or CLIP
        const imageDescription = `Image file: ${file.name} (${file.mimeType})`;
        const contentHash = await generateContentHash(imageDescription);
        
        const embeddings = await getEmbeddingsBatch([imageDescription]);
        
        if (embeddings[0] && embeddings[0].length > 0) {
            return [{
                id: `${file.id}_image_0`,
                sourceType: 'drive',
                title: file.name,
                text: imageDescription,
                embedding: embeddings[0],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                contentHash,
                pageId: file.id,
                chunkIndex: 0,
                totalChunks: 1,
                metadata: {
                    modifiedTime: file.modifiedTime,
                    mimeType: file.mimeType,
                    isImage: true,
                    imageUrl,
                    blockType: 'image'
                }
            }];
        }
        
        return [];
    } catch (error) {
        console.warn(`Failed to generate image embeddings for ${file.name}:`, error);
        return [];
    }
}

/**
 * Generate embeddings for a single local page (for incremental updates)
 */
export async function generateLocalPageEmbeddings(
    pageId: string,
    onProgress?: ProgressCallback
): Promise<StoredEmbedding[]> {
    try {
        const page = dataService.getPage(pageId);
        if (!page) return [];
        
        const getBlocksText = (blocks: any[]): string => {
            if (!blocks) return '';
            let text = '';
            for (const block of blocks) {
                if (!block) continue;
                text += (block.content || '').replace(/<[^>]*>?/gm, '') + ' ';
                if (block.children) text += getBlocksText(block.children);
                if (block.tableData) {
                    block.tableData.rows.forEach((row: any) => 
                        row.cells.forEach((cell: any) => { 
                            text += (cell.content || '').replace(/<[^>]*>?/gm, '') + ' '; 
                        })
                    );
                }
            }
            return text;
        };
        
        const text = getBlocksText(page.content);
        if (!text || text.length < 50) {
            return [];
        }
        
        const chunks = chunkText(text);
        const chunkEmbeddings = await getEmbeddingsBatch(chunks);
        const contentHash = await generateContentHash(text);
        
        const embeddings: StoredEmbedding[] = [];
        for (let j = 0; j < chunks.length; j++) {
            if (chunkEmbeddings[j] && chunkEmbeddings[j].length > 0) {
                embeddings.push({
                    id: `${pageId}_chunk_${j}`,
                    sourceType: 'local',
                    title: page.title,
                    text: chunks[j],
                    embedding: chunkEmbeddings[j],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    contentHash,
                    pageId,
                    chunkIndex: j,
                    totalChunks: chunks.length,
                    metadata: {
                        sectionHeader: chunks[j].split('\n')[0].slice(0, 100),
                        blockType: 'text'
                    }
                });
            }
        }
        
        return embeddings;
    } catch (error) {
        console.warn(`Failed to generate embeddings for local page ${pageId}:`, error);
        return [];
    }
}

/**
 * Full Notion embedding generation (initial sync or full re-sync)
 */
export async function generateNotionEmbeddings(
    apiKey: string,
    onProgress?: ProgressCallback
): Promise<{ success: number; failed: number }> {
    try {
        onProgress?.({ stage: 'fetching', current: 0, total: 0, message: 'Fetching Notion pages...', sourceType: 'notion' });
        
        const pages = await notionService.listAccessiblePages(apiKey);
        if (!pages || pages.length === 0) {
            onProgress?.({ stage: 'complete', current: 0, total: 0, message: 'No Notion pages found', sourceType: 'notion' });
            return { success: 0, failed: 0 };
        }
        
        onProgress?.({ stage: 'processing', current: 0, total: pages.length, message: `Processing ${pages.length} Notion pages...`, sourceType: 'notion' });
        
        const allEmbeddings: StoredEmbedding[] = [];
        let success = 0;
        let failed = 0;
        
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            
            onProgress?.({ 
                stage: 'processing', 
                current: i + 1, 
                total: pages.length, 
                message: `Processing: ${page.title}`, 
                sourceType: 'notion' 
            });
            
            try {
                const embeddings = await generateNotionPageEmbeddings(page.id, apiKey);
                if (embeddings.length > 0) {
                    allEmbeddings.push(...embeddings);
                    success++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.warn(`Failed to process Notion page ${page.title}:`, error);
                failed++;
            }
        }
        
        // Store all embeddings
        if (allEmbeddings.length > 0) {
            onProgress?.({ stage: 'storing', current: 0, total: allEmbeddings.length, message: `Storing ${allEmbeddings.length} embeddings...`, sourceType: 'notion' });
            await embeddingStore.storeEmbeddings(allEmbeddings);
            await embeddingStore.updateLastSync('notion');
        }
        
        onProgress?.({ stage: 'complete', current: success, total: pages.length, message: `Completed: ${success} succeeded, ${failed} failed`, sourceType: 'notion' });
        
        return { success, failed };
    } catch (error) {
        console.error('Notion embedding generation failed:', error);
        onProgress?.({ stage: 'error', current: 0, total: 0, message: `Error: ${error}`, sourceType: 'notion' });
        return { success: 0, failed: 0 };
    }
}

/**
 * Full Drive embedding generation (initial sync or full re-sync)
 */
export async function generateDriveEmbeddings(
    accessToken: string,
    selectedFiles: DriveFile[],
    onProgress?: ProgressCallback
): Promise<{ success: number; failed: number }> {
    try {
        if (!selectedFiles || selectedFiles.length === 0) {
            onProgress?.({ stage: 'complete', current: 0, total: 0, message: 'No Drive files selected', sourceType: 'drive' });
            return { success: 0, failed: 0 };
        }
        
        // Filter out folders
        const files = selectedFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
        
        onProgress?.({ stage: 'fetching', current: 0, total: files.length, message: `Fetching ${files.length} Drive files...`, sourceType: 'drive' });
        
        // Fetch metadata for all files (modifiedTime, mimeType)
        const filesWithMetadata = await fetchDriveFilesWithMetadata(accessToken, files);
        const fileMap = new Map(filesWithMetadata.map(f => [f.id, f]));
        
        const allEmbeddings: StoredEmbedding[] = [];
        let success = 0;
        let failed = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const metadata = fileMap.get(file.id);
            
            onProgress?.({ 
                stage: 'processing', 
                current: i + 1, 
                total: files.length, 
                message: `Processing: ${file.name}`, 
                sourceType: 'drive' 
            });
            
            try {
                // Merge metadata
                const fileWithMeta = metadata ? { ...file, ...metadata } : file;
                const embeddings = await generateDriveFileEmbeddings(fileWithMeta, accessToken);
                if (embeddings.length > 0) {
                    allEmbeddings.push(...embeddings);
                    success++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.warn(`Failed to process Drive file ${file.name}:`, error);
                failed++;
            }
        }
        
        // Store all embeddings
        if (allEmbeddings.length > 0) {
            onProgress?.({ stage: 'storing', current: 0, total: allEmbeddings.length, message: `Storing ${allEmbeddings.length} embeddings...`, sourceType: 'drive' });
            await embeddingStore.storeEmbeddings(allEmbeddings);
            await embeddingStore.updateLastSync('drive');
        }
        
        onProgress?.({ stage: 'complete', current: success, total: files.length, message: `Completed: ${success} succeeded, ${failed} failed`, sourceType: 'drive' });
        
        return { success, failed };
    } catch (error) {
        console.error('Drive embedding generation failed:', error);
        onProgress?.({ stage: 'error', current: 0, total: 0, message: `Error: ${error}`, sourceType: 'drive' });
        return { success: 0, failed: 0 };
    }
}

/**
 * Full Local embedding generation (initial sync or full re-sync)
 */
export async function generateLocalEmbeddings(
    onProgress?: ProgressCallback
): Promise<{ success: number; failed: number }> {
    try {
        const pages = dataService.getPages();
        if (!pages || pages.length === 0) {
            onProgress?.({ stage: 'complete', current: 0, total: 0, message: 'No local pages found', sourceType: 'local' });
            return { success: 0, failed: 0 };
        }
        
        onProgress?.({ stage: 'processing', current: 0, total: pages.length, message: `Processing ${pages.length} local pages...`, sourceType: 'local' });
        
        const allEmbeddings: StoredEmbedding[] = [];
        let success = 0;
        let failed = 0;
        
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            
            onProgress?.({ 
                stage: 'processing', 
                current: i + 1, 
                total: pages.length, 
                message: `Processing: ${page.title}`, 
                sourceType: 'local' 
            });
            
            try {
                const embeddings = await generateLocalPageEmbeddings(page.id);
                if (embeddings.length > 0) {
                    allEmbeddings.push(...embeddings);
                    success++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.warn(`Failed to process local page ${page.title}:`, error);
                failed++;
            }
        }
        
        // Store all embeddings
        if (allEmbeddings.length > 0) {
            onProgress?.({ stage: 'storing', current: 0, total: allEmbeddings.length, message: `Storing ${allEmbeddings.length} embeddings...`, sourceType: 'local' });
            await embeddingStore.storeEmbeddings(allEmbeddings);
            await embeddingStore.updateLastSync('local');
        }
        
        onProgress?.({ stage: 'complete', current: success, total: pages.length, message: `Completed: ${success} succeeded, ${failed} failed`, sourceType: 'local' });
        
        return { success, failed };
    } catch (error) {
        console.error('Local embedding generation failed:', error);
        onProgress?.({ stage: 'error', current: 0, total: 0, message: `Error: ${error}`, sourceType: 'local' });
        return { success: 0, failed: 0 };
    }
}

/**
 * Incremental Notion embedding sync - only processes changed pages
 */
export async function incrementalNotionSync(
    apiKey: string,
    onProgress?: ProgressCallback
): Promise<{ added: number; modified: number; deleted: number; unchanged: number; isIncremental: boolean }> {
    try {
        onProgress?.({ stage: 'fetching', current: 0, total: 0, message: 'Checking for Notion changes...', sourceType: 'notion' });
        
        const remotePages = await fetchNotionPagesWithMetadata(apiKey);
        
        const result = await embeddingStore.incrementalSync(
            'notion',
            remotePages,
            async (items) => {
                const embeddings: StoredEmbedding[] = [];
                for (const item of items) {
                    const pageEmbeddings = await generateNotionPageEmbeddings(item.id, apiKey);
                    embeddings.push(...pageEmbeddings);
                }
                return embeddings;
            }
        );
        
        onProgress?.({ 
            stage: 'complete', 
            current: result.added + result.modified, 
            total: remotePages.length, 
            message: `Sync complete: ${result.added} added, ${result.modified} modified, ${result.deleted} deleted, ${result.unchanged} unchanged`, 
            sourceType: 'notion' 
        });
        
        return { ...result, isIncremental: true };
    } catch (error) {
        console.error('Incremental Notion sync failed:', error);
        onProgress?.({ stage: 'error', current: 0, total: 0, message: `Error: ${error}`, sourceType: 'notion' });
        return { added: 0, modified: 0, deleted: 0, unchanged: 0, isIncremental: true };
    }
}

/**
 * Incremental Drive embedding sync - only processes changed files
 */
export async function incrementalDriveSync(
    accessToken: string,
    selectedFiles: DriveFile[],
    onProgress?: ProgressCallback
): Promise<{ added: number; modified: number; deleted: number; unchanged: number; isIncremental: boolean }> {
    try {
        onProgress?.({ stage: 'fetching', current: 0, total: 0, message: 'Checking for Drive changes...', sourceType: 'drive' });
        
        const files = selectedFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
        const remoteFiles = await fetchDriveFilesWithMetadata(accessToken, files);
        
        const result = await embeddingStore.incrementalSync(
            'drive',
            remoteFiles,
            async (items) => {
                const embeddings: StoredEmbedding[] = [];
                for (const item of items) {
                    const file = files.find(f => f.id === item.id);
                    if (file) {
                        const fileWithMeta = { ...file, ...item };
                        const fileEmbeddings = await generateDriveFileEmbeddings(fileWithMeta, accessToken);
                        embeddings.push(...fileEmbeddings);
                    }
                }
                return embeddings;
            }
        );
        
        onProgress?.({ 
            stage: 'complete', 
            current: result.added + result.modified, 
            total: remoteFiles.length, 
            message: `Sync complete: ${result.added} added, ${result.modified} modified, ${result.deleted} deleted, ${result.unchanged} unchanged`, 
            sourceType: 'drive' 
        });
        
        return { ...result, isIncremental: true };
    } catch (error) {
        console.error('Incremental Drive sync failed:', error);
        onProgress?.({ stage: 'error', current: 0, total: 0, message: `Error: ${error}`, sourceType: 'drive' });
        return { added: 0, modified: 0, deleted: 0, unchanged: 0, isIncremental: true };
    }
}

/**
 * Incremental Local embedding sync - only processes changed pages
 */
export async function incrementalLocalSync(
    onProgress?: ProgressCallback
): Promise<{ added: number; modified: number; deleted: number; unchanged: number; isIncremental: boolean }> {
    try {
        onProgress?.({ stage: 'fetching', current: 0, total: 0, message: 'Checking for local changes...', sourceType: 'local' });
        
        const remotePages = await fetchLocalPagesWithMetadata();
        
        const result = await embeddingStore.incrementalSync(
            'local',
            remotePages,
            async (items) => {
                const embeddings: StoredEmbedding[] = [];
                for (const item of items) {
                    const pageEmbeddings = await generateLocalPageEmbeddings(item.id);
                    embeddings.push(...pageEmbeddings);
                }
                return embeddings;
            }
        );
        
        onProgress?.({ 
            stage: 'complete', 
            current: result.added + result.modified, 
            total: remotePages.length, 
            message: `Sync complete: ${result.added} added, ${result.modified} modified, ${result.deleted} deleted, ${result.unchanged} unchanged`, 
            sourceType: 'local' 
        });
        
        return { ...result, isIncremental: true };
    } catch (error) {
        console.error('Incremental Local sync failed:', error);
        onProgress?.({ stage: 'error', current: 0, total: 0, message: `Error: ${error}`, sourceType: 'local' });
        return { added: 0, modified: 0, deleted: 0, unchanged: 0, isIncremental: true };
    }
}

/**
 * Smart sync: decides between full sync and incremental sync based on state
 */
export async function smartSync(
    onProgress?: ProgressCallback
): Promise<{
    notion: { added: number; modified: number; deleted: number; unchanged: number; isIncremental: boolean };
    drive: { added: number; modified: number; deleted: number; unchanged: number; isIncremental: boolean };
    local: { added: number; modified: number; deleted: number; unchanged: number; isIncremental: boolean };
}> {
    const integrations = dataService.getIntegrations();
    
    const results = {
        notion: { added: 0, modified: 0, deleted: 0, unchanged: 0, isIncremental: false },
        drive: { added: 0, modified: 0, deleted: 0, unchanged: 0, isIncremental: false },
        local: { added: 0, modified: 0, deleted: 0, unchanged: 0, isIncremental: false }
    };
    
    // Notion
    if (integrations.notion?.apiKey) {
        const hasEmbeddings = await embeddingStore.hasEmbeddings('notion');
        if (hasEmbeddings) {
            results.notion = await incrementalNotionSync(integrations.notion.apiKey, onProgress);
            results.notion.isIncremental = true;
        } else {
            const full = await generateNotionEmbeddings(integrations.notion.apiKey, onProgress);
            results.notion = { added: full.success, modified: 0, deleted: 0, unchanged: 0, isIncremental: false };
        }
    }
    
    // Drive
    if (integrations.googleDrive?.accessToken && integrations.googleDrive.selectedFiles?.length > 0) {
        const hasEmbeddings = await embeddingStore.hasEmbeddings('drive');
        if (hasEmbeddings) {
            results.drive = await incrementalDriveSync(
                integrations.googleDrive.accessToken,
                integrations.googleDrive.selectedFiles,
                onProgress
            );
            results.drive.isIncremental = true;
        } else {
            const full = await generateDriveEmbeddings(
                integrations.googleDrive.accessToken,
                integrations.googleDrive.selectedFiles,
                onProgress
            );
            results.drive = { added: full.success, modified: 0, deleted: 0, unchanged: 0, isIncremental: false };
        }
    }
    
    // Local
    const hasLocalEmbeddings = await embeddingStore.hasEmbeddings('local');
    if (hasLocalEmbeddings) {
        results.local = await incrementalLocalSync(onProgress);
        results.local.isIncremental = true;
    } else {
        const full = await generateLocalEmbeddings(onProgress);
        results.local = { added: full.success, modified: 0, deleted: 0, unchanged: 0, isIncremental: false };
    }
    
    return results;
}

/**
 * Generate embeddings for all connected sources (backward compatibility)
 * Now uses smart sync to avoid re-embedding unchanged content
 */
export async function generateAllEmbeddings(
    onProgress?: ProgressCallback
): Promise<{ notion: { success: number; failed: number }; drive: { success: number; failed: number }; local: { success: number; failed: number } }> {
    const results = await smartSync(onProgress);
    
    return {
        notion: { success: results.notion.added + results.notion.modified, failed: 0 },
        drive: { success: results.drive.added + results.drive.modified, failed: 0 },
        local: { success: results.local.added + results.local.modified, failed: 0 }
    };
}

/**
 * Check if embeddings need to be generated (first time only)
 */
export async function shouldGenerateEmbeddings(): Promise<{ notion: boolean; drive: boolean; local: boolean }> {
    const [notionHas, driveHas, localHas] = await Promise.all([
        embeddingStore.hasEmbeddings('notion'),
        embeddingStore.hasEmbeddings('drive'),
        embeddingStore.hasEmbeddings('local')
    ]);
    
    const integrations = dataService.getIntegrations();
    
    return {
        notion: Boolean(integrations.notion?.apiKey) && !notionHas,
        drive: Boolean(integrations.googleDrive?.accessToken) && Boolean(integrations.googleDrive.selectedFiles?.length > 0) && !driveHas,
        local: !localHas
    };
}

/**
 * Force full re-embedding (for troubleshooting or model changes)
 */
export async function forceFullReEmbedding(
    onProgress?: ProgressCallback
): Promise<{ notion: { success: number; failed: number }; drive: { success: number; failed: number }; local: { success: number; failed: number } }> {
    // Clear all existing embeddings
    await embeddingStore.clearAll();
    
    // Generate fresh
    return generateAllEmbeddings(onProgress);
}