import sharp from "sharp";
import { hasQrCode, qrScanMaxSide } from "../src/qr-code.js";

export async function hasReadableQr(bytes) {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 32_000_000 })
      .autoOrient()
      .resize({ width: qrScanMaxSide, height: qrScanMaxSide, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "white" })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    return hasQrCode(pixels, info.width, info.height);
  } catch {
    return false;
  }
}
