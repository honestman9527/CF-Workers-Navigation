import { useState, useRef, useEffect } from "react";
import type { SearchEngine } from "@ext/shared/config";
import { faviconFor, domainOf } from "@ext/shared/config";

type EngineSwitcherProps = {
  engines: SearchEngine[];
  activeEngineId: string;
  onChange: (id: string) => void;
};

export default function EngineSwitcher({ engines, activeEngineId, onChange }: EngineSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = engines.find((e) => e.id === activeEngineId) ?? engines[0];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
      >
        {active && (
          <img
            src={faviconFor(domainOf(active.url))}
            alt=""
            className="h-4 w-4 rounded"
            onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")}
          />
        )}
        <span className="font-medium">{active?.name}</span>
      </button>

      {open && (
          <div className="glass-panel animate-newtab-enter absolute right-0 top-full z-50 mt-2 min-w-44 overflow-hidden rounded-xl py-1">
            {engines.map((engine) => (
              <button
                key={engine.id}
                onClick={() => {
                  onChange(engine.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-muted)] ${
                  engine.id === activeEngineId
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                <img
                  src={faviconFor(domainOf(engine.url))}
                  alt=""
                  className="h-4 w-4 rounded"
                  onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")}
                />
                <span className="font-medium">{engine.name}</span>
                {engine.id === activeEngineId && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--cobalt)]" />
                )}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
