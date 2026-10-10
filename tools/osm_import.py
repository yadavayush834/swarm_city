"""Import real streets from OpenStreetMap into a swarm_city grid map.

Uses Overpass API (bboxes of ways with geometry) + Nominatim (place search).
Standard library only.

Examples:
    python3 tools/osm_import.py --place "Connaught Place, New Delhi" --n 40 --out frontend/maps/cp.json
    python3 tools/osm_import.py --bbox "28.625,77.210,28.640,77.225" --n 40 --out frontend/maps/cp.json

Output legend (frontend-compatible): 0 road, 1 building, 2 rubble, 3 fire,
4 victim, 5 shelter, 6 park. Hazards/shelters are scattered by the frontend.
"""
import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request

UA = 'swarm_city/1.0 (educational simulator; contact: local)'
OVERPASS = 'https://overpass-api.de/api/interpreter'
ROAD, BLDG, RUBBLE, FIRE, VICTIM, SHELTER, PARK = 0, 1, 2, 3, 4, 5, 6


def get(url, params=None, timeout=60):
    q = ('?' + urllib.parse.urlencode(params)) if params else ''
    req = urllib.request.Request(url + q, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def post_overpass(query, timeout=120, server=None):
    data = urllib.parse.urlencode({'data': query}).encode()
    req = urllib.request.Request(server or OVERPASS, data=data,
                                 headers={'User-Agent': UA, 'Accept': 'application/json',
                                          'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def geocode(place):
    d = get('https://nominatim.openstreetmap.org/search',
            {'q': place, 'format': 'json', 'limit': 1})
    if not d:
        raise SystemExit(f'place not found: {place}')
    b = d[0]['boundingbox']  # [s, n, w, e] as strings
    return float(b[0]), float(b[2]), float(b[1]), float(b[3]), d[0].get('display_name', place)


def fetch_tile(s2, w2, n2, e2, minors, pause, server, retries, depth=0, maxdepth=2):
    hwy = 'way["highway"]' if minors else 'way["highway"!~"footway|path|cycleway|steps|track"]'
    q = (f'[out:json][timeout:120];('
         f'{hwy}({s2},{w2},{n2},{e2});'
         f'way["leisure"="park"]({s2},{w2},{n2},{e2});'
         f'way["landuse"~"park|forest|grass|meadow"]({s2},{w2},{n2},{e2});'
         f');out geom;')
    for attempt in range(1, retries + 1):
        try:
            return post_overpass(q, timeout=180, server=server).get('elements', [])
        except Exception as ex:
            wait = 30 if '429' in str(ex) else 20
            print(f'tile failed ({ex}) — waiting {wait}s', flush=True)
            time.sleep(wait)
    if depth >= maxdepth:
        raise SystemExit('tile failed after retries + subdivision — try smaller bbox')
    print(f'subdividing heavy tile (depth {depth + 1}) …', flush=True)
    out = []
    for i in (0, 1):
        for j in (0, 1):
            out += fetch_tile(s2 + (n2 - s2) * i / 2, w2 + (e2 - w2) * j / 2,
                              s2 + (n2 - s2) * (i + 1) / 2, w2 + (e2 - w2) * (j + 1) / 2,
                              minors, pause, server, retries, depth + 1, maxdepth)
            time.sleep(pause)
    return out


def fetch_ways(bbox, tiles=1, retries=3, server=None, minors=True, pause=2):
    # NOTE: buildings are NOT fetched — the base grid is already buildings;
    # only streets (carved) and parks matter. This keeps queries light.
    s, w, n, e = bbox
    merged = {}
    total = tiles * tiles
    for i in range(tiles):
        for j in range(tiles):
            s2 = s + (n - s) * i / tiles
            n2 = s + (n - s) * (i + 1) / tiles
            w2 = w + (e - w) * j / tiles
            e2 = w + (e - w) * (j + 1) / tiles
            print(f'querying Overpass tile {i * tiles + j + 1}/{total} …', flush=True)
            for el in fetch_tile(s2, w2, n2, e2, minors, pause, server, retries):
                merged[(el.get('type'), el.get('id'))] = el
            time.sleep(pause)  # courtesy rate
    return {'elements': list(merged.values())}


def rasterize(elements, bbox, n):
    s, w, north, e = bbox
    grid = [[BLDG for _ in range(n)] for _ in range(n)]

    def to_cell(lat, lon):
        r = int((north - lat) / max(1e-12, north - s) * n)
        c = int((lon - w) / max(1e-12, e - w) * n)
        return min(n - 1, max(0, r)), min(n - 1, max(0, c))

    def paint_road(r, c, width):
        for dr in range(-width, width + 1):
            for dc in range(-width, width + 1):
                if 0 <= r + dr < n and 0 <= c + dc < n:
                    grid[r + dr][c + dc] = ROAD

    def pipoly(lat, lon, ring):
        inside = False
        m = len(ring)
        for i in range(m):
            a, b = ring[i], ring[(i + 1) % m]
            if ((a[0] > lat) != (b[0] > lat)):
                x = a[1] + (lat - a[0]) / (b[0] - a[0]) * (b[1] - a[1])
                if lon < x:
                    inside = not inside
        return inside

    highways, buildings, parks = [], [], []
    for el in elements:
        if el.get('type') != 'way' or 'geometry' not in el:
            continue
        tags = el.get('tags', {})
        pts = [(p['lat'], p['lon']) for p in el['geometry']]
        if 'highway' in tags:
            highways.append((tags['highway'], pts))
        elif 'building' in tags:
            buildings.append(pts)
        else:
            parks.append(pts)

    WIDE = {'motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link'}
    # 1. buildings (fill bbox of each polygon)
    for pts in buildings:
        lats = [p[0] for p in pts]
        lons = [p[1] for p in pts]
        r0, c0 = to_cell(max(lats), min(lons))
        r1, c1 = to_cell(min(lats), max(lons))
        for r in range(min(r0, r1), max(r0, r1) + 1):
            for c in range(min(c0, c1), max(c0, c1) + 1):
                lat = north - (r + 0.5) / n * (north - s)
                lon = w + (c + 0.5) / n * (e - w)
                if pipoly(lat, lon, pts):
                    grid[r][c] = BLDG
    # 2. parks (win over buildings, not over roads)
    for pts in parks:
        lats = [p[0] for p in pts]
        lons = [p[1] for p in pts]
        r0, c0 = to_cell(max(lats), min(lons))
        r1, c1 = to_cell(min(lats), max(lons))
        for r in range(min(r0, r1), max(r0, r1) + 1):
            for c in range(min(c0, c1), max(c0, c1) + 1):
                lat = north - (r + 0.5) / n * (north - s)
                lon = w + (c + 0.5) / n * (e - w)
                if pipoly(lat, lon, pts) and grid[r][c] != ROAD:
                    grid[r][c] = PARK
    # 3. roads last (streets always win)
    for cls, pts in highways:
        width = 1 if cls in WIDE else 0
        for (la1, lo1), (la2, lo2) in zip(pts, pts[1:]):
            seg_len = math.hypot(la2 - la1, lo2 - lo1)
            steps = max(1, int(seg_len / min(north - s, e - w) * n * 2))
            for k in range(steps + 1):
                lat = la1 + (la2 - la1) * k / steps
                lon = lo1 + (lo2 - lo1) * k / steps
                r, c = to_cell(lat, lon)
                paint_road(r, c, width)
    return grid, len(highways), len(buildings), len(parks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--place', default=None)
    ap.add_argument('--bbox', default=None, help='"south,west,north,east"')
    ap.add_argument('--n', type=int, default=40)
    ap.add_argument('--tiles', type=int, default=1, help='split bbox into TxT queries')
    ap.add_argument('--server', default=None, help='Overpass mirror, e.g. https://overpass.kumi.systems/api/interpreter')
    ap.add_argument('--no-minor', action='store_true', help='skip footways/paths (lighter queries)')
    ap.add_argument('--pause', type=float, default=2, help='seconds between tiles')
    ap.add_argument('--out', default='frontend/maps/map.json')
    args = ap.parse_args()
    if args.bbox:
        s, w, n, e = (float(x) for x in args.bbox.split(','))
        bbox, place = (s, w, n, e), args.bbox
    elif args.place:
        time.sleep(1)  # Nominatim courtesy rate
        bbox = geocode(args.place)
        s, w, n, e, place = bbox[0], bbox[1], bbox[2], bbox[3], bbox[4]
        bbox = (s, w, n, e)
    else:
        raise SystemExit('give --place or --bbox')
    print(f'area: {place}\nbbox: {bbox}', flush=True)
    data = fetch_ways(bbox, tiles=args.tiles, server=args.server,
                      minors=not args.no_minor, pause=args.pause)
    elements = data.get('elements', [])
    print(f'got {len(elements)} ways', flush=True)
    grid, nh, nb, np = rasterize(elements, bbox, args.n)
    roads = sum(v == ROAD for row in grid for v in row)
    print(f'highways={nh} buildings={nb} parks={np} road_cells={roads}/{args.n*args.n}', flush=True)
    out = {'n': args.n, 'grid': grid,
           'legend': {'0': 'road', '1': 'building', '2': 'rubble', '3': 'fire',
                      '4': 'victim', '5': 'shelter', '6': 'park'},
           'meta': {'place': place, 'bbox': list(bbox),
                    'highways': nh, 'buildings': nb, 'parks': np}}
    with open(args.out, 'w') as f:
        json.dump(out, f)
    print(f'wrote {args.out}', flush=True)


if __name__ == '__main__':
    main()
