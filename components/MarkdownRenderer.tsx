import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CopyIcon, CheckCircleIcon, ExternalLinkIcon } from './icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
// Import KaTeX CSS from npm to ensure version matches rehype-katex's bundled katex
import 'katex/dist/katex.min.css';

import { sanitizeMermaidCode, stripStylingForRecovery, quickFixMermaid } from '../lib/mermaidUtils';
import { fixMermaidDiagram } from '../services/geminiService';

let loadedMermaid: any = null;

async function getMermaidInstance() {
    if (loadedMermaid) return loadedMermaid;
    if (typeof window !== 'undefined' && (window as any).mermaid) {
        loadedMermaid = (window as any).mermaid;
        loadedMermaid.initialize({
            startOnLoad: false,
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
            securityLevel: 'loose',
            fontFamily: 'Inter, sans-serif',
            flowchart: { defaultRenderer: 'dagre', curve: 'step' },
        });
        return loadedMermaid;
    }
    // Fallback: dynamically import npm mermaid if CDN isn't loaded
    const mermaidModule = await import('mermaid');
    loadedMermaid = mermaidModule.default ?? mermaidModule;
    loadedMermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'Inter, sans-serif',
        flowchart: { defaultRenderer: 'dagre', curve: 'step' },
    });
    return loadedMermaid;
}

// Multiple CORS proxy fallbacks — tried in order until one works
// images.weserv.nl is a dedicated image proxy that's very reliable for medical images
const CORS_PROXY_URLS = [
    (url: string) => `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&output=webp&we`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
    // Additional fallback proxies
    (url: string) => `https://cors-anywhere.herokuapp.com/${url}`,
    (url: string) => `https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(url)}`,
];

// Known image hosts that often block direct hotlinking — skip direct and go straight to proxy
const PROXY_FIRST_HOSTS = [
    'wikimedia.org',
    'upload.wikimedia.org',
    'wikipedia.org',
    'pubmed.ncbi.nlm.nih.gov',
    'ncbi.nlm.nih.gov',
    'mayoclinic.org',
    'clevelandclinic.org',
    'msdmanuals.com',
    'medscape.com',
    'uptodate.com',
    'radiopaedia.org',
    'teachmeanatomy.info',
    'kenhub.com',
    'anatomytool.org',
    'imaios.com',
    'webmd.com',
    'healthline.com',
    'medlineplus.gov',
    'openstax.org',
    'teachmeanatomy.info',
    'anatomy.net',
    'getbodysmart.com',
    'innerbody.com',
    'ivyroses.com',
    'ebmconsult.com',
    'fr.wikipedia.org',
    'en.wikipedia.org',
    'commons.wikimedia.org',
];

function shouldSkipDirectUrl(url: string): boolean {
    // Standard direct images work best without proxy delays.
    // Return false so image loading starts instantly using native <img> element with referrerPolicy="no-referrer".
    return false;
}

// Tailwind-based highlight color mapping for copy-paste compatibility
// Each color has a semantic meaning:
//   yellow  = key point / important term
//   green   = correct / confirmed / positive result
//   blue    = reference / definition / context
//   red     = warning / error / negative result
//   pink    = emphasis / critical attention
//   orange  = caution / borderline
//   gray    = neutral / background info
const getHighlightClassName = (color?: string) => {
    if (!color) return '';
    const normalized = color.toLowerCase();
    if (normalized.includes('yellow') || normalized.includes('ffdc4d') || normalized.includes('255,212,0') || normalized.includes('253,245,178')) return 'bg-yellow-200/70 dark:bg-yellow-900/40';
    if (normalized.includes('green') || normalized.includes('55,197,63') || normalized.includes('22c55e') || normalized.includes('221,253,204')) return 'bg-green-200/70 dark:bg-green-900/40';
    if (normalized.includes('red') || normalized.includes('255,85,85') || normalized.includes('ef4444') || normalized.includes('255,226,221')) return 'bg-red-200/70 dark:bg-red-900/40';
    if (normalized.includes('blue') || normalized.includes('35,131,226') || normalized.includes('3b82f6') || normalized.includes('208,235,255')) return 'bg-blue-200/70 dark:bg-blue-900/40';
    if (normalized.includes('pink') || normalized.includes('233,30,99') || normalized.includes('255,219,238')) return 'bg-pink-200/70 dark:bg-pink-900/40';
    if (normalized.includes('orange') || normalized.includes('251,191,36')) return 'bg-orange-200/70 dark:bg-orange-900/40';
    if (normalized.includes('gray') || normalized.includes('grey') || normalized.includes('156,163,175') || normalized.includes('94a3b8')) return 'bg-slate-200/70 dark:bg-slate-800/60';
    return 'bg-yellow-200/70 dark:bg-yellow-900/40';
};

