import { maxProofBytes } from "./payment-proof.js";
import { normalizeEmail, normalizePhone } from "./registration-contact.js";

const form = document.querySelector("#registration-form");
const heading = document.querySelector(".registration-heading");
const success = document.querySelector("#registration-success");
const status = document.querySelector("#form-status");
const submit = form.querySelector('[type="submit"]');
const submitActions = form.querySelector(".registration-step-actions");
const institution = form.elements.institution;
const otherInstitution = form.elements.institutionOther;
const otherInstitutionField = document.querySelector("#institution-other-field");
const dataStep = document.querySelector("#registration-data-step");
const tactlinkStep = document.querySelector("#registration-tactlink-step");
const stepCaption = document.querySelector("#registration-step-caption");
const stepProgress = document.querySelector("#registration-progress");
const stepLabels = document.querySelectorAll(".registration-steps li");
const next = document.querySelector("#registration-next");
const back = document.querySelector("#registration-back");
const video = document.querySelector(".tactlink-video");
const videoChoices = [...document.querySelectorAll(".tactlink-videos button")];
const qrInput = form.elements.tactlinkQr;
const qrError = document.querySelector("#tactlink-qr-error");
const { phone, email } = form.elements;
let step = 1;

for (const input of [phone, email]) {
  input.addEventListener("input", () => input.setCustomValidity(""));
}

function syncOtherInstitution() {
  const isOther = institution.value === "lainnya";
  otherInstitutionField.hidden = !isOther;
  otherInstitution.disabled = !isOther;
  otherInstitution.required = isOther;
}

institution.addEventListener("change", syncOtherInstitution);
window.addEventListener("pageshow", syncOtherInstitution);
syncOtherInstitution();

function showVideo(choice) {
  for (const button of videoChoices) button.setAttribute("aria-pressed", String(button === choice));
  const { video: id, title } = choice.dataset;
  video.title = title;
  video.src = "https://www.youtube-nocookie.com/embed/" + id;
}

for (const choice of videoChoices) {
  choice.addEventListener("click", () => {
    if (choice.getAttribute("aria-pressed") !== "true") showVideo(choice);
  });
}

function showStep(number, focus = true) {
  step = number;
  dataStep.hidden = number !== 1;
  tactlinkStep.hidden = number !== 2;
  stepCaption.textContent = `Langkah ${number} dari 2`;
  stepProgress.value = number;
  stepLabels.forEach((label, index) => {
    if (index + 1 === number) label.setAttribute("aria-current", "step");
    else label.removeAttribute("aria-current");
  });
  if (number === 2) {
    showVideo(videoChoices.find(choice => choice.getAttribute("aria-pressed") === "true"));
  } else {
    video.removeAttribute("src");
  }
  if (focus) stepCaption.focus();
}

function validateStep(number) {
  if (number === 1) {
    phone.setCustomValidity(phone.value && !normalizePhone(phone.value)
      ? "Masukkan nomor telepon yang valid (8–15 digit)." : "");
    email.setCustomValidity(email.value && !normalizeEmail(email.value)
      ? "Masukkan alamat email yang valid, misalnya nama@email.com." : "");
  }
  const panel = number === 1 ? dataStep : tactlinkStep;
  const invalid = panel.querySelector("input:invalid, select:invalid");
  if (!invalid) return true;
  if (step !== number) showStep(number, false);
  invalid.reportValidity();
  return false;
}

function advance() {
  form.elements.name.value = form.elements.name.value.trim();
  otherInstitution.value = otherInstitution.value.trim();
  if (validateStep(1)) showStep(2);
}

next.addEventListener("click", advance);
back.addEventListener("click", () => {
  status.textContent = "";
  showStep(1);
});

function showUploadError(input, error, message) {
  if (message) {
    input.value = "";
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
  input.setCustomValidity(message);
  error.textContent = message;
}

async function scanQrImage(file) {
  const { hasQrCode, qrScanMaxSide } = await import("./qr-code.js");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, qrScanMaxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    return hasQrCode(data, width, height);
  } finally {
    image.close();
  }
}

qrInput.addEventListener("change", async () => {
  const file = qrInput.files[0];
  const tooLarge = file?.size > maxProofBytes;
  showUploadError(qrInput, qrError, tooLarge ? "Ukuran file melebihi 2 MB. Pilih file yang lebih kecil." : "");
  if (!file || tooLarge) return;

  if (file.type && !["image/jpeg", "image/png"].includes(file.type)) {
    showUploadError(qrInput, qrError, "Pilih gambar QR dalam format JPG atau PNG.");
    return;
  }

  const checking = "Sedang memeriksa QR…";
  qrInput.setCustomValidity(checking);
  qrError.textContent = checking;
  let message = "";
  try {
    if (!await scanQrImage(file)) message = "QR tidak terbaca. Pilih foto yang menampilkan QR dengan jelas.";
  } catch {
    message = "Gambar QR tidak bisa diperiksa. Pilih ulang gambar JPG atau PNG.";
  }
  if (qrInput.files[0] === file) showUploadError(qrInput, qrError, message);
});

let requestId = crypto.randomUUID();
let lastFields = "";
let lastQrFile;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (form.hidden || submit.disabled) return;
  if (step === 1) {
    advance();
    return;
  }
  if (!validateStep(1) || !validateStep(2)) return;

  const fields = {
    name: form.elements.name.value.trim(),
    gender: form.elements.gender.value,
    institution: institution.value === "lainnya" ? otherInstitution.value.trim() : institution.value,
    phone: normalizePhone(phone.value),
    email: normalizeEmail(email.value),
  };
  const currentFields = JSON.stringify(fields);
  const qrFile = qrInput.files[0];
  if (lastFields && (currentFields !== lastFields || qrFile !== lastQrFile))
    requestId = crypto.randomUUID();
  lastFields = currentFields;
  lastQrFile = qrFile;
  const payload = new FormData();
  for (const [key, value] of Object.entries({ ...fields, requestId })) payload.set(key, value);
  payload.set(qrInput.name, qrFile);

  submit.disabled = true;
  back.disabled = true;
  qrInput.disabled = true;
  submitActions.setAttribute("aria-busy", "true");
  status.textContent = "Menyimpan pendaftaran…";
  try {
    const response = await fetch("/api/pendaftaran", {
      method: "POST",
      body: payload,
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (result.code === "QR_UNREADABLE") {
      qrInput.disabled = false;
      showUploadError(qrInput, qrError, result.error);
      status.textContent = "";
      qrInput.focus();
      return;
    }
    if (!response.ok)
      throw new Error(
        result.error || "Pendaftaran belum berhasil disimpan. Coba lagi.",
      );
    status.textContent = "";
    form.reset();
    lastQrFile = undefined;
    video.removeAttribute("src");
    heading.hidden = true;
    form.hidden = true;
    success.hidden = false;
    success.querySelector("h1").focus();
    setTimeout(() => window.location.replace("/"), 4000);
  } catch (error) {
    status.textContent =
      error.name === "TypeError" || error.name === "TimeoutError"
        ? "Koneksi terputus. Coba kirim ulang dengan data yang sama."
        : error.message;
  } finally {
    submit.disabled = false;
    back.disabled = false;
    qrInput.disabled = false;
    submitActions.removeAttribute("aria-busy");
  }
});

document.documentElement.classList.remove("page-loading");
