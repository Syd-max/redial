import { maxProofBytes } from "../src/payment-proof.js";

const proofExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function detectProofType(bytes) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP")
    return "image/webp";
  return null;
}

export async function parseRegistrationFile(file, label, imageOnly = false) {
  if (!(file instanceof File) || !file.size)
    return { status: 400, error: `Unggah ${label} terlebih dahulu.` };
  if (file.size > maxProofBytes)
    return { status: 413, error: `Ukuran ${label} maksimal 2 MB.` };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectProofType(bytes);
  if (!mime || (imageOnly && mime !== "image/jpeg" && mime !== "image/png")) {
    const formats = imageOnly ? "JPG atau PNG" : "JPG, PNG, WebP, atau PDF";
    return { status: 400, error: `Pilih ${label} dalam format ${formats}.` };
  }
  return { bytes, mime };
}

export function getProofExtension(mime) {
  return Object.hasOwn(proofExtensions, mime) ? proofExtensions[mime] : null;
}
