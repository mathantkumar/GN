import { useState, useCallback } from 'react';

// ==========================================
// Types & Interfaces
// ==========================================

export type VectorClock = { [nodeId: string]: number };

export interface CausalOperation {
  id: string;                  // Unique identifier, e.g. "Terminal A:1"
  type: 'ADD' | 'REMOVE';
  element: string;
  timestamp: number;           // Wall-clock time of creation
  dependencies: string[];      // Identifiers of operations observed by the creator
}

// State-based PN-Counter
export interface PNCounter {
  p: { [nodeId: string]: number };
  n: { [nodeId: string]: number };
}

// Observed-Remove Map (OR-Map)
export interface MapOperation {
  id: string;
  type: 'PUT' | 'REMOVE';
  key: string;
  value: string | null;
  timestamp: number;
  dependencies: string[];
}

export interface ORMap {
  operations: { [id: string]: MapOperation };
}

export interface TerminalNode {
  id: string;
  isOnline: boolean;
  operations: { [id: string]: CausalOperation };
  inventory: PNCounter;
  orders: ORMap;
  clock: VectorClock;
  merkleRoot: string;
}

export interface ConflictRecord {
  element: string;
  type: string;       // e.g. "Causal Addition", "Causal Deletion", "Causal Tombstone"
  winnerNode: string;
  winnerTimestamp: number;
  reason: string;     // e.g. "Terminal A:1"
  details: string;    // details trace
}

export interface MergeHistoryRecord {
  name: string;       // e.g. "Sync 1", "Sync 2"
  latencyMs: number;
  conflictsResolved: number;
}

// ==========================================
// CRDT Helper Algorithms (PNCounter & ORMap)
// ==========================================

export function createPNCounter(pVal = 0, nodeId = ''): PNCounter {
  return {
    p: nodeId ? { [nodeId]: pVal } : {},
    n: {}
  };
}

export function getPNCounterValue(counter: PNCounter): number {
  const pSum = Object.values(counter.p).reduce((sum, v) => sum + v, 0);
  const nSum = Object.values(counter.n).reduce((sum, v) => sum + v, 0);
  return pSum - nSum;
}

export function incrementPNCounter(counter: PNCounter, nodeId: string, delta = 1): PNCounter {
  return {
    p: { ...counter.p, [nodeId]: (counter.p[nodeId] || 0) + delta },
    n: counter.n
  };
}

export function decrementPNCounter(counter: PNCounter, nodeId: string, delta = 1): PNCounter {
  return {
    p: counter.p,
    n: { ...counter.n, [nodeId]: (counter.n[nodeId] || 0) + delta }
  };
}

export function mergePNCounters(c1: PNCounter, c2: PNCounter): PNCounter {
  const p: { [nodeId: string]: number } = {};
  const n: { [nodeId: string]: number } = {};
  const allPKeys = new Set([...Object.keys(c1.p), ...Object.keys(c2.p)]);
  const allNKeys = new Set([...Object.keys(c1.n), ...Object.keys(c2.n)]);

  allPKeys.forEach(k => {
    p[k] = Math.max(c1.p[k] || 0, c2.p[k] || 0);
  });
  allNKeys.forEach(k => {
    n[k] = Math.max(c1.n[k] || 0, c2.n[k] || 0);
  });

  return { p, n };
}

export function createORMap(): ORMap {
  return { operations: {} };
}

export function putORMap(map: ORMap, nodeId: string, key: string, value: string): ORMap {
  const nodeOps = Object.values(map.operations).filter(op => op.id.startsWith(`${nodeId}:`));
  const nextIdx = nodeOps.length + 1;
  const opId = `${nodeId}:${nextIdx}`;
  const dependencies = Object.keys(map.operations);

  const op: MapOperation = {
    id: opId,
    type: 'PUT',
    key,
    value,
    timestamp: Math.floor(Date.now() / 1000) % 10000,
    dependencies
  };

  return {
    operations: { ...map.operations, [opId]: op }
  };
}

