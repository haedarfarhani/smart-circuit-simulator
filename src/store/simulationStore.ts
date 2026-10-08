import { create } from 'zustand';
import { buildTopology, solveCircuit, type SolverResult } from '../core/solver';
import { analyzeCircuit, type CircuitAnalysisReport } from '../core/analyzer';
import {
  type SimulationSnapshot,
  type SimulationState as EngineState,
  stepSimulation,
  DEFAULT_DT,
} from '../core/simulationEngine';
import { useCircuitStore } from './circuitStore';
import { useUiStore } from './uiStore';
import { useProbeStore } from './probeStore';
import {
  channelValue,
  type ChannelId,
  type ChannelSample,
  MAX_CHANNEL_SAMPLES,
} from '../models/probe';

// ---------------------------------------------------------------------------
// Speed presets (simulation-time multiplier, not electrical equations)
// ---------------------------------------------------------------------------

/** Fresh, empty per-channel sample buffers. */
function emptyChannelSamples(): Record<ChannelId, ChannelSample[]> {
  return { CH1: [], CH2: [], CH3: [], CH4: [] };
}

export const SIM_SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 4, 10] as const;
export type SimSpeedPreset = (typeof SIM_SPEED_PRESETS)[number];

export function simSpeedLabel(s: number): string {
  if (s === 0.1) return '0.1×';
  if (s === 0.25) return '0.25×';
  if (s === 0.5) return '0.5×';
  if (s === 1) return '1×';
  if (s === 2) return '2×';
  if (s === 4) return '4×';
  if (s === 10) return '10×';
  return `${s.toFixed(2)}×`;
}

// ---------------------------------------------------------------------------
// Public snapshot type (renderers read this)
// ---------------------------------------------------------------------------

/** The instantaneous electrical state at one simulation timestep. Every
 * visual layer — current flow, LED glow, oscilloscope, motor RPM, energy
 * bars — reads from this, never from timers or fake animations. */
export type SimSnapshot = SimulationSnapshot;

/** Oscilloscope/history samples. These are TAKEN from the simulation
 * snapshot at a configured rate; they are a visualization aid, not the
 * electrical state itself. Values are the signed instantaneous
 * quantities so a waveform keeps its polarity. */
export interface MeasurementSample {
  simTime: number;
  voltage: number;
  current: number;
  power: number;
}

/** The store holds both the public simulation state and the hidden
 * energy-storage integrator state (capacitor voltages, inductor
 * currents, and the fixed-dt accumulator). The hidden fields are
 * mutated by the electrical loop only. */
export interface SimulationState {
  status: 'stopped' | 'running' | 'paused';
  /** Simulation time in seconds. This is the electrical clock, not wall time. */
  simTime: number;
  /** The most recent per-timestep electrical snapshot. */
  snapshot: SimSnapshot | null;
  /** Topology from the last solve. */
  topology: import('../core/solver').CircuitTopology | null;
  /** DC/AC steady-state analysis (still used by the analyzer panel). */
  analysis: CircuitAnalysisReport | null;
  /** Steady-state solver result (RMS/DC operating point) for the analyzer,
   * learning and practice panels. Live visuals read `snapshot` instead. */
  solverResult: SolverResult | null;
  /** Oscilloscope history samples. */
  samples: MeasurementSample[];
  /** Per-probe-channel rolling history, filled from the
   * simulation snapshot at the sampling rate. This is the
   * data the oscilloscope renders — real measurements only. */
  channelSamples: Record<ChannelId, ChannelSample[]>;
  errors: string[];
  warnings: string[];
  /** How many solver timesteps per second of simulation time (fixed). */
  dt: number;
  /** Sampling rate for oscilloscope history (Hz). */
  samplingRate: number;
  maxSamples: number;

  // Hidden integrator state — not read by renderers directly
  capacitorVoltage: Map<string, number>;
  inductorCurrent: Map<string, number>;

