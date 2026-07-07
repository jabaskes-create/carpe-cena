import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError('');
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg-primary)'
    }}>
      <div style={{
        width: 360, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 40
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🍽️</div>
          <h1 style={{ fontFamily: 'var(--font)', color: 'var(--gold)', fontSize: 28, fontWeight: 'normal' }}>
            Carpe Cena
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
            Seize the dinner
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />

          {error && (
            <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>
          )}

          <button onClick={handleSubmit} style={{
            background: 'var(--gold)', color: '#0f0e0c', padding: '12px',
            borderRadius: 8, fontWeight: 600, fontSize: 15, marginTop: 4
          }}>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} style={{
            background: 'transparent', color: 'var(--text-secondary)', fontSize: 13
          }}>
            {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
