// Manually checks a single watch on demand — used by the "Check now" button
// Does NOT send an email or change status; just returns the result for display

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkResy } from './check-resy.js';
import { checkSevenRooms } from './check-sevenrooms.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

const db = getFirestore();

function checkWindowDays(watch, today, defaultDays) {
  const targetDate = new Date(watch.date + 'T12:00:00');
  const windowDays = parseInt(watch.windowDays) || defaultDays;
  const windowOpens = new Date(targetDate);
  windowOpens.setDate(windowOpens.getDate() - windowDays);
  const todayDate = new Date(today + 'T12:00:00');
  return todayDate >= windowOpens;
}

export default async function handler(req, res) {
  const { watchId } = req.query;

  if (!watchId) {
    return res.status(400).json({ error: 'Missing watchId' });
  }

  const doc = await db.collection('watches').doc(watchId).get();
  if (!doc.exists) {
    return res.status(404).json({ error: 'Watch not found' });
  }

  const watch = { id: doc.id, ...doc.data() };
  const today = new Date().toISOString().split('T')[0];

  let result = { available: false, reason: 'Unknown platform' };

  if (watch.platform === 'resy') {
    result = await checkResy(watch);

  } else if (watch.platform === 'opentable') {
    if (checkWindowDays(watch, today, 30)) {
      result = { available: true, reason: 'Booking window is open', windowJustOpened: true };
    } else {
      const targetDate = new Date(watch.date + 'T12:00:00');
      const windowDays = parseInt(watch.windowDays) || 30;
      const windowOpens = new Date(targetDate);
      windowOpens.setDate(windowOpens.getDate() - windowDays);
      const daysUntilOpen = Math.ceil((windowOpens - new Date(today + 'T12:00:00')) / (1000 * 60 * 60 * 24));
      result = { available: false, reason: `Window opens in ${daysUntilOpen} day${daysUntilOpen === 1 ? '' : 's'} (${windowDays}-day advance booking)` };
    }

  } else if (watch.platform === 'thefork') {
    if (checkWindowDays(watch, today, 60)) {
      result = { available: true, reason: 'Booking window is open', windowJustOpened: true };
    } else {
      const targetDate = new Date(watch.date + 'T12:00:00');
      const windowDays = parseInt(watch.windowDays) || 60;
      const windowOpens = new Date(targetDate);
      windowOpens.setDate(windowOpens.getDate() - windowDays);
      const daysUntilOpen = Math.ceil((windowOpens - new Date(today + 'T12:00:00')) / (1000 * 60 * 60 * 24));
      result = { available: false, reason: `Window opens in ${daysUntilOpen} day${daysUntilOpen === 1 ? '' : 's'} (${windowDays}-day advance booking)` };
    }

  } else if (watch.platform === 'sevenrooms') {
    result = await checkSevenRooms(watch);
  }

  return res.status(200).json({
    watchId,
    restaurant: watch.restaurant,
    checkedAt: new Date().toISOString(),
    ...result,
  });
}