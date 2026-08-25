import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { NotionBlock, RichText as RichTextType, ImageBlock, VideoBlock, AudioBlock, FileBlock, CalloutBlock, BookmarkBlock, EmbedBlock, ChildPageBlock, ChildDatabaseBlock, SyncedBlock, TableBlock, TableRowBlock, LinkPreviewBlock, TableOfContentsBlock, BreadcrumbBlock, EquationBlock } from '../types';
import { ChevronRightIcon, FileIcon, BookmarkIcon, ExternalLinkIcon, NotionIcon, DatabaseIcon, InfoIcon, CopyIcon } from './icons';
import { dataService } from '../services/dataService';
import { notionService, fetchWithRetry } from '../services/notionService';

export const NotionImage: React.FC<{ block: ImageBlock; className?: string }> = ({ block, className }) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const isMountedRef = useRef(true);

    const alt = extractTextFromRichText(block.image.caption);

    useEffect(() => {
        isMountedRef.current = true;
        let currentObjectURL: string | null = null;

        const loadImage = async () => {
            if (isMountedRef.current) {
                setStatus('loading');
                setImageSrc(null);
            }

            let imageUrl = block.image.type === 'external'
                ? block.image.external?.url
                : block.image.file?.url;

            const expiryTime = block.image.type === 'file' ? block.image.file?.expiry_time : null;

            if (expiryTime && new Date(expiryTime).getTime() - 60000 < Date.now()) {
                const apiKey = dataService.getNotionApiKey();
                if (apiKey) {
                    console.warn(`Display image URL for block ${block.id} expired. Fetching fresh URL...`);
                    const freshBlock = await notionService.getFreshBlock(block.id, apiKey);
                    if (freshBlock && freshBlock.type === 'image' && (freshBlock as ImageBlock).image.type === 'file') {
                        imageUrl = (freshBlock as ImageBlock).image.file!.url;
                        console.log(`Successfully fetched fresh display URL for block ${block.id}`);
                    }
                }
            }

            if (!imageUrl) {
                if (isMountedRef.current) setStatus('error');
                return;
            }

            try {
                // fetchWithRetry handles proxy prepending automatically
                const response = await fetchWithRetry(imageUrl, {});
                if (!response.ok) {
                    throw new Error(`Failed to fetch image. Status: ${response.status}`);
                }
                const blob = await response.blob();
                if (isMountedRef.current) {
                    currentObjectURL = URL.createObjectURL(blob);
                    setImageSrc(currentObjectURL);
                    setStatus('loaded');
                }
            } catch (error) {
                console.warn(`Error loading image via robust fetch:`, error, "Falling back to direct URL.");
                if (isMountedRef.current) {
                    setImageSrc(imageUrl);
                    setStatus('loaded');
                }
            }
        };

        loadImage();

        return () => {
            isMountedRef.current = false;
            if (currentObjectURL) {
                URL.revokeObjectURL(currentObjectURL);
            }
        };
    }, [block, retry]);

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRetry(c => c + 1);
    };

    return (
        <div className={`relative w-full overflow-hidden rounded-md border bg-muted aspect-video ${className}`}>
            {status !== 'loaded' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    {status === 'loading' && <div className="w-full h-full shimmer-bg" />}
                    {status === 'error' && (
                        <div className="p-2 text-muted-foreground">
                            <InfoIcon className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-xs font-semibold">Failed to load image</p>
                            <button onClick={handleRetry} className="mt-2 text-xs font-semibold px-2 py-1 bg-secondary hover:bg-accent rounded-md">Retry</button>
                        </div>
                    )}
                </div>
            )}
            {status === 'loaded' && imageSrc && (
                 <img 
                    src={imageSrc} 
                    alt={alt}
                    className={`transition-opacity duration-300 w-full h-full object-contain opacity-100`}
                    loading="lazy"
                />
            )}
        </div>
    );
};

