"""Adversarial search: Minimax, Alpha-Beta, Expectimax, MCTS (tiny)."""
import random, math

# Game: rescue agent (MAX) vs fire spread (MIN/CHANCE) on a 1D line 0..4.
def minimax(state, depth, maximizing):
    # state = (agent_pos, fire_pos); reward = -distance to victim at 4 + fire penalty
    a, f = state
    if depth == 0 or a == 4:
        return (4 - a) * -1 - (abs(a - f) == 0) * 5, None
    moves = [-1, 0, 1]
    if maximizing:
        best, ba = -1e9, 0
        for m in moves:
            na = min(4, max(0, a + m))
            v, _ = minimax((na, f), depth-1, False)
            if v > best:
                best, ba = v, m
        return best, ba
    else:
        best = 1e9
        for m in moves:
            nf = min(4, max(0, f + m))
            v, _ = minimax((a, nf), depth-1, True)
            best = min(best, v)
        return best, None

def alpha_beta(state, depth, alpha, beta, maximizing):
    a, f = state
    if depth == 0 or a == 4:
        return (4 - a) * -1, None
    moves = [-1, 0, 1]
    if maximizing:
        ba = 0
        for m in moves:
            na = min(4, max(0, a + m))
            v, _ = alpha_beta((na, f), depth-1, alpha, beta, False)
            if v > alpha:
                alpha, ba = v, m
            if alpha >= beta:
                break
        return alpha, ba
    else:
        for m in moves:
            nf = min(4, max(0, f + m))
            v, _ = alpha_beta((a, nf), depth-1, alpha, beta, True)
            beta = min(beta, v)
            if beta <= alpha:
                break
        return beta, None

def expectimax(a, f, depth, agent_turn):
    if depth == 0 or a == 4:
        return -(4 - a)
    if agent_turn:
        return max(expectimax(min(4, max(0, a+m)), f, depth-1, False) for m in (-1, 0, 1))
    else:
        # chance node: fire moves uniformly
        return sum(expectimax(a, min(4, max(0, f+m)), depth-1, True) for m in (-1, 0, 1)) / 3

def mcts(root, iters=200, seed=0):
    random.seed(seed)
    wins = {}
    plays = {}
    for _ in range(iters):
        m = random.choice((-1, 0, 1))
        # rollout: random walk 6 steps, reward if reach 4
        a = min(4, max(0, root + m))
        for _ in range(6):
            a = min(4, max(0, a + random.choice((-1, 0, 1))))
        r = 1 if a == 4 else 0
        wins[m] = wins.get(m, 0) + r
        plays[m] = plays.get(m, 0) + 1
    # UCB1 pick
    total = sum(plays.values())
    def ucb(m):
        return wins[m]/plays[m] + math.sqrt(2*math.log(total)/plays[m])
    return max(plays, key=ucb)
