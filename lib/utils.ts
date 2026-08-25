import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateLocalTags(title: string, content: string, count: number = 5): string[] {
    const stopWords = new Set([
        // English
        'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'of', 'to', 'for', 'with', 'it', 'as', 'be', 'are', 'this', 'that', 'by', 'or', 'from', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'each', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part', 'https', 'http', 'com', 'www', 'have', 'has', 'had', 'does',
        // French
        'le', 'la', 'les', 'de', 'des', 'un', 'une', 'et', 'à', 'en', 'dans', 'pour', 'qui', 'que', 'sur', 'avec', 'ce', 'ces', 'se', 'pas', 'est', 'sont', 'ou', 'par', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'au', 'aux', 'du', 'ne', 'plus', 'tout', 'tous', 'fait', 'faire', 'être', 'avoir', 'comme', 'mais', 'son', 'sa', 'ses', 'leur', 'leurs', 'cette'
    ]);

    const frequencies = new Map<string, number>();

    const processText = (text: string, weight: number) => {
        if (!text) return;
        // Match words including accents
        const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
        for (const word of words) {
            if (word.length > 3 && !stopWords.has(word) && !/^\d+$/.test(word)) {
                frequencies.set(word, (frequencies.get(word) || 0) + weight);
            }
        }
    };

    // Give title words a massive boost
    processText(title, 10);
    processText(content, 1);

    return Array.from(frequencies.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(e => e[0].charAt(0).toUpperCase() + e[0].slice(1)); // Capitalize
}

export function extractKeywords(text: string, count: number = 5): string[] {
    return generateLocalTags('', text, count).map(t => t.toLowerCase());
}