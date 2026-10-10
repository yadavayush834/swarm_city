"""Uninformed + informed search: BFS, DFS, UCS, Greedy, A*, IDA*."""
from collections import deque
import heapq

def bfs(grid, start, goal):
    from sim.city import neighbors
    q = deque([(start, [start])])
    seen = {start}
    while q:
        (x, y), path = q.popleft()
        if (x, y) == goal:
            return path
        for nb, _ in neighbors(grid, x, y):
            if nb not in seen:
                seen.add(nb)
                q.append((nb, path + [nb]))
    return []

def dfs(grid, start, goal):
    from sim.city import neighbors
    st = [(start, [start])]
    seen = set()
    while st:
        (x, y), path = st.pop()
        if (x, y) == goal:
            return path
        if (x, y) in seen:
            continue
        seen.add((x, y))
        for nb, _ in neighbors(grid, x, y):
            st.append((nb, path + [nb]))
    return []

def _best_first(grid, start, goal, g_weight=1.0, h_weight=1.0):
    from sim.city import neighbors
    h = lambda a, b: abs(a[0]-b[0]) + abs(a[1]-b[1])
    pq = [(h(start, goal)*h_weight, 0, start, [start])]
    best = {start: 0}
    while pq:
        _, g, node, path = heapq.heappop(pq)
        if node == goal:
            return path, g
        x, y = node
        for nb, cost in neighbors(grid, x, y):
            ng = g + cost*g_weight
            if nb not in best or ng < best[nb]:
                best[nb] = ng
                heapq.heappush(pq, (ng + h(nb, goal)*h_weight, ng, nb, path+[nb]))
    return [], float('inf')

def ucs(grid, s, g):
    return _best_first(grid, s, g, 1.0, 0.0)

def greedy(grid, s, g):
    return _best_first(grid, s, g, 0.0, 1.0)

def astar(grid, s, g):
    return _best_first(grid, s, g, 1.0, 1.0)

def ida_star(grid, start, goal):
    from sim.city import neighbors
    h = lambda n: abs(n[0]-goal[0]) + abs(n[1]-goal[1])
    bound = h(start)
    path = [start]
    while True:
        t, found = _ida_dfs(grid, path, 0, bound, goal, h, neighbors)
        if found:
            return list(path)
        if t == float('inf'):
            return []
        bound = t

def _ida_dfs(grid, path, g, bound, goal, h, neigh):
    node = path[-1]
    f = g + h(node)
    if f > bound:
        return f, False
    if node == goal:
        return g, True
    mn = float('inf')
    x, y = node
    for nb, cost in neigh(grid, x, y):
        if nb in path:
            continue
        path.append(nb)
        t, found = _ida_dfs(grid, path, g+cost, bound, goal, h, neigh)
        if found:
            return t, True
        mn = min(mn, t)
        path.pop()
    return mn, False
