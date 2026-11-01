/* ==========================================================================
   Callbacks Only: page behaviour
   --------------------------------------------------------------------------
   Builds the slideshow, shows, performers and photo strip from
   js/site-data.js (which the build script writes from the content folder),
   and runs the interactive parts: galleries, navigation and the contact form.

   You don't need to edit this file to change content. Edit content/ instead.
   ========================================================================== */
(() => {
  "use strict";

  const DATA = window.SITE_DATA;
  if (!DATA) {
    console.error("js/site-data.js is missing. Run  npm run build  and open dist/index.html.");
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PHOTO_STRIP_SECONDS_PER_PHOTO = 5;

  /* How wide a slideshow photo is shown, so the browser downloads the version
     that matches. Photos cover the whole screen, so on screens narrower than
     a 3:2 photo they're wider than the screen. */
  const HERO_IMAGE_SIZES = "(max-aspect-ratio: 3/2) 150vh, 100vw";


  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /** Make text safe to place inside HTML. */
  const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);

  /** Width and height attributes, so the page doesn't jump as photos load. */
  const sizeAttributes = (image) =>
    image?.width && image?.height ? `width="${image.width}" height="${image.height}"` : "";

  /** "2026-10-02" -> Date at local midnight (avoids timezone surprises). */
  const parseDate = (iso) => (iso ? new Date(`${iso}T00:00:00`) : null);

  /** Today's date as YYYY-MM-DD in the visitor's own timezone. */
  const todayISO = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };

  const formatLongDate = (date) =>
    date.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const formatMonthYear = (date) =>
    date.toLocaleDateString("en-NZ", { month: "short", year: "numeric" });


  /* ------------------------------------------------------------------------
     Icons
     ------------------------------------------------------------------------ */
  const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
  const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const ICONS = {
    instagram: svg(`<rect x="3" y="3" width="18" height="18" rx="5" ${stroke}/><circle cx="12" cy="12" r="4.2" ${stroke}/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/>`),
    facebook: svg(`<path fill="currentColor" d="M14 8V6.5c0-.7.3-1 1-1h2V2h-3c-2.8 0-4 1.8-4 4v2H7v3.5h3V22h4V11.5h2.8L17.5 8z"/>`),
    tiktok: svg(`<path fill="currentColor" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 0 1-2.6 2.5 2.6 2.6 0 0 1-2.6-2.6c0-1.7 1.7-3 3.4-2.5V9.7c-3.5-.5-6.5 2.2-6.5 5.6 0 3.3 2.8 5.7 5.7 5.7 3.1 0 5.7-2.6 5.7-5.7V9a7.4 7.4 0 0 0 4.3 1.4V7.3s-1.9.1-3.2-1.5z"/>`),
    youtube: svg(`<rect x="2.5" y="5" width="19" height="14" rx="4" ${stroke}/><path fill="currentColor" d="M10 9.2v5.6l4.8-2.8z"/>`),
    pause: svg(`<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>`),
    play: svg(`<path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/>`),
  };

  const NETWORK_NAMES = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };


  /* ------------------------------------------------------------------------
     Contact details (email and social links appear in several places)
     ------------------------------------------------------------------------ */
  function renderContactDetails() {
    const socials = (DATA.socials || []).map(({ network, url }) => {
      const label = NETWORK_NAMES[network] || network;
      return `<li><a href="${escapeHTML(url)}" target="_blank" rel="noopener" aria-label="${label}" title="${label}">${ICONS[network] || ""}</a></li>`;
    }).join("");

    $$("[data-social-links]").forEach((list) => {
      list.innerHTML = socials;
      list.hidden = !socials;
    });

    $$("[data-email-link]").forEach((link) => {
      link.href = `mailto:${DATA.email}`;
      link.textContent = DATA.email;
      link.hidden = !DATA.email;
    });

    $$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
  }


  /* ------------------------------------------------------------------------
     Hero slideshow
     Fades between the photos in content/hero, resting on each one. Photos
     load one step ahead so the page stays quick.
     ------------------------------------------------------------------------ */
  function initHeroSlideshow() {
    const hero = $("[data-hero]");
    const stage = $("[data-hero-slides]");
    const controls = $("[data-hero-controls]");
    const photos = DATA.hero || [];
    if (!hero || !stage || !photos.length) return;

    const seconds = DATA.secondsPerHeroPhoto || 6;
    hero.style.setProperty("--slide-duration", `${seconds}s`);

    // Only the first photo loads straight away; the rest wait in data- attributes
    stage.innerHTML = photos.map((photo, i) => {
      const classes = `hero__slide${photo.portrait ? " hero__slide--portrait" : ""}${i === 0 ? " is-active" : ""}`;
      const prefix = i === 0 ? "" : "data-";
      const srcset = photo.srcset ? ` ${prefix}srcset="${photo.srcset}" sizes="${HERO_IMAGE_SIZES}"` : "";
      return `<img class="${classes}" ${prefix}src="${photo.src}"${srcset} alt=""${i === 0 ? ' fetchpriority="high"' : ""}>`;
    }).join("");

    if (photos.length < 2) return;

    controls.innerHTML = `
      <div class="hero__progress" aria-hidden="true">
        ${photos.map((_, i) => `<span class="hero__bar${i === 0 ? " is-active" : ""}"></span>`).join("")}
      </div>
      <button class="icon-button" type="button" data-hero-toggle></button>`;

    const slides = $$(".hero__slide", stage);
    const bars = $$(".hero__bar", controls);
    const toggle = $("[data-hero-toggle]", controls);
    let current = 0;
    let timer = null;
    let paused = reduceMotion;

    const load = (img) => {
      if (!img?.dataset.src) return;
      if (img.dataset.srcset) {
        img.srcset = img.dataset.srcset;
        img.removeAttribute("data-srcset");
      }
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    };

    const restartProgress = () => {
      const bar = bars[current];
      bar.classList.remove("is-active");
      void bar.offsetWidth; // reflow so the animation starts again
      bar.classList.add("is-active");
    };

    const goTo = (index) => {
      slides[current].classList.remove("is-active");
      bars[current].classList.remove("is-active");
      current = (index + slides.length) % slides.length;
      load(slides[current]);
      load(slides[(current + 1) % slides.length]);
      slides[current].classList.add("is-active");
      bars[current].classList.add("is-active");
    };

    const stop = () => window.clearInterval(timer);
    const start = () => {
      stop();
      restartProgress();
      timer = window.setInterval(() => goTo(current + 1), seconds * 1000);
    };

    const setPaused = (value) => {
      paused = value;
      hero.classList.toggle("is-paused", paused);
      toggle.innerHTML = paused ? ICONS.play : ICONS.pause;
      toggle.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
      if (paused) stop(); else start();
    };

    toggle.addEventListener("click", () => setPaused(!paused));

    // Don't keep cycling in a background tab
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (!paused) start();
    });

    load(slides[1]);
    setPaused(paused);
  }


  /* ------------------------------------------------------------------------
     About photos (content/about/main.jpg and inset.jpg)
     ------------------------------------------------------------------------ */
  function renderAbout() {
    const slot = $("[data-about-media]");
    const grid = $("[data-about-grid]");
    const { main, inset } = DATA.about || {};
    if (!slot) return;

    if (!main && !inset) {
      slot.remove();
      grid?.classList.add("about__grid--text-only");
      return;
    }

    slot.innerHTML = [
      main && `<img class="about__photo about__photo--main" src="${main.src}" ${sizeAttributes(main)} alt="" loading="lazy">`,
      inset && `<img class="about__photo about__photo--inset" src="${inset.src}" ${sizeAttributes(inset)} alt="" loading="lazy">`,
    ].filter(Boolean).join("");
  }


  /* ------------------------------------------------------------------------
     Scrolling photo strip
     Filled automatically from the slideshow and every show's photos. The
     list is drawn twice so it can loop forever without a gap.
     ------------------------------------------------------------------------ */
  function renderPhotoStrip() {
    const track = $("[data-photo-band]");
    const photos = DATA.photoStrip || [];
    if (!track) return;

    if (!photos.length) {
      $("[data-photo-band-section]")?.remove();
      return;
    }

    // Each photo comes in sizes that exactly match the strip's height on
    // phones and larger screens, so it stays crisp while it moves
    const items = photos.map((photo) => {
      const srcset = photo.srcset ? ` srcset="${photo.srcset}"` : "";
      const phone = photo.srcsetPhone ? `<source media="(max-width: 47.99rem)" srcset="${photo.srcsetPhone}">` : "";
      return `<picture class="photo-band__item">${phone}<img class="photo-band__photo" src="${photo.src}"${srcset} ${sizeAttributes(photo)} alt="" loading="lazy" decoding="async"></picture>`;
    }).join("");

    track.innerHTML = items + items;
    track.style.setProperty("--band-duration", `${photos.length * PHOTO_STRIP_SECONDS_PER_PHOTO}s`);
  }


  /* ------------------------------------------------------------------------
     Shows
     Upcoming shows are always listed. Past shows show the newest few, with
     a button to reveal the rest.
     ------------------------------------------------------------------------ */
  function renderShows() {
    const upcomingSlot = $("[data-upcoming-shows]");
    const pastList = $("[data-past-shows]");
    const pastGroup = $("[data-past-group]");
    const toggle = $("[data-past-toggle]");
    if (!upcomingSlot || !pastList) return;

    const shows = DATA.shows || [];
    const today = todayISO();
    const byDate = (a, b) => (a.date || "").localeCompare(b.date || "");

    const upcoming = shows.filter((show) => show.date && show.date >= today).sort(byDate);
    const past = shows.filter((show) => !show.date || show.date < today).sort((a, b) => byDate(b, a));

    upcomingSlot.innerHTML = upcoming.length
      ? `<ul class="show-list">${upcoming.map((show) => showTemplate(show, true)).join("")}</ul>`
      : `<div class="empty-state">
           <p>${escapeHTML(DATA.noShowsMessage)}</p>
           <ul class="social-links" aria-label="Follow Callbacks Only" data-social-links></ul>
         </div>`;

    if (!past.length) {
      pastGroup?.remove();
      return;
    }

    pastList.innerHTML = past.map((show) => showTemplate(show, false)).join("");

    // Hide all but the newest few past shows behind a button
    const visible = DATA.pastShowsToShow || 3;
    const extra = $$(".show", pastList).slice(visible);
    if (!extra.length || !toggle) return;

    const setExpanded = (expanded) => {
      extra.forEach((item) => { item.hidden = !expanded; });
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.textContent = expanded ? "Show fewer past shows" : `See all ${past.length} past shows`;
    };

    toggle.hidden = false;
    setExpanded(false);

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") !== "true";
      setExpanded(expanded);
      if (expanded) {
        extra[0].querySelector("button, a")?.focus({ preventScroll: true });
      } else {
        // Bring the list back into view so people don't lose their place
        $("#past-shows-heading")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
  }

  function showTemplate(show, isUpcoming) {
    const id = DATA.shows.indexOf(show);
    const title = escapeHTML(show.title);
    const date = parseDate(show.date);
    const photos = show.photos || [];

    const dateBlock = date
      ? `<span class="show__day">${date.getDate()}</span><span class="show__month">${formatMonthYear(date)}</span>`
      : "";

    const when = date ? [formatLongDate(date), show.time].filter(Boolean).join(", ") : show.time;
    const details = [when, show.venue].filter(Boolean).map(escapeHTML).join("<br>");

    const image = show.image
      ? `<img src="${show.image.src}" ${sizeAttributes(show.image)} alt="${show.image.fit === "contain" ? `Poster for ${title}` : ""}" loading="lazy">`
      : "";
    const mediaClass = `show__media${show.image?.fit === "contain" ? " show__media--poster" : ""}`;

    const media = !image
      ? ""
      : photos.length
        ? `<button class="${mediaClass}" type="button" data-open-gallery="${id}" aria-label="View ${photos.length} photos from ${title}">
             ${image}<span class="show__count" aria-hidden="true">${photos.length} photo${photos.length === 1 ? "" : "s"}</span>
           </button>`
        : `<div class="${mediaClass}">${image}</div>`;

    const actions = [
      isUpcoming && show.tickets
        ? `<a class="button button--primary" href="${escapeHTML(show.tickets)}" target="_blank" rel="noopener">Get tickets</a>`
        : "",
      photos.length
        ? `<button class="button button--ghost button--small" type="button" data-open-gallery="${id}">View photos</button>`
        : "",
    ].filter(Boolean).join("");

    const description = (show.description || []).map((p) => `<p class="show__description">${escapeHTML(p)}</p>`).join("");

    return `
      <li class="show${isUpcoming ? " show--upcoming" : ""}">
        <div class="show__date">${dateBlock}</div>
        <div class="show__body">
          <h4 class="show__title">${title}</h4>
          ${show.tagline ? `<p class="show__tagline">${escapeHTML(show.tagline)}</p>` : ""}
          ${details ? `<p class="show__when">${details}</p>` : ""}
          ${description}
          ${actions ? `<div class="show__actions">${actions}</div>` : ""}
        </div>
        ${media}
      </li>`;
  }


  /* ------------------------------------------------------------------------
     Show gallery (a <dialog> with a large photo and thumbnails)
     Keyboard: arrow keys move between photos, Escape closes.
     ------------------------------------------------------------------------ */
  function initGallery() {
    const dialog = $("[data-gallery]");
    if (!dialog || typeof dialog.showModal !== "function") return;

    const title = $("[data-gallery-title]", dialog);
    const meta = $("[data-gallery-meta]", dialog);
    const stage = $("[data-gallery-stage]", dialog);
    const image = $("[data-gallery-image]", dialog);
    const count = $("[data-gallery-count]", dialog);
    const thumbs = $("[data-gallery-thumbs]", dialog);

    let photos = [];
    let showTitle = "";
    let current = 0;

    const goTo = (index) => {
      current = (index + photos.length) % photos.length;
      image.src = photos[current].src;
      image.alt = `Photo ${current + 1} of ${photos.length} from ${showTitle}`;
      count.textContent = `${current + 1} / ${photos.length}`;

      $$(".gallery__thumb", thumbs).forEach((thumb, i) => {
        thumb.setAttribute("aria-current", String(i === current));
      });
      thumbs.children[current]?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };

    const open = (show) => {
      photos = show?.photos || [];
      if (!photos.length) return;

      showTitle = show.title;
      title.textContent = show.title;
      const date = parseDate(show.date);
      meta.textContent = [date && formatLongDate(date), show.venue].filter(Boolean).join(", ");

      thumbs.innerHTML = photos.map((photo, i) => `
        <button class="gallery__thumb" type="button" data-index="${i}" aria-label="Show photo ${i + 1}">
          <img src="${photo.thumb}" alt="" loading="lazy">
        </button>`).join("");

      dialog.showModal();
      goTo(0);
    };

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-open-gallery]");
      if (trigger) open(DATA.shows[Number(trigger.dataset.openGallery)]);
    });

    thumbs.addEventListener("click", (event) => {
      const thumb = event.target.closest("[data-index]");
      if (thumb) goTo(Number(thumb.dataset.index));
    });

    $("[data-gallery-prev]", dialog).addEventListener("click", () => goTo(current - 1));
    $("[data-gallery-next]", dialog).addEventListener("click", () => goTo(current + 1));
    $("[data-gallery-close]", dialog).addEventListener("click", () => dialog.close());

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") goTo(current + 1);
      if (event.key === "ArrowLeft") goTo(current - 1);
    });

    // Clicking the dark area around the dialog closes it
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    // Swipe left or right on touch screens
    let swipeStartX = null;
    stage.addEventListener("pointerdown", (event) => { swipeStartX = event.clientX; });
    stage.addEventListener("pointerup", (event) => {
      if (swipeStartX === null) return;
      const distance = event.clientX - swipeStartX;
      if (Math.abs(distance) > 50) goTo(current + (distance < 0 ? 1 : -1));
      swipeStartX = null;
    });

    dialog.addEventListener("close", () => image.removeAttribute("src"));
  }


  /* ------------------------------------------------------------------------
     Performers
     ------------------------------------------------------------------------ */
  function renderPerformers() {
    const list = $("[data-performers]");
    if (!list) return;

    list.innerHTML = (DATA.performers || []).map((person) => {
      const name = escapeHTML(person.name);
      const initials = person.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();

      const photo = person.photo
        ? `<img class="performer__photo" src="${person.photo.src}" ${sizeAttributes(person.photo)} alt="${name}" loading="lazy">`
        : `<div class="performer__photo performer__photo--initials" aria-hidden="true">${escapeHTML(initials)}</div>`;

      return `
        <li class="performer">
          ${photo}
          <h3 class="performer__name">${name}</h3>
          ${person.role ? `<p class="performer__role">${escapeHTML(person.role)}</p>` : ""}
          ${person.bio ? `<p class="performer__bio">${escapeHTML(person.bio)}</p>` : ""}
        </li>`;
    }).join("");
  }


  /* ------------------------------------------------------------------------
     Header: solid background once scrolled, mobile menu, current section
     ------------------------------------------------------------------------ */
  function initHeader() {
    const header = $("[data-header]");
    const nav = $("[data-nav]");
    const toggle = $("[data-nav-toggle]");
    if (!header || !nav || !toggle) return;

    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const setMenuOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      header.classList.toggle("is-menu-open", open);
    };

    toggle.addEventListener("click", () => setMenuOpen(toggle.getAttribute("aria-expanded") !== "true"));
    nav.addEventListener("click", (event) => { if (event.target.closest("a")) setMenuOpen(false); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenuOpen(false); });

    // Underline the nav link for the section currently on screen
    if (!("IntersectionObserver" in window)) return;
    const links = $$(".site-nav__link", nav);
    // Contact is watched too, so no link stays underlined once you reach it
    const sections = [...links.map((link) => $(link.getAttribute("href"))), $("#contact")].filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          if (link.getAttribute("href") === `#${entry.target.id}`) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });

    sections.forEach((section) => observer.observe(section));
  }


  /* ------------------------------------------------------------------------
     Contact form
     Sends through the "form address" in settings.txt if there is one,
     otherwise opens the visitor's email app with the message filled in.
     ------------------------------------------------------------------------ */
  function initContactForm() {
    const form = $("[data-contact-form]");
    if (!form) return;

    const status = $("[data-form-status]", form);
    const button = $("button[type='submit']", form);

    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle("is-error", isError);
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);

      if (!DATA.formEndpoint) {
        const subject = `Website enquiry from ${data.get("name")}`;
        const body = `${data.get("message")}\n\n${data.get("name")}\n${data.get("email")}`;
        window.location.href = `mailto:${DATA.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        setStatus("Your email app should open with the message ready to send.");
        return;
      }

      button.disabled = true;
      setStatus("Sending…");

      try {
        const response = await fetch(DATA.formEndpoint, {
          method: "POST",
          body: data,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Form service replied ${response.status}`);
        form.reset();
        setStatus("Message sent. We’ll reply by email soon.");
      } catch (error) {
        setStatus(`Your message didn’t send. Check your connection and try again, or email ${DATA.email}.`, true);
      } finally {
        button.disabled = false;
      }
    });
  }


  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */
  renderShows();
  renderPerformers();
  renderAbout();
  renderPhotoStrip();
  renderContactDetails(); // after shows, which can add social links too
  initHeroSlideshow();
  initGallery();
  initHeader();
  initContactForm();
})();
