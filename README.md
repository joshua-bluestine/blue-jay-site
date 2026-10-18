# Blue Jay Application Security

Static website for https://bluejayappsec.com, published by GitHub Pages from `main` at the repository root. The homepage is a complete scrollable buyer journey; supporting pages provide focused service information and evidence.

## Structure

- `index.html`: positioning, credentials, coverage, approach, deliverables, pricing, buyer FAQs, appointment links and the inquiry form.
- `assets/site.css`: responsive design and motion preferences.
- `assets/content.css`: buyer FAQs, deliverables and supporting-page layouts.
- `assets/site.js`: mobile navigation, scroll progress, reveals, process steps, and research deep links.
- `ai-agent-security-testing.html`: AI/LLM review scope, retrieval and tool permissions, preparation and pricing.
- `saas-security-review.html`: SaaS/API authorization, isolation and business-logic review scope.
- `xoscar-control-plane-research.html`: credited contribution and mitigation, distinguished from the advisory's separate deserialization finding.
- `llm-exploits.html`: existing self-hosted LLM lab evidence; `#r1` through `#r5` remain available.
- `case-studies.html`: existing application lab reproductions; `#cs1` through `#cs3` remain available.
- `sample-report.html`: explicitly fictional report, evidence and retest examples.
- The homepage retains useful `#r1`–`#r5` summary anchors. Legacy `#sample` and `#questions` resolve to deliverables and FAQs. Old service/research URLs serve substantive pages with self canonicals, without noindex redirect stubs.
- The retired self-check and other missing URLs use `404.html`; no unrelated homepage redirect is imposed.
- `sitemap.xml` includes all seven canonical content pages. Update dates when their content changes.

No build step or external JavaScript dependencies. Preview with `python -m http.server --bind 127.0.0.1`. Publish by committing reviewed changes and pushing to `main`.

## Verification and search measurement

Run `python scripts/check_site.py` to check metadata, schema JSON, sitemap coverage, local links and anchors, assets, and the complete homepage buyer path. Run `node --check assets/site.js` and `node --check assets/contact.js` for JavaScript syntax. Inspect the homepage and evidence pages at desktop and mobile widths, including menu, FAQ, deep links and plan selection. Do not submit the contact form or create a Calendly appointment during checks.

After publication, submit `https://bluejayappsec.com/sitemap.xml` in the domain's Google Search Console property and inspect the homepage and restored URLs. Search Console ownership and property access are separate from this repository; absence of a verification meta tag does not mean the property is unverified. Measure impressions, queries, clicks and indexed pages there. Rankings, backlinks and Core Web Vitals are not established by the local checker. No analytics script or third-party tracking was introduced by these changes.

## Design references

The October 2026 redesign adapts large typography, quiet sticky navigation, dimensional graphics, and section-based storytelling from [Linear](https://linear.app/), [Vercel](https://vercel.com/), and [Resend](https://resend.com/). Graphics and implementation are original to this site. Scrolling remains native, motion can be paused, and system reduced-motion preferences are respected.

Monthly testing is quoted individually: hours, fee, and launch discount must be agreed before work begins.

## Inquiry form

The contact section uses `assets/contact.js` to send inquiries to the activated FormSubmit endpoint for `jbluestine@bluejayappsec.com`. Plan buttons preselect the inquiry type. JavaScript submissions show an on-page result; without JavaScript, the form uses the provider's standard submission and confirmation flow.

Only a successful provider response confirms submission. Errors and timeouts retain the entered details. A honeypot and the provider's spam filtering protect the form; delivery and spam folders should still be monitored. FormSubmit processes submitted details and retains submissions according to its policy (currently 30 days). The page links to the provider's privacy policy and asks visitors not to include credentials or customer data.

Changing the recipient requires activating the new inbox before publishing. No mail credentials or private API keys belong in this repository. The provider accepting a request does not guarantee inbox delivery.

HTML asset references include version query strings. Update the affected version when changing CSS or JavaScript so returning visitors receive the current files.
