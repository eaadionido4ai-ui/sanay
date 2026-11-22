// Runs apps-script/Code.gs against a small mock of Google Sheets and Apps Script.
//   node tests/test_code.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
const logosSrc = fs.readFileSync(path.join(root, 'apps-script', 'Logos.gs'), 'utf8');

const ctx = { console };
vm.createContext(ctx);
const CtxDate = vm.runInContext('Date', ctx);

function fmtDate(d, tz, fmt) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  if (p.hour === '24') p.hour = '00';
  if (fmt === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
  if (fmt === 'yyyy-MM-dd HH:mm') return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  if (fmt === 'h:mm a') { const h = +p.hour; return `${(h + 11) % 12 + 1}:${p.minute} ${h >= 12 ? 'PM' : 'AM'}`; }
  throw new Error('unsupported format ' + fmt);
}
function parse(v) {               // what the Sheet does with a value you write
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);                                   // forced text
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new CtxDate(v + 'T00:00:00+08:00'); // read as a date
  if (/^\d{1,2}-\d{1,2}$/.test(v)) return new CtxDate('2026-' + v.replace('-', '-').padStart(5, '0') + 'T00:00:00+08:00'); // "10-19" would become a date
  if (v.startsWith('=')) return { FORMULA: v };                                // would run as a formula
  return v;
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; }
  getValue() { return this.sh.get(this.r, this.c); }
  getRow() { return this.r; }
  getColumn() { return this.c; } getNumRows() { return this.nr; } getNumColumns() { return this.nc; } getSheet() { return this.sh; }
  setValues(v) { assert.strictEqual(v.length, this.nr, 'row count'); v.forEach((row, i) => { assert.strictEqual(row.length, this.nc, 'col count'); row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, parse(x))); }); return this; }
  setValue(x) { this.sh.set(this.r, this.c, parse(x)); return this; }
  setFormulas(f) { f.forEach((row, i) => row.forEach((x, j) => { const m = /^=\{"([^"]+)"/.exec(x); this.sh.set(this.r + i, this.c + j, m ? m[1] : { FORMULA: x }); this.sh.formulas.push(x); })); return this; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setNote() { return this; } setDataValidation() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.formulas = []; this.activeRow = 1; }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  get(r, c) { const row = this.data[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
  getLastRow() { for (let i = this.data.length; i > 0; i--) if (this.data[i - 1].some(v => v !== '' && v !== undefined)) return i; return 0; }
  getLastColumn() { let m = 0; this.data.forEach(row => { for (let j = row.length; j > 0; j--) if (row[j - 1] !== '' && row[j - 1] !== undefined) { m = Math.max(m, j); break; } }); return m; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
  getActiveRange() { return new Range(this, this.activeRow, 1, 1, 1); }
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, j) => this.set(r, j + 1, parse(v))); }
  insertRowBefore(pos) { this.data.splice(pos - 1, 0, []); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {} getName() { return this.name; }
  getMaxRows() { return Math.max(1000, this.data.length); } getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getConditionalFormatRules() { return (this.cf || []).slice(); } setConditionalFormatRules(r) { this.cf = r; }
  setActiveRange(r) { this.selected = r; return r; }
  getProtections() { return this.protection ? [this.protection] : []; }
  protect() {
    const p = { editors: ['someone@example.org'], desc: '', domain: true,
      setDescription(d) { this.desc = d; return this; }, addEditor(e) { const m = typeof e === 'string' ? e : e.getEmail(); if (!this.editors.includes(m)) this.editors.push(m); return this; },
      removeEditors(list) { const out = list.map(u => u.getEmail()); this.editors = this.editors.filter(e => !out.includes(e)); return this; },
      getEditors() { return this.editors.map(e => ({ getEmail: () => e })); }, canDomainEdit() { return this.domain; }, setDomainEdit(v) { this.domain = v; return this; } };
    this.protection = p;
    return p;
  }
}
const sheets = [new Sheet('Sheet1')];
let active = null;
const ss = {
  getSheetByName: n => sheets.find(s => s.name === n) || null,
  insertSheet: n => { const s = new Sheet(n); sheets.push(s); return s; },
  getSheets: () => sheets.slice(),
  deleteSheet: s => sheets.splice(sheets.indexOf(s), 1),
  setSpreadsheetTimeZone() {}, toast(msg, title) { toasts.push({ msg, title }); },
  setActiveSheet(sh) { active = sh; return sh; },
  getOwner: () => ({ getEmail: () => 'owner@up.example.edu' }),
  getEditors: () => ['owner@up.example.edu', 'steward@up.example.edu', 'intern@gmail.example.com'].map(e => ({ getEmail: () => e })),
  getViewers: () => ['owner@up.example.edu', 'steward@up.example.edu', 'intern@gmail.example.com', 'viewer@up.example.edu'].map(e => ({ getEmail: () => e }))
};
let activeUser = 'owner@up.example.edu';
const builder = { requireDate() { return this; }, requireValueInList() { return this; }, requireCheckbox() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } };
const cache = {};
const toasts = [];
const mails = [];
const triggers = [];
const cfBuilder = () => { const b = { formula: '', bg: '', ranges: [],
  whenFormulaSatisfied(f) { this.formula = f; return this; }, setBackground(c) { this.bg = c; return this; }, setRanges(r) { this.ranges = r; return this; },
  build() { const f = this.formula, bg = this.bg, ranges = this.ranges;
    return { formula: f, bg, ranges, getBooleanCondition: () => ({ getCriteriaType: () => 'CUSTOM_FORMULA', getCriteriaValues: () => [f] }) }; } }; return b; };
const props = {};
const dialogs = [];
let uiAvailable = true;
const ui = {
  createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }),
  alert: msg => dialogs.push({ alert: msg }),
  showModalDialog: (out, title) => dialogs.push({ html: out.content, title })
};
let template = null;
Object.assign(ctx, {
  Session: { getActiveUser: () => ({ getEmail: () => activeUser }), getEffectiveUser: () => ({ getEmail: () => 'owner@up.example.edu' }) },
  SpreadsheetApp: {
    ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
    getActiveSpreadsheet: () => ss, newDataValidation: () => builder,
    newConditionalFormatRule: cfBuilder, BooleanCriteria: { CUSTOM_FORMULA: 'CUSTOM_FORMULA' },
    getUi: () => { if (!uiAvailable) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; },
    getActiveSheet: () => active
  },
  Utilities: { formatDate: fmtDate, getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)) },
  MailApp: { sendEmail: o => mails.push(o) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ put: (k, v, s) => { assert.ok(s >= 1 && s <= 21600, 'cache time within 6 hours'); cache[k] = v; }, get: k => (k in cache ? cache[k] : null), remove: k => { delete cache[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
    deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
  ScriptApp: {
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
    getProjectTriggers: () => triggers.filter(t => t.user === 'owner@up.example.edu').map(t => ({ getHandlerFunction: () => t.fn })),
    newTrigger: fn => { const t = { fn, user: 'owner@up.example.edu' }; const b = { forSpreadsheet() { return b; }, onEdit() { t.type = 'onEdit'; return b; }, onChange() { t.type = 'onChange'; return b; }, create() { triggers.push(t); return t; } }; return b; }
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createTemplateFromFile: name => (template = { name, evaluate() { return { tpl: this, setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }; } }),
    createHtmlOutput: html => ({ content: html, setWidth() { return this; }, setHeight() { return this; } })
  }
});
vm.runInContext(src, ctx, { filename: 'Code.gs' });

const T = name => ss.getSheetByName(name);
const table = name => { const s = T(name); const v = s.getRange(1, 1, s.getLastRow(), s.getLastColumn()).getValues(); const h = v.shift(); return v.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const person = o => Object.assign({
  training_id: 'SAMPLE-1', first_name: 'Juan', last_name: 'Dela Cruz', middle_initial: 'm', suffix: 'Jr.', position: 'LDRRM Officer',
  agency: 'MDRRMO San Isidro', email: 'Juan@Example.com', contact_no: '0917 123 4567',
  gad_consent: 'Yes', sex: 'Male', age_range: '10-19', senior_citizen: 'No', pwd: 'No', indigenous_people: 'Yes', tribe: 'Aeta',
  photo_consent: 'Yes', recording_consent: 'No', impact_consent: 'Yes'
}, o);
const request = o => Object.assign({
  topics: ['Incident Command System (ICS)', 'Contingency Planning', 'Not a real topic'], other_topics: 'Evacuation center management',
  need: 'Run the first hours of a response', participants: '35', participant_types: 'MDRRMO staff',
  preferred_date: ctx.addDays_(ctx.today_(), 30), alternative_date: '', mode: 'Face-to-face', location: 'Malaya City',
  first_name: 'Rhea', last_name: 'Domingo', position: 'LDRRM Officer', agency: 'MDRRMO Dalisay', email: 'Rhea@Example.com',
  contact_no: '0917 555 0100', consent: true
}, o);
const partner = o => Object.assign({
  organization: 'Bayanihan Foundation', org_type: 'NGO or civil society', location: 'Malaya City', website: 'bayanihan.example.org',
  types: ['Co-organize a training', 'Host the venue', 'Throw a party'], other_type: '', topics: ['Early Warning Systems'], other_topics: 'Flood drills',
  proposal: 'We can host a two-day course for our partner barangays.', preferred_start: ctx.addDays_(ctx.today_(), 60),
  first_name: 'Carlo', last_name: 'Pascual', position: 'Program Manager', email: 'Carlo@Bayanihan.example.org', contact_no: '', consent: true
}, o);
const isPlain = o => JSON.stringify(o) === JSON.stringify(JSON.parse(JSON.stringify(o))) && !JSON.stringify(o).includes('"__row"');
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };
const throws = (fn, re, msg) => { assert.throws(fn, re, msg); pass++; };

// 1. setup
ctx.setup();
ok(!ss.getSheetByName('Sheet1'), 'empty Sheet1 removed');
ok(['Trainings', 'Registrations', 'Attendance', 'Evaluations', 'Requests', 'Partnerships'].every(n => T(n)), 'all six tabs exist, Requests and Partnerships included');
const th = T('Trainings').getRange(1, 1, 1, T('Trainings').getLastColumn()).getValues()[0];
ok(th.join(',') === 'training_id,title,start_date,end_date,venue,mode,show_in_list,max_participants,registration_closes,notes,registered,female,male', 'trainings headers: ' + th.join(','));
const rh = T('Registrations').getRange(1, 1, 1, T('Registrations').getLastColumn()).getValues()[0];
ok(rh.length === 27 && rh[14] === 'sex' && rh[22] === 'impact_consent' && rh[26] === 'flag', 'registrations has 27 columns, sex in column O, impact consent added, flag last');
ok(T('Trainings').formulas[0].includes('COUNTIF(Registrations!C2:C,A2:A)'), 'registered formula counts Registrations!C: ' + T('Trainings').formulas[0]);
ok(T('Trainings').formulas[1].includes('Registrations!O2:O,"Female"'), 'female formula reads the sex column O: ' + T('Trainings').formulas[1]);
ok(table('Trainings').length === 3 && table('Trainings')[0].start_date instanceof CtxDate, 'three sample trainings with real dates');
ctx.setup();   // run again: must not duplicate anything
ok(table('Trainings').length === 3 && T('Trainings').getLastColumn() === 13 && T('Trainings').formulas.length === 3, 'second setup run changes nothing');

// 2. app data
let d = ctx.getAppData();
const byId = id => d.trainings.find(t => t.id === id);
ok(d.trainings.length === 3, 'three trainings listed');
ok(byId('SAMPLE-1').state === 'open' && byId('SAMPLE-1').happening, 'SAMPLE-1 open and happening');
ok(d.selfCheckIn === 'online', 'by default, people check themselves in only for online trainings');
vm.runInContext('CONFIG.selfCheckIn = true', ctx);   // the next checks use self check-in for SAMPLE-1, which is face-to-face
ok(byId('SAMPLE-2').state === 'open' && !byId('SAMPLE-2').happening && byId('SAMPLE-2').closes, 'SAMPLE-2 upcoming with a closing date');
ok(byId('SAMPLE-3').state === 'completed' && byId('SAMPLE-3').listed && byId('SAMPLE-3').evalOpen, 'SAMPLE-3 completed, listed, evaluation open');
ok(d.privacyStatement.startsWith('This data collection is conducted in accordance with the provisions of Republic Act No. 9710') && d.mediaStatement.length > 40, 'privacy statement (template wording) and media statement sent');
ok(isPlain(d), 'app data is plain JSON (no Date objects)');
ok(d.requestTopics.length === 10 && d.impactStatement.includes('impact monitoring') && d.requestPrivacy.includes('10173'), 'request topics, impact and request privacy wording sent');
ok(d.partnershipTypes.length === 6 && d.organizationTypes.includes('Academe') && d.partnershipPrivacy.includes('training partners'), 'partnership choices and privacy note sent');

// 3. register, with consent
let r1 = ctx.register(person({ last_name: '=HYPERLINK("http://x")' }));
ok(/^[A-HJKMNP-Z2-9]{5}$/.test(r1.code) && !r1.already, 'registration code issued: ' + r1.code);
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r1.stamp), 'submission time returned for the signature column: ' + r1.stamp);
ok(!r1.checkIn, 'a normal registration does not check in');
let reg = table('Registrations')[0];
ok(reg.contact_no === '0917 123 4567', 'contact number kept as typed');
ok(reg.last_name === '=HYPERLINK("http://x")' && typeof reg.last_name === 'string', 'a name starting with = is stored as text, not a formula');
ok(reg.full_name === 'Juan M. =HYPERLINK("http://x") Jr.', 'full name built: ' + reg.full_name);
ok(reg.age_range === '10-19' && typeof reg.age_range === 'string', 'age range 10-19 stays text (not a date)');
ok(reg.email === 'juan@example.com' && reg.gad_consent === 'Yes' && reg.sex === 'Male' && reg.indigenous_people === 'Yes' && reg.tribe === 'Aeta', 'email lower-cased, GAD answers saved');
ok(reg.photo_consent === 'Yes' && reg.recording_consent === 'No' && reg.impact_consent === 'Yes', 'photo, recording and follow-up interview answers saved');
ok(reg.privacy_version === 'GAD attendance sheet DPS', 'privacy version recorded');
ok(reg.registered_as === 'Walk-in', 'registering on a training day is marked Walk-in');
ok(reg.timestamp instanceof CtxDate, 'timestamp is a real date');
let r2 = ctx.register(person({ email: 'juan@example.com' }));
ok(r2.already && r2.code === r1.code && table('Registrations').length === 1, 'same email, same training: returns the existing code');

