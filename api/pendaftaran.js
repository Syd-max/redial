import {
  getRegistrationStore,
  isRequestId,
  validateRegistrationFields,
} from "../server/registration-store.js";
import { parseRegistrationFile } from "../server/payment-proof.js";
import { maxProofBytes } from "../src/payment-proof.js";
import { hasReadableQr } from "../server/registration-qr.js";

const maxBodyBytes = maxProofBytes * 2 + 16_384;

export function validateRegistration(body) {
  const fields = validateRegistrationFields(body);
  if (!fields?.paket_sponsor || !isRequestId(body.requestId)) return null;
  return { request_id: body.requestId, ...fields };
}

export default async function registration(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metode tidak didukung." });
  }
  const contentType = req.headers["content-type"];
  if (contentType?.split(";")[0].trim().toLowerCase() !== "multipart/form-data")
    return res.status(415).json({ error: "Format data tidak valid." });
  let form;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxBodyBytes) {
        req.resume();
        return res.status(413).json({ error: "Setiap berkas maksimal 2 MB." });
      }
      chunks.push(chunk);
    }
    form = await new Response(Buffer.concat(chunks, size), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return res.status(400).json({ error: "Format data tidak valid." });
  }
  const data = validateRegistration(Object.fromEntries(form));
  if (!data)
    return res
      .status(400)
      .json({ error: "Periksa nama, instansi, jenis kelamin, dan paket sponsor." });
  const proof = await parseRegistrationFile(form.get("paymentProof"), "bukti transfer QRIS");
  if (proof.error) return res.status(proof.status).json({ error: proof.error });
  const qr = await parseRegistrationFile(form.get("tactlinkQr"), "QR TactLink", true);
  if (qr.error) return res.status(qr.status).json({ error: qr.error });
  if (!await hasReadableQr(qr.bytes)) {
    return res.status(400).json({
      code: "QR_UNREADABLE",
      error: "QR tidak terbaca. Pilih foto yang menampilkan QR dengan jelas.",
    });
  }
  const store = getRegistrationStore();
  if (!store)
    return res.status(503).json({
      error: "Pendaftaran belum dapat dikirim. Silakan coba kembali nanti.",
    });
  try {
    const response = await store.request("on_conflict=request_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        ...data,
        bukti_transfer: "\\x" + proof.bytes.toString("hex"),
        bukti_transfer_mime: proof.mime,
        qr_tactlink: "\\x" + qr.bytes.toString("hex"),
        qr_tactlink_mime: qr.mime,
      }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      console.error("Penyimpanan pendaftaran REDIAL ditolak oleh Supabase", {
        status: response.status,
        code: failure?.code,
      });
      return res
        .status(502)
        .json({ error: "Pendaftaran belum bisa disimpan. Hubungi panitia." });
    }
    return res.status(200).json({ id: data.request_id });
  } catch {
    return res.status(502).json({
      error:
        "Koneksi pendaftaran terputus. Coba kirim ulang dengan data yang sama.",
    });
  }
}
