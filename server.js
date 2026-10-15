'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 4173;
const ON_VERCEL = Boolean(process.env.VERCEL);
const DATA = ON_VERCEL ? path.join(os.tmpdir(), 'payme-data.json') : path.join(__dirname, 'data.json');

function projectRoot() {
  const candidates = [__dirname, process.cwd(), path.join(__dirname, '..')];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html')) && fs.existsSync(path.join(dir, 'app.js'))) return dir;
  }
  return __dirname;
}

const ROOT = projectRoot();
const SCHEMA = 1;
const EVENT_TYPES = [
  'Birthday Party',
  'Wedding',
  'Corporate Event',
  'Private Event',
  'Engagement Party',
  'Baby Shower',
  'Anniversary',
  'Other'
];
const WAITING = new Set(['sent', 'viewed', 'pending_signature', 'deposit_due', 'accepted']);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function token() {
  return crypto.randomBytes(6).toString('hex');
}

function str(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function dollars(value) {
  return Math.round(value) / 100;
}

function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayStr(date);
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  if (mins === 0) return 0;
  return Math.round((mins / 60) * 100) / 100;
}

function money(value) {
  return (Number(value) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function prettyDate(iso) {
  if (!iso) return '';
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function prettyTime(value) {
  if (!value) return '';
  const [h, m] = value.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function firstName(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'there';
  if (clean.includes('&')) return clean;
  return clean.split(/\s+/)[0];
}

function clientById(db, clientId) {
  return db.clients.find((client) => client.id === clientId) || null;
}

function clientName(db, clientId) {
  return clientById(db, clientId)?.name || db.business.name;
}

function publicBusiness(db) {
  return {
    name: db.business.name,
    slug: db.business.slug,
    owner: db.business.owner,
    email: db.business.email,
    phone: db.business.phone,
    city: db.business.city,
    reviewUrl: db.business.reviewUrl,
    tagline: db.business.tagline
  };
}

function renderContract(db) {
  return db.contract.body.replaceAll('{{business}}', db.business.name);
}

function quote(db, input) {
  const pkg = db.packages.find((item) => item.id === input.packageId);
  if (!pkg) fail(400, 'Choose a package.');
  if (!/^\d{2}:\d{2}$/.test(input.startTime || '') || !/^\d{2}:\d{2}$/.test(input.endTime || '')) {
    fail(400, 'Enter a start and end time.');
  }
  const hours = hoursBetween(input.startTime, input.endTime);
  if (!(hours > 0)) fail(400, 'End time has to be after the start time.');

  let billableHours = hours;
  let minimumApplied = false;
  if (pkg.pricing === 'hourly' && hours < (pkg.minimumHours || 1)) {
    billableHours = pkg.minimumHours || 1;
    minimumApplied = true;
  }

  const packageCents = pkg.pricing === 'hourly'
    ? Math.round(cents(pkg.price) * billableHours)
    : cents(pkg.price);

  const rawAddons = input.addons || (input.addonIds || []).map((addonId) => ({ id: addonId, qty: 1 }));
  const addonLines = [];
  for (const selection of rawAddons) {
    const addon = db.addons.find((item) => item.id === (selection.id || selection));
    if (!addon) continue;
    const qty = Math.max(1, Math.min(20, Number(selection.qty) || 1));
    addonLines.push({
      id: addon.id,
      name: addon.name,
      detail: addon.detail,
      qty,
      amountCents: cents(addon.price) * qty,
      amount: (cents(addon.price) * qty) / 100
    });
  }

  const guests = Math.max(0, Math.min(1000, Number(input.guests) || 0));
  const miles = Math.max(0, Math.min(500, Math.round((Number(input.miles) || 0) * 10) / 10));
  const settings = db.settings;
  const autoLines = [];
  if (guests > settings.bartenderThreshold) {
    autoLines.push({
      key: 'bartender',
      name: `Additional bartender (required for ${settings.bartenderThreshold + 1}+ guests)`,
      amountCents: cents(settings.bartenderFee),
      amount: Number(settings.bartenderFee)
    });
  }
  if (miles > 0) {
    const travelCents = Math.round(cents(settings.travelPerMile) * miles);
    autoLines.push({
      key: 'travel',
      name: `Travel fee (${Number.isInteger(miles) ? miles : miles.toFixed(1)} miles)`,
      amountCents: travelCents,
      amount: travelCents / 100
    });
  }

  const subtotalCents = packageCents
    + addonLines.reduce((sum, line) => sum + line.amountCents, 0)
    + autoLines.reduce((sum, line) => sum + line.amountCents, 0);
  const gratuityCents = Math.round(subtotalCents * settings.gratuityPercent / 100);
  const totalCents = subtotalCents + gratuityCents;
  let depositCents = Math.round(totalCents * settings.depositPercent / 100);
  let customDeposit = false;
  if (input.depositAmount != null && input.depositAmount !== '') {
    depositCents = cents(input.depositAmount);
    customDeposit = true;
    if (depositCents < 0 || depositCents > totalCents) fail(400, 'Deposit has to be between zero and the event total.');
  }

  return {
    packageId: pkg.id,
    packageName: pkg.name,
    pricing: pkg.pricing,
    hourlyRate: pkg.pricing === 'hourly' ? pkg.price : null,
    includedHours: pkg.includedHours || null,
    hours,
    billableHours,
    minimumApplied,
    packageCents,
    packageTotal: packageCents / 100,
    addonLines,
    autoLines,
    subtotalCents,
    subtotal: subtotalCents / 100,
    gratuityPercent: settings.gratuityPercent,
    gratuityCents,
    gratuity: gratuityCents / 100,
    totalCents,
    total: totalCents / 100,
    depositPercent: customDeposit ? null : settings.depositPercent,
    customDeposit,
    depositCents,
    deposit: depositCents / 100,
    balanceCents: totalCents - depositCents,
    balance: (totalCents - depositCents) / 100,
    guests,
    miles,
    bartenderAdded: autoLines.some((line) => line.key === 'bartender'),
    travelAdded: autoLines.some((line) => line.key === 'travel'),
    dateTaken: input.date ? dateTaken(db, input.date, input.ignoreId) : false
  };
}

function setDepositDue(q, amount) {
  const depositCents = cents(amount);
  if (depositCents < 0 || depositCents > q.totalCents) fail(400, 'That deposit is larger than the event total.');
  q.depositCents = depositCents;
  q.deposit = depositCents / 100;
  q.balanceCents = q.totalCents - depositCents;
  q.balance = q.balanceCents / 100;
  q.depositPercent = null;
  q.customDeposit = true;
  return q;
}

function setBalanceDue(q, amount) {
  const balanceCents = cents(amount);
  if (balanceCents < 0 || balanceCents > q.totalCents) fail(400, 'That balance is larger than the event total.');
  q.balanceCents = balanceCents;
  q.balance = balanceCents / 100;
  q.depositCents = q.totalCents - balanceCents;
  q.deposit = q.depositCents / 100;
  q.depositPercent = null;
  q.customDeposit = true;
  return q;
}

function dateTaken(db, date, ignoreId) {
  return db.bookings.some((booking) => booking.date === date && booking.id !== ignoreId && booking.status !== 'cancelled');
}

function payRecord(spec) {
  return {
    id: spec.id || id('pay'),
    clientId: spec.clientId || null,
    bookingId: spec.bookingId || null,
    proposalId: spec.proposalId || null,
    eventName: spec.eventName,
    type: spec.type,
    label: spec.label,
    amountCents: spec.amountCents,
    amount: spec.amountCents / 100,
    status: spec.status,
    method: spec.method || null,
    brand: spec.brand || null,
    last4: spec.last4 || null,
    paidAt: spec.paidAt || null,
    createdAt: spec.createdAt || spec.paidAt || todayStr()
  };
}

function seed() {
  const db = {
    schema: SCHEMA,
    sessions: [],
    account: {
      name: 'Danielle McCray',
      firstName: 'Danielle',
      email: 'danielle@littlemixxy.com',
      password: 'mixxy'
    },
    business: {
      name: 'Little Mixxy',
      slug: 'littlemixxy',
      owner: 'Danielle McCray',
      email: 'hello@littlemixxy.com',
      phone: '(678) 462-1651',
      city: 'Atlanta, GA',
      reviewUrl: 'https://g.page/littlemixxy/review',
      tagline: 'A mobile bar for the moments worth gathering around.'
    },
    settings: {
      depositPercent: 50,
      gratuityPercent: 18,
      bartenderThreshold: 60,
      bartenderFee: 225,
      travelPerMile: 2
    },
    contract: {
      title: 'Little Mixxy Event Services Agreement',
      points: [
        'Service terms & conditions',
        'Cancellation policy',
        'Payment policy',
        'Damage policy'
      ],
      body: `LITTLE MIXXY EVENT SERVICES AGREEMENT

This agreement is between {{business}} ("Studio") and the client named on the proposal or booking.

1. Services
The Studio will provide the bar package, staffing, and add-ons listed on the accepted proposal for the event date, time, and location stated there. Setup and breakdown are included.

2. Hours
Event hours are calculated from the start and end times. Hourly packages are billed for the greater of the actual hours and the package minimum.

3. Staffing
An additional bartender is required when the guest count is over 60. That fee is added automatically.

4. Travel
Travel is charged per mile from the Studio's Atlanta base to the event location.

5. Payment
A deposit reserves the date. The remaining balance is due before the event. Funds are collected by the Studio's payment provider. PayMe does not process or hold funds.

6. Cancellation
The date is held once the deposit is paid. Cancellations within 14 days of the event forfeit the deposit. Earlier cancellations receive a credit toward a future date within 12 months.

7. Damage and conduct
The client is responsible for guest conduct and for loss or damage to Studio equipment beyond normal wear.

8. Agreement
Signing confirms the event details, the pricing, and these terms.`
    },
    packages: [
      {
        id: 'pkg_mini',
        name: 'Mini Mixxy',
        tagline: 'Satellite bar',
        description: 'A tight, polished bar for smaller rooms and shorter celebrations.',
        price: 150,
        pricing: 'hourly',
        minimumHours: 2,
        includedHours: null,
        image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=70',
        tone: '#ffd0e2',
        highlights: ['Professional bartender', 'Cups, napkins, straws, ice, and garnishes', 'Standard décor', 'Setup and breakdown', 'Indoor or outdoor service']
      },
      {
        id: 'pkg_pg',
        name: 'Mixxy PG',
        tagline: 'Mobile beverage cart',
        description: 'A rolling cart built for courtyards, porches, and cocktail hours.',
        price: 600,
        pricing: 'flat',
        minimumHours: null,
        includedHours: 3,
        image: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=70',
        tone: '#ffd8c8',
        highlights: ['Beverage cart styling', 'Bartender included', '3 hour service', 'Setup and breakdown']
      },
      {
        id: 'pkg_classic',
        name: 'Mixxy Classic',
        tagline: '4 taps · full bar',
        description: 'The house package. Four taps and a full setup for the center of the party.',
        price: 875,
        pricing: 'flat',
        minimumHours: null,
        includedHours: 3,
        image: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=70',
        tone: '#ffc2dc',
        highlights: ['4 taps', '3 hour service', 'Bartender included', 'Standard décor', 'Setup and breakdown']
      },
      {
        id: 'pkg_premium',
        name: 'Mixxy Premium',
        tagline: '6 taps · premium pours',
        description: 'Six taps and a longer premium list for weddings and large rooms.',
        price: 975,
        pricing: 'flat',
        minimumHours: null,
        includedHours: 3,
        image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=70',
        tone: '#f3c6e8',
        highlights: ['6 taps', 'Premium pour list', '3 hour service', 'Bartender included', 'Elevated décor']
      },
      {
        id: 'pkg_wall',
        name: 'Tap & Go Wall',
        tagline: 'Self-serve tap wall',
        description: 'A tap wall guests can gather around, staffed and styled by the studio.',
        price: 750,
        pricing: 'flat',
        minimumHours: null,
        includedHours: 3,
        image: 'https://images.unsplash.com/photo-1574096079513-d8259312b785?auto=format&fit=crop&w=900&q=70',
        tone: '#f7c3d6',
        highlights: ['Self-serve tap wall', '3 hour service', 'Attendant included', 'Setup and breakdown']
      }
    ],
    addons: [
      { id: 'add_cups', name: 'Custom Cups', detail: 'Set of 100', price: 75 },
      { id: 'add_napkins', name: 'Custom Napkins', detail: 'Set of 100', price: 50 },
      { id: 'add_sign', name: 'Custom Menu Sign', detail: 'Printed menu', price: 50 },
      { id: 'add_menu', name: 'Custom Drink Menu', detail: 'Designed for your event', price: 75 },
      { id: 'add_decor', name: 'Extra Décor', detail: 'Florals and styling', price: 100 },
      { id: 'add_lights', name: 'Uplighting', detail: 'Room wash', price: 150 },
      { id: 'add_balloons', name: 'Balloon Décor', detail: 'Standard set', price: 150 },
      { id: 'add_branded', name: 'Custom Branded Cups', detail: 'Set of 500', price: 450 }
    ],
    clients: [],
    proposals: [],
    bookings: [],
    payments: [],
    messages: []
  };

  const people = [
    ['cli_danielle', 'Danielle Carter', 'danielle.carter@gmail.com', '(404) 555-0142'],
    ['cli_grace', 'Grace Thomas', 'grace.thomas@gmail.com', '(404) 555-0174'],
    ['cli_kevin', 'Kevin Lee', 'kevin.lee@gmail.com', '(678) 555-0118'],
    ['cli_alyssa', 'Alyssa Green', 'alyssa.green@gmail.com', '(404) 555-0190'],
    ['cli_taylorco', 'Taylor & Co.', 'taylor@taylorco.com', '(404) 555-0166'],
    ['cli_taylorbrown', 'Taylor Brown', 'taylor.brown@gmail.com', '(678) 555-0133'],
    ['cli_brianna', 'Brianna Thomas', 'brianna.thomas@gmail.com', '(404) 555-0188'],
    ['cli_jasmine', 'Jasmine Porter', 'jasmine.porter@gmail.com', '(404) 555-0121'],
    ['cli_marcus_hill', 'Marcus Hill', 'marcus.hill@gmail.com', '(678) 555-0104'],
    ['cli_sarah', 'Sarah Johnson', 'sarah.johnson@gmail.com', '(404) 555-0155'],
    ['cli_haley', 'Haley & Kevin', 'haleyandkevin@gmail.com', '(404) 555-0194'],
    ['cli_naffey', 'Naffey Sugrim', 'naffey@gmail.com', '(678) 555-0160'],
    ['cli_jen', 'Jen Carter', 'jencarter@gmail.com', '(404) 555-0108'],
    ['cli_marcus_lee', 'Marcus Lee', 'marcuslee@delta.com', '(404) 555-0177'],
    ['cli_delta', 'Delta Air Lines', 'events@delta.com', '(404) 555-0100'],
    ['cli_emily', 'Emily Carter', 'emily.carter@gmail.com', '(678) 555-0144'],
    ['cli_jessica', 'Jessica Walker', 'jessica.walker@gmail.com', '(404) 555-0129'],
    ['cli_ariana', 'Ariana Cole', 'ariana.cole@gmail.com', '(404) 555-0181'],
    ['cli_mj', 'Marcus & Jen', 'marcusandjen@gmail.com', '(678) 555-0199'],
    ['cli_cameron', 'Cameron Blake', 'cameron.blake@gmail.com', '(404) 555-0112']
  ];
  db.clients = people.map(([cid, name, email, phone], index) => ({
    id: cid,
    name,
    email,
    phone,
    company: name === 'Delta Air Lines' ? 'Delta Air Lines' : (name === 'Taylor & Co.' ? 'Taylor & Co.' : ''),
    notes: '',
    createdAt: addDays('2026-10-15', -30 + index)
  }));

  function makeProposal(spec) {
    const priced = quote(db, spec);
    if (spec.customDeposit != null) setDepositDue(priced, spec.customDeposit);
    return {
      id: spec.id,
      token: spec.token,
      clientId: spec.clientId,
      eventName: spec.eventName,
      eventType: spec.eventType,
      date: spec.date,
      startTime: spec.startTime,
      endTime: spec.endTime,
      location: spec.location,
      miles: spec.miles || 0,
      guests: spec.guests,
      notes: spec.notes || '',
      packageId: spec.packageId,
      addonIds: priced.addonLines.map((line) => line.id),
      quote: priced,
      status: spec.status,
      signature: null,
      signedAt: null,
      sentVia: spec.sentVia || 'text',
      activityAt: spec.activityAt,
      createdAt: spec.activityAt,
      bookingId: null
    };
  }

  function makeBooking(spec) {
    const priced = quote(db, spec);
    if (spec.customDeposit != null) setDepositDue(priced, spec.customDeposit);
    if (spec.customBalance != null) setBalanceDue(priced, spec.customBalance);
    return {
      id: spec.id,
      token: spec.token,
      clientId: spec.clientId,
      proposalId: null,
      source: 'studio',
      eventName: spec.eventName,
      eventType: spec.eventType,
      date: spec.date,
      startTime: spec.startTime,
      endTime: spec.endTime,
      location: spec.location,
      miles: spec.miles || 0,
      guests: spec.guests,
      notes: spec.notes || '',
      packageId: spec.packageId,
      addonIds: priced.addonLines.map((line) => line.id),
      quote: priced,
      status: spec.status,
      signature: spec.signature || null,
      signedAt: spec.signedAt || null,
      createdAt: spec.createdAt
    };
  }

  db.proposals = [
    makeProposal({ id: 'prop_jasmine', token: 'jasmine', clientId: 'cli_jasmine', eventName: "Jasmine's Celebration", eventType: 'Birthday Party', date: '2026-10-02', startTime: '18:00', endTime: '21:00', location: 'Atlanta, GA', miles: 8, guests: 50, packageId: 'pkg_classic', status: 'pending_signature', activityAt: '2026-10-02' }),
    makeProposal({ id: 'prop_grace', token: 'grace', clientId: 'cli_grace', eventName: "Grace's Cocktail Hour", eventType: 'Private Event', date: '2026-10-01', startTime: '18:00', endTime: '21:00', location: 'Atlanta, GA', miles: 0, guests: 40, packageId: 'pkg_mini', status: 'sent', activityAt: '2026-10-01' }),
    makeProposal({ id: 'prop_marcus', token: 'marcus', clientId: 'cli_marcus_hill', eventName: 'Hill House Warming', eventType: 'Private Event', date: '2026-09-30', startTime: '17:00', endTime: '20:00', location: 'Atlanta, GA', miles: 0, guests: 48, packageId: 'pkg_wall', customDeposit: 750, status: 'deposit_due', activityAt: '2026-09-30' }),
    makeProposal({ id: 'prop_alyssa', token: 'alyssa', clientId: 'cli_alyssa', eventName: "Alyssa's Brunch", eventType: 'Private Event', date: '2026-09-26', startTime: '11:00', endTime: '13:00', location: 'Atlanta, GA', miles: 0, guests: 24, packageId: 'pkg_mini', status: 'viewed', activityAt: '2026-09-26' }),
    makeProposal({ id: 'prop_taylor', token: 'taylor', clientId: 'cli_taylorco', eventName: 'Taylor & Co. Reception', eventType: 'Corporate Event', date: '2026-09-25', startTime: '18:00', endTime: '21:00', location: 'Atlanta, GA', miles: 0, guests: 55, packageId: 'pkg_premium', status: 'pending_signature', activityAt: '2026-09-25' }),
    makeProposal({ id: 'prop_sarah', token: 'sarah', clientId: 'cli_sarah', eventName: "Sarah's Birthday", eventType: 'Birthday Party', date: '2026-11-21', startTime: '18:00', endTime: '21:00', location: 'Atlanta, GA 30326', miles: 25, guests: 75, packageId: 'pkg_classic', addonIds: ['add_cups'], notes: 'Rooftop event. Pink and gold menu.', status: 'sent', activityAt: '2026-09-20', sentVia: 'text' }),
    makeProposal({ id: 'prop_haley', token: 'haley', clientId: 'cli_haley', eventName: 'Haley & Kevin Welcome Party', eventType: 'Engagement Party', date: '2026-11-08', startTime: '16:00', endTime: '19:00', location: 'Decatur, GA', miles: 12, guests: 30, packageId: 'pkg_pg', status: 'viewed', activityAt: '2026-09-18' }),
    makeProposal({ id: 'prop_naffey', token: 'naffey', clientId: 'cli_naffey', eventName: "Naffey's Night", eventType: 'Birthday Party', date: '2026-12-05', startTime: '19:00', endTime: '22:00', location: 'Atlanta, GA', miles: 30, guests: 100, packageId: 'pkg_wall', status: 'pending_signature', activityAt: '2026-09-12' }),
    makeProposal({ id: 'prop_emily', token: 'emily', clientId: 'cli_emily', eventName: 'Emily Carter Dinner', eventType: 'Private Event', date: '2026-08-22', startTime: '18:00', endTime: '21:00', location: 'Atlanta, GA', miles: 4, guests: 20, packageId: 'pkg_mini', status: 'declined', activityAt: '2026-09-01' })
  ];

  db.bookings = [
    makeBooking({ id: 'bok_bday', token: 'bday16', clientId: 'cli_danielle', eventName: "Danielle's Birthday", eventType: 'Birthday Party', date: '2026-10-16', startTime: '20:30', endTime: '23:30', location: '123 Peachtree St, Atlanta, GA', miles: 6, guests: 40, packageId: 'pkg_classic', status: 'deposit_paid', createdAt: '2026-09-20', signedAt: '2026-09-20' }),
    makeBooking({ id: 'bok_corp', token: 'corp22', clientId: 'cli_delta', eventName: 'Corporate Event', eventType: 'Corporate Event', date: '2026-10-22', startTime: '18:00', endTime: '21:00', location: 'The St. Regis, Atlanta, GA', miles: 25, guests: 90, packageId: 'pkg_premium', addonIds: ['add_cups', 'add_lights'], customBalance: 1100, status: 'balance_due', createdAt: '2026-06-15', signedAt: '2026-06-15' }),
    makeBooking({ id: 'bok_private', token: 'priv28', clientId: 'cli_brianna', eventName: 'Private Event', eventType: 'Private Event', date: '2026-10-28', startTime: '20:00', endTime: '22:00', location: 'Sandy Springs, GA', miles: 0, guests: 36, packageId: 'pkg_classic', status: 'paid', createdAt: '2026-09-22', signedAt: '2026-09-22' }),
    makeBooking({ id: 'bok_ariana', token: 'ariana02', clientId: 'cli_ariana', eventName: "Ariana's Celebration", eventType: 'Birthday Party', date: '2026-11-02', startTime: '18:30', endTime: '22:30', location: 'Atlanta, GA', miles: 10, guests: 55, packageId: 'pkg_premium', status: 'contract_sent', createdAt: '2026-10-08', signedAt: '2026-10-08' }),
    makeBooking({ id: 'bok_mj', token: 'mj15', clientId: 'cli_mj', eventName: 'Marcus & Jen', eventType: 'Engagement Party', date: '2026-11-15', startTime: '17:00', endTime: '21:00', location: 'Alpharetta, GA', miles: 18, guests: 80, packageId: 'pkg_classic', customDeposit: 600, status: 'deposit_due', createdAt: '2026-10-04' }),
    makeBooking({ id: 'bok_cameron', token: 'cam27', clientId: 'cli_cameron', eventName: 'Blake Welcome Party', eventType: 'Private Event', date: '2026-09-27', startTime: '18:00', endTime: '21:00', location: 'Atlanta, GA', miles: 5, guests: 22, packageId: 'pkg_mini', customBalance: 400, status: 'balance_due', createdAt: '2026-06-12', signedAt: '2026-06-12' })
  ];

  const byId = (list, itemId) => list.find((item) => item.id === itemId);
  const birthday = byId(db.bookings, 'bok_bday');
  const corporate = byId(db.bookings, 'bok_corp');
  const privateEvent = byId(db.bookings, 'bok_private');
  const marcusJen = byId(db.bookings, 'bok_mj');
  const cameron = byId(db.bookings, 'bok_cameron');
  const marcusProposal = byId(db.proposals, 'prop_marcus');

  const extrasBudget = 235300;
  const absorberCents = extrasBudget - birthday.quote.depositCents - privateEvent.quote.totalCents;
  const juneCents = corporate.quote.depositCents + cameron.quote.depositCents;
  const fillerCents = 376000 - juneCents;
  if (absorberCents <= 0 || fillerCents <= 0) fail(500, 'Demo ledger could not be balanced.');

  db.payments = [
    payRecord({ id: 'pay_grace', clientId: 'cli_grace', eventName: 'Garden Party', type: 'balance', label: 'Final Payment', amountCents: 88500, status: 'completed', method: 'card', paidAt: '2026-10-01', brand: 'Visa', last4: '4242' }),
    payRecord({ id: 'pay_danielle_recent', clientId: 'cli_danielle', eventName: 'Welcome Drinks', type: 'deposit', label: 'Deposit Payment (50%)', amountCents: 26550, status: 'completed', method: 'card', paidAt: '2026-09-29', brand: 'Visa', last4: '1881' }),
    payRecord({ id: 'pay_kevin', clientId: 'cli_kevin', eventName: 'Lee Anniversary', type: 'deposit', label: 'Deposit Payment (50%)', amountCents: 37500, status: 'completed', method: 'card', paidAt: '2026-09-29', brand: 'Mastercard', last4: '4444' }),
    payRecord({ id: 'pay_alyssa', clientId: 'cli_alyssa', eventName: 'Brunch Toast', type: 'balance', label: 'Final Payment', amountCents: 35400, status: 'completed', method: 'card', paidAt: '2026-09-28', brand: 'Visa', last4: '4242' }),
    payRecord({ id: 'pay_taylor', clientId: 'cli_taylorbrown', eventName: 'Taylor Dinner', type: 'deposit', label: 'Deposit Payment (50%)', amountCents: 48750, status: 'completed', method: 'card', paidAt: '2026-09-25', brand: 'Visa', last4: '1234' }),
    payRecord({ id: 'pay_private', clientId: 'cli_brianna', bookingId: 'bok_private', eventName: 'Private Event', type: 'full', label: 'Final Payment', amountCents: privateEvent.quote.totalCents, status: 'completed', method: 'card', paidAt: '2026-09-22', brand: 'Visa', last4: '4242' }),
    payRecord({ id: 'pay_bday', clientId: 'cli_danielle', bookingId: 'bok_bday', eventName: "Danielle's Birthday", type: 'deposit', label: 'Deposit Payment (50%)', amountCents: birthday.quote.depositCents, status: 'completed', method: 'card', paidAt: '2026-09-20', brand: 'Visa', last4: '1881' }),
    payRecord({ id: 'pay_absorber', clientId: 'cli_sarah', eventName: 'Rooftop Toast', type: 'balance', label: 'Final Payment', amountCents: absorberCents, status: 'completed', method: 'card', paidAt: '2026-09-18', brand: 'Mastercard', last4: '5454' }),
    payRecord({ id: 'pay_gala', clientId: 'cli_kevin', eventName: 'Summer Gala', type: 'balance', label: 'Final Payment', amountCents: 150000, status: 'completed', method: 'card', paidAt: '2026-09-10', brand: 'Visa', last4: '4444' }),
    payRecord({ id: 'pay_jessica', clientId: 'cli_jessica', eventName: 'Walker Reception', type: 'balance', label: 'Final Payment', amountCents: 130000, status: 'completed', method: 'card', paidAt: '2026-08-28', brand: 'Visa', last4: '4242' }),
    payRecord({ id: 'pay_emily', clientId: 'cli_emily', eventName: 'Carter Garden', type: 'deposit', label: 'Deposit Payment (50%)', amountCents: 120000, status: 'completed', method: 'card', paidAt: '2026-08-20', brand: 'Amex', last4: '0005' }),
    payRecord({ id: 'pay_corp_deposit', clientId: 'cli_delta', bookingId: 'bok_corp', eventName: 'Corporate Event', type: 'deposit', label: 'Deposit', amountCents: corporate.quote.depositCents, status: 'completed', method: 'card', paidAt: '2026-06-15', brand: 'Visa', last4: '4242' }),
    payRecord({ id: 'pay_cameron_deposit', clientId: 'cli_cameron', bookingId: 'bok_cameron', eventName: 'Blake Welcome Party', type: 'deposit', label: 'Deposit', amountCents: cameron.quote.depositCents, status: 'completed', method: 'card', paidAt: '2026-06-12', brand: 'Visa', last4: '4242' }),
    payRecord({ id: 'pay_opening', clientId: null, eventName: 'Earlier 2026 events', type: 'opening', label: 'Opening balance', amountCents: fillerCents, status: 'completed', method: 'manual', paidAt: '2026-05-02' }),
    payRecord({ id: 'pay_corp_balance', clientId: 'cli_delta', bookingId: 'bok_corp', eventName: 'Corporate Event', type: 'balance', label: 'Remaining Balance', amountCents: corporate.quote.balanceCents, status: 'pending', createdAt: '2026-10-01' }),
    payRecord({ id: 'pay_marcus', clientId: 'cli_marcus_hill', proposalId: 'prop_marcus', eventName: 'Hill House Warming', type: 'deposit', label: 'Deposit', amountCents: marcusProposal.quote.depositCents, status: 'pending', createdAt: '2026-09-30' }),
    payRecord({ id: 'pay_mj', clientId: 'cli_mj', bookingId: 'bok_mj', eventName: 'Marcus & Jen', type: 'deposit', label: 'Deposit', amountCents: marcusJen.quote.depositCents, status: 'pending', createdAt: '2026-10-04' }),
    payRecord({ id: 'pay_cameron_balance', clientId: 'cli_cameron', bookingId: 'bok_cameron', eventName: 'Blake Welcome Party', type: 'balance', label: 'Remaining Balance', amountCents: cameron.quote.balanceCents, status: 'pending', createdAt: '2026-09-20' })
  ];

  syncAutomation(db, '2026-10-15');
  verify(db, '2026-10-15');
  return db;
}

function verify(db, today) {
  const snap = stats(db, today);
  const problems = [];
  if (snap.revenueCents !== 1248000) problems.push(`revenue ${snap.revenueCents}`);
  if (snap.trend !== 18) problems.push(`trend ${snap.trend}`);
  if (snap.waiting !== 8) problems.push(`waiting ${snap.waiting}`);
  if (snap.dueCount !== 4) problems.push(`due count ${snap.dueCount}`);
  if (snap.dueCents !== 285000) problems.push(`due ${snap.dueCents}`);
  if (snap.upcomingCount !== 5) problems.push(`upcoming ${snap.upcomingCount}`);
  const grace = db.proposals.find((item) => item.id === 'prop_grace');
  const alyssa = db.proposals.find((item) => item.id === 'prop_alyssa');
  if (grace.quote.totalCents !== 53100) problems.push(`grace ${grace.quote.totalCents}`);
  if (alyssa.quote.totalCents !== 35400) problems.push(`alyssa ${alyssa.quote.totalCents}`);
  const recent = new Set(snap.recentPayments.map((item) => item.name));
  ['Grace Thomas', 'Kevin Lee', 'Danielle Carter', 'Alyssa Green', 'Taylor Brown'].forEach((name) => {
    if (!recent.has(name)) problems.push(`missing payment ${name}`);
  });
  if (problems.length) fail(500, problems.join(', '));
}

function assertMockQuotes(db) {
  const full = quote(db, { packageId: 'pkg_mini', startTime: '18:00', endTime: '21:00', guests: 75, miles: 25, addonIds: ['add_cups'] });
  if (full.totalCents !== 94400 || full.depositCents !== 47200) fail(500, `booking math ${full.totalCents}/${full.depositCents}`);
  const depositOnly = quote(db, { packageId: 'pkg_mini', startTime: '18:00', endTime: '21:00', guests: 75, miles: 0 });
  if (depositOnly.totalCents !== 79650 || depositOnly.depositCents !== 39825) fail(500, `deposit math ${depositOnly.totalCents}/${depositOnly.depositCents}`);
  const sarah = quote(db, { packageId: 'pkg_classic', startTime: '18:00', endTime: '21:00', guests: 75, miles: 25, addonIds: ['add_cups'] });
  if (sarah.totalCents !== 144550 || !sarah.bartenderAdded) fail(500, `sarah math ${sarah.totalCents}`);
}

function stats(db, today = todayStr()) {
  const lastStart = addDays(today, -30);
  const priorStart = addDays(today, -60);
  const completed = db.payments.filter((payment) => payment.status === 'completed');
  const revenueCents = completed.reduce((sum, payment) => sum + payment.amountCents, 0);
  const windowSum = (start, end, inclusiveEnd) => completed.reduce((sum, payment) => {
    const paid = payment.paidAt;
    const afterStart = paid >= start;
    const beforeEnd = inclusiveEnd ? paid <= end : paid < end;
    return afterStart && beforeEnd ? sum + payment.amountCents : sum;
  }, 0);
  const lastCents = windowSum(lastStart, today, true);
  const priorCents = windowSum(priorStart, lastStart, false);
  const trend = priorCents ? Math.round((lastCents - priorCents) / priorCents * 100) : 0;
  const pending = db.payments.filter((payment) => payment.status === 'pending');
  const upcoming = db.bookings
    .filter((booking) => booking.date >= today && booking.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const recentPayments = completed
    .slice()
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.amountCents - a.amountCents)
    .slice(0, 5)
    .map((payment) => ({
      id: payment.id,
      name: clientName(db, payment.clientId),
      label: payment.label,
      eventName: payment.eventName,
      date: payment.paidAt,
      amount: payment.amount,
      status: payment.status
    }));
  const recentProposals = db.proposals
    .slice()
    .sort((a, b) => b.activityAt.localeCompare(a.activityAt))
    .slice(0, 5)
    .map((proposal) => ({
      id: proposal.id,
      name: clientName(db, proposal.clientId),
      eventName: proposal.eventName,
      packageName: proposal.quote.packageName,
      hours: proposal.quote.hours,
      date: proposal.date,
      amount: proposal.quote.total,
      status: proposal.status
    }));
  return {
    revenue: revenueCents / 100,
    revenueCents,
    trend,
    waiting: db.proposals.filter((proposal) => WAITING.has(proposal.status)).length,
    dueCount: pending.length,
    dueCents: pending.reduce((sum, payment) => sum + payment.amountCents, 0),
    due: pending.reduce((sum, payment) => sum + payment.amountCents, 0) / 100,
    upcomingCount: upcoming.length,
    recentPayments,
    recentProposals,
    upcoming: upcoming.map((booking) => ({
      id: booking.id,
      eventName: booking.eventName,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      location: booking.location,
      status: booking.status,
      packageId: booking.packageId
    }))
  };
}

function composeMessage(db, message) {
  const client = clientById(db, message.clientId);
  const booking = db.bookings.find((item) => item.id === message.bookingId) || null;
  const proposal = db.proposals.find((item) => item.id === message.proposalId) || null;
  const payment = db.payments.find((item) => item.id === message.paymentId) || null;
  const record = booking || proposal;
  const name = firstName(client?.name);
  const studio = db.business.name;
  const when = record ? `${prettyDate(record.date)} · ${prettyTime(record.startTime)} – ${prettyTime(record.endTime)}` : '';
  const titles = {
    booking_link: 'Booking link',
    deposit_confirmation: 'Deposit confirmation',
    balance_reminder: 'Final balance reminder',
    event_reminder: 'Event reminder',
    thank_you: 'Post-event thank you'
  };
  let text = '';
  let cta = null;
  if (message.type === 'booking_link') {
    const href = proposal ? `#/p/${proposal.token}` : `#/b/${booking?.token || ''}`;
    text = `Hi ${name}!\n\nHere is your secure booking link for ${studio}.\n\nTap below to view the details and pay your deposit to confirm the date.`;
    cta = { label: proposal ? 'View proposal' : 'View & pay deposit', href };
  } else if (message.type === 'deposit_confirmation') {
    const deposit = payment || db.payments.find((item) => item.bookingId === booking?.id && item.type === 'deposit' && item.status === 'completed');
    text = `Hi ${name}!\n\nWe've received your ${money(deposit?.amount || record?.quote.deposit || 0)} deposit for your event with ${studio}.\n\nYour date is confirmed for ${when}.\n\nWe can't wait to celebrate with you!\n— ${studio}`;
  } else if (message.type === 'balance_reminder') {
    const balance = payment || db.payments.find((item) => item.bookingId === booking?.id && item.type === 'balance' && item.status === 'pending');
    text = `Hi ${name}!\n\nYour event with ${studio} is ${when}.\nYour remaining balance of ${money(balance?.amount || 0)} is due.\n\nLet us know if you have any questions!\n— ${studio}`;
    cta = balance ? { label: 'Pay final balance', href: `#/pay/${balance.id}` } : null;
  } else if (message.type === 'event_reminder') {
    const dayBefore = record ? addDays(record.date, -1) : '';
    const lead = message.sendAt === dayBefore ? `tomorrow, ${when}` : when;
    text = `Hi ${name}!\n\nSee you soon!\n\nYour event with ${studio} is ${lead}.\n\nWe're looking forward to being part of your celebration.\n\nIf you have any last-minute questions, just reply to this text.`;
  } else if (message.type === 'thank_you') {
    text = `Hi ${name}!\n\nThank you again for choosing ${studio}! We hope you had an amazing event.\n\nIf you have a moment, we'd love your support with a Google review. It really helps our business grow.\n\n${db.business.reviewUrl}\n\nThank you!\n— ${studio}`;
    cta = { label: 'Leave a Google review', href: db.business.reviewUrl, external: true };
  }
  return {
    ...message,
    title: titles[message.type] || 'Message',
    clientName: client?.name || studio,
    eventName: record?.eventName || '',
    text,
    cta
  };
}

function ensureMessage(db, spec, today) {
  let message = db.messages.find((item) => item.key === spec.key);
  let changed = false;
  if (!message) {
    message = {
      id: id('msg'),
      key: spec.key,
      type: spec.type,
      clientId: spec.clientId,
      bookingId: spec.bookingId || null,
      proposalId: spec.proposalId || null,
      paymentId: spec.paymentId || null,
      sendAt: spec.sendAt,
      status: 'scheduled',
      sentAt: null
    };
    db.messages.push(message);
    changed = true;
  }
  if (message.sendAt <= today && message.status !== 'sent') {
    message.status = 'sent';
    message.sentAt = message.sendAt;
    changed = true;
  }
  return changed;
}

function syncAutomation(db, today = todayStr()) {
  let changed = false;
  const track = (spec) => {
    if (ensureMessage(db, spec, today)) changed = true;
  };
  for (const proposal of db.proposals) {
    if (!['draft', 'declined'].includes(proposal.status)) {
      track({
        key: `proposal-link:${proposal.id}`,
        type: 'booking_link',
        clientId: proposal.clientId,
        proposalId: proposal.id,
        sendAt: proposal.activityAt || proposal.createdAt
      });
    }
  }
  for (const booking of db.bookings) {
    if (booking.status === 'cancelled') continue;
    const deposit = db.payments.find((payment) => payment.bookingId === booking.id && payment.type === 'deposit' && payment.status === 'completed');
    const pendingDeposit = db.payments.find((payment) => payment.bookingId === booking.id && payment.type === 'deposit' && payment.status === 'pending');
    const pendingBalance = db.payments.find((payment) => payment.bookingId === booking.id && payment.type === 'balance' && payment.status === 'pending');
    if (pendingDeposit) {
      track({ key: `book-link:${booking.id}`, type: 'booking_link', clientId: booking.clientId, bookingId: booking.id, paymentId: pendingDeposit.id, sendAt: pendingDeposit.createdAt });
    }
    if (deposit) {
      track({ key: `deposit:${booking.id}`, type: 'deposit_confirmation', clientId: booking.clientId, bookingId: booking.id, paymentId: deposit.id, sendAt: deposit.paidAt });
    }
    if (pendingBalance) {
      track({ key: `balance:${booking.id}`, type: 'balance_reminder', clientId: booking.clientId, bookingId: booking.id, paymentId: pendingBalance.id, sendAt: addDays(booking.date, -3) });
    }
    if (['deposit_paid', 'balance_due', 'paid', 'deposit_due', 'contract_sent'].includes(booking.status)) {
      track({ key: `remind:${booking.id}`, type: 'event_reminder', clientId: booking.clientId, bookingId: booking.id, sendAt: addDays(booking.date, -1) });
      track({ key: `thanks:${booking.id}`, type: 'thank_you', clientId: booking.clientId, bookingId: booking.id, sendAt: addDays(booking.date, 1) });
    }
  }
  return changed;
}

function packageInUse(db, packageId) {
  return db.proposals.some((item) => item.packageId === packageId) || db.bookings.some((item) => item.packageId === packageId);
}

function addonInUse(db, addonId) {
  const has = (ids) => (ids || []).includes(addonId);
  return db.proposals.some((item) => has(item.addonIds)) || db.bookings.some((item) => has(item.addonIds));
}

function clientInUse(db, clientId) {
  return db.proposals.some((item) => item.clientId === clientId)
    || db.bookings.some((item) => item.clientId === clientId)
    || db.payments.some((item) => item.clientId === clientId);
}

function cleanClient(body, existing) {
  const name = str(body.name, 80);
  const email = str(body.email, 120).toLowerCase();
  if (!name) fail(400, 'Enter a client name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email.');
  return {
    id: existing?.id || id('cli'),
    name,
    email,
    phone: str(body.phone, 40),
    company: str(body.company, 80),
    notes: str(body.notes, 500),
    createdAt: existing?.createdAt || todayStr()
  };
}

function cleanSignature(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) fail(400, 'Draw a signature to continue.');
  if (value.length > 300000) fail(400, 'That signature is too large. Clear it and try again.');
  return value;
}

function readCard(body) {
  const card = body.card || body;
  const number = String(card.number || '').replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(number)) fail(400, 'Enter a card number. This demo does not charge the card.');
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(String(card.exp || ''))) fail(400, 'Enter an expiration date as MM/YY.');
  if (!/^\d{3,4}$/.test(String(card.cvc || ''))) fail(400, 'Enter the CVC.');
  const name = str(card.name, 80);
  if (!name) fail(400, 'Enter the name on the card.');
  let brand = 'Card';
  if (number.startsWith('4')) brand = 'Visa';
  else if (number.startsWith('5')) brand = 'Mastercard';
  else if (number.startsWith('3')) brand = 'Amex';
  else if (number.startsWith('6')) brand = 'Discover';
  return { last4: number.slice(-4), brand, name };
}

function eventInput(body) {
  return {
    packageId: body.packageId,
    startTime: body.startTime,
    endTime: body.endTime,
    guests: body.guests,
    miles: body.miles,
    addonIds: body.addonIds || [],
    addons: body.addons,
    date: body.date,
    depositAmount: body.depositAmount
  };
}

function validateEvent(body) {
  const eventName = str(body.eventName, 120);
  const location = str(body.location, 180);
  const date = str(body.date, 10);
  if (!eventName) fail(400, 'Enter an event name.');
  if (!EVENT_TYPES.includes(body.eventType)) fail(400, 'Choose an event type.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Enter an event date.');
  if (!location) fail(400, 'Enter a location.');
  if (!(Number(body.guests) >= 1)) fail(400, 'Enter the guest count.');
  return {
    eventName,
    eventType: body.eventType,
    date,
    location,
    notes: str(body.notes, 500)
  };
}

function createBookingRecord(db, body, extra) {
  const fields = validateEvent(body);
  const priced = quote(db, eventInput(body));
  return {
    id: id('bok'),
    token: token(),
    clientId: extra.clientId,
    proposalId: extra.proposalId || null,
    source: extra.source || 'studio',
    ...fields,
    startTime: body.startTime,
    endTime: body.endTime,
    miles: priced.miles,
    guests: priced.guests,
    packageId: body.packageId,
    addonIds: priced.addonLines.map((line) => line.id),
    quote: priced,
    status: extra.status,
    signature: extra.signature || null,
    signedAt: extra.signedAt || null,
    createdAt: todayStr()
  };
}

function completePayment(db, payment, card) {
  if (!payment) fail(404, 'Payment not found.');
  if (payment.status === 'completed') return payment;
  if (payment.status === 'void') fail(400, 'This payment was voided.');
  payment.status = 'completed';
  payment.paidAt = todayStr();
  payment.method = 'card';
  payment.brand = card?.brand || 'Card';
  payment.last4 = card?.last4 || null;
  const booking = db.bookings.find((item) => item.id === payment.bookingId);
  if (booking) {
    const open = db.payments.filter((item) => item.bookingId === booking.id && item.status === 'pending' && item.id !== payment.id);
    if (payment.type === 'balance' || booking.quote.balanceCents === 0 || payment.amountCents >= booking.quote.totalCents) {
      booking.status = open.length ? booking.status : 'paid';
    } else if (payment.type === 'deposit') {
      booking.status = booking.quote.balanceCents > 0 ? 'deposit_paid' : 'paid';
    }
    if (!open.length && payment.type === 'balance') booking.status = 'paid';
  }
  const proposal = db.proposals.find((item) => item.id === payment.proposalId);
  if (proposal && payment.type === 'deposit') {
    const bookingFromProposal = ensureBookingFromProposal(db, proposal, payment);
    proposal.status = 'booked';
    proposal.bookingId = bookingFromProposal.id;
    payment.bookingId = bookingFromProposal.id;
    if (bookingFromProposal.quote.balanceCents > 0) bookingFromProposal.status = 'deposit_paid';
    else bookingFromProposal.status = 'paid';
  }
  return payment;
}

function ensureBookingFromProposal(db, proposal, payment) {
  let booking = db.bookings.find((item) => item.proposalId === proposal.id);
  if (booking) return booking;
  booking = {
    id: id('bok'),
    token: token(),
    clientId: proposal.clientId,
    proposalId: proposal.id,
    source: 'proposal',
    eventName: proposal.eventName,
    eventType: proposal.eventType,
    date: proposal.date,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    location: proposal.location,
    miles: proposal.miles,
    guests: proposal.guests,
    notes: proposal.notes,
    packageId: proposal.packageId,
    addonIds: proposal.addonIds,
    quote: proposal.quote,
    status: 'deposit_paid',
    signature: proposal.signature,
    signedAt: proposal.signedAt,
    createdAt: todayStr()
  };
  db.bookings.push(booking);
  if (payment) payment.bookingId = booking.id;
  return booking;
}

function findOrCreateClient(db, body) {
  const email = str(body.email, 120).toLowerCase();
  const first = str(body.firstName, 40);
  const last = str(body.lastName, 40);
  const name = str(body.name, 80) || `${first} ${last}`.trim();
  if (!name) fail(400, 'Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email.');
  let client = db.clients.find((item) => item.email === email);
  if (!client) {
    client = { id: id('cli'), name, email, phone: str(body.phone, 40), company: '', notes: '', createdAt: todayStr() };
    db.clients.push(client);
  } else {
    client.name = name;
    if (body.phone) client.phone = str(body.phone, 40);
  }
  return client;
}

function publicBooking(db, booking) {
  const client = clientById(db, booking.clientId);
  return {
    token: booking.token,
    eventName: booking.eventName,
    eventType: booking.eventType,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.location,
    guests: booking.guests,
    notes: booking.notes,
    status: booking.status,
    quote: booking.quote,
    signature: booking.signature,
    signedAt: booking.signedAt,
    packageId: booking.packageId,
    client: client ? { name: client.name, email: client.email, phone: client.phone } : null,
    payments: db.payments.filter((payment) => payment.bookingId === booking.id).map(publicPayment),
    business: publicBusiness(db),
    contract: contractPayload(db)
  };
}

function publicPayment(payment) {
  return {
    id: payment.id,
    type: payment.type,
    label: payment.label,
    amount: payment.amount,
    status: payment.status,
    paidAt: payment.paidAt,
    brand: payment.brand,
    last4: payment.last4,
    eventName: payment.eventName
  };
}

function contractPayload(db) {
  return { title: db.contract.title, body: renderContract(db), points: db.contract.points };
}

function publicProposal(db, proposal) {
  const client = clientById(db, proposal.clientId);
  const payment = db.payments.find((item) => item.proposalId === proposal.id && item.status !== 'void') || null;
  const booking = db.bookings.find((item) => item.id === proposal.bookingId) || null;
  return {
    token: proposal.token,
    status: proposal.status,
    eventName: proposal.eventName,
    eventType: proposal.eventType,
    date: proposal.date,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    location: proposal.location,
    guests: proposal.guests,
    notes: proposal.notes,
    quote: proposal.quote,
    signature: proposal.signature,
    signedAt: proposal.signedAt,
    client: client ? { name: client.name, firstName: firstName(client.name), email: client.email } : null,
    payment: payment ? publicPayment(payment) : null,
    bookingToken: booking?.token || null,
    business: publicBusiness(db),
    contract: contractPayload(db)
  };
}

function bootstrap(db) {
  return {
    business: publicBusiness(db),
    account: { name: db.account.name, firstName: db.account.firstName, email: db.account.email },
    settings: db.settings,
    stats: stats(db),
    clients: db.clients,
    proposals: db.proposals,
    bookings: db.bookings,
    payments: db.payments,
    packages: db.packages,
    addons: db.addons,
    messages: db.messages
      .map((message) => composeMessage(db, message))
      .sort((a, b) => b.sendAt.localeCompare(a.sendAt) || a.title.localeCompare(b.title)),
    contract: { ...db.contract, body: db.contract.body },
    eventTypes: EVENT_TYPES
  };
}

function requireProposal(tokenValue) {
  const proposal = db.proposals.find((item) => item.token === tokenValue);
  if (!proposal) fail(404, 'This proposal link is not active.');
  return proposal;
}

function requireBookingToken(tokenValue) {
  const booking = db.bookings.find((item) => item.token === tokenValue);
  if (!booking) fail(404, 'This booking link is not active.');
  return booking;
}

function markProposalViewed(proposal) {
  if (proposal.status === 'sent') {
    proposal.status = 'viewed';
    proposal.activityAt = todayStr();
    return true;
  }
  return false;
}

function icsFor(db, booking) {
  const stamp = booking.date.replace(/-/g, '');
  const start = booking.startTime.replace(':', '') + '00';
  const end = booking.endTime.replace(':', '') + '00';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PayMe//Little Mixxy//EN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@payme.local`,
    `DTSTART:${stamp}T${start}`,
    `DTEND:${stamp}T${end}`,
    `SUMMARY:${booking.eventName} with ${db.business.name}`,
    `LOCATION:${booking.location}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.join('\r\n');
}

function studioPackage(body, existing) {
  const name = str(body.name, 60);
  if (!name) fail(400, 'Enter a package name.');
  const price = Number(body.price);
  if (!(price >= 0)) fail(400, 'Enter a price.');
  const pricing = body.pricing === 'hourly' ? 'hourly' : 'flat';
  return {
    id: existing?.id || id('pkg'),
    name,
    tagline: str(body.tagline, 80),
    description: str(body.description, 400),
    price,
    pricing,
    minimumHours: pricing === 'hourly' ? Math.max(1, Number(body.minimumHours) || 2) : null,
    includedHours: pricing === 'flat' ? Math.max(1, Number(body.includedHours) || 3) : null,
    image: str(body.image, 300),
    tone: existing?.tone || '#ffd0e2',
    highlights: Array.isArray(body.highlights)
      ? body.highlights.map((item) => str(item, 80)).filter(Boolean).slice(0, 6)
      : (existing?.highlights || [])
  };
}

function studioAddon(body, existing) {
  const name = str(body.name, 60);
  if (!name) fail(400, 'Enter an add-on name.');
  const price = Number(body.price);
  if (!(price >= 0)) fail(400, 'Enter a price.');
  return {
    id: existing?.id || id('add'),
    name,
    detail: str(body.detail, 80),
    price
  };
}

let db = null;
let writeChain = Promise.resolve();

function persist() {
  writeChain = writeChain
    .then(() => fs.promises.writeFile(DATA, JSON.stringify(db, null, 2)))
    .catch((err) => console.error('Could not save data:', err.message));
  return writeChain;
}

function persistSync() {
  try {
    fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Could not save data:', err.message);
  }
}

function load() {
  if (!fs.existsSync(DATA)) return Object.assign(seed(), { _fresh: true });
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    if (parsed.schema !== SCHEMA) return Object.assign(seed(), { _fresh: true });
    return parsed;
  } catch (err) {
    console.error('Saved data could not be read. Starting a fresh demo.');
    return Object.assign(seed(), { _fresh: true });
  }
}

function authUser(req) {
  const header = req.headers.authorization || '';
  const sessionToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!sessionToken) return null;
  return db.sessions.find((session) => session.token === sessionToken) ? db.account : null;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const routes = [];
function route(method, pattern, handler, requiresAuth) {
  routes.push({ method, pattern, handler, requiresAuth: Boolean(requiresAuth) });
}

function matchRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const entry of routes) {
    if (entry.method !== method) continue;
    const expected = entry.pattern.split('/').filter(Boolean);
    if (expected.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < expected.length; i += 1) {
      if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (expected[i] !== parts[i]) ok = false;
    }
    if (ok) return { entry, params };
  }
  return null;
}

route('POST', '/api/login', (ctx) => {
  const email = str(ctx.body.email, 120).toLowerCase();
  const password = String(ctx.body.password || '');
  if (!safeEqual(email, db.account.email) || !safeEqual(password, db.account.password)) {
    fail(401, 'That email or password is not right.');
  }
  const sessionToken = crypto.randomBytes(24).toString('hex');
  db.sessions.push({ token: sessionToken, createdAt: todayStr() });
  db.sessions = db.sessions.slice(-20);
  persist();
  return { token: sessionToken, name: db.account.name, firstName: db.account.firstName, email: db.account.email };
});

route('POST', '/api/logout', (ctx) => {
  const header = ctx.req.headers.authorization || '';
  const sessionToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  db.sessions = db.sessions.filter((session) => session.token !== sessionToken);
  persist();
  return { ok: true };
}, true);

route('GET', '/api/me', () => ({
  name: db.account.name,
  firstName: db.account.firstName,
  email: db.account.email
}), true);

route('GET', '/api/bootstrap', () => {
  if (syncAutomation(db)) persist();
  return bootstrap(db);
}, true);

route('POST', '/api/quote', (ctx) => quote(db, eventInput(ctx.body)), true);

route('POST', '/api/clients', (ctx) => {
  const client = cleanClient(ctx.body);
  if (db.clients.some((item) => item.email === client.email)) fail(400, 'A client with that email already exists.');
  db.clients.unshift(client);
  persist();
  return client;
}, true);

route('PUT', '/api/clients/:id', (ctx) => {
  const index = db.clients.findIndex((item) => item.id === ctx.params.id);
  if (index < 0) fail(404, 'Client not found.');
  const client = cleanClient(ctx.body, db.clients[index]);
  if (db.clients.some((item) => item.email === client.email && item.id !== client.id)) fail(400, 'A client with that email already exists.');
  db.clients[index] = client;
  persist();
  return client;
}, true);

route('DELETE', '/api/clients/:id', (ctx) => {
  if (clientInUse(db, ctx.params.id)) fail(400, 'This client has proposals, events, or payments.');
  db.clients = db.clients.filter((item) => item.id !== ctx.params.id);
  persist();
  return { ok: true };
}, true);

route('POST', '/api/packages', (ctx) => {
  const pkg = studioPackage(ctx.body);
  db.packages.push(pkg);
  persist();
  return pkg;
}, true);

route('PUT', '/api/packages/:id', (ctx) => {
  const index = db.packages.findIndex((item) => item.id === ctx.params.id);
  if (index < 0) fail(404, 'Package not found.');
  db.packages[index] = studioPackage(ctx.body, db.packages[index]);
  persist();
  return db.packages[index];
}, true);

route('DELETE', '/api/packages/:id', (ctx) => {
  if (packageInUse(db, ctx.params.id)) fail(400, 'This package is used on a proposal or event.');
  db.packages = db.packages.filter((item) => item.id !== ctx.params.id);
  persist();
  return { ok: true };
}, true);

route('POST', '/api/addons', (ctx) => {
  const addon = studioAddon(ctx.body);
  db.addons.push(addon);
  persist();
  return addon;
}, true);

route('PUT', '/api/addons/:id', (ctx) => {
  const index = db.addons.findIndex((item) => item.id === ctx.params.id);
  if (index < 0) fail(404, 'Add-on not found.');
  db.addons[index] = studioAddon(ctx.body, db.addons[index]);
  persist();
  return db.addons[index];
}, true);

route('DELETE', '/api/addons/:id', (ctx) => {
  if (addonInUse(db, ctx.params.id)) fail(400, 'This add-on is used on a proposal or event.');
  db.addons = db.addons.filter((item) => item.id !== ctx.params.id);
  persist();
  return { ok: true };
}, true);

route('POST', '/api/proposals', (ctx) => {
  const client = clientById(db, ctx.body.clientId);
  if (!client) fail(400, 'Choose a client.');
  const fields = validateEvent(ctx.body);
  const priced = quote(db, eventInput(ctx.body));
  const proposal = {
    id: id('prop'),
    token: token(),
    clientId: client.id,
    ...fields,
    startTime: ctx.body.startTime,
    endTime: ctx.body.endTime,
    miles: priced.miles,
    guests: priced.guests,
    packageId: ctx.body.packageId,
    addonIds: priced.addonLines.map((line) => line.id),
    quote: priced,
    status: 'sent',
    signature: null,
    signedAt: null,
    sentVia: ['text', 'email', 'link'].includes(ctx.body.via) ? ctx.body.via : 'link',
    activityAt: todayStr(),
    createdAt: todayStr(),
    bookingId: null
  };
  db.proposals.unshift(proposal);
  syncAutomation(db);
  persist();
  return { proposal, url: `/#/p/${proposal.token}` };
}, true);

