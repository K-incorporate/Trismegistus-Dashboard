export type ThemeName =
  | "light"
  | "dark"
  | "modern"
  | "earth"
  | "glass"
  | "high-contrast"
  | "dark-blue"
  | "colorblind-friendly"
  | "ocean"
  | "midnight-purple"
  | "sunset-orange"
  | "mint-fresh";

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryDark: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgQuaternary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;
  borderPrimary: string;
  borderSecondary: string;
  borderTertiary: string;
  accentSuccess: string;
  accentWarning: string;
  accentError: string;
  accentInfo: string;
  shadow: string;
  shadowLg: string;
  hoverBg: string;
  activeBg: string;
  focusRing: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  colors: ThemeColors;
  isCustom: boolean;
  isPublic?: boolean;
  authorId?: string;
  authorName?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

export interface PredefinedTheme {
  name: ThemeName;
  displayName: string;
  description: string;
  colors: ThemeColors;
  cssClass: string;
  preview: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface ThemeState {
  currentTheme: ThemeName | string;
  customThemes: CustomTheme[];
  isCustomTheme: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface CreateThemeFormData {
  name: string;
  displayName: string;
  description: string;
  colors: Partial<ThemeColors>;
  isPublic: boolean;
  tags: string[];
}

export interface ThemeImportExport {
  version: string;
  theme: CustomTheme;
  exportedAt: string;
  exportedBy?: string;
}

export type ThemeColorKey = keyof ThemeColors;

export const THEME_COLOR_KEYS: ThemeColorKey[] = [
  "primary",
  "primaryHover",
  "primaryLight",
  "primaryDark",
  "bgPrimary",
  "bgSecondary",
  "bgTertiary",
  "bgQuaternary",
  "textPrimary",
  "textSecondary",
  "textTertiary",
  "textQuaternary",
  "borderPrimary",
  "borderSecondary",
  "borderTertiary",
  "accentSuccess",
  "accentWarning",
  "accentError",
  "accentInfo",
  "shadow",
  "shadowLg",
  "hoverBg",
  "activeBg",
  "focusRing",
];

export const PREDEFINED_THEME_NAMES: ThemeName[] = [
  "light",
  "dark",
  "modern",
  "earth",
  "glass",
  "high-contrast",
  "dark-blue",
  "colorblind-friendly",
  "ocean",
  "midnight-purple",
  "sunset-orange",
  "mint-fresh",
];

export const COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
export const RGBA_REGEX =
  /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d?(?:\.\d+)?))?\)$/;

