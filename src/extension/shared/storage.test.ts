import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "./config";
import { mergeConfig } from "./storage";

describe("extension storage rules", () => {
  it("merges a partial config without dropping defaults", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { apiBaseUrl: "https://nav.example.com" });

    expect(merged.apiBaseUrl).toBe("https://nav.example.com");
    expect(merged.theme).toBe(DEFAULT_CONFIG.theme);
    expect(merged.adminToken).toBe(DEFAULT_CONFIG.adminToken);
  });

  it("ignores unknown fields from older stored configs", () => {
    const stored = mergeConfig(DEFAULT_CONFIG, {
      apiBaseUrl: "https://nav.example.com",
      // @ts-expect-error 旧版新标签页字段，现已被移除，不应进入结果
      searchEngines: [{ id: "google", name: "Google", url: "https://www.google.com/search?q={query}", builtin: true }],
    });

    expect(stored).toEqual({
      apiBaseUrl: "https://nav.example.com",
      adminToken: "",
      theme: "dark",
    });
  });

  it("keeps the base theme when the patch theme is invalid", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { theme: "sepia" as "light" | "dark" });

    expect(merged.theme).toBe(DEFAULT_CONFIG.theme);
  });
});