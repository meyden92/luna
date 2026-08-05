export const THEME_IDS = ['default', 'claude', 'modern', 'supabase', 't3'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeInfo {
  id: ThemeId;
  name: string;
}

export const AVAILABLE_THEMES = [
  { id: 'default', name: 'Default' },
  { id: 'claude', name: 'Claude' },
  { id: 'modern', name: 'Modern' },
  { id: 'supabase', name: 'Supabase' },
  { id: 't3', name: 'T3' },
] as const satisfies readonly ThemeInfo[];

export function isThemeId(value: string): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export class ThemeLoader {
  private loadedThemes = new Set<ThemeId>();
  private currentTheme: ThemeId = 'default';
  private _previewTheme: ThemeId | null = null;

  constructor() {
    // Initialize loaded themes set with the current theme if it exists
    if (typeof window !== 'undefined') {
      this.currentTheme = this.getCurrentTheme();
    }
  }

  getAvailableThemes() {
    return AVAILABLE_THEMES;
  }

  async applySavedTheme(): Promise<void> {
    await this.loadTheme(this.getCurrentTheme());
  }

  async loadTheme(themeId: ThemeId): Promise<void> {
    if (this.loadedThemes.has(themeId)) {
      return;
    }

    try {
      this.unloadAllThemes();

      if (themeId === 'default') {
        this.loadedThemes.add(themeId);
        this.saveTheme(themeId);
        this.currentTheme = themeId;
        return;
      }

      // Save the named CSS theme independently from the light/dark mode cookie.
      this.saveTheme(themeId);

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/themes/${themeId}.css`;
      document.head.appendChild(link);

      this.loadedThemes.add(themeId);
      this.currentTheme = themeId;
    } catch (error) {
      console.error(`Error loading theme ${themeId}:`, error);
    }
  }

  async previewTheme(themeId: ThemeId): Promise<void> {
    if (this._previewTheme === themeId) {
      return;
    }

    try {
      // Remove current preview if any
      this.clearPreview();

      this._previewTheme = themeId;

      if (themeId === 'default') {
        // Remove all theme links for default theme
        this.unloadAllThemeLinks();
        return;
      }

      // Remove current theme links but don't clear loadedThemes
      this.unloadAllThemeLinks();

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/themes/${themeId}.css`;
      link.setAttribute('data-theme-preview', 'true');
      document.head.appendChild(link);
    } catch (error) {
      console.error(`Error previewing theme ${themeId}:`, error);
    }
  }

  clearPreview(): void {
    if (!this._previewTheme) {
      return;
    }

    // Remove preview theme links
    const previewLinks = document.querySelectorAll('link[data-theme-preview="true"]');
    for (const link of previewLinks) {
      link.remove();
    }

    // Restore the current theme
    if (this.currentTheme !== 'default') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/themes/${this.currentTheme}.css`;
      document.head.appendChild(link);
    }

    this._previewTheme = null;
  }

  private saveTheme(themeId: ThemeId): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('selectedTheme', themeId);
  }

  private unloadAllThemeLinks(): void {
    const themeLinks = document.querySelectorAll('link[href^="/themes/"]');
    for (const link of themeLinks) {
      link.remove();
    }
  }

  unloadAllThemes(): void {
    this.unloadAllThemeLinks();
    this.loadedThemes.clear();
  }

  getCurrentTheme(): ThemeId {
    if (typeof window === 'undefined') {
      return 'default';
    }
    const savedTheme = localStorage.getItem('selectedTheme');
    return savedTheme && isThemeId(savedTheme) ? savedTheme : 'default';
  }

  isThemeLoaded(themeId: ThemeId) {
    return this.loadedThemes.has(themeId);
  }

  isPreviewActive(): boolean {
    return this._previewTheme !== null;
  }

  getActiveTheme(): ThemeId {
    return this._previewTheme || this.currentTheme;
  }
}

export const themeLoader = new ThemeLoader();
