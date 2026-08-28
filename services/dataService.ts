import { BlockType } from '../types';
import type { Page, Block, User, Integrations, NotionPageInfo, NotionBlock, RichText, ImageBlock, Gender, ChatSession, ChatMessage, TaggableItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { notionService } from './notionService';
import { get, set, del } from 'idb-keyval';

const initialPages: Page[] = [
  {
    id: 'getting-started',
    title: 'Getting Started with Aurenex',
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    content: [
      { id: uuidv4(), type: BlockType.H1, content: 'Welcome to Aurenex' },
      { id: uuidv4(), type: BlockType.P, content: 'Aurenex is your personal knowledge base. This is a Notion-style editor. Try typing `/` on a new line to see the available commands.' },
      { id: uuidv4(), type: BlockType.H2, content: 'Meet Your AI Agent' },
      { id: uuidv4(), type: BlockType.P, content: 'Your AI assistant, AurePal, is now a powerful agent. It can search Google, create new pages, and even add content like images and tables directly to your notes.' },
      { id: uuidv4(), type: BlockType.TODO, content: `Try asking AurePal: "What are the latest headlines about space exploration?"`, checked: false },
      { id: uuidv4(), type: BlockType.TODO, content: `Then ask it: "Add a picture of the Orion Nebula to this page."`, checked: false },
      { id: uuidv4(), type: BlockType.DIVIDER, content: ''},
      { id: uuidv4(), type: BlockType.H2, content: 'Connect Your Tools' },
      { id: uuidv4(), type: BlockType.P, content: 'Visit the new "Integrations" page from the sidebar to connect apps like Notion. Once connected, AurePal can search for information across all your knowledge sources.'},
      { id: uuidv4(), type: BlockType.QUOTE, content: 'The only source of knowledge is experience.' },
      { id: uuidv4(), type: BlockType.H3, content: 'Organize Data with Tables' },
      { id: uuidv4(), type: BlockType.P, content: 'Use the `/table` command to create a new table, or just ask AurePal to make one for you.' },
      { 
          id: uuidv4(),
          type: BlockType.TABLE,
          content: '',
          tableData: {
              rows: [
                  { id: uuidv4(), cells: [{id: uuidv4(), content: 'Task Name'}, {id: uuidv4(), content: 'Status'}, {id: uuidv4(), content: 'Due Date'}] },
                  { id: uuidv4(), cells: [{id: uuidv4(), content: 'Design new logo'}, {id: uuidv4(), content: 'In Progress'}, {id: uuidv4(), content: 'Tomorrow'}] },
                  { id: uuidv4(), cells: [{id: uuidv4(), content: 'Write documentation'}, {id: uuidv4(), content: 'Not Started'}, {id: uuidv4(), content: 'Next Week'}] },
              ]
          }
      },
    ],
  },
];

const defaultUser: User = {
    name: 'Aurenex User',
    email: 'user@aurenex.app',
    avatarUrl: `https://i.pravatar.cc/150?u=default`,
    onboardingComplete: true,
    aiPersonality: 'aurepal',
    aiProvider: 'gemini',
    age: undefined,
    gender: 'prefer_not_to_say',
};

const DB_KEY = 'aurenex_data';
const CHAT_STORAGE_KEY = 'aurenex_chat_sessions_v2';
const ACTIVE_CHAT_KEY = 'aurenex_active_chat_id';
const CHAT_ATTACHMENT_PREFIX = 'aurenex_chat_attachment:';
const NOTION_CACHE_KEY = 'aurenex_notion_pages_cache';
const GOOGLE_DRIVE_CACHE_KEY = 'aurenex_google_drive_cache';

interface AppData {
    pages: Page[];
    integrations: Integrations;
    user: User;
    chats: ChatSession[];
}

let inMemorySessionsCache: ChatSession[] | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let chatWriteQueue: Promise<void> = Promise.resolve();

function enqueueChatWrite(operation: () => Promise<void>): Promise<void> {
    chatWriteQueue = chatWriteQueue.catch(() => {}).then(operation);
    return chatWriteQueue;
}

function getBlocksText(blocks: Block[]): string {
    if (!blocks) return '';
    let text = '';
    for (const block of blocks.filter(Boolean)) {
        text += (block.content || '').replace(/<[^>]*>?/gm, '') + ' ';
        if (block.children) text += getBlocksText(block.children);
        if (block.tableData) {
            block.tableData.rows.forEach(row => row.cells.forEach(cell => { text += (cell.content || '').replace(/<[^>]*>?/gm, '') + ' '; }));
        }
    }
    return text;
}

function notionRichTextToHtml(richText: RichText[]): string {
    if (!Array.isArray(richText)) return '';
    return richText.map(rt => {
        let text = rt.plain_text || '';
        if (rt.annotations.bold) text = `<strong>${text}</strong>`;
        if (rt.annotations.italic) text = `<em>${text}</em>`;
        if (rt.annotations.strikethrough) text = `<del>${text}</del>`;
        if (rt.annotations.underline) text = `<u>${text}</u>`;
        if (rt.annotations.code) text = `<code class="bg-muted text-foreground px-1 py-0.5 rounded-sm font-mono text-sm">${text}</code>`;
        if (rt.href) text = `<a href="${rt.href}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${text}</a>`;
        return text;
    }).join('');
}

function convertNotionBlocks(notionBlocks: NotionBlock[]): Block[] {
    if (!notionBlocks) return [];
    const aurenexBlocks: Block[] = [];
    
    for (const block of notionBlocks.filter(Boolean)) {
        let newBlock: Block | null = null;
        switch (block.type) {
            case 'heading_1': newBlock = { id: uuidv4(), type: BlockType.H1, content: notionRichTextToHtml(block.heading_1!.rich_text) }; break;
            case 'heading_2': newBlock = { id: uuidv4(), type: BlockType.H2, content: notionRichTextToHtml(block.heading_2!.rich_text) }; break;
            case 'heading_3': newBlock = { id: uuidv4(), type: BlockType.H3, content: notionRichTextToHtml(block.heading_3!.rich_text) }; break;
            case 'paragraph': newBlock = { id: uuidv4(), type: BlockType.P, content: notionRichTextToHtml(block.paragraph.rich_text) }; break;
            case 'bulleted_list_item': newBlock = { id: uuidv4(), type: BlockType.UL, content: notionRichTextToHtml(block.bulleted_list_item!.rich_text) }; break;
            case 'numbered_list_item': newBlock = { id: uuidv4(), type: BlockType.OL, content: notionRichTextToHtml(block.numbered_list_item!.rich_text) }; break;
            case 'to_do': newBlock = { id: uuidv4(), type: BlockType.TODO, content: notionRichTextToHtml(block.to_do.rich_text), checked: block.to_do.checked }; break;
            case 'quote': newBlock = { id: uuidv4(), type: BlockType.QUOTE, content: notionRichTextToHtml(block.quote.rich_text) }; break;
            case 'divider': newBlock = { id: uuidv4(), type: BlockType.DIVIDER, content: '' }; break;
            case 'toggle': newBlock = { id: uuidv4(), type: BlockType.TOGGLE, content: notionRichTextToHtml(block.toggle.rich_text), isOpen: false }; break;
            case 'code': newBlock = { id: uuidv4(), type: BlockType.CODE, content: notionRichTextToHtml(block.code.rich_text) }; break;
            case 'image': const img = block as ImageBlock; const rawImgUrl = img.image.type === 'external' ? img.image.external!.url : img.image.file!.url; newBlock = { id: uuidv4(), type: BlockType.IMAGE, url: rawImgUrl, content: notionRichTextToHtml(img.image.caption) }; break;
        }

        if (newBlock) {
            if (block.has_children && block.children) {
                newBlock.children = convertNotionBlocks(block.children);
            }
            aurenexBlocks.push(newBlock);
        }
    }
    return aurenexBlocks;
}

function getDb(): AppData {
    try {
        const data = localStorage.getItem(DB_KEY);
        if (data) {
            const parsedData = JSON.parse(data);
            if (!parsedData.user) parsedData.user = defaultUser;
            if (!parsedData.integrations) parsedData.integrations = { notion: { apiKey: null, pageTags: {} }, googleDrive: { accessToken: null, selectedFiles: [], fileTags: {} } };
            if (!parsedData.chats) parsedData.chats = [];
            return parsedData;
        }
    } catch (error) {
        console.error("Failed to read from localStorage", error);
    }
    const defaultData: AppData = {
        pages: initialPages,
        integrations: {
            notion: { apiKey: null },
            googleDrive: { accessToken: null, selectedFiles: [] }
        },
        user: defaultUser,
        chats: [],
    };
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(defaultData));
    } catch (e) {
        console.error("Failed to initialize localStorage", e);
    }
    return defaultData;
}

