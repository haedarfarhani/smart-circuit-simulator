/**
 * Probe / oscilloscope configuration store.
 *
 * Holds the channel definitions, the in-progress probe
 * placement, the trigger and the time base. The measured
 * DATA lives in the simulation store (ring buffers filled
 * by the electrical loop) — this store only describes
 * WHERE the measurement happens.
 */

import { create } from 'zustand';
import type { Point } from '../models/circuit';
import {
  CHANNEL_IDS,
  type ChannelId,
  type Coupling,
  type OscilloscopeChannel,
  type ProbeType,
  type TriggerEdge,
  type TriggerMode,
  type TriggerSettings,
  makeChannel,
} from '../models/probe';

export type ProbePlacement =
  | { mode: 'idle' }
  | {
      mode: 'voltage';
      /** 1 = waiting for the + point, 2 = waiting for the − point */
      step: 1 | 2;
      plusNodeId: string | null;
      plusPoint: Point | null;
    }
  | { mode: 'current' };

const PROBE_STORAGE_KEY = 'circuit-lab:probes';

interface PersistedProbes {
  channels: OscilloscopeChannel[];
  trigger: TriggerSettings;
  timeDiv: number;
}

function loadPersisted(): PersistedProbes | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PROBE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedProbes>;
    if (!Array.isArray(parsed.channels)) return null;
    return {
      channels: parsed.channels,
      trigger: parsed.trigger ?? defaultTrigger(),
      timeDiv:
        typeof parsed.timeDiv === 'number' ? parsed.timeDiv : 10e-3,
    };
  } catch {
    return null;
  }
}

function defaultTrigger(): TriggerSettings {
  return { source: 'CH1', mode: 'auto', edge: 'rising', level: 0 };
}

function defaultChannels(): OscilloscopeChannel[] {
  return CHANNEL_IDS.map((id) => makeChannel(id));
}

