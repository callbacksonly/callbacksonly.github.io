/* ==========================================================================
   Callbacks Only: site builder
   --------------------------------------------------------------------------
   Reads everything in content/, resizes the photos and writes a finished,
   ready-to-upload website into dist/.

     npm run build   Build once. Do this before uploading the dist folder.
     npm start       Build, preview at http://localhost:8080 and rebuild
                     whenever you change a file. The browser refreshes itself.

   Websites can't look inside folders by themselves, so this script does it:
   it counts the photos, sorts them by number and lists them for the page.
   ========================================================================== */

import { promises as fs, watch, createReadStream } from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";


/* --------------------------------------------------------------------------
   Settings
   -------------------------------------------------------------------------- */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const MEDIA = path.join(DIST, "media");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);
const UNSUPPORTED_EXTENSIONS = new Set([".heic", ".heif", ".gif", ".bmp", ".raw", ".cr2", ".nef"]);

/* Longest edge of each output image, in pixels */
const SIZES = { photo: 2000, thumb: 800, about: 1600, performer: 1000, poster: 1600 };
const JPEG_QUALITY = 80;

/* Moving photos shimmer and look jagged when the browser has to shrink them
   while they move. So photos that move are made at the sizes they're shown:

   The slideshow fills the screen, so it gets several widths and the browser
   picks the one that matches the screen. */
const HERO_WIDTHS = [960, 1440, 1920, 2400];

/* The scrolling strip is a fixed height, so its photos are made at exactly
   that height, for normal and high-resolution screens. If you change these,
   change the matching heights in .photo-band__photo in src/css/styles.css. */
const STRIP_HEIGHTS = { desktop: 300, phone: 200 };

/* If these change, every photo is processed again */
const PIPELINE_VERSION = JSON.stringify({ SIZES, HERO_WIDTHS, STRIP_HEIGHTS, JPEG_QUALITY, v: 2 });

const SETTING_KEYS = [
  "email", "instagram", "facebook", "tiktok", "youtube", "form address",
  "hero line", "seconds per hero photo",
  "about heading", "about text",
  "shows intro", "no shows message", "past shows to show",
  "performers intro",
  "contact heading", "contact text",
  "photo strip limit", "search description",
];
const SHOW_KEYS = ["title", "date", "time", "venue", "tagline", "tickets", "folder", "description"];
const PERFORMER_KEYS = ["name", "role", "photo", "bio"];
const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok", "youtube"];

const DEFAULT_SETTINGS = {
  "hero line": "Live improvised comedy in Ōtautahi Christchurch.",
  "seconds per hero photo": "6",
  "about heading": "About us",
  "about text": "",
  "shows intro": "",
  "no shows message": "Nothing on sale right now. Follow us to hear about the next show first.",
  "past shows to show": "3",
  "performers intro": "",
  "contact heading": "Get in touch",
  "contact text": "",
  "photo strip limit": "40",
  "search description": "",
};


/* --------------------------------------------------------------------------
   Image library
   sharp resizes the photos. If it isn't installed, photos are copied as
   they are, so the site still works (it just loads more slowly).
   -------------------------------------------------------------------------- */
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  sharp = null;
}


/* --------------------------------------------------------------------------
   Small helpers
   -------------------------------------------------------------------------- */
let warnings = [];
const warn = (message) => warnings.push(message);
const relative = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const stem = (file) => path.parse(file).name;
const exists = (file) => fs.access(file).then(() => true, () => false);

/** Sort like a person would: 2.jpg before 10.jpg. */
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Safe file and folder names for the web: "My Photo 01.JPG" -> "my-photo-01" */
const slug = (text) =>
  text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image";

const escapeHTML = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Split text into paragraphs at blank lines; single line breaks become spaces. */
const toParagraphs = (text = "") =>
  text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);

const toInline = (text = "") => toParagraphs(text).join(" ");

