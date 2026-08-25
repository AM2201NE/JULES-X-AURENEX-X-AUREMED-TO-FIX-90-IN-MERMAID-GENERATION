import React, { useRef, useEffect, useState } from 'react';
import type { ImageAnalysis, OCRChunk, VisualEntity } from '../types';

interface ImageOverlayProps {
    analysis: ImageAnalysis;
    analysisIndex: number;
    activeItemId: string | null;
    hoveredItemId: string | null;
    onItemClick: (info: { analysisIndex: number; itemId: string } | null) => void;
    onItemHover: (info: { analysisIndex: number; itemId: string } | null) => void;
    onOpenImageModal?: (src: string) => void;
}

type OverlayItem = (OCRChunk & { itemType: 'ocr' }) | (VisualEntity & { itemType: 'entity' });

const ImageOverlay: React.FC<ImageOverlayProps> = ({ analysis, analysisIndex, activeItemId, hoveredItemId, onItemClick, onItemHover, onOpenImageModal }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

    const { imageUri, naturalWidth, naturalHeight, ocr, entities } = analysis;
    
    // The model will generate OCR IDs. We need to prepend the analysis index to make them unique across multiple images.
    const getFullItemId = (item: OverlayItem) => {
        return item.itemType === 'ocr' ? `ocr-${analysisIndex}-${item.id}` : `entity-${analysisIndex}-${item.id}`;
    };

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                setContainerRect(containerRef.current.getBoundingClientRect());
            }
        };
        handleResize();
        const resizeObserver = new ResizeObserver(handleResize);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (containerRef.current) {
                resizeObserver.unobserve(containerRef.current);
            }
        };
    }, []);

    const handleOverlayClick = (e: React.MouseEvent, item: OverlayItem) => {
        e.stopPropagation();
        onItemClick({ analysisIndex, itemId: getFullItemId(item) });
    };
    
    const handleContainerClick = () => {
        onItemClick(null);
    };

    const allItems: OverlayItem[] = [
        ...(ocr || []).map(o => ({ ...o, itemType: 'ocr' as const })),
        ...(entities || []).map(e => ({ ...e, itemType: 'entity' as const })),
    ];
    
    const activeItem = activeItemId ? allItems.find(item => getFullItemId(item) === activeItemId) : null;
    
    const calculateTooltipPosition = (item: OverlayItem) => {
        if (!containerRect) return { display: 'none' };

        const itemTop = (item.bbox.y / naturalHeight) * containerRect.height;
        const itemLeft = (item.bbox.x / naturalWidth) * containerRect.width;
        const itemHeight = (item.bbox.height / naturalHeight) * containerRect.height;

        const top = itemTop + itemHeight + 8;
        
        return {
            top: `${top}px`,
            left: `${itemLeft}px`,
            maxWidth: '250px',
        };
    };

    return (
        <div
            id={`image-analysis-${analysisIndex}`}
            ref={containerRef}
            className="relative w-full my-2 border rounded-lg overflow-hidden"
            onClick={handleContainerClick}
        >
            <img 
                src={imageUri} 
                alt="Analyzed content" 
                className="w-full h-auto block cursor-zoom-in"
                onClick={(e) => {
                    if (onOpenImageModal) {
                        e.stopPropagation();
                        onOpenImageModal(imageUri);
                    }
                }}
            />
            
            {containerRect && allItems.map(item => {
                const fullId = getFullItemId(item);
                const style = {
                    left: `${(item.bbox.x / naturalWidth) * 100}%`,
                    top: `${(item.bbox.y / naturalHeight) * 100}%`,
                    width: `${(item.bbox.width / naturalWidth) * 100}%`,
                    height: `${(item.bbox.height / naturalHeight) * 100}%`,
                };

                const isActive = activeItemId === fullId;
                const isHovered = hoveredItemId === fullId;
                const itemClass = item.itemType === 'ocr' 
                    ? 'border-yellow-500/50 hover:bg-yellow-500/20' 
                    : 'border-purple-500/50 hover:bg-purple-500/20 rounded-md';

                return (
                    <div
                        key={fullId}
                        style={style}
                        onClick={(e) => handleOverlayClick(e, item)}
                        onMouseEnter={() => onItemHover({ analysisIndex, itemId: fullId })}
                        onMouseLeave={() => onItemHover(null)}
                        className={`absolute border-2 transition-all duration-200 cursor-pointer
                            ${itemClass}
                            ${isActive ? 'bg-primary/30 ring-2 ring-offset-2 ring-offset-background ring-primary !border-primary' : ''}
                            ${isHovered && !isActive ? 'bg-accent !border-primary/70' : ''}
                        `}
                    />
                );
            })}
            
            {activeItem && containerRect && (
                <div
                    style={calculateTooltipPosition(activeItem)}
                    className="absolute z-10 p-2 text-xs bg-card text-card-foreground rounded-md shadow-lg border animate-fade-in-fast"
                >
                    {activeItem.itemType === 'ocr' ? `"${activeItem.text}"` : activeItem.label}
                </div>
            )}
        </div>
    );
};

export default ImageOverlay;