function saveDb(data: AppData) {
    try {
        const dataForStorage = JSON.parse(JSON.stringify(data));
        localStorage.setItem(DB_KEY, JSON.stringify(dataForStorage));
    } catch (error) {
        console.error("Failed to save to localStorage", error);
    }
}

export const dataService = {
    getDb,
    getUser: (): User => getDb().user,

    updateUser: (updatedFields: Partial<User>): void => {
        const db = getDb();
        db.user = { ...db.user, ...updatedFields };
        saveDb(db);
    },

    getPages: (): Page[] => getDb().pages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),

    getRecentPages: (count: number = 4): Page[] => {
        return getDb().pages
            .filter(p => p.lastAccessedAt)
            .sort((a, b) => new Date(b.lastAccessedAt!).getTime() - new Date(a.lastAccessedAt!).getTime())
            .slice(0, count);
    },

    getPage: (id: string): Page | undefined => getDb().pages.find(p => p.id === id),

    getPageByTitle: (title: string): Page | undefined => {
        const lowercasedTitle = title.toLowerCase().trim();
        return getDb().pages.find(p => p.title.toLowerCase().trim() === lowercasedTitle);
    },

    getPageTitlesAndIds: (): { id: string; title: string }[] => getDb().pages.map(p => ({ id: p.id, title: p.title })),

    createPage: (title: string, content: Block[], notionId?: string): Page => {
        const db = getDb();
        const now = new Date().toISOString();
        const newPage: Page = { id: uuidv4(), title, content, createdAt: now, lastAccessedAt: now, notionId };
        db.pages.push(newPage);
        saveDb(db);
        return newPage;
    },

    updatePage: (updatedPage: Page): Page => {
        const db = getDb();
        const index = db.pages.findIndex(p => p.id === updatedPage.id);
        if (index !== -1) {
            db.pages[index] = updatedPage;
            saveDb(db);
        }
        return updatedPage;
    },

    recordPageAccess: (pageId: string): void => {
        const db = getDb();
        const index = db.pages.findIndex(p => p.id === pageId);
        if (index !== -1) {
            db.pages[index].lastAccessedAt = new Date().toISOString();
            saveDb(db);
        }
    },

    deletePage: (id: string): void => {
        const db = getDb();
        db.pages = db.pages.filter(p => p.id !== id);
        saveDb(db);
    },

    getIntegrations: (): Integrations => getDb().integrations,

    saveNotionApiKey: (apiKey: string): void => {
        const db = getDb();
        db.integrations.notion.apiKey = apiKey;
        saveDb(db);
    },

    getNotionApiKey: (): string | null => getDb().integrations.notion.apiKey,

    disconnectNotion: (): void => {
        const db = getDb();
        db.integrations.notion.apiKey = null;
        saveDb(db);
    },

    saveGoogleDriveIntegration: (accessToken: string, selectedFiles: { id: string, name: string, mimeType: string }[]): void => {
        const db = getDb();
        db.integrations.googleDrive = { accessToken, expiresAt: Date.now() + 3500 * 1000, selectedFiles };
        saveDb(db);
    },

    saveAutoScopePreference: (preference: 'notion' | 'drive' | 'both'): void => {
        const db = getDb();
        db.integrations.autoScopePreference = preference;
        saveDb(db);
    },

    getGoogleDriveIntegration: () => getDb().integrations.googleDrive,

    disconnectGoogleDrive: (): void => {
        const db = getDb();
        db.integrations.googleDrive = { accessToken: null, selectedFiles: [] };
        saveDb(db);
    },

    getChatSessionsAsync: async (): Promise<ChatSession[]> => {
        if (inMemorySessionsCache) {
            return inMemorySessionsCache;
        }
        try {
            const sessions = await get<ChatSession[]>(CHAT_STORAGE_KEY);
            if (Array.isArray(sessions) && sessions.length > 0) {
                inMemorySessionsCache = sessions;
                return sessions;
            }
        } catch (e) {
            console.warn("Failed to read chat sessions from IndexedDB, fallback to localStorage", e);
        }
        const legacySessions = getDb().chats;
        inMemorySessionsCache = legacySessions;
        if (legacySessions.length > 0) {
            await set(CHAT_STORAGE_KEY, legacySessions);
        }
        return legacySessions;
    },

    getChatSessions: (): ChatSession[] => {
        if (inMemorySessionsCache) {
            return inMemorySessionsCache;
        }
        return getDb().chats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    saveChatSessionAsync: (session: ChatSession): Promise<void> => {
        return enqueueChatWrite(async () => {
            const sessions = await dataService.getChatSessionsAsync();
            const index = sessions.findIndex(s => s.id === session.id);
            const cloned = structuredClone(session);

            if (index >= 0) {
                sessions[index] = cloned;
            } else {
                sessions.unshift(cloned);
            }
            inMemorySessionsCache = sessions;
            await set(CHAT_STORAGE_KEY, sessions);

            const db = getDb();
            db.chats = sessions;
            saveDb(db);
        });
    },

    saveChatSession: (session: ChatSession): void => {
        dataService.saveChatSessionAsync(session).catch(e => console.error("Async save failed", e));
    },

    scheduleChatPersistence: (session: ChatSession): void => {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            dataService.saveChatSessionAsync(session);
            persistTimer = null;
        }, 250);
    },

    deleteChatSessionAsync: (sessionId: string): Promise<void> => {
        return enqueueChatWrite(async () => {
            const sessions = await dataService.getChatSessionsAsync();
            const filtered = sessions.filter(s => s.id !== sessionId);
            inMemorySessionsCache = filtered;
            await set(CHAT_STORAGE_KEY, filtered);

            const db = getDb();
            db.chats = filtered;
            saveDb(db);
        });
    },

    deleteChatSession: (sessionId: string): void => {
        dataService.deleteChatSessionAsync(sessionId).catch(e => console.error("Async delete failed", e));
    },

    getActiveChatSessionId: (): string | null => {
        try {
            return localStorage.getItem(ACTIVE_CHAT_KEY);
        } catch {
            return null;
        }
    },

    setActiveChatSessionId: (id: string): void => {
        try {
            localStorage.setItem(ACTIVE_CHAT_KEY, id);
        } catch {
            // ignore
        }
    },

    saveAttachmentBlob: async (attachmentId: string, blob: Blob): Promise<string> => {
        const key = `${CHAT_ATTACHMENT_PREFIX}${attachmentId}`;
        await set(key, blob);
        return key;
    },

    getAttachmentBlob: async (attachmentId: string): Promise<Blob | null> => {
        const key = `${CHAT_ATTACHMENT_PREFIX}${attachmentId}`;
        const blob = await get<Blob>(key);
        return blob || null;
    },

    getTaggableItems: async (): Promise<TaggableItem[]> => {
        const taggableItems: TaggableItem[] = [];
        const aurenexPages = dataService.getPages();
        aurenexPages.forEach(p => {
            taggableItems.push({ id: p.id, title: p.title, type: 'aurenex_page' });
        });
        return taggableItems.sort((a, b) => a.title.localeCompare(b.title));
    },

    getNotionPagesCache: async (): Promise<NotionPageInfo[] | null> => {
        try {
            const data = await get(NOTION_CACHE_KEY);
            return data ? data.pages : null;
        } catch {
            return null;
        }
    },

    setNotionPagesCache: async (pages: NotionPageInfo[]): Promise<void> => {
        await set(NOTION_CACHE_KEY, { timestamp: Date.now(), pages });
    },

    clearNotionPagesCache: async (): Promise<void> => {
        await del(NOTION_CACHE_KEY);
    },

    getGoogleDriveCache: async (): Promise<any[] | null> => {
        try {
            const data = await get(GOOGLE_DRIVE_CACHE_KEY);
            return data ? data.files : null;
        } catch {
            return null;
        }
    },

    setGoogleDriveCache: async (files: any[]): Promise<void> => {
        await set(GOOGLE_DRIVE_CACHE_KEY, { timestamp: Date.now(), files });
    },

    clearGoogleDriveCache: async (): Promise<void> => {
        await del(GOOGLE_DRIVE_CACHE_KEY);
    },

    importNotionPage: (notionPage: NotionPageInfo): Page => {
        const content = convertNotionBlocks(notionPage.content || []);
        return dataService.createPage(notionPage.title, content, notionPage.id);
    },

    getBlocksText: (blocks: Block[]): string => getBlocksText(blocks),
};
