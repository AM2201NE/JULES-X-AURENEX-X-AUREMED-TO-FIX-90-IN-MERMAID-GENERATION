import React, { useRef, useEffect } from 'react';
import type { Block, BlockType } from '../types';
import { BlockType as BlockTypeEnum } from '../types';
import ContentEditable from 'react-contenteditable';
import { ChevronRightIcon, DragHandleIcon } from './icons';
import TableBlock from './TableBlock';

interface EditableBlockProps {
    block: Block;
    isActive: boolean;
    listNumber?: number;
    updateBlock: (block: Block) => void;
    addBlock: (currentBlockId: string, updatedContent: string) => void;
    deleteBlock: (blockId: string) => void;
    setActiveBlock: () => void;
    openSlashMenu: (blockId: string, query: string, position: { top: number, left: number }) => void;
    closeSlashMenu: () => void;
    indentBlock: (blockId: string) => void;
    unindentBlock: (blockId: string) => void;
}

const MARKDOWN_SHORTCUTS = [
    { regex: /^#\s/, type: BlockTypeEnum.H1 },
    { regex: /^##\s/, type: BlockTypeEnum.H2 },
    { regex: /^###\s/, type: BlockTypeEnum.H3 },
    { regex: /^\>\s/, type: BlockTypeEnum.TOGGLE },
    { regex: /^"\s/, type: BlockTypeEnum.QUOTE },
    { regex: /^\*\s/, type: BlockTypeEnum.UL },
    { regex: /^\-\s/, type: BlockTypeEnum.UL },
    { regex: /^1\.\s/, type: BlockTypeEnum.OL },
    { regex: /^\[\]\s/, type: BlockTypeEnum.TODO },
    { regex: /^---\s*$/, type: BlockTypeEnum.DIVIDER },
];


const EditableBlock: React.FC<EditableBlockProps> = ({ block, isActive, listNumber, updateBlock, addBlock, deleteBlock, setActiveBlock, openSlashMenu, closeSlashMenu, indentBlock, unindentBlock }) => {
    const contentRef = useRef<HTMLElement>(null!);

    useEffect(() => {
        if (isActive && contentRef.current) {
            contentRef.current.focus();
        }
    }, [isActive]);

    const handleChange = () => {
        if (!contentRef.current) return;
        const newHtml = contentRef.current.innerHTML;

        if (newHtml === block.content) return;
        
        const newText = contentRef.current.innerText;

        for (const shortcut of MARKDOWN_SHORTCUTS) {
            if (shortcut.regex.test(newText)) {
                const strippedContent = newText.replace(shortcut.regex, '');
                updateBlock({ ...block, type: shortcut.type, content: strippedContent });
                return;
            }
        }

        if (newText.startsWith('/')) {
            const rect = contentRef.current?.getBoundingClientRect();
            if (rect) {
                openSlashMenu(block.id, newText.slice(1), { top: rect.bottom, left: rect.left });
            }
        } else {
            closeSlashMenu();
        }
        updateBlock({ ...block, content: newHtml });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        const currentHtml = contentRef.current?.innerHTML || '';
        
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            indentBlock(block.id);
            return;
        }

        if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            unindentBlock(block.id);
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addBlock(block.id, currentHtml);
            return;
        }
        if (e.key === 'Backspace' && !currentHtml) {
            e.preventDefault();
            deleteBlock(block.id);
            return;
        }
    };

    const toggleChecked = () => {
        if (block.type === BlockTypeEnum.TODO) {
            updateBlock({ ...block, checked: !block.checked });
        }
    };

    const commonProps = {
        innerRef: contentRef,
        html: block.content,
        onChange: handleChange,
        onKeyDown: handleKeyDown,
        onClick: setActiveBlock,
    };
    
    const placeholderClass = "before:content-[attr(data-placeholder)] before:absolute before:left-0 before:top-0 before:text-muted-foreground/70 before:pointer-events-none";

    const getEditableProps = (className: string, placeholder: string) => {
        const isEffectivelyEmpty = !block.content.replace(/<.*?>/g, '').trim();
        return {
            ...commonProps,
            className: `focus:outline-none w-full relative ${className} ${isEffectivelyEmpty ? placeholderClass : ''}`,
            'data-placeholder': placeholder
        };
    };

    const renderBlock = () => {
        switch (block.type) {
            case BlockTypeEnum.H1:
                return <ContentEditable tagName="h1" {...getEditableProps('text-3xl font-bold my-4', 'Heading 1')} />;
            case BlockTypeEnum.H2:
                return <ContentEditable tagName="h2" {...getEditableProps('text-2xl font-bold my-3', 'Heading 2')} />;
            case BlockTypeEnum.H3:
                return <ContentEditable tagName="h3" {...getEditableProps('text-xl font-bold my-2', 'Heading 3')} />;
            case BlockTypeEnum.UL:
                return (
                    <div className="flex items-start">
                        <span className="text-primary mr-3 text-2xl leading-tight flex-shrink-0 select-none">•</span>
                        <ContentEditable tagName="div" {...getEditableProps('leading-relaxed', 'List item')} />
                    </div>
                );
             case BlockTypeEnum.OL:
                return (
                    <div className="flex items-start">
                        <span className="text-foreground font-medium mr-2 w-6 select-none flex-shrink-0 text-right">{listNumber}.</span>
                        <ContentEditable tagName="div" {...getEditableProps('leading-relaxed', 'List item')} />
                    </div>
                );
            case BlockTypeEnum.TODO:
                return (
                    <div className="flex items-center gap-2 my-1">
                        <input type="checkbox" checked={!!block.checked} onChange={toggleChecked} className="w-4 h-4 rounded text-primary bg-input border-border focus:ring-ring cursor-pointer" />
                        <ContentEditable tagName="div" {...getEditableProps(`${block.checked ? 'line-through text-muted-foreground' : ''}`, 'To-do')} />
                    </div>
                );
            case BlockTypeEnum.QUOTE:
                return (
                    <blockquote className="border-l-4 border-primary pl-4 my-4">
                        <ContentEditable tagName="p" {...getEditableProps('text-muted-foreground italic', 'Quote')} />
                    </blockquote>
                );
            case BlockTypeEnum.CODE:
                return (
                     <div className="bg-muted p-4 rounded-md my-4">
                        <ContentEditable tagName="pre" {...getEditableProps('font-mono text-sm whitespace-pre-wrap', 'Code')} />
                     </div>
                );
            case BlockTypeEnum.DIVIDER:
                return <hr className="my-8 border-border" />;
            case BlockTypeEnum.IMAGE:
                return (
                    <figure className="my-4">
                        <img src={block.url} alt={block.content} className="w-full h-auto rounded-md border" />
                        <figcaption>
                             <ContentEditable 
                                tagName="div" 
                                {...getEditableProps('text-center text-sm text-muted-foreground mt-2 italic', 'Image caption...')} 
                             />
                        </figcaption>
                    </figure>
                );
            case BlockTypeEnum.TOGGLE:
                return (
                    <div className="flex items-start my-1">
                        <button
                            onClick={() => updateBlock({ ...block, isOpen: !block.isOpen })}
                            aria-expanded={block.isOpen}
                            className="p-1 rounded hover:bg-accent flex-shrink-0 mr-1"
                        >
                            <ChevronRightIcon className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${block.isOpen ? 'rotate-90' : ''}`} />
                        </button>
                        <ContentEditable tagName="div" {...getEditableProps('leading-relaxed', 'Toggle')} />
                    </div>
                );
            case BlockTypeEnum.TABLE:
                return <TableBlock block={block} updateBlock={updateBlock} />;
            case BlockTypeEnum.P:
            default:
                return <ContentEditable tagName="p" {...getEditableProps('my-1 leading-relaxed', "Type '/' for commands...")} />;
        }
    };

    return (
        <div id={block.id} className="relative group flex items-start">
            <div className="absolute top-0.5 -left-8 flex items-center h-full opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 transition-opacity">
                <button className="p-1 rounded hover:bg-accent text-muted-foreground cursor-grab active:cursor-grabbing">
                    <DragHandleIcon className="w-4 h-4" />
                </button>
            </div>
            <div className="flex-1 min-w-0">
                {renderBlock()}
            </div>
        </div>
    );
};

export default EditableBlock;