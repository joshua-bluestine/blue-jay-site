# Search and buyer flow implementation plan

> Execute inline, then review the complete change. User authorized the audit fixes and requires a complete scrollable homepage leading to appointments.

**Goal:** Improve search entry points while keeping every buying decision on the homepage.

**Architecture:** Retain static HTML, shared CSS, native scrolling, existing inquiry handling and Calendly. Restore meaningful pages at old URLs, with self canonicals and internal links. No build dependencies or hosting changes.

**Spec / constraints:** Keep the current visual language, prices and scope. Homepage contains audience, coverage, evidence, process, deliverables, plans, FAQs and appointment CTA. Detailed evidence is optional reading. Do not invent clients, testimonials, certifications, turnaround guarantees, customer acceptance or compliance claims. Label labs and illustrative reports clearly. Preserve old research fragments. Work in the existing clean feature checkout selected by the user; leave deployment for review.

## Tasks

- [x] 1. Add a standard-library site checker and record baseline failures for missing pages, noindex stubs, sitemap coverage and navigation.
- [x] 2. Improve homepage headings and metadata; add deliverables and buyer FAQs; summarize the lab library with links to detailed evidence; preserve scrolling, motion, contact form and pricing.
- [x] 3. Publish distinct AI/LLM and SaaS/API service pages, Xoscar research, existing LLM lab notes, existing application lab case studies, and an explicitly illustrative sample report in the same design. Each page has a unique title, description, self canonical, structured data, context links and booking CTA.
- [x] 4. Update sitemap, documentation, cache versions and legacy fragment handling. Keep 404 as a genuine noindex error page.
- [x] 5. Run the checker, JavaScript syntax checks, local HTTP checks, desktop/mobile browser checks and a fresh review. Correct actionable failures and show a local preview.

## Review focus

- Homepage is sufficient for booking without opening a detail page.
- Old #r1–#r5 research links and #sample/#faq/#questions anchors remain useful.
- Supporting pages initialize shared navigation without homepage-only elements.
- Long evidence, tables and headings remain usable on small screens.
- Report examples and lab reproductions cannot be mistaken for client engagements.

## Verification

Run `python scripts/check_site.py` for internal URL/fragment/asset integrity, metadata, schema, sitemap and buyer-path invariants. Run `node --check assets/site.js` and `node --check assets/contact.js`. Preview using `python -m http.server 8766 --bind 127.0.0.1`. Exercise menu, FAQ, research fragments and plan selection; never send an inquiry or book an appointment while testing.

## Progress

- Baseline: clean `redesign/single-page` checkout at `7d983de`; public live homepage matched this checkout during the audit.
- Decision: one AI/LLM service page and one SaaS/API page provide distinct useful coverage without creating overlapping thin pages.

- Completed October 18: homepage + six supporting pages, metadata, links, sitemap and content styles implemented.
- Verification: seven-page static checker PASS, both JS syntax checks PASS, git diff whitespace check PASS. Desktop and 390px mobile browser checks confirmed menu behavior, plan preselection, FAQ disclosure, legacy anchors and no horizontal page overflow across all seven pages. Sample report table scrolls within its container. No inquiry or appointment was submitted.
- Review: independent reviewer found no functional blocker. Qualified two restored passages: direct tool calls are distinguished from an end-to-end agent exploit, and unshown crAPI post-fix behavior is labeled expected. These are presentation corrections, not claims that the original research was false.
- Review rulings: shared JS null guards are unnecessary for the current complete templates; table overflow verified in browser; inherited lab severity labels were retained; search rankings and Search Console ownership remain external measurement tasks.
- Publication: changes remain local on the existing feature branch for review. No push or deployment performed.
