import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, updateDoc, doc, serverTimestamp
} from 'firebase/firestore';
import WatchCard from '../components/WatchCard';
import AddWatchModal from '../components/AddWatchModal';
import CalendarView from '../components/CalendarView';

export default function HomePage() {
  const [watches, setWatches] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingWatch, setEditingWatch] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'calendar'
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
    // Editing implies the person wants fresh eyes on this watch —
    // reset it back to "watching" so it re-enters the check cycle
    // rather than sitting stale in "Completed" with an outdated match.
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

  const openAdd = () => {
    setEditingWatch(null);
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

  // Batch-clear: given a date and the set of watches touching it, delete
  // all of them except the one the person says they actually booked
  // (keepWatchId can be null if they booked somewhere not in this list —
  // e.g. a phone reservation — in which case all of them get cleared).
  const stopOthersForDate = async (dateISO, keepWatchId, watchesOnThatDate) => {
    const toDelete = watchesOnThatDate.filter(w => w.id !== keepWatchId);
    if (toDelete.length === 0) return;

    const dateLabel = new Date(dateISO + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const names = toDelete.map(w => w.restaurant).join(', ');
    const confirmed = window.confirm(
      `Stop watching ${toDelete.length} other restaurant${toDelete.length === 1 ? '' : 's'} for ${dateLabel}?\n\n${names}\n\nThis can't be undone.`
    );
    if (!confirmed) return;

    await Promise.all(toDelete.map(w => deleteDoc(doc(db, 'watches', w.id))));
  };

  // Only show watches whose target date hasn't passed yet.
  // Once the date passes, the watch quietly drops off the list —
  // no need to keep cluttering the screen with old entries.
  const todayStart = new Date(new Date().toDateString());
  const upcoming = watches.filter(w => new Date(w.date) >= todayStart);

  const watching = upcoming.filter(w => w.status === 'watching');
  const completed = upcoming.filter(w => w.status === 'available' || w.status === 'booked');

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font)', color: 'var(--gold)', fontSize: 28, fontWeight: 'normal' }}>
            🍽️ Carpe Cena
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Seize the dinner</p>
        </div>
        <button onClick={() => signOut(auth)} style={{
          background: 'transparent', color: 'var(--text-dim)', fontSize: 13
        }}>
          Sign out
        </button>
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
          onStopOthers={stopOthersForDate}
          onBack={() => setView('list')}
        />
      ) : (
        <>
          {/* Watching section */}
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

          {/* Completed section */}
          {completed.length > 0 && (
            <div>
              <p style={{ color: 'var(--green)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                ✓ Completed ({completed.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {completed.map(w => <WatchCard key={w.id} watch={w} onDelete={deleteWatch} onEdit={openEdit} />)}
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
        />
      )}
    </div>
  );
}