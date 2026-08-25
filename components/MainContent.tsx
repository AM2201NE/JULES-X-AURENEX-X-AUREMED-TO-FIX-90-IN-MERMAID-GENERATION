import React, { useState, useEffect } from 'react';
import Card from './Card';
import { PlusIcon, NotionIcon, DatabaseIcon, BookOpenIcon, ClockIcon, CloudIcon } from './icons';
import { dataService } from '../services/dataService';
import { notionService, fetchWithRetry } from '../services/notionService';
import { googleDriveService, DriveFile } from '../services/googleDriveService';
import type { Page, NotionPageInfo, User } from '../types';
import { BlockType } from '../types';
import { v4 as uuidv4 } from 'uuid';

const ProxiedNotionIcon = ({ url, className = 'w-5 h-5' }: { url: string, className?: string }) => {
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

const WelcomeHeader = ({ user }: { user: User | null }) => {
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
    };

    return (
        <div className="mb-8 md:mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                {getGreeting()}, {user?.name.split(' ')[0] || 'there'}.
            </h1>
            <p className="text-lg text-muted-foreground mt-2">Welcome back to your knowledge hub.</p>
        </div>
    );
};

const RecentPages = ({ pages, navigateToPage }: { pages: Page[]; navigateToPage: (pageId: string) => void; }) => {
    return (
        <Card>
            <div className="flex items-center gap-3 mb-4">
                <ClockIcon className="w-5 h-5 text-muted-foreground"/>
                <h3 className="text-lg font-semibold text-foreground">Quick Access</h3>
            </div>
            <div className="space-y-3">
                {pages.map(page => (
                    <button key={page.id} onClick={() => navigateToPage(page.id)}
                            className="w-full text-left p-3 rounded-md hover:bg-accent transition-colors flex items-center gap-3 group">
                        <BookOpenIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors"/>
                        <span className="font-medium text-foreground truncate">{page.title}</span>
                    </button>
                ))}
            </div>
        </Card>
    );
};

const NotionPreview = ({ notionContent, navigateToNotionPage, navigateToNotionLibrary }: { notionContent: NotionPageInfo[]; navigateToNotionPage: (pageId: string) => void; navigateToNotionLibrary: () => void; }) => {
    const NotionObjectIcon = ({ item }: { item: NotionPageInfo }) => {
        if (item.object === 'database') {
            return <DatabaseIcon className="w-5 h-5 text-muted-foreground"/>;
        }
        if (item.icon?.type === 'emoji' && item.icon.value) {
            return <span className="text-xl">{item.icon.value}</span>;
        }
        if ((item.icon?.type === 'file' || item.icon.type === 'external') && item.icon.value) {
            return <ProxiedNotionIcon url={item.icon.value} />;
        }
        return <NotionIcon className="w-5 h-5 text-muted-foreground"/>;
    };

    return (
        <Card>
            <div className="flex items-center gap-3 mb-4">
                <NotionIcon className="w-5 h-5 text-muted-foreground"/>
                <h3 className="text-lg font-semibold text-foreground">Notion Workspace</h3>
            </div>
            <div className="space-y-3">
                {notionContent.slice(0, 4).map(item => (
                    <button key={item.id} onClick={() => navigateToNotionPage(item.id)}
                            className="w-full text-left p-3 rounded-md hover:bg-accent transition-colors flex items-center gap-3 group">
                        <NotionObjectIcon item={item}/>
                        <span className="font-medium text-foreground truncate">{item.title}</span>
                    </button>
                ))}
            </div>
             {notionContent.length > 4 && (
                <button onClick={navigateToNotionLibrary} className="w-full text-sm font-semibold mt-4 p-2 bg-secondary hover:bg-muted rounded-md transition-colors">
                    View all
                </button>
            )}
        </Card>
    );
};

