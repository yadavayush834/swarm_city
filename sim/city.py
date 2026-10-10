"""Disaster city grid sim. Unified legend (backend == frontend == maps):
0=road, 1=building, 2=rubble, 3=fire, 4=victim, 5=shelter, 6=park."""
import random

ROAD, BLDG, RUBBLE, FIRE, VICTIM, SHELTER, PARK = 0, 1, 2, 3, 4, 5, 6
BLOCKED = (BLDG, RUBBLE)

def generate_city(n=8, n_victims=4, n_fires=4, n_rubble=8, n_parks=0,
                  districts=False, seed=0):
    random.seed(seed)
    if districts or n >= 15:
        grid = [[BLDG for _ in range(n)] for _ in range(n)]
        for i in range(n):
            for j in range(n):
                if i % 5 == 0 or j % 5 == 0:
                    grid[i][j] = ROAD
                elif random.random() < 0.08:
                    grid[i][j] = PARK
        base_ok = (BLDG, ROAD)
    else:
        grid = [[ROAD for _ in range(n)] for _ in range(n)]
        base_ok = (ROAD,)
    grid[0][0] = SHELTER
    grid[n-1][n-1] = SHELTER
    if n >= 15:
        grid[0][n-1] = SHELTER
    def place(v, k):
        c, guard = 0, 0
        while c < k and guard < n * n * 20:
            guard += 1
            x, y = random.randrange(n), random.randrange(n)
            if grid[x][y] in base_ok:
                grid[x][y] = v
                c += 1
    place(VICTIM, n_victims)
    place(FIRE, n_fires)
    place(RUBBLE, n_rubble)
    if n_parks and not (districts or n >= 15):
        place(PARK, n_parks)
    return grid

def passable(grid, x, y):
    n = len(grid)
    return 0 <= x < n and 0 <= y < n and grid[x][y] not in BLOCKED

def neighbors(grid, x, y):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if passable(grid, nx, ny):
            cost = 5 if grid[nx][ny] == FIRE else 1
            yield (nx, ny), cost

def cells_of(grid, value):
    return [(i, j) for i, row in enumerate(grid) for j, v in enumerate(row) if v == value]

def render(grid, path=None):
    sym = {0: '.', 1: 'H', 2: '#', 3: 'F', 4: 'V', 5: 'S', 6: 'P'}
    pset = set(path or [])
    out = []
    for i, row in enumerate(grid):
        line = ''
        for j, v in enumerate(row):
            line += '*' if (i, j) in pset and v == ROAD else sym[v]
        out.append(line)
    return '\n'.join(out)