// 3b. without consent: no GAD data kept even if sent
let rNo = ctx.register(person({ email: 'noconsent@example.com', gad_consent: 'No', sex: 'Female', age_range: '60+', pwd: 'Yes', tribe: 'X' }));
let regNo = table('Registrations').find(r => r.email === 'noconsent@example.com');
ok(rNo.code && regNo.gad_consent === 'No' && ['sex', 'age_range', 'senior_citizen', 'pwd', 'indigenous_people', 'tribe'].every(k => regNo[k] === ''), 'no consent: GAD columns left blank');

// 3c. validation
throws(() => ctx.register(person({ training_id: 'SAMPLE-3', email: 'a@example.com' })), /has ended/, 'completed training refused');
throws(() => ctx.register(person({ gad_consent: '', email: 'b@example.com' })), /consent/, 'consent answer required');
throws(() => ctx.register(person({ sex: '', email: 'c@example.com' })), /your sex/, 'with consent, sex required');
throws(() => ctx.register(person({ age_range: '18-30', email: 'c2@example.com' })), /age range/, 'age range must be one of the template ranges');
throws(() => ctx.register(person({ tribe: '', email: 'd@example.com' })), /tribe/, 'IP yes needs the tribe');
throws(() => ctx.register(person({ photo_consent: '', email: 'e@example.com' })), /photos/, 'photo answer required');
throws(() => ctx.register(person({ recording_consent: 'Maybe', email: 'f@example.com' })), /recordings/, 'recording answer must be yes or no');
throws(() => ctx.register(person({ impact_consent: '', email: 'f2@example.com' })), /follow-up interview/, 'follow-up interview answer required');
throws(() => ctx.register(person({ email: 'not-an-email' })), /valid email/, 'bad email refused');
throws(() => ctx.register(person({ email: 'g@example.com', contact_no: '12' })), /7 to 15 digits/, 'too-short contact number refused');
throws(() => ctx.register(person({ email: 'h@example.com', agency: '' })), /agency/, 'agency required');
let r3 = ctx.register(person({ training_id: 'SAMPLE-2', email: 'ana@example.com', first_name: 'Ana', last_name: 'Reyes', sex: 'Female', middle_initial: '', suffix: '', indigenous_people: 'No', tribe: 'ignored' }));
let reg3 = table('Registrations').find(r => r.email === 'ana@example.com');
ok(reg3.registered_as === 'Pre-registered' && reg3.tribe === '', 'registering ahead is Pre-registered; tribe dropped when IP is No');

// 4. check in
let c1 = ctx.checkIn({ training_id: 'SAMPLE-1', key: r1.code.toLowerCase() });
ok(c1.status === 'ok' && c1.day === 1 && c1.days === 2 && /\d{1,2}:\d{2} (AM|PM)/.test(c1.time), 'check-in by code works: ' + JSON.stringify(c1));
ok(c1.code === r1.code, 'check-in returns the registration code, for the QR code on the page');
let c2 = ctx.checkIn({ training_id: 'SAMPLE-1', key: 'JUAN@example.com' });
ok(c2.status === 'already', 'second check-in the same day is recognized');
ok(table('Attendance').length === 1 && table('Attendance')[0].method === 'Code' && table('Attendance')[0].sex === 'Male' && table('Attendance')[0].full_name.startsWith('Juan'), 'one attendance row, with name and sex');
ok(ctx.checkIn({ training_id: 'SAMPLE-1', key: 'ZZZZZ' }).status === 'not-found', 'unknown code is not found');
throws(() => ctx.checkIn({ training_id: 'SAMPLE-2', key: r3.code }), /training days/, 'check-in refused before the training');

// 5. walk-in: registers and checks in at once
let w = ctx.register(person({ email: 'walkin@example.com', first_name: 'Walk', walk_in: true }));
ok(w.checkIn && w.checkIn.status === 'ok' && w.checkIn.day === 1, 'walk-in is checked in right away');
ok(table('Attendance').some(a => a.reg_code === w.code && a.method === 'Walk-in'), 'walk-in attendance row marked Walk-in');
let w2 = ctx.register(person({ email: 'walkin@example.com', walk_in: true }));
ok(w2.already && w2.checkIn.status === 'already', 'walk-in twice: same code, already checked in');
let w3 = ctx.register(person({ email: 'early@example.com', training_id: 'SAMPLE-2', walk_in: true, indigenous_people: 'No', tribe: '' }));
ok(!w3.checkIn, 'walk-in flag before the training does not check in');