const SkeletonCard = ({ className = '' }: { className?: string }) => (
    <div className={`p-6 bg-card rounded-lg border border-border ${className}`}>
        <div className="h-6 w-1/2 mb-4 rounded shimmer-bg"></div>
        <div className="space-y-3">
            <div className="h-8 w-full rounded shimmer-bg"></div>
            <div className="h-8 w-5/6 rounded shimmer-bg"></div>
            <div className="h-8 w-3/4 rounded shimmer-bg"></div>
        </div>
    </div>
);


const DrivePreview = ({ driveContent, navigateToDriveLibrary }: { driveContent: DriveFile[]; navigateToDriveLibrary: () => void; }) => {
    return (
        <Card className="mt-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <CloudIcon className="w-5 h-5 text-blue-500" />
                    Google Drive
                </h3>
            </div>
            <div className="space-y-2">
                {driveContent.slice(0, 4).map(item => (
                    <div 
                        key={item.id} 
                        className="w-full text-left p-3 rounded-lg bg-accent/50 flex items-center gap-3"
                    >
                        <div className="w-8 h-8 bg-background border rounded flex items-center justify-center flex-shrink-0">
                            <span className="text-muted-foreground text-xl">
                                {item.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}
                            </span>
                        </div>
                        <span className="font-medium text-foreground truncate">{item.name}</span>
                    </div>
                ))}
            </div>
             {driveContent.length > 0 && (
                <button onClick={navigateToDriveLibrary} className="w-full text-sm font-semibold mt-4 p-2 bg-secondary hover:bg-muted rounded-md transition-colors">
                    Browse Drive
                </button>
            )}
        </Card>
    );
};

