// Manually checks a single watch on demand — used by the "Check now" button
// Does NOT send an email or change status; just returns the result for display

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkResy } from './check-resy.js';
import { checkSevenRooms } from './check-sevenrooms.js';
import { checkOpenTableReal } from './check-opentable-mcp.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

const db = getFirestore();

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T12:00:00');
  const b = new Date(dateStrB + 'T12:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function dateInRange(startDate, days, weekday) {
  for (let i = 0; i < days; i++) {
    const d = i === 0 ? startDate : addDays(startDate, i);
    if (new Date(d + 'T12:00:00').getDay() === weekday) return d;
  }
  return null;
}

function checkWindowDaysRange(watch, today, defaultDays) {
  const numDays = Math.max(1, parseInt(watch.flexDays) || 1);

  let windowDays;
  let usingFBD = false;
  if (watch.furthestBookableDate && watch.furthestBookableObservedAt) {
    windowDays = daysBetween(watch.furthestBookableObservedAt, watch.furthestBookableDate);
    usingFBD = true;
  } else {
    windowDays = parseInt(watch.windowDays) || defaultDays;
  }

  const todayDate = new Date(today + 'T12:00:00');

  let datesToCheck = [];
  if (Array.isArray(watch.dayPriority) && watch.dayPriority.length > 0) {
    for (const weekday of watch.dayPriority) {
      const d = dateInRange(watch.date, numDays, weekday);
      if (d) datesToCheck.push(d);
    }
  } else {
    for (let i = 0; i < numDays; i++) {
      const checkDate = i === 0 ? watch.date : addDays(watch.date, i);
      if (Array.isArray(watch.allowedWeekdays) && watch.allowedWeekdays.length < 7) {
        const dow = new Date(checkDate + 'T12:00:00').getDay();
        if (!watch.allowedWeekdays.includes(dow)) continue;
      }
      datesToCheck.push(checkDate);
    }
  }

  if (Array.isArray(watch.excludedDates) && watch.excludedDates.length > 0) {
    datesToCheck = datesToCheck.filter(d => !watch.excludedDates.includes(d));
  }

  for (const checkDate of datesToCheck) {
    const targetDate = new Date(checkDate + 'T12:00:00');
    const windowOpens = new Date(targetDate);
    windowOpens.setDate(windowOpens.getDate() - windowDays);

    if (todayDate >= windowOpens) {
      return { open: true, matchedDate: checkDate };
    }
  }

  const firstTarget = new Date(watch.date + 'T12:00:00');
  const firstWindowOpens = new Date(firstTarget);
  firstWindowOpens.setDate(firstWindowOpens.getDate() - windowDays);
  const daysUntilOpen = Math.ceil((firstWindowOpens - todayDate) / (1000 * 60 * 60 * 24));
  return { open: false, daysUntilOpen, windowDays, usingFBD };
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

  // Cooldown: this button exists to verify a watch is configured correctly,
  // not to snipe reservations by hammering it. Some platforms (OpenTable)
  // cost real money per check, so a per-watch cooldown protects against
  // both abuse and accidental runaway costs.
  const COOLDOWN_MS = 60 * 1000;
  const lastCheckedAt = watch.lastManualCheckAt?.toDate ? watch.lastManualCheckAt.toDate() : null;
  if (lastCheckedAt) {
    const elapsed = Date.now() - lastCheckedAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      const waitSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({
        watchId,
        restaurant: watch.restaurant,
        available: false,
        cooldown: true,
        reason: `This is a setup-check, not a live sniper — please wait ${waitSeconds}s between checks.`,
        waitSeconds,
      });
    }
  }

  let result = { available: false, reason: 'Unknown platform' };

  if (watch.platform === 'resy') {
    result = await checkResy(watch);

  } else if (watch.platform === 'opentable') {
    const w = checkWindowDaysRange(watch, today, 30);
    if (w.open && process.env.APIFY_API_TOKEN) {
      result = await checkOpenTableReal(watch);
      if (result.confirmedRestaurantId && !watch.openTableRestaurantId) {
        await db.collection('watches').doc(watch.id).update({ openTableRestaurantId: result.confirmedRestaurantId });
      }
    } else if (w.open) {
      result = { available: true, reason: 'Booking window is open (real-time check not configured — add APIFY_API_TOKEN)' };
    } else {
      result = { available: false, reason: `Window opens in ${w.daysUntilOpen} day${w.daysUntilOpen === 1 ? '' : 's'} (${w.windowDays}-day advance booking)` };
    }

  } else if (watch.platform === 'thefork') {
    const w = checkWindowDaysRange(watch, today, 60);
    result = w.open
      ? { available: true, reason: 'Booking window is open' }
      : { available: false, reason: `Window opens in ${w.daysUntilOpen} day${w.daysUntilOpen === 1 ? '' : 's'} (${w.windowDays}-day advance booking)` };

  } else if (watch.platform === 'sevenrooms') {
    result = await checkSevenRooms(watch);
    if (result.confirmedSlug && !watch.venueSlug) {
      await db.collection('watches').doc(watch.id).update({ venueSlug: result.confirmedSlug });
    }
  }

  await db.collection('watches').doc(watch.id).update({ lastManualCheckAt: new Date() });

  return res.status(200).json({
    watchId,
    restaurant: watch.restaurant,
    checkedAt: new Date().toISOString(),
    ...result,
  });
}
