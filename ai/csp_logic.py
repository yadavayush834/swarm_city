"""CSP + Logic + Fuzzy: Backtracking, AC-3, Min-Conflicts, Forward chaining, Fuzzy."""
import random

# CSP: assign 4 robots to 4 victims, no two same victim (all-different).
def backtracking(n=4):
    sol = [-1]*n
    def ok(r, v):
        return v not in sol[:r]
    def bt(r):
        if r == n:
            return True
        for v in range(n):
            if ok(r, v):
                sol[r] = v
                if bt(r+1):
                    return True
                sol[r] = -1
        return False
    bt(0)
    return sol

def ac3(n=4):
    # domains with one blocked pair (robot0 != victim0)
    domains = [set(range(n)) for _ in range(n)]
    domains[0].discard(0)
    # enforce all-different via simple arc consistency
    changed = True
    while changed:
        changed = False
        for i in range(n):
            if len(domains[i]) == 1:
                v = next(iter(domains[i]))
                for j in range(n):
                    if j != i and v in domains[j]:
                        domains[j].remove(v)
                        changed = True
    return [sorted(d) for d in domains]

def min_conflicts(n=4, steps=50, seed=0):
    random.seed(seed)
    assign = [random.randrange(n) for _ in range(n)]
    for _ in range(steps):
        conflicts = [i for i in range(n) if assign.count(assign[i]) > 1]
        if not conflicts:
            return assign
        i = random.choice(conflicts)
        assign[i] = min(range(n), key=lambda v: sum(1 for j in range(n) if j != i and assign[j] == v))
    return assign

# Expert system: forward chaining triage rules.
RULES = [
    ({"severe_bleed"}, "priority_P1"),
    ({"burn", "smoke"}, "priority_P1"),
    ({"fracture"}, "priority_P2"),
    ({"priority_P2", "far_from_shelter"}, "needs_drone"),
]

def forward_chain(facts):
    facts = set(facts)
    fired = True
    while fired:
        fired = False
        for cond, out in RULES:
            if cond <= facts and out not in facts:
                facts.add(out)
                fired = True
    return sorted(facts)

# Fuzzy logic: drone speed from wind (0..10) and smoke (0..10).
def fuzzy_speed(wind, smoke):
    def low(x): return max(0, 1 - x/5)
    def high(x): return max(0, (x-5)/5)
    # rules: if wind high OR smoke high -> slow; else fast
    slow = max(high(wind), high(smoke))
    fast = min(low(wind), low(smoke))
    # defuzzify: slow=2 m/s, fast=8 m/s
    return (slow*2 + fast*8) / max(1e-9, slow + fast)
