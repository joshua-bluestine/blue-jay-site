# Blue Jay Application Security — website

Single-page static site for https://bluejayappsec.com, served free via **GitHub Pages**.

## Deploy
1. Create an empty **public** repo named `blue-jay-site` at https://github.com/new
   (no README/.gitignore/license).
2. Push:
   ```bash
   cd "…/Blue-Jay-Site"
   git branch -M main
   git remote add origin https://github.com/joshua-bluestine/blue-jay-site.git
   git push -u origin main
   ```
3. Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch **main** / **/(root)** → Save.
   Live at `https://joshua-bluestine.github.io/blue-jay-site/` within ~1 min.

## Custom domain (bluejayappsec.com), later
Settings → Pages → Custom domain → enter `bluejayappsec.com` → Save (this creates a
`CNAME` file). Then in your domain's DNS add:
- `A` records for the apex `@` → GitHub Pages IPs: `185.199.108.153`, `185.199.109.153`,
  `185.199.110.153`, `185.199.111.153`
- `CNAME` `www` → `joshua-bluestine.github.io`
Then tick **Enforce HTTPS** once the cert issues.

## Update the site
Edit `index.html`, commit, push — Pages redeploys automatically.