route('POST', '/api/proposals/:id/send', (ctx) => {
  const proposal = db.proposals.find((item) => item.id === ctx.params.id);
  if (!proposal) fail(404, 'Proposal not found.');
  if (proposal.status === 'declined' || proposal.status === 'booked') fail(400, 'This proposal is closed.');
  if (proposal.status === 'draft') proposal.status = 'sent';
  proposal.sentVia = ['text', 'email', 'link'].includes(ctx.body.via) ? ctx.body.via : proposal.sentVia;
  proposal.activityAt = todayStr();
  syncAutomation(db);
  persist();
  return { proposal, url: `/#/p/${proposal.token}` };
}, true);

route('POST', '/api/proposals/:id/paid', (ctx) => {
  const proposal = db.proposals.find((item) => item.id === ctx.params.id);
  if (!proposal) fail(404, 'Proposal not found.');
  let payment = db.payments.find((item) => item.proposalId === proposal.id && item.type === 'deposit' && item.status !== 'void');
  if (!payment) {
    payment = payRecord({
      clientId: proposal.clientId,
      proposalId: proposal.id,
      eventName: proposal.eventName,
      type: 'deposit',
      label: 'Deposit',
      amountCents: proposal.quote.depositCents,
      status: 'pending',
      createdAt: todayStr()
    });
    db.payments.unshift(payment);
  }
  completePayment(db, payment, { brand: 'Manual', last4: null });
  payment.method = 'manual';
  syncAutomation(db);
  persist();
  return { proposal, payment };
}, true);

