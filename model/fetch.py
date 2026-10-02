"""Download raw match data into model/raw/.

Sources
- football-data.co.uk: domestic top flights (main CSVs per season + "new" all-seasons CSVs)
- openfootball/champions-league: UCL/UEL/UECL incl. qualifying, 2011-12 onward
- openfootball/europe: domestic leagues football-data.co.uk lacks (AZE, CZE, SVK, UKR)

Run: python model/fetch.py
"""
from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "raw"
FD_SEASONS = ["1718", "1819", "1920", "2021", "2122", "2223", "2324", "2425", "2526", "2627"]
FD_DIVS = ["E0", "SP1", "D1", "I1", "F1", "N1", "P1", "B1", "T1", "G1", "SC0"]
FD_NEW = ["NOR", "AUT", "DNK", "SWZ", "POL", "ROU", "SWE"]
EURO_SEASONS = [f"{y}-{str(y + 1)[2:]}" for y in range(2015, 2027)]
EURO_FILES = ["cl.txt", "clq.txt", "el.txt", "elq.txt", "conf.txt", "confq.txt"]
OF_DOMESTIC = {
    "azerbaijan": "az1",
    "czech-republic": "cz1",
    "slovakia": "sk1",
    "ukraine": "ua1",
}


def get(url: str, dest: Path, refresh: bool = False) -> bool:
    if dest.exists() and not refresh:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "henkelpott-model/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status != 200:
                return False
            data = r.read()
    except Exception as e:  # noqa: BLE001
        print(f"  skip {url}: {e}")
        return False
    if data[:15].lower().startswith(b"<!doctype") or b"<html" in data[:200].lower():
        print(f"  skip {url}: html")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    print(f"  ok   {url}")
    time.sleep(0.2)
    return True


def main() -> None:
    RAW.mkdir(exist_ok=True)
    for s in FD_SEASONS:
        current = s == FD_SEASONS[-1]
        for d in FD_DIVS:
            get(f"https://www.football-data.co.uk/mmz4281/{s}/{d}.csv", RAW / "fd" / f"{d}_{s}.csv", refresh=current)
    for c in FD_NEW:
        get(f"https://www.football-data.co.uk/new/{c}.csv", RAW / "fd" / f"{c}.csv", refresh=True)

    for s in EURO_SEASONS:
        current = s == EURO_SEASONS[-1]
        for f in EURO_FILES:
            get(
                f"https://raw.githubusercontent.com/openfootball/champions-league/master/{s}/{f}",
                RAW / "of" / s / f,
                refresh=current,
            )

    api = "https://api.github.com/repos/openfootball/europe/contents/"
    for country, code in OF_DOMESTIC.items():
        try:
            with urllib.request.urlopen(urllib.request.Request(api + country, headers={"User-Agent": "x"}), timeout=60) as r:
                listing = json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f"  skip listing {country}: {e}")
            continue
        for item in listing:
            if item["name"].endswith(f"_{code}.txt"):
                get(item["download_url"], RAW / "ofdom" / item["name"])


if __name__ == "__main__":
    main()
