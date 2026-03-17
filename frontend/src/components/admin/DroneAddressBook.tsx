import { useState, useEffect, useCallback } from 'react';
import {
  fetchAddressBook,
  createAddressBookEntry,
  updateAddressBookEntry,
  deleteAddressBookEntry,
  fetchAddressBookSuggestions,
} from '../../api';
import type { AddressBookEntry, AddressBookSuggestion } from '../../types/drone';
import { useIsMobile } from '../../useIsMobile';

function timeAgo(epoch: number): string {
  const seconds = Math.floor(Date.now() / 1000 - epoch);
  if (seconds < 60) return `vor ${seconds}s`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

const SOURCE_COLORS: Record<string, string> = {
  opendroneid: '#3b82f6',
  adsb: '#8b5cf6',
  ogn: '#f59e0b',
  simulation: '#6b7280',
};

export default function DroneAddressBook() {
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editEntry, setEditEntry] = useState<AddressBookEntry | null>(null);
  const [suggestions, setSuggestions] = useState<AddressBookSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formIdentifier, setFormIdentifier] = useState('');
  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchAddressBook();
      setEntries(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = async () => {
    setEditEntry(null);
    setFormIdentifier('');
    setFormName('');
    setFormNotes('');
    setError('');
    setShowDialog(true);
    setSuggestionsLoading(true);
    try {
      const s = await fetchAddressBookSuggestions();
      setSuggestions(s);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const openEdit = (entry: AddressBookEntry) => {
    setEditEntry(entry);
    setFormIdentifier(entry.identifier);
    setFormName(entry.customName);
    setFormNotes(entry.notes || '');
    setError('');
    setSuggestions([]);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formIdentifier.trim() || !formName.trim()) return;
    setError('');
    try {
      if (editEntry) {
        await updateAddressBookEntry(editEntry.id, {
          identifier: formIdentifier.trim(),
          customName: formName.trim(),
          notes: formNotes.trim(),
        });
      } else {
        await createAddressBookEntry({
          identifier: formIdentifier.trim(),
          customName: formName.trim(),
          notes: formNotes.trim() || undefined,
        });
      }
      setShowDialog(false);
      load();
    } catch (e: any) {
      setError(e.message || 'Fehler beim Speichern');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eintrag wirklich löschen?')) return;
    try {
      await deleteAddressBookEntry(id);
      load();
    } catch { /* ignore */ }
  };

  const selectSuggestion = (s: AddressBookSuggestion) => {
    setFormIdentifier(s.identifier);
    if (!formName) setFormName(s.currentName);
  };

  const filtered = entries.filter(e => {
    const q = filter.toLowerCase();
    if (!q) return true;
    return (
      e.identifier.toLowerCase().includes(q) ||
      e.customName.toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q)
    );
  });

  // Filter suggestions to exclude already-booked identifiers
  const existingIdentifiers = new Set(entries.map(e => e.identifier));
  const filteredSuggestions = suggestions.filter(s => !existingIdentifiers.has(s.identifier));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: isMobile ? '10px 12px' : '7px 10px',
    fontSize: isMobile ? 14 : 13,
    color: 'var(--text-primary)',
    outline: 'none',
    minHeight: isMobile ? 44 : undefined,
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const btnPrimary: React.CSSProperties = {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: isMobile ? '10px 16px' : '7px 14px',
    fontSize: isMobile ? 14 : 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: isMobile ? 44 : undefined,
  };

  const btnSecondary: React.CSSProperties = {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: isMobile ? '10px 16px' : '7px 14px',
    fontSize: isMobile ? 14 : 13,
    cursor: 'pointer',
    minHeight: isMobile ? 44 : undefined,
  };

  const renderDialog = () => {
    if (!showDialog) return null;
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={() => setShowDialog(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 2000,
          }}
        />
        {/* Dialog */}
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: isMobile ? 20 : 24,
          width: isMobile ? 'calc(100vw - 32px)' : 480,
          maxHeight: '80vh',
          overflow: 'auto',
          zIndex: 2001,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
            {editEntry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
          </h3>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 12,
              fontSize: 12,
              color: '#ef4444',
            }}>
              {error}
            </div>
          )}

          {/* Suggestions (only for new entries) */}
          {!editEntry && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Aktive Drohnen (Vorschläge)</label>
              {suggestionsLoading ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                  Lade Vorschläge...
                </div>
              ) : filteredSuggestions.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                  Keine neuen Drohnen gefunden
                </div>
              ) : (
                <div style={{
                  maxHeight: 160,
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--bg-primary)',
                }}>
                  {filteredSuggestions.map(s => (
                    <button
                      key={s.identifier}
                      onClick={() => selectSuggestion(s)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: isMobile ? '10px 12px' : '8px 12px',
                        background: formIdentifier === s.identifier ? 'rgba(59,130,246,0.1)' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: 'var(--text-primary)',
                        fontSize: isMobile ? 13 : 12,
                        minHeight: isMobile ? 44 : undefined,
                      }}
                    >
                      <span style={{
                        background: SOURCE_COLORS[s.source] || 'var(--bg-tertiary)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        flexShrink: 0,
                        textTransform: 'uppercase',
                      }}>
                        {s.sourceLabel}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.currentName}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                        {s.identifier.length > 20 ? s.identifier.slice(0, 20) + '...' : s.identifier}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Identifier */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Kennung (Identifier)</label>
            <input
              value={formIdentifier}
              onChange={e => setFormIdentifier(e.target.value)}
              placeholder="z.B. MAC-Adresse, ICAO-Hex, Serial..."
              style={inputStyle}
            />
          </div>

          {/* Custom Name */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Anzeigename</label>
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="z.B. Meine DJI Mini 3"
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notizen (optional)</label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="z.B. Eigentümer, Zweck, Seriennummer..."
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowDialog(false)} style={btnSecondary}>
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={!formIdentifier.trim() || !formName.trim()}
              style={{
                ...btnPrimary,
                opacity: (!formIdentifier.trim() || !formName.trim()) ? 0.5 : 1,
              }}
            >
              {editEntry ? 'Speichern' : 'Hinzufügen'}
            </button>
          </div>
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Lade Adressbuch...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>
          Drohnen-Adressbuch
        </h2>
        <button onClick={openAdd} style={btnPrimary}>
          + Hinzufügen
        </button>
      </div>

      {/* Description */}
      <p style={{
        margin: '0 0 16px',
        fontSize: isMobile ? 13 : 12,
        color: 'var(--text-muted)',
        lineHeight: 1.5,
      }}>
        Vergeben Sie eigene Namen für bekannte Drohnen. Der Anzeigename wird auf der Karte und in allen Listen statt der technischen Kennung angezeigt.
      </p>

      {/* Filter */}
      {entries.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Suche nach Kennung, Name oder Notiz..."
            style={{
              ...inputStyle,
              maxWidth: isMobile ? '100%' : 360,
            }}
          />
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 32,
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-secondary)' }}>
            Noch keine Einträge vorhanden.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Klicken Sie auf &quot;+ Hinzufügen&quot; um eine Drohne zu benennen.
          </p>
        </div>
      )}

      {/* Desktop Table */}
      {!isMobile && filtered.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Kennung
                </th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Anzeigename
                </th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notizen
                </th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Aktualisiert
                </th>
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr
                  key={entry.id}
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {entry.identifier}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                    {entry.customName}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.notes || '-'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {timeAgo(entry.updatedAt)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => openEdit(entry)}
                        style={{
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          padding: '4px 10px',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        style={{
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 4,
                          padding: '4px 10px',
                          fontSize: 12,
                          color: '#ef4444',
                          cursor: 'pointer',
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Cards */}
      {isMobile && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(entry => (
            <div
              key={entry.id}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                    {entry.customName}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.identifier}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
                  {timeAgo(entry.updatedAt)}
                </div>
              </div>
              {entry.notes && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
                  {entry.notes}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => openEdit(entry)}
                  style={{
                    ...btnSecondary,
                    flex: 1,
                    fontSize: 13,
                    padding: '8px 12px',
                    textAlign: 'center',
                  }}
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#ef4444',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter no results */}
      {entries.length > 0 && filtered.length === 0 && filter && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--text-muted)',
        }}>
          Keine Einträge für &quot;{filter}&quot; gefunden.
        </div>
      )}

      {/* Count */}
      {entries.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} von {entries.length} Einträgen
          {filter ? ` (gefiltert)` : ''}
        </div>
      )}

      {renderDialog()}
    </div>
  );
}
