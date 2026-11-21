/** @OnlyCurrentDoc  Limits this script to this one Google Sheet: it can't open your other files. */

/**
 * SANAY — training registration, attendance and evaluation
 * Google Apps Script back end. The Google Sheet is the database.
 *
 * Home screen: Register, Attendance (with walk-ins), Evaluation, Request a training and
 * Training partnership. Each registration gets a QR code.
 * Organizers: SANAY › Open the check-in scanner (scans the QR codes at the door, on several devices,
 * and keeps working through a weak signal), and SANAY › Open the report page (attendance sheet,
 * certificates, participant profile, evaluation results, QR name tags, photo and recording,
 * impact interviews, training requests, partnership requests).
 * Data stewards: entries that look like duplicates or spam are flagged and highlighted in the Sheet,
 * a message says how many when the Sheet opens, and SANAY › Review flagged entries lists them.
 * Admin mode (the web app link + ?page=admin, or the small lock on the home screen): the owner and the
 * data stewards sign in with their email and a 6-digit code sent to it, then run check-in from a phone:
 * close or reopen it for the day, check people in by hand or undo a mistake, and open the scanner.
 * Changelog tab: who changed what in the Sheet (old and new value) and everything done in admin mode.
 *
 * Files in this Apps Script project:
 *   Code.gs     this file
 *   Logos.gs    the UP, UPRI and NOAH logos and the half Oblation (optional; without it the app shows neither)
 *   Index.html  the web page
 *
 * Set-up steps are in README.md of the sanay repository. In short:
 *   1. Make a Google Sheet. Extensions › Apps Script. Paste Code.gs, add Logos.gs (script)
 *      and Index (HTML file). Save.
 *   2. Run the function "setup" once and approve the permissions.
 *   3. Deploy › New deployment › Web app. Execute as: Me. Who has access: Anyone.
 *   4. Share the web app link. Add ?page=register, ?page=attendance or ?page=evaluation
 *      to open a screen directly, and &t=TRAINING_ID to preselect a training.
 *   5. On the training day: SANAY › Open the check-in scanner. Reports: SANAY › Open the report page.
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
  projectAccent: 'Katatagan',   // shown in green: it means resilience, like "Resilience Project" below it

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

  // ---- Credits: the small (i) under the buttons on the home screen. The heading, then each person: the
  //      name, the lines under it, and an additional affiliation that opens from a small cap icon beside
  //      the name (leave it [] for no icon). Then the date. Empty lines are left out. Below these the app
  //      adds a short note on the QR code libraries and what it runs on.
  credits: {
    heading: 'Conceptualized and Developed with AI Assistance by:',
    people: [
      {
        name: 'Edward Andrew A. Dionido',
        lines: ['Science Research Specialist II', 'Institution Building Division',
          'University of the Philippines Resilience Institute'],
        additionalAffiliation: ['Graduate Student (Ongoing)', 'College of Professional and Graduate Studies',
          'De La Salle University Dasmariñas']
      }
    ],
    dateDeveloped: 'November 2026'
  },

  // ---- Check-in. Each registration gets a QR code that only the organizers' scanner reads
  //      (SANAY › Open the check-in scanner, which also asks for a PIN). Can people check themselves in
  //      on the Attendance screen with their code or email, from anywhere?
  //      'online': only for trainings whose mode is Online (there is no door to scan at). Face-to-face
  //                and blended trainings check in at the venue, so nobody can check in from home.
  //      false:    never; true: always (anyone with a code could then check in remotely).
  selfCheckIn: 'online',

  // ---- Certificates: who is eligible. Both rules also need the evaluation.
  //      'all-days': checked in on every training day.  'any-day': checked in on at least one day.
  certificateRule: 'all-days',

  // ---- Behaviour
  timeZone: 'Asia/Manila',
  completedShown: 'this-year',   // completed trainings in the Register dropdown: 'this-year' or 'all'
  evaluationDaysAfter: 14,       // evaluation stays open this many days after the last training day
  reportLinkHours: 6,            // how long a report link from the Sheet menu works (6 at most)
  webAppUrl: '',                 // optional: paste the web app link here if the report menu can't find it

  // ---- Data privacy: besides the Sheet's owner, the accounts allowed to open the report page,
  //      run setup and edit the data tabs. Example: ['juan.delacruz@up.edu.ph', 'second.steward@up.edu.ph']
  //      Empty: anyone who can edit the Sheet can open the report; only the owner can edit the data tabs.
  dataStewards: [],

  // ---- Evaluation: Likert statements, each rated from 1 (Strongly disagree) to 5 (Strongly agree).
  //      key is the column name in the Evaluations tab: don't change a key once people have answered.
  //      na: true adds "Not applicable" to every statement in that section.
  evaluationScale: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
  evaluationItems: [
    { section: 'Objectives and content', items: [
      { key: 'obj_clear', text: 'The objectives of the training were clearly explained.' },
      { key: 'obj_met', text: 'The training met its objectives.' },
      { key: 'content_relevant', text: 'The topics are relevant to my work.' },
      { key: 'content_organized', text: 'The topics were well organized and easy to follow.' }] },
    { section: 'Resource persons', items: [
      { key: 'rp_knowledge', text: 'The resource persons knew their topics well.' },
      { key: 'rp_clear', text: 'The resource persons explained the topics clearly.' },
      { key: 'rp_engaging', text: 'The resource persons encouraged questions and participation.' }] },
    { section: 'Methods and materials', items: [
      { key: 'methods_effective', text: 'The activities and exercises helped me learn.' },
      { key: 'materials_useful', text: 'The handouts and materials were useful.' },
      { key: 'time_enough', text: 'There was enough time for each topic.' }] },
    { section: 'Venue and arrangements', na: true, items: [
      { key: 'venue_ok', text: 'The venue or online platform suited the training.' },
      { key: 'logistics_ok', text: 'Registration, meals and other arrangements went well.' }] },
    { section: 'Learning and use', items: [
      { key: 'learned_new', text: 'I gained new knowledge and skills.' },
      { key: 'confident_apply', text: 'I am confident I can use what I learned in my work.' },
      { key: 'recommend', text: 'I would recommend this training to others.' }] },
    { section: 'Overall', items: [
      { key: 'overall', text: 'Overall, I am satisfied with this training.' }] }
  ]
};

// Column headers of each tab. The script finds columns by these names,
// so you may add your own columns at the far right, but don't rename these.
const TABS = {
  Trainings: ['training_id', 'title', 'start_date', 'end_date', 'venue', 'mode', 'show_in_list',
    'max_participants', 'registration_closes', 'notes'],
  Registrations: ['timestamp', 'reg_code', 'training_id', 'training_title', 'last_name', 'first_name',
    'middle_initial', 'suffix', 'full_name', 'position', 'agency', 'email', 'contact_no', 'gad_consent',
    'sex', 'age_range', 'senior_citizen', 'pwd', 'indigenous_people', 'tribe', 'photo_consent',
    'recording_consent', 'impact_consent', 'privacy_version', 'registered_as', 'evaluated_on', 'flag'],
  Attendance: ['timestamp', 'date', 'training_id', 'reg_code', 'full_name', 'sex', 'agency', 'method'],
  Evaluations: ['date', 'training_id'].concat(evalKeys_(), ['will_apply', 'comments', 'flag']),
  Requests: ['timestamp', 'request_code', 'first_name', 'last_name', 'full_name', 'position', 'agency', 'email',
    'contact_no', 'topics', 'other_topics', 'need', 'participants', 'participant_types', 'preferred_date',
    'alternative_date', 'mode', 'location', 'status', 'notes', 'flag'],
  Partnerships: ['timestamp', 'request_code', 'organization', 'org_type', 'location', 'website', 'partnership_types',
    'other_partnership', 'topics', 'other_topics', 'proposal', 'preferred_start', 'first_name', 'last_name',
    'full_name', 'position', 'email', 'contact_no', 'status', 'notes', 'flag'],
  // Written only by SANAY: one line per change. See "Changelog" further down.
  Changelog: ['timestamp', 'who', 'action', 'tab', 'row', 'record', 'column', 'old_value', 'new_value']
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
const DATA_TABS = ['Registrations', 'Attendance', 'Evaluations', 'Requests', 'Partnerships'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O, 1/I/L
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Duplicates and spam. Nothing is blocked: a new entry that looks like a duplicate or spam gets a short
// note in its "flag" column and an amber highlight, and the data stewards decide. To clear a flag, type OK
// in it (or delete the row if it is junk).
const FLAG_TABS = ['Registrations', 'Evaluations', 'Requests', 'Partnerships'];
const FLAG_NOTE = 'SANAY writes here when an entry looks like a duplicate or spam, and highlights the row. ' +
  'Check the entry: delete it if it is junk, or type OK here once it is fine. SANAY › Review flagged entries lists them all.';
const JUNK_RE = /^(test(ing|er)?|sample|dummy|fake|asdf|asd|qwe(rty)?|zxcv?|abcd?|x{3,}|xyz|null|undefined|lorem|ipsum|blah)$/i;
const KEYMASH_RE = /asdf|qwer|zxcv|hjkl|sdfg|ghjk/i;
const LINK_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|top|site|online|ru|cn|io|me|ly)\b/i;
const THROWAWAY_DOMAINS = ['mailinator.com', 'guerrillamail.com', 'sharklasers.com', 'grr.la', '10minutemail.com', 'temp-mail.org',
  'tempmail.com', 'tempmail.net', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
  'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'emailondeck.com'];
// Many entries in a few minutes: [this many, within this many minutes, what to call them]
const BURSTS = { Registrations: [20, 2, 'registrations'], Requests: [5, 10, 'requests'], Partnerships: [5, 10, 'partnership requests'] };
const AGAIN = 'Registered again with the same email';

// Admin mode. Who may sign in: the data stewards (dataStewards), the Sheet's owner and the account that
// deployed the web app. A code goes to the email; nobody gets in by typing an email alone.
const ADMIN_CODE_MINUTES = 10;     // a sign-in code works this long
const ADMIN_SESSION_HOURS = 12;    // then sign in again (long enough for a training day)
const ADMIN_SIGNED_OUT = 'You are signed out of admin mode. Sign in again with your email.';
const ADMIN_LOCKED = 'Too many wrong codes. Wait 10 minutes, then ask for a new code.';
const ADMIN_LOCKED_LONG = 'Too many wrong codes for this email. Sign-in is locked for 6 hours.';
const CHECKIN_CLOSED = 'Check-in for this training is closed for today. Please see the organizers.';

// Changelog: the column that names the entry on each row, so a line in the log says whose row it was.
// Evaluations are named only by training: they stay anonymous here too.
const RECORD_KEYS = { Trainings: 'training_id', Registrations: 'reg_code', Attendance: 'reg_code', Evaluations: 'training_id',
  Requests: 'request_code', Partnerships: 'request_code' };
const CHANGELOG_NOTE = 'SANAY adds a line here for each edit in its tabs (with the old and the new value), each action in admin mode ' +
  'and each report or scanner link. Leave it as it is: it is your record of who changed what. File › Version history has the rest.';

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
    projectAccent: CONFIG.projectAccent,
    institution: CONFIG.institution,
    address: CONFIG.address,
    contact: CONFIG.contactNo,
    email: CONFIG.email,
    bands: CONFIG.bandColors,
    logos: logos.filter(function (l) { return l && l.src; })
      .map(function (l) { return { src: String(l.src), alt: String(l.alt || '') }; }),
    credits: credits_(),
    // The half Oblation at the right edge of the pages (from Logos.gs; leave it out there to hide it)
    figure: typeof FIGURE !== 'undefined' && FIGURE && FIGURE.d ? { viewBox: String(FIGURE.viewBox), d: String(FIGURE.d) } : null
  };
  return JSON.stringify(brand)
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** CONFIG.credits as plain text for the credits box (the page writes it as text, never as HTML). */
function credits_() {
  const c = CONFIG.credits || {};
  const text = function (v) { return String(v == null ? '' : v).trim(); };
  const lines = function (a) { return (Array.isArray(a) ? a : [a]).map(text).filter(Boolean); };
  return {
    heading: text(c.heading),
    people: (Array.isArray(c.people) ? c.people : []).filter(function (p) { return p && text(p.name); })
      .map(function (p) { return { name: text(p.name), lines: lines(p.lines), additionalAffiliation: lines(p.additionalAffiliation) }; }),
    dateDeveloped: text(c.dateDeveloped)
  };
}

