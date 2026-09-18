"""Build the compact public-domain OurAirports reference used by fare matching.

Usage: python scripts/build-fare-geography.py airports.csv countries.csv
Source: https://github.com/davidmegginson/ourairports-data
License: https://ourairports.com/data/ (public domain; no accuracy guarantee).
Only active scheduled airports with IATA codes are included. No network at runtime.
"""
import csv
import json
import pathlib
import sys

with open(sys.argv[2], newline="") as source:
    countries = {r["code"]: r["name"] for r in csv.DictReader(source)}
with open(sys.argv[1], newline="") as source:
    airports = {
        r["iata_code"]: [r["municipality"], countries.get(r["iso_country"], ""), r["continent"]]
        for r in csv.DictReader(source)
        if len(r["iata_code"]) == 3 and r["scheduled_service"] == "yes"
        and r["type"] != "closed"
    }
target = pathlib.Path(__file__).resolve().parents[1] / "lib/deals/geography.json"
target.write_text(json.dumps(dict(sorted(airports.items())), ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"{len(airports)} scheduled airports; {target.stat().st_size} bytes")
