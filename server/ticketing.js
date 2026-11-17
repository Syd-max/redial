import { normalizeEmail } from "../src/registration-contact.js";
import { ticketCodePattern, ticketTypes } from "../src/ticket-types.js";
import { renderTicketPdf, ticketDate, ticketVenue } from "./ticket-pdf.js";

async function sendTicketEmail(issue, requestId, apiKey, sender) {
  let attachment;
  try {
    attachment = await Promise.all(issue.codes.map(async (code, index) => ({
      name: `REDIAL-${code}.pdf`,
      content: (await renderTicketPdf(code, issue.kind, index + 1)).toString("base64"),
    })));
  } catch {
    return { status: "failed", message: "PDF tiket gagal dibuat. Coba lagi." };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        sender: { name: "REDIAL 5.0", email: sender },
        to: [{ email: issue.email }],
        subject: `Tiket REDIAL 5.0 - ${issue.kind}`,
        htmlContent: `<p>Pembayaran tiket REDIAL 5.0 kamu sudah disetujui.</p>
          <p><strong>${ticketDate} · ${ticketVenue}</strong></p>
          <p>${issue.kind === "DUO" ? "Dua tiket terlampir. Tunjukkan satu tiket per orang saat masuk." : "Tunjukkan tiket terlampir saat masuk."} Perbesar barcode di PDF jika diperlukan.</p>
          <p>Sampai bertemu di REDIAL 5.0!</p>`,
        headers: { idempotencyKey: issue.key },
        tags: ["redial-ticket", requestId],
        attachment,
      }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok || (data?.code === "duplicate_parameter" && /idempoten/i.test(data.message ?? ""))) {
      return { status: "accepted", messageId: data?.messageId ?? null };
    }
    if (response.status < 500 && response.status !== 408) {
      return { status: "failed", message: "Brevo menolak email. Cek pengaturan pengirim dan log Brevo, lalu coba lagi." };
    }
  } catch {
    // A timeout can occur after Brevo has received the request.
  }
  return { status: "uncertain", message: "Brevo belum mengonfirmasi email. Coba lagi atau periksa log Brevo." };
}

export async function approveAndSendTicket(store, body, res) {
  const email = normalizeEmail(body.email);
  if (!email || !ticketTypes.includes(body.ticketType)) {
    return res.status(400).json({ error: "Periksa email tujuan dan jenis tiket." });
  }
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const sender = normalizeEmail(process.env.BREVO_SENDER_EMAIL);
  if (!apiKey || !sender) {
    return res.status(503).json({ error: "Pengirim tiket Brevo belum dikonfigurasi." });
  }

  const issue = await store.rpc("redial_claim_ticket_email", {
    p_request_id: body.requestId,
    p_email: email,
    p_kind: body.ticketType,
  });
  if (issue.status === "not_found") return res.status(404).json({ error: "Registrasi tidak ditemukan." });
  if (issue.status === "invalid") return res.status(409).json({ error: "Cek bukti transfer dan muat ulang detail registrasi sebelum menyetujui." });
  if (issue.status === "accepted") return res.status(200).json({ ticketEmailStatus: "accepted" });
  if (issue.status === "busy") return res.status(409).json({ error: "Email tiket sedang diproses. Muat ulang setelah satu menit." });
  if (issue.status === "needs_review") return res.status(409).json({ error: "Periksa log Brevo untuk memastikan pengiriman sebelumnya.", ticketEmailStatus: "uncertain" });
  if (issue.status !== "sending") throw new Error("Invalid ticket issuance state");

  const delivery = await sendTicketEmail(issue, body.requestId, apiKey, sender);
  if (issue.retrying && delivery.status === "failed") {
    delivery.status = "uncertain";
    delivery.message = "Percobaan terakhir gagal. Periksa log Brevo untuk pengiriman sebelumnya.";
  }
  const response = await store.request(new URLSearchParams({
    request_id: "eq." + body.requestId,
    ticket_email_key: "eq." + issue.key,
    ticket_email_attempt_at: "eq." + issue.attempt,
    ticket_email_status: "eq.sending",
    select: "ticket_approved_at,ticket_email_started_at,ticket_email_attempt_at",
  }), {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ticket_email_status: delivery.status,
      ticket_email_message_id: delivery.messageId ?? null,
    }),
  });
  const [timestamps] = response.ok ? await response.json() : [];
  if (!timestamps) throw new Error("Ticket email status was not saved");
  return res.status(200).json({ ...timestamps, ticketEmailStatus: delivery.status, message: delivery.message });
}

export async function checkInTicket(store, body, res) {
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!ticketCodePattern.test(code)) return res.status(400).json({ error: "Format ID tiket tidak valid." });
  const result = await store.rpc("redial_check_in_ticket", { p_code: code });
  if (result.status === "not_found") return res.status(404).json({ error: "ID tiket tidak ditemukan." });
  return res.status(200).json({ ...result, code });
}

export async function reconcileTicketEmail(store, body, res) {
  if (typeof body.accepted !== "boolean") return res.status(400).json({ error: "Pilih hasil pengecekan Brevo." });
  const resolved = await store.rpc("redial_reconcile_ticket_email", {
    p_request_id: body.requestId,
    p_accepted: body.accepted,
  });
  if (!resolved) return res.status(409).json({ error: "Status pengiriman belum bisa diperbarui. Muat ulang detail." });
  return res.status(200).json({ ticketEmailStatus: body.accepted ? "accepted" : "failed" });
}
