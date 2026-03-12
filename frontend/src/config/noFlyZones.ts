/**
 * DIPUL (Digitale Plattform Unbemannte Luftfahrt) WMS Layer Configuration.
 * Data provided by DFS Deutsche Flugsicherung GmbH.
 * WMS endpoint: https://uas-betrieb.de/geoservices/dipul/wms
 */

export type NoFlyCategory = 'aviation' | 'temporary' | 'nature' | 'infrastructure' | 'sensitive';

export interface NoFlyZoneLayer {
  id: string;
  wmsLayer: string;
  label: string;
  category: NoFlyCategory;
  defaultEnabled: boolean;
}

export interface NoFlyZoneCategory {
  id: NoFlyCategory;
  label: string;
  color: string;
}

export const DIPUL_WMS_URL = 'https://uas-betrieb.de/geoservices/dipul/wms';

export const NFZ_CATEGORIES: NoFlyZoneCategory[] = [
  { id: 'aviation', label: 'Luftfahrt', color: '#ef4444' },
  { id: 'temporary', label: 'Temporär', color: '#f97316' },
  { id: 'nature', label: 'Naturschutz', color: '#22c55e' },
  { id: 'infrastructure', label: 'Infrastruktur', color: '#eab308' },
  { id: 'sensitive', label: 'Sensible Bereiche', color: '#8b5cf6' },
];

export const NFZ_LAYERS: NoFlyZoneLayer[] = [
  // Aviation
  { id: 'flughaefen', wmsLayer: 'dipul:flughaefen', label: 'Flughäfen', category: 'aviation', defaultEnabled: true },
  { id: 'flugplaetze', wmsLayer: 'dipul:flugplaetze', label: 'Flugplätze', category: 'aviation', defaultEnabled: true },
  { id: 'kontrollzonen', wmsLayer: 'dipul:kontrollzonen', label: 'Kontrollzonen', category: 'aviation', defaultEnabled: true },
  { id: 'flugbeschraenkungsgebiete', wmsLayer: 'dipul:flugbeschraenkungsgebiete', label: 'Flugbeschränkungsgebiete', category: 'aviation', defaultEnabled: true },
  { id: 'modellflugplaetze', wmsLayer: 'dipul:modellflugplaetze', label: 'Modellflugplätze', category: 'aviation', defaultEnabled: false },

  // Temporary
  { id: 'temporaere_betriebseinschraenkungen', wmsLayer: 'dipul:temporaere_betriebseinschraenkungen', label: 'Temporäre Einschränkungen', category: 'temporary', defaultEnabled: false },

  // Nature
  { id: 'naturschutzgebiete', wmsLayer: 'dipul:naturschutzgebiete', label: 'Naturschutzgebiete', category: 'nature', defaultEnabled: false },
  { id: 'nationalparks', wmsLayer: 'dipul:nationalparks', label: 'Nationalparks', category: 'nature', defaultEnabled: false },
  { id: 'vogelschutzgebiete', wmsLayer: 'dipul:vogelschutzgebiete', label: 'Vogelschutzgebiete', category: 'nature', defaultEnabled: false },
  { id: 'ffh_gebiete', wmsLayer: 'dipul:ffh-gebiete', label: 'FFH-Gebiete', category: 'nature', defaultEnabled: false },

  // Infrastructure
  { id: 'kraftwerke', wmsLayer: 'dipul:kraftwerke', label: 'Kraftwerke', category: 'infrastructure', defaultEnabled: false },
  { id: 'bundesautobahnen', wmsLayer: 'dipul:bundesautobahnen', label: 'Bundesautobahnen', category: 'infrastructure', defaultEnabled: false },
  { id: 'stromleitungen', wmsLayer: 'dipul:stromleitungen', label: 'Stromleitungen', category: 'infrastructure', defaultEnabled: false },
  { id: 'windkraftanlagen', wmsLayer: 'dipul:windkraftanlagen', label: 'Windkraftanlagen', category: 'infrastructure', defaultEnabled: false },

  // Sensitive
  { id: 'militaerische_anlagen', wmsLayer: 'dipul:militaerische_anlagen', label: 'Militärische Anlagen', category: 'sensitive', defaultEnabled: false },
  { id: 'krankenhaeuser', wmsLayer: 'dipul:krankenhaeuser', label: 'Krankenhäuser', category: 'sensitive', defaultEnabled: false },
  { id: 'justizvollzugsanstalten', wmsLayer: 'dipul:justizvollzugsanstalten', label: 'Justizvollzugsanstalten', category: 'sensitive', defaultEnabled: false },
];

export const DEFAULT_ENABLED_LAYERS = NFZ_LAYERS
  .filter(l => l.defaultEnabled)
  .map(l => l.id);

export function getWmsLayerString(enabledIds: string[]): string {
  return NFZ_LAYERS
    .filter(l => enabledIds.includes(l.id))
    .map(l => l.wmsLayer)
    .join(',');
}

export function getLayersByCategory(category: NoFlyCategory): NoFlyZoneLayer[] {
  return NFZ_LAYERS.filter(l => l.category === category);
}
