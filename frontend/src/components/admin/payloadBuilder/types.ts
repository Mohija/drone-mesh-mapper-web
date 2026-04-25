/**
 * Internal tree representation of a payload template, plus serialisation
 * to / from the JSON-with-Mustache-tokens format the backend expects.
 *
 * Round-trip rules:
 *   - JSON object  ↔  ObjectNode
 *   - JSON array   ↔  ArrayNode
 *   - "${{path}}"  ↔  VariableNode (typed value, JSON-coerced server-side)
 *   - "any string" ↔  StringNode (may contain {{path}} fragments anywhere)
 *   - number, true/false, null ↔ matching primitive nodes
 *
 * Each tree node carries a stable `id` so React lists, drag handles and
 * @dnd-kit/sortable have a key that survives edits without remounting.
 */

export type NodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'variable';

export interface BaseNode { id: string; }

export interface ObjectNode extends BaseNode {
  kind: 'object';
  entries: { id: string; key: string; value: PayloadNode }[];
}

export interface ArrayNode extends BaseNode {
  kind: 'array';
  items: { id: string; value: PayloadNode }[];
}

export interface StringNode extends BaseNode {
  kind: 'string';
  value: string;            // may embed {{path}} tokens anywhere
}

export interface NumberNode extends BaseNode {
  kind: 'number';
  value: number;
}

export interface BooleanNode extends BaseNode {
  kind: 'boolean';
  value: boolean;
}

export interface NullNode extends BaseNode {
  kind: 'null';
}

export interface VariableNode extends BaseNode {
  kind: 'variable';
  path: string;             // serialises as ${{path}} for typed coercion
}

export type PayloadNode =
  | ObjectNode | ArrayNode | StringNode | NumberNode
  | BooleanNode | NullNode | VariableNode;

let _idCounter = 0;
export function nextId(prefix = 'n'): string {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}

// ─── JSON template → tree ─────────────────────────────────────────────────

const VARIABLE_RE = /^\$\{\{\s*([^}]+?)\s*\}\}$/;

export function fromJson(value: unknown): PayloadNode {
  if (value === null || value === undefined) return { id: nextId('null'), kind: 'null' };

  if (typeof value === 'boolean') return { id: nextId('bool'), kind: 'boolean', value };
  if (typeof value === 'number') return { id: nextId('num'), kind: 'number', value };

  if (typeof value === 'string') {
    const m = value.match(VARIABLE_RE);
    if (m) return { id: nextId('var'), kind: 'variable', path: m[1].trim() };
    return { id: nextId('str'), kind: 'string', value };
  }

  if (Array.isArray(value)) {
    return {
      id: nextId('arr'),
      kind: 'array',
      items: value.map(v => ({ id: nextId('item'), value: fromJson(v) })),
    };
  }

  if (typeof value === 'object') {
    return {
      id: nextId('obj'),
      kind: 'object',
      entries: Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
        id: nextId('entry'), key: k, value: fromJson(v),
      })),
    };
  }

  // Unknown — treat as string fallback so we never lose data.
  return { id: nextId('str'), kind: 'string', value: String(value) };
}

// ─── tree → JSON template ─────────────────────────────────────────────────

export function toJson(node: PayloadNode): unknown {
  switch (node.kind) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const e of node.entries) out[e.key] = toJson(e.value);
      return out;
    }
    case 'array':
      return node.items.map(i => toJson(i.value));
    case 'string':
      return node.value;
    case 'number':
      return node.value;
    case 'boolean':
      return node.value;
    case 'null':
      return null;
    case 'variable':
      return `\${{${node.path}}}`;
  }
}

// ─── factories ────────────────────────────────────────────────────────────

export function makeNode(kind: NodeKind, opts?: { value?: unknown; path?: string }): PayloadNode {
  switch (kind) {
    case 'object': return { id: nextId('obj'), kind: 'object', entries: [] };
    case 'array': return { id: nextId('arr'), kind: 'array', items: [] };
    case 'string': return { id: nextId('str'), kind: 'string', value: typeof opts?.value === 'string' ? opts.value : '' };
    case 'number': return { id: nextId('num'), kind: 'number', value: typeof opts?.value === 'number' ? opts.value : 0 };
    case 'boolean': return { id: nextId('bool'), kind: 'boolean', value: opts?.value === true };
    case 'null': return { id: nextId('null'), kind: 'null' };
    case 'variable': return { id: nextId('var'), kind: 'variable', path: opts?.path ?? '' };
  }
}

// ─── tree updates (immutable) ─────────────────────────────────────────────

