/**
 * Every bundled digital example must be a working circuit: the DC solve
 * must succeed, the transient engine must run cleanly, and no unintended
 * contention or invalid-state warnings may appear (floating-input notes
 * ARE allowed — several examples deliberately leave load pins open).
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLE_CIRCUITS } from './examples';
import { buildTopology, solveCircuit } from './solver';
import { stepSimulation, DEFAULT_DT, type SimulationState } from './simulationEngine';

const digitalExamples = EXAMPLE_CIRCUITS.filter((e) => e.id.startsWith('dig-'));

describe('bundled digital examples', () => {
  it('registers the full digital example set', () => {
    expect(digitalExamples.length).toBeGreaterThanOrEqual(16);
  });

  for (const ex of digitalExamples) {
    it(`runs "${ex.id}" through the DC solve and the transient engine`, () => {
      const topology = buildTopology(ex.doc);
      const dc = solveCircuit(ex.doc);
      expect(dc.isValid).toBe(true);

      const state: SimulationState = {
        doc: ex.doc,
        topology,
        capacitorVoltage: new Map(),
        inductorCurrent: new Map(),
        simTime: 0,
        status: 'running',
        snapshot: null,
        errors: [],
        warnings: [],
      };
      let last = null;
      for (let i = 0; i < 40; i++) {
        last = stepSimulation(ex.doc, topology, state, DEFAULT_DT);
        state.snapshot = last;
        expect(last.valid).toBe(true);
      }

      // No output contention anywhere (a contended example is a wiring bug).
      const contention = last!.warnings.filter((w) =>
        w.toLowerCase().includes('contention'),
      );
      expect(contention).toEqual([]);

      // No unknown logic states at the end of a settled run: every
      // deterministic example should reach definite levels.
      const xStates: string[] = [];
      for (const sol of last!.componentData.values()) {
        if (!sol.digital) continue;
        for (const v of sol.digital.outputs) {
          if (v === 'X') xStates.push(sol.digital!.outputNames.join(','));
        }
      }
      expect(xStates).toEqual([]);
    });
  }
});
