import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import WatchCard from '../components/WatchCard';
import AddWatchModal from '../components/AddWatchModal';

export default function HomePage() {
  const [watches, setWatches] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
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
      status: 'watching',
      createdAt: serverTimestamp(),
    });
  };

  const deleteWatch = async (id) => {
    await deleteDoc(doc(db, 'watches', id));
  };

  const active = watches.filter(w => new Date(w.date) >= new Date(new Date().toDateString()));
  const past = watches.filter(w => new Date(w.date) < new Date(new Date().toDateString()));

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

      <button onClick={() => setShowAdd(true)} style={{
        width: '100%', background: 'var(--gold)', color: '#0f0e0c',
        padding: '14px', borderRadius: 10, fontWeight: 600, fontSize: 15,
        marginBottom: 28, letterSpacing: 0.3
      }}>
        + Watch a Restaurant
      </button>

      {active.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          color: 'var(--text-dim)', border: '1px dashed var(--border)',
          borderRadius: 12
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <p>No active watches.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Add a restaurant to start monitoring availability.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.map(w => <WatchCard key={w.id} watch={w} onDelete={deleteWatch} />)}
        </div>
      )}

      {past.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
            Past
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.5 }}>
            {past.map(w => <WatchCard key={w.id} watch={w} onDelete={deleteWatch} isPast />)}
          </div>
        </div>
      )}

      {showAdd && <AddWatchModal onSave={addWatch} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
