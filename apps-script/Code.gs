/**
 * SANAY — training registration, attendance and evaluation
 * Google Apps Script back end. The Google Sheet is the database.
 *
 * Home screen: Register, Attendance (with walk-ins), Evaluation, Request a training and
 * Training partnership.
 * Organizers: SANAY › Open the report page (attendance sheet, certificates, participant profile,
 * photo and recording, impact interviews, training requests, partnership requests).
 *
 * Files in this Apps Script project:
 *   Code.gs     this file
 *   Logos.gs    the UP, UPRI and NOAH logos (optional; without it the app shows no logos)
 *   Index.html  the web page
 *
 * Set-up steps are in README.md of the sanay repository. In short:
 *   1. Make a Google Sheet. Extensions › Apps Script. Paste Code.gs, add Logos.gs (script)
 *      and Index (HTML file). Save.
 *   2. Run the function "setup" once and approve the permissions.
 *   3. Deploy › New deployment › Web app. Execute as: Me. Who has access: Anyone.
 *   4. Share the web app link. Add ?page=register, ?page=attendance or ?page=evaluation
 *      to open a screen directly, and &t=TRAINING_ID to preselect a training.
 *   5. Reports: in the Sheet, choose SANAY › Open the report page.
 *
 * After you change any file: Deploy › Manage deployments › pencil › Version: New version › Deploy.
 */

const CONFIG = {
  // ---- The name on the home screen. In the expansion, the capital letters that spell the name
  //      (in order, same case) are highlighted: S-A-N-A-Y. The C of CapacitY is skipped.
  name: 'SANAY',
  expansion: 'Skills And Needs Assessment and Training Interventions towards enhanced DRRM CapacitY',

  // ---- The project, shown above the name. projectMark is highlighted the same way: Ta-Ta-K.
  project: 'TaTaK Resilience Project',
  projectMark: 'TaTaK',
  projectExpansion: 'TagapagTaguyod ng Kasanayan tungo sa Katatagan',

  // ---- Header and footer of the home screen and the printed attendance sheet (from the GAD template)
  institution: ['UNIVERSITY OF THE PHILIPPINES', 'Resilience Institute and NOAH Center'],
  address: 'UP Resilience Institute, Magsaysay Avenue corner Apacible Street, University of the Philippines, Diliman, 1101 Quezon City, Philippines.',
  contactNo: 'Tel. +63 (2) 8981-8500 Local 3770, 3771',
  email: 'resilience.institute@up.edu.ph',
  bandColors: ['#014421', '#7B1113'],   // UP forest green and UP maroon, the corner bands of the template

  // ---- Data Privacy Statement, word for word from the GAD attendance template.
  // If you change it, change privacyVersion too: each registration records the version it agreed to.
  privacyVersion: 'GAD attendance sheet DPS',
  privacyStatement: 'This data collection is conducted in accordance with the provisions of Republic Act No. 9710 and the guidelines issued by the Philippine Commission on Women, which require the generation of sex-disaggregated data to support Gender and Development (GAD) planning and monitoring. All information gathered will be processed in compliance with the Republic Act No. 10173 to ensure the protection, confidentiality, and responsible handling of personal data. The data collected may be used for research and academic purposes, institutional Gender and Development (GAD) planning and reporting, and submissions to the Performance Budget Monitoring System (PBMS). Any results derived from the data will be presented only in aggregated or anonymized form. Any other use of the information not stated above shall be properly coordinated with the participant and undertaken in accordance with applicable data privacy and ethical standards.',

  // ---- Photo and recording consent. DRAFT wording: ask your Data Protection Officer to review it.
  mediaStatement: 'We take photos and audio or video recordings during the activity for documentation, reports and official information materials, which may be posted on official websites and social media pages. Tell us if we may include you. You can change your answer anytime by telling the organizers.',

  // ---- Impact monitoring consent (follow-up interviews). DRAFT wording: ask your DPO to review it.
  impactStatement: 'After the training, our staff may contact you for impact monitoring: a short interview, by phone, online or in person, about how the training has helped you and your work. You can still say no when we call.',

  // ---- Request a training: the topics people can tick, and the note shown above the consent box
  requestTopics: [
    'Incident Command System (ICS)',
    'Rapid Damage Assessment and Needs Analysis (RDANA)',
    'Psychological First Aid (PFA)',
    'Business Continuity Planning',
    'Contingency Planning',
    'Early Warning Systems',
    'Hazard and risk mapping',
    'Community-based DRRM',
    'Emergency Operations Center (EOC)',
    'Basic Life Support and First Aid'
  ],
  requestPrivacy: 'We use these details only to plan the training you are requesting and to contact you about it, under the Data Privacy Act of 2012 (Republic Act No. 10173).',

  // ---- Training partnership: what partners can offer, the kinds of organization, and the consent note
  partnershipTypes: [
    'Co-organize a training',
    'Provide trainers or resource persons',
    'Host the venue',
    'Fund or sponsor a training',
    'Send participants',
    'Develop training materials'
  ],
  organizationTypes: ['Local government unit', 'National government agency', 'NGO or civil society', 'Academe',
    'Private sector', 'International or development partner', 'Other'],
  partnershipPrivacy: 'We use these details only to discuss this partnership with you and to keep a list of potential training partners, under the Data Privacy Act of 2012 (Republic Act No. 10173).',

  // ---- Certificates: who is eligible. Both rules also need the evaluation.
  //      'all-days': checked in on every training day.  'any-day': checked in on at least one day.
  certificateRule: 'all-days',

  // ---- Behaviour
  timeZone: 'Asia/Manila',
  completedShown: 'this-year',   // completed trainings in the Register dropdown: 'this-year' or 'all'
  evaluationDaysAfter: 14,       // evaluation stays open this many days after the last training day
  reportLinkHours: 6,            // how long a report link from the Sheet menu works (6 at most)
  webAppUrl: ''                  // optional: paste the web app link here if the report menu can't find it
};

