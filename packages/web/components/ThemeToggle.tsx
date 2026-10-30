'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'mayall-theme';

export function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — the session simply keeps the in-memory theme */
  }
}

/**
 * Theme switch. Dark is the default world ("the red room"); light is the
 * paper world ("the paper room"). The choice persists in localStorage.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'dark';
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  const label = theme === 'dark' ? 'Switch to the paper room (light theme)' : 'Switch to the red room (dark theme)';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`btn btn-ghost h-9 w-9 !min-h-0 !p-0 ${className}`}
    >
      {mounted && theme === 'light' ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
