import type { SearchEngine } from '@shared/search';

import { Check, Image, Pencil, Plus, Settings, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@nav/api/client';
import { DialogPanel } from '@nav/components/DialogPanel';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useApiData } from '@nav/hooks/useApiData';
import { DEFAULT_SEARCH_ENGINES, domainOf, faviconFor } from '@shared/search';

import { handleAdminUnauthorized } from './shared';

const PRESETS: { id: string; label: string; url: string }[] = [
  {
    id: 'google',
    label: 'Google',
    url: 'https://www.google.com/s2/favicons?domain={domain}&sz=64',
  },
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    url: 'https://icons.duckduckgo.com/ip3/{domain}.ico',
  },
  { id: 'icon-horse', label: 'Icon Horse', url: 'https://icon.horse/icon/{domain}' },
];

/** 由名称生成引擎 id；冲突时追加序号。 */
function engineIdFromName(name: string, existing: string[]): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'engine';
  let id = base;
  let index = 2;
  while (existing.includes(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

function EngineIcon({ engine }: { engine: SearchEngine }) {
  const src = faviconFor(domainOf(engine.url));
  return (
    <ImageWithFallback
      src={src}
      className="size-5 rounded"
      loading="lazy"
      fallback={<span className="text-xs font-semibold text-primary">{engine.name.charAt(0)}</span>}
    />
  );
}

/** 新建 / 编辑引擎的表单弹窗。engine 为 undefined 时表示新建。 */
function EngineFormDialog({
  open,
  engine,
  existingIds,
  onClose,
  onSubmit,
}: {
  open: boolean;
  engine?: SearchEngine;
  existingIds: string[];
  onClose: () => void;
  onSubmit: (engine: SearchEngine) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(engine?.name ?? '');
      setUrl(engine?.url ?? '');
      setIconUrl(engine?.iconUrl ?? '');
      setError(null);
    }
  }, [open, engine]);

  function submit() {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const trimmedIcon = iconUrl.trim();
    if (!trimmedName) {
      setError('请输入名称');
      return;
    }
    if (!trimmedUrl.includes('{query}')) {
      setError('搜索网址需包含 {query} 占位符');
      return;
    }
    try {
      new URL(trimmedUrl.replace('{query}', '查询词'));
    } catch {
      setError('搜索网址不是合法的 URL');
      return;
    }
    if (trimmedIcon) {
      try {
        new URL(trimmedIcon);
      } catch {
        setError('图标网址不是合法的 URL');
        return;
      }
    }
    const id = engine?.id ?? engineIdFromName(trimmedName, existingIds);
    onSubmit({
      id,
      name: trimmedName,
      url: trimmedUrl,
      iconUrl: trimmedIcon || undefined,
      builtin: engine?.builtin ?? false,
    });
    onClose();
  }

  return (
    <DialogPanel open={open} onClose={onClose} title={engine ? '编辑搜索引擎' : '添加搜索引擎'}>
      <h2 className="font-display text-lg font-semibold">
        {engine ? '编辑搜索引擎' : '添加搜索引擎'}
      </h2>
      <div className="grid gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="engine-name">名称</Label>
          <Input
            id="engine-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：知乎"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="engine-url">搜索网址模板</Label>
          <Input
            id="engine-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.zhihu.com/search?type=content&q={query}"
          />
          <p className="text-[11px] text-muted-foreground">
            使用 <code className="rounded bg-card px-1">{'{query}'}</code> 作为查询词占位符。
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="engine-icon">图标网址（可选）</Label>
          <Input
            id="engine-icon"
            value={iconUrl}
            onChange={(event) => setIconUrl(event.target.value)}
            placeholder="留空则自动取域名 favicon"
          />
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" onClick={submit}>
            {engine ? '保存修改' : '添加'}
          </Button>
        </div>
      </div>
    </DialogPanel>
  );
}