// Column headers of each tab. The script finds columns by these names,
// so you may add your own columns at the far right, but don't rename these.
const TABS = {
  Trainings: ['training_id', 'title', 'start_date', 'end_date', 'venue', 'mode', 'show_in_list',
    'max_participants', 'registration_closes', 'notes'],
  Registrations: ['timestamp', 'reg_code', 'training_id', 'training_title', 'last_name', 'first_name',
    'middle_initial', 'suffix', 'full_name', 'position', 'agency', 'email', 'contact_no', 'gad_consent',
    'sex', 'age_range', 'senior_citizen', 'pwd', 'indigenous_people', 'tribe', 'photo_consent',
    'recording_consent', 'impact_consent', 'privacy_version', 'registered_as', 'evaluated_on'],
  Attendance: ['timestamp', 'date', 'training_id', 'reg_code', 'full_name', 'sex', 'agency', 'method'],
  Evaluations: ['date', 'training_id', 'overall', 'objectives_met', 'resource_persons', 'venue_logistics',
    'will_apply', 'comments'],
  Requests: ['timestamp', 'request_code', 'first_name', 'last_name', 'full_name', 'position', 'agency', 'email',
    'contact_no', 'topics', 'other_topics', 'need', 'participants', 'participant_types', 'preferred_date',
    'alternative_date', 'mode', 'location', 'status', 'notes'],
  Partnerships: ['timestamp', 'request_code', 'organization', 'org_type', 'location', 'website', 'partnership_types',
    'other_partnership', 'topics', 'other_topics', 'proposal', 'preferred_start', 'first_name', 'last_name',
    'full_name', 'position', 'email', 'contact_no', 'status', 'notes']
};

