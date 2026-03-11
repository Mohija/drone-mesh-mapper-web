import { useEffect, useRef } from 'react';
import {
  NFZ_CATEGORIES,
  NFZ_LAYERS,
  type NoFlyCategory,
  getLayersByCategory,
} from '../config/noFlyZones';

interface Props {
  enabledLayers: string[];
  onToggleLayer: (layerId: string) => void;
  onToggleCategory: (category: NoFlyCategory) => void;
  onToggleAll: (enabled: boolean) => void;
  onClose: () => void;
}

export default function NoFlyZonesPanel({
  enabledLayers,
  onToggleLayer,
  onToggleCategory,
  onToggleAll,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const allEnabled = NFZ_LAYERS.every(l => enabledLayers.includes(l.id));
  const noneEnabled = enabledLayers.length === 0;

  function isCategoryFullyEnabled(cat: NoFlyCategory): boolean {
    const layers = getLayersByCategory(cat);
    return layers.every(l => enabledLayers.includes(l.id));
  }

  function isCategoryPartiallyEnabled(cat: NoFlyCategory): boolean {
    const layers = getLayersByCategory(cat);
    return layers.some(l => enabledLayers.includes(l.id)) && !isCategoryFullyEnabled(cat);
  }

  return (
    <div
      ref={panelRef}
      data-testid="nofly-panel"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 6,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 12,
        minWidth: 260,
        maxHeight: 420,
        overflowY: 'auto',
        zIndex: 2000,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Flugverbotszonen (DIPUL)</span>
        <button
          onClick={() => onToggleAll(!allEnabled)}
          title={allEnabled ? 'Alle deaktivieren' : 'Alle aktivieren'}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: allEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: allEnabled ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {allEnabled ? 'Alle aus' : noneEnabled ? 'Alle an' : 'Alle an'}
        </button>
      </div>

      {/* Categories */}
      {NFZ_CATEGORIES.map(cat => {
        const layers = getLayersByCategory(cat.id);
        const catFull = isCategoryFullyEnabled(cat.id);
        const catPartial = isCategoryPartiallyEnabled(cat.id);

        return (
          <div key={cat.id} style={{ marginBottom: 8 }}>
            {/* Category header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                cursor: 'pointer',
              }}
              onClick={() => onToggleCategory(cat.id)}
              data-testid={`nofly-category-${cat.id}`}
            >
              <div style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: cat.color,
                opacity: catFull || catPartial ? 1 : 0.3,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: catFull || catPartial ? 'var(--text-primary)' : 'var(--text-muted)',
                flex: 1,
              }}>
                {cat.label}
              </span>
              {/* Category toggle indicator */}
              <div style={{
                width: 28,
                height: 16,
                borderRadius: 8,
                background: catFull ? 'var(--accent)' : catPartial ? 'var(--accent)' : 'var(--bg-tertiary)',
                position: 'relative',
                opacity: catPartial ? 0.6 : 1,
                flexShrink: 0,
              }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 2,
                  left: catFull || catPartial ? 14 : 2,
                  transition: 'left 0.2s',
                }} />
              </div>
            </div>

            {/* Individual layers */}
            <div style={{ paddingLeft: 18 }}>
              {layers.map(layer => {
                const isEnabled = enabledLayers.includes(layer.id);
                return (
                  <div
                    key={layer.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '3px 0',
                      cursor: 'pointer',
                    }}
                    onClick={() => onToggleLayer(layer.id)}
                    data-testid={`nofly-layer-${layer.id}`}
                  >
                    <div style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: `1px solid ${isEnabled ? 'var(--accent)' : 'var(--border)'}`,
                      background: isEnabled ? 'var(--accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                      {isEnabled && (
                        <span style={{ fontSize: 10, color: '#fff', lineHeight: 1 }}>&#10003;</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 12,
                      color: isEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}>
                      {layer.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Attribution */}
      <div style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        color: 'var(--text-muted)',
        lineHeight: 1.4,
      }}>
        Geodaten: DFS, BKG 2026
      </div>
    </div>
  );
}
