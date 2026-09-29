import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../components/ui/Icon.tsx';
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
const systemDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
const applyTheme = (preference: ThemePreference, dark: boolean) => {
  document.documentElement.dataset.theme =
    preference === 'system' ? (dark ? 'dark' : 'light') : preference;
};
// Runs before React's first paint, including on direct links to the editor and errors.
if (typeof document !== 'undefined') applyTheme(readPreference(), systemDark());
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  // The first React render matches the generated HTML. The early initialization
  // above already applies the saved palette before hydration starts.
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setPreference(readPreference());
    setDark(media.matches);
    setReady(true);
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
  useEffect(() => {
    if (ready) applyTheme(preference, dark);
  }, [preference, dark, ready]);
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
const themes: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'Системная', hint: 'Как на устройстве' },
  { value: 'light', label: 'Светлая', hint: 'Светлый фон' },
  { value: 'dark', label: 'Тёмная', hint: 'Графитовый фон' },
];

export function ThemeToggle() {
  const context = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  if (!context) throw new Error('ThemeProvider is required');
  const { preference, setPreference } = context;
  const current = themes.find((theme) => theme.value === preference)!;

  useEffect(() => {
    if (!open) return;
    items.current[themes.findIndex((theme) => theme.value === preference)]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, preference]);

  return (
    <div
      ref={root}
      className="theme-toggle"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="theme-trigger"
        aria-label={`Тема оформления: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={`Тема оформления: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
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
        <span className="theme-trigger-label">{current.label}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div
          id={menuId}
          className="theme-menu"
          role="menu"
          aria-label="Тема оформления"
          onKeyDown={(event) => {
            const index = items.current.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'ArrowDown'
                ? (index + 1) % themes.length
                : event.key === 'ArrowUp'
                  ? (index + themes.length - 1) % themes.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? themes.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              items.current[next]?.focus();
            }
          }}
        >
          <p className="theme-menu-title" role="presentation">
            Оформление
          </p>
          {themes.map((theme, index) => (
            <button
              key={theme.value}
              type="button"
              role="menuitemradio"
              ref={(element) => {
                items.current[index] = element;
              }}
              tabIndex={-1}
              aria-label={theme.label}
              aria-checked={preference === theme.value}
              onClick={() => {
                setPreference(theme.value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span className={`theme-swatch theme-swatch--${theme.value}`} aria-hidden="true" />
              <span>
                <strong>{theme.label}</strong>
                <small>{theme.hint}</small>
              </span>
              {preference === theme.value && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