const AGE_RANGES = ['0-9', '10-19', '15-24', '25-59', '60+'];   // as printed in the GAD template
const YES_NO = ['Yes', 'No'];
const REQUEST_MODES = ['Face-to-face', 'Online', 'Blended', 'No preference'];
const REQUEST_STATUSES = ['New', 'Contacted', 'Scheduled', 'Done', 'Declined'];
const PARTNER_STATUSES = ['New', 'Contacted', 'In talks', 'Partner', 'Declined'];
const STATE_MESSAGES = {
  full: 'This training is full.',
  closed: 'Registration for this training is closed.',
  completed: 'This training has ended.'
};
const RATING_KEYS = ['overall', 'objectives_met', 'resource_persons', 'venue_logistics'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O, 1/I/L
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ===================================================================
 * Web app
 * =================================================================== */

function doGet() {
  const page = HtmlService.createTemplateFromFile('Index');
  page.brand = brandJson_();
  return page.evaluate()
    .setTitle(CONFIG.name + ' Training Registration')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    // Allows the page to be embedded in a Google Site, for a shorter address.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Name, logos and template header, written into the page before it loads. */
function brandJson_() {
  const logos = (typeof LOGOS !== 'undefined' && Array.isArray(LOGOS)) ? LOGOS : [];
  const brand = {
    name: CONFIG.name,
    expansion: CONFIG.expansion,
    project: CONFIG.project,
    projectMark: CONFIG.projectMark,
    projectExpansion: CONFIG.projectExpansion,
    institution: CONFIG.institution,
    address: CONFIG.address,
    contact: CONFIG.contactNo,
    email: CONFIG.email,
    bands: CONFIG.bandColors,
    logos: logos.filter(function (l) { return l && l.src; })
      .map(function (l) { return { src: String(l.src), alt: String(l.alt || '') }; })
  };
  return JSON.stringify(brand)
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Everything the participant screens need when they open. */
function getAppData() {
  const today = today_();
  return {
    today: today,
    evaluationDaysAfter: CONFIG.evaluationDaysAfter,
    privacyStatement: CONFIG.privacyStatement,
    mediaStatement: CONFIG.mediaStatement,
    impactStatement: CONFIG.impactStatement,
    requestTopics: CONFIG.requestTopics,
    requestPrivacy: CONFIG.requestPrivacy,
    partnershipTypes: CONFIG.partnershipTypes,
    organizationTypes: CONFIG.organizationTypes,
    partnershipPrivacy: CONFIG.partnershipPrivacy,
    trainings: listTrainings_(today)
  };
}

/**
 * Saves one registration and returns the registration code.
 * The GAD fields are kept only when the person consents to the Data Privacy Statement.
 * Walk-ins (registering from the Attendance screen on a training day) are checked in too.
 */
function register(form) {
  form = form || {};
  const f = {
    training_id: clean_(form.training_id, 60),
    last_name: clean_(form.last_name, 80),
    first_name: clean_(form.first_name, 80),
    middle_initial: clean_(form.middle_initial, 5),
    suffix: clean_(form.suffix, 10),
    position: clean_(form.position, 120),
    agency: clean_(form.agency, 160),
    email: clean_(form.email, 120).toLowerCase(),
    contact_no: clean_(form.contact_no, 30),
    gad_consent: oneOf_(form.gad_consent, YES_NO),
    photo_consent: oneOf_(form.photo_consent, YES_NO),
    recording_consent: oneOf_(form.recording_consent, YES_NO),
    impact_consent: oneOf_(form.impact_consent, YES_NO)
  };
  const gad = { sex: '', age_range: '', senior_citizen: '', pwd: '', indigenous_people: '', tribe: '' };
  if (f.gad_consent === 'Yes') {
    gad.sex = oneOf_(form.sex, ['Male', 'Female']);
    gad.age_range = oneOf_(form.age_range, AGE_RANGES);
    gad.senior_citizen = oneOf_(form.senior_citizen, YES_NO);
    gad.pwd = oneOf_(form.pwd, YES_NO);
    gad.indigenous_people = oneOf_(form.indigenous_people, YES_NO);
    gad.tribe = gad.indigenous_people === 'Yes' ? clean_(form.tribe, 80) : '';
  }

  const missing = [];
  if (!f.training_id) missing.push('the training');
  if (!f.first_name) missing.push('your first name');
  if (!f.last_name) missing.push('your last name');
  if (!f.agency) missing.push('your agency, office or department');
  if (!f.email) missing.push('your email');
  if (!f.gad_consent) missing.push('your answer on consent');
  if (f.gad_consent === 'Yes') {
    if (!gad.sex) missing.push('your sex');
    if (!gad.age_range) missing.push('your age range');
    if (!gad.senior_citizen) missing.push('whether you are a senior citizen');
    if (!gad.pwd) missing.push('whether you are a person with disability');
    if (!gad.indigenous_people) missing.push('whether you belong to an indigenous people');
    if (gad.indigenous_people === 'Yes' && !gad.tribe) missing.push('the name of your tribe');
  }
  if (!f.photo_consent) missing.push('your answer on photos');
  if (!f.recording_consent) missing.push('your answer on recordings');
  if (!f.impact_consent) missing.push('your answer on the follow-up interview');
  if (missing.length) throw new Error('Please fill in ' + missing.join(', ') + '.');
  if (!EMAIL_RE.test(f.email)) throw new Error('Enter a valid email, like name@example.com.');
  const digits = f.contact_no.replace(/\D/g, '');
  if (f.contact_no && (digits.length < 7 || digits.length > 15)) throw new Error('Enter a contact number with 7 to 15 digits.');
  const walkIn = form.walk_in === true;

  return withLock_(function () {
    const today = today_();
    const t = listTrainings_(today).filter(function (x) { return x.id === f.training_id; })[0];
    if (!t) throw new Error('That training is no longer in the list. Reload the page to see the current trainings.');
    const canWalkIn = walkIn && t.happening;
    if (!(t.listed && t.state === 'open') && !canWalkIn) throw new Error(STATE_MESSAGES[t.state] || STATE_MESSAGES.closed);

    const regs = readTable_('Registrations');
    let reg = regs.filter(function (r) {
      return String(r.training_id) === t.id && String(r.email).toLowerCase() === f.email;
    })[0];
    let result;
    if (reg) {
      result = { already: true, code: String(reg.reg_code), name: String(reg.full_name), training: t, stamp: stamp_(reg.timestamp) };
    } else {
      const now = new Date();
      reg = Object.assign({}, f, gad, {
        timestamp: now,
        reg_code: newCode_(regs.map(function (r) { return String(r.reg_code); })),
        training_title: t.title,
        full_name: fullName_(f),
        privacy_version: CONFIG.privacyVersion,
        registered_as: today >= t.start ? 'Walk-in' : 'Pre-registered',
        evaluated_on: ''
      });
      appendRecord_('Registrations', reg);
      result = { already: false, code: reg.reg_code, name: reg.full_name, training: t, stamp: stamp_(now) };
    }
    if (canWalkIn) result.checkIn = checkInLocked_(t, reg, 'Walk-in', today);
    return result;
  });
}

/** Records attendance for today. One check-in per person per day. */
function checkIn(data) {
  data = data || {};
  const trainingId = clean_(data.training_id, 60);
  const key = clean_(data.key, 120);
  if (!trainingId || !key) throw new Error('Choose your training and enter your registration code or email.');

  return withLock_(function () {
    const today = today_();
    const t = listTrainings_(today).filter(function (x) { return x.id === trainingId; })[0];
    if (!t || !t.happening) throw new Error('Check-in is open only on the training days.');
    const reg = findRegistration_(trainingId, key);
    if (!reg) return { status: 'not-found' };
    return checkInLocked_(t, reg, key.indexOf('@') > -1 ? 'Email' : 'Code', today);
  });
}

/** Saves an evaluation without the person's name. */
function submitEvaluation(data) {
  data = data || {};
  const trainingId = clean_(data.training_id, 60);
  const key = clean_(data.key, 120);
  const a = data.answers || {};
  if (!trainingId || !key) throw new Error('Choose the training and enter your registration code or email.');
  RATING_KEYS.forEach(function (k) {
    const n = Number(a[k]);
    if (!(n >= 1 && n <= 5 && Math.round(n) === n)) throw new Error('Please answer every rating question.');
  });

  return withLock_(function () {
    const today = today_();
    const t = listTrainings_(today).filter(function (x) { return x.id === trainingId; })[0];
    if (!t || !t.evalOpen) throw new Error('Evaluation for this training is closed.');

    const reg = findRegistration_(trainingId, key);
    if (!reg) return { status: 'not-found' };
    if (reg.evaluated_on) return { status: 'already' };

    // 1) Note that this person has evaluated (so they can't send twice)…
    setValue_('Registrations', reg.__row, 'evaluated_on', today);
    // 2) …and keep the answers in a separate tab with no name or code.
    insertAnonymous_('Evaluations', {
      date: today, training_id: trainingId,
      overall: Number(a.overall), objectives_met: Number(a.objectives_met),
      resource_persons: Number(a.resource_persons), venue_logistics: Number(a.venue_logistics),
      will_apply: clean_(a.will_apply, 1000), comments: clean_(a.comments, 1000)
    });
    return { status: 'ok' };
  });
}

/** Saves a training request: topics, preferred schedule and who is asking. */
function submitRequest(form) {
  form = form || {};
  const topics = (Array.isArray(form.topics) ? form.topics : [])
    .map(function (t) { return clean_(t, 120); })
    .filter(function (t, i, all) { return CONFIG.requestTopics.indexOf(t) > -1 && all.indexOf(t) === i; });
  const f = {
    first_name: clean_(form.first_name, 80),
    last_name: clean_(form.last_name, 80),
    position: clean_(form.position, 120),
    agency: clean_(form.agency, 160),
    email: clean_(form.email, 120).toLowerCase(),
    contact_no: clean_(form.contact_no, 30),
    topics: topics.join('; '),
    other_topics: clean_(form.other_topics, 300),
    need: clean_(form.need, 1500),
    participants: Number(form.participants),
    participant_types: clean_(form.participant_types, 200),
    preferred_date: isoDate_(form.preferred_date),
    alternative_date: isoDate_(form.alternative_date),
    mode: oneOf_(form.mode, REQUEST_MODES),
    location: clean_(form.location, 200)
  };
  const today = today_();
  const missing = [];
  if (!topics.length && !f.other_topics) missing.push('at least one topic');
  if (!f.preferred_date) missing.push('a preferred date');
  if (!f.mode) missing.push('the mode');
  if (!f.first_name) missing.push('your first name');
  if (!f.last_name) missing.push('your last name');
  if (!f.agency) missing.push('your agency, office or department');
  if (!f.email) missing.push('your email');
  if (missing.length) throw new Error('Please fill in ' + missing.join(', ') + '.');
  if (!(f.participants >= 1 && f.participants <= 5000 && Math.round(f.participants) === f.participants)) throw new Error('Enter the number of participants, from 1 to 5000.');
  if (f.preferred_date < today || (f.alternative_date && f.alternative_date < today)) throw new Error('Choose dates from today onward.');
  if (!EMAIL_RE.test(f.email)) throw new Error('Enter a valid email, like name@example.com.');
  const digits = f.contact_no.replace(/\D/g, '');
  if (f.contact_no && (digits.length < 7 || digits.length > 15)) throw new Error('Enter a contact number with 7 to 15 digits.');
  if (form.consent !== true) throw new Error('Tick the box so we can contact you about this request.');

  return withLock_(function () {
    const now = new Date();
    const code = newCode_(readTable_('Requests').map(function (r) { return String(r.request_code); }));
    appendRecord_('Requests', Object.assign({}, f, {
      timestamp: now, request_code: code, full_name: [f.first_name, f.last_name].join(' '), status: 'New', notes: ''
    }));
    return {
      code: code, stamp: stamp_(now), topics: topics.concat(f.other_topics ? [f.other_topics] : []).join('; '),
      preferred_date: f.preferred_date, alternative_date: f.alternative_date, mode: f.mode, participants: f.participants
    };
  });
}

/** Saves a training partnership request from an organization. */
function submitPartnership(form) {
  form = form || {};
  const pick = function (list, allowed) {
    return (Array.isArray(list) ? list : []).map(function (t) { return clean_(t, 120); })
      .filter(function (t, i, all) { return allowed.indexOf(t) > -1 && all.indexOf(t) === i; });
  };
  const types = pick(form.types, CONFIG.partnershipTypes);
  const topics = pick(form.topics, CONFIG.requestTopics);
  const f = {
    organization: clean_(form.organization, 200),
    org_type: oneOf_(form.org_type, CONFIG.organizationTypes),
    location: clean_(form.location, 120),
    website: clean_(form.website, 200),
    partnership_types: types.join('; '),
    other_partnership: clean_(form.other_type, 200),
    topics: topics.join('; '),
    other_topics: clean_(form.other_topics, 300),
    proposal: String(form.proposal || '').trim().slice(0, 2000),
    preferred_start: isoDate_(form.preferred_start),
    first_name: clean_(form.first_name, 80),
    last_name: clean_(form.last_name, 80),
    position: clean_(form.position, 120),
    email: clean_(form.email, 120).toLowerCase(),
    contact_no: clean_(form.contact_no, 30)
  };
  const missing = [];
  if (!f.organization) missing.push('your organization\'s name');
  if (!f.org_type) missing.push('the type of organization');
  if (!types.length && !f.other_partnership) missing.push('the kind of partnership');
  if (f.proposal.length < 10) missing.push('a short description of your idea');
  if (!f.first_name) missing.push('your first name');
  if (!f.last_name) missing.push('your last name');
  if (!f.email) missing.push('your email');
  if (missing.length) throw new Error('Please fill in ' + missing.join(', ') + '.');
  if (form.preferred_start && !f.preferred_start) throw new Error('Choose a real date for the start.');
  if (f.preferred_start && f.preferred_start < today_()) throw new Error('Choose a start date from today onward.');
  if (!EMAIL_RE.test(f.email)) throw new Error('Enter a valid email, like name@example.com.');
  const digits = f.contact_no.replace(/\D/g, '');
  if (f.contact_no && (digits.length < 7 || digits.length > 15)) throw new Error('Enter a contact number with 7 to 15 digits.');
  if (form.consent !== true) throw new Error('Tick the box so we can contact you about this partnership.');

  return withLock_(function () {
    const now = new Date();
    const code = newCode_(readTable_('Partnerships').map(function (r) { return String(r.request_code); }));
    appendRecord_('Partnerships', Object.assign({}, f, {
      timestamp: now, request_code: code, full_name: [f.first_name, f.last_name].join(' '), status: 'New', notes: ''
    }));
    return {
      code: code, stamp: stamp_(now), organization: f.organization,
      partnership: types.concat(f.other_partnership ? [f.other_partnership] : []).join('; '),
      topics: topics.concat(f.other_topics ? [f.other_topics] : []).join('; '), preferred_start: f.preferred_start
    };
  });
}

/* ===================================================================
 * Organizer report (attendance sheet, certificates, profile, consents, requests)
 * =================================================================== */

/**
 * Sheet menu: SANAY › Open the report page.
 * Makes a link that works for a few hours, because the report shows personal data
 * and the web app itself is open to anyone.
 */
function openReport() {
  const ui = SpreadsheetApp.getUi();   // first, so this can't run from the web page
  const url = CONFIG.webAppUrl || ScriptApp.getService().getUrl();
  if (!url) {
    ui.alert('Deploy the web app first: Deploy › New deployment › Web app. Then try again.');
    return;
  }
  const hours = Math.max(1, Math.min(6, Number(CONFIG.reportLinkHours) || 6));
  const key = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('report:' + key, '1', hours * 3600);

  let trainingId = '';
  const sh = SpreadsheetApp.getActiveSheet();
  const range = sh.getActiveRange();
  if (sh.getName() === 'Trainings' && range && range.getRow() > 1) {
    const c = headers_(sh).indexOf('training_id') + 1;
    if (c > 0) trainingId = String(sh.getRange(range.getRow(), c).getValue() || '').trim();
  }
  const link = url + (url.indexOf('?') > -1 ? '&' : '?') + 'page=report&key=' + key +
    (trainingId ? '&t=' + encodeURIComponent(trainingId) : '');
  const html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif;color:#1A1F1C">' +
    '<p style="margin:0 0 10px">' + (trainingId ? 'Report for <b>' + esc_(trainingId) + '</b>. ' : '') +
    'The link works for ' + hours + ' hours. Don\'t forward it: it shows participants\' personal data.</p>' +
    '<p style="margin:0"><a href="' + esc_(link) + '" target="_blank" rel="noopener" ' +
    'style="display:inline-block;padding:10px 18px;border-radius:10px;background:#7B1113;color:#FFFFFF;font-weight:bold;text-decoration:none">' +
    'Open the report page</a></p></div>'
  ).setWidth(440).setHeight(150);
  ui.showModalDialog(html, CONFIG.name + ' report');
}

/** Data for the report page. Needs a valid key from openReport(). */
function getReport(req) {
  req = req || {};
  const key = String(req.key || '').replace(/[^0-9a-f]/gi, '').slice(0, 64);
  if (!key || !CacheService.getScriptCache().get('report:' + key)) {
    throw new Error('This report link has expired or is not valid. In the Google Sheet, choose ' +
      CONFIG.name + ' › Open the report page to get a new one.');
  }
  const today = today_();
  const all = readTable_('Trainings')
    .filter(function (r) { return String(r.training_id).trim(); })
    .map(function (r) {
      const start = ymd_(r.start_date);
      return {
        id: String(r.training_id).trim(), title: String(r.title || '').trim() || String(r.training_id).trim(),
        start: start, end: ymd_(r.end_date) || start, venue: String(r.venue || '').trim(), mode: String(r.mode || '').trim()
      };
    })
    .sort(function (a, b) { return a.start < b.start ? 1 : a.start > b.start ? -1 : 0; });

  let id = clean_(req.training_id, 60);
  if (!all.some(function (t) { return t.id === id; })) id = defaultReportTraining_(all, today);
  const t = all.filter(function (x) { return x.id === id; })[0] || null;

  const fields = ['reg_code', 'last_name', 'first_name', 'full_name', 'position', 'agency', 'email', 'contact_no',
    'gad_consent', 'sex', 'age_range', 'senior_citizen', 'pwd', 'indigenous_people', 'tribe', 'photo_consent',
    'recording_consent', 'impact_consent', 'registered_as', 'evaluated_on'];
  const registrations = !t ? [] : readTable_('Registrations')
    .filter(function (r) { return String(r.training_id) === t.id; })
    .map(function (r) {
      const o = { timestamp: stamp_(r.timestamp) };
      fields.forEach(function (k) { o[k] = r[k] === undefined || r[k] === null ? '' : String(r[k]); });
      o.evaluated_on = ymd_(r.evaluated_on);
      return o;
    });
  const attendance = !t ? [] : readTable_('Attendance')
    .filter(function (r) { return String(r.training_id) === t.id; })
    .map(function (r) { return { timestamp: stamp_(r.timestamp), date: ymd_(r.date), reg_code: String(r.reg_code) }; });

  const reqFields = ['request_code', 'first_name', 'last_name', 'full_name', 'position', 'agency', 'email', 'contact_no',
    'topics', 'other_topics', 'need', 'participant_types', 'mode', 'location', 'status', 'notes'];
  const requests = readTable_('Requests').filter(function (r) { return String(r.request_code).trim(); }).map(function (r) {
    const o = { timestamp: stamp_(r.timestamp), participants: Number(r.participants) || 0,
      preferred_date: ymd_(r.preferred_date), alternative_date: ymd_(r.alternative_date) };
    reqFields.forEach(function (k) { o[k] = r[k] === undefined || r[k] === null ? '' : String(r[k]); });
    return o;
  });

  const ptFields = ['request_code', 'organization', 'org_type', 'location', 'website', 'partnership_types', 'other_partnership',
    'topics', 'other_topics', 'proposal', 'first_name', 'last_name', 'full_name', 'position', 'email', 'contact_no', 'status', 'notes'];
  const partnerships = readTable_('Partnerships').filter(function (r) { return String(r.request_code).trim(); }).map(function (r) {
    const o = { timestamp: stamp_(r.timestamp), preferred_start: ymd_(r.preferred_start) };
    ptFields.forEach(function (k) { o[k] = r[k] === undefined || r[k] === null ? '' : String(r[k]); });
    return o;
  });

  return {
    now: stamp_(new Date()), today: today, privacyStatement: CONFIG.privacyStatement,
    certificateRule: CONFIG.certificateRule === 'any-day' ? 'any-day' : 'all-days',
    trainings: all, training: t, registrations: registrations, attendance: attendance, requests: requests,
    partnerships: partnerships
  };
}

function defaultReportTraining_(all, today) {
  const now = all.filter(function (t) { return t.start && t.start <= today && today <= t.end; })[0];
  if (now) return now.id;
  const past = all.filter(function (t) { return t.start && t.start <= today; })[0];
  if (past) return past.id;
  return all.length ? all[all.length - 1].id : '';
}

/* ===================================================================
 * Sheet set-up
 * =================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(CONFIG.name)
    .addItem('Open the report page', 'openReport')
    .addSeparator()
    .addItem('Set up or repair tabs', 'setup')
    .addToUi();
}

/** Creates the tabs and headers. Safe to run again: it never deletes data. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.timeZone);

  Object.keys(TABS).forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const have = sh.getLastColumn() ? headers_(sh) : [];
    const missing = TABS[name].filter(function (h) { return have.indexOf(h) === -1; });
    if (missing.length) sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#E3EFE7');
  });

  // Trainings: sample rows (only when there are no trainings yet), tick boxes, date formats
  const tr = ss.getSheetByName('Trainings');
  const H = headers_(tr);
  const col = function (h) { return H.indexOf(h) + 1; };
  const hasTrainings = readTable_('Trainings').some(function (r) { return String(r.training_id || '').trim(); });
  if (!hasTrainings) {
    const t = today_();
    const samples = [
      { training_id: 'SAMPLE-1', title: 'SAMPLE · Training happening today', start_date: t, end_date: addDays_(t, 1), venue: 'Quezon City', mode: 'Face-to-face', show_in_list: true, max_participants: 40, notes: 'Delete this row' },
      { training_id: 'SAMPLE-2', title: 'SAMPLE · Upcoming training', start_date: addDays_(t, 14), end_date: addDays_(t, 15), venue: 'Online (Zoom)', mode: 'Online', show_in_list: true, max_participants: 60, registration_closes: addDays_(t, 10), notes: 'Delete this row' },
      { training_id: 'SAMPLE-3', title: 'SAMPLE · Completed training', start_date: addDays_(t, -10), end_date: addDays_(t, -9), venue: 'Quezon City', mode: 'Face-to-face', show_in_list: true, notes: 'Delete this row' }
    ];
    tr.getRange(2, 1, samples.length, H.length).setValues(samples.map(function (s) {
      return H.map(function (h) { return h in s ? s[h] : ''; });   // ISO date text is read as a date in the Sheet's time zone
    }));
  }
  // A checkbox rule (rather than insertCheckboxes) keeps any ticks already there.
  tr.getRange(2, col('show_in_list'), 499, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build());
  ['start_date', 'end_date', 'registration_closes'].forEach(function (h) {
    tr.getRange(2, col(h), 499, 1)
      .setNumberFormat('mmm d, yyyy')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  });
  tr.getRange(2, col('mode'), 499, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Face-to-face', 'Online', 'Blended'], true).build());
  tr.getRange(1, col('training_id')).setNote('A short code you choose, e.g. ICS-4. Never change it once people have registered.');
  tr.getRange(1, col('show_in_list')).setNote('Tick when the training is ready to announce. Unticked rows never appear in the app.');
  tr.getRange(1, col('registration_closes')).setNote('Optional. Leave blank to keep registration open until the last day. Walk-ins can still register on the training days.');

  // Automatic counts (registered, female, male) after the last column
  if (H.indexOf('registered') === -1) {
    const R = headers_(ss.getSheetByName('Registrations'));
    const tid = columnLetter_(R.indexOf('training_id') + 1);
    const sex = columnLetter_(R.indexOf('sex') + 1);
    const ids = columnLetter_(col('training_id'));
    const ref = function (c) { return 'Registrations!' + c + '2:' + c; };
    const c0 = tr.getLastColumn() + 1;
    tr.getRange(1, c0, 1, 3).setFormulas([[
      '={"registered";ARRAYFORMULA(IF(' + ids + '2:' + ids + '="","",COUNTIF(' + ref(tid) + ',' + ids + '2:' + ids + ')))}',
      '={"female";ARRAYFORMULA(IF(' + ids + '2:' + ids + '="","",COUNTIFS(' + ref(tid) + ',' + ids + '2:' + ids + ',' + ref(sex) + ',"Female")))}',
      '={"male";ARRAYFORMULA(IF(' + ids + '2:' + ids + '="","",COUNTIFS(' + ref(tid) + ',' + ids + '2:' + ids + ',' + ref(sex) + ',"Male")))}'
    ]]);
    tr.getRange(1, c0, 1, 3).setFontWeight('bold').setBackground('#F7E9E9');
    tr.getRange(1, c0).setNote("These three columns count themselves. Don't type in them. Female and male count only people who consented to the GAD questions.");
  }

  ['Registrations', 'Attendance'].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    sh.getRange(2, headers_(sh).indexOf('timestamp') + 1, 999, 1).setNumberFormat('yyyy-mm-dd h:mm am/pm');
  });
  ss.getSheetByName('Registrations').getRange(1, 1).setNote('The timestamp is when the person submitted the form. It stands in for the signature on the GAD attendance sheet.');
  ss.getSheetByName('Evaluations').getRange(1, 1).setNote('No names or codes here on purpose. New rows go in at random positions.');
  const rq = ss.getSheetByName('Requests');
  const RQ = headers_(rq);
  rq.getRange(2, RQ.indexOf('timestamp') + 1, 999, 1).setNumberFormat('yyyy-mm-dd h:mm am/pm');
  rq.getRange(2, RQ.indexOf('status') + 1, 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(REQUEST_STATUSES, true).build());
  rq.getRange(1, RQ.indexOf('status') + 1).setNote('For organizers: New, Contacted, Scheduled, Done or Declined.');
  const pt = ss.getSheetByName('Partnerships');
  const PT = headers_(pt);
  pt.getRange(2, PT.indexOf('timestamp') + 1, 999, 1).setNumberFormat('yyyy-mm-dd h:mm am/pm');
  pt.getRange(2, PT.indexOf('status') + 1, 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(PARTNER_STATUSES, true).build());
  pt.getRange(1, PT.indexOf('status') + 1).setNote('For organizers: New, Contacted, In talks, Partner or Declined. This tab is also your list of potential training partners.');

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  try { ss.toast('The ' + CONFIG.name + ' tabs are ready.', CONFIG.name, 5); } catch (e) { /* toast only works with the Sheet open */ }
}

