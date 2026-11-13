# Design: "Draft my model" with AI

Status: proposal, November 2026. Available to all users at launch (no feature flag).

## Problem

Building a model in mipa means turning "how my organization works" into nodes,
formulas, units and links, and knowing when a value builds up over time
(`delay(x, dt, 0)`). That is system-dynamics thinking, and most people starting
mipa have never done it. Today a new organization gets seven starter nodes
(effort, spending, and costs and benefits to the organization and the world)
and an empty canvas.

## Goals

- A newcomer gets a small, working, explained model of their organization in
  about ten minutes, by describing it in their own words.
- Every node in the draft says in plain language what it means and why it is
  connected the way it is. Every number the AI supplied is marked as an
  estimate, with its reasoning.
- Nothing is written to the model until the user has seen the draft and
  accepted it, and an accepted draft can be removed again in one step.
- The draft always calculates: unit errors and circular dependencies are caught
  and repaired before the user sees it.
- Works in English and Traditional Chinese (the UI languages).

Not in this version: extending an existing large model by chat, suggesting
action impacts, and the formula assistant in the node panel. They reuse most of
this design and get their own documents.

## User experience

**Where it starts.** On the Model page, a "Draft with AI" button. When the
model still has only the starter nodes, a banner offers it instead of the empty
canvas: "Describe your organization and mipa drafts a model you can edit."

**1. Describe.** A dialog with one text box, pre-filled with what mipa already
knows (organization name, goal, type, currency). Example prompt shown as a
placeholder: "We are a bakery with 6 staff. We sell bread in our shop and to
two cafés. Our biggest costs are flour, butter, energy for the ovens and wages.
We want to reach net-zero emissions by 2030."

Before the first use, the dialog states what is sent and to whom: "Your
description and this model are sent to Anthropic's Claude AI to prepare the
draft." with a link to the privacy policy.

**2. Clarifying questions (optional).** The AI may ask up to four short
questions per round, for at most two rounds, and only when the answer changes
the structure of the model ("Do the cafés pay per delivery or monthly?"). Each
question can be skipped; "Draft now" is always available.

**3. Preview.** The draft is shown before anything is saved:

- the proposed nodes, in groups (for example "Sales", "Costs", "Emissions"),
  each with its name, formula, unit and a one-sentence explanation;
- values the AI estimated are marked "estimate", with the reasoning (for
  example "about 25 kg of flour per 100 loaves");
- changes to existing nodes, such as the starter node "benefit to organization
  during interval" now being calculated from profit, shown as before and after;
- a small graph of the draft;
- the result of a trial calculation ("The draft calculates without errors").

The user can untick nodes they don't want, ask for changes in words ("leave out
deliveries, add solar panels"), or accept.

**4. Accept.** The nodes, links and node groups are written in one batch, the
model is calculated, and each drafted node's notes say "Drafted with AI" plus
the reasoning and estimate. The new nodes are highlighted like other new nodes.

**5. Undo.** Every drafted node carries the draft's id. "Remove AI draft" in
the Model page menu deletes those nodes and restores the starter-node formulas
the draft changed, as long as the user hasn't edited them since (otherwise it
asks).

## How the draft maps onto mipa's data

Nodes live in `models/{modelId}/nodes/{nodeId}`. The fields that matter here
and how each is produced:

| Field | Source |
|---|---|
| `name`, `symbol`, `symbolFormula`, `unit`, `notes` | from the AI draft (symbols are camelCase and unique in the model) |
| `influencers`, `influencees` | derived: every other node's symbol that appears in a formula becomes a link |
| `sysFormula` | derived: `symbolFormula` with linked symbols replaced by `$<nodeId>`, the same rule `NodeSummary.vue` uses today |
| `blockingInfluencers`, `unusedInfluencers`, `isSelfBlocking` | derived with `classifyInfluencers()` (`src/utils/util-node-operations.js`) |
| `class` | derived with the rule in the store's `reDetermineNodeClass` (unlinked / input / output / state) |
| `isNew`, `draftId`, `createdBy`, `createTime` | set when writing |
| model `nodeGroups` | from the draft's group names |

The derivation is a pure function, `applyDraft(draft, existingNodes)` in
`src/utils/`, which returns the node documents and model updates to write. The
`sysFormula` logic now inside `NodeSummary.vue` moves into the same utility so
the editor and the draft use one implementation. The function is unit-tested
without the AI.

The AI must connect the draft to the role nodes (`currentModel.roleNodes`):
effort, spending, and costs and benefits to the organization and the world.
Otherwise action calculations ignore the draft. It may propose new formulas for
those role nodes; the preview shows them as changes.

## Architecture

```text
Browser (Model page dialog)
  │ 1. callable function: draftModel({ modelId, draftId?, userText })
  ▼
Cloud Function draftModel (2nd gen, onCall, Node 22)
  ├─ checks: signed in, editor of the model, daily limit
  ├─ loads org, model and nodes with the Admin SDK
  ├─ loads/saves the conversation in models/{modelId}/aiDrafts/{draftId}
  ├─ calls the Claude API (secret ANTHROPIC_API_KEY)
  └─ returns { draftId, kind: "questions" | "draft", ... }
Browser
  ├─ applyDraft() → candidate nodes
  ├─ trial calculation in the existing calc worker
  │    errors? → draftModel({ draftId, repairErrors }) (at most 2 rounds)
  ├─ preview → user accepts
  └─ one Firestore batch write (normal security rules apply)
```

Decisions behind this shape:

- **The API key stays on the server.** The browser never calls Claude directly.
  The function also enforces the editor check, the daily limit and a size limit
  on the description.
