import './styles.css';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Html5Qrcode } from 'html5-qrcode';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE || 'admin123';
const SECURITY_PASSCODE = import.meta.env.VITE_SECURITY_PASSCODE || 'gate123';

const app = document.querySelector('#app');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  app.innerHTML = `<main class="page"><section class="card"><h1>Setup required</h1><p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify environment variables.</p></section></main>`;
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = { scanner: null };

function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}
function normalizeId(value) {
  return String(value || '').trim().toUpperCase();
}
function cleanText(value) {
  return String(value || '').trim();
}
function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
async function sha256(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function makeToken(employeeId, contact) {
  return (await sha256(`${employeeId}|${sanitizePhone(contact)}|${SUPABASE_URL}|asiri-bollywood-night-2026`)).slice(0, 32);
}
function passUrl(emp) {
  return `${location.origin}${location.pathname}#/pass?id=${encodeURIComponent(emp.employee_id)}&token=${encodeURIComponent(emp.qr_token)}`;
}
function scannerUrlPayload(emp) {
  return `${location.origin}${location.pathname}#/scan?id=${encodeURIComponent(emp.employee_id)}&token=${encodeURIComponent(emp.qr_token)}`;
}
function layout(content, narrow=false) {
  if (state.scanner) {
    state.scanner.stop().catch(() => {});
    state.scanner = null;
  }
  app.innerHTML = `<main class="page"><section class="card ${narrow ? 'narrow' : ''}">${content}</section></main>`;
}
function nav(active='') {
  return `<nav class="nav">
    <a class="${active==='employee'?'active':''}" href="#/">Employee Portal</a>
    <a class="${active==='admin'?'active':''}" href="#/admin">Admin Portal</a>
    <a class="${active==='security'?'active':''}" href="#/security">Security Portal</a>
  </nav>`;
}

function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/admin')) return renderAdmin();
  if (hash.startsWith('#/security')) return renderSecurity();
  if (hash.startsWith('#/scan')) return renderScanResult();
  if (hash.startsWith('#/pass')) return renderPass();
  return renderEmployeePortal();
}

function renderEmployeePortal() {
  layout(`${nav('employee')}
    <div class="hero-mini">ASIRI LABORATORIES</div>
    <h1>Bollywood Night 2026</h1>
    <p class="muted">Enter your EPF and contact number to view your QR entry pass.</p>
    <div class="formbox">
      <label>EPF / Employee ID</label>
      <input id="employeeId" placeholder="Example: 12345" autocomplete="off" />
      <label>Contact Number</label>
      <input id="contact" placeholder="Example: 0771234567" inputmode="tel" />
      <button id="getPass" class="btn full">Get My QR Pass</button>
    </div>
    <div id="message"></div>
  `, true);
  document.querySelector('#getPass').onclick = generateOrShowPass;
}

async function generateOrShowPass() {
  const employeeId = normalizeId(document.querySelector('#employeeId').value);
  const contact = sanitizePhone(document.querySelector('#contact').value);
  const message = document.querySelector('#message');
  if (!employeeId || !contact) {
    message.innerHTML = `<div class="notice error">Enter both EPF and contact number.</div>`;
    return;
  }

  const { data: emp, error } = await supabase.from('employees').select('*').eq('employee_id', employeeId).maybeSingle();
  if (error) {
    message.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!emp || sanitizePhone(emp.contact) !== contact) {
    message.innerHTML = `<div class="notice error"><b>No valid paid registration found.</b><br>Please contact organizers.</div>`;
    return;
  }

  let updated = emp;
  if (!emp.qr_generated || !emp.qr_token) {
    const token = await makeToken(emp.employee_id, emp.contact);
    const { data, error: updateError } = await supabase.from('employees')
      .update({ qr_generated: true, qr_generated_at: new Date().toISOString(), qr_token: token })
      .eq('employee_id', emp.employee_id)
      .select('*')
      .single();
    if (updateError) {
      message.innerHTML = `<div class="notice error">${escapeHtml(updateError.message)}</div>`;
      return;
    }
    updated = data;
  }
  location.hash = `#/pass?id=${encodeURIComponent(updated.employee_id)}&token=${encodeURIComponent(updated.qr_token)}`;
}

