import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "./config";
import { isCacheFresh, mergeConfig, mergeRecentItems } from "./storage";

describe("extension storage rules", () => {
  it("merges a partial config without dropping nested defaults", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { openInNewTab: true });

    expect(merged.openInNewTab).toBe(true);
    expect(merged.background).toEqual(DEFAULT_CONFIG.background);
    expect(merged.searchEngines).toEqual(DEFAULT_CONFIG.searchEngines);
  });

  it("reuses cache only for the same API and token within the freshness window", () => {
    const cache = {
      data: [],
      ts: 1_000,
      apiBaseUrl: "https://nav.example.com",
      authToken: "secret",
    };

    expect(isCacheFresh(cache, "https://nav.example.com", "secret", 60_999)).toBe(true);
    expect(isCacheFresh(cache, "https://nav.example.com", "secret", 61_000)).toBe(false);
    expect(isCacheFresh(cache, "https://nav.example.com", "changed", 1_001)).toBe(false);
    expect(isCacheFresh(cache, "https://other.example.com", "secret", 1_001)).toBe(false);
  });

  it("deduplicates recent links and pins the newest entry", () => {
    const result = mergeRecentItems(
      [
        { title: "Old", url: "https://example.com", ts: 1 },
        { title: "Other", url: "https://other.example.com", ts: 2 },
      ],
      { title: "New", url: "https://example.com" },
      3,
    );

    expect(result).toEqual([
      { title: "New", url: "https://example.com", iconUrl: null, ts: 3, id: undefined },
      { title: "Other", url: "https://other.example.com", ts: 2 },
    ]);
  });
});
