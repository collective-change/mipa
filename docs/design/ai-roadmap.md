# AI roadmap

Status: proposal, November 2026. Companion to
[draft-my-model.md](draft-my-model.md), which designs the first feature in
detail.

AI should help at every step of mipa's cycle (Model, Ideate, Prioritize,
Achieve), not only at the start. The first pilot is planned with the CEO's
office of the Tzu Chi Foundation, so features that make a decision
understandable to senior leaders come first.

## Principles

0. **Clear to newcomers, with or without AI.** mipa must explain itself to
   someone who has never heard of system dynamics: plain words, help where
   the question arises, and a clear next step on every screen. AI makes this
   easier but must not be required for it; see "Making mipa self-explanatory"
   below.
1. **AI proposes, people decide.** Nothing in an organization changes until a
   person reviews and accepts it. Accepted AI content is labeled as such.
2. **Numbers come from the engine, words from the AI.** Results, rankings and
   comparisons are calculated by mipa's simulation; the AI explains them and
   chooses what to test, but never types a result number itself. Values the
   AI estimates (inputs) are marked as estimates with reasoning or a source.
3. **Send only what the feature needs.** Each feature declares which data it
   uses (table below). Features that use chats or notes ask before their first
   use. Email addresses and passwords are never sent.
4. **The organization stays in control.** Admins can turn AI off; admins and
   designated members choose the provider and model (see
   draft-my-model.md, "Choosing the provider and model").
5. **Show uncertainty.** Where a result depends on estimates, show ranges or
   the assumptions it hinges on, not just one precise-looking number.

## Should mipa's AI be agentic?

Yes in how it works things out, no in what it changes.

- **Agentic reasoning, read-only tools.** Several features need several steps
  the AI decides on itself: read the model, run a calculation, try a changed
  assumption, compare, look up a published figure, then explain. That is an
  agent loop with tools, and it is what makes features like "What would change
  the answer?" possible. The tools are mipa's own: read the organization's
  model and actions, run a calculation on a scratch copy (on the user's own
  device, see below), and web search for public figures (no organization data
  in queries).
- **No autonomous changes.** The agent's only way to change anything is to
  produce a proposal (a draft model, new actions, formula edits, a brief) that
  a person reviews. It does not save, send messages or emails, assign people,
  or act outside mipa.
- **Bounded.** Each run is limited to one organization, a set number of steps
  and tokens, and the permissions of the person who started it. Every run is
  logged (who started it, what it read, what it proposed, cost), so an admin
  can see what the AI did.
- **Later, maybe:** recurring agents that run on a schedule, such as a weekly
  progress digest or an alert when results drift from the plan. These still
  only propose or report, and need an admin to switch them on.

This keeps the benefit of an agent (it can investigate, not just answer) while
avoiding the main risk for an organization: an AI quietly changing the plans
people rely on.

## Features

| # | Feature | Stage | Data it uses | Priority |
|---|---|---|---|---|
| 1 | Draft my model | Model | org name/goal/type/currency, model, conversation | now (designed) |
| 2 | Decision brief and "explain the ranking" | Prioritize | model, actions, calculated results | next |
| 3 | What would change the answer? | Prioritize | model, actions, calculated results (engine runs) | next |
| 4 | Idea to complete action | Ideate | model, the idea, existing actions | next |
| 5 | Formula help (write, explain, fix errors) | Model | the node and its neighbors | soon |
| 6 | Model review | Model | model, results | soon |
| 7 | Estimates with sources | Model | the node; web search | soon |
| 8 | Fill the model from documents | Model | model; documents the user gives | later |
| 9 | Suggest actions | Ideate | goal, model, existing actions; web search | later |
| 10 | Overlaps and dependencies between actions | Ideate | actions | later |
| 11 | Second opinion on top actions | Prioritize | top actions, model, results | later |
| 12 | Break actions into steps and suggest owners | Achieve | action, member names | later |
| 13 | Progress digest | Achieve | actions, updates, chats (asks first), member names | later |
| 14 | Learn from results (forecast vs actual) | Achieve | model, results, recorded actuals | later |
| 15 | Ask mipa (questions in plain words) | all | depends on the question; read-only tools | later |
| 16 | Translation (Chinese and English first) | all | the text being translated | later |

## Shared building blocks

Built once, used by every feature:

- **Provider adapters and settings:** from draft-my-model.md (default Claude,
  or the organization's own provider and model).
- **AI run service:** one Cloud Function entry point that checks permissions,
  loads only the data the feature declares, runs the agent loop with the
  feature's tools and step limit, records usage, and returns a proposal.
- **Calculation tool in the browser:** the agent's "run a calculation" tool
  is carried out by the existing calculation worker on the user's device (see
  "Calculations stay on the user's device"). Features 2, 3, 6, 11 and 14 use
  it.
- **Proposal review UI:** one pattern for showing a proposal (what changes,
  why, estimates marked) with accept, edit or discard.
- **Run log:** per organization, visible to admins.
- **Evaluation sets** per feature, re-run on prompt or model changes.

## Feature 2: Decision brief and "explain the ranking"

**For whom:** leaders who should not need to learn the app, such as the CEO,
and the staff who prepare decisions for them.

**What it produces:** a one-to-two-page brief, in the reader's language
(Traditional Chinese or English), printable and exportable as PDF:

1. The decision, in one sentence, and the options compared.
2. A table, filled in by mipa (not the AI): for each option, the estimated
   benefit and cost to the organization and to the world, net benefit,
   effort, and leverage, with ranges where inputs are uncertain.
3. Why the top option ranks first, in plain words: which effects drive its
   benefit, and what it costs.
4. The assumptions the ranking depends on most (from feature 3), and which of
   them are estimates.
5. What the brief does not cover (effects not in the model).

**How it works:** the staff member selects the actions to compare and starts
"Prepare brief". The AI reads the actions, the model and the calculated
results through read-only tools, and writes sections 1, 3 and 5 around the
numbers mipa supplies. Every claim it makes about a number refers to a value
in the results, and a check rejects text that cites a number not in them.
The staff member edits the text before sharing; the brief records who edited
it and when.

"Explain the ranking" is the same capability, on demand, in the actions list:
"Why is A above B?" answered from the two actions' results.

## Feature 3: What would change the answer?

**Question it answers:** "How sure can we be that A is better than B, and
which assumptions would have to be different for B to win?"

**How it works:**

1. mipa lists the inputs that feed the compared actions' results: constant
   nodes, the actions' estimated effort, spending and impacts, and the
   weighting between benefit to the organization and to the world.
2. A quick screen (no AI): each input is moved up and down by a set amount
   (for example plus or minus 30 percent, or the range the user gave) and the
   ranking is recalculated. Inputs that change the ranking, or move leverage
   the most, are kept.
3. For the inputs that matter, the engine searches for the turning point, the
   value at which the ranking flips.
4. The AI agent looks at those results, can test combinations it thinks are
   plausible (several estimates being optimistic together), and writes the
   finding: "B beats A only if the program's reach is below 1,200 people a
   year (currently estimated at 3,000), or if volunteer hours are valued above
   NT$600 an hour."
5. The result appears as a short list of "this decision depends on" items,
   each linked to the node or action, and feeds section 4 of the brief.

**Why this matters:** it answers the false-precision risk directly. Instead of
one confident number, leaders see how robust the ranking is and which
estimates are worth checking before deciding.

**Needs:** the calculation tool in the browser (shared building block) and a
way to enter a range for an estimate (low, likely, high), which is useful on
its own. The screen and turning-point search run many calculations; they run
in the browser worker, in parallel workers where the device allows, with a
progress bar.

## Feature 4: Idea to complete action