// Smart image component with error handling and CORS proxy fallback
const SmartImage: React.FC<{ src?: string; alt?: string; onOpenImageModal?: (url: string) => void }> = ({ src, alt, onOpenImageModal }) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
    const [currentSrc, setCurrentSrc] = useState<string | null>(null);
    const [proxyIndex, setProxyIndex] = useState(-1); // -1 = direct, 0+ = proxy index
    const isMountedRef = useRef(true);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Refs to track current values inside setTimeout closures (avoids stale closures)
    const statusRef = useRef(status);
    const proxyIndexRef = useRef(proxyIndex);
    statusRef.current = status;
    proxyIndexRef.current = proxyIndex;

    // Initialize currentSrc based on whether we should skip direct URL
    useEffect(() => {
        if (!src) return;
        const skipDirect = shouldSkipDirectUrl(src);
        if (skipDirect && CORS_PROXY_URLS.length > 0) {
            setProxyIndex(0);
            setCurrentSrc(CORS_PROXY_URLS[0](src));
        } else {
            setProxyIndex(-1);
            setCurrentSrc(src);
        }
    }, [src]);

    // Final fallback: fetch the image as a blob through weserv.nl proxy and convert to blob URL
    // weserv.nl is the only proxy that returns proper CORS headers with actual image data
    // Using mode: 'no-cors' produces opaque 0-byte blobs that can't be displayed
    // Must be a function declaration (not const) so it's hoisted and usable in closures above
    function tryFetchAsBlob(imageUrl: string) {
        // First attempt: try loading directly with referrerPolicy: no-referrer
        // This works for most images that don't have strict CORS policies
        const directImg = new Image();
        directImg.referrerPolicy = 'no-referrer';
        let directResolved = false;
        
        const directTimeout = setTimeout(() => {
            if (!directResolved && isMountedRef.current) {
                directResolved = true;
                tryProxyChain();
            }
        }, 2000);
        
        directImg.onload = () => {
            if (!isMountedRef.current || directResolved) return;
            directResolved = true;
            clearTimeout(directTimeout);
            // Direct load worked! Use the original URL
            setCurrentSrc(imageUrl);
            setStatus('loading');
            statusRef.current = 'loading';
        };
        directImg.onerror = () => {
            if (!isMountedRef.current || directResolved) return;
            directResolved = true;
            clearTimeout(directTimeout);
            tryProxyChain();
        };
        directImg.src = imageUrl;
        
        function tryProxyChain() {
            // Build weserv.nl proxy URL (same as CORS_PROXY_URLS[0])
            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl.replace(/^https?:\/\//, ''))}`;
            fetch(proxyUrl, { mode: 'cors' })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.blob();
            })
            .then(blob => {
                if (!isMountedRef.current) return;
                if (blob.size === 0) throw new Error('Empty blob');
                const blobUrl = URL.createObjectURL(blob);
                setCurrentSrc(blobUrl);
                setStatus('loading');
                statusRef.current = 'loading';
            })
            .catch(() => {
                if (!isMountedRef.current) return;
                // Try allorigins as a second blob fallback
                const altProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`;
                fetch(altProxyUrl, { mode: 'cors' })
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.blob();
                    })
                    .then(blob => {
                        if (!isMountedRef.current) return;
                        if (blob.size === 0) throw new Error('Empty blob');
                        const blobUrl = URL.createObjectURL(blob);
                        setCurrentSrc(blobUrl);
                        setStatus('loading');
                        statusRef.current = 'loading';
                    })
                    .catch(() => {
                        if (!isMountedRef.current) return;
                        // Final fallback: try corsproxy.io as blob
                        const corsProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(imageUrl)}`;
                        fetch(corsProxyUrl, { mode: 'cors' })
                            .then(res => {
                                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                return res.blob();
                            })
                            .then(blob => {
                                if (!isMountedRef.current) return;
                                if (blob.size === 0) throw new Error('Empty blob');
                                const blobUrl = URL.createObjectURL(blob);
                                setCurrentSrc(blobUrl);
                                setStatus('loading');
                                statusRef.current = 'loading';
                            })
                            .catch(() => {
                                if (isMountedRef.current) setStatus('error');
                            });
                    });
            });
        } // end tryProxyChain
    } // end tryFetchAsBlob

    useEffect(() => {
        isMountedRef.current = true;
        setStatus('loading');
        statusRef.current = 'loading';
        
        // Safety timeout: if image doesn't load in 2.5s, try next proxy or show error
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (src && !src.startsWith('data:')) {
            timeoutRef.current = setTimeout(() => {
                if (!isMountedRef.current) return;
                if (statusRef.current !== 'loading') return;
                // Try next proxy if available
                const curIdx = proxyIndexRef.current;
                if (curIdx + 1 < CORS_PROXY_URLS.length) {
                    const nextIdx = curIdx + 1;
                    setProxyIndex(nextIdx);
                    setCurrentSrc(CORS_PROXY_URLS[nextIdx](src));
                    statusRef.current = 'loading';
                    proxyIndexRef.current = nextIdx;
                } else {
                    // All proxies timed out — try fetch+blob as final fallback
                    tryFetchAsBlob(src);
                }
            }, 2500);
        }
        
        return () => {
            isMountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    const handleError = () => {
        if (!isMountedRef.current) return;
        // If direct URL or current proxy fails, try next proxy
        if (src && !src.startsWith('data:')) {
            const nextIdx = proxyIndexRef.current + 1;
            if (nextIdx < CORS_PROXY_URLS.length) {
                setProxyIndex(nextIdx);
                setCurrentSrc(CORS_PROXY_URLS[nextIdx](src));
                setStatus('loading');
                proxyIndexRef.current = nextIdx;
                statusRef.current = 'loading';
            } else if (proxyIndexRef.current !== -1) {
                // All proxies failed — try fetch+blob as final fallback
                tryFetchAsBlob(src);
            } else {
                // Direct URL failed — try proxies
                if (CORS_PROXY_URLS.length > 0) {
                    setProxyIndex(0);
                    setCurrentSrc(CORS_PROXY_URLS[0](src));
                    setStatus('loading');
                    proxyIndexRef.current = 0;
                    statusRef.current = 'loading';
                } else {
                    tryFetchAsBlob(src);
                }
            }
        } else {
            setStatus('error');
        }
    };

    const handleLoad = () => {
        if (isMountedRef.current) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setStatus('loaded');
        }
    };

    if (!src) return null;

    // Data URIs load instantly — skip loading state
    const isDataUri = src.startsWith('data:');
    if (isDataUri && status === 'loading') {
        setStatus('loaded');
    }

    if (status === 'error') {
        return (
            <span className="block my-4">
                <div className="max-w-full h-32 flex flex-col items-center justify-center bg-muted/40 rounded-lg border border-border/50 text-center p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Image preview unavailable</p>
                    {alt && <p className="text-xs text-muted-foreground/70 truncate max-w-full mb-2">{alt}</p>}
                    <button
                        onClick={() => {
                            setStatus('loading');
                            statusRef.current = 'loading';
                            setProxyIndex(-1);
                            proxyIndexRef.current = -1;
                            setCurrentSrc(src!);
                        }}
                        className="text-xs font-semibold px-2.5 py-1 bg-secondary hover:bg-accent rounded-md transition-colors"
                    >
                        Retry Loading Image
                    </button>
                </div>
                {alt && <span className="block text-center text-xs text-muted-foreground mt-1.5">{alt}</span>}
            </span>
        );
    }

    return (
        <span className="block my-4">
            {status === 'loading' && (
                <div className="max-w-full h-48 bg-muted animate-pulse rounded-lg border border-border/50" />
            )}
            <img
                src={currentSrc || src}
                alt={alt}
                referrerPolicy="no-referrer"
                loading="eager"
                decoding="async"
                className={`max-w-full h-auto rounded-lg shadow-md border border-border/50 cursor-zoom-in transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0 absolute'}`}
                onClick={() => status === 'loaded' && src && onOpenImageModal?.(src)}
                onLoad={handleLoad}
                onError={handleError}
            />
            {alt && <span className="block text-center text-xs text-muted-foreground mt-2">{alt}</span>}
        </span>
    );
};

interface MermaidProps {
    chart: string;
    onOpenModal: (chart: string) => void;
    viewOnly?: boolean;
    isProcessing?: boolean;
}

export function getMermaidErrorMessage(e: unknown): string {
    const visited = new Set();

    function safeStringify(obj: any): string {
        const visitedInThisCall = new Set();
        try {
            return JSON.stringify(obj, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (visitedInThisCall.has(value)) return '[Circular Reference]';
                    visitedInThisCall.add(value);
                }
                if (typeof value === 'function') return '[Function]';
                return value;
            }, 2);
        } catch {
            return '[Unserializable Object]';
        }
    }

    function extract(err: any): string | null {
        if (err === null || typeof err !== 'object' || visited.has(err)) return String(err);
        visited.add(err);
        if (err instanceof Error) return err.message;
        if (typeof err.message === 'string' && err.message.trim()) return err.message;
        if (typeof err.str === 'string' && err.str.trim()) return err.str;
        if (err.hash && typeof err.hash === 'object') {
            const { line, text, expected } = err.hash;
            let details = 'Parse error';
            if (line) details += ` on line ${line}`;
            if (text) details += ` near "${String(text).slice(0, 50)}..."`;
            if (Array.isArray(expected)) details += `. Expected one of: ${expected.slice(0, 5).join(', ')}`;
            return details;
        }
        if (err.error) return extract(err.error);
        if (err.err) return extract(err.err);
        const strRepresentation = err.toString();
        if (strRepresentation !== '[object Object]') return strRepresentation;
        return null;
    }

    if (e == null) return 'An unknown error occurred (null/undefined error).';
    const message = extract(e);
    if (message) return message;
    const serialized = safeStringify(e);
    if (serialized && serialized !== '{}') return `An unknown error occurred. Raw error data: ${serialized}`;
    return 'An unknown error occurred. The diagram syntax is likely invalid.';
}

