import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useResponsive } from '../hooks/useResponsive';
import { runAurePalAgent, SearchScope, generateSpeech, fixMermaidDiagram } from '../services/geminiService';
import { dataService } from '../services/dataService';
import type { ChatMessage, ChatAttachment, ChatSession, MediaToRender, GeneratedFile, ImageAnalysis, User, AiPersonality, AnkiCard, TaggableItem } from '../types';
import { PlusIcon, XIcon, SendIcon, AiLogoIcon, NotionIcon, FileIcon, ExternalLinkIcon, Volume2Icon, StopCircleIcon, PaperclipIcon, TrashIcon, MicIcon, SparklesIcon, RefreshCwIcon, InfoIcon, QuoteIcon, DownloadIcon, FileTextIcon, PresentationIcon, SheetIcon, FileCodeIcon, MenuIcon, WaveformIcon, CopyIcon, CheckCircleIcon, UserIcon, GlobeIcon, AurenexLogoIcon, ChevronLeftIcon, ChevronRightIcon, MessageSquareIcon, SearchIcon, BookOpenIcon, DatabaseIcon, TagIcon, ZoomInIcon, ZoomOutIcon, FolderIcon, Loader2Icon, FlaskConicalIcon, ReplyIcon } from './icons';
import { v4 as uuidv4 } from 'uuid';
import ImageOverlay from './ImageOverlay';
import MarkdownRenderer, { getMermaidErrorMessage } from './MarkdownRenderer';
import ErrorBoundary from './ErrorBoundary';
import { notionService, fetchWithRetry } from '../services/notionService';
import AnkiCardPreview from './AnkiCardPreview';
import { ankiService } from '../services/ankiService';
import AIThinkingBlock from './ui/AiThinkingBlock';
import { sanitizeMermaidCode, quickFixMermaid, stripStylingForRecovery } from '../lib/mermaidUtils';
import { EvidencePanel } from './EvidencePanel';

interface AiChatWindowProps {
  onClose: () => void;
  navigateToPage: (pageId: string, blockId?: string, fromAi?: boolean, snippet?: string) => void;
  navigateToNotionPage: (pageId: string, blockId?: string, fromAi?: boolean, timestamp?: number, snippet?: string) => void;
  navigateToDriveFile?: (fileId: string, mimeType: string, snippet?: string) => void;
  openPdfViewer: (url: string) => void;
  chatMode?: 'modal' | 'split';
}

interface PendingAttachment {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  data: string;
  previewUrl: string;
  status: 'pending' | 'processing' | 'done';
}

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  pendingAttachments: PendingAttachment[];
  uploadProgress: { current: number; total: number; filename: string } | null;
  searchScope: SearchScope;
  setSearchScope: (scope: SearchScope) => void;
  onFormSubmit: (e: React.FormEvent) => void;
  onStop?: () => void;
  onFileSelect: () => void;
  onMicClick: () => void;
  onRemoveAttachment: (id: string) => void;
  onSelectPersonality: (p: AiPersonality) => void;
  onSelectMention: (item: TaggableItem) => void;
  showPersonalitySwitcher: boolean;
  mentionQuery: string | null;
  taggedItems: TaggableItem[];
  onRemoveTaggedItem: (id: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onPreviewAttachment: (url: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  replyContext: string | null;
  onDismissReply: () => void;
}

const CORS_PROXY_URL = 'https://corsproxy.io/?';

declare global {
  interface Window {
    mermaid?: {
      run: (options: { nodes: HTMLElement[] }) => Promise<any>;
    };
    PDFLib: any;
    docx: any;
    PptxGenJS: any;
    XLSX: any;
    renderMathInElement?: (element: HTMLElement, options: any) => void;
    renderDynamicContent?: (element: HTMLElement) => void;
    pdfjsLib?: any;
  }
}

// --- WINDOW THEMES ---
const WINDOW_THEMES: Record<AiPersonality, string> = {
  aurepal: "border-primary/40 shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)] bg-background/90",
  muse: "border-purple-500/40 shadow-[0_0_40px_-10px_rgba(168,85,247,0.25)] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500/10 via-background/95 to-background",
  socrates: "border-amber-500/40 shadow-[0_0_40px_-10px_rgba(245,158,11,0.25)] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-background/95 to-background",
  jarvis: "border-cyan-500/50 shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)] bg-zinc-950/95 text-cyan-50",
  exampal: "border-emerald-500/40 shadow-[0_0_40px_-10px_rgba(16,185,129,0.25)] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-background/95 to-background",
  ocr: "border-slate-500/40 shadow-[0_0_40px_-10px_rgba(100,116,139,0.25)] bg-zinc-900/95 text-slate-200",
  auremed: "border-rose-500/40 shadow-[0_0_40px_-10px_rgba(244,63,94,0.25)] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500/10 via-background/95 to-background",
};

const PERSONALITIES: Record<AiPersonality, { label: string; description: string; color: string }> = {
  aurepal: { label: 'AurePal', description: 'Concise & Insightful', color: 'text-primary' },
  muse: { label: 'Muse', description: 'Creative & Imaginative', color: 'text-purple-500' },
  socrates: { label: 'Socrates', description: 'Questioning Guide', color: 'text-amber-500' },
  jarvis: { label: 'J.A.R.V.I.S.', description: 'Precise & Technical', color: 'text-cyan-500' },
  exampal: { label: 'ExamPal', description: 'Study Partner', color: 'text-emerald-500' },
  ocr: { label: 'OCR', description: 'Document Extraction', color: 'text-slate-500' },
  auremed: { label: 'AureMed', description: 'Medical Research Expert', color: 'text-rose-500' },
};

// --- HELPER FUNCTIONS ---
const stripMarkdown = (markdown: string): string => {
  if (typeof markdown !== 'string') return '';
  return markdown
    .replace(/###\s|##\s|#\s/g, '')
    .replace(/\*\*(.*?)\*\*|\*(.*?)\*|__(.*?)__/g, '$1$2$3')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/```mermaid.*?```/gs, '(A diagram was generated)')
    .replace(/```.*?```/gs, '')
    .replace(/---/g, '')
    .replace(/\[IMAGE\]/g, '(An image was shown)')
    .replace(/\[Source:[^\]]+\]/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .trim();
};

function base64ToUint8Array(base64: string): Uint8Array {
  if (!base64 || typeof base64 !== 'string') {
    return new Uint8Array(0);
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function b64toBlob(b64Data: string, contentType = ''): Blob {
  if (!b64Data || typeof b64Data !== 'string') {
    return new Blob([], { type: contentType });
  }
  try {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
  } catch (e) {
    console.error('b64toBlob error:', e);
    return new Blob([], { type: contentType });
  }
}

function pcmBase64ToWavBlob(b64Data: string, sampleRate: number = 24000): Blob {
  try {
    const byteCharacters = atob(b64Data);
    const pcmData = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        pcmData[i] = byteCharacters.charCodeAt(i);
    }
    
    // Create WAV Header
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');

    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Linear PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const pcmu8 = new Uint8Array(buffer, 44);
    pcmu8.set(pcmData);

    return new Blob([buffer], { type: 'audio/wav' });
  } catch (e) {
    console.error('pcmBase64ToWavBlob error:', e);
    return new Blob([], { type: 'audio/wav' });
  }
}

async function pcmToAudioBuffer(pcmData: Uint8Array, audioContext: AudioContext): Promise<AudioBuffer> {
  const sampleRate = 24000;
  const numChannels = 1;
  const int16Array = new Int16Array(pcmData.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768;
  }
  const audioBuffer = audioContext.createBuffer(numChannels, float32Array.length, sampleRate);
  audioBuffer.copyToChannel(float32Array, 0);
  return audioBuffer;
}

async function generatePdfFromMessage(markdownContent: string, message: ChatMessage): Promise<Blob> {
  const pdfDoc = await window.PDFLib.PDFDocument.create();
  let page = pdfDoc.addPage();
  let size = page.getSize();
  let width = size.width;
  let height = size.height;
  const font = await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica);
  const rgb = window.PDFLib.rgb;
  const fontSize = 11;
  const margin = 50;
  let y = height - margin;

  page.drawText(`Generated from AurePal on ${new Date().toLocaleDateString()}`, {
    x: margin,
    y: height - 30,
    font,
    size: 8,
    color: rgb(0.5, 0.5, 0.5),
  });

  const strippedText = stripMarkdown(markdownContent);
  const paragraphs = strippedText.split('\n');
  let maxWidth = width - 2 * margin;

  const addNewPage = () => {
    page = pdfDoc.addPage();
    size = page.getSize();
    width = size.width;
    height = size.height;
    y = height - margin;
    maxWidth = width - 2 * margin;
  };

  for (const paragraph of paragraphs) {
    if (y < margin + 20) {
      addNewPage();
    }
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth) {
        if (y < margin) addNewPage();
        page.drawText(line, { x: margin, y, font, size: fontSize, color: rgb(0, 0, 0) });
        y -= fontSize * 1.4;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (y < margin) addNewPage();
    page.drawText(line, { x: margin, y, font, size: fontSize, color: rgb(0, 0, 0) });
    y -= fontSize * 1.4;
    if (paragraph.trim() === '') y -= fontSize * 0.5;
  }
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

const groupSessionsByDate = (sessions: ChatSession[]) => {
  const groups: { [key: string]: ChatSession[] } = {};
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const lastWeekStart = new Date(todayStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  sessions.forEach(session => {
    const sessionDate = new Date(session.createdAt);
    if (sessionDate >= todayStart) {
      if (!groups['Today']) groups['Today'] = [];
      groups['Today'].push(session);
    } else if (sessionDate >= yesterdayStart) {
      if (!groups['Yesterday']) groups['Yesterday'] = [];
      groups['Yesterday'].push(session);
    } else if (sessionDate >= lastWeekStart) {
      if (!groups['Previous 7 Days']) groups['Previous 7 Days'] = [];
      groups['Previous 7 Days'].push(session);
    } else {
      if (!groups['Older']) groups['Older'] = [];
      groups['Older'].push(session);
    }
  });
  return groups;
};

// --- HELPER COMPONENTS ---
const ImageModal = ({ src, onClose }: { src: string | null; onClose: () => void }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isPinching = useRef(false);
  const isPanning = useRef(false);
  const initialPinchDist = useRef(0);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);
  const lastPosition = useRef({ x: 0, y: 0 });

  if (!src) return null;

  const getPinchDist = (e: TouchEvent) => Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPinching.current = true;
      initialPinchDist.current = getPinchDist(e.nativeEvent);
      lastScale.current = scale;
    } else if (e.touches.length === 1) {
      e.preventDefault();
      isPanning.current = true;
      lastPanPoint.current = { x: e.touches[0].pageX, y: e.touches[0].pageY };
      lastPosition.current = position;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPinching.current && e.touches.length === 2) {
      e.preventDefault();
      const newDist = getPinchDist(e.nativeEvent);
      const scaleFactor = newDist / initialPinchDist.current;
      setScale(Math.max(0.2, Math.min(10, lastScale.current * scaleFactor)));
    } else if (isPanning.current && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].pageX - lastPanPoint.current.x;
      const dy = e.touches[0].pageY - lastPanPoint.current.y;
      setPosition({ x: lastPosition.current.x + dx, y: lastPosition.current.y + dy });
    }
  };

  const handleTouchEnd = () => {
    isPinching.current = false;
    isPanning.current = false;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isPanning.current = true;
    lastPanPoint.current = { x: e.pageX, y: e.pageY };
    lastPosition.current = position;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    e.preventDefault();
    const dx = e.pageX - lastPanPoint.current.x;
    const dy = e.pageY - lastPanPoint.current.y;
    setPosition({ x: lastPosition.current.x + dx, y: lastPosition.current.y + dy });
  };

  const handleMouseUpOrLeave = () => {
    isPanning.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.005;
    setScale(Math.max(0.2, Math.min(10, scale + scaleAmount)));
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center animate-fade-in-fast">
      <div 
        onClick={e => e.stopPropagation()} 
        className="relative w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center',
            transition: isPanning.current || isPinching.current ? 'none' : 'transform 0.1s ease-out',
          }}
          className="flex items-center justify-center"
        >
          <img src={src} alt="Enlarged view" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg pointer-events-none" />
        </div>
        
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/80 backdrop-blur-sm p-2 rounded-full shadow-lg border border-border">
          <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className="p-1.5 hover:bg-accent rounded-full transition-colors">
            <ZoomOutIcon className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(10, s + 0.2))} className="p-1.5 hover:bg-accent rounded-full transition-colors">
            <ZoomInIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} className="p-1.5 hover:bg-accent rounded-full transition-colors" title="Reset View">
            <RefreshCwIcon className="w-4 h-4" />
          </button>
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm text-foreground rounded-full p-2 shadow-lg border border-border hover:bg-accent transition-colors">
          <XIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

/**
 * Converts raw Mermaid parse errors into user-friendly messages.
 * Hides technical parser details (like "got 'PS'", "Expecting 'SEMI'") 
 * and shows actionable, clean error descriptions instead.
 */
