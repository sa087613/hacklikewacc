"""Tokenizing, sentence spans, and similarity shared by search, dedupe, and the mock LLM."""
import math
import re
from collections import Counter
from typing import Dict, Iterable, List, Sequence, Tuple

STOPWORDS = set(
    """a an and are as at be been by can do does did for from has have how i if in into is it its
    me my of on or our so than that the their them then there these they this to was we were what
    when where which who why will with you your about after again all also any because before being
    between both but each few more most no not now only other over same should some such too under
    until up very would re us get got just one two let make made need needs per via vs""".split()
)
SYNONYMS = {"ot": "overtime", "recheck": "check", "rechecks": "check", "retroactive": "retro", "retroactively": "retro"}


def stem(w: str) -> str:
    w = SYNONYMS.get(w, w)
    if w.endswith("ly") and len(w) > 5:  # weekly -> week, separately -> separate
        w = w[:-2]
    if w.endswith("ies") and len(w) > 4:
        w = w[:-3] + "y"
    elif w.endswith("ing") and len(w) > 5:
        w = w[:-3]
    elif w.endswith("ed") and len(w) > 4:
        w = w[:-2]
    elif w.endswith("es") and len(w) > 4 and w[-3] in "sxz":
        w = w[:-2]
    elif w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        w = w[:-1]
    if w.endswith("e") and len(w) > 4:
        w = w[:-1]
    return w


def tokens(text: str) -> List[str]:
    out = []
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in STOPWORDS or len(w) < 2:
            continue
        s = stem(w)
        if s not in STOPWORDS:
            out.append(s)
    return out


def jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def similarity(a: str, b: str) -> float:
    return jaccard(tokens(a), tokens(b))


_LINE_PREFIX = re.compile(r"^(\s*(#+|[-*]|\d+\.)\s+)")
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"*(`])")


def sentence_spans(text: str) -> List[Tuple[int, int]]:
    """Spans of sentences in text, with list/heading markers excluded.

    text[start:end] is always an exact substring, so a sentence can be used as a quote.
    """
    spans = []
    pos = 0
    for line in text.split("\n"):
        start = pos
        pos += len(line) + 1
        m = _LINE_PREFIX.match(line)
        if m and m.group(2).startswith("#"):
            continue  # headings are labels, not claims
        offset = m.end() if m else 0
        body = line[offset:]
        if not body.strip():
            continue
        cursor = 0
        parts = _SENT_SPLIT.split(body)
        for part in parts:
            idx = body.index(part, cursor)
            cursor = idx + len(part)
            s = part.strip()
            if len(s) < 3:
                continue
            lead = part.index(s)
            spans.append((start + offset + idx + lead, start + offset + idx + lead + len(s)))
    return spans


def clean(s: str) -> str:
    """Readable form of a quoted span: markdown emphasis and labels removed."""
    s = re.sub(r"\*\*([^*]+):\*\*\s*", "", s)  # "**Maria Lopez:** " labels
    s = s.replace("**", "").replace("`", "")
    return s.strip()


def normalize_quote(s: str) -> str:
    """Whitespace and typographic-quote normalization used by citation verification."""
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


class BM25:
    def __init__(self, docs: Sequence[List[str]], k1: float = 1.4, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs = [Counter(d) for d in docs]
        self.lens = [len(d) for d in docs]
        self.avg = (sum(self.lens) / len(self.lens)) if self.lens else 0.0
        df: Dict[str, int] = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = len(docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def score(self, query: List[str], i: int) -> float:
        d, ln = self.docs[i], self.lens[i]
        s = 0.0
        for t in set(query):
            f = d.get(t)
            if not f:
                continue
            s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * ln / (self.avg or 1)))
        return s

    def scores(self, query: List[str]) -> List[float]:
        return [self.score(query, i) for i in range(len(self.docs))]