const isValidDate = (iso) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(new Date(`${iso}T00:00:00`).getTime());


/* --------------------------------------------------------------------------
   Reading the text files in content/
   -------------------------------------------------------------------------- */

/**
 * Read a content text file. Blocks are separated by a line of "---".
 * Each block holds "name: value" lines. Lines that don't start with a known
 * name continue the previous value; lines starting with # are notes.
 */
async function readBlocks(file, keys) {
  const text = await fs.readFile(file, "utf8").catch(() => null);
  if (text === null) {
    warn(`${relative(file)} is missing, so that part of the site is empty.`);
    return [];
  }

  const known = new Set(keys);
  const blocks = [];
  let block = null;
  let lastKey = null;

  text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").forEach((line, index) => {
    if (/^\s*#/.test(line)) return;

    if (/^\s*-{3,}\s*$/.test(line)) {
      block = null;
      lastKey = null;
      return;
    }

    const match = line.match(/^\s*([A-Za-z][A-Za-z ]*?)\s*:(.*)$/);
    const key = match && match[1].toLowerCase().replace(/\s+/g, " ");

    if (key && known.has(key)) {
      if (!block) blocks.push((block = { _line: index + 1 }));
      block[key] = match[2].trim();
      lastKey = key;
    } else if (block && lastKey) {
      block[lastKey] += `\n${line.trim()}`;
    } else if (line.trim()) {
      const hint = match ? `"${match[1]}" isn't a setting name here. Check the spelling against the list at the top of the file.` : "this line isn't part of any setting.";
      warn(`${relative(file)}, line ${index + 1}: ${hint}`);
    }
  });

  for (const b of blocks) {
    for (const key of keys) if (typeof b[key] === "string") b[key] = b[key].trim();
  }
  return blocks;
}


/* --------------------------------------------------------------------------
   Processing photos
   -------------------------------------------------------------------------- */
const produced = new Set();

/** List the photos in a folder, sorted by number. Returns null if the folder doesn't exist. */
async function listImages(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => null);
  if (!entries) return null;

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) files.push(entry.name);
    else if (UNSUPPORTED_EXTENSIONS.has(ext)) {
      warn(`${relative(path.join(folder, entry.name))} can't be used. Save it as a JPEG (.jpg) instead.`);
    }
  }
  return files.sort(naturalSort).map((name) => path.join(folder, name));
}

/** Width and height of an image file (used when sharp isn't available). */
async function readImageSize(file) {
  const buf = await fs.readFile(file);
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { width: undefined, height: undefined };
}

/**
 * Resize one photo into dist/media (skipped if already up to date).
 * size is a number (the longest edge), or { width } or { height } for an
 * exact dimension. Returns { src, width, height } for the page to use.
 */
