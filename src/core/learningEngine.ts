import { CircuitDoc } from '../models/circuit';
import { CircuitTopology, SolverResult } from './solver';
import { analyzeCircuit } from './analyzer';

export interface LearningStep {
  title: string;
  formula: string;
  explanation: string;
  values: string;
  result: string;
  highlightedComponents?: string[];
}

export interface LearningTopic {
  title: string;
  formula: string;
  explanation: string;
  applicable: (doc: CircuitDoc, topology: CircuitTopology, solver: SolverResult | null) => boolean;
  generate: (doc: CircuitDoc, topology: CircuitTopology, solver: SolverResult | null) => LearningStep[];
}

const learningTopics: LearningTopic[] = [
  {
    title: "Ohm's Law",
    formula: 'I = V / R',
    explanation: 'Ohm\'s law states that the current through a conductor is directly proportional to the voltage across it, and inversely proportional to its resistance.',
    applicable: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) return false;
      return doc.components.some(c => c.type === 'resistor') && 
             doc.components.some(c => c.type === 'battery');
    },
    generate: (doc, _topology, solver) => {
      const steps: LearningStep[] = [];
      const battery = doc.components.find(c => c.type === 'battery');
      const resistors = doc.components.filter(c => c.type === 'resistor');
      
      if (!battery || resistors.length === 0) return steps;
      
      const batSol = solver?.componentData.get(battery.id);
      
      steps.push({
        title: 'What We Know',
        formula: '',
        explanation: `Our circuit has a ${battery.value}V voltage source and ${resistors.length} resistor(s).`,
        values: `Voltage source: ${battery.value} V` + (batSol ? `\nSource current: ${Math.abs(batSol.current).toFixed(3)} A` : ''),
        result: '',
        highlightedComponents: [battery.id]
      });
      
      // For each resistor, show Ohm's law
      for (const res of resistors) {
        const resSol = solver?.componentData.get(res.id);
        if (!resSol || Math.abs(resSol.current) < 1e-6) continue;
        
        const voltage = Math.abs(resSol.voltage);
        const current = Math.abs(resSol.current);
        const resistance = res.value;
        
        steps.push({
          title: `Ohm's Law for ${res.label}`,
          formula: 'I = V / R',
          explanation: `To find the current through ${res.label}, we apply Ohm's Law: current equals voltage divided by resistance.`,
          values: `V = ${voltage.toFixed(2)} V\nR = ${resistance} Ω`,
          result: `I = ${voltage.toFixed(2)} / ${resistance} = ${(current).toFixed(3)} A`,
          highlightedComponents: [res.id]
        });
        
        // Also show power
        const power = Math.abs(resSol.power);
        if (power > 0.001) {
          steps.push({
            title: `Power in ${res.label}`,
            formula: 'P = V × I',
            explanation: `Electrical power is the rate of energy transfer. For a resistor, it's also P = I²R or P = V²/R.`,
            values: `V = ${voltage.toFixed(2)} V\nI = ${current.toFixed(3)} A`,
            result: `P = ${voltage.toFixed(2)} × ${current.toFixed(3)} = ${power.toFixed(3)} W`,
            highlightedComponents: [res.id]
          });
        }
      }
      
      return steps;
    }
  },
  {
    title: 'Series Circuits',
    formula: 'R_total = R₁ + R₂ + ...',
    explanation: 'In a series circuit, components are connected end-to-end. The same current flows through all components, and the total resistance is the sum of individual resistances.',
    applicable: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) return false;
      const analysis = analyzeCircuit(doc, _topology, solver);
      return analysis.components.some(c => c.seriesWith.length > 0);
    },
    generate: (doc, _topology, solver) => {
      const steps: LearningStep[] = [];
      const analysis = analyzeCircuit(doc, _topology, solver);
      
      const seriesComps = analysis.components.filter(c => c.seriesWith.length > 0);
      if (seriesComps.length === 0) return steps;
      
      const comp = seriesComps[0];
      if (!comp) return steps;
      
      const docComp = doc.components.find(c => c.id === comp.id);
      const sol = solver?.componentData.get(comp.id);
      if (!docComp || !sol) return steps;
      
      const seriesResistors = [docComp, ...doc.components.filter(c => c.id === comp.seriesWith[0])]
        .filter(c => c.type === 'resistor');
      
      if (seriesResistors.length >= 2) {
        const totalR = seriesResistors.reduce((sum, r) => sum + r.value, 0);
        steps.push({
          title: `Series Resistance - ${comp.label}`,
          formula: 'R_total = R₁ + R₂ + ...',
          explanation: `${comp.label} is in series with ${comp.seriesWith.length} other component(s). In series, resistances add up.`,
          values: seriesResistors.map(r => `R = ${r.value} Ω`).join('\n'),
          result: `R_total = ${totalR} Ω`,
          highlightedComponents: [comp.id, ...comp.seriesWith]
        });
      }
      
      return steps;
    }
  },
  {
    title: 'Parallel Circuits',
    formula: '1/R_total = 1/R₁ + 1/R₂ + ...',
    explanation: 'In a parallel circuit, components are connected across the same two points. The voltage across each component is the same, and total resistance is less than the smallest individual resistance.',
    applicable: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) return false;
      const analysis = analyzeCircuit(doc, _topology, solver);
      return analysis.components.some(c => c.parallelWith.length > 0);
    },
    generate: (doc, _topology, solver) => {
      const steps: LearningStep[] = [];
      const analysis = analyzeCircuit(doc, _topology, solver);
      
      const parallelComps = analysis.components.filter(c => c.parallelWith.length > 0);
      if (parallelComps.length === 0) return steps;
      
      const comp = parallelComps[0];
      if (!comp) return steps;
      
      const docComp = doc.components.find(c => c.id === comp.id);
      const sol = solver?.componentData.get(comp.id);
      if (!docComp || !sol) return steps;
      
      const parallelResistors = [docComp, ...doc.components.filter(c => c.id === comp.parallelWith[0])]
        .filter(c => c.type === 'resistor');
      
      if (parallelResistors.length >= 2) {
        const reciprocals = parallelResistors.map(r => 1 / r.value);
        const totalR = 1 / reciprocals.reduce((sum, r) => sum + r, 0);
        
        steps.push({
          title: `Parallel Resistance - ${comp.label}`,
          formula: '1/R_total = 1/R₁ + 1/R₂ + ...',
          explanation: `${comp.label} is in parallel with ${comp.parallelWith.length} other component(s). In parallel, the reciprocal of total resistance equals the sum of reciprocals.`,
          values: parallelResistors.map(r => `R = ${r.value} Ω`).join('\n'),
          result: `1/R_total = ${reciprocals.map(r => r.toFixed(4)).join(' + ')}\nR_total = ${totalR.toFixed(2)} Ω`,
          highlightedComponents: [comp.id, ...comp.parallelWith]
        });
      }
      
      return steps;
    }
  },
  {
    title: 'Voltage Divider',
    formula: 'V_out = V_in × (R₂ / (R₁ + R₂))',
    explanation: 'A voltage divider is a passive circuit that produces an output voltage that is a fraction of the input voltage. It\'s commonly used in sensor circuits and reference voltage generation.',
    applicable: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) return false;
      const resistors = doc.components.filter(c => c.type === 'resistor');
      if (resistors.length < 2) return false;
      
      // Check if we have two resistors in series with a voltage source
      const battery = doc.components.find(c => c.type === 'battery');
      if (!battery) return false;
      
      const analysis = analyzeCircuit(doc, _topology, solver);
      const seriesResistors = analysis.components.filter(c => 
        c.type === 'resistor' && c.seriesWith.length > 0
      );
      
      return seriesResistors.length >= 2;
    },
    generate: (doc, _topology, solver) => {
      const steps: LearningStep[] = [];
      const battery = doc.components.find(c => c.type === 'battery');
      const resistors = doc.components.filter(c => c.type === 'resistor');
      
      if (!battery || resistors.length < 2) return steps;
      
      const batSol = solver?.componentData.get(battery.id);
      const Vin = batSol ? Math.abs(batSol.voltage) : battery.value;
      
      // Find two resistors that might form a voltage divider
      if (resistors.length >= 2) {
        const r1 = resistors[0];
        const r2 = resistors[1];
        const r1Sol = solver?.componentData.get(r1.id);
        const r2Sol = solver?.componentData.get(r2.id);
        
        if (r1Sol && r2Sol) {
          const actualVout = Math.abs(r2Sol.voltage);
          const predictedVout = Vin * (r2.value / (r1.value + r2.value));
          
          steps.push({
            title: 'Voltage Divider Analysis',
            formula: 'V_out = V_in × (R₂ / (R₁ + R₂))',
            explanation: `With ${r1.label} (${r1.value}Ω) and ${r2.label} (${r2.value}Ω) in series across ${Vin.toFixed(1)}V:`,
            values: `V_in = ${Vin.toFixed(2)} V\nR₁ = ${r1.value} Ω\nR₂ = ${r2.value} Ω`,
            result: `V_out = ${Vin.toFixed(2)} × (${r2.value} / (${r1.value} + ${r2.value}))\nV_out = ${predictedVout.toFixed(3)} V\n\nActual: ${actualVout.toFixed(3)} V`,
            highlightedComponents: [r1.id, r2.id, battery.id]
          });
        }
      }
      
      return steps;
    }
  },
  {
    title: 'Current Divider',
    formula: 'I₁ = I_total × (R₂ / (R₁ + R₂))',
    explanation: 'A current divider splits current between parallel branches. The current through each branch is inversely proportional to its resistance.',
    applicable: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) return false;
      const analysis = analyzeCircuit(doc, _topology, solver);
      return analysis.components.some(c => c.parallelWith.length > 0 && c.type === 'resistor');
    },    generate: (doc, _topology, solver) => {
      const steps: LearningStep[] = [];
      const analysis = analyzeCircuit(doc, _topology, solver);
      
      const parallelResistors = analysis.components.filter(c => 
        c.type === 'resistor' && c.parallelWith.length > 0
      );
      
      if (parallelResistors.length < 2) return steps;
      
      const r1 = doc.components.find(c => c.id === parallelResistors[0].id);
      const r2Id = parallelResistors[0].parallelWith[0];
      const r2 = r2Id ? doc.components.find(c => c.id === r2Id) : undefined;
      const r1Sol = r1 ? solver?.componentData.get(r1.id) : undefined;
      const r2Sol = r2 ? solver?.componentData.get(r2.id) : undefined;
      
      if (!r1 || !r2 || !r1Sol || !r2Sol) return steps;
      
      const itotal = Math.abs(r1Sol.current) + Math.abs(r2Sol.current);
      const predictedI1 = itotal * (r2.value / (r1.value + r2.value));
      
      steps.push({
        title: 'Current Divider Analysis',
        formula: 'I₁ = I_total × (R₂ / (R₁ + R₂))',
        explanation: `Current splits between ${r1.label} (${r1.value}Ω) and ${r2.label} (${r2.value}Ω) in parallel:`,
        values: `I_total = ${itotal.toFixed(3)} A\nR₁ = ${r1.value} Ω\nR₂ = ${r2.value} Ω`,
        result: `I₁ = ${itotal.toFixed(3)} × (${r2.value} / (${r1.value} + ${r2.value}))\nI₁ = ${predictedI1.toFixed(3)} A\n\nActual: ${Math.abs(r1Sol.current).toFixed(3)} A`,
        highlightedComponents: [r1.id, r2.id]
      });
      
      return steps;
    }
  },
  {
    title: 'Electrical Power',
    formula: 'P = V × I = I²R = V²/R',
    explanation: 'Electrical power measures the rate of energy transfer in a circuit. It can be calculated using voltage and current, or resistance and current/voltage.',
    applicable: (doc, _topology, solver) => {
      if (!solver || !solver.isValid) return false;
      return doc.components.some(c => c.type === 'resistor' || c.type === 'lamp');
    },
    generate: (doc, _topology, solver) => {
      const steps: LearningStep[] = [];
      const loads = doc.components.filter(c => c.type === 'resistor' || c.type === 'lamp');
      
      for (const load of loads) {
        const sol = solver?.componentData.get(load.id);
        if (!sol || Math.abs(sol.power) < 0.001) continue;
        
        const V = Math.abs(sol.voltage);
        const I = Math.abs(sol.current);
        // R comes from the solution, not from the stored value: a lamp's value
        // is its watt rating, so its resistance is V²/P at the supply.
        const R = I > 1e-9 ? V / I : load.value;
        const P = Math.abs(sol.power);
        
        steps.push({
          title: `Power in ${load.label}`,
          formula: 'P = V × I',
          explanation: `${load.label} (${load.type === 'lamp' ? 'lamp' : 'resistor'}) dissipates ${P.toFixed(3)}W of power as ${load.type === 'lamp' ? 'light and heat' : 'heat'}.`,
          values: `V = ${V.toFixed(2)} V\nI = ${I.toFixed(3)} A\nR = ${R} Ω`,
          result: `P = ${V.toFixed(2)} × ${I.toFixed(3)} = ${P.toFixed(3)} W\n\nAlso: P = I²R = ${(I*I*R).toFixed(3)} W\nP = V²/R = ${(V*V/R).toFixed(3)} W`,
          highlightedComponents: [load.id]
        });
      }
      
      return steps;
    }
  }
];