/* ===================================================================
 * Helpers
 * =================================================================== */

/** The trainings the app may show, with their status for today. */
function listTrainings_(today) {
  const counts = {};
  readTable_('Registrations').forEach(function (r) {
    const id = String(r.training_id).trim();
    if (id) counts[id] = (counts[id] || 0) + 1;
  });
  const yearStart = today.slice(0, 4) + '-01-01';
  return readTable_('Trainings')
    .filter(function (r) { return String(r.training_id).trim() && isTicked_(r.show_in_list); })
    .map(function (r) {
      const id = String(r.training_id).trim();
      const start = ymd_(r.start_date);
      const end = ymd_(r.end_date) || start;
      const closes = ymd_(r.registration_closes);
      const max = Number(r.max_participants) || 0;
      const count = counts[id] || 0;
      let state = 'open';
      if (!start) state = 'closed';
      else if (end < today) state = 'completed';
      else if (closes && closes < today) state = 'closed';
      else if (max && count >= max) state = 'full';
      return {
        id: id,
        title: String(r.title || '').trim() || id,
        start: start,
        end: end,
        venue: String(r.venue || '').trim(),
        mode: String(r.mode || '').trim(),
        max: max,
        count: count,
        closes: closes,
        state: state,
        happening: !!start && start <= today && today <= end,
        evalOpen: !!start && start <= today && today <= addDays_(end, CONFIG.evaluationDaysAfter),
        listed: state !== 'completed' || CONFIG.completedShown === 'all' || end >= yearStart
      };
    })
    .filter(function (t) { return t.listed || t.evalOpen; });
}

