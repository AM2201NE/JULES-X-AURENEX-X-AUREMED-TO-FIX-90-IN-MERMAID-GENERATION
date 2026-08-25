import React, { useState, useEffect, useCallback, useRef } from 'react';
import { dataService } from '../services/dataService';
import type { Page, Block } from '../types';
import { BlockType as BlockTypeEnum } from '../types';
import { ArrowLeftIcon } from './icons';
import { v4 as uuidv4 } from 'uuid';
import { useDebouncedCallback } from 'use-debounce';
import SlashCommandMenu from './SlashCommandMenu';
import EditableBlock from './EditableBlock';
import { produce } from 'immer';
import HighlightToolbar from './HighlightToolbar';


interface PageEditorProps {
    pageId: string;
    navigateToDashboard: () => void;
    highlightBlockId?: string;
    fromAi?: boolean;
    snippet?: string;
}

const findBlockPathById = (blocks: Block[], blockId: string): Block[] | null => {
    if (!blocks) return null;
    for (const block of blocks) {
        if (!block) continue;
        if (block.id === blockId) return [block];
        if (block.children) {
            const path = findBlockPathById(block.children, blockId);
            if (path) return [block, ...path];
        }
    }
    return null;
};

const findDeepestElementWithText = (text: string, root: HTMLElement): HTMLElement | null => {
    const normalizeText = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Find a clean alphanumeric substring to search for, avoiding formatting artifacts
    const cleanMatch = text.match(/[a-zA-Z0-9\s]{20,}/);
    const searchString = normalizeText(cleanMatch ? cleanMatch[0].substring(0, 40) : text.substring(0, 40));
    
    if (!searchString || searchString.length < 5) return null;

    let deepestElement: HTMLElement | null = null;
    const domElements = Array.from(root.querySelectorAll('div, p, h1, h2, h3, li, span'));
    
    for (const el of domElements) {
        if (el.textContent && normalizeText(el.textContent).includes(searchString)) {
            const hasChildWithText = Array.from(el.children).some(child => child.textContent && normalizeText(child.textContent).includes(searchString));
            if (!hasChildWithText) {
                deepestElement = el as HTMLElement;
                break;
            }
        }
    }
    return deepestElement;
};

