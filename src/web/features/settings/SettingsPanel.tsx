import { Check, Settings, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge, Input, Label } from '@/components/ui/primitives';
import { ApiError, api } from '@nav/api/client';
import { Button } from '@nav/components/Button';
import { Modal } from '@nav/components/Modal';

const PRESETS: { label: string; url: string }[] = [
  { label: 'Google', url: 'https://www.google.com/s2/favicons?domain={domain}&sz=64' },
  { label: 'DuckDuckGo', url: 'https://icons.duckduckgo.com/ip3/{domain}.ico' },
];

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [faviconProxyUrl, setFaviconProxyUrl] = useState('');
  const [faviconProxyEnabled, setFaviconProxyEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getSettings()
      .then((data) => {
        setFaviconProxyUrl(data.faviconProxyUrl);
        setFaviconProxyEnabled(data.faviconProxyEnabled);
      })
      .catch((caught) => {
        setError(caught instanceof ApiError ? caught.message : '加载设置失败');
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings('', {
        faviconProxyUrl,
        faviconProxyEnabled,
      });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" labelledBy="settings-title" title="设置">
      <div className="flex flex-col gap-1.5 pr-6">
        <h2 id="settings-title" className="text-lg font-semibold tracking-tight">
          设置
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">配置书签抓取的 favicon 代理。</p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center py-10 text-sm text-muted-foreground">
          加载中…
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <section className="rounded-lg border border-border bg-muted/40 p-3.5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Settings className="size-4" />
              Favicon 代理
            </div>

            <label className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
              <Checkbox
                checked={faviconProxyEnabled}
                onCheckedChange={(checked) => setFaviconProxyEnabled(checked === true)}
              />
              启用代理（抓取失败时自动获取图标）
            </label>

            <div className="mt-3 flex flex-col gap-2">
              <Label htmlFor="favicon-url">代理 URL 模板</Label>
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

            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setFaviconProxyUrl(preset.url)}
                >
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                    {preset.label}
                  </Badge>
                </button>
              ))}
            </div>
          </section>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>{error}</span>
            </div>
          ) : null}

          {saved ? (
            <div className="flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--verdigris)_25%,transparent)] bg-[color-mix(in_srgb,var(--verdigris)_10%,transparent)] px-3 py-2 text-xs">
              <Check className="size-3.5 text-[var(--verdigris)]" />
              设置已保存
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" onClick={onClose} variant="ghost">
              取消
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