export const Mermaid: React.FC<MermaidProps> = ({ chart, onOpenModal, viewOnly, isProcessing }) => {
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [activeChartCode, setActiveChartCode] = useState<string>('');
    const [retryCount, setRetryCount] = useState<number>(0);
    const [aiHealing, setAiHealing] = useState(false);
    const uniqueId = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`).current;
    const svgContainerRef = useRef<HTMLDivElement>(null);
    
    // Track the code that was last successfully rendered to avoid redundant re-renders
    const lastRenderedCodeRef = useRef<string>('');
    // Track isProcessing in a ref so the transition from true→false doesn't
    // trigger a re-render of the effect (which would re-render already-fine diagrams).
    const isProcessingRef = useRef(isProcessing);
    isProcessingRef.current = isProcessing;
    // Track the last error message for AI healing context
    const lastErrorRef = useRef<string>('');

    const initialCleanChartCode = useMemo(() => {
        // Strip trailing HTML artifacts (e.g., <br><br><div...>) that may be appended
        // after the Mermaid code by the AI output processor. Only strip if the HTML
        // appears at the very end — never strip mid-content <br> tags.
        const rawChartCode = chart.replace(/<br><br>\s*<div[\s\S]*$/, '');
        return sanitizeMermaidCode(rawChartCode);
    }, [chart]);

    // When the parent passes a new chart, reset our active code
    useEffect(() => {
        setActiveChartCode(initialCleanChartCode);
        // Reset the last-rendered tracker when the chart changes
        lastRenderedCodeRef.current = '';
    }, [initialCleanChartCode]);

    useEffect(() => {
        const renderChart = async () => {
            if (!activeChartCode || activeChartCode.trim() === '') return;

            // Skip if we already successfully rendered this exact code — unless this is a retry.
            if (retryCount === 0 && lastRenderedCodeRef.current === activeChartCode) return;

            const mermaid = await getMermaidInstance();
            const renderId = `${uniqueId}-${Date.now()}`;
            
            // Try rendering with up to 3 progressively-aggressive sanitization passes
            let codeToRender = activeChartCode;
            let lastErrorMsg = '';
            
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const result = await mermaid.render(`${renderId}-${attempt}`, codeToRender);
                    setSvg(result.svg);
                    setError(null);
                    lastRenderedCodeRef.current = activeChartCode;
                    return;
                } catch (e: any) {
                    lastErrorMsg = getMermaidErrorMessage(e);
                    
                    // Suppress parsing errors during streaming, as the chart is likely incomplete
                    if (isProcessingRef.current && (lastErrorMsg.includes("No diagram type detected") || lastErrorMsg.includes("got '1'") || lastErrorMsg.includes("got 'NEWLINE'") || lastErrorMsg.includes("got 'EOF'") || lastErrorMsg.includes("Parse error"))) {
                        setError("Drawing diagram...");
                        return;
                    }
                    
                    // If not streaming (final render), try to auto-fix the code
                    if (attempt < 2 && !isProcessingRef.current) {
                        // Apply progressively more aggressive sanitization
                        codeToRender = sanitizeMermaidCode(codeToRender);
                        // If sanitization didn't change anything, no point retrying
                        if (codeToRender === activeChartCode && attempt === 0) break;
                        continue;
                    }
                }
            }
            
            // All attempts failed — try quick local fixes first (no AI)
            if (!isProcessingRef.current) {
                setError("Auto-fixing diagram...");
                
                // Step 1: Quick local fixes
                const quickFixed = quickFixMermaid(activeChartCode, lastErrorMsg);
                if (quickFixed) {
                    const cleanedQuick = sanitizeMermaidCode(quickFixed);
                    try {
                        const result = await mermaid.render(`${renderId}-quickfix`, cleanedQuick);
                        setSvg(result.svg);
                        setError(null);
                        setActiveChartCode(cleanedQuick);
                        lastRenderedCodeRef.current = cleanedQuick;
                        console.log('[Mermaid] Auto quick-fix succeeded');
                        return;
                    } catch (e2: any) {
                        lastErrorMsg = getMermaidErrorMessage(e2);
                    }
                }
                
                // Step 2: Try sanitized version
                const sanitized = sanitizeMermaidCode(activeChartCode);
                if (sanitized !== activeChartCode) {
                    try {
                        const result = await mermaid.render(`${renderId}-sanitized`, sanitized);
                        setSvg(result.svg);
                        setError(null);
                        setActiveChartCode(sanitized);
                        lastRenderedCodeRef.current = sanitized;
                        console.log('[Mermaid] Auto sanitizer fix succeeded');
                        return;
                    } catch (e2: any) {
                        lastErrorMsg = getMermaidErrorMessage(e2);
                    }
                }
                
                // Step 3: AI healing — capped at 10 rounds to avoid infinite loops
                let aiFixedCode: string | null = null;
                let aiErrorMsg = lastErrorMsg;
                let aiRound = 0;
                let aiConsecutiveFailures = 0;
                const MAX_AI_ROUNDS = 10;
                
                while (aiRound < MAX_AI_ROUNDS) {
                    aiRound++;
                    try {
                        const codeToFix = aiRound === 1 ? activeChartCode : (aiFixedCode || activeChartCode);
                        aiFixedCode = await fixMermaidDiagram(codeToFix, aiErrorMsg);
                        
                        if (!aiFixedCode) {
                            console.warn(`[Mermaid] Auto AI healing round ${aiRound}: no fix returned, retrying...`);
                            aiConsecutiveFailures++;
                            
                            // After 3 consecutive failures, try stripStylingForRecovery
                            if (aiConsecutiveFailures >= 3) {
                                const strippedCode = stripStylingForRecovery(activeChartCode);
                                try {
                                    const result = await mermaid.render(`${renderId}-stripped-${aiRound}`, strippedCode);
                                    setSvg(result.svg);
                                    setError("⚠ Styling removed to show diagram structure");
                                    setActiveChartCode(strippedCode);
                                    lastRenderedCodeRef.current = strippedCode;
                                    console.log("[Mermaid] Auto stripStylingForRecovery fallback succeeded");
                                    return;
                                } catch (stripErr: any) {
                                    console.warn("[Mermaid] Auto stripStylingForRecovery also failed");
                                }
                                // All fallbacks failed — show error and stop
                                break;
                            }
                            
                            await new Promise(r => setTimeout(r, 2000));
                            continue;
                        }
                        
                        aiConsecutiveFailures = 0;
                        
                        const cleanedCode = sanitizeMermaidCode(aiFixedCode);
                        try {
                            const result = await mermaid.render(`${renderId}-ai-${aiRound}`, cleanedCode);
                            setSvg(result.svg);
                            setError(null);
                            setActiveChartCode(cleanedCode);
                            lastRenderedCodeRef.current = cleanedCode;
                            console.log(`[Mermaid] Auto AI healing succeeded on round ${aiRound}`);
                            return;
                        } catch (e2: any) {
                            aiErrorMsg = getMermaidErrorMessage(e2);
                            
                            const quickFixed2 = quickFixMermaid(cleanedCode, aiErrorMsg);
                            const reSanitized = sanitizeMermaidCode(quickFixed2 || cleanedCode);
                            if (reSanitized !== cleanedCode) {
                                try {
                                    const result2 = await mermaid.render(`${renderId}-ai-${aiRound}-s2`, reSanitized);
                                    setSvg(result2.svg);
                                    setError(null);
                                    setActiveChartCode(reSanitized);
                                    lastRenderedCodeRef.current = reSanitized;
                                    console.log(`[Mermaid] Auto AI healing + sanitize succeeded on round ${aiRound}`);
                                    return;
                                } catch (e3: any) {
                                    aiErrorMsg = getMermaidErrorMessage(e3);
                                }
                            }
                            
                            setError(`Auto-fixing diagram... (round ${aiRound})`);
                        }
                    } catch (aiErr) {
                        console.warn(`[Mermaid] Auto AI healing round ${aiRound} API call failed:`, aiErr);
                        await new Promise(r => setTimeout(r, 2000));
                        continue;
                    }
                }
                
                // AI healing exhausted — try stripStylingForRecovery as final fallback
                const strippedCode = stripStylingForRecovery(activeChartCode);
                try {
                    const result = await mermaid.render(`${renderId}-stripped-final`, strippedCode);
                    setSvg(result.svg);
                    setError("⚠ Styling removed to show diagram structure");
                    setActiveChartCode(strippedCode);
                    lastRenderedCodeRef.current = strippedCode;
                    console.log("[Mermaid] Auto stripStylingForRecovery final fallback succeeded");
                    return;
                } catch (stripErr: any) {
                    console.warn("[Mermaid] Auto stripStylingForRecovery final fallback also failed");
                }
            }
            
            // All attempts including AI failed — try stripping styling as final fallback
            if (!isProcessingRef.current) {
                const strippedCode = stripStylingForRecovery(activeChartCode);
                if (strippedCode !== activeChartCode) {
                    try {
                        const result = await mermaid.render(`${renderId}-stripped`, strippedCode);
                        setSvg(result.svg);
                        setError("⚠ Styling removed to show diagram structure");
                        lastRenderedCodeRef.current = activeChartCode;
                        console.log("[Mermaid] stripStylingForRecovery fallback succeeded");
                        return;
                    } catch (stripErr: any) {
                        console.warn("[Mermaid] stripStylingForRecovery also failed:", getMermaidErrorMessage(stripErr));
                    }
                }
            }
            
            // All attempts including AI and strip fallback failed — show the error
            console.error("Mermaid render error after retries:", lastErrorMsg);
            lastErrorRef.current = lastErrorMsg;
            setError(lastErrorMsg);
        };

        renderChart();
    }, [activeChartCode, uniqueId, retryCount]);

    // After SVG is rendered, call KaTeX to render any LaTeX inside the diagram nodes
    useEffect(() => {
        if (svg && svgContainerRef.current) {
            // Use a longer delay to ensure the SVG is fully parsed into the DOM
            // requestAnimationFrame is too fast for dangerouslySetInnerHTML with SVG
            const timeoutId = setTimeout(() => {
                if (!svgContainerRef.current) return;
                
                // KaTeX's renderMathInElement traverses DOM text nodes.
                // Mermaid SVGs use <foreignObject> with nested HTML <div>/<span> elements.
                // We need to find all foreignObject elements and render math inside them.
                const renderKatexInContainer = (container: Element) => {
                    if (!(window as any).renderMathInElement) return;
                    try {
                        (window as any).renderMathInElement(container, {
                            delimiters: [
                                {left: '$$', right: '$$', display: true},
                                {left: '$', right: '$', display: false},
                                {left: '\\(', right: '\\)', display: false},
                                {left: '\\[', right: '\\]', display: true}
                            ],
                            throwOnError: false
                        });
                    } catch (e) {
                        console.warn('KaTeX rendering in Mermaid failed:', e);
                    }
                };
                
                // Render in the main container (catches foreignObject content)
                renderKatexInContainer(svgContainerRef.current);
                
                // Also explicitly find and process each foreignObject's content
                const foreignObjects = svgContainerRef.current.querySelectorAll('foreignObject');
                foreignObjects.forEach(fo => {
                    renderKatexInContainer(fo);
                });
            }, 100);
            
            return () => clearTimeout(timeoutId);
        }
    }, [svg]);

    const handleAiHealing = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setAiHealing(true);
        setError('Fixing diagram...');
        
        const mermaid = await getMermaidInstance();
        const renderId = `${uniqueId}-${Date.now()}`;
        let codeToFix = activeChartCode;
        let errorMsg = lastErrorRef.current || error || 'Parse error';
        
        // ═══ STEP 1: Try quick local fixes first (no AI needed) ═══
        const quickFixed = quickFixMermaid(codeToFix, errorMsg);
        if (quickFixed) {
            const cleanedQuick = sanitizeMermaidCode(quickFixed);
            try {
                const result = await mermaid.render(`${renderId}-quickfix`, cleanedQuick);
                setSvg(result.svg);
                setError(null);
                setActiveChartCode(cleanedQuick);
                lastRenderedCodeRef.current = cleanedQuick;
                setAiHealing(false);
                console.log('[Mermaid] Quick local fix succeeded');
                return;
            } catch (e2: any) {
                errorMsg = getMermaidErrorMessage(e2);
                codeToFix = cleanedQuick;
                console.log('[Mermaid] Quick fix failed, trying AI...');
            }
        }
        
        // ═══ STEP 2: Try sanitized version of original ═══
        const sanitized = sanitizeMermaidCode(codeToFix);
        if (sanitized !== codeToFix) {
            try {
                const result = await mermaid.render(`${renderId}-sanitized`, sanitized);
                setSvg(result.svg);
                setError(null);
                setActiveChartCode(sanitized);
                lastRenderedCodeRef.current = sanitized;
                setAiHealing(false);
                console.log('[Mermaid] Sanitizer fix succeeded');
                return;
            } catch (e2: any) {
                errorMsg = getMermaidErrorMessage(e2);
                codeToFix = sanitized;
            }
        }
        
        // ═══ STEP 3: AI healing — capped at 10 rounds ═══
        let round = 0;
        let consecutiveFailures = 0;
        const MAX_HEALING_ROUNDS = 10;
        while (round < MAX_HEALING_ROUNDS) {
            round++;
            try {
                setError(`AI healing round ${round}/${MAX_HEALING_ROUNDS}...`);
                
                const aiFixedCode = await fixMermaidDiagram(codeToFix, errorMsg);
                
                if (!aiFixedCode) {
                    console.warn(`[Mermaid] AI healing round ${round}: no fix returned`);
                    consecutiveFailures++;
                    
                    // After 3 consecutive failures, try stripStylingForRecovery as fallback
                    if (consecutiveFailures >= 3) {
                        const strippedCode = stripStylingForRecovery(codeToFix);
                        try {
                            const result = await mermaid.render(`${renderId}-stripped-${round}`, strippedCode);
                            setSvg(result.svg);
                            setError('⚠ Styling removed to show diagram structure.');
                            setActiveChartCode(strippedCode);
                            lastRenderedCodeRef.current = strippedCode;
                            setAiHealing(false);
                            console.log('[Mermaid] stripStylingForRecovery fallback succeeded');
                            return;
                        } catch (stripErr: any) {
                            console.warn('[Mermaid] stripStylingForRecovery also failed');
                        }
                        // All fallbacks failed — show error and stop
                        break;
                    }
                    
                    setError(`AI healing round ${round} failed (quota?), retrying...`);
                    // Wait longer between retries to avoid hammering the API
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                
                consecutiveFailures = 0; // Reset on successful AI response
                
                // Try rendering the AI-fixed code
                const cleanedCode = sanitizeMermaidCode(aiFixedCode);
                try {
                    const result = await mermaid.render(`${renderId}-ai-heal-${round}`, cleanedCode);
                    setSvg(result.svg);
                    setError(null);
                    setActiveChartCode(cleanedCode);
                    lastRenderedCodeRef.current = cleanedCode;
                    setAiHealing(false);
                    console.log(`[Mermaid] AI healing succeeded on round ${round}`);
                    return;
                } catch (e2: any) {
                    errorMsg = getMermaidErrorMessage(e2);
                    console.warn(`[Mermaid] AI healing round ${round} render failed: ${errorMsg.substring(0, 100)}`);
                    
                    // Try quickFix + sanitize on the AI output
                    const quickFixed = quickFixMermaid(cleanedCode, errorMsg);
                    const reSanitized = sanitizeMermaidCode(quickFixed || cleanedCode);
                    if (reSanitized !== cleanedCode) {
                        try {
                            const result2 = await mermaid.render(`${renderId}-ai-heal-${round}-s2`, reSanitized);
                            setSvg(result2.svg);
                            setError(null);
                            setActiveChartCode(reSanitized);
                            lastRenderedCodeRef.current = reSanitized;
                            setAiHealing(false);
                            console.log(`[Mermaid] AI healing + sanitize succeeded on round ${round}`);
                            return;
                        } catch (e3: any) {
                            errorMsg = getMermaidErrorMessage(e3);
                        }
                    }
                    
                    // Feed the fixed code + new error back for the next round
                    codeToFix = cleanedCode;
                }
            } catch (aiErr: any) {
                console.warn(`[Mermaid] AI healing round ${round} API call failed:`, aiErr);
                // Don't give up — wait and retry
                setError(`AI healing round ${round} failed, retrying...`);
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
        }
        
        // All AI healing rounds exhausted — try stripStylingForRecovery as final fallback
        const strippedCode = stripStylingForRecovery(codeToFix);
        try {
            const result = await mermaid.render(`${renderId}-stripped-final`, strippedCode);
            setSvg(result.svg);
            setError('⚠ Styling removed to show diagram structure.');
            setActiveChartCode(strippedCode);
            lastRenderedCodeRef.current = strippedCode;
            setAiHealing(false);
            console.log('[Mermaid] stripStylingForRecovery final fallback succeeded');
            return;
        } catch (stripErr: any) {
            console.warn('[Mermaid] stripStylingForRecovery final fallback also failed');
        }
        
        // Everything failed — show the error
        setError(lastErrorRef.current || errorMsg || 'Diagram could not be fixed after multiple AI attempts.');
        setAiHealing(false);
    };

    const handleCopyCode = (e: React.MouseEvent) => {
        e.stopPropagation();
        const codeToCopy = `\`\`\`mermaid\n${activeChartCode}\n\`\`\``;
        navigator.clipboard.writeText(codeToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (viewOnly) {
        return (
            <div className="mermaid-container w-full h-full flex items-center justify-center overflow-auto p-2">
                {error ? (
                    <div className="absolute bottom-4 left-4 right-4 p-4 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
                        <p className="font-bold">Rendering Error:</p>
                        <pre className="whitespace-pre-wrap mt-1 text-xs">{error}</pre>
                    </div>
                ) : (
                    <div ref={svgContainerRef} className="w-full max-w-full overflow-x-auto bg-transparent" dangerouslySetInnerHTML={{ __html: svg }} />
                )}
            </div>
        );
    }

    return (
      <div 
        className="my-4 border rounded-lg overflow-hidden bg-card/50 shadow-sm transition-all hover:shadow-md border-border cursor-pointer group relative select-none not-prose"
        data-mermaid-code={encodeURIComponent(activeChartCode)}
      >
        <div className="relative min-h-[150px] bg-white dark:bg-black/20 flex justify-center p-6 overflow-x-auto backdrop-blur-sm" onClick={() => onOpenModal(activeChartCode)}>
            {error ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                    {aiHealing || error.includes("Auto-fixing") || error.includes("healing") || error.includes("Drawing") ? (
                        <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-primary/5 border border-primary/20 shadow-sm animate-pulse">
                            <div className="flex items-center gap-2 text-primary font-medium text-xs">
                                <svg className="w-4 h-4 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>{error}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">AI is refining diagram structure and syntax...</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <span className="text-sm font-medium">Diagram rendering failed</span>
                            </div>
                            <pre className="whitespace-pre-wrap mt-1 text-xs text-destructive max-h-32 overflow-y-auto px-4">{error}</pre>
                            <button
                                onClick={handleAiHealing}
                                disabled={aiHealing}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                                <span>↻</span>
                                <span>Retry with AI healing</span>
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <>
            {/* Render SVG via dangerouslySetInnerHTML to keep React happy */}
            <div ref={svgContainerRef} className="flex w-full max-w-full justify-center overflow-x-auto bg-transparent" dangerouslySetInnerHTML={{ __html: svg }} />
                </>
            )}
            
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm sm:hidden">
                    Tap to expand
                </span>
            </div>
            
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={handleCopyCode}
                    className="p-1.5 bg-background/80 backdrop-blur-md border rounded-md shadow-sm text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy Code for Notion"
                >
                    {copied ? <CheckCircleIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>
    );
}

interface CodeBlockProps {
    code: string;
    language: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="relative group my-4 bg-muted rounded-md border border-border/50">
            <div className="flex justify-between items-center px-4 py-2 border-b border-border/50 bg-muted/50">
                <span className="text-xs text-muted-foreground uppercase">{language}</span>
                <button onClick={handleCopy} className="text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-background transition-colors">
                    {copied ? <CheckCircleIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4" />}
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
                <code>{code}</code>
            </pre>
        </div>
    );
};

interface MarkdownRendererProps {
    children?: string;
    source?: string;
    onCitationClick?: (index: number, type?: string) => void;
    onInternalLinkClick?: (title: string) => void;
    onOpenMermaidModal?: (chart: string) => void;
    onOpenImageModal?: (url: string) => void;
    ocrChunks?: any[];
    onOcrCitationClick?: (info: any) => void;
    onOcrCitationHover?: (info: any) => void;
    hoveredOcrInfo?: any;
    hoveredCitationIndex?: number | null;
    citations?: any[];
    evidence?: any[];
    personality?: string;
    isProcessing?: boolean;
}

const MarkdownRendererInner: React.FC<MarkdownRendererProps> = ({
    children, 
    source, 
    onCitationClick,
    onInternalLinkClick,
    onOpenMermaidModal,
    onOpenImageModal,
    citations,
    evidence,
    personality,
    isProcessing
}) => {
    const content = source || children || '';
    
    // 1. Clean HTML tags from inside math equations to prevent remarkMath from failing
    let sanitizedContent = content;
    sanitizedContent = sanitizedContent.replace(/\$\$([\s\S]+?)\$\$/g, (match, inner) => {
        return '$$' + inner.replace(/<[^>]*>/g, '') + '$$';
    });
    sanitizedContent = sanitizedContent.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, inner) => {
        return prefix + '$' + inner.replace(/<[^>]*>/g, '') + '$';
    });
    
    // 1b. Convert LaTeX/Anki MathJax delimiters to markdown math delimiters
    // \( ... \) → $...$ (inline math)
    // \[ ... \] → $$...$$ (block math)
    // The AI sometimes outputs these instead of $...$ and $$...$$
    // IMPORTANT: Only convert if the content doesn't already use $ delimiters
    // to avoid double-processing with KaTeX
    sanitizedContent = sanitizedContent.replace(/\\\[([\s\S]*?)\\\]/g, (match, inner) => {
        if (/\$[^$]/.test(inner)) return match;
        return '\n$$\n' + inner + '\n$$\n';
    });
    sanitizedContent = sanitizedContent.replace(/\\\(([\s\S]*?)\\\)/g, (match, inner) => {
        if (/\$[^$]/.test(inner)) return match;
        return '$' + inner + '$';
    });

    // 1c. Automatically detect and wrap bare \begin{cases/matrix/align/equation...} blocks that lack $ delimiters
    sanitizedContent = sanitizedContent.replace(/(^|[^\$])((?:[^\n\$]*?\\begin\{(?:cases|matrix|bmatrix|pmatrix|align|equation|gather|subarray)\}[\s\S]*?\\end\{(?:cases|matrix|bmatrix|pmatrix|align|equation|gather|subarray)\}))/g, (match, prefix, mathBlock) => {
        return prefix + '\n$$\n' + mathBlock + '\n$$\n';
    });

    // 1d. If text is streaming (isProcessing = true) and contains an unclosed ```mermaid block,
    // auto-close it temporarily with \n``` so ReactMarkdown passes it to <Mermaid /> to render LIVE on the fly!
    if (isProcessing) {
        const openMermaidMatch = sanitizedContent.match(/```mermaid[\s\S]*$/i);
        if (openMermaidMatch && !/```mermaid[\s\S]*?```/i.test(openMermaidMatch[0])) {
            sanitizedContent = sanitizedContent + '\n```';
        }
    }
    
    // Process citations [src_N] -> [citation:N] for internal linking
    // Also handle [N] if it appears to be a citation (simple heuristic)
    // Also convert HTML highlights <span style="...">text</span> to [text](highlight:color)
    // We use a very permissive regex for highlights to catch various formats including those with extra attributes or different quoting
    const processedContent = sanitizedContent
        // Fix malformed image markdown closing delimiters where AI outputs ] or \] or ]) instead of )
        .replace(/!\[([^\]\n]+)\]\((https?:\/\/[^\s\)\n]+)\](?!\))/gi, '![$1]($2)')
        .replace(/!\[([^\]\n]+)\]\((https?:\/\/[^\s\)\n]+)\]\)/gi, '![$1]($2)')
        .replace(/!\[([^\]\n]+)\]\((https?:\/\/[^\s\)\n]+)\\\)/gi, '![$1]($2)')
        // Strip quotes or backslashes around markdown image strings like "![alt](url)" or \"![alt](url)\"
        .replace(/(?:^|\s)["\\]+(!\[[\s\S]*?\]\([^\)]+\))["\\]+(?=$|\s)/g, '$1')
        // Unescape backslash-escaped markdown image syntax like \!\[caption\]\(url\) or !\[caption\]\(url\)
        .replace(/\\?!\\?\[([\s\S]*?)\\?\]\\?\((https?:\/\/[^\\\n\s]+)(?:\\)?\)/gi, (match, caption, url) => {
            const cleanCaption = caption.replace(/\\/g, '');
            const cleanUrl = url.replace(/\\/g, '').trim();
            return `![${cleanCaption}](${cleanUrl})`;
        })
        // Convert non-exclamation markdown links [Caption](https://.../image.ext) where URL points to an image file or S3 image asset into ![Caption](url)
        .replace(/(^|[^!])\[([^\]]+)\]\((https?:\/\/[^\s\)]+?\.(?:png|jpg|jpeg|webp|gif|svg|bmp|tiff|ico)(?:\?[^\s\)]*)?)\)/gi, '$1![$2]($3)')
        .replace(/(^|[^!])\[([^\]]+)\]\((https?:\/\/[^\s\)]+?\/image\.(?:png|jpg|jpeg|webp|gif|svg|bmp|tiff|ico)(?:\?[^\s\)]*)?)\)/gi, '$1![$2]($3)')
        .replace(/\[Image:\s*(.*?)\]/gi, (match, url) => {
            return `![Image](${url})`;
        })
        // Convert standalone image URLs (ending in .png, .jpg, .jpeg, .webp, .gif, .svg) not inside markdown links or image tags to markdown images
        .replace(/(^|[^"'\(\]])(https?:\/\/[^\s\)<>]+\.(?:png|jpg|jpeg|webp|gif|svg)(?:\?[^\s\)<>]*)?)(?![^<]*>|[^\[]*\]|\))/gi, '$1![Image]($2)')
        // Convert multiple PMIDs in one bracket [PMID: XXX, PMID: YYY, PMID: ZZZ] to separate clickable links
        .replace(/\[PMID:\s*([^\]]+)\]/gi, (match, pmidList) => {
            const pmidMatches = pmidList.match(/\d+/g);
            if (!pmidMatches || pmidMatches.length === 0) return match;
            return pmidMatches.map((pmid: string) => `[PMID: ${pmid}](https://pubmed.ncbi.nlm.nih.gov/${pmid}/)`).join(' ');
        })
        // Convert multiple NCTs in one bracket [NCT: NCTXXX, NCT: NCTYYY] to separate clickable links
        .replace(/\[NCT:\s*([^\]]+)\]/gi, (match, nctList) => {
            const nctMatches = nctList.match(/NCT\d+/gi);
            if (!nctMatches || nctMatches.length === 0) return match;
            return nctMatches.map((nct: string) => `[${nct}](https://clinicaltrials.gov/study/${nct})`).join(' ');
        })
        // Convert multiple DOIs in one bracket [DOI: 10.xxx, DOI: 10.yyy] to separate clickable links
        .replace(/\[DOI:\s*([^\]]+)\]/gi, (match, doiList) => {
            const doiMatches = doiList.match(/10\.\d{4,}\/[^\],\s]+/g);
            if (!doiMatches || doiMatches.length === 0) return match;
            return doiMatches.map((doi: string) => `[DOI: ${doi}](https://doi.org/${doi})`).join(' ');
        })
        .replace(/\[((?:src_)?\d+(?:\s*,\s*(?:src_)?\d+)*)\](?!\()/g, (match, inner) => {
            const ids = inner.match(/(?:src_)?\d+/g);
            if (!ids) return match;
            
            return ids.map((id: string) => {
                const isLocal = id.startsWith('src_') || (evidence && evidence.length > 0 && (!citations || citations.length === 0));
                const type = isLocal ? 'local' : 'web';
                
                let num = parseInt(id.replace('src_', ''), 10);
                if (id.startsWith('src_')) {
                    num += 1;
                } else if (num === 0) {
                    num = 1;
                }
                return `[${num}](citation:${type}:${num})`;
            }).join(' ');
        })
        .replace(/<mark[^>]*class="([^"]+)"[^>]*>([\s\S]*?)<\/mark>/gi, (match, color, text) => {
            let mappedColor = 'yellow';
            if (color.includes('yellow')) mappedColor = 'yellow';
            else if (color.includes('green')) mappedColor = 'green';
            else if (color.includes('red')) mappedColor = 'red';
            else if (color.includes('blue')) mappedColor = 'blue';
            else if (color.includes('pink')) mappedColor = 'pink';
            else if (color.includes('orange')) mappedColor = 'orange';
            else if (color.includes('gray') || color.includes('grey')) mappedColor = 'gray';
            return `[${text}](highlight:${mappedColor})`;
        })
        .replace(/<span[^>]*style="[^"]*background-color:\s*([^;"]+)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, (match, color, text) => {
            return `[${text}](highlight:${color})`;
        });

    return (
        <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:mb-2 prose-headings:mt-6 prose-a:text-primary hover:prose-a:underline break-words">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, [rehypeKatex, { throwOnError: false, strict: false }]]}
                urlTransform={(value) => value}
                components={{
                    pre: ({node, children, ...props}) => {
                        if (node && node.children && node.children.length === 1 && node.children[0].type === 'element' && node.children[0].tagName === 'code') {
                            return <>{children}</>;
                        }
                        return <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed bg-muted rounded-md my-4" {...props}>{children}</pre>;
                    },
                    code(props: any) {
                        const {children, className, node, ...rest} = props;
                        const match = /language-(\w+)/.exec(className || '');
                        const content = String(children).replace(/\n$/, '');
                        
                        const hasDiagramType = /(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|mindmap|timeline|zenuml|sankey-beta|xychart-beta|block-beta)\b/.test(content);
                        
                        const isMermaid = ((match && match[1] === 'mermaid') || hasDiagramType) && hasDiagramType;
                        
                        if (isMermaid) {
                            return <Mermaid chart={content} onOpenModal={onOpenMermaidModal || (() => {})} isProcessing={isProcessing} />;
                        }
                        
                        return match ? (
                            <CodeBlock code={content} language={match[1]} />
                        ) : (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...rest}>
                                {children}
                            </code>
                        );
                    },
                    table: ({node, children, ...props}) => (
                        <div className="overflow-x-auto my-6 rounded-lg border border-border bg-card shadow-sm">
                            <table className="w-full text-sm text-left border-collapse" {...props}>{children}</table>
                        </div>
                    ),
                    thead: ({node, children, ...props}) => <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-xs font-semibold" {...props}>{children}</thead>,
                    tbody: ({node, children, ...props}) => <tbody className="divide-y divide-border" {...props}>{children}</tbody>,
                    tr: ({node, children, ...props}) => <tr className="hover:bg-muted/30 transition-colors" {...props}>{children}</tr>,
                    th: ({node, children, ...props}) => <th className="px-4 py-3 font-medium tracking-wider whitespace-nowrap border-b border-border/50" {...props}>{children}</th>,
                    td: ({node, children, ...props}) => <td className="px-4 py-3 align-top leading-normal" {...props}>{children}</td>,
                    blockquote: ({node, children, ...props}) => <blockquote className="border-l-4 border-primary pl-4 py-1 my-4 italic bg-muted/20 rounded-r-lg" {...props}>{children}</blockquote>,
                    
                    // Highlights using span with Tailwind classes for copy-paste compatibility
                    // IMPORTANT: We must pass `style` through to the DOM. KaTeX relies on inline
                    // styles (e.g. `top:-3.063em` on vlist entries) for superscript/subscript
                    // positioning. Stripping `style` breaks all math rendering.
                    // @ts-ignore
                    span: ({node, className, style, children, ...props}) => {
                        const backgroundColor = typeof style?.backgroundColor === 'string' ? style.backgroundColor : undefined;
                        const highlightClass = backgroundColor ? getHighlightClassName(backgroundColor) : '';
                        // Remove backgroundColor from style so it doesn't conflict with the Tailwind class
                        const remainingStyle = backgroundColor ? (() => {
                            const { backgroundColor: _bc, ...rest } = style as React.CSSProperties;
                            return rest;
                        })() : style;
                        return <span className={[className, highlightClass].filter(Boolean).join(' ')} style={remainingStyle} {...props}>{children}</span>;
                    },
                    
                    // Intercept 'mark' tags if used by rehype-raw/markdown and convert to span with Tailwind highlight
                    // @ts-ignore
                    mark: ({node, className, children, ...props}) => {
                        // Notion compatible colors — each color has semantic meaning
                        let colorName = 'yellow'; // Default: key point / important term
                        
                        if (className?.includes('orange')) colorName = 'orange';   // caution / borderline
                        else if (className?.includes('red')) colorName = 'red';     // warning / negative result
                        else if (className?.includes('green')) colorName = 'green'; // correct / confirmed
                        else if (className?.includes('gray') || className?.includes('grey')) colorName = 'gray'; // neutral / background
                        else if (className?.includes('blue')) colorName = 'blue';   // reference / definition
                        else if (className?.includes('pink')) colorName = 'pink';   // emphasis / critical

                        return (
                            <span 
                                className={`px-1 rounded-sm text-foreground ${className || ''} ${getHighlightClassName(colorName)}`} 
                                {...props} 
                            >
                                {children}
                            </span>
                        );
                    },
                    
                    p: ({node, children, ...props}) => <div className="mb-4 leading-relaxed" {...props}>{children}</div>,
                    
                    a: ({node, children, ...props}) => {
                        const href = props.href || '';
                        if (href.startsWith('citation:')) {
                            const parts = href.split(':');
                            let type = 'web';
                            let index = 1;
                            
                            if (parts.length === 3) {
                                type = parts[1];
                                index = parseInt(parts[2]);
                            } else {
                                // Backward compatibility for 'citation:1'
                                index = parseInt(parts[1]);
                                // Guess type based on available arrays
                                type = evidence && evidence.length > 0 ? 'local' : 'web';
                            }
                            
                            let citation;
                            if (type === 'local') {
                                citation = evidence?.[index - 1];
                            } else if (type === 'web') {
                                const webIndex = index - 1 - (evidence?.length || 0);
                                citation = citations?.[webIndex];
                            }
                            
                            const getCitationColor = (p?: string, cit?: any) => {
                                if (cit) {
                                    if (cit.source_type === 'drive_file') return 'bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30';
                                    if (cit.source_type === 'notion_block') return 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-500/30';
                                    if (cit.source_type === 'aurenex_block') return 'bg-primary/20 text-primary hover:bg-primary/30';
                                }
                                switch(p) {
                                    case 'muse': return 'bg-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/30';
                                    case 'socrates': return 'bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30';
                                    case 'jarvis': return 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/30';
                                    case 'exampal': return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30';
                                    case 'ocr': return 'bg-slate-500/20 text-slate-600 dark:text-slate-400 hover:bg-slate-500/30';
                                    default: return 'bg-primary/20 text-primary hover:bg-primary/30';
                                }
                            };
                            const colorClass = getCitationColor(personality, citation);
                            
                            return (
                                <span className="relative group/citation inline-block mx-0.5 align-super">
                                    <button 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCitationClick?.(index, type); }}
                                        className={`inline-flex items-center justify-center min-w-[20px] h-4 px-1.5 rounded-full text-[10px] font-bold transition-colors shadow-sm border border-transparent hover:border-current/20 ${colorClass}`}
                                        aria-label={`Citation ${index}`}
                                    >
                                        <svg className="w-2 h-2 mr-0.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                        </svg>
                                        {index}
                                    </button>
                                    {citation && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-popover text-popover-foreground text-xs rounded-lg shadow-xl border border-border opacity-0 invisible group-hover/citation:opacity-100 group-hover/citation:visible transition-all z-50 pointer-events-none">
                                            <div className="font-semibold mb-1 truncate">{type === 'web' ? citation.web?.title : citation.pageTitle || 'Unknown Source'}</div>
                                            <div className="line-clamp-4 text-muted-foreground">{type === 'web' ? citation.web?.uri : citation.snippet || 'No preview available'}</div>
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-b border-r border-border rotate-45"></div>
                                        </div>
                                    )}
                                </span>
                            );
                        }
                        if (href.startsWith('highlight:')) {
                            const color = href.replace('highlight:', '');
                            return (
                                <span 
                                    className={`px-1 rounded-sm text-foreground ${getHighlightClassName(color)}`} 
                                >
                                    {children}
                                </span>
                            );
                        }
                        
                        // Handle external medical citation URLs (PubMed, ClinicalTrials, DOI, web search)
                        // These are inline markdown links like [Title](https://pubmed.ncbi.nlm.nih.gov/PMID/)
                        const isPubMedUrl = href.includes('pubmed.ncbi.nlm.nih.gov/');
                        const isClinicalTrialsUrl = href.includes('clinicaltrials.gov/study/');
                        const isDoiUrl = href.includes('doi.org/');
                        const isWebSearchUrl = citations?.some((c: any) => c.web?.uri === href);
                        
                        if (isPubMedUrl || isClinicalTrialsUrl || isDoiUrl || isWebSearchUrl) {
                            // Extract the ID (PMID, NCT, or DOI) from the href for robust matching
                            const pmidMatch = href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
                            const nctMatch = href.match(/clinicaltrials\.gov\/study\/(NCT\d+)/i);
                            const doiMatch = href.match(/doi\.org\/(10\.\d{4,}\/[^\s)]+)/i);
                            const extractedId = pmidMatch?.[1] || nctMatch?.[1] || doiMatch?.[1];
                            
                            // Find matching citation by ID (not exact URL) to handle URL format differences
                            let matchingCitation = null;
                            if (extractedId) {
                                matchingCitation = citations?.find((c: any) => {
                                    const citUrl = c.web?.uri || '';
                                    if (pmidMatch && citUrl.includes(pmidMatch[1])) return true;
                                    if (nctMatch && citUrl.includes(nctMatch[1])) return true;
                                    if (doiMatch && citUrl.includes(doiMatch[1])) return true;
                                    return false;
                                });
                            }
                            // Fallback to exact URL match
                            if (!matchingCitation) {
                                matchingCitation = citations?.find((c: any) => c.web?.uri === href);
                            }
                            
                            // Use the correct URL from groundingChunks if available, otherwise use the AI's href
                            const correctUrl = matchingCitation?.web?.uri || href;
                            
                            // Determine badge style based on source type
                            let badgeClass = 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20';
                            let badgeIcon = '📄';
                            let badgeLabel = '';
                            
                            if (isPubMedUrl) {
                                badgeClass = 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
                                badgeIcon = '📚';
                                badgeLabel = 'PubMed';
                            } else if (isClinicalTrialsUrl) {
                                badgeClass = 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800';
                                badgeIcon = '🏥';
                                badgeLabel = 'ClinicalTrial';
                            } else if (isDoiUrl) {
                                badgeClass = 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
                                badgeIcon = '🔗';
                                badgeLabel = 'DOI';
                            }
                            
                            // Check if the link text is a PMID/NCT/DOI reference (e.g., "PMID: 42152292")
                            const isReferenceStyle = /^PMID:\s*\d+$/i.test(String(children)) || /^NCT\d+$/i.test(String(children)) || /^DOI:\s*10\./i.test(String(children));
                            
                            if (isReferenceStyle) {
                                // Render as a compact citation badge
                                return (
                                    <span className="relative group/citation inline-flex mx-0.5">
                                        <a 
                                            href={correctUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium border transition-all ${badgeClass}`}
                                            onClick={(e) => { e.stopPropagation(); }}
                                        >
                                            <span className="text-[10px]">{badgeIcon}</span>
                                            {children}
                                        </a>
                                        {matchingCitation && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-popover text-popover-foreground text-xs rounded-lg shadow-xl border border-border opacity-0 invisible group-hover/citation:opacity-100 group-hover/citation:visible transition-all z-50 pointer-events-none">
                                                <div className="font-semibold mb-1 truncate">{matchingCitation.web?.title || children}</div>
                                                <div className="line-clamp-4 text-muted-foreground">{matchingCitation.web?.uri}</div>
                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-b border-r border-border rotate-45"></div>
                                            </div>
                                        )}
                                    </span>
                                );
                            }
                            
                            return (
                                <span className="relative group/citation inline-block mx-0.5">
                                    <a 
                                        href={correctUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium border transition-all ${badgeClass}`}
                                        onClick={(e) => { e.stopPropagation(); }}
                                    >
                                        {children}
                                    </a>
                                    {matchingCitation && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-popover text-popover-foreground text-xs rounded-lg shadow-xl border border-border opacity-0 invisible group-hover/citation:opacity-100 group-hover/citation:visible transition-all z-50 pointer-events-none">
                                            <div className="font-semibold mb-1 truncate">{matchingCitation.web?.title || children}</div>
                                            <div className="line-clamp-4 text-muted-foreground">{matchingCitation.web?.uri}</div>
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-b border-r border-border rotate-45"></div>
                                        </div>
                                    )}
                                </span>
                            );
                        }
                        
                        return <a className="text-primary underline underline-offset-4 decoration-primary/30 hover:decoration-primary transition-all font-medium" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
                    },
                    ul: ({node, children, ...props}) => <ul className="list-disc list-outside pl-6 my-3 space-y-1.5 marker:text-muted-foreground" {...props}>{children}</ul>,
                    ol: ({node, children, ...props}) => <ol className="list-decimal list-outside pl-6 my-3 space-y-1.5 marker:text-muted-foreground font-medium" {...props}>{children}</ol>,
                    h1: ({node, children, ...props}) => <h1 className="text-3xl font-bold tracking-tight mb-4 mt-8 pb-2 border-b border-border/50" {...props}>{children}</h1>,
                    h2: ({node, children, ...props}) => <h2 className="text-2xl font-semibold tracking-tight mb-3 mt-6" {...props}>{children}</h2>,
                    h3: ({node, children, ...props}) => <h3 className="text-xl font-semibold tracking-tight mb-2 mt-4" {...props}>{children}</h3>,
                    h4: ({node, children, ...props}) => <p className="text-lg font-bold underline underline-offset-4 decoration-foreground/40 mb-2 mt-4" {...props}>{children}</p>,
                    h5: ({node, children, ...props}) => <p className="text-base underline underline-offset-4 decoration-foreground/30 mb-1.5 mt-3" {...props}>{children}</p>,
                    h6: ({node, children, ...props}) => <p className="text-sm font-semibold tracking-tight mb-1.5 mt-3 text-foreground/70 uppercase" {...props}>{children}</p>,
                    strong: ({node, children, ...props}) => <strong className="font-bold text-foreground" {...props}>{children}</strong>,
                    em: ({node, children, ...props}) => <em className="italic text-foreground/90" {...props}>{children}</em>,
                    hr: ({node, ...props}) => <hr className="my-6 border-border/50" {...props} />,
                    img: ({node, src, alt, ...props}) => (
                        <SmartImage src={src} alt={alt} onOpenImageModal={onOpenImageModal} />
                    ),
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
};

const MarkdownRenderer = React.memo(MarkdownRendererInner);
export default MarkdownRenderer;