import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import registration, { validateRegistration } from "../api/pendaftaran.js";
import { validateRegistrationFields } from "../server/registration-store.js";
import { maxProofBytes } from "../src/payment-proof.js";

const valid = {
  name: " Nama ",
  institution: " Kampus ",
  gender: "perempuan",
  sponsorPackage: "Gold",
  requestId: "66f7e08f-0c76-4f43-82dc-0620e4fcb767",
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmucAAAAASUVORK5CYII=", "base64");
const pngFile = new File([png], "bukti.png", { type: "image/png" });
const qrPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAF0AAABdCAYAAADHcWrDAAAAAklEQVR4AewaftIAAAL0SURBVO3BQa7cOBTAQFLw/a/MyebtDDju31EygKrsF46tFsd2i2O7xbHd4thucWy3OLZbHNstju0ufoPKt1XcURkVQ+VOxVAZFUNlVAyVb6t4sji2WxzbXbxU8SmVJxVvqDypeFLxKZU3Fsd2i2O7ix9QeVLxROVOxZ2KoTIq7qiMiicqTyo+tTi2WxzbXfxjKu5UPFH5P1gc2y2O7S7+YSpPKu6ojIp/yeLYbnFsd/EDFd+mMiruqAyVUTEqPlXxJy2O7RbHdhcvqfxJFUNlVNypGCqjYqiMijsquyyO7RbHdvYLf5nKGxVvqIyKv21xbLc4trv4DSqjYqh8qmJUPFF5Q2VU3FH5VMWnFsd2i2O7i99Q8aRiqNypGCq7qIyKUTFURsUTlVHxxuLYbnFsZ7/wBSpvVNxRuVMxVP62ik8tju0Wx3YXP6AyKobKnYqhMiqeqIyKOyqjYqiMijsqo+INlVHxZHFstzi2u/iBijsVd1RGxVAZFUPlUypPVO6ojIqh8g2LY7vFsd3Fb1AZFXdU7lSMiqHypOKOyqgYFUNlVAyVT1UMlU8tju0Wx3YXP6AyKobKHZUnKncqRsVQ+YaKT1W8sTi2WxzbXXyJyh2VUXFHZVQ8URkVT1RGxadURsVQGRVPFsd2i2O7iz+gYqgMlTsVd1RGxROVJypvVNxRGRVvLI7tFsd29gt/mcqTiicqTyqeqNypuKMyKp4sju0Wx3YXv0Hl2ypGxR2VofJtKqPiTsVQ+YbFsd3i2O7ipYpPqdxRGRWjYqiMijsqo2Ko3Kl4o2KofGpxbLc4trv4AZUnFd+mcqdiqNxR+ZTKNyyO7RbHdhf/ExVDZVQMlTcq3qi4o/LG4thucWx38T+ncqfiicqdiqEyKr5hcWy3OLa7+IGKb6j4VMVQeaLyRGVUDJVRMSreWBzbLY7tLl5S+TaVJxVvqNypeEPlicqoeLI4tlsc29kvHFstju0Wx3aLY7vFsd3i2G5xbLc4tlsc2/0HegZz11LVADcAAAAASUVORK5CYII=", "base64");
const qrFile = new File([qrPng], "qr.png", { type: "image/png" });

function registrationRequest(fields = valid, payment = pngFile, qr = qrFile) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (payment) form.set("paymentProof", payment);
  if (qr) form.set("tactlinkQr", qr);
  const request = new Request("http://localhost/api/pendaftaran", { method: "POST", body: form });
  return Object.assign(Readable.fromWeb(request.body), {
    method: request.method,
    headers: Object.fromEntries(request.headers),
  });
}

function response() {
  return {
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
}
test("validates and trims registration data", () => {
  assert.equal(validateRegistration(valid).nama, "Nama");
  for (const body of [
    null,
    {},
    { ...valid, name: " " },
    { ...valid, institution: "x".repeat(161) },
    { ...valid, gender: "invalid" },
    { ...valid, requestId: "invalid" },
  ]) {
    assert.equal(validateRegistration(body), null);
  }
});

test("requires an official sponsor package for new registrations and supports legacy admin edits", async () => {
  assert.equal(validateRegistration(valid).paket_sponsor, "Gold");
  assert.equal(validateRegistration({ ...valid, sponsorPackage: undefined }), null);
  assert.equal(validateRegistrationFields({ ...valid, sponsorPackage: "" }).paket_sponsor, null);
  assert.equal(validateRegistration({ ...valid, sponsorPackage: "Bronze" }), null);
  assert.equal(validateRegistration({ ...valid, sponsorPackage: "Inkind" }), null);
  const res = response();
  await registration(registrationRequest({ ...valid, sponsorPackage: "" }), res);
  assert.equal(res.code, 400);
});
test("returns unavailable without credentials instead of fake success", async () => {
  const oldUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  const res = response();
  try {
    await registration(registrationRequest(), res);
    assert.equal(res.code, 503);
    assert.ok(res.body.error);
  } finally {
    if (oldUrl !== undefined) process.env.SUPABASE_URL = oldUrl;
  }
});

test("rejects missing, oversized and mismatched uploads before storage", async () => {
  const oversized = new File([png, Buffer.alloc(maxProofBytes - png.length + 1)], "oversized.png");
  const pdf = new File(["%PDF-1.7"], "misnamed.png", { type: "image/png" });
  for (const [payment, qr, code] of [
    [null, qrFile, 400], [pngFile, null, 400],
    [oversized, qrFile, 413], [pngFile, oversized, 413], [pngFile, pdf, 400],
  ]) {
    const res = response();
    await registration(registrationRequest(valid, payment, qr), res);
    assert.equal(res.code, code);
  }
});

test("rejects an image without a readable QR", async () => {
  const res = response();
  await registration(registrationRequest(valid, pngFile, pngFile), res);
  assert.equal(res.code, 400);
  assert.equal(res.body.code, "QR_UNREADABLE");
});

test("uses the same conflict key on retries and handles upstream errors", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true };
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = response();
      await registration(registrationRequest({ ...valid, sponsorPackage: "Gold" }), res);
      assert.equal(res.code, 200);
      assert.equal(res.body.id, valid.requestId);
    }
    assert.equal(calls[0].options.body, calls[1].options.body);
    assert.equal(JSON.parse(calls[0].options.body).paket_sponsor, "Gold");
    const saved = JSON.parse(calls[0].options.body);
    assert.equal(saved.bukti_transfer, "\\x" + png.toString("hex"));
    assert.equal(saved.bukti_transfer_mime, "image/png");
    assert.equal(saved.qr_tactlink, "\\x" + qrPng.toString("hex"));
    assert.equal(saved.qr_tactlink_mime, "image/png");
    assert.match(calls[0].url, /redial_pendaftaran\?on_conflict=request_id$/);
    assert.match(calls[0].options.headers.Prefer, /ignore-duplicates/);
    assert.equal(calls[0].options.headers.Authorization, undefined);
    globalThis.fetch = async () => Response.json({ code: "42501" }, { status: 403 });
    const failure = response();
    await registration(registrationRequest(), failure);
    assert.equal(failure.code, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});
