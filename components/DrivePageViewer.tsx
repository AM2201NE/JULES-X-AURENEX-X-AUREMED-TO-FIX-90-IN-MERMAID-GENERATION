import React, { useState, useEffect, useRef } from 'react';
import { googleDriveService } from '../services/googleDriveService';
import { dataService } from '../services/dataService';
import { ArrowLeftIcon, FileIcon } from './icons';

interface DrivePageViewerProps {
    fileId: string;
    mimeType: string;
    navigateToDashboard: () => void;
    highlightSnippet?: string;
}

const DrivePageViewer: React.FC<DrivePageViewerProps> = ({ fileId, mimeType, navigateToDashboard, highlightSnippet }) => {
    const [content, setContent] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('Loading...');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadContent = async () => {
            const integration = dataService.getGoogleDriveIntegration();
            if (!integration?.accessToken) {
                setError("Google Drive is not connected.");
                setIsLoading(false);
                return;
            }

            try {
                // We need the file name, but we only have ID.
                // Let's try to find it in selectedFiles or fetch it if possible.
                // For now, we just fetch the content.
                const fileContent = await googleDriveService.getFileContent(fileId, mimeType, integration.accessToken);
                setContent(fileContent);
                setFileName("Drive Document"); // Ideally we'd fetch the metadata too
            } catch (err: any) {
                console.error(err);
                setError(err.message || "Failed to load document content.");
            } finally {
                setIsLoading(false);
            }
        };

        loadContent();
    }, [fileId, mimeType]);

    useEffect(() => {
        if (content && highlightSnippet && contentRef.current) {
            setTimeout(() => {
                if (!contentRef.current) return;
                const normalizeText = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
                const cleanMatch = highlightSnippet.match(/[a-zA-Z0-9\s]{15,}/);
                const searchString = normalizeText(cleanMatch ? cleanMatch[0].substring(0, 30) : highlightSnippet.substring(0, 30));

                if (searchString && searchString.length >= 5) {
                    const domElements = Array.from(contentRef.current.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, li, td, th'));
                    let targetElement: HTMLElement | null = null;
                    let bestMatchElement: HTMLElement | null = null;
                    let longestMatch = 0;

                    for (const el of domElements) {
                        const txt = normalizeText(el.textContent || '');
                        if (txt.includes(searchString)) {
                            const hasChildWithText = Array.from(el.children).some(child => child.textContent && normalizeText(child.textContent).includes(searchString));
                            if (!hasChildWithText) {
                                targetElement = el as HTMLElement;
                                break;
                            }
                        } else if (searchString.length > 10) {
                            // fallback partial match strategy
                            const shortSearch = searchString.substring(0, 15);
                            if (txt.includes(shortSearch)) {
                                const hasChildWithText = Array.from(el.children).some(child => child.textContent && normalizeText(child.textContent).includes(shortSearch));
                                if (!hasChildWithText && txt.length > longestMatch) {
                                    bestMatchElement = el as HTMLElement;
                                    longestMatch = txt.length;
                                }
                            }
                        }
                    }

                    const finalTarget = targetElement || bestMatchElement;

                    if (finalTarget) {
                        finalTarget.classList.add('search-highlight', 'bg-yellow-300', 'dark:bg-yellow-600/80', '!text-black', 'dark:!text-white', 'transition-colors', 'duration-1000', 'px-1', 'rounded');
                        finalTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }, 500); // Wait for DOM to fully render
        }
    }, [content, highlightSnippet]);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-muted-foreground font-medium">Loading Drive document...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background p-8">
                <div className="text-destructive mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Error Loading Document</h2>
                <p className="text-muted-foreground mb-6 text-center max-w-md">{error}</p>
                <button onClick={navigateToDashboard} className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium transition-colors">
                    Return to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-4 min-w-0">
                    <button 
                        onClick={navigateToDashboard}
                        className="p-2 -ml-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        title="Back to Dashboard"
                    >
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3 min-w-0">
                        <FileIcon className="w-6 h-6 text-blue-600 flex-shrink-0" />
                        <h1 className="text-xl font-bold text-foreground truncate">{fileName}</h1>
                    </div>
                </div>
                <a 
                    href={`https://drive.google.com/file/d/${fileId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors text-sm font-medium flex-shrink-0"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in Drive
                </a>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full max-w-full overflow-x-hidden">
                <div className="max-w-4xl mx-auto bg-card rounded-xl shadow-sm border border-border p-4 md:p-12 w-full">
                    {content && content.includes('[Content extraction failed') && (
                        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-yellow-800 dark:text-yellow-200">
                            <p className="font-medium">Notice: This document could not be fully loaded.</p>
                            <p className="text-sm mt-1">{content}</p>
                            <p className="text-sm mt-2">Please use the "Open in Drive" button above to view the full file.</p>
                        </div>
                    )}
                    {mimeType.includes('document') ? (
                        <div 
                            ref={contentRef}
                            className="prose dark:prose-invert max-w-full w-full break-words [&_img]:max-w-full [&_img]:h-auto [&_table]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_*:not(.search-highlight)]:!text-foreground [&_*:not(.search-highlight)]:!bg-transparent"
                            dangerouslySetInnerHTML={{ __html: content || '' }}
                        />
                    ) : (
                        <pre 
                            ref={contentRef as any}
                            className="whitespace-pre-wrap break-words font-sans text-base text-foreground leading-relaxed overflow-x-hidden w-full max-w-full"
                        >
                            {content}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DrivePageViewer;
