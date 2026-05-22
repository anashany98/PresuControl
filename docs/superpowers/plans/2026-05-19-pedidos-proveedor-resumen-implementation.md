# Pedidos Proveedor Resumen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable pedidos-proveedor summary and apply it across dashboard, kanban, tables, detail and secondary presupuesto views.

**Architecture:** Keep the first implementation on the frontend. A pure utility derives summary state from `Presupuesto.pedidos` with a legacy-field fallback, reusable components render the compact summary and kanban side panel, and pages consume those components instead of duplicating pedido display logic.

**Tech Stack:** React 19, TypeScript, Vite, existing REST API helpers in `frontend/src/utils/api.ts`, existing global CSS.

---

## File Structure

- Create `frontend/src/utils/pedidoSummary.ts`: pure summary calculations, exception scoring, labels and legacy fallback.
- Create `frontend/src/components/PedidoSummary.tsx`: compact reusable summary UI.
- Create `frontend/src/components/PedidoSummaryPanel.tsx`: kanban side panel with inline edit of existing pedidos.
- Modify `frontend/src/pages/Dashboard.tsx`: add pedido exception block and navigation to focused kanban.
- Modify `frontend/src/pages/Kanban.tsx`: replace dense per-pedido list with compact summary and side panel, support `?focus=<id>`.
- Modify `frontend/src/pages/Presupuestos.tsx`, `DetallePresupuesto.tsx`, `Riesgo.tsx`, `Reportes.tsx`, `Buscar.tsx`, `MiMesa.tsx`, `Hoy.tsx`, `DineroRiesgo.tsx`, `Calendario.tsx`: reuse compact summary where budgets appear.
- Modify `frontend/src/styles.css`: add stable styling for summaries, alerts, focused kanban card and side panel.

### Task 1: Summary Utility

**Files:**
- Create: `frontend/src/utils/pedidoSummary.ts`

- [ ] **Step 1: Implement pure summary functions**

Create `getPedidoSummary(presupuesto)`, `getPedidoExceptionScore(summary)` and `getPedidoStatusLabel(summary)`. The utility must treat missing importes as incomplete, count pending/partial/completed pedidos, detect non-completed pedidos with missing or past `fecha_entrega_prevista`, and synthesize a single legacy pedido when `pedidos` is empty but legacy proveedor fields exist.

- [ ] **Step 2: Run type check**

Run: `cd frontend; npm run build`
Expected: either pass or only fail later because components are not created yet.

### Task 2: Reusable Components

**Files:**
- Create: `frontend/src/components/PedidoSummary.tsx`
- Create: `frontend/src/components/PedidoSummaryPanel.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Implement `PedidoSummaryBadge`**

Render total pedidos, chips for pending/partial/completed counts, amount comparison `Pedidos X / Presu Y`, and warning chips for vencido/sin fecha/importe incompleto. Support `compact`, `table`, `kanban`, `detail`, and `mini` variants.

- [ ] **Step 2: Implement `PedidoSummaryPanel`**

Render a right-side kanban panel with all pedidos, summary header, row warnings, inline edit mode for existing pedidos, `api.updatePedido`, and `onUpdated` callback after save.

- [ ] **Step 3: Add CSS**

Add classes for `.pedido-summary`, `.pedido-chip`, `.pedido-alerts`, `.pedido-side-panel`, `.kanban-card.focused`, and responsive behavior.

- [ ] **Step 4: Run type check**

Run: `cd frontend; npm run build`
Expected: pass for new isolated components.

### Task 3: Dashboard and Kanban

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Kanban.tsx`

- [ ] **Step 1: Dashboard exceptions**

Fetch `/presupuestos?limit=2000&ocultar_cerrados=false`, compute pedido summaries, filter exceptions, sort by `getPedidoExceptionScore`, and add a compact exception section that links to `/kanban?focus=<id>`.

- [ ] **Step 2: Kanban compact card and panel**

Remove the always-visible pedido list. Add `PedidoSummaryBadge` to cards, open `PedidoSummaryPanel` on click, support focused-card highlighting from query string, and keep drag/drop status behavior.

- [ ] **Step 3: Run type check**

Run: `cd frontend; npm run build`
Expected: pass.

### Task 4: Other Presupuesto Views

**Files:**
- Modify: `frontend/src/pages/Presupuestos.tsx`
- Modify: `frontend/src/pages/DetallePresupuesto.tsx`
- Modify: `frontend/src/pages/Riesgo.tsx`
- Modify: `frontend/src/pages/Reportes.tsx`
- Modify: `frontend/src/pages/Buscar.tsx`
- Modify: `frontend/src/pages/MiMesa.tsx`
- Modify: `frontend/src/pages/Hoy.tsx`
- Modify: `frontend/src/pages/DineroRiesgo.tsx`
- Modify: `frontend/src/pages/Calendario.tsx`

- [ ] **Step 1: Replace legacy pedido displays**

Use `PedidoSummaryBadge` in tables and cards so every presupuesto view shows the same compact pedido state.

- [ ] **Step 2: Detail header**

Add a `detail` variant summary at the top of the detalle pedidos tab, using live `pedidos.data` when available.

- [ ] **Step 3: Run full frontend build**

Run: `cd frontend; npm run build`
Expected: pass.

### Task 5: Manual Verification

**Files:**
- No code files.

- [ ] **Step 1: Start dev server**

Run: `cd frontend; npm run dev -- --host 127.0.0.1`
Expected: Vite serves local URL.

- [ ] **Step 2: Browser smoke test**

Open dashboard, kanban, presupuestos table, detalle, reportes/search/riesgo screens. Verify summaries render, kanban panel opens and edit save does not crash, and focused kanban URL highlights the right card.

- [ ] **Step 3: Final build**

Run: `cd frontend; npm run build`
Expected: pass.

