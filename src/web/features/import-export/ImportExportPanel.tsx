import type { ImportSummary, TransferFormat } from '@nav/api/types';

import {
  Braces,
  CheckCircle,
  ChevronDown,
  Download,
  FileCode,
  FileUp,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError, api } from '@nav/api/client';
import { DialogPanel } from '@nav/components/DialogPanel';

type Stage = 'idle' | 'reading' | 'uploading' | 'processing' | 'done';

type ImportState = {
  stage: Stage;
  progress: number;
  summary: ImportSummary | null;
  error: string | null;
};

const INITIAL_IMPORT: ImportState = { stage: 'idle', progress: 0, summary: null, error: null };

function summaryText(summary: ImportSummary) {
  return `新建 ${summary.categoriesCreated} 个分类、${summary.bookmarksCreated} 个书签，复用 ${summary.categoriesReused} 个分类，跳过 ${summary.bookmarksSkipped} 个重复，更新 ${summary.bookmarksUpdated} 个书签。`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return '登录已过期，请重新登录';
    }
    if (error.status === 413) {
      return '文件过大（超过 10MB），请缩减后再导入';
    }
    return error.message || '导入失败，请重试';
  }
  return '导入失败，请重试';
}

export function ImportExportPanel({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>(INITIAL_IMPORT);

  useEffect(() => {
    return () => {
      abortRef.current?.();
    };
  }, []);

  const busy =
    importState.stage === 'uploading' ||
    importState.stage === 'processing' ||
    importState.stage === 'reading' ||
    exporting;

  async function handleExport(format: TransferFormat) {
    setExporting(true);
    setExportError(null);
    setExportOpen(false);
    try {
      const result = await api.exportData(format);
      downloadBlob(result.blob, result.filename);
    } catch (caught) {
      setExportError(caught instanceof ApiError ? friendlyError(caught) : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  function pickFile(file: File) {
    setSelectedFile(file);
    setImportState(INITIAL_IMPORT);
  }

  async function runImport() {
    const file = selectedFile;
    if (!file) {
      return;
    }

    setImportState({ stage: 'reading', progress: 0, summary: null, error: null });
    try {
      const content = await file.text();
      setImportState({ stage: 'uploading', progress: 0, summary: null, error: null });

      const { promise, abort } = api.importDataAuto(content, 'skip', (loaded, total) => {
        const ratio = total > 0 ? loaded / total : 0;
        setImportState((prev) =>
          prev.stage === 'uploading'
            ? { ...prev, progress: ratio, stage: ratio >= 1 ? 'processing' : 'uploading' }
            : prev,
        );
      });
      abortRef.current = abort;

      const result = await promise;
      setImportState({ stage: 'done', progress: 1, summary: result, error: null });
      await onImported();
    } catch (caught) {
      setImportState({ ...INITIAL_IMPORT, error: friendlyError(caught) });
    } finally {
      abortRef.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      pickFile(file);
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      pickFile(file);
    }
  }

  const stageLabels: Record<Stage, string> = {
    idle: '等待导入',
    reading: '读取文件…',
    uploading: '上传中…',
    processing: '服务端处理…',
    done: '完成',
  };

  return (
    <DialogPanel
      open={open}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      size="xl"
      labelledBy="transfer-title"
    >
      <div className="flex flex-col gap-1.5 pr-6">
        <h2 id="transfer-title" className="text-lg font-semibold tracking-tight text-foreground">
          导入 / 导出
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          支持 HTML 书签与 JSON 备份，导入时自动识别格式。
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-border bg-muted p-3.5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Download size={16} />
            导出
          </div>
          <div className="relative">
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => setExportOpen((value) => !value)}
              type="button"
              variant="secondary"
            >
              {exporting ? (
                <>
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                  导出中…
                </>
              ) : (
                <>
                  <Download data-icon="inline-start" />
                  选择格式
                  <ChevronDown data-icon="inline-end" size={14} />
                </>
              )}
            </Button>
            {exportOpen ? (
              <div className="absolute top-full right-0 left-0 z-10 mt-1.5 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
                <button
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                  onClick={() => void handleExport('html')}
                  type="button"
                >
                  <FileCode size={16} className="text-primary" />
                  <span>
                    <span className="block font-medium">HTML 浏览器书签</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Chrome / Firefox / Safari
                    </span>
                  </span>
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                  onClick={() => void handleExport('json')}
                  type="button"
                >
                  <Braces size={16} className="text-primary" />
                  <span>
                    <span className="block font-medium">JSON 完整备份</span>
                    <span className="block text-[11px] text-muted-foreground">保留全部字段</span>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
          {exportError ? (
            <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{exportError}</span>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-muted p-3.5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Upload size={16} />
            导入
          </div>
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center transition',
              dragging ? 'border-primary/50 bg-primary/10' : 'border-border bg-background',
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <FileUp size={22} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              拖拽文件，或
              <button
                className="mx-1 font-medium text-primary hover:underline"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                选择文件
              </button>
            </p>
            <p className="text-[11px] text-muted-foreground">.html / .json</p>
          </div>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".html,.htm,.json,text/html,application/json"
            onChange={onInputChange}
          />
          {selectedFile ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
              <span className="min-w-0 truncate text-muted-foreground" title={selectedFile.name}>
                {selectedFile.name} · {formatBytes(selectedFile.size)}
              </span>
              {!busy ? (
                <button
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setSelectedFile(null)}
                  type="button"
                  aria-label="移除文件"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {selectedFile &&
      (importState.stage !== 'idle' || importState.error || importState.summary) ? (
        <div className="mt-4 rounded-lg border border-border bg-muted p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              {importState.stage === 'done' ? (
                <CheckCircle size={16} className="fill-current text-[var(--verdigris)]" />
              ) : busy ? (
                <LoaderCircle size={16} className="animate-spin text-primary" />
              ) : (
                <RefreshCw size={16} className="text-muted-foreground" />
              )}
              <span>{stageLabels[importState.stage]}</span>
            </div>
            {importState.stage === 'uploading' ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(importState.progress * 100)}%
              </span>
            ) : null}
          </div>

          {importState.stage === 'uploading' ? (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${Math.round(importState.progress * 100)}%` }}
              />
            </div>
          ) : null}

          {importState.stage === 'reading' || importState.stage === 'processing' ? (
            <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full w-[40%] animate-indeterminate-bar rounded-full bg-primary/70" />
            </div>
          ) : null}

          {importState.summary ? (
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
              <SummaryStat
                label="新建分类"
                value={importState.summary.categoriesCreated}
                tone="accent"
              />
              <SummaryStat
                label="复用分类"
                value={importState.summary.categoriesReused}
                tone="muted"
              />
              <SummaryStat
                label="新建书签"
                value={importState.summary.bookmarksCreated}
                tone="accent"
              />
              <SummaryStat
                label="跳过重复"
                value={importState.summary.bookmarksSkipped}
                tone="muted"
              />
              <SummaryStat
                label="更新书签"
                value={importState.summary.bookmarksUpdated}
                tone="muted"
              />
              {importState.summary.errors.length > 0 ? (
                <SummaryStat label="警告" value={importState.summary.errors.length} tone="warn" />
              ) : null}
            </div>
          ) : null}

          {importState.summary ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {summaryText(importState.summary)}
            </p>
          ) : null}

          {importState.error ? (
            <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{importState.error}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedFile && importState.stage !== 'done' ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          {importState.stage === 'uploading' || importState.stage === 'processing' ? (
            <Button
              variant="ghost"
              onClick={() => {
                abortRef.current?.();
              }}
              type="button"
            >
              取消
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy} type="button">
                关闭
              </Button>
              <Button
                onClick={() => void runImport()}
                disabled={busy}
                type="button"
                variant="default"
              >
                <Upload data-icon="inline-start" />
                开始导入
              </Button>
            </>
          )}
        </div>
      ) : null}
    </DialogPanel>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'accent' | 'muted' | 'warn';
}) {
  const toneClass =
    tone === 'accent' ? 'text-primary' : tone === 'warn' ? 'text-amber-500' : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <div className={cn('text-sm font-semibold tabular-nums', toneClass)}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
