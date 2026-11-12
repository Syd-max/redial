import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createTitleLight } from "./title-light.js";
import { startWordmarkWave } from "./wordmark-wave.js";
import { watchSectionStitch } from "./section-stitch.js";

export function startMotion() {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add("(width > 599px) and (prefers-reduced-motion: no-preference)", () => {
    const lenis = new Lenis({
      lerp: 0.12,
      smoothWheel: true,
      anchors: true,
    });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    const visibility = () => (document.hidden ? lenis.stop() : lenis.start());
    document.addEventListener("visibilitychange", visibility);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      document.removeEventListener("visibilitychange", visibility);
    };
  });

  media.add("(prefers-reduced-motion: no-preference)", () => {
    const stopStitch = watchSectionStitch(document.querySelector(".section-stitch canvas"));

    const hero = document.querySelector(".hero");
    const wordmark = hero.querySelector(".wordmark");
    const root = document.documentElement;
    let light;
    let opening;
    let vineGrowth;
    let stopWave;
    const beginWave = () => {
      stopWave = startWordmarkWave(wordmark);
    };
    const intro = new IntersectionObserver(
      ([entry]) => {
        intro.disconnect();
        if (entry.intersectionRatio >= 0.6 && getComputedStyle(wordmark).opacity === "0") {
          light = createTitleLight(hero, wordmark);
        }
        if (!light) {
          root.classList.remove("intro-pending");
          hero.classList.remove("vines-pending");
          beginWave();
          return;
        }
        const state = { progress: 0 };
        opening = gsap.to(state, {
          progress: 1,
          duration: 3.4,
          ease: "none",
          onUpdate: () => light.draw(state.progress),
          onComplete: () => {
            vineGrowth = gsap.fromTo(
              hero.querySelectorAll(".hero-vine"),
              {
                "--vine-growth": "0%",
                rotation: (index) => (index === 0 ? 2.5 : -2.5),
              },
              {
                "--vine-growth": "114%",
                rotation: 0,
                duration: 1.9,
                stagger: 0.12,
                ease: "power2.inOut",
                clearProps: "--vine-growth,transform",
              },
            );
            hero.classList.remove("vines-pending");
            light.remove();
            beginWave();
          },
        });
        root.classList.remove("intro-pending");
      },
      { threshold: 0.6 },
    );
    if (root.classList.contains("intro-pending")) {
      hero.classList.add("vines-pending");
      intro.observe(hero);
    } else beginWave();

    gsap.fromTo(
      ".countdown-card",
      { y: 16 },
      {
        y: 0,
        ease: "none",
        scrollTrigger: {
          trigger: ".countdown",
          start: "top bottom",
          end: "top 75%",
          scrub: 0.45,
        },
      },
    );

    document.fonts.ready.then(() => ScrollTrigger.refresh());
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh, { once: true });
    return () => {
      intro.disconnect();
      root.classList.remove("intro-pending");
      hero.classList.remove("vines-pending");
      opening?.revert();
      vineGrowth?.revert();
      stopWave?.();
      stopStitch();
      if (light) light.remove();
      window.removeEventListener("load", refresh);
    };
  });
}
