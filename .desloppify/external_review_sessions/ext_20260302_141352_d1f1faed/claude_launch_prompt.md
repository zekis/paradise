# Claude Blind Reviewer Launch Prompt

You are an isolated blind reviewer. Do not use prior chat context, prior score history, or target-score anchoring.

Blind packet: /var/tmp/vibe-kanban/worktrees/0228-run-deslopify-to/paradise/.desloppify/review_packet_blind.json
Template JSON: /var/tmp/vibe-kanban/worktrees/0228-run-deslopify-to/paradise/.desloppify/external_review_sessions/ext_20260302_141352_d1f1faed/review_result.template.json
Output JSON path: /var/tmp/vibe-kanban/worktrees/0228-run-deslopify-to/paradise/.desloppify/external_review_sessions/ext_20260302_141352_d1f1faed/review_result.json

Requirements:
1. Read ONLY the blind packet and repository code.
2. Start from the template JSON so `session.id` and `session.token` are preserved.
3. Keep `session.id` exactly `ext_20260302_141352_d1f1faed`.
4. Keep `session.token` exactly `8548ca4856c4b21ef42cbf349244c90a`.
5. Output must be valid JSON with top-level keys: session, assessments, findings.
6. Every finding must include: dimension, identifier, summary, related_files, evidence, suggestion, confidence.
7. Do not include provenance metadata (CLI injects canonical provenance).
8. Return JSON only (no markdown fences).
