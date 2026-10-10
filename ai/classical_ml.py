"""Classical ML from scratch (stdlib only): regression, kNN, tree, forest,
perceptron/SVM, k-means, DBSCAN, hierarchical, PCA-2D, GMM-EM-1D."""
import random, math

def linreg_gd(X, y, lr=0.05, epochs=200):
    w, b = 0.0, 0.0
    for _ in range(epochs):
        for xi, yi in zip(X, y):
            err = (w*xi+b)-yi
            w -= lr*err*xi/len(X)
            b -= lr*err/len(X)
    return w, b

def sigmoid(z): return 1/(1+math.exp(-max(-30, min(30, z))))

def logreg_gd(X, y, lr=0.5, epochs=200):
    w, b = 0.0, 0.0
    for _ in range(epochs):
        for xi, yi in zip(X, y):
            p = sigmoid(w*xi+b)
            w -= lr*(p-yi)*xi/len(X)
            b -= lr*(p-yi)/len(X)
    return w, b

def knn(X, y, q, k=3):
    d = sorted(zip(X, y), key=lambda t: abs(t[0]-q))
    votes = [lab for _, lab in d[:k]]
    return max(set(votes), key=votes.count)

def stump(X, y):
    # 1-level decision tree on 1D
    best = (1e9, 0, 0, 1)
    for t in sorted(set(X)):
        l = [b for a, b in zip(X, y) if a <= t]
        r = [b for a, b in zip(X, y) if a > t]
        def gini(v):
            return 1-sum((v.count(c)/max(1,len(v)))**2 for c in set(v)) if v else 0
        score = (len(l)*gini(l)+len(r)*gini(r))/max(1,len(X))
        if score < best[0]:
            maj = lambda v: max(set(v), key=v.count) if v else 0
            best = (score, t, maj(l), maj(r))
    return best[1:]

def random_forest(X, y, trees=5, seed=0):
    random.seed(seed)
    out = []
    for _ in range(trees):
        idx = [random.randrange(len(X)) for _ in range(len(X))]
        out.append(stump([X[i] for i in idx], [y[i] for i in idx]))
    def pred(q):
        vs = [r if q > t else l for t, l, r in out]
        return max(set(vs), key=vs.count)
    return pred

def perceptron(X, y, epochs=50):
    # y in {0,1} -> {-1,+1}; linear SVM-ish
    w, b = 0.0, 0.0
    Y = [1 if v else -1 for v in y]
    for _ in range(epochs):
        for xi, yi in zip(X, Y):
            if yi*(w*xi+b) <= 0:
                w += yi*xi*0.1
                b += yi*0.1
    return w, b

def kmeans(X, k=2, iters=20, seed=0):
    random.seed(seed)
    cents = random.sample(X, k)
    for _ in range(iters):
        cl = [[c] for c in cents]
        groups = [[] for _ in range(k)]
        for x in X:
            j = min(range(k), key=lambda j: abs(x-cents[j]))
            groups[j].append(x)
        cents = [sum(g)/len(g) if g else cents[j] for j, g in enumerate(groups)]
    return cents

def dbscan(X, eps=0.5, min_pts=2):
    labels, cid = [-1]*len(X), 0
    for i, x in enumerate(X):
        if labels[i] != -1:
            continue
        nb = [j for j, v in enumerate(X) if abs(v-x) <= eps]
        if len(nb) < min_pts:
            labels[i] = -2  # noise
        else:
            cid += 1
            for j in nb:
                if labels[j] in (-1, -2):
                    labels[j] = cid
    return labels

def hierarchical(X):
    # single-linkage merge order, returns merges
    clusters = [{x} for x in X]
    merges = []
    while len(clusters) > 1:
        bi, bj, bd = 0, 1, 1e9
        for i in range(len(clusters)):
            for j in range(i+1, len(clusters)):
                d = min(abs(a-b) for a in clusters[i] for b in clusters[j])
                if d < bd:
                    bi, bj, bd = i, j, d
        merges.append(bd)
        clusters[bi] |= clusters[bj]
        del clusters[bj]
    return merges

def pca_2d(D):
    # D: list of (x,y); return variance ratio of PC1 via power iteration
    mx = sum(a for a, _ in D)/len(D)
    my = sum(b for _, b in D)/len(D)
    C = [[0.0, 0.0], [0.0, 0.0]]
    for a, b in D:
        dx, dy = a-mx, b-my
        C[0][0] += dx*dx; C[0][1] += dx*dy; C[1][0] += dx*dy; C[1][1] += dy*dy
    v = [1.0, 0.0]
    for _ in range(30):
        nv = [C[0][0]*v[0]+C[0][1]*v[1], C[1][0]*v[0]+C[1][1]*v[1]]
        n = math.hypot(*nv) or 1
        v = [x/n for x in nv]
    lam = v[0]*(C[0][0]*v[0]+C[0][1]*v[1]) + v[1]*(C[1][0]*v[0]+C[1][1]*v[1])
    tot = C[0][0]+C[1][1] or 1
    return round(lam/tot, 3)

def gmm_em_1d(X, iters=20):
    m1, m2, p = min(X), max(X), 0.5
    for _ in range(iters):
        r = [p*math.exp(-(x-m1)**2/2)/(p*math.exp(-(x-m1)**2/2)+(1-p)*math.exp(-(x-m2)**2/2)+1e-9) for x in X]
        p = sum(r)/len(r)
        m1 = sum(a*b for a, b in zip(r, X))/max(1e-9, sum(r))
        m2 = sum((1-a)*b for a, b in zip(r, X))/max(1e-9, sum(1-a for a in r))
    return round(m1, 3), round(m2, 3)
