import { notionService } from './notionService';
import { googleDriveService, DriveFile } from './googleDriveService';
import { dataService } from './dataService';
import { embeddingStore, ChangeDetectionResult } from './embeddingStore';

/**
 * Change Detection Engine for Incremental Embedding Sync
 * Compares remote state (Notion/Drive/Local) with stored embeddings
 * to determine what needs to be added, modified, or deleted
 */

export interface RemotePageInfo {
    id: string;
    title: string;
    lastEditedTime?: string; // Notion
    modifiedTime?: string;   // Drive
    mimeType?: string;       // Drive
    contentHash?: string;    // Local/content hash
}

/**
 * Fetch all accessible Notion pages with their last_edited_time
 */
export async function fetchNotionPagesWithMetadata(apiKey: string): Promise<RemotePageInfo[]> {
    try {
        const pages = await notionService.listAccessiblePages(apiKey);
        return pages.map(page => ({
            id: page.id,
            title: page.title,
            lastEditedTime: page.last_edited_time // This comes from Notion API search results
        }));
    } catch (error) {
        console.error('Failed to fetch Notion pages with metadata:', error);
        return [];
    }
}

/**
 * Fetch all selected Drive files with their modifiedTime and mimeType
 */
export async function fetchDriveFilesWithMetadata(accessToken: string, selectedFiles: DriveFile[]): Promise<RemotePageInfo[]> {
    try {
        // Get full file metadata including modifiedTime
        const fileIds = selectedFiles.map(f => f.id);
        const filesWithMetadata: RemotePageInfo[] = [];
        
        // Fetch in batches to avoid URL length limits
        const batchSize = 50;
        for (let i = 0; i < fileIds.length; i += batchSize) {
            const batch = fileIds.slice(i, i + batchSize);
            const idsParam = batch.map(id => `'${id}'`).join(',');
            const query = `id in (${idsParam}) and trashed = false`;
            
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=${batchSize}`,
                {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }
            );
            
            if (!response.ok) {
                console.warn(`Failed to fetch Drive file metadata batch ${i}:`, response.statusText);
                continue;
            }
            
            const data = await response.json();
            for (const file of data.files || []) {
                filesWithMetadata.push({
                    id: file.id,
                    title: file.name,
                    modifiedTime: file.modifiedTime,
                    mimeType: file.mimeType
                });
            }
        }
        
        return filesWithMetadata;
    } catch (error) {
        console.error('Failed to fetch Drive files with metadata:', error);
        return [];
    }
}

/**
 * Fetch all local pages with content hashes
 */
export async function fetchLocalPagesWithMetadata(): Promise<RemotePageInfo[]> {
    try {
        const pages = dataService.getPages();
        const { subtle } = await import('crypto');
        
        const pagesWithHashes: RemotePageInfo[] = [];
        
        for (const page of pages) {
            // Extract text content
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
            if (text && text.length >= 50) {
                // Generate content hash
                const encoder = new TextEncoder();
                const data = encoder.encode(text);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                pagesWithHashes.push({
                    id: page.id,
                    title: page.title,
                    contentHash
                });
            }
        }
        
        return pagesWithHashes;
    } catch (error) {
        console.error('Failed to fetch local pages with metadata:', error);
        return [];
    }
}

/**
 * Detect changes for Notion
 */
export async function detectNotionChanges(apiKey: string): Promise<ChangeDetectionResult> {
    const remotePages = await fetchNotionPagesWithMetadata(apiKey);
    return embeddingStore.detectChanges('notion', remotePages);
}

/**
 * Detect changes for Drive
 */
export async function detectDriveChanges(accessToken: string, selectedFiles: DriveFile[]): Promise<ChangeDetectionResult> {
    const remoteFiles = await fetchDriveFilesWithMetadata(accessToken, selectedFiles);
    return embeddingStore.detectChanges('drive', remoteFiles);
}

/**
 * Detect changes for Local
 */
export async function detectLocalChanges(): Promise<ChangeDetectionResult> {
    const remotePages = await fetchLocalPagesWithMetadata();
    return embeddingStore.detectChanges('local', remotePages);
}

/**
 * Detect changes for all sources
 */
export async function detectAllChanges(): Promise<{
    notion: ChangeDetectionResult;
    drive: ChangeDetectionResult;
    local: ChangeDetectionResult;
}> {
    const integrations = dataService.getIntegrations();
    
    const [notionChanges, driveChanges, localChanges] = await Promise.all([
        integrations.notion?.apiKey ? detectNotionChanges(integrations.notion.apiKey) : Promise.resolve({ added: [], modified: [], deleted: [], unchanged: [] }),
        integrations.googleDrive?.accessToken && integrations.googleDrive.selectedFiles?.length > 0 
            ? detectDriveChanges(integrations.googleDrive.accessToken, integrations.googleDrive.selectedFiles)
            : Promise.resolve({ added: [], modified: [], deleted: [], unchanged: [] }),
        detectLocalChanges()
    ]);
    
    return { notion: notionChanges, drive: driveChanges, local: localChanges };
}

/**
 * Quick check if any source has changes (for app startup)
 * Returns true if any source has added/modified/deleted items
 */
export async function hasAnyChanges(): Promise<boolean> {
    const changes = await detectAllChanges();
    return (
        changes.notion.added.length > 0 || changes.notion.modified.length > 0 || changes.notion.deleted.length > 0 ||
        changes.drive.added.length > 0 || changes.drive.modified.length > 0 || changes.drive.deleted.length > 0 ||
        changes.local.added.length > 0 || changes.local.modified.length > 0 || changes.local.deleted.length > 0
    );
}

/**
 * Get summary of changes for UI display
 */
export async function getChangesSummary(): Promise<{
    notion: { added: number; modified: number; deleted: number };
    drive: { added: number; modified: number; deleted: number };
    local: { added: number; modified: number; deleted: number };
    total: number;
}> {
    const changes = await detectAllChanges();
    
    return {
        notion: { added: changes.notion.added.length, modified: changes.notion.modified.length, deleted: changes.notion.deleted.length },
        drive: { added: changes.drive.added.length, modified: changes.drive.modified.length, deleted: changes.drive.deleted.length },
        local: { added: changes.local.added.length, modified: changes.local.modified.length, deleted: changes.local.deleted.length },
        total: changes.notion.added.length + changes.notion.modified.length + changes.notion.deleted.length +
               changes.drive.added.length + changes.drive.modified.length + changes.drive.deleted.length +
               changes.local.added.length + changes.local.modified.length + changes.local.deleted.length
    };
}