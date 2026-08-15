import { describe, expect, it, vi } from "vitest";

import { createLinkOpener, type NavigationAdapter } from "./navigation";

describe("link navigation", () => {
  it("uses the current tab by default", () => {
    const adapter: NavigationAdapter = {
      assign: vi.fn(),
      openInNewTab: vi.fn(),
    };

    createLinkOpener(adapter)("https://example.com", { openInNewTab: false });

    expect(adapter.assign).toHaveBeenCalledWith("https://example.com");
    expect(adapter.openInNewTab).not.toHaveBeenCalled();
  });

  it("uses the new-tab adapter when configured or forced", () => {
    const adapter: NavigationAdapter = {
      assign: vi.fn(),
      openInNewTab: vi.fn(),
    };
    const open = createLinkOpener(adapter);

    open("https://example.com/configured", { openInNewTab: true });
    open("https://example.com/forced", { openInNewTab: false, forceNewTab: true });

    expect(adapter.openInNewTab).toHaveBeenNthCalledWith(1, "https://example.com/configured");
    expect(adapter.openInNewTab).toHaveBeenNthCalledWith(2, "https://example.com/forced");
    expect(adapter.assign).not.toHaveBeenCalled();
  });
});
