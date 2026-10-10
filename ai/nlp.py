"""NLP: TF-IDF, skip-gram Word2Vec toy, Bayes sentiment, attention demo."""
import math
from collections import Counter

DOCS = [
    "fire spreading need rescue team urgent",
    "victim trapped under rubble need medical",
    "road blocked send drone survey",
    "shelter open food water available",
]

def tfidf(docs=DOCS):
    df = Counter()
    toks = [[w.lower() for w in d.split()] for d in docs]
    for t in toks:
        for w in set(t):
            df[w] += 1
    out = []
    for t in toks:
        tf = Counter(t)
        out.append({w: (c/len(t))*math.log(len(docs)/df[w]) for w, c in tf.items()})
    return out

def word2vec_toy(pairs=(("rescue", "team"), ("fire", "urgent")), dim=4, steps=50, seed=0):
    import random
    random.seed(seed)
    vocab = sorted({w for p in pairs for w in p})
    E = {w: [random.gauss(0, .5) for _ in range(dim)] for w in vocab}
    for _ in range(steps):
        for a, b in pairs:
            # maximize dot(a,b): gradient step
            for i in range(dim):
                E[a][i] += 0.05*E[b][i]
                E[b][i] += 0.05*E[a][i]
    def cos(x, y):
        d = math.sqrt(sum(i*i for i in x)*sum(j*j for j in y)) or 1
        return sum(i*j for i, j in zip(x, y))/d
    return { (a, b): round(cos(E[a], E[b]), 3) for a, b in pairs }

def sentiment(text):
    pos = {"open", "available", "food", "water", "rescue"}
    neg = {"fire", "trapped", "blocked", "urgent", "rubble"}
    toks = set(text.lower().split())
    return "NEGATIVE-urgent" if len(toks & neg) > len(toks & pos) else "POSITIVE-ok"

def attention_demo():
    from ai.neural import self_attention
    return [round(x, 3) for x in self_attention([1.0, 0.5, -0.5], [1.0, 0.5, -0.5], [10.0, 2.0, 0.0])]
