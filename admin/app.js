import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/** A driver counts as online if their app checked in within this long. */
const ONLINE_MS = 5 * 60 * 1000;
const REFRESH_MS = 30 * 1000;

const $ = (id) => document.getElementById(id);
const state = { drivers: [], filter: 'all', search: '', openId: null, timer: null };

// ---------------------------------------------------------------------------
// Formatting. Driver details come from the public registration form, so every
// value is escaped before it goes into HTML.
// ---------------------------------------------------------------------------
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const money = (n) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-LK');
const colombo = { timeZone: 'Asia/Colombo' };
const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', { ...colombo, dateStyle: 'medium', timeStyle: 'short' }) : '—';
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { ...colombo, dateStyle: 'medium' }) : '—');
const mobile = (m) => {
  const d = String(m ?? '').replace(/^94/, '0');
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
};

function ago(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** online | hire | offline | deactivated */
function statusOf(d) {
  if (!d.active) return 'deactivated';
  if (d.on_hire_now) return 'hire';
  if (d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < ONLINE_MS) return 'online';
  return 'offline';
}

function badge(d) {
  switch (statusOf(d)) {
    case 'deactivated':
      return '<span class="badge badge-off">Deactivated</span>';
    case 'hire':
      return '<span class="badge badge-hire">On hire</span>';
    case 'online':
      return '<span class="badge badge-online">Online</span>';
    default:
      return `<span class="badge badge-offline">Offline</span><div class="sub">Seen ${esc(ago(d.last_seen_at))}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function isAdmin(userId) {
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return data != null;
}

function showLogin(message) {
  stopRefresh();
  $('app-view').hidden = true;
  $('panel').hidden = true;
  $('login-view').hidden = false;
  $('login-error').hidden = !message;
  $('login-error').textContent = message ?? '';
}

async function showApp() {
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  await loadDrivers();
  startRefresh();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  btn.disabled = true;
  $('login-error').hidden = true;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value,
  });
  btn.disabled = false;
  if (error) return showLogin(error.message.includes('Invalid login') ? 'Wrong email or password.' : error.message);
  if (!(await isAdmin(data.user.id))) {
    await supabase.auth.signOut();
    return showLogin('This account is not an admin.');
  }
  $('password').value = '';
  showApp();
});

$('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showLogin();
});

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------
async function loadDrivers() {
  const { data, error } = await supabase.from('driver_summary').select('*').order('full_name');
  if (error) {
    $('list-error').hidden = false;
    $('list-error').textContent = `Could not load drivers: ${error.message}`;
    return;
  }
  $('list-error').hidden = true;
  state.drivers = data ?? [];
  $('updated').textContent = `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  renderStats();
  renderTable();
  if (state.openId) renderPanel(state.openId, false);
}

function renderStats() {
  const ds = state.drivers;
  const count = (s) => ds.filter((d) => statusOf(d) === s).length;
  const tiles = [
    ['Registered drivers', ds.length, 'stat-yellow'],
    ['Online now', count('online') + count('hire'), 'stat-green'],
    ['On hire now', count('hire'), 'stat-blue'],
    ['Trips today', ds.reduce((a, d) => a + Number(d.trips_today || 0), 0), 'stat-purple'],
    ['Fares today', money(ds.reduce((a, d) => a + Number(d.fares_today || 0), 0)), 'stat-green'],
    ['Deactivated', count('deactivated'), 'stat-red'],
  ];
  $('stats').innerHTML = tiles
    .map(([label, value, cls]) => `<div class="stat ${cls}"><span class="label">${label}</span><span class="value">${esc(value)}</span></div>`)
    .join('');
}

function visibleDrivers() {
  const q = state.search.toLowerCase();
  return state.drivers.filter((d) => {
    if (state.filter !== 'all' && statusOf(d) !== state.filter) return false;
    if (!q) return true;
    return [d.full_name, d.mobile, mobile(d.mobile), d.vehicle_no, d.nic, d.licence_no]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  });
}

function renderTable() {
  const rows = visibleDrivers();
  $('empty').hidden = rows.length > 0;
  $('drivers').innerHTML = rows
    .map(
      (d) => `
      <tr data-id="${esc(d.id)}" class="${d.active ? '' : 'is-off'}">
        <td><div class="name">${esc(d.full_name)}</div><div class="sub">${esc(mobile(d.mobile))}</div></td>
        <td>${badge(d)}</td>
        <td>${esc(d.vehicle_no)}</td>
        <td class="num">${esc(d.trips_today)} · ${esc(money(d.fares_today))}</td>
        <td class="num">${esc(d.trips)} · ${esc(money(d.total_fares))}</td>
        <td>${esc(date(d.registered_at))}</td>
        <td class="num">${toggleButton(d)}</td>
      </tr>`,
    )
    .join('');
}

const toggleButton = (d) =>
  d.active
    ? `<button class="btn btn-danger" data-toggle="${esc(d.id)}">Deactivate</button>`
    : `<button class="btn btn-success" data-toggle="${esc(d.id)}">Activate</button>`;

async function toggleDriver(id) {
  const d = state.drivers.find((x) => x.id === id);
  if (!d) return;
  const turnOn = !d.active;
  const question = turnOn
    ? `Activate ${d.full_name}? They will be able to log in and use the meter again.`
    : `Deactivate ${d.full_name}? They won't be able to log in or start new hires. A hire already running can be finished.`;
  if (!confirm(question)) return;
  const { error } = await supabase.from('drivers').update({ active: turnOn }).eq('id', id);
  if (error) {
    alert(`Could not change the status: ${error.message}`);
    return;
  }
  await loadDrivers();
}

$('drivers').addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    e.stopPropagation();
    toggleDriver(toggle.dataset.toggle);
    return;
  }
  const row = e.target.closest('tr[data-id]');
  if (row) renderPanel(row.dataset.id, true);
});

