import { useState, useCallback } from 'react';

// ==========================================
// Types & Interfaces
// ==========================================

export type VectorClock = { [nodeId: string]: number };

export interface LWWRegister {
  value: string;
  timestamp: number; // simulated seconds or ms
  clock: VectorClock;
  nodeId: string;    // terminal node that created this entry
}

export interface TerminalNode {
  id: string;
  isOnline: boolean;
  addSet: { [key: string]: LWWRegister };
  removeSet: { [key: string]: LWWRegister };
  clock: VectorClock;
  bias: 'ADD' | 'REMOVE';
}

export interface ConflictRecord {
  element: string;
  type: string;       // e.g. "Add vs Add", "Add vs Remove"
  winnerNode: string;
  winnerTimestamp: number;
  reason: string;     // e.g. "LWW Timestamp Wins", "Vector Clock Causal Domination", "Timestamp Tie-break: Add Wins"
  details: string;    // human readable trace
}

export interface MergeHistoryRecord {
  name: string;       // e.g. "Sync 1", "Sync 2"
  latencyMs: number;
  conflictsResolved: number;
}

export enum CausalOrder {
  BEFORE = "BEFORE",
  AFTER = "AFTER",
  EQUAL = "EQUAL",
  CONCURRENT = "CONCURRENT"
}

// ==========================================
// Causality Logic
// ==========================================

export function getCausalRelation(c1: VectorClock, c2: VectorClock): CausalOrder {
  const allKeys = Array.from(new Set([...Object.keys(c1), ...Object.keys(c2)]));
  let greater = false;
  let lesser = false;

  for (const k of allKeys) {
    const v1 = c1[k] || 0;
    const v2 = c2[k] || 0;
    if (v1 > v2) greater = true;
    if (v1 < v2) lesser = true;
  }

  if (greater && lesser) return CausalOrder.CONCURRENT;
  if (greater) return CausalOrder.AFTER;
  if (lesser) return CausalOrder.BEFORE;
  return CausalOrder.EQUAL;
}

// ==========================================
// Initial Seed Data
// ==========================================

const createInitialNode = (id: string, initialItems: string[]): TerminalNode => {
  const addSet: { [key: string]: LWWRegister } = {};
  const clock: VectorClock = { [id]: 0 };

  initialItems.forEach((item, index) => {
    clock[id] = (clock[id] || 0) + 1;
    addSet[item] = {
      value: item,
      timestamp: 1000 + index * 10,
      clock: { ...clock },
      nodeId: id
    };
  });

  return {
    id,
    isOnline: true,
    addSet,
    removeSet: {},
    clock,
    bias: 'ADD'
  };
};

// ==========================================
// Custom Hook Implementation
// ==========================================

