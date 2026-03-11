import { describe, it, expect } from 'vitest';
import {
  NFZ_LAYERS,
  NFZ_CATEGORIES,
  DIPUL_WMS_URL,
  DEFAULT_ENABLED_LAYERS,
  getWmsLayerString,
  getLayersByCategory,
  type NoFlyCategory,
} from './noFlyZones';

describe('noFlyZones config', () => {
  it('has a valid WMS URL', () => {
    expect(DIPUL_WMS_URL).toContain('uas-betrieb.de');
    expect(DIPUL_WMS_URL).toContain('/wms');
  });

  it('defines categories', () => {
    expect(NFZ_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    const ids = NFZ_CATEGORIES.map(c => c.id);
    expect(ids).toContain('aviation');
    expect(ids).toContain('temporary');
    expect(ids).toContain('nature');
    expect(ids).toContain('infrastructure');
    expect(ids).toContain('sensitive');
  });

  it('each category has label and color', () => {
    NFZ_CATEGORIES.forEach(cat => {
      expect(cat.label).toBeTruthy();
      expect(cat.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('defines layers', () => {
    expect(NFZ_LAYERS.length).toBeGreaterThanOrEqual(17);
  });

  it('each layer has required fields', () => {
    NFZ_LAYERS.forEach(layer => {
      expect(layer.id).toBeTruthy();
      expect(layer.wmsLayer).toMatch(/^dipul:/);
      expect(layer.label).toBeTruthy();
      expect(typeof layer.defaultEnabled).toBe('boolean');
      expect(['aviation', 'temporary', 'nature', 'infrastructure', 'sensitive']).toContain(layer.category);
    });
  });

  it('layer IDs are unique', () => {
    const ids = NFZ_LAYERS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('wmsLayer names are unique', () => {
    const names = NFZ_LAYERS.map(l => l.wmsLayer);
    expect(new Set(names).size).toBe(names.length);
  });

  it('default enabled layers include aviation', () => {
    expect(DEFAULT_ENABLED_LAYERS).toContain('flughaefen');
    expect(DEFAULT_ENABLED_LAYERS).toContain('kontrollzonen');
    expect(DEFAULT_ENABLED_LAYERS).toContain('flugplaetze');
    expect(DEFAULT_ENABLED_LAYERS).toContain('flugbeschraenkungsgebiete');
  });

  it('default enabled layers exclude non-aviation', () => {
    expect(DEFAULT_ENABLED_LAYERS).not.toContain('naturschutzgebiete');
    expect(DEFAULT_ENABLED_LAYERS).not.toContain('kraftwerke');
    expect(DEFAULT_ENABLED_LAYERS).not.toContain('militaerische_anlagen');
  });

  it('FFH layer uses hyphen in WMS name (not underscore)', () => {
    const ffh = NFZ_LAYERS.find(l => l.id === 'ffh_gebiete');
    expect(ffh).toBeDefined();
    expect(ffh!.wmsLayer).toBe('dipul:ffh-gebiete');
  });
});

describe('getWmsLayerString', () => {
  it('returns empty string for empty input', () => {
    expect(getWmsLayerString([])).toBe('');
  });

  it('returns single layer', () => {
    expect(getWmsLayerString(['flughaefen'])).toBe('dipul:flughaefen');
  });

  it('returns comma-separated layers', () => {
    const result = getWmsLayerString(['flughaefen', 'kontrollzonen']);
    expect(result).toBe('dipul:flughaefen,dipul:kontrollzonen');
  });

  it('ignores unknown layer IDs', () => {
    const result = getWmsLayerString(['flughaefen', 'nonexistent']);
    expect(result).toBe('dipul:flughaefen');
  });

  it('handles all layers', () => {
    const allIds = NFZ_LAYERS.map(l => l.id);
    const result = getWmsLayerString(allIds);
    const parts = result.split(',');
    expect(parts.length).toBe(NFZ_LAYERS.length);
    parts.forEach(part => expect(part).toMatch(/^dipul:/));
  });
});

describe('getLayersByCategory', () => {
  it('returns aviation layers', () => {
    const layers = getLayersByCategory('aviation');
    expect(layers.length).toBeGreaterThanOrEqual(4);
    layers.forEach(l => expect(l.category).toBe('aviation'));
  });

  it('returns nature layers', () => {
    const layers = getLayersByCategory('nature');
    expect(layers.length).toBeGreaterThanOrEqual(3);
    layers.forEach(l => expect(l.category).toBe('nature'));
  });

  it('returns infrastructure layers', () => {
    const layers = getLayersByCategory('infrastructure');
    expect(layers.length).toBeGreaterThanOrEqual(3);
    layers.forEach(l => expect(l.category).toBe('infrastructure'));
  });

  it('returns sensitive layers', () => {
    const layers = getLayersByCategory('sensitive');
    expect(layers.length).toBeGreaterThanOrEqual(3);
    layers.forEach(l => expect(l.category).toBe('sensitive'));
  });

  it('returns temporary layers', () => {
    const layers = getLayersByCategory('temporary');
    expect(layers.length).toBeGreaterThanOrEqual(1);
    layers.forEach(l => expect(l.category).toBe('temporary'));
  });

  it('all layers belong to a category', () => {
    const categories: NoFlyCategory[] = ['aviation', 'temporary', 'nature', 'infrastructure', 'sensitive'];
    const allFromCategories = categories.flatMap(c => getLayersByCategory(c));
    expect(allFromCategories.length).toBe(NFZ_LAYERS.length);
  });
});