  // Controls
  start: () => void;
  pause: () => void;
  stop: () => void;
  reset: () => void;
  singleStep: () => void;
  setSimSpeed: (preset: SimSpeedPreset) => void;
  setSamplingRate: (rate: number) => void;
  clearSamples: () => void;
  /** Reset the oscilloscope channel histories. */
  clearChannelSamples: () => void;
  recalculate: () => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => {
  return {
    status: 'stopped',
    simTime: 0,
    snapshot: null,
    topology: null,
    analysis: null,
    solverResult: null,
    samples: [],
    channelSamples: emptyChannelSamples(),
    errors: [],
    warnings: [],
    dt: DEFAULT_DT,
    samplingRate: 1000, // Hz — 20 points per cycle at 50 Hz
    maxSamples: 10000,
    capacitorVoltage: new Map(),
    inductorCurrent: new Map(),

    start: () => {
      const s = get();
      if (s.status === 'stopped') {
        // Re-initialise engine state from fresh document
        const doc = useCircuitStore.getState().doc;
        const topology = buildTopology(doc);
        set({
          status: 'running',
          simTime: 0,
          topology,
          snapshot: null,
          samples: [],
          channelSamples: emptyChannelSamples(),
          errors: [],
          warnings: [],
          capacitorVoltage: new Map(),
          inductorCurrent: new Map(),
        });
        // Re-calc topology/analysis for the analyzer panel
        const result = solveCircuit(doc);
        const analysis = analyzeCircuit(doc, topology, result);
        set({
          topology,
          analysis,
          solverResult: result,
          errors: [...analysis.errors],
          warnings: [...analysis.warnings],
        });
      } else {
        set({ status: 'running' });
      }
      useUiStore.getState().setSimulationEnabled(true);
    },

    pause: () => set({ status: 'paused' }),

    stop: () => {
      set({ status: 'stopped', simTime: 0, samples: [], channelSamples: emptyChannelSamples() });
      useUiStore.getState().setSimulationEnabled(false);
    },

    reset: () => {
      const doc = useCircuitStore.getState().doc;
      const topology = buildTopology(doc);
      const result = solveCircuit(doc);
      const analysis = analyzeCircuit(doc, topology, result);
      set({
        status: 'stopped',
        simTime: 0,
        topology,
        snapshot: null,
        samples: [],
        channelSamples: emptyChannelSamples(),
        errors: [...analysis.errors],
        warnings: [...analysis.warnings],
        analysis,
        solverResult: result,
        capacitorVoltage: new Map(),
        inductorCurrent: new Map(),
      });
    },

    singleStep: () => {
      const s = get();
      if (s.status !== 'paused' && s.status !== 'stopped') return;
      // Run exactly one electrical timestep
      const doc = useCircuitStore.getState().doc;
      const topology = s.topology ?? buildTopology(doc);
      if (!topology) return;
      const engineState: EngineState = {
        doc,
        topology,
        capacitorVoltage: s.capacitorVoltage ?? new Map(),
        inductorCurrent: s.inductorCurrent ?? new Map(),
        simTime: s.simTime,
        status: 'paused',
        snapshot: s.snapshot,
        errors: s.errors,
        warnings: s.warnings,
      };
      const snap = stepSimulation(doc, topology, engineState, s.dt);
      const compId =
        doc.components.find(
          (c) => c.type === 'battery' || c.type === 'acVoltageSource',
        )?.id ?? '';
      const last = compId ? snap.componentData.get(compId) : undefined;
      const sample: MeasurementSample = {
        simTime: snap.simTime,
        voltage: last ? last.voltage : 0,
        current: last ? last.current : 0,
        power: last ? last.power : 0,
      };
      const probeChannels = useProbeStore.getState().channels;
      const nextChannels: Record<ChannelId, ChannelSample[]> = {
        CH1: [...s.channelSamples.CH1],
        CH2: [...s.channelSamples.CH2],
        CH3: [...s.channelSamples.CH3],
        CH4: [...s.channelSamples.CH4],
      };
      for (const ch of probeChannels) {
        if (!ch.enabled) continue;
        const value = channelValue(ch, snap);
        const buf = nextChannels[ch.id];
        buf.push({ t: snap.simTime, value });
        if (buf.length > MAX_CHANNEL_SAMPLES) {
          nextChannels[ch.id] = buf.slice(-MAX_CHANNEL_SAMPLES);
        }
      }
      set((st) => {
        const ns = [...st.samples, sample];
        return {
          simTime: snap.simTime,
          snapshot: snap,
          topology,
          capacitorVoltage: engineState.capacitorVoltage,
          inductorCurrent: engineState.inductorCurrent,
          samples: ns.length > st.maxSamples ? ns.slice(-st.maxSamples) : ns,
          channelSamples: nextChannels,
        };
      });
    },

    setSimSpeed: (preset) => {
      // Speed only affects how fast simulation time advances relative to
      // wall time. The electrical equations are unchanged.
      useUiStore.getState().setSimulationSpeed(preset);
    },

    setSamplingRate: (rate) =>
      set({ samplingRate: Math.max(1, Math.min(5000, rate)) }),

    clearSamples: () => set({ samples: [], simTime: 0 }),

    clearChannelSamples: () => set({ channelSamples: emptyChannelSamples() }),

    recalculate: () => {
      const doc = useCircuitStore.getState().doc;
      const topology = buildTopology(doc);
      const result = solveCircuit(doc);
      const analysis = analyzeCircuit(doc, topology, result);
      set({
        topology,
        analysis,
        solverResult: result,
        errors: [...analysis.errors],
        warnings: [...analysis.warnings],
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Fixed-dt electrical loop (separate from requestAnimationFrame)
// ---------------------------------------------------------------------------

/** The electrical solver runs on its own fixed clock. We schedule it
 * from the render rAF loop, but the electrical state advances in
 * FIXED dt chunks with an accumulator, so the electrical timestep is
 * fully independent of the frame rate. All steps for a frame are
 * computed first and a SINGLE store update is published afterwards —
 * React never re-renders per electrical timestep. */

/** Fractional simulation time carried between frames. */
let dtAccumulator = 0;
let lastWall = performance.now();

/** Safety valve: at most this many electrical steps per frame. If a
 * frame cannot keep up (very high speed × heavy circuit), simulation
 * time is dropped rather than letting the loop spiral. */
const MAX_STEPS_PER_FRAME = 4000;

function electricalLoop() {
  const store = useSimulationStore.getState();
  const ui = useUiStore.getState();

  if (store.status === 'running') {
    const now = performance.now();
    const wallDt = Math.min((now - lastWall) / 1000, 0.1);
    lastWall = now;

    // Simulation speed: how fast sim-time advances relative to wall
    // time. It never touches the electrical equations.
    const speed = Math.max(0.1, ui.simulationSpeed);
    dtAccumulator += wallDt * speed;

    const doc = useCircuitStore.getState().doc;
    let topology = store.topology;
    if (!topology) {
      topology = buildTopology(doc);
      store.recalculate();
    }

    // Local working copies: the engine mutates the energy-state maps
    // and the clock as it steps, so the frame publishes one coherent
    // final state instead of one update per timestep.
    let capacitorVoltage = store.capacitorVoltage ?? new Map<string, number>();
    let inductorCurrent = store.inductorCurrent ?? new Map<string, number>();
    let simTime = store.simTime;
    let snapshot = store.snapshot;
    let samples = store.samples;
    let channelSamples = store.channelSamples ?? emptyChannelSamples();
    let errors = store.errors;
    let warnings = store.warnings;

    const sourceId =
      doc.components.find(
        (c) => c.type === 'battery' || c.type === 'acVoltageSource',
      )?.id ?? '';

    // Probe channels whose measurements feed the oscilloscope.
    const probeChannels = useProbeStore.getState().channels;

    let steps = 0;
    while (dtAccumulator >= store.dt && steps < MAX_STEPS_PER_FRAME) {
      const engineState: EngineState = {
        doc,
        topology,
        capacitorVoltage,
        inductorCurrent,
        simTime,
        status: 'running',
        snapshot,
        errors,
        warnings,
      };
      const snap = stepSimulation(doc, topology, engineState, store.dt);

      // Publish the mutated integrator state for the next iteration.
      capacitorVoltage = engineState.capacitorVoltage;
      inductorCurrent = engineState.inductorCurrent;
      simTime = snap.simTime;
      snapshot = snap;

      // Take a history sample at the configured sampling rate.
      const lastSample = samples[samples.length - 1];
      if (!lastSample || snap.simTime - lastSample.simTime >= 1 / store.samplingRate) {
        const lastReal = sourceId ? snap.componentData.get(sourceId) : undefined;
        const sample: MeasurementSample = {
          simTime: snap.simTime,
          voltage: lastReal ? lastReal.voltage : 0,
          current: lastReal ? lastReal.current : 0,
          power: lastReal ? lastReal.power : 0,
        };
        samples = [...samples, sample];
        if (samples.length > store.maxSamples)
          samples = samples.slice(-store.maxSamples);

        // Sample every probe channel from the SAME snapshot the
        // renderers use — the oscilloscope never measures anything
        // on its own.
        const nextChannels: Record<ChannelId, ChannelSample[]> = {
          CH1: channelSamples.CH1,
          CH2: channelSamples.CH2,
          CH3: channelSamples.CH3,
          CH4: channelSamples.CH4,
        };
        for (const ch of probeChannels) {
          if (!ch.enabled) continue;
          const value = channelValue(ch, snap);
          const buf = nextChannels[ch.id];
          const lastCh = buf[buf.length - 1];
          if (lastCh && snap.simTime - lastCh.t < 1 / store.samplingRate) {
            // Replace the partial sample so the buffer stays
            // aligned with the sampling clock.
            buf[buf.length - 1] = { t: snap.simTime, value };
          } else {
            buf.push({ t: snap.simTime, value });
            if (buf.length > MAX_CHANNEL_SAMPLES) {
              nextChannels[ch.id] = buf.slice(-MAX_CHANNEL_SAMPLES);
            }
          }
        }
        channelSamples = nextChannels;
      }

      if (!snap.valid && snap.error) {
        errors = [...errors, snap.error].slice(-50);
      }
      if (snap.warnings.length) {
        warnings = [...warnings, ...snap.warnings].slice(-50);
      }

      dtAccumulator -= store.dt;
      steps++;
    }

    if (steps >= MAX_STEPS_PER_FRAME) {
      // Could not keep up: drop the remainder so the loop stays real-time.
      dtAccumulator = 0;
    }

    if (steps > 0) {
      useSimulationStore.setState({
        simTime,
        snapshot,
        topology,
        capacitorVoltage,
        inductorCurrent,
        samples,
        channelSamples,
        errors,
        warnings,
      });
    }
  } else {
    lastWall = performance.now();
    dtAccumulator = 0;
  }

  requestAnimationFrame(electricalLoop);
}

// Start the loop once. It keeps running; only the 'running' status drives
// electrical advancement.
if (typeof requestAnimationFrame !== 'undefined') {
  requestAnimationFrame(electricalLoop);
}

// Recalculate topology/analysis on document changes (analyzer panel still
// needs the DC/AC steady-state results).
let lastDoc = useCircuitStore.getState().doc;
useCircuitStore.subscribe((state) => {
  if (state.doc !== lastDoc) {
    lastDoc = state.doc;
    useSimulationStore.getState().recalculate();
  }
});

// Sync with the UI simulation toggle.
useUiStore.subscribe((state, prevState) => {
  const store = useSimulationStore.getState();
  if (state.simulationEnabled && !prevState.simulationEnabled) {
    store.start();
  } else if (!state.simulationEnabled && prevState.simulationEnabled) {
    store.stop();
  }
});

// Initial analysis (not a running simulation).
useSimulationStore.getState().recalculate();
