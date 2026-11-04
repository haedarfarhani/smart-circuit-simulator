import { create } from 'zustand';

export type Tool = 'select' | 'wire' | 'hand';

/** An in-progress wire being drawn (kept in the store so Esc can cancel it). */
export interface WireDraft {
  start: import('../models/circuit').WireEndpoint;
  waypoints: import('../models/circuit').Point[];
  /** live cursor position in world units (unsnapped) */
  cursor: import('../models/circuit').Point | null;
  /** terminal under the cursor: [componentId, terminalIndex] */
  hoverTerminal: [string, number] | null;
  /**
   * Set when the wire started in the middle of an existing wire. Applied on
   * completion so cancelling the draft leaves the document untouched.
   */
  startJunction: import('../models/circuit').WireJunction | null;
}
export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type CurrentDirection = 'conventional' | 'electron';
export type InspectorTab = 'properties' | 'analysis' | 'learning' | 'practice';
export type BottomPanelTab =
  | 'simulation'
  | 'oscilloscope'
  | 'measurements'
  | 'console'
  | 'analysis';
export type Locale = 'en' | 'fa';
export type DialogKind =
  | 'about'
  | 'confirm-new'
  | 'transfer-import'
  | 'transfer-export'
  | 'settings'
  | null;
export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';
export type OverlayPanel = 'none' | 'library' | 'inspector';

export interface VizColors {
  current: string;
  vpos: string;
  vneg: string;
  ac: string;
  ground: string;
  overload: string;
  short: string;
  inactive: string;
}

export const DEFAULT_VIZ_COLORS: VizColors = {
  current: '#10B981',
  vpos: '#EF4444',
  vneg: '#3B82F6',
  ac: '#A855F7',
  ground: '#64748B',
  overload: '#F59E0B',
  short: '#DC2626',
  inactive: '#94A3B8',
};

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

const PREFS_KEY = 'circuit-lab:prefs';

export interface Prefs {
  theme: Theme;
  locale: Locale;
  gridVisible: boolean;
  snapEnabled: boolean;
  simulationEnabled: boolean;
  simulationSpeed: number;
  currentDirection: CurrentDirection;
  /** bottom panel height in px (oscilloscope screen area) */
  bottomPanelHeight: number;
  /** right properties panel width in px */
  inspectorWidth: number;
  inspectorCollapsed: boolean;
  vizColors: VizColors;
  onboardingDone: boolean;
  favoriteTypes: string[];
  recentTypes: string[];
  /** header tools cluster (Select/Wire) expanded */
  simToolbarExpanded: boolean;
  /** header feature-views cluster expanded */
  /** floating canvas HUD toolbar visible */
  hudVisible: boolean;
}

export const MIN_BOTTOM_PANEL_HEIGHT = 200;
export const MAX_BOTTOM_PANEL_HEIGHT = 720;
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 290;
export const MIN_INSPECTOR_WIDTH = 280;
export const MAX_INSPECTOR_WIDTH = 720;
export const DEFAULT_INSPECTOR_WIDTH = 320;

