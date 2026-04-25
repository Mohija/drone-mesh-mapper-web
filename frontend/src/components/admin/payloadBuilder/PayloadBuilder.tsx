import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import {
  PayloadNode, ObjectNode, ArrayNode, NodeKind,
  fromJson, toJson, makeNode,
  replaceNode, addObjectEntry, addArrayItem,
  removeObjectEntry, removeArrayItem,
  reorderObjectEntries, reorderArrayItems,
  updateObjectEntry,
} from './types';
import type { VariablePoolEntry } from '../../../api';

interface Props {
  value: unknown;                                  // the JSON template the editor binds to
  onChange: (next: unknown) => void;               // called with new JSON template
  variables: VariablePoolEntry[];                  // pool from /api/admin/interfaces/variables
  exampleContext: Record<string, unknown> | null;  // for the live preview
}

interface DragData {
  type: 'variable';
  path: string;
}

interface DropData {
  type: 'object' | 'array' | 'string' | 'leaf';
  nodeId: string;
}

const CATEGORIES: VariablePoolEntry['category'][] = ['drone', 'zone', 'violation', 'tenant', 'system'];

const CATEGORY_LABEL: Record<VariablePoolEntry['category'], string> = {
  drone: 'Drohne', zone: 'Zone', violation: 'Verstoß', tenant: 'Mandant', system: 'System',
};

const CATEGORY_COLOR: Record<VariablePoolEntry['category'], string> = {
  drone: '#22d3ee', zone: '#f59e0b', violation: '#ef4444',
  tenant: '#a78bfa', system: '#94a3b8',
};