export function generateLearningContent(
  doc: CircuitDoc,
  topology: CircuitTopology,
  solverResult: SolverResult | null
): LearningStep[] {
  const steps: LearningStep[] = [];

  if (!topology || topology.nodes.size === 0) {
    return [
      {
        title: 'Build a Circuit',
        formula: '—',
        explanation: 'Start by adding components to your circuit. You need at least a power source (battery), a load (resistor), and connections between them.',
        values: '',
        result: 'Tip: Add a ground component to establish a reference point.'
      }
    ];
  }

  if (!solverResult || !solverResult.isValid) {
    const errors = solverResult?.error ? [solverResult.error] : [];
    return [
      {
        title: 'Circuit Cannot Be Solved',
        formula: '—',
        explanation: errors.length > 0 
          ? `The circuit has issues that prevent simulation: ${errors[0]}`
          : 'The circuit cannot be solved currently. Check your connections.',
        values: `Components: ${doc.components.length}\nNodes: ${topology.nodes.size}`,
        result: 'Ensure there is a complete closed loop from power source through load(s) back to ground.'
      }
    ];
  }

  // Generate learning content from applicable topics
  for (const topic of learningTopics) {
    if (topic.applicable(doc, topology, solverResult)) {
      const topicSteps = topic.generate(doc, topology, solverResult);
      steps.push(...topicSteps);
    }
  }

  // If no specific topics apply, provide general circuit info
  if (steps.length === 0) {
    const battery = doc.components.find(c => c.type === 'battery');
    const resistors = doc.components.filter(c => c.type === 'resistor');
    const totalR = resistors.reduce((sum, r) => sum + r.value, 0);
    const batSol = battery ? solverResult?.componentData.get(battery.id) : undefined;
    
    steps.push({
      title: 'Circuit Summary',
      formula: 'KVL & KCL',
      explanation: 'The simulation solved your circuit using Kirchhoff\'s laws:\n• KVL (Kirchhoff Voltage Law): Sum of voltages around any loop = 0\n• KCL (Kirchhoff Current Law): Sum of currents at any node = 0',
      values: `Power source: ${battery ? `${battery.value}V` : 'None'}\nResistors: ${resistors.length} (${totalR > 0 ? totalR + 'Ω total' : 'none'})\nNodes: ${topology.nodes.size}\nBranches: ${doc.components.length}`,
      result: batSol 
        ? `Source voltage: ${Math.abs(batSol.voltage).toFixed(2)}V\nSource current: ${Math.abs(batSol.current).toFixed(3)}A\nTotal power: ${Math.abs(batSol.power).toFixed(3)}W`
        : 'No power source detected.'
    });
  }

  return steps;
}

export function getAllTopics(): { title: string; formula: string; explanation: string }[] {
  return learningTopics.map(t => ({
    title: t.title,
    formula: t.formula,
    explanation: t.explanation
  }));
}
