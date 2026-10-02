"""Parse raw sources into one tidy match table with unified team ids.

Team ids are "CTY:Name" using the openfootball European-competition spelling when a
club has played in Europe, so domestic and European results land on the same club.
Domestic-only clubs keep their source spelling.
"""
from __future__ import annotations

import csv
import os
import difflib
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

RAW = Path(__file__).parent / "raw"

FD_COUNTRY = {
    "E0": "ENG", "SP1": "ESP", "D1": "GER", "I1": "ITA", "F1": "FRA", "N1": "NED",
    "P1": "POR", "B1": "BEL", "T1": "TUR", "G1": "GRE", "SC0": "SCO",
    "NOR": "NOR", "AUT": "AUT", "DNK": "DEN", "SWZ": "SUI", "POL": "POL", "ROU": "ROU", "SWE": "SWE",
}
OFDOM_COUNTRY = {"az1": "AZE", "cz1": "CZE", "sk1": "SVK", "ua1": "UKR"}
MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}

# Hand fixes where fuzzy matching is unreliable: (country, source name) -> European spelling.
MANUAL = {
    ("ENG", "Man City"): "Manchester City FC",
    ("ENG", "Man United"): "Manchester United FC",
    ("ENG", "Nott'm Forest"): "Nottingham Forest FC",
    ("ENG", "Wolves"): "Wolverhampton Wanderers FC",
    ("ENG", "Tottenham"): "Tottenham Hotspur FC",
    ("ESP", "Ath Madrid"): "Club Atlético de Madrid",
    ("ESP", "Ath Bilbao"): "Athletic Club",
    ("ESP", "Betis"): "Real Betis Balompié",
    ("ESP", "Sociedad"): "Real Sociedad de Fútbol",
    ("ESP", "Celta"): "RC Celta de Vigo",
    ("ESP", "Vallecano"): "Rayo Vallecano de Madrid",
    ("ESP", "Espanol"): "RCD Espanyol de Barcelona",
    ("GER", "Bayern Munich"): "FC Bayern München",
    ("GER", "Dortmund"): "Borussia Dortmund",
    ("GER", "M'gladbach"): "VfL Borussia Mönchengladbach",
    ("GER", "Ein Frankfurt"): "Eintracht Frankfurt",
    ("GER", "Leverkusen"): "Bayer 04 Leverkusen",
    ("GER", "RB Leipzig"): "RB Leipzig",
    ("GER", "Stuttgart"): "VfB Stuttgart",
    ("ITA", "Inter"): "FC Internazionale Milano",
    ("ITA", "Milan"): "AC Milan",
    ("ITA", "Roma"): "AS Roma",
    ("ITA", "Napoli"): "SSC Napoli",
    ("ITA", "Lazio"): "SS Lazio",
    ("FRA", "Paris SG"): "Paris Saint-Germain FC",
    ("FRA", "Lens"): "RC Lens",
    ("FRA", "Lille"): "LOSC Lille",
    ("FRA", "Marseille"): "Olympique de Marseille",
    ("FRA", "Lyon"): "Olympique Lyonnais",
    ("FRA", "Monaco"): "AS Monaco FC",
    ("POR", "Sp Lisbon"): "Sporting Clube de Portugal",
    ("POR", "Sp Braga"): "SC Braga",
    ("POR", "Benfica"): "Sport Lisboa e Benfica",
    ("POR", "Porto"): "FC Porto",
    ("POR", "Guimaraes"): "Vitória SC",
    ("NED", "PSV Eindhoven"): "PSV",
    ("NED", "AZ Alkmaar"): "AZ Alkmaar",
    ("BEL", "St. Gilloise"): "Royale Union Saint-Gilloise",
    ("TUR", "Besiktas"): "Beşiktaş JK",
    ("TUR", "Fenerbahce"): "Fenerbahçe SK",
    ("TUR", "Galatasaray"): "Galatasaray SK",
    ("TUR", "Buyuksehyr"): "İstanbul Başakşehir FK",
    ("GRE", "AEK"): "AEK Athens FC",
    ("GRE", "Olympiakos"): "PAE Olympiakos SFP",
    ("NOR", "Bodo/Glimt"): "FK Bodø/Glimt",
    ("AUT", "LASK"): "LASK",
    ("AUT", "Salzburg"): "FC Red Bull Salzburg",
}

STOP = {
    "fc", "cf", "sc", "afc", "ac", "as", "ssc", "sk", "fk", "pfk", "kv", "bc", "sv", "vfb", "vfl", "rc",
    "cd", "ud", "sd", "ca", "club", "de", "the", "pae", "sfp", "jk", "if", "bk", "ff", "ik", "nk", "gnk",
    "hnk", "cfr", "ss", "us", "1", "04", "05", "1899", "1909", "1846", "aik", "ks", "ofk", "sport",
}


