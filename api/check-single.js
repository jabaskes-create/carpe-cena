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

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function checkWindowDaysRange(watch, today, defaultDays) {
  const numDays = Math.max(1, parseInt(watch.flexDays) || 1);
  const windowDays = parseInt(watch.windowDays) || defaultDays;
  const todayDate = new Date(today + 'T12:00:00');

  for (let i = 0; i < numDays; i++) {
    const checkDate = i === 0 ? watch.date : addDays(watch.date, i);
    const targetDate = new Date(checkDate + 'T12:00:00');
    const windowOpens = new Date(targetDate);
    windowOpens.setDate(windowOpens.getDate() - windowDays);

    if (todayDate >= windowOpens) {
      return { open: true, matchedDate: checkDate };
    }
  }

  // None open yet — report how long until the earliest one opens
  const firstTarget = new Date(watch.date + 'T12:00:00');
  const firstWindowOpens = new Date(firstTarget);
  firstWindowOpens.setDate(firstWindowOpens.getDate() - windowDays);
  const daysUntilOpen = Math.ceil((firstWindowOpens - todayDate) / (1000 * 60 * 60 * 24));
  return { open: false, daysUntilOpen, windowDays };
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
    const w = checkWindowDaysRange(watch, today, 30);
    result = w.open
      ? { available: true, reason: 'Booking window is open', matchedDate: w.matchedDate }
      : { available: false, reason: `Window opens in ${w.daysUntilOpen} day${w.daysUntilOpen === 1 ? '' : 's'} (${w.windowDays}-day advance booking)` };

  } else if (watch.platform === 'thefork') {
    const w = checkWindowDaysRange(watch, today, 60);
    result = w.open
      ? { available: true, reason: 'Booking window is open', matchedDate: w.matchedDate }
      : { available: false, reason: `Window opens in ${w.daysUntilOpen} day${w.daysUntilOpen === 1 ? '' : 's'} (${w.windowDays}-day advance booking)` };

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
