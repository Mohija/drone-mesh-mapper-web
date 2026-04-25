import { describe, it, expect } from 'vitest';
import {
  fromJson, toJson, makeNode,
  addObjectEntry, addArrayItem,
  removeObjectEntry, removeArrayItem,
  reorderObjectEntries, reorderArrayItems,
  updateObjectEntry,
} from './types';

describe('payloadBuilder/types — fromJson/toJson round-trip', () => {
  it('handles primitives', () => {
    expect(toJson(fromJson('hello'))).toBe('hello');
    expect(toJson(fromJson(42))).toBe(42);
    expect(toJson(fromJson(true))).toBe(true);
    expect(toJson(fromJson(false))).toBe(false);
    expect(toJson(fromJson(null))).toBe(null);
  });

  it('detects typed-variable strings', () => {
    const tree = fromJson('${{drone.altitude}}');
    expect(tree.kind).toBe('variable');
    if (tree.kind === 'variable') expect(tree.path).toBe('drone.altitude');
    expect(toJson(tree)).toBe('${{drone.altitude}}');
  });

  it('keeps mustache fragments inside strings as-is', () => {
    const tree = fromJson('Drohne {{drone.id}} hat verstoßen');
    expect(tree.kind).toBe('string');
    expect(toJson(tree)).toBe('Drohne {{drone.id}} hat verstoßen');
  });

  it('round-trips a realistic alarm payload', () => {
    const json = {
      keyword: '{{trigger}}',
      altitude: '${{drone.altitude}}',
      units: [{ address: '{{drone.id}}' }],
      meta: { active: '${{violation.is_active}}', count: 0, missing: null },
    };
    const tree = fromJson(json);
    expect(toJson(tree)).toEqual(json);
  });
});

describe('payloadBuilder/types — tree updates', () => {
  it('adds a property to an object', () => {
    const root = makeNode('object');
    const next = addObjectEntry(root, root.id, 'foo', makeNode('string', { value: 'bar' }));
    expect(toJson(next)).toEqual({ foo: 'bar' });
  });

  it('makes object entry keys unique on collision', () => {
    let root = makeNode('object');
    root = addObjectEntry(root, root.id, 'foo');
    root = addObjectEntry(root, root.id, 'foo');
    if (root.kind === 'object') {
      const keys = root.entries.map(e => e.key);
      expect(new Set(keys).size).toBe(2);
    }
  });

  it('adds an item to an array', () => {
    const root = makeNode('array');
    const next = addArrayItem(root, root.id, makeNode('number', { value: 7 }));
    expect(toJson(next)).toEqual([7]);
  });

  it('removes an object entry by id', () => {
    let root = makeNode('object');
    root = addObjectEntry(root, root.id, 'a');
    root = addObjectEntry(root, root.id, 'b');
    if (root.kind !== 'object') throw new Error('expected object');
    const removed = removeObjectEntry(root, root.entries[0].id);
    expect(toJson(removed)).toEqual({ b: '' });
  });

  it('removes an array item by id', () => {
    let root = makeNode('array');
    root = addArrayItem(root, root.id, makeNode('number', { value: 1 }));
    root = addArrayItem(root, root.id, makeNode('number', { value: 2 }));
    if (root.kind !== 'array') throw new Error('expected array');
    const removed = removeArrayItem(root, root.items[0].id);
    expect(toJson(removed)).toEqual([2]);
  });

  it('reorders object entries', () => {
    let root = makeNode('object');
    root = addObjectEntry(root, root.id, 'a', makeNode('number', { value: 1 }));
    root = addObjectEntry(root, root.id, 'b', makeNode('number', { value: 2 }));
    root = addObjectEntry(root, root.id, 'c', makeNode('number', { value: 3 }));
    const reordered = reorderObjectEntries(root, root.id, 0, 2);
    const out = toJson(reordered) as Record<string, number>;
    expect(Object.keys(out)).toEqual(['b', 'c', 'a']);
  });

  it('reorders array items', () => {
    let root = makeNode('array');
    root = addArrayItem(root, root.id, makeNode('number', { value: 1 }));
    root = addArrayItem(root, root.id, makeNode('number', { value: 2 }));
    root = addArrayItem(root, root.id, makeNode('number', { value: 3 }));
    const reordered = reorderArrayItems(root, root.id, 2, 0);
    expect(toJson(reordered)).toEqual([3, 1, 2]);
  });

  it('updates an object entry key without losing children', () => {
    let root = makeNode('object');
    root = addObjectEntry(root, root.id, 'oldKey', makeNode('string', { value: 'val' }));
    if (root.kind !== 'object') throw new Error();
    const updated = updateObjectEntry(root, root.entries[0].id, { key: 'newKey' });
    expect(toJson(updated)).toEqual({ newKey: 'val' });
  });
});
