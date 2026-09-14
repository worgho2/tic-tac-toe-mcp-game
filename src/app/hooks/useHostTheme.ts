import type { App } from '@modelcontextprotocol/ext-apps';
import { useEffect } from 'react';

/** Mirrors the host theme onto `<html data-theme>` so the CSS variables in styles.css can react to it. */
export function useHostTheme(app: App | null, theme: string | undefined): void {
  useEffect(() => {
    const resolved = theme ?? app?.getHostContext()?.theme;
    if (resolved === 'dark' || resolved === 'light') {
      document.documentElement.dataset.theme = resolved;
    }
  }, [app, theme]);
}