export function removeORMap(map: ORMap, nodeId: string, key: string): ORMap {
  const nodeOps = Object.values(map.operations).filter(op => op.id.startsWith(`${nodeId}:`));
  const nextIdx = nodeOps.length + 1;
  const opId = `${nodeId}:${nextIdx}`;
  const dependencies = Object.keys(map.operations);

  const op: MapOperation = {
    id: opId,
    type: 'REMOVE',
    key,
    value: null,
    timestamp: Math.floor(Date.now() / 1000) % 10000,
    dependencies
  };

  return {
    operations: { ...map.operations, [opId]: op }
  };
}

export function getORMapValue(map: ORMap, key: string): string | null {
  const ops = Object.values(map.operations);
  const puts = ops.filter(op => op.type === 'PUT' && op.key === key);
  if (puts.length === 0) return null;

  const removes = new Set<string>();
  ops.forEach(op => {
    if (op.type === 'REMOVE' && op.key === key) {
      op.dependencies.forEach(dep => removes.add(dep));
    }
  });

  const activePuts = puts.filter(put => !removes.has(put.id));
  if (activePuts.length === 0) return null;

  activePuts.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return b.id.localeCompare(a.id);
  });

  return activePuts[0].value;
}

export function getORMapKeys(map: ORMap): string[] {
  const keys = new Set<string>();
  Object.values(map.operations).forEach(op => {
    if (op.type === 'PUT') keys.add(op.key);
  });
  return Array.from(keys).filter(k => getORMapValue(map, k) !== null);
}

export function mergeORMaps(m1: ORMap, m2: ORMap): ORMap {
  return {
    operations: { ...m1.operations, ...m2.operations }
  };
}

// ==========================================
// Hashing & Merkle Tree Algorithms
// ==========================================

