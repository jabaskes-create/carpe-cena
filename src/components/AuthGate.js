import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { reportLastSeen } from '../lastSeen';

export default function AuthGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (u) reportLastSeen(u); // records "last seen" in the app-activity tracker
      if (!u) navigate('/login');
    });
  }, [navigate]);

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--gold)' }}>
      Loading…
    </div>
  );

  return user ? children : null;
}
