import { getCurrentWindow } from '@tauri-apps/api/window';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { isTauri } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { ThemePreference } from '@/lib/types';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: 'dark' | 'light';
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'dark',
  resolved: 'dark',
  setPreference: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const savedTheme = useApp((s) => s.settings.theme);
  const setSettings = useApp((s) => s.setSettings);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const preference: ThemePreference = savedTheme === 'light' || savedTheme === 'system' ? savedTheme : 'dark';
  const resolved: 'dark' | 'light' = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    if (isTauri()) {
      void getCurrentWindow()
        .setTheme(resolved)
        .catch(() => undefined);
    }
  }, [resolved]);

  const setPreference = (pref: ThemePreference) => {
    void setSettings({ theme: pref });
  };

  return <ThemeContext.Provider value={{ preference, resolved, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
