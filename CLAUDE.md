# Heirloom

The full build spec is **[heirloom/docs/SPEC.md](heirloom/docs/SPEC.md)**. It is the source of truth for product, behavior, UI, architecture, data, seed content, and demo. Read the relevant sections before starting any task. If the spec and this file disagree, ask.

The project lives in `heirloom/`, laid out as in SPEC §18.

## Rules

1. **Build in milestone order (SPEC §19).** Finish and demo each milestone before starting the next. Don't build ahead.
2. **Protect milestones 2, 3, 4, and 7.** They are the demo (single-agent answers, agent-to-agent, learning loop, insights). If time is short, cut or simplify other milestones first, never these.
3. **SPEC §6 behavior rules go in backend code, not just the UI.** Hop limits and loop prevention, share-level filtering and withheld lists, certainty labels, expiry, expert caps, dedupe, timeouts/escalation, logging of every agent call, and personal-data rejection are all enforced in `services/`. The frontend only displays what the backend decided.
4. **Verify citations in code.** After the model returns a quote, `services/api/citations.py` checks that the exact string exists in the cited source. Drop or flag any that don't. Never trust a model-provided quote unchecked.
5. **Use the design tokens in `heirloom/apps/web/tailwind.config.ts` and `app/globals.css`.** They replace the SPEC §8/§18 theme (restyle, Oct 2026): Hanken Grotesk + Newsreader, navy-950 rail, pill tone pairs, team colors. No hex values in components; reuse the shared primitives in `components/ui/` (Pill, Avatar, Card, Segmented, Button, NavItem). Sentence case, 44px touch targets, 2px red focus outline, respect reduced motion. No ADP logo or trademarks in the product UI.
6. **All seed data is fictional.** No real ADP data, real people, or real employee records (pay, SSNs, addresses, health). Use only the fictional people and teams in SPEC §14.
