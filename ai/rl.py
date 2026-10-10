"""RL on 4-state line world 0..3 (goal=3): DP, MC, SARSA, Q-learning,
DQN-toy, REINFORCE, Actor-Critic, PPO-clip."""
import random

NSTATES, ACTIONS = 4, (-1, 1)

def step(s, a):
    ns = min(3, max(0, s+a))
    return ns, (10 if ns == 3 else -1)

def value_iteration(gamma=0.9, iters=50):
    V = [0.0]*NSTATES
    for _ in range(iters):
        for s in range(NSTATES):
            V[s] = max(r + gamma*V[ns] for a in ACTIONS for ns, r in [step(s, a)])
    return [round(v, 2) for v in V]

def q_learning(episodes=300, seed=0):
    random.seed(seed)
    Q = [[0.0, 0.0] for _ in range(NSTATES)]
    for _ in range(episodes):
        s = 0
        while s != 3:
            ai = 0 if random.random() < 0.15 else max(range(2), key=lambda i: Q[s][i])
            ns, r = step(s, ACTIONS[ai])
            Q[s][ai] += 0.2*(r + 0.9*max(Q[ns]) - Q[s][ai])
            s = ns
    return [[round(v, 2) for v in row] for row in Q]

def sarsa(episodes=300, seed=1):
    random.seed(seed)
    Q = [[0.0, 0.0] for _ in range(NSTATES)]
    for _ in range(episodes):
        s = 0
        ai = random.randrange(2)
        while s != 3:
            ns, r = step(s, ACTIONS[ai])
            naj = 0 if random.random() < 0.15 else max(range(2), key=lambda i: Q[ns][i])
            Q[s][ai] += 0.2*(r + 0.9*Q[ns][naj] - Q[s][ai])
            s, ai = ns, naj
    return [[round(v, 2) for v in row] for row in Q]

def monte_carlo(episodes=300, seed=2):
    random.seed(seed)
    Q = [[0.0, 0.0] for _ in range(NSTATES)]
    N = [[0, 0] for _ in range(NSTATES)]
    for _ in range(episodes):
        traj, s = [], 0
        while s != 3:
            ai = random.randrange(2) if random.random() < 0.2 else max(range(2), key=lambda i: Q[s][i])
            ns, r = step(s, ACTIONS[ai])
            traj.append((s, ai, r))
            s = ns
        G = 0
        for s, ai, r in reversed(traj):
            G = r + 0.9*G
            N[s][ai] += 1
            Q[s][ai] += (G - Q[s][ai])/N[s][ai]
    return [[round(v, 2) for v in row] for row in Q]

def dqn_toy():
    # DQN = Q-learning + target net copy every K; simulate with 2 tables
    Q, Qt = [[0.0, 0.0] for _ in range(NSTATES)], [[0.0, 0.0] for _ in range(NSTATES)]
    random.seed(3)
    for ep in range(200):
        s = 0
        while s != 3:
            ai = max(range(2), key=lambda i: Q[s][i])
            ns, r = step(s, ACTIONS[ai])
            Q[s][ai] += 0.2*(r + 0.9*max(Qt[ns]) - Q[s][ai])
            s = ns
        if ep % 20 == 0:
            Qt = [row[:] for row in Q]
    return [[round(v, 2) for v in row] for row in Q]

def reinforce(episodes=200, seed=4):
    import math
    random.seed(seed)
    theta = [0.0]*NSTATES  # preference for +1
    for _ in range(episodes):
        traj, s = [], 0
        while s != 3:
            p = 1/(1+math.exp(-theta[s]))
            ai = 1 if random.random() < p else 0
            ns, r = step(s, ACTIONS[ai])
            traj.append((s, ai))
            s = ns
        G = len(traj)  # reached goal -> reward by speed
        for s, ai in traj:
            p = 1/(1+math.exp(-theta[s]))
            theta[s] += 0.05*G*((1-p) if ai == 1 else -p)
    return [round(t, 2) for t in theta]

def actor_critic(episodes=200, seed=5):
    import math
    random.seed(seed)
    V = [0.0]*NSTATES
    th = [0.0]*NSTATES
    for _ in range(episodes):
        s = 0
        while s != 3:
            p = 1/(1+math.exp(-th[s]))
            ai = 1 if random.random() < p else 0
            ns, r = step(s, ACTIONS[ai])
            td = r + 0.9*V[ns] - V[s]
            V[s] += 0.1*td
            th[s] += 0.05*td*((1-p) if ai == 1 else -p)
            s = ns
    return [round(v, 2) for v in V]

def ppo_clip(oldp=0.5, newp=0.7, adv=1.0, eps=0.2):
    ratio = newp/max(1e-9, oldp)
    return round(min(ratio*adv, max(1-eps, min(1+eps, ratio))*adv), 3)