export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeMerkleRoot(operations: { [id: string]: CausalOperation }): string {
  const ops = Object.values(operations);
  if (ops.length === 0) return fnv1a("empty");

  const sortedOps = [...ops].sort((a, b) => a.id.localeCompare(b.id));
  
  let currentLevel = sortedOps.map(op => {
    return fnv1a(`${op.id}:${op.type}:${op.element}:${op.dependencies.sort().join(',')}`);
  });

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(fnv1a(left + right));
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

export function computeVectorClock(operations: { [id: string]: CausalOperation }): VectorClock {
  const clock: VectorClock = {};
  Object.keys(operations).forEach(opId => {
    const parts = opId.split(':');
    if (parts.length === 2) {
      const node = parts[0];
      const seq = parseInt(parts[1], 10);
      if (!isNaN(seq)) {
        clock[node] = Math.max(clock[node] || 0, seq);
      }
    }
  });
  return clock;
}

// ==========================================
// Initial Seed Data
// ==========================================

const createInitialNode = (id: string, initialItems: string[], initInventory: number): TerminalNode => {
  const operations: { [id: string]: CausalOperation } = {};
  let lastOpId = '';

  initialItems.forEach((item, index) => {
    const opId = `${id}:${index + 1}`;
    const dependencies = lastOpId ? [lastOpId] : [];
    operations[opId] = {
      id: opId,
      type: 'ADD',
      element: item,
      timestamp: 1000 + index * 10,
      dependencies
    };
    lastOpId = opId;
  });

  // Seed OR-Map table orders
  let orders: ORMap = { operations: {} };
  orders = putORMap(orders, id, "table-1", "espresso");

  return {
    id,
    isOnline: true,
    operations,
    inventory: createPNCounter(initInventory, id),
    orders,
    clock: computeVectorClock(operations),
    merkleRoot: computeMerkleRoot(operations)
  };
};

// ==========================================
// Custom Hook Implementation
// ==========================================

export function useGhostNodeCluster() {
  const [terminals, setTerminals] = useState<{ [id: string]: TerminalNode }>({
    'Terminal A': createInitialNode('Terminal A', ['espresso', 'latte'], 10),
    'Terminal B': createInitialNode('Terminal B', ['latte', 'cappuccino'], 8),
    'Terminal C': createInitialNode('Terminal C', ['espresso', 'flat white'], 12)
  });

  const [ledger, setLedger] = useState<ConflictRecord[]>([]);
  const [history, setHistory] = useState<MergeHistoryRecord[]>([
    { name: 'Run 1', latencyMs: 0.28, conflictsResolved: 1 },
    { name: 'Run 2', latencyMs: 0.35, conflictsResolved: 0 },
    { name: 'Run 3', latencyMs: 0.42, conflictsResolved: 2 },
    { name: 'Run 4', latencyMs: 0.31, conflictsResolved: 1 }
  ]);

  // Lookup helper for a specific node based on OR-Set Causal history
  const lookup = useCallback((node: TerminalNode, element: string): boolean => {
    const ops = Object.values(node.operations);
    const adds = ops.filter(op => op.type === 'ADD' && op.element === element);
    if (adds.length === 0) return false;

    const removedIds = new Set<string>();
    ops.forEach(op => {
      if (op.type === 'REMOVE' && op.element === element) {
        op.dependencies.forEach(dep => removedIds.add(dep));
      }
    });

    return adds.some(add => !removedIds.has(add.id));
  }, []);

  // Get visible elements for a node
  const getVisibleElements = useCallback((node: TerminalNode): string[] => {
    const elements = new Set<string>();
    Object.values(node.operations).forEach(op => {
      if (op.type === 'ADD') {
        elements.add(op.element);
      }
    });
    return Array.from(elements).filter(el => lookup(node, el));
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
      const now = Math.floor(Date.now() / 1000) % 10000;
      
      const nodeOps = Object.values(node.operations).filter(op => op.id.startsWith(`${nodeId}:`));
      const nextIdx = nodeOps.length + 1;
      const opId = `${nodeId}:${nextIdx}`;
      const dependencies = Object.keys(node.operations);

      const newOp: CausalOperation = {
        id: opId,
        type: 'ADD',
        element: item,
        timestamp: now,
        dependencies
      };

      const updatedOps = {
        ...node.operations,
        [opId]: newOp
      };

      return {
        ...prev,
        [nodeId]: {
          ...node,
          operations: updatedOps,
          clock: computeVectorClock(updatedOps),
          merkleRoot: computeMerkleRoot(updatedOps)
        }
      };
    });
  }, []);

  // Remove Item locally on a terminal
  const removeItem = useCallback((nodeId: string, item: string) => {
    setTerminals(prev => {
      const node = prev[nodeId];
      const now = Math.floor(Date.now() / 1000) % 10000;

      const nodeOps = Object.values(node.operations).filter(op => op.id.startsWith(`${nodeId}:`));
      const nextIdx = nodeOps.length + 1;
      const opId = `${nodeId}:${nextIdx}`;
      const dependencies = Object.keys(node.operations);

      const newOp: CausalOperation = {
        id: opId,
        type: 'REMOVE',
        element: item,
        timestamp: now,
        dependencies
      };

      const updatedOps = {
        ...node.operations,
        [opId]: newOp
      };

      return {
        ...prev,
        [nodeId]: {
          ...node,
          operations: updatedOps,
          clock: computeVectorClock(updatedOps),
          merkleRoot: computeMerkleRoot(updatedOps)
        }
      };
    });
  }, []);

  // Mutate local Inventory (PN-Counter)
  const adjustInventory = useCallback((nodeId: string, type: 'INC' | 'DEC', delta = 1) => {
    setTerminals(prev => {
      const node = prev[nodeId];
      const updatedCounter = type === 'INC'
        ? incrementPNCounter(node.inventory, nodeId, delta)
        : decrementPNCounter(node.inventory, nodeId, delta);
      return {
        ...prev,
        [nodeId]: {
          ...node,
          inventory: updatedCounter
        }
      };
    });
  }, []);

  // Mutate local Order Mappings (OR-Map)
  const upsertOrder = useCallback((nodeId: string, key: string, value: string) => {
    setTerminals(prev => {
      const node = prev[nodeId];
      const updatedOrders = putORMap(node.orders, nodeId, key, value);
      return {
        ...prev,
        [nodeId]: {
          ...node,
          orders: updatedOrders
        }
      };
    });
  }, []);

  const removeOrder = useCallback((nodeId: string, key: string) => {
    setTerminals(prev => {
      const node = prev[nodeId];
      const updatedOrders = removeORMap(node.orders, nodeId, key);
      return {
        ...prev,
        [nodeId]: {
          ...node,
          orders: updatedOrders
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

    // 1. Merge standard causal operations
    const mergedOperations: { [id: string]: CausalOperation } = {};
    onlineNodes.forEach(node => {
      Object.assign(mergedOperations, node.operations);
    });

    // 2. Merge PN-Counters
    let mergedInventory = createPNCounter();
    onlineNodes.forEach(node => {
      mergedInventory = mergePNCounters(mergedInventory, node.inventory);
    });

    // 3. Merge OR-Maps
    let mergedOrders = createORMap();
    onlineNodes.forEach(node => {
      mergedOrders = mergeORMaps(mergedOrders, node.orders);
    });

    // Compute conflict records for standard operations
    const conflicts: ConflictRecord[] = [];
    const sortedOps = Object.values(mergedOperations).sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.id.localeCompare(b.id);
    });

    sortedOps.forEach(op => {
      if (op.type === 'ADD') {
        const targetingRemoves = sortedOps.filter(
          other => other.type === 'REMOVE' && other.element === op.element && other.dependencies.includes(op.id)
        );

        if (targetingRemoves.length > 0) {
          const removeIds = targetingRemoves.map(r => r.id).join(', ');
          conflicts.push({
            element: op.element,
            type: 'Causal Deletion',
            winnerNode: targetingRemoves[0].id.split(':')[0],
            winnerTimestamp: targetingRemoves[0].timestamp,
            reason: op.id,
            details: `ADD operation ${op.id} is causally overridden and deleted by REMOVE operations: [${removeIds}].`
          });
        } else {
          conflicts.push({
            element: op.element,
            type: 'Causal Addition',
            winnerNode: op.id.split(':')[0],
            winnerTimestamp: op.timestamp,
            reason: op.id,
            details: `ADD operation ${op.id} remains active as it has no causal REMOVE dependency targeting it.`
          });
        }
      } else {
        conflicts.push({
          element: op.element,
          type: 'Causal Tombstone',
          winnerNode: op.id.split(':')[0],
          winnerTimestamp: op.timestamp,
          reason: op.id,
          details: `REMOVE operation ${op.id} targets previous elements: [${op.dependencies.filter(dep => {
            const depOp = mergedOperations[dep];
            return depOp && depOp.element === op.element && depOp.type === 'ADD';
          }).join(', ')}].`
        });
      }
    });

    // Update all online nodes to the converged state
    setTerminals(prev => {
      const updated = { ...prev };
      const commonRoot = computeMerkleRoot(mergedOperations);
      Object.keys(prev).forEach(id => {
        if (prev[id].isOnline) {
          updated[id] = {
            ...prev[id],
            operations: { ...mergedOperations },
            inventory: mergedInventory,
            orders: mergedOrders,
            clock: computeVectorClock(mergedOperations),
            merkleRoot: commonRoot
          };
        }
      });
      return updated;
    });

    const endTime = performance.now();
    const durationMs = parseFloat((endTime - startTime).toFixed(3)) || 0.15;

    setLedger(conflicts);
    setHistory(prev => {
      const nextRun = `Run ${prev.length + 1}`;
      return [...prev.slice(1), { name: nextRun, latencyMs: durationMs, conflictsResolved: conflicts.filter(c => c.type === 'Causal Deletion').length }];
    });
  }, [terminals]);

  return {
    terminals,
    ledger,
    history,
    toggleOnline,
    addItem,
    removeItem,
    adjustInventory,
    upsertOrder,
    removeOrder,
    triggerMerge,
    getVisibleElements
  };
}
