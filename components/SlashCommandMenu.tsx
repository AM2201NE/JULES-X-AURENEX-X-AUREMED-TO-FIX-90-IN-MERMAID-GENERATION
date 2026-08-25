import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BlockType } from '../types';
import { TypeIcon, Heading1Icon, Heading2Icon, Heading3Icon, ListIcon, ListOrderedIcon, CheckSquareIcon, QuoteIcon, CodeIcon, MinusIcon, ToggleIcon, TableIcon } from './icons';

interface SlashCommandMenuProps {
    query: string;
    position: { top: number; left: number };
    editorBounds: DOMRect;
    onSelect: (type: BlockType) => void;
    onClose: () => void;
}

const COMMANDS = [
    { type: BlockType.P, icon: TypeIcon, title: 'Text', description: 'Just start writing with plain text.' },
    { type: BlockType.H1, icon: Heading1Icon, title: 'Heading 1', description: 'Big section heading.' },
    { type: BlockType.H2, icon: Heading2Icon, title: 'Heading 2', description: 'Medium section heading.' },
    { type: BlockType.H3, icon: Heading3Icon, title: 'Heading 3', description: 'Small section heading.' },
    { type: BlockType.TOGGLE, icon: ToggleIcon, title: 'Toggle list', description: 'Create a collapsible list.' },
    { type: BlockType.UL, icon: ListIcon, title: 'Bulleted list', description: 'Create a simple bulleted list.' },
    { type: BlockType.OL, icon: ListOrderedIcon, title: 'Numbered list', description: 'Create a list with numbering.' },
    { type: BlockType.TODO, icon: CheckSquareIcon, title: 'To-do list', description: 'Track tasks with a checklist.' },
    { type: BlockType.TABLE, icon: TableIcon, title: 'Table', description: 'Add a simple table.' },
    { type: BlockType.QUOTE, icon: QuoteIcon, title: 'Quote', description: 'Capture a quote.' },
    { type: BlockType.CODE, icon: CodeIcon, title: 'Code', description: 'Capture a code snippet.' },
    { type: BlockType.DIVIDER, icon: MinusIcon, title: 'Divider', description: 'Visually divide sections.' },
];

const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({ query, position, editorBounds, onSelect, onClose }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);

    const filteredCommands = useMemo(() => {
        if (!query) return COMMANDS;
        return COMMANDS.filter(cmd => cmd.title.toLowerCase().includes(query.toLowerCase()));
    }, [query]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredCommands]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev === 0 ? filteredCommands.length - 1 : prev - 1));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev === filteredCommands.length - 1 ? 0 : prev + 1));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredCommands[selectedIndex]) {
                    onSelect(filteredCommands[selectedIndex].type);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [filteredCommands, selectedIndex, onSelect, onClose]);

    useEffect(() => {
        menuRef.current?.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const style = {
        top: position.top - editorBounds.top,
        left: position.left - editorBounds.left,
    };

    return (
        <div
            ref={menuRef}
            style={style}
            className="absolute z-50 w-72 max-h-80 overflow-y-auto bg-card border rounded-lg shadow-xl p-2 animate-fade-in-fast"
        >
            {filteredCommands.length > 0 ? (
                filteredCommands.map((cmd, index) => (
                    <button
                        key={cmd.type}
                        onClick={() => onSelect(cmd.type)}
                        className={`w-full flex items-center gap-3 p-2 rounded-md text-left ${
                            index === selectedIndex ? 'bg-accent' : ''
                        }`}
                    >
                        <cmd.icon className="w-6 h-6 p-1 bg-background border rounded-md text-muted-foreground" />
                        <div>
                            <p className="font-semibold text-foreground">{cmd.title}</p>
                            <p className="text-xs text-muted-foreground">{cmd.description}</p>
                        </div>
                    </button>
                ))
            ) : (
                <p className="p-2 text-sm text-muted-foreground">No commands found</p>
            )}
        </div>
    );
};

export default SlashCommandMenu;
