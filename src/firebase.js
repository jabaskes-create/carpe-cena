import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCHKz0taVWJikh0Qv94QCnOVLZtH7xGZ1s",
  authDomain: "carpe-cena.firebaseapp.com",
  projectId: "carpe-cena",
  storageBucket: "carpe-cena.firebasestorage.app",
  messagingSenderId: "1079082387360",
  appId: "1:1079082387360:web:b88e8c8d77f70ce45106c5",
  measurementId: "G-WJ1W9TNC83"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;