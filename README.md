# Blue Jay Application Security

Static single-page site for https://bluejayappsec.com, published by GitHub Pages from `main` at the repository root.

## Structure

- `index.html`: credentials, research, testing approach, plans, and contact.
- `assets/site.css`: responsive design and motion preferences.
- `assets/site.js`: mobile navigation, scroll progress, reveals, process steps, and research deep links.
- Existing research/service URLs redirect to their sections on the homepage; `llm-exploits.html#r1` through `#r5` retain their destinations.
- Case studies and self-check have been removed. Missing URLs use `404.html`.
- `sitemap.xml` includes the canonical homepage.

No build step or external JavaScript dependencies. Preview with `python -m http.server --bind 127.0.0.1`. Publish by committing reviewed changes and pushing to `main`.

## Design references

The October 2026 redesign adapts large typography, quiet sticky navigation, dimensional graphics, and section-based storytelling from [Linear](https://linear.app/), [Vercel](https://vercel.com/), and [Resend](https://resend.com/). Graphics and implementation are original to this site. Scrolling remains native, motion can be paused, and system reduced-motion preferences are respected.

Monthly testing is quoted individually: hours, fee, and launch discount must be agreed before work begins.

## Inquiry form

The contact section uses `assets/contact.js` to send inquiries to the activated FormSubmit endpoint for `jbluestine@bluejayappsec.com`. Plan buttons preselect the inquiry type. JavaScript submissions show an on-page result; without JavaScript, the form uses the provider's standard submission and confirmation flow.

Only a successful provider response confirms submission. Errors and timeouts retain the entered details. A honeypot and the provider's spam filtering protect the form; delivery and spam folders should still be monitored. FormSubmit processes submitted details and retains submissions according to its policy (currently 30 days). The page links to the provider's privacy policy and asks visitors not to include credentials or customer data.

Changing the recipient requires activating the new inbox before publishing. No mail credentials or private API keys belong in this repository. The provider accepting a request does not guarantee inbox delivery.
