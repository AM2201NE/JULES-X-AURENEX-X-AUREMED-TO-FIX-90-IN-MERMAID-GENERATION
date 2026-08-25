import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testBatch() {
    try {
        const texts = Array.from({length: 100}, (_, i) => `This is test string number ${i}`);
        const result = await ai.models.embedContent({
            model: 'gemini-embedding-2-preview',
            contents: texts,
        });
        console.log("Embeddings returned:", result.embeddings?.length);
    } catch (e: any) {
        console.error("Error:", e?.message || e);
    }
}
testBatch();
