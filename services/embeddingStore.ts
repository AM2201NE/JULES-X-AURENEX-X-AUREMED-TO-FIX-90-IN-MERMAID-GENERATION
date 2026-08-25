import { get, set, del, keys } from 'idb-keyval';

const EMBEDDING_STORE_PREFIX = 'aurenex_embeddings_';
const EMBEDDING_META_KEY = 'aurenex_embedding_meta';
const EMBEDDING_VERSION = 2; // Increment for schema changes

export interface StoredEmbedding {
    id: string; // pageId or fileId
    sourceType: 'notion' | 'drive' | 'local';
    title: string;
    text: string;
    embedding: number[];
    createdAt: number;
    updatedAt: number;
    // New fields for incremental updates
    contentHash: string; // SHA-256 hash of the chunk text
    pageId: string; // Parent page/file ID for grouping
    chunkIndex: number; // Index within the page
    totalChunks: number; // Total chunks in the page
    metadata?: {
        // Notion-specific
        lastEditedTime?: string; // Notion's last_edited_time
        // Drive-specific
        modifiedTime?: string; // Drive's modifiedTime
        mimeType?: string;
        // Image-specific
        isImage?: boolean;
        imageUrl?: string;
        // General
        sectionHeader?: string;
        blockType?: string;
    };
}

export interface EmbeddingMeta {
    notion: { [pageId: string]: { title: string; updatedAt: number; lastEditedTime?: string; chunkCount: number; contentHash?: string } };
    drive: { [fileId: string]: { title: string; updatedAt: number; modifiedTime?: string; mimeType?: string; chunkCount: number; contentHash?: string } };
    local: { [pageId: string]: { title: string; updatedAt: number; chunkCount: number; contentHash?: string } };
    lastFullSync: { notion?: number; drive?: number; local?: number };
    version: number;
}

export interface ChangeDetectionResult {
    added: string[]; // pageIds/fileIds that are new
    modified: string[]; // pageIds/fileIds that changed
    deleted: string[]; // pageIds/fileIds that were removed
    unchanged: string[]; // pageIds/fileIds that are the same
}

function getStoreKey(sourceType: string, id: string): string {
    return `${EMBEDDING_STORE_PREFIX}${sourceType}_${id}`;
}

/**
 * Generate SHA-256 hash of content for change detection
 */