route('DELETE', '/api/proposals/:id', (ctx) => {
  const proposal = db.proposals.find((item) => item.id === ctx.params.id);
  if (!proposal) fail(404, 'Proposal not found.');
  if (proposal.status === 'booked') fail(400, 'This proposal already became an event.');
  db.proposals = db.proposals.filter((item) => item.id !== proposal.id);
  db.payments.forEach((payment) => {
    if (payment.proposalId === proposal.id && payment.status === 'pending') payment.status = 'void';
  });
  persist();
  return { ok: true };
}, true);

route('POST', '/api/bookings', (ctx) => {
  const client = clientById(db, ctx.body.clientId);
  if (!client) fail(400, 'Choose a client.');
  const choice = ctx.body.paymentChoice || 'later';
  const booking = createBookingRecord(db, ctx.body, {
    clientId: client.id,
    source: 'studio',
    status: choice === 'later' ? 'scheduled' : 'deposit_due'
  });
  db.bookings.unshift(booking);
  if (booking.quote.depositCents <= 0) booking.status = booking.quote.totalCents === 0 ? 'paid' : 'scheduled';
  if ((choice === 'paid' || choice === 'link') && booking.quote.depositCents > 0) {
    const payment = payRecord({
      clientId: client.id,
      bookingId: booking.id,
      eventName: booking.eventName,
      type: booking.quote.balanceCents === 0 ? 'full' : 'deposit',
      label: booking.quote.balanceCents === 0 ? 'Payment' : 'Deposit',
      amountCents: booking.quote.depositCents,
      status: 'pending',
      createdAt: todayStr()
    });
    db.payments.unshift(payment);
    if (choice === 'paid') {
      completePayment(db, payment, null);
      payment.method = 'manual';
    }
  }
  syncAutomation(db);
  persist();
  return { booking, url: `/#/b/${booking.token}`, dateTaken: booking.quote.dateTaken };
}, true);

