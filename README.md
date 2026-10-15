# Digital Shield — bilingual cyber-safety news site

A fast static news website in **English and Khmer** about protecting yourself from hackers, phishing, scams and privacy threats. There is **no database**: every post is a small JSON file, the site is generated into plain HTML, and Vercel serves it.

You write posts with a **local posting tool** (`npm run admin`). It saves the post, uploads your images, shows a live preview, and pushes to GitHub. Vercel then rebuilds and updates the live site automatically.

```
You write a post  →  posting tool saves it + pushes to GitHub  →  Vercel rebuilds  →  site is live
```

## What you need

- [Node.js](https://nodejs.org) 18 or newer
- [Git](https://git-scm.com)
- A free [GitHub](https://github.com) account and a free [Vercel](https://vercel.com) account

## 1. Run it on your computer

```bash
npm install
npm run admin
```

Then open:

| Address | What it is |
| --- | --- |
| http://localhost:4000 | **Posting tool** — write, edit, delete, publish |
| http://localhost:4001 | **Live preview** of the website exactly as visitors will see it |

The tool only listens on your own computer (`127.0.0.1`); nobody else can reach it. Stop it with `Ctrl+C`.

## 2. Write a post

1. Click **+ New post**.
2. Pick a **topic** and **date**. Tick **Draft** to save without showing it on the website.
3. Choose a **cover image** (JPG, PNG, WebP or GIF). Big photos are shrunk automatically.
4. Fill in the **English** and **ខ្មែរ** tabs: title, short summary and the article text. You can fill in just one language; the other falls back to it.
5. Use the buttons above the text box for headings, bold, lists, links and **images inside the article**.
6. Click **Save**, then check the preview at http://localhost:4001.
7. Click **Publish to GitHub** when you are happy.

Visitors switch language with the **EN / ខ្មែរ** button in the header. The choice is remembered, and Khmer is chosen automatically for browsers set to Khmer. You can also share links like `https://your-site.vercel.app/?lang=km`.

> The five articles that come with the project are samples. Delete them in the tool whenever you like.

## 3. Put it on GitHub (once)

Create an **empty** repository on GitHub (no README, no .gitignore), then in this folder:

```bash
git init -b main          # skip if the folder is already a git repository
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git push -u origin main
```

If Git asks you to sign in, follow the prompt (GitHub's browser sign-in or a personal access token).

## 4. Deploy on Vercel (once)

1. On [vercel.com](https://vercel.com) choose **Add New → Project** and import your GitHub repository.
2. Leave the settings as they are. `vercel.json` already tells Vercel to run `npm run build` and serve the `dist` folder. Framework preset: **Other**.
3. Click **Deploy**.

From now on, every **Publish to GitHub** click triggers a new deployment automatically. It is live about a minute later.

Optional: set `"url"` in `content/site.json` to your final address (for example `"https://digital-shield.vercel.app"`). The next build then adds a sitemap and social-sharing images.

## How the project is organised

```
content/site.json        Site name, tagline, topics and the three tips on the home page
content/posts/*.json     One file per post
public/uploads/          Images you upload
public/assets/           CSS, JavaScript and the Inter + Noto Sans Khmer fonts
scripts/build.js         Turns the content into the website (dist/)
admin/                   The local posting tool
vercel.json              Deployment settings and security headers
```

A post file looks like this, so you can also edit them by hand:

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

- **Why the tool runs on your computer, not on the live site.** The live site on Vercel is read-only static files, which keeps it fast, cheap and hard to attack. Posting needs to write files and use Git, so it runs locally.
- **Several writers?** Everyone clones the repository and runs `npm run admin` with their own GitHub access.
- **"git push failed".** Make sure you are signed in to GitHub on this computer and can push to the repository (try `git push` in a terminal to see the full message).
- **"Port already in use".** Run `ADMIN_PORT=4100 PREVIEW_PORT=4101 npm run admin`.
- **Security.** The site is served with a strict Content-Security-Policy, so inline scripts and third-party resources are blocked. Keep to Markdown for posts; avoid pasting raw `<script>` or `<style>` tags.
- **Fonts** are self-hosted (Inter and Noto Sans Khmer, both under the SIL Open Font License; licences are in `public/assets/fonts/`).