const ProxiedMedia: React.FC<{
    block: VideoBlock | AudioBlock;
    jumpToTime?: number;
}> = ({ block, jumpToTime }) => {
    const isVideo = block.type === 'video';
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
    const [mediaSrc, setMediaSrc] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        let objectUrl: string | null = null;
        
        const loadMedia = async () => {
            if(isMountedRef.current) setStatus('loading');
            
            const mediaInfo = isVideo ? (block as VideoBlock).video : (block as AudioBlock).audio;
            let rawUrl = mediaInfo.type === 'external' ? mediaInfo.external?.url : mediaInfo.file?.url;

            if (!rawUrl) {
                if(isMountedRef.current) setStatus('error');
                return;
            }

            try {
                const response = await fetchWithRetry(rawUrl, {});
                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                const blob = await response.blob();
                if(isMountedRef.current) {
                    objectUrl = URL.createObjectURL(blob);
                    setMediaSrc(objectUrl);
                    setStatus('loaded');
                }
            } catch(e) {
                console.error('Error loading media via robust fetch', e);
                if(isMountedRef.current) {
                    setMediaSrc(rawUrl);
                    setStatus('loaded');
                }
            }
        };
        loadMedia();

        return () => {
            isMountedRef.current = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [block, retry, isVideo]);

    useEffect(() => {
        if (mediaRef.current && jumpToTime !== undefined && status === 'loaded') {
            const player = mediaRef.current;
            const startTime = jumpToTime;
            const onCanPlay = () => {
                player.currentTime = startTime;
                player.play().catch(e => console.error("Autoplay failed:", e));
            };
            if (player.readyState >= 3) onCanPlay();
            else player.addEventListener('canplay', onCanPlay, { once: true });
            return () => player.removeEventListener('canplay', onCanPlay);
        }
    }, [jumpToTime, status]);

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRetry(c => c + 1);
    };

    const mediaProps = {
        ref: mediaRef as any,
        controls: true,
        src: mediaSrc || '',
    };
    
    const containerClasses = `relative w-full overflow-hidden rounded-md border bg-muted ${isVideo ? 'aspect-video' : 'h-20'}`;

    if (status !== 'loaded' || !mediaSrc) {
        return (
            <div className={containerClasses}>
                {status === 'loading' && <div className="w-full h-full shimmer-bg" />}
                {status === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 text-muted-foreground">
                        <InfoIcon className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-xs font-semibold">Failed to load media</p>
                        <button onClick={handleRetry} className="mt-2 text-xs font-semibold px-2 py-1 bg-secondary hover:bg-accent rounded-md">Retry</button>
                    </div>
                )}
            </div>
        );
    }
    
    if (isVideo) {
        return <video {...mediaProps} className="w-full rounded-md border" />;
    } else {
        return <audio {...mediaProps} className="w-full" />;
    }
};


const NotionIconSmall = ({ isDb = false }: { isDb?: boolean }) => {
    const Icon = isDb ? DatabaseIcon : NotionIcon;
    return <Icon className="w-5 h-5 text-foreground flex-shrink-0" />;
}

const extractTextFromRichText = (richText: RichTextType[]): string => {
    if (!Array.isArray(richText)) return '';
    return richText.map(rt => rt.plain_text || '').join('');
};

