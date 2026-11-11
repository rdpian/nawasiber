"""Optional Python recon helper; Netlify deployment uses api.mjs instead."""
import re
from urllib.parse import quote_plus
import requests
from bs4 import BeautifulSoup

JUDOL_TERMS = ("slot", "gacor", "maxwin", "judi online", "judol", "togel", "casino", "scatter")
FRAUD_TERMS = ("penipuan", "penipu", "rekening penipu", "scam", "fraud")

def search_public_web(query: str, timeout: int = 10) -> list[dict]:
    url = "https://html.duckduckgo.com/html/?q=" + quote_plus(query)
    response = requests.get(url, timeout=timeout, headers={"User-Agent":"NawasiberPublicSafetyResearch/1.0"})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    results = []
    for block in soup.select(".result")[:12]:
        link = block.select_one("a.result__a")
        snippet = block.select_one(".result__snippet")
        if not link:
            continue
        href = link.get("href", "")
        if not href.startswith(("https://", "http://")):
            continue
        results.append({
            "title": link.get_text(" ", strip=True),
            "url": href,
            "snippet": snippet.get_text(" ", strip=True) if snippet else ""
        })
    return results

def scan_domain(domain: str) -> dict:
    host = domain.strip().lower()
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", host):
        raise ValueError("Domain tidak valid")
    rows = search_public_web(f'site:{host} ("slot" OR "gacor" OR "maxwin" OR "judol" OR "judi online")')
    enriched = []
    for row in rows:
        text = f"{row['title']} {row['snippet']}".lower()
        matches = [term for term in JUDOL_TERMS if term in text]
        enriched.append({**row, "matched_keywords": matches})
    return {"results": enriched, "match_count": sum(len(x["matched_keywords"]) for x in enriched),
            "disclaimer": "Indikasi keyword perlu pemeriksaan manual; bukan bukti aktivitas perjudian."}
