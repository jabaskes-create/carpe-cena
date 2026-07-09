import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function SettingsModal({ user, onClose }) {
  const [freq, setFreq] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        setFreq(snap.data().summaryFrequency || 0);
      }
      setLoading(false);
    }
    load();
  }, [user.uid]);

  const save = async () => {
    setSaving(true);
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      summaryFrequency: freq,
    }, { merge: true });
    setSaving(false);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 380,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font)', color: 'var(--gold)', fontWeight: 'normal', fontSize: 20 }}>
            Settings
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-dim)', fontSize: 22 }}>×</button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Summary email frequency
              </p>
              <select
                value={freq}
                onChange={e => setFreq(Number(e.target.value))}
              >
                <option value={0}>Never</option>
                <option value={1}>Once a week</option>
                <option value={2}>Twice a week</option>
                <option value={3}>3 times a week</option>
                <option value={4}>4 times a week</option>
                <option value={5}>5 times a week</option>
                <option value={6}>6 times a week</option>
                <option value={7}>Daily</option>
              </select>
              <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
                A summary of all your active watches — restaurant, date, days remaining, and last check result.
              </p>
            </div>

            <button
              onClick={save}
              disabled={saving}
              style={{
                background: 'var(--gold)', color: '#0f0e0c',
                padding: '12px', borderRadius: 8, fontWeight: 600,
                fontSize: 14, marginTop: 4,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
