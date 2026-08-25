import mammoth from 'mammoth';

export const localFileService = {
    async parseFile(file: File): Promise<string> {
        const extension = file.name.split('.').pop()?.toLowerCase();
        
        if (extension === 'txt' || extension === 'md' || extension === 'csv') {
            return await file.text();
        } else if (extension === 'docx') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        } else if (extension === 'pdf') {
            // Use pdfjs-dist from window
            const pdfjsLib = (window as any).pdfjsLib;
            if (!pdfjsLib) {
                throw new Error("PDF.js library not loaded");
            }
            
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += pageText + '\n\n';
            }
            
            return fullText;
        }
        
        throw new Error(`Unsupported file type: ${extension}`);
    }
};
