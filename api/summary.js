import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

const db = getFirestore();
const resend = new Resend(process.env.RESEND_API_KEY);

// Distribute N sends evenly across 7 days of the week.
// e.g. freq=3 → days [0, 2, 4] (Sun, Tue, Thu)
//      freq=2 → days [0, 3] (Sun, Thu)
//      freq=7 → days [0,1,2,3,4,5,6]
function getSendDays(freq) {
  if (freq >= 7) return [0, 1, 2, 3, 4, 5, 6];
  const days = [];
  for (let i = 0; i < freq; i++) {
    days.push(Math.round((i * 7) / freq));
  }
  return days;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T12:00:00');
  const b = new Date(dateStrB + 'T12:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

const PLATFORM_LABELS = {
  resy: 'Resy',
  opentable: 'OpenTable',
  sevenrooms: 'SevenRooms',
  thefork: 'TheFork',
};

export default async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET &&
      req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];
  const todayDow = new Date(today + 'T12:00:00').getDay(); // 0=Sun, 6=Sat

  // Load all users with summary preferences
  const usersSnap = await db.collection('users').get();
  const sent = [];

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const freq = user.summaryFrequency || 0;
    if (!freq || !user.email) continue;

    const sendDays = getSendDays(freq);
    if (!sendDays.includes(todayDow)) continue;

    // Load this user's active watches
    const watchesSnap = await db.collection('watches')
      .where('uid', '==', userDoc.id)
      .where('status', '==', 'watching')
      .get();

    const watches = watchesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(w => w.date >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (watches.length === 0) continue;

    // Build email rows
    const rows = watches.map(w => {
      const daysLeft = daysBetween(today, w.date);
      const dateStr = new Date(w.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
      });
      const endDate = w.flexDays > 1
        ? (() => {
            const end = new Date(w.date + 'T12:00:00');
            end.setDate(end.getDate() + w.flexDays - 1);
            return ' – ' + end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          })()
        : '';
      const platform = PLATFORM_LABELS[w.platform] || w.platform;
      const lastResult = w.lastCheckReason || 'Not yet checked';
      const urgency = daysLeft <= 7 ? '#ff8a75' : daysLeft <= 14 ? '#c9a84c' : '#9a9080';

      return `
        <tr>
          <td style="padding: 12px 8px; border-bottom: 1px solid #2a2820;">
            <strong style="color: #f0ead8;">${w.restaurant}</strong><br>
            <span style="color: #9a9080; font-size: 12px;">${w.city} · ${platform} · ${w.partySize} guests</span>
          </td>
          <td style="padding: 12px 8px; border-bottom: 1px solid #2a2820; color: #9a9080; font-size: 13px;">
            ${dateStr}${endDate}
          </td>
          <td style="padding: 12px 8px; border-bottom: 1px solid #2a2820; font-size: 13px; color: ${urgency}; font-weight: 600;">
            ${daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft} days`}
          </td>
          <td style="padding: 12px 8px; border-bottom: 1px solid #2a2820; color: #9a9080; font-size: 12px;">
            ${lastResult}
          </td>
        </tr>
      `;
    }).join('');

    await resend.emails.send({
      from: 'Carpe Cena <noreply@gullivertravels.app>',
      to: user.email,
      subject: `🍽️ Carpe Cena — ${watches.length} watch${watches.length === 1 ? '' : 'es'} active`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #0f0e0c; color: #f0ead8;">
          <h1 style="color: #c9a84c; font-size: 24px; margin-bottom: 4px;">Carpe Cena</h1>
          <p style="color: #9a9080; margin-bottom: 28px; font-size: 13px;">Seize the dinner · Summary for ${new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 8px; color: #9a9080; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid #3a3830;">Restaurant</th>
                <th style="text-align: left; padding: 8px; color: #9a9080; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid #3a3830;">Date</th>
                <th style="text-align: left; padding: 8px; color: #9a9080; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid #3a3830;">In</th>
                <th style="text-align: left; padding: 8px; color: #9a9080; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid #3a3830;">Last check</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <p style="margin-top: 24px; font-size: 12px; color: #5a5450;">
            <a href="https://carpe-cena.vercel.app" style="color: #c9a84c;">Open Carpe Cena →</a>
          </p>
        </div>
      `
    });

    sent.push(user.email);
  }

  return res.status(200).json({ date: today, sent });
}
