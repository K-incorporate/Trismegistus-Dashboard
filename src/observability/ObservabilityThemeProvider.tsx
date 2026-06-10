import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OBS_SERVER_BASE } from "./lib/config";
import { PREDEFINED_THEMES, type CustomTheme, type ThemeColors } from "./lib/themeData";

const LS_THEME = "obs.theme";
const THEME_CLASSES = Object.values(PREDEFINED_THEMES).map((t) => t.cssClass).concat("theme-custom");
function camelToKebab(s: string) { return s.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, "$1-$2").toLowerCase(); }

interface ObsThemeCtx {
  currentTheme: string; customThemes: CustomTheme[]; setTheme: (name: string) => void;
  portalRoot: HTMLElement | null; containerRef: React.RefObject<HTMLDivElement | null>;
  refreshCustomThemes: () => Promise<void>; saveCustomTheme: (t: CustomTheme) => Promise<void>;
}
const Ctx = createContext<ObsThemeCtx | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useObsTheme = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useObsTheme must be used within ObservabilityThemeProvider");
  return v;
};

function applyTheme(el: HTMLElement | null, name: string, customThemes: CustomTheme[]) {
  if (!el) return;
  THEME_CLASSES.forEach((c) => el.classList.remove(c));
  const predef = PREDEFINED_THEMES[name as keyof typeof PREDEFINED_THEMES];
  const sample = Object.values(PREDEFINED_THEMES)[0].colors;
  if (predef) {
    el.classList.add(predef.cssClass);
    Object.keys(sample).forEach((k) => el.style.removeProperty(`--theme-${camelToKebab(k)}`));
    return;
  }
  const custom = customThemes.find((t) => t.name === name || t.id === name);
  if (custom) {
    el.classList.add("theme-custom");
    (Object.entries(custom.colors) as [keyof ThemeColors, string][]).forEach(([k, v]) =>
      el.style.setProperty(`--theme-${camelToKebab(String(k))}`, v));
  }
}

export function ObservabilityThemeProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    try { return localStorage.getItem(LS_THEME) || "dark"; } catch { return "dark"; }
  });
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);

  useEffect(() => {
    const root = document.createElement("div");
    root.className = "obs-root"; root.id = "obs-portal-root";
    document.body.appendChild(root);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPortalRoot(root);
    return () => { document.body.removeChild(root); };
  }, []);

  useEffect(() => {
    applyTheme(containerRef.current, currentTheme, customThemes);
    applyTheme(portalRoot, currentTheme, customThemes);
    try { localStorage.setItem(LS_THEME, currentTheme); } catch { /* private mode */ }
  }, [currentTheme, customThemes, portalRoot]);

  const refreshCustomThemes = useMemo(() => async () => {
    try {
      const res = await fetch(`${OBS_SERVER_BASE}/api/themes?isPublic=true`);
      if (!res.ok) return;
      const body = await res.json() as unknown;
      if (Array.isArray((body as Record<string, unknown>)?.data)) setCustomThemes((body as { data: CustomTheme[] }).data);
    } catch { /* server down — keep predefined only */ }
  }, []);

  const saveCustomTheme = useMemo(() => async (t: CustomTheme) => {
    await fetch(`${OBS_SERVER_BASE}/api/themes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t),
    });
    await refreshCustomThemes();
  }, [refreshCustomThemes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCustomThemes().catch(() => { /* handled inside */ });
  }, [refreshCustomThemes]);

  const value: ObsThemeCtx = {
    currentTheme, customThemes, setTheme: setCurrentTheme,
    portalRoot, containerRef, refreshCustomThemes, saveCustomTheme,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
