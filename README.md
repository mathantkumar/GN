# GhostNode Showcase SPA

A dynamic React + TypeScript + Tailwind CSS application showcasing the eventual consistency, causal history logs, and database convergence mechanics of the **GhostNode** engine.

## 🚀 Overview

This application simulates an edge-first point-of-sale (POS) terminal network composed of multiple terminals (Checkout, Drive-Thru, and Kitchen Kiosk) processing transactions independently on local replica engines.

### Key Simulated Features:
1. **Multi-Terminal Causal Log Operations**: Simulate offline mutations (ADD/REMOVE) that increment local vector clocks and create causal dependencies.
2. **Causal Graph & Conflict-free Resolution**: Visualize how deletions target additions causally using an Observed-Remove Set (OR-Set) logic.
3. **Database Convergence Sync**: Push state updates and execute log unions to converge divergent edge nodes back to a mathematically identical cluster state.
4. **JVM Heap Trie Sharing Visualizer**: Live rendering of Radix Trie structural sharing, showing heap allocations saved through path copying.

## 🛠️ Getting Started

### Prerequisites

* Node.js (v18 or higher)
* npm

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## 📂 Project Structure

* `src/useGhostNode.ts`: Contains the simulation state hooks and Observed-Remove (OR-Set) CRDT math.
* `src/App.tsx`: The primary dashboard user interface, containing layout, tabs, telemetry area charts, and the Radix Trie visualizer.

## 📄 License

This showcase is part of the GhostNode project licensed under the Apache License 2.0.