route('POST', '/api/bookings/:id/send', (ctx) => {
  const booking = db.bookings.find((item) => item.id === ctx.params.id);
  if (!booking) fail(404, 'Event not found.');
  syncAutomation(db);
  persist();
  return { url: `/#/b/${booking.token}` };
}, true);

route('POST', '/api/bookings/:id/invoice', (ctx) => {
  const booking = db.bookings.find((item) => item.id === ctx.params.id);
  if (!booking) fail(404, 'Event not found.');
  if (!(booking.quote.balanceCents > 0)) fail(400, 'This event has no remaining balance.');
  const existing = db.payments.find((payment) => payment.bookingId === booking.id && payment.type === 'balance' && payment.status !== 'void');
  if (existing) return { payment: existing, booking };
  const payment = payRecord({
    clientId: booking.clientId,
    bookingId: booking.id,
    eventName: booking.eventName,
    type: 'balance',
    label: 'Remaining Balance',
    amountCents: booking.quote.balanceCents,
    status: 'pending',
    createdAt: todayStr()
  });
  db.payments.unshift(payment);
  if (booking.status === 'deposit_paid') booking.status = 'balance_due';
  syncAutomation(db);
  persist();
  return { payment, booking, url: `/#/pay/${payment.id}` };
}, true);

route('POST', '/api/bookings/:id/cancel', (ctx) => {
  const booking = db.bookings.find((item) => item.id === ctx.params.id);
  if (!booking) fail(404, 'Event not found.');
  booking.status = 'cancelled';
  db.payments.forEach((payment) => {
    if (payment.bookingId === booking.id && payment.status === 'pending') payment.status = 'void';
  });
  persist();
  return { booking };
}, true);