From a short description ("install solar panels on the Hualien recycling
station"), the AI proposes the action's estimated hours and spending, and its
impacts: which nodes change, by how much, for how long, with each estimate's
reasoning or source. The user adjusts and saves. This is the hardest part of
adding an action today.

## Calculations stay on the user's device

Running calculations on the server would add to mipa's running costs, so
they stay where they are today: in a web worker in the user's browser.

The AI can still use them. The agent loop is relayed through the Cloud
Function (which must hold the API keys anyway), but tool calls are carried
out where the tool lives:

```text
browser                     Cloud Function               AI provider
  │ start run (feature, input) ─▶ build prompt ───────────▶
  │                              ◀── tool call: run_calculation(changes)
  ◀── "run this calculation" ──
  │ calc worker runs it locally
  │ result ───────────────────▶ add result ───────────────▶
  │                              ◀── proposal (final answer)
  ◀── proposal for review ─────
```

- Read-only tools that only need data (read model, read actions) are served
  by the function from Firestore; calculation tool calls are sent to the
  browser and answered by the worker.
- The run stops if the browser tab closes; runs are short (seconds to a
  couple of minutes), and the dialog says so.
- The server never needs a copy of the engine, and the calculation results
  stay on the device except for what is sent to the AI as tool results.

## Running costs and whether to charge

| Cost | Who pays | Size |
|---|---|---|
| Hosting, database, sign-in (Firebase) | mipa | small at pilot scale: mostly within free quotas; Cloud Functions need the pay-as-you-go plan but cost cents at this volume |
| Calculations | nobody extra | run on users' devices |
| AI with the default provider | mipa | the main cost: roughly $0.40-$0.70 per drafted model, more for agent features that run several steps |
| AI with the organization's own provider | the organization | under its own account |

So mipa itself can stay free. The open question is only the default AI
provider. Options, which can be combined:

1. **Sponsored default AI:** a sponsor or grant (for example the pilot
   organization or collective-change.org) pays for the default provider, with
   a monthly spend limit on mipa's account.
2. **Monthly allowance per organization** on the default provider, after
   which the organization connects its own provider. (Per organization per
   month, not a per-user daily limit.)
3. **Bring your own provider only:** no default AI cost to mipa, but a
   barrier for small organizations without an AI account.
4. **Paid plan later** for heavy use of the default AI, if usage grows.

Recommended to start: 1 with a spend limit, plus 2 if usage grows.

## Making mipa self-explanatory

AI helps, but the app must be clear without it. Planned work:

1. **Plain words everywhere.** Replace technical terms in the interface with
   everyday ones, with the technical term available in help text. For example:

   | Now | Plain wording (proposed) |
   |---|---|
   | node | factor (something you can measure, like sales or emissions) |
   | symbol | short name used in formulas |
   | influencers / influencees | depends on / affects |
   | latest value (optional), used by `best_guess` in `delay()` | current value (optional), used as the starting point |
   | time step type, time step growth rate, number of time steps | "Calculate every [month] for [5 years]" |
   | leverage | good done per hour of effort |
   | total ROI | benefit for each unit of cost |
   | outstanding direct cost | remaining cost |
   | benefit to world during interval | benefit to the world (per period) |
   | responsible, accountable | doing it, answerable for it |
   | right-click on a node to show menu | a "⋯" menu on the selected node (works on touch screens too) |

   Terms are kept consistent in both languages through a short glossary in
   the Help page.
2. **Help where the question arises.** Every field and result has a one-line
   explanation or a (?) with an example. Results say what they mean ("This
   action does about 3 times more good per hour than the next one").
3. **A first-run checklist** on the Model page that guides a new organization:
   set the hourly cost of work, describe what matters (or "Draft my model"),
   calculate, add a first action, compare. Each step links to where it is
   done and ticks off when done.
4. **An example to explore:** a read-only sample organization (for example a
   bakery and a community recycling station) that newcomers can open and
   change without risk.
5. **Errors in plain words with a fix,** for example "This factor is in USD
   but its formula gives a plain number. Add a unit, like `30 USD`."
6. **Every empty screen says what to do next,** for example the Actions page
   before any actions exist.
7. **Test with newcomers.** Before each release, a few people who have never
   seen mipa try a set task while thinking aloud; the problems they hit are
   fixed first. The automated browser walkthrough used during development
   keeps the main paths working.

## Order of work

1. Making mipa self-explanatory, steps 1, 2, 5 and 6 (no AI needed), then
   the first-run checklist and the example organization.
2. Draft my model, with the shared provider adapters and run service, and the
   AI run relay with the calculation tool in the browser.
3. Estimate ranges (low, likely, high) on inputs.
4. What would change the answer? (feature 3).
5. Decision brief and explain the ranking (feature 2).
6. Idea to complete action (feature 4).
7. Then, guided by the pilot: formula help, model review, estimates with
   sources, and the Achieve features.

## Privacy

The privacy policy (`/privacy`, "AI features") covers all of these: what may
be sent, to whom, the organization's controls, and that nothing changes
without a person accepting it. When a feature is added that uses a new kind
of data, the policy and the table above are updated first.
