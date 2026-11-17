import "lenis/dist/lenis.css";
import "./countdown.js";
import "./intro-audio.js";
import { content } from "./content.js";
import { inject } from "@vercel/analytics";

inject();

const menu = document.querySelector(".menu-toggle");
const links = document.querySelector(".nav-links");
const nav = document.querySelector(".landing-nav");
const hero = document.querySelector(".hero");

const heroObserver = new IntersectionObserver(
  ([entry]) => {
    const compact = !entry.isIntersecting;
    if (compact === nav.classList.contains("is-compact")) return;
    const menuHadFocus = document.activeElement === menu;
    const linkHadFocus = links.contains(document.activeElement);
    nav.classList.toggle("is-compact", compact);
    closeMenu();
    if (compact && menuHadFocus)
      links.querySelector("a").focus({ preventScroll: true });
    if (!compact && linkHadFocus && menu.getClientRects().length) {
      menu.focus({ preventScroll: true });
    }
  },
  { rootMargin: "-1px 0px 0px" },
);
heroObserver.observe(hero);

const sectionLinks = [...links.querySelectorAll('a[href^="#"]')];
const visibleSections = new Set();
const sectionObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleSections.add(entry.target.id);
      else visibleSections.delete(entry.target.id);
    }
    const activeIndex = sectionLinks.findIndex((link) =>
      visibleSections.has(link.hash.slice(1)),
    );
    if (activeIndex >= 0) links.style.setProperty("--active-link", activeIndex);
    links.toggleAttribute("data-active", activeIndex >= 0);
    sectionLinks.forEach((link, index) => {
      if (index === activeIndex) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  },
  { rootMargin: "-15% 0px -84% 0px" },
);
for (const link of sectionLinks) {
  sectionObserver.observe(document.getElementById(link.hash.slice(1)));
}

const eventMap = document.querySelector("[data-event-map]");
const eventMapObserver = new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting) return;
  eventMap.src = eventMap.dataset.eventMap;
  eventMapObserver.disconnect();
}, { rootMargin: "120px 0px" });
eventMapObserver.observe(eventMap);

function closeMenu() {
  links.classList.remove("open");
  menu.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-label", "Buka menu");
}
menu.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
});
links.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && links.classList.contains("open")) {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".nav")) closeMenu();
});

const aboutDetails = document.querySelector("#about-details");
document.querySelector(".about-details-button").addEventListener("click", () => {
  aboutDetails.showModal();
});