async function renderPass() {
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const id = normalizeId(params.get('id'));
  const token = cleanText(params.get('token'));
  const { data: emp } = await supabase.from('employees').select('*').eq('employee_id', id).maybeSingle();

  if (!emp || emp.qr_token !== token || !emp.qr_generated) {
    layout(`${nav('employee')}<h1>Invalid Pass</h1><div class="notice error">Please contact organizers.</div>`, true);
    return;
  }
  const qrData = await QRCode.toDataURL(scannerUrlPayload(emp), { width: 360, margin: 1, errorCorrectionLevel: 'M' });
  layout(`${nav('employee')}
    <div class="ticket">
      <div class="hero-mini">ASIRI LABORATORIES</div>
      <h1>Bollywood Night 2026</h1>
      <p class="muted">Entry QR Pass</p>
      <img class="bigqr" src="${qrData}" alt="QR pass" />
      <h2>${escapeHtml(emp.full_name)}</h2>
      <p><b>EPF:</b> ${escapeHtml(emp.employee_id)}</p>
      <p><b>Contact:</b> ${escapeHtml(emp.contact)}</p>
      <p><b>Status:</b> ${escapeHtml(emp.ticket_status)}</p>
      <div class="notice ${emp.checked_in ? 'warn' : 'success'}">${emp.checked_in ? `Already checked in at ${formatTime(emp.checked_in_at)}` : 'Show this QR at the entrance.'}</div>
      <a class="btn full" download="Bollywood_Night_${escapeHtml(emp.employee_id)}.png" href="${qrData}">Download QR</a>
    </div>
  `, true);
}

function requirePasscode(type, afterLogin) {
  const key = type === 'admin' ? 'bn_admin' : 'bn_security';
  const expected = type === 'admin' ? ADMIN_PASSCODE : SECURITY_PASSCODE;
  if (sessionStorage.getItem(key) === 'true') return false;
  layout(`${nav(type === 'admin' ? 'admin' : 'security')}
    <h1>${type === 'admin' ? 'Admin' : 'Security'} Login</h1>
    <p class="muted">Enter passcode to continue.</p>
    <input id="passcode" type="password" placeholder="Passcode" />
    <button class="btn full" id="login">Login</button>
    <div id="loginMsg"></div>
  `, true);
  document.querySelector('#login').onclick = () => {
    if (document.querySelector('#passcode').value.trim() === expected) {
      sessionStorage.setItem(key, 'true');
      afterLogin();
    } else {
      document.querySelector('#loginMsg').innerHTML = `<div class="notice error">Wrong passcode.</div>`;
    }
  };
  return true;
}

async function renderAdmin() {
  if (requirePasscode('admin', renderAdmin)) return;
  layout(`${nav('admin')}
    <div class="topline"><div><div class="hero-mini">Admin Portal</div><h1>Paid Master List</h1></div><button class="btn outline" id="logout">Logout</button></div>
    <div class="stats" id="stats"></div>
    <div class="grid2">
      <section class="panel">
        <h2>Upload Paid Employees</h2>
        <p class="muted small">Excel/CSV columns accepted: employee_id or EPF, full_name or Full Name, contact, ticket_status.</p>
        <input type="file" id="fileUpload" accept=".csv,.xlsx,.xls" />
        <button class="btn full" id="uploadBtn">Upload File</button>
        <a class="link" href="/paid-employees-template.csv" download>Download CSV Template</a>
        <div id="uploadMsg"></div>
      </section>
      <section class="panel">
        <h2>+ Add Paid Employee</h2>
        <label>EPF / Employee ID</label><input id="addId" placeholder="12345" />
        <label>Full Name</label><input id="addName" placeholder="Nimal Perera" />
        <label>Contact</label><input id="addContact" placeholder="0771234567" />
        <label>Ticket Status</label>
        <select id="addStatus"><option>Paid</option><option>Complimentary</option></select>
        <button class="btn full" id="addBtn">Save Employee</button>
        <div id="addMsg"></div>
      </section>
    </div>
    <section class="panel">
      <div class="topline"><h2>Employee Tickets</h2><button class="btn outline" id="refreshBtn">Refresh</button></div>
      <input id="search" placeholder="Search EPF, name or contact" />
      <div id="table"></div>
    </section>
  `);
  document.querySelector('#logout').onclick = () => { sessionStorage.removeItem('bn_admin'); renderAdmin(); };
  document.querySelector('#uploadBtn').onclick = uploadPaidFile;
  document.querySelector('#addBtn').onclick = addPaidEmployee;
  document.querySelector('#refreshBtn').onclick = loadAdminTable;
  document.querySelector('#search').oninput = loadAdminTable;
  await loadAdminTable();
}

