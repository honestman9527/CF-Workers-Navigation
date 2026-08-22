/**
 * Options page — 设置只需两类关键信息：连接与主题。
 * 业务字段走草稿，仅底部「保存更改」写入；保存后自动同步主机权限并测试连接。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  EyeOff as EyeClosed,
  Link as LinkSimple,
  LoaderCircle as CircleNotch,
  Plug,
  RefreshCw as ArrowsClockwise,
  Save as FloppyDisk,
  Sun,
} from "lucide-react";
import { getConfig, updateConfig, onConfigChange } from "@ext/shared/storage";
import { hasHostPermission, ensureHostPermission } from "@ext/shared/permissions";
import { api, ApiError } from "@ext/shared/api/client";
import type { ExtConfig } from "@ext/shared/config";

type PermissionStatus = "unknown" | "granted" | "denied" | "requesting";
type ConnectionTestStatus = "idle" | "testing" | "success" | "failed";

/** 与持久化配置同构的草稿，点保存才写入。 */
type FormDraft = {
  apiBaseUrl: string;
  adminToken: string;
  theme: 'light' | 'dark';
};

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return "";
  }
}

function draftFromConfig(cfg: ExtConfig): FormDraft {
  return {
    apiBaseUrl: cfg.apiBaseUrl,
    adminToken: cfg.adminToken,
    theme: cfg.theme,
  };
}

function draftsEqual(a: FormDraft, b: FormDraft): boolean {
  return a.apiBaseUrl === b.apiBaseUrl && a.adminToken === b.adminToken && a.theme === b.theme;
}

