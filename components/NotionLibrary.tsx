

import React, { useState, useEffect } from 'react';
import { ArrowLeftIcon, NotionIcon, DatabaseIcon, SearchIcon } from './icons';
import { dataService } from '../services/dataService';
import { notionService } from '../services/notionService';
import type { NotionPageInfo, NotionTag, ImageBlock } from '../types';
import { useDebounce } from 'use-debounce';
import { NotionImage } from './NotionBlockRenderer';

interface NotionLibraryProps {
    navigateToDashboard: () => void;
    navigateToNotionPage: (pageId: string) => void;
}

const NotionObjectIcon = ({ item }: { item: NotionPageInfo }) => {
    if (item.object === 'database') return <DatabaseIcon className="w-6 h-6 text-muted-foreground"/>;
    if (item.icon?.type === 'emoji' && item.icon.value) return <span className="text-2xl">{item.icon.value}</span>;
    if ((item.icon?.type === 'file' || item.icon?.type === 'external') && item.icon.value) {
        const imageUrl = item.icon.value;
        const mockBlock: ImageBlock = {
            id: item.id,
            type: 'image',
            has_children: false,
            image: {
                type: item.icon.type as 'file' | 'external',
                caption: [],
                ...(item.icon.type === 'external'
                    ? { external: { url: imageUrl } }
                    : { file: { url: imageUrl, expiry_time: new Date(Date.now() + 3600 * 1000).toISOString() } })
            }
        };
        return <NotionImage block={mockBlock} className="w-6 h-6 rounded-sm object-cover" />;
    }
    return <NotionIcon className="w-6 h-6 text-muted-foreground"/>;
};

const NotionLibrary: React.FC<NotionLibraryProps> = ({ navigateToDashboard, navigateToNotionPage }) => {
    const [allPages, setAllPages] = useState<NotionPageInfo[]>([]);
    const [filteredPages, setFilteredPages] = useState<NotionPageInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
    const [uniqueTags, setUniqueTags] = useState<NotionTag[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

    useEffect(() => {
        const apiKey = dataService.getNotionApiKey();
        if (!apiKey) {
            setError("Notion is not connected.");
            setIsLoading(false);
            return;
        }

        const fetchLibrary = async () => {
            try {
                let pages = await notionService.listAccessiblePages(apiKey);
                let persistentCached = await dataService.getNotionPagesCache();
                
                if ((!persistentCached || persistentCached.length === 0) || pages.length === 0) {
                    await notionService.syncAllAccessiblePages(apiKey);
                    pages = await notionService.listAccessiblePages(apiKey);
                }

                setAllPages(pages);
                setFilteredPages(pages);
                const tagsMap = new Map<string, NotionTag>();
                const db = dataService.getDb();
                const pageTags = db.integrations.notion?.pageTags || {};

                pages.forEach(page => {
                    const aiTags = pageTags[page.id] || [];
                    aiTags.forEach(tag => {
                        if (!tagsMap.has(tag)) {
                            tagsMap.set(tag, { id: tag, name: tag, color: 'default' });
                        }
                    });
                });
                setUniqueTags(Array.from(tagsMap.values()));
            } catch (err) {
                console.error(err);
                setError("Failed to fetch Notion content.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchLibrary();
    }, []);

    useEffect(() => {
        let filtered = allPages;

        if (debouncedSearchTerm) {
            const lowercasedFilter = debouncedSearchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.title.toLowerCase().includes(lowercasedFilter)
            );
        }

        if (selectedTagIds.length > 0) {
            const db = dataService.getDb();
            const pageTags = db.integrations.notion?.pageTags || {};
            filtered = filtered.filter(item => {
                const aiTags = pageTags[item.id] || [];
                // "AND" logic: page must have ALL selected tags
                return selectedTagIds.every(selectedTagId =>
                    aiTags.includes(selectedTagId)
                );
            });
        }

        setFilteredPages(filtered);
    }, [debouncedSearchTerm, selectedTagIds, allPages]);

    const handleTagClick = (tagId: string) => {
        setSelectedTagIds(current => 
            current.includes(tagId) 
                ? current.filter(id => id !== tagId) 
                : [...current, tagId]
        );
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center text-muted-foreground">Loading your Notion workspace...</div>;
        if (error) return <div className="text-center text-destructive">{error}</div>;
        if (filteredPages.length === 0) return <div className="text-center text-muted-foreground">No pages found.</div>;

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPages.map(item => (
                    <button key={item.id} onClick={() => navigateToNotionPage(item.id)}
                            className="w-full text-left p-4 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-4 group animate-fade-in-up">
                        <NotionObjectIcon item={item}/>
                        <span className="font-semibold text-foreground truncate">{item.title}</span>
                    </button>
                ))}
            </div>
        );
    };

    return (
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-muted/50 animate-fade-in">
            <div className="max-w-6xl mx-auto">
                <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-semibold">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back to Dashboard
                </button>
                
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">Notion Library</h1>
                    <p className="text-muted-foreground mt-2">
                        Browse all pages and databases from your connected Notion workspace.
                    </p>
                </div>

                <div className="relative mb-4">
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by title..." 
                        className="w-full bg-background border rounded-md py-2 px-4 pl-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                </div>
                
                {uniqueTags.length > 0 && (
                    <div className="mb-8 flex flex-wrap gap-2">
                        {uniqueTags.map(tag => (
                            <button
                                key={tag.id}
                                onClick={() => handleTagClick(tag.id)}
                                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                                    selectedTagIds.includes(tag.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent'
                                }`}
                            >
                                {tag.name}
                            </button>
                        ))}
                    </div>
                )}
                
                {renderContent()}
            </div>
        </main>
    );
};

export default NotionLibrary;