route('POST', '/api/payments/:id/paid', (ctx) => {
  const payment = db.payments.find((item) => item.id === ctx.params.id);
  completePayment(db, payment, null);
  payment.method = 'manual';
  syncAutomation(db);
  persist();
  return { payment };
}, true);

route('PUT', '/api/settings', (ctx) => {
  const body = ctx.body || {};
  if (body.business) {
    const current = db.business;
    db.business = {
      ...current,
      name: str(body.business.name || current.name, 80),
      owner: str(body.business.owner || current.owner, 80),
      email: str(body.business.email || current.email, 120),
      phone: str(body.business.phone || current.phone, 40),
      city: str(body.business.city || current.city, 80),
      reviewUrl: str(body.business.reviewUrl || current.reviewUrl, 200),
      tagline: str(body.business.tagline || current.tagline, 160),
      slug: str(body.business.slug || current.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, '') || current.slug
    };
  }
  if (body.accountName) {
    db.account.name = str(body.accountName, 80) || db.account.name;
    db.account.firstName = firstName(db.account.name);
  }
  const next = { ...db.settings };
  ['depositPercent', 'gratuityPercent', 'bartenderThreshold', 'bartenderFee', 'travelPerMile'].forEach((key) => {
    if (body[key] != null && body[key] !== '') next[key] = Number(body[key]);
  });
  if (!(next.depositPercent >= 0 && next.depositPercent <= 100)) fail(400, 'Deposit percent must be between 0 and 100.');
  if (!(next.gratuityPercent >= 0 && next.gratuityPercent <= 40)) fail(400, 'Gratuity percent must be between 0 and 40.');
  if (!(next.bartenderThreshold >= 1)) fail(400, 'Enter a guest threshold for the extra bartender.');
  if (!(next.bartenderFee >= 0) || !(next.travelPerMile >= 0)) fail(400, 'Fees cannot be negative.');
  db.settings = next;
  persist();
  return { settings: db.settings, business: publicBusiness(db) };
}, true);

