import React from 'react';
import ContentEditable from 'react-contenteditable';
import { useDebouncedCallback } from 'use-debounce';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../types';
import { PlusIcon } from './icons';

interface TableBlockProps {
    block: Block;
    updateBlock: (block: Block) => void;
}

const TableBlock: React.FC<TableBlockProps> = ({ block, updateBlock }) => {
    
    const debouncedUpdate = useDebouncedCallback((newBlock: Block) => {
        updateBlock(newBlock);
    }, 300);

    const handleCellChange = (rowIndex: number, cellIndex: number, content: string) => {
        const nextBlock = produce(block, draft => {
            if (draft.tableData) {
                draft.tableData.rows[rowIndex].cells[cellIndex].content = content;
            }
        });
        debouncedUpdate(nextBlock);
    };

    const addRow = () => {
        const nextBlock = produce(block, draft => {
            if (draft.tableData) {
                const columnCount = draft.tableData.rows[0]?.cells.length || 1;
                draft.tableData.rows.push({
                    id: uuidv4(),
                    cells: Array.from({ length: columnCount }, () => ({ id: uuidv4(), content: '' }))
                });
            }
        });
        updateBlock(nextBlock);
    };

    const addColumn = () => {
        const nextBlock = produce(block, draft => {
            if (draft.tableData) {
                draft.tableData.rows.forEach(row => {
                    row.cells.push({ id: uuidv4(), content: '' });
                });
            }
        });
        updateBlock(nextBlock);
    };

    if (!block.tableData) return null;

    return (
        <div className="my-4 relative group">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-border">
                    <tbody>
                        {block.tableData.rows.map((row, rowIndex) => (
                            <tr key={row.id} className="group/row">
                                {row.cells.map((cell, cellIndex) => (
                                    <td key={cell.id} className={`p-0 border border-border relative ${rowIndex === 0 ? 'bg-muted/50' : ''}`}>
                                        <ContentEditable
                                            html={cell.content}
                                            onChange={(e) => handleCellChange(rowIndex, cellIndex, e.target.value)}
                                            className={`p-2 min-w-[100px] w-full focus:outline-none focus:bg-primary/10 ${rowIndex === 0 ? 'font-semibold' : ''}`}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button
                onClick={addRow}
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center bg-card border rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Add row"
            >
                <PlusIcon className="w-4 h-4" />
            </button>
            <button
                onClick={addColumn}
                className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-card border rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Add column"
            >
                <PlusIcon className="w-4 h-4" />
            </button>
        </div>
    );
};

export default TableBlock;