- **The conversation is stored server-side** (`aiDrafts`), and the browser only
  sends the new text. A browser that sent the whole history could rewrite the
  AI's earlier turns. The draft session document also records token usage for
  cost monitoring, and is deleted after 30 days.
- **The trial calculation runs in the browser** with the existing calc worker:
  a baseline calculation only needs the nodes, parameters and exchange rates
  passed in its message, which is exactly what the calc tests do. This avoids
  moving the engine into the functions package for the first version. Later,
  extracting the engine into a module shared with Cloud Functions would let the
  repair loop run entirely on the server.
- **Writes happen in the browser** after the user accepts, so the existing
  Firestore rules (only model editors may write nodes) apply unchanged.

## Claude API usage

- **Model:** `claude-opus-5-5` (the current Opus; $4 / $20 per million input /
  output tokens). Thinking is always on; set `output_config.effort` to
  `"medium"` for questions and `"high"` for drafts, and measure in the eval
  whether `"medium"` holds up for drafts too.
- **Structured output:** `client.messages.parse()` with
  `output_config.format` built from a Zod schema (`zodOutputFormat` from
  `@anthropic-ai/sdk/helpers/zod`), so every reply is valid JSON in a known
  shape. One object with `kind: "questions" | "draft"`:
  - questions: up to four `{ question, why }`;
  - draft: `summary`, `groups[]`, `nodes[]` (`name`, `symbol`, `formula`,
    `unit`, `group`, `explanation`, `isEstimate`, `estimateReasoning`),
    `changesToExisting[]` (`symbol`, `newFormula`, `explanation`).
  Fields that don't apply to the kind are empty, which keeps the schema simple
  for strict structured output. Parse failures (`parsed_output` is null) are
  retried once.
- **Prompt:** a fixed system prompt with mipa's modelling rules: formula
  syntax (mathjs), `delay(node, dt, initial)` for anything that builds up over
  time, `dt` as the time step, mipa's units and custom units (person, workhour,
  count...), currencies, linking to the role nodes, keeping drafts to about
  8-25 nodes, explaining in plain language, marking estimates, asking only
  questions that change the structure, and answering in the user's language.
  It includes two short worked examples (a bakery and a school club). The
  current model and organization follow after the cache breakpoint.
- **Prompt caching:** `cache_control` on the system prompt, which is the same
  for every user, so most input after the first request of a session is
  billed as cache reads. Nothing that varies per request (dates, ids) goes into
  the system prompt.
- **Long replies:** stream with `max_tokens` around 64,000 and use
  `.finalMessage()`; set the function timeout to 300 s. The dialog shows
  "Drafting... usually under a minute".
- **Declined requests:** check `stop_reason` for `"refusal"` before reading
  the reply, and enable server-side fallbacks (`fallbacks: "default"` with the
  `server-side-fallback-2026-07-01` beta) so a declined request is retried on
  another model in the same call. If everything declines, the dialog says the
  description couldn't be drafted and suggests rephrasing.
- **Errors:** retry rate limits and server errors (the SDK retries twice by
  default); show a plain message for anything else. No partial drafts are ever
  written.

## Cost

Rough estimate per completed draft, to be replaced by measurements from the
prototype:

| Part | Tokens | Cost |
|---|---|---|
| System prompt (about 6,000 tokens), mostly cache reads over 3-4 requests | ~24,000 cached | ~$0.01 |
| Model, organization and conversation, uncached | ~15,000 | ~$0.06 |
| Output, including thinking, over 3-4 requests | ~15,000-30,000 | ~$0.30-$0.60 |
| **Total per draft** | | **~$0.40-$0.70** |

At 100 drafts a month that is roughly $40-$70. Controls: a per-user daily limit
(proposed: 5 draft sessions), a cap of 6 requests per session, a description
size limit, a monthly spend limit on the Anthropic account, and usage recorded
on each draft session so cost per draft can be tracked.

## Privacy

The organization's name, goal, the user's description and the model's nodes
are sent to Anthropic. Before launch:

- a privacy policy that covers this (mipa doesn't have one yet; it needs one
  anyway before real users sign up);
- the notice in the dialog before first use, linking to it;
- an organization setting "Allow AI features", on by default, so an
  organization whose own policy doesn't allow sending data to AI services can
  turn it off for all its members;
- confirming Anthropic's current commercial terms on data retention and
  training for API inputs, and summarizing them in the policy.

## Quality

A small evaluation set built before launch: about 20 organization descriptions
covering the organization types mipa offers (just me, family, community,
school project, business, non-profit, government), in English and Chinese,
including vague and very short ones. Each draft is checked automatically:

- the reply parses and the draft passes `applyDraft()`;
- the trial calculation succeeds (after at most two repairs);
- all role nodes are connected and no drafted node is orphaned;
- node count is within range and every estimate has reasoning.

A person reviews a sample for plausibility. The set is re-run on every prompt
or model change, and the same checks run on every real draft so failures show
up in the logs.

## Plan

1. `applyDraft()` and the shared `sysFormula` utility, with tests. No AI yet.
2. Cloud Function `draftModel`: auth and editor check, daily limit, draft
   session storage, Claude call with structured output, tests with a mocked
   SDK.
3. Dialog: describe, questions, preview with the trial calculation and repair
   loop, accept and undo, English and Chinese strings.
4. Evaluation set, prompt tuning, cost measurement.
5. Privacy policy, notice and organization setting, then launch.

## Open decisions

- **Provider and budget.** This design assumes Anthropic's Claude API. Needs an
  Anthropic account for the project, the `ANTHROPIC_API_KEY` secret, and a
  monthly budget.
- **Privacy policy** text and a contact address.
- **Limits:** the per-user daily limit and the default for the organization
  setting.
