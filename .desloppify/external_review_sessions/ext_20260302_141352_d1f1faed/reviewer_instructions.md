# External Blind Review Session

Session id: ext_20260302_141352_d1f1faed
Session token: 8548ca4856c4b21ef42cbf349244c90a
Blind packet: /var/tmp/vibe-kanban/worktrees/0228-run-deslopify-to/paradise/.desloppify/review_packet_blind.json
Template output: /var/tmp/vibe-kanban/worktrees/0228-run-deslopify-to/paradise/.desloppify/external_review_sessions/ext_20260302_141352_d1f1faed/review_result.template.json
Claude launch prompt: /var/tmp/vibe-kanban/worktrees/0228-run-deslopify-to/paradise/.desloppify/external_review_sessions/ext_20260302_141352_d1f1faed/claude_launch_prompt.md
Expected reviewer output: /var/tmp/vibe-kanban/worktrees/0228-run-deslopify-to/paradise/.desloppify/external_review_sessions/ext_20260302_141352_d1f1faed/review_result.json

Happy path:
1. Open the Claude launch prompt file and paste it into a context-isolated subagent task.
2. Reviewer writes JSON output to the expected reviewer output path.
3. Submit with the printed --external-submit command.

Reviewer output requirements:
1. Return JSON with top-level keys: session, assessments, findings.
2. session.id must be `ext_20260302_141352_d1f1faed`.
3. session.token must be `8548ca4856c4b21ef42cbf349244c90a`.
4. Include findings with required schema fields (dimension/identifier/summary/related_files/evidence/suggestion/confidence).
5. Use the blind packet only (no score targets or prior context).
