import { create } from 'zustand';

export type Tool = 'select' | 'wire';

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
export type Theme = 'dark' | 'light';
export type CurrentDirection = 'conventional' | 'electron';
export type InspectorTab = 'properties' | 'analysis' | 'learning' | 'practice';
export type BottomPanelTab = 'simulation' | 'oscilloscope' | 'measurements';
export type Locale = 'en' | 'fa';
export type DialogKind = 'about' | 'transfer-import' | 'transfer-export' | null;

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
}

export const MIN_BOTTOM_PANEL_HEIGHT = 200;
export const MAX_BOTTOM_PANEL_HEIGHT = 720;
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 290;

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
    return {
      theme: p.theme === 'light' ? 'light' : 'dark',
      locale: p.locale === 'fa' ? 'fa' : 'en',
      gridVisible: p.gridVisible !== false,
      snapEnabled: p.snapEnabled !== false,
      simulationEnabled: p.simulationEnabled === true,
      simulationSpeed: typeof p.simulationSpeed === 'number' ? p.simulationSpeed : 1,
      currentDirection: p.currentDirection === 'electron' ? 'electron' : 'conventional',
      bottomPanelHeight: height,
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
  sidebarCollapsed: boolean;

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
    sidebarCollapsed: false,

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
      const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
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
    toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
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
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

export function applyLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', locale === 'fa' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', locale === 'fa' ? 'fa' : 'en');
}
