# Clinic Kōrero

Clinic English for a Chinese medicine practitioner (acupuncture, injuries, some herbs) working in Aotearoa New Zealand.
All learner-facing English uses **New Zealand spelling and expressions**.

Live: https://lukelin7429.github.io/tcm-english-nz/

- Phone-first PWA, no accounts. Progress (lesson position, review cards, minutes per day, writing drafts) is stored on the phone in `localStorage`; Settings has backup/restore.
- Opens straight back to the exact line where the learner stopped.
- Spaced repetition: simplified SM-2 (Again / Good / Easy). Misses in the quick check go straight into today's review; "Again" brings a card back in the same session; cards missed 3+ times are flagged Tricky.
- Each unit (one day, about an hour): Overview → Dialogue → Say it better → Key concepts (4 layers: 中文 / standard term / say it to a Kiwi / avoid) → Kiwi corner → Speak (listen, record, compare) → Write → Quick check.

## Editing content

1. Edit `content/unitNN.json` (add new files to `UNIT_FILES` in `js/app.js` and to `CORE` in `sw.js`).
2. Record audio (en-NZ Mitchell for the practitioner and teaching phrases, Molly for the client):
   `PATH="$HOME/Developer/twrses-twhist-tools/tts/bin:$PATH" python3 tools/gen_audio.py`
3. Bump `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js`, then push to `main` (GitHub Pages deploys it).

Do not change card ids (`u01c1`, `u01p1`, `u01d4` …) or the storage key `ck-state-v1`, or learners lose their review history.
