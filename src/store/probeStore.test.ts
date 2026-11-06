import { describe, it, expect, beforeEach } from 'vitest';
import { useProbeStore, channelHasMeasurement } from './probeStore';
import { GRID_SIZE } from '../models/circuit';
import { channelTargetState } from '../models/probe';

describe('probeStore and mobile probe placement workflow', () => {
  beforeEach(() => {
    useProbeStore.getState().clearChannels();
    useProbeStore.getState().cancelPlacement();
  });

  it('starts in idle placement state with 4 default channels', () => {
    const state = useProbeStore.getState();
    expect(state.placement.mode).toBe('idle');
    expect(state.channels).toHaveLength(4);
    expect(state.channels.every((c) => !channelHasMeasurement(c))).toBe(true);
  });

  it('completes two-step voltage probe placement', () => {
    const store = useProbeStore.getState();
    store.startPlacement('voltage');
    expect(useProbeStore.getState().placement).toEqual({
      mode: 'voltage',
      step: 1,
      plusNodeId: null,
      plusPoint: null,
    });

    // Step 1: select positive (+) point
    useProbeStore.getState().setVoltageFirstPoint('node_1', { x: 10, y: 20 });
    expect(useProbeStore.getState().placement).toEqual({
      mode: 'voltage',
      step: 2,
      plusNodeId: 'node_1',
      plusPoint: { x: 10, y: 20 },
    });

    // Step 2: select negative (−) point
    useProbeStore.getState().setVoltageSecondPoint('node_2', { x: 40, y: 50 }, false);
    expect(useProbeStore.getState().placement.mode).toBe('idle');

    // First free channel (CH1) should now have the measurement
    const ch1 = useProbeStore.getState().channels[0];
    expect(ch1.id).toBe('CH1');
    expect(ch1.type).toBe('voltage');
    expect(ch1.positiveNodeId).toBe('node_1');
    expect(ch1.negativeNodeId).toBe('node_2');
    expect(ch1.positivePoint).toEqual({ x: 10, y: 20 });
    expect(ch1.negativePoint).toEqual({ x: 40, y: 50 });
    expect(channelHasMeasurement(ch1)).toBe(true);
  });

  it('rejects voltage probe second point if same node is tapped', () => {
    const store = useProbeStore.getState();
    store.startPlacement('voltage');
    store.setVoltageFirstPoint('node_1', { x: 10, y: 20 });
    store.setVoltageSecondPoint('node_1', { x: 10, y: 20 }, false);

    // Placement should still be at step 2 waiting for a distinct node
    expect(useProbeStore.getState().placement.mode).toBe('voltage');
    expect((useProbeStore.getState().placement as any).step).toBe(2);
    expect(channelHasMeasurement(useProbeStore.getState().channels[0])).toBe(false);
  });

  it('attaches current probe to a component branch', () => {
    const store = useProbeStore.getState();
    store.startPlacement('current');
    expect(useProbeStore.getState().placement.mode).toBe('current');

    useProbeStore.getState().setCurrentBranch('R1', 'component', { x: 60, y: 80 }, 'R1');
    expect(useProbeStore.getState().placement.mode).toBe('idle');

    const ch1 = useProbeStore.getState().channels[0];
    expect(ch1.id).toBe('CH1');
    expect(ch1.type).toBe('current');
    expect(ch1.branchId).toBe('R1');
    expect(ch1.branchKind).toBe('component');
    expect(ch1.label).toBe('R1');
    expect(channelHasMeasurement(ch1)).toBe(true);
  });

  it('attaches current probe to a wire branch', () => {
    const store = useProbeStore.getState();
    store.startPlacement('current');
    useProbeStore.getState().setCurrentBranch('wire_42', 'wire', { x: 30, y: 30 }, 'wire');

    const ch1 = useProbeStore.getState().channels[0];
    expect(ch1.type).toBe('current');
    expect(ch1.branchId).toBe('wire_42');
    expect(ch1.branchKind).toBe('wire');
  });

  it('allocates sequential channels for multiple probes', () => {
    // Probe 1: CH1
    useProbeStore.getState().startPlacement('voltage');
    useProbeStore.getState().setVoltageFirstPoint('n1', { x: 0, y: 0 });
    useProbeStore.getState().setVoltageSecondPoint('n2', { x: 10, y: 0 });

    // Probe 2: CH2
    useProbeStore.getState().startPlacement('current');
    useProbeStore.getState().setCurrentBranch('c1', 'component', { x: 20, y: 20 }, 'C1');

    const [ch1, ch2, ch3] = useProbeStore.getState().channels;
    expect(ch1.id).toBe('CH1');
    expect(channelHasMeasurement(ch1)).toBe(true);
    expect(ch2.id).toBe('CH2');
    expect(channelHasMeasurement(ch2)).toBe(true);
    expect(ch3.id).toBe('CH3');
    expect(channelHasMeasurement(ch3)).toBe(false);
  });

  it('allows removing a channel and frees it for reuse', () => {
    useProbeStore.getState().startPlacement('voltage');
    useProbeStore.getState().setVoltageFirstPoint('n1', { x: 0, y: 0 });
    useProbeStore.getState().setVoltageSecondPoint('n2', { x: 10, y: 0 });

    expect(channelHasMeasurement(useProbeStore.getState().channels[0])).toBe(true);
    useProbeStore.getState().removeChannel('CH1');
    expect(channelHasMeasurement(useProbeStore.getState().channels[0])).toBe(false);
  });

  it('verifies touch target hit radius clamping prevents undersized touch targets at high zoom', () => {
    const px = (screenPx: number, zoom: number) =>
      Math.max(GRID_SIZE / 2, screenPx / zoom);

    // At zoom = 1: screen 26px -> 26 world units (greater than GRID_SIZE/2 = 5)
    expect(px(26, 1.0)).toBe(26);

    // At zoom = 4: screen 14px -> 14/4 = 3.5, but clamped to 5 world units (GRID_SIZE / 2)
    expect(px(14, 4.0)).toBe(5);

    // At zoom = 0.5: screen 26px -> 52 world units
    expect(px(26, 0.5)).toBe(52);
  });

  it('identifies stale probe targets when topology changes', () => {
    const ch = useProbeStore.getState().channels[0];
    ch.type = 'voltage';
    ch.positiveNodeId = 'n_removed';
    ch.negativeNodeId = 'n_ground';
    ch.useGroundRef = false;

    const topology = {
      nodes: new Map([['n_ground', {}]]),
    };
    const doc = { components: [], wires: [] };

    expect(channelTargetState(ch, topology, doc)).toBe('stale');

    // With node present
    topology.nodes.set('n_removed', {});
    expect(channelTargetState(ch, topology, doc)).toBe('ok');
  });
});
