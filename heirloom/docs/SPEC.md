# Heirloom

**Knowledge worth passing down. Every team gets an AI Keeper, so what people know outlives the time they spend on a team.**

Built for the ADP "Best People Hack" track at Hack Like W@CC (October 2026).

> **Pitch line:** "When someone leaves ADP, their knowledge shouldn't leave with them. And when two teams are solving the same problem, they should find out on day one, not month six."

This document is the full build spec: product, behavior rules, UI, architecture, data, seed content, and demo. A developer (or a coding agent) should be able to build Heirloom from this file alone.

---

## Table of contents

1. [Problem](#1-problem)
2. [Solution](#2-solution)
3. [Users](#3-users)
4. [Core concepts](#4-core-concepts)
5. [Features](#5-features)
6. [Behavior rules](#6-behavior-rules)
7. [How the AI looks and talks](#7-how-the-ai-looks-and-talks)
8. [Design system (ADP-inspired)](#8-design-system-adp-inspired)
9. [Screens](#9-screens)
10. [Architecture](#10-architecture)
11. [Agents](#11-agents)
12. [Data model](#12-data-model)
13. [API](#13-api)
14. [Seed data](#14-seed-data)
15. [Demo script](#15-demo-script)
16. [Judge Q&A](#16-judge-qa)
17. [Success metrics](#17-success-metrics)
18. [Repo structure](#18-repo-structure)
19. [Build order](#19-build-order)
20. [Out of scope](#20-out-of-scope)

---

## 1. Problem

At ADP, knowledge is split by product team: **Payroll, Benefits, Time & Attendance**. Most of it lives in people's heads and on their laptops, not in shared documentation.

This came directly from an ADP mentor: knowledge gets siloed in individuals. When a new project needs both payroll and benefits knowledge, people have to keep interrupting experts on each team. When someone leaves a team, what they knew leaves too.

The result:

- **New hires ramp slowly** because they depend on busy experts.
- **Teams duplicate work** because they don't know what other teams already built.
- **Changes ripple unexpectedly**: a small change in Time can affect paychecks and benefits eligibility.
- **Knowledge walks out the door** when people change roles or leave.

## 2. Solution

Heirloom gives every team its own AI agent, its **ambassador**. Each ambassador:

1. **Knows its team:** people, roles, who owns what.
2. **Knows its domain:** processes, rules, systems, common issues.
3. **Learns from its humans:** when it doesn't know something, it asks the right expert and remembers the answer once the team approves it.
4. **Talks to other ambassadors:** agents ask each other questions across teams, sharing only what each team allows.
5. **Notices things nobody asked about:** daily agent standups surface overlapping work and reuse opportunities.
6. **Protects against knowledge loss:** a bus factor map shows topics only one person knows, and exit interviews capture them before that person leaves.

### Design principles

- **Ownership over aggregation.** Each team owns and maintains its agent. One giant shared bot has no owner, so nobody keeps it accurate.
- **Evidence over confidence.** Every answer shows where it came from and who verified it. Uncertainty is labeled, never hidden.
- **Process knowledge, not personal data.** Heirloom knows *how* deductions work, never what anyone earns.
- **Agents inform, humans decide.** Agents never change systems or make decisions.

## 3. Users

| Persona | Example | What they need |
| --- | --- | --- |
| **New team member** | Jordan, just joined the Time & Attendance project | Ramp up across teams without interrupting experts |
| **Subject expert** | Maria, senior payroll specialist | Answer questions once instead of repeatedly; get credit |
| **Knowledge owner / team lead** | Priya, Benefits team lead | Keep the team's agent accurate; control what's shared |
| **Engineering / product lead** | Sam, Time team engineering lead | See cross-team impact before shipping changes; avoid duplicate work |

## 4. Core concepts

| Concept | Definition |
| --- | --- |
| **Team agent (ambassador)** | An AI agent scoped to one team's knowledge and roster. Same code for every team, different data. |
| **Knowledge entry** | One unit of knowledge: a question/answer or fact, with sources, owner, verified date, expiry, and share level. |
| **Source** | A document, meeting note, or expert answer that backs an entry. Always passed through to the final answer. |
| **Knowledge PR** | A proposed new or changed entry, waiting for the team's knowledge owner to approve it. |
| **Share level** | Who can see an entry: `team`, `cross_team`, or `company`. |
| **Capability card** | A short public description of what a team owns, used by agents to decide whom to ask. |
| **Bus factor** | Number of people who know a topic. A bus factor of 1 means one person leaving loses that knowledge. |
| **Insight** | Something agents noticed proactively: an overlap, a reuse opportunity, or a conflict. |

## 5. Features

### 5.1 Ask your team's agent
- Chat with your team's ambassador. Every answer cites its sources.
- If the answer requires another team's knowledge, the agent asks that team's agent (5.3).
- Answers show a **verified badge** ("Verified by Maria Lopez · Oct 17") and source chips that open the original document at the exact passage.

### 5.2 Learning loop with knowledge PRs
1. The agent can't answer, so it responds: "No documented answer yet. I've asked Maria Lopez (Payroll)."
2. The question lands in Maria's **expert inbox**. She can type or record a voice note.
3. The agent turns her answer into a structured **knowledge PR** (summary, steps, caveats, expiry suggestion).
4. The team's knowledge owner approves, edits, or rejects it.
5. Once approved, the entry is live. The original asker is notified, and the next person gets an instant answer.

### 5.3 Agent-to-agent questions
- Agents call each other through a standard `ask` tool.
- The asking agent sees the answering team's **sources**, not a paraphrase.
- The answer shows what was shared and what was withheld: *"Shared: deduction process. Withheld: vendor contract terms (Benefits-only). Ask Priya Nair for access."*
- Every exchange is logged and visible on the **agent network** screen.

### 5.4 Agent standups (proactive insights)
- Once a day (or on demand in the demo), each agent summarizes what its team is working on.
- A comparison pass looks for:
  - **Overlap:** two teams building the same thing.
  - **Reuse:** one team about to build something another already has.
  - **Conflict:** two teams' documented rules disagree.
- Insights go to the relevant team leads, each with evidence from both sides.
- Leads can mark an insight **useful** or **not relevant**, which tunes future standups.

### 5.5 Impact check
- A lead describes a proposed change: "Round overtime to the nearest 15 minutes instead of 6."
- The originating agent asks every dependent team's agent to assess impact from its perspective.
- Output: one card per team with the concern, affected areas, sources, and a suggested contact.

### 5.6 Bus factor map
- Visual map of topics, grouped by team, colored by how many people know each one.
- **Red:** 1 person, undocumented. **Amber:** 1–2 people, partly documented. **Green:** 3+ people, documented.
- Bus factor = distinct people who authored, answered, or were cited on that topic.
- Visible to team leads only. Framed as **organizational risk**, never a judgment of a person.
- Clicking a red topic offers: "Schedule a 10-minute capture session with Maria."

### 5.7 Exit interview mode
- When someone gives notice, their team lead starts an exit interview (voluntary, with consent).
- The agent finds every topic where that person is the only source and asks targeted questions about exactly those.
- The person reviews everything before it's saved. Each answer becomes a knowledge PR.

### 5.8 Ramp-up paths
- A new member joins a project. Heirloom looks at which teams the project depends on and generates a two-week plan:
  - Topics to learn from each team's agent
  - People to meet (with why)
  - Known gaps that are still undocumented

### 5.9 Contributor credit
- Every approved entry credits its expert.
- Experts see impact: "Your answer has helped 23 people across 3 teams."

## 6. Behavior rules

These are the nuances that keep Heirloom trustworthy. Build them into the backend, not just the UI.

### Knowledge quality
- **No telephone game.** When agents pass answers between each other, they pass the original sources and quotes. The final answer cites the original doc or expert, never "the Payroll agent said."
- **Verify citations in code.** After the model returns a quote, check that the exact string exists in the source. Drop or flag any that don't.
- **Label certainty.** Every answer section is one of: `documented` (from a source), `expert-verified` (approved entry), or `no documented answer`. Never present inference as fact.
- **Conflicting experts.** If two approved answers disagree, show both, flag "conflicting answers," and route to the knowledge owner. Don't pick a winner.
- **Corrections propagate.** Anyone can flag an answer as wrong. Once the owner fixes it, Heirloom notifies everyone who received the old version.
- **Expiry by type.**

| Entry type | Default expiry |
| --- | --- |
| Regulation / tax rule | 12 months |
| Process / how-to | 6 months |
| Team roster / ownership | 3 months |
| One-off decision | No expiry, marked with its date |

Expired entries still appear, labeled **"Needs re-confirmation,"** and the owner is pinged.

### Routing to humans
- **Pick the expert** by who authored, answered, or was cited most on that topic. Fall back to the team lead.
- **Protect experts from overload.** Cap open questions per person (default 5). Merge duplicate questions. Repeated overload on one person raises that topic's bus factor risk.
- **Timeouts.** If no response after 24 hours (2 minutes in demo mode), escalate to the team lead. The asker sees "Pending · asked Maria Lopez 3h ago."
- **Deduplicate.** Semantically similar open questions are merged so the expert answers once.

### Agent-to-agent
- **Capability cards** decide whom to ask. Agents don't broadcast to every team.
- **Max 2 hops** per question. No loops: an agent never re-asks an agent already in the chain.
- **Agents only inform.** No tool can change external systems.
- **Everything is logged** (asker, answerer, question, shared sources, withheld items, latency).

### Privacy and permissions
- **Share levels** (`team`, `cross_team`, `company`) are set per entry, with a team default.
- **Withheld is visible.** When something is withheld, the answer says so and names who to ask for access.
- **No personal data.** Ingestion rejects documents flagged as containing employee records, and the extraction prompt is told to skip personal data.
- **Bus factor map and exit interviews** are visible to team leads only. Exit interviews require consent, and the person reviews answers before saving.

### Proactive features
- **High precision over high recall.** Only show insights above a confidence threshold. A noisy feed gets ignored.
- **Right recipient.** Insights go to the leads of the teams involved, not everyone.

### Org changes
- **Shared topics** (like overtime) can have co-owners across teams.
- **Reorganizations:** entries belong to topics, and topics can move between teams without losing history.

## 7. How the AI looks and talks

### Identity
- Each team agent is named **"[Team] Keeper"**: Payroll Keeper, Benefits Keeper, Time Keeper. Heirloom is the product; Keepers are the team agents inside it.
- Avatar: a rounded square with the team's initial and a small key icon. Each team has an accent color used only on its avatar and network node (see 8.3).
- Never a human face or a fake person name. It's clearly an AI that represents a team.

### Voice
- **Plain, direct, and short.** Like a helpful senior teammate, not a chatbot.
- Lead with the answer, then the detail.
- **Honest about gaps:** "I don't have a documented answer for this yet. I've asked Maria Lopez on Payroll, and you'll be notified when she replies."
- No filler ("Great question!"), no emoji, no overpromising.

### Answer card anatomy

Every agent answer renders as a structured card, not a wall of text:

```
┌──────────────────────────────────────────────────────────────┐
│ [P] Payroll Keeper                        consulted: Benefits │
├──────────────────────────────────────────────────────────────┤
│ Overtime hours are included in gross pay before pre-tax       │
│ benefit deductions are calculated.                            │
│                                                               │
│ • Pre-tax deductions apply to total gross, including OT  [1] │
│ • Benefits eligibility uses scheduled hours, not OT      [2] │
│                                                               │
│ ✔ Verified by Maria Lopez · Oct 17        ⓘ Documented       │
│                                                               │
│ Sources  [1] Payroll Calc Guide §4.2   [2] Benefits Eligib…  │
│                                                               │
│ ⚠ Withheld: vendor contract terms (Benefits-only).            │
│   Ask Priya Nair for access.                                  │
│                                                               │
│ [ Helpful ]  [ Flag as wrong ]  [ Ask a follow-up ]           │
└──────────────────────────────────────────────────────────────┘
```

Elements, in order:
1. **Header:** agent avatar + name; "consulted: [teams]" if other agents were asked.
2. **Lead sentence:** the answer in one line.
3. **Supporting points:** each with a numbered source marker.
4. **Trust row:** verified badge (who + date) and certainty label.
5. **Sources:** chips that open a side panel scrolled to the exact passage.
6. **Withheld notice** (if any), with who to ask.
7. **Actions:** Helpful, Flag as wrong, Ask a follow-up.

### Special states

| State | What the user sees |
| --- | --- |
| Thinking | "Checking Payroll docs…" then "Asking Benefits Keeper…" as live status lines |
| No answer | Gray card: "No documented answer yet. Asked Maria Lopez (Payroll). Pending." |
| Conflicting answers | Amber card showing both answers side by side, with "Routed to Priya Nair to resolve" |
| Needs re-confirmation | Answer shown with an amber "Last verified 7 months ago · re-confirmation requested" badge |
| Withheld | Inline notice with lock icon and access contact |

## 8. Design system (ADP-inspired)

Heirloom should feel like it belongs inside ADP's product family: a clean enterprise layout, a deep navy frame, ADP red for primary actions, and lots of white space.

> **Branding note:** Do not put ADP's logo or trademarks inside the product UI. Use the Heirloom wordmark. Put "Built for ADP" on pitch slides only.

### 8.1 Colors

| Token | Hex | Use |
| --- | --- | --- |
| `adp-red` | `#D0271D` | Primary buttons, active nav item, key highlights |
| `adp-red-bright` | `#EE2722` | Hover/focus rings, small accents (use sparingly) |
| `adp-red-dark` | `#A81E16` | Button pressed state |
| `adp-navy` | `#121C4E` | Top bar, headings, primary text |
| `adp-navy-700` | `#2E3A6E` | Secondary text, icons, side nav text |
| `adp-navy-50` | `#EEF0F6` | Selected rows, subtle fills |
| `surface` | `#FFFFFF` | Cards, panels |
| `surface-muted` | `#F5F6F9` | Page background |
| `border` | `#DDE0E8` | Card and table borders |
| `text-muted` | `#5B6278` | Captions, timestamps |

Red and navy come from ADP's brand colors. Brand references list the red as `#D0271D` or `#EE2722`; use the darker `#D0271D` for buttons with white text (better contrast), and eyedrop from the sponsor PDF to confirm.

**Status colors** (separate from brand red, so a warning never looks like a button):

| Status | Hex | Used for |
| --- | --- | --- |
| Verified / green topic | `#16A34A` | Verified badge, bus factor 3+ |
| Warning / amber topic | `#D97706` | Needs re-confirmation, conflicts, bus factor 2 |
| Critical / red topic | `#B91C1C` | Bus factor 1 (distinct from brand red: darker, used with a ⚠ icon) |
| Info | `#2563EB` | Pending, in progress |
| Neutral | `#6B7280` | No documented answer |

### 8.2 Typography
- Font: **Inter** (fallback: system sans-serif).
- Sizes: page title 24/600, section title 18/600, body 14/400, caption 12/400.
- Navy for headings and body; `text-muted` for metadata.

### 8.3 Team accent colors (avatars and network nodes only)

| Team | Accent |
| --- | --- |
| Payroll | `#2E3A6E` (navy) |
| Benefits | `#0D9488` (teal) |
| Time & Attendance | `#7C3AED` (violet) |

### 8.4 Layout shell

```
┌────────────────────────────────────────────────────────────────────────┐
│ ◉ Heirloom       Search Heirloom…                  🔔  Jordan Kim ▾   │  ← navy top bar (56px)
├──────────────┬─────────────────────────────────────────────────────────┤
│ Home         │                                                         │
│ Ask          │                                                         │
│ Network      │                 Page content                            │
│ Inbox     3  │                 (white cards on light gray)             │
│ Knowledge    │                                                         │
│ Insights  2  │                                                         │
│ Ramp-up      │                                                         │
│ ──────────── │                                                         │
│ Team settings│                                                         │
└──────────────┴─────────────────────────────────────────────────────────┘
   ↑ white side nav (232px), active item: red left bar + navy-50 fill
```

- Top bar: navy background, white text, Heirloom wordmark at left, global search center, notifications and user menu right.
- Side nav: white, navy text, badge counts in red pills.
- Content: max width 1200px, 24px padding, cards with 8px radius, 1px border, no heavy shadows.

### 8.5 Components (shadcn/ui based)

| Component | Notes |
| --- | --- |
| Primary button | `adp-red` fill, white text, 6px radius |
| Secondary button | White fill, navy border and text |
| Card | White, 1px `border`, 8px radius, 16–24px padding |
| Badge | Pill, status color at 12% fill with full-color text |
| Source chip | Navy-50 fill, navy text, numbered, opens side panel |
| Agent avatar | 32px rounded square, team accent, white initial |
| Table | Zebra-free, row hover navy-50, sticky header |
| Side panel (sheet) | 480px right panel for sources and details |

## 9. Screens

### 9.1 Home

Personalized landing page.

```
┌ Good afternoon, Jordan ────────────────────────────────────────────┐
│ You're on: Time & Attendance · Ramp-up day 3 of 14                  │
└────────────────────────────────────────────────────────────────────┘
┌ Ask Time Keeper ────────────────────────────────────────────────────┐
│ [ Ask anything about your team or other teams…            ] [Ask]  │
│ Try: "How does overtime affect benefits eligibility?"               │
└────────────────────────────────────────────────────────────────────┘
┌ Your pending questions ──────┐ ┌ New insights (2) ───────────────────┐
│ • Retro pay + OT  · Maria ⏳ │ │ ⚑ Overlap: Payroll & Benefits both  │
│ • PTO accrual cap · answered │ │   building eligibility logic        │
└──────────────────────────────┘ └─────────────────────────────────────┘
```

### 9.2 Ask (team agent chat)
- Left: conversation with answer cards (section 7).
- Right (collapsible): **"How this was answered"** trace showing which agents were consulted, which sources were used, and latency.
- Agent picker at top: defaults to your team's agent; can switch to any agent you're allowed to ask.

### 9.3 Agent network
Live graph of agents and their conversations. **This is a demo centerpiece.**

```
            ┌───────────┐
            │  Time [T] │
            └─────┬─────┘
      asks ↙      │      ↘ asks
 ┌───────────┐    │    ┌────────────┐
 │Payroll [P]│◄───┴───►│Benefits [B]│
 └───────────┘         └────────────┘
```

- Nodes = team agents (team accent color). Edges animate when a question is in flight.
- Clicking an edge opens the exchange: question, shared sources, withheld items.
- Right panel: chronological log of all agent-to-agent calls (the audit log).
- Built with **React Flow**.

### 9.4 Inbox (experts and knowledge owners)
Two tabs:

**Questions for you**

| Question | From | Asked | Similar | Action |
| --- | --- | --- | --- | --- |
| How do retro pay corrections handle overtime? | Time Keeper (for Jordan) | 2h ago | 2 merged | [Answer] |

Answer composer: text box + **record voice note** button. After submit, shows the AI-structured draft for the expert to tweak.

**Knowledge PRs to review** (knowledge owners)

```
┌ Knowledge PR #14 · Payroll ────────────────────────────────────────┐
│ Q: How do retro pay corrections handle overtime?                    │
│ Proposed answer (structured from Maria's voice note):               │
│   Summary · Steps (3) · Caveats (1)                                 │
│ Share level: [ Cross-team ▾ ]   Expiry: [ 6 months ▾ ]              │
│ Answered by Maria Lopez · Source: voice note (0:48)                 │
│ [ Approve ]  [ Edit ]  [ Reject ]                                   │
└────────────────────────────────────────────────────────────────────┘
```

### 9.5 Knowledge (bus factor map)
- Treemap or grouped bubble map: topics grouped by team, size = how often asked, color = bus factor.
- Filters: team, status (red/amber/green), expiring soon.
- Clicking a topic opens a panel: entries, owners, people who know it, last verified, and **"Schedule capture session"** for red topics.
- Header stat row: "12 red topics · 31 amber · 84 green · 9 expiring this month."
- Visible to team leads only.

### 9.6 Insights
Two sections:

**From today's agent standup**

```
┌ ⚑ Overlap · Payroll ↔ Benefits · High confidence ──────────────────┐
│ Both teams are building employee eligibility logic this sprint.     │
│ Payroll: "Eligibility rules engine" (sprint 42 plan)          [src] │
│ Benefits: "New eligibility service" (design doc, Oct 10)      [src] │
│ Suggested: connect Raj Patel (Payroll) and Priya Nair (Benefits)    │
│ [ Useful ]  [ Not relevant ]  [ Start a thread ]                    │
└────────────────────────────────────────────────────────────────────┘
```

**Impact check**
- Input: "Describe a proposed change."
- Output: one card per affected team (concern, affected areas, sources, contact), plus "No impact found" for teams checked with nothing relevant.

### 9.7 Exit interview
- Started by a team lead for a departing member (consent checkbox required).
- Left: list of that person's sole-source topics, each with a progress state.
- Center: interview chat. The agent asks targeted questions one topic at a time.
- Right: live structured draft being built from the answers.
- End: person reviews everything, then it's submitted as knowledge PRs.

### 9.8 Ramp-up path
- Timeline of two weeks, grouped by dependent team.
- Each item: topic to learn (opens Ask with a prefilled question), person to meet, or a known gap.
- Progress checkboxes.

### 9.9 Team settings (knowledge owners)
- **Capability card:** what this team owns (editable list).
- **Default share level** and per-topic overrides.
- **Roster:** members, roles, owned areas.
- **Expiry defaults** by entry type.
- **Connected sources** (in the demo: uploaded files).

## 10. Architecture

```
┌────────────────────────── Next.js (frontend) ──────────────────────────┐
│ Home · Ask · Network · Inbox · Knowledge · Insights · Exit · Ramp-up   │
└───────────────┬───────────────────────────────────────▲────────────────┘
                │ REST + Server-Sent Events (live status, network edges)
┌───────────────▼───────────────────────────────────────┴────────────────┐
│                         FastAPI (orchestrator)                         │
│  Router: picks team agent → runs agent loop → streams status           │
│  Citation verifier · Dedupe · Routing to experts · Standup scheduler   │
└──────┬───────────────────┬────────────────────┬────────────────────────┘
       │ MCP               │ MCP                │ MCP
┌──────▼──────┐     ┌──────▼──────┐      ┌──────▼──────┐
│ Payroll     │◄───►│ Benefits    │◄────►│ Time        │   Team agent servers
│ agent (MCP) │     │ agent (MCP) │      │ agent (MCP) │   (same code, different team_id)
└──────┬──────┘     └──────┬──────┘      └──────┬──────┘
       └───────────────────┼────────────────────┘
                ┌──────────▼───────────┐       ┌──────────────────┐
                │ Supabase Postgres    │       │ Claude API       │
                │ + pgvector + Storage │       │ Whisper (voice)  │
                └──────────────────────┘       └──────────────────┘
```

### Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Frontend | Next.js (App Router), React, TypeScript | Fast to build, easy routing, deploys to Vercel |
| UI | Tailwind CSS, shadcn/ui, lucide-react icons | Clean enterprise components, easy theming |
| Graphs | React Flow (agent network), Recharts or D3 (bus factor treemap) | Interactive, good-looking visuals with little code |
| Backend | FastAPI (Python) | Best ecosystem for LLM, parsing, and audio |
| Agents | MCP servers (Python MCP SDK), one per team | Real, current agent-interop architecture; each agent is independently ownable |
| LLM | Claude API with tool use and structured JSON output | Agent reasoning, extraction, structuring voice notes, insights |
| Embeddings | Voyage AI or OpenAI `text-embedding-3-small` | Retrieval scoped per team |
| Database | Supabase Postgres + pgvector | Relational data and vector search in one place; free hosting |
| Files | Supabase Storage | Uploaded docs and voice notes |
| Voice | Whisper (API or local) | Transcribe expert voice notes |
| Parsing | pdfplumber (PDF), python-docx, markdown/text | Ingest team docs |
| Live updates | Server-Sent Events | Streaming status lines and network edge animation |
| Deploy | Vercel (frontend), Render or Railway (backend + MCP servers) | Free tiers, live URL for judges |

## 11. Agents

### 11.1 One codebase, many agents
Each team agent is the same MCP server started with a different `TEAM_ID`. Its knowledge is scoped by `team_id` in every query.

### 11.2 MCP tools each agent exposes

| Tool | Input | Output | Notes |
| --- | --- | --- | --- |
| `ask` | `question`, `asker_team`, `hop_chain` | Answer with sources, certainty labels, withheld items | Applies share policy for `asker_team` |
| `capability_card` | none | Team name, owned topics, contacts | Used for routing |
| `whats_in_progress` | none | Current projects and plans (from team docs) | Used in standups |
| `assess_impact` | `change_description`, `from_team` | Concerns, affected areas, sources, contact | Used in impact checks |
| `sole_source_topics` | `person_id` | Topics where this person is the only source | Used in exit interviews |

### 11.3 Orchestrator tools available to an agent while answering

| Tool | Purpose |
| --- | --- |
| `search_team_knowledge(query)` | Vector + keyword search over this team's sources and approved entries |
| `ask_agent(team, question)` | Calls another team's `ask` tool (blocked if team is already in `hop_chain` or chain length ≥ 2) |
| `route_to_expert(topic, question)` | Creates an inbox item for the best expert; returns pending status |
| `lookup_roster(query)` | People, roles, ownership on this team |

### 11.4 Answer flow

```
User question
  → Orchestrator picks the user's team agent
  → Agent searches its own knowledge
  → Needs another team? check capability cards → ask_agent (max 2 hops)
  → Other agent applies share policy → returns sources + withheld list
  → Agent composes answer from ORIGINAL sources (no paraphrase chains)
  → Citation verifier checks every quote exists in its source
  → Gaps? route_to_expert → mark section "no documented answer · pending"
  → Stream answer card to UI; log every agent call
```

### 11.5 System prompt (team agent)

```
You are {team_name} Keeper, the AI ambassador inside Heirloom for ADP's {team_name} team.

You answer ONLY from:
- this team's sources and approved knowledge entries (search_team_knowledge)
- answers returned by other team agents (ask_agent), using their original sources
- this team's roster (lookup_roster)

Rules:
- Lead with a one-sentence answer, then up to 4 supporting points.
- Every factual point must cite a source id with an exact supporting quote.
- Label each point: documented | expert_verified | no_documented_answer.
- If you cannot answer from sources, say so plainly and call route_to_expert.
- Never guess. Never invent people, numbers, rules, or dates.
- Ask another team's agent only if the question needs their domain. Check
  capability cards first. Never ask a team already in hop_chain.
- Pass through other teams' sources; never cite "the other agent" as a source.
- Respect withheld items: mention them and who to ask for access, never their content.
- Never output personal data about employees (pay, SSNs, addresses, health).
- Tone: plain, direct, brief. No filler, no emoji.

Return JSON matching the AnswerCard schema.
```

### 11.6 AnswerCard schema

```json
{
  "lead": "string",
  "points": [
    {
      "text": "string",
      "certainty": "documented | expert_verified | no_documented_answer",
      "citations": [{ "source_id": "uuid", "quote": "string" }]
    }
  ],
  "consulted_teams": ["benefits"],
  "verified_by": { "person": "Maria Lopez", "date": "2026-10-17" },
  "withheld": [{ "team": "benefits", "item": "vendor contract terms", "contact": "Priya Nair" }],
  "pending_expert": { "person": "Maria Lopez", "inbox_item_id": "uuid" }
}
```

### 11.7 Other prompts (summaries)
- **Voice note → knowledge PR:** turn a transcript into `{question, summary, steps[], caveats[], suggested_entry_type, suggested_expiry}`. Keep the expert's meaning; don't add facts.
- **Standup comparison:** given each team's `whats_in_progress`, return insights `{type: overlap|reuse|conflict, teams[], description, evidence[{team, source_id, quote}], confidence 0–1, suggested_contacts[]}`. Only return confidence ≥ 0.7.
- **Impact assessment:** from this team's perspective, list concerns with sources, or return `no_impact: true`.
- **Exit interview:** for each sole-source topic, ask one open question, then up to two follow-ups that fill gaps (steps, exceptions, who else to ask). One question at a time.

## 12. Data model

| Table | Key columns |
| --- | --- |
| `teams` | id, name, accent_color, capability_card (jsonb), default_share_level |
| `people` | id, name, title, team_id, role (`member` / `expert` / `lead`), is_departing |
| `topics` | id, name, team_id, co_owner_team_ids[] |
| `sources` | id, team_id, type (`doc` / `meeting` / `voice_note` / `expert_answer`), title, storage_path, text, created_at |
| `chunks` | id, source_id, team_id, text, start_offset, end_offset, embedding vector |
| `knowledge_entries` | id, team_id, topic_id, question, answer (jsonb), entry_type, share_level, status (`draft` / `approved` / `expired` / `conflicted`), verified_by, verified_at, expires_at |
| `entry_sources` | entry_id, source_id, quote |
| `knowledge_prs` | id, entry_id, proposed_by, reviewer_id, status (`open` / `approved` / `rejected`), diff (jsonb) |
| `inbox_items` | id, question, asker_person_id, via_team_id, expert_id, topic_id, status (`pending` / `answered` / `escalated`), merged_into_id, created_at |
| `agent_calls` | id, from_team, to_team, question, hop_chain[], shared_source_ids[], withheld (jsonb), latency_ms, created_at |
| `insights` | id, type (`overlap` / `reuse` / `conflict`), team_ids[], description, evidence (jsonb), confidence, status (`new` / `useful` / `not_relevant`) |
| `impact_checks` | id, from_team, change_description, results (jsonb) |
| `topic_knowers` | topic_id, person_id, role (`author` / `answerer` / `cited`) |
| `answer_deliveries` | entry_id, person_id, delivered_at (for correction notifications) |
| `contributions` | person_id, entry_id, helped_count |
| `exit_interviews` | id, person_id, started_by, consent_at, status, topic_ids[] |

**Bus factor** for a topic = `COUNT(DISTINCT person_id)` in `topic_knowers`.

## 13. API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/ask` | Ask a team agent. Streams status lines, then an AnswerCard (SSE). |
| GET | `/network/calls` | Agent-to-agent log. `/network/stream` (SSE) for live edges. |
| GET | `/inbox` | Current user's questions and PRs |
| POST | `/inbox/{id}/answer` | Expert answer (text or audio upload) → creates knowledge PR |
| POST | `/prs/{id}/approve` · `/reject` · `/edit` | Knowledge owner review |
| POST | `/entries/{id}/flag` | Flag an answer as wrong |
| GET | `/knowledge/map` | Topics with bus factor, status, ask counts |
| POST | `/standup/run` | Run agent standup now (demo button) |
| GET | `/insights` · POST `/insights/{id}/feedback` | Insights feed and useful/not relevant |
| POST | `/impact-check` | Run an impact check |
| POST | `/exit-interviews` · POST `/exit-interviews/{id}/message` | Start and run an exit interview |
| GET | `/rampup/{person_id}` | Generated ramp-up path |
| PUT | `/teams/{id}/settings` | Capability card, share defaults, expiry defaults |
| POST | `/sources/upload` | Upload team documents |

## 14. Seed data

All fictional. No real ADP data or real people.

### Teams and people

| Team | People |
| --- | --- |
| **Payroll** | Maria Lopez (Senior Payroll Specialist, sole expert on retro pay, departing), Raj Patel (Engineering Lead), Ana Torres (Knowledge Owner) |
| **Benefits** | Priya Nair (Team Lead, Knowledge Owner), Marcus Hill (Eligibility Engineer), Lena Park (Scrum Master) |
| **Time & Attendance** | Sam Okafor (Engineering Lead), Jordan Kim (new member, the demo user), Chloe Reyes (Product Manager) |

### Documents per team (8–10 each)
- Process guides (e.g., "Payroll Calculation Guide," "Benefits Eligibility Rules," "Overtime Policy")
- Sprint plans and design docs (what each team is building)
- Meeting notes (with noise: scheduling, unrelated discussion)
- FAQ pages with a few outdated entries

### Planted scenarios (the demo depends on these)

| Scenario | Where it lives |
| --- | --- |
| **Sole-source topic:** retro pay corrections with overtime is undocumented; only Maria has answered questions on it | Payroll: a few chat-style notes citing Maria, no guide section |
| **Overlap:** Payroll's sprint 42 plan includes an "eligibility rules engine"; Benefits has a design doc for a "new eligibility service" | Payroll sprint plan + Benefits design doc |
| **Reuse:** Time already built an overtime calculator; Payroll's roadmap lists building one | Time design doc + Payroll roadmap |
| **Conflict:** Payroll docs calculate overtime weekly; Benefits eligibility rules assume biweekly hours | Payroll Overtime Policy + Benefits Eligibility Rules |
| **Withheld item:** Benefits vendor contract terms are `team`-only | Benefits doc with share level `team` |
| **Expired entry:** a Time FAQ answer last verified 8 months ago | Time knowledge entry |
| **Conflicting experts:** two Payroll answers on PTO payout timing disagree | Two approved Payroll entries |

## 15. Demo script

Five minutes. Rehearse it with demo mode on (shortened timeouts, "Run standup now" button).

| Time | Beat | What happens on screen |
| --- | --- | --- |
| 0:00 | **The risk** | Knowledge map: "Retro pay corrections" is red. "Only Maria knows this, and Maria gave notice yesterday." |
| 0:40 | **The capture** | Start exit interview for Maria (consent checked). Heirloom asks 2 targeted questions. Maria answers one by voice note. It becomes a knowledge PR; Ana approves it. The topic turns amber. |
| 1:50 | **The payoff** | Switch to Jordan (Time team). Ask: "How do retro pay corrections handle overtime, and does it affect benefits eligibility?" Network screen lights up: Time asks Payroll and Benefits. Answer card shows Maria's verified answer, a Benefits source, and a withheld notice for vendor terms. |
| 3:00 | **The gap** | One follow-up has no documented answer. It's routed to Marcus (Benefits). Answer it in the inbox, approve, ask again: instant answer. |
| 3:40 | **The wow** | Click "Run standup now." Insights show the Payroll/Benefits eligibility overlap and the overtime calculator reuse. Run an impact check on the overtime rounding change; Payroll and Benefits return different concerns, including the weekly vs. biweekly conflict. |
| 4:40 | **Close** | "Heirloom makes sure knowledge outlives the people who hold it, and reaches the teams who need it." |

## 16. Judge Q&A

**Why not one agent with all the docs?**
Because each team owns its knowledge. Each team keeps its agent accurate, decides what it shares, and is the clear owner when something's wrong. One giant agent has no owner, so nobody maintains it. Separate agents also make proactive standups and impact checks possible, since each agent speaks for its team.

**What about sensitive payroll and benefits data?**
Heirloom stores process knowledge, not employee records. It knows how deductions work, not what anyone earns. Each team controls what its agent shares, and withheld items are shown explicitly.

**What if a remembered answer becomes wrong?**
Every entry has an owner, a verified date, and an expiry by type. Anyone can flag an answer, and corrections notify everyone who received the old version.

**Won't experts get flooded with questions?**
Duplicate questions are merged, each expert has a cap, and once answered, the question never reaches them again. Overload on one person shows up as risk on the bus factor map.

**How is this different from Glean or Copilot?**
Those search what's already written down. Heirloom captures what was never written down, assigns ownership per team, and proactively spots overlaps and conflicts between teams.

**Does the bus factor map make people feel replaceable?**
It's visible to team leads only and framed as organizational risk. Exit interviews are voluntary and reviewed by the person before saving. Contributors get visible credit.

## 17. Success metrics

- % of questions answered without a human
- Median time to answer (instant vs. routed)
- Red topics turned green per month
- Repeat questions avoided (dedupe + learned answers)
- Overlaps and reuse found before work was duplicated
- Expert answers reused (helped count)

## 18. Repo structure

```
heirloom/
├── apps/
│   └── web/                      # Next.js frontend
│       ├── app/
│       │   ├── (shell)/layout.tsx       # top bar + side nav
│       │   ├── page.tsx                 # Home
│       │   ├── ask/page.tsx
│       │   ├── network/page.tsx
│       │   ├── inbox/page.tsx
│       │   ├── knowledge/page.tsx
│       │   ├── insights/page.tsx
│       │   ├── exit-interview/[id]/page.tsx
│       │   ├── rampup/page.tsx
│       │   └── settings/page.tsx
│       ├── components/
│       │   ├── answer-card.tsx
│       │   ├── source-chip.tsx
│       │   ├── verified-badge.tsx
│       │   ├── withheld-notice.tsx
│       │   ├── agent-avatar.tsx
│       │   ├── network-graph.tsx
│       │   └── bus-factor-map.tsx
│       └── tailwind.config.ts
├── services/
│   ├── api/                      # FastAPI orchestrator
│   │   ├── main.py
│   │   ├── routes/
│   │   ├── orchestrator.py       # agent loop, hop rules, SSE
│   │   ├── citations.py          # quote verification
│   │   ├── routing.py            # expert selection, dedupe, caps, escalation
│   │   ├── standup.py
│   │   ├── impact.py
│   │   └── ingest.py             # parsing, chunking, embeddings
│   └── team-agent/               # MCP server (run once per TEAM_ID)
│       ├── server.py
│       ├── tools.py
│       └── prompts.py
├── db/
│   ├── schema.sql
│   └── seed/
│       ├── teams.json
│       ├── people.json
│       └── docs/{payroll,benefits,time}/*.md
└── README.md
```

### Tailwind theme

```ts
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      adp: {
        red: "#D0271D",
        "red-bright": "#EE2722",
        "red-dark": "#A81E16",
        navy: "#121C4E",
        "navy-700": "#2E3A6E",
        "navy-50": "#EEF0F6",
      },
      surface: { DEFAULT: "#FFFFFF", muted: "#F5F6F9" },
      border: "#DDE0E8",
      muted: "#5B6278",
      status: {
        good: "#16A34A",
        warn: "#D97706",
        critical: "#B91C1C",
        info: "#2563EB",
        neutral: "#6B7280",
      },
      team: { payroll: "#2E3A6E", benefits: "#0D9488", time: "#7C3AED" },
    },
    fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    borderRadius: { card: "8px" },
  },
},
```

## 19. Build order

Build the core loop first, then layer features. Each milestone should be demoable on its own.

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | **Foundation** | Schema, seed data, ingestion with embeddings, app shell with ADP-inspired theme |
| 2 | **Single-agent answers** | Ask Payroll Keeper; answer cards with verified citations |
| 3 | **Agent-to-agent** | MCP servers for 3 teams; `ask_agent` with hop rules, share policy, withheld notices; network screen with live edges |
| 4 | **Learning loop** | Route to expert, inbox, voice note → knowledge PR, approve, instant re-answer |
| 5 | **Trust features** | Expiry and re-confirmation, flag as wrong + correction notifications, conflicting-experts state |
| 6 | **Bus factor map + exit interview** | Map colored by bus factor; exit interview creates PRs; topic color updates |
| 7 | **Insights** | Standup run with planted overlap/reuse/conflict; impact check |
| 8 | **Ramp-up + credit** | Ramp-up path generation; contributor impact |
| 9 | **Polish + rehearse** | Demo mode, loading states, empty states, rehearsed 5-minute script, deployed URL |

If anything slips, protect milestones 2–4 and 7. That's the demo.

## 20. Out of scope

- Real integrations with Teams, Outlook, Slack, or ADP systems (uploaded files stand in; mention integrations in the pitch)
- Real authentication (use a user switcher in the top bar for the demo)
- Real employee data of any kind
- Agents taking actions in external systems
