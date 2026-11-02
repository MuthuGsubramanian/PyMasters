# Content defects for sub-project E (found 2026-11-03 by the scenario harness)

Source of truth: `ops/e2e/solutions/generate.py` → `ops/e2e/out/unsolved.json`. Every fix must re-verify
through `ops/e2e/solutions/verify.py` (production grading rules, inside the test container) and add the
solution to `ops/e2e/solutions/`; the nightly suite fails for any lesson without one.

Status after the overhaul: **481 of 521** reachable practice challenges have a verified solution; **40** do not.

## 1. Challenges that need libraries the sandbox cannot provide (22)

PyTorch cannot import under the sandbox's 512 MB cap; the LLM SDKs need network and keys. Rewrite each
challenge to teach the same idea with numpy or pure Python (a mock client for the API lessons), keeping
the narrative. Listed by track:

- **ai_engineering** — `all_minilm_l6_v2_rag_pipeline` (sentence_transformers), `all_minilm_l6_v2` (sentence_transformers)
- **ai_fundamentals** — `anthropic_api_basics` (anthropic), `openai_api_basics` (openai), `vector_databases` (chromadb)
- **deep_learning** — `pt_tensors` (torch), `pt_training` (torch)
- **deep_learning_complete** — `dl_activation_functions` (torch), `dl_autoencoders` (torch), `dl_backpropagation` (torch), `dl_cnn_architectures` (torch), `dl_gan_basics` (torch), `dl_gan_image_generation` (torch), `dl_gradient_descent` (torch), `dl_loss_functions` (torch), `dl_lstm_gru` (torch), `dl_multilayer_network` (torch), `dl_perceptron` (torch), `dl_pytorch_training` (torch), `dl_regularization` (torch), `dl_rnn_intro` (torch), `dl_rnn_text_generation` (torch)

## 2. Challenges a correct program cannot pass (18)

Mostly machine-learning lessons graded by an exact stdout match on numbers (R², F1, cluster sizes,
importances) that depend on random data and library versions. Fix: grade with a `test_code` harness that
checks properties (shape, ranges, model fitted), or seed and regenerate the expected output from the
reference solution under the production image.

| Track | Lesson | Harness? | Last result |
|---|---|---|---|
| ai_fundamentals | `prompt_engineering_advanced` | no | Messages: [{'role': 'system', 'content': 'You are a friendly Python tutor.\nRules:\n1. Explain every |
| ai_ml_foundations | `sklearn_evaluation` | yes | no output |
| deep_learning | `cnn_pooling` | yes | AssertionError: Bottom-left window max is 5 |
| deep_learning | `nn_layers` | yes | AssertionError: MNIST MLP params |
| machine_learning | `clustering_kmeans` | no | Cluster sizes: [100 100 100 100] |
| machine_learning | `decision_trees` | no | /   /   /   /--- class: 0 |
| machine_learning | `dimensionality_reduction` | no | Components for 99% variance: 3 |
| machine_learning | `hyperparameter_tuning` | no | no output |
| machine_learning | `knn` | no | no output |
| machine_learning | `linear_regression` | no | R² Score: 0.9961 |
| machine_learning | `logistic_regression` | no | weighted avg       0.90      0.88      0.88        40 |
| machine_learning | `ml_project_end_to_end` | no | no output |
| machine_learning | `model_evaluation` | no | F1:        0.267 |
| machine_learning | `pandas_foundations` | no | 0   Alice          85             78    163 |
| machine_learning | `random_forests` | no | worst perimeter: 0.1271 |
| machine_learning | `svm` | no | RBF: 1.000 |
| machine_learning | `train_test_split` | no | CV Mean: 0.888 |
| python_modern | `python314_tstrings` | yes | SyntaxError: invalid syntax |

## 3. Unreachable second challenges (149 lessons)

These lessons ship `practice_challenges[1]`, but the Classroom UI and `/api/classroom/evaluate` only use
`[0]`. Either surface them (UI + grader by index) or fold the best one into `[0]`.

## 4. Other content

- `backend/podcasts/manifest.json` is `{}`: no podcast episode has ever been published (production too).
- The "What's New" dialog every new user sees is v2.0.0 dated 2026-06-09.
- `python314_tstrings` teaches Python 3.14 t-strings; the sandbox's Python cannot parse them.
