/**
 * Options page — 模块化设置台。
 * 业务字段走草稿，仅底部「保存更改」写入；主题偏好立即保存。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindow as Browser,
  Check,
  CircleX as XCircle,
  Eye,
  EyeOff as EyeClosed,
  Image as ImageIcon,
  Link as LinkSimple,
  LoaderCircle as CircleNotch,
  Pencil as PencilSimple,
  Plug,
  Plus,
  RefreshCw as ArrowsClockwise,
  Save as FloppyDisk,
  Search as MagnifyingGlass,
  Trash2 as Trash,
  Upload,
  X,
} from "lucide-react";
import {
  getConfig,
  updateConfig,
  onConfigChange,
  getBackgroundImage,
  setBackgroundImage,
  clearBackgroundImage,
} from "@ext/shared/storage";
import { hasHostPermission, ensureHostPermission } from "@ext/shared/permissions";
import { api, ApiError } from "@ext/shared/api/client";
import type {
  ExtConfig,
  SearchEngine,
  BackgroundConfig,
  EnterBehavior,
  ClockDensity,
} from "@ext/shared/config";

type PermissionStatus = "unknown" | "granted" | "denied" | "requesting";
type ConnectionTestStatus = "idle" | "testing" | "success" | "failed";

/** 选项页完整草稿：与持久化配置同构，点保存才写入。 */
type FormDraft = {
  apiBaseUrl: string;
  adminToken: string;
  theme: 'light' | 'dark';
  background: BackgroundConfig;
  searchEngines: SearchEngine[];
  defaultEngineId: string;
  openInNewTab: boolean;
  enterBehavior: EnterBehavior;
  rememberLastEngine: boolean;
  clockDensity: ClockDensity;
};

type SectionId = "connection" | "engines" | "appearance" | "behavior";

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  hint: string;
  icon: typeof Plug;
}> = [
  { id: "connection", label: "连接", hint: "API 与诊断", icon: Plug },
  { id: "engines", label: "搜索", hint: "引擎与默认", icon: MagnifyingGlass },
  { id: "appearance", label: "外观", hint: "主题与背景", icon: ImageIcon },
  { id: "behavior", label: "行为", hint: "打开与时钟", icon: Browser },
];

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return "";
  }
}

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function draftFromConfig(cfg: ExtConfig): FormDraft {
  return {
    apiBaseUrl: cfg.apiBaseUrl,
    adminToken: cfg.adminToken,
    theme: cfg.theme,
    background: { ...cfg.background },
    searchEngines: cfg.searchEngines.map((engine) => ({ ...engine })),
    defaultEngineId: cfg.defaultEngineId,
    openInNewTab: cfg.openInNewTab,
    enterBehavior: cfg.enterBehavior,
    rememberLastEngine: cfg.rememberLastEngine,
    clockDensity: cfg.clockDensity,
  };
}

function enginesEqual(a: SearchEngine[], b: SearchEngine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (engine, index) =>
      engine.id === b[index]?.id &&
      engine.name === b[index]?.name &&
      engine.url === b[index]?.url &&
      engine.builtin === b[index]?.builtin &&
      (engine.iconUrl ?? "") === (b[index]?.iconUrl ?? "")
  );
}

function draftsEqual(a: FormDraft, b: FormDraft): boolean {
  return (
    a.apiBaseUrl === b.apiBaseUrl &&
    a.adminToken === b.adminToken &&
    a.theme === b.theme &&
    a.defaultEngineId === b.defaultEngineId &&
    a.openInNewTab === b.openInNewTab &&
    a.enterBehavior === b.enterBehavior &&
    a.rememberLastEngine === b.rememberLastEngine &&
    a.clockDensity === b.clockDensity &&
    a.background.type === b.background.type &&
    a.background.url === b.background.url &&
    a.background.blur === b.background.blur &&
    a.background.dim === b.background.dim &&
    enginesEqual(a.searchEngines, b.searchEngines)
  );
}

