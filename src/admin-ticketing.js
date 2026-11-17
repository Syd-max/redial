import { normalizeEmail } from "./registration-contact.js";
import { ticketCodePattern, ticketPrices } from "./ticket-types.js";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
});
const deliveryLabels = {
  pending: "Belum dikirim",
  sending: "Sedang diproses",
  accepted: "Diterima Brevo",
  failed: "Gagal dikirim",
  uncertain: "Perlu dicek di Brevo",
};

export function setupTicketing({ request, reportError, reload, onCheckIn, detailDialog }) {
  const byId = (id) => document.getElementById(id);
  const amount = byId("ticket-amount");
  const payment = byId("ticket-payment");
  const delivery = byId("ticket-delivery");
  const help = byId("ticket-help");
  const status = byId("ticket-status");
  const approve = byId("approve-ticket");
  const received = byId("email-received");
  const notReceived = byId("email-not-received");
  const confirmDialog = byId("ticket-confirm-dialog");
  const confirmTitle = byId("ticket-confirm-title");
  const confirmDescription = byId("ticket-confirm-description");
  const confirmEmail = byId("ticket-confirm-email");
  const confirmKind = byId("ticket-confirm-kind");
  const confirmAmount = byId("ticket-confirm-amount");
  const confirmOrder = byId("ticket-confirm-order");
  const confirmPayment = byId("ticket-confirm-payment");
  const confirmSubmit = byId("ticket-confirm-submit");
  let entry;
  let confirmation;
  let updating = false;

  function showTicketDetails(row) {
    entry = row;
    status.textContent = "";
    renderTicketDetails();
  }

  function renderTicketDetails() {
    const price = ticketPrices[entry.jenis_tiket];
    const canIssue = Boolean(price && normalizeEmail(entry.email) && entry.bukti_transfer_mime);
    const emailStatus = entry.ticket_email_status ?? "pending";
    const now = Date.now();
    const review = entry.emailNeedsReview || (
      ["sending", "uncertain"].includes(emailStatus) &&
      now - Date.parse(entry.ticket_email_started_at) >= 14 * 60_000 &&
      now - Date.parse(entry.ticket_email_attempt_at) >= 60_000
    );
    amount.textContent = price ? rupiah.format(price) : "Belum tersedia";
    payment.textContent = entry.ticket_approved_at ? "Disetujui" : "Menunggu verifikasi";
    delivery.textContent = deliveryLabels[emailStatus];
    help.textContent = review
      ? "Cari email tujuan di log transaksional Brevo, lalu pilih hasil pengecekan."
      : canIssue || entry.ticket_approved_at ? "" : "Jenis tiket, email, dan bukti transfer QRIS diperlukan untuk menerbitkan tiket.";
    approve.textContent = updating ? "Memproses…" : entry.ticket_approved_at ? "Coba kirim lagi" : "Setujui & Kirim Tiket";
    approve.hidden = !canIssue || emailStatus === "accepted" || review;
    received.hidden = notReceived.hidden = !review;
    approve.disabled = received.disabled = notReceived.disabled = updating;
  }

  function confirmTicket(action, accepted) {
    if (updating || confirmDialog.open) return;
    const approving = action === "approve-ticket";
    const retry = Boolean(entry.ticket_approved_at);
    confirmTitle.textContent = approving
      ? retry ? "Kirim ulang tiket?" : "Setujui pembayaran?"
      : "Konfirmasi status email?";
    confirmDescription.textContent = approving
      ? retry ? "Tiket yang sama akan dikirim ke alamat di bawah." : "Pastikan nominal transfer sesuai. Tiket akan dikirim ke alamat di bawah."
      : accepted ? "Catat bahwa Brevo sudah menerima permintaan kirim." : "Catat bahwa Brevo belum menerima email agar tiket bisa dikirim lagi.";
    confirmSubmit.textContent = approving ? retry ? "Kirim ulang tiket" : "Setujui & Kirim Tiket" : "Simpan status";
    confirmEmail.textContent = entry.email;
    confirmOrder.hidden = confirmPayment.hidden = !approving;
    if (approving) {
      confirmKind.textContent = entry.jenis_tiket;
      confirmAmount.textContent = rupiah.format(ticketPrices[entry.jenis_tiket]);
    }
    confirmation = { current: entry, action, accepted };
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
  }

  async function updateTicket({ current, action, accepted }) {
    const approving = action === "approve-ticket";
    updating = true;
    status.textContent = "Memproses tiket…";
    renderTicketDetails();
    try {
      const data = await request("PATCH", {
        body: approving
          ? { action, requestId: current.request_id, email: current.email, ticketType: current.jenis_tiket }
          : { action, requestId: current.request_id, accepted },
      });
      Object.assign(current, data, { ticket_email_status: data.ticketEmailStatus, emailNeedsReview: false });
      if (detailDialog.open && entry === current) {
        status.textContent = data.message ?? (data.ticketEmailStatus === "accepted"
          ? "" : "Status email diperbarui. Tiket bisa dikirim lagi.");
      }
    } catch (error) {
      if (error.ticketEmailStatus === "uncertain") {
        current.ticket_email_status = "uncertain";
        current.emailNeedsReview = true;
      }
      if (detailDialog.open && entry === current) reportError(error, status);
    } finally {
      updating = false;
      if (detailDialog.open) renderTicketDetails();
      await reload();
    }
  }

  confirmDialog.addEventListener("close", () => {
    const selected = confirmation;
    confirmation = undefined;
    if (confirmDialog.returnValue === "confirm" && detailDialog.open && selected?.current === entry)
      void updateTicket(selected);
  });
  approve.addEventListener("click", () => confirmTicket("approve-ticket"));
  received.addEventListener("click", () => confirmTicket("reconcile-ticket-email", true));
  notReceived.addEventListener("click", () => confirmTicket("reconcile-ticket-email", false));

  const dialog = byId("check-in-dialog");
  const form = byId("check-in-form");
  const input = byId("ticket-code");
  const submit = byId("submit-check-in");
  const scan = byId("scan-ticket");
  const preview = byId("scan-preview");
  const video = byId("scan-video");
  const scanStatus = byId("check-in-status");
  let controls;
  let stream;
  let cameraAttempt;

  function stopCamera() {
    cameraAttempt = undefined;
    controls?.stop();
    controls = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    preview.hidden = true;
    scan.textContent = "Scan dengan kamera";
  }

  byId("open-check-in").addEventListener("click", () => {
    scanStatus.textContent = "";
    input.value = "";
    dialog.showModal();
    input.focus();
  });
  byId("close-check-in").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", stopCamera);
  scan.addEventListener("click", async () => {
    if (cameraAttempt) {
      stopCamera();
      scanStatus.textContent = "";
      return;
    }
    const attempt = Symbol();
    cameraAttempt = attempt;
    scan.textContent = "Tutup kamera";
    scanStatus.textContent = "Membuka kamera…";
    try {
      const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
      if (cameraAttempt !== attempt) return;
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (cameraAttempt !== attempt) {
        camera.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = camera;
      preview.hidden = false;
      const started = await new BrowserMultiFormatOneDReader().decodeFromStream(camera, video, (result, _, scanner) => {
        const code = result?.getText();
        if (cameraAttempt !== attempt || !ticketCodePattern.test(code ?? "")) return;
        controls = scanner;
        stopCamera();
        input.value = code;
        form.requestSubmit();
      });
      if (cameraAttempt !== attempt) {
        started.stop();
        return;
      }
      controls = started;
      scanStatus.textContent = "Penuhi kotak dengan barcode tiket.";
    } catch {
      if (cameraAttempt !== attempt) return;
      stopCamera();
      scanStatus.textContent = "Kamera tidak bisa dibuka. Ketik ID yang tercetak di bawah barcode.";
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    stopCamera();
    submit.disabled = scan.disabled = true;
    scanStatus.textContent = "Memeriksa tiket…";
    try {
      const result = await request("PATCH", { body: { action: "check-in-ticket", code: input.value } });
      const label = result.status === "checked_in" ? "Check-in berhasil" : "Tiket sudah check-in";
      scanStatus.textContent = `${label} · ${result.code}`;
      if (result.status === "checked_in") {
        input.value = "";
        onCheckIn();
      }
    } catch (error) {
      reportError(error, scanStatus);
    } finally {
      submit.disabled = scan.disabled = false;
      if (dialog.open) input.focus();
    }
  });

  return {
    showTicketDetails,
    closeDialogs() {
      if (confirmDialog.open) confirmDialog.close();
      if (dialog.open) dialog.close();
    },
  };
}
