import React, { useState } from 'react';

const PLATFORMS = [
  { value: 'resy', label: 'Resy' },
  { value: 'opentable', label: 'OpenTable' },
  { value: 'sevenrooms', label: 'SevenRooms' },
  { value: 'tock', label: 'Tock' },
  { value: 'thefork', label: 'TheFork' },
];

const today = new Date().toISOString().split('T')[0];

export default function AddWatchModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    restaurant: '',
    city: '',
    date: '',
    partySize: 2,
    platform: 'resy',
    autoBook: false,
    theforkWindowDays: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const valid = form.restaurant.trim() && form.city.trim() && form.date;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    await onSave(form);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 440
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font)', color: 'var(--gold)', fontWeight: 'normal', fontSize: 20 }}>
            Watch a Restaurant
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-dim)', fontSize: 22 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            placeholder="Restaurant name"
            value={form.restaurant}
            onChange={e => set('restaurant', e.target.value)}
          />
          <input
            placeholder="City (e.g. London, Paris, New York)"
            value={form.city}
            onChange={e => set('city', e.target.value)}
          />
          <input
            type="date"
            min={today}
            value={form.date}
            onChange={e => set('date', e.target.value)}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <select value={form.platform} onChange={e => set('platform', e.target.value)} style={{ flex: 2 }}>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={form.partySize} onChange={e => set('partySize', Number(e.target.value))} style={{ flex: 1 }}>
              {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
            </select>
          </div>

          {form.platform === 'thefork' && (
            <input
              type="number"
              placeholder="Booking window (days in advance, e.g. 60)"
              value={form.theforkWindowDays}
              onChange={e => set('theforkWindowDays', e.target.value)}
            />
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.autoBook}
              onChange={e => set('autoBook', e.target.checked)}
              style={{ width: 'auto' }}
            />
            Auto-book when available (where supported)
          </label>

          <button
            onClick={handleSave}
            disabled={!valid || saving}
            style={{
              background: valid ? 'var(--gold)' : 'var(--border)',
              color: valid ? '#0f0e0c' : 'var(--text-dim)',
              padding: '13px', borderRadius: 8, fontWeight: 600,
              fontSize: 15, marginTop: 4
            }}
          >
            {saving ? 'Saving…' : 'Start Watching'}
          </button>
        </div>
      </div>
    </div>
  );
}
