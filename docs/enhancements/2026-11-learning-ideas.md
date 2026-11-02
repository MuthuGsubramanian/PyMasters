# Learning-experience ideas (2026-11-02)

Constraints: no paid services (owner ceiling ₹5,000/month, aim ₹0), 1 GB VM, LLM calls rate-limited.
Ranked by learning impact ÷ cost. ✅ = shipped.

| # | Idea | Why it teaches | Cost |
|---|---|---|---|
| 1 ✅ | **Time-travel visualizer** in the Playground: run any code, then scrub forward/back through every executed line with live variables, call depth and output so far | Makes the invisible (state over time) visible; the #1 thing beginners can't picture. Works on *their own* code, not canned demos | Sandbox CPU only (no LLM) |
| 2 ✅ | **Friendly error explainer**: every traceback gets "what happened / why / how to fix" pinned to the line | Errors are where learning happens; turns a wall of red into a lesson | Free (rules, client-side) |
| 3 ✅ | **Predict, then run** on lesson code blocks: commit to a prediction before seeing output; track prediction accuracy | Retrieval + metacognition; forces a mental model before feedback | Free |
| 4 ✅ | **5-minute warm-up**: daily mixed recall from the review queue + streak | Spaced retrieval practice | Free |
| 5 | **Teach Vaathiyaar** (protégé effect): learner explains a concept; AI asks probing questions and flags gaps | Explaining exposes gaps | LLM (rate-limited) |
| 6 ✅ | **Misconception radar**: aggregate a learner's error types into a personal "watch out for" panel linked to lessons | Personalised remediation | Free |
| 7 ✅ | **Boss battles**: end-of-module mixed challenge with a time-travel replay of the learner's own attempts | Interleaving + consolidation | Free |
| 8 | **Code review by Vaathiyaar** on passed challenges (style, complexity, edge cases) | Beyond "it works" | LLM (rate-limited) |
| 9 ✅ | **Concept remix games**: generate new Output Oracle / Bug Hunt items from lesson code via the social-bot quality gate on the laptop | Endless fresh practice | Laptop LLM batch, not the VM |
