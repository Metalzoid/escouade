---
name: subagent-driven-development
description: Use to execute a plan with a fresh subagent per task
---
Read the plan in `docs/superpowers/plans/2026-01-01-feature.md`. For each task, dispatch Task(subagent_type="general-purpose"), then use superpowers:requesting-code-review.
When all tasks are complete, use superpowers:finishing-a-development-branch.