// 6. evaluate
const evalKeys = vm.runInContext('evalKeys_()', ctx);
const answers = Object.assign(Object.fromEntries(evalKeys.map((k, i) => [k, String((i % 5) + 1)])), { overall: '5', venue_ok: 'NA', will_apply: 'Use ICS forms', comments: '' });
ok(ctx.submitEvaluation({ training_id: 'SAMPLE-1', key: r1.code, answers }).status === 'ok', 'evaluation saved');
ok(ctx.submitEvaluation({ training_id: 'SAMPLE-1', key: 'juan@example.com', answers }).status === 'already', 'second evaluation refused');
let ev = table('Evaluations');
ok(ev.length === 1 && !('reg_code' in ev[0]) && !JSON.stringify(ev[0]).includes('Juan') && ev[0].overall === 5, 'evaluation row has no name or code');
ok(evalKeys.length === 16 && T('Evaluations').getLastColumn() === 21, 'Evaluations tab has a column for each of the 16 Likert statements, then the flag');
ok(ev[0].venue_ok === 'N/A' && ev[0].obj_clear === 1 && ev[0].logistics_ok === (evalKeys.indexOf('logistics_ok') % 5) + 1, 'Likert answers saved as numbers, N/A as text');
ok(typeof table('Registrations')[0].evaluated_on === 'string' && table('Registrations')[0].evaluated_on.length === 10, 'registration marked as evaluated');
throws(() => ctx.submitEvaluation({ training_id: 'SAMPLE-1', key: r1.code, answers: { overall: 5 } }), /every statement/, 'missing statements refused');
throws(() => ctx.submitEvaluation({ training_id: 'SAMPLE-1', key: r1.code, answers: Object.assign({}, answers, { obj_clear: 'NA' }) }), /every statement/, 'N/A refused where the section does not allow it');
throws(() => ctx.submitEvaluation({ training_id: 'SAMPLE-1', key: r1.code, answers: Object.assign({}, answers, { recommend: '6' }) }), /every statement/, 'answers outside 1 to 5 refused');
throws(() => ctx.submitEvaluation({ training_id: 'SAMPLE-2', key: r3.code, answers }), /closed/, 'evaluation before the training refused');
for (let i = 0; i < 6; i++) {
  const r = ctx.register(person({ email: `p${i}@example.com`, first_name: 'P' + i }));
  ctx.submitEvaluation({ training_id: 'SAMPLE-1', key: r.code, answers: Object.assign({}, answers, { overall: (i % 5) + 1 }) });
}
ev = table('Evaluations');
ok(ev.length === 7 && ev.every(e => e.training_id === 'SAMPLE-1' && e.overall >= 1), 'random placement leaves no gaps: ' + ev.length + ' rows');

// 6b. training requests
let q1 = ctx.submitRequest(request());
let rqRow = table('Requests')[0];
ok(/^[A-HJKMNP-Z2-9]{5}$/.test(q1.code) && rqRow.request_code === q1.code, 'request saved with a request number: ' + q1.code);
ok(rqRow.topics === 'Incident Command System (ICS); Contingency Planning' && rqRow.other_topics === 'Evacuation center management', 'only listed topics kept, other topics in their own column');
ok(rqRow.email === 'rhea@example.com' && rqRow.status === 'New' && rqRow.full_name === 'Rhea Domingo' && rqRow.participants === 35, 'request row: email lower-cased, status New, name, participant count');
ok(typeof rqRow.preferred_date === 'string' && rqRow.preferred_date === request().preferred_date, 'preferred date kept as text yyyy-mm-dd');
ok(q1.topics.includes('Evacuation center management') && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(q1.stamp), 'reply lists the topics and the time sent');
throws(() => ctx.submitRequest(request({ topics: [], other_topics: '' })), /at least one topic/, 'request needs a topic');
throws(() => ctx.submitRequest(request({ preferred_date: '2020-01-01' })), /from today onward/, 'past dates refused');
throws(() => ctx.submitRequest(request({ preferred_date: '2026-02-30' })), /preferred date/, 'impossible date refused');
throws(() => ctx.submitRequest(request({ participants: '0' })), /number of participants/, 'participant count must be 1 or more');
throws(() => ctx.submitRequest(request({ mode: 'By carrier pigeon' })), /the mode/, 'mode must be one of the choices');
throws(() => ctx.submitRequest(request({ consent: false })), /Tick the box/, 'request needs consent to be contacted');
ok(table('Requests').length === 1, 'refused requests leave no rows');

// 6c. training partnership requests
let pq = ctx.submitPartnership(partner());
let ptRow = table('Partnerships')[0];
ok(/^[A-HJKMNP-Z2-9]{5}$/.test(pq.code) && ptRow.request_code === pq.code && ptRow.status === 'New', 'partnership request saved with a number and status New');
ok(ptRow.partnership_types === 'Co-organize a training; Host the venue' && ptRow.topics === 'Early Warning Systems' && ptRow.other_topics === 'Flood drills', 'only listed choices kept; other topics in their own column');
ok(ptRow.email === 'carlo@bayanihan.example.org' && ptRow.full_name === 'Carlo Pascual' && ptRow.org_type === 'NGO or civil society', 'partner contact and organization type saved');
ok(pq.partnership === 'Co-organize a training; Host the venue' && pq.topics.includes('Flood drills'), 'reply summarizes the partnership');
throws(() => ctx.submitPartnership(partner({ organization: '' })), /organization's name/, 'organization name required');
throws(() => ctx.submitPartnership(partner({ org_type: 'Secret society' })), /type of organization/, 'organization type must be one of the choices');
throws(() => ctx.submitPartnership(partner({ types: [], other_type: '' })), /kind of partnership/, 'partnership kind required');
ok(ctx.submitPartnership(partner({ types: [], other_type: 'Lend rescue boats', email: 'x@example.org' })).partnership === 'Lend rescue boats', 'a partnership described in words is enough');
throws(() => ctx.submitPartnership(partner({ proposal: 'Hi' })), /description of your idea/, 'a short description of the idea is required');
throws(() => ctx.submitPartnership(partner({ preferred_start: '2020-05-01' })), /from today onward/, 'past start dates refused');
throws(() => ctx.submitPartnership(partner({ preferred_start: 'soon' })), /real date/, 'a start that is not a date is refused');
throws(() => ctx.submitPartnership(partner({ consent: false })), /Tick the box/, 'partnership needs consent');
ok(table('Partnerships').length === 2, 'refused partnership requests leave no rows');

// 7. report link and report data
throws(() => ctx.getReport({}), /expired or is not valid/, 'report refused without a key');
throws(() => ctx.getReport({ key: 'abc123' }), /expired or is not valid/, 'report refused with a made-up key');
uiAvailable = false;
throws(() => ctx.openReport(), /getUi/, 'openReport cannot run from the web page');
ok(Object.keys(cache).length === 0, 'no key was made by that attempt');
uiAvailable = true;
active = T('Trainings'); active.activeRow = 2;           // the cursor is on SAMPLE-1's row
ctx.openReport();
const dlg = dialogs.pop();
const m = /href="([^"]+)"/.exec(dlg.html);
ok(m && /\?page=report&amp;key=[0-9a-f]{32}&amp;t=SAMPLE-1$/.test(m[1]), 'menu makes a report link for the selected training: ' + (m && m[1]));
const key = /key=([0-9a-f]{32})/.exec(m[1])[1];
let rp = ctx.getReport({ key, training_id: 'SAMPLE-1' });
ok(isPlain(rp), 'report data is plain JSON (no Date objects)');
ok(rp.training.id === 'SAMPLE-1' && rp.trainings.length === 3, 'report for SAMPLE-1, with all trainings to choose from');
ok(rp.registrations.length === table('Registrations').filter(r => r.training_id === 'SAMPLE-1').length, 'all SAMPLE-1 registrations returned');
ok(rp.registrations.every(r => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.timestamp) && 'photo_consent' in r && 'gad_consent' in r && !('__row' in r)), 'registration fields for the sheet, timestamps as text');
ok(rp.attendance.length === 2 && rp.attendance.every(a => a.date === rp.today && /\d{2}:\d{2}$/.test(a.timestamp)), 'attendance rows for today');
ok(rp.privacyStatement === ctx.getAppData().privacyStatement, 'report carries the privacy statement for the sheet header');
const juanRp = rp.registrations.find(r => r.reg_code === r1.code);
ok(juanRp.impact_consent === 'Yes' && /^\d{4}-\d{2}-\d{2}$/.test(juanRp.evaluated_on), 'report has the follow-up answer and the evaluation date (for certificates)');
ok(rp.certificateRule === 'all-days', 'report says how certificates are decided');
ok(rp.evaluations.length === 7 && rp.evaluations.every(e => !('reg_code' in e) && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) && rp.evaluationItems.length === 6, 'report has the Likert answers (no names) and the statements');
ok(rp.partnerships.length === 2 && rp.partnerships[0].organization === 'Bayanihan Foundation' && rp.partnerships[0].preferred_start === partner().preferred_start, 'report includes the partnership requests');
ok(rp.requests.length === 1 && rp.requests[0].request_code === q1.code && rp.requests[0].participants === 35 && rp.requests[0].preferred_date === request().preferred_date, 'report includes the training requests');
let rpDefault = ctx.getReport({ key, training_id: 'NOPE' });
ok(rpDefault.training.id === 'SAMPLE-1', 'unknown training falls back to the one happening today');

// 7b. data privacy: stewards, access check, protected tabs
ok(DATA_TABS_OK(), 'setup protects the five data tabs: only the owner can edit them');
function DATA_TABS_OK() {
  return ['Registrations', 'Attendance', 'Evaluations', 'Requests', 'Partnerships'].every(n => {
    const p = T(n).protection;
    return p && p.editors.join() === 'owner@up.example.edu' && p.domain === false && /only the owner and the data stewards/.test(p.desc);
  }) && !T('Trainings').protection;
}
vm.runInContext("CONFIG.dataStewards = ['Steward@up.example.edu']", ctx);
ctx.setup();
ok(T('Registrations').protection.editors.sort().join() === 'owner@up.example.edu,steward@up.example.edu', 'listed data stewards can edit the data tabs too');
// the script property DATA_STEWARDS: emails kept out of the code, so they survive pasting a new Code.gs
props.DATA_STEWARDS = ' Prop.Steward@up.example.edu, not an email;STEWARD@up.example.edu\n prop.steward@up.example.edu ';
ok(vm.runInContext('stewards_()', ctx).join() === 'steward@up.example.edu,prop.steward@up.example.edu',
  'DATA_STEWARDS: separated by commas, semicolons, spaces or new lines, any case; repeats and non-emails skipped');