async function processImage(source, outPathNoExt, size) {
  const ext = sharp ? ".jpg" : path.extname(source).toLowerCase();
  const out = path.join(MEDIA, `${outPathNoExt}${ext}`);
  produced.add(out);
  await fs.mkdir(path.dirname(out), { recursive: true });

  const [sourceStat, outStat] = await Promise.all([fs.stat(source), fs.stat(out).catch(() => null)]);
  const upToDate = outStat && outStat.mtimeMs >= sourceStat.mtimeMs;

  if (!upToDate) {
    if (sharp) {
      await sharp(source)
        .rotate() // respect the camera's orientation
        .resize(typeof size === "number"
          ? { width: size, height: size, fit: "inside", withoutEnlargement: true }
          : { ...size, withoutEnlargement: true })
        .flatten({ background: "#120d3d" })
        .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
        .toFile(out);
    } else {
      await fs.copyFile(source, out);
    }
  }

  const { width, height } = sharp ? await sharp(out).metadata() : await readImageSize(out);
  return { src: relative(out).replace(/^dist\//, ""), width, height };
}

/** A fingerprint of a file, so the same photo in two folders only appears once in the strip. */
const fingerprint = async (file) => crypto.createHash("md5").update(await fs.readFile(file)).digest("hex");

/** A photo with a large version (for full screen) and a small one (for lists). */
async function processPhoto(source, outDir) {
  const name = slug(stem(source));
  const large = await processImage(source, `${outDir}/${name}`, SIZES.photo);
  const thumb = await processImage(source, `${outDir}/thumbs/${name}`, SIZES.thumb);
  return {
    src: large.src,
    thumb: thumb.src,
    width: large.width,
    height: large.height,
    portrait: large.height > large.width,
    hash: await fingerprint(source),
    source,
  };
}

/**
 * Several widths of one photo, smallest first, for the browser to choose
 * from. Without the image tool, just the original.
 */
async function processWidths(source, outPathNoExt, widths) {
  if (!sharp) return [await processImage(source, outPathNoExt, Math.max(...widths))];
  const versions = [];
  for (const width of widths) versions.push(await processImage(source, `${outPathNoExt}-${width}w`, { width }));
  // Small originals are never enlarged, so some versions can come out the same size
  return [...new Map(versions.map((version) => [version.width, version])).values()];
}

const toSrcset = (versions) => versions.map((version) => `${version.src} ${version.width}w`).join(", ");

/** Delete processed photos that no longer have a source (e.g. you removed one). */
async function pruneMedia(dir = MEDIA) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await pruneMedia(full);
      if (!(await fs.readdir(full)).length) await fs.rmdir(full);
    } else if (!produced.has(full) && entry.name !== ".pipeline") {
      await fs.unlink(full);
    }
  }
}


/* --------------------------------------------------------------------------
   Building each part of the site
   -------------------------------------------------------------------------- */
async function buildSettings() {
  const [block = {}] = await readBlocks(path.join(CONTENT, "settings.txt"), SETTING_KEYS);
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) if (block[key]) settings[key] = block[key];

  const number = (key, min) => {
    const value = Number.parseInt(settings[key], 10);
    if (Number.isNaN(value) || value < min) {
      warn(`settings.txt: "${key}" should be a whole number. Using ${DEFAULT_SETTINGS[key]}.`);
      return Number(DEFAULT_SETTINGS[key]);
    }
    return value;
  };

  return {
    text: settings,
    email: settings.email || "",
    socials: SOCIAL_NETWORKS
      .filter((network) => settings[network])
      .map((network) => ({ network, url: settings[network] })),
    formEndpoint: settings["form address"] || "",
    secondsPerHeroPhoto: number("seconds per hero photo", 2),
    pastShowsToShow: number("past shows to show", 1),
    photoStripLimit: number("photo strip limit", 0),
    noShowsMessage: toInline(settings["no shows message"]),
  };
}

async function buildHero() {
  const files = (await listImages(path.join(CONTENT, "hero"))) || [];
  if (!files.length) warn("content/hero has no photos, so the slideshow is empty.");
  const photos = [];
  for (const file of files) {
    const versions = await processWidths(file, `hero/${slug(stem(file))}`, HERO_WIDTHS);
    const largest = versions[versions.length - 1];
    photos.push({
      src: (versions.find((version) => version.width >= 1440) || largest).src,
      srcset: sharp ? toSrcset(versions) : "",
      width: largest.width,
      height: largest.height,
      portrait: largest.height > largest.width,
      hash: await fingerprint(file),
      source: file,
    });
  }
  return photos;
}

async function buildAbout() {
  const files = (await listImages(path.join(CONTENT, "about"))) || [];
  const find = (name) => files.find((file) => stem(file).toLowerCase() === name);
  const about = {};
  for (const name of ["main", "inset"]) {
    const file = find(name);
    if (file) about[name] = await processImage(file, `about/${name}`, SIZES.about);
  }
  for (const file of files) {
    if (!["main", "inset"].includes(stem(file).toLowerCase())) {
      warn(`${relative(file)} isn't used. Name the About photos main.jpg and inset.jpg.`);
    }
  }
  return about;
}

