# Callbacks Only website

Everything you'll normally change lives in the **`content`** folder: three
text files and some photo folders. You never need to touch the HTML.

```
content/
  settings.txt        Email, social links, and the wording around the page
  shows.txt           Every show, past and upcoming
  performers.txt      Performer names, roles and bios
  hero/               Photos for the big slideshow at the top
  shows/<folder>/     Photos for each show
  performers/         Performer photos
  about/              The two photos in the About section
```

**To preview what's there now**, open `dist/index.html` in your browser.


## Everyday changes

### Change the slideshow photos

Put photos in `content/hero/`, named with numbers: `01.jpg`, `02.jpg`,
`03.jpg`… They play in number order, so rename a file to move it. Add or
remove as many as you like; the site counts them for you. Any size works,
because they're resized and cropped to fit the screen.

### Add a show

1. Open `content/shows.txt`, copy an existing block (the lines between the
   `---` dividers) and change the details. The instructions are at the top
   of the file.
2. Make a folder in `content/shows/` with the same name you wrote after
   `folder:`.
3. Put the show's photos in it:
   - `cover.jpg` is the main photo shown in the list. Rename any photo to
     `cover.jpg` to choose it.
   - Or use `poster.jpg` instead, and the poster is shown whole, never cropped.
   - `01.jpg`, `02.jpg`, `03.jpg`… are the rest of the gallery, in number order.

Shows dated today or later appear under **Coming up**. After the date
passes, they move to **Past shows** by themselves. Only the newest three
past shows are listed at first, with a button to see the rest. You can change
that number in `settings.txt`.

### Change performers

Edit `content/performers.txt` and put their photos in `content/performers/`.
People appear in the same order as in the file.

### Change wording, email or social links

Edit `content/settings.txt`. To hide a social network, leave its line empty.

### The scrolling photo strip

You don't need to do anything here. The strip fills itself with the slideshow
photos and every show's photos, mixed so no single show dominates. It
favours recent shows. If the same photo is in two folders, it only appears
once.


## Seeing your changes

A web page can't look inside folders by itself, so a small script does it.
It reads the `content` folder, counts and sorts the photos, resizes them so
the site loads quickly, and puts the finished website in the **`dist`**
folder.

**One-time setup:** install [Node.js](https://nodejs.org) (the "LTS"
version). Then open a terminal in this folder and run:

```
npm install
```

**While you're editing**, run:

```
npm start
```

and open the address it shows (usually http://localhost:8080). Leave it
running. Whenever you save a text file or add, rename or remove a photo, the
site rebuilds and the page refreshes by itself.

If something in your content needs fixing, such as a misspelled setting, a
date in the wrong format or a folder that doesn't exist, the terminal tells
you in plain English. The rest of the site still builds.

## Publishing

Run `npm run build`, then upload the **contents of the `dist` folder** to
your web host. That folder is the complete website.

**Automatic publishing (GitHub Pages, free):** this project is set up to
publish itself on GitHub Pages. Every time you push changes to the `main`
branch on GitHub, GitHub runs the build and updates the live site, usually
within two minutes. You don't need to run the build yourself or upload
anything. The steps for this are in `.github/workflows/deploy.yml`.

To check on a publish, open the repository on GitHub and click the
**Actions** tab. A green tick means the site is live; a red cross means
something went wrong, and clicking it shows the build messages.

One-time setup on GitHub: open the repository's **Settings → Pages** and set
**Source** to **GitHub Actions**.

Prefer [Netlify](https://www.netlify.com)? Connect this repository there
instead. The settings for it are already included in `netlify.toml`.

### Making the contact form send messages

Create a free form at [formspree.io](https://formspree.io) and paste its
address after `form address:` in `settings.txt`. Until then, the form opens
the visitor's email app with their message filled in.


## Before going live

- [ ] Your real email and social links (`settings.txt`)
- [ ] Performer names, roles and bios (`performers.txt`)
- [ ] Names, dates and descriptions for the three "Untitled show" entries
      (`shows.txt`). Their photos are in `content/shows/untitled-show-1`, `-2`
      and `-3`. Rename those folders to suit and update `folder:` to match.


## For developers

| Path | What it is |
| --- | --- |
| `src/index.html` | Page template. `{{ setting name }}` placeholders are filled from `settings.txt`, and `{{ name \| paragraphs }}` outputs `<p>` tags. |
| `src/css/styles.css` | All styling. Design tokens (colours, type scale, spacing) are at the top. |
| `src/css/fonts.css` | Young Serif and Instrument Sans, embedded (SIL Open Font Licence, see `src/assets/fonts`). |
| `src/js/app.js` | Renders the slideshow, shows, performers and photo strip from `site-data.js`, and runs the gallery, navigation and form. |
| `src/js/wisps.js` | Background colour ribbons. Add `data-wisps` to any `<section>`. |
| `scripts/build.mjs` | Reads `content/`, processes images with sharp: slideshow photos at several widths and strip photos at exact heights (so moving images stay crisp), 2000px gallery photos and 800px thumbnails, writes `dist/` including `dist/js/site-data.js`. Unchanged photos are reused, so rebuilds are fast. |
| `dist/` | Generated output. Don't edit it, because it's rewritten on every build. |

Built in: responsive layout down to small phones, keyboard navigation with
visible focus, a skip link, a pause button on the slideshow, a fully still
page for visitors who prefer reduced motion, lazy-loaded images with fixed
dimensions (no layout jumps), and correct photo orientation from camera data.