if (content.videos.length) {
  const videos = content.videos.map(({ id, title, provider = "youtube", thumbnailUrl, mediaUrl, kind }) => {
    if (provider === "drive") {
      const fileUrl = `https://drive.google.com/file/d/${id}`;
      return {
        title,
        provider,
        kind,
        mediaUrl,
        thumbnailUrl: thumbnailUrl ?? `https://drive.google.com/thumbnail?id=${id}&sz=w480`,
        embedUrl: `${fileUrl}/preview`,
      };
    }
    return {
      title,
      provider,
      thumbnailUrl: thumbnailUrl ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1`,
    };
  });
  const carousel = document.querySelector(".video-carousel");
  const stage = carousel.querySelector(".video-stage");
  const poster = carousel.querySelector(".video-poster");
  const thumbnail = poster.querySelector("img");
  const playBadge = poster.querySelector(".video-play");
  const cardTitle = poster.querySelector(".video-card-title");
  const controls = carousel.querySelector(".video-controls");
  const position = carousel.querySelector(".video-position");
  const previous = carousel.querySelector(".video-prev");
  const next = carousel.querySelector(".video-next");
  const peeks = carousel.querySelectorAll(".video-peek");
  const videoCount = videos.length;
  let current = 0;
  let embedResize;

  function showVideo() {
    const video = videos[current];
    embedResize?.disconnect();
    embedResize = undefined;
    const player = stage.querySelector("iframe, video");
    if (player instanceof HTMLVideoElement) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    player?.remove();
    thumbnail.hidden = false;
    thumbnail.src = video.thumbnailUrl;
    poster.dataset.provider = video.provider;
    cardTitle.textContent = video.title;
    const isPhoto = video.kind === "photo";
    playBadge.hidden = isPhoto;
    poster.setAttribute("aria-label", `${isPhoto ? "Buka" : "Putar"} ${video.title}`);
    position.textContent = `${current + 1} / ${videoCount}`;
    previous.disabled = current === 0;
    next.disabled = current === videoCount - 1;
    peeks.forEach((preview, index) => {
      const neighbor = videos[current + (index === 0 ? -1 : 1)];
      preview.hidden = !neighbor;
      if (neighbor) preview.src = neighbor.thumbnailUrl;
      else preview.removeAttribute("src");
    });
    poster.hidden = false;
  }

  function moveVideo(direction) {
    const button = direction < 0 ? previous : next;
    const otherButton = direction < 0 ? next : previous;
    const hadFocus = document.activeElement === button;
    current += direction;
    showVideo();
    if (hadFocus && button.disabled) otherButton.focus({ preventScroll: true });
    if (matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      poster.animate(
        [
          { transform: `translateX(${direction * 14}px)`, opacity: 0.65 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: 230, easing: "ease-out" },
      );
    }
  }

  [thumbnail, ...peeks].forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
    });
  });

  poster.addEventListener("click", () => {
    const { title, embedUrl, provider, mediaUrl, thumbnailUrl } = videos[current];
    const player = document.createElement(mediaUrl ? "video" : "iframe");
    player.title = title;
    if (mediaUrl) {
      player.controls = true;
      player.playsInline = true;
      player.preload = "none";
      player.poster = thumbnailUrl;
      player.setAttribute("aria-label", title);
    } else {
      player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      player.allowFullscreen = true;
      player.referrerPolicy = "strict-origin-when-cross-origin";
    }
    player.src = mediaUrl ?? embedUrl;
    const restoreFocus = document.activeElement === poster;
    stage.append(player);
    if (!mediaUrl) {
      player.style.transformOrigin = "top left";
      const minimumHeight = provider === "drive" ? 300 : 200;
      const fitPlayer = () => {
        const { width, height } = stage.getBoundingClientRect();
        // Keep the provider's full viewport inside the card, including its controls.
        const scale = Math.min(1, width / 200, height / minimumHeight);
        if (!scale) return;
        player.style.width = `${width / scale}px`;
        player.style.height = `${height / scale}px`;
        player.style.transform = `scale(${scale})`;
      };
      fitPlayer();
      embedResize = new ResizeObserver(fitPlayer);
      embedResize.observe(stage);
    }
    poster.hidden = true;
    if (restoreFocus) player.focus({ preventScroll: true });
    if (mediaUrl) player.play().catch(() => {});
  });

  controls.hidden = videoCount < 2;
  previous.addEventListener("click", () => moveVideo(-1));
  next.addEventListener("click", () => moveVideo(1));
  showVideo();
  carousel.hidden = false;
}

const throwbackCover = document.querySelector(".throwback-cover");
throwbackCover.addEventListener("click", () => {
  const player = document.createElement("iframe");
  player.title = "After Movie REDIAL 4.0";
  player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  player.allowFullscreen = true;
  player.referrerPolicy = "strict-origin-when-cross-origin";
  player.src = "https://www.youtube-nocookie.com/embed/R4qcoEbA3uQ?autoplay=1&playsinline=1";
  throwbackCover.replaceWith(player);
  player.focus({ preventScroll: true });
}, { once: true });

document.querySelector("#donation-qr").src = content.donationQr;
document.querySelector(".donation-card a").href = content.donationQr;
const partners = document.querySelector("#partners");
for (const category of ["Sponsor", "Media Partner"]) {
  const group = content.partners.filter(
    (partner) => partner.category === category,
  );
  if (!group.length) continue;
  partners.hidden = false;
  const heading = document.createElement("h3");
  heading.textContent = category;
  const row = document.createElement("div");
  row.className = "partner-group";
  for (const partner of group) {
    const img = document.createElement("img");
    img.src = partner.image;
    img.alt = partner.name;
    img.loading = "lazy";
    row.append(img);
  }
  partners.append(heading, row);
}

const heroReady = Promise.allSettled([
  document.querySelector(".wordmark").decode(),
  document.querySelector(".hero-photo").decode(),
]);
heroReady.then(() => document.documentElement.classList.remove("page-loading"));

// Motion is downloaded only for visitors who allow it.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  if (performance.getEntriesByType("navigation")[0]?.type !== "back_forward") {
    const tagline = document.querySelector(".about-tagline");
    const taglineObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < 0.2) return;
        taglineObserver.disconnect();
        tagline.classList.replace("tagline-pending", "tagline-revealed");
      },
      { threshold: 0.2 },
    );
    tagline.classList.add("tagline-pending");
    taglineObserver.observe(tagline);
  }

  Promise.all([import("./motion.js"), heroReady])
    .then(([{ startMotion }]) => startMotion())
    .catch(() => {
      document.documentElement.classList.remove("intro-pending");
    });
}