async function buildShows() {
  const blocks = await readBlocks(path.join(CONTENT, "shows.txt"), SHOW_KEYS);
  const usedFolders = new Set();
  const shows = [];

  for (const block of blocks) {
    if (!block.title) {
      warn(`shows.txt, line ${block._line}: this show has no title, so it's been left out.`);
      continue;
    }

    let date = block.date || "";
    if (date && !isValidDate(date)) {
      warn(`shows.txt: "${block.title}" has the date "${date}". Write dates as year-month-day, e.g. 2026-12-04.`);
      date = "";
    }

    const show = {
      title: toInline(block.title),
      date,
      time: toInline(block.time),
      venue: toInline(block.venue),
      tagline: toInline(block.tagline),
      tickets: toInline(block.tickets),
      description: toParagraphs(block.description),
      image: null,
      photos: [],
    };

    if (block.folder) {
      usedFolders.add(block.folder.toLowerCase());
      const folder = path.join(CONTENT, "shows", block.folder);
      const files = await listImages(folder);

      if (!files) {
        warn(`shows.txt: "${block.title}" uses the folder "${block.folder}", but content/shows/${block.folder} doesn't exist.`);
      } else {
        const outDir = `shows/${slug(block.folder)}`;
        const named = (name) => files.find((file) => stem(file).toLowerCase() === name);
        const poster = named("poster");
        const cover = named("cover");
        const others = files.filter((file) => file !== poster && file !== cover);

        for (const file of [cover, ...others].filter(Boolean)) {
          show.photos.push(await processPhoto(file, outDir));
        }

        if (poster) {
          const image = await processImage(poster, `${outDir}/poster`, SIZES.poster);
          show.image = { ...image, fit: "contain" };
        } else if (show.photos.length) {
          const first = show.photos[0];
          show.image = { src: first.thumb, width: first.width, height: first.height, fit: "cover" };
        }
      }
    }

    shows.push(show);
  }

  // Point out photo folders that no show is using
  const folders = await fs.readdir(path.join(CONTENT, "shows"), { withFileTypes: true }).catch(() => []);
  for (const entry of folders) {
    if (entry.isDirectory() && !usedFolders.has(entry.name.toLowerCase())) {
      warn(`content/shows/${entry.name} isn't used by any show in shows.txt.`);
    }
  }

  return shows;
}

async function buildPerformers() {
  const blocks = await readBlocks(path.join(CONTENT, "performers.txt"), PERFORMER_KEYS);
  const performers = [];

  for (const block of blocks) {
    if (!block.name) {
      warn(`performers.txt, line ${block._line}: this person has no name, so they've been left out.`);
      continue;
    }

    let photo = null;
    if (block.photo) {
      const file = path.join(CONTENT, "performers", block.photo);
      if (await exists(file)) {
        photo = await processImage(file, `performers/${slug(stem(block.photo))}`, SIZES.performer);
      } else {
        warn(`performers.txt: the photo "${block.photo}" for ${block.name} isn't in content/performers.`);
      }
    }

    performers.push({
      name: toInline(block.name),
      role: toInline(block.role),
      bio: toInline(block.bio),
      photo,
    });
  }

  return performers;
}

/**
 * The scrolling strip: slideshow photos plus every show's photos, taken in
 * turn from each source (newest shows first) so no single show dominates.
 * Identical photos only appear once.
 */
