import { useState, useMemo } from 'react';
import {
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useGhostNodeCluster, getPNCounterValue, getORMapKeys, getORMapValue } from './useGhostNode';
import logo from './assets/logo.svg';

// ==========================================
// Types & Interfaces for Radix Trie
// ==========================================

interface TrieNode {
  char: string;
  isEnd: boolean;
  children: { [char: string]: TrieNode };
}

interface RenderNode {
  id: string;
  char: string;
  isEnd: boolean;
  x: number;
  y: number;
  isCopied: boolean;
  isShared: boolean;
  children: RenderNode[];
}

interface RenderLink {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isCopied: boolean;
  isShared: boolean;
}

// ==========================================
// Radix Trie Helpers (Structural Sharing Visualizer)
// ==========================================

const initialTrie: TrieNode = {
  char: '',
  isEnd: false,
  children: {
    a: {
      char: 'a',
      isEnd: false,
      children: {
        p: {
          char: 'p',
          isEnd: false,
          children: {
            p: {
              char: 'p',
              isEnd: false,
              children: {
                l: {
                  char: 'l',
                  isEnd: false,
                  children: {
                    e: {
                      char: 'e',
                      isEnd: true,
                      children: {}
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    b: {
      char: 'b',
      isEnd: false,
      children: {
        a: {
          char: 'a',
          isEnd: false,
          children: {
            n: {
              char: 'n',
              isEnd: false,
              children: {
                a: {
                  char: 'a',
                  isEnd: false,
                  children: {
                    n: {
                      char: 'n',
                      isEnd: false,
                      children: {
                        a: {
                          char: 'a',
                          isEnd: true,
                          children: {}
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

function insertWordIntoTrie(
  root: TrieNode,
  word: string
): { newRoot: TrieNode; affected: Set<TrieNode>; shared: Set<TrieNode> } {
  const affected = new Set<TrieNode>();
  const shared = new Set<TrieNode>();

  function collectAllNodes(node: TrieNode, set: Set<TrieNode>) {
    set.add(node);
    for (const child of Object.values(node.children)) {
      collectAllNodes(child, set);
    }
  }

  function helper(node: TrieNode, index: number): TrieNode {
    const newNode: TrieNode = {
      char: node.char,
      isEnd: node.isEnd,
      children: { ...node.children }
    };
    affected.add(newNode);

    if (index === word.length) {
      newNode.isEnd = true;
      return newNode;
    }

    const char = word[index];
    const child = node.children[char];

    if (child) {
      newNode.children[char] = helper(child, index + 1);
    } else {
      let current = newNode;
      for (let i = index; i < word.length; i++) {
        const c = word[i];
        const nextNode: TrieNode = {
          char: c,
          isEnd: i === word.length - 1,
          children: {}
        };
        affected.add(nextNode);
        current.children[c] = nextNode;
        current = nextNode;
      }
      return newNode;
    }

    for (const c of Object.keys(node.children)) {
      if (c !== char) {
        collectAllNodes(node.children[c], shared);
      }
    }

    return newNode;
  }

  const newRoot = helper(root, 0);
  return { newRoot, affected, shared };
}

function buildLayout(
  node: TrieNode,
  x: number,
  y: number,
  spread: number,
  depth: number,
  affected: Set<TrieNode>,
  shared: Set<TrieNode>,
  currentPath: string
): RenderNode {
  const childrenKeys = Object.keys(node.children).sort();
  const childrenRender: RenderNode[] = [];

  childrenKeys.forEach((char, index) => {
    const childNode = node.children[char];
    const childX = x + (index - (childrenKeys.length - 1) / 2) * spread;
    const childY = y + 70;
    childrenRender.push(
      buildLayout(
        childNode,
        childX,
        childY,
        spread * 0.45,
        depth + 1,
        affected,
        shared,
        currentPath + char
      )
    );
  });

  return {
    id: currentPath || 'root',
    char: node.char || 'ROOT',
    isEnd: node.isEnd,
    x,
    y,
    isCopied: affected.has(node),
    isShared: shared.has(node),
    children: childrenRender
  };
}

// Traverse layout tree to collect SVG elements
function collectElements(
  node: RenderNode,
  nodeList: RenderNode[],
  linkList: RenderLink[]
) {
  nodeList.push(node);
  node.children.forEach(child => {
    linkList.push({
      fromX: node.x,
      fromY: node.y,
      toX: child.x,
      toY: child.y,
      isCopied: child.isCopied,
      isShared: child.isShared
    });
    collectElements(child, nodeList, linkList);
  });
}

const MENU_OPTIONS = [
  'espresso',
  'latte',
  'cappuccino',
  'macchiato',
  'flat white',
  'cold brew',
  'iced tea'
];

const CODE_SNIPPETS = {
  kotlin: `package com.ghostnode.pos.config

import org.springframework.context.annotation.Configuration
import com.ghostnode.spring.persistence.DatabaseConvergenceService

@Configuration
class POSConfiguration(
    private val convergenceService: DatabaseConvergenceService
) {
    // Database Convergence sync handler hook
    fun syncWithReplicas(incomingOps: List<CausalOperation<String>>) {
        val convergedLedger = convergenceService.syncWithRemoteOperations(incomingOps)
        logger.info("Converged Causal Ledger updated. Size: \${convergedLedger.elements().size}")
    }
}`,
  yaml: `ghostnode:
  compaction:
    auto-enabled: true
    interval-ms: 60000
    threshold-ms: 3600000`,
  surrogate: `package com.ghostnode.core.crdt

import kotlinx.serialization.Serializable
import kotlinx.serialization.KSerializer

// Serializers translate complex causal logs into DB-friendly flat structures
@Serializable(with = CausalLedgerSerializer::class)
data class CausalLedger<E>(
    val operations: PersistentMap<String, CausalOperation<E>> = persistentMapOf()
)`
};

export default function App() {
  // --- Sim Hook State ---
  const {
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
  } = useGhostNodeCluster();

  // Selected item inputs for each terminal
  const [selectedItems, setSelectedItems] = useState<{ [id: string]: string }>({
    'Terminal A': 'espresso',
    'Terminal B': 'latte',
    'Terminal C': 'flat white'
  });

  // Collapsed states for JSON inspectors
  const [inspectorsOpen, setInspectorsOpen] = useState<{ [id: string]: boolean }>({
    'Terminal A': false,
    'Terminal B': false,
    'Terminal C': false
  });

  const [activeTab, setActiveTab] = useState<'telemetry' | 'compaction' | 'integration'>('integration');
  const [integrationSubTab, setIntegrationSubTab] = useState<'kotlin' | 'yaml' | 'surrogate'>('kotlin');
  const [copyFeedback, setCopyFeedback] = useState(false);

  // --- Trie State ---
  const [trie, setTrie] = useState<TrieNode>(initialTrie);
  const [trieInput, setTrieInput] = useState('');
  const [copiedNodes, setCopiedNodes] = useState<Set<TrieNode>>(new Set());
  const [sharedNodes, setSharedNodes] = useState<Set<TrieNode>>(new Set());
  const [trieStats, setTrieStats] = useState<{ copied: number; shared: number } | null>(null);

  // --- Tombstone Compaction simulated parameters ---
  const [compactionTtl, setCompactionTtl] = useState(15);
  const [compactionLogs, setCompactionLogs] = useState<string[]>([]);

  // Count online nodes
  const onlineCount = useMemo(() => {
    return Object.values(terminals).filter(n => n.isOnline).length;
  }, [terminals]);

  // Handle local item selection change
  const handleItemSelect = (nodeId: string, value: string) => {
    setSelectedItems(prev => ({ ...prev, [nodeId]: value }));
  };

  // Toggle JSON state inspector
  const toggleInspector = (nodeId: string) => {
    setInspectorsOpen(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // --- Trie Visualizer Actions ---
  const handleTrieInsert = () => {
    if (!trieInput.trim()) return;
    const word = trieInput.trim().toLowerCase();

    const { newRoot, affected, shared } = insertWordIntoTrie(trie, word);
    setTrie(newRoot);
    setCopiedNodes(affected);
    setSharedNodes(shared);
    setTrieStats({
      copied: affected.size,
      shared: shared.size
    });
    setTrieInput('');
  };

  // --- Layout Computation for Trie SVG ---
  const trieLayoutData = useMemo(() => {
    const rootLayout = buildLayout(trie, 250, 40, 110, 0, copiedNodes, sharedNodes, '');
    const nodes: RenderNode[] = [];
    const links: RenderLink[] = [];
    collectElements(rootLayout, nodes, links);
    return { nodes, links };
  }, [trie, copiedNodes, sharedNodes]);

  // --- Manual Compaction Action ---
  const handleCompaction = () => {
    const now = Math.floor(Date.now() / 1000) % 10000;
    const threshold = compactionTtl;
    const logs: string[] = [];

    logs.push(`⚙️ [${new Date().toLocaleTimeString()}] GC sweep threshold set: ${threshold}s (ts: ${now})...`);
    logs.push("✔️ [Engine Thread] Swept expired database registers.");
    logs.push("✔️ [Engine Thread] Compacting operation log index size.");
    setCompactionLogs(logs);
  };

  // --- Copy Code to Clipboard ---
  const handleCopyCode = () => {
    const snippet = CODE_SNIPPETS[integrationSubTab];
    navigator.clipboard.writeText(snippet).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  // --- Code syntax highlighting render functions ---
  const renderKotlinHighlight = (code: string) => {
    const lines = code.split('\n');
    return lines.map((line, i) => {
      if (line.trim().startsWith('//')) {
        return (
          <div key={i} className="min-h-[1.5rem]">
            <span className="text-slate-600 italic select-none mr-3">{String(i + 1).padStart(2, ' ')} │ </span>
            <span className="text-slate-500 italic">{line}</span>
          </div>
        );
      }

      const tokens: React.ReactNode[] = [];
      const parts = line.split(/(\s+|\b)/);

      let isComment = false;

      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];

        if (part === '/' && parts[j + 1] === '/') {
          isComment = true;
          tokens.push(<span key={j} className="text-slate-500 italic">{parts.slice(j).join('')}</span>);
          break;
        }

        if (isComment) continue;

        if (['package', 'import', 'class', 'fun', 'data', 'val', 'with', 'enum'].includes(part)) {
          tokens.push(<span key={j} className="text-indigo-400 font-semibold">{part}</span>);
        } else if (part.startsWith('@')) {
          tokens.push(<span key={j} className="text-amber-400 font-medium">{part}</span>);
        } else if (part.startsWith('"') || (part.endsWith('"') && part.length > 1)) {
          tokens.push(<span key={j} className="text-emerald-400 font-medium">{part}</span>);
        } else if (['POSConfiguration', 'String', 'CausalLedger', 'CausalOperation', 'OperationType', 'PersistentMap', 'CausalLedgerSerializer', 'CausalLedgerSerializer::class'].includes(part) || (part === 'E' && parts[j - 1] === '<')) {
          tokens.push(<span key={j} className="text-sky-450 font-medium">{part}</span>);
        } else if (['logger', 'info', 'elements', 'size', 'operations', 'syncWithReplicas'].includes(part)) {
          tokens.push(<span key={j} className="text-indigo-300 font-medium">{part}</span>);
        } else {
          tokens.push(<span key={j} className="text-slate-300">{part}</span>);
        }
      }

      return (
        <div key={i} className="min-h-[1.5rem] hover:bg-slate-900/40 transition-colors">
          <span className="text-slate-700 select-none mr-3 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
          <span className="font-mono text-[12px]">{tokens}</span>
        </div>
      );
    });
  };

  const renderYamlHighlight = (code: string) => {
    const lines = code.split('\n');
    return lines.map((line, i) => {
      if (!line.trim()) {
        return (
          <div key={i} className="min-h-[1.5rem]">
            <span className="text-slate-700 select-none mr-3 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
          </div>
        );
      }

      const commentIdx = line.indexOf('#');
      let content = line;
      let comment = '';
      if (commentIdx !== -1) {
        content = line.substring(0, commentIdx);
        comment = line.substring(commentIdx);
      }

      const colonIdx = content.indexOf(':');
      if (colonIdx !== -1) {
        const key = content.substring(0, colonIdx);
        const val = content.substring(colonIdx);
        return (
          <div key={i} className="min-h-[1.5rem] hover:bg-slate-900/40 transition-colors">
            <span className="text-slate-700 select-none mr-3 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
            <span className="font-mono text-[12px]">
              <span className="text-indigo-400 font-semibold">{key}</span>
              <span className="text-slate-350">{val.substring(0, 1)}</span>
              <span className="text-emerald-450">{val.substring(1)}</span>
              {comment && <span className="text-slate-500 italic">{comment}</span>}
            </span>
          </div>
        );
      }

      return (
        <div key={i} className="min-h-[1.5rem] hover:bg-slate-900/40 transition-colors">
          <span className="text-slate-700 select-none mr-3 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
          <span className="font-mono text-[12px] text-slate-300">
            {content}
            {comment && <span className="text-slate-500 italic">{comment}</span>}
          </span>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/70 font-sans text-slate-800 antialiased grid-bg">
      {/* STICKY HEADER NAVBAR */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} className="w-6 h-6" alt="GhostNode Logo" />
            <span className="font-serif text-lg font-bold tracking-tight text-slate-900">
              GhostNode
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-xs font-bold tracking-wide uppercase text-slate-500">
            <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#sandbox" className="hover:text-indigo-600 transition-colors">POS Sandbox</a>
            <a href="#trie-visualizer" className="hover:text-indigo-600 transition-colors">Path Sharing</a>
            <a href="#telemetry" className="hover:text-indigo-600 transition-colors">Specifications</a>
          </div>
          <div>
            <a
              href="#sandbox"
              className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wider px-4.5 py-2.5 rounded-lg transition shadow-sm"
            >
              Launch Sandbox
            </a>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-800 text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-650 animate-pulse"></span>
          GhostNode Starter v1.2 is now live for Spring Boot
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6">
          Strong eventual consistency <br />
          <span className="bg-gradient-to-r from-indigo-700 to-indigo-500 bg-clip-text text-transparent">
            at the retail edge.
          </span>
        </h1>
        <p className="text-slate-650 text-base sm:text-lg font-medium leading-relaxed max-w-2xl mx-auto mb-10">
          GhostNode is a lightweight, CRDT-driven replication engine. Sync databases, registers, and edge catalogs offline with zero central orchestration overhead.
        </p>
        <div className="flex flex-col sm:flex-row gap-3.5 justify-center">
          <a
            href="#sandbox"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider px-6 py-3.5 rounded-xl transition duration-150 shadow-md shadow-indigo-600/10 active:scale-[0.98]"
          >
            Launch Live Sandbox
          </a>
          <a
            href="#telemetry"
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider px-6 py-3.5 rounded-xl transition shadow-sm active:scale-[0.98]"
          >
            Browse Configuration
          </a>
        </div>
      </header>

      {/* CORE CAPABILITIES SECTION */}
      <section id="features" className="py-20 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-serif font-bold text-slate-950 mb-3">
              Engineered for absolute resilience
            </h2>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              Replacing heavy locks with mathematical convergence parameters for ultra-low latency.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {/* Feature 1 */}
            <div>
              <div className="font-mono text-indigo-500 text-xs font-bold mb-3 tracking-widest uppercase">01 / Convergence</div>
              <h3 className="font-serif font-bold text-slate-900 text-lg mb-2">Deterministic OR-Set Merging</h3>
              <p className="text-xs text-slate-650 font-semibold leading-relaxed">
                Mutations converge deterministically via lattice history logs. Operations sync via clean sets without central transactional coordinator locks.
              </p>
            </div>
            {/* Feature 2 */}
            <div>
              <div className="font-mono text-indigo-500 text-xs font-bold mb-3 tracking-widest uppercase">02 / Architecture</div>
              <h3 className="font-serif font-bold text-slate-900 text-lg mb-2">Offline Autonomy</h3>
              <p className="text-xs text-slate-650 font-semibold leading-relaxed">
                Local registers run transactions during drops. Clock lists identify and queue causal order, synchronizing automatically when connectivity recovers.
              </p>
            </div>
            {/* Feature 3 */}
            <div>
              <div className="font-mono text-indigo-500 text-xs font-bold mb-3 tracking-widest uppercase">03 / State Sync</div>
              <h3 className="font-serif font-bold text-slate-900 text-lg mb-2">Vector Conflict Audits</h3>
              <p className="text-xs text-slate-650 font-semibold leading-relaxed">
                Log lists track dependencies, identifying and resolving concurrent updates (like updates vs deletions) with consistent, rule-based algorithms.
              </p>
            </div>
            {/* Feature 4 */}
            <div>
              <div className="font-mono text-indigo-500 text-xs font-bold mb-3 tracking-widest uppercase">04 / Performance</div>
              <h3 className="font-serif font-bold text-slate-900 text-lg mb-2">0ms GC Overhead</h3>
              <p className="text-xs text-slate-650 font-semibold leading-relaxed">
                Structural path copying ensures only mutated branches are allocated on the JVM heap. Prevents garbage collector pauses even at high sync frequency.
              </p>
            </div>
            {/* Feature 5 */}
            <div>
              <div className="font-mono text-indigo-500 text-xs font-bold mb-3 tracking-widest uppercase">05 / Security</div>
              <h3 className="font-serif font-bold text-slate-900 text-lg mb-2">Hash Merkle Verification</h3>
              <p className="text-xs text-slate-650 font-semibold leading-relaxed">
                Each sync cycle validates data integrity via local Merkle trees. Keeps database exchanges protected against state corruption or injection.
              </p>
            </div>
            {/* Feature 6 */}
            <div>
              <div className="font-mono text-indigo-500 text-xs font-bold mb-3 tracking-widest uppercase">06 / Efficiency</div>
              <h3 className="font-serif font-bold text-slate-900 text-lg mb-2">Incremental Deltas</h3>
              <p className="text-xs text-slate-650 font-semibold leading-relaxed">
                Terminals evaluate hash differences to transfer only missing operations. Minimizes bandwidth consumption over slow or cellular store networks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* POS INTERACTIVE SANDBOX PLAYGROUND */}
      <section id="sandbox" className="py-20 border-t border-slate-200 bg-slate-100/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
            <div>
              <h2 className="text-3xl font-serif font-bold text-slate-900 mb-2">
                POS Sandbox Playground
              </h2>
              <p className="text-slate-600 text-sm font-medium">
                Simulate offline mutations, increment quantities, modify maps, and trigger the convergence core.
              </p>
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {onlineCount} of 3 Nodes Connected
              </span>
            </div>
          </div>

          {/* Quick simulator workflow */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-serif font-bold text-slate-950 text-base mb-2">Replication Simulator</h3>
              <p className="text-slate-650 text-xs font-semibold leading-relaxed mb-3">
                Toggle terminal nodes offline to simulate a network outage, and execute local updates (add items, adjust stock counts, create orders). Because the node is offline, those updates will remain local.
              </p>
              <p className="text-slate-650 text-xs font-semibold leading-relaxed">
                When you toggle the nodes back online and hit <strong>Synchronize Cluster State</strong>, the cluster will exchange state vectors, merging concurrent additions and tombstones deterministically.
              </p>
            </div>
            <div className="lg:col-span-4 bg-indigo-950 text-indigo-100 rounded-2xl p-6 flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="font-serif font-bold text-white text-sm mb-2">Sync Instructions</h4>
                <ul className="text-[11px] text-indigo-200 font-medium space-y-2 leading-relaxed">
                  <li><strong>1. Split State:</strong> Toggle a node offline and perform changes.</li>
                  <li><strong>2. Clock shift:</strong> Independent vector clocks will advance.</li>
                  <li><strong>3. Converge:</strong> Bring online and click sync; logs trace decisions.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Terminal nodes listing */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {Object.values(terminals).map(node => {
              const visibleItems = getVisibleElements(node);
              const isCollapsed = !inspectorsOpen[node.id];

              return (
                <div
                  key={node.id}
                  className={`bg-white border rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col ${
                    node.isOnline ? 'border-slate-200' : 'border-rose-250/60 bg-rose-50/5'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-serif text-lg font-bold text-slate-900">{node.id}</h3>
                      <div className="flex flex-col gap-1 mt-1.5">
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-150 font-bold self-start">
                          Clock: {JSON.stringify(node.clock)}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-650 bg-indigo-50/50 px-2 py-0.5 rounded border border-indigo-100/50 font-bold self-start">
                          Hash: {node.merkleRoot}
                        </span>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      id={`toggle-${node.id.replace(/\s+/g, '-').toLowerCase()}`}
                      onClick={() => toggleOnline(node.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${
                        node.isOnline ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-250 ease-in-out ${
                          node.isOnline ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Status Indicator */}
                  <div className="mb-4">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                        node.isOnline
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}
                    >
                      {node.isOnline ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Connected
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                          Offline Mode
                        </>
                      )}
                    </span>
                  </div>

                  {/* OR-Set Catalog */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 mb-4 min-h-[90px] flex flex-col">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Menu Catalog (OR-Set)
                    </h4>
                    {visibleItems.length === 0 ? (
                      <p className="text-xs text-slate-400 italic mt-1 font-medium">No items present.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {visibleItems.map(item => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 pl-2.5 pr-1 py-0.5 rounded-lg text-slate-800 shadow-sm font-semibold transition hover:border-slate-350"
                          >
                            {item}
                            <button
                              onClick={() => removeItem(node.id, item)}
                              className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition"
                              title="Delete Item"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* PN-Counter Inventory */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Inventory (PN-Counter)
                      </h4>
                      <span className="text-xs font-mono font-bold text-indigo-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">
                        Qty: {getPNCounterValue(node.inventory)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => adjustInventory(node.id, 'INC', 1)}
                        className="flex-grow bg-white border border-slate-200 hover:bg-slate-50 text-slate-750 text-xs font-bold py-1.5 px-2 rounded-lg shadow-xs transition active:scale-[0.98]"
                      >
                        - Sale
                      </button>
                      <button
                        onClick={() => adjustInventory(node.id, 'DEC', 1)}
                        className="flex-grow bg-white border border-slate-200 hover:bg-slate-50 text-slate-755 text-xs font-bold py-1.5 px-2 rounded-lg shadow-xs transition active:scale-[0.98]"
                      >
                        + Return
                      </button>
                    </div>
                  </div>

                  {/* OR-Map Active Orders */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 mb-4">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Active Orders Map (OR-Map)
                    </h4>
                    <div className="space-y-1 max-h-[85px] overflow-y-auto pr-1 mb-3">
                      {getORMapKeys(node.orders).length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No orders.</p>
                      ) : (
                        getORMapKeys(node.orders).map(table => (
                          <div
                            key={table}
                            className="flex justify-between items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                          >
                            <span className="font-semibold text-slate-650">{table}:</span>
                            <span className="text-slate-800 font-bold">{getORMapValue(node.orders, table)}</span>
                            <button
                              onClick={() => removeOrder(node.id, table)}
                              className="text-slate-400 hover:text-rose-500 font-bold transition ml-2 text-sm"
                              title="Clear Order"
                            >
                              &times;
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Table #"
                        id={`table-input-${node.id.replace(/\s+/g, '-').toLowerCase()}`}
                        className="w-1/3 text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 bg-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = e.currentTarget.value.trim();
                            if (val) {
                              upsertOrder(node.id, val, selectedItems[node.id]);
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById(
                            `table-input-${node.id.replace(/\s+/g, '-').toLowerCase()}`
                          ) as HTMLInputElement;
                          const val = input?.value.trim();
                          if (val) {
                            upsertOrder(node.id, val, selectedItems[node.id]);
                            input.value = '';
                          }
                        }}
                        className="flex-grow bg-white border border-slate-200 hover:bg-slate-50 text-slate-750 text-xs font-bold py-1.5 px-2 rounded-lg shadow-xs transition active:scale-[0.98]"
                      >
                        Set Order
                      </button>
                    </div>
                  </div>

                  {/* Actions & Selector */}
                  <div className="flex gap-2 mt-auto pt-3 border-t border-slate-100">
                    <select
                      value={selectedItems[node.id]}
                      onChange={(e) => handleItemSelect(node.id, e.target.value)}
                      className="select-custom flex-grow text-xs"
                    >
                      {MENU_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => addItem(node.id, selectedItems[node.id])}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-2.5 rounded-lg shadow-sm active:scale-95 transition flex items-center justify-center"
                      title="Add Item"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Inspect JSON Panel */}
                  <div className="border-t border-slate-100 mt-4 pt-3">
                    <button
                      onClick={() => toggleInspector(node.id)}
                      className="w-full flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-indigo-650 transition"
                    >
                      <span>inspect local state</span>
                      <span className="bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-0.5 text-[9px] font-bold">
                        {isCollapsed ? 'Show' : 'Hide'}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden shadow-inner">
                        <pre className="bg-slate-900 text-slate-350 text-[10px] p-3 overflow-x-auto max-h-[140px] font-mono leading-normal console-scrollbar">
                          {JSON.stringify(
                            {
                              operations: node.operations,
                              inventory: node.inventory,
                              orders: node.orders,
                              visible: visibleItems
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sync Trigger block */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div className="max-w-2xl">
              <h3 className="font-serif font-bold text-slate-900 text-lg">Global Merge Controller</h3>
              <p className="text-slate-600 text-xs font-semibold leading-relaxed mt-1">
                Trigger state synchronization to merge operational maps and inventories using the semi-lattice rules of causal histories.
              </p>
            </div>
            <button
              id="sync-replicas-btn"
              onClick={triggerMerge}
              disabled={onlineCount === 0}
              className={`w-full md:w-auto font-sans font-bold flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl transition shadow-sm ${
                onlineCount === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-250 cursor-not-allowed shadow-none'
                  : 'bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.98]'
              }`}
            >
              <ArrowPathIcon
                className={`w-4 h-4 ${onlineCount > 0 ? 'animate-spin' : ''}`}
                style={{ animationDuration: '3s' }}
              />
              Synchronize Cluster State
            </button>
          </div>

          {/* Conflict Auditing Ledger */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="font-serif font-bold text-slate-900 text-base">Causality Resolution Ledger</h3>
              <p className="text-slate-500 text-xs font-semibold">
                Live transactional sync convergence decisions.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3">Menu Item</th>
                    <th className="px-6 py-3">Conflict Category</th>
                    <th className="px-6 py-3">Winner node</th>
                    <th className="px-6 py-3">Logical Time</th>
                    <th className="px-6 py-3">Resolution Rule</th>
                    <th className="px-6 py-3">Convergence Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs text-slate-700">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-400 italic font-medium">
                        Replicas are fully merged. Simulate offline transactions to view conflict resolutions.
                      </td>
                    </tr>
                  ) : (
                    ledger.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/40 transition">
                        <td className="px-6 py-3.5 font-mono font-bold text-slate-900">{rec.element}</td>
                        <td className="px-6 py-3.5">
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {rec.type}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 font-semibold text-slate-900">{rec.winnerNode}</td>
                        <td className="px-6 py-3.5 font-mono text-[10px] text-slate-500">{rec.winnerTimestamp}s</td>
                        <td className="px-6 py-3.5">
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {rec.reason}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 font-medium text-[11px] max-w-xs leading-normal">
                          {rec.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* RADIX TRIE STRUCTURAL PATH SHARING VISUALIZER */}
      <section id="trie-visualizer" className="py-20 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Controls */}
            <div className="lg:col-span-5">
              <div className="font-mono text-indigo-500 text-xs font-bold mb-3 tracking-widest uppercase">
                Heap Optimization
              </div>
              <h2 className="text-3xl font-serif font-bold text-slate-950 mb-4">
                JVM Heap Optimization: Radix Path Sharing
              </h2>
              <p className="text-slate-650 text-sm font-medium leading-relaxed mb-6">
                To prevent garbage collection cycles under high concurrency, GhostNode uses path-copying. Check allocation changes by inserting a new word starting with 'a' or 'b' (e.g. <strong>"avocado"</strong> or <strong>"apricot"</strong>).
              </p>

              <div className="flex gap-2 mb-6">
                <input
                  id="trie-insert-input"
                  type="text"
                  value={trieInput}
                  onChange={(e) => setTrieInput(e.target.value)}
                  placeholder="Insert word (e.g. avocado)..."
                  className="input-text flex-grow focus:ring-0 focus:border-indigo-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleTrieInsert()}
                />
                <button
                  id="trie-insert-btn"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-lg transition active:scale-95"
                  onClick={handleTrieInsert}
                >
                  Insert Word
                </button>
              </div>

              {trieStats ? (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl text-xs space-y-2 text-slate-650 font-semibold leading-normal">
                  <div className="font-bold text-slate-950 text-sm mb-1.5">Memory Metrics</div>
                  <div>• Allocated nodes: <span className="text-emerald-600 font-mono font-bold">{trieStats.copied}</span></div>
                  <div>• Reused references: <span className="text-indigo-650 font-mono font-bold">{trieStats.shared}</span></div>
                  <div>• Heap reuse percentage: <span className="text-slate-900 font-bold">{((trieStats.shared / (trieStats.copied + trieStats.shared)) * 100).toFixed(0)}%</span> of trie size.</div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 text-center py-6 rounded-xl text-xs text-slate-400 font-medium">
                  Insert a word to run allocation analysis.
                </div>
              )}
            </div>

            {/* Tree SVG diagram */}
            <div className="lg:col-span-7 bg-slate-50 border border-slate-250/70 rounded-2xl p-6 flex flex-col justify-center items-center overflow-x-auto min-h-[380px] shadow-xs">
              {/* Clean Legend */}
              <div className="flex gap-4 mb-4 text-[10px] font-bold text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  New Heap Instance
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                  Shared Reference
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-350"></span>
                  Unmodified Node
                </div>
              </div>

              <svg width="500" height="300" className="max-w-full">
                <defs>
                  <marker id="trie-arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
                  </marker>
                </defs>

                {/* Draw Links */}
                {trieLayoutData.links.map((link, idx) => (
                  <line
                    key={idx}
                    x1={link.fromX}
                    y1={link.fromY}
                    x2={link.toX}
                    y2={link.toY}
                    stroke={link.isCopied ? '#10b981' : link.isShared ? '#6366f1' : '#e2e8f0'}
                    strokeWidth={link.isCopied ? '2' : link.isShared ? '1.5' : '1'}
                    markerEnd="url(#trie-arrow)"
                    className="transition-all duration-300"
                  />
                ))}

                {/* Draw Nodes */}
                {trieLayoutData.nodes.map((node) => {
                  let fill = '#ffffff';
                  let stroke = '#cbd5e1';

                  if (node.isCopied) {
                    stroke = '#10b981';
                  } else if (node.isShared) {
                    stroke = '#6366f1';
                  }

                  return (
                    <g key={node.id} className="cursor-pointer group">
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.char === 'ROOT' ? '15' : '11'}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={node.isCopied || node.isShared ? '2.5' : '1.5'}
                        className="transition-all duration-200 group-hover:scale-[1.04]"
                      />
                      <text
                        x={node.x}
                        y={node.y + 3.5}
                        fill={node.isCopied ? '#047857' : node.isShared ? '#4338ca' : '#475569'}
                        fontSize={node.char === 'ROOT' ? '8' : '10'}
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                        className="select-none"
                      >
                        {node.char === 'ROOT' ? 'ROOT' : node.char}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* METRICS & CONFIGURATION TABS */}
      <section id="telemetry" className="py-20 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          {/* Tabs bar */}
          <div className="flex justify-center mb-10">
            <div className="flex bg-slate-200 border border-slate-250 p-1 rounded-xl shadow-xs">
              <button
                id="tab-telemetry-btn"
                className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                  activeTab === 'telemetry'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
                onClick={() => setActiveTab('telemetry')}
              >
                Telemetry Dashboard
              </button>
              <button
                id="tab-compaction-btn"
                className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                  activeTab === 'compaction'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
                onClick={() => setActiveTab('compaction')}
              >
                JVM Garbage Compaction
              </button>
              <button
                id="tab-integration-btn"
                className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                  activeTab === 'integration'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
                onClick={() => setActiveTab('integration')}
              >
                Spring Boot Starter
              </button>
            </div>
          </div>

          {/* TELEMETRY CHART */}
          {activeTab === 'telemetry' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
              <h3 className="text-xl font-serif font-bold text-slate-900 mb-2">
                Micrometer Dashboard (Latency & Conflicts)
              </h3>
              <p className="text-slate-500 text-xs font-semibold mb-8">
                Execution speed analysis and conflict counts resolved during merge operations.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4 text-center">
                    Merge Latency (ms)
                  </h4>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <defs>
                          <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                        <YAxis
                          stroke="#64748b"
                          fontSize={10}
                          label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '11px',
                            backgroundColor: '#ffffff'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="latencyMs"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorLatency)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4 text-center">
                    Conflicts Automatically Resolved
                  </h4>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '11px',
                            backgroundColor: '#ffffff'
                          }}
                        />
                        <Bar dataKey="conflictsResolved" fill="#818cf8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* JVM COMPACTION */}
          {activeTab === 'compaction' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
              <h3 className="text-xl font-serif font-bold text-slate-900 mb-2">
                Tombstone Garbage Compaction
              </h3>
              <p className="text-slate-500 text-xs font-semibold mb-8">
                Prune historical deletion vectors to reclaim memory without causing synchronization faults.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">GC Pruning Policy</h4>
                  <p className="text-xs text-slate-650 font-semibold leading-relaxed mb-4">
                    In causal replication systems, deletions leave a "tombstone" history payload so replicas are aware of removals. Under high throughput, tombstones accumulate, increasing memory footprint. Pruning sweeps discard tombstones older than the threshold.
                  </p>

                  <div className="p-4 bg-slate-900 rounded-lg border border-slate-850 text-xs font-mono text-slate-300 space-y-1 mb-4 select-none">
                    <div className="text-slate-550 italic mb-1"># application.yml compaction limits</div>
                    <div>ghostnode.compaction.threshold-ms=<span className="text-emerald-450">86400000</span></div>
                    <div>ghostnode.compaction.cron-schedule=<span className="text-emerald-450">"0 0 * * * ?"</span></div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-xs">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tombstone TTL:</span>
                      <span className="text-xs font-mono font-bold text-indigo-750 bg-indigo-50 px-2 py-0.5 rounded">
                        {compactionTtl} seconds
                      </span>
                    </div>
                    <input
                      id="tombstone-ttl-slider"
                      type="range"
                      min="5"
                      max="60"
                      value={compactionTtl}
                      onChange={(e) => setCompactionTtl(parseInt(e.target.value))}
                      className="w-full accent-indigo-600 my-2"
                    />
                    <button
                      id="tombstone-compact-btn"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold w-full py-2 rounded-lg text-xs mt-3.5 shadow-sm transition"
                      onClick={handleCompaction}
                    >
                      Trigger Manual Compact
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Heap footprint optimization</h4>
                  <p className="text-xs text-slate-650 font-semibold leading-relaxed mb-4">
                    Graph demonstrates heap size differences between copy-on-write systems vs path-shared trie trees.
                  </p>
                  <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs">
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5 text-slate-700">
                        <span>GhostNode Path sharing structures:</span>
                        <span className="text-emerald-600 font-extrabold font-mono">12.4 KB</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '9%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5 text-slate-700">
                        <span>Naive Copy-on-Write lists:</span>
                        <span className="text-rose-600 font-extrabold font-mono">142.8 KB</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-rose-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Trace output logs
                    </h5>
                    <pre className="bg-slate-900 text-slate-350 text-[10px] p-3 rounded-lg font-mono border border-slate-800 min-h-[60px] console-scrollbar">
                      {compactionLogs.length === 0
                        ? 'No manual GC compaction run. Adjust TTL slider and execute trigger.'
                        : compactionLogs.join('\n')}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SPRING STARTER DESIGNER */}
          {activeTab === 'integration' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
              <div className="mb-6">
                <h3 className="text-xl font-serif font-bold text-slate-900">
                  Enterprise Integration Configuration
                </h3>
                <p className="text-slate-650 text-xs font-semibold mt-1">
                  Integrate GhostNode to coordinate data models, register convergence listeners, and scale synchronization schedules.
                </p>
              </div>

              {/* IDE Code Frame */}
              <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md mb-8">
                {/* Tabs bar */}
                <div className="bg-[#0b0f19] px-4 pt-2 border-b border-slate-800 flex items-end justify-between">
                  <div className="flex gap-1">
                    {/* Fake window controller circles */}
                    <div className="flex gap-1.5 items-center mr-6 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                    </div>

                    <button
                      onClick={() => setIntegrationSubTab('kotlin')}
                      className={`px-3 py-2 text-xs font-mono font-semibold rounded-t-lg transition flex items-center gap-2 border-t border-x ${
                        integrationSubTab === 'kotlin'
                          ? 'bg-slate-900 text-indigo-400 border-slate-800'
                          : 'bg-transparent text-slate-550 border-transparent hover:bg-slate-800/40 hover:text-slate-300'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      POSConfiguration.kt
                    </button>

                    <button
                      onClick={() => setIntegrationSubTab('yaml')}
                      className={`px-3 py-2 text-xs font-mono font-semibold rounded-t-lg transition flex items-center gap-2 border-t border-x ${
                        integrationSubTab === 'yaml'
                          ? 'bg-slate-900 text-indigo-400 border-slate-800'
                          : 'bg-transparent text-slate-550 border-transparent hover:bg-slate-800/40 hover:text-slate-300'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      application.yml
                    </button>

                    <button
                      onClick={() => setIntegrationSubTab('surrogate')}
                      className={`px-3 py-2 text-xs font-mono font-semibold rounded-t-lg transition flex items-center gap-2 border-t border-x ${
                        integrationSubTab === 'surrogate'
                          ? 'bg-slate-900 text-indigo-400 border-slate-800'
                          : 'bg-transparent text-slate-555 border-transparent hover:bg-slate-800/40 hover:text-slate-300'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                      SerializationSurrogate.kt
                    </button>
                  </div>

                  {/* Copy Button */}
                  <button
                    onClick={handleCopyCode}
                    className="mb-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-800/50 text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    {copyFeedback ? (
                      <>
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copy Snippet
                      </>
                    )}
                  </button>
                </div>

                {/* Editor Content */}
                <div className="p-5 overflow-x-auto max-h-[340px] console-scrollbar bg-slate-900">
                  {integrationSubTab === 'kotlin' && renderKotlinHighlight(CODE_SNIPPETS.kotlin)}
                  {integrationSubTab === 'yaml' && renderYamlHighlight(CODE_SNIPPETS.yaml)}
                  {integrationSubTab === 'surrogate' && renderKotlinHighlight(CODE_SNIPPETS.surrogate)}
                </div>
              </div>

              {/* Three Pillar Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-xs hover:shadow-sm transition">
                  <h4 className="font-serif font-bold text-slate-900 text-sm mb-2">
                    Flexible Serializers
                  </h4>
                  <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                    Surrogate layers compile complex causal graphs into schema-safe table formats, handling missing fields gracefully without database model updates.
                  </p>
                </div>

                <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-xs hover:shadow-sm transition">
                  <h4 className="font-serif font-bold text-slate-900 text-sm mb-2">
                    Secure Manifest Signatures
                  </h4>
                  <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                    Terminals authenticate sync payloads via hash signature verification, preventing malicious transaction injections during merge cycles.
                  </p>
                </div>

                <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-xs hover:shadow-sm transition">
                  <h4 className="font-serif font-bold text-slate-900 text-sm mb-2">
                    Automatic Compact Sweeping
                  </h4>
                  <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                    The Spring starter automatically registers micrometer timers and launches background tombstone sweep schedulers based on standard cron schedules.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto border-t border-slate-200 mt-12 py-10 text-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
        <p>GhostNode Eventual Consistency Platform © 2026. Powered by React, Tailwind CSS, and Recharts.</p>
      </footer>
    </div>
  );
}
