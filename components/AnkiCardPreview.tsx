import React, { useState } from 'react';
import type { AnkiCard } from '../types';
import { ChevronDownIcon, ExternalLinkIcon } from './icons';
import { processExplanationHtml } from '../services/ankiService';

const AnkiCardPreviewItem: React.FC<{ card: AnkiCard, index: number }> = ({ card, index }) => {
    const [isRevealed, setIsRevealed] = useState(false);

    const isCorrect = (choiceLabel: string, answer: string | string[]) => {
        if (Array.isArray(answer)) {
            return answer.includes(choiceLabel);
        }
        return choiceLabel === answer;
    };

    const displayAnswer = Array.isArray(card.answer) ? card.answer.join(', ') : card.answer;
    
    const questionContent = card.question_image_b64
        ? `${processExplanationHtml(card.question)}<br><img src="${card.question_image_b64}" class="mt-2 rounded-md border" />`
        : processExplanationHtml(card.question);


    return (
        <div className="p-3 border rounded-lg bg-background/50">
            <p className="text-sm text-muted-foreground font-semibold">Question {index + 1}</p>
            <div className="font-medium my-2" dangerouslySetInnerHTML={{ __html: questionContent }} />
            <div className="space-y-1.5 text-sm">
                {card.choices.map(choice => (
                    <div
                        key={choice.label}
                        className={`p-2 border rounded-md transition-colors ${
                            !isRevealed
                                ? 'border-border'
                                : isCorrect(choice.label, card.answer)
                                ? 'bg-green-500/20 border-green-500'
                                : 'bg-destructive/10 border-destructive/30'
                        }`}
                    >
                        <strong>{choice.label}.</strong> <span dangerouslySetInnerHTML={{ __html: processExplanationHtml(choice.text) }} />
                    </div>
                ))}
            </div>
            <button onClick={() => setIsRevealed(!isRevealed)} className="text-xs font-semibold text-primary hover:underline mt-3 flex items-center gap-1">
                {isRevealed ? 'Hide Answer' : 'Reveal Answer'} <ChevronDownIcon className={`w-4 h-4 transition-transform ${isRevealed ? 'rotate-180' : ''}`}/>
            </button>
            {isRevealed && (
                <div className="mt-3 pt-3 border-t text-sm space-y-4 animate-fade-in-fast">
                    <p><strong>Answer:</strong> {displayAnswer}</p>
                    
                    {/* Render Explanation as HTML to support the new styled components */}
                    <div className="explanation-content">
                        <p className="font-semibold mb-1">Explanation:</p>
                        <div 
                            className="text-muted-foreground"
                            dangerouslySetInnerHTML={{ __html: processExplanationHtml(card.explanation || '') }} 
                        />
                    </div>

                    {/* We no longer need the separate sources list here as it's now embedded in the explanation HTML */}
                </div>
            )}
        </div>
    );
}

const AnkiCardPreview: React.FC<{ cards: AnkiCard[] }> = ({ cards }) => {
    const [renderLimit, setRenderLimit] = useState(20);

    const visibleCards = cards.slice(0, renderLimit);
    const hasMore = renderLimit < cards.length;

    return (
        <div className="space-y-3">
            {visibleCards.map((card, i) => (
                <AnkiCardPreviewItem key={card.id || i} card={card} index={i} />
            ))}
            {hasMore && (
                <button 
                    onClick={() => setRenderLimit(prev => prev + 20)}
                    className="w-full p-2 text-sm text-primary hover:bg-primary/10 rounded-md transition-colors border border-primary/20 backdrop-blur-sm shadow-sm"
                >
                    Show {Math.min(20, cards.length - renderLimit)} more ... ({cards.length - renderLimit} remaining)
                </button>
            )}
        </div>
    );
};

export default AnkiCardPreview;