function loadPrefs(): Prefs {
  const fallback: Prefs = {
    theme: 'dark',
    locale: 'en',
    gridVisible: true,
    snapEnabled: true,
    simulationEnabled: false,
    simulationSpeed: 1,
    currentDirection: 'conventional',
    bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
    inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
    inspectorCollapsed: false,
    vizColors: { ...DEFAULT_VIZ_COLORS },
    onboardingDone: false,
    favoriteTypes: [],
    recentTypes: [],
    simToolbarExpanded: true,
    hudVisible: true,
  };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Prefs>;
    const height =
      typeof p.bottomPanelHeight === 'number' &&
      Number.isFinite(p.bottomPanelHeight)
        ? clamp(
            p.bottomPanelHeight,
            MIN_BOTTOM_PANEL_HEIGHT,
            MAX_BOTTOM_PANEL_HEIGHT,
          )
        : DEFAULT_BOTTOM_PANEL_HEIGHT;
    const width =
      typeof p.inspectorWidth === 'number' && Number.isFinite(p.inspectorWidth)
        ? clamp(p.inspectorWidth, MIN_INSPECTOR_WIDTH, MAX_INSPECTOR_WIDTH)
        : DEFAULT_INSPECTOR_WIDTH;
    const theme: Theme =
      p.theme === 'light' || p.theme === 'system' ? p.theme : 'dark';
    return {
      theme,
      locale: p.locale === 'fa' ? 'fa' : 'en',
      gridVisible: p.gridVisible !== false,
      snapEnabled: p.snapEnabled !== false,
      simulationEnabled: p.simulationEnabled === true,
      simulationSpeed: typeof p.simulationSpeed === 'number' ? p.simulationSpeed : 1,
      currentDirection: p.currentDirection === 'electron' ? 'electron' : 'conventional',
      bottomPanelHeight: height,
      inspectorWidth: width,
      inspectorCollapsed: p.inspectorCollapsed === true,
    vizColors: { ...DEFAULT_VIZ_COLORS, ...(p.vizColors ?? {}) },
    onboardingDone: p.onboardingDone === true,
    favoriteTypes: Array.isArray(p.favoriteTypes) ? p.favoriteTypes : [],
    recentTypes: Array.isArray(p.recentTypes) ? p.recentTypes : [],
    simToolbarExpanded: p.simToolbarExpanded !== false,
    hudVisible: p.hudVisible !== false,
  };
  } catch {
    return fallback;
  }
}

export function persistPrefs(p: Prefs): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // best-effort
  }
}

export interface UiState {
  tool: Tool;
  selection: string[];
  theme: Theme;
  locale: Locale;
  gridVisible: boolean;
  snapEnabled: boolean;
  spaceHeld: boolean;
  dialog: DialogKind;

  zoom: number;
  panX: number;
  panY: number;

  /** transient status-bar message (key into i18n or literal) */
  statusKey: string | null;
  wireDraft: WireDraft | null;

  simulationEnabled: boolean;
  simulationSpeed: number;
  currentDirection: CurrentDirection;
  inspectorTab: InspectorTab;
  bottomPanelTab: BottomPanelTab;
  bottomPanelOpen: boolean;
  /** height of the bottom panel (resizable via drag handle) */
  bottomPanelHeight: number;
  inspectorWidth: number;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  overlay: OverlayPanel;
  breakpoint: Breakpoint;
  vizColors: VizColors;
  onboardingDone: boolean;
  favoriteTypes: string[];
  recentTypes: string[];
  legendVisible: boolean;
  scopeFullscreen: boolean;
  simToolbarExpanded: boolean;
  hudVisible: boolean;

  setTool(t: Tool): void;
  select(ids: string[]): void;
  toggleSelect(id: string): void;
  clearSelection(): void;
  setTheme(t: Theme): void;
  toggleTheme(): void;
  setLocale(l: Locale): void;
  setGridVisible(v: boolean): void;
  setSnapEnabled(v: boolean): void;
  setSpaceHeld(v: boolean): void;
  setDialog(d: DialogKind): void;
  setStatus(key: string | null): void;
  setWireDraft(draft: WireDraft | null): void;
  setView(view: { zoom?: number; panX?: number; panY?: number }): void;
  setSimulationEnabled(v: boolean): void;
  setSimulationSpeed(v: number): void;
  setCurrentDirection(d: CurrentDirection): void;
  setInspectorTab(t: InspectorTab): void;
  setBottomPanelTab(t: BottomPanelTab): void;
  setBottomPanelOpen(v: boolean): void;
  setBottomPanelHeight(h: number): void;
  setSidebarCollapsed(v: boolean): void;
  toggleSidebar(): void;
  setInspectorCollapsed(v: boolean): void;
  setInspectorWidth(w: number, persist?: boolean): void;
  toggleInspector(): void;
  setOverlay(v: OverlayPanel): void;
  setBreakpoint(bp: Breakpoint): void;
  setVizColors(c: Partial<VizColors>): void;
  setOnboardingDone(v: boolean): void;
  toggleFavorite(type: string): void;
  recordRecent(type: string): void;
  setLegendVisible(v: boolean): void;
  setScopeFullscreen(v: boolean): void;
  toggleSimToolbar(): void;
  setHudVisible(v: boolean): void;
}

let statusTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiState>((set, get) => {
  const prefs = loadPrefs();
  return {
    tool: 'select',
    selection: [],
    theme: prefs.theme,
    locale: prefs.locale,
    gridVisible: prefs.gridVisible,
    snapEnabled: prefs.snapEnabled,
    spaceHeld: false,
    dialog: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    statusKey: null,
    wireDraft: null,
    simulationEnabled: prefs.simulationEnabled,
    simulationSpeed: prefs.simulationSpeed,
    currentDirection: prefs.currentDirection,
    inspectorTab: 'properties',
    bottomPanelTab: 'simulation',
    bottomPanelOpen: false,
    bottomPanelHeight: prefs.bottomPanelHeight,
    inspectorWidth: prefs.inspectorWidth,
    sidebarCollapsed: false,
    inspectorCollapsed: prefs.inspectorCollapsed,
    overlay: 'none',
    breakpoint: 'desktop',
    vizColors: prefs.vizColors,
    onboardingDone: prefs.onboardingDone,
    favoriteTypes: prefs.favoriteTypes,
    recentTypes: prefs.recentTypes,
    legendVisible: false,
    scopeFullscreen: false,
    simToolbarExpanded: prefs.simToolbarExpanded,
    hudVisible: prefs.hudVisible,

    setTool: (t) => set({ tool: t, statusKey: null }),
    select: (ids) => set({ selection: ids }),
    toggleSelect: (id) => {
      const sel = get().selection;
      set({
        selection: sel.includes(id)
          ? sel.filter((x) => x !== id)
          : [...sel, id],
      });
    },
    clearSelection: () => set({ selection: [] }),
    setTheme: (t) => {
      set({ theme: t });
      persistPrefs({ ...prefsFrom(get()), theme: t });
      applyTheme(t);
    },
    toggleTheme: () => {
      const cur = get().theme;
      const next: Theme = cur === 'dark' ? 'light' : 'dark';
      get().setTheme(next);
    },
    setLocale: (l) => {
      set({ locale: l });
      persistPrefs({ ...prefsFrom(get()), locale: l });
      applyLocale(l);
    },
    setGridVisible: (v) => {
      set({ gridVisible: v });
      persistPrefs({ ...prefsFrom(get()), gridVisible: v });
    },
    setSnapEnabled: (v) => {
      set({ snapEnabled: v });
      persistPrefs({ ...prefsFrom(get()), snapEnabled: v });
    },
    setSpaceHeld: (v) => set({ spaceHeld: v }),
    setDialog: (d) => set({ dialog: d }),
    setStatus: (key) => {
      if (statusTimer) clearTimeout(statusTimer);
      set({ statusKey: key });
      if (key) {
        statusTimer = setTimeout(() => set({ statusKey: null }), 2600);
      }
    },
    setWireDraft: (draft) => set({ wireDraft: draft }),
    setView: (view) => {
      const zoom = clamp(view.zoom ?? get().zoom, MIN_ZOOM, MAX_ZOOM);
      set({ zoom, panX: view.panX ?? get().panX, panY: view.panY ?? get().panY });
    },
    setSimulationEnabled: (v) => {
      set({ simulationEnabled: v });
      persistPrefs({ ...prefsFrom(get()), simulationEnabled: v });
    },
    setSimulationSpeed: (v) => {
      const clamped = clamp(v, 0.1, 10);
      set({ simulationSpeed: clamped });
      persistPrefs({ ...prefsFrom(get()), simulationSpeed: clamped });
    },
    setCurrentDirection: (d) => {
      set({ currentDirection: d });
      persistPrefs({ ...prefsFrom(get()), currentDirection: d });
    },
    setInspectorTab: (t) => set({ inspectorTab: t }),
    setBottomPanelTab: (t) => set({ bottomPanelTab: t, bottomPanelOpen: true }),
    setBottomPanelOpen: (v) => set({ bottomPanelOpen: v }),
    setBottomPanelHeight: (h) => {
      const height = clamp(
        h,
        MIN_BOTTOM_PANEL_HEIGHT,
        MAX_BOTTOM_PANEL_HEIGHT,
      );
      set({ bottomPanelHeight: height });
      persistPrefs({ ...prefsFrom(get()), bottomPanelHeight: height });
    },
    setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    toggleSidebar: () => {
      const bp = get().breakpoint;
      if (bp === 'tablet' || bp === 'mobile') {
        set({ overlay: get().overlay === 'library' ? 'none' : 'library' });
        return;
      }
      set({ sidebarCollapsed: !get().sidebarCollapsed });
    },
    setInspectorCollapsed: (v) => {
      set({ inspectorCollapsed: v });
      persistPrefs({ ...prefsFrom(get()), inspectorCollapsed: v });
    },
    setInspectorWidth: (w, persist = true) => {
      const width = clamp(Math.round(w), MIN_INSPECTOR_WIDTH, MAX_INSPECTOR_WIDTH);
      set({ inspectorWidth: width });
      if (persist) persistPrefs({ ...prefsFrom(get()), inspectorWidth: width });
    },
    toggleInspector: () => {
      const bp = get().breakpoint;
      if (bp === 'tablet' || bp === 'mobile') {
        set({ overlay: get().overlay === 'inspector' ? 'none' : 'inspector' });
        return;
      }
      get().setInspectorCollapsed(!get().inspectorCollapsed);
    },
    setOverlay: (v) => set({ overlay: v }),
    setBreakpoint: (bp) => {
      const prev = get().breakpoint;
      if (prev === bp) return;
      const compact = bp === 'tablet' || bp === 'mobile';
      set({
        breakpoint: bp,
        overlay: compact ? 'none' : get().overlay,
        scopeFullscreen: compact ? false : get().scopeFullscreen,
      });
    },
    setVizColors: (c) => {
      const next = { ...get().vizColors, ...c };
      set({ vizColors: next });
      persistPrefs({ ...prefsFrom(get()), vizColors: next });
      applyVizColors(next);
    },
    setOnboardingDone: (v) => {
      set({ onboardingDone: v });
      persistPrefs({ ...prefsFrom(get()), onboardingDone: v });
    },
    toggleFavorite: (type) => {
      const fav = get().favoriteTypes;
      const next = fav.includes(type)
        ? fav.filter((x) => x !== type)
        : [...fav, type];
      set({ favoriteTypes: next });
      persistPrefs({ ...prefsFrom(get()), favoriteTypes: next });
    },
    recordRecent: (type) => {
      const next = [type, ...get().recentTypes.filter((x) => x !== type)].slice(
        0,
        8,
      );
      set({ recentTypes: next });
      persistPrefs({ ...prefsFrom(get()), recentTypes: next });
    },
    setLegendVisible: (v) => set({ legendVisible: v }),
    setScopeFullscreen: (v) => set({ scopeFullscreen: v }),
    toggleSimToolbar: () => {
      const v = !get().simToolbarExpanded;
      set({ simToolbarExpanded: v });
      persistPrefs({ ...prefsFrom(get()), simToolbarExpanded: v });
    },
    setHudVisible: (v) => {
      set({ hudVisible: v });
      persistPrefs({ ...prefsFrom(get()), hudVisible: v });
    },
  };
});