TRANSLIT = str.maketrans({"ø": "o", "Ø": "O", "ß": "ss", "æ": "ae", "ł": "l", "Ł": "L", "ı": "i", "đ": "d", "ð": "d", "þ": "th"})


def norm(s: str) -> str:
    s = s.translate(TRANSLIT)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(t for t in s.split() if t not in STOP)


@dataclass
class Match:
    date: date
    home: str  # "CTY:Name"
    away: str
    hg: int
    ag: int
    comp: str  # "dom:ENG", "UCL", "UEL", "UECL"
    stage: str
    neutral: bool


# --------------------------------------------------------------------------- openfootball
LINE = re.compile(r"^\s*(?:\d{1,2}[:.]\d{2}\s+)?(.+?)\s+v\s+(.+?)\s{2,}(\d+)-(\d+)(.*)$")
DATE = re.compile(r"^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?")
TEAM_CTY = re.compile(r"^(.*?)\s*\(([A-Z]{3})\)\s*$")


def parse_of(path: Path, comp: str, start_year: int, country: str | None = None) -> list[Match]:
    out: list[Match] = []
    cur: date | None = None
    stage = ""
    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.startswith("▪"):
            stage = raw.lstrip("▪ ").strip()
            continue
        m = DATE.match(raw)
        if m:
            mon, day, yr = MONTHS[m.group(1)], int(m.group(2)), m.group(3)
            year = int(yr) if yr else (start_year if mon >= 7 else start_year + 1)
            cur = date(year, mon, day)
            rest = raw[m.end():]
            if " v " not in rest:
                continue
            raw = rest
        m = LINE.match(raw)
        if not m or cur is None:
            continue
        h, a, hg, ag, tail = m.group(1), m.group(2), int(m.group(3)), int(m.group(4)), m.group(5)
        if "a.e.t" in tail or "pen" in tail:
            p = re.search(r"\((\d+)-(\d+)", tail)
            if not p:
                continue
            hg, ag = int(p.group(1)), int(p.group(2))
        hid, aid = team_id(h, country), team_id(a, country)
        if hid is None or aid is None:
            continue
        out.append(Match(cur, hid, aid, hg, ag, comp, stage, comp == "UCL" and stage.endswith("Final") and "Quarter" not in stage and "Semi" not in stage))
    return out


def team_id(s: str, country: str | None) -> str | None:
    s = s.strip()
    m = TEAM_CTY.match(s)
    if m:
        return f"{m.group(2)}:{m.group(1).strip()}"
    if country:
        return f"{country}:{s}"
    return None


# --------------------------------------------------------------------------- football-data
def parse_fd() -> list[Match]:
    out: list[Match] = []
    for f in sorted((RAW / "fd").glob("*.csv")):
        div = f.stem.split("_")[0]
        cty = FD_COUNTRY[div]
        with f.open(encoding="utf-8-sig", errors="replace") as fh:
            for r in csv.DictReader(fh):
                h = r.get("HomeTeam") or r.get("Home")
                a = r.get("AwayTeam") or r.get("Away")
                hg = r.get("FTHG") or r.get("HG")
                ag = r.get("FTAG") or r.get("AG")
                d = r.get("Date")
                if not (h and a and hg not in (None, "") and ag not in (None, "") and d):
                    continue
                try:
                    dt = datetime.strptime(d, "%d/%m/%Y" if len(d.split("/")[-1]) == 4 else "%d/%m/%y").date()
                    hgi, agi = int(float(hg)), int(float(ag))
                except ValueError:
                    continue
                if dt.year < 2016:
                    continue
                out.append(Match(dt, f"{cty}:{h.strip()}", f"{cty}:{a.strip()}", hgi, agi, f"dom:{cty}", "", False))
    return out


def parse_all() -> list[Match]:
    euro: list[Match] = []
    comp_of = {"cl": "UCL", "clq": "UCLQ", "el": "UEL", "elq": "UELQ", "conf": "UECL", "confq": "UECLQ"}
    for d in sorted((RAW / "of").iterdir()):
        y = int(d.name[:4])
        for f in d.glob("*.txt"):
            euro += parse_of(f, comp_of[f.stem], y)
    dom: list[Match] = parse_fd()
    for f in sorted((RAW / "ofdom").glob("*.txt")):
        season, code = f.stem.split("_")
        dom += parse_of(f, f"dom:{OFDOM_COUNTRY[code]}", int(season[:4]), OFDOM_COUNTRY[code])

    canon, display = canonicalise(euro, dom)
    for m in euro + dom:
        m.home = canon[m.home]
        m.away = canon[m.away]
    allm = euro + dom + current_season_ucl()
    allm.sort(key=lambda m: m.date)
    DISPLAY.clear()
    DISPLAY.update(display)
    return allm


