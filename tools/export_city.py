"""Export Python sim city to frontend/city.json so UI and backend share maps."""
import json, sys
sys.path.insert(0, '.')
from sim.city import generate_city
from ai.search import astar

grid = generate_city(n=8, seed=1)
path, cost = astar(grid, (0, 0), (7, 7))
out = {"n": 8, "grid": grid, "path": path, "cost": cost,
       "legend": {0: "free", 1: "rubble", 2: "fire", 3: "victim", 4: "shelter"}}
with open("frontend/city.json", "w") as f:
    json.dump(out, f)
print(f"wrote frontend/city.json cost={cost} len={len(path)}")
