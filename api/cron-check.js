import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { checkResy } from './check-resy.js';
import { checkSevenRooms } from './check-sevenrooms.js';
import { checkOpenTableReal } from './check-opentable-mcp.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

const db = getFirestore();
const resend = new Resend(process.env.RESEND_API_KEY);

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
  const todayDate = new Date(today + 'T12:00:00');

  let leadDays;
  if (watch.furthestBookableDate && watch.furthestBookableObservedAt) {
    leadDays = daysBetween(watch.furthestBookableObservedAt, watch.furthestBookableDate);
  } else {
    leadDays = parseInt(watch.windowDays) || defaultDays;
  }

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
    windowOpens.setDate(windowOpens.getDate() - leadDays);
    if (todayDate >= windowOpens) {
      return { open: true, matchedDate: checkDate };
    }
  }
  return { open: false };
}

function getCheckIntervalDays(watch, today) {
  let referenceGapDays;

  if (watch.furthestBookableDate && watch.furthestBookableObservedAt) {
    const leadDays = daysBetween(watch.furthestBookableObservedAt, watch.furthestBookableDate);
    const predictedOpenDate = addDays(watch.date, -leadDays);
    referenceGapDays = daysBetween(today, predictedOpenDate);

    if (referenceGapDays > 21) return 7;
    if (referenceGapDays > 7) return 3;
    return 1;
  }

  referenceGapDays = daysBetween(today, watch.date);
  if (referenceGapDays > 30) return 7;
  if (referenceGapDays > 7) return 4;
  return 1;
}

function isCheckDueToday(watch, today) {
  const interval = getCheckIntervalDays(watch, today);
  const last = watch.lastAutoCheckedAt?.toDate ? watch.lastAutoCheckedAt.toDate() : null;
  if (!last) return true;
  const lastDateStr = last.toISOString().split('T')[0];
  const elapsedDays = daysBetween(lastDateStr, today);
  return elapsedDays >= interval;
}

async function processWatch(watch, today) {
  try {
    let result = { available: false };

    if (watch.platform === 'resy') {
      result = await checkResy(watch);

    } else if (watch.platform === 'opentable') {
      if (process.env.APIFY_API_TOKEN) {
        if (isCheckDueToday(watch, today)) {
          result = await checkOpenTableReal(watch);
          await db.collection('watches').doc(watch.id).update({ lastAutoCheckedAt: new Date() });
          if (result.confirmedRestaurantId && !watch.openTableRestaurantId) {
            await db.collection('watches').doc(watch.id).update({ openTableRestaurantId: result.confirmedRestaurantId });
          }
        } else {
          result = { available: false, reason: 'Not due for a check yet (adaptive schedule)' };
        }
      } else {
        const windowCheck = checkWindowDaysRange(watch, today, 30);
        if (windowCheck.open) {
          const bookingUrl = watch.bookingUrl || `https://www.opentable.com/s?covers=${watch.partySize}&dateTime=${windowCheck.matchedDate}T${watch.timeFrom || '19:00'}&term=${encodeURIComponent(watch.restaurant)}&location=${encodeURIComponent(watch.city)}`;
          result = { available: true, bookingUrl, matchedDate: windowCheck.matchedDate, windowJustOpened: true, reason: 'Booking window is open (real-time check not configured)' };
        } else {
          result = { available: false, reason: 'Booking window has not opened yet' };
        }
      }

    } else if (watch.platform === 'thefork') {
      const windowCheck = checkWindowDaysRange(watch, today, 60);
      if (windowCheck.open) {
        result = { available: true, bookingUrl: null, matchedDate: windowCheck.matchedDate, windowJustOpened: true };
      }

    } else if (watch.platform === 'sevenrooms') {
      result = await checkSevenRooms(watch);
      if (result.confirmedSlug && !watch.venueSlug) {
        await db.collection('watches').doc(watch.id).update({ venueSlug: result.confirmedSlug });
      }
    }

    if (result.available) {
      const email = watch.email;

      if (email) {
        const matchedDate = result.matchedDate || watch.date;
        const dateStr = new Date(matchedDate + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });

        if (watch.bookingUrl) result.bookingUrl = watch.bookingUrl;
        const isWindowAlert = result.windowJustOpened;
        const isFlexible = (parseInt(watch.flexDays) || 1) > 1;

        await resend.emails.send({
          from: 'Carpe Cena <noreply@gullivertravels.app>',
          to: email,
          subject: isWindowAlert
            ? `🍽️ Reservations now open: ${watch.restaurant} on ${dateStr}`
            : `🍽️ Book now: ${watch.restaurant} on ${dateStr}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f0e0c; color: #f0ead8;">
              <h1 style="color: #c9a84c; font-size: 24px; margin-bottom: 8px;">Carpe Cena</h1>
              <p style="color: #9a9080; margin-bottom: 24px;">Seize the dinner</p>
              <h2 style="font-size: 20px; margin-bottom: 16px;">
                ${isWindowAlert ? 'Reservations are now open!' : 'A table is available!'}
              </h2>
              <p style="font-size: 16px; margin-bottom: 8px;"><strong>${watch.restaurant}</strong></p>
              <p style="color: #9a9080; margin-bottom: 8px;">${watch.city} · ${dateStr} · ${watch.partySize} guests</p>
              ${isFlexible ? `<p style="color: #8a6f2e; font-size: 13px; margin-bottom: 16px;">Matched from your flexible ${watch.flexDays}-day window</p>` : ''}
              ${result.bookingUrl ? `
                <a href="${result.bookingUrl}" style="display: inline-block; background: #c9a84c; color: #0f0e0c; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: sans-serif; margin-top: 8px;">
                  Book Now →
                </a>
              ` : `<p style="color: #c9a84c;">Head to ${watch.platform} to book now.</p>`}
            </div>
          `
        });
      }

      await db.collection('watches').doc(watch.id).update({
        status: 'available',
        matchedDate: result.matchedDate || watch.date,
        matchedTime: result.matchedTime || null,
      });

      return { id: watch.id, restaurant: watch.restaurant, available: true };
    } else {
      await db.collection('watches').doc(watch.id).update({ lastCheckReason: result.reason || 'No availability found' });
return { id: watch.id, restaurant: watch.restaurant, available: false, reason: result.reason };
    }
  } catch (err) {
    return { id: watch.id, restaurant: watch.restaurant, available: false, error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET &&
      req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];

  const snap = await db.collection('watches')
    .where('status', '==', 'watching')
    .get();

  const watches = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(w => w.date >= today);

  const results = await Promise.all(watches.map(watch => processWatch(watch, today)));

  return res.status(200).json({ checked: watches.length, results });
}