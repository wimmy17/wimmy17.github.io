# Popcade

A small, growing arcade of browser games. Plain HTML, CSS, and JavaScript — no build tools, no dependencies.

## What's here

```
index.html                   # the hub page (list of games)
css/style.css                # shared styles used by the hub and games
js/main.js                   # decorative balloon animation on the hub
games/
  knight-vs-zombies/
    index.html                # the game page
    style.css                 # game-specific styles
    game.js                   # game logic
```

## Running it locally

Just open `index.html` in a browser — everything is static, no server required. (Some browsers restrict local file access slightly; if anything looks off, run a quick local server instead, e.g. `python3 -m http.server` from this folder, then visit `http://localhost:8000`.)

## Publishing to GitHub Pages

1. Create a new repository on GitHub (or use an existing one).
2. Push everything in this folder to the repo's default branch (e.g. `main`):
   ```
   git init
   git add .
   git commit -m "Initial Popcade site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch", pick **main** and the **/ (root)** folder, then save.
5. GitHub gives you a URL, usually `https://<your-username>.github.io/<your-repo>/`. It can take a minute or two to go live the first time.

If your repo is named exactly `<your-username>.github.io`, the site is served at the root `https://<your-username>.github.io/` instead.

## Adding a new game

1. Make a new folder under `games/`, e.g. `games/whack-a-mole/`.
2. Give it its own `index.html`, `style.css`, and `game.js` — you can copy the Knight vs Zombies files as a starting template.
3. Link to `../../css/style.css` from your new game's HTML so it shares the site's fonts and colors.
4. Add a new `.ticket` card in the root `index.html`'s game grid, pointing at your new game's `index.html`.
