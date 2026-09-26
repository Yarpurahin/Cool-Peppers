import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
export type ThemePreference = 'system' | 'light' | 'dark';
const key = 'arena:theme';
const readPreference = (): ThemePreference => {
  try {
    const value = localStorage.getItem(key);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const applyTheme = (preference: ThemePreference, dark: boolean) => {
  document.documentElement.dataset.theme =
    preference === 'system' ? (dark ? 'dark' : 'light') : preference;
};
// Runs before React's first paint, including on direct links to the editor and errors.
applyTheme(readPreference(), systemDark());
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readPreference);
  const [dark, setDark] = useState(systemDark);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setDark(media.matches);
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setPreference(readPreference());
    };
    media.addEventListener('change', change);
    window.addEventListener('storage', storage);
    return () => {
      media.removeEventListener('change', change);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => applyTheme(preference, dark), [preference, dark]);
  return (
    <ThemeContext.Provider
      value={{
        preference,
        setPreference: (value) => {
          setPreference(value);
          applyTheme(value, dark);
          try {
            localStorage.setItem(key, value);
          } catch {
            /* Works for this tab without storage. */
          }
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeToggle() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required');
  return (
    <label className="theme-toggle">
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
      </svg>
      <span className="sr-only">Тема оформления</span>
      <select
        aria-label="Тема оформления"
        value={context.preference}
        onChange={(event) => context.setPreference(event.target.value as ThemePreference)}
      >
        <option value="system">Системная</option>
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
      </select>
    </label>
  );
}