/** Everything the participant screens need when they open. */
function getAppData() {
  const today = today_();
  return {
    today: today,
    evaluationDaysAfter: CONFIG.evaluationDaysAfter,
    evaluationScale: CONFIG.evaluationScale,
    evaluationItems: evalSections_(),
    privacyStatement: CONFIG.privacyStatement,
    mediaStatement: CONFIG.mediaStatement,
    impactStatement: CONFIG.impactStatement,
    requestTopics: CONFIG.requestTopics,
    requestPrivacy: CONFIG.requestPrivacy,
    partnershipTypes: CONFIG.partnershipTypes,
    organizationTypes: CONFIG.organizationTypes,
    partnershipPrivacy: CONFIG.partnershipPrivacy,
    selfCheckIn: CONFIG.selfCheckIn === true ? true : CONFIG.selfCheckIn === 'online' ? 'online' : false,
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
  const r = readRegistration_(form);
  const f = r.f, gad = r.gad;
  const walkIn = form.walk_in === true;

  return withLock_(function () {
    const today = today_();
    const t = listTrainings_(today).filter(function (x) { return x.id === f.training_id; })[0];
    if (!t) throw new Error('That training is no longer in the list. Reload the page to see the current trainings.');
    const canWalkIn = walkIn && t.happening;
    if (!(t.listed && t.state === 'open') && !canWalkIn) throw new Error(STATE_MESSAGES[t.state] || STATE_MESSAGES.closed);
    const now = new Date();
    const saved = saveRegistration_(t, f, gad, now, today >= t.start ? 'Walk-in' : 'Pre-registered', { again: true, hp: clean_(form.hp, 200) });
    const result = {
      already: saved.already, code: String(saved.reg.reg_code), name: String(saved.reg.full_name), training: t,
      stamp: stamp_(saved.already ? saved.reg.timestamp : now)
    };
    if (canWalkIn) {
      if (selfCheckInFor_(t)) result.checkIn = recordCheckIn_(t, saved.reg, 'Walk-in', now);
      else result.atDoor = true;   // the scanner at the venue checks them in
    }
    return result;
  });
}

/** Reads and checks a registration form. Returns { f, gad }; throws with a message to show. */
function readRegistration_(form) {
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
  return { f: f, gad: gad };
}

/**
 * Adds a registration, or finds the one with the same email for this training (the caller holds the lock).
 * opts.again: note on that row that it was registered again (the Register form; not the walk-in desk).
 * opts.hp: the hidden field people never see, which only bots fill in.
 */
function saveRegistration_(t, f, gad, when, registeredAs, opts) {
  opts = opts || {};
  const regs = readTable_('Registrations');
  const dup = regs.filter(function (r) {
    return String(r.training_id) === t.id && String(r.email).toLowerCase() === f.email;
  })[0];
  if (dup) {
    if (opts.again) setFlag_('Registrations', dup.__row, addFlag_(dup.flag, AGAIN + ' on ' + stamp_(when), AGAIN));
    return { reg: dup, already: true };
  }
  const reg = Object.assign({}, f, gad, {
    timestamp: when,
    reg_code: newCode_(regs.map(function (r) { return String(r.reg_code); })),
    training_title: t.title,
    full_name: fullName_(f),
    privacy_version: CONFIG.privacyVersion,
    registered_as: registeredAs,
    evaluated_on: '',
    flag: registrationFlags_(f, regs, t, when, opts.hp).join(' · ')
  });
  appendRecord_('Registrations', reg);
  return { reg: reg, already: false };
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
    if (!selfCheckInFor_(t)) throw new Error('Check-in for this training is at the door: show your QR code to the organizers.');
    if (checkInClosed_(t.id, new Date())) throw new Error(CHECKIN_CLOSED);
    const reg = findRegistration_(trainingId, key);
    if (!reg) return { status: 'not-found' };
    return recordCheckIn_(t, reg, key.indexOf('@') > -1 ? 'Email' : 'Code', new Date());
  });
}