route('PUT', '/api/contract', (ctx) => {
  const bodyText = str(ctx.body.body, 8000);
  if (bodyText.length < 40) fail(400, 'The agreement needs a bit more detail.');
  db.contract.body = bodyText;
  db.contract.title = str(ctx.body.title, 120) || db.contract.title;
  if (Array.isArray(ctx.body.points)) {
    db.contract.points = ctx.body.points.map((point) => str(point, 80)).filter(Boolean).slice(0, 8);
  }
  persist();
  return db.contract;
}, true);

route('POST', '/api/reset', () => {
  const sessions = db.sessions;
  db = seed();
  db.sessions = sessions;
  delete db._fresh;
  persist();
  return bootstrap(db);
}, true);

route('POST', '/api/public/studio/:slug/quote', (ctx) => {
  if (ctx.params.slug !== db.business.slug) fail(404, 'This booking page is not active.');
  return quote(db, eventInput(ctx.body));
});

route('GET', '/api/public/studio/:slug', (ctx) => {
  if (ctx.params.slug !== db.business.slug) fail(404, 'This booking page is not active.');
  if (syncAutomation(db)) persist();
  return {
    business: publicBusiness(db),
    settings: {
      depositPercent: db.settings.depositPercent,
      gratuityPercent: db.settings.gratuityPercent,
      bartenderThreshold: db.settings.bartenderThreshold,
      bartenderFee: db.settings.bartenderFee,
      travelPerMile: db.settings.travelPerMile
    },
    packages: db.packages,
    addons: db.addons,
    eventTypes: EVENT_TYPES,
    unavailableDates: db.bookings.filter((booking) => booking.status !== 'cancelled').map((booking) => booking.date),
    contract: contractPayload(db)
  };
});