function persist(state: {
  channels: OscilloscopeChannel[];
  trigger: TriggerSettings;
  timeDiv: number;
}): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const payload: PersistedProbes = {
      channels: state.channels,
      trigger: state.trigger,
      timeDiv: state.timeDiv,
    };
    localStorage.setItem(PROBE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

export interface ProbeState {
  channels: OscilloscopeChannel[];
  placement: ProbePlacement;
  trigger: TriggerSettings;
  /** seconds per division on the time axis */
  timeDiv: number;
  /** channel whose settings are being edited */
  selectedChannelId: ChannelId | null;
  /** channel highlighted on the canvas (Locate / probe click) */
  locatedChannelId: ChannelId | null;

  // Placement
  startPlacement: (type: ProbeType) => void;
  cancelPlacement: () => void;
  setVoltageFirstPoint: (nodeId: string, point: Point) => void;
  setVoltageSecondPoint: (nodeId: string, point: Point) => void;
  setCurrentBranch: (
    branchId: string,
    kind: 'component' | 'wire',
    point: Point,
    label: string,
  ) => void;

  // Channel management
  updateChannel: (
    id: ChannelId,
    patch: Partial<OscilloscopeChannel>,
  ) => void;
  removeChannel: (id: ChannelId) => void;
  clearChannels: () => void;
  setSelectedChannel: (id: ChannelId | null) => void;
  locateChannel: (id: ChannelId | null) => void;

  // Scope settings
  setTrigger: (patch: Partial<TriggerSettings>) => void;
  setTimeDiv: (div: number) => void;
}

const persisted = loadPersisted();

export const useProbeStore = create<ProbeState>((set, get) => ({
  channels: persisted?.channels ?? defaultChannels(),
  placement: { mode: 'idle' },
  trigger: persisted?.trigger ?? defaultTrigger(),
  timeDiv: persisted?.timeDiv ?? 10e-3,
  selectedChannelId: null,
  locatedChannelId: null,

  startPlacement: (type) => {
    set({
      placement:
        type === 'voltage'
          ? { mode: 'voltage', step: 1, plusNodeId: null, plusPoint: null }
          : { mode: 'current' },
      selectedChannelId: null,
    });
  },

  cancelPlacement: () => set({ placement: { mode: 'idle' } }),

  setVoltageFirstPoint: (nodeId, point) => {
    const p = get().placement;
    if (p.mode !== 'voltage') return;
    set({ placement: { ...p, step: 2, plusNodeId: nodeId, plusPoint: point } });
  },

  setVoltageSecondPoint: (nodeId, point) => {
    const p = get().placement;
    if (p.mode !== 'voltage' || p.step !== 2 || p.plusNodeId == null) return;
    if (nodeId === p.plusNodeId) return; // same point: no voltage

    const next = get().channels.map((ch) => {
      if (ch.id !== firstFreeChannel(get().channels)) return ch;
      return {
        ...ch,
        enabled: true,
        type: 'voltage' as const,
        positiveNodeId: p.plusNodeId,
        negativeNodeId: nodeId,
        useGroundRef: false,
        positivePoint: p.plusPoint,
        negativePoint: point,
        branchId: null,
        branchKind: null,
        label: ch.label,
      };
    });
    set({ channels: next, placement: { mode: 'idle' } });
    persist({ ...get(), trigger: get().trigger, timeDiv: get().timeDiv });
  },

  setCurrentBranch: (branchId, kind, point, label) => {
    if (get().placement.mode !== 'current') return;
    const free = firstFreeChannel(get().channels);
    const next = get().channels.map((ch) => {
      if (ch.id !== free) return ch;
      return {
        ...ch,
        enabled: true,
        type: 'current' as const,
        branchId,
        branchKind: kind,
        positiveNodeId: null,
        negativeNodeId: null,
        useGroundRef: false,
        positivePoint: point,
        negativePoint: null,
        label,
      };
    });
    set({ channels: next, placement: { mode: 'idle' } });
    persist({ ...get(), trigger: get().trigger, timeDiv: get().timeDiv });
  },

  updateChannel: (id, patch) => {
    const next = get().channels.map((ch) =>
      ch.id === id ? { ...ch, ...patch } : ch,
    );
    set({ channels: next });
    persist({ channels: next, trigger: get().trigger, timeDiv: get().timeDiv });
  },

  removeChannel: (id) => {
    const next = get().channels.map((ch) =>
      ch.id === id
        ? {
            ...makeChannel(id),
            label: ch.label,
            color: ch.color,
            scale: ch.scale,
            position: ch.position,
            coupling: ch.coupling,
          }
        : ch,
    );
    set({
      channels: next,
      locatedChannelId:
        get().locatedChannelId === id ? null : get().locatedChannelId,
      selectedChannelId:
        get().selectedChannelId === id ? null : get().selectedChannelId,
    });
    persist({ channels: next, trigger: get().trigger, timeDiv: get().timeDiv });
  },

  clearChannels: () => {
    const next = defaultChannels();
    set({ channels: next, locatedChannelId: null, selectedChannelId: null });
    persist({ channels: next, trigger: get().trigger, timeDiv: get().timeDiv });
  },

  setSelectedChannel: (id) => set({ selectedChannelId: id }),

  locateChannel: (id) => set({ locatedChannelId: id }),

  setTrigger: (patch) => {
    const trigger = { ...get().trigger, ...patch };
    set({ trigger });
    persist({ channels: get().channels, trigger, timeDiv: get().timeDiv });
  },

  setTimeDiv: (div) => {
    set({ timeDiv: div });
    persist({ channels: get().channels, trigger: get().trigger, timeDiv: div });
  },
}));

/** First channel that has no measurement attached yet. */
function firstFreeChannel(channels: OscilloscopeChannel[]): ChannelId {
  for (const ch of channels) {
    if (
      ch.positiveNodeId == null &&
      ch.negativeNodeId == null &&
      ch.branchId == null
    ) {
      return ch.id;
    }
  }
  // All busy: reuse the oldest (CH1) — the user can also
  // remove channels to free slots.
  return channels[0].id;
}

/** True when the channel carries a live measurement. */
export function channelHasMeasurement(
  ch: OscilloscopeChannel,
): boolean {
  if (ch.type === 'voltage') return ch.positiveNodeId != null;
  return ch.branchId != null;
}

/** Current setting of a channel as a coupling value. */
export function channelCoupling(ch: OscilloscopeChannel): Coupling {
  return ch.coupling;
}

/** Trigger edge as stored. */
export function triggerEdge(tr: TriggerSettings): TriggerEdge {
  return tr.edge;
}

/** Trigger mode as stored. */
export function triggerMode(tr: TriggerSettings): TriggerMode {
  return tr.mode;
}