async function generateContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const embeddingStore = {
    /**
     * Store embeddings for a batch of items
     */
    async storeEmbeddings(embeddings: StoredEmbedding[]): Promise<void> {
        const meta = await this.getMeta();
        
        for (const emb of embeddings) {
            const key = getStoreKey(emb.sourceType, emb.id);
            await set(key, emb);
            
            // Update meta
            if (!meta[emb.sourceType]) meta[emb.sourceType] = {};
            
            const metaEntry: any = {
                title: emb.title,
                updatedAt: emb.updatedAt,
                chunkCount: 1,
                contentHash: emb.contentHash
            };
            
            // Add source-specific metadata
            if (emb.sourceType === 'notion' && emb.metadata?.lastEditedTime) {
                metaEntry.lastEditedTime = emb.metadata.lastEditedTime;
            }
            if (emb.sourceType === 'drive') {
                if (emb.metadata?.modifiedTime) metaEntry.modifiedTime = emb.metadata.modifiedTime;
                if (emb.metadata?.mimeType) metaEntry.mimeType = emb.metadata.mimeType;
            }
            
            meta[emb.sourceType][emb.id] = metaEntry;
        }
        
        await set(EMBEDDING_META_KEY, meta);
    },

    /**
     * Get embeddings for a specific source type
     */
    async getEmbeddings(sourceType: 'notion' | 'drive' | 'local', ids?: string[]): Promise<StoredEmbedding[]> {
        const meta = await this.getMeta();
        const targetIds = ids || Object.keys(meta[sourceType] || {});
        const results: StoredEmbedding[] = [];

        for (const id of targetIds) {
            const key = getStoreKey(sourceType, id);
            const emb = await get<StoredEmbedding>(key);
            if (emb) results.push(emb);
        }

        return results;
    },

    /**
     * Get all embeddings across all sources
     */
    async getAllEmbeddings(): Promise<StoredEmbedding[]> {
        const meta = await this.getMeta();
        const results: StoredEmbedding[] = [];

        for (const sourceType of ['notion', 'drive', 'local'] as const) {
            const ids = Object.keys(meta[sourceType] || {});
            for (const id of ids) {
                const key = getStoreKey(sourceType, id);
                const emb = await get<StoredEmbedding>(key);
                if (emb) results.push(emb);
            }
        }

        return results;
    },

    /**
     * Get embedding meta (titles and timestamps)
     */
    async getMeta(): Promise<EmbeddingMeta> {
        const meta = await get<EmbeddingMeta>(EMBEDDING_META_KEY);
        return meta || { notion: {}, drive: {}, local: {}, lastFullSync: {}, version: EMBEDDING_VERSION };
    },

    /**
     * Check if embeddings exist for a source
     */
    async hasEmbeddings(sourceType: 'notion' | 'drive' | 'local'): Promise<boolean> {
        const meta = await this.getMeta();
        return Object.keys(meta[sourceType] || {}).length > 0;
    },

    /**
     * Get count of embeddings per source
     */
    async getCounts(): Promise<{ notion: number; drive: number; local: number }> {
        const meta = await this.getMeta();
        return {
            notion: Object.keys(meta.notion || {}).length,
            drive: Object.keys(meta.drive || {}).length,
            local: Object.keys(meta.local || {}).length
        };
    },

    /**
     * Delete embeddings for a specific source
     */
    async deleteSourceEmbeddings(sourceType: 'notion' | 'drive' | 'local'): Promise<void> {
        const meta = await this.getMeta();
        const ids = Object.keys(meta[sourceType] || {});
        
        for (const id of ids) {
            const key = getStoreKey(sourceType, id);
            await del(key);
        }
        
        meta[sourceType] = {};
        await set(EMBEDDING_META_KEY, meta);
    },

    /**
     * Delete specific embeddings
     */
    async deleteEmbeddings(sourceType: 'notion' | 'drive' | 'local', ids: string[]): Promise<void> {
        const meta = await this.getMeta();
        
        for (const id of ids) {
            const key = getStoreKey(sourceType, id);
            await del(key);
            delete meta[sourceType][id];
        }
        
        await set(EMBEDDING_META_KEY, meta);
    },

    /**
     * Update last full sync timestamp
     */
    async updateLastSync(sourceType: 'notion' | 'drive' | 'local'): Promise<void> {
        const meta = await this.getMeta();
        meta.lastFullSync[sourceType] = Date.now();
        await set(EMBEDDING_META_KEY, meta);
    },

    /**
     * Get last full sync timestamp
     */
    async getLastSync(sourceType: 'notion' | 'drive' | 'local'): Promise<number | undefined> {
        const meta = await this.getMeta();
        return meta.lastFullSync[sourceType];
    },

    /**
     * Clear all embeddings
     */
    async clearAll(): Promise<void> {
        const meta = await this.getMeta();
        
        for (const sourceType of ['notion', 'drive', 'local'] as const) {
            const ids = Object.keys(meta[sourceType] || {});
            for (const id of ids) {
                const key = getStoreKey(sourceType, id);
                await del(key);
            }
        }
        
        await del(EMBEDDING_META_KEY);
    },

    /**
     * Detect changes between current remote state and stored embeddings
     * Returns lists of added, modified, deleted, and unchanged page/file IDs
     */
    async detectChanges(
        sourceType: 'notion' | 'drive' | 'local',
        remoteItems: Array<{ id: string; title: string; lastEditedTime?: string; modifiedTime?: string; contentHash?: string }>
    ): Promise<ChangeDetectionResult> {
        const meta = await this.getMeta();
        const storedItems = meta[sourceType] || {};
        
        const remoteMap = new Map(remoteItems.map(item => [item.id, item]));
        const storedIds = new Set(Object.keys(storedItems));
        const remoteIds = new Set(remoteItems.map(item => item.id));
        
        const added: string[] = [];
        const modified: string[] = [];
        const deleted: string[] = [];
        const unchanged: string[] = [];
        
        // Check for added and modified
        for (const item of remoteItems) {
            const stored = storedItems[item.id];
            if (!stored) {
                added.push(item.id);
            } else {
                // Compare timestamps or content hashes
                const remoteTime = item.lastEditedTime || item.modifiedTime;
                // Use type assertion since we know the sourceType
                const storedAny = stored as any;
                const storedTime = storedAny.lastEditedTime || storedAny.modifiedTime;
                const remoteHash = item.contentHash;
                const storedHash = storedAny.contentHash;
                
                let hasChanged = false;
                if (remoteHash && storedHash) {
                    hasChanged = remoteHash !== storedHash;
                } else if (remoteTime && storedTime) {
                    hasChanged = new Date(remoteTime).getTime() > new Date(storedTime).getTime();
                } else {
                    // Fallback: assume changed if we can't compare
                    hasChanged = true;
                }
                
                if (hasChanged) {
                    modified.push(item.id);
                } else {
                    unchanged.push(item.id);
                }
            }
        }
        
        // Check for deleted
        for (const storedId of storedIds) {
            if (!remoteIds.has(storedId)) {
                deleted.push(storedId);
            }
        }
        
        return { added, modified, deleted, unchanged };
    },

    /**
     * Get embeddings for a specific page/file (all chunks)
     */
    async getEmbeddingsForPage(sourceType: 'notion' | 'drive' | 'local', pageId: string): Promise<StoredEmbedding[]> {
        const meta = await this.getMeta();
        const results: StoredEmbedding[] = [];
        
        // Find all chunks belonging to this page
        const allKeys = await keys();
        const prefix = `${EMBEDDING_STORE_PREFIX}${sourceType}_${pageId}_chunk_`;
        
        for (const key of allKeys) {
            if (typeof key === 'string' && key.startsWith(prefix)) {
                const emb = await get<StoredEmbedding>(key);
                if (emb) results.push(emb);
            }
        }
        
        // Sort by chunk index
        return results.sort((a, b) => a.chunkIndex - b.chunkIndex);
    },

    /**
     * Update embeddings for a specific page/file (incremental update)
     * Deletes old chunks and stores new ones
     */
    async updatePageEmbeddings(
        sourceType: 'notion' | 'drive' | 'local',
        pageId: string,
        newEmbeddings: StoredEmbedding[]
    ): Promise<void> {
        // Delete old chunks for this page
        await this.deletePageEmbeddings(sourceType, pageId);
        
        // Store new chunks
        if (newEmbeddings.length > 0) {
            await this.storeEmbeddings(newEmbeddings);
        }
        
        // Update meta with page-level info
        const meta = await this.getMeta();
        const firstChunk = newEmbeddings[0];
        if (firstChunk) {
            if (!meta[sourceType]) meta[sourceType] = {};
            meta[sourceType][pageId] = {
                title: firstChunk.title,
                updatedAt: Date.now(),
                lastEditedTime: firstChunk.metadata?.lastEditedTime,
                modifiedTime: firstChunk.metadata?.modifiedTime,
                chunkCount: newEmbeddings.length,
                contentHash: firstChunk.contentHash
            };
            await set(EMBEDDING_META_KEY, meta);
        }
    },

    /**
     * Delete all embeddings for a specific page/file
     */
    async deletePageEmbeddings(sourceType: 'notion' | 'drive' | 'local', pageId: string): Promise<void> {
        const allKeys = await keys();
        const prefix = `${EMBEDDING_STORE_PREFIX}${sourceType}_${pageId}_chunk_`;
        
        for (const key of allKeys) {
            if (typeof key === 'string' && key.startsWith(prefix)) {
                await del(key);
            }
        }
        
        // Update meta
        const meta = await this.getMeta();
        if (meta[sourceType] && meta[sourceType][pageId]) {
            delete meta[sourceType][pageId];
            await set(EMBEDDING_META_KEY, meta);
        }
    },

    /**
     * Get page-level metadata (not chunk-level)
     */
    async getPageMeta(sourceType: 'notion' | 'drive' | 'local'): Promise<{ [pageId: string]: { title: string; updatedAt: number; lastEditedTime?: string; modifiedTime?: string; chunkCount: number; contentHash?: string } }> {
        const meta = await this.getMeta();
        return meta[sourceType] || {};
    },

    /**
     * Incremental sync: only process changed pages
     */
    async incrementalSync(
        sourceType: 'notion' | 'drive' | 'local',
        remoteItems: Array<{ id: string; title: string; lastEditedTime?: string; modifiedTime?: string; contentHash?: string }>,
        generateEmbeddingsFn: (items: Array<{ id: string; title: string }>) => Promise<StoredEmbedding[]>
    ): Promise<{ added: number; modified: number; deleted: number; unchanged: number }> {
        const changes = await this.detectChanges(sourceType, remoteItems);
        
        // Process added pages
        let addedCount = 0;
        if (changes.added.length > 0) {
            const itemsToAdd = remoteItems.filter(item => changes.added.includes(item.id));
            const newEmbeddings = await generateEmbeddingsFn(itemsToAdd);
            if (newEmbeddings.length > 0) {
                await this.storeEmbeddings(newEmbeddings);
                addedCount = changes.added.length;
            }
        }
        
        // Process modified pages
        let modifiedCount = 0;
        if (changes.modified.length > 0) {
            const itemsToUpdate = remoteItems.filter(item => changes.modified.includes(item.id));
            const newEmbeddings = await generateEmbeddingsFn(itemsToUpdate);
            if (newEmbeddings.length > 0) {
                // Group by pageId and update each
                const byPage = new Map<string, StoredEmbedding[]>();
                for (const emb of newEmbeddings) {
                    if (!byPage.has(emb.pageId)) byPage.set(emb.pageId, []);
                    byPage.get(emb.pageId)!.push(emb);
                }
                
                for (const [pageId, embeddings] of byPage) {
                    await this.updatePageEmbeddings(sourceType, pageId, embeddings);
                }
                modifiedCount = changes.modified.length;
            }
        }
        
        // Process deleted pages
        let deletedCount = 0;
        if (changes.deleted.length > 0) {
            for (const pageId of changes.deleted) {
                await this.deletePageEmbeddings(sourceType, pageId);
            }
            deletedCount = changes.deleted.length;
        }
        
        // Update last sync time
        await this.updateLastSync(sourceType);
        
        return {
            added: addedCount,
            modified: modifiedCount,
            deleted: deletedCount,
            unchanged: changes.unchanged.length
        };
    }
};