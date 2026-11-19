#!/usr/bin/env python3
"""Pre-record New Zealand English audio (edge-tts neural voices) for every unit.

Practitioner lines and all teaching phrases: en-NZ-MitchellNeural (M).
Client lines: en-NZ-MollyNeural (F).
Run with the patched edge-tts copy:
  PATH="$HOME/Developer/twrses-twhist-tools/tts/bin:$PATH" python3 tools/gen_audio.py
Existing files are kept. Output: audio/<hash>.mp3 and audio/index.json ("M|normtext" -> file).
"""
import time, glob, hashlib, json, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "audio")
VOICES = {"M": "en-NZ-MitchellNeural", "F": "en-NZ-MollyNeural"}
norm = lambda t: re.sub(r"[^a-z0-9]", "", t.lower())

items = {}
def add(text, v="M"):
    items[f"{v}|{norm(text)}"] = (text, v)

for f in sorted(glob.glob(os.path.join(ROOT, "content", "unit*.json"))):
    u = json.load(open(f, encoding="utf-8"))
    for d in u["dialogue"]:
        add(d["en"], "F" if d["who"] == "C" else "M")
    for p in u["phrases"]:
        add(p["better"])
    for c in u["concepts"]:
        add(c["kiwi"])
    for k in u["kiwi"]:
        for s in k["say"]:
            add(s)
    for s in u["shadow"]:
        add(s)
    add(u["writing"]["model"])

os.makedirs(OUT, exist_ok=True)
index = {}
for key, (text, v) in items.items():
    name = hashlib.sha1(key.encode()).hexdigest()[:12] + ".mp3"
    path = os.path.join(OUT, name)
    if not os.path.exists(path):
        for attempt in range(4):
            r = subprocess.run(["edge-tts", "--voice", VOICES[v], "--rate=-5%", "--text", text, "--write-media", path], capture_output=True)
            if r.returncode == 0 and os.path.getsize(path) > 1000:
                break
            time.sleep(3)
        else:
            raise SystemExit("failed: " + text + "\n" + r.stderr.decode()[-400:])
        print("rec", v, text[:60])
    index[key] = name
json.dump(index, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, indent=0, sort_keys=True)
print(len(index), "clips")
