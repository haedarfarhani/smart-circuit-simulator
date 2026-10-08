import { describe, it, expect } from 'vitest';
import {
  CHANNEL_COLORS,
  CHANNEL_IDS,
  TIME_DIV_OPTIONS,
  channelTargetState,
  computeStats,
  channelValue,
  findTriggerTime,
  makeChannel,
  stepTimeDiv,
} from './probe';
import type { ChannelSample } from './probe';

describe('probe channel model', () => {
  it('creates four distinct channels with distinct colors', () => {
    expect(CHANNEL_IDS).toEqual(['CH1', 'CH2', 'CH3', 'CH4']);
    const colors = CHANNEL_IDS.map((id) => CHANNEL_COLORS[id]);
    expect(new Set(colors).size).toBe(4);
    const ch = makeChannel('CH1');
    expect(ch.type).toBe('voltage');
    expect(ch.enabled).toBe(true);
    expect(ch.scale).toBe(0); // auto
  });

  it('voltage channel measures V(+) − V(−) from the snapshot', () => {
    const ch = makeChannel('CH1');
    ch.type = 'voltage';
    ch.positiveNodeId = 'n1';
    ch.negativeNodeId = 'n2';
    ch.useGroundRef = false;
    const snap = {
      nodeVoltages: new Map([
        ['n1', 12.5],
        ['n2', 3.25],
      ]),
      componentData: new Map(),
      wireCurrents: new Map(),
    };
    expect(channelValue(ch, snap)).toBeCloseTo(9.25, 6);
  });

  it('voltage channel with ground reference measures against 0 V', () => {
    const ch = makeChannel('CH1');
    ch.type = 'voltage';
    ch.positiveNodeId = 'n1';
    ch.useGroundRef = true;
    const snap = {
      nodeVoltages: new Map([['n1', -7.5]]),
      componentData: new Map(),
      wireCurrents: new Map(),
    };
    expect(channelValue(ch, snap)).toBeCloseTo(-7.5, 6);
  });

  it('current channel reads the component branch current', () => {
    const ch = makeChannel('CH2');
    ch.type = 'current';
    ch.branchId = 'res_1';
    ch.branchKind = 'component';
    const snap = {
      nodeVoltages: new Map(),
      componentData: new Map([
        ['res_1', { current: 0.0025 }],
      ]),
      wireCurrents: new Map(),
    };
    expect(channelValue(ch, snap)).toBeCloseTo(0.0025, 9);
  });

  it('current channel reads the wire branch current', () => {
    const ch = makeChannel('CH3');
    ch.type = 'current';
    ch.branchId = 'wire_9';
    ch.branchKind = 'wire';
    const snap = {
      nodeVoltages: new Map(),
      componentData: new Map(),
      wireCurrents: new Map([['wire_9', -0.04]]),
    };
    expect(channelValue(ch, snap)).toBeCloseTo(-0.04, 9);
  });

  it('reads 0 for nodes or branches missing from the snapshot', () => {
    const v = makeChannel('CH1');
    v.type = 'voltage';
    v.positiveNodeId = 'nX';
    v.useGroundRef = false;
    v.negativeNodeId = 'nY';
    const empty = {
      nodeVoltages: new Map(),
      componentData: new Map(),
      wireCurrents: new Map(),
    };
    expect(channelValue(v, empty)).toBe(0);

    const c = makeChannel('CH4');
    c.type = 'current';
    c.branchId = 'nope';
    c.branchKind = 'component';
    expect(channelValue(c, empty)).toBe(0);
  });
});

describe('channelTargetState (stale probe detection)', () => {
  const topology = { nodes: new Map([['n1', {}], ['n2', {}]]) };
  const doc = { components: [{ id: 'r1' }], wires: [{ id: 'w1' }] };

  it('reports no-source for never-configured channels', () => {
    expect(channelTargetState(makeChannel('CH1'), topology, doc)).toBe('no-source');
  });

  it('reports ok when the voltage nodes resolve', () => {
    const ch = makeChannel('CH1');
    ch.positiveNodeId = 'n1';
    ch.negativeNodeId = 'n2';
    ch.useGroundRef = false;
    expect(channelTargetState(ch, topology, doc)).toBe('ok');
  });

  it('reports stale when a probed node was deleted by a circuit edit', () => {
    const ch = makeChannel('CH1');
    ch.positiveNodeId = 'n1';
    ch.negativeNodeId = 'n-gone';
    ch.useGroundRef = false;
    expect(channelTargetState(ch, topology, doc)).toBe('stale');
  });

  it('reports stale for current probes on removed branches', () => {
    const ch = makeChannel('CH2');
    ch.type = 'current';
    ch.branchId = 'r-gone';
    ch.branchKind = 'component';
    expect(channelTargetState(ch, topology, doc)).toBe('stale');
    ch.branchId = 'w1';
    ch.branchKind = 'wire';
    expect(channelTargetState(ch, topology, doc)).toBe('ok');
  });
});

