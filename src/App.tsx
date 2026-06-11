import { useState, useMemo } from 'react';
import {
  Square3Stack3DIcon,
  SignalIcon,
  CpuChipIcon,
  CircleStackIcon,
  BoltIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  AdjustmentsHorizontalIcon,
  DocumentTextIcon,
  SparklesIcon,
  WifiIcon,
  ServerIcon,
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
import { useGhostNodeCluster } from './useGhostNode';
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
    const childY = y + 75;
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
import com.ghostnode.spring.boot.autoconfigure.EnableGhostNode
import org.springframework.context.event.EventListener

//@EnableGhostNode registers auto-compaction and exposes metrics
@Configuration
@EnableGhostNode
class POSConfiguration {
    // Reactive event bus callback hook
    @EventListener
    fun onMergeReceived(event: GhostNodeMergeEvent<String>) {
        logger.info("Merged and converged state. Updated size: \${event.mergedSet.elements().size}")
    }
}`,
  yaml: `ghostnode:
  compaction:
    threshold-ms: 86400000      # 24 hour retention for deleted records
    cron-schedule: "0 0 * * * ?"   # run compaction hourly
  clock:
    prune-threshold-ms: 2592000000 # prune dead edge vectors after 30 days`,
  surrogate: `package com.ghostnode.core.crdt

import kotlinx.serialization.Serializable
import kotlinx.serialization.surrogate.Surrogate

// Surrogates translate complex CRDT sets to DB-friendly flat structures
@Serializable(with = LWWElementSetSerializer::class)
data class LWWElementSet<E>(
    val addSet: Map<E, LWWRegister<E>>,
    val removeSet: Map<E, LWWRegister<E>>,
    val defaultBias: Bias = Bias.ADD
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

  const [activeTab, setActiveTab] = useState<'compaction' | 'telemetry' | 'integration'>('telemetry');
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
    const rootLayout = buildLayout(trie, 250, 40, 115, 0, copiedNodes, sharedNodes, '');
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

    logs.push(`⚙️ [${new Date().toLocaleTimeString()}] Pruning Tombstones (TTL: ${threshold}s, rel_ts: ${now})...`);
    logs.push("✔️ [GC Thread] Swept expired tombstone registers.");
    logs.push("✔️ [GC Thread] Compacted replica state size successfully.");
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
            <span className="text-slate-500 italic select-none">{String(i + 1).padStart(2, ' ')} │ </span>
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
          tokens.push(<span key={j} className="text-purple-400 font-semibold">{part}</span>);
        } else if (part.startsWith('@')) {
          tokens.push(<span key={j} className="text-amber-400 font-semibold">{part}</span>);
        } else if (part.startsWith('"') || (part.endsWith('"') && part.length > 1)) {
          tokens.push(<span key={j} className="text-emerald-400 font-medium">{part}</span>);
        } else if (['POSConfiguration', 'GhostNodeMergeEvent', 'String', 'LWWElementSet', 'LWWRegister', 'Bias', 'Map', 'LWWElementSetSerializer', 'LWWElementSetSerializer::class'].includes(part) || (part === 'E' && parts[j - 1] === '<')) {
          tokens.push(<span key={j} className="text-cyan-400 font-medium">{part}</span>);
        } else if (['logger', 'info', 'elements', 'size', 'mergedSet', 'onMergeReceived'].includes(part)) {
          tokens.push(<span key={j} className="text-sky-300 font-medium">{part}</span>);
        } else {
          tokens.push(<span key={j} className="text-slate-200">{part}</span>);
        }
      }

      return (
        <div key={i} className="min-h-[1.5rem] hover:bg-slate-800/30 transition-colors">
          <span className="text-slate-600 select-none mr-2 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
          <span className="font-mono text-[13px]">{tokens}</span>
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
            <span className="text-slate-600 select-none mr-2 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
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
          <div key={i} className="min-h-[1.5rem] hover:bg-slate-800/30 transition-colors">
            <span className="text-slate-600 select-none mr-2 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
            <span className="font-mono text-[13px]">
              <span className="text-sky-400 font-semibold">{key}</span>
              <span className="text-slate-300">{val.substring(0, 1)}</span>
              <span className="text-emerald-400">{val.substring(1)}</span>
              {comment && <span className="text-slate-500 italic">{comment}</span>}
            </span>
          </div>
        );
      }

      return (
        <div key={i} className="min-h-[1.5rem] hover:bg-slate-800/30 transition-colors">
          <span className="text-slate-600 select-none mr-2 font-mono">{String(i + 1).padStart(2, ' ')} │</span>
          <span className="font-mono text-[13px] text-slate-200">
            {content}
            {comment && <span className="text-slate-500 italic">{comment}</span>}
          </span>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen font-sans text-slate-800 antialiased pb-24 selection:bg-indigo-100">
      {/* HEADER */}
      <header className="max-w-7xl mx-auto px-6 py-5 border-b border-slate-200 flex justify-between items-center mb-10 bg-white/70 backdrop-blur-lg rounded-b-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <img src={logo} className="w-8 h-8" alt="GhostNode Logo" />
          <span className="font-serif text-2xl font-bold bg-gradient-to-r from-indigo-700 to-sky-700 bg-clip-text text-transparent">
            GhostNode
          </span>
        </div>
        <span className="font-sans text-[10px] font-extrabold uppercase tracking-widest text-slate-600">
          Sync Platform
        </span>
      </header>

      {/* HERO SECTION */}
      <main className="max-w-7xl mx-auto px-6">
        <section className="text-center mb-12 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-slate-900 leading-tight mb-4">
            Edge-First Consistency Engine <br />
            <span className="bg-gradient-to-r from-indigo-600 to-sky-600 bg-clip-text text-transparent">
              With Zero Coordination Overhead
            </span>
          </h1>
          <p className="text-slate-800 text-[16.5px] font-medium leading-relaxed max-w-3xl mx-auto">
            GhostNode guarantees eventual convergence on edge devices using LWW-Element-Sets. Explore multi-terminal mutations, conflict resolution ledger analysis, and trie heap sharing structures below.
          </p>
        </section>

        {/* TERMINAL NODES CONTROLLER */}
        <section className="mb-12">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2.5">
                <CircleStackIcon className="w-6 h-6 text-indigo-600" />
                POS Edge Registers (Terminal Nodes)
              </h2>
              <p className="text-sm text-slate-800 font-semibold mt-1">
                Perform transactions on registers. Toggle terminals online/offline to simulate sync anomalies.
              </p>
            </div>
            <div className="text-xs bg-white border border-slate-300 text-slate-800 rounded-xl px-4 py-2 font-bold flex items-center gap-2 shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              {onlineCount} of 3 Nodes Connected
            </div>
          </div>

          {/* Simulation Topology Explanation Card */}
          <div className="bg-blue-50 border border-blue-205 rounded-2xl p-6 mb-8 text-sm text-slate-900 leading-relaxed grid grid-cols-1 md:grid-cols-3 gap-6 shadow-sm">
            <div className="md:col-span-2">
              <h3 className="font-serif font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-indigo-600" />
                What does this simulator demonstrate?
              </h3>
              <p className="mb-3 text-sm text-slate-900 font-medium leading-relaxed">
                In a real-world enterprise retail environment, registers (represented here as Terminal A: Checkout, Terminal B: Drive-Thru, and Terminal C: Kitchen Kiosk) run on separate edge servers to stay fast and operational even during server drops. When connection faults occur (simulated by toggling a node <strong>Offline</strong>), store cashiers must continue processing menu additions and removals.
              </p>
              <p className="text-sm text-slate-900 font-medium leading-relaxed">
                While disconnected, local menu mutations cause terminals' states and <strong>Vector Clocks</strong> to diverge. Toggling a terminal back <strong>Online</strong> and clicking the sync button triggers GhostNode's LWW-Element-Set conflict resolution, merging additions and deletions step-by-step and converging all registers back to one consistent state.
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-blue-200 flex flex-col justify-center shadow-sm">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3.5 flex items-center gap-1.5">
                <CheckIcon className="w-4 h-4 text-emerald-600 stroke-[3]" /> Conflict Resolution Steps:
              </h4>
              <ul className="text-xs text-slate-900 font-bold space-y-2.5">
                <li><strong className="text-indigo-900 font-extrabold">1. Simulate splits:</strong> Toggle a node offline and add or remove items.</li>
                <li><strong className="text-indigo-900 font-extrabold">2. Clock advancement:</strong> Local operations increment the vector clock.</li>
                <li><strong className="text-indigo-900 font-extrabold">3. Sync converge:</strong> Reconnect nodes and sync; conflict log handles divergence.</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {Object.values(terminals).map(node => {
              const visibleItems = getVisibleElements(node);
              const isCollapsed = !inspectorsOpen[node.id];

              return (
                <div
                  key={node.id}
                  className={`bg-white border rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-md ${node.isOnline
                      ? 'border-slate-200'
                      : 'border-rose-200 bg-rose-50/10'
                    }`}
                >
                  {/* Node Header */}
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h3 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2">
                        <ServerIcon className={`w-5 h-5 ${node.isOnline ? 'text-indigo-600' : 'text-rose-500'}`} />
                        {node.id}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-800 font-bold mt-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 inline-block">
                        Clock: {JSON.stringify(node.clock)}
                      </div>
                    </div>

                    {/* Online Toggle Switch */}
                    <button
                      id={`toggle-${node.id.replace(/\s+/g, '-').toLowerCase()}`}
                      onClick={() => toggleOnline(node.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${node.isOnline ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${node.isOnline ? 'translate-x-5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>

                  {/* Online Tag */}
                  <div className="mb-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-0.5 ${node.isOnline
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                      {node.isOnline ? (
                        <>
                          <WifiIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                          Connected (Online)
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                          Offline (Disconnected)
                        </>
                      )}
                    </span>
                  </div>

                  {/* Active elements list */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 min-h-[140px] flex flex-col shadow-inner">
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">
                      converged items
                    </h4>
                    {visibleItems.length === 0 ? (
                      <p className="text-sm text-slate-700 font-semibold italic mt-2">No active items.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {visibleItems.map(item => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1 text-sm bg-white border border-slate-200 px-3 py-1 rounded-lg text-slate-900 shadow-sm font-semibold hover:border-slate-300 transition"
                          >
                            {item}
                            <button
                              onClick={() => removeItem(node.id, item)}
                              className="text-rose-500 hover:text-rose-700 ml-1.5 p-0.5 rounded hover:bg-rose-50"
                              title="Delete Item"
                            >
                              <TrashIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex gap-2.5 mb-5">
                    <select
                      value={selectedItems[node.id]}
                      onChange={(e) => handleItemSelect(node.id, e.target.value)}
                      className="select-custom flex-grow"
                    >
                      {MENU_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => addItem(node.id, selectedItems[node.id])}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-3 rounded-xl shadow-sm hover:shadow active:scale-95 transition-all"
                      title="Add Item"
                    >
                      <PlusIcon className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* JSON view */}
                  <div className="border-t border-slate-200 pt-4">
                    <button
                      onClick={() => toggleInspector(node.id)}
                      className="w-full flex justify-between items-center text-xs font-bold text-slate-800 uppercase tracking-wider focus:outline-none hover:text-indigo-600 transition"
                    >
                      <span>Local State JSON</span>
                      <span className="bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-0.5">{isCollapsed ? 'Show' : 'Hide'}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="mt-3.5 rounded-xl border border-slate-950 overflow-hidden shadow-md">
                        <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                          <span className="text-[10px] text-slate-400 font-mono ml-auto">state_inspect.json</span>
                        </div>
                        <pre className="bg-slate-950 text-slate-200 text-[11.5px] p-4 overflow-x-auto max-h-[190px] font-mono leading-relaxed console-scrollbar">
                          {JSON.stringify(
                            {
                              addSet: node.addSet,
                              removeSet: node.removeSet,
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
        </section>

        {/* SYNC PANEL */}
        <section className="mb-12 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 glass-panel-glow">
          <div className="max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-900 flex items-center gap-2.5">
              <ArrowPathIcon className="w-6 h-6 text-indigo-600 stroke-[2.5]" />
              Global Sync Engine Control
            </h2>
            <p className="text-slate-800 text-sm font-semibold mt-1.5">
              Merges the states of all online nodes using the mathematical semi-lattice guarantees of LWW-Element-Sets.
            </p>
          </div>
          <button
            id="sync-replicas-btn"
            onClick={triggerMerge}
            disabled={onlineCount === 0}
            className={`w-full md:w-auto font-sans font-bold flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl shadow-lg transition duration-200 ${onlineCount === 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border border-slate-350'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-xl hover:shadow-indigo-100 active:scale-[0.98]'
              }`}
          >
            <ArrowPathIcon className={`w-5 h-5 ${onlineCount > 0 ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            Synchronize Cluster State
          </button>
        </section>

        {/* RESOLUTION LEDGER */}
        <section className="mb-12">
          <h2 className="text-2xl font-serif font-bold text-slate-900 mb-1.5 flex items-center gap-2.5">
            <BoltIcon className="w-6 h-6 text-indigo-600 stroke-[2.2]" />
            Causality Resolution Ledger
          </h2>
          <p className="text-sm text-slate-800 font-semibold mb-6">
            Tracks resolved conflicts, vector clock relationships, and mathematical tie-breakers applied during the sync process.
          </p>

          <div className="bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    <th className="px-6 py-4 border-r border-slate-200">Menu Item</th>
                    <th className="px-6 py-4 border-r border-slate-200">Conflict Category</th>
                    <th className="px-6 py-4 border-r border-slate-200">Winning Node</th>
                    <th className="px-6 py-4 border-r border-slate-200">Simulated Time</th>
                    <th className="px-6 py-4 border-r border-slate-200">Resolution Rule</th>
                    <th className="px-6 py-4">Causality Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-700 font-bold italic bg-slate-50/50">
                        No conflicts recorded. Try taking a node offline, executing local changes, bringing it online, and clicking sync!
                      </td>
                    </tr>
                  ) : (
                    ledger.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900 border-r border-slate-100">{rec.element}</td>
                        <td className="px-6 py-4 border-r border-slate-100">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                            {rec.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900 border-r border-slate-100">{rec.winnerNode}</td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-slate-800 border-r border-slate-100">{rec.winnerTimestamp}s</td>
                        <td className="px-6 py-4 border-r border-slate-100">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-extrabold bg-sky-50 text-sky-900 border border-sky-200">
                            {rec.reason}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-800 font-semibold leading-relaxed max-w-sm">
                          {rec.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* RADIX TRIE STRUCTURAL SHARING */}
        <section className="mb-12">
          <h2 className="text-2xl font-serif font-bold text-slate-900 mb-1.5 flex items-center gap-2.5">
            <CpuChipIcon className="w-6 h-6 text-indigo-600 stroke-[2.2]" />
            JVM Heap Optimization: Radix Trie Path Sharing
          </h2>
          <p className="text-sm text-slate-800 font-semibold mb-6">
            GhostNode prevents object duplication allocations under high-frequency synchronization using Trie path-copying.
          </p>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Controls */}
            <div className="lg:col-span-5">
              <h3 className="text-lg font-serif font-bold text-slate-900 mb-2 flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-indigo-600" />
                Path-Copying Simulator
              </h3>
              <p className="text-sm text-slate-800 font-semibold mb-6 leading-relaxed">
                Insert a new word starting with 'a' or 'b' (like <strong className="text-indigo-900 font-bold">"apricot"</strong> or <strong className="text-indigo-900 font-bold">"avocado"</strong>) to visualize trie mutations. Nodes in <span className="text-emerald-700 font-bold">green</span> are newly allocated on the heap, while branches in <span className="text-sky-700 font-bold">blue</span> represent reference-shared nodes.
              </p>

              <div className="flex gap-2.5 mb-6">
                <input
                  id="trie-insert-input"
                  type="text"
                  value={trieInput}
                  onChange={(e) => setTrieInput(e.target.value)}
                  placeholder="Insert word (e.g. apricot)..."
                  className="input-text flex-grow"
                  onKeyDown={(e) => e.key === 'Enter' && handleTrieInsert()}
                />
                <button
                  id="trie-insert-btn"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-sm hover:shadow transition active:scale-95"
                  onClick={handleTrieInsert}
                >
                  Insert & Share
                </button>
              </div>

              {trieStats ? (
                <div className="bg-indigo-50/50 border border-indigo-200 p-5 rounded-xl text-xs space-y-2 text-slate-800 leading-normal font-semibold">
                  <div className="font-bold text-indigo-900 text-sm flex items-center gap-1 mb-1">
                    <SparklesIcon className="w-4 h-4 text-indigo-700" />
                    Allocation Sharing Analysis
                  </div>
                  <div>• Nodes created (new allocations): <span className="text-emerald-700 font-bold text-sm">{trieStats.copied}</span></div>
                  <div>• Nodes shared (reference sharing): <span className="text-sky-700 font-bold text-sm">{trieStats.shared}</span></div>
                  <div>• Saved allocation footprint: <span className="text-indigo-800 font-extrabold text-sm">{((trieStats.shared / (trieStats.copied + trieStats.shared)) * 100).toFixed(0)}%</span> of JVM Heap objects.</div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 text-center py-5 rounded-xl text-xs text-slate-700 font-bold bg-slate-50/50">
                  Insert a word to run structural allocation analysis.
                </div>
              )}
            </div>

            {/* Tree SVG */}
            <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-5 flex justify-center items-center overflow-x-auto shadow-inner min-h-[360px]">
              <svg width="500" height="350" className="max-w-full">
                <defs>
                  <marker id="trie-arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(15,23,42,0.15)" />
                  </marker>
                  <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.1" />
                  </filter>
                  <filter id="glow-emerald" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#10b981" floodOpacity="0.5" />
                  </filter>
                  <filter id="glow-sky" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.5" />
                  </filter>
                </defs>

                {/* Draw links */}
                {trieLayoutData.links.map((link, idx) => (
                  <line
                    key={idx}
                    x1={link.fromX}
                    y1={link.fromY}
                    x2={link.toX}
                    y2={link.toY}
                    stroke={link.isCopied ? '#10b981' : link.isShared ? '#38bdf8' : '#cbd5e1'}
                    strokeWidth={link.isCopied ? '3.5' : link.isShared ? '2.5' : '1.5'}
                    markerEnd="url(#trie-arrow)"
                    className="transition-all duration-300"
                  />
                ))}

                {/* Draw nodes */}
                {trieLayoutData.nodes.map((node) => {
                  let fill = '#ffffff';
                  let stroke = '#94a3b8';
                  let filter = 'url(#node-shadow)';

                  if (node.isCopied) {
                    fill = '#ffffff';
                    stroke = '#10b981';
                    filter = 'url(#glow-emerald)';
                  } else if (node.isShared) {
                    fill = '#ffffff';
                    stroke = '#38bdf8';
                    filter = 'url(#glow-sky)';
                  }

                  return (
                    <g key={node.id} className="cursor-pointer group">
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.char === 'ROOT' ? '18' : '14'}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={node.isCopied || node.isShared ? '3' : '1.5'}
                        filter={filter}
                        className="transition-all duration-300 group-hover:scale-110"
                      />
                      <text
                        x={node.x}
                        y={node.y + 4}
                        fill={node.isCopied ? '#059669' : node.isShared ? '#0284c7' : '#1e293b'}
                        fontSize={node.char === 'ROOT' ? '9' : '11'}
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
        </section>

        {/* PERFORMANCE METRICS & SPRING INTEGRATION */}
        <section className="mb-12">
          {/* Tab Navigation */}
          <div className="flex justify-center mb-6">
            <div className="flex bg-slate-200 border border-slate-300 p-1.5 rounded-2xl shadow-sm">
              <button
                id="tab-telemetry-btn"
                className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 ${activeTab === 'telemetry'
                    ? 'bg-white text-indigo-900 border border-slate-200 shadow-sm font-extrabold'
                    : 'text-slate-800 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                onClick={() => setActiveTab('telemetry')}
              >
                Telemetry Dashboard
              </button>
              <button
                id="tab-compaction-btn"
                className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 ${activeTab === 'compaction'
                    ? 'bg-white text-indigo-900 border border-slate-200 shadow-sm font-extrabold'
                    : 'text-slate-800 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                onClick={() => setActiveTab('compaction')}
              >
                JVM Garbage Compaction
              </button>
              <button
                id="tab-integration-btn"
                className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 ${activeTab === 'integration'
                    ? 'bg-white text-indigo-900 border border-slate-200 shadow-sm font-extrabold'
                    : 'text-slate-800 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                onClick={() => setActiveTab('integration')}
              >
                Spring Starter Configuration
              </button>
            </div>
          </div>

          {/* TELEMETRY BOARD */}
          {activeTab === 'telemetry' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
              <h3 className="text-xl font-serif font-bold text-slate-900 mb-6 flex items-center gap-2">
                <SignalIcon className="w-6 h-6 text-indigo-600 stroke-[2.2]" />
                Micrometer Telemetry Board (Last 10 Runs)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Latency Area Chart */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-inner">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-4 text-center">
                    Merge Execution Time (ms)
                  </h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <defs>
                          <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                        <XAxis dataKey="name" stroke="#475569" strokeWidth={1.5} fontSize={11} fontWeight="bold" />
                        <YAxis stroke="#475569" strokeWidth={1.5} fontSize={11} fontWeight="bold" label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#475569', fontWeight: 'bold' }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                        <Area type="monotone" dataKey="latencyMs" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorLatency)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Conflicts Bar Chart */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-inner">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-4 text-center">
                    Conflicts Automatically Resolved
                  </h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                        <XAxis dataKey="name" stroke="#475569" strokeWidth={1.5} fontSize={11} fontWeight="bold" />
                        <YAxis stroke="#475569" strokeWidth={1.5} fontSize={11} fontWeight="bold" allowDecimals={false} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                        <Bar dataKey="conflictsResolved" fill="#0284c7" radius={[5, 5, 0, 0]} />
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
              <h3 className="text-xl font-serif font-bold text-slate-900 mb-2 flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="w-6 h-6 text-indigo-600 stroke-[2.2]" />
                Tombstone Compaction Configuration
              </h3>
              <p className="text-sm text-slate-800 font-semibold mb-6">
                Periodic compaction is scheduled automatically under high-throughput environments to prune expired element records.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Tombstone Compaction Policy</h4>
                  <p className="text-xs text-slate-800 font-semibold leading-relaxed mb-4">
                    When data is removed, CRDTs retain "tombstones" to prevent replicas from resurrecting deleted objects during synchronization cycles. Compaction policy sweeps these tombstones out of JVM heap storage after a specified time threshold (TTL).
                  </p>

                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-805 text-xs font-mono text-slate-250 space-y-2 mb-4 shadow-sm select-none">
                    <div className="text-slate-500 italic"># Spring Properties compaction scheduling</div>
                    <div>ghostnode.compaction.threshold-ms=<span className="text-emerald-400">86400000</span></div>
                    <div>ghostnode.compaction.cron-schedule=<span className="text-emerald-400">"0 0 * * * ?"</span></div>
                  </div>

                  {/* Manual TTL Adjustments */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Tombstone TTL:</span>
                      <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5">{compactionTtl} seconds</span>
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
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold w-full py-2.5 rounded-xl text-xs mt-3.5 shadow-sm hover:shadow transition"
                      onClick={handleCompaction}
                    >
                      Trigger Garbage Collection Compaction
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Heap Saving Performance Impact</h4>
                  <p className="text-xs text-slate-800 font-semibold leading-relaxed mb-4">
                    Path-copying Radix Trie allocations avoid full map object duplications, ensuring zero garbage collector pauses.
                  </p>
                  <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm">
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5 text-slate-800">
                        <span>GhostNode Trie sharing allocation:</span>
                        <span className="text-emerald-700 font-extrabold">12.4 KB</span>
                      </div>
                      <div className="w-full bg-slate-250 rounded-full h-2.5">
                        <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '9%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5 text-slate-800">
                        <span>Naive Copy-on-Write maps:</span>
                        <span className="text-rose-700 font-extrabold">142.8 KB</span>
                      </div>
                      <div className="w-full bg-slate-250 rounded-full h-2.5">
                        <div className="bg-rose-500 h-2.5 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Compaction logs */}
                  <div className="mt-4">
                    <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">compaction trace</h5>
                    <pre className="bg-slate-950 text-slate-100 text-[11px] p-4 rounded-xl font-mono border border-slate-900 min-h-[72px] console-scrollbar">
                      {compactionLogs.length === 0 ? "No manual GC compaction run. Click trigger button to run." : compactionLogs.join("\n")}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SPRING INTEGRATION */}
          {activeTab === 'integration' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
              <div className="mb-6">
                <h3 className="text-xl font-serif font-bold text-slate-900 flex items-center gap-2">
                  <DocumentTextIcon className="w-6 h-6 text-indigo-600 stroke-[2.2]" />
                  Enterprise Integration & Spring Boot Setup
                </h3>
                <p className="text-sm text-slate-805 font-semibold mt-1.5">
                  GhostNode fits into Spring infrastructures via custom starters, registering scheduled tombstones garbage collection, Micrometer telemetry charts, and serialization surrogates.
                </p>
              </div>

              {/* IDE Code Editor Frame */}
              <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-lg mb-8">
                {/* Tabs bar */}
                <div className="bg-[#0f172a] px-4 pt-2 border-b border-slate-800 flex items-end justify-between">
                  <div className="flex gap-1">
                    {/* Window Controls */}
                    <div className="flex gap-1.5 items-center mr-6 mb-3">
                      <span className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-900/30"></span>
                      <span className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-900/30"></span>
                      <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-900/30"></span>
                    </div>

                    {/* Tab 1: Kotlin file */}
                    <button
                      onClick={() => setIntegrationSubTab('kotlin')}
                      className={`px-4 py-2 text-xs font-mono font-semibold rounded-t-lg transition flex items-center gap-2 border-t border-x ${integrationSubTab === 'kotlin'
                          ? 'bg-slate-950 text-sky-400 border-slate-800'
                          : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-900/40 hover:text-slate-300'
                        }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                      POSConfiguration.kt
                    </button>

                    {/* Tab 2: YAML file */}
                    <button
                      onClick={() => setIntegrationSubTab('yaml')}
                      className={`px-4 py-2 text-xs font-mono font-semibold rounded-t-lg transition flex items-center gap-2 border-t border-x ${integrationSubTab === 'yaml'
                          ? 'bg-slate-950 text-sky-400 border-slate-800'
                          : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-900/40 hover:text-slate-300'
                        }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      application.yml
                    </button>

                    {/* Tab 3: Surrogate file */}
                    <button
                      onClick={() => setIntegrationSubTab('surrogate')}
                      className={`px-4 py-2 text-xs font-mono font-semibold rounded-t-lg transition flex items-center gap-2 border-t border-x ${integrationSubTab === 'surrogate'
                          ? 'bg-slate-950 text-sky-400 border-slate-800'
                          : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-900/40 hover:text-slate-300'
                        }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                      SerializationSurrogate.kt
                    </button>
                  </div>

                  {/* Right side COPY button */}
                  <button
                    onClick={handleCopyCode}
                    className="mb-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5 shadow-md active:scale-95"
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

                {/* Editor Content Area */}
                <div className="p-5 overflow-x-auto max-h-[380px] console-scrollbar bg-slate-950">
                  {integrationSubTab === 'kotlin' && renderKotlinHighlight(CODE_SNIPPETS.kotlin)}
                  {integrationSubTab === 'yaml' && renderYamlHighlight(CODE_SNIPPETS.yaml)}
                  {integrationSubTab === 'surrogate' && renderKotlinHighlight(CODE_SNIPPETS.surrogate)}
                </div>
              </div>

              {/* Three Pillars Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-sm hover:shadow-md transition">
                  <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center mb-4 shadow-sm">
                    <CircleStackIcon className="w-5 h-5 text-sky-700 stroke-[2.2]" />
                  </div>
                  <h4 className="font-serif font-bold text-slate-900 text-base mb-2">Schema-Safe Persistence</h4>
                  <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                    Surrogate wrappers compile complex CRDT vector lists into standard database rows. If newer fields are added in upstream code releases, missing columns on older database records default gracefully without triggering crash exceptions.
                  </p>
                </div>

                <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-sm hover:shadow-md transition">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center mb-4 shadow-sm">
                    <svg className="w-5 h-5 text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h4 className="font-serif font-bold text-slate-900 text-base mb-2">Secure Tunnel Syncing</h4>
                  <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                    Edge terminals secure state manifests using hash signature checks. Vector clock ranges and registers mutations are validated before merge sequences execute, shielding system states from unauthorized transaction injections.
                  </p>
                </div>

                <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 shadow-sm hover:shadow-md transition">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-250 flex items-center justify-center mb-4 shadow-sm">
                    <svg className="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                    </svg>
                  </div>
                  <h4 className="font-serif font-bold text-slate-900 text-base mb-2">Radix Trie GC Protection</h4>
                  <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                    Underlying path copying ensures only altered branch paths duplicate during mutations, sharing the remainder of the trie by reference. Mitigates JVM heap churn and keeps garbage collection pauses at 0.0 ms.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto border-t border-slate-200 pt-8 text-center text-slate-700 text-xs font-bold">
        <p>GhostNode Eventual Consistency Platform © 2026. Made with React, Tailwind CSS, and Recharts.</p>
      </footer>
    </div>
  );
}
