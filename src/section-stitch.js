const timePerStitch = 780;
const threadLayers = [
  ["#713d23", 4.8, 0.6],
  ["#b8744a", 3.6, 0],
  ["#dfa474", 1.1, -0.9],
];

function thread(ctx, x, y, endX, endY, lift) {
  ctx.lineCap = "round";
  for (const [color, width, offset] of threadLayers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y + offset);
    ctx.quadraticCurveTo((x + endX) / 2, (y + endY) / 2 - lift + offset, endX, endY + offset);
    ctx.stroke();
  }
}

function hole(ctx, x, y, opacity = 1) {
  if (opacity === 0) return;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.fillStyle = "#79553863";
  ctx.beginPath();
  ctx.ellipse(x, y, 2.9, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function needle(ctx, x, y, angle, length) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const silver = ctx.createLinearGradient(0, -3, 0, 3);
  silver.addColorStop(0, "#666971");
  silver.addColorStop(0.25, "#fffef7");
  silver.addColorStop(0.55, "#cbcdd0");
  silver.addColorStop(1, "#51535b");
  ctx.fillStyle = silver;
  ctx.strokeStyle = "#61616a";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(2.5, -2.7);
  ctx.lineTo(length * 0.72, -2.3);
  ctx.quadraticCurveTo(length * 0.9, -1.5, length, 0);
  ctx.quadraticCurveTo(length * 0.9, 1.5, length * 0.72, 2.3);
  ctx.lineTo(2.5, 2.7);
  ctx.quadraticCurveTo(-2, 0, 2.5, -2.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#56545a";
  ctx.beginPath();
  ctx.ellipse(9, 0, 4.1, 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function stitchCount(width) {
  return Math.max(5, Math.min(14, Math.round(width / 110)));
}

function easeProgress(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function drawStitch(ctx, width, height, progress) {
  ctx.clearRect(0, 0, width, height);
  const count = stitchCount(width);
  const left = 12;
  const pitch = (width - left * 2) / (count - 0.32);
  const length = pitch * 0.68;
  const y = height / 2;
  const step = progress * count;
  const completed = Math.floor(step);

  for (let index = 0; index < completed; index++) {
    const start = left + index * pitch;
    hole(ctx, start, y);
    hole(ctx, start + length, y);
    thread(ctx, start, y, start + length, y, 0.8);
  }
  if (completed === count) return;

  const phase = step - completed;
  const start = left + completed * pitch;
  const entry = start + length;
  const exit = start + pitch;
  const needleLength = Math.min(126, pitch * 1.48);
  const turn = (phase - 0.54) * Math.PI * 2;
  const wave = Math.cos(turn);
  const seamLevel = Math.cos(0.16 * Math.PI * 2);
  const amplitude = Math.min(12, height * 0.17);
  const tipX = start + pitch * (0.3 + phase);
  const tipY = y + (wave - seamLevel) * amplitude;
  const angle = Math.atan2(-Math.sin(turn) * amplitude * 0.95, pitch);

  const tailX = tipX - Math.cos(angle) * needleLength;
  const tailY = tipY - Math.sin(angle) * needleLength;
  const eyeX = tailX + Math.cos(angle) * 9;
  const eyeY = tailY + Math.sin(angle) * 9;
  const depth = Math.max(0, (wave - seamLevel) / (1 - seamLevel));
  const laid = easeProgress((phase - 0.17) / 0.54);
  const laidEnd = start + length * laid;
  const last = completed === count - 1;

  hole(ctx, start, y);
  hole(ctx, entry, y, easeProgress((phase - 0.28) / 0.24));
  if (!last) hole(ctx, exit, y, easeProgress((phase - 0.58) / 0.24));
  if (laid > 0) thread(ctx, start, y, laidEnd, y, 0.8 + 3 * Math.sin(laid * Math.PI));

  const anchor = laidEnd + (exit - entry) * easeProgress((phase - 0.71) / 0.29);
  const fade = last ? 1 - easeProgress((phase - 0.72) / 0.28) : 1;
  ctx.save();
  ctx.globalAlpha = fade * (1 - 0.25 * depth ** 2);
  thread(ctx, anchor, y, eyeX, eyeY, 4 + Math.abs(eyeY - y) * 0.22);
  ctx.globalAlpha = fade * (1 - 0.44 * depth ** 2);
  needle(ctx, tailX, tailY, angle, needleLength);
  ctx.restore();
}

export function watchSectionStitch(canvas) {
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  let width;
  let height;
  let frame;
  let startTime;
  let duration;
  const inputEvents = ["wheel", "touchmove", "pointerdown", "keydown"];
  let progress = canvas.dataset.stitch === "done" ? 1 : 0;
  const resize = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (canvas.dataset.stitch) drawStitch(context, width, height, progress);
  });
  resize.observe(canvas);

  function tick(now) {
    startTime ??= now;
    progress = Math.min((now - startTime) / duration, 1);
    if (width && height) drawStitch(context, width, height, progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else canvas.dataset.stitch = "done";
  }

  function startOnScroll() {
    const { top, bottom } = canvas.getBoundingClientRect();
    if (top >= window.innerHeight * 0.86 || bottom <= 12) return;
    window.removeEventListener("scroll", startOnScroll);
    duration = stitchCount(canvas.clientWidth) * timePerStitch;
    canvas.dataset.stitch = "playing";
    frame = requestAnimationFrame(tick);
  }

  function armScroll(event) {
    if (!event.isTrusted) return;
    for (const type of inputEvents) window.removeEventListener(type, armScroll);
    window.addEventListener("scroll", startOnScroll, { passive: true });
  }

  const navigation = performance.getEntriesByType("navigation")[0];
  if (!canvas.dataset.stitch && navigation?.type !== "back_forward") {
    for (const type of inputEvents) window.addEventListener(type, armScroll, { passive: true });
  }
  return () => {
    for (const type of inputEvents) window.removeEventListener(type, armScroll);
    window.removeEventListener("scroll", startOnScroll);
    cancelAnimationFrame(frame);
    resize.disconnect();
    if (canvas.dataset.stitch === "playing") canvas.dataset.stitch = "done";
  };
}