export const PREDEFINED_THEMES: Record<ThemeName, PredefinedTheme> = {
  light: {
    name: "light",
    displayName: "Light",
    description: "Clean and bright theme with high contrast",
    cssClass: "theme-light",
    preview: { primary: "#3b82f6", secondary: "#f9fafb", accent: "#10b981" },
    colors: {
      primary: "#3b82f6",
      primaryHover: "#2563eb",
      primaryLight: "#dbeafe",
      primaryDark: "#1e40af",
      bgPrimary: "#ffffff",
      bgSecondary: "#f9fafb",
      bgTertiary: "#f3f4f6",
      bgQuaternary: "#e5e7eb",
      textPrimary: "#111827",
      textSecondary: "#374151",
      textTertiary: "#6b7280",
      textQuaternary: "#9ca3af",
      borderPrimary: "#e5e7eb",
      borderSecondary: "#d1d5db",
      borderTertiary: "#9ca3af",
      accentSuccess: "#10b981",
      accentWarning: "#f59e0b",
      accentError: "#ef4444",
      accentInfo: "#3b82f6",
      shadow: "rgba(0, 0, 0, 0.1)",
      shadowLg: "rgba(0, 0, 0, 0.25)",
      hoverBg: "rgba(0, 0, 0, 0.05)",
      activeBg: "rgba(0, 0, 0, 0.1)",
      focusRing: "#3b82f6",
    },
  },
  dark: {
    name: "dark",
    displayName: "Dark",
    description: "Dark theme with reduced eye strain",
    cssClass: "theme-dark",
    preview: { primary: "#60a5fa", secondary: "#1f2937", accent: "#34d399" },
    colors: {
      primary: "#60a5fa",
      primaryHover: "#3b82f6",
      primaryLight: "#1e3a8a",
      primaryDark: "#1d4ed8",
      bgPrimary: "#111827",
      bgSecondary: "#1f2937",
      bgTertiary: "#374151",
      bgQuaternary: "#4b5563",
      textPrimary: "#f9fafb",
      textSecondary: "#e5e7eb",
      textTertiary: "#d1d5db",
      textQuaternary: "#9ca3af",
      borderPrimary: "#374151",
      borderSecondary: "#4b5563",
      borderTertiary: "#6b7280",
      accentSuccess: "#34d399",
      accentWarning: "#fbbf24",
      accentError: "#f87171",
      accentInfo: "#60a5fa",
      shadow: "rgba(0, 0, 0, 0.5)",
      shadowLg: "rgba(0, 0, 0, 0.75)",
      hoverBg: "rgba(255, 255, 255, 0.05)",
      activeBg: "rgba(255, 255, 255, 0.1)",
      focusRing: "#60a5fa",
    },
  },
  modern: {
    name: "modern",
    displayName: "Modern",
    description: "Sleek modern theme with blue accents",
    cssClass: "theme-modern",
    preview: { primary: "#0ea5e9", secondary: "#f1f5f9", accent: "#059669" },
    colors: {
      primary: "#0ea5e9",
      primaryHover: "#0284c7",
      primaryLight: "#e0f2fe",
      primaryDark: "#0c4a6e",
      bgPrimary: "#f8fafc",
      bgSecondary: "#f1f5f9",
      bgTertiary: "#e2e8f0",
      bgQuaternary: "#cbd5e1",
      textPrimary: "#0f172a",
      textSecondary: "#334155",
      textTertiary: "#64748b",
      textQuaternary: "#94a3b8",
      borderPrimary: "#e2e8f0",
      borderSecondary: "#cbd5e1",
      borderTertiary: "#94a3b8",
      accentSuccess: "#059669",
      accentWarning: "#d97706",
      accentError: "#dc2626",
      accentInfo: "#0ea5e9",
      shadow: "rgba(15, 23, 42, 0.1)",
      shadowLg: "rgba(15, 23, 42, 0.25)",
      hoverBg: "rgba(15, 23, 42, 0.05)",
      activeBg: "rgba(15, 23, 42, 0.1)",
      focusRing: "#0ea5e9",
    },
  },
  earth: {
    name: "earth",
    displayName: "Earth",
    description: "Natural theme with green and brown tones",
    cssClass: "theme-earth",
    preview: { primary: "#8b4513", secondary: "#f5f5dc", accent: "#228b22" },
    colors: {
      primary: "#8b4513",
      primaryHover: "#a0522d",
      primaryLight: "#deb887",
      primaryDark: "#654321",
      bgPrimary: "#f5f5dc",
      bgSecondary: "#f0e68c",
      bgTertiary: "#daa520",
      bgQuaternary: "#cd853f",
      textPrimary: "#2f1b14",
      textSecondary: "#5d4e37",
      textTertiary: "#8b4513",
      textQuaternary: "#a0522d",
      borderPrimary: "#deb887",
      borderSecondary: "#d2b48c",
      borderTertiary: "#cd853f",
      accentSuccess: "#228b22",
      accentWarning: "#ff8c00",
      accentError: "#dc143c",
      accentInfo: "#4682b4",
      shadow: "rgba(139, 69, 19, 0.15)",
      shadowLg: "rgba(139, 69, 19, 0.3)",
      hoverBg: "rgba(139, 69, 19, 0.08)",
      activeBg: "rgba(139, 69, 19, 0.15)",
      focusRing: "#8b4513",
    },
  },
  glass: {
    name: "glass",
    displayName: "Glass",
    description: "Translucent glass-like theme with purple accents",
    cssClass: "theme-glass",
    preview: { primary: "#8b5cf6", secondary: "rgba(248,250,252,0.9)", accent: "#10b981" },
    colors: {
      primary: "#8b5cf6",
      primaryHover: "#7c3aed",
      primaryLight: "#f3e8ff",
      primaryDark: "#581c87",
      bgPrimary: "rgba(255, 255, 255, 0.95)",
      bgSecondary: "rgba(248, 250, 252, 0.9)",
      bgTertiary: "rgba(241, 245, 249, 0.85)",
      bgQuaternary: "rgba(226, 232, 240, 0.8)",
      textPrimary: "#1e1b4b",
      textSecondary: "#3730a3",
      textTertiary: "#6366f1",
      textQuaternary: "#8b5cf6",
      borderPrimary: "rgba(226, 232, 240, 0.6)",
      borderSecondary: "rgba(203, 213, 225, 0.7)",
      borderTertiary: "rgba(148, 163, 184, 0.8)",
      accentSuccess: "#10b981",
      accentWarning: "#f59e0b",
      accentError: "#ef4444",
      accentInfo: "#8b5cf6",
      shadow: "rgba(139, 92, 246, 0.1)",
      shadowLg: "rgba(139, 92, 246, 0.25)",
      hoverBg: "rgba(139, 92, 246, 0.05)",
      activeBg: "rgba(139, 92, 246, 0.1)",
      focusRing: "#8b5cf6",
    },
  },
  "high-contrast": {
    name: "high-contrast",
    displayName: "High Contrast",
    description: "Maximum contrast theme for accessibility",
    cssClass: "theme-high-contrast",
    preview: { primary: "#000000", secondary: "#ffffff", accent: "#008000" },
    colors: {
      primary: "#000000",
      primaryHover: "#333333",
      primaryLight: "#f0f0f0",
      primaryDark: "#000000",
      bgPrimary: "#ffffff",
      bgSecondary: "#f0f0f0",
      bgTertiary: "#e0e0e0",
      bgQuaternary: "#d0d0d0",
      textPrimary: "#000000",
      textSecondary: "#000000",
      textTertiary: "#333333",
      textQuaternary: "#666666",
      borderPrimary: "#000000",
      borderSecondary: "#333333",
      borderTertiary: "#666666",
      accentSuccess: "#008000",
      accentWarning: "#ff8c00",
      accentError: "#ff0000",
      accentInfo: "#0000ff",
      shadow: "rgba(0, 0, 0, 0.3)",
      shadowLg: "rgba(0, 0, 0, 0.6)",
      hoverBg: "rgba(0, 0, 0, 0.1)",
      activeBg: "rgba(0, 0, 0, 0.2)",
      focusRing: "#000000",
    },
  },
  "dark-blue": {
    name: "dark-blue",
    displayName: "Dark Blue",
    description: "Deep blue with navy accents",
    cssClass: "theme-dark-blue",
    preview: { primary: "#0099ff", secondary: "#000033", accent: "#00ff88" },
    colors: {
      primary: "#0099ff",
      primaryHover: "#0077cc",
      primaryLight: "#33aaff",
      primaryDark: "#0066cc",
      bgPrimary: "#000033",
      bgSecondary: "#000066",
      bgTertiary: "#000099",
      bgQuaternary: "#0000cc",
      textPrimary: "#e6f2ff",
      textSecondary: "#ccddff",
      textTertiary: "#99bbff",
      textQuaternary: "#6699ff",
      borderPrimary: "#003366",
      borderSecondary: "#004499",
      borderTertiary: "#0066cc",
      accentSuccess: "#00ff88",
      accentWarning: "#ffaa00",
      accentError: "#ff3366",
      accentInfo: "#0099ff",
      shadow: "rgba(0, 0, 51, 0.7)",
      shadowLg: "rgba(0, 0, 51, 0.9)",
      hoverBg: "rgba(0, 153, 255, 0.15)",
      activeBg: "rgba(0, 153, 255, 0.25)",
      focusRing: "#0099ff",
    },
  },
  "colorblind-friendly": {
    name: "colorblind-friendly",
    displayName: "Colorblind Friendly",
    description: "High contrast colors safe for color vision deficiency",
    cssClass: "theme-colorblind-friendly",
    preview: { primary: "#993366", secondary: "#ffffcc", accent: "#117733" },
    colors: {
      primary: "#993366",
      primaryHover: "#663344",
      primaryLight: "#cc6699",
      primaryDark: "#661144",
      bgPrimary: "#ffffcc",
      bgSecondary: "#ffcc99",
      bgTertiary: "#ffaa88",
      bgQuaternary: "#ff9966",
      textPrimary: "#331122",
      textSecondary: "#442233",
      textTertiary: "#553344",
      textQuaternary: "#664455",
      borderPrimary: "#cc9966",
      borderSecondary: "#996633",
      borderTertiary: "#663300",
      accentSuccess: "#117733",
      accentWarning: "#cc6633",
      accentError: "#882233",
      accentInfo: "#993366",
      shadow: "rgba(51, 17, 34, 0.15)",
      shadowLg: "rgba(51, 17, 34, 0.3)",
      hoverBg: "rgba(153, 51, 102, 0.08)",
      activeBg: "rgba(153, 51, 102, 0.15)",
      focusRing: "#993366",
    },
  },
  ocean: {
    name: "ocean",
    displayName: "Ocean",
    description: "Bright tropical ocean with turquoise and coral accents",
    cssClass: "theme-ocean",
    preview: { primary: "#0088cc", secondary: "#cceeff", accent: "#00cc66" },
    colors: {
      primary: "#0088cc",
      primaryHover: "#006699",
      primaryLight: "#33aadd",
      primaryDark: "#005588",
      bgPrimary: "#cceeff",
      bgSecondary: "#99ddff",
      bgTertiary: "#66ccff",
      bgQuaternary: "#33bbff",
      textPrimary: "#003344",
      textSecondary: "#004455",
      textTertiary: "#005566",
      textQuaternary: "#006677",
      borderPrimary: "#66bbdd",
      borderSecondary: "#4499cc",
      borderTertiary: "#2288bb",
      accentSuccess: "#00cc66",
      accentWarning: "#ff9933",
      accentError: "#ff3333",
      accentInfo: "#0088cc",
      shadow: "rgba(0, 136, 204, 0.15)",
      shadowLg: "rgba(0, 136, 204, 0.3)",
      hoverBg: "rgba(0, 136, 204, 0.08)",
      activeBg: "rgba(0, 136, 204, 0.15)",
      focusRing: "#0088cc",
    },
  },
  "midnight-purple": {
    name: "midnight-purple",
    displayName: "Midnight Purple",
    description: "Deep purples with neon accents",
    cssClass: "theme-midnight-purple",
    preview: { primary: "#a78bfa", secondary: "#0f0a1a", accent: "#34d399" },
    colors: {
      primary: "#a78bfa",
      primaryHover: "#c4b5fd",
      primaryLight: "#2e1065",
      primaryDark: "#6d28d9",
      bgPrimary: "#0f0a1a",
      bgSecondary: "#1a1333",
      bgTertiary: "#2d1b4e",
      bgQuaternary: "#3f2766",
      textPrimary: "#f3e8ff",
      textSecondary: "#e9d5ff",
      textTertiary: "#d8b4fe",
      textQuaternary: "#c084fc",
      borderPrimary: "#6d28d9",
      borderSecondary: "#7e22ce",
      borderTertiary: "#a855f7",
      accentSuccess: "#34d399",
      accentWarning: "#fbbf24",
      accentError: "#f472b6",
      accentInfo: "#a78bfa",
      shadow: "rgba(0, 0, 0, 0.6)",
      shadowLg: "rgba(0, 0, 0, 0.8)",
      hoverBg: "rgba(167, 139, 250, 0.1)",
      activeBg: "rgba(167, 139, 250, 0.2)",
      focusRing: "#a78bfa",
    },
  },
  "sunset-orange": {
    name: "sunset-orange",
    displayName: "Sunset Orange",
    description: "Warm oranges and neutral tones",
    cssClass: "theme-sunset-orange",
    preview: { primary: "#ea580c", secondary: "#f5ede4", accent: "#16a34a" },
    colors: {
      primary: "#ea580c",
      primaryHover: "#c2410c",
      primaryLight: "#fed7aa",
      primaryDark: "#9a3412",
      bgPrimary: "#f5ede4",
      bgSecondary: "#fce4d6",
      bgTertiary: "#fbdcc3",
      bgQuaternary: "#f8d4af",
      textPrimary: "#1f1208",
      textSecondary: "#3e2109",
      textTertiary: "#5d2d0e",
      textQuaternary: "#7c3a14",
      borderPrimary: "#fbdcc3",
      borderSecondary: "#f8c9a8",
      borderTertiary: "#f5a842",
      accentSuccess: "#16a34a",
      accentWarning: "#f59e0b",
      accentError: "#dc2626",
      accentInfo: "#ea580c",
      shadow: "rgba(218, 74, 13, 0.15)",
      shadowLg: "rgba(218, 74, 13, 0.3)",
      hoverBg: "rgba(234, 88, 12, 0.08)",
      activeBg: "rgba(234, 88, 12, 0.15)",
      focusRing: "#ea580c",
    },
  },
  "mint-fresh": {
    name: "mint-fresh",
    displayName: "Mint Fresh",
    description: "Cool mint greens with slate neutrals",
    cssClass: "theme-mint-fresh",
    preview: { primary: "#0d9488", secondary: "#f0fdfa", accent: "#059669" },
    colors: {
      primary: "#0d9488",
      primaryHover: "#0f766e",
      primaryLight: "#ccfbf1",
      primaryDark: "#134e4a",
      bgPrimary: "#f0fdfa",
      bgSecondary: "#d1fae5",
      bgTertiary: "#a7f3d0",
      bgQuaternary: "#7ee8c9",
      textPrimary: "#0d3b36",
      textSecondary: "#145352",
      textTertiary: "#1b6b67",
      textQuaternary: "#2d827d",
      borderPrimary: "#a7f3d0",
      borderSecondary: "#7ee8c9",
      borderTertiary: "#5eead4",
      accentSuccess: "#059669",
      accentWarning: "#d97706",
      accentError: "#dc2626",
      accentInfo: "#0d9488",
      shadow: "rgba(13, 148, 136, 0.12)",
      shadowLg: "rgba(13, 148, 136, 0.25)",
      hoverBg: "rgba(13, 148, 136, 0.08)",
      activeBg: "rgba(13, 148, 136, 0.15)",
      focusRing: "#0d9488",
    },
  },
};