const RichText: React.FC<{ richText: RichTextType[], navigateToNotionPage: (pageId: string, blockId?: string) => void }> = ({ richText, navigateToNotionPage }) => {
    if (!Array.isArray(richText)) return null;

    const handleInternalLinkClick = async (e: React.MouseEvent, pageTitle: string) => {
        e.stopPropagation();
        const page = dataService.getPageByTitle(pageTitle);
        if (page) {
            console.warn(`Internal link to Aurenex page "${pageTitle}" found but not handled here.`);
        } else {
             const apiKey = dataService.getNotionApiKey();
             if(apiKey) {
                const results = await notionService.searchNotion(pageTitle, apiKey);
                const matchingPage = results.find(r => r.title.toLowerCase() === pageTitle.toLowerCase());
                if (matchingPage) {
                    navigateToNotionPage(matchingPage.id);
                }
             }
        }
    }


    return (
        <>
            {richText.map((rt, i) => {
                let element: React.ReactElement;

                if (rt.type === 'mention' && rt.mention?.type === 'page') {
                    const pageId = rt.mention.page.id;
                    element = (
                        <button 
                            onClick={(e) => { e.stopPropagation(); navigateToNotionPage(pageId); }} 
                            className="text-primary bg-primary/10 px-1 py-0.5 rounded-md hover:bg-primary/20 transition-colors inline-flex items-center gap-1 not-prose"
                        >
                            <NotionIconSmall /> {rt.plain_text}
                        </button>
                    );
                } else if (rt.type === 'equation') {
                    element = (
                        <span 
                            ref={el => { 
                                if(el) {
                                    if ((window as any).renderLatex) {
                                        (window as any).renderLatex(el, rt.equation?.expression, false);
                                    } else {
                                        el.textContent = `$${rt.equation?.expression}$`;
                                        (window as any).renderDynamicContent?.(el); 
                                    }
                                }
                            }}
                            className="katex-inline px-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
                            title="Click to copy LaTeX"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(`$${rt.equation?.expression}$`);
                            }}
                        >
                            {`$${rt.equation?.expression}$`}
                        </span>
                    );
                } else {
                    element = <>{rt.text?.content}</>;
                }

                if (rt.annotations.bold) element = <strong>{element}</strong>;
                if (rt.annotations.italic) element = <em>{element}</em>;
                if (rt.annotations.strikethrough) element = <del>{element}</del>;
                if (rt.annotations.underline) element = <u>{element}</u>;
                if (rt.annotations.code) element = <code className="bg-muted text-foreground px-1.5 py-1 rounded-md font-mono text-sm">{element}</code>;

                if (rt.href) {
                    if (rt.href.startsWith('/') && !rt.href.startsWith('//')) {
                        const pageId = rt.href.split('/').pop()?.split('-').pop();
                        if (pageId) {
                            return (
                                <button 
                                    key={i} 
                                    onClick={(e) => { e.stopPropagation(); navigateToNotionPage(pageId); }}
                                    className="text-primary underline hover:opacity-80"
                                >
                                    {element}
                                </button>
                            );
                        }
                    }
                    element = <a href={rt.href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80 break-all">{element}</a>;
                }

                return <React.Fragment key={i}>{element}</React.Fragment>;
            })}
        </>
    );
};

interface NotionBlockRendererProps {
  block: NotionBlock;
  navigateToNotionPage: (pageId: string, blockId?: string, timestamp?: number) => void;
  openPdfViewer: (url: string) => void;
  jumpToTime?: number;
}

const FileBlockRenderer: React.FC<{
    fileBlock: FileBlock;
    navigateToNotionPage: (pageId: string, blockId?: string) => void;
    openPdfViewer: (url: string) => void;
}> = ({ fileBlock, navigateToNotionPage, openPdfViewer }) => {
    const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');

    const handleDownload = async () => {
        const rawFileUrl = fileBlock.file.type === 'external' ? fileBlock.file.external?.url : fileBlock.file.file?.url;
        if (!rawFileUrl) {
            setStatus('error');
            return;
        }

        setStatus('downloading');
        try {
            const response = await fetchWithRetry(rawFileUrl, {});
            if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileBlock.file.name || 'download';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setStatus('idle');
        } catch (error) {
            console.error('File download error:', error);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000); 
        }
    };
    
    const rawFileUrl = fileBlock.file.type === 'external' ? fileBlock.file.external?.url : fileBlock.file.file?.url;

    if (rawFileUrl && fileBlock.file.name.toLowerCase().endsWith('.pdf')) {
        return (
            <button onClick={() => openPdfViewer(rawFileUrl)} className="flex items-center gap-3 p-3 my-2 bg-muted hover:bg-accent rounded-md border transition-colors not-prose w-full text-left">
                <FileIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{fileBlock.file.name}</p>
                    {fileBlock.file.caption.length > 0 && <p className="text-sm text-muted-foreground"><RichText richText={fileBlock.file.caption} navigateToNotionPage={navigateToNotionPage} /></p>}
                </div>
                <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full">View PDF</span>
            </button>
        );
    }

    return (
        <button onClick={handleDownload} disabled={status === 'downloading'} className="flex items-center gap-3 p-3 my-2 bg-muted hover:bg-accent rounded-md border transition-colors not-prose w-full text-left disabled:opacity-70 disabled:cursor-not-allowed">
            <FileIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{fileBlock.file.name}</p>
                {fileBlock.file.caption.length > 0 && <p className="text-sm text-muted-foreground"><RichText richText={fileBlock.file.caption} navigateToNotionPage={navigateToNotionPage} /></p>}
            </div>
            <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full">
                {status === 'idle' && 'Download'}
                {status === 'downloading' && '...'}
                {status === 'error' && 'Retry'}
            </span>
        </button>
    );
};