route('POST', '/api/public/studio/:slug/book', (ctx) => {
  if (ctx.params.slug !== db.business.slug) fail(404, 'This booking page is not active.');
  if (!ctx.body.agreed) fail(400, 'Agree to the terms before paying.');
  const signature = cleanSignature(ctx.body.signature);
  const card = readCard(ctx.body);
  const fields = validateEvent(ctx.body);
  if (fields.date < todayStr()) fail(400, 'Choose a future date.');
  if (dateTaken(db, fields.date)) fail(400, 'That date is already reserved. Choose another day.');
  const client = findOrCreateClient(db, ctx.body);
  const booking = createBookingRecord(db, ctx.body, {
    clientId: client.id,
    source: 'public',
    status: 'deposit_due',
    signature,
    signedAt: todayStr()
  });
  db.bookings.unshift(booking);
  const payment = payRecord({
    clientId: client.id,
    bookingId: booking.id,
    eventName: booking.eventName,
    type: booking.quote.balanceCents === 0 ? 'full' : 'deposit',
    label: booking.quote.balanceCents === 0 ? 'Payment' : 'Deposit',
    amountCents: booking.quote.depositCents,
    status: 'pending',
    createdAt: todayStr()
  });
  db.payments.unshift(payment);
  completePayment(db, payment, card);
  syncAutomation(db);
  persist();
  return publicBooking(db, booking);
});

