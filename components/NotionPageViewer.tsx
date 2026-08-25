import React, { useState, useEffect, useRef } from 'react';
import { notionService, fetchWithRetry } from '../services/notionService';
import { dataService } from '../services/dataService';
import type { NotionPageInfo, ParagraphBlock } from '../types';
import { ArrowLeftIcon, NotionIcon, DatabaseIcon, ImportIcon } from './icons';
import NotionBlockRenderer from './NotionBlockRenderer';
import { v4 as uuidv4 } from 'uuid';

const ProxiedNotionIcon = ({ url, className = 'w-12 h-12' }: { url: string, className?: string }) => {
    const [iconSrc, setIconSrc] = useState<string | null>(null);
    useEffect(() => {
        let objectUrl: string | null = null;
        const loadIcon = async () => {
            if (!url) return;
            try {
                const response = await fetchWithRetry(url, {});
                if (!response.ok) throw new Error('Failed to fetch icon');
                const blob = await response.blob();
                objectUrl = URL.createObjectURL(blob);
                setIconSrc(objectUrl);
            } catch (e) { 
                console.warn('Icon proxy load error, falling back:', e); 
                setIconSrc(url);
            }
        };
        loadIcon();
        return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [url]);

    if (!iconSrc) return <div className={`${className} rounded-sm bg-muted shimmer-bg`} />;
    return <img src={iconSrc} alt="icon" className={`${className} rounded-sm object-cover`} />;
};


interface NotionPageViewerProps {
    pageId: string;
    navigateToDashboard: () => void;
    navigateToNotionPage: (pageId: string, blockId?: string, timestamp?: number) => void;
    navigateToPage: (pageId: string) => void;
    highlightBlockId?: string;
    fromAi?: boolean;
    timestamp?: number;
    openPdfViewer: (url: string) => void;
    snippet?: string;
}

const findDeepestElementWithText = (text: string, root: HTMLElement): HTMLElement | null => {
    const normalizeText = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Find a clean alphanumeric substring to search for, avoiding formatting artifacts
    const cleanMatch = text.match(/[a-zA-Z0-9\s]{20,}/);
    const searchString = normalizeText(cleanMatch ? cleanMatch[0].substring(0, 40) : text.substring(0, 40));
    
    if (!searchString || searchString.length < 5) return null;

    let deepestElement: HTMLElement | null = null;
    const domElements = Array.from(root.querySelectorAll('div, p, h1, h2, h3, li, span'));
    
    for (const el of domElements) {
        if (el.textContent && normalizeText(el.textContent).includes(searchString)) {
            const hasChildWithText = Array.from(el.children).some(child => child.textContent && normalizeText(child.textContent).includes(searchString));
            if (!hasChildWithText) {
                deepestElement = el as HTMLElement;
                break;
            }
        }
    }
    return deepestElement;
};

const tagColors: { [key: string]: string } = {
    default: '#e0e0e0', gray: '#e3e2e0', brown: '#e8d4c5', orange: '#fde3cf',
    yellow: '#fbf3d3', green: '#d9eddb', blue: '#d3e5f4', purple: '#e8dff4',
    pink: '#f9dceb', red: '#fde2e2',
};
const getTagBgColor = (color: string) => tagColors[color] || tagColors.default;
const getTagTextColor = (color: string) => '#37352f';

const NotionObjectIcon = ({ item, className = 'w-12 h-12' }: { item: NotionPageInfo; className?: string }) => {
    if (item.object === 'database') {
        return <DatabaseIcon className={`${className} text-muted-foreground`} />;
    }
    if (item.icon.type === 'emoji' && item.icon.value) {
        return <span className="text-4xl md:text-5xl">{item.icon.value}</span>;
    }
    if ((item.icon.type === 'file' || item.icon.type === 'external') && item.icon.value) {
        return <ProxiedNotionIcon url={item.icon.value} className={className} />;
    }
    return <NotionIcon className={`${className} text-muted-foreground`} />;
};

const NotionPageViewer: React.FC<NotionPageViewerProps> = ({ pageId, navigateToDashboard, navigateToNotionPage, navigateToPage, highlightBlockId, fromAi, timestamp, openPdfViewer, snippet }) => {
    const [notionObject, setNotionObject] = useState<NotionPageInfo | null>(null);
    const [dbPages, setDbPages] = useState<NotionPageInfo[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    
    useEffect(() => {
        const apiKey = dataService.getNotionApiKey();
        if (!apiKey) {
            setError("Notion API key not found. Please connect your integration.");
            setIsLoading(false);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setNotionObject(null);
        setDbPages(null);
        
        notionService.getNotionObject(pageId, apiKey)
            .then(data => {
                if(data) {
                    setNotionObject(data);
                    if (data.object === 'database') {
                        return notionService.queryDatabase(data.id, apiKey);
                    }
                } else {
                    setError(`Failed to load content from Notion (ID: ${pageId}). Ensure the page exists and is shared with your integration.`);
                }
                return null;
            })
            .then(databasePages => {
                if (databasePages) {
                    setDbPages(databasePages);
                }
            })
            .catch(err => {
                console.error(err);
                setError(err.message || "An unexpected error occurred.");
            })
            .finally(() => setIsLoading(false));

    }, [pageId]);

    useEffect(() => {
        if (!isLoading && (highlightBlockId || snippet) && fromAi) {
            let attempts = 0;
            const blockIds = highlightBlockId ? highlightBlockId.split(',') : [];
            const interval = setInterval(() => {
                let elements: HTMLElement[] = [];
                
                if (snippet && mainRef.current) {
                    const el = findDeepestElementWithText(snippet, mainRef.current);
                    if (el) elements.push(el);
                }

                if (elements.length === 0) {
                    for (const id of blockIds) {
                        let element = document.getElementById(id);
                        
                        if (!element && id.length > 5 && mainRef.current) {
                            const el = findDeepestElementWithText(id, mainRef.current);
                            if (el) element = el;
                        }
                        if (element) {
                            elements.push(element);
                        }
                    }
                }

                if (elements.length > 0 || attempts > 100) { // Poll for ~10 seconds
                    clearInterval(interval);
                    if (elements.length > 0) {
                        for (const element of elements) {
                            // Open parent toggles if hidden
                            let parent = element.parentElement;
                            while (parent) {
                                if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) {
                                    parent.setAttribute('open', 'true');
                                }
                                parent = parent.parentElement;
                            }
                        }

                        // Small delay to allow layout to update after opening toggles
                        setTimeout(() => {
                            elements[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            for (const element of elements) {
                                element.classList.add('permanent-highlight');
                            }
                            
                            const removeHighlight = () => {
                                for (const element of elements) {
                                    element.classList.remove('permanent-highlight');
                                }
                                document.removeEventListener('click', removeHighlight);
                            };
                            
                            // Add event listener after a small delay to avoid immediate trigger
                            setTimeout(() => {
                                document.addEventListener('click', removeHighlight);
                            }, 100);
                        }, 100);
                    } else if (mainRef.current) {
                        mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }
                attempts++;
            }, 100); // Check every 100ms
            return () => clearInterval(interval);
        }
    }, [isLoading, highlightBlockId, fromAi, timestamp, snippet]);

    const handleImport = async () => {
        if (!notionObject) return;
        setIsImporting(true);
        const apiKey = dataService.getNotionApiKey();
        if (apiKey) {
            try {
                const fullObject = await notionService.getNotionObject(notionObject.id, apiKey);
                if (fullObject) {
                    const newPage = dataService.importNotionPage(fullObject);
                    navigateToPage(newPage.id);
                }
            } catch (e) {
                console.error("Import failed", e);
                setError("Failed to import page.");
            } finally {
                setIsImporting(false);
            }
        }
    };
    
    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-8 overflow-y-auto flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-3xl mx-auto text-center">
                    <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-semibold">
                        <ArrowLeftIcon className="w-5 h-5" />
                        Back to Dashboard
                    </button>
                    <p className="p-4 bg-destructive/10 text-destructive rounded-md">{error}</p>
                </div>
            </main>
        );
    }
    
    if (!notionObject) {
        return (
             <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-3xl mx-auto text-center">
                     <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-semibold">
                        <ArrowLeftIcon className="w-5 h-5" />
                        Back to Dashboard
                    </button>
                    <p>Notion object not found.</p>
                </div>
            </main>
        );
    }

    return (
        <main id={pageId} ref={mainRef} className="flex-1 p-4 md:p-8 overflow-y-auto animate-fade-in">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-start mb-8">
                    <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-semibold">
                        <ArrowLeftIcon className="w-5 h-5" />
                        Back
                    </button>
                    {notionObject.object === 'page' && (
                        <button 
                            onClick={handleImport} 
                            disabled={isImporting}
                            className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                        >
                            <ImportIcon className="w-4 h-4"/>
                            {isImporting ? 'Importing...' : 'Import to Aurenex'}
                        </button>
                    )}
                </div>

                <header className="mb-10 animate-fade-in-up">
                    <div className="mb-4"><NotionObjectIcon item={notionObject} /></div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">{notionObject.title}</h1>
                     {notionObject.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {notionObject.tags.map(tag => (
                                <span key={tag.id} style={{ backgroundColor: getTagBgColor(tag.color), color: getTagTextColor(tag.color) }} className="px-2 py-1 text-xs font-semibold rounded-full">
                                    {tag.name}
                                </span>
                            ))}
                        </div>
                    )}
                </header>

                <div className="prose dark:prose-invert max-w-none prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-primary prose-blockquote:border-primary prose-li:my-0">
                    {notionObject.object === 'page' && notionObject.content?.map(block => (
                        <NotionBlockRenderer key={block.id} block={block} navigateToNotionPage={navigateToNotionPage} openPdfViewer={openPdfViewer} jumpToTime={block.id === highlightBlockId ? timestamp : undefined} />
                    ))}
                    {notionObject.object === 'database' && (
                        <>
                           {notionObject.description && notionObject.description.length > 0 && (
                                <div className="mb-6"><NotionBlockRenderer block={{ id: uuidv4(), type: 'paragraph', has_children: false, paragraph: { rich_text: notionObject.description, color: 'default' } } as ParagraphBlock} navigateToNotionPage={navigateToNotionPage} openPdfViewer={openPdfViewer} /></div>
                           )}
                           <div className="space-y-3 not-prose">
                                {dbPages?.map(page => (
                                    <button key={page.id} onClick={() => navigateToNotionPage(page.id)} className="w-full flex items-center gap-3 p-3 text-left rounded-lg border bg-card hover:bg-accent transition-colors">
                                        <NotionObjectIcon item={page} className="w-6 h-6" />
                                        <span className="font-medium text-foreground">{page.title}</span>
                                    </button>
                                ))}
                           </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
};

export default NotionPageViewer;