export function useGhostNodeCluster() {
  const [terminals, setTerminals] = useState<{ [id: string]: TerminalNode }>({
    'Terminal A': createInitialNode('Terminal A', ['espresso', 'latte']),
    'Terminal B': createInitialNode('Terminal B', ['latte', 'cappuccino']),
    'Terminal C': createInitialNode('Terminal C', ['espresso', 'flat white'])
  });

  const [ledger, setLedger] = useState<ConflictRecord[]>([]);
  const [history, setHistory] = useState<MergeHistoryRecord[]>([
    { name: 'Run 1', latencyMs: 0.28, conflictsResolved: 1 },
    { name: 'Run 2', latencyMs: 0.35, conflictsResolved: 0 },
    { name: 'Run 3', latencyMs: 0.42, conflictsResolved: 2 },
    { name: 'Run 4', latencyMs: 0.31, conflictsResolved: 1 }
  ]);

  // Lookup helper for a specific node
  const lookup = useCallback((node: TerminalNode, element: string): boolean => {
    const addReg = node.addSet[element];
    if (!addReg) return false;
    const removeReg = node.removeSet[element];
    if (!removeReg) return true;

    if (addReg.timestamp > removeReg.timestamp) return true;
    if (addReg.timestamp < removeReg.timestamp) return false;
    return node.bias === 'ADD';
  }, []);

  // Get visible elements for a node
  const getVisibleElements = useCallback((node: TerminalNode): string[] => {
    return Object.keys(node.addSet).filter(el => lookup(node, el));
  }, [lookup]);

  // Toggle node Online / Offline
  const toggleOnline = useCallback((nodeId: string) => {
    setTerminals(prev => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        isOnline: !prev[nodeId].isOnline
      }
    }));
  }, []);

  // Add Item locally on a terminal
  const addItem = useCallback((nodeId: string, item: string) => {
    setTerminals(prev => {
      const node = prev[nodeId];
      const newClock = { ...node.clock, [nodeId]: (node.clock[nodeId] || 0) + 1 };
      const now = Math.floor(Date.now() / 1000) % 10000;
      
      return {
        ...prev,
        [nodeId]: {
          ...node,
          addSet: {
            ...node.addSet,
            [item]: { value: item, timestamp: now, clock: newClock, nodeId }
          },
          clock: newClock
        }
      };
    });
  }, []);

  // Remove Item locally on a terminal
  const removeItem = useCallback((nodeId: string, item: string) => {
    setTerminals(prev => {
      const node = prev[nodeId];
      const newClock = { ...node.clock, [nodeId]: (node.clock[nodeId] || 0) + 1 };
      const now = Math.floor(Date.now() / 1000) % 10000;

      return {
        ...prev,
        [nodeId]: {
          ...node,
          removeSet: {
            ...node.removeSet,
            [item]: { value: item, timestamp: now, clock: newClock, nodeId }
          },
          clock: newClock
        }
      };
    });
  }, []);

  // Central Merge Engine
  const triggerMerge = useCallback(() => {
    const startTime = performance.now();
    const onlineNodes = Object.values(terminals).filter(n => n.isOnline);
    
    if (onlineNodes.length === 0) {
      setLedger([]);
      return;
    }

    const conflicts: ConflictRecord[] = [];
    const mergedAdds: { [key: string]: LWWRegister } = {};
    const mergedRemoves: { [key: string]: LWWRegister } = {};

    // Collect all elements across online nodes
    const allKeys = new Set<string>();
    onlineNodes.forEach(node => {
      Object.keys(node.addSet).forEach(k => allKeys.add(k));
      Object.keys(node.removeSet).forEach(k => allKeys.add(k));
    });

    // Merge logic
    allKeys.forEach(element => {
      // Collect all Add registers from online nodes
      const addRegisters = onlineNodes
        .map(node => node.addSet[element])
        .filter((reg): reg is LWWRegister => !!reg);

      // Collect all Remove registers
      const removeRegisters = onlineNodes
        .map(node => node.removeSet[element])
        .filter((reg): reg is LWWRegister => !!reg);

      // Resolve Add conflicts
      let winningAdd: LWWRegister | null = null;
      if (addRegisters.length > 0) {
        winningAdd = addRegisters.reduce((winner, current) => {
          if (!winner) return current;
          
          const conflictType = "Add vs Add";
          if (current.timestamp > winner.timestamp) {
            conflicts.push({
              element,
              type: conflictType,
              winnerNode: current.nodeId,
              winnerTimestamp: current.timestamp,
              reason: "LWW Timestamp Wins",
              details: `Node ${current.nodeId} added at timestamp ${current.timestamp}s, beating Node ${winner.nodeId} at ${winner.timestamp}s.`
            });
            return current;
          } else if (current.timestamp < winner.timestamp) {
            conflicts.push({
              element,
              type: conflictType,
              winnerNode: winner.nodeId,
              winnerTimestamp: winner.timestamp,
              reason: "LWW Timestamp Wins",
              details: `Node ${winner.nodeId} added at timestamp ${winner.timestamp}s, beating Node ${current.nodeId} at ${current.timestamp}s.`
            });
            return winner;
          } else {
            // Equal timestamps - check clocks
            const relation = getCausalRelation(current.clock, winner.clock);
            if (relation === CausalOrder.AFTER) {
              conflicts.push({
                element,
                type: conflictType,
                winnerNode: current.nodeId,
                winnerTimestamp: current.timestamp,
                reason: "Vector Clock Dominates",
                details: `Node ${current.nodeId} clock [${JSON.stringify(current.clock)}] is after Node ${winner.nodeId} clock [${JSON.stringify(winner.clock)}] at equal timestamps.`
              });
              return current;
            } else if (relation === CausalOrder.BEFORE) {
              conflicts.push({
                element,
                type: conflictType,
                winnerNode: winner.nodeId,
                winnerTimestamp: winner.timestamp,
                reason: "Vector Clock Dominates",
                details: `Node ${winner.nodeId} clock [${JSON.stringify(winner.clock)}] is after Node ${current.nodeId} clock [${JSON.stringify(current.clock)}] at equal timestamps.`
              });
              return winner;
            } else {
              // Concurrent or equal - deterministic tie-breaker (highest alphabetical nodeId wins)
              const winNode = current.nodeId > winner.nodeId ? current : winner;
              conflicts.push({
                element,
                type: conflictType,
                winnerNode: winNode.nodeId,
                winnerTimestamp: winNode.timestamp,
                reason: "Alphabetical Tie-breaker",
                details: `Concurrent vector clocks at equal timestamps (${current.timestamp}s). Node ${winNode.nodeId} selected deterministically.`
              });
              return winNode;
            }
          }
        });
        mergedAdds[element] = winningAdd;
      }

      // Resolve Remove conflicts
      let winningRemove: LWWRegister | null = null;
      if (removeRegisters.length > 0) {
        winningRemove = removeRegisters.reduce((winner, current) => {
          if (!winner) return current;

          if (current.timestamp > winner.timestamp) {
            return current;
          } else if (current.timestamp < winner.timestamp) {
            return winner;
          } else {
            const relation = getCausalRelation(current.clock, winner.clock);
            if (relation === CausalOrder.AFTER) return current;
            if (relation === CausalOrder.BEFORE) return winner;
            return current.nodeId > winner.nodeId ? current : winner;
          }
        });
        mergedRemoves[element] = winningRemove;
      }

      // Resolve Add vs Remove conflict for this element
      if (winningAdd && winningRemove) {
        const conflictType = "Add vs Remove";
        if (winningAdd.timestamp > winningRemove.timestamp) {
          conflicts.push({
            element,
            type: conflictType,
            winnerNode: winningAdd.nodeId,
            winnerTimestamp: winningAdd.timestamp,
            reason: "LWW Timestamp Wins",
            details: `Addition from Node ${winningAdd.nodeId} (${winningAdd.timestamp}s) is newer than Deletion from Node ${winningRemove.nodeId} (${winningRemove.timestamp}s).`
          });
        } else if (winningAdd.timestamp < winningRemove.timestamp) {
          conflicts.push({
            element,
            type: conflictType,
            winnerNode: winningRemove.nodeId,
            winnerTimestamp: winningRemove.timestamp,
            reason: "LWW Timestamp Wins",
            details: `Deletion from Node ${winningRemove.nodeId} (${winningRemove.timestamp}s) is newer than Addition from Node ${winningAdd.nodeId} (${winningAdd.timestamp}s).`
          });
        } else {
          // Equal timestamps - fallback to default ADD bias
          conflicts.push({
            element,
            type: conflictType,
            winnerNode: winningAdd.nodeId,
            winnerTimestamp: winningAdd.timestamp,
            reason: "Timestamp Tie-break: Add Wins",
            details: `Equal timestamps (${winningAdd.timestamp}s) between Add and Remove. Default ADD bias preserves the element.`
          });
        }
      }
    });

    // Merge vector clocks across online nodes
    const mergedClock: VectorClock = {};
    onlineNodes.forEach(node => {
      Object.keys(node.clock).forEach(k => {
        mergedClock[k] = Math.max(mergedClock[k] || 0, node.clock[k] || 0);
      });
    });

    // Update all online nodes to the unified converged state
    setTerminals(prev => {
      const updated = { ...prev };
      Object.keys(prev).forEach(id => {
        if (prev[id].isOnline) {
          updated[id] = {
            ...prev[id],
            addSet: mergedAdds,
            removeSet: mergedRemoves,
            clock: { ...mergedClock }
          };
        }
      });
      return updated;
    });

    const endTime = performance.now();
    const durationMs = parseFloat((endTime - startTime).toFixed(3)) || 0.15; // default minimum if execution is extremely fast

    setLedger(conflicts);
    setHistory(prev => {
      const nextRun = `Run ${prev.length + 1}`;
      return [...prev.slice(1), { name: nextRun, latencyMs: durationMs, conflictsResolved: conflicts.length }];
    });
  }, [terminals]);

  return {
    terminals,
    ledger,
    history,
    toggleOnline,
    addItem,
    removeItem,
    triggerMerge,
    getVisibleElements
  };
}
