# Plan phase
Read `.planning/STATE.md` and `.planning/phases/{phase}/CONTEXT.md`.
Spawn Task(subagent_type="gsd-phase-researcher") to research the phase.
Spawn Task(subagent_type="gsd-planner") to write `.planning/phases/{phase}/PLAN.md`.
Spawn Task(subagent_type="gsd-plan-checker") to verify the plan.
If the checker finds issues, send them back to the planner and revise (iteration_count < 3). Max 3 iterations.
Next: run `/gsd:execute-phase {phase}`.
