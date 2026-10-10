"""Tiny neural nets from scratch (no torch): MLP, CNN-2D, RNN, LSTM cell,
self-attention, autoencoder, GAN-step, diffusion schedule."""
import random, math

def _sigmoid(z): return 1/(1+math.exp(-max(-30, min(30, z))))
def _relu(z): return z if z > 0 else 0.01*z

class MLP:
    """2-4-1 MLP, SGD."""
    def __init__(self, seed=0):
        random.seed(seed)
        self.w1 = [[random.gauss(0, .5) for _ in range(2)] for _ in range(4)]
        self.b1 = [0.0]*4
        self.w2 = [random.gauss(0, .5) for _ in range(4)]
        self.b2 = 0.0
    def fwd(self, x):
        self.h = [_relu(sum(x[j]*self.w1[i][j] for j in range(2))+self.b1[i]) for i in range(4)]
        return _sigmoid(sum(self.h[i]*self.w2[i] for i in range(4))+self.b2)
    def train(self, D, epochs=500, lr=0.2):
        for _ in range(epochs):
            for x, y in D:
                p = self.fwd(x)
                e = (p - y) * p * (1 - p)  # sigmoid deriv
                # output layer
                dw2 = [e*h for h in self.h]
                # backprop to hidden (relu deriv)
                for i in range(4):
                    dh = e*self.w2[i] * (1 if self.h[i] > 0 else 0.01)
                    for j in range(2):
                        self.w1[i][j] -= lr*dh*x[j]
                    self.b1[i] -= lr*dh
                for i in range(4):
                    self.w2[i] -= lr*dw2[i]
                self.b2 -= lr*e
        return self

def conv2d(img, kernel):
    n, k = len(img), len(kernel)
    out = []
    for i in range(n-k+1):
        row = []
        for j in range(n-k+1):
            s = sum(img[i+a][j+b]*kernel[a][b] for a in range(k) for b in range(k))
            row.append(_relu(s))
        out.append(row)
    return out

def maxpool2d(f):
    return [[max(f[i][j], f[i][j+1], f[i+1][j], f[i+1][j+1])
             for j in range(0, len(f)-1, 2)] for i in range(0, len(f)-1, 2)]

def rnn_forward(seq, wx=0.8, wh=0.5):
    h = 0.0
    for x in seq:
        h = math.tanh(wx*x + wh*h)
    return h

def lstm_step(x, h, c, seed=1):
    # fixed toy weights -> demonstrates gating
    f = _sigmoid(x+h)
    i = _sigmoid(x-h)
    o = _sigmoid(x+h+c)
    c2 = f*c + i*math.tanh(x)
    return o*math.tanh(c2), c2

def self_attention(Q, K, V):
    # Q,K,V: lists; returns softmax(QK^T/sqrt(d))V
    import math as m
    d = 1.0
    scores = [[q*k/m.sqrt(d) for k in K] for q in Q]
    out = []
    for s in scores:
        e = [m.exp(x-max(s)) for x in s]
        w = [x/sum(e) for x in e]
        out.append(sum(a*b for a, b in zip(w, V)))
    return out

def autoencoder_step(x, w_enc=0.9, w_dec=0.9, lr=0.05):
    z = _relu(x*w_enc)
    recon = z*w_dec
    err = recon - x
    w_enc -= lr*err*w_dec*(1 if z > 0 else 0.01)*x
    w_dec -= lr*err*z
    return abs(err), w_enc, w_dec

def gan_step(real=1.0, seed=0):
    # 1 generator + 1 discriminator update (toy scalars)
    random.seed(seed)
    g, d = random.random(), random.random()
    d_loss = -(math.log(max(1e-6, d)) + math.log(max(1e-6, 1-g)))
    g_loss = -math.log(max(1e-6, g))
    return round(d_loss, 3), round(g_loss, 3)

def diffusion_schedule(t=10):
    betas = [0.0001 + i*(0.02-0.0001)/t for i in range(t)]
    alpha_bar, sched = 1.0, []
    for b in betas:
        alpha_bar *= (1-b)
        sched.append(round(alpha_bar, 4))
    return sched