/** Checks a registration in for today (the caller holds the lock). */
function checkInLocked_(t, reg, method, today) {
  const code = String(reg.reg_code);
  const name = String(reg.full_name);
  const day = dayNumber_(t.start, today);
  const days = dayNumber_(t.start, t.end);
  const prev = readTable_('Attendance').filter(function (a) {
    return String(a.training_id) === t.id && String(a.reg_code) === code && ymd_(a.date) === today;
  })[0];
  if (prev) return { status: 'already', name: name, time: timeOf_(prev.timestamp), day: day, days: days };
  const now = new Date();
  appendRecord_('Attendance', {
    timestamp: now, date: today, training_id: t.id, reg_code: code, full_name: name,
    sex: reg.sex, agency: reg.agency, method: method
  });
  return { status: 'ok', name: name, time: timeOf_(now), day: day, days: days };
}

function findRegistration_(trainingId, key) {
  const k = String(key).trim().toLowerCase();
  return readTable_('Registrations').filter(function (r) {
    return String(r.training_id) === trainingId &&
      (String(r.reg_code).toLowerCase() === k || String(r.email).toLowerCase() === k);
  })[0] || null;
}

/** Reads a tab into objects keyed by header; each has __row, its row number. */
function readTable_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const head = values.shift().map(function (h) { return String(h).trim(); });
  return values.map(function (row, i) {
    const o = { __row: i + 2 };
    head.forEach(function (h, j) { if (h) o[h] = row[j]; });
    return o;
  });
}

