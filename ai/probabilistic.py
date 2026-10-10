"""Probabilistic AI: Naive Bayes, Bayes Net, HMM, Kalman1D, Particle Filter, MCMC."""
import random, math

def naive_bayes_train(rows):
    # rows: [([f1,f2], label)] binary features
    classes = {}
    for feats, lab in rows:
        classes.setdefault(lab, []).append(feats)
    priors = {c: len(v)/len(rows) for c, v in classes.items()}
    like = {}
    for c, v in classes.items():
        like[c] = [sum(f[i] for f in v)/len(v) for i in range(len(v[0]))]
    return priors, like

def naive_bayes_predict(priors, like, feats):
    best, bc = -1e9, None
    for c, p in priors.items():
        s = math.log(p + 1e-9)
        for i, f in enumerate(feats):
            q = min(0.99, max(0.01, like[c][i]))
            s += math.log(q if f else 1-q)
        if s > best:
            best, bc = s, c
    return bc

def bayes_net_infer():
    # P(Collapse|Shake, Old): tiny enumeration. Returns P(Collapse=1|Shake=1)
    # P(S)=0.3, P(O)=0.4, P(C|S,O) table
    table = {(0,0):0.05,(0,1):0.2,(1,0):0.5,(1,1):0.9}
    p = 0.0
    for o in (0,1):
        po = 0.4 if o else 0.6
        p += table[(1,o)]*po
    return round(p, 3)

def hmm_forward(obs, trans, emit, start):
    # 2 hidden states, obs binary
    alpha = [start[s]*emit[s][obs[0]] for s in range(2)]
    for o in obs[1:]:
        alpha = [emit[s][o]*sum(alpha[p]*trans[p][s] for p in range(2)) for s in range(2)]
    return sum(alpha)

class Kalman1D:
    def __init__(self, x=0.0, p=1.0, q=0.01, r=0.5):
        self.x, self.p, self.q, self.r = x, p, q, r
    def update(self, z):
        self.p += self.q
        k = self.p/(self.p+self.r)
        self.x += k*(z-self.x)
        self.p *= (1-k)
        return self.x

def particle_filter(true_path, n=50, seed=0):
    random.seed(seed)
    parts = [0.0]*n
    est = []
    for z in true_path:
        parts = [p + random.gauss(0, 0.5) for p in parts]
        w = [math.exp(-((p-z)**2)/2) for p in parts]
        s = sum(w)
        w = [x/s for x in w]
        # resample
        idx = random.choices(range(n), weights=w, k=n)
        parts = [parts[i] for i in idx]
        est.append(sum(parts)/n)
    return est

def mcmc_coin(flips, iters=2000, seed=0):
    random.seed(seed)
    heads = sum(flips)
    n = len(flips)
    theta, out = 0.5, []
    for _ in range(iters):
        prop = min(0.99, max(0.01, theta + random.gauss(0, 0.05)))
        def logp(t):
            return heads*math.log(t) + (n-heads)*math.log(1-t)
        if math.log(random.random()+1e-12) < logp(prop)-logp(theta):
            theta = prop
        out.append(theta)
    return sum(out[-500:])/500
