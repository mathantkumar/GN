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

export interface TerminalNode {
  id: string;
  isOnline: boolean;
  operations: { [id: string]: CausalOperation };
  clock: VectorClock;
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

// Helper to compute vector clock from operations map
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

const createInitialNode = (id: string, initialItems: string[]): TerminalNode => {
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

  return {
    id,
    isOnline: true,
    operations,
    clock: computeVectorClock(operations)
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

  // Lookup helper for a specific node based on OR-Set Causal history
  const lookup = useCallback((node: TerminalNode, element: string): boolean => {
    const ops = Object.values(node.operations);
    const adds = ops.filter(op => op.type === 'ADD' && op.element === element);
    if (adds.length === 0) return false;

    // Collect all predecessor operations targeted by REMOVE operations in this node's ledger
    const removedIds = new Set<string>();
    ops.forEach(op => {
      if (op.type === 'REMOVE' && op.element === element) {
        op.dependencies.forEach(dep => removedIds.add(dep));
      }
    });

    // Element is active if any ADD id is not contained in the set of removed IDs
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
          clock: computeVectorClock(updatedOps)
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
          clock: computeVectorClock(updatedOps)
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

    // Merge operations from all online nodes
    const mergedOperations: { [id: string]: CausalOperation } = {};
    onlineNodes.forEach(node => {
      Object.assign(mergedOperations, node.operations);
    });

    // Compute conflict records for all operations in the merged ledger
    const conflicts: ConflictRecord[] = [];
    
    // Sort all merged operations by timestamp/id so they display nicely
    const sortedOps = Object.values(mergedOperations).sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.id.localeCompare(b.id);
    });

    sortedOps.forEach(op => {
      if (op.type === 'ADD') {
        // Find if this ADD operation is targeted by any REMOVE operation in the merged operations
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
        // REMOVE operation
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
      Object.keys(prev).forEach(id => {
        if (prev[id].isOnline) {
          updated[id] = {
            ...prev[id],
            operations: { ...mergedOperations },
            clock: computeVectorClock(mergedOperations)
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
    triggerMerge,
    getVisibleElements
  };
}
