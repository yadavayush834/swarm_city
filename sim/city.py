"""Tiny disaster city grid sim. 0=free, 1=rubble, 2=fire, 3=victim, 4=shelter."""
import random

FREE, RUBBLE, FIRE, VICTIM, SHELTER = 0, 1, 2, 3, 4

def generate_city(n=8, n_victims=4, n_fires=4, n_rubble=8, seed=0):
    random.seed(seed)
    grid = [[FREE for _ in range(n)] for _ in range(n)]
    grid[0][0] = SHELTER
    grid[n-1][n-1] = SHELTER
    def place(v, k):
        c = 0
        while c < k:
            x, y = random.randrange(n), random.randrange(n)
            if grid[x][y] == FREE:
                grid[x][y] = v
                c += 1
    place(VICTIM, n_victims)
    place(FIRE, n_fires)
    place(RUBBLE, n_rubble)
    return grid

def neighbors(grid, x, y):
    n = len(grid)
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx, ny = x+dx, y+dy
        if 0 <= nx < n and 0 <= ny < n and grid[nx][ny] != RUBBLE:
            cost = 5 if grid[nx][ny] == FIRE else 1
            yield (nx, ny), cost

def render(grid, path=None):
    sym = {0:'.', 1:'#', 2:'F', 3:'V', 4:'S'}
    pset = set(path or [])
    out = []
    for i, row in enumerate(grid):
        line = ''
        for j, v in enumerate(row):
            line += '*' if (i,j) in pset and v == FREE else sym[v]
        out.append(line)
    return '\n'.join(out)
