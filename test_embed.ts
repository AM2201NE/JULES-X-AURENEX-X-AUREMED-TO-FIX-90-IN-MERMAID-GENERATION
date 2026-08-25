import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const res = await ai.models.embedContent({
    model: 'gemini-embedding-2-preview',
    contents: ['hello', 'world']
  });
  console.log(res.embeddings?.length);
}
run();
