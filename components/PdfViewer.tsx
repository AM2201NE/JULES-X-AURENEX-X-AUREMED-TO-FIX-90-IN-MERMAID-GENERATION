import React, { useState, useEffect, useRef, useCallback } from 'react';
import { XIcon } from './icons';
import { fetchWithRetry } from '../services/notionService';

interface PdfViewerProps {
    isOpen: boolean;
    url: string | null;
    onClose: () => void;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ isOpen, url, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const renderPage = useCallback((num: number) => {
        if (!pdfDoc) return;
        setIsLoading(true);
        pdfDoc.getPage(num).then((page: any) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const viewport = page.getViewport({ scale: zoom });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: ctx,
                viewport: viewport,
            };
            page.render(renderContext).promise.then(() => {
                setIsLoading(false);
            });
        });
    }, [pdfDoc, zoom]);

    useEffect(() => {
        if (!isOpen) {
            setPdfDoc(null);
            setPageNum(1);
            setNumPages(0);
            setZoom(1);
            setError(null);
            return;
        }

        if (url) {
            setIsLoading(true);
            
            // PDF.js can accept a URL or a TypedArray.
            // Using fetchWithRetry to get the data through proxies manually first.
            const loadPdfData = async () => {
                try {
                    const response = await fetchWithRetry(url, {});
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const arrayBuffer = await response.arrayBuffer();
                    
                    const loadingTask = (window as any).pdfjsLib.getDocument({ data: arrayBuffer });
                    loadingTask.promise.then((pdf: any) => {
                        setPdfDoc(pdf);
                        setNumPages(pdf.numPages);
                        setError(null);
                    }).catch((err: any) => {
                        console.error('PDF.js task error:', err);
                        setError('Failed to parse PDF data.');
                        setIsLoading(false);
                    });
                } catch (err: any) {
                    console.error('Error fetching PDF:', err);
                    setError('Failed to load PDF file.');
                    setIsLoading(false);
                }
            };
            
            loadPdfData();
        }
    }, [isOpen, url]);

    useEffect(() => {
        if (pdfDoc) {
            renderPage(pageNum);
        }
    }, [pdfDoc, pageNum, renderPage]);
    
    const handleZoom = (newZoom: number) => {
      setZoom(Math.max(0.5, Math.min(3, newZoom)));
    };
    
    useEffect(() => {
        if (pdfDoc) {
            renderPage(pageNum);
        }
    }, [zoom]);


    if (!isOpen) return null;

    const onPrevPage = () => setPageNum(prev => Math.max(1, prev - 1));
    const onNextPage = () => setPageNum(prev => Math.min(numPages, prev + 1));

    return (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in-fast"
          onClick={onClose}
        >
            <div 
              className="bg-background rounded-lg shadow-2xl w-[95vw] h-[95vh] max-w-5xl flex flex-col overflow-hidden animate-scale-in"
              onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-3 border-b bg-muted/50 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 rounded-md hover:bg-accent text-muted-foreground"><XIcon className="w-5 h-5"/></button>
                        <div className="flex items-center gap-2">
                           <button onClick={onPrevPage} disabled={pageNum <= 1} className="px-2 py-1 text-sm rounded bg-secondary disabled:opacity-50">Prev</button>
                           <span>Page {pageNum} of {numPages || '...'}</span>
                           <button onClick={onNextPage} disabled={pageNum >= numPages} className="px-2 py-1 text-sm rounded bg-secondary disabled:opacity-50">Next</button>
                        </div>
                        <div className="flex items-center gap-2">
                           <button onClick={() => handleZoom(zoom - 0.2)} className="px-2 py-1 text-sm rounded bg-secondary disabled:opacity-50">-</button>
                           <span>{Math.round(zoom * 100)}%</span>
                           <button onClick={() => handleZoom(zoom + 0.2)} className="px-2 py-1 text-sm rounded bg-secondary disabled:opacity-50">+</button>
                        </div>
                    </div>
                    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary hover:underline">Open original</a>
                </header>
                <main className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/30">
                    {isLoading && <div className="text-foreground">Loading PDF...</div>}
                    {error && <div className="text-destructive">{error}</div>}
                    <canvas ref={canvasRef} className={`${isLoading || error ? 'hidden' : 'block'} max-w-full max-h-full object-contain shadow-lg`}></canvas>
                </main>
            </div>
        </div>
    );
};

export default PdfViewer;