const SyncedBlockRenderer: React.FC<{ block: SyncedBlock } & Omit<NotionBlockRendererProps, 'block'>> = ({ block, ...props }) => {
    const [syncedChildren, setSyncedChildren] = useState<NotionBlock[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const syncSourceId = block.synced_block.synced_from?.block_id;
        if (syncSourceId) {
             const apiKey = dataService.getNotionApiKey();
             if (apiKey) {
                setIsLoading(true);
                notionService.getBlockChildren(syncSourceId, apiKey)
                    .then(setSyncedChildren)
                    .catch(e => console.error("Failed to fetch synced block", e))
                    .finally(() => setIsLoading(false));
             }
        } else {
            setSyncedChildren(block.children || []);
            setIsLoading(false);
        }
    }, [block]);

    if(isLoading) return <div className="p-4 my-2 border-dashed border-2 rounded-md text-muted-foreground animate-pulse">Loading synced content...</div>;
    if(!syncedChildren) return null;

    return (
      <div className="p-2 my-2 border-l-2 border-border/70">
        {syncedChildren.map(child => <NotionBlockRenderer key={child.id} block={child} {...props} />)}
      </div>
    );
};


const NotionBlockRendererInternal: React.FC<NotionBlockRendererProps> = ({ block, navigateToNotionPage, openPdfViewer, jumpToTime }) => {
    const renderRichText = (text: RichTextType[]) => <RichText richText={text} navigateToNotionPage={navigateToNotionPage} />;
    
    const renderChildren = (children?: NotionBlock[]) => children?.filter(Boolean).map(child => <NotionBlockRenderer key={child.id} block={child} navigateToNotionPage={navigateToNotionPage} openPdfViewer={openPdfViewer} />);

    switch (block.type) {
        case 'paragraph': return <p>{renderRichText(block.paragraph.rich_text)}</p>;
        case 'heading_1': return <h1>{renderRichText(block.heading_1!.rich_text)}</h1>;
        case 'heading_2': return <h2>{renderRichText(block.heading_2!.rich_text)}</h2>;
        case 'heading_3': return <h3>{renderRichText(block.heading_3!.rich_text)}</h3>;
        case 'bulleted_list_item': return <ul className="list-disc list-outside pl-6 my-1"><li>{renderRichText(block.bulleted_list_item!.rich_text)}{block.children && <div className="my-1">{renderChildren(block.children)}</div>}</li></ul>;
        case 'numbered_list_item': return <ol className="list-decimal list-outside pl-6 my-1"><li>{renderRichText(block.numbered_list_item!.rich_text)}{block.children && <div className="my-1">{renderChildren(block.children)}</div>}</li></ol>;
        case 'to_do': return <div className="flex items-start gap-2 my-1 not-prose"><input type="checkbox" checked={block.to_do.checked} readOnly className="w-4 h-4 rounded mt-1 text-primary bg-input border-border focus:ring-ring" /><div className={`${block.to_do.checked ? 'line-through text-muted-foreground' : ''}`}>{renderRichText(block.to_do.rich_text)}{block.children && <div className="my-1 text-foreground">{renderChildren(block.children)}</div>}</div></div>;
        case 'toggle': return <details className="my-1 not-prose group"><summary className="flex items-start cursor-pointer"><ChevronRightIcon className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-open:rotate-90 mr-1 mt-1 flex-shrink-0" /><div className="flex-1">{renderRichText(block.toggle.rich_text)}</div></summary>{block.children && <div className="pl-6 border-l-2 border-border/50 ml-2.5 prose dark:prose-invert max-w-none">{renderChildren(block.children)}</div>}</details>;
        case 'quote': return <blockquote>{renderRichText(block.quote.rich_text)}{block.children && <div className="my-1">{renderChildren(block.children)}</div>}</blockquote>;
        case 'divider': return <hr className="my-8 border-border" />;
        case 'image':
            const img = block as ImageBlock;
            return (
                <figure className="my-4">
                    <NotionImage block={img} />
                    {img.image.caption.length > 0 && <figcaption className="text-center text-sm text-muted-foreground mt-2">{renderRichText(img.image.caption)}</figcaption>}
                </figure>
            );
        case 'video':
            const vid = block as VideoBlock;
            const rawVidUrl = vid.video.type === 'external' ? vid.video.external?.url : vid.video.file?.url;
            if (rawVidUrl?.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/)) {
                const videoIdMatch = rawVidUrl.match(/(?:v=|v\/|embed\/|youtu\.be\/|watch\?v=)([a-zA-Z0-9_-]{11})/);
                const videoId = videoIdMatch ? videoIdMatch[1] : null; if (!videoId) return <p className="text-destructive">Invalid YouTube URL</p>;
                let embedUrl = `https://www.youtube.com/embed/${videoId}`;
                if (jumpToTime !== undefined) embedUrl += `?start=${Math.round(jumpToTime)}&autoplay=1`;
                return <iframe width="100%" src={embedUrl} title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen className="my-4 rounded-md border aspect-video"></iframe>;
            }
            return <div className="my-4"><ProxiedMedia block={vid} jumpToTime={jumpToTime} /></div>;
        case 'audio':
            return <div className="my-4"><ProxiedMedia block={block as AudioBlock} jumpToTime={jumpToTime} /></div>;
        case 'file':
             return <FileBlockRenderer fileBlock={block as FileBlock} navigateToNotionPage={navigateToNotionPage} openPdfViewer={openPdfViewer} />;
        case 'code': return <pre className="bg-muted p-4 rounded-md my-4 overflow-x-auto text-sm font-mono not-prose"><code>{renderRichText(block.code.rich_text)}</code></pre>;
        case 'equation':
            const eqBlock = block as EquationBlock;
            return (
                <div className="my-4 relative group/math">
                    <div 
                        className="katex-display overflow-x-auto p-4 bg-muted/30 rounded-md" 
                        ref={el => { 
                            if(el) {
                                if ((window as any).renderLatex) {
                                    (window as any).renderLatex(el, eqBlock.equation.expression, true);
                                } else {
                                    el.textContent = `$$${eqBlock.equation.expression}$$`;
                                    (window as any).renderDynamicContent?.(el); 
                                }
                            }
                        }}
                    />
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(`$$${eqBlock.equation.expression}$$`);
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover/math:opacity-100 p-1.5 bg-background border rounded text-muted-foreground hover:text-foreground transition-all shadow-sm"
                        title="Copy LaTeX"
                    >
                        <CopyIcon className="w-4 h-4"/>
                    </button>
                </div>
            );
        case 'column_list': return <div className="flex flex-col md:flex-row gap-4 my-2 not-prose">{renderChildren(block.children)}</div>;
        case 'column': return <div className="flex-1 min-w-0 prose dark:prose-invert max-w-none">{renderChildren(block.children)}</div>;
        case 'callout': 
            const callout = block as CalloutBlock; 
            const bgColor = callout.callout.color.endsWith("_background") ? callout.callout.color : `${callout.callout.color}_background`;
            return <div className="p-4 my-2 rounded-lg flex gap-3 not-prose" style={{backgroundColor: `hsla(var(--notion-color-${bgColor}))`}}>
                <span className="text-xl mt-1">{callout.callout.icon.type === 'emoji' ? callout.callout.icon.emoji : '📄'}</span>
                <div className="flex-1 min-w-0">
                  <div className="prose dark:prose-invert max-w-none">{renderRichText(callout.callout.rich_text)}</div>
                  {block.children && <div className="mt-1 prose dark:prose-invert max-w-none">{renderChildren(block.children)}</div>}
                </div>
            </div>;
        case 'bookmark': 
        case 'link_preview':
            const bookmark = block as BookmarkBlock | LinkPreviewBlock;
            const url = 'bookmark' in bookmark ? bookmark.bookmark.url : bookmark.link_preview.url;
            const caption = 'bookmark' in bookmark ? bookmark.bookmark.caption : [];
            return <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 my-2 bg-muted hover:bg-accent rounded-md border transition-colors not-prose"> <BookmarkIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" /> <div className="flex-1 min-w-0"> <p className="font-medium text-foreground truncate">{url}</p> {caption.length > 0 && <p className="text-sm text-muted-foreground">{renderRichText(caption)}</p>} </div> <ExternalLinkIcon className="w-4 h-4 text-muted-foreground" /> </a>;
        case 'embed': const embed = block as EmbedBlock; return <iframe src={embed.embed.url} title={`Embed from ${embed.embed.url}`} frameBorder="0" className="my-4 w-full h-96 rounded-md border" />;
        case 'child_page': const child = block as ChildPageBlock; return <button onClick={() => navigateToNotionPage(child.id)} className="flex items-center gap-3 p-3 my-2 bg-muted hover:bg-accent rounded-md border transition-colors not-prose w-full text-left"> <NotionIconSmall /> <div className="flex-1 min-w-0"> <p className="font-medium text-foreground truncate">{child.child_page.title}</p> </div> <ChevronRightIcon className="w-5 h-5 text-muted-foreground" /> </button>;
        case 'child_database': const childDb = block as ChildDatabaseBlock; return <button onClick={() => navigateToNotionPage(childDb.id)} className="flex items-center gap-3 p-3 my-2 bg-muted hover:bg-accent rounded-md border transition-colors not-prose w-full text-left"> <NotionIconSmall isDb /> <div className="flex-1 min-w-0"> <p className="font-medium text-foreground truncate">{childDb.child_database.title}</p> </div> <ChevronRightIcon className="w-5 h-5 text-muted-foreground" /> </button>;
        case 'table': return <div className="overflow-x-auto my-4 not-prose"><table className="w-full border-collapse border border-border"><tbody>{renderChildren(block.children)}</tbody></table></div>;
        case 'table_row': const row = block as TableRowBlock; return <tr className="border-b border-border">{row.table_row.cells.map((cell, i) => <td key={i} className="p-2 border-x border-border">{renderRichText(cell)}</td>)}</tr>;
        case 'synced_block': return <SyncedBlockRenderer block={block as SyncedBlock} {...{navigateToNotionPage, openPdfViewer, jumpToTime}} />;
        case 'table_of_contents': return <div className="p-4 my-2 border rounded-md text-muted-foreground not-prose">Table of Contents (not implemented)</div>;
        case 'breadcrumb': return <div className="p-2 my-2 text-muted-foreground not-prose">Breadcrumbs (not implemented)</div>;
        default: return null;
    }
}

const NotionBlockRenderer: React.FC<NotionBlockRendererProps> = (props) => (
    <div id={props.block.id} className="my-1">
        <NotionBlockRendererInternal {...props} />
    </div>
);

export default NotionBlockRenderer;