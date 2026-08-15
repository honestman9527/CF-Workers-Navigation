export type OpenLinkOptions = {
  openInNewTab: boolean;
  forceNewTab?: boolean;
};

export type NavigationAdapter = {
  assign(url: string): void;
  openInNewTab(url: string): void;
};

export function createLinkOpener(adapter: NavigationAdapter) {
  return (url: string, options: OpenLinkOptions): void => {
    if (options.forceNewTab || options.openInNewTab) {
      adapter.openInNewTab(url);
      return;
    }
    adapter.assign(url);
  };
}

const browserNavigation: NavigationAdapter = {
  assign: (url) => window.location.assign(url),
  openInNewTab: (url) => window.open(url, "_blank", "noopener,noreferrer"),
};

export const openLink = createLinkOpener(browserNavigation);
