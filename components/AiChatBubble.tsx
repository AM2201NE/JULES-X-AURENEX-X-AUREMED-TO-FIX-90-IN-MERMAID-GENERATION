import React from 'react';
import { AiLogoIcon } from './icons';

interface AiChatBubbleProps {
    onOpen: () => void;
}

const AiChatBubble: React.FC<AiChatBubbleProps> = ({ onOpen }) => {
    return (
        <button
            onClick={onOpen}
            className="fixed bottom-6 right-6 z-[90] w-16 h-16 bg-primary text-primary-foreground rounded-full shadow-2xl flex items-center justify-center transform transition-transform duration-200 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background animate-scale-in"
            aria-label="Open AurePal AI Chat"
        >
            <AiLogoIcon className="w-8 h-8" />
        </button>
    );
};

export default AiChatBubble;
