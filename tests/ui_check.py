#!/usr/bin/env python3
"""Clicks through the preview page (src/app.html) in Chromium: every screen on a phone and a
desktop, light and dark, the organizer report, and the report's print layout as a PDF.

  python3 tests/ui_check.py OUT_DIR [FONTS_DIR]

FONTS_DIR (optional) holds the .woff2 files of EB Garamond, Source Sans 3 and Source Code Pro (for example from the @fontsource npm packages), so screenshots use
the real fonts when Google Fonts can't be reached. Needs: pip install playwright.
"""
import json
import pathlib
import base64
import datetime
import re
import subprocess
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'out'
FONTS = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else None
OUT.mkdir(parents=True, exist_ok=True)

SKELETON = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>%s</body></html>')
(OUT / 'preview.html').write_text(SKELETON.replace('%s', (ROOT / 'src' / 'app.html').read_text(encoding='utf-8')), encoding='utf-8')

# What Code.gs writes into the deployed page (CONFIG, the logos, the background photo), read from Code.gs and Logos.gs themselves
BRAND = json.loads(subprocess.run(['node', '-e', '''
const vm = require("vm"), fs = require("fs"), ctx = vm.createContext({});
for (const f of ["Code.gs", "Logos.gs"]) vm.runInContext(fs.readFileSync(process.argv[1] + "/" + f, "utf8"), ctx, { filename: f });
process.stdout.write(vm.runInContext("brandJson_()", ctx));
''', str(ROOT / 'apps-script')], capture_output=True, text=True, check=True).stdout)

JSQR = ROOT / 'tests' / 'vendor' / 'jsQR.js'   # the same file the scanner loads from the CDN, checked against its integrity hash
JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'

FONT_FILES = [
    ('EB Garamond', 500, 'eb-garamond-latin-500-normal.woff2'), ('EB Garamond', 600, 'eb-garamond-latin-600-normal.woff2'),
    ('EB Garamond', 700, 'eb-garamond-latin-700-normal.woff2'),
    ('Source Sans 3', 400, 'source-sans-3-latin-400-normal.woff2'), ('Source Sans 3', 600, 'source-sans-3-latin-600-normal.woff2'),
    ('Source Sans 3', 700, 'source-sans-3-latin-700-normal.woff2'),
    ('Source Code Pro', 600, 'source-code-pro-latin-600-normal.woff2'),
]
CORS = {'Access-Control-Allow-Origin': '*'}
failures = []


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def route_fonts(pg):
    if not FONTS:
        return
    css = ''.join("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:block;src:url(https://fonts.gstatic.com/local/%s) format('woff2')}"
                  % f for f in FONT_FILES)
    pg.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=css, headers=CORS))
    pg.route('https://fonts.gstatic.com/local/**', lambda r: r.fulfill(
        status=200, path=str(FONTS / r.request.url.rsplit('/', 1)[1]), headers=dict(CORS, **{'Content-Type': 'font/woff2'})))


def tiny_png(w=6, h=4, grey=120):
    """A small grey PNG as a data: URI, standing in for a background photo."""
    import struct, zlib
    raw = b''.join(b'\x00' + bytes([grey]) * w for _ in range(h))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
    return 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')


def open_page(browser, w, h, dark=False, brand=None, dsf=1):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dsf, color_scheme='dark' if dark else 'light')
    pg = ctx.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    route_fonts(pg)
    if brand:
        pg.add_init_script('window.SANAY_BRAND = %s;' % json.dumps(brand))
    pg.goto((OUT / 'preview.html').as_uri())
    pg.wait_for_function('document.querySelector("#regTraining option") !== null')
    pg.evaluate('document.fonts ? document.fonts.ready.then(() => 1) : 1')
    return ctx, pg, errors


def route_jsqr(pg):
    pg.route(JSQR_URL, lambda r: r.fulfill(status=200, path=str(JSQR), headers=dict(CORS, **{'Content-Type': 'application/javascript'})))


def read_qr(pg, selector):
    """Reads a QR code on the page (an <img> or an <svg>) the way a phone would, with jsQR."""
    if not pg.evaluate('!!window.jsQR'):
        pg.add_script_tag(path=str(JSQR))
    return pg.evaluate('''async (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const src = el.tagName.toLowerCase() === 'img' ? el.src
          : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(el).replace('<svg', '<svg width="400" height="400"'));
        const img = new Image();
        img.src = src;
        await img.decode();
        const w = 400, h = Math.round(400 * (img.naturalHeight || 400) / (img.naturalWidth || 400));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h), r = jsQR(d.data, w, h);
        return r ? r.data : null; }''', selector)


def open_scanner(pg, pin='246810'):
    pg.click('#openScanner')
    pg.wait_for_selector('#scPinForm:not([hidden])')
    pg.fill('#scPin', pin)
    pg.click('#scPinGo')
    pg.wait_for_selector('#scMain:not([hidden])')


def no_overflow(pg, label):
    sw, iw = pg.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    check(sw <= iw, '%s: no sideways scroll (%d <= %d)' % (label, sw, iw))


def go(pg, view):
    pg.click('[data-home]:visible') if view == 'home' else pg.click('#go-' + view)