function prefsFrom(s: UiState): Prefs {
  return {
    theme: s.theme,
    locale: s.locale,
    gridVisible: s.gridVisible,
    snapEnabled: s.snapEnabled,
    simulationEnabled: s.simulationEnabled,
    simulationSpeed: s.simulationSpeed,
    currentDirection: s.currentDirection,
    bottomPanelHeight: s.bottomPanelHeight,
    inspectorWidth: s.inspectorWidth,
    inspectorCollapsed: s.inspectorCollapsed,
    vizColors: s.vizColors,
    onboardingDone: s.onboardingDone,
    favoriteTypes: s.favoriteTypes,
    recentTypes: s.recentTypes,
    simToolbarExpanded: s.simToolbarExpanded,
    hudVisible: s.hudVisible,
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
}

export function applyVizColors(colors: VizColors): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  root.setProperty('--viz-current', colors.current);
  root.setProperty('--viz-vpos', colors.vpos);
  root.setProperty('--viz-vneg', colors.vneg);
  root.setProperty('--viz-ac', colors.ac);
  root.setProperty('--viz-gnd', colors.ground);
  root.setProperty('--viz-overload', colors.overload);
  root.setProperty('--viz-short', colors.short);
  root.setProperty('--viz-inactive', colors.inactive);
}

export function applyLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', locale === 'fa' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', locale === 'fa' ? 'fa' : 'en');
}
