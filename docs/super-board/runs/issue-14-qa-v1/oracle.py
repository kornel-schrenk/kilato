#!/usr/bin/env python3
"""QA's own oracle for AC2, written apart from the page: reads the site fixture, own haversine, own rounding."""
import json, math, pathlib, sys
root = pathlib.Path(sys.argv[1]) / "test/fixtures/site-data"
manifest = json.loads((root / "manifest.json").read_text())
LAT, LON = 47.4975, 19.0545
def hav(a, b, c, d, R=6371000.0):
    p1, p2 = math.radians(a), math.radians(c)
    h = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(math.radians(d-b)/2)**2
    return 2*R*math.asin(math.sqrt(h))
places = []
for key in manifest["cells"]:
    places += json.loads((root / f"cells/{key}.json").read_text())["places"]
ids = [p["id"] for p in places]
rows = []
for i, p in enumerate(places):
    d = hav(LAT, LON, p["lat"], p["lon"])
    if d <= 1000:
        rows.append((d, i, p))
rows.sort(key=lambda r: (r[0], r[1]))
print(f"cells in manifest: {len(manifest['cells'])} {manifest['cells']}", file=sys.stderr)
print(f"places in those cells: {len(places)}, unique ids: {len(set(ids))}, within 1000 m: {len(rows)}", file=sys.stderr)
print(f"nearest: {rows[0][2]['name']} at {rows[0][0]:.1f} m; farthest listed: {rows[-1][2]['name']} at {rows[-1][0]:.1f} m", file=sys.stderr)
out = [{"id": p["id"], "name": p["name"], "names": p.get("names", {}), "cat": p["cat"], "kind": p["kind"], "lat": p["lat"], "lon": p["lon"],
        "metres": d, "rounded": int(math.floor(d/10 + 0.5))*10} for d, _, p in rows]
json.dump(out, sys.stdout, ensure_ascii=False)