export default function App() {
  const [config, setConfigState] = useState<ExtConfig | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [permStatus, setPermStatus] = useState<PermissionStatus>("unknown");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionTestStatus>("idle");
  const [connectionMsg, setConnectionMsg] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [savedLabel, setSavedLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const dirtyRef = useRef(false);

  const showSaved = useCallback((msg = "已保存") => {
    setSavedLabel(msg);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedLabel(""), 2200);
  }, []);

  useEffect(() => {
    getConfig().then((cfg) => {
      setConfigState(cfg);
      setDraft(draftFromConfig(cfg));
      const origin = originOf(cfg.apiBaseUrl);
      if (origin) hasHostPermission(origin).then((ok) => setPermStatus(ok ? "granted" : "denied"));
    });
  }, []);

  useEffect(
    () =>
      onConfigChange((cfg) => {
        setConfigState(cfg);
        if (!dirtyRef.current) {
          setDraft(draftFromConfig(cfg));
        }
      }),
    []
  );

  const baseline = useMemo(() => (config ? draftFromConfig(config) : null), [config]);

  const isDirty = useMemo(() => {
    if (!draft || !baseline) return false;
    return !draftsEqual(draft, baseline);
  }, [draft, baseline]);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const patchDraft = useCallback((patch: Partial<FormDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const requestPermission = useCallback(async (url: string) => {
    const origin = originOf(url);
    if (!origin) return false;
    setPermStatus("requesting");
    const ok = await ensureHostPermission(origin);
    setPermStatus(ok ? "granted" : "denied");
    return ok;
  }, []);

  const testConnection = useCallback(async (apiBaseUrl: string, adminToken: string) => {
    if (!apiBaseUrl.trim()) {
      setConnectionStatus("idle");
      setConnectionMsg("");
      return;
    }
    setConnectionStatus("testing");
    setConnectionMsg("");
    try {
      await api.getBookmarks(apiBaseUrl.trim(), adminToken || undefined, { limit: 1 });
      setConnectionStatus("success");
      setConnectionMsg("连接成功，书签数据可读");
    } catch (e) {
      setConnectionStatus("failed");
      setConnectionMsg(e instanceof ApiError ? e.message : "连接失败");
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft || !config) return;
    setSaving(true);
    try {
      const next = await updateConfig({
        apiBaseUrl: draft.apiBaseUrl.trim(),
        adminToken: draft.adminToken,
        theme: draft.theme,
      });
      const savedDraft = draftFromConfig(next);
      setConfigState(next);
      setDraft(savedDraft);
      dirtyRef.current = false;
      showSaved("已保存");

      const origin = originOf(next.apiBaseUrl);
      if (origin) {
        const granted = await hasHostPermission(origin);
        if (!granted) {
          await requestPermission(next.apiBaseUrl);
        } else {
          setPermStatus("granted");
        }
      } else {
        setPermStatus("unknown");
      }

      if (next.apiBaseUrl) {
        await testConnection(next.apiBaseUrl, next.adminToken);
      } else {
        setConnectionStatus("idle");
        setConnectionMsg("");
      }
    } finally {
      setSaving(false);
    }
  }, [draft, config, showSaved, requestPermission, testConnection]);

  const handleResetDraft = useCallback(() => {
    if (!config) return;
    setDraft(draftFromConfig(config));
    dirtyRef.current = false;
  }, [config]);

  if (!config || !draft || !baseline) {
    return (
      <div className="shell-loading">
        <CircleNotch className="h-6 w-6 animate-spin text-[rgb(var(--accent))]" />
      </div>
    );
  }

  const apiOrigin = originOf(draft.apiBaseUrl);

  const connectionDot =
    connectionStatus === "success"
      ? "status-dot-ok"
      : connectionStatus === "failed"
        ? "status-dot-fail"
        : connectionStatus === "testing"
          ? "status-dot-warn"
          : "status-dot-idle";

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-row">
          <div>
            <p className="shell-kicker">
              <LinkSimple className="h-3.5 w-3.5" />
              Nav Extension
            </p>
            <h1 className="shell-title">设置</h1>
            <div className="shift-track" aria-hidden />
            <p className="shell-lead">
              配置 API 地址与管理员密码，Popup 与右键菜单将使用该连接。
            </p>
          </div>
          <div className="shell-header-meta">
            {savedLabel ? (
              <span className="toast-pill animate-fade-in">{savedLabel}</span>
            ) : null}
            <span className={`dirty-chip ${isDirty ? "is-on" : ""}`}>
              {isDirty ? "有未保存的修改" : "已与已保存配置同步"}
            </span>
          </div>
        </div>
      </header>

      <div className="shell-body">
        {/* 连接 */}
        <section className="module-card">
          <div className="module-head">
            <div>
              <h2 className="module-title">
                <Plug className="h-4 w-4 text-[var(--lacquer)]" />
                连接
              </h2>
              <p className="module-desc">
                后端 API 与管理员密码。下方连通性测试基于<strong>已保存</strong>配置，改完请先保存再测。
              </p>
            </div>
          </div>

          <div className="module-grid">
            <div className="field-block">
              <label className="field-label" htmlFor="opt-api">
                API 地址
              </label>
              <div className="field-row">
                <input
                  id="opt-api"
                  className={`input flex-1 ${
                    draft.apiBaseUrl !== baseline.apiBaseUrl ? "input-dirty" : ""
                  }`}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://your-nav-server.com"
                  value={draft.apiBaseUrl}
                  onChange={(e) => patchDraft({ apiBaseUrl: e.target.value })}
                />
                {apiOrigin ? (
                  <button
                    type="button"
                    className={`btn-perm ${
                      permStatus === "granted"
                        ? "btn-perm-granted"
                        : permStatus === "requesting"
                          ? "btn-perm-pending"
                          : "btn-perm-denied"
                    }`}
                    onClick={() => requestPermission(draft.apiBaseUrl)}
                    disabled={permStatus === "requesting" || permStatus === "granted"}
                    title="向浏览器申请访问该主机的权限"
                  >
                    {permStatus === "granted"
                      ? "已授权"
                      : permStatus === "requesting"
                        ? "请求中…"
                        : "未授权"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="field-block">
              <label className="field-label" htmlFor="opt-token">
                管理员密码
              </label>
              <div className="relative">
                <input
                  id="opt-token"
                  className={`input w-full pr-10 ${
                    draft.adminToken !== baseline.adminToken ? "input-dirty" : ""
                  }`}
                  type={showToken ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Bearer token"
                  value={draft.adminToken}
                  onChange={(e) => patchDraft({ adminToken: e.target.value })}
                />
                <button
                  type="button"
                  className="field-eye"
                  onClick={() => setShowToken(!showToken)}
                  tabIndex={-1}
                  aria-label={showToken ? "隐藏密码" : "显示密码"}
                >
                  {showToken ? <EyeClosed className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="connection-diagnose">
            <div className="connection-diagnose-head">
              <h3 className="connection-diagnose-title">
                <ArrowsClockwise className="h-3.5 w-3.5" />
                连通性测试
              </h3>
              <p className="connection-diagnose-desc">读取已保存的 API 与密码，不使用上方未保存草稿。</p>
            </div>
            <div className="status-list">
              <div className="status-row">
                <span className="status-key">已保存 API</span>
                <span className="status-val mono">{config.apiBaseUrl || "未配置"}</span>
              </div>
              <div className="status-row">
                <span className="status-key">主机权限</span>
                <span
                  className={
                    permStatus === "granted"
                      ? "text-[var(--verdigris)]"
                      : permStatus === "requesting"
                        ? "text-amber-400"
                        : "text-[var(--destructive)]"
                  }
                >
                  {permStatus === "granted"
                    ? "已授权"
                    : permStatus === "requesting"
                      ? "请求中"
                      : "未授权"}
                </span>
              </div>
              <div className="status-row">
                <span className="status-key">连通性</span>
                <span className="inline-flex items-center gap-2">
                  <span className={`status-dot ${connectionDot}`} />
                  <span
                    className={
                      connectionStatus === "success"
                        ? "text-[var(--verdigris)]"
                        : connectionStatus === "failed"
                          ? "text-[var(--destructive)]"
                          : connectionStatus === "testing"
                            ? "text-amber-400"
                            : "text-[var(--text-tertiary)]"
                    }
                  >
                    {connectionStatus === "success"
                      ? "已连接"
                      : connectionStatus === "failed"
                        ? "连接失败"
                        : connectionStatus === "testing"
                          ? "测试中…"
                          : "未测试"}
                  </span>
                </span>
              </div>
              {connectionMsg ? <div className="status-msg">{connectionMsg}</div> : null}
              <button
                type="button"
                className="btn-secondary mt-1 w-full text-sm"
                onClick={() => testConnection(config.apiBaseUrl, config.adminToken)}
                disabled={!config.apiBaseUrl}
              >
                测试已保存配置
              </button>
            </div>
          </div>
        </section>

        {/* 界面主题 */}
        <section className="module-card">
          <div className="module-head">
            <div>
              <h2 className="module-title">
                <Sun className="h-4 w-4 text-[var(--lacquer)]" />
                界面主题
              </h2>
              <p className="module-desc">Popup 与设置页共用此偏好。</p>
            </div>
          </div>
          <div className="seg max-w-60" role="group" aria-label="界面主题">
            {(['light', 'dark'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`seg-item ${draft.theme === value ? 'is-active' : ''}`}
                onClick={() => patchDraft({ theme: value })}
                aria-pressed={draft.theme === value}
              >
                {value === 'light' ? '亮色' : '暗色'}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="save-bar">
        <div className={`save-bar-inner ${isDirty ? "is-dirty" : ""}`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {isDirty ? "有未保存的修改" : "配置已是最新"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {isDirty
                ? "连接与主题将一并写入"
                : "在上方模块调整后，点右侧按钮保存全部"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isDirty ? (
              <button type="button" className="btn-secondary text-sm" onClick={handleResetDraft}>
                撤销全部
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={!isDirty || saving}
              onClick={handleSave}
            >
              {saving ? (
                <CircleNotch className="h-4 w-4 animate-spin" />
              ) : (
                <FloppyDisk className="h-4 w-4" />
              )}
              {saving ? "保存中…" : "保存更改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}