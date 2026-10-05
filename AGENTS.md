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

## 6. Answer first, then edit

Question asked: answer it before running edits or build commands.

Feedback or analysis: say whether you agree or disagree, then list what changed.

No emojis in commits, PR text, or code comments. No filler openers ("Thanks so much!").

Explain a non-trivial design as: problem, concrete example, solution. Say why the solution is required and what it costs.

## 7. Read before you write

Read a file end to end before a wide-ranging change, and before editing a file you have not fully read. Grep locates code, it does not replace reading it.

Check external API types in node_modules instead of guessing. Next 16 and React 19 moved past your training data.

## 8. TypeScript style

No new `any`. Narrow `unknown` with a guard, or parse with zod. Use `@ts-expect-error` with a reason; never `@ts-ignore`.

`const` over `let`. Early return over `else`. `map`/`filter`/`flatMap` over `for`, with a type guard on `filter`.

Inline a helper with one call site. Extract only when it names a real concept. Avoid `try`/`catch` unless failure is genuinely expected.

Dynamic `await import()` is load-bearing here (lazy load, server/client boundary). Do not hoist it to a top-level import.

## 9. Dependencies

Direct deps stay pinned to exact versions; `npm run check` fails otherwise.

Install and refresh with scripts off: `npm install --ignore-scripts`; lockfile-only refresh: `npm install --package-lock-only --ignore-scripts`. CI uses `npm ci --ignore-scripts`.

A new dep with an install script gets reviewed, then added to ALLOWLIST in scripts/check-supply-chain.cjs. Never add an entry silently.

Treat a lockfile diff as reviewed code. Stage it only when the dependency change belongs to the current task.

Never downgrade code to satisfy a stale type. Upgrade the dependency.

## 10. Commands and tests

After code changes: `npm run typecheck`, then `npm run lint`. Full output, fix every error. Never invoke raw `tsc`.

`npm test` is the whole suite (222 files). Scope it: `npx vitest run tests/<file>.test.ts`, or `--related <files>`.

Test the real implementation. No mocks of internal modules; assert on behavior and output.

Never weaken an assertion, add a skip, or swallow an error to reach green.

A regression gets a test carrying the issue number or the trace that produced it.

## 11. Git

Stage only files you changed in this session, by explicit path. Never `git add -A`, `git add .`, `git commit --no-verify`.

Never `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, or force push. Another session may share this checkout.

Read `git status` before committing.

Commit message: `type(scope): summary`, types feat/fix/docs/chore/refactor/test. Branch name: up to three words, hyphen separated, no slashes.

Ask before removing functionality that looks intentional.

## Lessons

<!-- Add one line per correction below, newest last. Ask before editing anything above this heading. -->