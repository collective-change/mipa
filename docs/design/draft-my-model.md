# Design: "Draft my model" with AI

Status: first version built, November 2026: the dialog, the draftModel
function, AI settings with the Anthropic and OpenAI-compatible adapters,
undo, English and Chinese. Still to do: Gemini and OpenAI adapters, the
evaluation set and cost measurements, and a review of the privacy policy.
Originally a proposal, November 2026. Available to all organizations at launch (no
feature flag), once the organization connects its own AI provider. mipa does
not provide or pay for AI itself.

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
description and this model are sent to <provider> to prepare the draft."
(the provider your organization connected), with a link to the privacy
policy.

If the organization hasn't connected a provider yet, the button is still
shown, and opens an explanation of what AI can do in mipa and how to connect
a provider (see "Connecting a provider" below), so organizations are
encouraged to set it up rather than left wondering why the feature is
missing.

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
  ├─ checks: signed in, editor of the model, description size
  ├─ loads org, model and nodes with the Admin SDK
  ├─ loads/saves the conversation in models/{modelId}/aiDrafts/{draftId}
  ├─ reads the organization's AI settings (provider, model, key)
  ├─ calls the organization's provider through its adapter
  └─ returns { draftId, kind: "questions" | "draft", ... }
Browser
  ├─ applyDraft() → candidate nodes
  ├─ trial calculation in the existing calc worker
  │    errors? → draftModel({ draftId, repairErrors }) (at most 2 rounds)
  ├─ preview → user accepts
  └─ one Firestore batch write (normal security rules apply)