function appendRecord_(name, record) {
  const sh = sheet_(name);
  sh.appendRow(headers_(sh).map(function (h) { return toCell_(record[h]); }));
}

/** Puts a row at a random position so row order doesn't reveal who answered when. */
function insertAnonymous_(name, record) {
  const sh = sheet_(name);
  const row = headers_(sh).map(function (h) { return toCell_(record[h]); });
  const last = Math.max(sh.getLastRow(), 1);
  const pos = 2 + Math.floor(Math.random() * last);   // anywhere from row 2 to the row after the last
  if (pos <= last) sh.insertRowBefore(pos);
  sh.getRange(pos, 1, 1, row.length).setValues([row]);
}

function setValue_(name, rowNumber, column, value) {
  const sh = sheet_(name);
  const c = headers_(sh).indexOf(column) + 1;
  if (c < 1) throw new Error('The ' + name + ' tab has no "' + column + '" column. Choose ' + CONFIG.name + ' › Set up or repair tabs.');
  sh.getRange(rowNumber, c).setValue(toCell_(value));
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" tab is missing. Open the Sheet and choose ' + CONFIG.name + ' › Set up or repair tabs.');
  return sh;
}

function headers_(sh) {
  const n = sh.getLastColumn();
  if (!n) return [];
  return sh.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); });
}