export function SettingsTab() {
  const auth = useAuthContext();
  const [faviconProxyUrl, setFaviconProxyUrl] = useState('');
  const [faviconProxyEnabled, setFaviconProxyEnabled] = useState(true);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('');
  const [backgroundImageEnabled, setBackgroundImageEnabled] = useState(false);
  const [searchEngines, setSearchEngines] = useState<SearchEngine[]>(DEFAULT_SEARCH_ENGINES);
  const [defaultEngineId, setDefaultEngineId] = useState('google');
  const [engineDialog, setEngineDialog] = useState<{ engine?: SearchEngine } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProvider = PRESETS.find((preset) => preset.url === faviconProxyUrl)?.id ?? 'custom';

  const loadSettings = useCallback((signal: AbortSignal) => api.getSettings(undefined, signal), []);
  const { data: settings, loading } = useApiData(loadSettings, {
    onUnauthorized: () => void auth.logout(),
  });
  /** 数据到达后再填表，避免首次渲染空表单闪一下。 */
  const pending = loading || settings === null;

  useEffect(() => {
    if (!settings) return;
    setFaviconProxyUrl(settings.faviconProxyUrl);
    setFaviconProxyEnabled(settings.faviconProxyEnabled);
    setBackgroundImageUrl(settings.backgroundImageUrl);
    setBackgroundImageEnabled(settings.backgroundImageEnabled);
    const engines =
      settings.searchEngines.length > 0 ? settings.searchEngines : DEFAULT_SEARCH_ENGINES;
    setSearchEngines(engines);
    setDefaultEngineId(
      engines.some((engine) => engine.id === settings.defaultEngineId)
        ? settings.defaultEngineId
        : engines[0].id,
    );
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings('', {
        faviconProxyUrl,
        faviconProxyEnabled,
        backgroundImageUrl,
        backgroundImageEnabled,
        searchEngines,
        defaultEngineId,
      });
      pushToast('设置已保存', 'success');
    } catch (caught) {
      if (handleAdminUnauthorized(auth, caught)) return;
      setError(caught instanceof ApiError ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold">设置</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          配置背景图片、favicon 获取工具与启动台使用的搜索引擎。
        </p>
      </div>

      {pending ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          加载中…
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
          <section className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Image className="size-4" />
              背景图片
            </div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              为启动台与书签柜设置一张背景图；留空则使用纯色纸面。
            </p>

            <label className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
              <Checkbox
                checked={backgroundImageEnabled}
                onCheckedChange={(checked) => setBackgroundImageEnabled(checked === true)}
              />
              启用背景图片
            </label>

            <div className="mt-3 flex flex-col gap-2">
              <Label htmlFor="background-url">图片网址</Label>
              <div className="flex gap-2">
                <Input
                  id="background-url"
                  value={backgroundImageUrl}
                  onChange={(event) => setBackgroundImageUrl(event.target.value)}
                  placeholder="https://example.com/wallpaper.jpg"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!backgroundImageUrl}
                  onClick={() => setBackgroundImageUrl('')}
                >
                  清除
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                填写 https 图片地址，建议宽图（如 1920×1080）以便铺满背景。
              </p>
            </div>

            {backgroundImageUrl ? (
              <div
                aria-hidden
                className="mt-3 h-28 rounded-md border border-border bg-cover bg-center"
                style={{ backgroundImage: `url("${backgroundImageUrl}")` }}
              />
            ) : null}
          </section>

          <section className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Settings className="size-4" />
              Favicon 自动获取
            </div>

            <label className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
              <Checkbox
                checked={faviconProxyEnabled}
                onCheckedChange={(checked) => setFaviconProxyEnabled(checked === true)}
              />
              保存书签时自动补全图标
            </label>

            <div className="mt-3 flex flex-col gap-2">
              <Label>获取工具</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    variant={selectedProvider === preset.id ? 'default' : 'outline'}
                    role="radio"
                    aria-checked={selectedProvider === preset.id}
                    onClick={() => setFaviconProxyUrl(preset.url)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={selectedProvider === 'custom' ? 'default' : 'outline'}
                  role="radio"
                  aria-checked={selectedProvider === 'custom'}
                  onClick={() => {
                    if (selectedProvider !== 'custom') {
                      setFaviconProxyUrl('https://{domain}/favicon.ico');
                    }
                  }}
                >
                  自定义
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <Label htmlFor="favicon-url">URL 模板</Label>
              <Input
                id="favicon-url"
                value={faviconProxyUrl}
                onChange={(event) => setFaviconProxyUrl(event.target.value)}
                placeholder="https://www.google.com/s2/favicons?domain={domain}&sz=64"
              />
              <p className="text-[11px] text-muted-foreground">
                使用 <code className="rounded bg-card px-1">{'{domain}'}</code> 作为域名占位符。
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Settings className="size-4" />
              搜索引擎
            </div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              启动台与网页搜索使用的引擎，内置项不可删除。
            </p>

            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="默认搜索引擎">
              {searchEngines.map((engine) => (
                <div
                  key={engine.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={engine.id === defaultEngineId}
                    aria-label={`设 ${engine.name} 为默认`}
                    onClick={() => setDefaultEngineId(engine.id)}
                    className="grid size-4 shrink-0 place-items-center rounded-full border border-border transition hover:border-primary"
                  >
                    {engine.id === defaultEngineId ? (
                      <span className="size-2 rounded-full bg-primary" />
                    ) : null}
                  </button>
                  <EngineIcon engine={engine} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {engine.name}
                      {engine.builtin ? (
                        <span className="ml-1.5 rounded bg-card px-1 py-px text-[10px] font-normal text-muted-foreground">
                          内置
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {engine.url}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`编辑 ${engine.name}`}
                    onClick={() => setEngineDialog({ engine })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {!engine.builtin ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除 ${engine.name}`}
                      onClick={() =>
                        setSearchEngines((current) =>
                          current.filter((item) => item.id !== engine.id),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setEngineDialog({})}
            >
              <Plus className="size-4" />
              添加引擎
            </Button>
          </section>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setError(null);
                try {
                  const data = await api.getSettings();
                  setFaviconProxyUrl(data.faviconProxyUrl);
                  setFaviconProxyEnabled(data.faviconProxyEnabled);
                } catch (caught) {
                  if (handleAdminUnauthorized(auth, caught)) return;
                  setError(caught instanceof ApiError ? caught.message : '重置失败');
                }
                setBackgroundImageUrl('');
                setBackgroundImageEnabled(false);
                setSearchEngines(DEFAULT_SEARCH_ENGINES);
                setDefaultEngineId('google');
              }}
            >
              <Check className="size-4" />
              恢复默认
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              variant="default"
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      )}

      {engineDialog ? (
        <EngineFormDialog
          open
          engine={engineDialog.engine}
          existingIds={searchEngines.map((engine) => engine.id)}
          onClose={() => setEngineDialog(null)}
          onSubmit={(engine) =>
            setSearchEngines((current) => {
              const index = current.findIndex((item) => item.id === engine.id);
              if (index >= 0) {
                const next = [...current];
                next[index] = engine;
                return next;
              }
              return [...current, engine];
            })
          }
        />
      ) : null}
    </div>
  );
}
