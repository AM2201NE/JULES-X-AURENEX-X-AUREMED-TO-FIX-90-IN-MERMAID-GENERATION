/**
 * EvidencePanel - Enhanced evidence display for AureMed
 * 
 * Renders clickable citations (PubMed, ClinicalTrials.gov, DOI) 
 * and Mermaid diagrams from skill execution results.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { EnhancedEvidence } from '../types';

interface EvidencePanelProps {
  evidence: EnhancedEvidence[];
  onClose?: () => void;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ evidence, onClose }) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const mermaidRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [mermaidLoaded, setMermaidLoaded] = useState(false);

  // Load mermaid dynamically
  useEffect(() => {
    const loadMermaid = async () => {
      try {
        const mermaid = await import('mermaid');
        mermaid.default.initialize({
          startOnLoad: false,
          theme: 'base',
          flowchart: { defaultRenderer: 'elk' },
          securityLevel: 'loose',
        });
        setMermaidLoaded(true);
      } catch (error) {
        console.warn('Mermaid failed to load:', error);
      }
    };
    loadMermaid();
  }, []);

  // Render mermaid diagrams when loaded
  useEffect(() => {
    if (!mermaidLoaded) return;
    
    const renderDiagrams = async () => {
      const mermaid = (await import('mermaid')).default;
      
      for (const [id, element] of mermaidRefs.current.entries()) {
        if (element && !element.dataset.rendered) {
          try {
            const code = element.dataset.mermaidCode || '';
            await mermaid.render(`diagram-${id}`, code);
            element.dataset.rendered = 'true';
          } catch (error) {
            console.warn(`Failed to render mermaid diagram ${id}:`, error);
            element.innerHTML = `<pre class="mermaid-error">${element.dataset.mermaidCode || ''}</pre>`;
          }
        }
      }
    };
    
    renderDiagrams();
  }, [mermaidLoaded, evidence]);

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getSourceBadgeColor = (type: string) => {
    switch (type) {
      case 'pubmed': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'clinicaltrials': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800';
      case 'doi': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'diagram': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800';
      default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'pubmed': return '📚';
      case 'clinicaltrials': return '🏥';
      case 'doi': return '🔗';
      case 'diagram': return '📊';
      default: return '📄';
    }
  };

  const getSourceLabel = (type: string) => {
    switch (type) {
      case 'pubmed': return 'PubMed';
      case 'clinicaltrials': return 'ClinicalTrials.gov';
      case 'doi': return 'DOI';
      case 'diagram': return 'Diagram';
      default: return 'Source';
    }
  };

  // Extract PMID from URL or metadata
  const extractPmid = (item: EnhancedEvidence): string | null => {
    if (item.metadata?.pmid) return String(item.metadata.pmid);
    const match = item.clickableUrl?.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
    return match ? match[1] : null;
  };

  // Extract NCT ID from URL or metadata
  const extractNctId = (item: EnhancedEvidence): string | null => {
    if (item.metadata?.nctId) return item.metadata.nctId;
    const match = item.clickableUrl?.match(/clinicaltrials\.gov\/study\/(NCT\d+)/);
    return match ? match[1] : null;
  };

  // Get a short snippet/preview from the evidence
  const getSnippet = (item: EnhancedEvidence): string => {
    if (item.snippet && item.snippet.length > 0) return item.snippet;
    if (item.metadata?.title) return item.metadata.title;
    if (item.formattedCitation) return item.formattedCitation;
    return 'No preview available';
  };

  // Get authors short form
  const getAuthorsShort = (item: EnhancedEvidence): string => {
    const authors = item.metadata?.authors;
    if (!authors || authors.length === 0) return '';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return `${authors[0]}, ${authors[1]}`;
    return `${authors[0]} et al.`;
  };

  // Get evidence level badge based on study design
  const getEvidenceLevel = (item: EnhancedEvidence): { label: string; color: string } | null => {
    const title = (item.metadata?.title || '').toLowerCase();
    const snippet = (item.snippet || '').toLowerCase();
    const text = title + ' ' + snippet;
    
    if (text.includes('systematic review') || text.includes('meta-analysis')) {
      return { label: 'Systematic Review', color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' };
    }
    if (text.includes('randomized') || text.includes('rct') || text.includes('randomised')) {
      return { label: 'RCT', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' };
    }
    if (text.includes('guideline') || text.includes('consensus') || text.includes('recommendation')) {
      return { label: 'Guideline', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' };
    }
    if (text.includes('cohort') || text.includes('prospective') || text.includes('retrospective')) {
      return { label: 'Cohort Study', color: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800' };
    }
    if (text.includes('case report') || text.includes('case series')) {
      return { label: 'Case Report', color: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' };
    }
    if (item.citationType === 'clinicaltrials') {
      return { label: 'Clinical Trial', color: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' };
    }
    return null;
  };

  if (!evidence || evidence.length === 0) {
    return (
      <div className="evidence-panel p-4 text-center text-gray-500">
        <p>No evidence available yet. Run a query to see citations and diagrams.</p>
      </div>
    );
  }

  // Group evidence by type for better organization
  const citations = evidence.filter(e => e.citationType !== 'diagram');
  const diagrams = evidence.filter(e => e.citationType === 'diagram');

  return (
    <div className="evidence-panel bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-xl">📋</span>
          Evidence & Citations
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({evidence.length} items)
          </span>
        </h3>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            aria-label="Close evidence panel"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="max-h-[600px] overflow-y-auto p-4 space-y-4">
        {/* Citations Section */}
        {citations.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Citations ({citations.length})
            </h4>
            {citations.map((item, index) => {
              const pmid = extractPmid(item);
              const nctId = extractNctId(item);
              const authors = getAuthorsShort(item);
              const snippet = getSnippet(item);
              const evidenceLevel = getEvidenceLevel(item);
              const sourceLabel = getSourceLabel(item.citationType);
              const sourceId = pmid ? `PMID: ${pmid}` : nctId ? nctId : item.metadata?.doi ? `DOI: ${item.metadata.doi}` : '';
              
              return (
              <div 
                key={item.evidence_id} 
                className="evidence-item border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all"
              >
                {/* Top colored bar based on source type */}
                <div className={`h-1 ${item.citationType === 'pubmed' ? 'bg-blue-500' : item.citationType === 'clinicaltrials' ? 'bg-green-500' : item.citationType === 'doi' ? 'bg-purple-500' : 'bg-gray-400'}`} />
                
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5 flex-shrink-0">{getSourceIcon(item.citationType)}</span>
                    
                    <div className="flex-1 min-w-0">
                      {/* Title — most prominent */}
                      {item.metadata?.title && (
                        <div className="mb-1.5">
                          <a
                            href={item.clickableUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline line-clamp-2"
                          >
                            {item.metadata.title}
                          </a>
                        </div>
                      )}
                      
                      {/* Authors + Year + Journal — compact summary line */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400 mb-2">
                        {authors && (
                          <span className="font-medium">{authors}</span>
                        )}
                        {item.metadata?.year && (
                          <span className="text-gray-400 dark:text-gray-500">({item.metadata.year})</span>
                        )}
                        {item.metadata?.journal && (
                          <span className="italic truncate max-w-[180px]">{item.metadata.journal}</span>
                        )}
                        {item.metadata?.sponsor && (
                          <span className="truncate max-w-[150px]">Sponsor: {item.metadata.sponsor}</span>
                        )}
                      </div>

                      {/* Badges row — source type, evidence level, phase, status */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${getSourceBadgeColor(item.citationType)}`}>
                          {getSourceIcon(item.citationType)} {sourceLabel}
                        </span>
                        {sourceId && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                            {sourceId}
                          </span>
                        )}
                        {evidenceLevel && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${evidenceLevel.color}`}>
                            {evidenceLevel.label}
                          </span>
                        )}
                        {item.metadata?.phase && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                            Phase {item.metadata.phase}
                          </span>
                        )}
                        {item.metadata?.status && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${
                            item.metadata.status.toLowerCase().includes('recruit') 
                              ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800'
                              : item.metadata.status.toLowerCase().includes('complete')
                              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800'
                              : 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                          }`}>
                            {item.metadata.status.toLowerCase().replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>

                      {/* Snippet/Abstract preview — truncated */}
                      {snippet && snippet !== item.metadata?.title && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2 leading-relaxed">
                          {snippet}
                        </p>
                      )}

                      {/* Conditions for clinical trials */}
                      {item.metadata?.conditions && item.metadata.conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.metadata.conditions.slice(0, 3).map((cond: string, i: number) => (
                            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800">
                              {cond}
                            </span>
                          ))}
                          {item.metadata.conditions.length > 3 && (
                            <span className="text-[10px] text-gray-400">+{item.metadata.conditions.length - 3} more</span>
                          )}
                        </div>
                      )}

                      {/* Action row — open link + copy + expand details */}
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                        <a
                          href={item.clickableUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Open Source
                        </a>
                        <button
                          onClick={() => copyToClipboard(item.formattedCitation)}
                          className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                          title="Copy citation"
                        >
                          📋 Copy
                        </button>
                        {Object.keys(item.metadata).length > 0 && (
                          <button
                            onClick={() => toggleExpanded(item.evidence_id)}
                            className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            {expandedItems.has(item.evidence_id) ? '▼ Less' : '▶ Details'}
                          </button>
                        )}
                      </div>

                      {/* Expanded metadata */}
                      {expandedItems.has(item.evidence_id) && (
                        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-300 space-y-1 max-h-60 overflow-y-auto">
                          {item.metadata?.title && (
                            <div><strong>Title:</strong> {item.metadata.title}</div>
                          )}
                          {item.metadata?.authors && item.metadata.authors.length > 0 && (
                            <div><strong>Authors:</strong> {item.metadata.authors.slice(0, 5).join(', ')}{item.metadata.authors.length > 5 ? ' et al.' : ''}</div>
                          )}
                          {item.metadata?.journal && (
                            <div><strong>Journal:</strong> {item.metadata.journal}</div>
                          )}
                          {item.metadata?.year && (
                            <div><strong>Year:</strong> {item.metadata.year}</div>
                          )}
                          {item.metadata?.volume && (
                            <div><strong>Volume:</strong> {item.metadata.volume}</div>
                          )}
                          {item.metadata?.issue && (
                            <div><strong>Issue:</strong> {item.metadata.issue}</div>
                          )}
                          {item.metadata?.pages && (
                            <div><strong>Pages:</strong> {item.metadata.pages}</div>
                          )}
                          {item.metadata?.doi && (
                            <div><strong>DOI:</strong> <a href={`https://doi.org/${item.metadata.doi}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{item.metadata.doi}</a></div>
                          )}
                          {item.metadata?.pmid && (
                            <div><strong>PMID:</strong> <a href={`https://pubmed.ncbi.nlm.nih.gov/${item.metadata.pmid}/`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{item.metadata.pmid}</a></div>
                          )}
                          {item.metadata?.nctId && (
                            <div><strong>NCT ID:</strong> <a href={`https://clinicaltrials.gov/study/${item.metadata.nctId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{item.metadata.nctId}</a></div>
                          )}
                          {item.metadata?.conditions && item.metadata.conditions.length > 0 && (
                            <div><strong>Conditions:</strong> {item.metadata.conditions.join(', ')}</div>
                          )}
                          {item.metadata?.interventions && item.metadata.interventions.length > 0 && (
                            <div><strong>Interventions:</strong> {item.metadata.interventions.join(', ')}</div>
                          )}
                          {item.metadata?.sponsor && (
                            <div><strong>Sponsor:</strong> {item.metadata.sponsor}</div>
                          )}
                          <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
                            <strong>URL:</strong> <a href={item.clickableUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">{item.clickableUrl}</a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Diagrams Section */}
        {diagrams.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Diagrams ({diagrams.length})
            </h4>
            {diagrams.map((item, index) => (
              <div 
                key={item.evidence_id} 
                className="evidence-item border border-gray-200 dark:border-gray-700 rounded-lg p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{getSourceIcon(item.citationType)}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{item.pageTitle}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border ${getSourceBadgeColor(item.citationType)} text-xs`}>
                    {item.citationType.toUpperCase()}
                  </span>
                </div>
                
                {item.metadata?.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{item.metadata.description}</p>
                )}

                {/* Mermaid Diagram Container */}
                <div 
                  ref={(el) => {
                    if (el) {
                      mermaidRefs.current.set(item.evidence_id, el);
                      el.dataset.mermaidCode = item.snippet;
                    } else {
                      mermaidRefs.current.delete(item.evidence_id);
                    }
                  }}
                  className="mermaid-container bg-gray-50 dark:bg-gray-800 rounded p-4 min-h-[200px] border border-gray-200 dark:border-gray-700"
                  data-mermaid-code={item.snippet}
                >
                  {mermaidLoaded ? (
                    <div className="mermaid-diagram">{item.snippet}</div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                      <p className="mt-2 text-sm">Loading diagram...</p>
                    </div>
                  )}
                </div>

                {/* Code view toggle */}
                <button
                  onClick={() => toggleExpanded(item.evidence_id)}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {expandedItems.has(item.evidence_id) ? '▼' : '▶'} View Mermaid Code
                </button>

                {expandedItems.has(item.evidence_id) && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Mermaid Source</span>
                      <button
                        onClick={() => copyToClipboard(item.snippet)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Copy Code
                      </button>
                    </div>
                    <pre className="bg-gray-900 text-green-300 p-3 rounded text-xs overflow-x-auto max-h-60">
                      {item.snippet}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
          <span>Total: {evidence.length}</span>
          <span>Citations: {citations.length}</span>
          <span>Diagrams: {diagrams.length}</span>
          <span>PubMed: {citations.filter(c => c.citationType === 'pubmed').length}</span>
          <span>ClinicalTrials: {citations.filter(c => c.citationType === 'clinicaltrials').length}</span>
        </div>
      </div>
    </div>
  );
};

export default EvidencePanel;