function sectionDirty(
  section: SectionId,
  draft: FormDraft,
  baseline: FormDraft
): boolean {
  switch (section) {
    case "connection":
      return draft.apiBaseUrl !== baseline.apiBaseUrl || draft.adminToken !== baseline.adminToken;
    case "engines":
      return (
        draft.defaultEngineId !== baseline.defaultEngineId ||
        !enginesEqual(draft.searchEngines, baseline.searchEngines)
      );
    case "appearance":
      return (
        draft.theme !== baseline.theme ||
        draft.background.type !== baseline.background.type ||
        draft.background.url !== baseline.background.url ||
        draft.background.blur !== baseline.background.blur ||
        draft.background.dim !== baseline.background.dim
      );
    case "behavior":
      return (
        draft.openInNewTab !== baseline.openInNewTab ||
        draft.enterBehavior !== baseline.enterBehavior ||
        draft.rememberLastEngine !== baseline.rememberLastEngine ||
        draft.clockDensity !== baseline.clockDensity
      );
  }
}

export default function App() {
  const [config, setConfigState] = useState<ExtConfig | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("connection");
  const [permStatus, setPermStatus] = useState<PermissionStatus>("unknown");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionTestStatus>("idle");
  const [connectionMsg, setConnectionMsg] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [editingEngine, setEditingEngine] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [addingEngine, setAddingEngine] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [savedLabel, setSavedLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef(false);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

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
    getBackgroundImage().then(setUploadedImage);
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

  // 滚动时同步侧栏高亮
  useEffect(() => {
    const nodes = SECTIONS.map((section) => sectionRefs.current[section.id]).filter(
      (node): node is HTMLElement => Boolean(node)
    );
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.getAttribute("data-section") as SectionId | null;
        if (top) setActiveSection(top);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.4, 0.7] }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [config, draft]);

  const patchDraft = useCallback((patch: Partial<FormDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const patchDraftBg = useCallback((patch: Partial<BackgroundConfig>) => {
    setDraft((current) =>
      current ? { ...current, background: { ...current.background, ...patch } } : current
    );
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
      await api.getCategories(apiBaseUrl.trim(), adminToken || undefined);
      setConnectionStatus("success");
      setConnectionMsg("连接成功，分类数据可读");
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
        searchEngines: draft.searchEngines,
        defaultEngineId: draft.defaultEngineId,
        openInNewTab: draft.openInNewTab,
        enterBehavior: draft.enterBehavior,
        rememberLastEngine: draft.rememberLastEngine,
        clockDensity: draft.clockDensity,
        background: {
          ...draft.background,
          url: draft.background.url.trim(),
        },
      });
      const savedDraft = draftFromConfig(next);
      setConfigState(next);
      setDraft(savedDraft);
      dirtyRef.current = false;
      setEditingEngine(null);
      setAddingEngine(false);
      showSaved("全部更改已保存");

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
    setEditingEngine(null);
    setAddingEngine(false);
    setAddName("");
    setAddUrl("");
  }, [config]);

  const handleSetDefault = useCallback((id: string) => {
    patchDraft({ defaultEngineId: id });
  }, [patchDraft]);

  const handleDeleteEngine = useCallback(
    (id: string) => {
      if (!draft) return;
      const engines = draft.searchEngines.filter((e) => e.id !== id);
      const patch: Partial<FormDraft> = { searchEngines: engines };
      if (draft.defaultEngineId === id) patch.defaultEngineId = engines[0]?.id ?? "google";
      patchDraft(patch);
    },
    [draft, patchDraft]
  );

  const handleSaveEdit = useCallback(
    (id: string) => {
      if (!draft || !editName.trim() || !editUrl.trim()) return;
      const engines = draft.searchEngines.map((e) =>
        e.id === id ? { ...e, name: editName.trim(), url: editUrl.trim() } : e
      );
      patchDraft({ searchEngines: engines });
      setEditingEngine(null);
    },
    [draft, editName, editUrl, patchDraft]
  );

  const handleAddEngine = useCallback(() => {
    if (!draft || !addName.trim() || !addUrl.trim()) return;
    const engine: SearchEngine = {
      id: generateId(),
      name: addName.trim(),
      url: addUrl.trim(),
      builtin: false,
    };
    patchDraft({ searchEngines: [...draft.searchEngines, engine] });
    setAddingEngine(false);
    setAddName("");
    setAddUrl("");
  }, [draft, addName, addUrl, patchDraft]);

  const handleBgTypeChange = useCallback(
    (type: BackgroundConfig["type"]) => {
      patchDraftBg({ type });
    },
    [patchDraftBg]
  );

  const handleFileUpload = useCallback(
    (file: File) => {
      setUploadError("");
      if (!file.type.startsWith("image/")) {
        setUploadError("请选择图片文件");
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          // 大图走 local 存储，立即暂存；背景类型等偏好仍需点保存
          await setBackgroundImage(dataUrl);
          setUploadedImage(dataUrl);
          setDraft((current) => {
            if (!current) return current;
            if (current.background.type === "url") {
              return current;
            }
            return {
              ...current,
              background: {
                ...current.background,
                type: "upload",
              },
            };
          });
          showSaved(
            draft?.background.type === "url"
              ? "离线回退图已暂存"
              : "图片已暂存，请点保存应用背景设置"
          );
        } catch (e) {
          setUploadError(e instanceof Error ? e.message : "上传失败");
        }
      };
      reader.onerror = () => setUploadError("读取文件失败");
      reader.readAsDataURL(file);
    },
    [showSaved, draft?.background.type]
  );

  const handleClearUpload = useCallback(() => {
    clearBackgroundImage().catch(() => {});
    setUploadedImage(null);
    setDraft((current) =>
      current && current.background.type === "upload"
        ? { ...current, background: { ...current.background, type: "none" } }
        : current
    );
  }, []);

  const scrollToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!config || !draft || !baseline) {
    return (
      <div className="shell-loading">
        <CircleNotch className="h-6 w-6 animate-spin text-[rgb(var(--accent))]" />
      </div>
    );
  }

  const apiOrigin = originOf(draft.apiBaseUrl);
  const bgPreviewUrl =
    draft.background.type === "url"
      ? draft.background.url
      : draft.background.type === "upload" && uploadedImage
        ? uploadedImage
        : "";

  const connectionDot =
    connectionStatus === "success"
      ? "status-dot-ok"
      : connectionStatus === "failed"
        ? "status-dot-fail"
        : connectionStatus === "testing"
          ? "status-dot-warn"
          : "status-dot-idle";

  const dirtyCount = SECTIONS.filter((s) => sectionDirty(s.id, draft, baseline)).length;

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
              按模块调整连接、搜索、外观与行为。确认后点击底部保存更改生效。
            </p>
          </div>
          <div className="shell-header-meta">
            {savedLabel ? (
              <span className="toast-pill animate-fade-in">{savedLabel}</span>
            ) : null}
            <span className={`dirty-chip ${isDirty ? "is-on" : ""}`}>
              {isDirty ? `${dirtyCount} 个模块待保存` : "已与已保存配置同步"}
            </span>
          </div>
        </div>
      </header>

      <div className="shell-body">
        <nav className="module-nav" aria-label="设置模块">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const dirty = sectionDirty(section.id, draft, baseline);
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                className={`module-nav-item ${active ? "is-active" : ""} ${dirty ? "is-dirty" : ""}`}
                onClick={() => scrollToSection(section.id)}
              >
                <span className="module-nav-icon">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="module-nav-text">
                  <span className="module-nav-label">{section.label}</span>
                  <span className="module-nav-hint">{section.hint}</span>
                </span>
                {dirty ? <span className="module-nav-dot" aria-hidden /> : null}
              </button>
            );
          })}
        </nav>

        <main className="module-stack">
          {/* 连接 */}
          <section
            className="module-card"
            data-section="connection"
            ref={(node) => {
              sectionRefs.current.connection = node;
            }}
          >
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
              {sectionDirty("connection", draft, baseline) ? (
                <span className="module-dirty-badge">未保存</span>
              ) : null}
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

          {/* 搜索引擎 */}
          <section
            className="module-card"
            data-section="engines"
            ref={(node) => {
              sectionRefs.current.engines = node;
            }}
          >
            <div className="module-head">
              <div>
                <h2 className="module-title">
                  <MagnifyingGlass className="h-4 w-4 text-[var(--lacquer)]" />
                  搜索引擎
                </h2>
                <p className="module-desc">
                  默认引擎与自定义源。列表改动仅在草稿中，保存后才生效。支持{" "}
                  <code className="inline-code">!g</code> bang。
                </p>
              </div>
              {sectionDirty("engines", draft, baseline) ? (
                <span className="module-dirty-badge">未保存</span>
              ) : null}
            </div>

            <div className="engine-list">
              {draft.searchEngines.map((engine) => (
                <div
                  key={engine.id}
                  className={`engine-row ${
                    engine.id === draft.defaultEngineId ? "is-default" : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`engine-radio ${
                      engine.id === draft.defaultEngineId ? "is-on" : ""
                    }`}
                    onClick={() => handleSetDefault(engine.id)}
                    title="设为默认"
                    aria-label={`将 ${engine.name} 设为默认`}
                  >
                    {engine.id === draft.defaultEngineId ? (
                      <span className="engine-radio-dot" />
                    ) : null}
                  </button>

                  <div className="min-w-0 flex-1">
                    {editingEngine === engine.id ? (
                      <div className="engine-edit">
                        <input
                          className="input py-1.5 text-sm"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="名称"
                        />
                        <input
                          className="input py-1.5 font-mono text-sm"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          placeholder="https://example.com/search?q={query}"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="engine-name-row">
                          <span className="engine-name">{engine.name}</span>
                          {engine.builtin ? <span className="chip">内置</span> : null}
                          {engine.id === draft.defaultEngineId ? (
                            <span className="chip chip-accent">默认</span>
                          ) : null}
                        </div>
                        <div className="engine-url">{engine.url}</div>
                      </>
                    )}
                  </div>

                  <div className="engine-actions">
                    {editingEngine === engine.id ? (
                      <>
                        <button
                          type="button"
                          className="btn-icon text-[var(--verdigris)] hover:bg-[color-mix(in_srgb,var(--verdigris)_10%,transparent)]"
                          onClick={() => handleSaveEdit(engine.id)}
                          aria-label="确认编辑"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon text-[var(--text-tertiary)] hover:bg-[var(--bg-muted)]"
                          onClick={() => setEditingEngine(null)}
                          aria-label="取消编辑"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-icon text-[var(--text-tertiary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
                          onClick={() => {
                            setEditingEngine(engine.id);
                            setEditName(engine.name);
                            setEditUrl(engine.url);
                          }}
                          aria-label={`编辑 ${engine.name}`}
                        >
                          <PencilSimple className="h-4 w-4" />
                        </button>
                        {!engine.builtin ? (
                          <button
                            type="button"
                            className="btn-icon text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] text-[var(--destructive)]"
                            onClick={() => handleDeleteEngine(engine.id)}
                            aria-label={`删除 ${engine.name}`}
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {addingEngine ? (
              <div className="engine-add">
                <input
                  className="input py-1.5 text-sm"
                  placeholder="名称"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
                <input
                  className="input py-1.5 font-mono text-sm"
                  placeholder="https://example.com/search?q={query}"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="button" className="btn-primary text-sm" onClick={handleAddEngine}>
                    加入草稿
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={() => {
                      setAddingEngine(false);
                      setAddName("");
                      setAddUrl("");
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary mt-3 w-full text-sm"
                onClick={() => setAddingEngine(true)}
              >
                <Plus className="h-4 w-4" />
                添加搜索引擎
              </button>
            )}
          </section>

          {/* 外观 / 背景 */}
          <section
            className="module-card"
            data-section="appearance"
            ref={(node) => {
              sectionRefs.current.appearance = node;
            }}
          >
            <div className="theme-setting">
              <div>
                <div className="module-title">界面主题</div>
                <p className="module-desc">新标签页、设置页与 popup 共用此偏好。</p>
              </div>
              <div className="seg" role="group" aria-label="界面主题">
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
            </div>

            <div className="module-head">
              <div>
                <h2 className="module-title">
                  <ImageIcon className="h-4 w-4 text-[var(--lacquer)]" />
                  新标签页背景
                </h2>
                <p className="module-desc">
                  类型、模糊与遮罩随保存写入。网络图失败时可回退到本地上传图（图片文件会先暂存到本机）。
                </p>
              </div>
              {sectionDirty("appearance", draft, baseline) ? (
                <span className="module-dirty-badge">未保存</span>
              ) : null}
            </div>

            <div className="seg mb-4">
              {(
                [
                  ["none", "无背景"],
                  ["url", "网络图片"],
                  ["upload", "本地上传"],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  className={`seg-item ${draft.background.type === t ? "is-active" : ""}`}
                  onClick={() => handleBgTypeChange(t)}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = "";
              }}
            />

            {draft.background.type === "url" ? (
              <div className="mb-3 space-y-3">
                <div className="field-block">
                  <label className="field-label" htmlFor="opt-bg-url">
                    图片 URL
                  </label>
                  <input
                    id="opt-bg-url"
                    className={`input w-full font-mono text-sm ${
                      draft.background.url !== baseline.background.url ? "input-dirty" : ""
                    }`}
                    type="url"
                    placeholder="https://example.com/wallpaper.jpg"
                    value={draft.background.url}
                    onChange={(e) => patchDraftBg({ url: e.target.value })}
                  />
                </div>

                <div className="inset-panel">
                  <p className="text-sm font-medium text-[var(--text-primary)]">离线回退图</p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                    URL 加载失败或超时（约 8s）时自动改用此本地图。
                  </p>
                  {uploadedImage ? (
                    <div className="preview-frame mt-2">
                      <img src={uploadedImage} alt="离线回退预览" className="preview-img" />
                      <button
                        type="button"
                        className="preview-clear"
                        onClick={handleClearUpload}
                        title="移除回退图"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary mt-2 w-full py-3 text-sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      上传离线回退图
                    </button>
                  )}
                  {uploadError ? <div className="mt-2 text-xs text-[var(--destructive)]">{uploadError}</div> : null}
                </div>
              </div>
            ) : null}

            {draft.background.type === "upload" ? (
              <div className="mb-3">
                {uploadedImage ? (
                  <div className="preview-frame">
                    <img src={uploadedImage} alt="背景预览" className="preview-img h-32" />
                    <button
                      type="button"
                      className="preview-clear"
                      onClick={handleClearUpload}
                      title="移除"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary w-full py-6 text-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    选择图片上传
                  </button>
                )}
                {uploadError ? <div className="mt-2 text-xs text-[var(--destructive)]">{uploadError}</div> : null}
              </div>
            ) : null}

            {draft.background.type !== "none" ? (
              <div className="space-y-3">
                <div>
                  <div className="slider-meta">
                    <span>模糊度</span>
                    <span className="tabular-nums">{draft.background.blur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={draft.background.blur}
                    className="w-full"
                    onChange={(e) => patchDraftBg({ blur: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="slider-meta">
                    <span>遮罩强度</span>
                    <span className="tabular-nums">{Math.round(draft.background.dim * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.85}
                    step={0.05}
                    value={draft.background.dim}
                    className="w-full"
                    onChange={(e) => patchDraftBg({ dim: Number(e.target.value) })}
                  />
                </div>
                {bgPreviewUrl ? (
                  <div className="preview-frame">
                    <div
                      className="relative h-28 w-full overflow-hidden"
                      style={{
                        backgroundImage: `url("${bgPreviewUrl}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        filter: `blur(${draft.background.blur}px)`,
                      }}
                    >
                      <div
                        className="absolute inset-0 bg-black"
                        style={{ opacity: draft.background.dim }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* 行为 */}
          <section
            className="module-card"
            data-section="behavior"
            ref={(node) => {
              sectionRefs.current.behavior = node;
            }}
          >
            <div className="module-head">
              <div>
                <h2 className="module-title">
                  <Browser className="h-4 w-4 text-[var(--lacquer)]" />
                  新标签页行为
                </h2>
                <p className="module-desc">打开方式、回车策略、引擎记忆与时钟密度。改完后需保存。</p>
              </div>
              {sectionDirty("behavior", draft, baseline) ? (
                <span className="module-dirty-badge">未保存</span>
              ) : null}
            </div>

            <div className="pref-stack">
              <label className="pref-row">
                <span className="pref-copy">
                  <span className="pref-title">在新标签打开链接</span>
                  <span className="pref-desc">
                    默认关闭：在当前新标签页内跳转。按住 Ctrl/⌘ 点击仍会新开。
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="pref-check"
                  checked={draft.openInNewTab}
                  onChange={(e) => patchDraft({ openInNewTab: e.target.checked })}
                />
              </label>

              <label className="pref-row">
                <span className="pref-copy">
                  <span className="pref-title">记住上次搜索引擎</span>
                  <span className="pref-desc">
                    切换引擎后下次打开沿用；关闭则始终使用「默认」引擎。
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="pref-check"
                  checked={draft.rememberLastEngine}
                  onChange={(e) => patchDraft({ rememberLastEngine: e.target.checked })}
                />
              </label>

              <div className="pref-block">
                <p className="pref-title">回车默认行为</p>
                <p className="pref-desc">无键盘高亮时 Enter 的动作；Ctrl/⌘+Enter 始终网页搜索。</p>
                <div className="choice-grid">
                  {(
                    [
                      { id: "bookmark" as EnterBehavior, label: "优先书签", desc: "有结果则打开第一条" },
                      { id: "web" as EnterBehavior, label: "网页搜索", desc: "始终用当前引擎" },
                    ] as const
                  ).map((opt) => {
                    const active = draft.enterBehavior === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => patchDraft({ enterBehavior: opt.id })}
                        className={`choice-card ${active ? "is-active" : ""}`}
                      >
                        <span className="choice-label">{opt.label}</span>
                        <span className="choice-desc">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pref-block">
                <p className="pref-title">时钟密度</p>
                <p className="pref-desc">完整含问候语；紧凑仅时间与日期；隐藏则只留搜索区。</p>
                <div className="choice-grid choice-grid-3">
                  {(
                    [
                      { id: "full" as ClockDensity, label: "完整", desc: "问候 + 大时钟" },
                      { id: "compact" as ClockDensity, label: "紧凑", desc: "小时钟 + 日期" },
                      { id: "hidden" as ClockDensity, label: "隐藏", desc: "不显示时钟" },
                    ] as const
                  ).map((opt) => {
                    const active = draft.clockDensity === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => patchDraft({ clockDensity: opt.id })}
                        className={`choice-card ${active ? "is-active" : ""}`}
                      >
                        <span className="choice-label">{opt.label}</span>
                        <span className="choice-desc">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <div className="save-bar">
        <div className={`save-bar-inner ${isDirty ? "is-dirty" : ""}`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {isDirty ? "有未保存的修改" : "配置已是最新"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {isDirty
                ? "连接、搜索、外观与行为将一并写入"
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
