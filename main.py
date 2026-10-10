"""OMNIMIND Rescue Swarm - end-to-end CPU-lite demo using EVERY AI family."""
from sim.city import generate_city, render
from ai import search, adversarial, csp_logic, probabilistic as prob
from ai import classical_ml as ml, neural, rl, evolutionary as evo, nlp

def main():
    print("=== 1. SIM ===")
    grid = generate_city()
    print(render(grid))
    start, goal = (0, 0), (7, 7)

    print("\n=== 2. SEARCH (BFS/DFS/UCS/Greedy/A*/IDA*) ===")
    print("BFS len:", len(search.bfs(grid, start, goal)))
    print("DFS len:", len(search.dfs(grid, start, goal)))
    print("UCS:", search.ucs(grid, start, goal)[1])
    print("Greedy len:", len(search.greedy(grid, start, goal)[0]))
    path, cost = search.astar(grid, start, goal)
    print(f"A* cost={cost} len={len(path)}")
    print("IDA* len:", len(search.ida_star(grid, start, goal)))
    print(render(grid, path))

    print("\n=== 3. ADVERSARIAL (Minimax/AlphaBeta/Expectimax/MCTS) ===")
    print("Minimax:", adversarial.minimax((0, 2), 4, True))
    print("AlphaBeta:", adversarial.alpha_beta((0, 2), 4, -1e9, 1e9, True))
    print("Expectimax:", round(adversarial.expectimax(0, 2, 4, True), 2))
    print("MCTS best move:", adversarial.mcts(0))

    print("\n=== 4. CSP + LOGIC + FUZZY ===")
    print("Backtracking assign:", csp_logic.backtracking())
    print("AC-3 domains:", csp_logic.ac3())
    print("Min-conflicts:", csp_logic.min_conflicts())
    print("Forward-chain:", csp_logic.forward_chain(["severe_bleed"]))
    print("Fuzzy speed (wind=8,smoke=2):", round(csp_logic.fuzzy_speed(8, 2), 2))

    print("\n=== 5. PROBABILISTIC ===")
    rows = [([1, 0], 1), ([1, 1], 1), ([0, 0], 0), ([0, 1], 0)]
    pr, lk = prob.naive_bayes_train(rows)
    print("NaiveBayes:", prob.naive_bayes_predict(pr, lk, [1, 0]))
    print("BayesNet P(Collapse|Shake):", prob.bayes_net_infer())
    print("HMM likelihood:", round(prob.hmm_forward([0, 1, 0], [[.7, .3], [.4, .6]], [[.9, .1], [.2, .8]], [.5, .5]), 4))
    kf = prob.Kalman1D()
    print("Kalman:", [round(kf.update(z), 2) for z in [1.0, 1.2, 0.9]])
    print("ParticleFilter tail:", [round(x, 2) for x in prob.particle_filter([0, 1, 2, 3])[-2:]])
    print("MCMC coin bias:", round(prob.mcmc_coin([1, 1, 0, 1, 1, 0, 1]), 3))

    print("\n=== 6. CLASSICAL ML ===")
    X = [0., 1, 2, 3, 4, 5]
    y = [0, 0, 0, 1, 1, 1]
    print("LinReg:", [round(v, 3) for v in ml.linreg_gd(X, [0, 1, 2, 3, 4, 5])])
    print("LogReg w,b:", [round(v, 3) for v in ml.logreg_gd(X, y)])
    print("kNN(2.6):", ml.knn(X, y, 2.6))
    print("Stump:", ml.stump(X, y))
    print("Forest(2.6):", ml.random_forest(X, y)(2.6))
    print("Perceptron/SVM:", [round(v, 3) for v in ml.perceptron(X, y)])
    print("KMeans:", [round(v, 2) for v in ml.kmeans([0, .1, 5, 5.2, 9])])
    print("DBSCAN:", ml.dbscan([0, .1, 5, 5.2, 9]))
    print("Hierarchical merges:", [round(v, 2) for v in ml.hierarchical([0, 1, 5])])
    print("PCA var-ratio:", ml.pca_2d([(0, 0), (1, 1), (2, 2), (0, 1)]))
    print("GMM means:", ml.gmm_em_1d([0, .2, -.1, 5, 5.1, 4.9]))

    print("\n=== 7. NEURAL (MLP/CNN/RNN/LSTM/Attention/AE/GAN/Diffusion) ===")
    m = neural.MLP().train([([0, 0], 0), ([0, 1], 1), ([1, 0], 1), ([1, 1], 0)], epochs=300)
    print("MLP XOR(0,1):", round(m.fwd([0, 1]), 3))
    img = [[1, 2, 3, 0], [0, 1, 2, 1], [1, 0, 1, 2], [2, 1, 0, 1]]
    kern = [[1, 0], [0, -1]]
    f = neural.conv2d(img, kern)
    print("CNN+Pool:", neural.maxpool2d(f))
    print("RNN:", round(neural.rnn_forward([0.5, -0.2, 0.8]), 3))
    h, c = neural.lstm_step(0.5, 0.1, 0.0)
    print("LSTM h,c:", round(h, 3), round(c, 3))
    print("Attention:", [round(x, 3) for x in neural.self_attention([1.0, 0.0], [1.0, 0.0], [5.0, 1.0])])
    print("Autoencoder err:", round(neural.autoencoder_step(0.8)[0], 4))
    print("GAN losses:", neural.gan_step())
    print("Diffusion alphas:", neural.diffusion_schedule(5))

    print("\n=== 8. RL (DP/MC/SARSA/Q/DQN/REINFORCE/AC/PPO) ===")
    print("ValueIter:", rl.value_iteration())
    print("Q-learn:", rl.q_learning(episodes=200))
    print("SARSA:", rl.sarsa(episodes=200))
    print("MC:", rl.monte_carlo(episodes=200))
    print("DQN-toy:", rl.dqn_toy())
    print("REINFORCE theta:", rl.reinforce(episodes=150))
    print("ActorCritic V:", rl.actor_critic(episodes=150))
    print("PPO-clip:", rl.ppo_clip())

    print("\n=== 9. EVOLUTIONARY (GA/PSO/ACO/SA) ===")
    print("GA:", evo.genetic())
    print("PSO:", evo.pso())
    print("ACO:", evo.ant_colony())
    print("SA:", evo.simulated_annealing())

    print("\n=== 10. NLP (TF-IDF/W2V/Sentiment/Transformer) ===")
    print("TF-IDF doc0 top:", sorted(nlp.tfidf()[0].items(), key=lambda kv: -kv[1])[:3])
    print("W2V sim:", nlp.word2vec_toy())
    print("Sentiment:", nlp.sentiment("fire spreading need rescue urgent"))
    print("Attention-NLP:", nlp.attention_demo())
    print("\nALL AI FAMILIES EXECUTED OK.")

if __name__ == "__main__":
    main()
