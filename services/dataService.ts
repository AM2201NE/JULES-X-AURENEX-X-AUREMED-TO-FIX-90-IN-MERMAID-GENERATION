

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
   {
    id: 'project-management',
    title: 'Project Management Best Practices',
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    content: [
      { id: uuidv4(), type: BlockType.H1, content: 'Project Management Best Practices' },
      { id: uuidv4(), type: BlockType.P, content: 'Effective project management is key to success. Methodologies like Agile and Scrum help teams deliver value iteratively.' },
      { id: uuidv4(), type: BlockType.UL, content: 'Key principles include clear communication' },
      { id: uuidv4(), type: BlockType.UL, content: 'Defined roles' },
      { id: uuidv4(), type: BlockType.UL, content: 'Regular feedback loops' },
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
const NOTION_CACHE_KEY = 'aurenex_notion_pages_cache';
const GOOGLE_DRIVE_CACHE_KEY = 'aurenex_google_drive_cache';

interface AppData {
    pages: Page[];
    integrations: Integrations;
    user: User;
    chats: ChatSession[];
}

function getDb(): AppData {
    try {
        const data = localStorage.getItem(DB_KEY);
        if (data) {
            const parsedData = JSON.parse(data);
             if (!parsedData.user) {
                parsedData.user = defaultUser;
            }
            if (!parsedData.integrations) {
                parsedData.integrations = { notion: { apiKey: null, pageTags: {} }, googleDrive: { accessToken: null, selectedFiles: [], fileTags: {} } };
            } else {
                if (!parsedData.integrations.googleDrive) {
                    parsedData.integrations.googleDrive = { accessToken: null, selectedFiles: [], fileTags: {} };
                } else if (!parsedData.integrations.googleDrive.fileTags) {
                    parsedData.integrations.googleDrive.fileTags = {};
                }
                if (!parsedData.integrations.notion) {
                    parsedData.integrations.notion = { apiKey: null, pageTags: {} };
                } else if (!parsedData.integrations.notion.pageTags) {
                    parsedData.integrations.notion.pageTags = {};
                }
            }
            if (!parsedData.chats) {
                parsedData.chats = [];
            }
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
        // Create a deep copy to avoid mutating the in-memory state of the app.
        const dataForStorage = JSON.parse(JSON.stringify(data));

        // Strip large, derived base64 image data before saving to prevent exceeding localStorage quota.
        // This keeps images available in the live application state for the current session.
        if (dataForStorage.chats) {
            for (const session of dataForStorage.chats) {
                for (const msg of session.messages) {
                    // Strip Anki card images
                    if (msg.ankiCards) {
                        for (const card of msg.ankiCards) {
                            delete (card as any).question_image_b64;
                        }
                    }
                    // Strip user attachments data which is stored as base64
                    if (msg.attachments) {
                        for (const attachment of msg.attachments) {
                            // 'data' holds the large base64 string
                            delete (attachment as any).data;
                        }
                    }
                    // Strip image analysis source image if it's a data URI
                    if (msg.imageAnalyses) {
                         for (const analysis of msg.imageAnalyses) {
                            if (analysis.imageUri && analysis.imageUri.startsWith('data:')) {
                                // 'imageUri' can be a large data URI
                                delete (analysis as any).imageUri;
                            }
                        }
                    }
                }
            }
        }

        localStorage.setItem(DB_KEY, JSON.stringify(dataForStorage));
    } catch (error) {
        console.error("Failed to save to localStorage", error);
        // We can't do much more if it still fails, as it means the base data is too large.
    }
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

const getBlocksText = (blocks: Block[]): string => {
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
};

export const dataService = {
    getDb,
    getUser: (): User => {
        return getDb().user;
    },

    updateUser: (updatedFields: Partial<User>): void => {
        const db = getDb();
        const currentUser = db.user;
        const newUser = { ...currentUser, ...updatedFields };
        db.user = newUser;
        saveDb(db);
    },

    getPages: (): Page[] => {
        return getDb().pages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    getRecentPages: (count: number = 4): Page[] => {
        const pages = getDb().pages;
        return pages
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
    
    addBlockToPage: (pageId: string, block: Block): Page => {
        const db = getDb();
        const pageIndex = db.pages.findIndex(p => p.id === pageId);
        if (pageIndex === -1) throw new Error("Page not found");
        db.pages[pageIndex].content.push(block);
        saveDb(db);
        return db.pages[pageIndex];
    },

    deletePage: (id: string): void => {
        const db = getDb();
        db.pages = db.pages.filter(p => p.id !== id);
        saveDb(db);
    },

    searchPages: (query: string): Page[] => {
        const db = getDb();
        if (!query || typeof query !== 'string') return [];
        const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (keywords.length === 0) return [];
        return db.pages.filter(page => {
            const pageContent = `${page.title} ${getBlocksText(page.content)}`.toLowerCase();
            return keywords.some(keyword => pageContent.includes(keyword));
        });
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
        // Token expires in ~1 hour (3600s), set 3500s buffer
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
    
    importNotionPage: (notionPage: NotionPageInfo): Page => {
        const content = convertNotionBlocks(notionPage.content || []);
        return dataService.createPage(notionPage.title, content, notionPage.id);
    },

    getChatSessions: (): ChatSession[] => {
        return getDb().chats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    saveChatSession: (session: ChatSession): void => {
        const db = getDb();
        const index = db.chats.findIndex(c => c.id === session.id);
        if (index !== -1) {
            db.chats[index] = session;
        } else {
            db.chats.push(session);
        }
        saveDb(db);
    },

    deleteChatSession: (sessionId: string): void => {
        const db = getDb();
        db.chats = db.chats.filter(c => c.id !== sessionId);
        saveDb(db);
    },

    getTaggableItems: async (): Promise<TaggableItem[]> => {
        const taggableItems: TaggableItem[] = [];
        
        // 1. Get Aurenex pages
        const aurenexPages = dataService.getPages();
        aurenexPages.forEach(p => {
            taggableItems.push({
                id: p.id,
                title: p.title,
                type: 'aurenex_page'
            });
        });

        // 2. Get Notion pages and tags
        const notionApiKey = dataService.getNotionApiKey();
        if (notionApiKey) {
            try {
                // Using the cached list is fast and efficient here
                const notionPages = await notionService.listAccessiblePages(notionApiKey);
                const notionTags = new Map<string, TaggableItem>();
                const db = getDb();
                const pageTags = db.integrations.notion?.pageTags || {};

                notionPages.forEach(p => {
                    const aiTags = pageTags[p.id] || [];
                    const nativeTags = p.tags || [];
                    
                    const combinedTagsMap = new Map<string, {name: string, color: string}>();
                    nativeTags.forEach(t => combinedTagsMap.set(t.name, {name: t.name, color: t.color}));
                    aiTags.forEach(t => {
                        if (!combinedTagsMap.has(t)) {
                            combinedTagsMap.set(t, {name: t, color: 'default'});
                        }
                    });
                    
                    taggableItems.push({
                        id: `notion-${p.id}`,
                        title: p.title,
                        type: 'notion_page',
                        notionPageId: p.id,
                        tags: Array.from(combinedTagsMap.values())
                    });

                    aiTags.forEach(tag => {
                        if (!notionTags.has(tag)) {
                            notionTags.set(tag, {
                                id: `notion_tag-${tag}`,
                                title: tag,
                                type: 'notion_tag',
                                color: 'default'
                            });
                        }
                    });
                    
                    nativeTags.forEach(tag => {
                        if (!notionTags.has(tag.name)) {
                            notionTags.set(tag.name, {
                                id: `notion_tag-${tag.name}`,
                                title: tag.name,
                                type: 'notion_tag',
                                color: tag.color
                            });
                        }
                    });
                });
                
                taggableItems.push(...Array.from(notionTags.values()));
            } catch(e) {
                console.warn("Could not fetch Notion taggable items:", e);
            }
        }
        
        // 3. Get Google Drive files
        const driveIntegration = dataService.getGoogleDriveIntegration();
        if (driveIntegration?.accessToken && driveIntegration.selectedFiles.length > 0) {
            driveIntegration.selectedFiles.forEach(file => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const fileTags = driveIntegration.fileTags?.[file.id] || [];
                taggableItems.push({
                    id: file.id,
                    title: file.name,
                    subtitle: file.path ? `Google Drive • ${file.path}` : 'Google Drive', 
                    type: 'drive_file',
                    isFolder,
                    tags: fileTags.map(t => ({ name: t, color: 'blue' }))
                });
            });
        }
        
        return taggableItems.sort((a, b) => a.title.localeCompare(b.title));
    },

    setNotionPagesCache: async (pages: NotionPageInfo[]): Promise<void> => {
        try {
            const cacheData = { timestamp: Date.now(), pages };
            await set(NOTION_CACHE_KEY, cacheData);
        } catch (error) {
            console.error("Failed to save Notion cache to IndexedDB", error);
        }
    },

    getNotionPagesCache: async (): Promise<NotionPageInfo[] | null> => {
        try {
            const data = await get(NOTION_CACHE_KEY);
            if (data) {
                const { timestamp, pages } = data;
                // Cache for 1 hour
                if (Date.now() - timestamp < 60 * 60 * 1000) {
                    return pages;
                }
            }
        } catch (error) {
            console.error("Failed to read Notion cache from IndexedDB", error);
        }
        return null;
    },

    clearNotionPagesCache: async (): Promise<void> => {
        await del(NOTION_CACHE_KEY);
    },

    setGoogleDriveCache: async (files: any[]): Promise<void> => {
        try {
            const cacheData = { timestamp: Date.now(), files };
            await set(GOOGLE_DRIVE_CACHE_KEY, cacheData);
        } catch (error) {
            console.error("Failed to save Google Drive cache to IndexedDB", error);
        }
    },

    getGoogleDriveCache: async (): Promise<any[] | null> => {
        try {
            const data = await get(GOOGLE_DRIVE_CACHE_KEY);
            if (data) {
                const { timestamp, files } = data;
                // Cache for 1 hour
                if (Date.now() - timestamp < 60 * 60 * 1000) {
                    return files;
                }
            }
        } catch (error) {
            console.error("Failed to read Google Drive cache from IndexedDB", error);
        }
        return null;
    },

    clearGoogleDriveCache: async (): Promise<void> => {
        await del(GOOGLE_DRIVE_CACHE_KEY);
    },
    
    getBlocksText,
};