async function buildPhotoStrip(hero, shows, limit) {
  const byNewest = [...shows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const sources = [hero, ...byNewest.map((show) => show.photos)].map((list) => [...list]);
  const seen = new Set();
  const picked = [];

  while (picked.length < limit && sources.some((list) => list.length)) {
    for (const list of sources) {
      const photo = list.shift();
      if (!photo || seen.has(photo.hash)) continue;
      seen.add(photo.hash);
      picked.push(photo);
      if (picked.length >= limit) break;
    }
  }

  // Make each picked photo at exactly the strip's height (1x, 2x and 3x screens)
  const { desktop, phone } = STRIP_HEIGHTS;
  const strip = [];

  for (const photo of picked) {
    const base = `strip/${photo.hash.slice(0, 12)}`;

    if (!sharp) {
      const copy = await processImage(photo.source, base, Infinity);
      strip.push({ src: copy.src, width: copy.width, height: copy.height });
      continue;
    }

    const at = {};
    for (const height of new Set([phone, desktop, phone * 2, desktop * 2, phone * 3])) {
      at[height] = await processImage(photo.source, `${base}-h${height}`, { height });
    }
    strip.push({
      src: at[desktop].src,
      srcset: `${at[desktop].src} 1x, ${at[desktop * 2].src} 2x`,
      srcsetPhone: `${at[phone].src} 1x, ${at[phone * 2].src} 2x, ${at[phone * 3].src} 3x`,
      width: at[desktop].width,
      height: at[desktop].height,
    });
  }
  return strip;
}


/* --------------------------------------------------------------------------
   Writing the finished site
   -------------------------------------------------------------------------- */

/** Fill in {{ setting name }} placeholders in the HTML. Add "| paragraphs" for <p> tags. */
function fillTemplate(html, text) {
  return html.replace(/\{\{\s*([a-z ]+?)\s*(?:\|\s*(paragraphs))?\s*\}\}/gi, (whole, rawKey, filter) => {
    const key = rawKey.toLowerCase();
    if (!(key in text)) {
      warn(`src/index.html uses {{ ${rawKey} }}, which isn't a setting.`);
      return "";
    }
    return filter
      ? toParagraphs(text[key]).map((p) => `<p>${escapeHTML(p)}</p>`).join("\n")
      : escapeHTML(toInline(text[key]));
  });
}

/** Copy the website template (src/) into dist/, keeping already-processed photos. */
async function copyTemplate() {
  await fs.mkdir(DIST, { recursive: true });
  for (const entry of await fs.readdir(DIST)) {
    if (entry !== "media") await fs.rm(path.join(DIST, entry), { recursive: true, force: true });
  }
  await fs.cp(SRC, DIST, { recursive: true });
}

/** Start again from scratch if the photo sizes or quality settings changed. */
async function checkPipelineVersion() {
  const marker = path.join(MEDIA, ".pipeline");
  const previous = await fs.readFile(marker, "utf8").catch(() => "");
  const current = `${PIPELINE_VERSION} sharp:${Boolean(sharp)}`;
  if (previous !== current) await fs.rm(MEDIA, { recursive: true, force: true });
  await fs.mkdir(MEDIA, { recursive: true });
  await fs.writeFile(marker, current);
}

async function build() {
  const started = Date.now();
  warnings = [];
  produced.clear();

  await checkPipelineVersion();
  await copyTemplate();

  const settings = await buildSettings();
  const hero = await buildHero();
  const about = await buildAbout();
  const shows = await buildShows();
  const performers = await buildPerformers();
  const photoStrip = await buildPhotoStrip(hero, shows, settings.photoStripLimit);

  await pruneMedia();

  const strip = (photo) => {
    const { hash, source, ...rest } = photo; // build-only details, not needed by the page
    return rest;
  };

  const data = {
    email: settings.email,
    socials: settings.socials,
    formEndpoint: settings.formEndpoint,
    secondsPerHeroPhoto: settings.secondsPerHeroPhoto,
    pastShowsToShow: settings.pastShowsToShow,
    noShowsMessage: settings.noShowsMessage,
    hero: hero.map(strip),
    about: Object.fromEntries(Object.entries(about).map(([k, v]) => [k, strip(v)])),
    shows: shows.map((show) => ({
      ...show,
      image: show.image && strip(show.image),
      photos: show.photos.map(strip),
    })),
    performers: performers.map((p) => ({ ...p, photo: p.photo && strip(p.photo) })),
    photoStrip,
  };

  await fs.writeFile(
    path.join(DIST, "js", "site-data.js"),
    "/* Generated by scripts/build.mjs from the content folder.\n" +
    "   Don't edit this file: it's rewritten on every build. Edit content/ instead. */\n" +
    `window.SITE_DATA = ${JSON.stringify(data, null, 2)};\n`
  );

  const indexFile = path.join(DIST, "index.html");
  await fs.writeFile(indexFile, fillTemplate(await fs.readFile(indexFile, "utf8"), settings.text));

  // Report
  const showPhotos = shows.reduce((sum, show) => sum + show.photos.length, 0);
  console.log(`\n✓ Built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  ${hero.length} slideshow photos, ${shows.length} shows (${showPhotos} photos), ` +
              `${performers.length} performers, ${photoStrip.length} photos in the scrolling strip`);
  if (!sharp) {
    console.log("\n! Photos were copied without resizing because the image tool isn't installed.");
    console.log("  Run  npm install  once, then build again, for a much faster website.");
  }
  if (warnings.length) {
    console.log(`\n! ${warnings.length} thing${warnings.length === 1 ? "" : "s"} to check:`);
    warnings.forEach((message) => console.log(`  - ${message}`));
  }
}


/* --------------------------------------------------------------------------
   Preview server (npm start)
   -------------------------------------------------------------------------- */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".txt": "text/plain; charset=utf-8",
};

