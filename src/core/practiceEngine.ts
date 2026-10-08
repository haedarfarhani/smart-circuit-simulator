import { CircuitDoc } from '../models/circuit';
import { CircuitTopology, SolverResult } from './solver';
import { analyzeCircuit } from './analyzer';

export interface PracticeChallenge {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  requirements: string[];
  hints: string[];
  validate: (doc: CircuitDoc, topology: CircuitTopology, solver: SolverResult | null) => {
    success: boolean;
    message: string;
    expected?: string;
    actual?: string;
  };
}

export const challenges: PracticeChallenge[] = [
  // ========== BEGINNER ==========
  {
    id: 'c1',
    title: 'Ohm\'s Law Basics',
    description: 'Build a circuit with a 12V battery and a resistor that draws exactly 2A of current.',
    difficulty: 'beginner',
    requirements: [
      'Add a 12V battery (V1)',
      'Add a resistor (R1)',
      'Connect them with wires',
      'Add ground to complete the circuit'
    ],
    hints: [
      'Which formula relates voltage, current and resistance?',
      'Ohm\'s Law: R = V / I',
      'R = 12V / 2A = 6Ω. Use a 6Ω resistor.'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved. Check connections and add ground.' };
      }
      
      const analysis = analyzeCircuit(doc, _topology, solver);
      if (!analysis.valid) {
        return { success: false, message: analysis.errors[0] || 'Circuit is not valid.' };
      }
      
      const bat = doc.components.find(c => c.type === 'battery' && Math.abs(c.value - 12) < 0.1);
      const res = doc.components.find(c => c.type === 'resistor');
      
      if (!bat) {
        return { success: false, message: 'Missing 12V battery.', expected: '12V battery', actual: 'Not found' };
      }
      
      if (!res) {
        return { success: false, message: 'Missing resistor.', expected: 'Resistor', actual: 'Not found' };
      }
      
      const batSol = solver.componentData.get(bat.id);
      const resSol = solver.componentData.get(res.id);
      
      if (!batSol || !resSol) {
        return { success: false, message: 'Component solutions not available.' };
      }
      
      const current = Math.abs(batSol.current);
      const resistorValue = res.value;
      const expectedR = 6;
      
      if (Math.abs(resistorValue - expectedR) < 0.5 && Math.abs(current - 2) < 0.15) {
        return {
          success: true,
          message: `✓ Correct! Current = ${current.toFixed(2)}A through ${res.value}Ω resistor.`
        };
      }
      
      return {
        success: false,
        message: `Current is ${current.toFixed(2)}A, but should be 2A.`,
        expected: '2A current',
        actual: `${current.toFixed(2)}A`
      };
    }
  },
  {
    id: 'c2',
    title: 'Series Resistors',
    description: 'Connect two resistors in series with a 10V source. The total current should be 1A.',
    difficulty: 'beginner',
    requirements: [
      'Add a 10V battery',
      'Add two resistors in series',
      'Total resistance should be 10Ω'
    ],
    hints: [
      'In series, resistors add: R_total = R₁ + R₂',
      'For 1A at 10V, you need 10Ω total',
      'Try two 5Ω resistors, or 4Ω + 6Ω, etc.'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const bat = doc.components.find(c => c.type === 'battery' && Math.abs(c.value - 10) < 0.1);
      const resistors = doc.components.filter(c => c.type === 'resistor');
      
      if (!bat) {
        return { success: false, message: 'Missing 10V battery.' };
      }
      
      if (resistors.length < 2) {
        return { success: false, message: 'Need at least 2 resistors in series.' };
      }
      
      const batSol = solver.componentData.get(bat.id);
      if (!batSol) {
        return { success: false, message: 'No solution for battery.' };
      }
      
      const current = Math.abs(batSol.current);
      
      if (Math.abs(current - 1) < 0.15) {
        const totalR = resistors.reduce((sum, r) => sum + r.value, 0);
        return {
          success: true,
          message: `✓ Correct! Total resistance = ${totalR}Ω, Current = ${current.toFixed(2)}A.`
        };
      }
      
      return {
        success: false,
        message: `Current is ${current.toFixed(2)}A, but should be 1A.`,
        expected: '1A current',
        actual: `${current.toFixed(2)}A`
      };
    }
  },
  {
    id: 'c3',
    title: 'Parallel Resistors',
    description: 'Create a parallel circuit with two 10Ω resistors and a 12V source. The total current should be 2.4A.',
    difficulty: 'beginner',
    requirements: [
      'Add a 12V battery',
      'Add two 10Ω resistors in parallel',
      'Connect to ground'
    ],
    hints: [
      'In parallel, voltage is the same across each branch',
      'Each resistor gets full 12V',
      'Each draws 1.2A, total = 2.4A'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const bat = doc.components.find(c => c.type === 'battery' && Math.abs(c.value - 12) < 0.1);
      const resistors = doc.components.filter(c => c.type === 'resistor');
      
      if (!bat || resistors.length < 2) {
        return { success: false, message: 'Need 12V battery and 2 resistors.' };
      }
      
      if (resistors.some(r => Math.abs(r.value - 10) > 0.5)) {
        return { success: false, message: 'Use 10Ω resistors.' };
      }
      
      const batSol = solver.componentData.get(bat.id);
      if (!batSol) {
        return { success: false, message: 'No solution.' };
      }
      
      const current = Math.abs(batSol.current);
      
      if (Math.abs(current - 2.4) < 0.2) {
        return {
          success: true,
          message: `✓ Perfect! Total current = ${current.toFixed(2)}A.`
        };
      }
      
      return {
        success: false,
        message: `Current is ${current.toFixed(2)}A, expected 2.4A.`,
        expected: '2.4A total current',
        actual: `${current.toFixed(2)}A`
      };
    }
  },
  // ========== INTERMEDIATE ==========
  {
    id: 'c4',
    title: 'Voltage Divider',
    description: 'Design a voltage divider using a 10V source to produce exactly 5V at the midpoint.',
    difficulty: 'intermediate',
    requirements: [
      'Use a 10V battery',
      'Two resistors in series',
      'Output voltage = 5V'
    ],
    hints: [
      'A voltage divider uses two resistors in series',
      'V_out = V_in × (R₂ / (R₁ + R₂))',
      'For 5V from 10V, use equal resistors (any value)'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const bat = doc.components.find(c => c.type === 'battery' && Math.abs(c.value - 10) < 0.1);
      const resistors = doc.components.filter(c => c.type === 'resistor');
      
      if (!bat || resistors.length < 2) {
        return { success: false, message: 'Need 10V source and 2 resistors.' };
      }
      
      // Find a resistor with ~5V across it
      let found = false;
      for (const r of resistors) {
        const sol = solver.componentData.get(r.id);
        if (sol && Math.abs(Math.abs(sol.voltage) - 5) < 0.3) {
          found = true;
          break;
        }
      }
      
      if (found) {
        return {
          success: true,
          message: `✓ Correct! You created a working voltage divider producing 5V.`
        };
      }
      
      return {
        success: false,
        message: 'No resistor has 5V across it.',
        expected: '5V across one resistor',
        actual: 'Check voltage across each resistor'
      };
    }
  },
  {
    id: 'c5',
    title: 'LED Circuit',
    description: 'Design a circuit to safely light an LED with a 9V battery. LED needs 2V and 20mA.',
    difficulty: 'intermediate',
    requirements: [
      '9V battery',
      'Resistor to limit current',
      'LED should get ~20mA'
    ],
    hints: [
      'LED drops 2V, leaving 7V for the resistor',
      'R = V/I = 7V / 0.02A = 350Ω',
      'Use a 350Ω resistor (or closest value)'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const bat = doc.components.find(c => c.type === 'battery' && Math.abs(c.value - 9) < 0.1);
      const resistors = doc.components.filter(c => c.type === 'resistor');
      
      if (!bat || resistors.length === 0) {
        return { success: false, message: 'Need 9V battery and a resistor.' };
      }
      
      const batSol = solver.componentData.get(bat.id);
      if (!batSol) {
        return { success: false, message: 'No solution.' };
      }
      
      // Check if current is around 20mA
      const current = Math.abs(batSol.current);
      
      if (current >= 0.015 && current <= 0.025) {
        return {
          success: true,
          message: `✓ LED protected! Current = ${current.toFixed(3)}A (~20mA).`
        };
      }
      
      if (current < 0.01) {
        return {
          success: false,
          message: `Current too low (${current.toFixed(3)}A). Need smaller resistor.`,
          expected: '~20mA (0.02A)',
          actual: `${current.toFixed(3)}A`
        };
      }
      
      return {
        success: false,
        message: `Current too high (${current.toFixed(3)}A). LED may burn out!`,
        expected: '~20mA (0.02A)',
        actual: `${current.toFixed(3)}A`
      };
    }
  },
  {
    id: 'c6',
    title: 'Power Calculation',
    description: 'Build a circuit where a resistor dissipates exactly 10W of power.',
    difficulty: 'intermediate',
    requirements: [
      'Choose a voltage source',
      'Choose an appropriate resistor',
      'Power = 10W'
    ],
    hints: [
      'P = V²/R or P = I²R',
      'Try 10V source with 10Ω resistor: P = 100/10 = 10W',
      'Or 20V with 40Ω: P = 400/40 = 10W'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const resistors = doc.components.filter(c => c.type === 'resistor');
      if (resistors.length === 0) {
        return { success: false, message: 'No resistors in circuit.' };
      }
      
      let found = false;
      for (const r of resistors) {
        const sol = solver.componentData.get(r.id);
        if (sol && Math.abs(Math.abs(sol.power) - 10) < 0.5) {
          found = true;
          return {
            success: true,
            message: `✓ Correct! ${r.label} dissipates ${Math.abs(sol.power).toFixed(2)}W.`
          };
        }
      }
      
      if (!found) {
        return {
          success: false,
          message: 'No resistor dissipates 10W.',
          expected: '10W power dissipation',
          actual: 'Check power for each resistor'
        };
      }
      
      return { success: false, message: 'Try again.' };
    }
  },
  {
    id: 'c7',
    title: 'Current Divider',
    description: 'Create a current divider where branch current is exactly half of total current.',
    difficulty: 'intermediate',
    requirements: [
      'Voltage source',
      'Two equal resistors in parallel',
      'Each branch gets half the current'
    ],
    hints: [
      'Equal resistors in parallel split current equally',
      'Use any value, but both must be the same',
      'Try two 100Ω resistors with any voltage source'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const resistors = doc.components.filter(c => c.type === 'resistor');
      if (resistors.length < 2) {
        return { success: false, message: 'Need at least 2 resistors.' };
      }
      
      // Check if two resistors are equal
      const r1 = resistors[0];
      const r2 = resistors[1];
      
      if (Math.abs(r1.value - r2.value) > 1) {
        return {
          success: false,
          message: 'Resistors should be equal value for equal current split.',
          expected: 'Equal resistors',
          actual: `${r1.value}Ω vs ${r2.value}Ω`
        };
      }
      
      const r1Sol = solver.componentData.get(r1.id);
      const r2Sol = solver.componentData.get(r2.id);
      
      if (!r1Sol || !r2Sol) {
        return { success: false, message: 'No solution.' };
      }
      
      const i1 = Math.abs(r1Sol.current);
      const i2 = Math.abs(r2Sol.current);
      
      if (Math.abs(i1 - i2) < 0.01 * Math.max(i1, i2)) {
        return {
          success: true,
          message: `✓ Equal split! Each branch gets ${(i1).toFixed(3)}A.`
        };
      }
      
      return {
        success: false,
        message: 'Currents not equal.',
        expected: 'Equal branch currents',
        actual: `${i1.toFixed(3)}A vs ${i2.toFixed(3)}A`
      };
    }
  },
  // ========== ADVANCED ==========
  {
    id: 'c8',
    title: 'RC Time Constant',
    description: 'Design an RC circuit with a time constant (τ) of 1 second.',
    difficulty: 'advanced',
    requirements: [
      'Voltage source',
      'Resistor and capacitor',
      'τ = R × C = 1 second'
    ],
    hints: [
      'Time constant τ = R × C',
      'For τ = 1s: try R = 1000Ω, C = 0.001F (1000µF)',
      'Or R = 10000Ω, C = 0.0001F (100µF)'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const resistor = doc.components.find(c => c.type === 'resistor');
      const capacitor = doc.components.find(c => c.type === 'capacitor');
      
      if (!resistor || !capacitor) {
        return { success: false, message: 'Need both resistor and capacitor.' };
      }
      
      const tau = resistor.value * capacitor.value;
      
      if (Math.abs(tau - 1) < 0.1) {
        return {
          success: true,
          message: `✓ Correct! Time constant τ = ${tau.toFixed(2)}s.`
        };
      }
      
      return {
        success: false,
        message: `Time constant is τ = ${tau.toFixed(2)}s, but should be 1s.`,
        expected: 'τ = 1 second',
        actual: `τ = ${tau.toFixed(2)}s`
      };
    }
  },
  {
    id: 'c9',
    title: 'Kirchhoff Voltage Law',
    description: 'Build a circuit with 3 resistors in series where voltage drops sum to source voltage.',
    difficulty: 'advanced',
    requirements: [
      'Voltage source',
      '3 resistors in series',
      'Σ voltage drops = source voltage'
    ],
    hints: [
      'KVL: Sum of voltage drops around a loop = source voltage',
      'Each resistor drops voltage proportional to its resistance',
      'Try three 10Ω resistors with 12V: each drops 4V, total = 12V'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const bat = doc.components.find(c => c.type === 'battery');
      const resistors = doc.components.filter(c => c.type === 'resistor');
      
      if (!bat || resistors.length < 3) {
        return { success: false, message: 'Need battery and 3 resistors.' };
      }
      
      const batSol = solver.componentData.get(bat.id);
      if (!batSol) {
        return { success: false, message: 'No solution.' };
      }
      
      const vin = Math.abs(batSol.voltage);
      let vsum = 0;
      
      for (const r of resistors) {
        const sol = solver.componentData.get(r.id);
        if (sol) {
          vsum += Math.abs(sol.voltage);
        }
      }
      
      if (Math.abs(vsum - vin) < 0.5) {
        return {
          success: true,
          message: `✓ KVL verified! Voltage drops sum: ${vsum.toFixed(2)}V = ${vin.toFixed(2)}V.`
        };
      }
      
      return {
        success: false,
        message: `Voltage sum ${vsum.toFixed(2)}V ≠ source ${vin.toFixed(2)}V.`,
        expected: `${vin.toFixed(2)}V total`,
        actual: `${vsum.toFixed(2)}V`
      };
    }
  },
  {
    id: 'c10',
    title: 'Custom Challenge',
    description: 'Design a circuit with V = 12V that draws exactly 100mA of current.',
    difficulty: 'advanced',
    requirements: [
      '12V power source',
      'Appropriate load(s)',
      'Total current = 100mA'
    ],
    hints: [
      'Which formula relates V, I, and R?',
      'Ohm\'s Law: R = V / I',
      'R = 12V / 0.1A = 120Ω'
    ],
    validate: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) {
        return { success: false, message: 'Circuit cannot be solved.' };
      }
      
      const bat = doc.components.find(c => c.type === 'battery' && Math.abs(c.value - 12) < 0.5);
      if (!bat) {
        return { success: false, message: 'Need ~12V source.' };
      }
      
      const batSol = solver.componentData.get(bat.id);
      if (!batSol) {
        return { success: false, message: 'No solution.' };
      }
      
      const current = Math.abs(batSol.current);
      
      if (Math.abs(current - 0.1) < 0.01) {
        return {
          success: true,
          message: `✓ Challenge completed! Current = ${current.toFixed(3)}A = 100mA.`
        };
      }
      
      return {
        success: false,
        message: `Current is ${current.toFixed(3)}A, target is 100mA.`,
        expected: '100mA (0.1A)',
        actual: `${current.toFixed(3)}A`
      };
    }
  }
];

export function getChallengeById(id: string): PracticeChallenge | undefined {
  return challenges.find(c => c.id === id);
}

export function getChallengesByDifficulty(difficulty: PracticeChallenge['difficulty']): PracticeChallenge[] {
  return challenges.filter(c => c.difficulty === difficulty);
}
