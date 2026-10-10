"""Bio-inspired optimization: GA, PSO, ACO, Simulated Annealing.
Task: minimize rescue tour length over 5 points on line."""
import random, math

POINTS = [0, 2, 5, 7, 10]

def tour_len(order):
    return sum(abs(POINTS[order[i]]-POINTS[order[i-1]]) for i in range(len(order)))

def genetic(n=5, pop_size=20, gens=40, seed=0):
    random.seed(seed)
    pop = [random.sample(range(n), n) for _ in range(pop_size)]
    for _ in range(gens):
        pop = sorted(pop, key=tour_len)[:pop_size//2]
        kids = []
        while len(pop)+len(kids) < pop_size:
            a, b = random.sample(pop, 2)
            cut = random.randrange(n)
            child = a[:cut] + [x for x in b if x not in a[:cut]]
            if random.random() < 0.2:
                i, j = random.sample(range(n), 2)
                child[i], child[j] = child[j], child[i]
            kids.append(child)
        pop += kids
    return min(pop, key=tour_len), tour_len(min(pop, key=tour_len))

def pso(steps=60, seed=0):
    random.seed(seed)
    # 1D: find staging point minimizing sum |x-p|
    parts = [(random.uniform(0, 10), random.uniform(-1, 1)) for _ in range(10)]
    pb = [(x, abs(sum(abs(x-p) for p in POINTS))) for x, _ in parts]
    gb = min(pb, key=lambda t: t[1])
    for _ in range(steps):
        for i, (x, v) in enumerate(parts):
            v = 0.7*v + 1.4*random.random()*(pb[i][0]-x) + 1.4*random.random()*(gb[0]-x)
            x = max(0, min(10, x+v))
            parts[i] = (x, v)
            c = abs(sum(abs(x-p) for p in POINTS))
            if c < pb[i][1]:
                pb[i] = (x, c)
                if c < gb[1]:
                    gb = (x, c)
    return round(gb[0], 2), round(gb[1], 2)

def ant_colony(n=5, iters=30, seed=0):
    random.seed(seed)
    pher = [[1.0]*n for _ in range(n)]
    best, bl = None, 1e9
    for _ in range(iters):
        for _ in range(10):
            cur, unvis, tour = 0, set(range(1, n)), [0]
            while unvis:
                ws = [(c, pher[cur][c]) for c in unvis]
                s = sum(w for _, w in ws)
                r, acc = random.random()*s, 0
                for c, w in ws:
                    acc += w
                    if r <= acc:
                        tour.append(c); unvis.remove(c); cur = c
                        break
            L = tour_len(tour)
            if L < bl:
                best, bl = tour, L
            for i in range(len(tour)):
                a, b = tour[i], tour[(i+1) % len(tour)]
                pher[a][b] += 1.0/max(1, L)
        pher = [[p*0.9 for p in row] for row in pher]
    return best, bl

def simulated_annealing(seed=0):
    random.seed(seed)
    cur = random.sample(range(5), 5)
    cl = tour_len(cur)
    T = 10.0
    best, bl = cur[:], cl
    for _ in range(500):
        i, j = random.sample(range(5), 2)
        nxt = cur[:]
        nxt[i], nxt[j] = nxt[j], nxt[i]
        nl = tour_len(nxt)
        if nl < cl or random.random() < math.exp((cl-nl)/max(1e-9, T)):
            cur, cl = nxt, nl
            if cl < bl:
                best, bl = cur[:], cl
        T *= 0.99
    return best, bl