ctx.setup();
ok(T('Registrations').protection.editors.sort().join() === 'owner@up.example.edu,prop.steward@up.example.edu,steward@up.example.edu', 'data stewards in DATA_STEWARDS can edit the data tabs too');
delete props.DATA_STEWARDS;
ctx.setup();
ok(T('Registrations').protection.editors.sort().join() === 'owner@up.example.edu,steward@up.example.edu', 'taken out of DATA_STEWARDS, setup removes their edit rights');
activeUser = 'intern@gmail.example.com';
const before = Object.keys(cache).length;
ctx.openReport();
ok(/Only the owner of this Sheet and the data stewards/.test((dialogs.pop() || {}).alert || '') && Object.keys(cache).length === before, 'someone not on the steward list gets no report link');
throws(() => ctx.setup(), /Only the owner of this Sheet or a data steward/, 'someone not on the steward list cannot run setup');
activeUser = 'owner@up.example.edu';
ctx.openReport();
ok(/page=report&amp;key=/.test((dialogs.pop() || {}).html || ''), 'the Sheet owner gets a report link without being listed');
activeUser = 'steward@up.example.edu';
ctx.openReport();
ok(/page=report&amp;key=/.test((dialogs.pop() || {}).html || ''), 'a data steward gets a report link');
ctx.checkAccess();
const acc = dialogs.pop();
ok(acc.title === 'Who can see the data' && /intern@gmail\.example\.com <b[^>]*>· not a data steward/.test(acc.html) && /viewer@up\.example\.edu <b/.test(acc.html) && !/steward@up\.example\.edu <b/.test(acc.html) && !/owner@up\.example\.edu <b/.test(acc.html), 'access check lists everyone and flags people who are not data stewards (not the owner)');
ok(/Data stewards \(DATA_STEWARDS\)/.test(acc.html) && /<li>steward@up\.example\.edu<\/li>/.test(acc.html), 'Check who can see the data also lists the data stewards');
ok(/@OnlyCurrentDoc/.test(src), 'the script is limited to this one Sheet');
vm.runInContext('CONFIG.dataStewards = []', ctx);
activeUser = 'owner@up.example.edu';

// 8. page and logos
vm.runInContext(logosSrc, ctx, { filename: 'Logos.gs' });
const out = ctx.doGet();
const brand = JSON.parse(out.tpl.brand.replace(/\\u003c/g, '<'));
ok(template.name === 'Index' && brand.name === 'SANAY' && brand.logos.length === 3 && brand.logos.every(l => l.src.startsWith('data:image/webp;base64,')), 'page gets the name and three logos');
ok(!out.tpl.brand.includes('<'), 'brand JSON has no raw "<" that could close the script tag');
const cr = brand.credits, me = cr.people[0];
ok(cr.heading === 'Conceptualized and Developed with AI Assistance by:' && cr.people.length === 1 && me.name === 'Edward Andrew A. Dionido' &&
  me.lines.join('|') === 'Science Research Specialist II|Institution Building Division|University of the Philippines Resilience Institute' &&
  me.additionalAffiliation.join('|') === 'Graduate Student (Ongoing)|College of Professional and Graduate Studies|De La Salle University Dasmariñas' &&
  cr.dateDeveloped === 'November 2026', 'credits in the developer format, with the additional affiliation, reach the page');
ok(brand.backdrop === null || /^data:image\/(jpeg|png|webp);base64,/.test(brand.backdrop.src), 'the background photo from Logos.gs, if there is one, is a data: image');
ok(brand.backdrop && brand.backdrop.fit === 'right' && brand.backdrop.credit === 'Edward Andrew A. Dionido' && brand.backdrop.creditLink === '',
  "the background photo is EA's photo of the Oblation at UP BGC, along the right edge, credited to him");
const photoBytes = Buffer.from(brand.backdrop.src.split(',')[1], 'base64');
ok(photoBytes.length < 160 * 1024 && photoBytes.indexOf(Buffer.from('Exif')) < 0 && photoBytes.indexOf(Buffer.from('GPS')) < 0,
  'the photo is small (%d KB) and carries no location, time or camera data'.replace('%d', Math.round(photoBytes.length / 1024)));
