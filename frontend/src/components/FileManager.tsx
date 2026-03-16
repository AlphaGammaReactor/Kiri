/**
 * Kiri — FileManager Component
 *
 * Reusable file management UI for project uploads.
 * Supports upload, list, and delete with correct typing and i18n.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchProjectFiles,
  uploadProjectFile,
  deleteProjectFile,
  type UploadedFile,
} from "../services/api";

interface FileManagerProps {
  projectId: string;
  /** If provided, only show files of this type */
  filterType?: string;
  /** Called when a file is selected (e.g. for use in Atlas) */
  onSelectFile?: (file: UploadedFile) => void;
  /** Called after a file is successfully uploaded — use to auto-attach as data source */
  onFileUploaded?: (file: UploadedFile) => void;
  /** Compact mode for embedding in other panels */
  compact?: boolean;
}

const FILE_TYPE_ICONS: Record<string, string> = {
  expression: "📊",
  image: "🖼️",
  document: "📄",
  data: "💾",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileManager({
  projectId,
  filterType,
  onSelectFile,
  onFileUploaded,
  compact = false,
}: FileManagerProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetchProjectFiles(projectId);
      if (res.status === "success" && res.data) {
        const filtered = filterType
          ? res.data.filter((f) => f.file_type === filterType)
          : res.data;
        setFiles(filtered);
      }
    } catch {
      setError(t("files.load_error", "Failed to load files"));
    }
    setLoading(false);
  }, [projectId, filterType, t]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const result = await uploadProjectFile(projectId, file);
        // Notify parent of each successful upload for data source auto-attach
        if (result?.data && onFileUploaded) {
          onFileUploaded(result.data as UploadedFile);
        }
      }
      await loadFiles();
    } catch {
      setError(t("files.upload_error", "Upload failed"));
    }
    setUploading(false);
  };

  const handleDelete = async (fileId: string) => {
    try {
      await deleteProjectFile(projectId, fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      setError(t("files.delete_error", "Delete failed"));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  return (
    <div className="space-y-4">
      {/* Upload Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-${compact ? "4" : "6"} text-center cursor-pointer transition-all ${
          dragOver
            ? "border-kiri-accent bg-kiri-accent-glow"
            : "border-kiri-border hover:border-kiri-accent/50 hover:bg-kiri-surface-hover"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files)}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-kiri-text-muted">
            <div className="w-4 h-4 border-2 border-kiri-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">{t("files.uploading", "Uploading...")}</span>
          </div>
        ) : (
          <div className="text-kiri-text-muted">
            <p className={`${compact ? "text-xs" : "text-sm"} font-medium`}>
              📁 {t("files.drop_here", "Drop files here or click to upload")}
            </p>
            <p className="text-xs mt-1 text-kiri-text-dim">
              {t("files.supported", "CSV, TSV, images, PDF, Excel — max 50 MB")}
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 px-2">{error}</p>
      )}

      {/* File List */}
      {loading ? (
        <div className="text-center py-6">
          <div className="w-5 h-5 border-2 border-kiri-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-kiri-text-dim mt-2">{t("common.loading")}</p>
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-6 text-kiri-text-muted">
          <p className="text-2xl mb-2">📂</p>
          <p className="text-xs">{t("files.empty", "No files uploaded yet")}</p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-2">
            {files.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`flex items-center gap-3 p-3 rounded-lg border border-kiri-border bg-kiri-surface hover:bg-kiri-surface-hover transition-colors ${
                  onSelectFile ? "cursor-pointer" : ""
                }`}
                onClick={() => onSelectFile?.(file)}
              >
                {/* Icon */}
                <span className="text-lg shrink-0">
                  {FILE_TYPE_ICONS[file.file_type] || "📄"}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-kiri-text truncate">
                    {file.original_name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-kiri-text-dim mt-0.5">
                    <span className="uppercase px-1.5 py-0.5 rounded bg-kiri-surface-hover">
                      {file.file_type}
                    </span>
                    <span>{formatFileSize(file.file_size)}</span>
                    {file.has_parsed_data && file.parsed_summary && (
                      <span className="text-kiri-accent">
                        {file.parsed_summary.row_count} {t("files.genes", "genes")} × {file.parsed_summary.sample_count} {t("files.samples", "samples")}
                      </span>
                    )}
                    <span>{new Date(file.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(file.id);
                  }}
                  className="text-xs text-kiri-text-dim hover:text-red-400 transition-colors p-1 shrink-0"
                  title={t("files.delete", "Delete")}
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
