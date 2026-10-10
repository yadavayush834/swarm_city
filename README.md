# OMNIMIND Rescue Swarm

Simulated disaster city where a drone/ground swarm rescues victims.
Uses EVERY major AI family in one runnable repo, stdlib-only so it runs on your laptop with no GPU.

## Run backend (all 40+ algorithms)
```
python3 main.py
```

## Run frontend (3D night city, default)
```
cd frontend && python3 -m http.server 8000
# open http://localhost:8000
```
- Three.js 3D dusk city: lit buildings, flickering fires + smoke, tents + beacon shelters, quadcopter drones with spinning rotors
- Drag to orbit, scroll to zoom, Orbit/Top view buttons, shadows toggle
- Switch BFS/A*/UCS/Greedy, speed slider, path overlay, AI feed
- `2d.html` keeps the lightweight canvas version
- `?run=1` autostarts, `?fast=1` disables shadows (weak GPUs)
- `python3 tools/export_city.py` dumps backend map to `frontend/city.json`

## Where each algorithm lives
- `sim/city.py` — grid world, rendering
- `ai/search.py` — BFS, DFS, UCS, Greedy, A*, IDA*
- `ai/adversarial.py` — Minimax, Alpha-Beta, Expectimax, MCTS
- `ai/csp_logic.py` — Backtracking, AC-3, Min-Conflicts, Forward-chaining expert system, Fuzzy logic
- `ai/probabilistic.py` — Naive Bayes, Bayes Net, HMM, Kalman, Particle Filter, MCMC
- `ai/classical_ml.py` — LinReg, LogReg, kNN, Decision Tree, Random Forest, Perceptron/SVM, k-Means, DBSCAN, Hierarchical, PCA, GMM/EM
- `ai/neural.py` — MLP, CNN, RNN, LSTM, Self-Attention/Transformer, Autoencoder, GAN, Diffusion
- `ai/rl.py` — Value Iteration, Monte Carlo, SARSA, Q-Learning, DQN-toy, REINFORCE, Actor-Critic, PPO-clip
- `ai/evolutionary.py` — Genetic Algorithm, PSO, Ant Colony, Simulated Annealing
- `ai/nlp.py` — TF-IDF, Word2Vec, Sentiment, Attention
- `main.py` — one rescue episode calling all of the above

## Notes for your laptop
- No numpy/torch required. All from scratch, <2s runtime.
- To scale: install `requirements.txt` extras and swap toy nets for sklearn/torch on Colab.