function formatUserFriendlyMermaidError(rawError: string, chartCode: string): string {
  // If the error mentions invisible control characters (PS, LS, NEL, etc.), 
  // show a clean message about special characters
  if (/got ['"]?(PS|LS|NEL|VT|FF|BOM|ZWSP|ZWNJ|ZWJ|LRE|RLE|PDF|LRO|RLO|WJ)['"]?/i.test(rawError)) {
    return 'The diagram contains hidden special characters that could not be automatically fixed. The AI may have included invisible Unicode formatting characters. Please try regenerating the response.';
  }
  
  // If it's a generic parse error, extract just the line number and show a clean message
  const lineMatch = rawError.match(/line\s+(\d+)/i);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1], 10);
    const lines = chartCode.split('\n');
    const badLine = lineNum <= lines.length ? lines[lineNum - 1].trim() : '';
    
    // If the "bad line" is actually a valid diagram directive (flowchart, graph, etc.),
    // the real error is likely on a different line — show a generic message instead
    const validDirectives = /^(flowchart\s+|graph\s+|mindmap|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|timeline|zenuml|sankey-beta|xychart-beta|block-beta|%%\{)/;
    if (validDirectives.test(badLine)) {
      return 'The diagram has a syntax issue that prevents rendering. This may be caused by special characters, unquoted labels with parentheses, or invalid arrow formatting. View the raw code to inspect and fix the issue.';
    }
    
    const truncatedLine = badLine.length > 60 ? badLine.substring(0, 60) + '...' : badLine;
    return `Syntax error near line ${lineNum}${truncatedLine ? `: "${truncatedLine}"` : ''}. The diagram code has a formatting issue that prevents rendering. View the raw code to inspect it.`;
  }
  
  // Fallback: strip technical jargon but keep it readable
  const cleaned = rawError
    .replace(/Expecting\s+['"]?[A-Z_,\s]+['"]?,\s*got\s+['"]?\w+['"]?/gi, 'Unexpected syntax')
    .replace(/Parse error/gi, 'Syntax error')
    .substring(0, 200);
  
  return cleaned || 'The diagram could not be rendered due to a syntax issue. View the raw code for details.';
}

interface MermaidModalProps {
  chart: string | null;
  onClose: () => void;
}

const MermaidModal: React.FC<MermaidModalProps> = ({ chart, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [error, setError] = useState<string | null>(null);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const isPinching = useRef(false);
  const isPanning = useRef(false);
  const initialPinchDist = useRef(0);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);
  const lastPosition = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(event.target as Node)) {
        setIsSaveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (viewMode === 'preview' && ref.current && chart) {
      const rawChart = chart.replace(/<br><br>\s*<div[\s\S]*$/, '');
      let cleanChart = sanitizeMermaidCode(rawChart);
      
      if (!cleanChart || cleanChart.trim() === '') {
         ref.current.innerHTML = '';
         setError(null);
         return;
      }
      
      const renderModalChart = async () => {
        const mermaid = (window as any).mermaid;
        if (!mermaid) return;

        // Ensure theme initialization matches preview
        try {
          mermaid.initialize({
            startOnLoad: false,
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
            securityLevel: 'loose',
            fontFamily: 'Inter, sans-serif',
            flowchart: {
              htmlLabels: false,
            },
          });
        } catch (initErr) {}

        const renderId = `mermaid-modal-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

        const renderSvgToRef = (svg: string) => {
          if (ref.current) {
            ref.current.innerHTML = svg;
            setError(null);
            setTimeout(() => {
              if (!ref.current) return;
              if ((window as any).renderMathInElement) {
                try {
                  (window as any).renderMathInElement(ref.current, {
                    delimiters: [
                      {left: '$$', right: '$$', display: true},
                      {left: '$', right: '$', display: false},
                      {left: '\\(', right: '\\)', display: false},
                      {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError: false
                  });
                } catch (e) {
                  console.warn('KaTeX rendering in Mermaid modal failed:', e);
                }
                const foreignObjects = ref.current.querySelectorAll('foreignObject');
                foreignObjects.forEach(fo => {
                  try {
                    (window as any).renderMathInElement(fo, {
                      delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                      ],
                      throwOnError: false
                    });
                  } catch (e) {
                    console.warn('KaTeX rendering in foreignObject failed:', e);
                  }
                });
              }
            }, 100);
          }
        };

        // Try direct render first
        try {
          const { svg } = await mermaid.render(renderId, cleanChart);
          renderSvgToRef(svg);
          return;
        } catch (e1: any) {
          const errMsg1 = getMermaidErrorMessage(e1);
          console.warn("Modal Mermaid initial render error:", errMsg1);

          // Try quickFixMermaid
          const quickFixed = quickFixMermaid(cleanChart, errMsg1);
          if (quickFixed) {
            const reSanitized = sanitizeMermaidCode(quickFixed);
            try {
              const { svg } = await mermaid.render(`${renderId}-quick`, reSanitized);
              renderSvgToRef(svg);
              return;
            } catch (e2) {}
          }

          // Try stripStylingForRecovery
          const stripped = stripStylingForRecovery(cleanChart);
          if (stripped && stripped !== cleanChart) {
            try {
              const { svg } = await mermaid.render(`${renderId}-stripped`, stripped);
              renderSvgToRef(svg);
              return;
            } catch (e3) {}
          }

          // Try AI healing if local recovery passes failed
          try {
            const aiFixed = await fixMermaidDiagram(cleanChart, errMsg1);
            if (aiFixed) {
              const sanitizedAiFixed = sanitizeMermaidCode(aiFixed);
              const { svg } = await mermaid.render(`${renderId}-ai`, sanitizedAiFixed);
              renderSvgToRef(svg);
              return;
            }
          } catch (e4) {}

          // If all recovery passes failed, display formatted user friendly error
          setError(formatUserFriendlyMermaidError(errMsg1, cleanChart));
        }
      };

      renderModalChart();
    }
  }, [chart, viewMode]);

  if (!chart) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(chart).catch(err => console.error("Copy failed", err));
  };

  const downloadUrl = (url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveImage = async (format: 'png' | 'svg' | 'jpeg', quality?: number) => {
    if (!ref.current || !containerRef.current) return;
    const svgElement = ref.current.querySelector('svg');
    if (!svgElement) return;
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgString = new XMLSerializer().serializeToString(svgElement);
    if (format === 'svg') {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      downloadUrl(URL.createObjectURL(blob), 'diagram.svg');
      return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
    img.onload = () => {
      const desiredScaleFactor = 50;
      const MAX_CANVAS_DIMENSION = 16384;
      const { width, height } = svgElement.getBoundingClientRect();
      let scaleFactor = desiredScaleFactor;
      if (width * scaleFactor > MAX_CANVAS_DIMENSION || height * scaleFactor > MAX_CANVAS_DIMENSION) {
        scaleFactor = Math.floor(Math.min(MAX_CANVAS_DIMENSION / width, MAX_CANVAS_DIMENSION / height));
      }
      canvas.width = width * scaleFactor;
      canvas.height = height * scaleFactor;
      const bgColor = window.getComputedStyle(containerRef.current!).backgroundColor;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      downloadUrl(format === 'jpeg' ? canvas.toDataURL('image/jpeg', quality) : canvas.toDataURL('image/png'), `diagram.${format}`);
    };
    img.src = dataUrl;
  };

  const handleSaveWrapper = (format: 'png' | 'svg' | 'jpeg', quality?: number) => {
    handleSaveImage(format, quality);
    setIsSaveMenuOpen(false);
  };

  const getPinchDist = (e: TouchEvent) => Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPinching.current = true;
      initialPinchDist.current = getPinchDist(e.nativeEvent);
      lastScale.current = scale;
    } else if (e.touches.length === 1) {
      e.preventDefault();
      isPanning.current = true;
      lastPanPoint.current = { x: e.touches[0].pageX, y: e.touches[0].pageY };
      lastPosition.current = position;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPinching.current && e.touches.length === 2) {
      e.preventDefault();
      const newDist = getPinchDist(e.nativeEvent);
      const scaleFactor = newDist / initialPinchDist.current;
      setScale(Math.max(0.2, Math.min(100, lastScale.current * scaleFactor)));
    } else if (isPanning.current && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].pageX - lastPanPoint.current.x;
      const dy = e.touches[0].pageY - lastPanPoint.current.y;
      setPosition({ x: lastPosition.current.x + dx, y: lastPosition.current.y + dy });
    }
  };

  const handleTouchEnd = () => {
    isPinching.current = false;
    isPanning.current = false;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isPanning.current = true;
    lastPanPoint.current = { x: e.pageX, y: e.pageY };
    lastPosition.current = position;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    e.preventDefault();
    const dx = e.pageX - lastPanPoint.current.x;
    const dy = e.pageY - lastPanPoint.current.y;
    setPosition({ x: lastPosition.current.x + dx, y: lastPosition.current.y + dy });
  };

  const handleMouseUpOrLeave = () => {
    isPanning.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.005;
    setScale(Math.max(0.2, Math.min(100, scale + scaleAmount)));
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center animate-fade-in-fast">
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-lg shadow-2xl w-[90vw] h-[90vh] max-w-4xl flex flex-col overflow-hidden animate-scale-in">
        <header className="flex items-center justify-between p-2 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode(v => v === 'preview' ? 'code' : 'preview')} className="px-2 py-1 text-sm rounded bg-secondary">
              {viewMode === 'preview' ? 'View Code' : 'View Preview'}
            </button>
            {viewMode === 'code' && (
              <button onClick={handleCopy} className="px-2 py-1 text-sm rounded bg-secondary flex items-center gap-1">
                <CopyIcon className="w-3 h-3" /> Copy
              </button>
            )}
            {viewMode === 'preview' && (
              <>
                <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="px-2 py-1 text-sm rounded bg-secondary">-</button>
                <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(100, s + 0.1))} className="px-2 py-1 text-sm rounded bg-secondary">+</button>
                <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} className="px-2 py-1 text-sm rounded bg-secondary">Reset View</button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={saveMenuRef}>
              <button onClick={() => setIsSaveMenuOpen(p => !p)} className="px-2 py-1 text-sm rounded bg-secondary flex items-center gap-1.5">
                <DownloadIcon className="w-4 h-4" /> Save As...
              </button>
              {isSaveMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-popover text-popover-foreground rounded-lg border shadow-lg p-1 animate-fade-in-up z-10" style={{ animationDuration: '0.1s' }}>
                  <button onClick={() => handleSaveWrapper('png')} className="w-full text-left p-2 rounded hover:bg-accent text-sm">PNG Image</button>
                  <button onClick={() => handleSaveWrapper('svg')} className="w-full text-left p-2 rounded hover:bg-accent text-sm">SVG Vector</button>
                  <button onClick={() => handleSaveWrapper('jpeg', 1.0)} className="w-full text-left p-2 rounded hover:bg-accent text-sm">JPEG (Max Quality)</button>
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-accent text-muted-foreground">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </header>
        <main
          ref={containerRef}
          className={`flex-1 overflow-auto p-4 ${viewMode === 'preview' ? 'bg-muted/20 cursor-grab active:cursor-grabbing' : ''}`}
          onTouchStart={viewMode === 'preview' ? handleTouchStart : undefined}
          onTouchMove={viewMode === 'preview' ? handleTouchMove : undefined}
          onTouchEnd={viewMode === 'preview' ? handleTouchEnd : undefined}
          onMouseDown={viewMode === 'preview' ? handleMouseDown : undefined}
          onMouseMove={viewMode === 'preview' ? handleMouseMove : undefined}
          onMouseUp={viewMode === 'preview' ? handleMouseUpOrLeave : undefined}
          onMouseLeave={viewMode === 'preview' ? handleMouseUpOrLeave : undefined}
          onWheel={viewMode === 'preview' ? handleWheel : undefined}
        >
          {viewMode === 'preview' ? (
            error ? (
              <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md">
                <h4 className="font-bold mb-2">Diagram Issue</h4>
                <p className="text-xs opacity-80 leading-relaxed">{error}</p>
                <button 
                  onClick={() => setViewMode('code')} 
                  className="mt-3 px-3 py-1.5 text-xs rounded bg-secondary hover:bg-accent transition-colors inline-flex items-center gap-1"
                >
                  View Raw Code →
                </button>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ touchAction: 'none' }}>
                <div
                  ref={ref}
                  className="mermaid"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transition: isPanning.current ? 'none' : 'transform 0.1s ease-out',
                    cursor: 'inherit',
                    maxWidth: '100%',
                    maxHeight: '100%',
                  }}
                />
              </div>
            )
          ) : (
            <pre className="text-sm bg-muted p-4 rounded-md h-full overflow-auto">
              <code className="whitespace-pre-wrap break-words">{chart}</code>
            </pre>
          )}
        </main>
      </div>
    </div>
  );
};

// --- MEDIA RENDERER ---
interface MediaRendererProps {
  media: MediaToRender;
  isCarouselItem: boolean;
  onImageClick: (url: string) => void;
  openPdfViewer: (url: string) => void;
}

const MediaRenderer: React.FC<MediaRendererProps> = ({ media, isCarouselItem, onImageClick, openPdfViewer }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const isMountedRef = useRef(true);

  const isVideo = media.type === 'video' || media.previewUrl.match(/\.(mp4|webm|mov|mkv|ogv)$/i);
  const isImage = media.type === 'image' || media.previewUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  const isAudio = media.type === 'audio' || media.previewUrl.match(/\.(mp3|wav|ogg|m4a)$/i);
  const isPdf = media.type === 'pdf';
  const isMedia = isVideo || isImage || isAudio;

  useEffect(() => {
    isMountedRef.current = true;
    let currentObjectURL: string | null = null;

    const loadMedia = async () => {
      if (!isMedia) {
        if (isMountedRef.current) setStatus('loaded');
        return;
      }
      if (isMountedRef.current) {
        setStatus('loading');
        setObjectUrl(null);
      }

      const isDataUrl = media.previewUrl.startsWith('data:');
      if (isDataUrl) {
        if (isMountedRef.current) {
          setObjectUrl(media.previewUrl);
          setStatus('loaded');
        }
        return;
      }

      const needsProxy = !!media.source?.notionUrl || media.previewUrl.includes('secure.notion-static');
      if (!needsProxy) {
        if (isMountedRef.current) {
          setObjectUrl(media.previewUrl);
          setStatus('loaded');
        }
        return;
      }

      const proxiedUrl = `${CORS_PROXY_URL}${encodeURIComponent(media.previewUrl)}`;
      try {
        const response = await fetchWithRetry(proxiedUrl, {});
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const blob = await response.blob();
        if (isMountedRef.current) {
          currentObjectURL = URL.createObjectURL(blob);
          setObjectUrl(currentObjectURL);
          setStatus('loaded');
        }
      } catch (error) {
        console.warn(`Error loading media ${proxiedUrl}:`, error, "Falling back to direct URL.");
        if (isMountedRef.current) {
          setObjectUrl(media.previewUrl);
          setStatus('loaded');
        }
      }
    };

    loadMedia();

    return () => {
      isMountedRef.current = false;
      if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
    };
  }, [media.previewUrl, retry, isMedia]);

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetry(c => c + 1);
  };

  const handleDownload = async () => {
    setStatus('loading');
    try {
      const needsProxy = !!media.source?.notionUrl || media.previewUrl.includes('secure.notion-static');
      const finalUrl = needsProxy ? `${CORS_PROXY_URL}${encodeURIComponent(media.previewUrl)}` : media.previewUrl;
      const response = await fetchWithRetry(finalUrl, {});
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = media.caption || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setStatus('loaded');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  const renderLoadingError = (isMediaElement: boolean) => (
    <div className={isMediaElement ? "absolute inset-0 flex flex-col items-center justify-center text-center" : "flex flex-col items-center justify-center text-center w-full h-full"}>
      {status === 'loading' && <div className="w-full h-full shimmer-bg" />}
      {status === 'error' && (
        <div className="p-2">
          <p className="text-xs text-destructive mb-2 font-semibold">Failed to load</p>
          <button onClick={handleRetry} className="text-xs font-semibold px-2 py-1 bg-secondary hover:bg-accent rounded-md">Retry</button>
        </div>
      )}
    </div>
  );

  let content;

  if (isImage) {
    content = (
      <button
        onClick={() => status === 'loaded' && objectUrl && onImageClick(objectUrl)}
        className="w-full block group/media aspect-square relative bg-muted rounded-lg border overflow-hidden"
        disabled={status !== 'loaded'}
        aria-label={media.caption || "View image"}
      >
        {status !== 'loaded' && renderLoadingError(true)}
        {objectUrl && (
          <img
            src={objectUrl}
            alt={media.caption}
            className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100 cursor-zoom-in' : 'opacity-0'}`}
            loading="lazy"
            onError={() => setStatus('error')}
          />
        )}
      </button>
    );
  } else if (isVideo) {
    content = (
      <div className="w-full aspect-square relative bg-muted rounded-lg border overflow-hidden">
        {status !== 'loaded' && renderLoadingError(true)}
        {objectUrl && (
          <video
            controls
            src={objectUrl}
            className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
            onError={() => setStatus('error')}
          />
        )}
      </div>
    );
  } else if (isAudio) {
    content = (
      <div className="w-full aspect-square relative bg-muted rounded-lg border flex items-center justify-center p-2">
        {status !== 'loaded' && renderLoadingError(true)}
        {objectUrl && (
          <audio
            controls
            src={objectUrl}
            className={`w-full transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
            onError={() => setStatus('error')}
          />
        )}
      </div>
    );
  } else if (isPdf) {
    content = (
      <button
        onClick={() => openPdfViewer(media.previewUrl)}
        className="w-full text-left flex items-center justify-center gap-3 p-3 bg-muted/50 hover:bg-accent rounded-lg border transition-colors aspect-square"
      >
        <div className="text-center">
          <FileIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-semibold truncate" title={media.caption || 'PDF'}>{media.caption || "PDF Document"}</p>
          <p className="text-xs text-muted-foreground">Click to open</p>
        </div>
      </button>
    );
  } else {
    content = (
      <button
        onClick={handleDownload}
        disabled={status === 'loading'}
        className="w-full text-left flex items-center justify-center gap-3 p-3 bg-muted/50 hover:bg-accent rounded-lg border transition-colors aspect-square"
      >
        {status === 'loading' ? renderLoadingError(false) : (
          <div className="text-center">
            <FileIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold truncate" title={media.caption}>{media.caption || 'Unknown File'}</p>
            <p className="text-xs text-muted-foreground">{status === 'error' ? 'Error! Retry' : 'Click to download'}</p>
          </div>
        )}
      </button>
    );
  }

  const shouldShowFigcaption = media.caption && isImage && status === 'loaded';

  return (
    <figure className={`${isCarouselItem ? 'w-48 flex-shrink-0 snap-center' : 'w-full'}`}>
      {content}
      {shouldShowFigcaption && (
        <figcaption className="text-xs text-muted-foreground italic text-center mt-1 px-1 truncate">{media.caption}</figcaption>
      )}
    </figure>
  );
};

// --- MEDIA CAROUSEL ---
const MediaCarousel: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      const buffer = 2;
      setCanScrollLeft(el.scrollLeft > buffer);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - buffer);
    }
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      checkScrollability();
      const resizeObserver = new ResizeObserver(checkScrollability);
      resizeObserver.observe(el);
      el.addEventListener('scroll', checkScrollability, { passive: true });
      return () => {
        resizeObserver.unobserve(el);
        el.removeEventListener('scroll', checkScrollability);
      };
    }
  }, [checkScrollability, children]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = scrollContainerRef.current.clientWidth * 0.9;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scroll('left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      scroll('right');
    }
  };

  return (
    <div
      className="relative group/carousel focus:outline-none focus:ring-2 focus:ring-ring rounded-lg"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Media carousel"
    >
      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto space-x-3 snap-x snap-mandatory py-2 -mx-4 px-4 scroll-smooth hide-scrollbar touch-pan-x"
      >
        {children}
      </div>
      <button
        onClick={() => scroll('left')}
        className={`absolute left-0 top-1/2 -translate-y-1/2 bg-background/70 backdrop-blur-sm p-1.5 rounded-full shadow-md border border-border/50 transition-all z-10 ${canScrollLeft ? 'opacity-0 group-hover/carousel:opacity-100 focus:opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-label="Scroll left"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </button>
      <button
        onClick={() => scroll('right')}
        className={`absolute right-0 top-1/2 -translate-y-1/2 bg-background/70 backdrop-blur-sm p-1.5 rounded-full shadow-md border border-border/50 transition-all z-10 ${canScrollRight ? 'opacity-0 group-hover/carousel:opacity-100 focus:opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-label="Scroll right"
      >
        <ChevronRightIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

const getMediaLayout = (mediaList: MediaToRender[], onImageClick: (src: string) => void, onPdfClick: (url: string) => void) => {
  if (!mediaList || mediaList.length === 0) return null;

  if (mediaList.length === 1) {
    return (
      <div className="mt-2 not-prose w-full max-w-full">
        <MediaRenderer media={mediaList[0]} isCarouselItem={false} onImageClick={onImageClick} openPdfViewer={onPdfClick} />
      </div>
    );
  }

  return (
    <div className="mt-2 not-prose w-full max-w-full overflow-hidden">
      <MediaCarousel>
        {mediaList.map((media, i) => (
          <MediaRenderer key={media.cid || i} media={media} isCarouselItem={true} onImageClick={onImageClick} openPdfViewer={onPdfClick} />
        ))}
      </MediaCarousel>
    </div>
  );
};

// --- WELCOME SCREEN ---
const WelcomeScreen: React.FC<{ onSuggestionClick: (text: string) => void }> = ({ onSuggestionClick }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 animate-fade-in min-w-0">
    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
      <AurenexLogoIcon className="w-8 h-8 text-primary" />
    </div>
    <h2 className="text-2xl font-bold text-foreground">AurePal AI</h2>
    <p className="text-muted-foreground mt-1">Your personal knowledge assistant.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-8 w-full max-w-lg">
      {[
        { label: "Summarize recent notes", prompt: "Summarize the last few pages I worked on." },
        { label: "Draft a project plan", prompt: "Draft a project plan for a new marketing campaign." },
        { label: "Analyze an image", prompt: "Extract text and data from this image." },
        { label: "Create flashcards", prompt: "Create Anki flashcards from my biology notes." }
      ].map((s, i) => (
        <button
          key={i}
          onClick={() => onSuggestionClick(s.prompt)}
          className="p-4 border rounded-xl hover:bg-accent/50 hover:border-primary/50 text-left transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md group"
        >
          <p className="font-medium text-sm text-foreground">{s.label}</p>
          <p className="text-xs text-muted-foreground mt-1">{s.prompt}</p>
        </button>
      ))}
    </div>
  </div>
);

// --- GENERATED FILE RENDERER ---
const GeneratedFileRenderer: React.FC<{ file: GeneratedFile; message: ChatMessage }> = ({ file, message }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const getFileIcon = () => {
    switch (file.fileType) {
      case 'pdf':
      case 'docx':
      case 'md':
        return <FileTextIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />;
      case 'pptx':
        return <PresentationIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />;
      case 'xlsx':
        return <SheetIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />;
      case 'mermaid':
        return <FileCodeIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />;
      case 'apkg':
        return <SparklesIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />;
      default:
        return <FileIcon className="w-6 h-6 text-muted-foreground flex-shrink-0" />;
    }
  };

  const downloadFile = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      if (file.content instanceof Blob) {
        downloadFile(file.content, file.fileName);
      } else {
        switch (file.fileType) {
          case 'md':
          case 'mermaid':
            downloadFile(new Blob([file.content], { type: 'text/plain' }), file.fileName);
            break;
          case 'pdf':
            downloadFile(await generatePdfFromMessage(file.content, message), file.fileName);
            break;
          case 'docx': {
            if (!window.docx) throw new Error("docx library not loaded.");
            const doc = new window.docx.Document({
              sections: [{
                children: file.content.split('\n').map(p => new window.docx.Paragraph({
                  children: [new window.docx.TextRun(p)]
                }))
              }]
            });
            downloadFile(await window.docx.Packer.toBlob(doc), file.fileName);
            break;
          }
          case 'pptx': {
            if (!window.PptxGenJS) throw new Error("PptxGenJS library not loaded.");
            const pptx = new window.PptxGenJS();
            JSON.parse(file.content).forEach((s: any) => {
              let slide = pptx.addSlide();
              slide.addText(s.title || '', { x: 0.5, y: 0.25, fontSize: 24, bold: true });
              slide.addText(s.content || '', { x: 0.5, y: 1.0, fontSize: 18 });
            });
            downloadFile(await pptx.write('blob'), file.fileName);
            break;
          }
          case 'xlsx': {
            if (!window.XLSX) throw new Error("XLSX library not loaded.");
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(JSON.parse(file.content)), "Sheet1");
            downloadFile(new Blob([window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: "application/octet-stream" }), file.fileName);
            break;
          }
        }
      }
    } catch (e) {
      setGenerationError(`Failed. ${e instanceof Error ? e.message : "An error occurred"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="aurenex-export-ignore flex flex-col gap-2 p-3 my-2 bg-muted/50 rounded-lg border max-w-full overflow-hidden">
      <div className="flex items-center gap-3 min-w-0">
        {getFileIcon()}
        <p className="flex-1 font-medium text-sm truncate">{file.fileName}</p>
        <button
          onClick={handleDownload}
          disabled={isGenerating}
          className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full hover:bg-primary/20 disabled:opacity-50 flex-shrink-0"
        >
          <DownloadIcon className="w-3 h-3" />
          {isGenerating ? 'Generating...' : (generationError ? 'Try Again' : 'Download')}
        </button>
      </div>
      {generationError && <p className="text-xs text-destructive truncate">{generationError}</p>}
    </div>
  );
};

// --- IMAGE ANALYSIS LAYOUT ---
const ImageAnalysisLayout: React.FC<{
  analyses: ImageAnalysis[];
  activeItemInfo: { analysisIndex: number; itemId: string } | null;
  hoveredItemInfo: { analysisIndex: number; itemId: string } | null;
  onItemClick: (info: { analysisIndex: number; itemId: string } | null) => void;
  onItemHover: (info: { analysisIndex: number; itemId: string } | null) => void;
  onOpenImageModal?: (src: string) => void;
}> = ({ analyses, activeItemInfo, hoveredItemInfo, onItemClick, onItemHover, onOpenImageModal }) => {
  if (!analyses || analyses.length === 0) return null;

  if (analyses.length === 1) {
    return (
      <figure className="my-2 not-prose w-full max-w-full">
        <ImageOverlay
          analysis={analyses[0]}
          analysisIndex={0}
          activeItemId={activeItemInfo?.analysisIndex === 0 ? activeItemInfo.itemId : null}
          hoveredItemId={hoveredItemInfo?.analysisIndex === 0 ? hoveredItemInfo.itemId : null}
          onItemClick={onItemClick}
          onItemHover={onItemHover}
          onOpenImageModal={onOpenImageModal}
        />
      </figure>
    );
  }

  return (
    <div className="my-2 not-prose w-full max-w-full overflow-hidden">
      <MediaCarousel>
        {analyses.map((analysis, index) => (
          <figure key={analysis.imageUri || index} className="w-64 flex-shrink-0 snap-center">
            <ImageOverlay
              analysis={analysis}
              analysisIndex={index}
              activeItemId={activeItemInfo?.analysisIndex === index ? activeItemInfo.itemId : null}
              hoveredItemId={hoveredItemInfo?.analysisIndex === index ? hoveredItemInfo.itemId : null}
              onItemClick={onItemClick}
              onItemHover={onItemHover}
              onOpenImageModal={onOpenImageModal}
            />
          </figure>
        ))}
      </MediaCarousel>
    </div>
  );
};

// --- CHAT BUBBLE CONTENT ---
const ChatBubbleContent = React.memo(({
  message,
  activeSession,
  handleSpeak,
  speakingMessageId,
  navigateToPage,
  navigateToNotionPage,
  setCitationPanelMessage,
  onCitationClick,
  onInternalLinkClick,
  onOpenMermaidModal,
  onOpenImageModal,
  openPdfViewer,
  hoveredCitationIndex,
  onHoverCitation,
  onDownloadAnkiApkg,
  onDownloadAnkiCsv,
  isAudioLoading,
  onReply,
  onRetry
}: {
  message: ChatMessage;
  activeSession: ChatSession | undefined;
  handleSpeak: (msg: ChatMessage) => void;
  speakingMessageId: string | null;
  navigateToPage: AiChatWindowProps['navigateToPage'];
  navigateToNotionPage: AiChatWindowProps['navigateToNotionPage'];
  setCitationPanelMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
  onCitationClick: (message: ChatMessage, citationIndex: number) => void;
  onInternalLinkClick: (title: string) => void;
  onOpenMermaidModal: (chart: string) => void;
  onOpenImageModal: (src: string) => void;
  openPdfViewer: (url: string) => void;
  hoveredCitationIndex: number | null;
  onHoverCitation: (index: number | null) => void;
  onDownloadAnkiApkg: (cards: AnkiCard[]) => Promise<void>;
  onDownloadAnkiCsv: (cards: AnkiCard[]) => Promise<void>;
  isAudioLoading: boolean;
  onReply?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
}) => {
  const isSpeaking = speakingMessageId === message.id;
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeItemInfo, setActiveItemInfo] = useState<{ analysisIndex: number; itemId: string } | null>(null);
  const [hoveredItemInfo, setHoveredItemInfo] = useState<{ analysisIndex: number; itemId: string } | null>(null);
  const [isDownloadingApkg, setIsDownloadingApkg] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isCopiedText, setIsCopiedText] = useState(false);
  const [isCopiedRich, setIsCopiedRich] = useState(false);

  // FIXED: Proper null checks for ankiCards
  const handleDownloadApkgClick = async () => {
    if (!message.ankiCards || message.ankiCards.length === 0) {
      console.error('No anki cards to download');
      return;
    }
    setIsDownloadingApkg(true);
    try {
      await onDownloadAnkiApkg(message.ankiCards);
    } catch (e) {
      console.error('APKG download error:', e);
    } finally {
      setIsDownloadingApkg(false);
    }
  };

  const handleDownloadCsvClick = async () => {
    if (!message.ankiCards || message.ankiCards.length === 0) {
      console.error('No anki cards to download');
      return;
    }
    setIsDownloadingCsv(true);
    try {
      await onDownloadAnkiCsv(message.ankiCards);
    } catch (e) {
      console.error('CSV download error:', e);
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  const handleTextCopy = async () => {
    if (!message.text) return;
    try {
      const fixedText = message.text
        .replace(/\\\[([\s\S]*?)\\\]/g, '\n$$$$\n$1\n$$$$\n')
        .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
        .replace(/([^\n])\n+```/g, '$1\n\n```')
        .replace(/^```/gm, '\n```')
        .replace(/```([a-zA-Z]*)\n?/g, '```$1\n')
        .replace(/```\n*([^\n])/g, '```\n\n$1')
        .trim();
      await navigator.clipboard.writeText(fixedText);
      setIsCopiedText(true);
      setTimeout(() => setIsCopiedText(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const processHtmlNodeForExport = async (clone: HTMLElement, asHtmlExport: boolean = false) => {
    // 1. Process inline Blob Images or external images -> Base64
    const imgs = clone.querySelectorAll('img');
    for (const img of Array.from(imgs)) {
      try {
        let targetSrc = img.src;
        if ((targetSrc.startsWith('http://') || targetSrc.startsWith('https://')) && !targetSrc.includes('/api/proxy-image')) {
          targetSrc = `/api/proxy-image?url=${encodeURIComponent(targetSrc)}`;
        }
        const res = await fetch(targetSrc);
        const blob = await res.blob();
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        img.src = base64;
        // Clean up styling to be static
        img.className = 'aurenex-inline-image';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.borderRadius = '8px';
        img.style.marginTop = '16px';
        img.style.marginBottom = '16px';
        img.style.display = 'block'; // Ensure blocks so Notion treats them as image blocks
      } catch (e) {
        console.warn(`Failed to convert image ${img.src} to base64 for export (may be CORS blocked):`, e);
      }
    }

    // 2. Process Mermaid Divs -> Keep as pure SVGs
    const mermaidDivs = clone.querySelectorAll('div[data-mermaid-code]');
    for (const div of Array.from(mermaidDivs)) {
      const svgEl = div.querySelector('svg');
      if (svgEl) {
        try {
          const cloneSvg = svgEl.cloneNode(true) as SVGSVGElement;
          
          let baseWidth = cloneSvg.viewBox.baseVal.width || 800;
          let baseHeight = cloneSvg.viewBox.baseVal.height || 600;

          // Scale SVG up slightly for better readability
          cloneSvg.setAttribute('width', `${baseWidth * 1.5}`);
          cloneSvg.setAttribute('height', `${baseHeight * 1.5}`);
          
          if (!cloneSvg.getAttribute('xmlns')) {
            cloneSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          }

          cloneSvg.style.maxWidth = '100%';
          cloneSvg.style.height = 'auto';
          cloneSvg.style.display = 'block';
          cloneSvg.style.margin = '16px auto';
          cloneSvg.classList.add('aurenex-mermaid-export');
          
          // Ensure background is set in case it's transparent
          cloneSvg.style.backgroundColor = 'white';
          cloneSvg.style.borderRadius = '8px';
          cloneSvg.style.padding = '12px';
          
          div.replaceWith(cloneSvg);
        } catch (e) {
          console.error("Failed to process mermaid svg", e);
          const code = decodeURIComponent(div.getAttribute('data-mermaid-code') || '');
          const pre = document.createElement('pre');
          const codeEl = document.createElement('code');
          codeEl.textContent = code;
          pre.appendChild(codeEl);
          div.replaceWith(pre);
        }
      } else {
        const code = decodeURIComponent(div.getAttribute('data-mermaid-code') || '');
        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = code;
        pre.appendChild(codeEl);
        div.replaceWith(pre);
      }
    }

    // 3. Process Math Formulas
    if (!asHtmlExport) {
      const katexElements = clone.querySelectorAll('.katex');
      katexElements.forEach(el => {
        const annotation = el.querySelector('annotation');
        
        if (annotation && annotation.textContent) {
          // We inject raw LaTeX strings. 
          // By replacing the HTML element with strict $$ delimiters, Notion Markdown parser picks it up as equation blocks during Rich Text pasting.
          const isDisplay = el.classList.contains('katex-display');
          const latex = annotation.textContent;
          const mathText = isDisplay ? `\n$$ ${latex} $$\n` : `$${latex}$`;
          const textNode = document.createTextNode(mathText);
          el.replaceWith(textNode);
        } else {
          el.replaceWith(document.createTextNode(el.textContent || ''));
        }
      });
    }

    // 4. Remove UI fluff
    const uiElements = clone.querySelectorAll('.aurenex-export-ignore, button, .absolute, .animate-spin');
    uiElements.forEach(el => {
      if (el.tagName === 'BUTTON' && el.getAttribute('aria-label')?.startsWith('Citation')) {
        const textNode = document.createTextNode(`[${el.textContent}]`);
        el.replaceWith(textNode);
      } else {
        el.remove();
      }
    });
    
    return clone;
  };

  const [isSharingHtml, setIsSharingHtml] = useState(false);

  const handleShareHtml = async () => {
    if (!contentRef.current) return;
    setIsSharingHtml(true);
    try {
      const clone = contentRef.current.cloneNode(true) as HTMLElement;
      await processHtmlNodeForExport(clone, true);
      
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>AI Response Export</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css" crossorigin="anonymous">
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 2rem; }
            img { max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            pre { background: #f4f4f5; padding: 1rem; border-radius: 8px; overflow-x: auto; }
            code { font-family: monospace; }
            blockquote { border-left: 4px solid #e4e4e7; margin: 0; padding-left: 1rem; color: #52525b; }
            h1, h2, h3 { color: #18181b; }
          </style>
        </head>
        <body>
          ${clone.innerHTML}
        </body>
        </html>
      `;
      
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Aurenex-Response-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to share HTML", e);
    } finally {
      setIsSharingHtml(false);
    }
  };

  const handleRichCopy = async () => {
    if (!contentRef.current) return;
    try {
      const clone = contentRef.current.cloneNode(true) as HTMLElement;
      await processHtmlNodeForExport(clone, false);

      const html = clone.innerHTML;
      const text = clone.innerText;
      const blobHtml = new Blob([html], { type: "text/html" });
      const blobText = new Blob([text], { type: "text/plain" });
      const data = [new ClipboardItem({ ["text/html"]: blobHtml, ["text/plain"]: blobText })];
      await navigator.clipboard.write(data);
      setIsCopiedRich(true);
      setTimeout(() => setIsCopiedRich(false), 2000);
    } catch (err) {
      console.error("Rich copy failed:", err);
    }
  };

  const getMessageTextToDisplay = () => {
    let text = message.text;
    if (!text) return "";
    
    if (message.personality === 'exampal' && text.includes('[')) {
      // Remove all complete JSON array blocks
      text = text.replace(/\[\s*\{[\s\S]*?\}\s*\]/g, '');
      
      // If there's an unclosed array at the very end of the text, hide it so the user doesn't see raw JSON streaming
      const unclosedMatch = text.match(/\[\s*\{[\s\S]*$/);
      if (unclosedMatch && unclosedMatch.index !== undefined) {
        text = text.substring(0, unclosedMatch.index);
      }
    }
    
    // Clean up
    text = text.replace(/ALL_DONE/g, '');
    
    // Convert LaTeX/Anki MathJax delimiters to markdown math delimiters
    // \( ... \) → $...$ (inline math)
    // \[ ... \] → $$...$$ (block math)
    // The AI sometimes outputs these instead of $...$ and $$...$$
    // IMPORTANT: Only convert if the content doesn't already use $ delimiters
    // to avoid double-processing with KaTeX auto-render
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, inner) => {
        if (/\$[^$]/.test(inner)) return match;
        return '\n$$\n' + inner + '\n$$\n';
    });
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, inner) => {
        if (/\$[^$]/.test(inner)) return match;
        return '$' + inner + '$';
    });
    
    // Also remove any remaining markdown json fences
    text = text.replace(/```json/gi, '');
    
    // Do NOT remove generic backticks globally, as this destroys mermaid boundaries!
    // text = text.replace(/```/g, ''); 
    
    // Fix broken Mermaid markdown fences: if the AI generated code with backticks
    // inside the Mermaid block (e.g., in node labels), the markdown parser will
    // truncate the code at the first internal ```. We detect and repair this by
    // replacing internal backticks with a safe alternative.
    text = text.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
        // If the code itself contains ```, the fence is broken.
        // Replace internal triple-backticks with single backticks to prevent truncation.
        if (code.includes('```')) {
            const fixed = code.replace(/```/g, '`');
            return '```mermaid\n' + fixed + '\n```';
        }
        return match;
    });
    
    // Auto-wrap mermaid code blocks if the AI forgot backticks
    
    // First, check if there's any raw diagram language literal that isn't inside backticks
    if (!text.includes('```mermaid')) {
      const mermaidPattern = /(^|\n\s*)(mermaid\s+(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|mindmap|timeline|zenuml|sankey-beta|xychart-beta|block-beta)[\s\S]*?)($|(?=\n\n))/g;
      text = text.replace(mermaidPattern, (match, prefix, content) => {
        // Only replace if it doesn't already contain backticks inside it
        if (!content.includes('```')) {
          const stripped = content.replace(/^mermaid\s*/i, '');
          return `${prefix}\`\`\`mermaid\n${stripped}\n\`\`\``;
        }
        return match;
      });
    }

    text = text.trim();
    if (text === "undefined" || text === "null") return "";
    return text;
  };

  return (
    <div className="flex flex-col gap-2 relative group/content min-w-0 max-w-full" ref={contentRef}>
      {/* User Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {message.attachments.map((att, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg border overflow-hidden bg-muted">
              {att.type.startsWith('image/') ? (
                <img 
                  src={att.data} 
                  alt={att.name} 
                  className="w-full h-full object-cover cursor-zoom-in" 
                  onClick={() => onOpenImageModal(att.data)}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-1">
                  <FileIcon className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-[8px] text-center truncate w-full">{att.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* OCR / Image Analysis */}
      <ImageAnalysisLayout
        analyses={message.imageAnalyses || []}
        activeItemInfo={activeItemInfo}
        hoveredItemInfo={hoveredItemInfo}
        onItemClick={setActiveItemInfo}
        onItemHover={setHoveredItemInfo}
        onOpenImageModal={onOpenImageModal}
      />

      {/* Main Text Content */}
      {getMessageTextToDisplay() && (
        <ErrorBoundary componentName="Message Content">
          <MarkdownRenderer
            source={getMessageTextToDisplay()}
            onCitationClick={(index, type) => {
            if (type === 'web' && message.groundingChunks) {
              const webIndex = index - 1 - (message.evidence?.length || 0);
              if (message.groundingChunks[webIndex]) {
                window.open(message.groundingChunks[webIndex].web.uri, '_blank');
              }
            } else if (type === 'local') {
              onCitationClick(message, index);
            } else {
              onCitationClick(message, index);
            }
          }}
          onInternalLinkClick={onInternalLinkClick}
          onOpenMermaidModal={onOpenMermaidModal}
          ocrChunks={message.imageAnalyses ? message.imageAnalyses.flatMap(a => a.ocr || []) : undefined}
          onOcrCitationClick={(info) => setActiveItemInfo({ analysisIndex: info.analysisIndex, itemId: info.ocrId })}
          onOcrCitationHover={(info) => setHoveredItemInfo(info ? { analysisIndex: info.analysisIndex, itemId: info.ocrId } : null)}
          hoveredOcrInfo={hoveredItemInfo ? { analysisIndex: hoveredItemInfo.analysisIndex, ocrId: hoveredItemInfo.itemId } : null}
          hoveredCitationIndex={hoveredCitationIndex}
          citations={message.groundingChunks}
          evidence={message.evidence}
          personality={message.personality}
          isProcessing={message.isProcessing}
        />
        </ErrorBoundary>
      )}

      {/* Generated Media */}
      {message.mediaToRender && message.mediaToRender.length > 0 && getMediaLayout(message.mediaToRender, onOpenImageModal, openPdfViewer)}

      {/* Generated Files */}
      {message.generatedFiles && message.generatedFiles.map((file: GeneratedFile, i: number) => (
        <GeneratedFileRenderer key={i} file={file} message={message} />
      ))}

      {/* Anki Cards Export UI */}
      {message.ankiCards && message.ankiCards.length > 0 && (
        <div className="mt-4 not-prose border rounded-lg p-3 bg-card max-w-full overflow-hidden">
          <div className="flex items-center justify-between min-w-0 mb-3">
            <h4 className="font-semibold flex items-center gap-2 text-sm truncate">
              <SparklesIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span className="truncate">Generated Flashcards ({message.ankiCards.length})</span>
            </h4>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleDownloadCsvClick}
                disabled={isDownloadingCsv || isDownloadingApkg}
                className="text-xs px-2 py-1 bg-secondary hover:bg-accent rounded flex items-center gap-1 disabled:opacity-50"
              >
                {isDownloadingCsv ? <RefreshCwIcon className="w-3 h-3 animate-spin" /> : <FileTextIcon className="w-3 h-3" />}
                CSV
              </button>
              <button
                onClick={handleDownloadApkgClick}
                disabled={isDownloadingApkg || isDownloadingCsv}
                className="text-xs px-2 py-1 bg-emerald-500 text-white hover:bg-emerald-600 rounded flex items-center gap-1 disabled:opacity-50 shadow-sm"
              >
                {isDownloadingApkg ? <RefreshCwIcon className="w-3 h-3 animate-spin" /> : <DownloadIcon className="w-3 h-3" />}
                Anki Package
              </button>
            </div>
          </div>
          <div className="border-t pt-3 mt-3">
             <AnkiCardPreview cards={message.ankiCards} />
          </div>
        </div>
      )}

      {/* Audio Player */}
      {message.audioUrl && (
        <div className="mt-2 w-full flex flex-col gap-1 items-center justify-center p-2 bg-muted/30 rounded-lg border">
            <audio controls src={message.audioUrl} className="w-full h-10" />
        </div>
      )}

      {/* Message Actions */}
      {!message.isProcessing && message.role !== 'user' && (
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/content:opacity-100 transition-opacity justify-end flex-shrink-0 flex-wrap">
          {((message.evidence && message.evidence.length > 0) || (message.groundingChunks && message.groundingChunks.length > 0)) && (
            <button
              onClick={() => setCitationPanelMessage(message)}
              className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors flex items-center gap-1 mr-auto"
            >
              <InfoIcon className="w-3.5 h-3.5" />
              View source ({(message.evidence?.length || 0) + (message.groundingChunks?.length || 0)})
            </button>
          )}
          <button
            onClick={() => onReply?.(message)}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Reply to this message"
          >
            <ReplyIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRetry?.(message)}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Regenerate response"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleTextCopy}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Copy Text"
          >
            {isCopiedText ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleRichCopy}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Copy as Rich Text (for Notion)"
          >
            <FileTextIcon className="w-3.5 h-3.5" />
            {isCopiedRich && <span className="text-[10px] text-green-500 ml-1">Copied!</span>}
          </button>
          <button
            onClick={handleShareHtml}
            disabled={isSharingHtml}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Export full response as HTML (Images & Diagrams included)"
          >
            {isSharingHtml ? <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => handleSpeak(message)}
            disabled={isAudioLoading}
            className={`p-1.5 rounded hover:bg-accent ${isAudioLoading ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title="Generate Audio"
          >
            {isAudioLoading ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <Volume2Icon className="w-3.5 h-3.5" />}
          </button>
          {(message.evidence?.length ?? 0) > 0 && (
            <button
              onClick={() => setCitationPanelMessage(message)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-1"
              title="View Sources"
            >
              <QuoteIcon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold">{message.evidence?.length}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return prev.message === next.message && 
         prev.speakingMessageId === next.speakingMessageId && 
         prev.isAudioLoading === next.isAudioLoading &&
         prev.hoveredCitationIndex === next.hoveredCitationIndex;
});

// --- CHAT MESSAGE BUBBLE ---
const ChatMessageBubble = React.memo(({ 
  message, 
  speakingMessageId, 
  isAudioLoading, 
  children 
}: { 
  message: ChatMessage; 
  speakingMessageId?: string | null;
  isAudioLoading?: boolean;
  children: React.ReactNode;
}) => {
  const isUser = message.role === 'user';
  const personality = message.personality || 'aurepal';
  const personalityInfo = PERSONALITIES[personality] || PERSONALITIES.aurepal;

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} group animate-slide-in-up mb-6 min-w-0`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-1 ${isUser ? 'bg-primary text-primary-foreground' : `bg-card text-${personalityInfo.color.split('-')[1]}-500 border`}`}>
        {isUser ? <UserIcon className="w-5 h-5" /> : <AiLogoIcon className="w-5 h-5" />}
      </div>
      <div className={`flex flex-col max-w-[85%] md:max-w-[75%] gap-1.5 ${isUser ? 'items-end' : 'items-start'} min-w-0`}>
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-bold text-muted-foreground">{isUser ? 'You' : personalityInfo.label}</span>
        </div>
        {(message.isProcessing || message.thoughtProcess || message.thoughtHistory) && (
          <AIThinkingBlock personality={personality} thoughtHistory={message.thoughtHistory} isComplete={!message.isProcessing} />
        )}
        {(message.text || message.attachments || message.ankiCards) && (
          <div className={`p-4 rounded-2xl shadow-sm border text-sm md:text-base leading-relaxed min-w-0 max-w-full ${isUser ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-card-foreground border-border'}`}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.message === next.message &&
         prev.speakingMessageId === next.speakingMessageId &&
         prev.isAudioLoading === next.isAudioLoading;
});

// --- HISTORY PANEL ---
const HistoryPanel = ({ sessions, activeSessionId, onSelectSession, onDeleteSession, onNewChat }: any) => {
  const grouped = groupSessionsByDate(sessions);

  return (
    <div className="w-64 border-r border-border bg-muted/20 flex flex-col flex-shrink-0 transition-all duration-300 h-full overflow-hidden">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Chats</h3>
        <button onClick={onNewChat} className="p-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors" aria-label="New Chat">
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {Object.keys(grouped).length === 0 && (
          <p className="text-xs text-muted-foreground px-2">No history yet.</p>
        )}
        {Object.entries(grouped).map(([group, groupSessions]) => (
          <div key={group} className="mb-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">{group}</h4>
            <div className="space-y-1">
              {groupSessions.map(session => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 p-2 rounded-md text-sm cursor-pointer transition-colors ${activeSessionId === session.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <MessageSquareIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate flex-1">{session.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded flex-shrink-0"
                  >
                    <TrashIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- CITATION PANEL ---
const CitationPanel = ({ message, onClose, onCitationClick, personality }: { message: ChatMessage; onClose: () => void; onCitationClick: (index: number, type: string) => void; personality?: AiPersonality }) => {
  const hasEvidence = message.evidence && message.evidence.length > 0;
  const hasGrounding = message.groundingChunks && message.groundingChunks.length > 0;

  if (!message || (!hasEvidence && !hasGrounding)) return null;

  // Use enhanced EvidencePanel for AureMed personality
  if (personality === 'auremed' && hasEvidence) {
    return (
      <div className="w-80 border-l border-border bg-muted/30 flex flex-col flex-shrink-0 animate-slide-in-right h-full overflow-hidden">
        <div className="p-3 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Sources ({message.evidence?.length || 0})</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-md">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <EvidencePanel evidence={message.evidence as any} onClose={onClose} />
        </div>
      </div>
    );
  }

  const getSourceIcon = (type: string) => {
    if (type.startsWith('notion_')) return <FileTextIcon className="w-3 h-3" />;
    if (type === 'web') return <GlobeIcon className="w-3 h-3" />;
    if (type === 'drive_file') return <DatabaseIcon className="w-3 h-3" />;
    if (type === 'pubmed_article') return <BookOpenIcon className="w-3 h-3" />;
    if (type === 'clinical_trial') return <FlaskConicalIcon className="w-3 h-3" />;
    switch (type) {
      case 'local_file': return <FileIcon className="w-3 h-3" />;
      default: return <FileTextIcon className="w-3 h-3" />;
    }
  };

  const totalSources = (message.evidence?.length || 0) + (message.groundingChunks?.length || 0);

  return (
    <div className="w-80 border-l border-border bg-muted/30 flex flex-col flex-shrink-0 animate-slide-in-right h-full overflow-hidden">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Sources ({totalSources})</h3>
        <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-md">
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {message.evidence?.map((ev: any, i: number) => (
          <div
            key={`ev-${i}`}
            className="p-3 rounded-lg border bg-card text-sm hover:border-primary/50 transition-colors cursor-pointer group"
            onClick={() => onCitationClick(i + 1, 'local')}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{i + 1}</span>
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase">
                {getSourceIcon(ev.source_type)}
                {ev.source_type?.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground mb-1 line-clamp-2">{ev.pageTitle || "Unknown Source"}</p>
            {ev.source_deeplink && (
              <a href={ev.source_deeplink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <ExternalLinkIcon className="w-3 h-3" /> Open
              </a>
            )}
          </div>
        ))}
        {message.groundingChunks?.map((chunk: any, i: number) => {
          const index = (message.evidence?.length || 0) + i + 1;
          return (
            <div
              key={`web-${i}`}
              className="p-3 rounded-lg border bg-card text-sm hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => window.open(chunk.web.uri, '_blank')}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{index}</span>
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase">
                  {getSourceIcon('web')}
                  Web Search
                </span>
              </div>
              <p className="text-sm font-medium text-foreground mb-1 line-clamp-2">{chunk.web.title || "Web Source"}</p>
              <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <ExternalLinkIcon className="w-3 h-3" /> Open Link
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- CHAT INPUT ---
const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  isLoading,
  isRecording,
  isTranscribing,
  pendingAttachments,
  uploadProgress,
  searchScope,
  setSearchScope,
  onFormSubmit,
  onStop,
  onFileSelect,
  onMicClick,
  onRemoveAttachment,
  onSelectPersonality,
  onSelectMention,
  showPersonalitySwitcher,
  mentionQuery,
  taggedItems,
  onRemoveTaggedItem,
  textareaRef,
  onPreviewAttachment,
  onPaste,
  onDrop,
  onDragOver,
  replyContext,
  onDismissReply
}) => {
  const [mentionResults, setMentionResults] = useState<TaggableItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (mentionQuery !== null) {
      dataService.getTaggableItems().then(setMentionResults);
    }
  }, [mentionQuery]);

  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return mentionResults;
    const isTagSearch = mentionQuery.startsWith('#');
    const query = mentionQuery.replace(/^#+/, '').replace(/^@+/, '').toLowerCase();
    
    return mentionResults.filter(i => {
        if (isTagSearch && i.type !== 'notion_tag') return false;
        if (!isTagSearch && i.type === 'notion_tag') return false;
        return i.title.toLowerCase().includes(query);
    });
  }, [mentionQuery, mentionResults]);

  const filteredPersonalities = useMemo(() => {
    if (!showPersonalitySwitcher) return [];
    const query = input.slice(1).toLowerCase();
    return Object.entries(PERSONALITIES).filter(([id, p]) =>
      p.label.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
    );
  }, [showPersonalitySwitcher, input]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [showPersonalitySwitcher, mentionQuery, filteredMentions.length, filteredPersonalities.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showPersonalitySwitcher) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredPersonalities.length - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredPersonalities.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredPersonalities[selectedIndex];
        if (selected) onSelectPersonality(selected[0] as AiPersonality);
      } else if (e.key === 'Escape') {
        // Let user close by editing
      }
      return;
    }

    if (mentionQuery !== null) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredMentions.length - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredMentions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentions[selectedIndex]) {
          onSelectMention(filteredMentions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        // Let user close by editing
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onFormSubmit(e);
    }
  };

  return (
    <div 
      className="p-4 border-t border-border/50 bg-background/10 backdrop-blur-md shrink-0 relative w-full max-w-full"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {uploadProgress && (
        <>
          <div className="absolute top-0 left-0 w-full h-0.5 bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
          <div className="absolute top-1 right-2 text-[9px] text-muted-foreground bg-background/90 px-1.5 py-0.5 rounded-full border shadow-sm z-10 pointer-events-none">
            Extracting {uploadProgress.current}/{uploadProgress.total}
          </div>
        </>
      )}

      {showPersonalitySwitcher && (
        <div className="absolute bottom-full left-4 mb-2 w-64 bg-card border rounded-lg shadow-xl p-2 animate-fade-in-up z-[110]">
          <div className="text-xs font-bold text-muted-foreground px-2 py-1 mb-1 uppercase tracking-wider">Switch Personality</div>
          {filteredPersonalities.length > 0 ? filteredPersonalities.map(([id, p], index) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectPersonality(id as AiPersonality)}
              className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
            >
              <div className={`w-2 h-2 rounded-full bg-current ${p.color.split(' ')[1]}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{p.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{p.description}</p>
              </div>
            </button>
          )) : (
            <div className="p-2 text-sm text-muted-foreground">No matching personalities</div>
          )}
        </div>
      )}

      {mentionQuery !== null && (
        <div className="absolute bottom-full left-4 mb-2 w-80 max-h-80 overflow-y-auto bg-card border rounded-lg shadow-xl p-2 animate-fade-in-up z-[110]">
          <div className="text-xs font-bold text-muted-foreground px-2 py-1 mb-1 uppercase tracking-wider">Mention Page or Tag</div>
          {filteredMentions.length > 0 ? filteredMentions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectMention(item)}
              className={`w-full flex items-start gap-2.5 p-2 rounded-md text-left transition-colors group ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
            >
              <div className="mt-0.5">
                {item.type === 'drive_file' ? (
                  item.isFolder ? <FolderIcon className="w-4 h-4 text-blue-400" /> : <FileTextIcon className="w-4 h-4 text-blue-500" />
                ) : item.type === 'notion_tag' ? (
                  <TagIcon className="w-4 h-4 text-muted-foreground" />
                ) : item.type === 'notion_page' ? (
                  <NotionIcon className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <FileIcon className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <p className="text-[10px] text-muted-foreground uppercase flex-shrink-0 ml-1">
                    {item.type === 'drive_file' && item.isFolder ? 'drive folder' : item.type.replace('_', ' ').replace('notion ', '')}
                  </p>
                </div>
                {item.subtitle && <p className="text-[10px] text-muted-foreground/70 truncate">{item.subtitle}</p>}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1.5 rounded-sm bg-primary/10 text-primary-foreground/80 dark:text-primary-foreground truncate"
                        style={{ backgroundColor: `var(--notion-${tag.color}-bg, rgba(100,100,100,0.1))` }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          )) : <p className="p-2 text-sm text-muted-foreground">No matches found</p>}
        </div>
      )}

      {pendingAttachments.length > 0 && (
        <div className="flex flex-nowrap gap-2 mb-2 overflow-x-auto py-2 px-1 snap-x scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-muted w-full">
          {pendingAttachments.map(att => (
            <div key={att.id} className="relative group/att flex-shrink-0 w-24 h-24 snap-start">
              {att.status === 'processing' ? (
                <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse rounded-lg border">
                  <RefreshCwIcon className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : att.type.startsWith('image/') ? (
                <button
                  onClick={() => onPreviewAttachment(att.previewUrl)}
                  className="w-full h-full block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg"
                >
                  <img src={att.previewUrl} className="w-full h-full object-cover rounded-lg border shadow-sm transition-transform hover:scale-[1.02]" alt={att.name} />
                </button>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg border text-xs text-muted-foreground flex-col gap-1 p-2 shadow-sm">
                  <FileIcon className="w-8 h-8" />
                  <span className="truncate w-full text-center text-[10px] leading-tight">{att.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemoveAttachment(att.id)}
                className="absolute -top-2 -right-2 bg-destructive text-white p-1 rounded-full shadow-md opacity-0 group-hover/att:opacity-100 transition-all hover:scale-110 z-10"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {replyContext && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl animate-fade-in-up">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider mb-0.5">Replying to</p>
            <p className="text-xs text-foreground/80 truncate leading-tight">{replyContext}</p>
          </div>
          <button
            type="button"
            onClick={onDismissReply}
            className="rounded-full hover:bg-destructive/10 p-1 transition-colors flex-shrink-0"
            title="Dismiss reply"
          >
            <XIcon className="w-4 h-4 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}

      <form onSubmit={onFormSubmit} className="flex items-end gap-2 p-1.5 bg-card/60 border border-border/50 rounded-2xl shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20">
        <button
          type="button"
          onClick={onFileSelect}
          className="rounded-xl hover:bg-accent text-muted-foreground transition-colors h-10 w-10 flex items-center justify-center flex-shrink-0"
          title="Attach"
        >
          <PaperclipIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 relative flex items-center min-w-0">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-1.5">
            {taggedItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                {taggedItems.map(item => (
                  <div 
                    key={item.id} 
                    className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs shadow-sm max-w-full"
                    style={item.type === 'notion_tag' && item.color && item.color !== 'default' ? { backgroundColor: `var(--notion-${item.color}-bg, rgba(100,100,100,0.1))` } : undefined}
                  >
                    {item.type === 'drive_file' ? (
                      item.isFolder ? <FolderIcon className="w-3 h-3 text-blue-400 shrink-0" /> : <FileTextIcon className="w-3 h-3 text-blue-500 shrink-0" />
                    ) : item.type === 'notion_tag' ? (
                      <TagIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : item.type === 'notion_page' ? (
                      <NotionIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <FileIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium truncate text-primary-foreground/90 dark:text-primary-foreground">{item.title}</span>
                    
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex items-center gap-1 ml-1 border-l pl-2 border-primary/20 shrink-0">
                        {item.tags.map((t, i) => (
                          <span 
                            key={t.name} 
                            className="text-[9px] px-1.5 rounded-sm bg-primary/10 text-primary-foreground/80 dark:text-primary-foreground"
                            style={{ backgroundColor: `var(--notion-${t.color}-bg, rgba(100,100,100,0.1))` }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <button
                      type="button"
                      onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTaggedItem(item.id);
                          // Also remove from text if it's there
                          const prefix = item.type === 'notion_tag' ? '#' : '@';
                          const searchStr = `${prefix}${item.title}`;
                          // simple replacement for exact matches
                          const newVal = input.split(' ').filter(word => word !== searchStr).join(' ');
                          setInput(newVal);
                      }}
                      className="rounded-full bg-background/50 hover:bg-destructive hover:text-white p-0.5 transition-colors shrink-0 ml-1"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
              placeholder={isRecording ? "Listening..." : (isTranscribing ? "Transcribing..." : "Ask AurePal...")}
              disabled={isLoading || isRecording || isTranscribing}
              className="w-full bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-muted-foreground text-sm resize-none focus:outline-none max-h-40 px-1 hide-scrollbar leading-5"
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
              style={{ height: '24px', minHeight: '24px' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mb-0.5">
          <button
            type="button"
            onClick={onMicClick}
            className={`rounded-xl transition-colors h-10 w-10 flex items-center justify-center ${isRecording ? 'bg-destructive/20 text-destructive animate-pulse' : 'hover:bg-accent text-muted-foreground'}`}
          >
            <MicIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setSearchScope(searchScope === 'auto' ? 'online' : searchScope === 'online' ? 'local' : 'auto')}
            className={`rounded-xl h-10 w-10 flex items-center justify-center transition-colors ${searchScope === 'online' ? 'text-blue-500 bg-blue-500/10' : searchScope === 'local' ? 'text-orange-500 bg-orange-500/10' : 'text-muted-foreground hover:bg-accent'}`}
            title={`Scope: ${searchScope.charAt(0).toUpperCase() + searchScope.slice(1)}`}
          >
            {searchScope === 'online' ? <GlobeIcon className="w-5 h-5" /> : searchScope === 'local' ? <BookOpenIcon className="w-5 h-5" /> : <SparklesIcon className="w-5 h-5" />}
          </button>
          <button
            type={isLoading ? "button" : "submit"}
            onClick={isLoading && onStop ? onStop : undefined}
            disabled={!isLoading && (!input.trim() && pendingAttachments.length === 0)}
            className="bg-primary text-primary-foreground rounded-xl disabled:opacity-50 hover:bg-primary/90 transition-colors h-10 w-10 flex items-center justify-center"
            title={isLoading ? "Stop Generation" : "Send Message"}
          >
            {isLoading ? <StopCircleIcon className="w-5 h-5 text-destructive" /> : <SendIcon className="w-5 h-5" />}
          </button>
        </div>
      </form>
    </div>
  );
};

// --- MAIN COMPONENT ---
const MemoizedMessageList = React.memo(({
  messages,
  activeSession,
  handleSpeak,
  speakingMessageId,
  audioLoadingMessageId,
  navigateToPage,
  navigateToNotionPage,
  setCitationPanelMessage,
  setShowCitationPanel,
  handleCitationClick,
  setShowMermaidModal,
  setShowImageModal,
  openPdfViewer,
  onReply,
  onRetry
}: {
  messages: ChatMessage[];
  activeSession: ChatSession | undefined;
  handleSpeak: (msg: ChatMessage) => void;
  speakingMessageId: string | null;
  audioLoadingMessageId: string | null;
  navigateToPage: any;
  navigateToNotionPage: any;
  setCitationPanelMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
  setShowCitationPanel: any;
  handleCitationClick: any;
  setShowMermaidModal: any;
  setShowImageModal: any;
  openPdfViewer: any;
  onReply?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
}) => {
  // Stabilize callbacks with useCallback so ChatBubbleContent's React.memo isn't defeated
  const stableSetCitationPanelMessage = useCallback((m: React.SetStateAction<ChatMessage | null>) => {
    setCitationPanelMessage(m);
    if (typeof m === 'function' ? false : m) setShowCitationPanel(true);
  }, [setCitationPanelMessage, setShowCitationPanel]);

  const stableOnInternalLinkClick = useCallback((title: string) => {
    const page = dataService.getPageByTitle(title);
    if (page) navigateToPage(page.id, undefined, true);
  }, [navigateToPage]);

  const stableOnHoverCitation = useCallback(() => {}, []);

  const stableOnDownloadAnkiApkg = useCallback(async (cards: AnkiCard[]) => {
    if (!activeSession?.title) {
      console.error('No active session title');
      return;
    }
    const blob = await ankiService.generateApkg(activeSession.title, cards);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSession.title.replace(/[^a-z0-9]/gi, '_')}.apkg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSession?.title]);

  const stableOnDownloadAnkiCsv = useCallback(async (cards: AnkiCard[]) => {
    if (!activeSession?.title) {
      console.error('No active session title');
      return;
    }
    const blob = await ankiService.generateCsv(activeSession.title, cards);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSession.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSession?.title]);

  return (
    <>
      {messages.map((msg) => (
        <ErrorBoundary key={msg.id} componentName="Chat Message">
          <ChatMessageBubble
            message={msg}
            speakingMessageId={speakingMessageId}
            isAudioLoading={audioLoadingMessageId === msg.id}
          >
            <ChatBubbleContent
              message={msg}
              activeSession={activeSession}
              handleSpeak={handleSpeak}
              speakingMessageId={speakingMessageId}
              navigateToPage={navigateToPage}
              navigateToNotionPage={navigateToNotionPage}
              setCitationPanelMessage={stableSetCitationPanelMessage}
              onCitationClick={handleCitationClick}
              onInternalLinkClick={stableOnInternalLinkClick}
              onOpenMermaidModal={setShowMermaidModal}
              onOpenImageModal={setShowImageModal}
              openPdfViewer={openPdfViewer}
              hoveredCitationIndex={null}
              onHoverCitation={stableOnHoverCitation}
              onDownloadAnkiApkg={stableOnDownloadAnkiApkg}
              onDownloadAnkiCsv={stableOnDownloadAnkiCsv}
              isAudioLoading={audioLoadingMessageId === msg.id}
              onReply={onReply}
              onRetry={onRetry}
            />
          </ChatMessageBubble>
        </ErrorBoundary>
      ))}
    </>
  );
}, (prevProps, nextProps) => {
  // Only re-render if messages array changes (by reference) or speakingMessageId/audioLoadingMessageId changes
  // This heavily optimizes typing inside the ChatInput which changes none of these.
  return prevProps.messages === nextProps.messages && prevProps.speakingMessageId === nextProps.speakingMessageId && prevProps.audioLoadingMessageId === nextProps.audioLoadingMessageId;
});

const AiChatWindow: React.FC<AiChatWindowProps> = ({ onClose, navigateToPage, navigateToNotionPage, navigateToDriveFile, openPdfViewer, chatMode = 'modal' }) => {
  const { isMobile } = useResponsive();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [searchScope, setSearchScope] = useState<SearchScope>('auto');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [activeSourcesMessageId, setActiveSourcesMessageId] = useState<string | null>(null);
  const [showCitationPanel, setShowCitationPanel] = useState(false);
  const [citationPanelMessage, setCitationPanelMessage] = useState<ChatMessage | null>(null);
  const [showMermaidModal, setShowMermaidModal] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [replyContext, setReplyContext] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioLoadingMessageId, setAudioLoadingMessageId] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<{ isGenerating: boolean; operationName: string | null }>({ isGenerating: false, operationName: null });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Personality & Mentions
  const [showPersonalitySwitcher, setShowPersonalitySwitcher] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [taggedItems, setTaggedItems] = useState<TaggableItem[]>([]);
  const [currentPersonality, setCurrentPersonality] = useState<AiPersonality>('aurepal');
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const autoScrollEnabledRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions on mount
  useEffect(() => {
    const loaded = dataService.getChatSessions();
    setSessions(loaded);
    if (loaded.length > 0 && !activeSessionId) setActiveSessionId(loaded[0].id);
    else if (loaded.length === 0) handleNewChat();

    const user = dataService.getUser();
    if (user?.aiPersonality) setCurrentPersonality(user.aiPersonality);
  }, []);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  useEffect(() => {
    if (activeSession) {
      setMessages(activeSession.messages);
    }
  }, [activeSession?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      
      const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = scrollElement;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50; // Smaller threshold
        const wasNearBottom = !isUserScrollingRef.current;
        
        // User manually scrolled up - disable auto-scroll
        if (!isNearBottom && wasNearBottom) {
          isUserScrollingRef.current = true;
          autoScrollEnabledRef.current = false;
          setShowScrollToBottom(true);
        }
        // User scrolled back to bottom - re-enable auto-scroll
        else if (isNearBottom && !wasNearBottom) {
          isUserScrollingRef.current = false;
          autoScrollEnabledRef.current = true;
          setShowScrollToBottom(false);
        }
        // Update showScrollToBottom based on position
        else if (!isNearBottom) {
          setShowScrollToBottom(true);
        } else {
          setShowScrollToBottom(false);
        }
      };
      
      scrollElement.addEventListener('scroll', handleScroll, { passive: true });
      
      // Only auto-scroll when new messages are added (not on every DOM change)
      let lastMessageCount = 0;
      const observer = new MutationObserver(() => {
        if (autoScrollEnabledRef.current && !isUserScrollingRef.current) {
          scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'smooth' });
        }
      });
      observer.observe(scrollElement, { childList: true, subtree: true });
      
      return () => {
        scrollElement.removeEventListener('scroll', handleScroll);
        observer.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive, but only if user hasn't scrolled up
    if (scrollRef.current && autoScrollEnabledRef.current && !isUserScrollingRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setShowScrollToBottom(false);
    }
  }, [messages.length]);

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessages([]);
    dataService.saveChatSession(newSession);
    if (isMobile) setIsSidebarOpen(false);
    setTaggedItems([]);
  };

  const handleSelectSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setActiveSessionId(sessionId);
      setMessages(session.messages);
      setCitationPanelMessage(null);
      if (isMobile) setIsSidebarOpen(false);
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    dataService.deleteChatSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      handleNewChat();
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);

    if (val.startsWith('/') && val.length < 50 && !val.includes(' ')) {
      setShowPersonalitySwitcher(true);
    } else {
      setShowPersonalitySwitcher(false);
    }

    // Optimize last word extraction without splitting the entire potentially huge string
    const lastSpaceIndex = val.lastIndexOf(' ');
    const lastWord = val.slice(lastSpaceIndex + 1);
    if (lastWord && (lastWord.startsWith('@') || lastWord.startsWith('#'))) {
      setMentionQuery(lastWord);
    } else {
      setMentionQuery(null);
    }
  };

  const handleSelectPersonality = (p: AiPersonality) => {
    setCurrentPersonality(p);
    setInput('');
    setShowPersonalitySwitcher(false);
  };

  const handleSelectMention = (item: TaggableItem) => {
    setTaggedItems(prev => {
        // Prevent duplicate tagging
        if (prev.find(p => p.id === item.id)) return prev;
        return [...prev, item];
    });
    
    const prefix = item.type === 'notion_tag' ? '#' : '@';
    const lastSpaceIndex = input.lastIndexOf(' ');
    const newInput = lastSpaceIndex !== -1 
        ? input.substring(0, lastSpaceIndex) + ` ${prefix}${item.title} `
        : `${prefix}${item.title} `;
    setInput(newInput);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const handleCitationClick = (msg: ChatMessage, index: number) => {
    if (!msg.evidence || index < 1 || index > msg.evidence.length) return;
    const citation = msg.evidence[index - 1];
    
    setIsSidebarOpen(false);
    setShowCitationPanel(false);
    
    if (citation.source_type.startsWith('notion_') && citation.page_id) {
      navigateToNotionPage(citation.page_id, citation.source_ref, true, undefined, citation.snippet);
    } else if (citation.source_type === 'drive_file' && citation.page_id && navigateToDriveFile) {
      // Find mimeType from selectedFiles if possible, otherwise fallback
      const driveIntegration = dataService.getGoogleDriveIntegration();
      const file = driveIntegration?.selectedFiles.find(f => f.id === citation.page_id);
      const mimeType = file?.mimeType || 'application/vnd.google-apps.document';
      navigateToDriveFile(citation.page_id, mimeType, citation.snippet);
    } else if (citation.page_id) {
      navigateToPage(citation.page_id, citation.source_ref, true, citation.snippet);
    }
  };

  const handleRetrySend = async (userMsg: ChatMessage, existingMessages: ChatMessage[]) => {
    if (isLoading) return;
    setIsLoading(true);

    const botMsgId = uuidv4();
    const initialBotMsg: ChatMessage = {
      id: botMsgId,
      role: 'model',
      text: '',
      isProcessing: true,
      personality: userMsg.personality
    };
    const messagesWithBot = [...existingMessages, userMsg, initialBotMsg];
    setMessages(messagesWithBot);

    // Force scroll to bottom
    isUserScrollingRef.current = false;
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 50);

    const updatedSession = { ...sessions.find(s => s.id === activeSessionId)! };
    if (!updatedSession) {
      handleNewChat();
      return;
    }
    updatedSession.messages = messagesWithBot;
    setSessions(prev => prev.map(s => s.id === activeSessionId ? updatedSession : s));
    dataService.saveChatSession(updatedSession);

    abortControllerRef.current = new AbortController();

    try {
      const generator = runAurePalAgent(userMsg, [...existingMessages, userMsg], searchScope, videoState, setVideoState, abortControllerRef.current.signal);
      let currentMsg = { ...initialBotMsg };
      let lastUpdateTime = Date.now();
      let thoughtHistory: { text: string; time: string }[] = [];

      for await (const update of generator) {
        if (abortControllerRef.current?.signal.aborted) {
            currentMsg.isProcessing = false;
            currentMsg.thoughtProcess = undefined;
            break;
        }
        if (update.type === 'tool_start') {
          const newThought = { text: update.payload.toolName, time: new Date().toISOString().split('T')[1].substring(0, 8) };
          thoughtHistory = [...thoughtHistory, newThought];
          currentMsg = { ...currentMsg, thoughtProcess: update.payload.toolName, thoughtHistory };
        } else if (update.type === 'tool_result') {
          const newThought = { text: `✓ ${update.payload.skillName || 'Tool'} completed`, time: new Date().toISOString().split('T')[1].substring(0, 8) };
          thoughtHistory = [...thoughtHistory, newThought];
          currentMsg = { ...currentMsg, thoughtProcess: `✓ ${update.payload.skillName || 'Tool'} completed`, thoughtHistory };
        } else if (update.type === 'evidence_ready') {
          currentMsg = { ...currentMsg, evidence: update.payload.evidence };
        } else if (update.type === 'text_chunk') {
          currentMsg = { ...currentMsg, text: update.payload.text };
        } else if (update.type === 'chunk') {
          currentMsg = { ...currentMsg, text: update.payload.text, ankiCards: update.payload.ankiCards };
        } else if (update.type === 'response_complete') {
          currentMsg = {
            ...currentMsg,
            text: update.payload.answer,
            isProcessing: false,
            thoughtProcess: undefined,
            evidence: update.payload.evidence,
            mediaToRender: update.payload.mediaToRender,
            generatedFiles: update.payload.generatedFiles,
            ankiCards: update.payload.ankiCards,
            groundingChunks: update.payload.groundingChunks
          };
          if (update.payload.suggestedChatTitle && updatedSession.messages.length <= 2) {
            updatedSession.title = update.payload.suggestedChatTitle;
          }
        } else if (update.type === 'grounding_results') {
          currentMsg = { ...currentMsg, groundingChunks: update.payload.chunks };
        } else if (update.type === 'error') {
          if (currentMsg.text && currentMsg.text.length > 0) {
            currentMsg = { ...currentMsg, text: currentMsg.text + '\n\n---\n\n> ⚠️ ' + update.payload.message, isProcessing: false };
          } else {
            currentMsg = { ...currentMsg, text: `Error: ${update.payload.message}`, isProcessing: false };
          }
        }

        const now = Date.now();
        if ((update.type !== 'text_chunk' && update.type !== 'chunk') || now - lastUpdateTime > 100) {
            const finalMessages = [...existingMessages, userMsg, currentMsg];
            setMessages(finalMessages);
            lastUpdateTime = now;
        }
      }

      const finalMessages = [...existingMessages, userMsg, currentMsg];
      setMessages(finalMessages);
      const finalSession = { ...updatedSession, messages: finalMessages };
      setSessions(prev => prev.map(s => s.id === activeSessionId ? finalSession : s));
      dataService.saveChatSession(finalSession);
    } catch (e) {
      const errorMsg = { ...initialBotMsg, text: "An error occurred.", isProcessing: false };
      setMessages([...existingMessages, userMsg, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && pendingAttachments.length === 0) || isLoading) return;

    const userText = input.trim();
    const currentAttachments = [...pendingAttachments];
    const currentTaggedItems = [...taggedItems];
    const currentReplyContext = replyContext;
    setInput('');
    setPendingAttachments([]);
    setTaggedItems([]);
    setReplyContext(null);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const newUserMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      text: currentReplyContext 
        ? `[Replying to: "${currentReplyContext}"]\n\n${userText}`
        : userText,
      attachments: currentAttachments.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type.startsWith('image/') ? 'image' : 'file',
        mimeType: p.mimeType,
        data: p.data,
        status: 'done'
      })),
      taggedItems: currentTaggedItems,
      personality: currentPersonality
    };

    const newMessages = [...messages, newUserMsg];
    const botMsgId = uuidv4();
    const initialBotMsg: ChatMessage = {
      id: botMsgId,
      role: 'model',
      text: '',
      isProcessing: true,
      personality: currentPersonality
    };
    const messagesWithBot = [...newMessages, initialBotMsg];
    setMessages(messagesWithBot);
    setIsLoading(true);
    
    // Force scroll to bottom when user sends a message
    isUserScrollingRef.current = false;
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 50);

    const updatedSession = { ...sessions.find(s => s.id === activeSessionId)! };
    if (!updatedSession) {
      handleNewChat();
      return;
    }
    updatedSession.messages = messagesWithBot;
    if (updatedSession.messages.length <= 2) {
      updatedSession.title = userText.slice(0, 30) || 'New Chat';
    }
    setSessions(prev => prev.map(s => s.id === activeSessionId ? updatedSession : s));
    dataService.saveChatSession(updatedSession);

    abortControllerRef.current = new AbortController();

    try {
      const generator = runAurePalAgent(newUserMsg, newMessages, searchScope, videoState, setVideoState, abortControllerRef.current.signal);
      let currentMsg = { ...initialBotMsg };
      let lastUpdateTime = Date.now();
      let thoughtHistory: { text: string; time: string }[] = [];

      for await (const update of generator) {
        if (abortControllerRef.current?.signal.aborted) {
            currentMsg.isProcessing = false;
            currentMsg.thoughtProcess = undefined;
            break;
        }
        if (update.type === 'tool_start') {
          const newThought = { text: update.payload.toolName, time: new Date().toISOString().split('T')[1].substring(0, 8) };
          thoughtHistory = [...thoughtHistory, newThought];
          currentMsg = { ...currentMsg, thoughtProcess: update.payload.toolName, thoughtHistory };
        } else if (update.type === 'tool_result') {
          const newThought = { text: `✓ ${update.payload.skillName || 'Tool'} completed`, time: new Date().toISOString().split('T')[1].substring(0, 8) };
          thoughtHistory = [...thoughtHistory, newThought];
          currentMsg = { ...currentMsg, thoughtProcess: `✓ ${update.payload.skillName || 'Tool'} completed`, thoughtHistory };
        } else if (update.type === 'evidence_ready') {
          currentMsg = { ...currentMsg, evidence: update.payload.evidence };
        } else if (update.type === 'text_chunk') {
          currentMsg = { ...currentMsg, text: update.payload.text };
        } else if (update.type === 'chunk') {
          currentMsg = { ...currentMsg, text: update.payload.text, ankiCards: update.payload.ankiCards };
        } else if (update.type === 'response_complete') {
          currentMsg = {
            ...currentMsg,
            text: update.payload.answer,
            isProcessing: false,
            thoughtProcess: undefined,
            evidence: update.payload.evidence,
            mediaToRender: update.payload.mediaToRender,
            generatedFiles: update.payload.generatedFiles,
            ankiCards: update.payload.ankiCards,
            groundingChunks: update.payload.groundingChunks
          };
          if (update.payload.suggestedChatTitle && updatedSession.messages.length <= 2) {
            updatedSession.title = update.payload.suggestedChatTitle;
          }
        } else if (update.type === 'grounding_results') {
          currentMsg = { ...currentMsg, groundingChunks: update.payload.chunks };
        } else if (update.type === 'error') {
          // If the AI already generated text, append the error as a note instead of replacing the answer
          if (currentMsg.text && currentMsg.text.length > 0) {
            currentMsg = { ...currentMsg, text: currentMsg.text + '\n\n---\n\n> ⚠️ ' + update.payload.message, isProcessing: false };
          } else {
            currentMsg = { ...currentMsg, text: `Error: ${update.payload.message}`, isProcessing: false };
          }
        }

        const now = Date.now();
        if ((update.type !== 'text_chunk' && update.type !== 'chunk') || now - lastUpdateTime > 100) {
            setMessages(prev => {
                const idx = prev.findIndex(m => m.id === botMsgId);
                if (idx !== -1) {
                    const next = [...prev];
                    next[idx] = { ...currentMsg };
                    return next;
                }
                return [...prev, currentMsg];
            });
            lastUpdateTime = now;
        }
      }

      currentMsg.isProcessing = false;
      setMessages(prev => {
          const idx = prev.findIndex(m => m.id === botMsgId);
          let updatedMsgs: ChatMessage[];
          if (idx !== -1) {
              updatedMsgs = [...prev];
              updatedMsgs[idx] = { ...currentMsg };
          } else {
              updatedMsgs = [...prev, currentMsg];
          }
          const finalSession = { ...updatedSession, messages: updatedMsgs };
          setSessions(sPrev => sPrev.map(s => s.id === activeSessionId ? finalSession : s));
          dataService.saveChatSession(finalSession);
          return updatedMsgs;
      });
    } catch (e) {
      const errorMsg = { ...initialBotMsg, text: "An error occurred.", isProcessing: false };
      setMessages([...newMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const processFiles = (files: File[]) => {
    const pendingIds = files.map(f => {
      const id = uuidv4();
      setPendingAttachments(prev => [...prev, { id, name: f.name, type: f.type, mimeType: f.type, data: '', previewUrl: '', status: 'processing' }]);
      return { id, file: f };
    });
    for (const { id, file } of pendingIds) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const base64 = ev.target.result as string;
          setPendingAttachments(prev => prev.map(a => a.id === id ? {
            ...a,
            type: file.type.startsWith('image/') ? 'image' : 'file',
            mimeType: file.type,
            data: base64,
            previewUrl: base64,
            status: 'done'
          } : a));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

function pcmDataArraysToWavBlob(pcmArrays: Uint8Array[], sampleRate: number = 24000): Blob {
  try {
    let totalLength = 0;
    for (const arr of pcmArrays) {
      totalLength += arr.length;
    }

    const pcmData = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of pcmArrays) {
      pcmData.set(arr, offset);
      offset += arr.length;
    }
    
    // Create WAV Header
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');

    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Linear PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const pcmu8 = new Uint8Array(buffer, 44);
    pcmu8.set(pcmData);

    return new Blob([buffer], { type: 'audio/wav' });
  } catch (e) {
    console.error('pcmDataArraysToWavBlob error:', e);
    return new Blob([], { type: 'audio/wav' });
  }
}

  const handleSpeak = async (msg: ChatMessage) => {
    // If we're already loading audio or this message already has audio, do nothing
    if (audioLoadingMessageId === msg.id || msg.audioUrl) return;

    setAudioLoadingMessageId(msg.id);
    try {
      let text = msg.text || msg.speech?.textToSpeak || '';
      // Limit absolute maximum out of abundant caution (8192 tokens ~ 30,000 chars) -> we chunk it!
      if (text.length > 50000) text = text.substring(0, 50000) + '...';
      
      const chunkTextSmartly = (txt: string, maxLen: number = 2500) => {
          const sentences = txt.match(/[^.?!]+[.?!]+(?:\s|$)|[^.?!]+$/g) || [txt];
          const result = [];
          let currentChunk = "";
          for (const sentence of sentences) {
              if (currentChunk.length + sentence.length > maxLen) {
                  if (currentChunk) result.push(currentChunk.trim());
                  let rem = sentence;
                  while (rem.length > maxLen) {
                      result.push(rem.slice(0, maxLen));
                      rem = rem.slice(maxLen);
                  }
                  currentChunk = rem;
              } else {
                  currentChunk += sentence;
              }
          }
          if (currentChunk) result.push(currentChunk.trim());
          return result;
      };

      const chunks = chunkTextSmartly(text, 2500);

      if (chunks.length === 0) return;

      const pcmArrays: Uint8Array[] = [];
      let sampleRate = 24000;

      for (const chunk of chunks) {
        const speechResult = await generateSpeech(chunk, msg.personality);
        if (speechResult) {
          const byteCharacters = atob(speechResult.data);
          const chunkData = new Uint8Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              chunkData[i] = byteCharacters.charCodeAt(i);
          }
          
          if (chunkData.length > 44 && chunkData[0] === 82 && chunkData[1] === 73 && chunkData[2] === 70 && chunkData[3] === 70) {
              // It's a WAV wrapper, find the 'data' chunk
              let dataOffset = 44;
              for (let i = 12; i < chunkData.length - 4; i++) {
                  if (chunkData[i] === 100 && chunkData[i+1] === 97 && chunkData[i+2] === 116 && chunkData[i+3] === 97) {
                      dataOffset = i + 8; // skip 'data' plus 4 bytes of size
                      break;
                  }
              }
              pcmArrays.push(chunkData.slice(dataOffset));
          } else {
              pcmArrays.push(chunkData);
          }
          
          const rateMatch = speechResult.mimeType.match(/rate=(\d+)/);
          if (rateMatch) sampleRate = parseInt(rateMatch[1], 10);
        }
      }

      if (pcmArrays.length > 0) {
          const audioBlob = pcmDataArraysToWavBlob(pcmArrays, sampleRate);
          const url = URL.createObjectURL(audioBlob);
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, audioUrl: url } : m));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAudioLoadingMessageId(null);
    }
  };

  return (
    <div className={chatMode === 'split' ? `h-full w-full flex overflow-hidden` : `fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 md:p-6 animate-fade-in overflow-hidden`}>
      <div className={`relative w-full h-full flex overflow-hidden transition-all duration-500 ${chatMode === 'split' ? '' : `max-w-6xl max-h-[90vh] rounded-xl shadow-2xl border-2 ${WINDOW_THEMES[currentPersonality] || WINDOW_THEMES['aurepal']}`}`}>
        <button
          onClick={onClose}
          className={`absolute top-2 right-2 z-50 bg-background/80 p-2 rounded-full shadow-md text-foreground ${chatMode === 'split' ? '' : 'md:hidden'}`}
        >
          <XIcon className="w-5 h-5" />
        </button>

        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div 
            className="md:hidden absolute inset-0 bg-black/50 z-30" 
            onClick={() => setIsSidebarOpen(false)} 
          />
        )}

        {/* Sidebar */}
        <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} absolute md:relative z-40 h-full left-0 transition-all duration-300 border-r border-border/50 bg-background/95 md:bg-background/40 backdrop-blur-md overflow-hidden flex-shrink-0`}>
          <HistoryPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={(id: string) => { handleSelectSession(id); if (isMobile) setIsSidebarOpen(false); }}
            onDeleteSession={handleDeleteSession}
            onNewChat={() => { handleNewChat(); if (isMobile) setIsSidebarOpen(false); }}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-background/50 relative overflow-hidden">
          {/* Header */}
          <div className="h-14 border-b border-border/50 flex items-center justify-between px-4 bg-background/30 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 rounded-md hover:bg-white/10 text-muted-foreground"
              >
                <MenuIcon className="w-5 h-5" />
              </button>
              <span className="font-semibold text-sm md:text-base truncate max-w-[200px]">{activeSession?.title || "New Chat"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-2 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                title="Close Chat"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth min-w-0" ref={scrollRef}>
            {messages.length === 0 ? (
              <WelcomeScreen onSuggestionClick={(txt) => { setInput(txt); handleSendMessage(); }} />
            ) : (
              <MemoizedMessageList
                messages={messages}
                activeSession={activeSession}
                handleSpeak={handleSpeak}
                speakingMessageId={speakingMessageId}
                audioLoadingMessageId={audioLoadingMessageId}
                navigateToPage={navigateToPage}
                navigateToNotionPage={navigateToNotionPage}
                setCitationPanelMessage={setCitationPanelMessage}
                setShowCitationPanel={setShowCitationPanel}
                handleCitationClick={handleCitationClick}
                setShowMermaidModal={setShowMermaidModal}
                setShowImageModal={setShowImageModal}
                openPdfViewer={openPdfViewer}
                onReply={(msg) => setReplyContext(msg.text)}
                onRetry={(aiMsg) => {
                  // Find the user message that precedes this AI message
                  const aiIndex = messages.findIndex(m => m.id === aiMsg.id);
                  if (aiIndex <= 0) return;
                  const userMsg = messages[aiIndex - 1];
                  if (userMsg.role !== 'user') return;
                  // Remove this AI message and re-send the user message
                  const messagesWithoutAi = messages.slice(0, aiIndex);
                  setMessages(messagesWithoutAi);
                  // Re-trigger send with the user message's content
                  handleRetrySend(userMsg, messagesWithoutAi);
                }}
              />
            )}
            <div className="h-4" />
          </div>

          {/* Scroll to Bottom Button */}
          {showScrollToBottom && (
            <button
              onClick={() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                  isUserScrollingRef.current = false;
                  autoScrollEnabledRef.current = true;
                }
              }}
              className="absolute bottom-24 right-4 z-20 p-3 rounded-full bg-primary/90 text-primary-foreground shadow-lg hover:bg-primary transition-all duration-200 animate-bounce-in"
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          )}

          {/* Input */}
          <ChatInput
            input={input}
            setInput={handleInputChange}
            isLoading={isLoading}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            pendingAttachments={pendingAttachments}
            uploadProgress={null}
            searchScope={searchScope}
            setSearchScope={setSearchScope}
            onFormSubmit={handleSendMessage}
            onStop={() => {
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                }
                setIsLoading(false);
            }}
            onFileSelect={handleFileSelect}
            onMicClick={() => { /* ... mic logic ... */ }}
            onRemoveAttachment={(id) => setPendingAttachments(prev => prev.filter(a => a.id !== id))}
            onSelectPersonality={handleSelectPersonality}
            onSelectMention={handleSelectMention}
            showPersonalitySwitcher={showPersonalitySwitcher}
            mentionQuery={mentionQuery}
            taggedItems={taggedItems}
            onRemoveTaggedItem={(id) => setTaggedItems(prev => prev.filter(t => t.id !== id))}
            textareaRef={textareaRef}
            onPreviewAttachment={setShowImageModal}
            onPaste={(e) => {
              if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                e.preventDefault();
                processFiles(Array.from(e.clipboardData.files));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                processFiles(Array.from(e.dataTransfer.files));
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            replyContext={replyContext}
            onDismissReply={() => setReplyContext(null)}
          />
        </div>

        {/* Citation Panel */}
        {showCitationPanel && citationPanelMessage && (
          <CitationPanel
            message={citationPanelMessage}
            onClose={() => setShowCitationPanel(false)}
            onCitationClick={(index: number) => handleCitationClick(citationPanelMessage, index)}
            personality={currentPersonality}
          />
        )}
      </div>

      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileUpload}
        accept="image/*,audio/*,video/*,application/pdf,text/*,.docx,.pptx,.xlsx,.md,.txt"
      />
      <ImageModal src={showImageModal} onClose={() => setShowImageModal(null)} />
      <MermaidModal chart={showMermaidModal} onClose={() => setShowMermaidModal(null)} />
    </div>
  );
};

export default AiChatWindow;