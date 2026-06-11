import {
  insertTheme,
  updateTheme,
  getTheme,
  getThemes,
  deleteTheme,
  incrementThemeDownloadCount,
} from "./db";
import type { Theme, ThemeSearchQuery, ThemeValidationError, ApiResponse } from "./types";

function generateId(): string {
  return Math.random().toString(36).substr(2, 16);
}

function validateTheme(theme: Partial<Theme>): ThemeValidationError[] {
  const errors: ThemeValidationError[] = [];

  if (!theme.name) {
    errors.push({ field: "name", message: "Theme name is required", code: "REQUIRED" });
  } else if (!/^[a-z0-9-_]+$/.test(theme.name)) {
    errors.push({ field: "name", message: "Theme name must contain only lowercase letters, numbers, hyphens, and underscores", code: "INVALID_FORMAT" });
  }

  if (!theme.displayName) {
    errors.push({ field: "displayName", message: "Display name is required", code: "REQUIRED" });
  }

  if (!theme.colors) {
    errors.push({ field: "colors", message: "Theme colors are required", code: "REQUIRED" });
  } else {
    const requiredColors = [
      "primary", "primaryHover", "primaryLight", "primaryDark",
      "bgPrimary", "bgSecondary", "bgTertiary", "bgQuaternary",
      "textPrimary", "textSecondary", "textTertiary", "textQuaternary",
      "borderPrimary", "borderSecondary", "borderTertiary",
      "accentSuccess", "accentWarning", "accentError", "accentInfo",
      "shadow", "shadowLg", "hoverBg", "activeBg", "focusRing",
    ];
    for (const colorKey of requiredColors) {
      const color = theme.colors[colorKey as keyof typeof theme.colors];
      if (!color) {
        errors.push({ field: `colors.${colorKey}`, message: `Color ${colorKey} is required`, code: "REQUIRED" });
      } else if (!isValidColor(color)) {
        errors.push({ field: `colors.${colorKey}`, message: `Invalid color format for ${colorKey}`, code: "INVALID_COLOR" });
      }
    }
  }

  if (theme.tags && Array.isArray(theme.tags)) {
    for (const tag of theme.tags) {
      if (typeof tag !== "string" || tag.length === 0) {
        errors.push({ field: "tags", message: "All tags must be non-empty strings", code: "INVALID_FORMAT" });
        break;
      }
    }
  }

  return errors;
}

function isValidColor(color: string): boolean {
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) return true;
  if (/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d?(?:\.\d+)?))?\)$/.test(color)) return true;
  const namedColors = ["transparent", "black", "white", "red", "green", "blue", "yellow", "cyan", "magenta", "gray", "grey"];
  return namedColors.includes(color.toLowerCase());
}

function sanitizeTheme(theme: Record<string, unknown>): Partial<Theme> {
  return {
    name: typeof theme.name === "string" ? theme.name.toLowerCase().replace(/[^a-z0-9-_]/g, "") : "",
    displayName: typeof theme.displayName === "string" ? theme.displayName.trim() : "",
    description: typeof theme.description === "string" ? theme.description.trim() : "",
    colors: theme.colors as Theme["colors"] | undefined,
    isPublic: Boolean(theme.isPublic),
    tags: Array.isArray(theme.tags) ? (theme.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0) : [],
    authorId: typeof theme.authorId === "string" ? theme.authorId : undefined,
    authorName: typeof theme.authorName === "string" ? theme.authorName : undefined,
  };
}

export async function createTheme(themeData: Record<string, unknown>): Promise<ApiResponse<Theme>> {
  try {
    const sanitized = sanitizeTheme(themeData);
    const errors = validateTheme(sanitized);
    if (errors.length > 0) return { success: false, error: "Validation failed", validationErrors: errors };

    const existingThemes = getThemes({ query: sanitized.name });
    if (existingThemes.some((t) => t.name === sanitized.name)) {
      return { success: false, error: "Theme name already exists", validationErrors: [{ field: "name", message: "A theme with this name already exists", code: "DUPLICATE" }] };
    }

    const now = Date.now();
    const theme: Theme = {
      id: generateId(),
      name: sanitized.name!,
      displayName: sanitized.displayName!,
      description: sanitized.description,
      colors: sanitized.colors!,
      isPublic: sanitized.isPublic!,
      authorId: sanitized.authorId,
      authorName: sanitized.authorName,
      createdAt: now, updatedAt: now,
      tags: sanitized.tags ?? [],
      downloadCount: 0, rating: 0, ratingCount: 0,
    };

    const savedTheme = insertTheme(theme);
    return { success: true, data: savedTheme, message: "Theme created successfully" };
  } catch {
    return { success: false, error: "Internal server error" };
  }
}