def papers_fit(pg):
    return pg.evaluate('''() => Array.from(document.querySelectorAll('#paperStack .paper')).map(p => {
        const t = p.querySelector('table'), f = p.querySelector('.p-foot');
        return t ? t.getBoundingClientRect().bottom <= f.getBoundingClientRect().top + 1 : true; })''')


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------------- phone, preview look ----------------
    ctx, pg, errors = open_page(browser, 390, 844, dsf=2)
    check(pg.locator('.flow .action').count() == 3 and pg.locator('.asks .action-request').count() == 2, 'home: three training buttons, then Request a training and Training partnership')
    check(pg.text_content('#projectMark') == 'TaTaK' and pg.text_content('#projectRest') == 'Resilience Project' and pg.text_content('#sanayMark') == 'SANAY', 'TaTaK Resilience Project and SANAY in the center lockup')
    top = pg.evaluate("() => ['#projectExp', '#projectLine', '#sanayMark', '#brandExpansion'].map(s => document.querySelector(s).getBoundingClientRect().top)")
    check(top[0] < top[1] < top[2] < top[3], 'stacked: TaTaK meaning, TaTaK Resilience Project, SANAY, SANAY meaning')
    check(''.join(pg.eval_on_selector_all('#projectExp b', 'bs => bs.map(b => b.textContent)')) == 'TaTaK', 'Ta-Ta-K highlighted in the Filipino expansion')
    check(pg.text_content('#projectExp .kw') == 'Katatagan' and pg.evaluate("() => getComputedStyle(document.querySelector('#projectExp .kw')).color === getComputedStyle(document.querySelector('#projectRest')).color"), 'Katatagan in the same green as Resilience Project')
    check(pg.locator('.logo-slot').count() == 3, 'preview shows three logo slots')
    check(pg.inner_text('#brandExpansion').startswith('Skills And Needs'), 'acronym expansion shown')
    check(''.join(pg.eval_on_selector_all('#brandExpansion b', 'bs => bs.map(b => b.textContent)')) == 'SANAY', 'only S-A-N-A-Y highlighted (the C of CapacitY is not)')
    check(pg.locator('.action .action-icon').count() == 5, 'each button has an icon')
    no_overflow(pg, 'home (phone)')
    pg.screenshot(path=str(OUT / '01-phone-home.png'))
    pg.click('#creditsBtn')
    credits = pg.text_content('#crList')
    check(pg.is_visible('#credits') and 'Kazuhiko Arase' in credits and pg.locator('#crList dt').all_text_contents() == ['QR codes', 'Runs on'],
          'the (i) under the buttons opens the credits; below the developer, only the QR code and Runs on notes')
    by = pg.inner_text('#crBy')
    check(by.startswith('Conceptualized and Developed with AI Assistance by:') and 'Developer name' in by and 'Date Developed: November 2026' in by,
          'credits in the developer format: heading, name and lines, date developed (the preview uses placeholders)')
    cap = pg.locator('#crBy .cr-aff-btn')
    check(cap.count() == 1 and cap.get_attribute('aria-expanded') == 'false' and pg.is_hidden('#crAff0') and 'Additional Affiliation' not in by,
          'the additional affiliation stays behind a small cap beside the name')
    box = cap.bounding_box()
    check(box['width'] >= 30 and box['height'] >= 30, 'the cap is big enough to tap (%dx%d)' % (box['width'], box['height']))
    cap.click()
    check(cap.get_attribute('aria-expanded') == 'true' and pg.is_visible('#crAff0') and pg.inner_text('#crAff0').startswith('Additional Affiliation:'),
          'tapping the cap shows the Additional Affiliation')
    check(pg.evaluate("() => { const d = document.querySelector('#credits'); return d.scrollWidth <= d.clientWidth; }"), 'credits box does not scroll sideways on a phone')
    pg.screenshot(path=str(OUT / '01b-phone-credits.png'))
    cap.click()
    check(cap.get_attribute('aria-expanded') == 'false' and pg.is_hidden('#crAff0'), 'tapping it again hides it')
    pg.keyboard.press('Escape')
    check(pg.is_hidden('#credits'), 'Escape closes the credits')

    go(pg, 'register')
    groups = pg.eval_on_selector_all('#regTraining optgroup', 'gs => gs.map(g => g.label)')
    check(groups == ['Open for registration', 'Full or closed', 'Completed'], 'dropdown groups: %s' % groups)
    check(pg.eval_on_selector_all('#regTraining optgroup:not([label^="Open"]) option', 'os => os.every(o => o.disabled)'), 'full, closed and completed trainings cannot be chosen')
    pg.click('#regSubmit')
    check(pg.is_visible('#err-training_id') and pg.is_visible('#err-gad_consent') and pg.is_visible('#err-photo_consent'), 'empty form shows its errors')
    check(pg.evaluate('document.activeElement.id') == 'regTraining', 'focus moves to the first problem')
    pg.select_option('#regTraining', 'RDANA-1')
    pg.fill('#firstName', 'Liza'); pg.fill('#lastName', 'Soriano'); pg.fill('#middleInitial', 'b')
    pg.fill('#position', 'Planning Officer'); pg.fill('#agency', 'PDRRMO Kalinaw'); pg.fill('#email', 'liza.soriano@example.com')
    pg.fill('#contactNo', '0918 222 3344')
    check(pg.inner_text('#certName') == 'LIZA B. SORIANO', 'certificate name preview: ' + pg.inner_text('#certName'))
    check(not pg.is_visible('#gadFields'), 'GAD questions hidden until consent')
    pg.click('label[for="gadYes"]')
    check(pg.is_visible('#gadFields'), 'GAD questions shown after consent')
    pg.click('label[for="sex-Female"]'); pg.click('label[for="age_range-60"]')
    check(pg.is_checked('#senior_citizen-Yes'), '60+ suggests senior citizen: yes')
    pg.click('label[for="age_range-2559"]')
    check(pg.is_checked('#senior_citizen-No'), '25-59 switches the suggestion back to no')
    pg.click('label[for="pwd-No"]'); pg.click('label[for="indigenous_people-Yes"]')
    check(pg.is_visible('#tribeField'), 'tribe field appears for IP: yes')
    pg.click('label[for="photo_consent-Yes"]'); pg.click('label[for="recording_consent-No"]')
    pg.click('#regSubmit')
    check(pg.is_visible('#err-impact_consent'), 'the follow-up interview question must be answered')
    pg.click('label[for="impact_consent-Yes"]')
    check(not pg.is_visible('#err-impact_consent'), 'its error clears once answered')
    check(pg.is_visible('#err-tribe'), 'tribe required when IP is yes')
    pg.fill('#tribe', 'Mangyan')
    check(not pg.is_visible('#err-tribe'), 'the error clears as soon as the tribe is typed')
    pg.screenshot(path=str(OUT / '02-phone-register-full.png'), full_page=True)
    pg.click('#regSubmit')
    pg.wait_for_selector('#regDone:not([hidden])')
    code = pg.inner_text('#doneCode')
    check(len(code) == 5, 'registration code shown: ' + code)
    check(read_qr(pg, '#doneQr') == 'SANAY:' + code, 'the confirmation has a QR code that reads SANAY:' + code)
    check('Submitted' in pg.inner_text('#doneFacts'), 'submission time shown in place of a signature')
    pg.screenshot(path=str(OUT / '03-phone-registered.png'))

    pg.click('#doneAnother')
    pg.fill('#firstName', 'Ramon'); pg.fill('#lastName', 'Aquino'); pg.fill('#agency', 'MSWDO Dalisay'); pg.fill('#email', 'ramon.aquino@example.com')
    pg.click('label[for="gadNo"]')
    check(not pg.is_visible('#gadFields'), 'no consent keeps the GAD questions hidden')
    pg.click('label[for="photo_consent-No"]'); pg.click('label[for="recording_consent-No"]'); pg.click('label[for="impact_consent-No"]')
    pg.click('#regSubmit')
    pg.wait_for_selector('#regDone:not([hidden])')
    check(pg.inner_text('#doneTitle') == "You're registered", 'registration without GAD data accepted')

    pg.click('#regDone [data-home]')
    go(pg, 'attendance')
    check(pg.is_visible('#ciDoor') and pg.is_hidden('#ciKey'), 'face-to-face training: no code box, only "show your QR code at the venue", so nobody checks in from home')
    check(pg.is_visible('#ciRegister') and pg.inner_text('#ciRegister') == 'Walk-in registration', 'attendance shows a walk-in button')
    pg.click('#ciRegister')
    check('show your QR code at the door' in pg.inner_text('#regLead'), 'a walk-in on their own phone is told to show their QR code at the door')
    pg.fill('#firstName', 'Noel'); pg.fill('#lastName', 'Galang'); pg.fill('#agency', 'Malaya City Fire Station'); pg.fill('#email', 'noel.walkin@example.com')
    pg.click('label[for="gadYes"]'); pg.click('label[for="sex-Male"]'); pg.click('label[for="age_range-2559"]'); pg.click('label[for="pwd-No"]'); pg.click('label[for="indigenous_people-No"]')
    pg.click('label[for="photo_consent-Yes"]'); pg.click('label[for="recording_consent-Yes"]'); pg.click('label[for="impact_consent-Yes"]')
    pg.click('#regSubmit')
    pg.wait_for_selector('#regDone:not([hidden])')
    wcode = pg.inner_text('#doneCode')
    check(pg.inner_text('#doneTitle') == "You're registered" and 'Show your QR code at the door' in pg.inner_text('#doneLead') and pg.is_hidden('#doneCheckIn'),
          'the walk-in is registered but not checked in until their QR code is scanned at the venue')
    check(read_qr(pg, '#doneQr') == 'SANAY:' + wcode, 'and gets the QR code to show')

    pg.click('#regDone [data-home]')
    go(pg, 'evaluation')
    pg.select_option('#evTraining', 'ICS-4')
    pg.fill('#evKey', 'K7Q2M')
    check(pg.locator('#evLikert .lk-item').count() == 16, 'evaluation has 16 Likert statements')
    items = pg.query_selector_all('#evLikert .lk-item')
    for el in items[:-1]:
        el.query_selector('label.lk-opt:nth-child(4)').click()
    pg.click('#evSubmit')
    check('Still to answer: 16' in pg.inner_text('#evError') and pg.locator('#evLikert .lk-item.missing').count() == 1, 'an unanswered statement is flagged by number')
    items[-1].query_selector('label.lk-opt:nth-child(5)').click()
    check(pg.locator('#evLikert .lk-item.missing').count() == 0 and pg.inner_text('#evProgress') == '16 of 16 statements answered', 'progress counts the answers')
    check(pg.is_hidden('#evError'), 'the reminder goes away once every statement is answered')
    pg.click('label[for="lk-venue_ok-na"]')
    pg.screenshot(path=str(OUT / '03d-phone-evaluation-full.png'), full_page=True)
    pg.click('#evSubmit')
    pg.wait_for_selector('#evDone:not([hidden])')
    check(True, 'evaluation submitted')

    pg.click('#evDone [data-home]')
    go(pg, 'request')
    pg.click('#rqSubmit')
    check(pg.is_visible('#err-rq-topics') and pg.is_visible('#err-rq-date') and pg.is_visible('#err-rq-consent'), 'empty request shows its errors')
    pg.click('label[for="rq-topic-0"]'); pg.click('label[for="rq-topic-4"]')
    check(not pg.is_visible('#err-rq-topics'), 'topic error clears once a topic is ticked')
    pg.fill('#rqOther', 'Evacuation center management')
    pg.fill('#rqCount', '30'); pg.fill('#rqWho', 'Barangay officials')
    pg.fill('#rqDate', '2020-01-01')
    pg.click('#rqSubmit')
    check('today onward' in pg.inner_text('#err-rq-date'), 'past dates refused')
    future = pg.evaluate("() => { const d = new Date(Date.now() + 40 * 864e5); return d.toISOString().slice(0, 10); }")
    pg.fill('#rqDate', future)
    pg.click('label[for="rq_mode-Facetoface"]'); pg.fill('#rqPlace', 'Malaya City')
    pg.fill('#rqFirst', 'Rhea'); pg.fill('#rqLast', 'Domingo'); pg.fill('#rqAgency', 'MDRRMO Dalisay'); pg.fill('#rqEmail', 'rhea.domingo@example.com')
    pg.check('#rqConsent')
    pg.screenshot(path=str(OUT / '03b-phone-request-full.png'), full_page=True)
    pg.click('#rqSubmit')
    pg.wait_for_selector('#rqDone:not([hidden])')
    check(len(pg.inner_text('#rqCode')) == 5 and 'Evacuation center management' in pg.inner_text('#rqFacts'), 'request received with a request number')

    pg.click('#rqDone [data-home]')
    go(pg, 'partner')
    pg.click('#ptSubmit')
    check(pg.is_visible('#err-pt-org') and pg.is_visible('#err-pt-orgtype') and pg.is_visible('#err-pt-types') and pg.is_visible('#err-pt-consent'), 'empty partnership request shows its errors')
    pg.fill('#ptOrg', 'Bayanihan Foundation'); pg.click('label[for="pt_org_type-NGOorcivilsociety"]')
    pg.click('label[for="pt-type-0"]'); pg.click('label[for="pt-type-2"]')
    check(not pg.is_visible('#err-pt-types'), 'partnership-kind error clears once one is ticked')
    pg.click('label[for="pt-topic-5"]')
    pg.fill('#ptProposal', 'We can host a two-day course for our partner barangays and cover the meals.')
    pg.fill('#ptFirst', 'Carlo'); pg.fill('#ptLast', 'Pascual'); pg.fill('#ptEmail', 'carlo@bayanihan.example.org')
    pg.check('#ptConsent')
    pg.screenshot(path=str(OUT / '03c-phone-partnership-full.png'), full_page=True)
    pg.click('#ptSubmit')
    pg.wait_for_selector('#ptDone:not([hidden])')
    check(len(pg.inner_text('#ptCode')) == 5 and 'Host the venue' in pg.inner_text('#ptFacts'), 'partnership request received with a request number')
    for view in ('register', 'attendance', 'evaluation'):
        pg.click('#view-%s [data-home] >> nth=0' % view) if pg.is_visible('#view-%s' % view) else None
    pg.click('[data-home]:visible') if pg.locator('[data-home]:visible').count() else None
    for view in ('register', 'attendance', 'evaluation', 'request', 'partner'):
        go(pg, view)
        no_overflow(pg, view + ' (phone)')
        pg.click('#view-%s [data-home] >> nth=0' % view)
    check(not errors or all('fonts.g' in e for e in errors), 'no script errors on the phone: %s' % errors[:3])
    ctx.close()

    # ---------------- check-in scanner at the door ----------------
    ctx, pg, errors = open_page(browser, 390, 844, dsf=2)
    route_jsqr(pg)
    pg.click('#openScanner')
    pg.wait_for_selector('#scPinForm:not([hidden])')
    check(pg.is_hidden('#scMain'), 'the scanner link alone shows nothing: it asks for the PIN')
    pg.fill('#scPin', '135790'); pg.click('#scPinGo')
    pg.wait_for_function('!document.querySelector("#scPinErr").hidden')
    check('Wrong scanner PIN' in pg.inner_text('#scPinErr') and pg.is_hidden('#scMain'), 'a wrong PIN keeps it shut')
    pg.fill('#scPin', '246810'); pg.click('#scPinGo')
    pg.wait_for_selector('#scMain:not([hidden])')
    check('Batch 4' in pg.inner_text('#scTitle') and 'Day 2 of 3' in pg.inner_text('#scLead'), 'scanner opens on the training happening today: ' + pg.inner_text('#scLead'))
    n0 = int(pg.inner_text('#scIn'))
    first = pg.get_attribute('#scDemoCodes [data-scan] >> nth=1', 'data-scan')
    pg.click('#scDemoCodes [data-scan] >> nth=1')
    pg.wait_for_function('document.querySelector("#scNet").textContent.includes("all sent")')
    check(pg.inner_text('#scResult .st').startswith('Checked in') and int(pg.inner_text('#scIn')) == n0 + 1, 'a scan checks the person in, and the count goes up')
    pg.fill('#scCode', 'sanay:' + first.lower()); pg.press('#scCode', 'Enter')
    check(pg.inner_text('#scResult .st').startswith('Already checked in'), 'the same person again: already checked in')
    pg.fill('#scCode', 'ZZZZZ'); pg.press('#scCode', 'Enter')
    pg.wait_for_function('document.querySelector("#scResult .st").textContent.includes("Not registered")')
    check(True, 'an unknown code: not registered, send them to the walk-in desk')
    pg.click('#scSignal')
    pg.fill('#scCode', 'K7Q2M'); pg.press('#scCode', 'Enter')
    check('Juan' in pg.inner_text('#scResult .nm') and pg.inner_text('#scResult .st').startswith('Checked in'), 'with no signal, a scan still counts on the device')
    pg.wait_for_function('document.querySelector("#scNet").textContent.includes("No signal · 1 waiting to send")')
    check(True, 'and waits on the device')
    pg.screenshot(path=str(OUT / '13-phone-scanner-no-signal.png'), full_page=True)
    pg.click('#scSignal')
    pg.wait_for_function('document.querySelector("#scNet").textContent.includes("all sent")', timeout=20000)
    pg.click('#toggleSheet'); pg.click('#sheetTabs [data-tab="Attendance"]')
    grid = pg.inner_text('#grid')
    check('K7Q2M' in grid and 'Typed code' in grid, 'once the signal is back, the waiting scan reaches the Sheet')
    pg.click('#toggleSheet')
    pg.click('#scMain .seg [data-mode="list"]')
    n1 = int(pg.inner_text('#scIn'))
    pg.click('#scPeople .sc-pick >> nth=0')
    check('Tap again' in pg.inner_text('#scPeople .sc-pick.sure'), 'checking someone in from the list asks for a second tap')
    pg.click('#scPeople .sc-pick.sure')
    pg.wait_for_function('document.querySelector("#scNet").textContent.includes("all sent")')
    check(int(pg.inner_text('#scIn')) == n1 + 1 and pg.is_visible('#scListPane'), 'the second tap checks them in, and the list stays open')
    pg.fill('#scSearch', 'Rogelio')
    check(pg.locator('#scPeople li').count() == 1 and 'In ·' in pg.inner_text('#scPeople'), 'search finds a person and shows they are in')
    pg.click('#scMain .seg [data-mode="walkin"]')
    check(pg.inner_text('#regBack') == 'Scanner' and 'at the door' in pg.inner_text('#regLead') and pg.locator('#regTraining option').count() == 1, 'Walk-in opens the form for this training, with a way back to the scanner')

    def desk_walkin(first_name, email):
        pg.fill('#firstName', first_name); pg.fill('#lastName', 'Villanueva'); pg.fill('#agency', 'BFP Malaya'); pg.fill('#email', email)
        pg.click('label[for="gadNo"]'); pg.click('label[for="photo_consent-Yes"]'); pg.click('label[for="recording_consent-Yes"]'); pg.click('label[for="impact_consent-No"]')
        pg.click('#regSubmit')
        pg.wait_for_selector('#regDone:not([hidden])', timeout=15000)
    desk_walkin('Arnel', 'arnel.desk@example.com')
    wcode = pg.inner_text('#doneCode')
    check(pg.inner_text('#doneTitle') == 'Registered and checked in' and read_qr(pg, '#doneQr') == 'SANAY:' + wcode and pg.is_visible('#doneScan') and pg.is_hidden('#doneHome'),
          'walk-in at the door: registered, checked in and given a QR code; next is back to scanning')
    pg.screenshot(path=str(OUT / '14-phone-scanner-walkin.png'), full_page=True)
    pg.click('#doneScan')
    check('Arnel' in pg.inner_text('#scRecent'), 'the walk-in shows in the latest list')
    pg.click('#scSignal')
    pg.click('#scMain .seg [data-mode="walkin"]')
    desk_walkin('Benjie', 'benjie.desk@example.com')
    check(pg.inner_text('#doneTitle') == 'Saved on this device' and pg.is_hidden('#doneCard'), 'with no signal, a walk-in is saved on the device')
    pg.click('#doneScan')
    pg.click('#scSignal')
    pg.wait_for_function('document.querySelector("#scNet").textContent.includes("all sent")', timeout=20000)
    pg.click('#scMain .seg [data-mode="list"]')
    pg.fill('#scSearch', 'Benjie Villanueva')
    check('In ·' in pg.inner_text('#scPeople'), 'and reaches the Sheet, checked in, when the signal is back')
    # a check-in station at the entrance: participants scan their own QR codes
    pg.click('#scMain .seg [data-mode="scan"]')
    pg.click('#scStation')
    check(pg.evaluate("document.querySelector('#view-scan').classList.contains('station')") and pg.is_hidden('#scMain .seg') and pg.is_hidden('#scRecent')
          and pg.is_hidden('#scAdd') and pg.is_hidden('#scType') and pg.is_visible('#scStationHead'),
          'check-in station: only the camera and each result; no list, no latest names, no typing, no Add a device')
    pg.click('#scDemoCodes [data-scan] >> nth=2')
    pg.wait_for_function('(document.querySelector("#scResult .st") || {}).textContent && document.querySelector("#scResult .st").textContent.startsWith("You")')
    check(True, 'a participant scanning their own QR code sees: ' + pg.inner_text('#scResult .st'))
    pg.screenshot(path=str(OUT / '15b-phone-check-in-station.png'), full_page=True)
    pg.click('#scExitBtn'); pg.fill('#scExitPin', '000000'); pg.press('#scExitPin', 'Enter')
    check(pg.evaluate("document.querySelector('#view-scan').classList.contains('station')"), 'leaving the station needs the PIN')
    pg.fill('#scExitPin', '246810'); pg.press('#scExitPin', 'Enter')
    check(not pg.evaluate("document.querySelector('#view-scan').classList.contains('station')") and pg.is_visible('#scMain .seg'), 'the right PIN brings back the organizer view')
    pg.click('#scCamOff') if pg.is_visible('#scCamOff') else None

    # no signal across days: the scanner keeps track of the date on its own
    pg.click('#scMain .seg [data-mode="scan"]')
    pg.click('#scSignal')
    tomorrow = pg.evaluate("() => Date.now() + 864e5")
    at = lambda ms: datetime.datetime.fromtimestamp(ms / 1000, tz=datetime.timezone.utc)
    pg.clock.set_fixed_time(at(tomorrow))
    pg.fill('#scCode', first); pg.press('#scCode', 'Enter')
    check(pg.inner_text('#scResult .st').startswith('Checked in') and 'Day 3 of 3' in pg.inner_text('#scLead'),
          'no signal overnight: on the next training day, people checked in yesterday can check in again')
    pg.clock.set_fixed_time(at(tomorrow + 864e5))
    pg.fill('#scCode', first); pg.press('#scCode', 'Enter')
    check("isn't a training day" in pg.inner_text('#scResult .st') and 'ended' in pg.inner_text('#scLead'), 'after the last day, scans are refused')
    pg.click('#scSignal')
    pg.wait_for_function('document.querySelector("#scNet").textContent.includes("all sent")', timeout=20000)
    check(True, 'the scan saved on the last day is sent once the signal is back')
    pg.click('#scAdd')
    check(read_qr(pg, '#scAddQr svg') == 'https://script.google.com/macros/s/your-web-app/exec?page=scan&k=preview', 'Add a device shows the scanner link as a QR code')
    no_overflow(pg, 'scanner (phone)')
    pg.screenshot(path=str(OUT / '15-phone-scanner.png'), full_page=True)

    # a phone camera pointed at a participant's QR code (Chromium's fake camera, playing a picture of it)
    y = pg.evaluate('''(code) => {
        const q = qrcode(0, 'M'); q.addData('SANAY:' + code, 'Alphanumeric'); q.make();
        const n = q.getModuleCount(), W = 640, H = 480, s = Math.floor(330 / (n + 8)), z = (n + 8) * s, x0 = (W - z) >> 1, y0 = (H - z) >> 1;
        const Y = new Uint8Array(W * H).fill(150);
        for (let r = 0; r < z; r++) for (let c = 0; c < z; c++) Y[(y0 + r) * W + x0 + c] = 235;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
          for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) Y[(y0 + (r + 4) * s + i) * W + x0 + (c + 4) * s + j] = 20;
        let out = ''; for (let i = 0; i < Y.length; i += 8192) out += String.fromCharCode.apply(null, Y.subarray(i, i + 8192));
        return btoa(out); }''', 'R4XTP')
    cam = OUT / 'fake-camera.y4m'
    frame = base64.b64decode(y) + bytes([128]) * (640 * 480 // 2)
    cam.write_bytes(b'YUV4MPEG2 W640 H480 F10:1 Ip A1:1 C420jpeg\n' + b''.join(b'FRAME\n' + frame for _ in range(5)))
    check(not errors or all('fonts.g' in e for e in errors), 'no script errors in the scanner: %s' % errors[:3])
    ctx.close()
    cam_browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + str(cam)])
    ctx, pg, errors = open_page(cam_browser, 390, 844)
    route_jsqr(pg)
    open_scanner(pg)
    pg.click('#scStart')
    try:
        pg.wait_for_function('(document.querySelector("#scResult .nm") || {}).textContent === "Ana L. Reyes"', timeout=20000)
        seen = pg.inner_text('#scResult .st')
    except Exception:
        seen = pg.inner_text('#scCamMsg') if pg.is_visible('#scCamMsg') else pg.inner_text('#scResult')
    check(seen.startswith('Checked in') or seen.startswith('Already checked in'), 'the camera reads a QR code and checks the person in: ' + seen)
    check(pg.evaluate('!!window.jsQR') and pg.evaluate('document.querySelector(\'script[src*="jsqr"]\').integrity.startsWith("sha384-")'), 'the QR reader loaded from the CDN, and matched its integrity hash')
    pg.screenshot(path=str(OUT / '16-phone-scanner-camera.png'))
    ctx.close()
    cam_browser.close()

    ctx, pg, errors = open_page(browser, 1360, 900, dsf=1)
    open_scanner(pg)
    pg.click('#scDemoCodes [data-scan] >> nth=0')
    pg.wait_for_function('document.querySelector("#scNet").textContent.includes("all sent")')
    pg.screenshot(path=str(OUT / '17-desktop-scanner.png'))
    ctx.close()

    # ---------------- desktop: report, sheet panel, dark ----------------
    ctx, pg, errors = open_page(browser, 1360, 900)
    pg.screenshot(path=str(OUT / '04-desktop-home.png'))
    pg.click('#toggleSheet')
    check(pg.is_visible('#sheet') and pg.locator('#grid tr').count() > 5, 'Google Sheet panel opens')
    pg.click('#sheetTabs [data-tab="Registrations"]')
    check(pg.locator('#grid thead th').count() == 18, 'Registrations tab shows 17 columns')
    pg.click('#sheetTabs [data-tab="Requests"]')
    check(pg.locator('#grid tbody tr').count() >= 12, 'Requests tab lists the sample requests')
    pg.click('#sheetTabs [data-tab="Partnerships"]')
    check(pg.locator('#grid tbody tr').count() >= 6, 'Partnerships tab lists the sample partnership requests')
    pg.click('#toggleSheet')
    pg.click('#openReport')
    pg.wait_for_selector('#paperStack .paper')
    pages = pg.locator('#paperStack .paper').count()
    check(pages >= 1, 'attendance sheet pages: %d' % pages)
    check(all(papers_fit(pg)), 'every attendance page fits above its footer')
    check(pg.locator('#paperStack .p-table tbody tr').count() >= 11, 'sheet has rows')
    check('ATTENDANCE SHEET' in pg.inner_text('#paperStack .paper >> nth=0'), 'title reads ATTENDANCE SHEET')
    pg.screenshot(path=str(OUT / '05-desktop-report-sheet.png'))
    pg.select_option('#rpList', 'reg')
    pg.wait_for_function('document.querySelector("#paperStack .p-title").innerText === "REGISTRATION LIST"')
    reg_pages = pg.locator('#paperStack .paper').count()
    check(all(papers_fit(pg)) and reg_pages >= 2, 'registration list paginates (%d pages) and fits' % reg_pages)
    pg.click('.seg [data-section="profile"]')
    pg.wait_for_selector('#paperStack .pf')
    check(pg.locator('#paperStack .pf-table tbody tr').count() >= 10, 'participant profile table')
    pg.screenshot(path=str(OUT / '06-desktop-report-profile.png'))
    pg.click('.seg [data-section="media"]')
    pg.wait_for_selector('#paperStack .md-table, #paperStack .p-empty')
    check(all(papers_fit(pg)), 'photo and recording pages fit')
    pg.click('.seg [data-section="impact"]')
    pg.wait_for_selector('#paperStack .md-table, #paperStack .p-empty')
    check(all(papers_fit(pg)) and 'IMPACT MONITORING CONTACTS' in pg.inner_text('#paperStack .paper >> nth=0'), 'impact interview list renders and fits')
    pg.click('.seg [data-section="requests"]')
    pg.wait_for_selector('#paperStack .rq-bars')
    check(pg.is_hidden('#rpTrainingField') and pg.is_hidden('#rpListField'), 'requests ignore the training and list choices')
    check(pg.locator('#paperStack .paper').count() >= 2 and all(papers_fit(pg)), 'requests: summary page plus a list that fits')
    pg.screenshot(path=str(OUT / '06b-desktop-report-requests.png'))
    pg.click('.seg [data-section="evals"]')
    pg.wait_for_selector('#paperStack .ev-table, #paperStack .p-empty')
    pg.select_option('#rpTraining', 'ICS-3')
    pg.wait_for_function('document.querySelector("#paperStack .ev-table") && document.querySelector("#paperStack .p-sub").textContent.includes("Batch 3")')
    check(pg.is_hidden('#rpListField') and pg.locator('#paperStack .ev-table tbody tr').count() == 22 and all(papers_fit(pg)), 'evaluation results: 16 statements in 6 sections, pages fit')
    check(pg.locator('#paperStack .paper:has(.ev-table)').count() == 1, 'all 16 statements fit on one page')
    nums = pg.eval_on_selector_all('#paperStack .p-meta.r', 'ps => ps.map(p => p.textContent)')
    check(nums == ['Page %d of %d' % (i + 1, len(nums)) for i in range(len(nums))], 'pages numbered straight through: ' + ', '.join(nums))
    check(pg.locator('#paperStack .ev-open').count() >= 1, 'written answers follow on their own pages')
    pg.screenshot(path=str(OUT / '06d-desktop-report-evaluation.png'))
    pg.click('.seg [data-section="tags"]')
    pg.wait_for_selector('#paperStack .tag')
    tags = pg.locator('#paperStack .tag:not(.tag-blank)').count()
    regs = int(re.search(r'Registered \((\d+)\)', pg.inner_text('#rpList option[value="reg"]')).group(1))
    check(pg.input_value('#rpList') == 'reg' and tags == regs, 'name tags: one per registered person (%d)' % tags)
    fit = pg.evaluate('''() => Array.from(document.querySelectorAll('#paperStack .paper')).every(p => {
        const b = p.getBoundingClientRect(); return Array.from(p.querySelectorAll('.tag')).every(t => t.getBoundingClientRect().bottom <= b.bottom - 8); })''')
    check(fit and pg.locator('#paperStack .paper').count() == -(-tags // 9), 'nine tags to a page, all inside the page')
    tcode = pg.inner_text('#paperStack .tag-code >> nth=0')
    check(read_qr(pg, '#paperStack .tag-qr svg') == 'SANAY:' + tcode, 'a printed name tag\'s QR code reads SANAY:' + tcode)
    pg.screenshot(path=str(OUT / '06e-desktop-report-name-tags.png'))
    pg.click('.seg [data-section="partners"]')
    pg.wait_for_function('(document.querySelector("#paperStack .p-title") || {}).textContent === "TRAINING PARTNERSHIP REQUESTS"')
    check(pg.is_hidden('#rpTrainingField') and all(papers_fit(pg)) and pg.locator('#paperStack .rq-table tbody tr').count() >= 6, 'partnership requests page lists them and fits')
    pg.click('.seg [data-section="certs"]')
    check(pg.is_visible('#rpShowField') and pg.is_visible('#rpCopy') and pg.is_hidden('#rpListField'), 'certificates show their own controls')
    pg.select_option('#rpTraining', 'ICS-3')
    pg.wait_for_function('(document.querySelector("#paperStack .p-sub") || {}).textContent && document.querySelector("#paperStack .p-sub").textContent.includes("Batch 3")')
    hl = pg.locator('#paperStack .ct-table tr.hl').count()
    allrows = pg.locator('#paperStack .ct-table tbody tr').count()
    check(0 < hl < allrows and all(papers_fit(pg)), 'certificates: %d of %d rows highlighted to check, pages fit' % (hl, allrows))
    check(pg.locator('#paperStack .ct-table tr.hl .ct-bad').count() == hl, 'every highlighted row says what to check')
    pg.screenshot(path=str(OUT / '06c-desktop-report-certificates.png'))
    pg.select_option('#rpShow', 'check')
    pg.wait_for_function('document.querySelectorAll("#paperStack .ct-table tbody tr:not(.hl)").length === 0')
    check(pg.locator('#paperStack .ct-table tbody tr').count() == hl, '"To check only" shows just the highlighted rows')
    pg.select_option('#rpShow', 'eligible')
    pg.wait_for_function('document.querySelectorAll("#paperStack .ct-table tr.hl").length === 0')
    check(pg.locator('#paperStack .ct-table tbody tr').count() == allrows - hl, '"Eligible only" leaves out the rows to check')
    pg.click('#rpCopy')
    pg.wait_for_function('document.querySelector("#rpCopyNote").textContent.length > 0')
    check(True, 'copy button answers: ' + pg.inner_text('#rpCopyNote')[:60])
    pg.select_option('#rpShow', 'all')
    pg.click('.seg [data-section="sheet"]')
    pg.wait_for_function('document.querySelector("#rpList").value === "any"')
    check(True, 'a finished multi-day training opens on "attended any day"')
    check(not errors or all('fonts.g' in e for e in errors), 'no script errors on desktop: %s' % errors[:3])
    ctx.close()

    ctx, pg, errors = open_page(browser, 1360, 900, dark=True)
    pg.screenshot(path=str(OUT / '07-desktop-dark.png'))
    go(pg, 'register'); pg.click('label[for="gadYes"]')
    pg.screenshot(path=str(OUT / '08-desktop-dark-register.png'))
    ctx.close()

    # ---------------- a background photo: faded, under the woven pattern, not on report pages ----------------
    photo = dict(BRAND, backdrop={'src': tiny_png(), 'position': '50% 30%', 'credit': 'Photo: Test Person'})
    ctx, pg, errors = open_page(browser, 390, 844, brand=photo)
    st = pg.evaluate("""() => { const el = document.querySelector('#bgPhoto'), cs = getComputedStyle(el), weave = getComputedStyle(document.body, '::before');
        return [!el.hidden, cs.backgroundImage.slice(0, 26), cs.backgroundPosition, cs.position, cs.zIndex, weave.zIndex, cs.opacity]; }""")
    check(st == [True, 'url("data:image/png;base64', '50% 30%', 'fixed', '-2', '-1', '0.16'], 'background photo: fixed, faded, under the woven pattern: %s' % st)
    pg.click('#creditsBtn')
    check(pg.locator('#crList dt').all_text_contents() == ['Background photo', 'QR codes', 'Runs on'] and 'Photo: Test Person' in pg.inner_text('#crList'),
          'the photo credit comes first in the credits notes')
    pg.click('#crClose')
    pg.evaluate("() => document.body.classList.add('is-report')")
    check(pg.is_hidden('#bgPhoto'), 'background photo: not behind report pages')
    ctx.close()
    ctx, pg, errors = open_page(browser, 390, 844, dark=True, brand=photo)
    check(pg.evaluate("() => getComputedStyle(document.querySelector('#bgPhoto')).opacity") == '0.1', 'background photo: fainter in dark mode')
    ctx.close()
    ctx, pg, errors = open_page(browser, 390, 844, brand=dict(BRAND, backdrop={'src': 'https://example.org/a.jpg") ; background: red'}))
    check(pg.is_hidden('#bgPhoto'), 'background photo: a link that could break out of the CSS is not used')
    ctx.close()

    # ---------------- deployed look: real logos and names ----------------
    ctx, pg, errors = open_page(browser, 390, 844, brand=BRAND, dsf=2)
    check(pg.locator('#logos img').count() == 3, 'deployed look: three logos')
    check(pg.is_visible('#bgPhoto') == bool(BRAND.get('backdrop')) and not pg.locator('#figure').count(), 'deployed look: the background photo when Logos.gs has one, and no half Oblation')
    pg.click('#creditsBtn')
    notes = pg.locator('#crList dt').all_text_contents()
    check(notes == ['QR codes', 'Runs on'] and not any(w in pg.inner_text('#credits') for w in ('Oblation', 'Logos', 'NOAH', 'Garamond')),
          'deployed credits: no Oblation, logo or font notes, only QR codes and Runs on: %s' % notes)
    by = [l.strip() for l in pg.inner_text('#crBy').split('\n') if l.strip()]
    check(by == ['Conceptualized and Developed with AI Assistance by:', 'Edward Andrew A. Dionido', 'Science Research Specialist II',
                 'Institution Building Division', 'University of the Philippines Resilience Institute', 'Date Developed: November 2026'],
          'deployed credits read exactly as given: %s' % by)
    pg.screenshot(path=str(OUT / '09b-branded-phone-credits.png'))
    pg.click('#crBy .cr-aff-btn')
    aff = [l.strip() for l in pg.inner_text('#crAff0').split('\n') if l.strip()]
    check(aff == ['Additional Affiliation:', 'Graduate Student (Ongoing)', 'College of Professional and Graduate Studies', 'De La Salle University Dasmariñas'],
          'the cap opens the additional affiliation: %s' % aff)
    pg.screenshot(path=str(OUT / '09c-branded-phone-credits-affiliation.png'))
    close_box = pg.locator('#crClose').bounding_box()
    check(close_box['y'] + close_box['height'] <= 844 and not pg.evaluate("() => document.querySelector('#credits').classList.contains('scrolls')"),
          'opened, the credits fit a phone screen, Close included')
    pg.set_viewport_size({'width': 390, 'height': 560})
    pg.wait_for_timeout(150)
    close_box = pg.locator('#crClose').bounding_box()
    check(close_box['y'] >= 0 and close_box['y'] + close_box['height'] <= 560, 'on a short screen, Close stays in view while the credits scroll')
    end = pg.evaluate('''() => { const d = document.querySelector('#credits'); d.scrollTop = d.scrollHeight;
        const last = [...document.querySelectorAll('#crList dd')].pop().getBoundingClientRect(), foot = document.querySelector('.cr-foot').getBoundingClientRect();
        return [d.classList.contains('scrolls'), last.bottom <= foot.top + 0.5]; }''')
    check(end == [True, True], 'scrolled to the end on a short screen, the last note sits above Close (a line marks the edge): %s' % end)
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_timeout(150)
    name, cap = pg.locator('#crBy .cr-name span').bounding_box(), pg.locator('#crBy .cr-aff-btn').bounding_box()
    mid = pg.evaluate("() => { const r = document.querySelector('#crBy').getBoundingClientRect(); return r.left + r.width / 2; }")
    check(abs((name['x'] + cap['x'] + cap['width']) / 2 - mid) < 2, 'the name and its cap sit centered like the lines under them')
    pg.click('#crClose')
    pg.click('#creditsBtn')
    check(pg.is_hidden('#crAff0'), 'the affiliation is closed again the next time the credits open')
    pg.click('#crClose')
    pg.screenshot(path=str(OUT / '09-branded-phone-home.png'))
    ctx.close()
    ctx, pg, errors = open_page(browser, 1360, 900, brand=BRAND, dsf=2)
    pg.screenshot(path=str(OUT / '10-branded-desktop-home.png'))
    pg.click('#creditsBtn'); pg.click('#crBy .cr-aff-btn')
    check(pg.evaluate("() => document.querySelectorAll('#crBy .cr-line')[2].getClientRects().length === 1"), 'desktop: the institute fits on one line')
    check(not pg.evaluate("() => document.querySelector('#credits').classList.contains('scrolls')"), 'desktop: everything fits, so no line above Close')
    name, cap = pg.locator('#crBy .cr-name span').bounding_box(), pg.locator('#crBy .cr-aff-btn').bounding_box()
    mid = pg.evaluate("() => { const r = document.querySelector('#crBy').getBoundingClientRect(); return r.left + r.width / 2; }")
    check(abs((name['x'] + cap['x'] + cap['width']) / 2 - mid) < 2, 'desktop: the name and its cap are centered')
    pg.screenshot(path=str(OUT / '10b-branded-desktop-credits.png'))
    ctx.close()
    ctx, pg, errors = open_page(browser, 390, 844, dark=True, brand=BRAND, dsf=2)
    pg.screenshot(path=str(OUT / '11-branded-phone-dark.png'))
    pg.click('#creditsBtn'); pg.click('#crBy .cr-aff-btn')
    pg.screenshot(path=str(OUT / '11b-branded-phone-dark-credits.png'))
    check(not errors or all('fonts.g' in e for e in errors), 'no script errors in the deployed look: %s' % errors[:3])
    ctx.close()

    ctx, pg, errors = open_page(browser, 1360, 900, brand=BRAND)
    pg.click('#openReport')
    pg.wait_for_selector('#paperStack .paper')
    pg.screenshot(path=str(OUT / '12-branded-report.png'))
    pg.select_option('#rpTraining', 'ICS-3')
    pg.wait_for_function('document.querySelector("#rpList").value === "any" && document.querySelector("#paperStack .p-av") && document.querySelector("#paperStack .p-av").textContent.includes("Batch 3")')
    for section, name in (('sheet', 'attendance-sheet'), ('certs', 'certificates'), ('profile', 'participant-profile'), ('media', 'photo-recording'),
                          ('impact', 'impact-interviews'), ('requests', 'training-requests'), ('partners', 'partnership-requests'), ('evals', 'evaluation-results'),
                          ('tags', 'name-tags')):
        pg.click('.seg [data-section="%s"]' % section)
        pg.wait_for_timeout(400)
        pg.emulate_media(media='print')
        n = pg.locator('#paperStack .paper').count()
        pg.pdf(path=str(OUT / ('sample-%s.pdf' % name)), prefer_css_page_size=True, print_background=True)
        pg.emulate_media(media='screen')
        print('     %s: %d page(s) printed' % (name, n))
    ctx.close()
    browser.close()

print('\n%d failure(s)' % len(failures))
sys.exit(1 if failures else 0)
