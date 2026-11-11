# Swarm City

An interactive drone rescue simulator with a self-contained 3D city and a redesigned operations workspace. The interface, city renderer and mission engine were rebuilt around daytime architectural models, readable telemetry and working controls.

## Run locally

Python 3 and a modern browser with WebGL are all you need. No package install, CDN, API keys or separate backend process is required.

```sh
python run.py
```

Open **http://127.0.0.1:8087**. Use `python run.py --port 9000` for a different port. The server binds only to localhost.

## The workspace

- A detailed orthographic city with modeled buildings, rooftop equipment, parks, street trees, road markings, a river and bridges.
- Four identifiable quadcopters, survivor markers, hazards and four rescue stations.
- Three reproducible scenarios: Riverside, Downtown and Parkland. Reset keeps the seed; the seed button generates another city.
- Start, pause and resume a mission; adjust simulation speed from 1× to 8×.
- Choose A*, breadth-first, uniform-cost or greedy routing. Routes use a connected street graph with additional costs near hazards.
- Select drones in the scene or fleet list to inspect assignments, battery, distance and rescues.
- Switch between orbit and tactical cameras; zoom, fit the city, and toggle buildings or flight paths.
- Rain reduces flight speed and adds a visual weather effect.
- Live rescue progress, fleet states and timestamped mission activity.
- Compare the four algorithms on the same start/destination pair, and export the current mission as JSON.
- Responsive layouts and keyboard shortcuts: Space to start/pause, R to reset, F to fit, T for tactical view, ? for help.

The mission runs in the browser and pauses simulation time when its tab is hidden. All counters come from that local mission. This is a synthetic teaching simulation, not operational emergency-response software. Drones follow modeled streets for routing comparison; the rendered flight height is illustrative. Battery discharge and station charging are simplified. Hazards remain fixed for a mission.

## Verification

```sh
node --test tests/engine.test.mjs
```

The tests check deterministic generation, survivor reachability, full completion with every routing algorithm, pause/reset behavior, weather speed, and optimal weighted route costs. Node is needed only for these tests.

## Files

- `frontend/index.html`, `workspace.css`, `workspace.js`: operations interface.
- `frontend/city-view.js`: Three.js city, camera controls and picking.
- `frontend/engine.mjs`: deterministic maps, search algorithms and mission state.
- `frontend/vendor/`: locally vendored Three.js 0.160.0 and OrbitControls, with the upstream MIT license.
- `run.py`: local static server.
- `ai/`, `sim/`, `main.py`: the original Python AI examples, retained for study. Run `python main.py` to execute them.
- `bridge/`, `frontend/2d.html`, `frontend/realmap.html`: original demonstrations. Their setup is in [LEGACY.md](LEGACY.md); they are separate from the rebuilt workspace.
