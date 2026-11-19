# SANAY — training registration, attendance and evaluation

*TagapagTaguyod ng Kasanayan tungo sa Katatagan*
**TaTaK Resilience Project**
**SANAY**
*Skills And Needs Assessment and Training Interventions towards enhanced DRRM CapacitY*

A web app for the UP Resilience Institute's trainings. The home screen shows the two names stacked at the center, each with its meaning, then five buttons:

| Button | When | What it does |
|---|---|---|
| **Register** | Before the training | The GAD attendance sheet as a form. The Data Privacy Statement is shown word for word. The GAD questions (sex, age range, senior citizen, PWD, indigenous people and tribe) appear only if the person consents. It also asks whether they may be photographed and recorded, and whether staff may contact them later for an impact-monitoring interview. The time of submission stands in for the signature. Each person gets a **QR code** to show at the door. |
| **Attendance** | Each training day | At the door, the organizers **scan the person's QR code** (see [Check-in with QR codes](#check-in-with-qr-codes)). People can also check themselves in here with their code or email, once per day, unless you turn that off. A **Walk-in registration** button is there for anyone who didn't register. |
| **Evaluation** | During and up to 14 days after | 16 statements, each answered from 1 (strongly disagree) to 5 (strongly agree), in six parts: objectives and content, resource persons, methods and materials, venue and arrangements (these two may be answered N/A), learning and use, and overall. Then two optional questions: what they will use in their work and what to improve. Saved without the person's name. |
| **Request a training** | Any time | Offices tell you the topics they need, the number of participants and their preferred dates, mode and venue. |
| **Training partnership** | Any time | Organizations offer to co-organize, send trainers, host, fund, send participants or develop materials. Over time the Partnerships tab becomes your list of potential training partners. |

Organizers also get a **check-in scanner** for the door and a **report page**, both opened from the Google Sheet. The report page has:

- **Attendance sheet** in the GAD template layout, on 13 × 8.5 in long bond paper (landscape), for each training day, all days, or the registration list. Spare numbered rows on the last page let walk-ins sign by hand.
- **Certificates**: who is eligible, meaning they checked in and answered the evaluation. Anyone who isn't eligible is **highlighted** with the reason (for example "attended 2 of 3 days, no evaluation") so you can check. You can filter to eligible only or to-check only, and copy the eligible names, offices and emails for a mail merge.
- **Participant profile**: counts by sex, age range, senior citizen, PWD and indigenous peoples (with tribes), and the offices represented. Aggregated only, as the privacy statement promises.
- **Evaluation results**: how many of those who attended answered; for each statement a bar of how people answered from strongly disagree to strongly agree, the average out of 5 and the share who agree or strongly agree; the same for each part and overall. The written answers follow on their own pages, without names.
- **Name tags**: one per person, nine to a page, each with the person's QR code, for people without a phone or as ID for the training.
- **Photo and recording**: who said no, for the documentation team.
- **Impact interviews**: who agreed to a follow-up interview, with their contact details.
- **Training requests**: the most requested topics, preferred months and modes, then the full list of requests.
- **Partnership requests**: counts by kind of partnership and type of organization, then the full list.

Print or save any of them as a PDF from the browser.

The Google Sheet is the database. Google Apps Script serves the page and writes the rows. Nothing else to host or pay for.

The pages carry a faint half silhouette of the Oblation along the right edge, and a small **(i)** under the home buttons opens the credits.

## What's in this repository

```
apps-script/      the three files to paste into Apps Script (Code.gs, Logos.gs, Index.html) and the manifest
src/app.html      the page source; opened outside Apps Script it runs as a preview with sample data
assets/logos/     UP, UPRI and NOAH logos, cropped from the GAD attendance template
assets/figure/    the half Oblation silhouette for the right edge of the pages
tools/build.py    builds apps-script/Index.html and apps-script/Logos.gs from src/ and assets/
tests/            back-end tests against a mock Sheet, and browser checks (tests/vendor holds the QR reader they use)
```

## Set up (about 15 minutes)

