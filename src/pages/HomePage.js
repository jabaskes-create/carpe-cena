import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, updateDoc, doc, serverTimestamp,
  getDoc, setDoc
} from 'firebase/firestore';
import WatchCard from '../components/WatchCard';
import AddWatchModal from '../components/AddWatchModal';
import CalendarView from '../components/CalendarView';

function datesCoveredByWatch(watch) {
  const numDays = Math.max(1, parseInt(watch.flexDays) || 1);
  const start = new Date(watch.date + 'T12:00:00');
  const dates = [];

  const restrictToWeekdays = Array.isArray(watch.dayPriority) && watch.dayPriority.length > 0
    ? watch.dayPriority
    : (Array.isArray(watch.allowedWeekdays) && watch.allowedWeekdays.length < 7 ? watch.allowedWeekdays : null);

  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (restrictToWeekdays && !restrictToWeekdays.includes(d.getDay())) continue;
    const iso = d.toISOString().split('T')[0];
    if (Array.isArray(watch.excludedDates) && watch.excludedDates.includes(iso)) continue;
    dates.push(iso);
  }
  return dates;
}

const FREQ_OPTIONS = [
  { value: 0, label: 'No summary' },
  { value: 1, label: 'Summary: weekly' },
  { value: 2, label: 'Summary: 2×/week' },
  { value: 3, label: 'Summary: 3×/week' },
  { value: 4, label: 'Summary: 4×/week' },
  { value: 5, label: 'Summary: 5×/week' },
  { value: 6, label: 'Summary: 6×/week' },
  { value: 7, label: 'Summary: daily' },
];

export default function HomePage() {
  const [watches, setWatches] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingWatch, setEditingWatch] = useState(null);
  const [view, setView] = useState('list');
  const [summaryFreq, setSummaryFreq] = useState(0);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'watches'), where('uid', '==', user.uid));
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => new Date(a.date) - new Date(b.date));
      setWatches(items);
    });
  }, [user]);

  // Load summary frequency preference
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) setSummaryFreq(snap.data().summaryFrequency || 0);
    });
  }, [user]);

  const saveSummaryFreq = async (val) => {
    setSummaryFreq(val);
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      summaryFrequency: val,
    }, { merge: true });
  };

  const addWatch = async (data) => {
    await addDoc(collection(db, 'watches'), {
      ...data,
      uid: user.uid,
      email: user.email,
      status: 'watching',
      createdAt: serverTimestamp(),
    });
  };

  const saveEditedWatch = async (data) => {
    const { id, ...fields } = data;
    await updateDoc(doc(db, 'watches', id), {
      ...fields,
      status: 'watching',
      matchedDate: null,
      matchedTime: null,
    });
  };

  const deleteWatch = async (id) => {
    await deleteDoc(doc(db, 'watches', id));
  };

  const [prefilledDate, setPrefilledDate] = useState(null);

  const openAdd = (date = null) => {
    setEditingWatch(null);
    setPrefilledDate(date);
    setShowAdd(true);
  };

  const openEdit = (watch) => {
    setEditingWatch(watch);
    setShowAdd(true);
  };

  const closeModal = () => {
    setShowAdd(false);
    setEditingWatch(null);
  };

  const stopDateForWatches = async (dateISO, _unused, watchesOnThatDate) => {
    if (watchesOnThatDate.length === 0) return;

    const dateLabel = new Date(dateISO + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const names = watchesOnThatDate.map(w => w.restaurant).join(', ');
    const confirmed = window.confirm(
      `Stop searching for ${dateLabel} across ${watchesOnThatDate.length} restaurant${watchesOnThatDate.length === 1 ? '' : 's'}?\n\n${names}\n\nAny other dates these watches cover will keep being checked.`
    );
    if (!confirmed) return;

    await Promise.all(watchesOnThatDate.map(async (w) => {
      const remainingDates = datesCoveredByWatch(w).filter(d => d !== dateISO);
      if (remainingDates.length === 0) {
        await deleteDoc(doc(db, 'watches', w.id));
      } else {
        const nextExcluded = Array.isArray(w.excludedDates) ? [...w.excludedDates, dateISO] : [dateISO];
        await updateDoc(doc(db, 'watches', w.id), { excludedDates: nextExcluded });
      }
    }));
  };

  const todayStart = new Date(new Date().toDateString());
  const upcoming = watches.filter(w => new Date(w.date) >= todayStart);
  const watching = upcoming.filter(w => w.status === 'watching');
  const completed = upcoming.filter(w => w.status === 'available' || w.status === 'booked');

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font)', color: 'var(--gold)', fontSize: 28, fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/icon-192.png" alt="" style={{ width: 36, height: 36, borderRadius: 8 }} />
            Carpe Cena
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Seize the dinner</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={summaryFreq}
            onChange={e => saveSummaryFreq(Number(e.target.value))}
            style={{ fontSize: 11, color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px' }}
          >
            {FREQ_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => signOut(auth)} style={{
            background: 'transparent', color: 'var(--text-dim)', fontSize: 13
          }}>
            Sign out
          </button>
        </div>
      </div>

      {view === 'list' && (
        <button onClick={openAdd} style={{
          width: '100%', background: 'var(--gold)', color: '#0f0e0c',
          padding: '14px', borderRadius: 10, fontWeight: 600, fontSize: 15,
          marginBottom: 16, letterSpacing: 0.3
        }}>
          + Watch a Restaurant
        </button>
      )}

      {upcoming.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button
            onClick={() => setView('list')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: view === 'list' ? 'var(--bg-card)' : 'transparent',
              border: `1px solid ${view === 'list' ? 'var(--gold-dim)' : 'var(--border)'}`,
              color: view === 'list' ? 'var(--gold)' : 'var(--text-dim)',
            }}
          >
            ☰ List
          </button>
          <button
            onClick={() => setView('calendar')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: view === 'calendar' ? 'var(--bg-card)' : 'transparent',
              border: `1px solid ${view === 'calendar' ? 'var(--gold-dim)' : 'var(--border)'}`,
              color: view === 'calendar' ? 'var(--gold)' : 'var(--text-dim)',
            }}
          >
            📅 Calendar
          </button>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          color: 'var(--text-dim)', border: '1px dashed var(--border)',
          borderRadius: 12
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <p>No active watches.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Add a restaurant to start monitoring availability.</p>
        </div>
      ) : view === 'calendar' ? (
        <CalendarView
          watches={upcoming}
          onStopOthers={stopDateForWatches}
          onBack={() => setView('list')}
          onAddWatch={(date) => openAdd(date)}
        />
      ) : (
        <>
          <div style={{ marginBottom: watching.length && completed.length ? 32 : 0 }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              👁 Watching {watching.length > 0 && `(${watching.length})`}
            </p>
            {watching.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic' }}>
                Nothing currently being watched.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {watching.map(w => <WatchCard key={w.id} watch={w} onDelete={deleteWatch} onEdit={openEdit} />)}
              </div>
            )}
          </div>

          {completed.length > 0 && (
            <div>
              <p style={{ color: 'var(--green)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                ✓ Completed ({completed.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {completed.map(w => <WatchCard key={w.id} watch={w} onDelete={deleteWatch} onEdit={openEdit} isPast={false} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showAdd && (
        <AddWatchModal
          onSave={editingWatch ? saveEditedWatch : addWatch}
          onClose={closeModal}
          editingWatch={editingWatch}
          prefilledDate={prefilledDate}
        />
      )}
    </div>
  );
}