const bd = ctx.backdrop_({ src: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', position: '50% 30%', credit: '  Photo: A. Person  ', creditLink: 'https://example.org/photos/1' });
ok(bd && bd.position === '50% 30%' && bd.credit === 'Photo: A. Person' && bd.creditLink === 'https://example.org/photos/1' && ctx.backdrop_({ src: 'https://example.org/oblation.jpg' }).position === 'center',
  'background photo: a data: image or an https link reaches the page, with its focus, credit and the link to the photo');
ok(ctx.backdrop_({ src: 'https://example.org/a.jpg', creditLink: 'javascript:alert(1)' }).creditLink === '' && ctx.backdrop_({ src: 'https://example.org/a.jpg', creditLink: 'https://x.org/" onclick="x' }).creditLink === '',
  'background photo: a credit link that is not a plain https link is dropped');
ok(ctx.backdrop_(null) === null && ctx.backdrop_({ src: 'javascript:alert(1)' }) === null && ctx.backdrop_({ src: 'https://example.org/a.jpg") ; background: red' }) === null &&
  ctx.backdrop_({ src: 'data:image/svg+xml;base64,PHN2Zz4=' }) === null && ctx.backdrop_({ src: 'https://example.org/a.jpg', position: 'url(x); color: red' }).position === 'urlx color red',
  'background photo: anything that could break out of the CSS is refused');
ok(ctx.backdrop_({ src: 'https://example.org/a.jpg', fit: 'right' }).fit === 'right' && ctx.backdrop_({ src: 'https://example.org/a.jpg', fit: 'left; color: red' }).fit === 'cover' && bd.fit === 'cover',
  'background photo: it fills the screen, or stands along the right edge; nothing else gets in');
vm.runInContext("var keepCredits = CONFIG.credits; CONFIG.credits = { heading: '  By:  ', people: [{ name: ' ' }, { name: 'A. Person', lines: ['Role', '  '] }, null] }", ctx);
const cr2 = JSON.parse(ctx.brandJson_().replace(/\\u003c/g, '<')).credits;
ok(cr2.heading === 'By:' && cr2.people.length === 1 && cr2.people[0].lines.join() === 'Role' && cr2.people[0].additionalAffiliation.length === 0 && cr2.dateDeveloped === '',
  'credits: blank names and lines are left out; no affiliation means no cap icon');
vm.runInContext("CONFIG.credits = '<b>not a credits block</b>'", ctx);
ok(JSON.parse(ctx.brandJson_().replace(/\\u003c/g, '<')).credits.people.length === 0, 'credits: a mistyped setting shows no credits instead of breaking the page');
vm.runInContext('CONFIG.credits = keepCredits', ctx);
ok(brand.bands.join() === '#014421,#7B1113' && brand.institution[0] === 'UNIVERSITY OF THE PHILIPPINES', 'UP green and maroon bands, institution lines');
ok(brand.expansion === 'Skills And Needs Assessment and Training Interventions towards enhanced DRRM CapacitY' && brand.project === 'TaTaK Resilience Project' &&
  brand.projectMark === 'TaTaK' && brand.projectShort === 'TaTaK Resilience' && brand.projectExpansion === 'TagapagTaguyod ng Kasanayan tungo sa Katatagan' && brand.projectAccent === 'Katatagan', 'SANAY expansion, the TaTaK Resilience Project and its green word');

// 8b. check-in scanner at the door
const keyOf = html => (/page=scan&amp;k=([0-9a-f]+)/.exec(html || '') || [])[1];
active = T('Trainings');
active.activeRow = 1;                                    // header row: no training picked
ctx.openScanner();
const scDlg = dialogs.pop();
const k1 = keyOf(scDlg.html);
ok(k1 && k1.length === 32 && /SAMPLE · Training happening today/.test(scDlg.html) && /Add a device/.test(scDlg.html), 'scanner dialog: a link for the training happening today');
const pin1 = JSON.parse(props['scanner:SAMPLE-1']).pin;
ok(/^\d{6}$/.test(pin1) && scDlg.html.includes('>' + pin1 + '<'), 'and a 6-digit scanner PIN, shown only in the Sheet: ' + pin1);
ctx.openScanner();
ok(keyOf(dialogs.pop().html) === k1, 'opening it again gives the same link, so devices already set up keep working');
active.activeRow = 4;                                    // SAMPLE-3 has ended
ctx.openScanner();
ok(/has ended/.test((dialogs.pop() || {}).alert || ''), 'no scanner for a training that has ended');
active.activeRow = 2;
uiAvailable = false;
throws(() => ctx.openScanner(), /getUi/, 'the scanner menu cannot run from the web page');
throws(() => ctx.renewScanner('SAMPLE-1'), /getUi/, 'nor can a new link be made from the web page');
uiAvailable = true;
throws(() => ctx.getScanner({ key: 'abc' }), /scanner link has expired/, 'a made-up key is refused');
throws(() => ctx.getScanner({ key: k1 }), /Wrong scanner PIN/, 'the link alone is not enough: the scanner needs the PIN');
throws(() => ctx.scanSync({ key: k1, pin: '000000', items: [{ id: 'nope', code: r1.code }] }), /Wrong scanner PIN/, 'a wrong PIN sends nothing');
['1', '2', '3'].forEach(n => { try { ctx.getScanner({ key: k1, pin: '99999' + n }); } catch (e) { /* counted */ } });
throws(() => ctx.getScanner({ key: k1, pin: pin1 }), /Too many wrong PINs/, 'five wrong PINs lock the link for 10 minutes, even for the right PIN');
delete cache['pinfail:' + k1];
let sc = ctx.getScanner({ key: k1, pin: pin1 });
ok(sc.training.id === 'SAMPLE-1' && sc.trainingDay && sc.day === 1 && sc.days === 2 && sc.link.endsWith('page=scan&k=' + k1), 'scanner gets the training, the day and its own link');
ok(sc.roster.length === table('Registrations').filter(r => r.training_id === 'SAMPLE-1').length &&
  sc.roster.every(p => Object.keys(p).sort().join() === 'agency,code,name,walkIn'), 'the device gets only codes, names and offices: no emails or numbers');
ok(sc.checkedIn.some(c => c.code === r1.code && /AM|PM/.test(c.time)), 'and who is already in today');
const r9 = ctx.register(person({ email: 'rosa.scan@example.com', first_name: 'Rosa' }));
const attRows = () => table('Attendance').filter(a => a.reg_code === r9.code);
const t0 = Date.now();
let s1 = ctx.scanSync({ key: k1, pin: pin1, items: [{ id: 'dev1-1', code: 'sanay:' + r9.code.toLowerCase(), at: t0 - 60000, how: 'QR' }] });
ok(s1.results.length === 1 && s1.results[0].status === 'ok' && s1.results[0].id === 'dev1-1' && attRows().length === 1 && attRows()[0].method === 'QR', 'a QR scan checks the person in, method QR');
ok(s1.checkedIn.some(c => c.code === r9.code), 'the reply tells every device who is in');
ok(ctx.scanSync({ key: k1, pin: pin1, items: [{ id: 'dev1-1', code: r9.code, at: t0 }] }).results[0].status === 'ok' && attRows().length === 1, 'a resent scan (same id) is not counted twice');
let s2 = ctx.scanSync({ key: k1, pin: pin1, items: [{ id: 'dev2-1', code: r9.code, at: t0 }] });
ok(s2.results[0].status === 'already' && attRows().length === 1, 'the same person from another device: already checked in, still one row');
const firstAt = attRows()[0].timestamp.getTime();
ctx.scanSync({ key: k1, pin: pin1, items: [{ id: 'dev3-1', code: r9.code, at: t0 - 5 * 60000, how: 'QR' }] });
ok(attRows().length === 1 && attRows()[0].timestamp.getTime() === t0 - 5 * 60000 && firstAt === t0 - 60000, 'an earlier scan arriving late (a phone that was offline) keeps the earlier time');
let s3 = ctx.scanSync({ key: k1, pin: pin1, items: [{ id: 'x1', code: 'ZZZZZ', at: t0 }, { id: 'x2', code: r3.code, at: t0 }, { id: 'x3', code: r2.code, at: t0 - 2 * 864e5 }, { id: 'x4', code: r2.code, at: t0 + 864e5, how: 'Typed code' }] });
ok(s3.results.map(r => r.status).join() === 'not-found,other-training,not-a-training-day,already', 'unknown code, another training\'s code, a day outside the training, and a future time (taken as now): ' + s3.results.map(r => r.status).join());
ok(table('Attendance').every(a => !(a.timestamp instanceof CtxDate) || a.timestamp.getTime() <= Date.now() + 1000), 'nothing is ever recorded in the future');
ok(ctx.scanSync({ key: k1, pin: pin1, items: [], roster: true }).roster.length > 0 && !ctx.scanSync({ key: k1, pin: pin1, items: [] }).roster, 'the full list comes only when asked for');
let wk = ctx.scanWalkIn({ key: k1, pin: pin1, id: 'desk-1', at: t0 - 120000, form: person({ email: 'desk.walkin@example.com', first_name: 'Dino', training_id: 'SAMPLE-2' }) });
const wreg = table('Registrations').find(r => r.email === 'desk.walkin@example.com');
ok(wk.status === 'ok' && !wk.already && wk.checkIn.status === 'ok' && wreg.training_id === 'SAMPLE-1' && wreg.registered_as === 'Walk-in' &&
  table('Attendance').find(a => a.reg_code === wk.code).method === 'Walk-in', 'walk-in at the door: registered for the scanner\'s training and checked in');
ok(wreg.timestamp.getTime() === t0 - 120000, 'its time is when the form was filled in, even if it was sent later');
ok(ctx.scanWalkIn({ key: k1, pin: pin1, id: 'desk-1', at: t0, form: person({ email: 'desk.walkin@example.com' }) }).code === wk.code &&
  table('Registrations').filter(r => r.email === 'desk.walkin@example.com').length === 1, 'a resent walk-in is saved once');
throws(() => ctx.scanWalkIn({ key: k1, pin: pin1, id: 'desk-2', at: t0, form: person({ email: 'bad' }) }), /valid email/, 'walk-in forms are checked like any registration');
const k2 = ctx.renewScanner('SAMPLE-1'), k2key = keyOf(k2.link.replace('&', '&amp;'));
ok(k2key && k2key !== k1 && /^\d{6}$/.test(k2.pin), 'Make a new link and PIN gives a different key and a PIN');
throws(() => ctx.scanSync({ key: k1, pin: pin1, items: [] }), /scanner link has expired/, 'and the old link stops working');
ok(ctx.getScanner({ key: k2key, pin: k2.pin }).training.id === 'SAMPLE-1', 'the new one works with the new PIN');
// a phone that had no signal on the last day can still send its saved scans for a week after
const tday = vm.runInContext('today_()', ctx), add = n => vm.runInContext('addDays_(' + JSON.stringify(tday) + ', ' + n + ')', ctx);
vm.runInContext('appendRecord_("Trainings", { training_id: "FIELD-1", title: "Field training", start_date: ' + JSON.stringify(add(-4)) + ', end_date: ' + JSON.stringify(add(-3)) + ', venue: "Barangay hall" })', ctx);
vm.runInContext('appendRecord_("Registrations", { timestamp: new Date(), training_id: "FIELD-1", reg_code: "FLD42", full_name: "Luz Tan", email: "luz@example.com", agency: "Barangay Dalisay" })', ctx);
props['scanner:FIELD-1'] = JSON.stringify({ key: 'f'.repeat(32), pin: '111111', until: add(-3) });
const fieldAt = new Date(add(-3) + 'T09:15:00+08:00').getTime();
const sf = ctx.scanSync({ key: 'f'.repeat(32), pin: '111111', items: [{ id: 'field-1', code: 'FLD42', at: fieldAt, how: 'QR' }, { id: 'field-2', code: 'FLD42', at: Date.now() }] });
ok(!sf.trainingDay && sf.results.map(r => r.status).join() === 'ok,not-a-training-day' &&
  table('Attendance').find(a => a.reg_code === 'FLD42').timestamp.getTime() === fieldAt, 'three days after the training, a saved scan from the last day still goes in, with its time; a scan made today does not');
props['scanner:FIELD-1'] = JSON.stringify({ key: 'f'.repeat(32), pin: '111111', until: add(-3) });
vm.runInContext('setValue_("Trainings", ' + (table('Trainings').findIndex(r => r.training_id === 'FIELD-1') + 2) + ', "end_date", ' + JSON.stringify(add(-9)) + ')', ctx);
throws(() => ctx.scanSync({ key: 'f'.repeat(32), pin: '111111', items: [] }), /scanner link has expired/, 'more than a week after the last day, the link is closed');

vm.runInContext("CONFIG.selfCheckIn = 'online'", ctx);
throws(() => ctx.checkIn({ training_id: 'SAMPLE-1', key: r9.code }), /at the door/, "default: no self check-in for a face-to-face training, so nobody checks in from home");
const wF = ctx.register(person({ email: 'f2f.walkin@example.com', walk_in: true }));
ok(wF.atDoor && !wF.checkIn, 'a walk-in who registers on their phone for a face-to-face training is checked in at the door');
const trRow = table('Trainings').findIndex(r => r.training_id === 'SAMPLE-1') + 2;
vm.runInContext('setValue_("Trainings", ' + trRow + ', "mode", "Online")', ctx);
ok(ctx.checkIn({ training_id: 'SAMPLE-1', key: 'f2f.walkin@example.com' }).status === 'ok', 'for an online training, people check themselves in');
vm.runInContext('setValue_("Trainings", ' + trRow + ', "mode", "Face-to-face")', ctx);
vm.runInContext('CONFIG.selfCheckIn = false', ctx);
throws(() => ctx.checkIn({ training_id: 'SAMPLE-1', key: r9.code }), /at the door/, 'with selfCheckIn off, people cannot check themselves in');
const w9 = ctx.register(person({ email: 'door.only@example.com', walk_in: true }));
ok(w9.atDoor && !w9.checkIn && !table('Attendance').some(a => a.reg_code === w9.code), 'a walk-in who registers on their phone then checks in at the door');
ok(ctx.getAppData().selfCheckIn === false, 'and the page knows it');
vm.runInContext('CONFIG.selfCheckIn = true', ctx);

// 8b. duplicates and spam: flagged for the data stewards, never blocked
// (the earlier checks saved dozens of entries within seconds; make them an hour old so no burst carries over)
['Registrations', 'Requests', 'Partnerships'].forEach(name => {
  const sh = T(name), c = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('timestamp') + 1;
  for (let r = 2; r <= sh.getLastRow(); r++) sh.set(r, c, new CtxDate(Date.now() - 3600000));
});
const regOf = code => table('Registrations').find(r => r.reg_code === code);
const regRow = code => table('Registrations').findIndex(r => r.reg_code === code) + 2;
let f1 = regOf(r1.code).flag;
ok(f1.includes('A link in a name or office field') && f1.includes('Registered again with the same email on '), 'a link in a name, and registering again with the same email, are flagged: ' + f1);
ctx.register(person({ email: 'juan@example.com' }));
ok(regOf(r1.code).flag.split(' · ').filter(x => x.startsWith('Registered again')).length === 1, 'registering again replaces the earlier note instead of piling up');
const clean = ctx.register(person({ email: 'maria.clean@example.com', first_name: 'Maria', last_name: 'Clara', middle_initial: '', suffix: '' }));
ok(regOf(clean.code).flag === '', 'a normal registration is not flagged');
const dupR = ctx.register(person({ email: 'maria.personal@example.com', first_name: 'MARIA ', last_name: ' clara', middle_initial: '', suffix: '' }));
ok(regOf(dupR.code).flag === 'Possible duplicate of row ' + regRow(clean.code) + ' (same name, another email)', 'same name with another email: a possible duplicate, with its row: ' + regOf(dupR.code).flag);
const jose = ctx.register(person({ email: 'jose.n@example.com', first_name: 'José', last_name: 'Peña', middle_initial: '', suffix: '' }));
const jose2 = ctx.register(person({ email: 'jose.n2@example.com', first_name: 'jose', last_name: 'pena', middle_initial: '', suffix: '' }));
ok(regOf(jose2.code).flag.startsWith('Possible duplicate of row ' + regRow(jose.code)), 'accents and capitals do not hide a duplicate');
const junkR = ctx.register(person({ email: 'x1@example.com', first_name: 'asdf', last_name: 'Ramos' }));
ok(regOf(junkR.code).flag === 'Looks like a test or junk entry ("asdf")', 'keyboard mash flagged: ' + regOf(junkR.code).flag);
const testR = ctx.register(person({ email: 'x2@example.com', first_name: 'Test', last_name: 'Person' }));
ok(regOf(testR.code).flag === 'Looks like a test or junk entry ("Test")', 'a test entry flagged');
const rep4 = ctx.register(person({ email: 'x4@example.com', first_name: 'Aaaa', last_name: 'Bueno' }));
ok(regOf(rep4.code).flag === 'Looks like a test or junk entry ("Aaaa")', 'a letter four times in a row flagged');
const numR = ctx.register(person({ email: 'x3@example.com', first_name: 'Pedro2', last_name: 'Uno' }));
ok(regOf(numR.code).flag === 'A name has numbers in it', 'numbers in a name flagged');
const tmpR = ctx.register(person({ email: 'someone@mailinator.com', first_name: 'Lito', last_name: 'Atienza' }));
const tmpR2 = ctx.register(person({ email: 'other@inbox.yopmail.com', first_name: 'Lina', last_name: 'Bautista' }));
ok(regOf(tmpR.code).flag === 'Throwaway email address' && regOf(tmpR2.code).flag === 'Throwaway email address', 'throwaway email addresses flagged');
const botR = ctx.register(person({ email: 'bot1@example.com', first_name: 'Ramon', last_name: 'Magsaysay', hp: 'http://spam.example' }));
ok(regOf(botR.code).flag === 'Possible bot: the hidden field was filled in', 'the hidden field flags a bot, and the entry is still saved');
const intl = ctx.register(person({ email: 'li.ming@example.com', first_name: '明', last_name: '李', middle_initial: '', suffix: '' }));
ok(regOf(intl.code).flag === '', 'a name in another alphabet is not junk');
const inS2 = () => table('Registrations').filter(r => r.training_id === 'SAMPLE-2' && Date.now() - r.timestamp <= 120000).length;
for (let k = 0; inS2() < 19; k++) ctx.register(person({ training_id: 'SAMPLE-2', email: 'burst' + k + '@example.com', first_name: 'Burst', last_name: 'Person ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[k] }));
ok(!String(table('Registrations').filter(r => r.training_id === 'SAMPLE-2').pop().flag).includes('Many'), '19 registrations in two minutes are not flagged as a burst');
const b20 = ctx.register(person({ training_id: 'SAMPLE-2', email: 'burst.last@example.com', first_name: 'Burst', last_name: 'Last' }));
ok(regOf(b20.code).flag === 'Many registrations at once (20 in 2 minutes)', 'the 20th registration in two minutes is flagged: ' + regOf(b20.code).flag);

const rqA = ctx.submitRequest(request({ email: 'dup.req@example.com', first_name: 'Lorna', last_name: 'Abad' }));
const rqB = ctx.submitRequest(request({ email: 'DUP.req@example.com', first_name: 'Lorna', last_name: 'Abad', need: 'Same need. Our pages: http://one.example.com and www.two.example.org' }));
const rqRowOf = code => table("Requests").findIndex(r => r.request_code === code) + 2;
const rqFlag = code => table('Requests').find(r => r.request_code === code).flag;
ok(rqFlag(rqB.code).includes("Possible duplicate of row " + rqRowOf(rqA.code) + ' (same email, sent earlier today)') && rqFlag(rqB.code).includes('Several links in the text'),
  'a second request from the same email, and links in the text, are flagged: ' + rqFlag(rqB.code));
const rqBot = ctx.submitRequest(request({ email: 'bot.req@example.com', first_name: 'Nilo', last_name: 'Santos', hp: 'x' }));
ok(rqFlag(rqBot.code) === 'Possible bot: the hidden field was filled in', 'the hidden field flags a bot request');
const rqD = ctx.submitRequest(request({ email: 'fourth@example.com', first_name: 'Dina', last_name: 'Cruz' }));
ok(rqFlag(rqD.code) === '', 'four requests in ten minutes are fine');
const rqE = ctx.submitRequest(request({ email: 'fifth@example.com', first_name: 'Elma', last_name: 'Ong' }));
ok(rqFlag(rqE.code) === 'Many requests at once (5 in 10 minutes)', 'the fifth request in ten minutes is flagged: ' + rqFlag(rqE.code));

const ptA = ctx.submitPartnership(partner({ email: 'a@kalinga.example.org', organization: 'Kalinga Volunteers' }));
const ptB = ctx.submitPartnership(partner({ email: 'b@kalinga.example.org', organization: 'kalinga  volunteers' }));
const ptRows = () => table('Partnerships');
ok(ptRows().find(r => r.request_code === ptB.code).flag.startsWith('Possible duplicate of row ' + (ptRows().findIndex(r => r.request_code === ptA.code) + 2) + ' (same organization, sent earlier today)'),
  'a second partnership request from the same organization is flagged');
const P = T('Partnerships'), pCol = P.getRange(1, 1, 1, P.getLastColumn()).getValues()[0].indexOf('flag') + 1;
for (let r = 1; r <= P.getLastRow(); r++) P.set(r, pCol, '');           // a tab from before this version: no flag column
const ptC = ctx.submitPartnership(partner({ email: 'c@other.example.org', organization: 'asdf' }));
ok(P.getRange(1, 1, 1, P.getLastColumn()).getValues()[0].includes('flag') && ptRows().find(r => r.request_code === ptC.code).flag === 'Looks like a test or junk entry ("asdf")',
  'the first flag adds the flag column to an older tab');

const evP = ctx.register(person({ email: 'eval.link@example.com', first_name: 'Rosa', last_name: 'Linao' }));
ok(ctx.submitEvaluation({ training_id: 'SAMPLE-1', key: evP.code, answers: Object.assign({}, answers, { comments: 'Great! Also see www.promo-example.com' }) }).status === 'ok', 'an evaluation with a link is still saved');
const evRow = table('Evaluations').find(r => String(r.comments).includes('promo-example'));
ok(evRow.flag === 'A link in the comments' && !('reg_code' in evRow), 'and flagged, still without a name or code');

// the Sheet tells the data stewards
const html1 = ctx.register(person({ email: 'x5@example.com', first_name: '<img src=x onerror=alert(1)>', last_name: 'Test' }));
const fl = vm.runInContext('flagged_()', ctx);
ok(fl.length >= 10 && fl.every(f => f.flag && f.flag.toUpperCase() !== 'OK') && fl.some(f => f.tab === 'Evaluations' && f.who.startsWith('Evaluation (no name)')),
  'flagged entries are listed, evaluations without names (' + fl.length + ')');
const sum = vm.runInContext('flagSummary_(flagged_())', ctx);
ok(/^\d+ entries look like duplicates or spam \(\d+ in Registrations, 1 in Evaluations, \d+ in Requests, \d+ in Partnerships\)\.$/.test(sum), 'summary: ' + sum);
toasts.length = 0;
ctx.onOpen();
ok(toasts.length === 1 && toasts[0].title === 'Entries to review' && toasts[0].msg === sum + ' See SANAY › Review flagged entries.', 'opening the Sheet says how many entries to review: ' + (toasts[0] && toasts[0].msg));
vm.runInContext('setValue_("Registrations", ' + regRow(tmpR.code) + ', "flag", " ok ")', ctx);
ok(vm.runInContext('flagged_()', ctx).length === fl.length - 1, 'typing OK in the flag column clears it');
const rules = T('Registrations').cf.filter(r => /UPPER\(TRIM/.test(r.formula));
ok(rules.length === 1 && rules[0].formula === '=AND($AA2<>"",UPPER(TRIM($AA2))<>"OK")' && rules[0].bg === '#FCE8B2', 'one amber highlight rule on the flag column: ' + (rules[0] && rules[0].formula));
ctx.setup();
ok(T('Registrations').cf.filter(r => /UPPER\(TRIM/.test(r.formula)).length === 1 && T('Requests').cf.length === 1, 'running setup again keeps one highlight rule per tab');
dialogs.length = 0;
ctx.reviewFlags();
const rv = dialogs.pop();
ok(rv.title === 'Entries to review' && rv.html.includes('Possible duplicate of row ' + regRow(clean.code)) && rv.html.includes('data-i="0"') && rv.html.includes('.showFlagged(f.tab,f.row)'),
  'SANAY › Review flagged entries lists them with a Show button');
ok(rv.html.includes('&lt;img src=x onerror=alert(1)&gt;') && !rv.html.includes('<img src=x'), 'names in the review list are escaped');
uiAvailable = false;
throws(() => ctx.reviewFlags(), /getUi/, 'the review list cannot be opened from the web app');
throws(() => ctx.showFlagged('Registrations', 2), /getUi/, 'Show cannot be called from the web app');
uiAvailable = true;
ctx.showFlagged('Registrations', regRow(junkR.code));
ok(active === T('Registrations') && T('Registrations').selected.r === regRow(junkR.code), 'Show opens the tab at the flagged row');
throws(() => ctx.showFlagged('Trainings', 2), /not in a SANAY tab/, 'Show opens only the four data tabs');
throws(() => ctx.showFlagged('Registrations', 1), /not in a SANAY tab/, 'and never the header row');
vm.runInContext("CONFIG.dataStewards = ['steward@up.example.edu']", ctx);
activeUser = 'intern@gmail.example.com';
throws(() => ctx.reviewFlags(), /data steward/, 'only the owner and data stewards can review flagged entries');
throws(() => ctx.showFlagged('Registrations', 2), /data steward/, 'or jump to them');
activeUser = 'owner@up.example.edu';
vm.runInContext('CONFIG.dataStewards = []', ctx);

// 8c. admin mode: sign in with a code sent to the email, then run check-in from the web app
const codeOf = m => (/admin code is (\d{6})/.exec(m.body) || [])[1];
const lastMail = () => mails[mails.length - 1];
mails.length = 0;
let sent = ctx.adminSendCode({ email: ' Intern@gmail.example.com ' });
ok(sent.email === 'intern@gmail.example.com' && sent.minutes === 10 && mails.length === 0, 'someone who is not an admin gets the same answer as an admin, and no email');
throws(() => ctx.adminSignIn({ email: 'intern@gmail.example.com', code: '123456' }), /expired/, 'and no code lets them in');
throws(() => ctx.adminSendCode({ email: 'not an email' }), /valid email/, 'a code needs a real email');
sent = ctx.adminSendCode({ email: 'OWNER@up.example.edu' });
ok(mails.length === 1 && mails[0].to === 'owner@up.example.edu' && /^\d{6}$/.test(codeOf(mails[0])) && !/\d{6}/.test(mails[0].subject) && mails[0].htmlBody.includes(codeOf(mails[0])),
  'the owner gets an email with a 6-digit code (not in the subject line)');
const code1 = codeOf(mails[0]);
ok(!JSON.stringify(cache).includes(code1), 'the code itself is not kept, only a hash of it');
throws(() => ctx.adminSignIn({ email: 'owner@up.example.edu', code: String((+code1 + 1) % 1000000).padStart(6, '0') }), /not right/, 'a wrong code is refused');
const adm = ctx.adminSignIn({ email: 'owner@up.example.edu', code: code1 });
ok(/^[0-9a-f]{64}$/.test(adm.token) && adm.email === 'owner@up.example.edu' && adm.until > Date.now() + 11.9 * 3600000, 'the right code signs in for 12 hours');
ok(!Object.keys(props).concat(Object.values(props)).some(v => v.includes(adm.token)), 'the session key is kept only as a hash');
throws(() => ctx.adminSignIn({ email: 'owner@up.example.edu', code: code1 }), /expired/, 'a code works once');
ctx.adminSendCode({ email: 'owner@up.example.edu' });
const code2 = codeOf(lastMail()), wrong = String((+code2 + 7) % 1000000).padStart(6, '0');
for (let i = 0; i < 4; i++) throws(() => ctx.adminSignIn({ email: 'owner@up.example.edu', code: wrong }), /not right/, 'wrong code ' + (i + 1) + ' refused');
throws(() => ctx.adminSignIn({ email: 'owner@up.example.edu', code: wrong }), /Too many wrong codes/, 'the fifth wrong code locks sign-in for 10 minutes');
throws(() => ctx.adminSignIn({ email: 'owner@up.example.edu', code: code2 }), /Too many wrong codes/, 'even the right code, while locked');
throws(() => ctx.adminSendCode({ email: 'owner@up.example.edu' }), /Too many wrong codes/, 'and no new code meanwhile');
Object.keys(cache).filter(k => /^admin(lock|sent):/.test(k)).forEach(k => delete cache[k]);
// a new code does not reset the count: ten wrong codes within 6 hours lock the email for 6 hours
ctx.adminSendCode({ email: 'owner@up.example.edu' });
const code3 = codeOf(lastMail()), wrong3 = String((+code3 + 3) % 1000000).padStart(6, '0');
for (let i = 0; i < 4; i++) throws(() => ctx.adminSignIn({ email: 'owner@up.example.edu', code: wrong3 }), /not right/, 'another code, wrong try ' + (6 + i));
throws(() => ctx.adminSignIn({ email: 'owner@up.example.edu', code: wrong3 }), /locked for 6 hours/, 'the tenth wrong try within 6 hours, over two codes, locks sign-in for 6 hours');
throws(() => ctx.adminSendCode({ email: 'owner@up.example.edu' }), /locked for 6 hours/, 'and no code is sent meanwhile');
Object.keys(cache).filter(k => /^admin(lock|sent|fail):/.test(k)).forEach(k => delete cache[k]);
['1', '2', '3'].forEach(() => ctx.adminSendCode({ email: 'someone@example.com' }));
throws(() => ctx.adminSendCode({ email: 'someone@example.com' }), /already sent 3 times/, 'at most 3 codes per email in 15 minutes');
const A = extra => Object.assign({ token: adm.token }, extra);
throws(() => ctx.adminHome({ token: 'f'.repeat(64) }), /signed out/, 'a made-up session key is refused');
throws(() => ctx.adminHome({}), /signed out/, 'no key, no admin data');
throws(() => ctx.adminCheckIn({ training_id: 'SAMPLE-1', code: r1.code }), /signed out/, 'and no admin action');
const home = ctx.adminHome(A());
ok(home.email === 'owner@up.example.edu' && home.trainings[0].id === 'SAMPLE-1' && home.trainings[0].when === 'now' && home.detail.training.id === 'SAMPLE-1',
  'admin mode opens on the training happening today');
ok(home.trainings.map(t => t.when).join() === 'now,next,past,past' && isPlain(home), 'then upcoming and past trainings; plain JSON: ' + home.trainings.map(t => t.id + ':' + t.when).join());
const det0 = home.detail;
ok(det0.trainingDay && det0.checkin.open && det0.day === tday && det0.days.length === 2 && det0.days[0].n === det0.checkedIn.length,
  'check-in is open today, with the count for each training day');
ok(det0.people.length === table('Registrations').filter(r => r.training_id === 'SAMPLE-1').length &&
  det0.people.every(p => Object.keys(p).sort().join() === 'agency,code,flagged,name,walkIn'), 'the list has names, offices and codes only: no emails or numbers');
ok(det0.people.find(p => p.code === junkR.code).flagged && !det0.people.find(p => p.code === clean.code).flagged, 'flagged entries are marked in the list');
const scA = ctx.adminScanner(A({ training_id: 'SAMPLE-1' }));
ok(/^[0-9a-f]{32}$/.test(scA.key) && /^\d{6}$/.test(scA.pin) && scA.link.endsWith('page=scan&k=' + scA.key), 'admin mode gives the scanner link and PIN, to open the scanner here or add a device');
throws(() => ctx.adminScanner(A({ training_id: 'SAMPLE-3' })), /has ended/, 'no scanner for a training that has ended');
// close check-in for the rest of today
const closedDet = ctx.adminSetCheckIn(A({ training_id: 'SAMPLE-1', open: false }));
ok(!closedDet.checkin.open && /^\d{1,2}:\d{2} (AM|PM)$/.test(closedDet.checkin.time) && closedDet.checkin.by === 'owner@up.example.edu', 'check-in closed, with the time and who closed it');
const lateA = ctx.register(person({ email: 'late.a@example.com', first_name: 'Lito', last_name: 'Abad' }));
const lateB = ctx.register(person({ email: 'late.b@example.com', first_name: 'Nora', last_name: 'Bayani' }));
const inAtt = code => table('Attendance').some(a => a.reg_code === code);
const sClosed = ctx.scanSync({ key: scA.key, pin: scA.pin, items: [{ id: 'closed-1', code: lateA.code, at: Date.now() }] });
ok(sClosed.results[0].status === 'closed' && !inAtt(lateA.code), 'after closing, a scan checks no one in');
ok(sClosed.checkin.open === false && /AM|PM/.test(sClosed.checkin.time), 'and every scanner hears that check-in is closed, so it can say so even offline');
ok(ctx.scanSync({ key: scA.key, pin: scA.pin, items: [{ id: 'closed-2', code: lateB.code, at: Date.now() - 3600000 }] }).results[0].status === 'ok' && inAtt(lateB.code),
  'a scan made before closing, sent later by a phone that had no signal, still counts');
ok(ctx.scanSync({ key: scA.key, pin: scA.pin, items: [{ id: 'closed-3', code: lateB.code, at: Date.now() }] }).results[0].status === 'already', 'someone already in is still shown as already in');
const wClosed = ctx.scanWalkIn({ key: scA.key, pin: scA.pin, id: 'desk-closed', at: Date.now(), form: person({ email: 'closed.walkin@example.com', first_name: 'Nena', last_name: 'Cruz' }) });
ok(wClosed.status === 'ok' && wClosed.checkIn.status === 'closed' && table('Registrations').some(r => r.email === 'closed.walkin@example.com') && !inAtt(wClosed.code),
  'a walk-in at the door after closing is registered but not checked in');
throws(() => ctx.checkIn({ training_id: 'SAMPLE-1', key: wClosed.code }), /closed for today/, 'self check-in is closed too');
const wPhone = ctx.register(person({ email: 'closed.phone@example.com', first_name: 'Pia', last_name: 'Dela Rosa', walk_in: true }));
ok(wPhone.checkIn && wPhone.checkIn.status === 'closed' && !inAtt(wPhone.code), 'a walk-in registering on a phone is registered, not checked in');
const byHand = ctx.adminCheckIn(A({ training_id: 'SAMPLE-1', code: 'sanay:' + wClosed.code.toLowerCase() }));
ok(byHand.result.status === 'ok' && table('Attendance').find(a => a.reg_code === wClosed.code).method === 'Admin' && byHand.checkedIn.some(c => c.code === wClosed.code && c.method === 'Admin'),
  'an admin can still check someone in by hand');
ok(ctx.adminCheckIn(A({ training_id: 'SAMPLE-1', code: wClosed.code })).result.status === 'already', 'checking in by hand twice says already in');
throws(() => ctx.adminCheckIn(A({ training_id: 'SAMPLE-1', code: r3.code })), /No one with that code/, 'only people registered for this training');
throws(() => ctx.adminCheckIn(A({ training_id: 'SAMPLE-2', code: r3.code })), /only on the training days/, 'and only on the training days');
const reopened = ctx.adminSetCheckIn(A({ training_id: 'SAMPLE-1', open: true }));
ok(reopened.checkin.open && ctx.scanSync({ key: scA.key, pin: scA.pin, items: [{ id: 'open-again', code: lateA.code, at: Date.now() }] }).results[0].status === 'ok', 'reopened: scans check people in again');
props['checkin:SAMPLE-1'] = JSON.stringify({ day: add(-1), at: Date.now() - 864e5, by: 'owner@up.example.edu' });
ok(ctx.adminTraining(A({ training_id: 'SAMPLE-1' })).checkin.open && ctx.getScanner({ key: scA.key, pin: scA.pin }).checkin.open, 'closing lasts only for the day it was closed');
delete props['checkin:SAMPLE-1'];
throws(() => ctx.adminSetCheckIn(A({ training_id: 'SAMPLE-2', open: false })), /only on a training day/, 'check-in can be closed only on a training day');
// undo a check-in made by mistake
const undone = ctx.adminUndoCheckIn(A({ training_id: 'SAMPLE-1', code: lateA.code, date: tday }));
ok(!inAtt(lateA.code) && !undone.checkedIn.some(c => c.code === lateA.code) && undone.day === tday, 'undo removes the check-in');
throws(() => ctx.adminUndoCheckIn(A({ training_id: 'SAMPLE-1', code: lateA.code, date: tday })), /not checked in/, 'undoing twice says so');
throws(() => ctx.adminUndoCheckIn(A({ training_id: 'SAMPLE-1', code: lateB.code, date: add(1) })), /up to today/, 'only training days up to today');
ok(ctx.adminTraining(A({ training_id: 'SAMPLE-1', date: add(1) })).day === tday, 'a day that has not come yet shows today instead');
const scB = ctx.adminScanner(A({ training_id: 'SAMPLE-1', renew: true }));
ok(scB.key !== scA.key && /^\d{6}$/.test(scB.pin), 'a new scanner link and PIN from admin mode');
throws(() => ctx.getScanner({ key: scA.key, pin: scA.pin }), /expired or is not valid/, 'and the old one stops working');
// data stewards, and the end of a session
vm.runInContext("CONFIG.dataStewards = ['steward@up.example.edu']", ctx);
ctx.adminSendCode({ email: 'steward@up.example.edu' });
const sSt = ctx.adminSignIn({ email: 'steward@up.example.edu', code: codeOf(lastMail()) });
ok(ctx.adminHome({ token: sSt.token }).email === 'steward@up.example.edu', 'a data steward signs in the same way');
vm.runInContext('CONFIG.dataStewards = []', ctx);
throws(() => ctx.adminHome({ token: sSt.token }), /signed out/, 'taken off the list, a steward is signed out at once');
props.DATA_STEWARDS = 'other.steward@up.example.edu, prop.steward@up.example.edu';
ctx.adminSendCode({ email: 'Prop.Steward@up.example.edu' });
const sPr = ctx.adminSignIn({ email: 'prop.steward@up.example.edu', code: codeOf(lastMail()) });
ok(ctx.adminHome({ token: sPr.token }).email === 'prop.steward@up.example.edu', 'a data steward listed only in the DATA_STEWARDS script property signs in too');
delete props.DATA_STEWARDS;
throws(() => ctx.adminHome({ token: sPr.token }), /signed out/, 'taken out of DATA_STEWARDS, signed out at once');
const sessKey = Object.keys(props).find(k => k.startsWith('admin:') && JSON.parse(props[k]).e === 'owner@up.example.edu');
const keepSess = props[sessKey];
props[sessKey] = JSON.stringify({ e: 'owner@up.example.edu', x: Date.now() - 1000 });
throws(() => ctx.adminHome(A()), /signed out/, 'after 12 hours, sign in again');
ok(!props[sessKey], 'and the ended session is removed');
props[sessKey] = keepSess;
ok(ctx.adminSignOut(A({ station: true })).ok && !props[sessKey], 'signing out ends the session');
throws(() => ctx.adminHome(A()), /signed out/, 'signed out means signed out');
ok(ctx.adminSignOut(A()).ok, 'signing out twice does no harm');

// 8d. the Changelog tab
const logs = () => table('Changelog');
ok(T('Changelog').getRange(1, 1, 1, 9).getValues()[0].join() === 'timestamp,who,action,tab,row,record,column,old_value,new_value', 'the Changelog tab and its columns');
ok(T('Changelog').protection && T('Changelog').protection.editors.join() === 'owner@up.example.edu' && /changelog: only the owner and the data stewards/.test(T('Changelog').protection.desc),
  'only the owner and the data stewards can edit the Changelog');
ok(triggers.filter(t => t.fn === 'logSheetEdit' && t.type === 'onEdit').length === 1 && triggers.filter(t => t.fn === 'logSheetChange' && t.type === 'onChange').length === 1,
  'setup turns on the edit log once, however often it runs');
const has = (action, f) => logs().some(l => (typeof action === 'string' ? l.action === action : action.test(l.action)) && (!f || f(l)));
ok(has('Ran Set up or repair tabs', l => l.who === 'owner@up.example.edu' && l.timestamp instanceof CtxDate), 'setup runs are logged, with who and when');
ok(has('Made a report link (works 6 hours)', l => l.record === 'SAMPLE-1') && has('Opened the scanner link and PIN (Sheet menu)') && has(/^Made a new scanner link and PIN/),
  'report and scanner links from the Sheet menu are logged');
ok(has('Signed in to admin mode', l => l.who === 'steward@up.example.edu') && has('Signed out of admin mode to make the device a check-in station'), 'admin sign-ins and sign-outs are logged');
ok(has('Admin sign-in locked for 10 minutes after 5 wrong codes', l => l.who === 'owner@up.example.edu') && has('Admin sign-in locked for 6 hours after 10 wrong codes'), 'locked sign-ins are logged');
ok(has('Closed check-in for the rest of today', l => l.record === 'SAMPLE-1' && /^Closed from \d/.test(l.new_value)) && has('Reopened check-in'), 'closing and reopening check-in are logged');
ok(has('Checked someone in by hand after check-in closed', l => l.record === wClosed.code && l.new_value.startsWith('Nena')), 'a check-in by hand is logged');
ok(has('Undid a check-in', l => l.record === lateA.code && /Lito/.test(l.old_value) && l.tab === 'Attendance'), 'an undone check-in is logged with what it was');
ok(!logs().some(l => /valuat/i.test(l.action)) && !logs().some(l => l.record === lateB.code), 'evaluations and ordinary scans are not logged: the data tabs already record them');
const R = T('Registrations'), RH = R.getRange(1, 1, 1, R.getLastColumn()).getValues()[0];
const row1 = regRow(r1.code), agencyCol = RH.indexOf('agency') + 1;
R.getRange(row1, agencyCol).setValue("'MDRRMO Dalisay");                 // a steward fixes the office in the Sheet
ctx.logSheetEdit({ range: R.getRange(row1, agencyCol), oldValue: 'MDRRMO San Isidro', value: 'MDRRMO Dalisay', user: { getEmail: () => 'Steward@up.example.edu' } });
let l1 = logs().pop();
ok(l1.action === 'Edited a cell' && l1.tab === 'Registrations' && l1.row === row1 && l1.column === 'agency' && l1.record === r1.code &&
  l1.old_value === 'MDRRMO San Isidro' && l1.new_value === 'MDRRMO Dalisay' && l1.who === 'steward@up.example.edu', 'an edit in the Sheet: who, where, whose row, old and new value');
ctx.logSheetEdit({ range: R.getRange(row1, RH.indexOf('last_name') + 1), oldValue: '=IMPORTXML("http://x.example","//a")' });
l1 = logs().pop();
ok(typeof l1.old_value === 'string' && l1.old_value.startsWith('=IMPORTXML') && l1.who.startsWith('A Sheet editor'), 'old values are kept as text (never run as formulas); no email from Google, no name invented');
ctx.logSheetEdit({ range: R.getRange(5, 2, 3, 2) });
l1 = logs().pop();
ok(l1.action === 'Changed 6 cells at once (pasted, filled or cleared)' && l1.column === 'B5:C7' && l1.row === '5–7', 'a paste over several cells is logged with the range');
ctx.logSheetEdit({ range: T('Evaluations').getRange(2, 3), oldValue: '4' });
l1 = logs().pop();
ok(l1.tab === 'Evaluations' && l1.record === 'SAMPLE-1', 'an edited evaluation is named by its training only');
const before8d = logs().length;
ctx.logSheetEdit({ range: T('Changelog').getRange(2, 3), oldValue: 'x' });
ctx.logSheetEdit({ range: { getSheet: 'not a function' } });
ctx.logSheetEdit({ range: 'A1' });
ctx.logSheetEdit(null);
ctx.logSheetChange({ changeType: 'REMOVE_ROW' });
ctx.logSheetChange({ changeType: 'INSERT_ROW', source: { getActiveSheet: () => T('Registrations') } });
ok(logs().length === before8d, 'not logged: edits in the Changelog itself, inserted rows, and calls from the web page that are not real edits');
ctx.logSheetChange({ changeType: 'REMOVE_ROW', source: { getActiveSheet: () => T('Registrations') }, user: { getEmail: () => 'owner@up.example.edu' } });
l1 = logs().pop();
ok(l1.action === 'Deleted rows' && l1.tab === 'Registrations' && /Version history/.test(l1.new_value), 'deleted rows are logged, with the tab');
ctx.logSheetChange({ changeType: 'REMOVE_ROW', source: { getActiveSheet: () => T('Changelog') } });
ok(logs().pop().tab === 'Changelog', 'deleting lines from the Changelog itself is logged too');
const ownTab = new (Object.getPrototypeOf(T('Trainings')).constructor)('My notes');
ctx.logSheetChange({ changeType: 'REMOVE_ROW', source: { getActiveSheet: () => ownTab } });
ok(logs().length === before8d + 2, 'tabs of your own are left alone');
const logSize = logs().length;
vm.runInContext("var keepSheet = SpreadsheetApp.getActiveSpreadsheet; SpreadsheetApp.getActiveSpreadsheet = function () { throw new Error('Sheet unavailable'); }", ctx);
ok(vm.runInContext('log_({ who: "x", action: "y" }); true', ctx), 'a problem writing the log never stops the work');
vm.runInContext('SpreadsheetApp.getActiveSpreadsheet = keepSheet', ctx);
ok(logs().length === logSize, 'and writes nothing half-way');

// 9. full and hidden
const trS = T('Trainings'), H = trS.getRange(1, 1, 1, trS.getLastColumn()).getValues()[0];
trS.set(3, H.indexOf('max_participants') + 1, 2);           // SAMPLE-2 now has 2 registrations
d = ctx.getAppData();
ok(byId('SAMPLE-2').state === 'full', 'SAMPLE-2 now full');
throws(() => ctx.register(person({ training_id: 'SAMPLE-2', email: 'late@example.com' })), /full/, 'full training refused');
trS.set(2, H.indexOf('max_participants') + 1, 1);           // SAMPLE-1 full too, but it is happening
throws(() => ctx.register(person({ email: 'late2@example.com' })), /full/, 'full training refused for a normal registration');
ok(ctx.register(person({ email: 'late3@example.com', walk_in: true })).checkIn.status === 'ok', 'walk-ins still get in on the training day');
trS.set(3, H.indexOf('show_in_list') + 1, false);
d = ctx.getAppData();
ok(!byId('SAMPLE-2'), 'unticked show_in_list hides SAMPLE-2');

console.log(pass + ' checks passed');
