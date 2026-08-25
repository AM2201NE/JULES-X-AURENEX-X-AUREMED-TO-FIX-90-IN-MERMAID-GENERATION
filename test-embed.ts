import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
    try {
        const result = await ai.models.embedContent({
            model: 'gemini-embedding-2-preview',
            contents: ["Hello world", "Another string"],
        });
        console.log("Embeddings length:", result.embeddings?.length ?? 0);
        if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0]?.values) {
            console.log("First embedding length:", result.embeddings[0].values.length);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
