import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppDispatch, useAppSelector } from '../store';
import {
  setOptions, removePanel, clearPanels, reorderPanels,
  updatePanelMeta, setExporting, setExportError,
  persistPublicationState,
} from '../store/publicationSlice';
import type { PublicationOptions, ExportPanel } from '../store/publicationSlice';
import { generatePublicationFigure } from '../services/api';
import { InfoTooltip } from '../components/ui';
import { useEffect, useRef, useCallback, useState } from 'react';

const LAYOUTS = ['1x1', '1x2', '2x1', '2x2', '2x3', '3x2'];

/** Parse a layout string like "2x3" into { rows, cols } */
function parseLayout(layout: string): { rows: number; cols: number } {
  const [r, c] = layout.split('x').map(Number);
  return { rows: r || 1, cols: c || 1 };
}

/** Layout preset visual thumbnail */
function LayoutPreview({ layout, active, onClick }: { layout: string; active: boolean; onClick: () => void }) {
  const { rows, cols } = parseLayout(layout);
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded border transition-all ${
        active
          ? 'border-kiri-accent bg-kiri-accent-glow shadow-sm'
          : 'border-kiri-border hover:border-kiri-border-focus'
      }`}
      title={`${layout} Grid`}
    >
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, width: 28, height: 20 }}>
        {Array.from({ length: rows * cols }).map((_, i) => (
          <div key={i} className={`rounded-[1px] ${active ? 'bg-kiri-accent/60' : 'bg-kiri-text-dim/30'}`} />
        ))}
      </div>
    </button>
  );
}

export default function PublicationEngine() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { panels, options, isExporting, exportError, isLoading, isSaving, lastSavedAt } = useAppSelector(s => s.publication);
  const activeProjectId = useAppSelector(s => s.project.activeProject?.id);

  // ── Drag state for cart sidebar ──
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── Drag state for canvas swap ──
  const [canvasDragSource, setCanvasDragSource] = useState<number | null>(null);
  const [canvasDragOver, setCanvasDragOver] = useState<number | null>(null);

  // ── Inline edit state ──
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── Panel context menu ──
  const [contextMenu, setContextMenu] = useState<{ panelId: string; x: number; y: number } | null>(null);

  // ── Auto-save with 2s debounce ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPanelsLenRef = useRef(panels.length);
  const prevOptionsRef = useRef(JSON.stringify(options));

  const triggerSave = useCallback(() => {
    if (!activeProjectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dispatch(persistPublicationState({ projectId: activeProjectId, panels, options }));
    }, 2000);
  }, [activeProjectId, panels, options, dispatch]);

  useEffect(() => {
    const currentOptionsStr = JSON.stringify(options);
    if (panels.length !== prevPanelsLenRef.current || currentOptionsStr !== prevOptionsRef.current) {
      prevPanelsLenRef.current = panels.length;
      prevOptionsRef.current = currentOptionsStr;
      triggerSave();
    }
  }, [panels, options, triggerSave]);

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleOptionChange = (key: keyof PublicationOptions, value: string) => {
    dispatch(setOptions({ [key]: value }));
  };

  const handleExport = async () => {
    if (panels.length === 0) return;
    dispatch(setExporting(true));
    dispatch(setExportError(null));

    try {
      const response = await generatePublicationFigure({ panels, options });

      const url = window.URL.createObjectURL(new Blob([response.data], { type: options.format === 'svg' ? 'image/svg+xml' : 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `kiri_figure_${activeProjectId || 'export'}.${options.format}`);
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      link.remove();
    } catch (err: unknown) {
      console.error('Export failed', err);
      dispatch(setExportError(err instanceof Error ? err.message : 'Export failed'));
    } finally {
      dispatch(setExporting(false));
    }
  };

  // ── Cart drag handlers ──
  const onCartDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const onCartDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const onCartDrop = (endIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const startIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(startIndex) && startIndex !== endIndex) {
      dispatch(reorderPanels({ startIndex, endIndex }));
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const onCartDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // ── Canvas drag handlers ──
  const onCanvasDragStart = (panelIndex: number) => (e: React.DragEvent) => {
    setCanvasDragSource(panelIndex);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(panelIndex));
  };

  const onCanvasDragOver = (cellIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setCanvasDragOver(cellIndex);
  };

  const onCanvasDrop = (targetCellIndex: number, pageIndex: number, totalCells: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourcePanelIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const targetPanelIndex = pageIndex * totalCells + targetCellIndex;
    if (!isNaN(sourcePanelIndex) && sourcePanelIndex !== targetPanelIndex && sourcePanelIndex < panels.length) {
      // If target cell has a panel, swap. Otherwise, move.
      if (targetPanelIndex < panels.length) {
        // Swap: move source to target position
        dispatch(reorderPanels({ startIndex: sourcePanelIndex, endIndex: targetPanelIndex }));
      }
    }
    setCanvasDragSource(null);
    setCanvasDragOver(null);
  };

  // ── Inline edit handlers ──
  const startEditing = (panel: ExportPanel) => {
    setEditingPanelId(panel.id);
    setEditValue(panel.customTitle || panel.title);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const commitEdit = () => {
    if (editingPanelId && editValue.trim()) {
      dispatch(updatePanelMeta({ id: editingPanelId, changes: { customTitle: editValue.trim() } }));
    }
    setEditingPanelId(null);
  };

  // ── Span control ──
  const cycleSpan = (panel: ExportPanel) => {
    const currentCols = panel.spanCols || 1;
    const currentRows = panel.spanRows || 1;
    // Cycle: 1×1 → 2×1 → 1×2 → 2×2 → 1×1
    if (currentCols === 1 && currentRows === 1) {
      dispatch(updatePanelMeta({ id: panel.id, changes: { spanCols: 2, spanRows: 1 } }));
    } else if (currentCols === 2 && currentRows === 1) {
      dispatch(updatePanelMeta({ id: panel.id, changes: { spanCols: 1, spanRows: 2 } }));
    } else if (currentCols === 1 && currentRows === 2) {
      dispatch(updatePanelMeta({ id: panel.id, changes: { spanCols: 2, spanRows: 2 } }));
    } else {
      dispatch(updatePanelMeta({ id: panel.id, changes: { spanCols: 1, spanRows: 1 } }));
    }
  };

  const { rows, cols } = parseLayout(options.layout);
  const totalCells = rows * cols;

  if (isLoading) {
    return (
      <div className="p-8 h-full flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 h-screen flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            📄 {t('nav.export')}
            <InfoTooltip tooltipKey="tooltips.publication" />
          </h1>
          <p className="text-kiri-text-muted text-sm mt-1">
            {t('export.subtitle', 'Configure layout and export publication-ready figures.')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="text-xs text-kiri-text-dim animate-pulse">{t('common.saving', 'Saving…')}</span>
          )}
          {!isSaving && lastSavedAt && (
            <span className="text-xs text-kiri-text-dim">✓ {t('common.saved', 'Saved')}</span>
          )}

          <button
            onClick={() => dispatch(clearPanels())}
            disabled={panels.length === 0}
            className="px-4 py-2 text-sm text-kiri-text-muted hover:text-kiri-error transition-colors disabled:opacity-50"
          >
            {t('common.clear')}
          </button>
          <button
            onClick={handleExport}
            disabled={panels.length === 0 || isExporting}
            className="px-5 py-2 text-sm font-medium bg-kiri-accent text-kiri-bg rounded-md hover:brightness-110 shadow-[0_0_12px_rgba(23,171,114,0.3)] transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-kiri-bg border-r-transparent animate-spin" />
                {t('common.generating')}
              </>
            ) : (
              `${t('export.export_button')} ${options.format.toUpperCase()}`
            )}
          </button>
        </div>
      </div>

      {exportError && (
        <div className="mb-4 p-3 bg-kiri-error/10 border border-kiri-error/50 rounded text-kiri-error text-sm">
          {exportError}
        </div>
      )}

      <div className="flex gap-6 flex-1 min-h-0">
        {/* ═══ Left config sidebar ═══ */}
        <aside className="w-72 shrink-0 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">

          <div className="space-y-4 bg-kiri-surface border border-kiri-border p-4 rounded bg-opacity-50">
            <h3 className="text-sm font-bold text-kiri-text uppercase tracking-wider">{t('export.format_options')}</h3>

            {/* Layout quick-select with visual thumbnails */}
            <div className="space-y-1.5">
              <label className="text-xs text-kiri-text-dim">{t('export.grid_layout')}</label>
              <div className="flex gap-1.5 flex-wrap">
                {LAYOUTS.map(l => (
                  <LayoutPreview
                    key={l}
                    layout={l}
                    active={options.layout === l}
                    onClick={() => handleOptionChange('layout', l)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-kiri-text-dim">{t('export.file_format')}</label>
              <div className="flex bg-kiri-bg rounded border border-kiri-border p-0.5">
                {['pdf', 'svg'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => handleOptionChange('format', fmt)}
                    className={`flex-1 text-sm py-1 rounded transition-colors ${options.format === fmt ? 'bg-kiri-surface-hover text-kiri-accent shadow-sm' : 'text-kiri-text-muted hover:text-kiri-text'}`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-kiri-text-dim">{t('export.journal_style')}</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { key: 'nature', label: 'Nature', primary: '#C82423', secondary: '#2E75B6' },
                  { key: 'cell', label: 'Cell Press', primary: '#D64550', secondary: '#4A90D9' },
                  { key: 'science', label: 'Science', primary: '#B22222', secondary: '#1F4E79' },
                  { key: 'pnas', label: 'PNAS', primary: '#CC3333', secondary: '#336699' },
                ] as const).map((theme) => (
                  <button
                    key={theme.key}
                    onClick={() => handleOptionChange('style', theme.key)}
                    className={`text-xs px-2.5 py-2 rounded border transition-all flex items-center gap-2 ${
                      options.style === theme.key
                        ? 'border-kiri-accent bg-kiri-accent-glow text-kiri-accent'
                        : 'border-kiri-border text-kiri-text-muted hover:border-kiri-border-focus hover:text-kiri-text'
                    }`}
                  >
                    <span className="flex gap-0.5 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.secondary }} />
                    </span>
                    <span className="font-medium truncate">{theme.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-kiri-text-dim">{t('export.color_palette')}</label>
              <select
                value={options.palette}
                onChange={e => handleOptionChange('palette', e.target.value)}
                className="w-full bg-kiri-bg border border-kiri-border rounded px-3 py-1.5 text-sm text-kiri-text outline-none focus:border-kiri-accent"
              >
                <option value="colorblind">Colorblind-Safe</option>
                <option value="default">Default Vivid</option>
                <option value="monochrome">Grayscale / Mono</option>
              </select>
            </div>

             <div className="space-y-1.5">
               <label className="text-xs text-kiri-text-dim">{t('export.bilingual_labels')}</label>
               <select
                 value={options.language}
                 onChange={e => handleOptionChange('language', e.target.value)}
                 className="w-full bg-kiri-bg border border-kiri-border rounded px-3 py-1.5 text-sm text-kiri-text outline-none focus:border-kiri-accent"
               >
                 <option value="en">English (Default)</option>
                 <option value="zh">Chinese (Simplified)</option>
               </select>
             </div>
          </div>

          {/* ═══ Cart (Drag-and-Drop) ═══ */}
          <div className="bg-kiri-surface border border-kiri-border p-4 rounded bg-opacity-50 flex-1 flex flex-col min-h-0">
            <h3 className="text-sm font-bold text-kiri-text uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>{t('export.cart')} ({panels.length})</span>
              {panels.length > 1 && (
                <span className="text-[9px] text-kiri-text-dim font-normal normal-case tracking-normal">
                  Drag to reorder
                </span>
              )}
            </h3>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              <AnimatePresence>
                {panels.length === 0 ? (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-sm text-kiri-text-muted text-center py-6">
                    {t('export.cart_empty')}
                  </motion.div>
                ) : (
                  panels.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10, height: 0 }}
                      draggable
                      onDragStart={onCartDragStart(i)}
                      onDragOver={onCartDragOver(i)}
                      onDrop={onCartDrop(i)}
                      onDragEnd={onCartDragEnd}
                      className={`p-3 rounded group relative cursor-grab active:cursor-grabbing transition-all ${
                        dragIndex === i
                          ? 'opacity-40 scale-95 border border-kiri-accent/50 bg-kiri-accent/5'
                          : dragOverIndex === i && dragIndex !== null
                          ? 'border-2 border-kiri-accent border-dashed bg-kiri-accent/5'
                          : 'bg-kiri-bg border border-kiri-border hover:border-kiri-border-focus'
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ panelId: p.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      {/* Drag handle + Controls row */}
                      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => cycleSpan(p)}
                          className="p-1 rounded hover:bg-kiri-surface-hover text-kiri-text-dim hover:text-kiri-accent transition-colors"
                          title={`Span: ${p.spanCols || 1}×${p.spanRows || 1} (click to cycle)`}
                        >
                          <span className="text-[9px] font-mono">{p.spanCols || 1}×{p.spanRows || 1}</span>
                        </button>
                        <button
                          onClick={() => dispatch(removePanel(p.id))}
                          className="p-1 rounded hover:bg-kiri-error/10 text-kiri-text-dim hover:text-kiri-error transition-colors"
                        >
                           ✕
                        </button>
                      </div>

                      {/* Drag handle indicator */}
                      <div className="absolute top-1/2 left-1 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity text-kiri-text-dim select-none text-[10px] leading-none">
                        ⠿
                      </div>

                      <div className="font-bold text-xs text-kiri-text mb-1 pr-16 pl-4 flex items-center gap-2">
                         <span className="w-5 h-5 rounded bg-kiri-surface-hover flex items-center justify-center flex-shrink-0 font-mono text-[10px]">
                           {String.fromCharCode(65 + i)}
                         </span>
                         {editingPanelId === p.id ? (
                           <input
                             ref={editInputRef}
                             value={editValue}
                             onChange={e => setEditValue(e.target.value)}
                             onBlur={commitEdit}
                             onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingPanelId(null); }}
                             className="bg-kiri-bg border border-kiri-accent rounded px-1 py-0.5 text-xs text-kiri-text w-full outline-none"
                           />
                         ) : (
                           <span
                             className="truncate cursor-text hover:text-kiri-accent transition-colors"
                             onDoubleClick={() => startEditing(p)}
                             title="Double-click to edit title"
                           >
                             {p.customTitle || p.title}
                           </span>
                         )}
                      </div>
                      <div className="text-[10px] text-kiri-text-dim uppercase tracking-wider mb-1.5 pl-4">
                        {p.sourceModule}
                        {(p.spanCols && p.spanCols > 1) || (p.spanRows && p.spanRows > 1) ? (
                          <span className="ml-1.5 text-kiri-accent/70">
                            · Span {p.spanCols || 1}×{p.spanRows || 1}
                          </span>
                        ) : null}
                      </div>
                      {/* Compact preview thumbnail */}
                      {p.type === 'svg' ? (
                         <div className="w-full h-14 bg-white/5 rounded border border-kiri-border flex items-center justify-center overflow-hidden ml-4">
                            <div className="w-full h-full transform scale-50 pointer-events-none" dangerouslySetInnerHTML={{__html: p.data}} />
                         </div>
                      ) : (
                         <div className="w-full h-14 bg-white/5 rounded border border-kiri-border flex items-center justify-center overflow-hidden ml-4">
                            <img src={p.data.startsWith('data:') ? p.data : `data:image/png;base64,${p.data}`} alt="preview" className="max-w-full max-h-full object-contain" />
                         </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </aside>

        {/* ═══ Right canvas preview area ═══ */}
        <main className="flex-1 bg-neutral-900 border border-neutral-800 rounded flex flex-col items-center justify-start overflow-auto p-8 shadow-inner relative gap-8">
           {panels.length > 0 ? (
             Array.from({ length: Math.ceil(panels.length / totalCells) }).map((_, pageIndex) => (
               <div key={pageIndex} className="w-[841px] h-[595px] bg-white shadow-2xl shrink-0 flex flex-col relative transform sm:scale-75 lg:scale-95 xl:scale-100 origin-top transition-transform mb-4">
                {/* Title */}
                <div className="absolute top-6 left-8 right-8 flex items-baseline justify-between">
                  <span className="text-black font-bold text-xl tracking-tight">{t('export.preview_title')}</span>
                  <span className="text-gray-400 text-[9px] uppercase tracking-wider">
                    {options.style.charAt(0).toUpperCase() + options.style.slice(1)} Style • {options.palette}
                  </span>
                </div>

               {/* Grid of panels */}
               <div
                 className="flex-1 m-8 mt-16 mb-12 grid gap-2"
                 style={{
                   gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                   gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                 }}
               >
                 {(() => {
                   // Build cells: track which cells are occupied by spanning panels
                   const cells: (number | null)[] = Array(totalCells).fill(null);
                   let panelIdx = pageIndex * totalCells;

                   for (let cellIdx = 0; cellIdx < totalCells && panelIdx < panels.length; cellIdx++) {
                     if (cells[cellIdx] !== null) continue; // occupied by a spanning panel
                     cells[cellIdx] = panelIdx;
                     panelIdx++;
                   }

                   return Array.from({ length: totalCells }).map((_, cellIdx) => {
                     const pIdx = cells[cellIdx];
                     const panel = pIdx !== null ? panels[pIdx] : null;
                     const spanC = panel?.spanCols && panel.spanCols > 1 ? Math.min(panel.spanCols, cols) : 1;
                     const spanR = panel?.spanRows && panel.spanRows > 1 ? Math.min(panel.spanRows, rows) : 1;

                     return (
                       <div
                         key={cellIdx}
                         className={`border bg-gray-50 flex flex-col relative overflow-hidden transition-all ${
                           panel ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-40'
                         } ${canvasDragOver === cellIdx ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
                         style={{
                           gridColumn: spanC > 1 ? `span ${spanC}` : undefined,
                           gridRow: spanR > 1 ? `span ${spanR}` : undefined,
                         }}
                         draggable={!!panel}
                         onDragStart={panel && pIdx !== null ? onCanvasDragStart(pIdx) : undefined}
                         onDragOver={onCanvasDragOver(cellIdx)}
                         onDrop={onCanvasDrop(cellIdx, pageIndex, totalCells)}
                         onDragEnd={() => { setCanvasDragSource(null); setCanvasDragOver(null); }}
                       >
                         {/* Panel label */}
                         <span className="absolute top-1.5 left-2 text-black font-bold text-sm z-10">
                           {pIdx !== null ? String.fromCharCode(65 + pIdx) : ''}
                         </span>

                         {panel ? (
                           <>
                             {/* Panel title */}
                             <div className="px-2 pt-6 pb-0.5">
                               <span className="text-[8px] text-gray-600 font-medium leading-tight line-clamp-1">
                                 {panel.customTitle || panel.title}
                               </span>
                             </div>

                             {/* Image/SVG */}
                             <div className={`flex-1 w-full flex items-center justify-center overflow-hidden px-2 filter contrast-125 saturate-50 ${
                               canvasDragSource === pIdx ? 'opacity-40' : ''
                             }`}>
                               {panel.type === 'svg' ? (
                                 <div className="w-full h-full pointer-events-none" dangerouslySetInnerHTML={{__html: panel.data}} />
                               ) : (
                                 <img
                                   src={panel.data.startsWith('data:') ? panel.data : `data:image/png;base64,${panel.data}`}
                                   className="max-w-full max-h-full object-contain"
                                   alt=""
                                 />
                               )}
                             </div>

                             {/* Source & Citation annotation */}
                             <div className="px-2 py-1 border-t border-gray-200 bg-gray-50/80 space-y-0">
                               {panel.dataSource && (
                                 <div className="text-[7px] text-gray-500 truncate">
                                   <span className="font-medium text-gray-600">Source:</span> {panel.dataSource}
                                 </div>
                               )}
                               {panel.citation && (
                                 <div className="text-[7px] text-gray-400 truncate italic">
                                   {panel.citation}
                                 </div>
                               )}
                               {panel.legend && !panel.dataSource && !panel.citation && (
                                 <div className="text-[7px] text-gray-400 truncate italic">
                                   {panel.legend}
                                 </div>
                               )}
                             </div>
                           </>
                         ) : (
                           <div className="flex-1 flex items-center justify-center text-gray-300 text-xs">
                             —
                           </div>
                         )}
                       </div>
                     );
                   });
                 })()}
               </div>

               {/* Footer */}
               <div className="absolute bottom-3 left-8 right-8 flex items-center justify-between">
                 <span className="text-gray-400 text-[9px]">
                   {t('export.preview_footer')} | Page {pageIndex + 1}
                 </span>
                 <span className="text-gray-300 text-[8px]">
                   {Math.min(panels.length - pageIndex * totalCells, totalCells)}/{totalCells} panels
                 </span>
               </div>
             </div>
             ))
           ) : (
              <div className="text-center text-kiri-text-muted flex flex-col items-center">
                <div className="text-5xl mb-4 opacity-40">📄</div>
                 <p className="text-lg font-medium text-kiri-text">{t('export.empty_canvas')}</p>
                 <p className="text-sm mt-2 text-kiri-text-muted max-w-xs">{t('export.cart_empty')}</p>
                 <p className="text-xs mt-4 text-kiri-text-dim">
                  Use the <span className="text-kiri-accent font-medium">＋ Figure</span> button on any chart to add it here
                </p>
             </div>
           )}
        </main>
      </div>

      {/* ═══ Context Menu Portal ═══ */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 bg-kiri-surface border border-kiri-border rounded-lg shadow-2xl shadow-black/40 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                const panel = panels.find(p => p.id === contextMenu.panelId);
                if (panel) startEditing(panel);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-kiri-text hover:bg-kiri-surface-hover transition-colors flex items-center gap-2"
            >
              ✏️ Edit Title
            </button>
            <button
              onClick={() => {
                const panel = panels.find(p => p.id === contextMenu.panelId);
                if (panel) cycleSpan(panel);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-kiri-text hover:bg-kiri-surface-hover transition-colors flex items-center gap-2"
            >
              ↔️ Cycle Span
            </button>
            <div className="h-px bg-kiri-border mx-2 my-1" />
            <button
              onClick={() => {
                dispatch(removePanel(contextMenu.panelId));
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-kiri-error hover:bg-kiri-error/10 transition-colors flex items-center gap-2"
            >
              🗑️ Remove
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
