import type { Settings } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import { useSetAtom } from 'jotai';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api } from '@nav/api/client';
import { DialogPanel } from '@nav/components/DialogPanel';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { updateSettingsCacheAtom } from '@nav/features/settings/store';
import { VisibilityField } from '@nav/features/visibility/VisibilityField';
import { useApiData } from '@nav/hooks/useApiData';
import { domainOf, faviconFor } from '@shared/search';

import { validateSettingsDraft } from './settingsValidation';
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
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'engine';
  let id = base;
  let index = 2;
  while (existing.includes(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

function EngineIcon({ engine }: { engine: SearchEngine }) {
  const src = engine.iconUrl || faviconFor(domainOf(engine.url));
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
    if (!trimmedName || trimmedName.length > 40) {
      setError('请输入 1–40 字的名称');
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
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="engine-name">名称</FieldLabel>
          <Input
            id="engine-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：知乎"
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="engine-url">搜索网址模板</FieldLabel>
          <Input
            id="engine-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.zhihu.com/search?type=content&q={query}"
          />
          <p className="text-[11px] text-muted-foreground">
            使用 <code className="rounded bg-card px-1">{'{query}'}</code> 作为查询词占位符。
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor="engine-icon">图标网址（可选）</FieldLabel>
          <Input
            id="engine-icon"
            value={iconUrl}
            onChange={(event) => setIconUrl(event.target.value)}
            placeholder="留空则自动取域名 favicon"
          />
        </Field>
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
      </FieldGroup>
    </DialogPanel>
  );
}

export function SettingsTab() {
  const auth = useAuthContext();
  const cacheSettings = useSetAtom(updateSettingsCacheAtom);
  const loadSettings = useCallback((signal: AbortSignal) => api.getSettings(undefined, signal), []);
  const {
    data: settings,
    loading,
    error: loadError,
    refresh,
    setData,
  } = useApiData(loadSettings, { onUnauthorized: () => void auth.logout() });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [tab, setTab] = useState('appearance');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [engineDialog, setEngineDialog] = useState<{ engine?: SearchEngine } | null>(null);
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  function update(values: Partial<Settings>) {
    setDraft((current) => (current ? { ...current, ...values } : current));
    setInvalid(null);
    setError(null);
  }
  async function save() {
    if (!draft) return;
    const fail = (section: string, field: string, message: string) => {
      setTab(section);
      setInvalid(field);
      setError(message);
      requestAnimationFrame(() => document.getElementById(field)?.focus());
    };
    const issue = validateSettingsDraft(draft);
    if (issue) {
      fail(issue.tab, issue.field, issue.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateSettings('', draft);
      setData(saved);
      setDraft(saved);
      cacheSettings(saved);
      pushToast('设置已保存', 'success');
    } catch (caught) {
      if (!handleAdminUnauthorized(auth, caught))
        setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }
  const provider = PRESETS.find((item) => item.url === draft?.faviconProxyUrl)?.id ?? 'custom';
  return (
    <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">管理外观、网站图标与启动台搜索引擎。</p>
      </div>
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : loadError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {loadError}
            <Button variant="outline" onClick={refresh}>
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : draft ? (
        <>
          <fieldset disabled={saving} className="min-w-0">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="privacy">访问与隐私</TabsTrigger>
                <TabsTrigger value="appearance">外观</TabsTrigger>
                <TabsTrigger value="icons">网站图标</TabsTrigger>
                <TabsTrigger value="engines">搜索引擎</TabsTrigger>
              </TabsList>
              <TabsContent value="privacy">
                <Card>
                  <CardHeader>
                    <CardTitle>访问与隐私</CardTitle>
                    <CardDescription>
                      游客只能浏览公开内容。私有分类保护全部子分类及网站；旧内容保持私有。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    <VisibilityField
                      label="新分类默认权限"
                      value={draft.defaultCategoryVisibility}
                      onChange={(defaultCategoryVisibility) =>
                        update({ defaultCategoryVisibility })
                      }
                    />
                    <VisibilityField
                      label="新网站默认权限"
                      value={draft.defaultBookmarkVisibility}
                      onChange={(defaultBookmarkVisibility) =>
                        update({ defaultBookmarkVisibility })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      默认值只影响以后新建的内容。旧 JSON 和 HTML 导入缺少权限时默认私有。
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="appearance">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>背景图片</h2>
                    </CardTitle>
                    <CardDescription>
                      启动台与书签柜共用背景图片，关闭后使用纯色背景。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="background-enabled">启用背景图片</FieldLabel>
                        <Switch
                          id="background-enabled"
                          checked={draft.backgroundImageEnabled}
                          onCheckedChange={(checked) => update({ backgroundImageEnabled: checked })}
                        />
                      </Field>
                      <Field data-invalid={invalid === 'background-url'}>
                        <FieldLabel htmlFor="background-url">图片网址</FieldLabel>
                        <Input
                          id="background-url"
                          aria-invalid={invalid === 'background-url'}
                          value={draft.backgroundImageUrl}
                          onChange={(event) => update({ backgroundImageUrl: event.target.value })}
                          placeholder="https://example.com/wallpaper.jpg"
                        />
                        <FieldDescription>使用 HTTPS 图片网址，建议选择宽幅图片。</FieldDescription>
                        <Button
                          variant="outline"
                          size="sm"
                          className="self-start"
                          disabled={!draft.backgroundImageUrl}
                          onClick={() => update({ backgroundImageUrl: '' })}
                        >
                          清除网址
                        </Button>
                      </Field>
                      {draft.backgroundImageUrl ? (
                        <img
                          src={draft.backgroundImageUrl}
                          alt="背景预览"
                          className="h-48 w-full rounded-lg object-cover"
                        />
                      ) : null}
                    </FieldGroup>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="icons">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>网站图标</h2>
                    </CardTitle>
                    <CardDescription>保存书签时自动补全图标，可选择图标来源。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="favicon-enabled">自动获取图标</FieldLabel>
                        <Switch
                          id="favicon-enabled"
                          checked={draft.faviconProxyEnabled}
                          onCheckedChange={(checked) => update({ faviconProxyEnabled: checked })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>图标来源</FieldLabel>
                        <ToggleGroup
                          value={[provider]}
                          variant="outline"
                          className="flex-wrap"
                          onValueChange={(values) => {
                            if (values[0])
                              update({
                                faviconProxyUrl:
                                  PRESETS.find((item) => item.id === values[0])?.url ??
                                  'https://{domain}/favicon.ico',
                              });
                          }}
                          aria-label="图标来源"
                        >
                          {PRESETS.map((item) => (
                            <ToggleGroupItem key={item.id} value={item.id}>
                              {item.label}
                            </ToggleGroupItem>
                          ))}
                          <ToggleGroupItem value="custom">自定义</ToggleGroupItem>
                        </ToggleGroup>
                      </Field>
                      <Field data-invalid={invalid === 'favicon-url'}>
                        <FieldLabel htmlFor="favicon-url">图标网址模板</FieldLabel>
                        <Input
                          id="favicon-url"
                          aria-invalid={invalid === 'favicon-url'}
                          readOnly={provider !== 'custom'}
                          value={draft.faviconProxyUrl}
                          onChange={(event) => update({ faviconProxyUrl: event.target.value })}
                        />
                        <FieldDescription>
                          使用 {'{domain}'} 作为域名占位符。预设模板只读，选择自定义后可编辑。
                        </FieldDescription>
                      </Field>
                    </FieldGroup>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="engines">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>搜索引擎</h2>
                    </CardTitle>
                    <CardDescription>
                      选择默认引擎或管理自定义引擎，内置项不可删除。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FieldSet>
                      <FieldLegend>默认搜索引擎</FieldLegend>
                      <RadioGroup
                        id="engine-list"
                        tabIndex={-1}
                        aria-invalid={invalid === 'engine-list'}
                        value={draft.defaultEngineId}
                        onValueChange={(value) => update({ defaultEngineId: String(value) })}
                        aria-label="默认搜索引擎"
                      >
                        {draft.searchEngines.map((engine) => (
                          <Field
                            orientation="horizontal"
                            key={engine.id}
                            className="rounded-md border p-3"
                          >
                            <RadioGroupItem value={engine.id} id={`engine-${engine.id}`} />
                            <EngineIcon engine={engine} />
                            <div className="min-w-0 flex-1">
                              <FieldLabel htmlFor={`engine-${engine.id}`}>
                                {engine.name}
                                {engine.builtin ? <Badge variant="secondary">内置</Badge> : null}
                              </FieldLabel>
                              <p className="truncate text-xs text-muted-foreground">{engine.url}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`编辑 ${engine.name}`}
                              onClick={() => setEngineDialog({ engine })}
                            >
                              <Pencil />
                            </Button>
                            {!engine.builtin ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`删除 ${engine.name}`}
                                onClick={() => {
                                  const engines = draft.searchEngines.filter(
                                    (item) => item.id !== engine.id,
                                  );
                                  update({
                                    searchEngines: engines,
                                    defaultEngineId:
                                      draft.defaultEngineId === engine.id
                                        ? (engines[0]?.id ?? '')
                                        : draft.defaultEngineId,
                                  });
                                }}
                              >
                                <Trash2 />
                              </Button>
                            ) : null}
                          </Field>
                        ))}
                      </RadioGroup>
                      <Button
                        variant="outline"
                        className="self-start"
                        onClick={() => setEngineDialog({})}
                      >
                        <Plus data-icon="inline-start" />
                        添加引擎
                      </Button>
                    </FieldSet>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </fieldset>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <span role="status" className="text-sm text-muted-foreground">
              {dirty ? '有未保存修改' : '所有修改已保存'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={saving || !dirty}
                onClick={() => {
                  setDraft(settings);
                  setError(null);
                  setInvalid(null);
                }}
              >
                撤销修改
              </Button>
              <Button disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? '保存中…' : '保存设置'}
              </Button>
            </div>
            {error ? (
              <Alert variant="destructive" className="w-full">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          {engineDialog ? (
            <EngineFormDialog
              open
              engine={engineDialog.engine}
              existingIds={draft.searchEngines.map((engine) => engine.id)}
              onClose={() => setEngineDialog(null)}
              onSubmit={(engine) =>
                update({
                  searchEngines: draft.searchEngines.some((item) => item.id === engine.id)
                    ? draft.searchEngines.map((item) => (item.id === engine.id ? engine : item))
                    : [...draft.searchEngines, engine],
                })
              }
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
