"""Offline LLM provider: deterministic and scripted for the §14/§15 scenarios.

It never writes facts of its own. Answers, insights, and impact concerns are built
from sentences that exist in the evidence it is given, and quotes are exact spans,
so the same citation verifier runs on mock output as on Claude output.
"""
import re
from typing import Dict, List, Optional, Tuple

from text import clean, jaccard, sentence_spans, tokens

UNCERTAIN = re.compile(
    r"\?|\b(nobody knew|unknown|not resolved|not discussed|parked|tbd|not sure|needs follow-up|keep meaning|"
    r"not reviewed|isn't, honestly|outdated|not covered|asked whether|asked if|question from)\b|^see\b",
    re.I,
)
SUBQ_SPLIT = re.compile(r",?\s+and\s+(?=(?:does|do|is|are|can|will|how|what|when|who|why|should|would)\b)|\?\s*", re.I)
# Verbs that frame a question but carry no content ("how does X affect Y").
QUESTION_VERBS = {"affect", "handl", "happen", "work", "mean", "matter", "deal", "treat", "impact", "relat", "involv"}
TYPE_WEIGHT = {"doc": 1.0, "expert_answer": 1.0, "voice_note": 1.0, "meeting": 0.8}


def _line(text: str, start: int) -> str:
    a = text.rfind("\n", 0, start) + 1
    b = text.find("\n", start)
    return text[a : b if b >= 0 else len(text)]


def _prev_question(text: str, start: int) -> str:
    """The FAQ question line just above a sentence's line, if any (answers inherit its terms)."""
    a = text.rfind("\n", 0, start)
    lines = text[:a].rstrip("\n").split("\n") if a > 0 else []
    prev = lines[-1].strip() if lines else ""
    return prev if prev.rstrip("*").endswith("?") else ""


def _candidates(evidence: List[Dict], include_uncertain: bool = False):
    """(evidence, start, end, raw sentence, token set) for every usable sentence."""
    out = []
    for ev in evidence:
        text = ev["text"]
        for s, e in sentence_spans(text):
            raw = text[s:e]
            if len(raw.split()) < 4:
                continue
            if not include_uncertain and (UNCERTAIN.search(raw) or "(Outdated" in _line(text, s)):
                continue
            out.append((ev, s, e, raw, set(tokens(raw + " " + _prev_question(text, s)))))
    return out


_IDF: Dict[str, float] = {}


def _set_idf(cands) -> None:
    import math

    df: Dict[str, int] = {}
    for c in cands:
        for t in c[4]:
            df[t] = df.get(t, 0) + 1
    n = max(len(cands), 1)
    _IDF.clear()
    _IDF.update({t: math.log(1 + n / f) for t, f in df.items()})


def _coverage(q: set, sent: set) -> float:
    """Share of the question's terms the sentence covers, weighted by how specific each term is."""
    # Terms no passage uses can't tell sentences apart, so they are left out, unless
    # most of the question is unseen, in which case nothing here answers it.
    seen = {t for t in q if t in _IDF} if _IDF else set(q)
    if not seen or len(seen) < len(q) / 2:
        return 0.0
    return sum(_IDF.get(t, 1.0) for t in seen & sent) / sum(_IDF.get(t, 1.0) for t in seen)


def _card_tokens(card: Dict) -> set:
    words = card.get("summary", "") + " " + " ".join(t.replace("-", " ") for t in card.get("owned_topics", []))
    return set(tokens(words + " " + card.get("name", "")))


def split_question(q: str) -> List[str]:
    parts = [p.strip(" ,.") for p in SUBQ_SPLIT.split(q) if p and p.strip(" ,.")]
    return [p for p in parts if len(tokens(p)) >= 1] or [q]


