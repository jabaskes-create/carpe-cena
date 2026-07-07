import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { checkResy } from './check-resy.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

const db = getFirestore();
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  console.log('Headers received:', JSON.stringify(req.headers));
  console.log('CRON_SECRET env:', process.env.CRON_SECRET);
  
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const today = new Date().toISOString().split('T')[0];

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
    } else if (watch.platform === 'thefork') {
      const targetDate = new Date(watch.date + 'T12:00:00');
      const windowDays = parseInt(watch.theforkWindowDays) || 60;
      const windowOpens = new Date(targetDate);
      windowOpens.setDate(windowOpens.getDate() - windowDays);
      const todayDate = new Date(today + 'T12:00:00');
      if (todayDate >= windowOpens) {
        result = { available: true, bookingUrl: null, windowJustOpened: true };
      }
    }
    // OpenTable, SevenRooms, Tock — coming next session

    if (result.available) {
      const userDoc = await db.collection('users').doc(watch.uid).get();
      const email = userDoc.data()?.email || watch.email;

      if (email) {
        const dateStr = new Date(watch.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });

        await resend.emails.send({
          from: 'Carpe Cena <noreply@yourdomain.com>',
          to: email,
          subject: `🍽️ Book now: ${watch.restaurant} on ${dateStr}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f0e0c; color: #f0ead8;">
              <h1 style="color: #c9a84c; font-size: 24px; margin-bottom: 8px;">Carpe Cena</h1>
              <p style="color: #9a9080; margin-bottom: 24px;">Seize the dinner</p>
              <h2 style="font-size: 20px; margin-bottom: 16px;">A table is available!</h2>
              <p style="font-size: 16px; margin-bottom: 8px;"><strong>${watch.restaurant}</strong></p>
              <p style="color: #9a9080; margin-bottom: 24px;">${watch.city} · ${dateStr} · ${watch.partySize} guests</p>
              ${result.bookingUrl ? `
                <a href="${result.bookingUrl}" style="display: inline-block; background: #c9a84c; color: #0f0e0c; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: sans-serif;">
                  Book Now →
                </a>
              ` : `<p style="color: #c9a84c;">Head to ${watch.platform} to book now.</p>`}
            </div>
          `
        });
      }

      await db.collection('watches').doc(watch.id).update({ status: 'available' });
      results.push({ id: watch.id, restaurant: watch.restaurant, available: true });
    } else {
      results.push({ id: watch.id, restaurant: watch.restaurant, available: false });
    }
  }

  return res.status(200).json({ checked: watches.length, results });
}
