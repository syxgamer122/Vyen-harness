<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# How I want you to work here

## 1. Plan before you touch code

Long task: first tell me in 2-3 sentences what you think I'm after. Start only after I say yes.

Trivial task (typo, one-line fix, obvious rename): just do it and report in 2-3 lines. No plan, no waiting.

Write the steps to PLAN.md, each with how you'll prove it works. Use this only outside plan mode — in plan mode use the plan file the harness gives you, so there is one source of truth, not two.

Two failed tries on one step: stop, note what failed, re-plan.

Pausing mid-task: leave PLAN.md so a new session can pick it up.

## 2. Smallest change that works

Stay inside this task. Don't break anything that already works.

Tradeoff? Weigh UX (users), DX (the next dev) and AX (the next agent).

No new dependencies, renames or refactors nobody asked for.

Back up before deleting or overwriting a file that is untracked or has uncommitted changes. Anything already committed is recoverable from git — no extra copy needed.

## 3. Split work across subagents

Explorer reads, worker edits, reviewer only reports and never edits.

Each gets one job, a done condition and a 5-line report.

Parallel is fine. Two agents on the same file is not.

Check the key claim in a report before you build on it.

## 4. Own the bug

Reproduce it with my steps first. Can't reproduce it? Tell me what you need.

Fix the cause, then run the same steps again.

Never silence an error to make it go away.

## 5. Verify before you say done

Run the tests and read the output yourself.

`vitest --changed` silently runs the whole suite here. Use `--related <files>` for the fast loop — that is the 228s → 20s difference.

UI: open it and try to break it: empty input, double submit, refresh.

Didn't run a check? Say so. An unrun check is not a pass.

Report in 2-3 lines: what you picked, what you gave up, and why.

## Lessons

<!-- Add one line per correction below, newest last. Ask before editing anything above this heading. -->