/**
 * Text is written with a leading apostrophe so the Sheet keeps it exactly as typed:
 * no formulas run from a name like "=SUM(…)", 0917… keeps its leading zero,
 * and an age range like 10-19 stays text instead of turning into a date.
 */
function toCell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return s === '' ? '' : "'" + s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Many people are submitting right now. Please wait a few seconds and try again.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd');
}

/** Any date cell or date text → 'yyyy-MM-dd' in Philippine time, or '' if blank. */
function ymd_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, CONFIG.timeZone, 'yyyy-MM-dd');
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, CONFIG.timeZone, 'yyyy-MM-dd');
}

/** A timestamp cell → 'yyyy-MM-dd HH:mm' in Philippine time (for the page and the report). */
function stamp_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, CONFIG.timeZone, 'yyyy-MM-dd HH:mm');
  return String(v || '');
}

function addDays_(iso, n) {
  const p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}

function dayNumber_(startIso, iso) {
  const a = startIso.split('-').map(Number), b = iso.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 864e5) + 1;
}

function timeOf_(d) {
  return d instanceof Date ? Utilities.formatDate(d, CONFIG.timeZone, 'h:mm a') : '';
}

/** "Juan M. Dela Cruz Jr." — the name as written on the attendance sheet and the certificate. */
function fullName_(f) {
  const mi = String(f.middle_initial || '').replace(/\./g, '').trim().toUpperCase();
  return [f.first_name, mi ? mi + '.' : '', f.last_name, f.suffix].filter(String).join(' ');
}

function newCode_(existing) {
  const used = {};
  existing.forEach(function (c) { used[c] = true; });
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  } while (used[code]);
  return code;
}

function clean_(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 'yyyy-MM-dd' if the text is a real date in that form, otherwise ''. */
function isoDate_(v) {
  const s = clean_(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2] ? s : '';
}

/** The value if it is one of the allowed choices, otherwise ''. */
function oneOf_(v, choices) {
  const s = clean_(v, 40);
  return choices.indexOf(s) > -1 ? s : '';
}

function isTicked_(v) {
  return v === true || /^(true|yes)$/i.test(String(v).trim());
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
