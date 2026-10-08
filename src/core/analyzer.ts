import { CircuitDoc } from '../models/circuit';
import { CircuitTopology, SolverResult } from './solver';

export interface ComponentAnalysis {
  id: string;
  label: string;
  type: string;
  value: number;
  voltage: number;
  current: number;
  power: number;
  state: 'normal' | 'overload' | 'shorted' | 'open';
  nodeA: string;
  nodeB: string;
  seriesWith: string[];
  parallelWith: string[];
}

export interface CircuitAnalysisReport {
  valid: boolean;
  nodesCount: number;
  componentsCount: number;
  branchesCount: number;
  loopsCount: number;
  hasGround: boolean;
  connectedComponents: number;
  totalCurrent: number;
  totalPower: number;
  equivalentResistance: number;
  components: ComponentAnalysis[];
  warnings: string[];
  errors: string[];
  floatingNodes: string[];
  shortCircuits: string[];
  openCircuits: string[];
  disconnectedWires: string[];
}

export function analyzeCircuit(
  doc: CircuitDoc,
  topology: CircuitTopology,
  solverResult: SolverResult | null
): CircuitAnalysisReport {
  const nodesCount = topology.nodes.size;
  const componentsCount = doc.components.length;
  const branchesCount = doc.components.length;
  const hasGround = !!topology.groundNode;
  
  const connectedComponents = calculateConnectedComponents(topology);
  const loopsCount = Math.max(0, branchesCount - nodesCount + connectedComponents);

  const warnings: string[] = [];
  const errors: string[] = [];
  const floatingNodes: string[] = [];
  const shortCircuits: string[] = [];
  const openCircuits: string[] = [];
  const disconnectedWires: string[] = [];

  let totalCurrent = 0;
  let totalPower = 0;
  
  const compAnalysis: ComponentAnalysis[] = [];

  // Find floating nodes (nodes with limited connections)
  for (const [nodeId, node] of topology.nodes) {
    if (node.connectedComponents.length === 0) {
      floatingNodes.push(nodeId);
      warnings.push(`Node ${nodeId} has no connected components.`);
    } else if (node.connectedComponents.length === 1 && !hasGround) {
      floatingNodes.push(nodeId);
      warnings.push(`Node ${nodeId} may be floating (single connection, no ground).`);
    }
  }

  // Check for missing ground: if no explicit ground is placed, auto-ground is used
  if (!hasGround && componentsCount > 0) {
    warnings.push('No ground component placed (first active node is automatically used as reference).');
  }

  // Check for disconnected wires
  for (const wire of doc.wires) {
    const startOk = wire.start.componentId !== null || wire.start.point !== null;
    const endOk = wire.end.componentId !== null || wire.end.point !== null;
    if (!startOk || !endOk) {
      disconnectedWires.push(wire.id);
      warnings.push('A wire has a disconnected endpoint.');
    }
  }

  // Analyze components
  if (solverResult && solverResult.isValid) {
    const mainSource = doc.components.find(
      (c) => c.type === 'battery' || c.type === 'acVoltageSource' || c.type === 'currentSource',
    );
    if (mainSource) {
      const sol = solverResult.componentData.get(mainSource.id);
      if (sol) {
        totalCurrent = Math.abs(sol.current);
        totalPower = Math.abs(sol.power);
      }
    }

    // Build node-to-component mapping for series/parallel analysis
    const nodeToComps = new Map<string, string[]>();
    for (const comp of topology.components) {
      if (comp.nodeA) {
        if (!nodeToComps.has(comp.nodeA)) nodeToComps.set(comp.nodeA, []);
        nodeToComps.get(comp.nodeA)!.push(comp.id);
      }
      if (comp.nodeB) {
        if (!nodeToComps.has(comp.nodeB)) nodeToComps.set(comp.nodeB, []);
        nodeToComps.get(comp.nodeB)!.push(comp.id);
      }
    }

    // Component analysis with series/parallel detection
    for (const comp of doc.components) {
      const topoComp = topology.components.find(c => c.id === comp.id);
      const sol = solverResult.componentData.get(comp.id);
      let state: ComponentAnalysis['state'] = 'normal';
      
      // Detect component state
      if (sol) {
        // Overload: component power exceeds its rating (for lamps)
        if (comp.type === 'lamp' && Math.abs(sol.power) > comp.value * 2) {
          state = 'overload';
          warnings.push(`${comp.label} is overloaded (${Math.abs(sol.power).toFixed(2)}W vs ${comp.value}W rating).`);
        }
        // Short circuit detection
        if (Math.abs(sol.current) > 100) {
          state = 'shorted';
          shortCircuits.push(comp.id);
          errors.push(`Short circuit detected at ${comp.label}. Current is abnormally high (${Math.abs(sol.current).toFixed(2)}A).`);
        }
        // Open circuit: no current flow but component should be in circuit
        if (Math.abs(sol.current) < 1e-9 && comp.type !== 'ground') {
          if (topoComp && topoComp.nodeA && topoComp.nodeB) {
            // Check if both nodes have other connections
            const nodeAComps = nodeToComps.get(topoComp.nodeA) || [];
            const nodeBComps = nodeToComps.get(topoComp.nodeB) || [];
            if (nodeAComps.length <= 1 || nodeBComps.length <= 1) {
              state = 'open';
              openCircuits.push(comp.id);
            }
          }
        }
        
        // Series/parallel relationships
        const seriesWith: string[] = [];
        const parallelWith: string[] = [];
        
        if (topoComp) {
          // Two components are in series if they share exactly one node
          // and no other component connects to that node
          for (const otherComp of topology.components) {
            if (otherComp.id === comp.id) continue;
            
            // Check series: share exactly one node
            const sharedNodes = [
              topoComp.nodeA === otherComp.nodeA || topoComp.nodeA === otherComp.nodeB,
              topoComp.nodeB === otherComp.nodeA || topoComp.nodeB === otherComp.nodeB,
            ].filter(Boolean).length;
            
            if (sharedNodes === 1) {
              // Check if the shared node only connects these two components
              const sharedNode = topoComp.nodeA === otherComp.nodeA || topoComp.nodeA === otherComp.nodeB 
                ? topoComp.nodeA : topoComp.nodeB;
              const nodeComps = nodeToComps.get(sharedNode) || [];
              if (nodeComps.length === 2) {
                seriesWith.push(otherComp.id);
              }
            }
            
            // Check parallel: share both nodes
            if (sharedNodes === 2) {
              parallelWith.push(otherComp.id);
            }
          }
        }

        compAnalysis.push({
          id: comp.id,
          label: comp.label,
          type: comp.type,
          value: comp.value,
          voltage: Math.abs(sol.voltage),
          current: Math.abs(sol.current),
          power: Math.abs(sol.power),
          state,
          nodeA: topoComp?.nodeA || '',
          nodeB: topoComp?.nodeB || '',
          seriesWith,
          parallelWith,
        });
      }
    }
  } else if (solverResult && !solverResult.isValid) {
    if (solverResult.error) {
      errors.push(solverResult.error);
    }
  }

  // Calculate equivalent resistance
  const equivalentResistance = totalCurrent > 1e-6 
    ? (totalPower / (totalCurrent * totalCurrent)) 
    : calculateEquivalentResistance(doc, topology);

  return {
    valid: errors.length === 0 && (solverResult?.isValid ?? false),
    nodesCount,
    componentsCount,
    branchesCount,
    loopsCount,
    hasGround,
    connectedComponents,
    totalCurrent,
    totalPower,
    equivalentResistance,
    components: compAnalysis,
    warnings,
    errors,
    floatingNodes,
    shortCircuits,
    openCircuits,
    disconnectedWires,
  };
}

