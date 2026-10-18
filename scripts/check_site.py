"""Check the static site's crawlable pages, local navigation and buyer path."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://bluejayappsec.com"
PAGES = ["index.html", "ai-agent-security-testing.html", "saas-security-review.html",
         "xoscar-control-plane-research.html", "llm-exploits.html", "case-studies.html",
         "sample-report.html"]
BOOKING = "https://calendly.com/jbluestine-bluejayappsec/intro-call"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.ids, self.links, self.assets, self.jsonld = [], [], [], []
        self.meta, self.canonicals = {}, []
        self.title, self.h1, self.text = "", [], ""
        self.capture, self.buffer = None, ""
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "meta":
            self.meta[a.get("name", a.get("property", ""))] = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical":
            self.canonicals.append(a.get("href"))
        if tag == "a" and "href" in a:
            self.links.append(a["href"])
        if tag in ("script", "img") and "src" in a:
            self.assets.append(a["src"])
        if tag == "link" and a.get("rel") in ("stylesheet", "icon", "apple-touch-icon"):
            self.assets.append(a.get("href", ""))
        if tag in ("title", "h1") or (tag == "script" and a.get("type") == "application/ld+json"):
            self.capture, self.buffer = tag, ""

    def handle_endtag(self, tag):
        if tag == self.capture:
            if tag == "title":
                self.title = self.buffer.strip()
            elif tag == "h1":
                self.h1.append(self.buffer.strip())
            else:
                self.jsonld.append(json.loads(self.buffer))
            self.capture = None

    def handle_data(self, data):
        self.text += data + " "
        if self.capture:
            self.buffer += data


def main():
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)

    pages = {}
    for name in PAGES:
        check((ROOT / name).is_file(), f"Missing page: {name}")
        if (ROOT / name).is_file():
            pages[name] = Page(ROOT / name)
    titles, descriptions = set(), set()
    for name, p in pages.items():
        canonical = ORIGIN + ("/" if name == "index.html" else "/" + name)
        check(p.canonicals == [canonical], f"{name}: needs one self canonical")
        check("noindex" not in p.meta.get("robots", ""), f"{name}: unexpectedly noindex")
        check(bool(p.title) and p.title not in titles, f"{name}: missing/duplicate title")
        description = p.meta.get("description", "")
        check(bool(description) and description not in descriptions, f"{name}: missing/duplicate description")
        check(len(p.h1) == 1, f"{name}: expected exactly one H1")
        check(len(p.ids) == len(set(p.ids)), f"{name}: duplicate IDs")
        check(bool(p.jsonld), f"{name}: missing structured data")
        check(BOOKING in p.links, f"{name}: no direct appointment link")
        titles.add(p.title)
        descriptions.add(description)
        for href in p.links + p.assets:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                if url.netloc != "bluejayappsec.com":
                    continue
            target = unquote(url.path).lstrip("/") or name
            if url.path == "/":
                target = "index.html"
            if target.endswith("/"):
                target += "index.html"
            check((ROOT / target).is_file(), f"{name}: missing target {href}")
            if url.fragment and target in pages:
                check(unquote(url.fragment) in pages[target].ids,
                      f"{name}: missing fragment {href}")

    sitemap = ET.parse(ROOT / "sitemap.xml")
    urls = [node.text for node in sitemap.findall(".//{*}loc")]
    expected = {ORIGIN + ("/" if n == "index.html" else "/" + n) for n in PAGES}
    check(set(urls) == expected and len(urls) == len(expected), "Sitemap must list every canonical content page once")
    homepage = pages.get("index.html")
    if homepage:
        for anchor in ("coverage", "research", "approach", "deliverables", "plans", "faq", "contact"):
            check(anchor in homepage.ids, f"Homepage buyer flow missing #{anchor}")
        for price in ("$1,500", "$2,500", "$750"):
            check(price in homepage.text, f"Homepage missing current price {price}")
        for name in PAGES[1:]:
            check(any(urlsplit(h).path.lstrip("/") == name for h in homepage.links),
                  f"Homepage has no crawlable link to {name}")
    for name, prefix in (("llm-exploits.html", "r"), ("case-studies.html", "cs")):
        if name in pages:
            for n in range(1, 6 if prefix == "r" else 4):
                check(f"{prefix}{n}" in pages[name].ids, f"{name}: lost legacy #{prefix}{n}")
    if "sample-report.html" in pages:
        check("illustrative" in pages["sample-report.html"].text.lower(), "Sample report must disclose illustrative content")
    if "case-studies.html" in pages:
        check("self-hosted" in pages["case-studies.html"].text.lower(), "Case studies must disclose lab setting")
    check("noindex" in Page(ROOT / "404.html").meta.get("robots", ""), "404 must remain noindex")
    if errors:
        print("FAIL\n" + "\n".join(f"- {e}" for e in errors))
        return 1
    print(f"PASS: {len(pages)} pages; metadata, schema, sitemap, links, assets, fragments and buyer flow")
    return 0


if __name__ == "__main__":
    sys.exit(main())