DISPLAY: dict[str, str] = {}


def current_season_ucl() -> list[Match]:
    """2026/27 league-phase results already played (not yet in openfootball)."""
    from clubs import CLUBS

    out = []
    with (Path(__file__).parent / "fixtures_2627.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["hg"] != "":
                out.append(Match(date.fromisoformat(r["date"]), CLUBS[r["home"]][0], CLUBS[r["away"]][0],
                                 int(r["hg"]), int(r["ag"]), "UCL", "League", False))
    return out

# Normalised-name synonyms (after norm()). Applied before subset merging.
SYN = {
    "internazionale milano": "inter", "lazio roma": "lazio", "olympiakos piraeus": "olympiakos",
    "losc lille": "lille", "lille osc": "lille", "racing lens": "lens", "racing club lens": "lens",
    "atletico madrid": "atletico madrid", "aek athen": "aek athens", "aek": "aek athens",
    "sporting cp": "sporting portugal", "sporting clube portugal": "sporting portugal",
    "sporting clube braga": "braga", "sporting braga": "braga", "sp braga": "braga",
    "red bull salzburg": "salzburg", "psv eindhoven": "psv", "feyenoord rotterdam": "feyenoord",
    "qarabag agdam": "qarabag", "lisboa e benfica": "benfica", "sport lisboa e benfica": "benfica",
    "bayern munchen": "bayern munich", "bayer leverkusen": "leverkusen",
    "borussia monchengladbach": "monchengladbach", "eintracht frankfurt": "frankfurt",
    "royale union saint gilloise": "union saint gilloise", "st gilloise": "union saint gilloise",
    "rb leipzig": "leipzig", "rcd espanyol barcelona": "espanyol", "espanol": "espanyol", "rb salzburg": "salzburg", "betis balompie": "betis", "real betis": "betis",
    "real betis balompie": "betis", "athletic": "athletic bilbao", "slovan bratislava": "slovan bratislava",
}


# Subset merges that would join two different clubs.
NO_MERGE = {
    ("FRA", "paris"), ("BEL", "brugge"), ("SCO", "dundee"), ("BIH", "sarajevo"), ("ROU", "u craiova"),
    ("SUI", "lausanne"), ("BUL", "cska sofia"), ("POL", "zaglebie"), ("POR", "vitoria"),
}


def canonicalise(euro: list[Match], dom: list[Match]) -> tuple[dict[str, str], dict[str, str]]:
    """Map every raw "CTY:Name" id to a canonical "CTY:key" id; also return display names."""
    from collections import Counter, defaultdict

    raw_count: Counter[str] = Counter()
    euro_raw: set[str] = set()
    for m in euro:
        raw_count.update((m.home, m.away))
        euro_raw.update((m.home, m.away))
    for m in dom:
        raw_count.update((m.home, m.away))

    def key_of(rid: str) -> str:
        c, n = rid.split(":", 1)
        if (c, n) in MANUAL:
            n = MANUAL[(c, n)]
        k = norm(n)
        return SYN.get(k, k)

    first: dict[str, str] = {rid: key_of(rid) for rid in raw_count}
    by_cty: dict[str, set[str]] = defaultdict(set)
    for rid, k in first.items():
        by_cty[rid.split(":", 1)[0]].add(k)

    # Subset merge: a key whose tokens are a strict subset of exactly one other key's tokens.
    merge: dict[tuple[str, str], str] = {}
    for c, keys in by_cty.items():
        for k in keys:
            tk = set(k.split())
            if not tk:
                continue
            sup = [o for o in keys if o != k and tk < set(o.split()) and len(o.split()) - len(tk) <= 2]
            if len(sup) == 1 and len(k) >= 3 and (c, k) not in NO_MERGE:
                merge[(c, k)] = sup[0]
                if os.environ.get("MERGES"):
                    print(f"merge {c}: {k!r} -> {sup[0]!r}")

    canon: dict[str, str] = {}
    for rid, k in first.items():
        c = rid.split(":", 1)[0]
        seen = 0
        while (c, k) in merge and seen < 5:
            k = merge[(c, k)]
            seen += 1
        canon[rid] = f"{c}:{k}"

    # Display name: most-used European spelling, else most-used domestic spelling.
    votes: dict[str, Counter[str]] = defaultdict(Counter)
    for rid, cid in canon.items():
        w = raw_count[rid] * (1000 if rid in euro_raw else 1)
        votes[cid][rid.split(":", 1)[1]] += w
    display = {cid: v.most_common(1)[0][0] for cid, v in votes.items()}
    return canon, display


if __name__ == "__main__":
    ms = parse_all()
    print(len(ms), "matches", ms[0].date, "->", ms[-1].date)
    from collections import Counter
    print(Counter(m.comp for m in ms).most_common())