/** Calculate equivalent resistance for simple series/parallel circuits */
function calculateEquivalentResistance(
  _doc: CircuitDoc,
  topology: CircuitTopology
): number {
  const resistors = topology.components.filter(c => c.type === 'resistor' && c.value > 0);
  if (resistors.length === 0) return 0;
  
  // For a single resistor
  if (resistors.length === 1) {
    return resistors[0].value;
  }
  
  // Check if all resistors are in series (share common nodes)
  const voltageSources = topology.components.filter(c => c.voltageSource);
  if (voltageSources.length === 1 && resistors.length > 0) {
    const vs = voltageSources[0];
    // Check if all resistors connect to the same nodes as the voltage source
    const vsNodeA = vs.nodeA;
    const vsNodeB = vs.nodeB;
    
    let allInSeries = true;
    for (const r of resistors) {
      const rNodeA = r.nodeA;
      const rNodeB = r.nodeB;
      // Resistor in series if it shares at least one node with voltage source
      if (!((rNodeA === vsNodeA || rNodeA === vsNodeB || 
             rNodeB === vsNodeA || rNodeB === vsNodeB))) {
        allInSeries = false;
        break;
      }
    }
    
    if (allInSeries) {
      // Sum all resistor values for series
      return resistors.reduce((sum, r) => sum + r.value, 0);
    }
  }
  
  return 0;
}

function calculateConnectedComponents(topology: CircuitTopology): number {
  const visited = new Set<string>();
  let count = 0;
  
  const adj = new Map<string, string[]>();
  for (const comp of topology.components) {
    if (comp.nodeA && comp.nodeB) {
      if (!adj.has(comp.nodeA)) adj.set(comp.nodeA, []);
      if (!adj.has(comp.nodeB)) adj.set(comp.nodeB, []);
      adj.get(comp.nodeA)!.push(comp.nodeB);
      adj.get(comp.nodeB)!.push(comp.nodeA);
    }
  }

  for (const nodeId of topology.nodes.keys()) {
    if (!visited.has(nodeId)) {
      count++;
      const stack = [nodeId];
      while (stack.length > 0) {
        const curr = stack.pop()!;
        if (!visited.has(curr)) {
          visited.add(curr);
          const neighbors = adj.get(curr) || [];
          for (const n of neighbors) {
            stack.push(n);
          }
        }
      }
    }
  }
  
  return count;
}

export interface CircuitPath {
  components: string[];
  nodes: string[];
  totalVoltage: number;
  totalResistance: number;
  current: number;
}

export function findCurrentPaths(
  _doc: CircuitDoc,
  _topology: CircuitTopology,
  solverResult: SolverResult | null
): CircuitPath[] {
  if (!solverResult || !solverResult.isValid) return [];
  
  const paths: CircuitPath[] = [];
  // Path tracing simplified - just return empty for now
  return paths;
}
