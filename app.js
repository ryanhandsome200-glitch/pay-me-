'use strict';

const S = {
  token: sessionStorage.getItem('pm_token') || '',
  user: null,
  cache: null,
  cacheStale: false,
  wizard: null,
  flow: null,
  modal: null,
  nav: false,
  gen: 0,
  filters: { proposals: 'all', bookings: 'all', payments: 'all', messages: 'all' },
  messageId: '',
  cal: null,
  search: '',
  busy: false,
  quoteTimer: 0
};

const PROPOSAL_STEPS = [
  ['client', 'Choose a client'],
  ['details', 'Event details'],
  ['package', 'Choose a package'],
  ['extras', 'Add extras'],
  ['pricing', 'Automatic pricing'],
  ['review', 'Review proposal'],
  ['contract', 'Attach contract'],
  ['send', 'Send proposal']
];
const BOOKING_STEPS = [
  ['client', 'Choose a client'],
  ['details', 'Event details'],
  ['package', 'Choose a package'],
  ['extras', 'Add extras'],
  ['payment', 'Payment & status'],
  ['review', 'Review event']
];
const BOOK_STEPS = [
  ['welcome', 'Welcome'],
  ['package', 'Choose a package'],
  ['details', 'Event details'],
  ['addons', 'Add-ons'],
  ['review', 'Review your booking'],
  ['contract', 'Sign the agreement'],
  ['handoff', "You're leaving PayMe"],
  ['pay', 'Pay the deposit']
];
const STATUS = {
  pending_signature: ['Pending Signature', 'amber'],
  sent: ['Sent', 'blue'],
  viewed: ['Viewed', 'violet'],
  deposit_due: ['Deposit Due', 'pink'],
  declined: ['Declined', 'red'],
  booked: ['Booked', 'green'],
  accepted: ['Accepted', 'green'],
  draft: ['Draft', 'gray'],
  deposit_paid: ['Deposit Paid', 'green'],
  balance_due: ['Pending Balance', 'amber'],
  paid: ['Fully Paid', 'green'],
  contract_sent: ['Contract Sent', 'pink'],
  cancelled: ['Cancelled', 'gray'],
  scheduled: ['Scheduled', 'blue'],
  completed: ['Completed', 'green'],
  pending: ['Due', 'amber'],
  void: ['Void', 'gray'],
  opening: ['Opening balance', 'gray']
};
const WAITING = new Set(['sent', 'viewed', 'pending_signature', 'deposit_due', 'accepted']);
const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1"/><circle cx="10" cy="8" r="3"/><path d="M20 19v-1a3 3 0 0 0-2.2-2.9M16 5.1a3 3 0 0 1 0 5.8"/>',
  file: '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6"/>',
  ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  chat: '<path d="M6 17.5 3 20V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/>',
  box: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
  pen: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5 9.2 17 19 7"/>',
  link: '<path d="M10 14a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 14"/><path d="M14 10a5 5 0 0 1 0 7L12.5 18.5a5 5 0 0 1-7-7L7 10"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
  mail: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m4 7 8 6 8-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  download: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>'
};

function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