1. **Make the Sheet.** In Google Drive (your UP account), create a Google Sheet, e.g. *SANAY Training Database*.
2. **Add the code.** In the Sheet: **Extensions › Apps Script**.
   - Replace the starter code in `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
   - Click **+ › Script**, name it `Logos`, paste [`apps-script/Logos.gs`](apps-script/Logos.gs).
   - Click **+ › HTML**, name it `Index` (exactly), paste [`apps-script/Index.html`](apps-script/Index.html).
   - Save.
3. **Create the tabs.** In the toolbar choose the function `setup` and click **Run**. Approve the permissions. This makes the Trainings, Registrations, Attendance, Evaluations, Requests and Partnerships tabs with three SAMPLE trainings, and a **SANAY** menu in the Sheet.
4. **Publish the web app.** **Deploy › New deployment › gear › Web app**. *Execute as:* Me. *Who has access:* Anyone. Deploy, then copy the web app link.
5. **Try it.** Open the link on your phone. Register for SAMPLE-1, then in the Sheet open **SANAY › Open the check-in scanner** and scan your QR code. Evaluate, send a request. Then delete the SAMPLE rows from the Trainings tab.
6. **Lock it down** before real people register: see [Keep the data to a few people](#keep-the-data-to-a-few-people).

After you change any file: **Deploy › Manage deployments › pencil › Version: New version › Deploy**. The link stays the same. If you already ran `setup` with an older version, run it again: it adds the new columns and tabs without touching your data. (If you tried the first version, with four ratings, its old Evaluations columns stay but are no longer used. Delete them, or delete the test Evaluations tab before you run `setup`.)

## Running a training

1. **Add a row to the Trainings tab**: a short `training_id` (e.g. `ICS-5`, never change it once people register), title, dates, venue, mode, `max_participants` if there's a cap, and `registration_closes` if registration should close early. Tick `show_in_list` when it's ready to announce.
2. **Share the link.** Add these to the end of the web app link to skip the home screen:
   - `?page=register&t=ICS-5` for the invitation
   - `?page=attendance&t=ICS-5` for self check-in and walk-ins (a poster QR code at the venue)
   - `?page=evaluation&t=ICS-5` for the closing session
   - `?page=request` for offices that want to ask for a training
   - `?page=partner` for organizations that want to partner with you
3. **Watch the counts.** The `registered`, `female` and `male` columns of the Trainings tab update themselves.
4. **On the day, check people in at the door** with the scanner. See below.
5. **Print the report.** In the Sheet, click the training's row, then **SANAY › Open the report page**. The link works for 6 hours. Choose the part and the list (a day, all days, or registered). Then **Print or save as PDF**. In the print dialog, keep the paper at 13 × 8.5 in, landscape, with background graphics on.
6. **Certificates.** After the last day, open **Certificates**. Check the highlighted people (for example, someone who forgot to check in one morning), then use **Copy eligible names** for your certificate mail merge.
7. **Evaluation results.** Once the evaluation closes (14 days after the last day), open **Evaluation results** and print or save it for your post-activity report.

The dropdown follows the dates: open trainings can be chosen; full, closed and finished ones show greyed out; finished ones from past years drop off. On training days, walk-ins can still register even if registration closed or the training is full. The people at the door decide who gets in.

## Check-in with QR codes

Every registration comes with a QR code. People see it as soon as they register (and again after they check themselves in), and can keep it with a screenshot. It holds only their registration code, never their name or email. For people without a phone, print **Name tags** from the report page: each tag carries the person's QR code.

**Set up the door** (a few minutes before people arrive):

1. In the Sheet, click the training's row in the Trainings tab, then **SANAY › Open the check-in scanner**. Click **Open the scanner**.
2. On the scanner, tap **Start the camera** and allow the camera. Point it at a QR code: the name and office appear in large text with **Checked in** and the time, or **Already checked in at 7:58**. The scan time stands in for the signature.
3. **More devices:** tap **Add a device** and scan the QR code it shows with each phone or tablet at the door. They all save to the same Sheet. If two devices scan the same person, the Sheet keeps one row, with the earlier time.
4. One device can sit at a **walk-in desk**: tap **Walk-in** for the registration form. Walk-ins are checked in when the form is submitted, and get their QR code for the next days.

On the scanner:

- **List** shows everyone registered, who is in and who isn't. Search by name or office and tap **Check in** twice for someone who lost their QR code or whose phone died.
- **Type the code** in the box under the camera if a QR code won't scan. A handheld USB or Bluetooth QR scanner works too: it types into that box.
- **Weak signal:** each scan counts on the device at once and waits there (the top shows "No signal · 3 waiting to send"). Everything goes to the Sheet by itself when the signal comes back, with the time of the scan. Walk-in forms wait the same way. Open the scanner while you have signal and keep the page open: a closed page can't reopen without signal.
- **The link** works until the end of the training's last day. It shows the names and offices of the people registered, so share it only with the door staff. If it reached the wrong person, choose **Make a new link** in the same Sheet dialog: the old link stops working, so open the new one on every device.

**Test the camera on your phones before the first training.** The camera runs inside the Google page, which most phones allow; if one won't open it, use a handheld scanner, type the codes, or use the List. Android phones read QR codes on their own; iPhones and Windows laptops load a small QR reader (jsQR) from the jsDelivr CDN the first time.

To have **only the scanner check people in**, set `selfCheckIn: false` in `Code.gs`. The Attendance screen then tells people to show their QR code at the door, and walk-ins who register on their own phones are checked in at the door too.

**Requests** land in the Requests tab. Update its `status` column as you go: New, Contacted, Scheduled, Done or Declined. **Partnership requests** land in the Partnerships tab, with the statuses New, Contacted, In talks, Partner or Declined.

## Settings

All in `Code.gs`, at the top (`CONFIG`):

- `name` and `expansion`. In the expansion, the letters that spell the name are highlighted, in order and with their case: S-A-N-A-Y. The same goes for `projectMark` in `projectExpansion`: Ta-Ta-K in *TagapagTaguyod ng Kasanayan tungo sa Katatagan*.
- `project`, `projectMark`, `projectExpansion`: the TaTaK Resilience Project line above the name. `projectAccent`: a word in the expansion shown in green, now *Katatagan*, since it means resilience.
- `institution`, `address`, `contactNo`, `email`: the header and footer of the printed pages.
- `privacyStatement`: word for word from the template. If you change it, change `privacyVersion` too. Each registration records the version the person saw.
- `mediaStatement` and `impactStatement`: the photo, recording and follow-up interview consent. **This wording is a draft. Have the Data Protection Officer review it.**
- `requestTopics`: the topics people can tick when they request a training or propose a partnership. `requestPrivacy`: the note above the consent box.
- `partnershipTypes`, `organizationTypes`, `partnershipPrivacy`: the choices and the consent note on the partnership form.
- `certificateRule`: `'all-days'` (checked in on every training day) or `'any-day'` (at least one day). Both also need the evaluation.
- `dataStewards`: the UP emails of the people, besides the Sheet's owner, who may open the report page, run `setup` and edit the data tabs. See below.
- `evaluationItems`: the evaluation statements, in parts. Each has a `key`, which is its column in the Evaluations tab, and the `text` people see. A part with `na: true` adds *Not applicable*. To change a statement's meaning, add a new one with a new key rather than editing an old key, or old answers would be counted under the new wording. Run `setup` after adding statements so their columns appear.
- `evaluationScale`: the five labels, from 1 to 5.
- `selfCheckIn`: `true` lets people check themselves in on the Attendance screen as well as at the door; `false` leaves check-in to the scanner.
- `credits`: the lines in the credits box, as `['label', 'who or what']`. Put the team's names in `Team`. The app adds the credits for the Oblation, the logos, the QR code libraries and the fonts itself.

Logos: replace the files in `assets/logos/` (keep `logos.json` in step) and run `python3 tools/build.py`, or edit `Logos.gs` directly. An entry's `src` can also be an image link.

The Oblation: `assets/figure/oblation.svg` is the half silhouette at the right edge, one path whose right edge is the statue's center line. Replace it and run `python3 tools/build.py`. To leave it out, delete `FIGURE` from `Logos.gs`. It and the logos appear only in the deployed app, not in the preview.

## Keep the data to a few people

Participants never get access to the Sheet. The web app saves their answers through the script, which runs as you, so the Sheet can stay shared with no one but the people who handle the data: the **data stewards** (for example you, the training lead and the GAD focal person). Who can open the Sheet is the real control, so it is worth five minutes:

1. **Share the Sheet only with the data stewards, by name.** In the Sheet, click **Share**. Under *General access*, keep **Restricted**: never *Anyone with the link*, and not *University of the Philippines* either.
2. **Make only data stewards editors.** Anyone who can edit the Sheet can also open **Extensions › Apps Script** and change the code. If someone else needs to read the data, make them a viewer.
3. **Tighten the sharing settings.** In the Share dialog, click the gear and untick both **Editors can change permissions and share** and **Viewers and commenters can see the option to download, print, and copy**.
4. **List the data stewards in `Code.gs`**, for example `dataStewards: ['juan.delacruz@up.edu.ph', 'second.steward@up.edu.ph']`, then run `setup` again. From then on only the owner and these people can open the report page, run `setup` and edit the five data tabs (Registrations, Attendance, Evaluations, Requests and Partnerships).
5. **Check now and then.** **SANAY › Check who can see the data** lists the owner, the editors and the viewers, and marks anyone who isn't a data steward.

Good to know:

- **Protected tabs stop edits, not reading.** Anyone who can open the Sheet can read every tab, so step 1 is what keeps the data private. Google Sheets can't share only some tabs. If someone should add trainings without seeing personal data, have a data steward add them.
- **A shared drive** keeps the data safe when people move on, because the files don't belong to one person's account. Use a shared drive that only the data stewards are members of, since every member can open its files. In a shared drive the Sheet has no owner, so list every data steward, yourself included.
- **Deploy from a data steward's account**, normally the owner's. The web app writes as whoever deployed it, and only data stewards can write to the data tabs.
- **The script can open only this Sheet** (`@OnlyCurrentDoc`), not the rest of your Drive.
- **Downloads and printouts leave these controls.** Keep printed attendance sheets in a locked cabinet and delete downloaded copies when you're done.
- **How long to keep the data** is for your Data Protection Officer to set. When the time is up, delete the old rows.

## Privacy, in short

- Only the data stewards can open the Sheet, and only they see personal data. See above.
- The GAD columns stay blank when a person doesn't consent; they are still registered, as the template's note allows.
- Evaluations have no name or code, and new rows go in at random positions so the order doesn't reveal who answered.
- The impact-interview list shows only people who said yes. Saying yes doesn't oblige anyone to take part later.
- The report page needs a fresh link from the Sheet menu, valid for at most 6 hours, because the web app itself is open to anyone.
- The scanner link shows only names, offices and codes, works only for its training until the last day, and can be replaced from the Sheet. QR codes hold only the registration code.
- Never commit exported data or a filled-in attendance sheet to this repository. **The repository is public.**

## Open questions

- **Age ranges** are copied from the template: 0–9, 10–19, 15–24, 25–59, 60+. The 10–19 and 15–24 ranges overlap, so a 17-year-old can pick either. Splitting them into 10–14, 15–19 and 20–24 would still add up to both template groups exactly.
- **Signatures:** the submission time stands in for the signature. If COA or Finance need wet signatures, for example for meals, print the attendance sheet and have people sign beside the time.
- **Certificates for multi-day trainings** currently need every day. Switch `certificateRule` to `'any-day'` if a certificate of attendance should go to anyone who came.
- **Evaluation statements:** the 16 statements are a starting set. If UPRI or UP has a standard evaluation form, put its statements in `evaluationItems`.
- **Pre-test and post-test** come next.

## Develop

Edit `src/app.html`, then rebuild and test:

```bash
python3 tools/build.py            # writes apps-script/Index.html and apps-script/Logos.gs
node tests/test_code.js           # back end against a mock Sheet
python3 tests/ui_check.py out/    # browser checks, screenshots and sample PDFs (needs Playwright); includes a scan through a fake camera
```

Open `src/app.html` in a browser to use the preview with sample data, the Google Sheet panel and the organizer report.
