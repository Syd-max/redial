export function startWordmarkWave(image) {
  const wrapper = image.parentElement;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const texture = document.createElement("canvas");
  const textureContext = texture.getContext("2d");
  if (!context || !textureContext || !image.naturalWidth) return () => {};

  canvas.className = "wordmark-wave";
  canvas.setAttribute("aria-hidden", "true");
  wrapper.append(canvas);
  let phaseTime = 0;
  let previousTime = 0;
  let frame = 0;
  let amplitude = 0;
  const sliceCount = 60;
  const period = 6500;

  function draw() {
    const { width, height } = canvas;
    const phase = (phaseTime / period) * Math.PI * 2;
    const motion = Math.min(phaseTime / 800, 1) * amplitude;
    context.clearRect(0, 0, width, height);
    for (let slice = 0; slice < sliceCount; slice++) {
      const start = slice / sliceCount;
      const end = (slice + 1) / sliceCount;
      const left = Math.round(start * width);
      const right = Math.round(end * width);
      const offset = Math.sin((start + end) * Math.PI - phase) * motion;
      const sliceWidth = right - left;
      context.drawImage(
        texture,
        left,
        0,
        sliceWidth,
        height,
        left,
        offset,
        sliceWidth,
        height,
      );
    }
  }

  const resize = new ResizeObserver(() => {
    const { width, height } = wrapper.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio, 3, image.naturalWidth / width);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    texture.width = canvas.width;
    texture.height = canvas.height;
    textureContext.imageSmoothingQuality = "high";
    textureContext.drawImage(image, 0, 0, texture.width, texture.height);
    amplitude = Math.min(3.8, width * 0.007) * ratio;
    draw();
    wrapper.classList.add("is-waving");
  });
  resize.observe(wrapper);

  function tick(time) {
    const elapsed = previousTime ? time - previousTime : 0;
    if (!previousTime || elapsed >= 30) {
      phaseTime += Math.min(elapsed, 50);
      previousTime = time;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  const visibility = new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(frame);
    previousTime = 0;
    if (entry.isIntersecting) frame = requestAnimationFrame(tick);
  });
  visibility.observe(wrapper);

  return () => {
    cancelAnimationFrame(frame);
    visibility.disconnect();
    resize.disconnect();
    canvas.remove();
    wrapper.classList.remove("is-waving");
  };
}
