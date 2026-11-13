const button = document.querySelector(".intro-audio-button");
const label = button.querySelector("span");
const sessionKey = "redial-intro-played";

function introAlreadyPlayed() {
  try {
    return sessionStorage.getItem(sessionKey) === "1";
  } catch {
    return false;
  }
}

const isReload = performance.getEntriesByType("navigation")[0]?.type === "reload";

if (isReload || !introAlreadyPlayed()) {
  const audio = new Audio();
  audio.preload = "none";
  audio.src = "/assets/redial-intro.mp3";
  const listeners = new AbortController();
  const { signal } = listeners;
  let started = false;

  function finishIntro() {
    listeners.abort();
    audio.pause();
    button.hidden = true;
  }

  function highlightMusicButton(event) {
    if (!event.isTrusted || event.pointerType !== "mouse") return;
    document.removeEventListener("pointermove", highlightMusicButton);
    if (!started) button.dataset.mouseHint = "";
  }

  function playIntro() {
    audio.play().catch((error) => {
      if (signal.aborted || started) return;
      if (error.name !== "NotAllowedError") {
        finishIntro();
        return;
      }
      button.hidden = false;
      if (!button.hasAttribute("data-mouse-hint")) {
        document.addEventListener("pointermove", highlightMusicButton, { passive: true, signal });
      }
    });
  }

  audio.addEventListener("playing", () => {
    if (started) return;
    started = true;
    document.removeEventListener("pointermove", highlightMusicButton);
    delete button.dataset.mouseHint;
    label.textContent = "Hentikan musik";
    button.hidden = false;
    try {
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      // The intro can still play once on this page when storage is unavailable.
    }
  }, { signal });
  audio.addEventListener("ended", finishIntro, { once: true, signal });
  window.addEventListener("pagehide", finishIntro, { once: true, signal });

  button.addEventListener("click", () => {
    if (started) finishIntro();
    else playIntro();
  }, { signal });

  document.addEventListener("click", (event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    if (event.target.closest(".video-poster, .throwback-cover")) {
      finishIntro();
      return;
    }
    if (!started && !event.target.closest(".intro-audio-button")) playIntro();
  }, { capture: true, signal });

  playIntro();
}
