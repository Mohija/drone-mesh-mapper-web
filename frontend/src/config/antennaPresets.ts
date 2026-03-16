export const ANTENNA_PRESETS = [
  { value: 'pcb', label: 'PCB-Antenne (eingebaut, ~2dBi)', defaultRadius: 1000 },
  { value: 'dipole_5dbi', label: 'Externe Dipol 5dBi', defaultRadius: 2000 },
  { value: 'omni_9dbi', label: 'Externe Omni 9dBi', defaultRadius: 3000 },
  { value: 'panel_12dbi', label: 'Panel 12dBi (gerichtet)', defaultRadius: 5000 },
  { value: 'yagi_15dbi', label: 'Yagi 15-18dBi (gerichtet)', defaultRadius: 10000 },
] as const;

export type AntennaType = typeof ANTENNA_PRESETS[number]['value'];

export function getDefaultRadius(antennaType: string): number {
  return ANTENNA_PRESETS.find(p => p.value === antennaType)?.defaultRadius ?? 1000;
}

export function getAntennaLabel(antennaType: string): string {
  return ANTENNA_PRESETS.find(p => p.value === antennaType)?.label ?? antennaType;
}
