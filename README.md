# SANAY — training registration, attendance and evaluation

*TagapagTaguyod ng Kasanayan tungo sa Katatagan*
**TaTaK Resilience Project**
**SANAY**
*Skills And Needs Assessment and Training Interventions towards enhanced DRRM CapacitY*

A web app for the UP Resilience Institute's trainings. The home screen shows the two names stacked at the center, each with its meaning, then five buttons:

| Button | When | What it does |
|---|---|---|
| **Register** | Before the training | The GAD attendance sheet as a form. The Data Privacy Statement is shown word for word. The GAD questions (sex, age range, senior citizen, PWD, indigenous people and tribe) appear only if the person consents. It also asks whether they may be photographed and recorded, and whether staff may contact them later for an impact-monitoring interview. The time of submission stands in for the signature. |
| **Attendance** | Each training day | Check in with the registration code or email, once per day. A **Walk-in registration** button is there for anyone who didn't register; they fill in the same form and are checked in at once. |
| **Evaluation** | During and up to 14 days after | Ratings and comments, saved without the person's name. |
| **Request a training** | Any time | Offices tell you the topics they need, the number of participants and their preferred dates, mode and venue. |
| **Training partnership** | Any time | Organizations offer to co-organize, send trainers, host, fund, send participants or develop materials. Over time the Partnerships tab becomes your list of potential training partners. |

Organizers also get a **report page**, opened from the Google Sheet:

- **Attendance sheet** in the GAD template layout, on 13 × 8.5 in long bond paper (landscape), for each training day, all days, or the registration list. Spare numbered rows on the last page let walk-ins sign by hand.
- **Certificates**: who is eligible, meaning they checked in and answered the evaluation. Anyone who isn't eligible is **highlighted** with the reason (for example "attended 2 of 3 days, no evaluation") so you can check. You can filter to eligible only or to-check only, and copy the eligible names, offices and emails for a mail merge.
- **Participant profile**: counts by sex, age range, senior citizen, PWD and indigenous peoples (with tribes), and the offices represented. Aggregated only, as the privacy statement promises.
- **Photo and recording**: who said no, for the documentation team.
- **Impact interviews**: who agreed to a follow-up interview, with their contact details.
- **Training requests**: the most requested topics, preferred months and modes, then the full list of requests.
- **Partnership requests**: counts by kind of partnership and type of organization, then the full list.

Print or save any of them as a PDF from the browser.

The Google Sheet is the database. Google Apps Script serves the page and writes the rows. Nothing else to host or pay for.

## What's in this repository

