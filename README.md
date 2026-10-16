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
