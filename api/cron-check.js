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

// For window-based platforms (OpenTable, TheFork): checks each date in the
// flexible range and returns the earliest one whose booking window has opened
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
  return { open: false };
}

export default async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];
  console.log('Today:', today);

  const snap = await db.collection('watches')
    .where('status', '==', 'watching')
    .get();

  const watches = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(w => w.date >= today);

  console.log(`Checking ${watches.length} active watches`);

  const results = [];

  for (const watch of watches) {
    let result = { available: false };

    if (watch.platform === 'resy') {
      result = await checkResy(watch);

    } else if (watch.platform === 'opentable') {
      // Gate the paid real-availability check behind the free window heuristic —
      // no point spending $0.05/check on dates where the booking window
      // almost certainly hasn't opened yet.
      const windowCheck = checkWindowDaysRange(watch, today, 30);

      if (windowCheck.open && process.env.APIFY_API_TOKEN) {
        result = await checkOpenTableReal(watch);
        if (result.confirmedRestaurantId && !watch.openTableRestaurantId) {
          await db.collection('watches').doc(watch.id).update({ openTableRestaurantId: result.confirmedRestaurantId });
        }
      } else if (windowCheck.open) {
        // No Apify token configured — fall back to the old window-only signal
        const bookingUrl = watch.bookingUrl || `https://www.opentable.com/s?covers=${watch.partySize}&dateTime=${windowCheck.matchedDate}T${watch.timeFrom || '19:00'}&term=${encodeURIComponent(watch.restaurant)}&location=${encodeURIComponent(watch.city)}`;
        result = { available: true, bookingUrl, matchedDate: windowCheck.matchedDate, windowJustOpened: true, reason: 'Booking window is open (real-time check not configured)' };
      } else {
        result = { available: false, reason: 'Booking window has not opened yet' };
      }

    } else if (watch.platform === 'thefork') {
      const windowCheck = checkWindowDaysRange(watch, today, 60);
      if (windowCheck.open) {
        result = { available: true, bookingUrl: null, matchedDate: windowCheck.matchedDate, windowJustOpened: true };
      }

    } else if (watch.platform === 'sevenrooms') {
      result = await checkSevenRooms(watch);
      // If we successfully guessed the venue slug, save it so future checks don't have to guess
      if (result.confirmedSlug && !watch.venueSlug) {
        await db.collection('watches').doc(watch.id).update({ venueSlug: result.confirmedSlug });
      }
    }
    // Tock — coming next session

    if (result.available) {
      const email = watch.email;

      if (email) {
        const matchedDate = result.matchedDate || watch.date;
        const dateStr = new Date(matchedDate + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });

        // Use manually entered booking URL if provided
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

      await db.collection('watches').doc(watch.id).update({ status: 'available', matchedDate: result.matchedDate || watch.date });
      results.push({ id: watch.id, restaurant: watch.restaurant, available: true });
    } else {
      results.push({ id: watch.id, restaurant: watch.restaurant, available: false });
    }
  }

  return res.status(200).json({ checked: watches.length, results });
}