export async function updateThemeById(id: string, updates: Record<string, unknown>): Promise<ApiResponse<Theme>> {
  try {
    const existingTheme = getTheme(id);
    if (!existingTheme) return { success: false, error: "Theme not found" };

    const sanitized = sanitizeTheme(updates);
    delete sanitized.name;

    const errors = validateTheme({ ...existingTheme, ...sanitized });
    if (errors.length > 0) return { success: false, error: "Validation failed", validationErrors: errors };

    const success = updateTheme(id, { ...sanitized, updatedAt: Date.now() });
    if (!success) return { success: false, error: "Failed to update theme" };

    return { success: true, data: getTheme(id)!, message: "Theme updated successfully" };
  } catch {
    return { success: false, error: "Internal server error" };
  }
}

export async function getThemeById(id: string): Promise<ApiResponse<Theme>> {
  try {
    const theme = getTheme(id);
    if (!theme) return { success: false, error: "Theme not found" };
    if (theme.isPublic) incrementThemeDownloadCount(id);
    return { success: true, data: theme };
  } catch {
    return { success: false, error: "Internal server error" };
  }
}

export async function searchThemes(query: ThemeSearchQuery): Promise<ApiResponse<Theme[]>> {
  try {
    const searchQuery = { ...query, isPublic: query.authorId ? undefined : true };
    return { success: true, data: getThemes(searchQuery) };
  } catch {
    return { success: false, error: "Internal server error" };
  }
}

export async function deleteThemeById(id: string, authorId?: string): Promise<ApiResponse<void>> {
  try {
    const theme = getTheme(id);
    if (!theme) return { success: false, error: "Theme not found" };
    if (authorId && theme.authorId !== authorId) return { success: false, error: "Unauthorized - you can only delete your own themes" };
    if (!deleteTheme(id)) return { success: false, error: "Failed to delete theme" };
    return { success: true, message: "Theme deleted successfully" };
  } catch {
    return { success: false, error: "Internal server error" };
  }
}

export async function exportThemeById(id: string): Promise<ApiResponse<Record<string, unknown>>> {
  try {
    const theme = getTheme(id);
    if (!theme) return { success: false, error: "Theme not found" };
    return {
      success: true,
      data: {
        version: "1.0.0",
        theme: { name: theme.name, displayName: theme.displayName, description: theme.description, colors: theme.colors, tags: theme.tags, authorName: theme.authorName },
        exportedAt: new Date().toISOString(),
        exportedBy: "observability-system",
      },
    };
  } catch {
    return { success: false, error: "Internal server error" };
  }
}

export async function importTheme(importData: Record<string, unknown>, authorId?: string): Promise<ApiResponse<Theme>> {
  try {
    if (!importData.theme) return { success: false, error: "Invalid import data - missing theme" };
    const themeData = { ...(importData.theme as Record<string, unknown>), authorId, isPublic: false };
    return await createTheme(themeData);
  } catch {
    return { success: false, error: "Internal server error" };
  }
}

export async function getThemeStats(): Promise<ApiResponse<Record<string, unknown>>> {
  try {
    const all = getThemes();
    const pub = getThemes({ isPublic: true });
    return {
      success: true,
      data: {
        totalThemes: all.length,
        publicThemes: pub.length,
        privateThemes: all.length - pub.length,
        totalDownloads: all.reduce((s, t) => s + (t.downloadCount ?? 0), 0),
        averageRating: all.length > 0 ? all.reduce((s, t) => s + (t.rating ?? 0), 0) / all.length : 0,
      },
    };
  } catch {
    return { success: false, error: "Internal server error" };
  }
}
