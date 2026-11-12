const eventDate = document.querySelector(".hero-date time").dateTime;
const deadline = Date.parse(eventDate + "T00:00:00+07:00");
const nextDay = deadline + 86400000;
const clock = document.querySelector(".countdown-clock");
const digits = clock.querySelectorAll(".countdown-number");
const message = document.querySelector(".countdown-message");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const units = [86400, 3600, 60, 1];

function updateCountdown() {
  const now = Date.now();
  let remaining = Math.ceil((deadline - now) / 1000);
  clock.hidden = remaining <= 0;
  message.hidden = !clock.hidden;

  if (clock.hidden) {
    message.textContent =
      now < nextDay ? "Hari ini" : "Tanggal acara sudah lewat";
    if (now < nextDay) setTimeout(updateCountdown, nextDay - now);
    return;
  }

  digits.forEach((digit, index) => {
    const unit = units[index];
    const next = String(Math.floor(remaining / unit)).padStart(2, "0");
    remaining %= unit;
    if (digit.textContent === next) return;
    const animateChange = digit.textContent && !reduceMotion.matches;
    digit.textContent = next;
    if (animateChange) {
      digit.animate(
        [
          { opacity: 0.56, transform: "translateY(2px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 220, easing: "ease-out" },
      );
    }
  });

  setTimeout(updateCountdown, 1000 - (now % 1000));
}

updateCountdown();
