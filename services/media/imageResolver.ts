export interface ResolvedImage {
    src: string;
    originalUrl: string;
    status: 'loaded' | 'proxy' | 'fallback' | 'error';
    mimeType?: string;
}

const ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
]);

export async function resolveImage(url: string): Promise<ResolvedImage> {
    if (!url || typeof url !== 'string') {
        return { src: '', originalUrl: '', status: 'error' };
    }

    const trimmed = url.trim();

    // Data URLs pass through directly
    if (trimmed.startsWith('data:image/')) {
        return { src: trimmed, originalUrl: trimmed, status: 'loaded' };
    }

    // Relative/Same-origin URLs pass through directly
    if (trimmed.startsWith('/') || (typeof window !== 'undefined' && trimmed.startsWith(window.location.origin))) {
        return { src: trimmed, originalUrl: trimmed, status: 'loaded' };
    }

    // Backend/Proxy verification attempt
    try {
        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(trimmed.replace(/^https?:\/\//, ''))}&output=webp`;
        return {
            src: proxyUrl,
            originalUrl: trimmed,
            status: 'proxy',
        };
    } catch (e) {
        return {
            src: trimmed,
            originalUrl: trimmed,
            status: 'fallback',
        };
    }
}