export function replaceNode(root: PayloadNode, targetId: string, replacement: PayloadNode): PayloadNode {
  if (root.id === targetId) return replacement;
  if (root.kind === 'object') {
    return {
      ...root,
      entries: root.entries.map(e => ({
        ...e, value: replaceNode(e.value, targetId, replacement),
      })),
    };
  }
  if (root.kind === 'array') {
    return {
      ...root,
      items: root.items.map(i => ({ ...i, value: replaceNode(i.value, targetId, replacement) })),
    };
  }
  return root;
}

export function updateObjectEntry(root: PayloadNode, entryId: string,
                                   patch: Partial<{ key: string; value: PayloadNode }>): PayloadNode {
  if (root.kind === 'object') {
    return {
      ...root,
      entries: root.entries.map(e => e.id === entryId ? { ...e, ...patch } : {
        ...e, value: updateObjectEntry(e.value, entryId, patch),
      }),
    };
  }
  if (root.kind === 'array') {
    return { ...root, items: root.items.map(i => ({ ...i, value: updateObjectEntry(i.value, entryId, patch) })) };
  }
  return root;
}

export function addObjectEntry(root: PayloadNode, objectId: string, key = 'feld',
                                child: PayloadNode = makeNode('string')): PayloadNode {
  if (root.id === objectId && root.kind === 'object') {
    // ensure unique key
    let k = key, i = 1;
    while (root.entries.some(e => e.key === k)) { i += 1; k = `${key}_${i}`; }
    return { ...root, entries: [...root.entries, { id: nextId('entry'), key: k, value: child }] };
  }
  if (root.kind === 'object') {
    return { ...root, entries: root.entries.map(e => ({ ...e, value: addObjectEntry(e.value, objectId, key, child) })) };
  }
  if (root.kind === 'array') {
    return { ...root, items: root.items.map(i => ({ ...i, value: addObjectEntry(i.value, objectId, key, child) })) };
  }
  return root;
}

export function addArrayItem(root: PayloadNode, arrayId: string,
                              child: PayloadNode = makeNode('string')): PayloadNode {
  if (root.id === arrayId && root.kind === 'array') {
    return { ...root, items: [...root.items, { id: nextId('item'), value: child }] };
  }
  if (root.kind === 'object') {
    return { ...root, entries: root.entries.map(e => ({ ...e, value: addArrayItem(e.value, arrayId, child) })) };
  }
  if (root.kind === 'array') {
    return { ...root, items: root.items.map(i => ({ ...i, value: addArrayItem(i.value, arrayId, child) })) };
  }
  return root;
}

export function removeObjectEntry(root: PayloadNode, entryId: string): PayloadNode {
  if (root.kind === 'object') {
    return {
      ...root,
      entries: root.entries
        .filter(e => e.id !== entryId)
        .map(e => ({ ...e, value: removeObjectEntry(e.value, entryId) })),
    };
  }
  if (root.kind === 'array') {
    return { ...root, items: root.items.map(i => ({ ...i, value: removeObjectEntry(i.value, entryId) })) };
  }
  return root;
}

export function removeArrayItem(root: PayloadNode, itemId: string): PayloadNode {
  if (root.kind === 'array') {
    return {
      ...root,
      items: root.items
        .filter(i => i.id !== itemId)
        .map(i => ({ ...i, value: removeArrayItem(i.value, itemId) })),
    };
  }
  if (root.kind === 'object') {
    return { ...root, entries: root.entries.map(e => ({ ...e, value: removeArrayItem(e.value, itemId) })) };
  }
  return root;
}

export function reorderObjectEntries(root: PayloadNode, objectId: string, fromIndex: number, toIndex: number): PayloadNode {
  if (root.id === objectId && root.kind === 'object') {
    const next = [...root.entries];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { ...root, entries: next };
  }
  if (root.kind === 'object') {
    return { ...root, entries: root.entries.map(e => ({ ...e, value: reorderObjectEntries(e.value, objectId, fromIndex, toIndex) })) };
  }
  if (root.kind === 'array') {
    return { ...root, items: root.items.map(i => ({ ...i, value: reorderObjectEntries(i.value, objectId, fromIndex, toIndex) })) };
  }
  return root;
}

export function reorderArrayItems(root: PayloadNode, arrayId: string, fromIndex: number, toIndex: number): PayloadNode {
  if (root.id === arrayId && root.kind === 'array') {
    const next = [...root.items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { ...root, items: next };
  }
  if (root.kind === 'object') {
    return { ...root, entries: root.entries.map(e => ({ ...e, value: reorderArrayItems(e.value, arrayId, fromIndex, toIndex) })) };
  }
  if (root.kind === 'array') {
    return { ...root, items: root.items.map(i => ({ ...i, value: reorderArrayItems(i.value, arrayId, fromIndex, toIndex) })) };
  }
  return root;
}
