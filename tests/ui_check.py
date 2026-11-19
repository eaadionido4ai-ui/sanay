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

LOGOS = json.loads((ROOT / 'assets' / 'logos' / 'logos.json').read_text(encoding='utf-8'))
BRAND = {   # what Code.gs writes into the deployed page
    'name': 'SANAY',
    'expansion': 'Skills And Needs Assessment and Training Interventions towards enhanced DRRM CapacitY',
    'project': 'TaTaK Resilience Project', 'projectMark': 'TaTaK', 'projectExpansion': 'TagapagTaguyod ng Kasanayan tungo sa Katatagan',
    'institution': ['UNIVERSITY OF THE PHILIPPINES', 'Resilience Institute and NOAH Center'],
    'address': 'UP Resilience Institute, Magsaysay Avenue corner Apacible Street, University of the Philippines, Diliman, 1101 Quezon City, Philippines.',
    'contact': 'Tel. +63 (2) 8981-8500 Local 3770, 3771', 'email': 'resilience.institute@up.edu.ph',
    'bands': ['#014421', '#7B1113'],
    'logos': [{'alt': l['alt'], 'src': 'data:image/webp;base64,' + base64.b64encode((ROOT / 'assets' / 'logos' / l['file']).read_bytes()).decode()} for l in LOGOS],
}

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
    check(pg.locator('.flow .action').count() == 3 and pg.locator('.action-request').count() == 1, 'home: three training buttons and a request button')
    check(pg.inner_text('#projectName') == 'TaTaK Resilience Project', 'TaTaK Resilience Project shown')
    check(''.join(pg.eval_on_selector_all('#projectExp b', 'bs => bs.map(b => b.textContent)')) == 'TaTaK', 'Ta-Ta-K highlighted in the Filipino expansion')
    check(pg.locator('.logo-slot').count() == 3, 'preview shows three logo slots')
    check(pg.inner_text('#brandExpansion').startswith('Skills And Needs'), 'acronym expansion shown')
    check(''.join(pg.eval_on_selector_all('#brandExpansion b', 'bs => bs.map(b => b.textContent)')) == 'SANAY', 'only S-A-N-A-Y highlighted (the C of CapacitY is not)')
    check(pg.locator('.action .action-icon').count() == 4, 'each button has an icon')
    no_overflow(pg, 'home (phone)')
    pg.screenshot(path=str(OUT / '01-phone-home.png'))

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
    check(pg.is_visible('#ciRegister') and pg.inner_text('#ciRegister') == 'Walk-in registration', 'attendance shows a walk-in button')
    pg.click('#ciRegister')
    check('Walk-in' in pg.inner_text('#regLead'), 'the walk-in button opens the walk-in form')
    pg.click('#view-register [data-home] >> nth=0')
    go(pg, 'attendance')
    pg.fill('#ciKey', 'K7Q2M'); pg.click('#ciSubmit')
    pg.wait_for_selector('#ciResult .result')
    check("You're checked in" in pg.inner_text('#ciResult'), 'check-in with a code works')
    pg.fill('#ciKey', 'k7q2m'); pg.click('#ciSubmit')
    pg.wait_for_function('document.querySelector("#ciResult").innerText.includes("Already")')
    check(True, 'second check-in the same day says already checked in')
    pg.fill('#ciKey', 'ZZZZZ'); pg.click('#ciSubmit')
    pg.wait_for_function('document.querySelector("#ciResult").innerText.includes("couldn")')
    pg.click('[data-walkin]')
    check('Walk-in' in pg.inner_text('#regLead'), 'walk-in registration opens with today\'s training')
    pg.fill('#firstName', 'Noel'); pg.fill('#lastName', 'Galang'); pg.fill('#agency', 'Malaya City Fire Station'); pg.fill('#email', 'noel.walkin@example.com')
    pg.click('label[for="gadYes"]'); pg.click('label[for="sex-Male"]'); pg.click('label[for="age_range-2559"]'); pg.click('label[for="pwd-No"]'); pg.click('label[for="indigenous_people-No"]')
    pg.click('label[for="photo_consent-Yes"]'); pg.click('label[for="recording_consent-Yes"]'); pg.click('label[for="impact_consent-Yes"]')
    pg.click('#regSubmit')
    pg.wait_for_selector('#regDone:not([hidden])')
    check(pg.inner_text('#doneTitle') == "You're registered and checked in", 'walk-in is registered and checked in at once')
    check(pg.is_hidden('#doneCheckIn'), 'no extra check-in button after a walk-in')

    pg.click('#regDone [data-home]')
    go(pg, 'evaluation')
    pg.select_option('#evTraining', 'ICS-4')
    pg.fill('#evKey', 'K7Q2M')
    for k in ('overall', 'objectives_met', 'resource_persons', 'venue_logistics'):
        pg.click('label[for="rate-%s-4"]' % k)
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
    for view in ('register', 'attendance', 'evaluation'):
        pg.click('#view-%s [data-home] >> nth=0' % view) if pg.is_visible('#view-%s' % view) else None
    pg.click('[data-home]:visible') if pg.locator('[data-home]:visible').count() else None
    for view in ('register', 'attendance', 'evaluation', 'request'):
        go(pg, view)
        no_overflow(pg, view + ' (phone)')
        pg.click('#view-%s [data-home] >> nth=0' % view)
    check(not errors or all('fonts.g' in e for e in errors), 'no script errors on the phone: %s' % errors[:3])
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

    # ---------------- deployed look: real logos and names ----------------
    ctx, pg, errors = open_page(browser, 390, 844, brand=BRAND, dsf=2)
    check(pg.locator('#logos img').count() == 3, 'deployed look: three logos')
    pg.screenshot(path=str(OUT / '09-branded-phone-home.png'))
    ctx.close()
    ctx, pg, errors = open_page(browser, 1360, 900, brand=BRAND, dsf=2)
    pg.screenshot(path=str(OUT / '10-branded-desktop-home.png'))
    ctx.close()
    ctx, pg, errors = open_page(browser, 390, 844, dark=True, brand=BRAND, dsf=2)
    pg.screenshot(path=str(OUT / '11-branded-phone-dark.png'))
    ctx.close()

    ctx, pg, errors = open_page(browser, 1360, 900, brand=BRAND)
    pg.click('#openReport')
    pg.wait_for_selector('#paperStack .paper')
    pg.screenshot(path=str(OUT / '12-branded-report.png'))
    pg.select_option('#rpTraining', 'ICS-3')
    pg.wait_for_function('document.querySelector("#rpList").value === "any" && document.querySelector("#paperStack .p-av") && document.querySelector("#paperStack .p-av").textContent.includes("Batch 3")')
    for section, name in (('sheet', 'attendance-sheet'), ('certs', 'certificates'), ('profile', 'participant-profile'), ('media', 'photo-recording'),
                          ('impact', 'impact-interviews'), ('requests', 'training-requests')):
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
