import jsQR from "jsqr";

export const qrScanMaxSide = 2200;

export function hasQrCode(pixels, width, height) {
  const qr = jsQR(pixels, width, height);
  return Boolean(qr?.data.trim() || qr?.binaryData.length);
}
