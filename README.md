# Digital Shield — bilingual cyber-safety news site

A fast bilingual news website in **English and Khmer** about protecting yourself from hackers, phishing, scams and privacy threats. Vercel serves the fast, generated site shell; published posts and images are read from a private Vercel Blob store at request time.

The hosted posting tool at `/admin` saves posts and images directly to Blob. Published changes appear on the public site immediately, without a GitHub push or Vercel redeploy. Drafts stay private.

```
Hosted admin  →  private Vercel Blob  →  public site updates immediately
```

## What you need

- [Node.js](https://nodejs.org) 20.6 or newer
- [Git](https://git-scm.com)
- A free [GitHub](https://github.com) account and a free [Vercel](https://vercel.com) account
- A private Vercel Blob store connected to the project

## 1. Run the local preview (optional)

```bash
npm install
npm run admin
```

Then open:

| Address | What it is |
| --- | --- |
| http://localhost:4000 | Local posting tool — edits local files and can publish them to GitHub |
| http://localhost:4001 | **Live preview** of the website exactly as visitors will see it |

The tool only listens on your own computer (`127.0.0.1`); nobody else can reach it. Stop it with `Ctrl+C`.

## 2. Deploy the hosted admin

1. Push the project code to GitHub and import the repository in Vercel. Use the existing build settings: Framework **Other**, build command `npm run build`, output directory `dist`.
2. In the Vercel project, open **Storage → Create Storage → Blob** and create a **private** Blob store. Connect it to the project and include the Production and Development environments.
3. In **Settings → Environment Variables**, add:
   - `ADMIN_PASSWORD`: a strong password of at least 12 characters (select Production and Preview).
   - `ADMIN_SESSION_SECRET`: a random secret of at least 32 characters (select Production and Preview). Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
4. Redeploy once so the new store and environment variables are available to the app.
5. Install and authenticate the Vercel CLI, link this project, and pull the Development environment locally:

   ```bash
   npm install --global vercel
   vercel login
   vercel link
   vercel env pull .env.local
   npm run seed:blob
   ```

   This copies the bundled sample posts and images into Blob. `.env.local` is ignored by Git; never commit it.

Open `https://your-site.vercel.app/admin` and sign in with `ADMIN_PASSWORD`.

> Run `npm run seed:blob` only for the initial import. It overwrites matching Blob posts with the repository copies.

## 3. Publish posts without redeploying

1. Open `/admin` on your deployed site and sign in.
2. Create or edit a post, choose a cover image, and fill in the English and Khmer tabs. The editor includes a Markdown preview and supports images inside articles.
3. Tick **Draft** to save privately, or leave it unchecked to publish.
4. Click **Save & publish**. Published posts and edits appear on the live site immediately. Saving, uploading, and deleting posts do not push to GitHub or trigger a Vercel deployment.

Visitors switch language with the **EN / ខ្មែរ** button. The choice is remembered, and Khmer is chosen automatically for browsers set to Khmer. You can also share links like `https://your-site.vercel.app/?lang=km`.

The local tool started by `npm run admin` remains available for local previews and Git-based editing. To publish without a deployment, use the hosted `/admin` page instead.

## 4. Put the code on GitHub (once)

Create an **empty** repository on GitHub (no README, no .gitignore), then in this folder:

```bash
git init -b main          # skip if the folder is already a git repository
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git push -u origin main
```

If Git asks you to sign in, follow the prompt (GitHub's browser sign-in or a personal access token).

## 5. Deploy on Vercel (once)

1. On [vercel.com](https://vercel.com) choose **Add New → Project** and import your GitHub repository.
2. Leave the settings as they are. `vercel.json` already tells Vercel to run `npm run build` and serve the `dist` folder. Framework preset: **Other**.
3. Click **Deploy**.

Code changes pushed to GitHub still trigger Vercel deployments. Changes made in the hosted `/admin` tool update Blob directly and do not redeploy.

Optional: set `"url"` in `content/site.json` to your final address (for example `"https://digital-shield.vercel.app"`). The next build then adds a sitemap and social-sharing images.

## How the project is organised

```
content/site.json        Site name, tagline, topics and the three tips on the home page
content/posts/*.json     One file per post
public/uploads/          Images you upload
public/assets/           CSS, JavaScript and the Inter + Noto Sans Khmer fonts
scripts/build.js         Turns the content into the website (dist/)
scripts/seed-blob.js     Imports the bundled sample posts and images into Blob
api/                     Authenticated admin and live-content API
admin/                   The local and hosted posting tool
vercel.json              Deployment settings and security headers
```

The bundled sample posts in `content/posts/` use this format. Once the hosted admin is set up, Blob is the live source; editing these local files alone does not change the hosted site.

```json
{
  "date": "2026-10-14",
  "category": "phishing",
  "draft": false,
  "image": "/uploads/my-cover.jpg",
  "imageAlt": { "en": "…", "km": "…" },
  "title":   { "en": "…", "km": "…" },
  "summary": { "en": "…", "km": "…" },
  "body":    { "en": "Markdown text…", "km": "អត្ថបទ Markdown…" }
}
```

To add or rename a topic, edit `categories` in `content/site.json`. To change colours, edit the variables at the top of `public/assets/style.css`.

## Good to know

- **Storage and privacy.** Posts, drafts and uploaded images live in a private Blob store. API routes check the admin session before changing content; draft posts are not returned to public visitors.
- **Several writers?** Everyone clones the repository and runs `npm run admin` with their own GitHub access.
- **"git push failed".** Make sure you are signed in to GitHub on this computer and can push to the repository (try `git push` in a terminal to see the full message).
- **"Port already in use".** Run `ADMIN_PORT=4100 PREVIEW_PORT=4101 npm run admin`.
- **Security.** The site is served with a strict Content-Security-Policy, so inline scripts and third-party resources are blocked. Keep to Markdown for posts; avoid pasting raw `<script>` or `<style>` tags.
- **Fonts** are self-hosted (Inter and Noto Sans Khmer, both under the SIL Open Font License; licences are in `public/assets/fonts/`).
