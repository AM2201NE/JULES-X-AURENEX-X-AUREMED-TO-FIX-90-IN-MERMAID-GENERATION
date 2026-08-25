import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

class EmbeddingPipeline {
    static task: any = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';
    static instance: any = null;

    static async getInstance(progress_callback?: Function) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    const { id, type, payload } = event.data;

    if (type === 'init') {
        try {
            await EmbeddingPipeline.getInstance((progress: any) => {
                self.postMessage({ id, type: 'progress', payload: progress });
            });
            self.postMessage({ id, type: 'ready' });
        } catch (error: any) {
            self.postMessage({ id, type: 'error', payload: error.message });
        }
    } else if (type === 'embed') {
        try {
            const extractor = await EmbeddingPipeline.getInstance();
            const BATCH_SIZE = 5; // Reduced from 25 to 5 to prevent CPU hogging
            const allEmbeddings: number[][] = [];
            
            for (let i = 0; i < payload.texts.length; i += BATCH_SIZE) {
                const batch = payload.texts.slice(i, i + BATCH_SIZE);
                const output = await extractor(batch, { pooling: 'mean', normalize: true });
                allEmbeddings.push(...output.tolist());
                
                // Yield to the event loop to prevent the device from freezing
                if (i + BATCH_SIZE < payload.texts.length) {
                    await new Promise(resolve => setTimeout(resolve, 15));
                }
            }
            
            self.postMessage({ id, type: 'result', payload: allEmbeddings });
        } catch (error: any) {
            self.postMessage({ id, type: 'error', payload: error.message });
        }
    }
});
