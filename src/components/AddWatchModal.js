import React, { useState, useEffect } from 'react';

const PLATFORMS = [
  { value: 'resy', label: 'Resy' },
  { value: 'opentable', label: 'OpenTable' },
  { value: 'sevenrooms', label: 'SevenRooms' },
  { value: 'tock', label: 'Tock' },
  { value: 'thefork', label: 'TheFork' },
];

const TIMES = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'
];

const WEEKDAYS = [
  { value: 0, label: 'Su' },
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
];

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

// Extracts the venue slug from a SevenRooms URL
function extractSevenRoomsSlug(url) {
  if (!url) return '';
  try {
    const match = url.match(/sevenrooms\.com\/(?:reservations\/create|explore)\/([a-z0-9-]+)/i);
    if (match) return match[1];
    const venuesMatch = url.match(/[?&]venues=([a-z0-9-]+)/i);
    if (venuesMatch) return venuesMatch[1];
  } catch (e) {}
  return '';
}

function isGoogleMapsReserveUrl(url) {
  return /google\.com\/maps\/reserve/i.test(url || '');
}

// Mini calendar component
function CalendarPicker({ value, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const initial = value ? new Date(value + 'T12:00:00') : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const selected = value ? new Date(value + 'T12:00:00') : null;

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    if (d < today) return;
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(iso);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 16
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 18, padding: '0 8px' }}>‹</button>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
          {monthNames[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 18, padding: '0 8px' }}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const cellDate = new Date(viewYear, viewMonth, day);
          const isPast = cellDate < today;
          const isSelected = selected &&
            selected.getFullYear() === viewYear &&
            selected.getMonth() === viewMonth &&
            selected.getDate() === day;
          const isToday = cellDate.getTime() === today.getTime();

          return (
            <button
              key={day}
              onClick={() => selectDay(day)}
              disabled={isPast}
              style={{
                background: isSelected ? 'var(--gold)' : isToday ? 'var(--border)' : 'transparent',
                color: isSelected ? '#0f0e0c' : isPast ? 'var(--text-dim)' : 'var(--text-primary)',
                border: 'none',
                borderRadius: 6,
                padding: '6px 2px',
                fontSize: 13,
                cursor: isPast ? 'default' : 'pointer',
                fontWeight: isSelected ? 700 : 'normal',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {value && (
        <div style={{ marginTop: 10, textAlign: 'center', color: 'var(--gold)', fontSize: 13 }}>
          {new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}

const emptyForm = {
  restaurant: '',
  city: '',
  date: '',
  partySize: 2,
  platform: 'resy',
  autoBook: false,
  windowDays: '',
  bookingUrl: '',
  venueSlug: '',
  timeFrom: '18:00',
  timeTo: '21:00',
  flexDays: 1,
  allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
};

export default function AddWatchModal({ onSave, onClose, editingWatch }) {
  const [form, setForm] = useState(() =>
    editingWatch
      ? { ...emptyForm, ...editingWatch, allowedWeekdays: editingWatch.allowedWeekdays || [0,1,2,3,4,5,6] }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);

  const isEditing = !!editingWatch;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setSevenRoomsUrl = (url) => {
    const slug = extractSevenRoomsSlug(url);
    setForm(f => ({ ...f, bookingUrl: url, venueSlug: slug || f.venueSlug }));
  };

  const toggleWeekday = (day) => {
    setForm(f => {
      const has = f.allowedWeekdays.includes(day);
      const next = has ? f.allowedWeekdays.filter(d => d !== day) : [...f.allowedWeekdays, day];
      // Never allow zero days selected — fall back to all days rather than an impossible watch
      return { ...f, allowedWeekdays: next.length === 0 ? [0,1,2,3,4,5,6] : next };
    });
  };

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
      zIndex: 100, padding: 16, overflowY: 'auto'
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 440,
        margin: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font)', color: 'var(--gold)', fontWeight: 'normal', fontSize: 20 }}>
            {isEditing ? 'Edit Watch' : 'Watch a Restaurant'}
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

          <CalendarPicker value={form.date} onChange={v => set('date', v)} />

          {/* Flexible date range */}
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Flexible dates
            </p>
            <select value={form.flexDays} onChange={e => set('flexDays', Number(e.target.value))}>
              <option value={1}>Just this date</option>
              <option value={2}>This date, +1 day (2 days)</option>
              <option value={3}>This date, +2 days (3 days)</option>
              <option value={4}>This date, +3 days (4 days)</option>
              <option value={5}>This date, +4 days (5 days)</option>
              <option value={7}>This date, +6 days (1 week)</option>
              <option value={10}>This date, +9 days (10 days)</option>
              <option value={14}>This date, +13 days (2 weeks)</option>
            </select>
            {form.date && form.flexDays > 1 && (
              <p style={{ color: 'var(--gold)', fontSize: 12, marginTop: 6 }}>
                Range: {new Date(form.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} through{' '}
                {(() => {
                  const end = new Date(form.date + 'T12:00:00');
                  end.setDate(end.getDate() + form.flexDays - 1);
                  return end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                })()}
              </p>
            )}
          </div>

          {/* Specific weekdays within the range — e.g. only Mon/Wed/Thu/Sat */}
          {form.flexDays > 1 && (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Only check these days <span style={{ color: 'var(--text-dim)', fontWeight: 'normal' }}>(optional)</span>
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                {WEEKDAYS.map(w => {
                  const active = form.allowedWeekdays.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      onClick={() => toggleWeekday(w.value)}
                      style={{
                        flex: 1,
                        background: active ? 'var(--gold)' : 'var(--bg-secondary)',
                        color: active ? '#0f0e0c' : 'var(--text-dim)',
                        border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                        borderRadius: 6,
                        padding: '8px 0',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
                All days selected by default. Tap to exclude days you don't want checked (e.g. days you already have plans).
              </p>
            </div>
          )}

          {/* Platform + party size */}
          <div style={{ display: 'flex', gap: 10 }}>
            <select value={form.platform} onChange={e => set('platform', e.target.value)} style={{ flex: 2 }}>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={form.partySize} onChange={e => set('partySize', Number(e.target.value))} style={{ flex: 1 }}>
              {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
            </select>
          </div>

          {/* Preferred time range */}
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Preferred time window
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={form.timeFrom} onChange={e => set('timeFrom', e.target.value)} style={{ flex: 1 }}>
                {TIMES.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
              <span style={{ color: 'var(--text-dim)', fontSize: 13, flexShrink: 0 }}>to</span>
              <select value={form.timeTo} onChange={e => set('timeTo', e.target.value)} style={{ flex: 1 }}>
                {TIMES.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </div>
          </div>

          {(form.platform === 'opentable' || form.platform === 'thefork') && (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Booking window (days in advance)
              </p>
              <input
                type="number"
                placeholder={form.platform === 'opentable' ? 'Default: 30 days' : 'Default: 60 days'}
                value={form.windowDays}
                onChange={e => set('windowDays', e.target.value)}
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
                We'll email you when this window opens. Leave blank to use the default.
              </p>
            </div>
          )}

          {form.platform === 'sevenrooms' ? (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                SevenRooms link
              </p>
              <input
                placeholder="Paste the restaurant's SevenRooms booking link"
                value={form.bookingUrl}
                onChange={e => setSevenRoomsUrl(e.target.value)}
              />
              <p style={{ color: isGoogleMapsReserveUrl(form.bookingUrl) ? '#ff8a75' : 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
                {isGoogleMapsReserveUrl(form.bookingUrl)
                  ? "⚠️ This is a Google Maps link — we can't read the venue from it. Find the restaurant's direct SevenRooms link instead."
                  : form.venueSlug
                  ? `✓ Found venue: ${form.venueSlug}`
                  : "Paste any sevenrooms.com link for this restaurant — we'll figure out the rest."}
              </p>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Booking URL <span style={{ color: 'var(--text-dim)', fontWeight: 'normal' }}>(optional)</span>
              </p>
              <input
                placeholder="Paste direct booking link for email button"
                value={form.bookingUrl}
                onChange={e => set('bookingUrl', e.target.value)}
              />
            </div>
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
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Start Watching'}
          </button>
        </div>
      </div>
    </div>
  );
}