function mapRow(row) {
  const keys = Object.keys(row).reduce((acc, k) => { acc[k.toLowerCase().trim().replace(/\s+/g, '_')] = row[k]; return acc; }, {});
  const employee_id = normalizeId(keys.employee_id || keys.epf || keys.employeeid || keys.employee);
  const full_name = cleanText(keys.full_name || keys.name || keys.fullname || keys['full_name']);
  const contact = sanitizePhone(keys.contact || keys.phone || keys.mobile || keys.contact_number);
  const statusRaw = cleanText(keys.ticket_status || keys.status || 'Paid');
  const ticket_status = statusRaw.toLowerCase().startsWith('comp') ? 'Complimentary' : 'Paid';
  return { employee_id, full_name, contact, ticket_status };
}
async function uploadPaidFile() {
  const file = document.querySelector('#fileUpload').files[0];
  const msg = document.querySelector('#uploadMsg');
  if (!file) { msg.innerHTML = `<div class="notice error">Choose an Excel or CSV file first.</div>`; return; }
  try {
    let rows = [];
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text();
      rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
    } else {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    }
    const mapped = rows.map(mapRow).filter(r => r.employee_id && r.full_name && r.contact);
    const withTokens = [];
    for (const r of mapped) withTokens.push({ ...r, qr_token: await makeToken(r.employee_id, r.contact), qr_generated: false, checked_in: false });
    if (!withTokens.length) { msg.innerHTML = `<div class="notice error">No valid rows found. Check your column names.</div>`; return; }
    const { error } = await supabase.from('employees').upsert(withTokens, { onConflict: 'employee_id' });
    if (error) throw error;
    msg.innerHTML = `<div class="notice success">Uploaded ${withTokens.length} paid employees.</div>`;
    await loadAdminTable();
  } catch (err) {
    msg.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
  }
}
async function addPaidEmployee() {
  const employee_id = normalizeId(document.querySelector('#addId').value);
  const full_name = cleanText(document.querySelector('#addName').value);
  const contact = sanitizePhone(document.querySelector('#addContact').value);
  const ticket_status = document.querySelector('#addStatus').value;
  const msg = document.querySelector('#addMsg');
  if (!employee_id || !full_name || !contact) { msg.innerHTML = `<div class="notice error">EPF, name and contact are required.</div>`; return; }
  const qr_token = await makeToken(employee_id, contact);
  const { error } = await supabase.from('employees').upsert({ employee_id, full_name, contact, ticket_status, qr_token, qr_generated: false, checked_in: false }, { onConflict: 'employee_id' });
  if (error) msg.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
  else {
    msg.innerHTML = `<div class="notice success">Saved.</div>`;
    document.querySelector('#addId').value = '';
    document.querySelector('#addName').value = '';
    document.querySelector('#addContact').value = '';
    await loadAdminTable();
  }
}
async function loadAdminTable() {
  const search = cleanText(document.querySelector('#search')?.value || '');
  let query = supabase.from('employees').select('*').order('employee_id', { ascending: true });
  if (search) query = query.or(`employee_id.ilike.%${search}%,full_name.ilike.%${search}%,contact.ilike.%${search}%`);
  const { data, error } = await query;
  const table = document.querySelector('#table');
  const stats = document.querySelector('#stats');
  if (error) { table.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`; return; }
  const total = data.length;
  const checked = data.filter(x => x.checked_in).length;
  const generated = data.filter(x => x.qr_generated).length;
  const comp = data.filter(x => x.ticket_status === 'Complimentary').length;
  stats.innerHTML = `<div><b>${total}</b><span>Total Paid List</span></div><div><b>${generated}</b><span>QR Generated</span></div><div><b>${checked}</b><span>Checked In</span></div><div><b>${comp}</b><span>Complimentary</span></div>`;
  if (!data.length) { table.innerHTML = `<p class="muted">No employees found.</p>`; return; }
  const rows = data.map(emp => `<tr>
      <td>${escapeHtml(emp.employee_id)}</td>
      <td>${escapeHtml(emp.full_name)}<br><span class="muted small">${escapeHtml(emp.contact)}</span></td>
      <td><span class="badge gold">${escapeHtml(emp.ticket_status)}</span></td>
      <td>${emp.qr_generated ? '<span class="badge green">Generated</span>' : '<span class="badge gray">Not generated</span>'}</td>
      <td>${emp.checked_in ? `<span class="badge green">Checked In</span><br><span class="muted small">${formatTime(emp.checked_in_at)}</span>` : '<span class="badge gray">Not entered</span>'}</td>
      <td class="actions"><a class="mini" href="#/pass?id=${encodeURIComponent(emp.employee_id)}&token=${encodeURIComponent(emp.qr_token || '')}">View Pass</a><button class="mini dangerBtn" data-delete="${escapeHtml(emp.employee_id)}">Remove</button></td>
    </tr>`).join('');
  table.innerHTML = `<div class="tableWrap"><table><thead><tr><th>EPF</th><th>Name / Contact</th><th>Status</th><th>QR</th><th>Entry</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.delete;
      if (confirm(`Remove ${id} from paid list?`)) {
        await supabase.from('employees').delete().eq('employee_id', id);
        await loadAdminTable();
      }
    };
  });
}