function logo() {
  return `<span class="logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#ff3b8d" d="M16 1.2 29 8.6v14.8L16 30.8 3 23.4V8.6L16 1.2z"/><path fill="#fff" d="M10.2 9.2h8.1a4.6 4.6 0 0 1 0 9.2h-4.2V22.8h-3.9V9.2zm3.9 2.8v3.6h3.8a1.8 1.8 0 0 0 0-3.6h-3.8z"/></svg><strong>PayMe</strong></span>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function safeHttp(href) {
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch (err) { /* ignore unsafe links */ }
  return '';
}

function money(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const cents = Math.round(Math.abs(rounded) * 100) % 100;
  return rounded.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

function trimNum(value) {
  const number = Math.round(Number(value) * 100) / 100;
  return String(number);
}

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

function hoursText(bag) {
  const hours = hoursBetween(bag.startTime, bag.endTime);
  if (!hours) return '—';
  return `${trimNum(hours)} hour${hours === 1 ? '' : 's'}`;
}

function prettyDate(iso) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDate(iso) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function prettyTime(value) {
  if (!value) return '';
  const [h, m] = value.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function timeRange(start, end) {
  if (!start) return '';
  return `${prettyTime(start)} – ${prettyTime(end)}`;
}

function monthDay(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return {
    mon: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: date.getDate()
  };
}

function greet() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function parseHash() {
  const raw = (location.hash || '#/dashboard').replace(/^#/, '') || '/dashboard';
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return { parts, params: new URLSearchParams(queryPart || '') };
}

function pill(status) {
  const [label, tone] = STATUS[status] || [status || 'Open', 'gray'];
  return `<span class="pill ${tone}">${esc(label)}</span>`;
}

function avatar(name) {
  const parts = String(name || '?').split(/\s+/).filter(Boolean);
  const initials = (parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  const colors = ['#9d1448', '#1d1d24', '#5c2a40', '#243e5c', '#0d4f42'];
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash + ch.charCodeAt(0)) % colors.length;
  return `<span class="avatar" style="background:${colors[hash]}">${esc(initials.toUpperCase())}</span>`;
}

function photoStyle(pkg) {
  const tone = /^#[0-9a-fA-F]{6}$/.test(pkg?.tone || '') ? pkg.tone : '#ffd0e2';
  let image = '';
  try {
    const url = new URL(pkg?.image || '');
    if (url.protocol === 'https:' || url.protocol === 'http:') image = url.href.replace(/['"\\]/g, '');
  } catch (err) { /* gradient only */ }
  return image
    ? `background-image:linear-gradient(160deg, ${tone}, rgba(255,255,255,.2)), url('${image}');background-size:cover;background-position:center`
    : `background:${tone}`;
}

function thumb(packageId, packages) {
  const list = packages || S.cache?.packages || [];
  const pkg = list.find((item) => item.id === packageId);
  return `<span class="thumb" style="${photoStyle(pkg)}"></span>`;
}

function priceLabel(pkg) {
  if (!pkg) return '';
  if (pkg.pricing === 'hourly') return `${money(pkg.price)}/hour`;
  return `${money(pkg.price)} · ${pkg.includedHours || 3} hours`;
}

function clientById(id) {
  return S.cache?.clients?.find((client) => client.id === id) || null;
}

function textToHtml(value) {
  return esc(value).replace(/\n/g, '<br>');
}

async function api(path, opts = {}) {
  const response = await fetch(path, {
    method: opts.method || 'GET',
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(S.token ? { Authorization: `Bearer ${S.token}` } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      S.user = null;
      S.token = '';
      S.cache = null;
      sessionStorage.removeItem('pm_token');
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Copied');
  } catch (err) {
    toast(value);
  }
}

async function reload() {
  S.cache = await api('/api/bootstrap');
  S.cacheStale = false;
  await render();
}

function field(label, name, value, opts = {}) {
  const attrs = [
    `data-model="${esc(name)}"`,
    `name="${esc(name)}"`,
    `type="${opts.type || 'text'}"`,
    `value="${esc(value ?? '')}"`
  ];
  if (opts.placeholder) attrs.push(`placeholder="${esc(opts.placeholder)}"`);
  if (opts.min != null && opts.min !== '') attrs.push(`min="${esc(opts.min)}"`);
  if (opts.step) attrs.push(`step="${esc(opts.step)}"`);
  if (opts.inputmode) attrs.push(`inputmode="${esc(opts.inputmode)}"`);
  return `<label class="field ${opts.wide ? 'wide' : ''}"><span>${esc(label)}</span><input ${attrs.join(' ')}>${opts.help ? `<small class="help">${opts.help}</small>` : ''}</label>`;
}

function selectField(label, name, value, options) {
  return `<label class="field"><span>${esc(label)}</span><select data-model="${esc(name)}" name="${esc(name)}">${options.map((option) => `<option value="${esc(option.value)}"${option.value === value ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>`;
}

function area(label, name, value, placeholder) {
  return `<label class="field wide"><span>${esc(label)}</span><textarea data-model="${esc(name)}" name="${esc(name)}" placeholder="${esc(placeholder || '')}">${esc(value || '')}</textarea></label>`;
}

function quoteHTML(q) {
  if (!q) return '<p class="empty">Pricing appears once a package and time are set.</p>';
  const packageLabel = q.pricing === 'hourly'
    ? `${q.packageName} · ${trimNum(q.billableHours)} hrs × ${money(q.hourlyRate)}`
    : q.packageName;
  const lines = [
    [packageLabel, q.packageTotal],
    ...(q.addonLines || []).map((line) => [`${line.name}${line.qty > 1 ? ` × ${line.qty}` : ''}`, line.amount]),
    ...(q.autoLines || []).map((line) => [line.name, line.amount])
  ];
  return `<div class="quote">
    ${lines.map(([label, amount]) => `<div class="quote-line"><span>${esc(label)}</span><span>${money(amount)}</span></div>`).join('')}
    <div class="quote-line"><span>Subtotal</span><span>${money(q.subtotal)}</span></div>
    <div class="quote-line"><span>Gratuity (${esc(q.gratuityPercent)}%)</span><span>${money(q.gratuity)}</span></div>
    <div class="total-line"><span>Total</span><strong>${money(q.total)}</strong></div>
    <div class="due-line"><span>${q.depositPercent ? `Deposit due (${q.depositPercent}%)` : 'Deposit due'}</span><span>${money(q.deposit)}</span></div>
    <div class="quote-line"><span>Remaining balance</span><span>${money(q.balance)}</span></div>
    ${q.minimumApplied ? `<p class="help">${esc(trimNum(q.billableHours))} hour minimum applied.</p>` : ''}
    ${q.dateTaken ? '<p class="auto-note">Another event is already booked on this date.</p>' : ''}
  </div>`;
}

function rulesHTML(bag) {
  const guests = Number(bag.guests) || 0;
  const threshold = bag.kind === 'public' ? bag.studio.settings.bartenderThreshold : S.cache.settings.bartenderThreshold;
  const bartender = Boolean(bag.quote?.bartenderAdded);
  const travel = Boolean(bag.quote?.travelAdded);
  return `<div class="rule on">${icon('check')}<span>Total hours calculated from ${esc(bag.startTime || '')} to ${esc(bag.endTime || '')}: ${esc(hoursText(bag))}.</span></div>
    <div class="rule ${bartender ? 'on' : ''}">${icon('check')}<span>${bartender ? `Additional bartender added for ${guests} guests.` : `No extra bartender. ${guests || 0} guests is within the ${threshold} guest rule.`}</span></div>
    <div class="rule ${travel ? 'on' : ''}">${icon('check')}<span>${travel ? `Travel fee calculated for ${esc(bag.miles)} miles.` : 'No travel fee on this quote.'}</span></div>`;
}

function facts(record) {
  const rows = [
    ['When', `${prettyDate(record.date)} · ${timeRange(record.startTime, record.endTime)}`],
    ['Where', record.location],
    ['Guests', record.guests ? String(record.guests) : ''],
    ['Package', record.quote?.packageName || '']
  ].filter((row) => row[1]);
  return `<div class="kv">${rows.map(([key, value]) => `<span>${esc(key)}</span><strong>${esc(value)}</strong>`).join('')}</div>`;
}

function navButtons(bag, opts = {}) {
  const backAction = opts.backAction || 'wizard-back';
  const label = opts.label || 'Next';
  const back = opts.back !== false && bag.step > 0;
  return `<div class="wizard-nav">${back ? `<button type="button" class="btn btn-ghost" data-action="${backAction}">Back</button>` : '<span></span>'}<button class="btn btn-primary" type="submit">${esc(label)}</button></div>`;
}

function sidebar() {
  const current = parseHash().parts[0] || 'dashboard';
  const items = [
    ['dashboard', 'Dashboard', 'home'],
    ['clients', 'Clients', 'users'],
    ['proposals', 'Proposals', 'file'],
    ['bookings', 'Bookings', 'ticket'],
    ['payments', 'Payments', 'card'],
    ['messages', 'Messages', 'chat'],
    ['packages', 'Packages', 'box'],
    ['contracts', 'Contracts', 'pen'],
    ['calendar', 'Calendar', 'cal'],
    ['settings', 'Settings', 'gear']
  ];
  return `<aside class="sidebar">
    <a class="brand-lock" href="#/dashboard">${logo()}</a>
    <nav class="nav" aria-label="Studio">${items.map(([key, label, glyph]) => `<a href="#/${key}" ${current === key ? 'aria-current="page"' : ''}>${icon(glyph)}${label}</a>`).join('')}</nav>
    <div class="side-space"></div>
    <div class="side-user">${avatar(S.cache.account.name)}<span><span class="script side-script">${esc(S.cache.business.name)}</span><small>${esc(S.cache.account.name)}</small></span></div>
  </aside>`;
}

function topbar() {
  const messages = (S.cache.messages || []).slice(0, 5);
  return `<header class="topbar">
    <button class="nav-toggle" type="button" data-action="toggle-nav" aria-label="Open menu">${icon('menu')}</button>
    <label class="search"><span class="search-field">${icon('search')}<input id="globalSearch" placeholder="Search clients, proposals, or events" value="${esc(S.search)}" autocomplete="off"><div id="searchPop" class="search-pop" hidden></div></span></label>
    <div class="top-actions">
      <details class="pop"><summary class="icon-btn" aria-label="Recent messages">${icon('bell')}</summary>
        <div class="pop-panel">${messages.map((message) => `<a href="#/messages">${esc(message.title)}<small>${esc(message.clientName)}</small></a>`).join('') || '<p class="empty">No messages yet.</p>'}<a href="#/messages">Open messages</a></div>
      </details>
      <details class="pop"><summary aria-label="Account menu">${avatar(S.cache.account.name)}</summary>
        <div class="pop-panel"><a href="#/settings">Settings</a><a href="#/book/${esc(S.cache.business.slug)}">Client booking page</a><button type="button" data-action="logout">Log out</button></div>
      </details>
    </div>
  </header>`;
}

function shell(content) {
  return `<a class="skip" href="#main">Skip to content</a><div class="shell${S.nav ? ' nav-open' : ''}">${sidebar()}<div class="scrim" data-action="close-nav"></div><div class="workspace">${topbar()}<main class="view" id="main">${content}</main></div></div>${modalHTML()}`;
}

function pageHead(title, extra) {
  return `<div class="page-head"><div><h1>${esc(title)}</h1></div>${extra || ''}</div>`;
}

function chips(group, items) {
  const current = S.filters[group] || 'all';
  return `<div class="filters">${items.map(([id, label]) => `<button type="button" class="chip${current === id ? ' on' : ''}" data-action="filter" data-group="${group}" data-value="${id}">${esc(label)}</button>`).join('')}</div>`;
}

function dashboard() {
  const stats = S.cache.stats;
  const proposals = stats.recentProposals.map((row) => {
    const full = S.cache.proposals.find((item) => item.id === row.id);
    return `<a class="row" href="#/proposals/${row.id}">${thumb(full?.packageId)}<span class="row-main"><strong>${esc(row.name)}</strong><small>${esc(row.packageName)} · ${trimNum(row.hours)} hours<br>${esc(shortDate(row.date))}</small></span><span class="row-meta"><b>${money(row.amount)}</b>${pill(row.status)}</span></a>`;
  }).join('');
  const payments = stats.recentPayments.map((row) => {
    const full = S.cache.payments.find((item) => item.id === row.id);
    const href = full?.bookingId ? `#/bookings/${full.bookingId}` : '#/payments';
    return `<a class="row" href="${href}">${avatar(row.name)}<span class="row-main"><strong>${esc(row.name)}</strong><small>${esc(row.label)}<br>${esc(shortDate(row.date))}</small></span><span class="row-meta"><b>${money(row.amount)}</b>${pill('completed')}</span></a>`;
  }).join('');
  const upcoming = stats.upcoming.map((event) => {
    const chip = monthDay(event.date);
    return `<a class="row event-row" href="#/bookings/${event.id}"><span class="when"><span class="date-chip"><span>${esc(chip.mon)}</span><b>${chip.day}</b></span>${thumb(event.packageId)}</span><span class="row-main"><strong>${esc(event.eventName)}</strong><small>${esc(timeRange(event.startTime, event.endTime))}<br>${esc(event.location)}</small>${pill(event.status)}</span></a>`;
  }).join('');
  return `<div class="page-head"><div><h1>${greet()}, ${esc(S.cache.account.firstName)}!</h1><p>Here's what's happening with ${esc(S.cache.business.name)} today.</p></div><a class="btn btn-primary" href="#/proposals/new">${icon('plus')} Create Proposal</a></div>
    <section class="stats">
      <article class="stat"><div class="stat-top"><span class="stat-ico">${icon('card')}</span><span>Total Revenue</span></div><p class="stat-value">${money(stats.revenue)}</p><div class="stat-foot"><span class="trend">${stats.trend >= 0 ? '↑' : '↓'} ${Math.abs(stats.trend)}% <small>vs last month</small></span></div></article>
      <article class="stat"><div class="stat-top"><span class="stat-ico">${icon('file')}</span><span>Proposals Waiting</span></div><p class="stat-value">${stats.waiting}</p><div class="stat-foot"><a href="#/proposals">View &amp; Send</a></div></article>
      <article class="stat"><div class="stat-top"><span class="stat-ico">${icon('card')}</span><span>Payments Due</span></div><p class="stat-value">${stats.dueCount}</p><div class="stat-foot"><span>${money(stats.due)} due</span><a href="#/payments">Collect Payments</a></div></article>
      <article class="stat"><div class="stat-top"><span class="stat-ico">${icon('cal')}</span><span>Upcoming Events</span></div><p class="stat-value">${stats.upcomingCount}</p><div class="stat-foot"><a href="#/calendar">View Calendar</a></div></article>
    </section>
    <div class="dash">
      <div class="dash-main">
        <section class="quick"><h2>Quick Actions</h2><div class="quick-grid">
          <a href="#/proposals/new"><span class="qa-ico">${icon('file')}</span>Create Proposal</a>
          <a href="#/book/${esc(S.cache.business.slug)}"><span class="qa-ico">${icon('link')}</span>Booking Link</a>
          <a href="#/payments"><span class="qa-ico">${icon('card')}</span>Send Payment Link</a>
          <button type="button" data-action="open-client" style="border:0"><span class="qa-ico">${icon('plus')}</span>Add Client</button>
          <a href="#/calendar"><span class="qa-ico">${icon('cal')}</span>View Calendar</a>
        </div></section>
        <div class="dash-split">
          <section class="panel"><div class="panel-head"><h2>Recent Proposals</h2><a href="#/proposals">View all</a></div><div class="rows">${proposals || '<p class="empty">No proposals yet.</p>'}</div></section>
          <section class="panel"><div class="panel-head"><h2>Recent Payments</h2><a href="#/payments">View all</a></div><div class="rows">${payments || '<p class="empty">No payments yet.</p>'}</div></section>
        </div>
      </div>
      <section class="panel"><div class="panel-head"><h2>Upcoming Events</h2><a href="#/bookings">View all</a></div><div class="rows">${upcoming || '<p class="empty">Nothing on the books.</p>'}</div></section>
    </div>`;
}

function clientsPage() {
  const list = S.cache.clients.slice().sort((a, b) => a.name.localeCompare(b.name));
  return `${pageHead('Clients', '<button class="btn btn-primary" type="button" data-action="open-client">Add client</button>')}
    <div class="list-search"><input placeholder="Search clients" data-filter-list="clientRows"></div>
    <section class="panel"><div class="rows" id="clientRows">${list.map((client) => `<a class="row" data-find="${esc(`${client.name} ${client.email}`.toLowerCase())}" href="#/clients/${client.id}">${avatar(client.name)}<span class="row-main"><strong>${esc(client.name)}</strong><small>${esc(client.email)}${client.phone ? ` · ${esc(client.phone)}` : ''}</small></span><span class="row-meta"><small>${esc(client.company || 'Client')}</small></span></a>`).join('')}</div></section>`;
}

function clientDetail(id) {
  const client = clientById(id);
  if (!client) return '<h1>Client not found</h1>';
  const proposals = S.cache.proposals.filter((item) => item.clientId === id);
  const bookings = S.cache.bookings.filter((item) => item.clientId === id);
  const payments = S.cache.payments.filter((item) => item.clientId === id);
  const block = (title, rows) => `<section class="panel"><h2>${title}</h2><div class="rows">${rows || '<p class="empty">Nothing yet.</p>'}</div></section>`;
  return `${pageHead(client.name, `<button class="btn btn-ghost" type="button" data-action="edit-client" data-id="${esc(client.id)}">Edit</button>`)}
    <p class="lede">${esc(client.email)}${client.phone ? ` · ${esc(client.phone)}` : ''}</p>
    <div class="dash-split" style="margin-top:16px">
      ${block('Proposals', proposals.map((item) => `<a class="row" href="#/proposals/${item.id}"><span class="row-main"><strong>${esc(item.eventName)}</strong><small>${esc(shortDate(item.date))}</small></span><span class="row-meta"><b>${money(item.quote.total)}</b>${pill(item.status)}</span></a>`).join(''))}
      ${block('Events', bookings.map((item) => `<a class="row" href="#/bookings/${item.id}"><span class="row-main"><strong>${esc(item.eventName)}</strong><small>${esc(shortDate(item.date))}</small></span>${pill(item.status)}</a>`).join(''))}
    </div>
    <div style="margin-top:16px">${block('Payments', payments.map((item) => `<div class="row"><span class="row-main"><strong>${esc(item.label)}</strong><small>${esc(item.eventName)} · ${esc(shortDate(item.paidAt || item.createdAt))}</small></span><span class="row-meta"><b>${money(item.amount)}</b>${pill(item.status)}</span></div>`).join(''))}</div>`;
}

function proposalsPage() {
  const filter = S.filters.proposals;
  let list = S.cache.proposals.slice().sort((a, b) => b.activityAt.localeCompare(a.activityAt));
  if (filter === 'waiting') list = list.filter((item) => WAITING.has(item.status));
  if (filter === 'booked') list = list.filter((item) => item.status === 'booked');
  if (filter === 'declined') list = list.filter((item) => item.status === 'declined');
  return `${pageHead('Proposals', '<a class="btn btn-primary" href="#/proposals/new">Create proposal</a>')}
    ${chips('proposals', [['all', 'All'], ['waiting', 'Waiting'], ['booked', 'Booked'], ['declined', 'Declined']])}
    <div class="list-search"><input placeholder="Search proposals" data-filter-list="proposalRows"></div>
    <section class="panel"><div class="rows" id="proposalRows">${list.map((item) => `<a class="row" data-find="${esc(`${clientById(item.clientId)?.name || ''} ${item.eventName}`.toLowerCase())}" href="#/proposals/${item.id}">${thumb(item.packageId)}<span class="row-main"><strong>${esc(clientById(item.clientId)?.name || '')}</strong><small>${esc(item.quote.packageName)} · ${trimNum(item.quote.hours)} hours<br>${esc(shortDate(item.date))}</small></span><span class="row-meta"><b>${money(item.quote.total)}</b>${pill(item.status)}</span></a>`).join('') || '<p class="empty">No proposals in this view.</p>'}</div></section>`;
}

function bookingsPage() {
  const filter = S.filters.bookings;
  const today = todayISO();
  let list = S.cache.bookings.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  if (filter === 'upcoming') list = list.filter((item) => item.date >= today && item.status !== 'cancelled');
  if (filter === 'paid') list = list.filter((item) => item.status === 'paid' || item.status === 'deposit_paid');
  if (filter === 'due') list = list.filter((item) => item.status === 'deposit_due' || item.status === 'balance_due');
  return `${pageHead('Bookings', '<a class="btn btn-primary" href="#/bookings/new">Create event</a>')}
    ${chips('bookings', [['all', 'All'], ['upcoming', 'Upcoming'], ['due', 'Balance due'], ['paid', 'Paid']])}
    <section class="panel"><div class="rows">${list.map((item) => `<a class="row" href="#/bookings/${item.id}">${thumb(item.packageId)}<span class="row-main"><strong>${esc(item.eventName)}</strong><small>${esc(clientById(item.clientId)?.name || '')} · ${esc(shortDate(item.date))}<br>${esc(timeRange(item.startTime, item.endTime))}</small></span><span class="row-meta"><b>${money(item.quote.total)}</b>${pill(item.status)}</span></a>`).join('') || '<p class="empty">No events in this view.</p>'}</div></section>`;
}

function paymentsPage() {
  const filter = S.filters.payments;
  let list = S.cache.payments.slice().sort((a, b) => (b.paidAt || b.createdAt).localeCompare(a.paidAt || a.createdAt));
  if (filter !== 'all') list = list.filter((item) => item.status === filter);
  return `${pageHead('Payments', '')}
    ${chips('payments', [['all', 'All'], ['pending', 'Due'], ['completed', 'Completed']])}
    <section class="panel"><div class="rows">${list.map((item) => `<div class="row"><span class="row-main"><strong>${esc(clientById(item.clientId)?.name || S.cache.business.name)}</strong><small>${esc(item.eventName)} · ${esc(item.label)}<br>${esc(shortDate(item.paidAt || item.createdAt))}</small></span><span class="row-meta"><b>${money(item.amount)}</b>${pill(item.status)}${item.status === 'pending' ? `<button class="btn btn-soft" type="button" data-action="mark-paid" data-id="${esc(item.id)}" style="margin-top:8px">Mark paid</button>` : ''}</span></div>`).join('')}</div></section>`;
}

function proposalDetail(id) {
  const item = S.cache.proposals.find((proposal) => proposal.id === id);
  if (!item) return '<h1>Proposal not found</h1>';
  const link = `${location.origin}/#/p/${item.token}`;
  return `${pageHead(item.eventName, pill(item.status))}
    <p class="lede">${esc(clientById(item.clientId)?.name || '')}</p>
    <div class="detail-grid">
      <section class="card">${facts(item)}${item.notes ? `<p>${esc(item.notes)}</p>` : ''}${item.signature ? `<p class="fine">Signed ${esc(shortDate(item.signedAt))}</p><img class="sig-img" alt="Client signature" src="${item.signature.startsWith('data:image/png') ? item.signature : ''}">` : ''}</section>
      <section class="card">${quoteHTML(item.quote)}
        <div class="btn-row" style="margin-top:14px">
          <button class="btn btn-primary" type="button" data-action="copy-link" data-link="${esc(link)}">Copy client link</button>
          <a class="btn btn-ghost" href="#/p/${esc(item.token)}">Open as client</a>
          ${item.status !== 'booked' && item.status !== 'declined' ? `<button class="btn btn-soft" type="button" data-action="proposal-paid" data-id="${esc(item.id)}">Mark deposit paid</button>` : ''}
          ${item.status !== 'booked' ? `<button class="btn btn-danger" type="button" data-action="delete-proposal" data-id="${esc(item.id)}">Delete</button>` : ''}
        </div>
      </section>
    </div>`;
}

function bookingDetail(id) {
  const item = S.cache.bookings.find((booking) => booking.id === id);
  if (!item) return '<h1>Event not found</h1>';
  const payments = S.cache.payments.filter((payment) => payment.bookingId === id);
  const pendingBalance = payments.find((payment) => payment.type === 'balance' && payment.status === 'pending');
  const link = `${location.origin}/#/b/${item.token}`;
  return `${pageHead(item.eventName, pill(item.status))}
    <p class="lede">${esc(clientById(item.clientId)?.name || '')}</p>
    <div class="detail-grid">
      <section class="card">${facts(item)}${item.notes ? `<p>${esc(item.notes)}</p>` : ''}
        <h2 style="margin-top:18px">Payments</h2>
        <div class="rows">${payments.map((payment) => `<div class="row"><span class="row-main"><strong>${esc(payment.label)}</strong><small>${esc(payment.status)}</small></span><span class="row-meta"><b>${money(payment.amount)}</b>${payment.status === 'pending' ? `<button class="btn btn-soft" type="button" data-action="mark-paid" data-id="${esc(payment.id)}">Mark paid</button>` : ''}</span></div>`).join('') || '<p class="empty">No invoice yet.</p>'}</div>
      </section>
      <section class="card">${quoteHTML(item.quote)}
        <div class="btn-row" style="margin-top:14px">
          <button class="btn btn-primary" type="button" data-action="copy-link" data-link="${esc(link)}">Copy client link</button>
          <a class="btn btn-ghost" href="/api/public/booking/${esc(item.token)}/calendar.ics">Add to calendar</a>
          ${item.quote.balance > 0 && !pendingBalance && item.status !== 'cancelled' ? `<button class="btn btn-soft" type="button" data-action="invoice-balance" data-id="${esc(item.id)}">Invoice balance</button>` : ''}
          ${item.status !== 'cancelled' ? `<button class="btn btn-danger" type="button" data-action="cancel-booking" data-id="${esc(item.id)}">Cancel event</button>` : ''}
        </div>
      </section>
    </div>`;
}

function packagesPage() {
  return `${pageHead('Packages', '<button class="btn btn-primary" type="button" data-action="edit-package">Add package</button>')}
    <div class="catalog"><div class="pkg-admin">${S.cache.packages.map((pkg) => `<article><span class="thumb" style="${photoStyle(pkg)}"></span><div><strong>${esc(pkg.name)}</strong><small class="lede">${esc(pkg.tagline)} · ${esc(priceLabel(pkg))}</small><p>${esc(pkg.description)}</p></div><div class="btn-row"><button class="btn btn-ghost" type="button" data-action="edit-package" data-id="${esc(pkg.id)}">Edit</button><button class="btn btn-danger" type="button" data-action="delete-package" data-id="${esc(pkg.id)}">Delete</button></div></article>`).join('')}</div>
    <section class="panel"><div class="panel-head"><h2>Add-ons</h2><button class="btn btn-soft" type="button" data-action="edit-addon">Add</button></div>
      <div class="rows">${S.cache.addons.map((addon) => `<div class="row"><span class="row-main"><strong>${esc(addon.name)}</strong><small>${esc(addon.detail || '')}</small></span><span class="row-meta"><b>${money(addon.price)}</b><button class="btn btn-ghost" type="button" data-action="edit-addon" data-id="${esc(addon.id)}">Edit</button></span></div>`).join('')}</div>
    </section></div>`;
}

function contractPage() {
  const contract = S.cache.contract;
  return `${pageHead('Contract', '')}<form class="card stack" data-action="save-contract">
    <label class="field"><span>Title</span><input name="title" value="${esc(contract.title)}"></label>
    <label class="field"><span>Included points, one per line</span><textarea name="points">${esc((contract.points || []).join('\n'))}</textarea></label>
    <label class="field"><span>Agreement</span><textarea name="body" style="min-height:320px">${esc(contract.body)}</textarea></label>
    <p class="fine">Use {{business}} where the studio name should appear.</p>
    <button class="btn btn-primary" type="submit">Save contract</button>
  </form>`;
}

function calendarPage() {
  const now = S.cal || { y: new Date().getFullYear(), m: new Date().getMonth() };
  S.cal = now;
  const first = new Date(now.y, now.m, 1);
  const days = new Date(now.y, now.m + 1, 0).getDate();
  const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push('<div class="cal-day out"></div>');
  for (let day = 1; day <= days; day += 1) {
    const iso = `${now.y}-${String(now.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = S.cache.bookings.filter((booking) => booking.date === iso && booking.status !== 'cancelled');
    cells.push(`<div class="cal-day${iso === todayISO() ? ' today' : ''}"><strong>${day}</strong>${events.map((event) => `<a href="#/bookings/${event.id}">${esc(event.eventName)}</a>`).join('')}</div>`);
  }
  return `${pageHead('Calendar', '')}<section class="card"><div class="cal-head"><button class="btn btn-ghost" type="button" data-action="cal-move" data-dir="-1">Previous</button><h2>${esc(label)}</h2><button class="btn btn-ghost" type="button" data-action="cal-move" data-dir="1">Next</button></div><div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<div class="cal-dow">${day}</div>`).join('')}${cells.join('')}</div></section>`;
}

function messagesPage() {
  const filter = S.filters.messages;
  let list = S.cache.messages.slice();
  if (filter !== 'all') list = list.filter((message) => message.type === filter);
  if (!S.messageId || !list.some((message) => message.id === S.messageId)) S.messageId = list[0]?.id || '';
  const message = S.cache.messages.find((item) => item.id === S.messageId) || list[0];
  const externalHref = message && message.cta?.external ? safeHttp(message.cta.href) : '';
  const phone = message ? `<div class="phone"><div class="phone-screen"><div class="phone-top">${avatar(S.cache.business.name)}<div><span class="script">${esc(S.cache.business.name)}</span><small style="display:block;color:#8a8a96">${esc(message.clientName)}</small></div></div><p class="msg-meta">${esc(prettyDate(message.sendAt))} · ${esc(message.status)}</p><div class="bubble">${textToHtml(message.text)}</div>${message.cta && message.cta.href?.startsWith('#/') ? `<a class="btn btn-primary" href="${esc(message.cta.href)}">${esc(message.cta.label)}</a>` : ''}${externalHref ? `<a class="btn btn-primary" href="${esc(externalHref)}" target="_blank" rel="noopener">${esc(message.cta.label)}</a>` : ''}</div></div>` : '';
  return `${pageHead('Messages', '')}
    ${chips('messages', [['all', 'All'], ['booking_link', 'Booking link'], ['deposit_confirmation', 'Deposit'], ['balance_reminder', 'Balance'], ['event_reminder', 'Reminder'], ['thank_you', 'Thank you']])}
    <div class="messages"><section class="panel"><div class="rows">${list.map((item) => `<button class="row" type="button" data-action="open-message" data-id="${esc(item.id)}" style="width:100%;background:transparent;border:0;border-top:1px solid var(--line)"><span class="row-main"><strong>${esc(item.clientName)}</strong><small>${esc(item.title)} · ${esc(item.eventName || '')}</small></span>${pill(item.status === 'sent' ? 'sent' : 'scheduled')}</button>`).join('') || '<p class="empty">No messages yet.</p>'}</div></section>${phone}</div>`;
}

function settingsPage() {
  const business = S.cache.business;
  const settings = S.cache.settings;
  return `${pageHead('Settings', '')}<form class="card stack" data-action="save-settings">
    <div class="grid-2">
      ${labeled('Your name', 'accountName', S.cache.account.name)}
      ${labeled('Studio name', 'businessName', business.name)}
      ${labeled('Owner', 'owner', business.owner)}
      ${labeled('Studio email', 'email', business.email)}
      ${labeled('Phone', 'phone', business.phone)}
      ${labeled('City', 'city', business.city)}
      ${labeled('Booking slug', 'slug', business.slug)}
      ${labeled('Review link', 'reviewUrl', business.reviewUrl)}
    </div>
    ${labeled('Tagline', 'tagline', business.tagline, true)}
    <div class="grid-3">
      ${labeled('Deposit %', 'depositPercent', settings.depositPercent, false, 'number')}
      ${labeled('Gratuity %', 'gratuityPercent', settings.gratuityPercent, false, 'number')}
      ${labeled('Bartender after', 'bartenderThreshold', settings.bartenderThreshold, false, 'number')}
      ${labeled('Bartender fee', 'bartenderFee', settings.bartenderFee, false, 'number')}
      ${labeled('Travel $ / mile', 'travelPerMile', settings.travelPerMile, false, 'number')}
    </div>
    <p class="fine">New quotes use these rules. Hours come from the event times. PayMe records payments for this demo and does not hold funds.</p>
    <div class="btn-row"><button class="btn btn-primary" type="submit">Save settings</button><button class="btn btn-danger" type="button" data-action="reset-demo">Reset demo data</button></div>
  </form>`;
}

function labeled(label, name, value, wide, type) {
  return `<label class="field ${wide ? 'wide' : ''}"><span>${esc(label)}</span><input name="${esc(name)}" type="${type || 'text'}" value="${esc(value ?? '')}"></label>`;
}

function modalHTML() {
  if (!S.modal) return '';
  if (S.modal.type === 'client') {
    const client = clientById(S.modal.id) || { name: '', email: '', phone: '', company: '', notes: '' };
    return `<div class="modal-back"><form class="modal stack" data-action="save-client" role="dialog" aria-modal="true">
      <h2>${S.modal.id ? 'Edit client' : 'Add client'}</h2>
      <input type="hidden" name="id" value="${esc(S.modal.id || '')}">
      ${labeled('Name', 'name', client.name)}
      ${labeled('Email', 'email', client.email)}
      ${labeled('Phone', 'phone', client.phone)}
      ${labeled('Company', 'company', client.company)}
      <label class="field"><span>Notes</span><textarea name="notes">${esc(client.notes || '')}</textarea></label>
      <div class="btn-row"><button class="btn btn-primary" type="submit">Save</button><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>${S.modal.id ? `<button class="btn btn-danger" type="button" data-action="delete-client" data-id="${esc(S.modal.id)}">Delete</button>` : ''}</div>
    </form></div>`;
  }
  if (S.modal.type === 'package') {
    const pkg = S.cache.packages.find((item) => item.id === S.modal.id) || { name: '', tagline: '', description: '', price: '', pricing: 'flat', minimumHours: 2, includedHours: 3, image: '', highlights: [] };
    return `<div class="modal-back"><form class="modal stack" data-action="save-package" role="dialog" aria-modal="true">
      <h2>${S.modal.id ? 'Edit package' : 'Add package'}</h2>
      <input type="hidden" name="id" value="${esc(S.modal.id || '')}">
      ${labeled('Name', 'name', pkg.name)}
      ${labeled('Tagline', 'tagline', pkg.tagline)}
      <label class="field"><span>Description</span><textarea name="description">${esc(pkg.description || '')}</textarea></label>
      <div class="grid-2">${labeled('Price', 'price', pkg.price, false, 'number')}<label class="field"><span>Pricing</span><select name="pricing"><option value="flat"${pkg.pricing === 'flat' ? ' selected' : ''}>Flat</option><option value="hourly"${pkg.pricing === 'hourly' ? ' selected' : ''}>Hourly</option></select></label>
      ${labeled('Minimum hours', 'minimumHours', pkg.minimumHours || 2, false, 'number')}
      ${labeled('Included hours', 'includedHours', pkg.includedHours || 3, false, 'number')}</div>
      ${labeled('Photo URL', 'image', pkg.image, true)}
      <label class="field"><span>Highlights, one per line</span><textarea name="highlights">${esc((pkg.highlights || []).join('\n'))}</textarea></label>
      <div class="btn-row"><button class="btn btn-primary" type="submit">Save</button><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button></div>
    </form></div>`;
  }
  if (S.modal.type === 'addon') {
    const addon = S.cache.addons.find((item) => item.id === S.modal.id) || { name: '', detail: '', price: '' };
    return `<div class="modal-back"><form class="modal stack" data-action="save-addon" role="dialog" aria-modal="true">
      <h2>${S.modal.id ? 'Edit add-on' : 'Add add-on'}</h2>
      <input type="hidden" name="id" value="${esc(S.modal.id || '')}">
      ${labeled('Name', 'name', addon.name)}
      ${labeled('Detail', 'detail', addon.detail)}
      ${labeled('Price', 'price', addon.price, false, 'number')}
      <div class="btn-row"><button class="btn btn-primary" type="submit">Save</button><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>${S.modal.id ? `<button class="btn btn-danger" type="button" data-action="delete-addon" data-id="${esc(S.modal.id)}">Delete</button>` : ''}</div>
    </form></div>`;
  }
  return '';
}

function loginView(error) {
  document.body.classList.add('is-public');
  return `<div class="login"><section class="login-brand on-dark"><div>${logo()}<h1>Little Mixxy</h1><p>Proposals, contracts, and deposits for the studio — without chasing the balance.</p></div><p class="fine" style="color:#d0d0d6">PayMe does not process or hold funds.</p></section>
    <section class="login-panel"><form class="login-card stack" data-action="login"><h2>Welcome back</h2><p class="lede">Sign in to the Little Mixxy studio.</p>
      ${error ? `<p class="banner">${esc(error)}</p>` : ''}
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" value="danielle@littlemixxy.com" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" value="mixxy" required></label>
      <button class="btn btn-primary" type="submit">Enter studio</button>
      <div class="demo-box">Demo studio · <code>danielle@littlemixxy.com</code> · <code>mixxy</code></div>
      <a href="#/book/littlemixxy">Open the client booking page</a>
    </form></section></div>`;
}

function blankWizard(kind) {
  return {
    kind, step: 0, clientId: '', adding: false, newName: '', newEmail: '', newPhone: '', clientQuery: '',
    eventName: '', eventType: 'Birthday Party', date: '', startTime: '18:00', endTime: '21:00',
    location: '', miles: '', milesTouched: false, guests: '', notes: '', packageId: '',
    addonIds: [], addonQty: {}, paymentChoice: 'link', depositAmount: '', depositTouched: false,
    via: 'text', quote: null, error: '', result: null
  };
}

function stepList(bag) {
  if (bag.kind === 'proposal') return PROPOSAL_STEPS;
  if (bag.kind === 'booking') return BOOKING_STEPS;
  return BOOK_STEPS;
}

function packagesOf(bag) {
  return bag.kind === 'public' ? bag.studio.packages : S.cache.packages;
}

function addonsOf(bag) {
  return bag.kind === 'public' ? bag.studio.addons : S.cache.addons;
}

function eventTypesOf(bag) {
  const list = bag.kind === 'public' ? bag.studio.eventTypes : S.cache.eventTypes;
  return (list || []).map((type) => ({ value: type, label: type }));
}

function activeBag() {
  if (document.querySelector('[data-bag="flow"]')) return S.flow;
  if (document.querySelector('[data-bag="wizard"]')) return S.wizard;
  return null;
}

function readBag(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('[data-model]').forEach((el) => {
    const owner = el.closest('[data-bag]')?.dataset.bag === 'flow' ? S.flow : S.wizard;
    if (!owner) return;
    owner[el.dataset.model] = el.type === 'checkbox' ? el.checked : el.value;
  });
}

function quoteBody(bag) {
  const body = {
    packageId: bag.packageId,
    startTime: bag.startTime,
    endTime: bag.endTime,
    guests: Number(bag.guests) || 0,
    miles: bag.miles === '' || bag.miles == null ? 0 : Number(bag.miles),
    date: bag.date,
    addons: (bag.addonIds || []).map((id) => ({ id, qty: bag.addonQty?.[id] || 1 })),
    eventName: bag.eventName,
    eventType: bag.eventType,
    location: bag.location,
    notes: bag.notes,
    clientId: bag.clientId,
    via: bag.via,
    paymentChoice: bag.paymentChoice
  };
  if (bag.depositTouched && bag.depositAmount !== '' && Number.isFinite(Number(bag.depositAmount))) {
    body.depositAmount = Number(bag.depositAmount);
  }
  return body;
}

async function fetchQuote(bag) {
  const path = bag.kind === 'public' ? `/api/public/studio/${bag.slug}/quote` : '/api/quote';
  return api(path, { method: 'POST', body: quoteBody(bag) });
}

function validate(bag) {
  const id = stepList(bag)[bag.step][0];
  if (id === 'client') {
    if (bag.clientId) return '';
    if (bag.adding) {
      if (!String(bag.newName || '').trim()) return 'Enter a client name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bag.newEmail || '')) return 'Enter a valid email.';
      return '';
    }
    return 'Choose a client.';
  }
  if (id === 'details') {
    if (bag.kind === 'public') {
      if (!String(bag.firstName || '').trim()) return 'Enter your first name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bag.email || '')) return 'Enter a valid email.';
      if (bag.date && bag.date < todayISO()) return 'Choose a future date.';
      if ((bag.studio?.unavailableDates || []).includes(bag.date)) return 'That date is already reserved.';
    }
    if (!String(bag.eventName || '').trim()) return 'Enter an event name.';
    if (!bag.date) return 'Enter an event date.';
    if (!String(bag.location || '').trim()) return 'Enter a location.';
    if (!(Number(bag.guests) >= 1)) return 'Enter the guest count.';
    if (!(hoursBetween(bag.startTime, bag.endTime) > 0)) return 'End time has to be after the start time.';
  }
  if (id === 'package' && !bag.packageId) return 'Choose a package.';
  if (id === 'contract' && bag.kind === 'public') {
    if (!bag.agreed) return 'Agree to the terms before continuing.';
    if (!bag.signature) return 'Draw your signature to continue.';
  }
  if (id === 'payment' && bag.depositAmount !== '' && bag.quote && Math.round(Number(bag.depositAmount) * 100) > bag.quote.totalCents) {
    return 'Deposit cannot be more than the event total.';
  }
  return '';
}

async function advance(bag) {
  if (stepList(bag)[bag.step][0] === 'client' && !bag.clientId && bag.adding) {
    const client = await api('/api/clients', { method: 'POST', body: { name: bag.newName, email: bag.newEmail, phone: bag.newPhone } });
    bag.clientId = client.id;
    bag.adding = false;
    S.cache.clients.unshift(client);
  }
  const error = validate(bag);
  if (error) {
    bag.error = error;
    render();
    return;
  }
  const steps = stepList(bag);
  const next = bag.step + 1;
  if (next >= steps.length) return;
  const nextId = steps[next][0];
  if (['extras', 'pricing', 'review', 'payment', 'contract', 'send', 'addons', 'handoff', 'pay'].includes(nextId) && bag.packageId) {
    try { bag.quote = await fetchQuote(bag); }
    catch (err) { bag.error = err.message; render(); return; }
  }
  if (nextId === 'payment' && bag.quote && bag.depositAmount === '') bag.depositAmount = String(bag.quote.deposit);
  bag.error = '';
  bag.step = next;
  render();
}

function clientStep(bag) {
  const query = (bag.clientQuery || '').toLowerCase();
  const clients = S.cache.clients.filter((client) => !query || `${client.name} ${client.email}`.toLowerCase().includes(query));
  return `<form data-bag="wizard" data-action="wizard-next" class="stack">
    <input class="bare-input" data-model="clientQuery" placeholder="Search clients" value="${esc(bag.clientQuery || '')}">
    <div class="client-list">${clients.map((client) => `<button type="button" class="client-pick${client.id === bag.clientId ? ' on' : ''}" data-client="${esc(`${client.name} ${client.email}`.toLowerCase())}" data-action="pick-client" data-id="${esc(client.id)}">${avatar(client.name)}<span class="addon-copy"><strong>${esc(client.name)}</strong><small>${esc(client.email)}</small></span></button>`).join('') || '<p class="empty">No clients match.</p>'}</div>
    <button class="btn btn-soft" type="button" data-action="toggle-add">${bag.adding ? 'Cancel new client' : 'Add new client'}</button>
    ${bag.adding ? `<div class="grid-2">${field('Name', 'newName', bag.newName)}${field('Email', 'newEmail', bag.newEmail, { type: 'email' })}${field('Phone', 'newPhone', bag.newPhone, { wide: true })}</div>` : ''}
    ${navButtons(bag, { back: false })}
  </form>`;
}

function detailsFields(bag) {
  const contact = bag.kind === 'public' ? `<div class="grid-2">${field('First name', 'firstName', bag.firstName)}${field('Last name', 'lastName', bag.lastName)}${field('Email', 'email', bag.email, { type: 'email', wide: true })}${field('Phone', 'phone', bag.phone)}</div>` : '';
  const rate = bag.kind === 'public' ? bag.studio.settings.travelPerMile : S.cache.settings.travelPerMile;
  const city = bag.kind === 'public' ? bag.studio.business.city : S.cache.business.city;
  return `${contact}<div class="grid-2">
    ${field('Event name', 'eventName', bag.eventName, { wide: true, placeholder: "Sarah's Birthday" })}
    ${selectField('Event type', 'eventType', bag.eventType, eventTypesOf(bag))}
    ${field('Event date', 'date', bag.date, { type: 'date', min: bag.kind === 'public' ? todayISO() : '' })}
    ${field('Start', 'startTime', bag.startTime, { type: 'time' })}
    ${field('End', 'endTime', bag.endTime, { type: 'time' })}
    ${field('Location', 'location', bag.location, { wide: true, placeholder: 'Atlanta, GA' })}
    ${field('Travel miles', 'miles', bag.miles, { type: 'number', min: '0', step: '0.1' })}
    ${field('Guest count', 'guests', bag.guests, { type: 'number', min: '1' })}
    ${area('Notes', 'notes', bag.notes, 'Rooftop event. Pink and gold menu.')}
  </div>
  <div class="hours-banner"><span>Total hours (auto-calculated)</span><strong id="hoursLive">${esc(hoursText(bag))}</strong></div>
  <p class="help">Travel is ${money(rate)} per mile from ${esc(city)}. Enter 0 to waive it. A location fills in 25 miles until you change it.</p>`;
}

function packageStep(bag, action) {
  const selected = packagesOf(bag).find((pkg) => pkg.id === bag.packageId);
  return `<form data-bag="${bag.kind === 'public' ? 'flow' : 'wizard'}" data-action="${action}" class="stack">
    <div class="pkg-grid">${packagesOf(bag).map((pkg) => `<button type="button" class="pkg${pkg.id === bag.packageId ? ' on' : ''}" data-action="pick-package" data-id="${esc(pkg.id)}"><span class="pkg-photo" style="${photoStyle(pkg)}"></span><span class="pkg-copy"><strong>${esc(pkg.name)}</strong><small>${esc(pkg.tagline)}</small><em>${esc(priceLabel(pkg))}</em></span></button>`).join('')}</div>
    ${selected ? `<ul class="points">${(selected.highlights || []).map((item) => `<li>${icon('check')}<span>${esc(item)}</span></li>`).join('')}</ul><p>${esc(selected.description || '')}</p>` : ''}
    ${navButtons(bag, { backAction: bag.kind === 'public' ? 'flow-back' : 'wizard-back' })}
  </form>`;
}

function extrasStep(bag, action) {
  return `<form data-bag="${bag.kind === 'public' ? 'flow' : 'wizard'}" data-action="${action}" class="stack">
    ${addonsOf(bag).map((addon) => {
      const on = bag.addonIds.includes(addon.id);
      const qty = bag.addonQty[addon.id] || 1;
      return `<div class="addon${on ? ' on' : ''}"><button type="button" class="addon-main" data-action="toggle-addon" data-id="${esc(addon.id)}" aria-pressed="${on}"><span class="check">${on ? icon('check') : ''}</span><span class="addon-copy"><strong>${esc(addon.name)}</strong><small>${esc(addon.detail || '')}</small></span></button><strong class="price">${money(addon.price)}</strong>${on ? `<span class="stepper"><button type="button" data-action="qty" data-id="${esc(addon.id)}" data-dir="-1" aria-label="Fewer">−</button><span>${qty}</span><button type="button" data-action="qty" data-id="${esc(addon.id)}" data-dir="1" aria-label="More">+</button></span>` : ''}</div>`;
    }).join('')}
    <p class="auto-note">An additional bartender is added automatically when the guest count is over the studio threshold. Travel follows the miles on the event.</p>
    <div id="quoteLive"></div>
    ${navButtons(bag, { backAction: bag.kind === 'public' ? 'flow-back' : 'wizard-back' })}
  </form>`;
}

function wizardHTML() {
  const bag = S.wizard;
  if (bag.result) {
    const noun = bag.result.kind === 'proposal' ? 'Proposal sent' : 'Event created';
    return `<section class="wizard success"><div class="mark">${icon('check')}</div><h1>${noun}</h1><p>${bag.result.kind === 'proposal' ? 'The client link is in Messages. PayMe keeps the thread in the studio.' : 'Share the client link, or mark the deposit from the event.'}</p><p class="fine">${esc(bag.result.link)}</p><div class="btn-row" style="justify-content:center"><button class="btn btn-primary" type="button" data-action="copy-link" data-link="${esc(bag.result.link)}">Copy link</button><a class="btn btn-ghost" href="${esc(bag.result.hash)}">Open</a><button class="btn btn-soft" type="button" data-action="reset-wizard">Create another</button></div></section>`;
  }
  const steps = stepList(bag);
  const [id, title] = steps[bag.step];
  const action = id === 'send' ? 'save-proposal' : 'wizard-next';
  let body = '';
  if (id === 'client') body = clientStep(bag);
  else if (id === 'details') body = `<form data-bag="wizard" data-action="wizard-next" class="stack">${detailsFields(bag)}${navButtons(bag)}</form>`;
  else if (id === 'package') body = packageStep(bag, 'wizard-next');
  else if (id === 'extras') body = extrasStep(bag, 'wizard-next');
  else if (id === 'pricing') body = `<form data-bag="wizard" data-action="wizard-next" class="stack"><div id="quoteLive"></div>${navButtons(bag)}</form>`;
  else if (id === 'payment') body = paymentStep(bag);
  else if (id === 'review') body = `<form data-bag="wizard" data-action="${bag.kind === 'booking' ? 'save-booking' : 'wizard-next'}" class="stack">${facts(bag)}<div id="quoteLive"></div>${navButtons(bag, { label: bag.kind === 'booking' ? 'Create event' : 'Next' })}</form>`;
  else if (id === 'contract') body = `<form data-bag="wizard" data-action="wizard-next" class="stack"><ul class="points">${S.cache.contract.points.map((point) => `<li>${icon('check')}<span>${esc(point)}</span></li>`).join('')}</ul><div class="contract-box">${esc(S.cache.contract.body)}</div><p class="fine">The client signs this on their link before the deposit is collected.</p>${navButtons(bag)}</form>`;
  else if (id === 'send') {
    const client = clientById(bag.clientId);
    body = `<form data-bag="wizard" data-action="save-proposal" class="stack"><p>Send to <strong>${esc(client?.name || 'the client')}</strong></p><div class="choice-grid">${[['text', 'Text message', 'The booking text is saved to their thread.'], ['email', 'Email', 'The proposal email is saved to their thread.'], ['link', 'Private link', 'Copy a link to send yourself.']].map(([value, label, help]) => `<button type="button" class="choice${bag.via === value ? ' on' : ''}" data-action="pick-via" data-via="${value}"><span class="check">${bag.via === value ? icon('check') : ''}</span><span class="addon-copy"><strong>${label}</strong><small>${help}</small></span></button>`).join('')}</div>${navButtons(bag, { label: 'Send proposal' })}</form>`;
  }
  return `<section class="wizard"><p class="step-kicker">Step ${bag.step + 1} of ${steps.length}</p><ol class="steps">${steps.map((step, index) => `<li class="${index === bag.step ? 'on' : ''} ${index < bag.step ? 'done' : ''}">${index + 1} ${esc(step[1])}</li>`).join('')}</ol><div class="progress"><span style="width:${((bag.step + 1) / steps.length) * 100}%"></span></div><h1>${esc(title)}</h1>${bag.error ? `<p class="banner" role="alert">${esc(bag.error)}</p>` : ''}${body}</section>`;
}

function paymentStep(bag) {
  const choices = [['link', 'Send payment link', 'Client gets a link to pay the deposit.'], ['paid', 'Mark as paid', 'Record the deposit without a checkout.'], ['later', 'Add later', 'Save the event and invoice when you are ready.']];
  return `<form data-bag="wizard" data-action="wizard-next" class="stack">
    ${field('Deposit amount', 'depositAmount', bag.depositAmount, { type: 'number', min: '0', step: '0.01', help: 'Leave this as the suggested deposit, or type a custom amount.' })}
    <div class="choice-grid">${choices.map(([value, label, help]) => `<button type="button" class="choice${bag.paymentChoice === value ? ' on' : ''}" data-action="pick-pay" data-pay="${value}"><span class="check">${bag.paymentChoice === value ? icon('check') : ''}</span><span class="addon-copy"><strong>${label}</strong><small>${help}</small></span></button>`).join('')}</div>
    <div id="quoteLive"></div>
    ${navButtons(bag)}
  </form>`;
}

function wizardPage(kind) {
  if (!S.wizard || S.wizard.kind !== kind || S.wizard.result && S.wizard.kind !== kind) S.wizard = blankWizard(kind);
  if (!S.wizard || S.wizard.kind !== kind) S.wizard = blankWizard(kind);
  return wizardHTML();
}

function publicChrome(inner, wide) {
  const link = S.user ? '<a href="#/dashboard">Studio</a>' : '<a href="#/login">Studio login</a>';
  return `<div class="public-wrap"><div class="public-top">${logo()}${link}</div><div class="flow${wide ? ' wide' : ''}">${inner}</div></div>`;
}

function frame(inner, opts = {}) {
  return publicChrome(`<section class="flow-card" data-bag="flow">${opts.kicker ? `<p class="step-kicker">${opts.kicker}</p>` : ''}${opts.title ? `<h1>${opts.title}</h1>` : ''}${opts.error ? `<p class="banner" role="alert">${esc(opts.error)}</p>` : ''}${inner}</section>`, opts.wide);
}

function cardFields(amount) {
  return `<div class="brand-row"><strong>Secure checkout</strong><span class="lock">${icon('check')} Recorded in PayMe</span></div>
    <label class="field"><span>Name on card</span><input name="cardName" autocomplete="cc-name" required></label>
    <label class="field"><span>Card number</span><input name="cardNumber" inputmode="numeric" autocomplete="cc-number" data-card="number" placeholder="4242 4242 4242 4242" required></label>
    <div class="grid-2"><label class="field"><span>Expiry</span><input name="cardExp" placeholder="MM/YY" autocomplete="cc-exp" required></label><label class="field"><span>CVC</span><input name="cardCvc" inputmode="numeric" autocomplete="cc-csc" required></label></div>
    <p class="pay-note">Use 4242 4242 4242 4242. This demo records the payment and does not charge the card. PayMe does not hold funds.</p>
    <button class="btn btn-primary block" type="submit">Pay ${money(amount)}</button>`;
}

function bookScreens() {
  const flow = S.flow;
  const steps = BOOK_STEPS;
  const [id, title] = steps[flow.step] || steps[0];
  const kicker = id === 'welcome' ? '' : `Step ${flow.step + 1} of ${steps.length}`;
  let inner = '';
  let wide = false;
  if (id === 'welcome') {
    const business = flow.studio.business;
    const hello = flow.firstName ? `Hi ${flow.firstName}!` : 'Book your event';
    inner = `<form data-bag="flow" data-action="flow-next" class="stack"><p class="script" style="font-size:68px;margin:0">${esc(business.name)}</p><h1>${esc(hello)}</h1><p class="hero-copy">Choose a package, tell us about the event, sign the agreement, and pay the deposit to hold the date.</p><button class="btn btn-primary block" type="submit">Book your event</button><p class="fine">payme.app/${esc(business.slug)}</p><ul class="points"><li>${icon('check')}<span>Hours are calculated from the start and end time</span></li><li>${icon('check')}<span>An additional bartender is added over ${flow.studio.settings.bartenderThreshold} guests</span></li><li>${icon('check')}<span>Travel is charged from mileage</span></li></ul></form>`;
  } else if (id === 'package') inner = packageStep(flow, 'flow-next');
  else if (id === 'details') inner = `<form data-bag="flow" data-action="flow-next" class="stack">${detailsFields(flow)}${navButtons(flow, { backAction: 'flow-back' })}</form>`;
  else if (id === 'addons') inner = extrasStep(flow, 'flow-next');
  else if (id === 'review') {
    wide = true;
    inner = `<form data-bag="flow" data-action="flow-next" class="split"><div>${facts(flow)}<p>${esc(flow.notes || '')}</p>${navButtons(flow, { backAction: 'flow-back', label: 'Continue' })}</div><div class="summary-card" id="quoteLive"></div></form>`;
  } else if (id === 'contract') {
    inner = `<form data-bag="flow" data-action="flow-next" class="stack"><div class="contract-box">${esc(flow.studio.contract.body)}</div><ul class="points">${flow.studio.contract.points.map((point) => `<li>${icon('check')}<span>${esc(point)}</span></li>`).join('')}</ul><label class="agree"><input type="checkbox" data-model="agreed" ${flow.agreed ? 'checked' : ''}> <span>I agree to the terms and conditions.</span></label><canvas id="signPad" class="sign-pad" aria-label="Draw your signature"></canvas><button class="btn btn-ghost" type="button" data-action="clear-sign">Clear</button>${navButtons(flow, { backAction: 'flow-back', label: 'Continue to payment' })}</form>`;
  } else if (id === 'handoff') {
    inner = `<form data-bag="flow" data-action="flow-next" class="stack success"><div class="mark">${icon('check')}</div><h2 style="margin:0">You're leaving PayMe</h2><p>You'll continue to secure checkout to pay the deposit. In a live studio this step connects to the business's payment provider.</p><p class="fine">PayMe does not process or hold funds. This demo records the payment locally and does not charge the card.</p><button class="btn btn-primary" type="submit">Continue to checkout</button></form>`;
  } else if (id === 'pay') {
    wide = true;
    inner = `<form data-bag="flow" data-action="pay-public" class="split"><div class="stack card-form">${cardFields(flow.quote?.deposit || 0)}<button class="btn btn-ghost" type="button" data-action="flow-back">Back</button></div><div class="summary-card">${facts(flow)}<div id="quoteLive"></div></div></form>`;
  }
  return frame(inner, { kicker, title: id === 'welcome' || id === 'handoff' ? '' : title, error: flow.error, wide });
}

function proposalScreens() {
  const flow = S.flow;
  const proposal = flow.proposal;
  if (flow.declined) {
    return frame(`<h1>Proposal declined</h1><p>Thanks for letting ${esc(proposal.business.name)} know. The date has not been held.</p>`, { title: '' });
  }
  if (flow.step === 0) {
    return frame(`<div class="split"><div><p class="script" style="font-size:54px;margin:0">${esc(proposal.business.name)}</p><h1>${esc(proposal.eventName)}</h1><p>Hi ${esc(proposal.client?.firstName || 'there')} — review the details, then accept to sign and pay the deposit.</p>${facts(proposal)}<div class="btn-row"><button class="btn btn-primary" type="button" data-action="accept-proposal">Accept proposal</button><button class="btn btn-danger" type="button" data-action="decline-proposal">Decline</button></div></div><div class="summary-card">${quoteHTML(proposal.quote)}</div></div>`, { wide: true });
  }
  if (flow.step === 1) {
    return frame(`<form data-bag="flow" data-action="sign-proposal" class="stack"><div class="contract-box">${esc(proposal.contract.body)}</div><label class="agree"><input type="checkbox" data-model="agreed" ${flow.agreed ? 'checked' : ''}> <span>I agree to the terms and conditions.</span></label><canvas id="signPad" class="sign-pad" aria-label="Draw your signature"></canvas><button class="btn btn-ghost" type="button" data-action="clear-sign">Clear</button><div class="wizard-nav"><button class="btn btn-ghost" type="button" data-action="proposal-back">Back</button><button class="btn btn-primary" type="submit">Sign &amp; continue</button></div></form>${flow.error ? '' : ''}`, { title: 'Sign the agreement', error: flow.error });
  }
  if (flow.step === 2) {
    return frame(`<div class="stack success"><h2>You're leaving PayMe</h2><p>Next you'll pay the ${money(proposal.quote.deposit)} deposit. PayMe does not hold the funds. This demo records the payment and does not charge the card.</p><button class="btn btn-primary" type="button" data-action="proposal-next">Continue to checkout</button></div>`, { title: '' });
  }
  return frame(`<form data-action="pay-public" class="split"><div class="stack card-form">${cardFields(proposal.quote.deposit)}</div><div class="summary-card">${facts(proposal)}${quoteHTML(proposal.quote)}</div></form>`, { wide: true, title: 'Pay the deposit', error: flow.error });
}

function bookingLinkScreens() {
  const flow = S.flow;
  const booking = flow.booking;
  if (!booking.signature && flow.step === 0) {
    return frame(`<form data-bag="flow" data-action="sign-booking" class="stack"><p class="script" style="font-size:48px;margin:0">${esc(booking.business.name)}</p>${facts(booking)}<div class="contract-box">${esc(booking.contract.body)}</div><label class="agree"><input type="checkbox" data-model="agreed" ${flow.agreed ? 'checked' : ''}> <span>I agree to the terms and conditions.</span></label><canvas id="signPad" class="sign-pad" aria-label="Draw your signature"></canvas><button class="btn btn-primary" type="submit">Continue to payment</button></form>`, { title: booking.eventName, error: flow.error });
  }
  const due = flow.pending?.amount || 0;
  return frame(`<form data-action="pay-public" class="split"><div class="stack card-form">${cardFields(due)}</div><div class="summary-card">${facts(booking)}${quoteHTML(booking.quote)}</div></form>`, { wide: true, title: 'Pay your deposit', error: flow.error });
}

function paymentScreens() {
  const flow = S.flow;
  if (flow.needSign) {
    return frame(`<h1>Sign first</h1><p>The agreement needs a signature before this deposit can be paid.</p><a class="btn btn-primary" href="#/p/${esc(flow.needSign)}">Open the proposal</a>`);
  }
  const info = flow.payInfo;
  const amount = info.payment.amount;
  const summary = info.booking ? `${facts(info.booking)}${quoteHTML(info.booking.quote)}` : `<p><strong>${esc(info.payment.eventName)}</strong></p><div class="due-line"><span>${esc(info.payment.label)}</span><span>${money(amount)}</span></div>`;
  return frame(`<form data-action="pay-public" class="split"><div class="stack card-form">${cardFields(amount)}</div><div class="summary-card">${summary}</div></form>`, { wide: true, title: info.payment.label, error: flow.error });
}

function confirmedHTML(booking) {
  const business = booking.business || S.flow.studio?.business || S.flow.proposal?.business || {};
  const paid = (booking.payments || []).filter((payment) => payment.status === 'completed');
  const deposit = paid.find((payment) => payment.type === 'deposit' || payment.type === 'full') || paid[0];
  return frame(`<div class="success"><div class="mark">${icon('check')}</div><p class="script" style="font-size:48px;margin:0">${esc(business.name || '')}</p><h1>Booking confirmed</h1><p>Your event is booked.</p></div>
    ${facts(booking)}
    <div class="due-line" style="margin-top:12px"><span>Deposit paid</span><span>${money(deposit?.amount || booking.quote?.deposit || 0)}</span></div>
    <div class="quote-line"><span>Remaining balance</span><span>${money(booking.quote?.balance || 0)}</span></div>
    <div class="btn-row" style="margin-top:16px">${booking.token ? `<a class="btn btn-primary" href="/api/public/booking/${esc(booking.token)}/calendar.ics">Add to calendar</a><a class="btn btn-ghost" href="#/invoice/${esc(booking.token)}">View invoice</a>` : ''}</div>
    ${booking.token ? `<details style="margin-top:16px"><summary>View contract</summary><div class="contract-box">${esc(booking.contract?.body || '')}</div>${booking.signature ? `<img class="sig-img" alt="Signature" src="${booking.signature}">` : ''}</details>` : ''}`, { title: '' });
}

function invoiceHTML(booking) {
  const business = booking.business;
  return `<div class="public-wrap"><article class="invoice"><p class="fine">PayMe · ${esc(business.name)}</p><h1>${esc(business.name)}</h1><h2>${esc(booking.eventName)}</h2>${facts(booking)}${quoteHTML(booking.quote)}
    <h3>Payments</h3><div class="rows">${(booking.payments || []).map((payment) => `<div class="row"><span class="row-main"><strong>${esc(payment.label)}</strong><small>${esc(payment.status)}${payment.paidAt ? ` · ${esc(shortDate(payment.paidAt))}` : ''}</small></span><b>${money(payment.amount)}</b></div>`).join('')}</div>
    <p class="fine">PayMe does not process or hold funds. Amounts on this page are the studio's record.</p>
    <button class="btn btn-primary no-print" type="button" data-action="print">Print</button></article></div>`;
}

async function hydratePublic(parts, flow) {
  const [kind, id] = parts;
  if (kind === 'book') {
    flow.mode = 'book';
    flow.kind = 'public';
    flow.slug = id;
    flow.studio = await api(`/api/public/studio/${id}`);
    flow.firstName = parseHash().params.get('name') || '';
    flow.step = 0;
  } else if (kind === 'p') {
    flow.mode = 'proposal';
    flow.proposal = await api(`/api/public/proposal/${id}`);
    if (flow.proposal.status === 'declined') flow.declined = true;
    else if (flow.proposal.status === 'booked' && flow.proposal.bookingToken) {
      flow.done = true;
      flow.result = await api(`/api/public/booking/${flow.proposal.bookingToken}`);
    } else if (flow.proposal.signature && flow.proposal.payment?.status === 'pending') flow.step = 3;
    else flow.step = 0;
  } else if (kind === 'b') {
    flow.mode = 'booking';
    flow.booking = await api(`/api/public/booking/${id}`);
    const pending = (flow.booking.payments || []).find((payment) => payment.status === 'pending');
    if (!pending) {
      flow.done = true;
      flow.result = flow.booking;
    } else {
      flow.pending = pending;
      flow.step = flow.booking.signature ? 1 : 0;
    }
  } else if (kind === 'pay') {
    flow.mode = 'payment';
    flow.paymentId = id;
    flow.payInfo = await api(`/api/public/payment/${id}`);
    if (flow.payInfo.payment.status === 'completed' && flow.payInfo.booking) {
      flow.done = true;
      flow.result = flow.payInfo.booking;
    } else if (flow.payInfo.payment.status === 'completed') {
      flow.done = true;
      flow.result = { eventName: flow.payInfo.payment.eventName, business: flow.payInfo.business, client: flow.payInfo.client, payments: [flow.payInfo.payment], quote: { deposit: flow.payInfo.payment.amount, balance: 0, total: flow.payInfo.payment.amount }, status: 'paid' };
    } else if (flow.payInfo.proposal && !flow.payInfo.proposal.signature) flow.needSign = flow.payInfo.proposal.token;
  } else if (kind === 'invoice') {
    flow.mode = 'invoice';
    flow.booking = await api(`/api/public/booking/${id}`);
  }
}

function flowScreen() {
  const flow = S.flow;
  if (flow.mode === 'invoice') return invoiceHTML(flow.booking);
  if (flow.done) return confirmedHTML(flow.result);
  if (flow.mode === 'book') return bookScreens();
  if (flow.mode === 'proposal') return proposalScreens();
  if (flow.mode === 'booking') return bookingLinkScreens();
  if (flow.mode === 'payment') return paymentScreens();
  return frame('<h1>That link is not active.</h1>');
}

async function renderPublic(parts) {
  const key = parts.join('/');
  if (!S.flow || S.flow.key !== key) {
    const flow = {
      key, step: 0, addonIds: [], addonQty: {}, agreed: false, signature: '', error: '',
      firstName: '', lastName: '', email: '', phone: '', eventName: '', eventType: 'Birthday Party',
      date: '', startTime: '18:00', endTime: '21:00', location: '', miles: '', guests: '', notes: '',
      packageId: '', milesTouched: false
    };
    S.flow = flow;
    await hydratePublic(parts, flow);
  }
  return flowScreen();
}

function studioPage(parts) {
  const [a, b] = parts;
  if (!a || a === 'dashboard') return { title: 'Dashboard', html: dashboard() };
  if (a === 'clients' && b) return { title: 'Client', html: clientDetail(b) };
  if (a === 'clients') return { title: 'Clients', html: clientsPage() };
  if (a === 'proposals' && b === 'new') {
    if (!S.wizard || S.wizard.kind !== 'proposal') S.wizard = blankWizard('proposal');
    return { title: 'New proposal', html: wizardHTML() };
  }
  if (a === 'proposals' && b) return { title: 'Proposal', html: proposalDetail(b) };
  if (a === 'proposals') return { title: 'Proposals', html: proposalsPage() };
  if (a === 'bookings' && b === 'new') {
    if (!S.wizard || S.wizard.kind !== 'booking') S.wizard = blankWizard('booking');
    return { title: 'New event', html: wizardHTML() };
  }
  if (a === 'bookings' && b) return { title: 'Event', html: bookingDetail(b) };
  if (a === 'bookings') return { title: 'Bookings', html: bookingsPage() };
  if (a === 'payments') return { title: 'Payments', html: paymentsPage() };
  if (a === 'packages') return { title: 'Packages', html: packagesPage() };
  if (a === 'contracts') return { title: 'Contract', html: contractPage() };
  if (a === 'calendar') return { title: 'Calendar', html: calendarPage() };
  if (a === 'messages') return { title: 'Messages', html: messagesPage() };
  if (a === 'settings') return { title: 'Settings', html: settingsPage() };
  return { title: 'PayMe', html: '<h1>That page is not in the studio.</h1><a href="#/dashboard">Back to the dashboard</a>' };
}

function paintSearch() {
  const pop = document.getElementById('searchPop');
  if (!pop || !S.cache) return;
  const query = S.search.trim().toLowerCase();
  if (!query) { pop.hidden = true; return; }
  const items = [];
  S.cache.clients.forEach((client) => {
    if (`${client.name} ${client.email}`.toLowerCase().includes(query)) items.push(`<a href="#/clients/${client.id}">${esc(client.name)}<small>Client</small></a>`);
  });
  S.cache.proposals.forEach((item) => {
    if (`${item.eventName} ${clientById(item.clientId)?.name || ''}`.toLowerCase().includes(query)) items.push(`<a href="#/proposals/${item.id}">${esc(item.eventName)}<small>Proposal</small></a>`);
  });
  S.cache.bookings.forEach((item) => {
    if (`${item.eventName} ${item.location}`.toLowerCase().includes(query)) items.push(`<a href="#/bookings/${item.id}">${esc(item.eventName)}<small>Event</small></a>`);
  });
  pop.hidden = false;
  pop.innerHTML = items.slice(0, 8).join('') || '<p class="empty">No matches</p>';
}

function cardFrom(form) {
  return {
    name: form.cardName.value,
    number: form.cardNumber.value,
    exp: form.cardExp.value,
    cvc: form.cardCvc.value
  };
}

function initSignature(canvas) {
  if (!canvas || canvas.dataset.ready) return;
  canvas.dataset.ready = '1';
  const owner = canvas.closest('[data-bag]')?.dataset.bag === 'flow' ? S.flow : S.wizard;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, rect.width) * ratio;
  canvas.height = Math.max(1, rect.height) * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#17171c';
  let drawing = false;
  const point = (event) => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  if (owner?.signature) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = owner.signature;
  }
  canvas.addEventListener('pointerdown', (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const finish = () => {
    if (!drawing) return;
    drawing = false;
    if (owner) owner.signature = canvas.toDataURL('image/png');
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
}

function afterRender() {
  const canvas = document.getElementById('signPad');
  if (canvas) initSignature(canvas);
  const quoteEl = document.getElementById('quoteLive');
  const bag = activeBag();
  if (quoteEl && bag?.quote) quoteEl.innerHTML = quoteHTML(bag.quote);
  if (quoteEl && bag?.packageId) refreshLiveQuote(bag);
  const modalInput = document.querySelector('.modal input:not([type="hidden"])');
  if (modalInput) modalInput.focus();
}

async function refreshLiveQuote(bag) {
  const el = document.getElementById('quoteLive');
  if (!el || !bag?.packageId || !(hoursBetween(bag.startTime, bag.endTime) > 0)) return;
  try {
    bag.quote = await fetchQuote(bag);
    const live = document.getElementById('quoteLive');
    if (live) live.innerHTML = `${quoteHTML(bag.quote)}${stepList(bag)[bag.step]?.[0] === 'pricing' ? rulesHTML(bag) : ''}`;
  } catch (err) {
    const live = document.getElementById('quoteLive');
    if (live) live.innerHTML = `<p class="banner">${esc(err.message)}</p>`;
  }
}

function onField(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.card === 'number') {
    const digits = el.value.replace(/\D/g, '').slice(0, 19);
    el.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }
  if (el.dataset.model) {
    const owner = el.closest('[data-bag]')?.dataset.bag === 'flow' ? S.flow : S.wizard;
    if (owner) {
      owner[el.dataset.model] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.model === 'miles') owner.milesTouched = true;
      if (el.dataset.model === 'depositAmount') owner.depositTouched = true;
      if (el.dataset.model === 'location' && !owner.milesTouched && el.value.trim() && (owner.miles === '' || owner.miles == null)) {
        owner.miles = '25';
        const miles = el.closest('form')?.querySelector('[data-model="miles"]');
        if (miles && !miles.value) miles.value = '25';
      }
      if (el.dataset.model === 'clientQuery') {
        const query = el.value.toLowerCase();
        document.querySelectorAll('[data-client]').forEach((row) => { row.hidden = query && !row.dataset.client.includes(query); });
      }
      const hoursEl = document.getElementById('hoursLive');
      if (hoursEl) hoursEl.textContent = hoursText(owner);
      if (document.getElementById('quoteLive')) {
        clearTimeout(S.quoteTimer);
        S.quoteTimer = setTimeout(() => refreshLiveQuote(owner), 280);
      }
    }
  }
  if (el.dataset.filterList) {
    const query = el.value.toLowerCase();
    document.querySelectorAll(`#${el.dataset.filterList} .row`).forEach((row) => {
      row.hidden = Boolean(query) && !(row.dataset.find || '').includes(query);
    });
  }
  if (el.id === 'globalSearch') {
    S.search = el.value;
    paintSearch();
  }
}

const actions = {
  async login(form) {
    const body = Object.fromEntries(new FormData(form));
    const session = await api('/api/login', { method: 'POST', body });
    S.token = session.token;
    S.user = session;
    sessionStorage.setItem('pm_token', session.token);
    S.cache = null;
    if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
    else render();
  },
  async logout() {
    try { await api('/api/logout', { method: 'POST', body: {} }); } catch (err) { /* already signed out */ }
    S.token = '';
    S.user = null;
    S.cache = null;
    sessionStorage.removeItem('pm_token');
    location.hash = '#/login';
    render();
  },
  'toggle-nav'() { S.nav = !S.nav; document.querySelector('.shell')?.classList.toggle('nav-open', S.nav); },
  'close-nav'() { S.nav = false; document.querySelector('.shell')?.classList.remove('nav-open'); },
  'close-modal'() { S.modal = null; render(); },
  'open-client'() { S.modal = { type: 'client', id: '' }; render(); },
  'edit-client'(el) { S.modal = { type: 'client', id: el.dataset.id }; render(); },
  'edit-package'(el) { S.modal = { type: 'package', id: el.dataset.id || '' }; render(); },
  'edit-addon'(el) { S.modal = { type: 'addon', id: el.dataset.id || '' }; render(); },
  async 'save-client'(form) {
    const body = Object.fromEntries(new FormData(form));
    if (body.id) await api(`/api/clients/${body.id}`, { method: 'PUT', body });
    else await api('/api/clients', { method: 'POST', body });
    S.modal = null;
    toast('Client saved');
    await reload();
  },
  async 'delete-client'(el) {
    if (!window.confirm('Remove this client?')) return;
    await api(`/api/clients/${el.dataset.id}`, { method: 'DELETE' });
    S.modal = null;
    location.hash = '#/clients';
    await reload();
  },
  async 'save-package'(form) {
    const body = Object.fromEntries(new FormData(form));
    body.highlights = String(body.highlights || '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (body.id) await api(`/api/packages/${body.id}`, { method: 'PUT', body });
    else await api('/api/packages', { method: 'POST', body });
    S.modal = null;
    toast('Package saved');
    await reload();
  },
  async 'delete-package'(el) {
    if (!window.confirm('Delete this package?')) return;
    await api(`/api/packages/${el.dataset.id}`, { method: 'DELETE' });
    await reload();
  },
  async 'save-addon'(form) {
    const body = Object.fromEntries(new FormData(form));
    if (body.id) await api(`/api/addons/${body.id}`, { method: 'PUT', body });
    else await api('/api/addons', { method: 'POST', body });
    S.modal = null;
    toast('Add-on saved');
    await reload();
  },
  async 'delete-addon'(el) {
    if (!window.confirm('Delete this add-on?')) return;
    await api(`/api/addons/${el.dataset.id}`, { method: 'DELETE' });
    S.modal = null;
    await reload();
  },
  async 'save-contract'(form) {
    const body = Object.fromEntries(new FormData(form));
    body.points = String(body.points || '').split('\n').map((line) => line.trim()).filter(Boolean);
    await api('/api/contract', { method: 'PUT', body });
    toast('Contract saved');
    await reload();
  },
  async 'save-settings'(form) {
    const data = Object.fromEntries(new FormData(form));
    await api('/api/settings', { method: 'PUT', body: {
      accountName: data.accountName,
      business: { name: data.businessName, owner: data.owner, email: data.email, phone: data.phone, city: data.city, reviewUrl: data.reviewUrl, tagline: data.tagline, slug: data.slug },
      depositPercent: data.depositPercent, gratuityPercent: data.gratuityPercent, bartenderThreshold: data.bartenderThreshold, bartenderFee: data.bartenderFee, travelPerMile: data.travelPerMile
    } });
    toast('Settings saved');
    await reload();
  },
  async 'reset-demo'() {
    if (!window.confirm('Reset the studio back to the demo data?')) return;
    S.cache = await api('/api/reset', { method: 'POST', body: {} });
    S.wizard = null;
    toast('Demo data restored');
    render();
  },
  filter(el) { S.filters[el.dataset.group] = el.dataset.value; render(); },
  'cal-move'(el) {
    const dir = Number(el.dataset.dir);
    const date = new Date(S.cal.y, S.cal.m + dir, 1);
    S.cal = { y: date.getFullYear(), m: date.getMonth() };
    render();
  },
  'open-message'(el) { S.messageId = el.dataset.id; render(); },
  'copy-link'(el) { return copyText(el.dataset.link); },
  async 'mark-paid'(el) {
    await api(`/api/payments/${el.dataset.id}/paid`, { method: 'POST', body: {} });
    toast('Payment marked paid');
    await reload();
  },
  async 'invoice-balance'(el) {
    await api(`/api/bookings/${el.dataset.id}/invoice`, { method: 'POST', body: {} });
    toast('Balance invoiced');
    await reload();
  },
  async 'cancel-booking'(el) {
    if (!window.confirm('Cancel this event? Open payments will be voided.')) return;
    await api(`/api/bookings/${el.dataset.id}/cancel`, { method: 'POST', body: {} });
    await reload();
  },
  async 'delete-proposal'(el) {
    if (!window.confirm('Delete this proposal?')) return;
    await api(`/api/proposals/${el.dataset.id}`, { method: 'DELETE' });
    location.hash = '#/proposals';
    await reload();
  },
  async 'proposal-paid'(el) {
    await api(`/api/proposals/${el.dataset.id}/paid`, { method: 'POST', body: {} });
    toast('Deposit marked paid');
    await reload();
  },
  'pick-client'(el) {
    readBag(el.closest('form') || document);
    S.wizard.clientId = el.dataset.id;
    S.wizard.adding = false;
    S.wizard.error = '';
    render();
  },
  'toggle-add'(el) {
    readBag(el.closest('form') || document);
    S.wizard.adding = !S.wizard.adding;
    render();
  },
  'pick-package'(el) {
    const bag = activeBag();
    bag.packageId = el.dataset.id;
    bag.error = '';
    render();
  },
  'toggle-addon'(el) {
    const bag = activeBag();
    const id = el.dataset.id;
    bag.addonIds = bag.addonIds.includes(id) ? bag.addonIds.filter((item) => item !== id) : bag.addonIds.concat(id);
    bag.addonQty[id] = bag.addonQty[id] || 1;
    render();
  },
  qty(el) {
    const bag = activeBag();
    const id = el.dataset.id;
    bag.addonQty[id] = Math.max(1, Math.min(20, (bag.addonQty[id] || 1) + Number(el.dataset.dir)));
    render();
  },
  'pick-via'(el) { S.wizard.via = el.dataset.via; render(); },
  'pick-pay'(el) {
    readBag(el.closest('form') || document);
    S.wizard.paymentChoice = el.dataset.pay;
    render();
  },
  'wizard-back'() {
    readBag(document);
    S.wizard.step = Math.max(0, S.wizard.step - 1);
    S.wizard.error = '';
    render();
  },
  async 'wizard-next'(form) {
    readBag(form);
    await advance(S.wizard);
  },
  async 'save-proposal'(form) {
    readBag(form);
    const bag = S.wizard;
    const error = validate(bag);
    if (error) { bag.error = error; render(); return; }
    const data = await api('/api/proposals', { method: 'POST', body: quoteBody(bag) });
    bag.result = { kind: 'proposal', link: `${location.origin}${data.url}`, hash: `#/proposals/${data.proposal.id}`, id: data.proposal.id };
    S.cacheStale = true;
    await render();
  },
  async 'save-booking'(form) {
    readBag(form);
    const bag = S.wizard;
    const error = validate(bag);
    if (error) { bag.error = error; render(); return; }
    const data = await api('/api/bookings', { method: 'POST', body: quoteBody(bag) });
    bag.result = { kind: 'booking', link: `${location.origin}${data.url}`, hash: `#/bookings/${data.booking.id}`, id: data.booking.id };
    S.cacheStale = true;
    await render();
  },
  'reset-wizard'() {
    S.wizard = blankWizard(S.wizard?.kind || 'proposal');
    render();
  },
  'flow-back'() {
    readBag(document);
    S.flow.step = Math.max(0, S.flow.step - 1);
    S.flow.error = '';
    render();
  },
  async 'flow-next'(form) {
    readBag(form);
    await advance(S.flow);
  },
  'clear-sign'() {
    const bag = activeBag();
    if (bag) bag.signature = '';
    const canvas = document.getElementById('signPad');
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  },
  async 'accept-proposal'() {
    const flow = S.flow;
    if (!['accepted', 'pending_signature', 'deposit_due'].includes(flow.proposal.status)) {
      flow.proposal = await api(`/api/public/proposal/${flow.proposal.token}/accept`, { method: 'POST', body: {} });
    }
    flow.step = 1;
    flow.error = '';
    render();
  },
  async 'decline-proposal'() {
    const flow = S.flow;
    flow.proposal = await api(`/api/public/proposal/${flow.proposal.token}/decline`, { method: 'POST', body: {} });
    flow.declined = true;
    render();
  },
  'proposal-back'() { S.flow.step = 0; S.flow.error = ''; render(); },
  'proposal-next'() { S.flow.step += 1; render(); },
  async 'sign-proposal'(form) {
    readBag(form);
    const flow = S.flow;
    if (!flow.agreed) throw new Error('Agree to the terms before signing.');
    if (!flow.signature) throw new Error('Draw your signature to continue.');
    flow.proposal = await api(`/api/public/proposal/${flow.proposal.token}/sign`, { method: 'POST', body: { agreed: true, signature: flow.signature } });
    flow.step = 2;
    flow.error = '';
    render();
  },
  async 'sign-booking'(form) {
    readBag(form);
    if (!S.flow.agreed) throw new Error('Agree to the terms before continuing.');
    if (!S.flow.signature) throw new Error('Draw your signature to continue.');
    S.flow.step = 1;
    S.flow.error = '';
    render();
  },
  async 'pay-public'(form) {
    if (S.busy) return;
    S.busy = true;
    try {
      const card = cardFrom(form);
      const flow = S.flow;
      let result = null;
      if (flow.mode === 'book') {
        readBag(form);
        result = await api(`/api/public/studio/${flow.slug}/book`, { method: 'POST', body: { ...quoteBody(flow), firstName: flow.firstName, lastName: flow.lastName, email: flow.email, phone: flow.phone, agreed: true, signature: flow.signature, card } });
      } else if (flow.mode === 'proposal') {
        const paid = await api(`/api/public/proposal/${flow.proposal.token}/pay`, { method: 'POST', body: { card } });
        result = paid.booking;
      } else if (flow.mode === 'booking') {
        result = await api(`/api/public/booking/${flow.booking.token}/pay`, { method: 'POST', body: { card, agreed: true, signature: flow.signature || undefined, paymentId: flow.pending?.id } });
      } else if (flow.mode === 'payment') {
        const paid = await api(`/api/public/payment/${flow.paymentId}/pay`, { method: 'POST', body: { card } });
        result = paid.booking || { eventName: paid.payment.eventName, business: flow.payInfo.business, payments: [paid.payment], quote: { deposit: paid.payment.amount, balance: 0, total: paid.payment.amount }, status: 'paid' };
      }
      flow.done = true;
      flow.result = result;
      flow.error = '';
      S.cacheStale = true;
      render();
    } finally {
      S.busy = false;
    }
  },
  print() { window.print(); }
};

async function run(name, el) {
  const fn = actions[name];
  if (!fn) return;
  try {
    await fn(el);
  } catch (err) {
    const owner = activeBag();
    if (owner) {
      owner.error = err.message;
      render();
    } else toast(err.message);
  }
}

async function render() {
  const gen = ++S.gen;
  const { parts } = parseHash();
  const root = parts[0] || 'dashboard';
  const app = document.getElementById('app');
  const isPublic = ['book', 'p', 'b', 'pay', 'invoice'].includes(root);
  document.body.classList.toggle('is-public', isPublic);
  if (isPublic) {
    const key = parts.join('/');
    if (!S.flow || S.flow.key !== key) app.innerHTML = '<div class="boot-wrap"><p class="boot">Loading…</p></div>';
    try {
      const html = await renderPublic(parts);
      if (gen !== S.gen) return;
      app.innerHTML = html;
      document.title = 'Book · Little Mixxy';
      afterRender();
    } catch (err) {
      if (gen !== S.gen) return;
      app.innerHTML = publicChrome(`<section class="flow-card"><h1>Link unavailable</h1><p>${esc(err.message)}</p></section>`);
    }
    return;
  }
  if (!S.user && S.token) {
    try { S.user = await api('/api/me'); } catch (err) { S.token = ''; }
  }
  if (gen !== S.gen) return;
  if (!S.user) {
    app.innerHTML = loginView();
    document.title = 'Sign in · PayMe';
    return;
  }
  if (root === 'login') { location.hash = '#/dashboard'; return; }
  if (!S.cache || S.cacheStale) {
    app.innerHTML = '<div class="boot-wrap"><p class="boot">Loading the studio…</p></div>';
    try {
      S.cache = await api('/api/bootstrap');
      S.cacheStale = false;
    } catch (err) {
      if (gen !== S.gen) return;
      app.innerHTML = loginView(err.message);
      return;
    }
  }
  if (gen !== S.gen) return;
  const page = studioPage(parts);
  app.innerHTML = shell(page.html);
  document.title = `${page.title} · PayMe`;
  afterRender();
}

document.body.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.type === 'submit') return;
  event.preventDefault();
  run(el.dataset.action, el);
});
document.body.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
  event.preventDefault();
  run(form.dataset.action, form);
});
document.body.addEventListener('input', onField);
document.body.addEventListener('change', onField);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && S.modal) { S.modal = null; render(); }
});
window.addEventListener('hashchange', () => {
  S.modal = null;
  S.nav = false;
  const parts = parseHash().parts;
  if (parts[1] === 'new' && S.wizard?.result) S.wizard = null;
  render();
});

if (!location.hash) location.hash = '#/dashboard';
else render();