const PageEditor: React.FC<PageEditorProps> = ({ pageId, navigateToDashboard, highlightBlockId, fromAi, snippet }) => {
    const [page, setPage] = useState<Page | null>(null);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [slashMenuState, setSlashMenuState] = useState({ isOpen: false, query: '', blockId: '', position: { top: 0, left: 0 } });
    const [highlightToolbarState, setHighlightToolbarState] = useState<{ top: number, left: number } | null>(null);
    const editorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const pageData = dataService.getPage(pageId);
        setPage(pageData ?? null);
        if (pageData?.content?.length) {
            const firstBlock = pageData.content.filter(Boolean)[0];
            if (firstBlock) {
                setActiveBlockId(firstBlock.id);
            }
        }
    }, [pageId]);
    
    useEffect(() => {
        if (highlightBlockId || snippet) {
            let attempts = 0;
            const blockIds = highlightBlockId ? highlightBlockId.split(',') : [];
            const interval = setInterval(() => {
                let elements: HTMLElement[] = [];
                
                if (snippet && editorRef.current) {
                    const el = findDeepestElementWithText(snippet, editorRef.current);
                    if (el) elements.push(el);
                }

                if (elements.length === 0) {
                    for (const id of blockIds) {
                        let element = document.getElementById(id);
                        
                        if (!element && id.length > 5 && editorRef.current) {
                            const el = findDeepestElementWithText(id, editorRef.current);
                            if (el) element = el;
                        }
                        if (element) {
                            elements.push(element);
                        }
                    }
                }

                if (elements.length > 0 || attempts > 210) { // Poll for ~10.5 seconds
                    clearInterval(interval);
                    if (elements.length > 0) {
                        for (const element of elements) {
                            // Open parent toggles if hidden
                            let parent = element.parentElement;
                            while (parent) {
                                if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) {
                                    parent.setAttribute('open', 'true');
                                }
                                parent = parent.parentElement;
                            }
                        }

                        setTimeout(() => {
                            elements[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            if (fromAi) {
                                for (const element of elements) {
                                    element?.classList.add('permanent-highlight');
                                }
                                const removeHighlight = () => {
                                    for (const element of elements) {
                                        element?.classList.remove('permanent-highlight');
                                    }
                                    document.removeEventListener('click', removeHighlight);
                                };
                                setTimeout(() => {
                                    document.addEventListener('click', removeHighlight);
                                }, 100);
                            } else {
                                const animationClass = 'animate-highlight-block';
                                for (const element of elements) {
                                    element?.classList.add(animationClass);
                                }
                                setTimeout(() => {
                                    for (const element of elements) {
                                        element?.classList.remove(animationClass);
                                    }
                                }, 10500); // Animation is 10s, give a bit extra
                            }
                        }, 100);
                    } else if (editorRef.current) {
                        // If not found, just scroll to top
                        editorRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }
                attempts++;
            }, 50); // Check every 50ms
            return () => clearInterval(interval);
        }
    }, [highlightBlockId, fromAi, page, snippet]);
    
    const applyHighlight = useCallback((color: string) => {
        const selection = window.getSelection();
        if (selection && selection.toString()) {
            // Using execCommand for simplicity in contentEditable.
            // Note: This is being deprecated but is the most straightforward way
            // to handle this without a full editor library.
            document.execCommand('insertHTML', false, `<span class="highlight-${color}">${selection.toString()}</span>`);
            setHighlightToolbarState(null);
        }
    }, []);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'H' && e.ctrlKey && e.shiftKey) {
                e.preventDefault();
                applyHighlight('yellow');
            }
        };
        const editorEl = editorRef.current;
        editorEl?.addEventListener('keydown', handleKeyDown);
        return () => editorEl?.removeEventListener('keydown', handleKeyDown);
    }, [applyHighlight]);


    const debouncedSave = useDebouncedCallback((updatedPage: Page) => {
        dataService.updatePage(updatedPage);
    }, 500);

    const updatePageAndSave = useCallback((producer: (draft: Page) => void) => {
        if (!page) return;
        const nextPage = produce(page, producer);
        setPage(nextPage);
        debouncedSave(nextPage);
    }, [page, debouncedSave]);

    const openedAncestorsForRef = useRef<string | null>(null);

    useEffect(() => {
        if (highlightBlockId && page && highlightBlockId.length > 5 && openedAncestorsForRef.current !== highlightBlockId) {
            const foundPathRef = { current: null as string[] | null };
            
            const searchBlocks = (blocks: Block[], path: string[]): boolean => {
                for (const block of blocks) {
                    if (block.id === highlightBlockId || block.content.includes(highlightBlockId.substring(0, 50))) {
                        foundPathRef.current = path;
                        return true;
                    }
                    if (block.children && block.children.length > 0) {
                        if (searchBlocks(block.children, [...path, block.id])) {
                            return true;
                        }
                    }
                }
                return false;
            };

            searchBlocks(page.content, []);

            const path: string[] | null = foundPathRef.current;
            if (path && path.length > 0) {
                openedAncestorsForRef.current = highlightBlockId;
                updatePageAndSave(draft => {
                    const openAncestors = (blocks: Block[]) => {
                        for (const block of blocks) {
                            if (path.includes(block.id)) {
                                block.isOpen = true;
                            }
                            if (block.children) {
                                openAncestors(block.children);
                            }
                        }
                    };
                    openAncestors(draft.content);
                });
            }
        }
    }, [highlightBlockId, page, updatePageAndSave]);

    const handleTitleChange = (e: React.FocusEvent<HTMLHeadingElement>) => {
        const newTitle = e.currentTarget.textContent || 'Untitled';
        updatePageAndSave(draft => {
            draft.title = newTitle;
        });
    };
    
    const handleUpdateBlock = useCallback((updatedBlock: Block) => {
        updatePageAndSave(draft => {
            const path = findBlockPathById(draft.content, updatedBlock.id);
            if (path) {
                const parentPath = path.slice(0, -1);
                let currentChildren = draft.content;
                for (const node of parentPath) {
                    if (!node.children) node.children = [];
                    currentChildren = currentChildren.find(b => b.id === node.id)!.children!;
                }
                const blockIndex = currentChildren.findIndex(b => b.id === updatedBlock.id);
                if (blockIndex !== -1) {
                    currentChildren[blockIndex] = updatedBlock;
                }
            }
        });
    }, [updatePageAndSave]);

    const handleAddBlock = useCallback((currentBlockId: string, currentBlockContent: string) => {
        const newBlock: Block = { id: uuidv4(), type: BlockTypeEnum.P, content: '' };
        updatePageAndSave(draft => {
            const path = findBlockPathById(draft.content, currentBlockId);
            if (!path) return;

            const block = path[path.length - 1];
            block.content = currentBlockContent; 

            if (block.type === BlockTypeEnum.TOGGLE && block.isOpen) {
                if (!block.children) block.children = [];
                // Add new block as the first child of the toggle
                block.children.unshift(newBlock);
            } else {
                 const parentPath = path.slice(0, -1);
                 let currentChildren = draft.content;
                 for(const node of parentPath) {
                    currentChildren = currentChildren.find(b => b.id === node.id)!.children!;
                 }
                 const blockIndex = currentChildren.findIndex(b => b.id === currentBlockId);
                 currentChildren.splice(blockIndex + 1, 0, newBlock);
            }
        });
        setTimeout(() => setActiveBlockId(newBlock.id), 0);
    }, [updatePageAndSave]);


    const handleDeleteBlock = useCallback((blockId: string) => {
        let nextActiveId: string | null = null;
        updatePageAndSave(draft => {
            const path = findBlockPathById(draft.content, blockId);
            if (!path || (path.length === 1 && draft.content.length === 1)) return;

            const parentPath = path.slice(0, -1);
            let siblings = draft.content;
            if (parentPath.length > 0) {
                 siblings = parentPath[parentPath.length - 1].children!;
            }
           
            const index = siblings.findIndex(b => b.id === blockId);
            if (index > 0) {
                 nextActiveId = siblings[index - 1].id;
            } else if (parentPath.length > 0) {
                 nextActiveId = parentPath[parentPath.length - 1].id;
            } else if (siblings.length > 1) {
                nextActiveId = siblings[1].id;
            }
            siblings.splice(index, 1);
        });

        if (nextActiveId) {
             setTimeout(() => setActiveBlockId(nextActiveId), 0);
        }
    }, [updatePageAndSave]);
    
    const handleIndentBlock = useCallback((blockId: string) => {
        updatePageAndSave(draft => {
            const path = findBlockPathById(draft.content, blockId);
            if (!path || path.length > 1) return; // For now, only top-level indent
            
            const index = draft.content.findIndex(b => b.id === blockId);
            if (index < 1) return; 
            
            const blockToMove = draft.content[index];
            const newParent = draft.content[index - 1];
            
            if(newParent.type !== BlockTypeEnum.TOGGLE) return;

            draft.content.splice(index, 1);
            if (!newParent.children) newParent.children = [];
            newParent.children.push(blockToMove);
            newParent.isOpen = true;
        });
    }, [updatePageAndSave]);

    const handleUnindentBlock = useCallback((blockId: string) => {
         updatePageAndSave(draft => {
            const path = findBlockPathById(draft.content, blockId);
            if (!path || path.length < 2) return; 

            const blockToMove = path[path.length - 1];
            const parent = path[path.length - 2];
            const grandParentPath = path.slice(0, -2);
            
            let insertionList = draft.content;
            if (grandParentPath.length > 0) {
                insertionList = grandParentPath[grandParentPath.length - 1].children!;
            }

            const parentIndexInGrandparent = insertionList.findIndex(b => b.id === parent.id);
            
            parent.children = parent.children!.filter(b => b.id !== blockId);
            insertionList.splice(parentIndexInGrandparent + 1, 0, blockToMove);
        });
    }, [updatePageAndSave]);

    const handleSlashCommand = (blockId: string, query: string, position: {top: number, left: number}) => {
        setSlashMenuState({isOpen: true, query, blockId, position});
    };

    const closeSlashMenu = () => {
        if (slashMenuState.isOpen) {
            setSlashMenuState(s => ({...s, isOpen: false}));
        }
    };
    
    const selectSlashCommand = (type: BlockTypeEnum) => {
        closeSlashMenu();

        updatePageAndSave(draft => {
            const path = findBlockPathById(draft.content, slashMenuState.blockId);
            if (!path) return;
            const block = path[path.length - 1];
            
            block.type = type;
            block.content = ''; // Reset content for the new block type

            if (type === BlockTypeEnum.TABLE) {
                block.tableData = {
                    rows: [
                        { id: uuidv4(), cells: [{id: uuidv4(), content: 'Header 1'}, {id: uuidv4(), content: 'Header 2'}] },
                        { id: uuidv4(), cells: [{id: uuidv4(), content: 'Cell 1'}, {id: uuidv4(), content: 'Cell 2'}] },
                    ]
                };
            } else {
                delete block.tableData;
            }
        });
        
        setTimeout(() => setActiveBlockId(slashMenuState.blockId), 0);
    };

    const handleMouseUp = () => {
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const editorRect = editorRef.current?.getBoundingClientRect();
                if (editorRect) {
                    setHighlightToolbarState({
                        top: rect.top - editorRect.top - 40, // Position above selection
                        left: rect.left - editorRect.left + rect.width / 2,
                    });
                }
            } else {
                setHighlightToolbarState(null);
            }
        }, 10);
    };

    if (!page) {
        return <div className="p-8 text-center flex-1">Page not found or loading...</div>;
    }

    const renderBlocks = (blocks: Block[], depth: number) => {
        let olCounter = 0;
        return (
            <div className="flex flex-col">
            {blocks.filter(Boolean).map((block, index) => {
                 const prevBlock = index > 0 ? blocks[index-1] : null;
                 if (block.type === BlockTypeEnum.OL) {
                    olCounter = (prevBlock && prevBlock.type === BlockTypeEnum.OL) ? olCounter + 1 : 1;
                } else {
                    olCounter = 0;
                }
                return (
                    <div 
                      key={block.id} 
                      className="animate-subtle-scale-in" 
                      style={{ 
                          marginLeft: depth > 0 ? '24px' : '0',
                          animationDelay: `${150 + index * 25}ms`,
                          opacity: 0,
                          borderLeft: depth > 0 ? '2px solid hsl(var(--border))' : 'none',
                          paddingLeft: depth > 0 ? '12px' : '0',
                       }}
                    >
                        <EditableBlock 
                            block={block}
                            isActive={block.id === activeBlockId}
                            listNumber={block.type === BlockTypeEnum.OL ? olCounter : undefined}
                            updateBlock={handleUpdateBlock}
                            addBlock={handleAddBlock}
                            deleteBlock={handleDeleteBlock}
                            setActiveBlock={() => setActiveBlockId(block.id)}
                            openSlashMenu={handleSlashCommand}
                            closeSlashMenu={closeSlashMenu}
                            indentBlock={handleIndentBlock}
                            unindentBlock={handleUnindentBlock}
                        />
                         {block.type === BlockTypeEnum.TOGGLE && block.isOpen && block.children && (
                            <div className="animate-fade-in-fast">
                                {renderBlocks(block.children, depth + 1)}
                            </div>
                        )}
                    </div>
                );
            })}
            </div>
        )
    }

    return (
        <main id={pageId} ref={editorRef} className="flex-1 p-4 md:p-8 overflow-y-auto animate-fade-in" onClick={closeSlashMenu} onMouseUp={handleMouseUp}>
             <div className="max-w-3xl mx-auto relative">
                <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 font-semibold">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back to Dashboard
                </button>
                
                 {highlightToolbarState && (
                    <HighlightToolbar
                        position={highlightToolbarState}
                        onSelectColor={applyHighlight}
                    />
                )}

                <div className="animate-fade-in-up mb-12" style={{ animationDelay: '100ms', opacity: 0 }}>
                    <h1 
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={handleTitleChange}
                        className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded-md px-2 -mx-2"
                    >
                        {page.title}
                    </h1>
                </div>
                
                {page.content && renderBlocks(page.content, 0)}

                {slashMenuState.isOpen && editorRef.current && (
                    <SlashCommandMenu 
                        query={slashMenuState.query}
                        position={slashMenuState.position}
                        editorBounds={editorRef.current.getBoundingClientRect()}
                        onSelect={selectSlashCommand}
                        onClose={closeSlashMenu}
                    />
                )}
            </div>
        </main>
    );
};

export default PageEditor;