describe('computeStats (real samples only)', () => {
  const sine = (n: number, amp: number, f: number, dt: number) => {
    const out: ChannelSample[] = [];
    for (let i = 0; i < n; i++) {
      out.push({ t: i * dt, value: amp * Math.sin(2 * Math.PI * f * i * dt) });
    }
    return out;
  };

  it('computes max/min/avg/rms/pp of a sine', () => {
    // 10 cycles of a 5 V peak sine at 50 Hz, sampled at 1 kHz
    const samples = sine(2000, 5, 50, 1e-3);
    const st = computeStats(samples);
    expect(st.max).toBeCloseTo(5, 1);
    expect(st.min).toBeCloseTo(-5, 1);
    expect(st.pp).toBeCloseTo(10, 1);
    expect(st.avg).toBeCloseTo(0, 1);
    // RMS of a sine = amplitude / √2
    expect(st.rms).toBeCloseTo(5 / Math.SQRT2, 1);
  });

  it('estimates the fundamental frequency from zero crossings', () => {
    const samples = sine(2000, 5, 50, 1e-3);
    const st = computeStats(samples);
    expect(st.frequency).not.toBeNull();
    expect(st.frequency!).toBeCloseTo(50, 0);
  });

  it('returns a DC-biased average for offset signals', () => {
    const samples = sine(1000, 3, 50, 1e-3).map((s) => ({
      t: s.t,
      value: s.value + 2,
    }));
    const st = computeStats(samples);
    expect(st.avg).toBeCloseTo(2, 1);
    expect(st.max).toBeCloseTo(5, 1);
    expect(st.min).toBeCloseTo(-1, 1);
  });

  it('handles empty and single-sample windows', () => {
    const empty = computeStats([]);
    expect(empty.count).toBe(0);
    expect(empty.frequency).toBeNull();
    const one = computeStats([{ t: 0, value: 1.5 }]);
    expect(one.max).toBe(1.5);
    expect(one.frequency).toBeNull();
  });

  it('never reports a frequency for a constant signal', () => {
    const flat: ChannelSample[] = Array.from({ length: 100 }, (_, i) => ({
      t: i * 1e-3,
      value: 4.2,
    }));
    const st = computeStats(flat);
    expect(st.frequency).toBeNull();
    expect(st.pp).toBe(0);
  });
});

describe('findTriggerTime', () => {
  it('finds the last rising crossing of the level', () => {
    const samples: ChannelSample[] = [];
    for (let i = 0; i < 100; i++) {
      samples.push({ t: i * 1e-3, value: i < 50 ? -1 : 1 });
    }
    const t = findTriggerTime(samples, 0, 'rising');
    expect(t).toBeCloseTo(50 * 1e-3, 6);
  });

  it('finds the last falling crossing of the level', () => {
    const samples: ChannelSample[] = [];
    for (let i = 0; i < 100; i++) {
      samples.push({ t: i * 1e-3, value: i < 50 ? 1 : -1 });
    }
    const t = findTriggerTime(samples, 0, 'falling');
    expect(t).toBeCloseTo(50 * 1e-3, 6);
  });

  it('returns null when the level is never crossed', () => {
    const samples: ChannelSample[] = Array.from({ length: 10 }, (_, i) => ({
      t: i * 1e-3,
      value: 5,
    }));
    expect(findTriggerTime(samples, 0, 'rising')).toBeNull();
    expect(findTriggerTime(samples, 0, 'falling')).toBeNull();
  });

  it('steps the time base through the presets and clamps at the ends', () => {
    expect(stepTimeDiv(10e-3, 1)).toBe(20e-3);
    expect(stepTimeDiv(10e-3, -1)).toBe(5e-3);
    // clamps at both ends of the list
    expect(stepTimeDiv(TIME_DIV_OPTIONS[0], -1)).toBe(TIME_DIV_OPTIONS[0]);
    expect(
      stepTimeDiv(TIME_DIV_OPTIONS[TIME_DIV_OPTIONS.length - 1], 1),
    ).toBe(TIME_DIV_OPTIONS[TIME_DIV_OPTIONS.length - 1]);
    // a non-preset value snaps to the nearest entry, then steps
    expect(stepTimeDiv(11e-3, 1)).toBe(20e-3);
    expect(stepTimeDiv(11e-3, -1)).toBe(5e-3);
  });

  it('returns the LAST crossing, not the first', () => {
    const samples: ChannelSample[] = [];
    for (let i = 0; i < 100; i++) {
      // square wave: crossings at every 10 samples
      samples.push({ t: i * 1e-3, value: Math.floor(i / 10) % 2 === 0 ? -1 : 1 });
    }
    const t = findTriggerTime(samples, 0, 'rising');
    // last rising edge starts at sample 90
    expect(t).toBeCloseTo(90 * 1e-3, 6);
  });
});