$('filters').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (!chip) return;
  state.filter = chip.dataset.filter;
  document.querySelectorAll('#filters .chip').forEach((c) => c.classList.toggle('chip-on', c === chip));
  renderTable();
});

$('search').addEventListener('input', (e) => {
  state.search = e.target.value.trim();
  renderTable();
});

$('refresh-btn').addEventListener('click', () => loadDrivers());

// ---------------------------------------------------------------------------
// Driver detail panel
// ---------------------------------------------------------------------------
async function renderPanel(id, open) {
  const d = state.drivers.find((x) => x.id === id);
  if (!d) return;
  state.openId = id;
  if (open) $('panel').hidden = false;

  const head = `
    <div>
      <h1>${esc(d.full_name)}</h1>
      <div style="margin-top:8px">${badge(d)}</div>
    </div>
    <div class="card">
      <dl class="details">
        <dt>Mobile</dt><dd>${esc(mobile(d.mobile))}</dd>
        <dt>Tuk tuk</dt><dd>${esc(d.vehicle_no)}</dd>
        <dt>NIC</dt><dd>${esc(d.nic)}</dd>
        <dt>Licence</dt><dd>${esc(d.licence_no)}</dd>
        <dt>Address</dt><dd>${esc(d.address)}</dd>
        <dt>Registered</dt><dd>${esc(dateTime(d.registered_at))}</dd>
        <dt>Last seen</dt><dd>${esc(d.last_seen_at ? `${dateTime(d.last_seen_at)} (${ago(d.last_seen_at)})` : 'never')}</dd>
        <dt>Today</dt><dd>${esc(d.trips_today)} trips · ${esc(money(d.fares_today))}</dd>
        <dt>All time</dt><dd>${esc(d.trips)} trips · ${esc(money(d.total_fares))} · ${esc(d.total_km)} km</dd>
        ${d.active ? '' : `<dt>Deactivated</dt><dd>${esc(dateTime(d.deactivated_at))}</dd>`}
      </dl>
    </div>
    <div class="actions">${toggleButton(d)}</div>
    <h2>Recent trips</h2>`;
  $('panel-body').innerHTML = `${head}<div class="card" id="trips"><p class="muted">Loading…</p></div>`;

  const { data, error } = await supabase
    .from('trip_log')
    .select('trip_id,started_at_utc,status,km,duration,waiting,total,start_address,end_address,map_link')
    .eq('driver_id', id)
    .order('started_at_utc', { ascending: false })
    .limit(20);
  if (state.openId !== id) return;
  const box = $('trips');
  if (error) {
    box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
    return;
  }
  if (!data.length) {
    box.innerHTML = '<p class="muted">No trips yet.</p>';
    return;
  }
  box.innerHTML = data
    .map(
      (t) => `
      <div class="trip">
        <div class="trip-top">
          <span>${esc(dateTime(t.started_at_utc))}</span>
          <span>${t.status === 'in_progress' ? '<span class="badge badge-hire">In progress</span> ' : ''}${esc(money(t.total))}</span>
        </div>
        <div class="sub">${esc(t.km)} km · ${esc(t.duration)} · waiting ${esc(t.waiting)}</div>
        ${t.start_address || t.end_address ? `<div class="sub">${esc(t.start_address ?? '?')} → ${esc(t.end_address ?? '?')}</div>` : ''}
        ${t.map_link ? `<a href="${esc(t.map_link)}" target="_blank" rel="noopener">Open route in Google Maps</a>` : ''}
      </div>`,
    )
    .join('');
}

$('panel').addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) return toggleDriver(toggle.dataset.toggle);
  if (e.target === $('panel') || e.target.closest('#panel-close')) {
    $('panel').hidden = true;
    state.openId = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('panel').hidden) {
    $('panel').hidden = true;
    state.openId = null;
  }
});

// ---------------------------------------------------------------------------
// Refresh: statuses change as drivers come online and start hires.
// ---------------------------------------------------------------------------
function startRefresh() {
  stopRefresh();
  state.timer = setInterval(() => {
    if (!document.hidden) loadDrivers();
  }, REFRESH_MS);
}

function stopRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

// Start: resume a saved admin session, otherwise show the login.
const { data: start } = await supabase.auth.getSession();
if (start.session && (await isAdmin(start.session.user.id))) showApp();
else showLogin();
