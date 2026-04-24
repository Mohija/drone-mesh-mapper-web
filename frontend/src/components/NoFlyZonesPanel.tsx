import { useEffect, useRef } from 'react';
import HelpLink from './HelpLink';
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
        maxHeight: 520,
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
        <HelpLink section="nfz" title="Hilfe: Flugverbotszonen" size={16} />
        <span style={{ flex: 1 }} />
        <button
          onClick={() => onToggleAll(!allEnabled)}
          title={allEnabled ? 'Alle deaktivieren' : 'Alle aktivieren'}
          style={{
            fontSize: 12,
            padding: '8px 14px',      // 32 px tall content + ~12px vertical padding → 44px HIG
            minHeight: 40,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: allEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: allEnabled ? '#0b0d12' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: 600,
            touchAction: 'manipulation',
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
                gap: 10,
                padding: '10px 4px',   // ~44px tap-target on touch devices
                cursor: 'pointer',
                minHeight: 44,
                touchAction: 'manipulation',
                borderRadius: 6,
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
                width: 36,
                height: 20,
                borderRadius: 10,
                background: catFull ? 'var(--accent)' : catPartial ? 'var(--accent)' : 'var(--bg-tertiary)',
                position: 'relative',
                opacity: catPartial ? 0.6 : 1,
                flexShrink: 0,
                boxShadow: catFull ? 'var(--shadow-sm)' : 'none',
              }}>
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 2,
                  left: catFull || catPartial ? 18 : 2,
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
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
                      gap: 10,
                      padding: '8px 4px',       // 40px tap-target
                      minHeight: 40,
                      cursor: 'pointer',
                      borderRadius: 6,
                      touchAction: 'manipulation',
                    }}
                    onClick={() => onToggleLayer(layer.id)}
                    data-testid={`nofly-layer-${layer.id}`}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `1.5px solid ${isEnabled ? 'var(--accent)' : 'var(--border)'}`,
                      background: isEnabled ? 'var(--accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                      {isEnabled && (
                        <span style={{ fontSize: 12, color: '#0b0d12', lineHeight: 1, fontWeight: 700 }}>&#10003;</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 13,
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
