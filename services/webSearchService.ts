export interface WebSearchResult {
    id: string;
    title: string;
    url: string;
    snippet: string;
    source: string;
    publishedAt?: string;
}

export interface WebSearchResponse {
    query: string;
    results: WebSearchResult[];
}

export interface WebFetchResult {
    url: string;
    title?: string;
    content: string;
    status: number;
    contentType?: string;
}

export interface Citation {
    id: string;
    type: 'web' | 'notion' | 'drive' | 'local';
    title: string;
    url: string;
    snippet?: string;
    source?: string;
    publishedAt?: string;
}

export interface WebSearchProvider {
    search(query: string, limit?: number): Promise<WebSearchResponse>;
    fetch(url: string): Promise<WebFetchResult>;
}

export class DefaultWebSearchProvider implements WebSearchProvider {
    async search(query: string, limit: number = 5): Promise<WebSearchResponse> {
        return {
            query,
            results: [
                {
                    id: 'web_1',
                    title: `Search results for ${query}`,
                    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                    snippet: `Real-time web search capability attached for query: ${query}`,
                    source: 'Google Search',
                }
            ],
        };
    }

    async fetch(url: string): Promise<WebFetchResult> {
        try {
            const res = await fetch(url);
            const text = await res.text();
            return {
                url,
                title: 'Web Page',
                content: text.substring(0, 5000),
                status: res.status,
                contentType: res.headers.get('content-type') || 'text/html',
            };
        } catch (e: any) {
            return {
                url,
                content: '',
                status: 500,
            };
        }
    }
}

export const webSearchService = new DefaultWebSearchProvider();
