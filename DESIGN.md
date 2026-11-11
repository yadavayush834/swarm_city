# Swarm City interface rebuild
Software: interactive rescue simulation workspace, not a marketing landing page.
Direction: warm off-white workspace, graphite typography, restrained rescue-orange actions, sage city and pale architectural models. The full interactive city is the primary visual.

## Layout
A compact application header, narrow navigation rail, mission setup at left, large 3D viewport, telemetry at right. At tablet the telemetry moves below the city; at phone all panels stack with the city first after the mission heading. Keep all controls keyboard accessible and every number sourced from the simulation.

## City
Orthographic architectural diorama. City blocks with varied stepped rooflines, modeled roof equipment, textured windows, trees and parks, marked roads, river and bridges. Four orange quadcopters, readable route lines, person markers, rescue stations, animated fire plumes. Click a drone or fleet row to inspect it. Fit the full city in the initial frame. Orbit, top view, zoom and reset camera are actual controls.

## Behavior
Seeded connected street network; survivors only on reachable streets. A*, BFS, uniform cost and greedy use actual search. Start, pause, reset, new scenario, speed, weather, path visibility, building visibility, mission progress, activity log, fleet inspection and report download. A mission ends when all victims reach a shelter. Local simulation runs without a backend or external CDN; original Python examples remain available.

Voice: short operational labels, explicit state, no decorative statistics. Motion: one workspace entrance; subtle button feedback; simulation animation only while needed; reduced motion support.