export default function PayloadBuilder({ value, onChange, variables, exampleContext }: Props) {
  const [tree, setTree] = useState<PayloadNode>(() => fromJson(value));
  const [search, setSearch] = useState('');
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Mirror tree → onChange when user mutates inside the builder.
  function commit(next: PayloadNode) {
    setTree(next);
    onChange(toJson(next));
  }

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as DragData | undefined;
    if (data?.type === 'variable') setActiveDrag(data);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const drag = e.active.data.current as DragData | undefined;
    const drop = e.over?.data.current as DropData | undefined;
    if (!drag || !drop) return;
    if (drag.type !== 'variable') return;

    const path = drag.path;
    const lastSegment = path.split('.').pop() || 'feld';

    if (drop.type === 'object') {
      commit(addObjectEntry(tree, drop.nodeId, lastSegment, makeNode('variable', { path })));
    } else if (drop.type === 'array') {
      commit(addArrayItem(tree, drop.nodeId, makeNode('variable', { path })));
    } else if (drop.type === 'string') {
      const current = findNode(tree, drop.nodeId);
      if (current?.kind === 'string') {
        const next: PayloadNode = {
          ...current,
          value: current.value ? `${current.value} {{${path}}}` : `{{${path}}}`,
        };
        commit(replaceNode(tree, drop.nodeId, next));
      }
    } else if (drop.type === 'leaf') {
      commit(replaceNode(tree, drop.nodeId, makeNode('variable', { path })));
    }
  }

  const filteredVars = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter(v => v.path.toLowerCase().includes(q));
  }, [variables, search]);

  const renderedPreview = useMemo(() => {
    if (!exampleContext) return '(Vorschaukontext nicht geladen)';
    try {
      return JSON.stringify(renderClient(toJson(tree), exampleContext), null, 2);
    } catch (e) {
      return '/* Fehler: ' + (e as Error).message + ' */';
    }
  }, [tree, exampleContext]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{
        display: 'grid', gap: 12, gridTemplateColumns: '220px 1fr 280px',
        minHeight: 360,
      }}>
        {/* Variable palette */}
        <aside style={paletteBox}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Variablen suchen…"
            style={{ ...inp, marginBottom: 8 }}
          />
          {CATEGORIES.map(cat => {
            const items = filteredVars.filter(v => v.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <p style={{
                  margin: '0 0 4px', fontSize: 10, fontWeight: 700,
                  color: CATEGORY_COLOR[cat], textTransform: 'uppercase', letterSpacing: 0.5,
                }}>{CATEGORY_LABEL[cat]}</p>
                {items.map(v => <VariableChip key={v.path} entry={v} />)}
              </div>
            );
          })}
          <p style={{ margin: '12px 0 0', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Variable mit Drag &amp; Drop in den Tree ziehen — ergibt eine typisierte
            <code style={{ margin: '0 2px' }}>{`\${{...}}`}</code> Variable. Auf einen
            String-Wert ablegen hängt das Token <code>{`{{...}}`}</code> an den Text an.
          </p>
        </aside>

        {/* Tree editor */}
        <div style={treeBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Payload-Struktur</p>
            <span style={{ flex: 1 }} />
            <button onClick={() => commit(makeNode('object'))} style={miniBtn}>Objekt</button>
            <button onClick={() => commit(makeNode('array'))} style={miniBtn}>Array</button>
          </div>
          <NodeView
            node={tree}
            onReplace={(n) => commit(replaceNode(tree, tree.id, n))}
            onMutate={(fn) => commit(fn(tree))}
            level={0}
          />
        </div>

        {/* Preview */}
        <aside style={previewBox}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Live-Vorschau
          </p>
          <pre style={{
            margin: 0, fontSize: 11, lineHeight: 1.4,
            color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 360, overflow: 'auto',
          }}>{renderedPreview}</pre>
        </aside>
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div style={{
            ...chipStyle, cursor: 'grabbing',
            background: 'var(--accent)', color: 'var(--bg-primary)',
          }}>{activeDrag.path}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Variable chip — drag-source

function VariableChip({ entry }: { entry: VariablePoolEntry }) {
  const id = `var-${entry.path}`;
  const data: DragData = { type: 'variable', path: entry.path };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={`Beispielwert: ${JSON.stringify(entry.example)}`}
      style={{
        ...chipStyle,
        opacity: isDragging ? 0.4 : 1,
        background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
        borderColor: CATEGORY_COLOR[entry.category],
      }}
    >
      {entry.path}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Recursive node view

interface NodeViewProps {
  node: PayloadNode;
  onReplace: (next: PayloadNode) => void;
  onMutate: (fn: (root: PayloadNode) => PayloadNode) => void;
  level: number;
}

function NodeView({ node, onReplace, onMutate, level }: NodeViewProps) {
  if (node.kind === 'object') return <ObjectView node={node} onReplace={onReplace} onMutate={onMutate} level={level} />;
  if (node.kind === 'array') return <ArrayView node={node} onReplace={onReplace} onMutate={onMutate} level={level} />;
  return <LeafView node={node} onReplace={onReplace} />;
}

function ObjectView({ node, onReplace, onMutate, level }: { node: ObjectNode; onReplace: (n: PayloadNode) => void; onMutate: (fn: (r: PayloadNode) => PayloadNode) => void; level: number }) {
  const dropData: DropData = { type: 'object', nodeId: node.id };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-obj-${node.id}`, data: dropData });
  return (
    <div ref={setNodeRef} style={containerStyle(level, isOver, '#22d3ee')}>
      <div style={headerRow}>
        <span style={kindLabel('#22d3ee')}>{ '{ }'} Objekt</span>
        <span style={{ flex: 1 }} />
        <KindSwap node={node} onReplace={onReplace} />
      </div>
      {node.entries.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0' }}>
          (leer — Variable hier ablegen oder „+" klicken)
        </p>
      )}
      {node.entries.map((entry, idx) => (
        <div key={entry.id} style={entryRow}>
          <button onClick={() => idx > 0 && onMutate(r => reorderObjectEntries(r, node.id, idx, idx - 1))}
                  style={smallIcon} disabled={idx === 0} title="Nach oben">↑</button>
          <button onClick={() => idx < node.entries.length - 1 && onMutate(r => reorderObjectEntries(r, node.id, idx, idx + 1))}
                  style={smallIcon} disabled={idx === node.entries.length - 1} title="Nach unten">↓</button>
          <input
            value={entry.key}
            onChange={e => onMutate(r => updateObjectEntry(r, entry.id, { key: e.target.value }))}
            style={{ ...inp, padding: '4px 6px', fontSize: 12, width: 140, fontFamily: 'monospace' }}
          />
          <span style={{ color: 'var(--text-muted)' }}>:</span>
          <div style={{ flex: 1 }}>
            <NodeView
              node={entry.value}
              onReplace={(n) => onMutate(r => updateObjectEntry(r, entry.id, { value: n }))}
              onMutate={onMutate}
              level={level + 1}
            />
          </div>
          <button onClick={() => onMutate(r => removeObjectEntry(r, entry.id))} style={smallIconDanger} title="Eintrag entfernen">✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>+ neuer Eintrag:</span>
        {KIND_BUTTONS.map(([kind, label]) => (
          <button key={kind} onClick={() => onMutate(r => addObjectEntry(r, node.id, 'feld', makeNode(kind)))}
                  style={miniBtn}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function ArrayView({ node, onReplace, onMutate, level }: { node: ArrayNode; onReplace: (n: PayloadNode) => void; onMutate: (fn: (r: PayloadNode) => PayloadNode) => void; level: number }) {
  const dropData: DropData = { type: 'array', nodeId: node.id };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-arr-${node.id}`, data: dropData });
  return (
    <div ref={setNodeRef} style={containerStyle(level, isOver, '#f59e0b')}>
      <div style={headerRow}>
        <span style={kindLabel('#f59e0b')}>[ ] Array</span>
        <span style={{ flex: 1 }} />
        <KindSwap node={node} onReplace={onReplace} />
      </div>
      {node.items.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0' }}>
          (leer — Variable hier ablegen oder „+" klicken)
        </p>
      )}
      {node.items.map((item, idx) => (
        <div key={item.id} style={entryRow}>
          <button onClick={() => idx > 0 && onMutate(r => reorderArrayItems(r, node.id, idx, idx - 1))}
                  style={smallIcon} disabled={idx === 0} title="Nach oben">↑</button>
          <button onClick={() => idx < node.items.length - 1 && onMutate(r => reorderArrayItems(r, node.id, idx, idx + 1))}
                  style={smallIcon} disabled={idx === node.items.length - 1} title="Nach unten">↓</button>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11, minWidth: 24 }}>[{idx}]</span>
          <div style={{ flex: 1 }}>
            <NodeView
              node={item.value}
              onReplace={(n) => onMutate(r => replaceNode(r, item.value.id, n))}
              onMutate={onMutate}
              level={level + 1}
            />
          </div>
          <button onClick={() => onMutate(r => removeArrayItem(r, item.id))} style={smallIconDanger} title="Element entfernen">✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>+ neues Element:</span>
        {KIND_BUTTONS.map(([kind, label]) => (
          <button key={kind} onClick={() => onMutate(r => addArrayItem(r, node.id, makeNode(kind)))}
                  style={miniBtn}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function LeafView({ node, onReplace }: { node: PayloadNode; onReplace: (n: PayloadNode) => void }) {
  // Leaf is a drop-target so users can replace the value with a typed variable
  // by dragging from the palette. String leaves additionally accept token append.
  const isString = node.kind === 'string';
  const dropData: DropData = { type: isString ? 'string' : 'leaf', nodeId: node.id };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-leaf-${node.id}`, data: dropData });

  const color = node.kind === 'variable' ? 'var(--accent)'
              : node.kind === 'string' ? '#94a3b8'
              : node.kind === 'number' ? '#22d3ee'
              : node.kind === 'boolean' ? '#a78bfa'
              : '#64748b';

  return (
    <div ref={setNodeRef} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '2px 4px', borderRadius: 4,
      background: isOver ? 'rgba(0,212,170,0.15)' : 'transparent',
      border: isOver ? '1px dashed var(--accent)' : '1px dashed transparent',
    }}>
      <span style={{ ...kindLabel(color), fontSize: 9 }}>{node.kind}</span>
      {node.kind === 'string' && (
        <input value={node.value}
               onChange={e => onReplace({ ...node, value: e.target.value })}
               style={{ ...inp, padding: '4px 6px', fontSize: 12, fontFamily: 'monospace' }} />
      )}
      {node.kind === 'number' && (
        <input type="number" value={node.value}
               onChange={e => onReplace({ ...node, value: Number(e.target.value) })}
               style={{ ...inp, padding: '4px 6px', fontSize: 12, width: 120 }} />
      )}
      {node.kind === 'boolean' && (
        <select value={node.value ? 'true' : 'false'}
                onChange={e => onReplace({ ...node, value: e.target.value === 'true' })}
                style={{ ...inp, padding: '4px 6px', fontSize: 12, width: 100 }}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )}
      {node.kind === 'null' && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>
      )}
      {node.kind === 'variable' && (
        <input value={node.path}
               onChange={e => onReplace({ ...node, path: e.target.value })}
               style={{ ...inp, padding: '4px 6px', fontSize: 12, fontFamily: 'monospace',
                        color: 'var(--accent)' }}
               placeholder="drone.id" />
      )}
      <KindSwap node={node} onReplace={onReplace} />
    </div>
  );
}

// Lets the user convert a node to a different kind without losing the slot.
function KindSwap({ node, onReplace }: { node: PayloadNode; onReplace: (n: PayloadNode) => void }) {
  return (
    <select
      value={node.kind}
      onChange={e => {
        const k = e.target.value as NodeKind;
        if (k === node.kind) return;
        // preserve string content when swapping string ↔ variable
        if (k === 'variable' && node.kind === 'string') {
          onReplace(makeNode('variable', { path: node.value.replace(/^\{\{|\}\}$/g, '') }));
          return;
        }
        if (k === 'string' && node.kind === 'variable') {
          onReplace(makeNode('string', { value: `{{${node.path}}}` }));
          return;
        }
        onReplace(makeNode(k));
      }}
      style={{
        padding: '2px 4px', fontSize: 10, background: 'var(--bg-primary)',
        border: '1px solid var(--border)', color: 'var(--text-muted)',
        borderRadius: 3, cursor: 'pointer',
      }}
      title="Knotentyp ändern"
    >
      {(['object', 'array', 'string', 'number', 'boolean', 'null', 'variable'] as NodeKind[]).map(k =>
        <option key={k} value={k}>{k}</option>
      )}
    </select>
  );
}

const KIND_BUTTONS: [NodeKind, string][] = [
  ['object', '{ }'], ['array', '[ ]'], ['string', 'abc'],
  ['number', '0'], ['boolean', '✓'], ['null', '∅'], ['variable', '{{x}}'],
];

// ───────────────────────────────────────────────────────────────────────────
// Helpers

function findNode(root: PayloadNode, id: string): PayloadNode | null {
  if (root.id === id) return root;
  if (root.kind === 'object') {
    for (const e of root.entries) {
      const r = findNode(e.value, id);
      if (r) return r;
    }
  }
  if (root.kind === 'array') {
    for (const i of root.items) {
      const r = findNode(i.value, id);
      if (r) return r;
    }
  }
  return null;
}

// Lightweight client-side renderer for the live preview only. Mirrors
// services/alarm_dispatcher.render_payload (chevron) close enough for
// a representative preview — the server is authoritative at dispatch time.
function renderClient(template: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof template === 'string') {
    if (template.startsWith('${{') && template.endsWith('}}')) {
      const path = template.slice(3, -2).trim();
      const v = lookup(ctx, path);
      return v === undefined ? template : v;
    }
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, p1) => {
      const v = lookup(ctx, p1.trim());
      return v === undefined || v === null ? '' : String(v);
    });
  }
  if (Array.isArray(template)) return template.map(t => renderClient(t, ctx));
  if (template && typeof template === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) out[k] = renderClient(v, ctx);
    return out;
  }
  return template;
}

function lookup(ctx: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
    return undefined;
  }, ctx);
}

// ───────────────────────────────────────────────────────────────────────────
// Styles

const paletteBox: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 10, overflow: 'auto', maxHeight: 480,
};
const treeBox: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 10, overflow: 'auto', maxHeight: 480,
};
const previewBox: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 10,
};
const inp: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const chipStyle: React.CSSProperties = {
  display: 'inline-block', padding: '4px 8px', marginBottom: 4, marginRight: 4,
  borderRadius: 4, fontSize: 11, fontFamily: 'monospace',
  border: '1px solid', cursor: 'grab', userSelect: 'none',
  width: '100%', textAlign: 'left', boxSizing: 'border-box',
};
const headerRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
};
const entryRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0',
};
const miniBtn: React.CSSProperties = {
  padding: '4px 8px', fontSize: 11, background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)', color: 'var(--text-primary)',
  borderRadius: 4, cursor: 'pointer',
};
const smallIcon: React.CSSProperties = {
  width: 22, height: 22, padding: 0, fontSize: 12,
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  color: 'var(--text-muted)', borderRadius: 3, cursor: 'pointer',
};
const smallIconDanger: React.CSSProperties = {
  ...smallIcon, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)',
};

function kindLabel(color: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase',
    letterSpacing: 0.5, fontFamily: 'monospace',
  };
}

function containerStyle(level: number, isOver: boolean, accent: string): React.CSSProperties {
  return {
    padding: 8, marginLeft: level === 0 ? 0 : 6,
    border: isOver ? `1px dashed var(--accent)` : `1px solid var(--border)`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: 4,
    background: isOver ? 'rgba(0,212,170,0.08)' : 'var(--bg-secondary)',
    marginBottom: 4,
  };
}
