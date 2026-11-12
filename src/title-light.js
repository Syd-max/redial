function smooth(value) {
  const progress = Math.max(0, Math.min(value, 1));
  return progress * progress * (3 - 2 * progress);
}

function pointOnPath({ origin, first, second, center }, progress) {
  const inverse = 1 - progress;
  const startWeight = inverse ** 3;
  const firstWeight = 3 * inverse ** 2 * progress;
  const secondWeight = 3 * inverse * progress ** 2;
  const endWeight = progress ** 3;
  return {
    x:
      origin.x * startWeight +
      first.x * firstWeight +
      second.x * secondWeight +
      center.x * endWeight,
    y:
      origin.y * startWeight +
      first.y * firstWeight +
      second.y * secondWeight +
      center.y * endWeight,
  };
}

export function createTitleLight(hero, image) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const reveal = document.createElement("canvas");
  const revealContext = reveal.getContext("2d");
  const stencil = document.createElement("canvas");
  const stencilContext = stencil.getContext("2d");
  const flare = document.createElement("canvas");
  flare.width = flare.height = 96;
  const flareContext = flare.getContext("2d");
  if (
    !context ||
    !revealContext ||
    !stencilContext ||
    !flareContext ||
    !image.naturalWidth
  )
    return null;

  const gradient = flareContext.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, "#fff2cc");
  gradient.addColorStop(0.22, "#efd292ed");
  gradient.addColorStop(0.46, "#bd8d439c");
  gradient.addColorStop(1, "#bd8d4300");
  flareContext.fillStyle = gradient;
  flareContext.fillRect(0, 0, 96, 96);

  const star = document.createElement("canvas");
  star.width = star.height = 96;
  const starContext = star.getContext("2d");
  if (!starContext) return null;
  starContext.drawImage(flare, 0, 0);
  starContext.fillStyle = "#fff5d3";
  starContext.beginPath();
  starContext.moveTo(48, 16);
  starContext.lineTo(52, 44);
  starContext.lineTo(77, 48);
  starContext.lineTo(52, 52);
  starContext.lineTo(48, 80);
  starContext.lineTo(44, 52);
  starContext.lineTo(19, 48);
  starContext.lineTo(44, 44);
  starContext.closePath();
  starContext.fill();

  const { width, height, left, top } = hero.getBoundingClientRect();
  const title = image.getBoundingClientRect();
  const center = {
    x: title.left - left + title.width / 2,
    y: title.top - top + title.height / 2,
  };
  const ratio = Math.min(devicePixelRatio, 1.5, 1440 / width, 1050 / height);
  canvas.className = "wordmark-flare";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.scale(ratio, ratio);
  hero.append(canvas);

  const wrapper = image.parentElement;
  const revealStart = 0.71;
  reveal.className = "wordmark-reveal";
  reveal.setAttribute("aria-hidden", "true");
  wrapper.append(reveal);
  wrapper.classList.add("is-revealing");

  const curve = Math.min(width, height) * 0.58;
  const sparkleCount = width < 600 ? 23 : 34;
  const paths = [
    [-0.08, 0.39, 0.01, -1.12],
    [1.06, 0.18, 0.05, -0.76],
    [0.2, -0.05, 0.11, -0.83],
    [0.82, 1.04, 0.07, 0.86],
    [-0.04, 0.84, 0.14, -0.7],
  ].map(([x, y, delay, bend], index) => {
    const origin = { x: x * width, y: y * height };
    const dx = center.x - origin.x;
    const dy = center.y - origin.y;
    const normal = (curve * bend) / Math.hypot(dx, dy);
    return {
      origin,
      center,
      delay,
      sparkles: Array.from({ length: sparkleCount }, (_, sparkleIndex) => {
        const seed = sparkleIndex * 71 + index * 47;
        return {
          lag: ((sparkleIndex + (seed % 17) / 17) / sparkleCount) * 0.32,
          x: ((seed % 23) - 11) * 1.3,
          y: ((seed % 19) - 9) * 1.35,
          size: 4.3 + (seed % 13) * 0.35,
          shimmer: (seed % 37) / 6,
        };
      }),
      first: {
        x: origin.x + dx * 0.27 - dy * normal,
        y: origin.y + dy * 0.27 + dx * normal,
      },
      second: {
        x: origin.x + dx * 0.73 + dy * normal * 0.86,
        y: origin.y + dy * 0.73 - dx * normal * 0.86,
      },
    };
  });
  const starSize = Math.min(width * 0.11, 62);

  function drawWordmark(progress) {
    const scale = Math.min(devicePixelRatio, 3);
    const width = Math.round(image.clientWidth * scale);
    const height = Math.round(image.clientHeight * scale);
    if (!width || !height) return;
    if (stencil.width !== width || stencil.height !== height) {
      stencil.width = reveal.width = width;
      stencil.height = reveal.height = height;
      stencilContext.imageSmoothingQuality = "high";
      stencilContext.drawImage(image, 0, 0, width, height);
    }

    // The gold edge only paints inside the exact silhouette of the final image.
    const spread = smooth((progress - revealStart) / (1 - revealStart));
    const halfWidth = width * (0.018 + spread * 0.55);
    const edge = Math.min(0.42, (width * 0.05) / halfWidth);
    const ink = revealContext.createLinearGradient(
      width / 2 - halfWidth,
      0,
      width / 2 + halfWidth,
      0,
    );
    ink.addColorStop(0, "#d8ae6900");
    ink.addColorStop(edge / 2, "#d8ae69");
    ink.addColorStop(edge, "#73563c");
    ink.addColorStop(1 - edge, "#73563c");
    ink.addColorStop(1 - edge / 2, "#d8ae69");
    ink.addColorStop(1, "#d8ae6900");
    revealContext.clearRect(0, 0, width, height);
    revealContext.drawImage(stencil, 0, 0);
    revealContext.globalCompositeOperation = "source-in";
    revealContext.fillStyle = ink;
    revealContext.fillRect(0, 0, width, height);
    revealContext.globalCompositeOperation = "source-over";
  }

  return {
    draw(progress) {
      context.clearRect(0, 0, width, height);
      if (progress >= revealStart) {
        drawWordmark(progress);
        return;
      }
      for (const path of paths) {
        const travel = smooth(
          (progress - path.delay) / (revealStart - path.delay),
        );
        const opacity =
          smooth((progress - path.delay) / 0.18) *
          (1 - smooth((progress - 0.63) / (revealStart - 0.63)));
        if (opacity <= 0) continue;
        for (const sparkle of path.sparkles) {
          const positionAlongPath = travel - sparkle.lag;
          if (positionAlongPath < 0) continue;
          const position = pointOnPath(path, positionAlongPath);
          const spread = 0.45 + sparkle.lag * 2.2;
          const brightness =
            0.74 + 0.26 * Math.sin(progress * 12 + sparkle.shimmer);
          context.globalAlpha = opacity * brightness * (1 - sparkle.lag * 1.9);
          context.drawImage(
            flare,
            position.x + sparkle.x * spread - sparkle.size / 2,
            position.y + sparkle.y * spread - sparkle.size / 2,
            sparkle.size,
            sparkle.size,
          );
        }
        const position = pointOnPath(path, travel);
        const size =
          starSize * (1 + 0.1 * Math.sin(progress * 8 + path.delay * 22));
        context.globalAlpha = opacity * 0.84;
        context.drawImage(
          star,
          position.x - size / 2,
          position.y - size / 2,
          size,
          size,
        );
      }
      const glowSize = Math.min(title.width * 0.28, 110);
      context.globalAlpha =
        smooth((progress - 0.56) / 0.11) *
        (1 - smooth((progress - 0.67) / (revealStart - 0.67))) *
        0.58;
      context.drawImage(
        flare,
        center.x - glowSize / 2,
        center.y - glowSize / 2,
        glowSize,
        glowSize,
      );
      context.globalAlpha = 1;
    },
    remove() {
      canvas.remove();
      reveal.remove();
      wrapper.classList.remove("is-revealing");
    },
  };
}