```
apps-script/      the three files to paste into Apps Script (Code.gs, Logos.gs, Index.html) and the manifest
src/app.html      the page source; opened outside Apps Script it runs as a preview with sample data
assets/logos/     UP, UPRI and NOAH logos, cropped from the GAD attendance template
tools/build.py    builds apps-script/Index.html and apps-script/Logos.gs from src/ and assets/
tests/            back-end tests against a mock Sheet, and browser checks
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
5. **Try it.** Open the link on your phone. Register for SAMPLE-1, check in, evaluate, send a request. Then delete the SAMPLE rows from the Trainings tab.

After you change any file: **Deploy › Manage deployments › pencil › Version: New version › Deploy**. The link stays the same. If you already ran `setup` with an older version, run it again: it adds the new columns and tabs without touching your data.

## Running a training

1. **Add a row to the Trainings tab**: a short `training_id` (e.g. `ICS-5`, never change it once people register), title, dates, venue, mode, `max_participants` if there's a cap, and `registration_closes` if registration should close early. Tick `show_in_list` when it's ready to announce.
2. **Share the link.** Add these to the end of the web app link to skip the home screen:
   - `?page=register&t=ICS-5` for the invitation
   - `?page=attendance&t=ICS-5` for the QR code at the venue
   - `?page=evaluation&t=ICS-5` for the closing session
   - `?page=request` for offices that want to ask for a training
   - `?page=partner` for organizations that want to partner with you
3. **Watch the counts.** The `registered`, `female` and `male` columns of the Trainings tab update themselves.
4. **Print the report.** In the Sheet, click the training's row, then **SANAY › Open the report page**. The link works for 6 hours. Choose the part and the list (a day, all days, or registered). Then **Print or save as PDF**. In the print dialog, keep the paper at 13 × 8.5 in, landscape, with background graphics on.
5. **Certificates.** After the last day, open **Certificates**. Check the highlighted people (for example, someone who forgot to check in one morning), then use **Copy eligible names** for your certificate mail merge.

The dropdown follows the dates: open trainings can be chosen; full, closed and finished ones show greyed out; finished ones from past years drop off. On training days, walk-ins can still register even if registration closed or the training is full. The people at the door decide who gets in.

**Requests** land in the Requests tab. Update its `status` column as you go: New, Contacted, Scheduled, Done or Declined. **Partnership requests** land in the Partnerships tab, with the statuses New, Contacted, In talks, Partner or Declined.

## Settings

All in `Code.gs`, at the top (`CONFIG`):

- `name` and `expansion`. In the expansion, the letters that spell the name are highlighted, in order and with their case: S-A-N-A-Y. The same goes for `projectMark` in `projectExpansion`: Ta-Ta-K in *TagapagTaguyod ng Kasanayan tungo sa Katatagan*.
- `project`, `projectMark`, `projectExpansion`: the TaTaK Resilience Project line above the name.
- `institution`, `address`, `contactNo`, `email`: the header and footer of the printed pages.
- `privacyStatement`: word for word from the template. If you change it, change `privacyVersion` too. Each registration records the version the person saw.
- `mediaStatement` and `impactStatement`: the photo, recording and follow-up interview consent. **This wording is a draft. Have the Data Protection Officer review it.**
- `requestTopics`: the topics people can tick when they request a training or propose a partnership. `requestPrivacy`: the note above the consent box.
- `partnershipTypes`, `organizationTypes`, `partnershipPrivacy`: the choices and the consent note on the partnership form.
- `certificateRule`: `'all-days'` (checked in on every training day) or `'any-day'` (at least one day). Both also need the evaluation.

Logos: replace the files in `assets/logos/` (keep `logos.json` in step) and run `python3 tools/build.py`, or edit `Logos.gs` directly. An entry's `src` can also be an image link.

## Privacy, in short

- Only people with access to the Sheet see personal data. The web app reads and writes the Sheet as the deployer, so keep the Sheet private and share it only with organizers.
- The GAD columns stay blank when a person doesn't consent; they are still registered, as the template's note allows.
- Evaluations have no name or code, and new rows go in at random positions so the order doesn't reveal who answered.
- The impact-interview list shows only people who said yes. Saying yes doesn't oblige anyone to take part later.
- The report page needs a fresh link from the Sheet menu, valid for at most 6 hours, because the web app itself is open to anyone.
- Never commit exported data or a filled-in attendance sheet to this repository. **The repository is public.**

## Open questions

- **Age ranges** are copied from the template: 0–9, 10–19, 15–24, 25–59, 60+. The 10–19 and 15–24 ranges overlap, so a 17-year-old can pick either. Splitting them into 10–14, 15–19 and 20–24 would still add up to both template groups exactly.
- **Signatures:** the submission time stands in for the signature. If COA or Finance need wet signatures, for example for meals, print the attendance sheet and have people sign beside the time.
- **Certificates for multi-day trainings** currently need every day. Switch `certificateRule` to `'any-day'` if a certificate of attendance should go to anyone who came.
- **Pre-test and post-test** come next.

## Develop

Edit `src/app.html`, then rebuild and test:

```bash
python3 tools/build.py            # writes apps-script/Index.html and apps-script/Logos.gs
node tests/test_code.js           # back end against a mock Sheet
python3 tests/ui_check.py out/    # browser checks, screenshots and sample PDFs (needs Playwright)
```

Open `src/app.html` in a browser to use the preview with sample data, the Google Sheet panel and the organizer report.
