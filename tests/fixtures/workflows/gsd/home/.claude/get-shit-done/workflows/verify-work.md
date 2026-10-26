# Verify work
Spawn Task(subagent_type="gsd-verifier") to check the phase against its goal.
If gaps are found, run `/gsd:plan-phase {phase} --gaps` to plan the fixes.
Update `.planning/STATE.md` to the next phase. The milestone is complete when all phases are complete.