route('GET', '/api/public/proposal/:token', (ctx) => {
  const proposal = requireProposal(ctx.params.token);
  if (markProposalViewed(proposal)) persist();
  return publicProposal(db, proposal);
});

route('POST', '/api/public/proposal/:token/accept', (ctx) => {
  const proposal = requireProposal(ctx.params.token);
  if (['declined', 'booked'].includes(proposal.status)) fail(400, 'This proposal is closed.');
  if (!['pending_signature', 'deposit_due', 'accepted', 'signed'].includes(proposal.status)) proposal.status = 'accepted';
  proposal.activityAt = todayStr();
  persist();
  return publicProposal(db, proposal);
});

route('POST', '/api/public/proposal/:token/decline', (ctx) => {
  const proposal = requireProposal(ctx.params.token);
  if (proposal.status === 'booked') fail(400, 'This proposal is already booked.');
  proposal.status = 'declined';
  proposal.activityAt = todayStr();
  db.payments.forEach((payment) => {
    if (payment.proposalId === proposal.id && payment.status === 'pending') payment.status = 'void';
  });
  persist();
  return publicProposal(db, proposal);
});

route('POST', '/api/public/proposal/:token/sign', (ctx) => {
  const proposal = requireProposal(ctx.params.token);
  if (['declined', 'booked'].includes(proposal.status)) fail(400, 'This proposal is closed.');
  if (!ctx.body.agreed) fail(400, 'Agree to the terms before signing.');
  proposal.signature = cleanSignature(ctx.body.signature);
  proposal.signedAt = todayStr();
  proposal.status = 'deposit_due';
  proposal.activityAt = todayStr();
  let payment = db.payments.find((item) => item.proposalId === proposal.id && item.type === 'deposit' && item.status !== 'void');
  if (!payment) {
    payment = payRecord({
      clientId: proposal.clientId,
      proposalId: proposal.id,
      eventName: proposal.eventName,
      type: 'deposit',
      label: 'Deposit',
      amountCents: proposal.quote.depositCents,
      status: 'pending',
      createdAt: todayStr()
    });
    db.payments.unshift(payment);
  }
  syncAutomation(db);
  persist();
  return publicProposal(db, proposal);
});

route('POST', '/api/public/proposal/:token/pay', (ctx) => {
  const proposal = requireProposal(ctx.params.token);
  if (proposal.status === 'declined') fail(400, 'This proposal was declined.');
  if (!proposal.signature) fail(400, 'Sign the agreement before paying.');
  const card = readCard(ctx.body);
  let payment = db.payments.find((item) => item.proposalId === proposal.id && item.type === 'deposit' && item.status !== 'void');
  if (!payment) fail(400, 'There is no deposit to pay yet.');
  completePayment(db, payment, card);
  syncAutomation(db);
  persist();
  const booking = db.bookings.find((item) => item.id === proposal.bookingId);
  return { proposal: publicProposal(db, proposal), booking: booking ? publicBooking(db, booking) : null };
});

route('GET', '/api/public/booking/:token', (ctx) => publicBooking(db, requireBookingToken(ctx.params.token)));

route('POST', '/api/public/booking/:token/pay', (ctx) => {
  const booking = requireBookingToken(ctx.params.token);
  if (!ctx.body.agreed && !booking.signature) fail(400, 'Agree to the terms before paying.');
  if (!booking.signature) {
    booking.signature = cleanSignature(ctx.body.signature);
    booking.signedAt = todayStr();
  }
  const card = readCard(ctx.body);
  let payment = db.payments.find((item) => item.bookingId === booking.id && item.status === 'pending' && (ctx.body.paymentId ? item.id === ctx.body.paymentId : item.type === 'deposit' || item.type === 'full'));
  if (!payment) payment = db.payments.find((item) => item.bookingId === booking.id && item.status === 'pending');
  if (!payment) fail(400, 'This event has nothing due right now.');
  completePayment(db, payment, card);
  syncAutomation(db);
  persist();
  return publicBooking(db, booking);
});

route('GET', '/api/public/booking/:token/calendar.ics', (ctx) => {
  const booking = requireBookingToken(ctx.params.token);
  return {
    raw: true,
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${booking.token}.ics"`
    },
    body: icsFor(db, booking)
  };
});

route('GET', '/api/public/payment/:id', (ctx) => {
  const payment = db.payments.find((item) => item.id === ctx.params.id);
  if (!payment || payment.status === 'void') fail(404, 'This payment link is not active.');
  const booking = db.bookings.find((item) => item.id === payment.bookingId) || null;
  const proposal = db.proposals.find((item) => item.id === payment.proposalId) || null;
  const client = clientById(db, payment.clientId);
  return {
    payment: publicPayment(payment),
    booking: booking ? publicBooking(db, booking) : null,
    proposal: proposal ? { token: proposal.token, status: proposal.status, eventName: proposal.eventName, signature: Boolean(proposal.signature) } : null,
    client: client ? { name: client.name, email: client.email } : null,
    business: publicBusiness(db)
  };
});

route('POST', '/api/public/payment/:id/pay', (ctx) => {
  const payment = db.payments.find((item) => item.id === ctx.params.id);
  if (!payment || payment.status === 'void') fail(404, 'This payment link is not active.');
  const proposal = db.proposals.find((item) => item.id === payment.proposalId);
  if (proposal && !proposal.signature) fail(400, 'Sign the agreement before paying the deposit.');
  const card = readCard(ctx.body);
  completePayment(db, payment, card);
  syncAutomation(db);
  persist();
  const booking = db.bookings.find((item) => item.id === payment.bookingId);
  return {
    payment: publicPayment(payment),
    booking: booking ? publicBooking(db, booking) : null
  };
});

const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/styles.css': 'styles.css',
  '/app.js': 'app.js',
  '/favicon.svg': 'favicon.svg'
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function sendRaw(res, result) {
  res.writeHead(result.status || 200, {
    ...result.headers,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(result.body)
  });
  res.end(result.body);
}

function requestUrl(req) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const rewritten = url.searchParams.get('__path');
  const functionRoot = url.pathname === '/api' || url.pathname === '/api/' || url.pathname === '/api/index';
  if (functionRoot && rewritten && rewritten.startsWith('/') && !rewritten.startsWith('//')) {
    return new URL(rewritten, 'http://127.0.0.1');
  }
  return url;
}

function serveFile(res, fileName) {
  const filePath = path.join(ROOT, fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, { error: 'File not found.' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fileName)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': data.length
    });
    res.end(data);
  });
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
      return Promise.resolve(text ? JSON.parse(text) : {});
    } catch (err) {
      return Promise.reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

if (process.argv.includes('--selftest')) {
  const testDb = seed();
  assertMockQuotes(testDb);
  console.log('Self-test passed.');
  console.log(JSON.stringify(stats(testDb, '2026-10-15'), null, 2));
  process.exit(0);
}

db = load();
const fresh = Boolean(db._fresh);
delete db._fresh;
if (fresh) persistSync();

async function handle(req, res) {
  try {
    const url = requestUrl(req);
    const hit = matchRoute(req.method, url.pathname);
    if (hit) {
      if (hit.entry.requiresAuth && !authUser(req)) {
        send(res, 401, { error: 'Please sign in.' });
        return;
      }
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const result = await hit.entry.handler({ req, params: hit.params, body, url });
      if (result && result.raw) return sendRaw(res, result);
      return send(res, 200, result ?? { ok: true });
    }
    if (req.method === 'GET') {
      const fileName = STATIC[url.pathname];
      if (fileName) return serveFile(res, fileName);
      if (!url.pathname.startsWith('/api')) return serveFile(res, 'index.html');
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
}

if (require.main === module && !ON_VERCEL) {
  http.createServer(handle).listen(PORT, () => {
    console.log(`PayMe is running at http://localhost:${PORT}`);
    console.log('Studio login: danielle@littlemixxy.com / mixxy');
    console.log(`Client booking: http://localhost:${PORT}/#/book/littlemixxy`);
  });
}

module.exports = (req, res) => handle(req, res);