class MockLLM:
    name = "mock"
    live = False

    # ---------------------------------------------------------------- routing
    def route(self, question: str, asking_team: str, cards: Dict[str, Dict]) -> List[str]:
        q = set(tokens(question))
        others = {t: _card_tokens(c) for t, c in cards.items() if t != asking_team}
        # A term shared by every candidate card says nothing about which team to ask.
        df: Dict[str, int] = {}
        for toks in others.values():
            for tok in toks:
                df[tok] = df.get(tok, 0) + 1
        scored = []
        for t, toks in others.items():
            score = sum(1.0 / df[tok] for tok in q & toks if df[tok] < len(others) or len(others) == 1)
            scored.append((score, t))
        return [t for s, t in sorted(scored, reverse=True) if s >= 1]

    # ---------------------------------------------------------------- answers
    def compose_answer(self, question, agent_team, team_name, evidence, cards) -> Dict:
        cands = _candidates(evidence)
        all_cands = _candidates(evidence, include_uncertain=True)
        _set_idf(all_cands)
        points, used, gaps = [], set(), []

        def weight(c):
            ev, raw = c[0], c[3]
            vouched = ev.get("entry_status") in ("approved", "expired", "conflicted") or any(
                q and (q in raw or raw in q) for q in ev.get("verified_quotes", []))
            return TYPE_WEIGHT.get(ev.get("type"), 1.0) + (0.15 if vouched else 0.0)

        qt_all = set(tokens(question)) - QUESTION_VERBS

        def add_point(c, cov):
            ev, s, e, raw, _ = c
            used.add((ev["source_id"], s))
            points.append({
                "text": clean(raw),
                "certainty": "documented",  # recomputed in code from entry status
                "citations": [{"source_id": ev["source_id"], "quote": raw}],
                "_score": cov,
            })

        for sq in split_question(question):
            qt = set(tokens(sq)) - QUESTION_VERBS
            if not qt:
                continue
            best = max(cands, key=lambda c: (round(_coverage(qt, c[4]) * weight(c), 3),
                                              round(_coverage(qt_all, c[4]), 3), min(len(c[3]), 160)), default=None)
            cov = _coverage(qt, best[4]) if best else 0.0
            if best and cov >= 0.55:
                if (best[0]["source_id"], best[1]) not in used:
                    add_point(best, cov)
            else:
                gaps.append({"team": self._gap_team(qt, all_cands, cards, agent_team), "question": question, "part": sq})

        # Up to 4 points: add strong supporting sentences from other sources.
        extras = sorted(cands, key=lambda c: -_coverage(qt_all, c[4]) * weight(c))
        cited_sources = {p["citations"][0]["source_id"] for p in points}
        for c in extras:
            if len(points) >= 4:
                break
            if (c[0]["source_id"], c[1]) in used or c[0]["source_id"] in cited_sources:
                continue
            if _coverage(qt_all, c[4]) >= 0.75:
                add_point(c, _coverage(qt_all, c[4]))
                cited_sources.add(c[0]["source_id"])

        for g in gaps:
            points.append({
                "text": f"No documented answer yet for: {g['part'][0].upper() + g['part'][1:]}.",
                "certainty": "no_documented_answer",
                "citations": [],
            })
        answered = [p for p in points if p["certainty"] != "no_documented_answer"]
        lead = answered[0]["text"] if answered else "I don't have a documented answer for this yet."
        if answered and len(answered) > 1 and lead == answered[0]["text"]:
            answered[0]["_lead"] = True
        for p in points:
            p.pop("_score", None)
            p.pop("_lead", None)
        return {"lead": lead, "points": points, "gaps": [{"team": g["team"], "question": g["question"]} for g in gaps]}

    def _gap_team(self, qt: set, cands, cards: Dict[str, Dict], agent_team: str) -> str:
        scores = {t: len(qt & _card_tokens(c)) for t, c in cards.items()}
        best_ev = max(cands, key=lambda c: _coverage(qt, c[4]), default=None)
        if best_ev and _coverage(qt, best_ev[4]) > 0:
            t = best_ev[0]["team"]
            scores[t] = scores.get(t, 0) + 0.5
        if not scores or max(scores.values()) == 0:
            return agent_team
        return max(scores, key=lambda t: scores[t])

    # ------------------------------------------------- expert answer → PR draft
    CAVEAT = re.compile(r"\b(don't|do not|never|unless|except|careful|watch out|make sure|only if|but|beware)\b", re.I)
    STEP = re.compile(
        r"^(first|then|next|after that|finally|second|third|pay|find|recompute|recalculate|run|send|check|enter|code|"
        r"submit|open|create|update|notify|record|add|apply|use|compare|confirm|escalate|ask)\b",
        re.I,
    )

    def structure_answer(self, question: str, transcript: str, expert_name: str) -> Dict:
        sents = [clean(transcript[s:e]) for s, e in sentence_spans(transcript)] or [transcript.strip()]
        summary, steps, caveats = [], [], []
        for s in sents:
            if self.CAVEAT.search(s) and summary:
                caveats.append(s)
            elif self.STEP.search(s) and summary:
                steps.append(s)
            elif len(summary) < 2 and not steps:
                summary.append(s)
            else:
                steps.append(s)
        if len(summary) == 1 and len(summary[0].split()) <= 2 and steps:  # "Yes." + the real answer
            summary.append(steps.pop(0))
        regulation = re.search(r"\b(law|irs|flsa|regulation|statute|tax rule|withholding)\b", transcript, re.I)
        return {
            "question": question,
            "summary": " ".join(summary),
            "steps": steps,
            "caveats": caveats,
            "entry_type": "regulation" if regulation else "process",
        }

    # ------------------------------------------------------------- standups
    STANDUP_SCRIPT = [
        {
            "type": "overlap",
            "title": "Payroll and Benefits are both building eligibility logic",
            "description": "Both teams are building employee eligibility logic this sprint: Payroll's eligibility rules "
                           "engine and Benefits' new eligibility service evaluate the same inputs.",
            "evidence": [
                ("payroll", "This sprint we start an eligibility rules engine that evaluates employee eligibility from hours worked, employment status, and waiting periods."),
                ("benefits", "Build a new eligibility service: a standalone service that evaluates employee eligibility for benefits from hours, employment status, and waiting periods, and exposes the result through an API."),
            ],
            "confidence": 0.92,
            "suggested_contacts": ["raj-patel", "priya-nair"],
        },
        {
            "type": "reuse",
            "title": "Payroll plans an overtime calculator that Time already runs",
            "description": "Payroll's roadmap includes building an overtime calculator. Time & Attendance already runs one "
                           "in production with an internal API any team can call.",
            "evidence": [
                ("time", "ClockLine has a built-in overtime calculator."),
                ("time", "Any team can call it."),
                ("payroll", "We plan to build our own overtime calculator so PayCore can compute weekly and daily overtime from raw hours, handle state rules, and stop depending on ClockLine's overtime split."),
            ],
            "confidence": 0.88,
            "suggested_contacts": ["sam-okafor", "raj-patel"],
        },
        {
            "type": "conflict",
            "title": "Weekly overtime vs. biweekly eligibility hours",
            "description": "Payroll calculates overtime per workweek, but Benefits eligibility assumes hours arrive as "
                           "biweekly totals. A two-week period can satisfy one rule and not the other.",
            "evidence": [
                ("payroll", "Overtime is calculated weekly."),
                ("benefits", "BenHub assumes all hours arrive as biweekly totals; it does not look at individual workweeks."),
            ],
            "confidence": 0.81,
            "suggested_contacts": ["ana-torres", "marcus-hill"],
        },
        {
            # Deliberately below the threshold: shows that code filters weak insights.
            "type": "overlap",
            "title": "Both teams have notification work",
            "description": "Benefits and Time both mention notification work this sprint.",
            "evidence": [
                ("benefits", "COBRA notice template update (2 points)"),
                ("time", "Shift swap notifications (3 points)"),
            ],
            "confidence": 0.45,
            "suggested_contacts": [],
        },
    ]

    def standup(self, progress: Dict[str, Dict]) -> List[Dict]:
        out = []
        for ins in self.STANDUP_SCRIPT:
            evidence = []
            for team, quote in ins["evidence"]:
                src = self._find_quote(progress.get(team, {}).get("evidence", []), quote)
                if src:
                    evidence.append({"team": team, "source_id": src, "quote": quote})
            teams = sorted({e["team"] for e in evidence})
            if len(teams) >= 2 and len(evidence) == len(ins["evidence"]):
                out.append({**{k: v for k, v in ins.items() if k != "evidence"}, "teams": teams, "evidence": evidence})
        return out

    @staticmethod
    def _find_quote(evidence: List[Dict], quote: str) -> Optional[str]:
        for ev in evidence:
            if quote in ev["text"]:
                return ev["source_id"]
        return None

    # --------------------------------------------------------- impact checks
    IMPACT_SCRIPT = {
        "rounding": {
            "payroll": {
                "summary": "Rounding changes the overtime hours Payroll pays, week by week.",
                "concerns": [
                    ("Payroll pays overtime from ClockLine's rounded hours, so a 15-minute interval changes overtime pay directly.",
                     ["Payroll uses the approved hours delivered by ClockLine."]),
                    ("Overtime is decided per workweek, so the change can push individual weeks over or under 40 hours.",
                     ["Overtime is calculated weekly."]),
                ],
                "affected_areas": ["Overtime pay", "Retro pay corrections", "Exceptions dashboard"],
            },
            "benefits": {
                "summary": "Rounding shifts the biweekly hour totals that decide eligibility, and Benefits measures hours differently from Payroll.",
                "concerns": [
                    ("Eligibility is decided on biweekly totals, so rounding can move part-time employees across the 60-hour threshold.",
                     ["An employee meets the threshold when they have 60 or more eligible hours in the biweekly period, which equals an average of 30 hours per week."]),
                    ("Benefits looks at biweekly totals while Payroll calculates overtime weekly, so the two teams will see the change differently.",
                     ["BenHub assumes all hours arrive as biweekly totals; it does not look at individual workweeks."]),
                ],
                "affected_areas": ["Benefits eligibility", "Hours threshold", "Loss of eligibility"],
            },
        }
    }

    def assess_impact(self, team_id, team_name, change, from_team, evidence) -> Dict:
        key = "rounding" if re.search(r"\bround", change, re.I) else None
        script = self.IMPACT_SCRIPT.get(key, {}).get(team_id) if key else None
        if script:
            concerns = []
            for text, quotes in script["concerns"]:
                cits = [{"source_id": sid, "quote": q} for q in quotes if (sid := self._find_quote(evidence, q))]
                if cits:
                    concerns.append({"text": text, "citations": cits})
            if concerns:
                return {"no_impact": False, "summary": script["summary"], "concerns": concerns,
                        "affected_areas": script["affected_areas"]}
        # Generic: sentences that share most of the change's key terms.
        ct = set(tokens(change))
        _set_idf(_candidates(evidence, include_uncertain=True))
        cands = sorted(_candidates(evidence), key=lambda c: -_coverage(ct, c[4]))
        concerns = [
            {"text": clean(c[3]), "citations": [{"source_id": c[0]["source_id"], "quote": c[3]}]}
            for c in cands[:2] if _coverage(ct, c[4]) >= 0.4
        ]
        if not concerns:
            return {"no_impact": True, "summary": "No impact found in this team's documented knowledge.",
                    "concerns": [], "affected_areas": []}
        return {"no_impact": False, "summary": f"{team_name} documentation touches this change.",
                "concerns": concerns, "affected_areas": []}

    # -------------------------------------------------------- exit interviews
    EXIT_SCRIPT = {
        "retro-pay-overtime": [
            "Walk me through how you handle a retro pay correction when overtime hours change. What are the steps?",
            "What mistakes or exceptions should someone watch for, and who else could handle this if you're not here?",
        ],
    }

    def exit_question(self, topic: Dict, person_name: str, history: List[Dict]) -> Dict:
        asked = [m for m in history if m["role"] == "agent"]
        script = self.EXIT_SCRIPT.get(topic["id"]) or [
            f"Walk me through how you handle {topic['name'].lower()}. What are the steps, start to finish?",
            "What exceptions or common mistakes should someone watch for, and who else could answer questions on this?",
        ]
        if len(asked) >= len(script):
            return {"done": True, "question": ""}
        return {"done": False, "question": script[len(asked)]}

    # ------------------------------------------------------------- conflicts
    def detect_conflict(self, a: Dict, b: Dict) -> Dict:
        same_q = jaccard(tokens(a["question"]), tokens(b["question"])) >= 0.3
        ans_sim = jaccard(tokens(a["answer"].get("summary", "")), tokens(b["answer"].get("summary", "")))
        if same_q and ans_sim < 0.5:
            return {"conflict": True, "reason": "Both entries answer the same question with different instructions."}
        return {"conflict": False, "reason": ""}
