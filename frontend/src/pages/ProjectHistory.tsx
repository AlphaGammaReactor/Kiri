import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppDispatch, useAppSelector } from '../store';
import { listSnapshotsThunk, createSnapshotThunk, restoreSnapshotThunk } from '../store/projectSlice';
import { useEffect, useState } from 'react';

export default function ProjectHistory() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activeProject = useAppSelector(s => s.project.activeProject);
  const snapshots = useAppSelector(s => s.project.snapshots);
  const isLoadingSnapshots = useAppSelector(s => s.project.isLoadingSnapshots);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDesc, setSnapshotDesc] = useState('');
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (activeProject?.id) {
      dispatch(listSnapshotsThunk(activeProject.id));
    }
  }, [activeProject?.id, dispatch]);

  const handleCreate = async () => {
    if (!activeProject?.id || !snapshotName.trim()) return;
    await dispatch(createSnapshotThunk({
      projectId: activeProject.id,
      name: snapshotName.trim(),
      description: snapshotDesc.trim(),
    }));
    setSnapshotName('');
    setSnapshotDesc('');
    setShowCreateDialog(false);
  };

  const handleRestore = async (snapshotId: string) => {
    if (!activeProject?.id) return;
    setIsRestoring(true);
    await dispatch(restoreSnapshotThunk({
      projectId: activeProject.id,
      snapshotId,
    }));
    setRestoreTargetId(null);
    setIsRestoring(false);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            📜 {t('nav.history')}
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t('history.subtitle', 'View and restore project snapshots.')}
          </p>
        </div>

        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-5 py-2 text-sm font-medium bg-kiri-accent text-kiri-bg rounded-md hover:brightness-110 shadow-[0_0_12px_rgba(23,171,114,0.3)] transition-all flex items-center gap-2"
        >
          + {t('history.create_snapshot', 'Create Snapshot')}
        </button>
      </div>

      {/* Create snapshot dialog */}
      <AnimatePresence>
        {showCreateDialog && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 bg-kiri-surface border border-kiri-border rounded-lg p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-kiri-text uppercase tracking-wider">
              {t('history.new_snapshot', 'New Snapshot')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-kiri-text-dim">{t('history.snapshot_name', 'Name')}</label>
                <input
                  type="text"
                  value={snapshotName}
                  onChange={e => setSnapshotName(e.target.value)}
                  placeholder={t('history.name_placeholder', 'e.g., Before adding BRCA1')}
                  className="w-full mt-1 bg-kiri-bg border border-kiri-border rounded px-3 py-2 text-sm text-kiri-text outline-none focus:border-kiri-accent"
                />
              </div>
              <div>
                <label className="text-xs text-kiri-text-dim">{t('history.snapshot_description', 'Description (optional)')}</label>
                <textarea
                  value={snapshotDesc}
                  onChange={e => setSnapshotDesc(e.target.value)}
                  rows={2}
                  className="w-full mt-1 bg-kiri-bg border border-kiri-border rounded px-3 py-2 text-sm text-kiri-text outline-none focus:border-kiri-accent resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="px-4 py-2 text-sm text-kiri-text-muted hover:text-kiri-text transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={!snapshotName.trim()}
                className="px-4 py-2 text-sm font-medium bg-kiri-accent text-kiri-bg rounded-md hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {t('common.save', 'Save')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restore confirmation dialog */}
      <AnimatePresence>
        {restoreTargetId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
            onClick={() => !isRestoring && setRestoreTargetId(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-kiri-surface border border-kiri-border rounded-lg p-6 max-w-md w-full mx-4 space-y-4"
            >
              <h3 className="text-lg font-bold text-kiri-text">
                {t('history.restore_title', 'Restore Snapshot?')}
              </h3>
              <p className="text-sm text-kiri-text-muted">
                {t('history.restore_warning', 'This will replace the current project state with the snapshot. Current proteins and data sources will be overwritten.')}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRestoreTargetId(null)}
                  disabled={isRestoring}
                  className="px-4 py-2 text-sm text-kiri-text-muted hover:text-kiri-text transition-colors disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleRestore(restoreTargetId)}
                  disabled={isRestoring}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {isRestoring && <span className="w-3 h-3 rounded-full border-2 border-white border-r-transparent animate-spin" />}
                  {t('history.restore_confirm', 'Restore')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Snapshot timeline */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoadingSnapshots ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-16 text-kiri-text-dim">
            <div className="text-4xl mb-4 opacity-50">📜</div>
            <p className="text-lg">{t('history.empty', 'No snapshots yet')}</p>
            <p className="text-sm mt-2 text-kiri-text-muted">
              {t('history.empty_hint', 'Create a snapshot to save the current state of your project.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snap, idx) => (
              <motion.div
                key={snap.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-kiri-surface border border-kiri-border rounded-lg p-4 flex items-start justify-between group hover:border-kiri-accent/30 transition-colors"
              >
                <div className="flex gap-4 items-start flex-1 min-w-0">
                  {/* Timeline dot */}
                  <div className="mt-1.5 flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-kiri-accent shadow-[0_0_6px_rgba(23,171,114,0.4)]" />
                    {idx < snapshots.length - 1 && (
                      <div className="w-0.5 h-8 bg-kiri-border mt-1" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-kiri-text truncate">{snap.name}</span>
                      {snap.name.toLowerCase().startsWith('auto-save') && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim">
                          ⏱️ Auto
                        </span>
                      )}
                    </div>
                    {snap.description && (
                      <p className="text-xs text-kiri-text-muted mb-1 truncate">{snap.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-kiri-text-dim">
                      <span>{formatDate(snap.created_at)}</span>
                      <span>•</span>
                      <span>{snap.protein_count} {t('history.proteins', 'proteins')}</span>
                      <span>•</span>
                      <span>{snap.source_count} {t('history.sources', 'sources')}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setRestoreTargetId(snap.id)}
                  className="px-3 py-1.5 text-xs font-medium text-kiri-text-muted hover:text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 rounded transition-all opacity-0 group-hover:opacity-100"
                >
                  {t('history.restore', 'Restore')}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