/** Saves a Likert evaluation without the person's name. */
function submitEvaluation(data) {
  data = data || {};
  const trainingId = clean_(data.training_id, 60);
  const key = clean_(data.key, 120);
  const a = data.answers || {};
  if (!trainingId || !key) throw new Error('Choose the training and enter your registration code or email.');
  const ratings = {};
  evalSections_().forEach(function (sec) {
    sec.items.forEach(function (it) {
      const v = String(a[it.key] === undefined || a[it.key] === null ? '' : a[it.key]).trim();
      if (sec.na && v === 'NA') { ratings[it.key] = 'N/A'; return; }
      const n = Number(v);
      if (!v || !(n >= 1 && n <= 5 && Math.round(n) === n)) throw new Error('Please answer every statement.');
      ratings[it.key] = n;
    });
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
    const text = { will_apply: clean_(a.will_apply, 1000), comments: clean_(a.comments, 1000) };
    insertAnonymous_('Evaluations', Object.assign({
      date: today, training_id: trainingId, will_apply: text.will_apply, comments: text.comments,
      flag: evaluationFlags_(text).join(' · ')
    }, ratings));
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

  const hp = clean_(form.hp, 200);
  return withLock_(function () {
    const now = new Date();
    const rows = readTable_('Requests');
    const code = newCode_(rows.map(function (r) { return String(r.request_code); }));
    appendRecord_('Requests', Object.assign({}, f, {
      timestamp: now, request_code: code, full_name: [f.first_name, f.last_name].join(' '), status: 'New', notes: '',
      flag: requestFlags_(f, rows, now, hp).join(' · ')
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

  const hp = clean_(form.hp, 200);
  return withLock_(function () {
    const now = new Date();
    const rows = readTable_('Partnerships');
    const code = newCode_(rows.map(function (r) { return String(r.request_code); }));
    appendRecord_('Partnerships', Object.assign({}, f, {
      timestamp: now, request_code: code, full_name: [f.first_name, f.last_name].join(' '), status: 'New', notes: '',
      flag: partnershipFlags_(f, rows, now, hp).join(' · ')
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
  if (!isSteward_()) {
    ui.alert('Only the owner of this Sheet and the data stewards listed in Code.gs (dataStewards) can open the report page. You are signed in as ' +
      (Session.getActiveUser().getEmail() || 'an account the script cannot see') + '.');
    return;
  }
  const url = CONFIG.webAppUrl || ScriptApp.getService().getUrl();
  if (!url) {
    ui.alert('Deploy the web app first: Deploy › New deployment › Web app. Then try again.');
    return;
  }
  const hours = Math.max(1, Math.min(6, Number(CONFIG.reportLinkHours) || 6));
  const key = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('report:' + key, '1', hours * 3600);

  const trainingId = activeTrainingId_();
  log_({ who: menuUser_(), action: 'Made a report link (works ' + hours + ' hours)', tab: trainingId ? 'Trainings' : '', record: trainingId });
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
  const all = allTrainings_().sort(function (a, b) { return a.start < b.start ? 1 : a.start > b.start ? -1 : 0; });

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
  const evalCols = ['date'].concat(evalKeys_(), ['will_apply', 'comments']);
  const evaluations = !t ? [] : readTable_('Evaluations')
    .filter(function (r) { return String(r.training_id) === t.id; })
    .map(function (r) {
      const o = {};
      evalCols.forEach(function (k) {
        const v = r[k];
        o[k] = k === 'date' ? ymd_(v) : typeof v === 'number' ? v : v === undefined || v === null ? '' : String(v);
      });
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
    partnerships: partnerships, evaluations: evaluations,
    evaluationScale: CONFIG.evaluationScale, evaluationItems: evalSections_()
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
 * Check-in scanner, for the door. Several phones or laptops can run it at once. Each keeps
 * a queue on the device, so scans still count when the signal drops; they reach the Sheet
 * when it comes back. One row per person per day: if two devices scan the same person,
 * the Sheet keeps the earlier time.
 * =================================================================== */

// After the last day, a scanner link still works for this many days, only to send scans that waited on a phone with no signal.
const SCANNER_GRACE_DAYS = 7;
const SCANNER_GONE = 'This scanner link has expired or is not valid. In the Google Sheet, click the training\'s row ' +
  'in the Trainings tab, then choose ' + CONFIG.name + ' › Open the check-in scanner.';

/**
 * Sheet menu: SANAY › Open the check-in scanner, for the training whose row is selected in the
 * Trainings tab (or the one happening today). The link works until the training's last day.
 */
function openScanner() {
  const ui = SpreadsheetApp.getUi();   // first, so this can't run from the web page
  if (!isSteward_()) {
    ui.alert('Only the owner of this Sheet and the data stewards listed in Code.gs (dataStewards) can open the check-in scanner.');
    return;
  }
  const url = CONFIG.webAppUrl || ScriptApp.getService().getUrl();
  if (!url) {
    ui.alert('Deploy the web app first: Deploy › New deployment › Web app. Then try again.');
    return;
  }
  const today = today_();
  const all = allTrainings_();
  const picked = activeTrainingId_();
  const t = all.filter(function (x) { return x.id === picked; })[0] ||
    all.filter(function (x) { return x.start && x.start <= today && today <= x.end; })[0] ||
    all.filter(function (x) { return x.start > today; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0];
  if (!t) {
    ui.alert('Add the training to the Trainings tab first, with its dates. Then click its row and try again.');
    return;
  }
  if (!t.start) {
    ui.alert('Give ' + t.id + ' a start date in the Trainings tab first.');
    return;
  }
  if (t.end < today) {
    ui.alert(t.id + ' has ended, so it has no scanner. Click the row of a current or upcoming training and try again.');
    return;
  }
  const sc = scannerFor_(t, false);
  const link = scannerLink_(url, sc.key);
  log_({ who: menuUser_(), action: 'Opened the scanner link and PIN (Sheet menu)', tab: 'Trainings', record: t.id });
  const dates = t.start === t.end ? t.start : t.start + ' to ' + t.end;
  const button = 'display:inline-block;padding:10px 18px;border-radius:10px;background:#014421;color:#FFFFFF;font-weight:bold;text-decoration:none';
  const html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif;color:#1A1F1C">' +
    '<p style="margin:0 0 8px"><b>' + esc_(t.title) + '</b> · ' + esc_(dates) + '</p>' +
    '<p style="margin:0 0 12px">Open the scanner on the phone or laptop at the door. To add more devices, tap ' +
    '<b>Add a device</b> on the scanner and scan the QR code it shows. Open it where there is signal: after that it keeps working without one, ' +
    'and sends what it saved when the signal is back. The link works until the last training day, and for a week after only to send saved scans.</p>' +
    '<p style="margin:0 0 14px"><a id="open" href="' + esc_(link) + '" target="_blank" rel="noopener" style="' + button + '">Open the scanner</a></p>' +
    '<p style="margin:0 0 12px">Scanner PIN: <b id="pin" style="font:700 22px/1 monospace;letter-spacing:0.14em">' + sc.pin + '</b><br>' +
    '<span style="font-size:12px;color:#59625C">Each device asks for it once, while it has signal. Tell it to the door staff; never show it where participants can see it.</span></p>' +
    '<p style="margin:0 0 4px;font-size:12px;color:#59625C">Share the link only with the door staff: it shows the names and offices of this training\'s participants.</p>' +
    '<input id="link" readonly value="' + esc_(link) + '" style="box-sizing:border-box;width:100%;padding:6px 8px;font:12px monospace" onclick="this.select()">' +
    '<p style="margin:12px 0 0;font-size:12px;color:#59625C">Link or PIN shared with the wrong person? <a href="#" id="renew">Make a new link and PIN</a>. ' +
    'The old ones stop working, so open the new link on every device (let them send their saved scans first).</p>' +
    '<script>document.getElementById("renew").onclick = function (e) { e.preventDefault(); var a = this; a.textContent = "Making a new link…";' +
    'google.script.run.withSuccessHandler(function (n) { document.getElementById("link").value = n.link; document.getElementById("open").href = n.link; ' +
    'document.getElementById("pin").textContent = n.pin; a.textContent = "Done. Make another"; })' +
    '.withFailureHandler(function (err) { a.textContent = err.message; }).renewScanner(' + JSON.stringify(t.id).replace(/</g, '\\u003c') + '); };</script>' +
    '</div>'
  ).setWidth(500).setHeight(400);
  ui.showModalDialog(html, CONFIG.name + ' check-in scanner');
}

/** From the scanner dialog: a new link and PIN for the training. The old ones stop working. */
function renewScanner(trainingId) {
  SpreadsheetApp.getUi();   // only from the Sheet, never from the web page
  if (!isSteward_()) throw new Error('Only the data stewards can make a new scanner link.');
  const t = allTrainings_().filter(function (x) { return x.id === clean_(trainingId, 60); })[0];
  if (!t) throw new Error('That training is no longer in the Trainings tab.');
  const sc = scannerFor_(t, true);
  log_({ who: menuUser_(), action: 'Made a new scanner link and PIN (the old ones stopped working)', tab: 'Trainings', record: t.id });
  return { link: scannerLink_(CONFIG.webAppUrl || ScriptApp.getService().getUrl(), sc.key), pin: sc.pin };
}

/** The scanner page asks for this when it opens: the training, everyone registered, and who is in today. */
function getScanner(req) {
  const t = scannerAccess_(req);
  const state = scannerState_(t, true);
  state.link = scannerLink_(CONFIG.webAppUrl || ScriptApp.getService().getUrl(), String(req.key).replace(/[^0-9a-f]/gi, ''));
  return state;
}

/**
 * The scanner sends what it has queued: items of { id, code, at, how }. Each id is handled once,
 * however many times a device resends it. Returns a result per item and who is in today.
 */
function scanSync(req) {
  req = req || {};
  const t = scannerAccess_(req);
  const items = (Array.isArray(req.items) ? req.items : []).slice(0, 100);
  const cache = CacheService.getScriptCache();
  const results = [];
  if (items.length) {
    withLock_(function () {
      const regs = readTable_('Registrations');
      const att = readTable_('Attendance');
      const states = {};   // whether check-in is closed, read once per day for the whole batch
      items.forEach(function (it) {
        it = it || {};
        const id = clean_(it.id, 40).replace(/[^\w-]/g, '');
        const seen = id ? cache.get('scan:' + id) : null;
        if (seen) { results.push(JSON.parse(seen)); return; }
        const res = scanOne_(t, it, regs, att, states);
        res.id = id;
        if (id) cache.put('scan:' + id, JSON.stringify(res), 21600);
        results.push(res);
      });
    });
  }
  const state = scannerState_(t, req.roster === true);
  state.results = results;
  return state;
}

/** A walk-in registered at the door (by the scanner's Walk-in form): saved and checked in at the time it was filled in. */
function scanWalkIn(req) {
  req = req || {};
  const t = scannerAccess_(req);
  const id = clean_(req.id, 40).replace(/[^\w-]/g, '');
  const cache = CacheService.getScriptCache();
  const seen = id ? cache.get('walkin:' + id) : null;
  if (seen) return JSON.parse(seen);
  const form = Object.assign({}, req.form || {}, { training_id: t.id });
  const r = readRegistration_(form);
  const when = scanTime_(req.at);
  const date = ymd_(when);
  if (date < t.start || date > t.end) throw new Error('Walk-ins can register only on the training days.');
  const out = withLock_(function () {
    const saved = saveRegistration_(t, r.f, r.gad, when, 'Walk-in');
    const ci = recordCheckIn_(t, saved.reg, 'Walk-in', when);
    return { status: 'ok', already: saved.already, code: String(saved.reg.reg_code), name: String(saved.reg.full_name), checkIn: ci };
  });
  if (id) cache.put('walkin:' + id, JSON.stringify(out), 21600);
  return out;
}

function scanOne_(t, it, regs, att, states) {
  const code = scanCode_(it.code);
  const when = scanTime_(it.at);
  const date = ymd_(when);
  if (!code) return { status: 'not-found', code: '' };
  if (date < t.start || date > t.end) return { status: 'not-a-training-day', code: code };
  const reg = regs.filter(function (r) { return String(r.reg_code).toUpperCase() === code; })[0];
  if (!reg) return { status: 'not-found', code: code };
  if (String(reg.training_id) !== t.id) {
    return { status: 'other-training', code: code, name: String(reg.full_name), training: String(reg.training_title || reg.training_id) };
  }
  return recordCheckIn_(t, reg, oneOf_(it.how, ['QR', 'Name search', 'Typed code']) || 'QR', when, att, states);
}

/** "SANAY:K7Q2M", "k7q2m" → "K7Q2M" */
function scanCode_(v) {
  return String(v || '').toUpperCase().replace(/^[A-Z]+:/, '').replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/** When a device says it scanned (its clock corrected by the page). Never in the future. */
function scanTime_(at) {
  const now = Date.now();
  const n = Number(at);
  return new Date(isFinite(n) && n > 0 && n <= now + 5 * 60 * 1000 ? Math.min(n, now) : now);
}

function scannerState_(t, withRoster) {
  const today = today_();
  const regs = readTable_('Registrations').filter(function (r) { return String(r.training_id) === t.id && String(r.reg_code).trim(); });
  const first = {};
  readTable_('Attendance').forEach(function (a) {
    if (String(a.training_id) !== t.id || ymd_(a.date) !== today || !(a.timestamp instanceof Date)) return;
    const c = String(a.reg_code);
    if (!first[c] || a.timestamp < first[c]) first[c] = a.timestamp;
  });
  const closed = checkinState_(t.id, today);
  const state = {
    training: { id: t.id, title: t.title, start: t.start, end: t.end, venue: t.venue },
    today: today, now: Date.now(), trainingDay: !!t.start && t.start <= today && today <= t.end,
    day: t.start ? dayNumber_(t.start, today) : 0, days: t.start ? dayNumber_(t.start, t.end) : 0,
    // closed from admin mode for the rest of today: the device refuses new scans at once, even offline
    checkin: closed.open ? { open: true } : { open: false, day: today, at: closed.at, time: timeOf_(new Date(closed.at)) },
    registered: regs.length,
    checkedIn: Object.keys(first).map(function (c) { return { code: c, time: timeOf_(first[c]), at: first[c].getTime() }; })
  };
  if (withRoster) {
    state.roster = regs.map(function (r) {
      return { code: String(r.reg_code).toUpperCase(), name: String(r.full_name), agency: String(r.agency || ''), walkIn: String(r.registered_as) === 'Walk-in' };
    });
  }
  return state;
}

/** The training's scanner key, kept in the script properties. A new key replaces the old one. */
function scannerFor_(t, renew) {
  const props = PropertiesService.getScriptProperties();
  const today = today_();
  const all = props.getProperties();
  Object.keys(all).forEach(function (name) {   // tidy up keys of trainings that have ended
    if (name.indexOf('scanner:') !== 0) return;
    try { if (addDays_(JSON.parse(all[name]).until, SCANNER_GRACE_DAYS) < today) props.deleteProperty(name); } catch (e) { props.deleteProperty(name); }
  });
  let s = null;
  try { s = JSON.parse(props.getProperty('scanner:' + t.id) || 'null'); } catch (e) { s = null; }
  if (!s || !s.key || !s.pin || renew) {
    s = { key: Utilities.getUuid().replace(/-/g, ''), pin: String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0') };
  }
  s.until = t.end;
  props.setProperty('scanner:' + t.id, JSON.stringify(s));
  return s;
}

/**
 * The training a scanner request is for, if its link and PIN are right. The link works until a week after
 * the training's last day (scans are still checked against the training days). Five wrong PINs lock the
 * link for 10 minutes.
 */
function scannerAccess_(req) {
  req = req || {};
  const key = String(req.key || '').replace(/[^0-9a-f]/gi, '').slice(0, 64);
  const found = key.length >= 24 ? scannerEntry_(key) : null;
  if (!found) throw new Error(SCANNER_GONE);
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pinfail:' + key) || 0);
  if (fails >= 5) throw new Error('Too many wrong PINs. Wait 10 minutes, then try again.');
  if (String(req.pin || '').replace(/\D/g, '') !== found.pin) {
    cache.put('pinfail:' + key, String(fails + 1), 600);
    throw new Error('Wrong scanner PIN. The data steward sees it in the Google Sheet, in the scanner dialog.');
  }
  return found.t;
}

function scannerEntry_(key) {
  const all = PropertiesService.getScriptProperties().getProperties();
  let id = '', pin = '';
  Object.keys(all).forEach(function (name) {
    if (name.indexOf('scanner:') !== 0) return;
    try { const s = JSON.parse(all[name]); if (s.key === key) { id = name.slice(8); pin = String(s.pin || ''); } } catch (e) { /* skip */ }
  });
  if (!id || !pin) return null;
  const t = allTrainings_().filter(function (x) { return x.id === id; })[0];
  return t && t.start && today_() <= addDays_(t.end, SCANNER_GRACE_DAYS) ? { t: t, pin: pin } : null;
}

function scannerLink_(url, key) {
  return url + (url.indexOf('?') > -1 ? '&' : '?') + 'page=scan&k=' + key;
}

/** The training_id of the selected row, when the Trainings tab is open; otherwise ''. */
function activeTrainingId_() {
  const sh = SpreadsheetApp.getActiveSheet();
  const range = sh && sh.getActiveRange();
  if (!sh || sh.getName() !== 'Trainings' || !range || range.getRow() < 2) return '';
  const c = headers_(sh).indexOf('training_id') + 1;
  return c > 0 ? String(sh.getRange(range.getRow(), c).getValue() || '').trim() : '';
}

/* ===================================================================
 * Sheet set-up
 * =================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(CONFIG.name)
    .addItem('Open the check-in scanner', 'openScanner')
    .addItem('Open the report page', 'openReport')
    .addItem('Review flagged entries', 'reviewFlags')
    .addItem('Check who can see the data', 'checkAccess')
    .addSeparator()
    .addItem('Set up or repair tabs', 'setup')
    .addToUi();
  // Tell whoever opens the Sheet how many entries look like duplicates or spam.
  try {
    const list = flagged_();
    if (list.length) SpreadsheetApp.getActiveSpreadsheet().toast(flagSummary_(list) + ' See ' + CONFIG.name + ' › Review flagged entries.', 'Entries to review', 20);
  } catch (e) { /* the menu matters more than the count */ }
}

/**
 * Sheet menu: SANAY › Check who can see the data.
 * Lists everyone with access to this Sheet, flags anyone who isn't a data steward,
 * and reminds you of the sharing settings to check.
 */
function checkAccess() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stewards = stewards_();
  const owner = ss.getOwner() ? ss.getOwner().getEmail() : '';
  const emails = function (users) { return users.map(function (u) { return u.getEmail(); }).filter(String); };
  const editors = emails(ss.getEditors()).filter(function (e) { return e !== owner; });
  const viewers = emails(ss.getViewers()).filter(function (e) { return e !== owner && editors.indexOf(e) < 0; });
  const flag = function (e) {
    return stewards.length && e !== owner && stewards.indexOf(e.toLowerCase()) < 0 ? ' <b style="color:#B3261E">· not a data steward</b>' : '';
  };
  const list = function (title, items) {
    return '<p style="margin:12px 0 4px"><b>' + title + '</b></p>' + (items.length
      ? '<ul style="margin:0;padding-left:18px">' + items.map(function (e) { return '<li>' + esc_(e) + flag(e) + '</li>'; }).join('') + '</ul>'
      : '<p style="margin:0;color:#59625C">No one</p>');
  };
  const html = '<div style="font:14px/1.5 Arial,sans-serif;color:#1A1F1C">' +
    '<p style="margin:0">Participants never see this Sheet. The web app writes to it as the account that deployed it. Only the people below can open the Sheet, and editors can also change this script, so make only data stewards editors.</p>' +
    list('Owner', owner ? [owner] : []) + list('Editors', editors) + list('Viewers and commenters', viewers) +
    '<p style="margin:14px 0 4px"><b>Also check, in Share:</b></p><ol style="margin:0;padding-left:18px">' +
    '<li>General access is <b>Restricted</b>, not "Anyone with the link".</li>' +
    '<li>In the gear: untick <b>Editors can change permissions and share</b>.</li>' +
    '<li>In the gear: untick <b>Viewers and commenters can see the option to download, print, and copy</b>.</li></ol>' +
    (stewards.length ? '' : '<p style="margin:12px 0 0;color:#8A5300">Tip: list your data stewards in Code.gs (dataStewards) so only they can open the report page and edit the data tabs.</p>') +
    '</div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(480).setHeight(460), 'Who can see the data');
}

/** Creates the tabs and headers. Safe to run again: it never deletes data. */
function setup() {
  if (!isSteward_()) throw new Error('Only the owner of this Sheet or a data steward (dataStewards in Code.gs) can run setup.');
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

  // Flag columns: a note on the header, and an amber highlight on flagged rows
  FLAG_TABS.forEach(function (name) {
    const sh = ss.getSheetByName(name);
    sh.getRange(1, headers_(sh).indexOf('flag') + 1).setNote(FLAG_NOTE);
    flagRule_(sh);
  });

  // Changelog: a note on the header and the time with seconds
  const log = ss.getSheetByName('Changelog');
  log.getRange(1, 1).setNote(CHANGELOG_NOTE);
  log.getRange(2, 1, 999, 1).setNumberFormat('yyyy-mm-dd h:mm:ss am/pm');

  // Data tabs and the Changelog: only the owner and the data stewards can edit them (the web app writes as the owner).
  const me = Session.getEffectiveUser();
  DATA_TABS.concat(['Changelog']).forEach(function (name) {
    const sh = ss.getSheetByName(name);
    const p = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0] || sh.protect();
    p.setDescription(CONFIG.name + (name === 'Changelog' ? ' changelog' : ' data') + ': only the owner and the data stewards can edit this tab');
    p.addEditor(me);
    const keep = stewards_().concat([String(me.getEmail()).toLowerCase()]);
    p.removeEditors(p.getEditors().filter(function (u) { return keep.indexOf(String(u.getEmail()).toLowerCase()) < 0; }));
    stewards_().forEach(function (e) { try { p.addEditor(e); } catch (err) { /* not a Google account yet */ } });
    if (p.canDomainEdit()) p.setDomainEdit(false);
  });

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  const logOn = changelogTriggers_(ss);
  log_({ who: menuUser_(), action: 'Ran Set up or repair tabs' });
  try {
    ss.toast('The ' + CONFIG.name + ' tabs are ready.' + (logOn ? '' : ' To record edits in the Changelog tab, the owner of this Sheet runs Set up or repair tabs once.'), CONFIG.name, 8);
  } catch (e) { /* toast only works with the Sheet open */ }
}

/* ===================================================================
 * Duplicates and spam: flags for the data stewards
 * =================================================================== */

/** Why a new registration looks like a duplicate or spam: short reasons, [] when it looks fine. */
function registrationFlags_(f, regs, t, now, hp) {
  const why = textFlags_([f.first_name, f.last_name], [f.position, f.agency], f.email, hp);
  const name = normName_(f.first_name + ' ' + f.last_name);
  const same = regs.filter(function (r) {
    return String(r.training_id) === t.id && String(r.email).toLowerCase() !== f.email &&
      normName_(r.first_name + ' ' + r.last_name) === name;
  })[0];
  if (same) why.push('Possible duplicate of row ' + same.__row + ' (same name, another email)');
  return why.concat(burst_('Registrations', regs.filter(function (r) { return String(r.training_id) === t.id; }), now));
}

function requestFlags_(f, rows, now, hp) {
  const why = textFlags_([f.first_name, f.last_name], [f.position, f.agency], f.email, hp);
  if (linkCount_([f.need, f.other_topics, f.participant_types, f.location].join(' ')) >= 2) why.push('Several links in the text');
  const prev = recentSame_(rows, now, function (r) { return String(r.email).toLowerCase() === f.email; });
  if (prev) why.push('Possible duplicate of row ' + prev.__row + ' (same email, ' + ago_(prev.timestamp, now) + ')');
  return why.concat(burst_('Requests', rows, now));
}

function partnershipFlags_(f, rows, now, hp) {
  const why = textFlags_([f.first_name, f.last_name], [f.position, f.organization], f.email, hp);
  if (linkCount_([f.proposal, f.other_partnership, f.other_topics].join(' ')) >= 2) why.push('Several links in the text');
  const org = normName_(f.organization);
  const prev = recentSame_(rows, now, function (r) {
    return String(r.email).toLowerCase() === f.email || (!!org && normName_(r.organization) === org);
  });
  if (prev) why.push('Possible duplicate of row ' + prev.__row + ' (same ' +
    (String(prev.email).toLowerCase() === f.email ? 'email' : 'organization') + ', ' + ago_(prev.timestamp, now) + ')');
  return why.concat(burst_('Partnerships', rows, now));
}

/** Evaluations have no names: only links or test text in the written answers. */
function evaluationFlags_(text) {
  const parts = [text.will_apply, text.comments];
  const why = [];
  if (parts.some(function (v) { return LINK_RE.test(String(v || '')); })) why.push('A link in the comments');
  if (parts.some(junkText_)) why.push('Looks like a test or junk entry');
  return why;
}

/** Checks shared by the forms with a name: the hidden field, test or junk text, numbers in a name,
 *  a link where a name or office goes, and throwaway email addresses. */
function textFlags_(names, fields, email, hp) {
  const why = [];
  if (hp) why.push('Possible bot: the hidden field was filled in');
  const junk = names.filter(junkName_).concat(fields.filter(junkText_))[0];
  if (junk) why.push('Looks like a test or junk entry ("' + String(junk).slice(0, 30) + '")');
  if (names.some(function (v) { return /\d/.test(String(v || '')); })) why.push('A name has numbers in it');
  if (names.concat(fields).some(function (v) { return LINK_RE.test(String(v || '')); })) why.push('A link in a name or office field');
  const domain = String(email || '').split('@')[1] || '';
  if (THROWAWAY_DOMAINS.some(function (d) { return domain === d || domain.slice(-d.length - 1) === '.' + d; })) why.push('Throwaway email address');
  return why;
}

function junkText_(v) {
  const s = String(v || '').trim();
  return !!s && (JUNK_RE.test(s) || KEYMASH_RE.test(s));
}

/** Names also count as junk with a letter repeated four times ("aaaa") or no letters at all ("..."). */
function junkName_(v) {
  const s = String(v || '').trim();
  return !!s && (junkText_(s) || /(.)\1{3}/i.test(s) || !/\p{L}/u.test(s));
}

function linkCount_(s) {
  return (String(s || '').match(new RegExp(LINK_RE.source, 'gi')) || []).length;
}

/** "Juan M. Dela Cruz" and "juan dela  cruz" compare equal: lowercase, no accents, letters and digits only. */
function normName_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The latest row in the last 30 days that matches. */
function recentSame_(rows, now, match) {
  return rows.filter(function (r) {
    return r.timestamp instanceof Date && now - r.timestamp >= 0 && now - r.timestamp <= 30 * 864e5 && match(r);
  }).sort(function (a, b) { return b.timestamp - a.timestamp; })[0] || null;
}

/** A flag when this entry is one of many in a few minutes (BURSTS). */
function burst_(tab, rows, now) {
  const limit = BURSTS[tab], ms = limit[1] * 60000;
  const n = rows.filter(function (r) { return r.timestamp instanceof Date && now - r.timestamp >= 0 && now - r.timestamp <= ms; }).length + 1;
  return n >= limit[0] ? ['Many ' + limit[2] + ' at once (' + n + ' in ' + limit[1] + ' minutes)'] : [];
}

function ago_(ts, now) {
  const days = Math.floor((now - ts) / 864e5);
  return days < 1 ? 'sent earlier today' : days === 1 ? 'sent 1 day earlier' : 'sent ' + days + ' days earlier';
}

/** A row's flag with one more reason. A reason starting with `replace` is swapped for the new one, and an OK is dropped. */
function addFlag_(old, reason, replace) {
  const keep = String(old || '').split(' · ').map(function (x) { return x.trim(); }).filter(function (x) {
    return x && x.toUpperCase() !== 'OK' && !(replace && x.indexOf(replace) === 0);
  });
  return keep.concat([reason]).join(' · ');
}

function setFlag_(tab, row, text) {
  const sh = sheet_(tab);
  flagHeader_(sh);
  setValue_(tab, row, 'flag', text);
  flagRule_(sh);
}

/** Adds the "flag" column to a tab that doesn't have it yet (before Set up or repair tabs has run). */
function flagHeader_(sh) {
  const head = headers_(sh);
  if (head.indexOf('flag') > -1) return;
  sh.getRange(1, head.length + 1).setValue('flag').setFontWeight('bold').setBackground('#E3EFE7').setNote(FLAG_NOTE);
}

/** The amber highlight on flagged rows, rebuilt so it also covers rows added since. */
function flagRule_(sh) {
  const c = headers_(sh).indexOf('flag') + 1;
  if (c < 1) return;
  const col = columnLetter_(c);
  const rules = sh.getConditionalFormatRules().filter(function (rule) {
    const b = rule.getBooleanCondition();
    return !(b && b.getCriteriaType() === SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA &&
      /^=AND\(\$[A-Z]+2<>"",UPPER\(TRIM\(\$[A-Z]+2\)\)<>"OK"\)$/.test(String(b.getCriteriaValues()[0])));
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($' + col + '2<>"",UPPER(TRIM($' + col + '2))<>"OK")')
    .setBackground('#FCE8B2')
    .setRanges([sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), sh.getMaxColumns())])
    .build());
  sh.setConditionalFormatRules(rules);
}

/** Every flagged entry that nobody has marked OK yet: [{ tab, row, who, flag }]. */
function flagged_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = [];
  FLAG_TABS.forEach(function (tab) {
    const sh = ss.getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2 || headers_(sh).indexOf('flag') < 0) return;
    readTable_(tab).forEach(function (r) {
      const flag = String(r.flag || '').trim();
      if (!flag || flag.toUpperCase() === 'OK') return;
      const who = tab === 'Registrations' ? [r.full_name, r.training_id]
        : tab === 'Evaluations' ? ['Evaluation (no name)', r.training_id]
        : tab === 'Requests' ? [r.full_name, r.agency]
        : [r.organization, r.full_name];
      out.push({ tab: tab, row: r.__row, who: who.map(String).filter(String).join(' · '), flag: flag });
    });
  });
  return out;
}

/** "3 entries look like duplicates or spam (2 in Registrations, 1 in Requests)." */
function flagSummary_(list) {
  const counts = {};
  list.forEach(function (f) { counts[f.tab] = (counts[f.tab] || 0) + 1; });
  return (list.length === 1 ? '1 entry looks like a duplicate or spam' : list.length + ' entries look like duplicates or spam') +
    ' (' + FLAG_TABS.filter(function (t) { return counts[t]; }).map(function (t) { return counts[t] + ' in ' + t; }).join(', ') + ').';
}

/**
 * Sheet menu: SANAY › Review flagged entries.
 * Lists the flagged entries; Show jumps to the row. Nothing is deleted here.
 */
function reviewFlags() {
  const ui = SpreadsheetApp.getUi();
  if (!isSteward_()) throw new Error('Only the owner of this Sheet or a data steward (dataStewards in Code.gs) can review flagged entries.');
  const list = flagged_();
  const shown = list.slice(0, 200);
  const rows = shown.map(function (f, i) {
    return '<tr><td>' + esc_(f.tab) + '<br><span class="m">row ' + f.row + '</span></td><td>' + esc_(f.who) + '</td><td>' + esc_(f.flag) + '</td>' +
      '<td><button type="button" data-i="' + i + '">Show</button></td></tr>';
  }).join('');
  const html = '<div style="font:14px/1.45 Arial,sans-serif;color:#1A1F1C">' +
    '<style>table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #DDE3DE;padding:7px 6px;vertical-align:top;text-align:left}' +
    'th{font-size:12px;color:#59625C;border-top:0}.m{color:#59625C;font-size:12px}button{font:inherit;padding:4px 10px;cursor:pointer}</style>' +
    '<p style="margin:0 0 10px">' + (list.length
      ? esc_(flagSummary_(list)) + ' They are saved like any other entry and highlighted in amber. Check each one: delete it if it is junk, or type <b>OK</b> in its flag column once it is fine.'
      : 'Nothing to review. When a new entry looks like a duplicate or spam, it is flagged and listed here.') + '</p>' +
    (list.length ? '<table><tr><th>Tab</th><th>Entry</th><th>Why</th><th></th></tr>' + rows + '</table>' : '') +
    (list.length > shown.length ? '<p class="m">Showing the first 200.</p>' : '') +
    '<p id="msg" style="color:#B3261E" aria-live="polite"></p></div>' +
    '<script>var L=' + JSON.stringify(shown.map(function (f) { return { tab: f.tab, row: f.row }; })).replace(/</g, '\\u003c') + ';' +
    'document.addEventListener("click",function(e){var b=e.target.closest("button[data-i]");if(!b)return;var f=L[+b.getAttribute("data-i")];' +
    'b.disabled=true;b.textContent="Opening…";google.script.run.withSuccessHandler(function(){google.script.host.close();})' +
    '.withFailureHandler(function(err){b.disabled=false;b.textContent="Show";document.getElementById("msg").textContent=err.message;}).showFlagged(f.tab,f.row);});</script>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(680).setHeight(520), 'Entries to review');
}

/** From the review dialog: opens the tab and selects the flagged row. */
function showFlagged(tab, row) {
  SpreadsheetApp.getUi();   // only from the Sheet's own dialog, never from the web app
  if (!isSteward_()) throw new Error('Only the owner of this Sheet or a data steward can review flagged entries.');
  const n = Number(row);
  if (FLAG_TABS.indexOf(String(tab)) < 0 || !(n >= 2 && Math.round(n) === n)) throw new Error('That entry is not in a ' + CONFIG.name + ' tab.');
  const sh = sheet_(String(tab));
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sh);
  sh.setActiveRange(sh.getRange(n, 1, 1, Math.max(sh.getLastColumn(), 1)));
}

/* ===================================================================
 * Admin mode, on the web app: the owner and the data stewards sign in with their email and a code
 * sent to it, then run check-in from a phone without opening the Sheet. Everything goes to the Changelog.
 * =================================================================== */

/**
 * Signing in, step 1: emails a 6-digit code if the email may use admin mode. The answer is the same
 * for any email, so the page never tells who the admins are.
 */
function adminSendCode(req) {
  req = req || {};
  const email = clean_(req.email, 120).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email, like name@example.com.');
  const cache = CacheService.getScriptCache();
  const h = hash_(email);
  adminLocked_(cache, h);
  const sent = Number(cache.get('adminsent:' + h) || 0), all = Number(cache.get('adminsent:all') || 0);
  if (sent >= 3) throw new Error('A code was already sent 3 times. Use the latest email, or wait 15 minutes and ask again.');
  if (all >= 30) throw new Error('Too many sign-in codes were asked for. Try again in an hour.');
  cache.put('adminsent:' + h, String(sent + 1), 900);
  cache.put('adminsent:all', String(all + 1), 3600);
  if (admins_().indexOf(email) > -1) {
    const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0');
    cache.put('admincode:' + h, JSON.stringify({ c: hash_(email + ':' + code), n: 0, x: Date.now() + ADMIN_CODE_MINUTES * 60000 }), ADMIN_CODE_MINUTES * 60);
    MailApp.sendEmail({
      to: email,
      name: CONFIG.name,
      subject: CONFIG.name + ' admin sign-in code',
      body: 'Your ' + CONFIG.name + ' admin code is ' + code + '.\n\nType it on the ' + CONFIG.name + ' sign-in screen within ' +
        ADMIN_CODE_MINUTES + ' minutes.\n\nIf you did not ask for it, ignore this email: nobody can sign in without the code.',
      htmlBody: '<div style="font:15px/1.5 Arial,sans-serif;color:#1A1F1C"><p>Your ' + esc_(CONFIG.name) + ' admin code is</p>' +
        '<p style="margin:6px 0 14px;font:700 30px/1.2 monospace;letter-spacing:0.18em">' + code + '</p>' +
        '<p>Type it on the ' + esc_(CONFIG.name) + ' sign-in screen within ' + ADMIN_CODE_MINUTES + ' minutes.</p>' +
        '<p style="color:#59625C">If you did not ask for it, ignore this email: nobody can sign in without the code.</p></div>'
    });
  }
  return { email: email, minutes: ADMIN_CODE_MINUTES };
}

/** Signing in, step 2: the code from the email. Returns a key for this device, good for ADMIN_SESSION_HOURS. */
function adminSignIn(req) {
  req = req || {};
  const email = clean_(req.email, 120).toLowerCase();
  const code = String(req.code || '').replace(/\D/g, '');
  if (!EMAIL_RE.test(email) || code.length !== 6) throw new Error('Enter the 6-digit code from the email.');
  const cache = CacheService.getScriptCache();
  const h = hash_(email);
  adminLocked_(cache, h);
  let saved = null;
  try { saved = JSON.parse(cache.get('admincode:' + h) || 'null'); } catch (e) { saved = null; }
  const left = saved ? Math.floor((Number(saved.x) - Date.now()) / 1000) : 0;
  if (!saved || left < 1) throw new Error('That code has expired. Ask for a new one.');
  if (saved.c !== hash_(email + ':' + code)) {
    // Five wrong tries end a code and lock sign-in for 10 minutes; ten wrong tries within 6 hours, over any
    // number of codes, lock it for 6 hours. So guessing a code is hopeless, and every try emails the owner of the address.
    saved.n = (Number(saved.n) || 0) + 1;
    const fails = Number(cache.get('adminfail:' + h) || 0) + 1;
    cache.put('adminfail:' + h, String(fails), 21600);
    if (fails >= 10 || saved.n >= 5) {
      const long = fails >= 10;
      cache.remove('admincode:' + h);
      cache.put('adminlock:' + h, long ? 'long' : 'short', long ? 21600 : 600);
      log_({ who: email, action: long ? 'Admin sign-in locked for 6 hours after 10 wrong codes' : 'Admin sign-in locked for 10 minutes after 5 wrong codes' });
      throw new Error(long ? ADMIN_LOCKED_LONG : ADMIN_LOCKED);
    }
    cache.put('admincode:' + h, JSON.stringify(saved), left);
    throw new Error('That code is not right. Check the latest email from ' + CONFIG.name + ' and try again.');
  }
  cache.remove('admincode:' + h);
  cache.remove('adminfail:' + h);
  if (admins_().indexOf(email) < 0) throw new Error(ADMIN_SIGNED_OUT);   // removed from the list meanwhile
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const until = Date.now() + ADMIN_SESSION_HOURS * 3600000;
  const props = PropertiesService.getScriptProperties();
  tidyAdminProps_(props);
  props.setProperty('admin:' + hash_(token), JSON.stringify({ e: email, x: until }));   // only a hash of the key is kept
  log_({ who: email, action: 'Signed in to admin mode' });
  return { token: token, email: email, until: until };
}

/** Ends this device's admin session (also before it becomes a check-in station). */
function adminSignOut(req) {
  let email = '';
  try { email = adminAccess_(req); } catch (e) { return { ok: true }; }
  PropertiesService.getScriptProperties().deleteProperty('admin:' + hash_(adminToken_(req)));
  log_({ who: email, action: 'Signed out of admin mode' + (req.station === true ? ' to make the device a check-in station' : '') });
  return { ok: true };
}

/** What admin mode opens with: the trainings (today's, then upcoming, then past) and one of them in detail. */
function adminHome(req) {
  req = req || {};
  const email = adminAccess_(req);
  const today = today_();
  const when = function (t) { return t.start <= today && today <= t.end ? 0 : t.start > today ? 1 : 2; };
  const all = allTrainings_().filter(function (t) { return t.start; }).sort(function (a, b) {
    const wa = when(a), wb = when(b);
    if (wa !== wb) return wa - wb;
    if (wa === 2) return a.end < b.end ? 1 : a.end > b.end ? -1 : 0;   // past ones: the latest first
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  }).slice(0, 60);
  const pick = clean_(req.training_id, 60);
  const t = all.filter(function (x) { return x.id === pick; })[0] || all[0];
  return {
    email: email, today: today,
    trainings: all.map(function (x) { return { id: x.id, title: x.title, start: x.start, end: x.end, mode: x.mode, when: ['now', 'next', 'past'][when(x)] }; }),
    detail: t ? adminDetail_(t, isoDate_(req.date), today) : null
  };
}

/** One training in admin mode, for one of its days (today, or the last one so far). */
function adminTraining(req) {
  req = req || {};
  adminAccess_(req);
  return adminDetail_(trainingOrThrow_(req.training_id), isoDate_(req.date), today_());
}

/** Closes check-in for the rest of today, or opens it again. Tomorrow it opens by itself. */
function adminSetCheckIn(req) {
  req = req || {};
  const email = adminAccess_(req);
  const today = today_();
  const t = trainingOrThrow_(req.training_id);
  if (!(t.start && t.start <= today && today <= t.end)) throw new Error('Check-in can be closed or reopened only on a training day.');
  const props = PropertiesService.getScriptProperties();
  const was = checkinState_(t.id, today), now = new Date();
  if (req.open === true && !was.open) {
    props.deleteProperty('checkin:' + t.id);
    log_({ who: email, action: 'Reopened check-in', tab: 'Trainings', record: t.id, new_value: 'Open again from ' + timeOf_(now) });
  } else if (req.open === false && was.open) {
    tidyAdminProps_(props);
    props.setProperty('checkin:' + t.id, JSON.stringify({ day: today, at: now.getTime(), by: email }));
    log_({ who: email, action: 'Closed check-in for the rest of today', tab: 'Trainings', record: t.id, new_value: 'Closed from ' + timeOf_(now) });
  }
  return adminDetail_(t, isoDate_(req.date), today);
}

/** Checks someone in by hand, today. Works after check-in was closed too: an admin decides. */
function adminCheckIn(req) {
  req = req || {};
  const email = adminAccess_(req);
  const code = scanCode_(req.code);
  const t = trainingOrThrow_(req.training_id);
  const today = today_();
  if (!(t.start && t.start <= today && today <= t.end)) throw new Error('People can be checked in only on the training days.');
  const result = withLock_(function () {
    const reg = readTable_('Registrations').filter(function (r) {
      return String(r.training_id) === t.id && String(r.reg_code).toUpperCase() === code;
    })[0];
    if (!code || !reg) throw new Error('No one with that code is registered for this training.');
    const closed = !checkinState_(t.id, today).open;
    const r = recordCheckIn_(t, reg, 'Admin', new Date());
    if (r.status === 'ok') {
      log_({ who: email, action: 'Checked someone in by hand' + (closed ? ' after check-in closed' : ''), tab: 'Attendance', record: code, new_value: r.name + ' · ' + r.time });
    }
    return r;
  });
  const detail = adminDetail_(t, today, today);
  detail.result = result;
  return detail;
}

/** Removes a check-in made by mistake, today or on an earlier training day. The Changelog keeps what it was. */
function adminUndoCheckIn(req) {
  req = req || {};
  const email = adminAccess_(req);
  const code = scanCode_(req.code);
  const date = isoDate_(req.date);
  const today = today_();
  const t = trainingOrThrow_(req.training_id);
  if (!code || !date || !t.start || date < t.start || date > t.end || date > today) throw new Error('Choose a training day up to today.');
  const removed = withLock_(function () {
    const rows = readTable_('Attendance').filter(function (a) {
      return String(a.training_id) === t.id && String(a.reg_code).toUpperCase() === code && ymd_(a.date) === date;
    });
    const sh = sheet_('Attendance');
    rows.slice().sort(function (a, b) { return b.__row - a.__row; }).forEach(function (a) { sh.deleteRow(a.__row); });
    rows.forEach(function (a) {
      log_({ who: email, action: 'Undid a check-in', tab: 'Attendance', row: a.__row, record: code,
        old_value: [String(a.full_name || ''), date, timeOf_(a.timestamp), String(a.method || '')].filter(String).join(' · ') });
    });
    return rows.length;
  });
  if (!removed) throw new Error('That person is not checked in on that day.');
  return adminDetail_(t, date, today);
}

/** The scanner's link and PIN, to open the scanner on this device or to add another one. */
function adminScanner(req) {
  req = req || {};
  const email = adminAccess_(req);
  const t = trainingOrThrow_(req.training_id);
  if (!t.start) throw new Error('Give this training a start date in the Trainings tab first.');
  if (t.end < today_()) throw new Error('This training has ended, so it has no scanner.');
  const url = CONFIG.webAppUrl || ScriptApp.getService().getUrl();
  const sc = scannerFor_(t, req.renew === true);
  log_({ who: email, action: req.renew === true ? 'Made a new scanner link and PIN (the old ones stopped working)' : 'Opened the scanner link and PIN (admin mode)',
    tab: 'Trainings', record: t.id });
  return { key: sc.key, pin: sc.pin, link: scannerLink_(url, sc.key) };
}

function adminDetail_(t, date, today) {
  const days = [];
  for (let d = t.start; d && d <= t.end && days.length < 31; d = addDays_(d, 1)) days.push(d);
  const sofar = days.filter(function (d) { return d <= today; });
  const day = sofar.indexOf(date) > -1 ? date : sofar.length ? sofar[sofar.length - 1] : '';
  const regs = readTable_('Registrations').filter(function (r) { return String(r.training_id) === t.id && String(r.reg_code).trim(); });
  const first = {}, perDay = {};
  readTable_('Attendance').forEach(function (a) {
    if (String(a.training_id) !== t.id || !(a.timestamp instanceof Date)) return;
    const d = ymd_(a.date), c = String(a.reg_code).toUpperCase();
    (perDay[d] = perDay[d] || {})[c] = true;
    if (d === day && (!first[c] || a.timestamp < first[c].at)) first[c] = { at: a.timestamp, method: String(a.method || '') };
  });
  const st = checkinState_(t.id, today);
  return {
    training: { id: t.id, title: t.title, start: t.start, end: t.end, venue: t.venue, mode: t.mode },
    today: today, day: day, trainingDay: !!t.start && t.start <= today && today <= t.end,
    days: days.map(function (d) { return { date: d, n: perDay[d] ? Object.keys(perDay[d]).length : 0 }; }),
    checkin: st.open ? { open: true } : { open: false, time: timeOf_(new Date(st.at)), by: st.by },
    people: regs.map(function (r) {
      const f = String(r.flag || '').trim();
      return { code: String(r.reg_code).toUpperCase(), name: String(r.full_name), agency: String(r.agency || ''),
        walkIn: String(r.registered_as) === 'Walk-in', flagged: !!f && f.toUpperCase() !== 'OK' };
    }),
    checkedIn: Object.keys(first).map(function (c) { return { code: c, time: timeOf_(first[c].at), method: first[c].method }; })
  };
}

/** Whether check-in was closed in admin mode for a day: { open, at, by }. It opens again by itself the next day. */
function checkinState_(id, day) {
  let s = null;
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty('checkin:' + id) || 'null'); } catch (e) { s = null; }
  return s && s.day === day ? { open: false, at: Number(s.at) || 0, by: String(s.by || '') } : { open: true, at: 0, by: '' };
}

/** True when check-in was closed before this moment of that day. states: what was read already, by training and day. */
function checkInClosed_(id, when, states) {
  const k = id + '|' + ymd_(when);
  const st = (states && states[k]) || checkinState_(id, ymd_(when));
  if (states) states[k] = st;
  return !st.open && when.getTime() >= st.at;
}

/** The email of the admin a request comes from. Throws when the session has ended or the person is no longer an admin. */
function adminAccess_(req) {
  const token = adminToken_(req);
  if (token.length !== 64) throw new Error(ADMIN_SIGNED_OUT);
  const props = PropertiesService.getScriptProperties();
  const name = 'admin:' + hash_(token);
  let s = null;
  try { s = JSON.parse(props.getProperty(name) || 'null'); } catch (e) { s = null; }
  if (!s || !(Number(s.x) > Date.now()) || admins_().indexOf(String(s.e)) < 0) {
    if (s) props.deleteProperty(name);
    throw new Error(ADMIN_SIGNED_OUT);
  }
  return String(s.e);
}

/** Throws while sign-in is locked for this email (by its hash) after wrong codes. */
function adminLocked_(cache, h) {
  const lock = cache.get('adminlock:' + h);
  if (lock) throw new Error(lock === 'long' ? ADMIN_LOCKED_LONG : ADMIN_LOCKED);
}

function adminToken_(req) {
  return String((req && req.token) || '').replace(/[^0-9a-f]/gi, '').slice(0, 64).toLowerCase();
}

/** Drops admin sessions that have ended and check-in closings of earlier days. */
function tidyAdminProps_(props) {
  const all = props.getProperties(), now = Date.now(), today = today_();
  Object.keys(all).forEach(function (k) {
    const admin = k.indexOf('admin:') === 0;
    if (!admin && k.indexOf('checkin:') !== 0) return;
    try {
      const v = JSON.parse(all[k]);
      if (admin ? !(Number(v.x) > now) : !(v.day >= today)) props.deleteProperty(k);
    } catch (e) { props.deleteProperty(k); }
  });
}

/** Who may use admin mode: the data stewards, the Sheet's owner and the account that deployed the web app. */
function admins_() {
  const list = stewards_().slice();
  [ownerEmail_(), deployerEmail_()].forEach(function (e) { if (e && list.indexOf(e) < 0) list.push(e); });
  return list;
}

/** In the web app, the account that deployed it (the app runs as that account); in the Sheet, the person using it. */
function deployerEmail_() {
  try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

function trainingOrThrow_(id) {
  const t = allTrainings_().filter(function (x) { return x.id === clean_(id, 60); })[0];
  if (!t) throw new Error('That training is no longer in the Trainings tab.');
  return t;
}

/** SHA-256 of a text, as hex. */
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

/* ===================================================================
 * Changelog: a tab where SANAY writes who changed what. Edits in the Sheet come from two triggers
 * that setup installs; admin mode and the Sheet menu write their own lines. Evaluations are never
 * tied to a person here.
 * =================================================================== */

/** Adds a line to the Changelog tab. A problem here never stops the work it records. */
function log_(entry) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('Changelog');
    if (!sh) {   // a Sheet set up before this version: the tab appears with the first line
      sh = ss.insertSheet('Changelog');
      sh.getRange(1, 1, 1, TABS.Changelog.length).setValues([TABS.Changelog]);
      sh.setFrozenRows(1);
    }
    const rec = Object.assign({ timestamp: new Date() }, entry);
    sh.appendRow(headers_(sh).map(function (h) { return toCell_(rec[h]); }));
  } catch (e) { /* the log never blocks a check-in or an edit */ }
}

/**
 * Installed by setup, so it runs as the owner. Writes each edit made by hand in a SANAY tab to the
 * Changelog, with the old and the new value. SANAY's own writes are not edits, so they don't come here.
 * Google gives the editor's email only for accounts in the owner's organization (UP accounts).
 */
function logSheetEdit(e) {
  if (!e || !e.range || typeof e.range.getSheet !== 'function') return;   // a real edit only, never a call from the web page
  const r = e.range, sh = r.getSheet(), tab = sh.getName();
  if (!RECORD_KEYS[tab]) return;   // the six SANAY tabs; not the Changelog itself, nor tabs of your own
  const head = headers_(sh), row = r.getRow(), rows = r.getNumRows(), cols = r.getNumColumns();
  const rec = { who: editorOf_(e), tab: tab, row: rows > 1 ? row + '–' + (row + rows - 1) : row };
  if (rows === 1 && cols === 1) {
    rec.action = row === 1 ? 'Renamed a column' : 'Edited a cell';
    rec.column = head[r.getColumn() - 1] || columnLetter_(r.getColumn());
    rec.record = row > 1 ? recordOf_(sh, tab, head, row) : '';
    rec.old_value = e.oldValue === undefined || e.oldValue === null ? '' : e.oldValue;
    rec.new_value = r.getValue();
  } else {
    rec.action = 'Changed ' + rows * cols + ' cells at once (pasted, filled or cleared)';
    rec.column = columnLetter_(r.getColumn()) + row + ':' + columnLetter_(r.getColumn() + cols - 1) + (row + rows - 1);
    rec.record = rows === 1 && row > 1 ? recordOf_(sh, tab, head, row) : '';
  }
  log_(rec);
}

/** Installed by setup: deleted rows, columns and tabs. Google doesn't say which rows, so the line says where. */
function logSheetChange(e) {
  if (!e || !e.source || typeof e.source.getActiveSheet !== 'function') return;
  const what = { REMOVE_ROW: 'Deleted rows', REMOVE_COLUMN: 'Deleted columns', REMOVE_GRID: 'Deleted a tab' }[e.changeType];
  if (!what) return;
  let tab = '';
  if (e.changeType !== 'REMOVE_GRID') { try { tab = e.source.getActiveSheet().getName(); } catch (err) { tab = ''; } }
  if (tab && !RECORD_KEYS[tab] && tab !== 'Changelog') return;   // a tab of your own
  log_({ who: editorOf_(e), action: what, tab: tab,
    new_value: 'Google does not say which ' + (e.changeType === 'REMOVE_GRID' ? 'tab' : 'ones') + '. File › Version history shows them.' });
}

/**
 * Turns on logSheetEdit and logSheetChange. They run as one account, the owner's (in a shared drive, whoever
 * turns them on first), so each edit is logged once. Returns whether the edit log is on.
 */
function changelogTriggers_(ss) {
  const props = PropertiesService.getScriptProperties();
  const me = deployerEmail_(), owner = ownerEmail_(), by = props.getProperty('changelog:by') || '';
  if (owner ? me !== owner : (by && by !== me)) return !!by;
  const mine = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (mine.indexOf('logSheetEdit') < 0) ScriptApp.newTrigger('logSheetEdit').forSpreadsheet(ss).onEdit().create();
  if (mine.indexOf('logSheetChange') < 0) ScriptApp.newTrigger('logSheetChange').forSpreadsheet(ss).onChange().create();
  props.setProperty('changelog:by', me);
  return true;
}

function editorOf_(e) {
  try {
    const m = e.user && typeof e.user.getEmail === 'function' ? e.user.getEmail() : '';
    if (m) return String(m).toLowerCase();
  } catch (err) { /* not shared */ }
  return 'A Sheet editor (Google did not share the email)';
}

/** The person using a Sheet menu item, for the Changelog. */
function menuUser_() {
  try {
    const m = Session.getActiveUser().getEmail();
    if (m) return String(m).toLowerCase();
  } catch (err) { /* not shared */ }
  return 'A Sheet editor (Google did not share the email)';
}

/** The code or training id of an edited row, so a line in the Changelog says whose row it was. */
function recordOf_(sh, tab, head, row) {
  const c = head.indexOf(RECORD_KEYS[tab]) + 1;
  return c > 0 ? String(sh.getRange(row, c).getValue() || '') : '';
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

/**
 * Checks a registration in at a given time (the caller holds the lock). One row per person per day:
 * if there is one already, it keeps the earlier of the two times. att: the Attendance rows, if already read.
 * After check-in was closed for the day in admin mode, nobody new is checked in (status 'closed'), except
 * by an admin (method 'Admin'). A scan made before the closing time and sent later still counts.
 */
function recordCheckIn_(t, reg, method, when, att, states) {
  att = att || readTable_('Attendance');
  const code = String(reg.reg_code);
  const date = ymd_(when);
  const out = { name: String(reg.full_name), code: code, day: dayNumber_(t.start, date), days: dayNumber_(t.start, t.end) };
  const prev = att.filter(function (a) {
    return String(a.training_id) === t.id && String(a.reg_code) === code && ymd_(a.date) === date;
  })[0];
  if (prev) {
    if (prev.timestamp instanceof Date && when < prev.timestamp && prev.__row) {   // an earlier scan arriving late
      setValue_('Attendance', prev.__row, 'timestamp', when);
      prev.timestamp = when;
    }
    return Object.assign(out, { status: 'already', time: timeOf_(prev.timestamp) });
  }
  if (method !== 'Admin' && checkInClosed_(t.id, when, states)) return Object.assign(out, { status: 'closed' });
  const rec = {
    timestamp: when, date: date, training_id: t.id, reg_code: code, full_name: out.name,
    sex: reg.sex, agency: reg.agency, method: method
  };
  appendRecord_('Attendance', rec);
  rec.__row = sheet_('Attendance').getLastRow();
  att.push(rec);
  return Object.assign(out, { status: 'ok', time: timeOf_(when) });
}

/** Every training in the Trainings tab with an id, listed or not. */
function allTrainings_() {
  return readTable_('Trainings')
    .filter(function (r) { return String(r.training_id).trim(); })
    .map(function (r) {
      const start = ymd_(r.start_date);
      return {
        id: String(r.training_id).trim(), title: String(r.title || '').trim() || String(r.training_id).trim(),
        start: start, end: ymd_(r.end_date) || start, venue: String(r.venue || '').trim(), mode: String(r.mode || '').trim()
      };
    });
}

/** Can people check themselves in for this training on the Attendance screen? See selfCheckIn in CONFIG. */
function selfCheckInFor_(t) {
  const s = CONFIG.selfCheckIn;
  return s === true || (s === 'online' && String(t.mode || '').trim() === 'Online');
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
  if (record.flag) flagHeader_(sh);
  sh.appendRow(headers_(sh).map(function (h) { return toCell_(record[h]); }));
  if (record.flag) flagRule_(sh);
}

/** Puts a row at a random position so row order doesn't reveal who answered when. */
function insertAnonymous_(name, record) {
  const sh = sheet_(name);
  if (record.flag) flagHeader_(sh);
  const row = headers_(sh).map(function (h) { return toCell_(record[h]); });
  const last = Math.max(sh.getLastRow(), 1);
  const pos = 2 + Math.floor(Math.random() * last);   // anywhere from row 2 to the row after the last
  if (pos <= last) sh.insertRowBefore(pos);
  sh.getRange(pos, 1, 1, row.length).setValues([row]);
  if (record.flag) flagRule_(sh);
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

/** The Likert sections from CONFIG, cleaned up. */
function evalSections_() {
  return (CONFIG.evaluationItems || []).map(function (sec) {
    return {
      section: String(sec.section || ''), na: sec.na === true,
      items: (sec.items || []).filter(function (it) { return it && it.key; })
        .map(function (it) { return { key: String(it.key), text: String(it.text || it.key) }; })
    };
  }).filter(function (sec) { return sec.items.length; });
}

/** The Evaluations columns for the Likert statements, in order. */
function evalKeys_() {
  const keys = [];
  evalSections_().forEach(function (sec) { sec.items.forEach(function (it) { keys.push(it.key); }); });
  return keys;
}

function stewards_() {
  return (CONFIG.dataStewards || []).map(function (e) { return String(e).trim().toLowerCase(); }).filter(String);
}

/** True when no stewards are listed, or when the person running this owns the Sheet or is listed. */
function isSteward_() {
  const list = stewards_();
  if (!list.length) return true;
  const me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  return !!me && (list.indexOf(me) > -1 || me === ownerEmail_());
}

/** The Sheet owner's email, lowercase; '' in a shared drive, where files have no single owner. */
function ownerEmail_() {
  try {
    const o = SpreadsheetApp.getActiveSpreadsheet().getOwner();
    return o ? String(o.getEmail() || '').toLowerCase() : '';
  } catch (e) {
    return '';
  }
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