let buildNumber = 0;

/* Added to pages only while previewing: reloads the page after each rebuild */
const LIVE_RELOAD = `<script>
  (() => {
    let seen;
    setInterval(async () => {
      try {
        const build = await (await fetch("/__build", { cache: "no-store" })).text();
        if (seen && build !== seen) location.reload();
        seen = build;
      } catch {}
    }, 1000);
  })();
</script>`;

function serve(port) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname === "/__build") {
      response.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return response.end(String(buildNumber));
    }

    let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST)) {
      response.writeHead(403);
      return response.end();
    }

    const stat = await fs.stat(file).catch(() => null);
    if (stat?.isDirectory()) file = path.join(file, "index.html");
    if (!(await exists(file))) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      return response.end("Not found");
    }

    const type = MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });

    if (type.startsWith("text/html")) {
      const html = await fs.readFile(file, "utf8");
      return response.end(html.replace("</body>", `${LIVE_RELOAD}\n</body>`));
    }
    createReadStream(file).pipe(response);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") serve(port + 1);
    else throw error;
  });

  server.listen(port, () => {
    console.log(`\nPreviewing at http://localhost:${port}`);
    console.log("Edit anything in content/ or src/ and the page refreshes by itself. Press Ctrl+C to stop.");
  });
}

async function watchAndRebuild() {
  let running = false;
  let queued = false;
  let timer = null;

  const run = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await build();
      buildNumber += 1;
    } catch (error) {
      console.error("\n✗ Build failed:", error.message);
    }
    running = false;
    if (queued) {
      queued = false;
      run();
    }
  };

  for (const dir of [CONTENT, SRC]) {
    try {
      watch(dir, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(run, 400);
      });
    } catch {
      console.log(`\n! Can't watch ${relative(dir)} for changes on this computer. Run  npm run build  after editing.`);
    }
  }
}


/* --------------------------------------------------------------------------
   Start
   -------------------------------------------------------------------------- */
try {
  await build();
  if (process.argv.includes("--serve")) {
    buildNumber = 1;
    serve(Number(process.env.PORT) || 8080);
    await watchAndRebuild();
  } else {
    console.log("\nUpload the dist folder to your web host to publish these changes.");
  }
} catch (error) {
  console.error("\n✗ Build failed:", error.message);
  process.exitCode = 1;
}
