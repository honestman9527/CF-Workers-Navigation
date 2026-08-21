import type { AuthContext } from '@nav/features/auth/context';

import { Check, Settings, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';

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

function handleUnauthorized(auth: AuthContext, caught: unknown): boolean {
  if (caught instanceof ApiError && caught.status === 401) {
    void auth.logout();
    return true;
  }
  return false;
}

export function SettingsTab() {
  const auth = useAuthContext();
  const [faviconProxyUrl, setFaviconProxyUrl] = useState('');
  const [faviconProxyEnabled, setFaviconProxyEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProvider = PRESETS.find((preset) => preset.url === faviconProxyUrl)?.id ?? 'custom';

  useEffect(() => {
    let alive = true;
    api
      .getSettings()
      .then((data) => {
        if (!alive) return;
        setFaviconProxyUrl(data.faviconProxyUrl);
        setFaviconProxyEnabled(data.faviconProxyEnabled);
      })
      .catch((caught) => {
        if (handleUnauthorized(auth, caught)) return;
        if (alive) setError(caught instanceof ApiError ? caught.message : '加载设置失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings('', {
        faviconProxyUrl,
        faviconProxyEnabled,
      });
      pushToast('设置已保存', 'success');
    } catch (caught) {
      if (handleUnauthorized(auth, caught)) return;
      setError(caught instanceof ApiError ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          选择自动获取 favicon 的工具；元数据抓取仍会独立工作。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          加载中…
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
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
                  if (handleUnauthorized(auth, caught)) return;
                  setError(caught instanceof ApiError ? caught.message : '重置失败');
                }
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
    </div>
  );
}