```

Decisions behind this shape:

- **API keys stay on the server.** The browser never calls an AI provider
  directly. The function also enforces the editor check and a size limit on
  the description. There is no per-user daily limit.
- **The conversation is stored server-side** (`aiDrafts`), and the browser only
  sends the new text. A browser that sent the whole history could rewrite the
  AI's earlier turns. The draft session document also records token usage for
  cost monitoring, and is deleted after 30 days.
- **The trial calculation runs in the browser** with the existing calc worker:
  a baseline calculation only needs the nodes, parameters and exchange rates
  passed in its message, which is exactly what the calc tests do.
  Calculations stay on the user's device (see ai-roadmap.md, "Calculations
  stay on the user's device"), which keeps mipa's running costs low.
- **Writes happen in the browser** after the user accepts, so the existing
  Firestore rules (only model editors may write nodes) apply unchanged.

## What the AI receives

Every request to the AI provider is built from these parts, in this order (the
first part is the same for everyone, so it can be cached):

1. **Fixed instructions:** how mipa models work (nodes, formulas that use node
   symbols, `delay(node, dt, initial)` for anything that builds up over time,
   `dt` as the time step), the units and currencies mipa knows, what the
   starter role nodes mean and that the draft must connect to them, how to
   answer (about 8-25 nodes, plain-language explanations, estimates marked
   with their reasoning, questions only when they change the model's
   structure, the user's language), the reply format, and two short worked
   examples (a bakery and a school club).
2. **The organization:** name, goal, type and currency, and the model's time
   settings (time step and how far ahead it simulates).
3. **The current model's nodes:** name, symbol, formula, unit and group of
   each node.
4. **The conversation:** the user's description, the AI's questions and the
   user's answers, and the previous draft when the user asks for changes.
5. **Trial-calculation errors:** when a draft fails the trial calculation, the
   errors (which node, what went wrong) so the AI can repair it.

**Not sent:** members' names or email addresses, chats, actions, node notes,
calculation results, anything from other organizations, and the user's own
email address. Notes and chats can contain sensitive internal discussion; if
a later feature needs them, it must ask the user first and the privacy policy
must say so.

## Choosing the provider and model

Each organization has AI settings, edited on a new "AI" tab of the
organization settings:

- **Provider:** the organization's own account with one of the supported
  providers (mipa offers no default provider and pays for no AI usage):
  - Anthropic (Claude), with the organization's own API key;
  - OpenAI;
  - Google (Gemini);
  - "OpenAI-compatible endpoint" (a base URL plus key), which covers Azure
    OpenAI, OpenRouter, Mistral, self-hosted models (Ollama, vLLM) and many
    others.
- **Model:** chosen from the provider's models. mipa marks the models it has
  tested with its evaluation set as "Recommended"; others can be chosen with a
  note that drafts may be less reliable.
- **Who may change these settings:** organization admins, plus any members an
  admin adds to an "AI settings managers" list. Everyone else in the
  organization sees which provider and model are in use but can't change them.

How it is built:

- **Keys are stored only on the server**, in `orgSecrets/{orgId}`, a
  collection the security rules close to every browser. A callable function
  `setAiSettings` checks the caller's permission, tests the key with a small
  request, encrypts it (AES-GCM with a key held in Secret Manager) and stores
  it. The settings page only ever shows the last four characters.
- **One adapter per provider** behind a common interface: send the system
  prompt, conversation and output schema; get back the parsed JSON reply and
  token usage. Each adapter uses its provider's structured-output feature, and
  every reply is validated against the same Zod schema afterwards, so a
  provider with weaker JSON support gets one retry with the validation error.
- **The evaluation set runs per recommended model**, so "Recommended" means
  measured, not assumed.
- **Costs** go to the organization's own account with its provider.
- **Prompt caching** on every provider: prompts are built with the parts
  that don't change first (fixed instructions, then the organization and
  model, then the conversation), and each adapter uses its provider's caching:
  Anthropic caches at the points the request marks (`cache_control`); OpenAI
  caches long prompt prefixes automatically; Google Gemini caches implicitly
  on recent models and also offers explicit caching; OpenAI-compatible
  endpoints vary. This lowers the organization's cost and speeds up replies.

### Connecting a provider

Because AI features depend on it, connecting a provider is made easy and
encouraged:

- **Where it's offered:** on the first-run checklist, in the organization's
  settings, and wherever an AI button is pressed before a provider is
  connected. The explanation shows what AI can do in mipa, what it would send,
  and a rough cost per use (for example "drafting a model usually costs
  US$0.40-0.70 on your provider's account").
- **For admins and AI settings managers:** a short guided setup per provider:
  where to create an account and an API key (with links), a recommended
  model, a field for the key, and a "Test connection" button. It also links to
  the provider's terms on data retention and training, and suggests setting a
  monthly spending limit in the provider's console.
- **For other members:** "Ask an admin to connect an AI provider", which
  sends a note to the organization's admins inside mipa.
- **Switching off:** disconnecting the provider turns AI off for the
  organization; there is no separate switch.

## Claude API usage (Anthropic adapter)

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

These costs are paid by the organization on its own provider account; mipa
pays nothing. The estimate is shown to admins when they connect a provider.
There is no per-user daily limit. Controls that protect the organization's
bill: a cap of 6 requests per draft session, a description size limit, the
spending limit the organization sets with its provider, and usage recorded on
each draft session so admins can see what AI features cost.

## Privacy

The organization's name, goal, the user's description and the model's nodes
are sent to the AI provider the organization connected, under the
organization's own agreement with it. Before launch:

- the privacy policy (drafted at `/privacy`) covers this;
- the notice in the dialog before first use names the provider in use and
  links to the policy;
- no AI without a provider: an organization whose policy doesn't allow
  sending data to AI services simply doesn't connect one (or disconnects it);
- no promise about providers' data use: the policy says that retention and
  training depend on each provider's terms, and that organizations should
  choose a provider compatible with their own policies. The AI settings tab
  links to the chosen provider's terms.

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
2. Organization admin role and member management (separate work; the AI
   settings permissions build on it).
3. Cloud Function `draftModel`: auth and editor check, draft session storage,
   the provider adapter interface with the Claude adapter, structured output,
   tests with a mocked SDK.
4. Dialog: describe, questions, preview with the trial calculation and repair
   loop, accept and undo, English and Chinese strings.
5. AI settings: `setAiSettings`, encrypted key storage, adapters for OpenAI,
   Google and OpenAI-compatible endpoints, the settings tab and its
   permissions.
6. Evaluation set across the recommended models, prompt tuning, cost
   measurement.
7. Final privacy policy, notice and organization setting, then launch.

## Open decisions

- **Privacy policy:** the draft at `/privacy` needs review (ideally by someone
  with legal knowledge for Taiwan and the EU) before launch.
- **Which providers to support first.** Proposed: Anthropic and
  OpenAI-compatible endpoints, which together cover most options; then
  OpenAI and Google with their own adapters.