const MainContent: React.FC<{
    navigateToPage: (pageId: string) => void;
    navigateToNotionPage: (pageId: string) => void;
    navigateToIntegrations: () => void;
    navigateToNotionLibrary: () => void;
    navigateToDriveLibrary: () => void;
}> = ({ navigateToPage, navigateToNotionPage, navigateToIntegrations, navigateToNotionLibrary, navigateToDriveLibrary }) => {
    const [user, setUser] = useState<User | null>(null);
    const [recentPages, setRecentPages] = useState<Page[]>([]);
    const [notionContent, setNotionContent] = useState<NotionPageInfo[]>([]);
    const [driveContent, setDriveContent] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isNotionConnected, setIsNotionConnected] = useState(false);
    const [isDriveConnected, setIsDriveConnected] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            
            setUser(dataService.getUser());
            setRecentPages(dataService.getRecentPages(4));
            
            const notionApiKey = dataService.getNotionApiKey();
            if (notionApiKey) {
                setIsNotionConnected(true);
                try {
                    // Always try to heal missing cache if it was interrupted
                    let persistentCached = await dataService.getNotionPagesCache();
                    let content = await notionService.listAccessiblePages(notionApiKey, 5);
                    
                    // If we have API key but NO persistent cache was ever stored, or content length is 0 due to an interrupted sync, force a massive sync check
                    if ((!persistentCached || persistentCached.length === 0) || content.length === 0) {
                        await notionService.syncAllAccessiblePages(notionApiKey);
                        content = await notionService.listAccessiblePages(notionApiKey, 5);
                    }
                    
                    setNotionContent(content);
                } catch (error) {
                    console.error("Failed to fetch notion content", error);
                    setIsNotionConnected(false); // Assume connection error
                }
            } else {
                setIsNotionConnected(false);
            }

            const driveIntegration = dataService.getGoogleDriveIntegration();
            if (driveIntegration?.accessToken) {
                const isExpired = driveIntegration.expiresAt ? Date.now() > driveIntegration.expiresAt : false;
                if (!isExpired) {
                    setIsDriveConnected(true);
                    try {
                        const files = await googleDriveService.getFiles(driveIntegration.accessToken, 'root');
                        setDriveContent(files);
                    } catch (error: any) {
                        const errStr = String(error.message || error);
                        if (errStr.includes("expired") || errStr.includes("401")) {
                            setIsDriveConnected(false);
                            dataService.disconnectGoogleDrive();
                        } else {
                            console.error("Failed to load Drive content for dashboard:", error);
                        }
                    }
                } else {
                    setIsDriveConnected(false);
                    dataService.disconnectGoogleDrive();
                }
            } else {
                setIsDriveConnected(false);
            }
            
            setTimeout(() => setIsLoading(false), 500); // Simulate loading
        };
        fetchData();
    }, []);

    const handleCreateNewPage = () => {
        const newPage = dataService.createPage('Untitled', [{ id: uuidv4(), type: BlockType.H1, content: 'Untitled' }]);
        navigateToPage(newPage.id);
    };

    return (
        <main className="flex-1 p-4 md:p-8 overflow-y-auto animate-fade-in">
            <div className="max-w-6xl mx-auto">
                <WelcomeHeader user={user} />

                <div className="mb-8 flex justify-end">
                    <button onClick={handleCreateNewPage} className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95">
                        <PlusIcon className="w-5 h-5"/>
                        New Page
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {isLoading ? (
                        <>
                            <SkeletonCard className="md:col-span-1 lg:col-span-2" />
                            <SkeletonCard />
                        </>
                    ) : (
                        <>
                            <div className="md:col-span-1 lg:col-span-2">
                                <RecentPages pages={recentPages} navigateToPage={navigateToPage} />
                            </div>
                            <div>
                                {isNotionConnected && notionContent.length > 0 && (
                                    <NotionPreview notionContent={notionContent} navigateToNotionPage={navigateToNotionPage} navigateToNotionLibrary={navigateToNotionLibrary} />
                                )}
                                {isNotionConnected && notionContent.length === 0 && (
                                     <Card>
                                        <div className="flex items-center gap-3 mb-4">
                                            <NotionIcon className="w-5 h-5 text-amber-500"/>
                                            <h3 className="text-lg font-semibold text-foreground">Notion: 0 Pages Found</h3>
                                        </div>
                                        <p className="text-muted-foreground text-sm mb-4">
                                            Your Notion API key is verified, but no pages were found. 
                                            You must explicitly share pages with this integration from inside Notion (top right menu "..." &gt; Add connections).
                                        </p>
                                        <button 
                                            onClick={async () => {
                                                const key = dataService.getNotionApiKey();
                                                if (key) {
                                                    const content = await notionService.listAccessiblePages(key, 5);
                                                    setNotionContent(content);
                                                }
                                            }} 
                                            className="w-full text-sm font-semibold p-2 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 rounded-md transition-colors border border-amber-500/20">
                                            Refresh Pages Check
                                        </button>
                                     </Card>
                                )}
                                {!isNotionConnected && (
                                     <Card>
                                        <div className="flex items-center gap-3 mb-4">
                                            <NotionIcon className="w-5 h-5 text-muted-foreground"/>
                                            <h3 className="text-lg font-semibold text-foreground">Connect Notion</h3>
                                        </div>
                                        <p className="text-muted-foreground text-sm mb-4">Unlock more power by connecting your Notion workspace.</p>
                                        <button onClick={navigateToIntegrations} className="w-full text-sm font-semibold p-2 bg-secondary hover:bg-muted rounded-md transition-colors">
                                            Go to Integrations
                                        </button>
                                     </Card>
                                )}

                                {isDriveConnected && driveContent.length > 0 && (
                                    <DrivePreview driveContent={driveContent} navigateToDriveLibrary={navigateToDriveLibrary} />
                                )}
                                {!isDriveConnected && (
                                     <Card className="mt-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <CloudIcon className="w-5 h-5 text-muted-foreground"/>
                                            <h3 className="text-lg font-semibold text-foreground">Connect Google Drive</h3>
                                        </div>
                                        <p className="text-muted-foreground text-sm mb-4">Bring your Google Drive files into Cog-RAG for unified search and AI assistance.</p>
                                        <button onClick={navigateToIntegrations} className="w-full text-sm font-semibold p-2 bg-secondary hover:bg-muted rounded-md transition-colors">
                                            Go to Integrations
                                        </button>
                                     </Card>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
};

export default MainContent;