function renderSecurity() {
  if (requirePasscode('security', renderSecurity)) return;
  layout(`${nav('security')}
    <div class="topline"><div><div class="hero-mini">Security Portal</div><h1>Scan QR at Entrance</h1></div><button class="btn outline" id="logout">Logout</button></div>
    <div id="reader"></div>
    <div class="manualBox">
      <input id="manualId" placeholder="Manual EPF check if camera fails" />
      <button class="btn full" id="manualCheck">Check EPF</button>
    </div>
    <div id="scanResult"></div>
  `, true);
  document.querySelector('#logout').onclick = () => { sessionStorage.removeItem('bn_security'); renderSecurity(); };
  document.querySelector('#manualCheck').onclick = () => checkEntry(normalizeId(document.querySelector('#manualId').value), null, true);
  startScanner();
}
async function startScanner() {
  const result = document.querySelector('#scanResult');
  try {
    state.scanner = new Html5Qrcode('reader');
    await state.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 260 } }, async decoded => {
      const payload = parseQr(decoded);
      await checkEntry(payload.id, payload.token, false);
    });
  } catch (err) {
    result.innerHTML = `<div class="notice warn">Camera did not start. Use manual EPF check.</div>`;
  }
}
function parseQr(text) {
  try {
    const url = new URL(text);
    const qs = url.hash.split('?')[1] || url.search.slice(1);
    const p = new URLSearchParams(qs);
    return { id: normalizeId(p.get('id')), token: cleanText(p.get('token')) };
  } catch {
    return { id: '', token: '' };
  }
}
async function renderScanResult() {
  if (requirePasscode('security', renderScanResult)) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  layout(`${nav('security')}<div id="scanResult"></div>`, true);
  await checkEntry(normalizeId(params.get('id')), cleanText(params.get('token')), false);
}
async function checkEntry(employeeId, token, manual) {
  const result = document.querySelector('#scanResult');
  if (!employeeId) { result.innerHTML = `<div class="entry invalid">INVALID PASS<br><small>Please contact organizers.</small></div>`; return; }
  const { data: emp, error } = await supabase.from('employees').select('*').eq('employee_id', employeeId).maybeSingle();
  if (error || !emp) { result.innerHTML = `<div class="entry invalid">INVALID PASS<br><small>Please contact organizers.</small></div>`; return; }
  if (!manual && emp.qr_token !== token) { result.innerHTML = `<div class="entry invalid">INVALID PASS<br><small>QR token does not match.</small></div>`; return; }
  if (emp.checked_in) {
    result.innerHTML = `<div class="entry used">ALREADY CHECKED IN<br><small>${formatTime(emp.checked_in_at)}</small></div>${personCard(emp)}`;
    return;
  }
  const now = new Date().toISOString();
  const { error: updateError } = await supabase.from('employees').update({ checked_in: true, checked_in_at: now }).eq('employee_id', emp.employee_id).eq('checked_in', false);
  if (updateError) { result.innerHTML = `<div class="entry invalid">${escapeHtml(updateError.message)}</div>`; return; }
  emp.checked_in = true; emp.checked_in_at = now;
  result.innerHTML = `<div class="entry ok">GO IN</div>${personCard(emp)}`;
}
function personCard(emp) {
  return `<div class="personCard"><h2>${escapeHtml(emp.full_name)}</h2><p><b>EPF:</b> ${escapeHtml(emp.employee_id)}</p><p><b>Contact:</b> ${escapeHtml(emp.contact)}</p><p><b>Status:</b> ${escapeHtml(emp.ticket_status)}</p></div>`;
}

window.addEventListener('hashchange', route);
route();
