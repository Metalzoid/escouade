# Execute phase
Read `.planning/phases/{phase}/PLAN.md`. Group the tasks in waves and run each wave in parallel with Task(subagent_type="gsd-executor"), one commit per task.
Write `.planning/phases/{phase}/SUMMARY.md` and update `.planning/STATE.md`.
Next: run `/gsd:verify-work {phase}`.
