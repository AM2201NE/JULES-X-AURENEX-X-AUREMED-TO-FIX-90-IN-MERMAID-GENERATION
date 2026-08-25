import React from 'react';

interface HighlightToolbarProps {
    position: { top: number, left: number };
    onSelectColor: (color: string) => void;
}

const HighlightToolbar: React.FC<HighlightToolbarProps> = ({ position, onSelectColor }) => {
    const colors = ['yellow', 'green', 'blue', 'pink'];

    const style = {
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
    };

    return (
        <div 
            style={style}
            className="absolute z-10 flex items-center gap-1 p-1.5 bg-card border rounded-lg shadow-lg animate-fade-in-fast"
            onMouseDown={(e) => e.preventDefault()} // Prevent editor from losing focus
        >
            {colors.map(color => (
                <button
                    key={color}
                    onClick={() => onSelectColor(color)}
                    className={`w-6 h-6 rounded-md border-2 border-transparent hover:border-primary transition-colors`}
                    style={{ backgroundColor: `var(--highlight-${color}-bg, ${color})` }}
                    aria-label={`Highlight ${color}`}
                />
            ))}
        </div>
    );
};

export default HighlightToolbar;