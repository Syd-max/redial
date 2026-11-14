import { normalizeEmail, whatsappUrl } from "./registration-contact.js";

const startup = document.querySelector("#admin-startup");
const login = document.querySelector("#admin-login");
const dashboard = document.querySelector("#admin-dashboard");
const dashboardTools = document.querySelector("#admin-dashboard-tools");
const adminHeader = document.querySelector(".admin-header");
const loginForm = document.querySelector("#login-form");
const searchForm = document.querySelector("#search-form");
const detailDialog = document.querySelector("#detail-dialog");
const detailFields = detailDialog.querySelectorAll("[data-detail]");
const legacySponsorDetail = detailDialog.querySelector("#legacy-sponsor-detail");
const detailFiles = document.querySelector("#detail-files");
const closeDetail = document.querySelector("#close-detail");
const deleteDialog = document.querySelector("#delete-dialog");
const deleteName = document.querySelector("#delete-name");
const deleteCancel = document.querySelector("#delete-cancel");
const deleteConfirm = document.querySelector("#delete-confirm");
const deleteStatus = document.querySelector("#delete-status");
const loginStatus = document.querySelector("#login-status");
const dashboardStatus = document.querySelector("#dashboard-status");
const logout = document.querySelector("#logout");
const logoutDialog = document.querySelector("#logout-dialog");
const logoutCancel = document.querySelector("#logout-cancel");
const logoutConfirm = document.querySelector("#logout-confirm");
const logoutStatus = document.querySelector("#logout-status");
const refresh = document.querySelector("#refresh");
const table = document.querySelector("#table-wrap");
const rows = document.querySelector("#registration-rows");
const pagination = document.querySelector("#pagination");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const pageNumber = document.querySelector("#page-number");

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

let page = 1;
let search = "";
let reading;
let pendingDelete;

async function request(method, { body, query, signal } = {}) {
  const response = await fetch("/api/admin" + (query ? "?" + query : ""), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(24000)])
      : AbortSignal.timeout(24000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error), { status: response.status });
  return data;
}

function showLogin(message = "") {
  reading?.abort();
  if (detailDialog.open) detailDialog.close();
  if (deleteDialog.open) deleteDialog.close();
  if (logoutDialog.open) logoutDialog.close();
  startup.hidden = true;
  login.hidden = false;
  dashboard.hidden = true;
  dashboardTools.hidden = true;
  logout.hidden = true;
  rows.replaceChildren();
  loginStatus.textContent = message;
}

function showDashboard() {
  startup.hidden = true;
  login.hidden = true;
  dashboard.hidden = false;
  dashboardTools.hidden = false;
  logout.hidden = false;
}

function reportError(error, target) {
  if (error.status === 401 && !dashboard.hidden) {
    showLogin(error.message);
    return;
  }
  target.textContent = error.status
    ? error.message
    : "Koneksi terputus. Coba lagi.";
}

function registrationTime(entry) {
  return dateFormat.format(new Date(entry.created_at)) + " WIB";
}

function showDetail(entry) {
  const email = normalizeEmail(entry.email);
  const values = {
    name: entry.nama,
    institution: entry.instansi,
    gender: entry.jenis_kelamin === "laki-laki" ? "Laki-laki" : "Perempuan",
    phone: entry.nomor_telepon || "Belum tersedia",
    email: email ?? "Belum tersedia",
    ticket: entry.jenis_tiket || "Belum tersedia",
    sponsor: entry.paket_sponsor || "",
    time: registrationTime(entry),
  };
  for (const field of detailFields) field.textContent = values[field.dataset.detail];
  legacySponsorDetail.hidden = !values.sponsor;
  const whatsapp = whatsappUrl(entry.nomor_telepon);
  if (whatsapp) {
    const link = document.createElement("a");
    link.className = "admin-detail-link";
    link.href = whatsapp;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = entry.nomor_telepon;
    detailDialog.querySelector('[data-detail="phone"]').replaceChildren(link);
  }
  if (email) {
    const link = document.createElement("a");
    const [local, domain] = email.split("@");
    link.className = "admin-detail-link";
    link.href = "mailto:" + encodeURIComponent(local) + "@" + domain;
    link.textContent = email;
    detailDialog.querySelector('[data-detail="email"]').replaceChildren(link);
  }

  detailFiles.replaceChildren();
  for (const [file, label, mime] of [
    ["payment", "Bukti transfer QRIS", entry.bukti_transfer_mime],
    ["tactlink", "QR TactLink", entry.qr_tactlink_mime],
  ]) {
    const item = document.createElement("li");
    if (mime) {
      const download = document.createElement("a");
      download.className = "admin-detail-link";
      download.href = "/api/admin?" + new URLSearchParams({ proof: entry.request_id, file });
      download.textContent = label;
      download.setAttribute("aria-label", "Unduh " + label);
      item.append(download);
    } else {
      item.textContent = label + " belum tersedia";
    }
    detailFiles.append(item);
  }
  detailDialog.showModal();
}

function renderRows(data, offset) {
  const content = document.createDocumentFragment();
  for (const [index, entry] of data.entries()) {
    const row = document.createElement("tr");
    const number = row.insertCell();
    number.className = "admin-row-number";
    number.dataset.label = "No.";
    number.textContent = String(offset + index + 1);
    for (const [label, value] of [
      ["Nama", entry.nama],
      ["Instansi", entry.instansi],
      ["Waktu daftar", registrationTime(entry)],
    ]) {
      const cell = row.insertCell();
      cell.dataset.label = label;
      cell.textContent = value;
    }
    const action = row.insertCell();
    action.className = "admin-row-detail";
    const detail = document.createElement("button");
    detail.type = "button";
    detail.className = "admin-control admin-detail-button";
    detail.textContent = "Detail";
    detail.setAttribute("aria-label", "Detail registrasi " + entry.nama);
    detail.addEventListener("click", () => showDetail(entry));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "admin-control admin-delete-button";
    remove.textContent = "Hapus";
    remove.setAttribute("aria-label", "Hapus registrasi " + entry.nama);
    remove.addEventListener("click", () => {
      pendingDelete = entry;
      deleteName.textContent = entry.nama;
      deleteStatus.textContent = "";
      deleteDialog.showModal();
    });
    const actions = document.createElement("div");
    actions.className = "admin-row-actions";
    actions.append(detail, remove);
    action.append(actions);
    content.append(row);
  }
  rows.replaceChildren(content);
}

async function loadRows(nextPage = page, nextSearch = search, silent = false) {
  reading?.abort();
  const controller = new AbortController();
  reading = controller;
  if (!silent && !dashboard.hidden)
    dashboardStatus.textContent = "Memuat pendaftaran…";

  try {
    const query = new URLSearchParams({
      page: String(nextPage),
      q: nextSearch,
    });
    const data = await request("GET", { query, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!data.rows.length && nextPage > 1)
      return loadRows(nextPage - 1, nextSearch);
    showDashboard();
    page = nextPage;
    search = nextSearch;
    renderRows(data.rows, data.offset);
    table.hidden = !data.rows.length;
    pagination.hidden = page === 1 && !data.hasNext;
    pageNumber.textContent = "Halaman " + page;
    previous.disabled = page <= 1;
    next.disabled = !data.hasNext;
    dashboardStatus.textContent = data.rows.length
      ? ""
      : search
        ? "Pendaftaran yang cocok belum ditemukan."
        : "Belum ada pendaftaran.";
  } catch (error) {
    if (controller.signal.aborted) return;
    if (dashboard.hidden)
      showLogin(
        error.status === 401
          ? ""
          : error.status
            ? error.message
            : "Koneksi terputus. Coba lagi.",
      );
    else if (!silent || error.status === 401)
      reportError(error, dashboardStatus);
  } finally {
    if (reading === controller) reading = undefined;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  button.disabled = true;
  loginStatus.textContent = "Memeriksa akun…";
  try {
    await request("POST", {
      body: Object.fromEntries(new FormData(loginForm)),
    });
    loginForm.reset();
    searchForm.reset();
    showDashboard();
    await loadRows(1, "");
  } catch (error) {
    reportError(error, loginStatus);
  } finally {
    button.disabled = false;
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void loadRows(1, searchForm.elements.search.value.trim());
});
refresh.addEventListener("click", () => void loadRows());
previous.addEventListener("click", () => void loadRows(page - 1));
next.addEventListener("click", () => void loadRows(page + 1));
closeDetail.addEventListener("click", () => detailDialog.close());
detailDialog.addEventListener("close", () => {
  for (const field of detailFields) field.textContent = "";
  detailFiles.replaceChildren();
  if (!dashboard.hidden && document.activeElement === document.body)
    searchForm.elements.search.focus();
});
deleteCancel.addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("cancel", (event) => {
  if (deleteConfirm.disabled) event.preventDefault();
});
deleteConfirm.addEventListener("click", async () => {
  if (!pendingDelete || deleteConfirm.disabled) return;
  const { request_id: requestId } = pendingDelete;
  deleteConfirm.disabled = true;
  deleteCancel.disabled = true;
  deleteStatus.textContent = "Menghapus data…";
  try {
    await request("DELETE", { body: { requestId } });
  } catch (error) {
    if (error.status !== 404) {
      reportError(error, deleteStatus);
      return;
    }
  } finally {
    deleteConfirm.disabled = false;
    deleteCancel.disabled = false;
  }
  pendingDelete = undefined;
  deleteDialog.close();
  await loadRows();
  if (!dashboard.hidden) searchForm.elements.search.focus();
});
logout.addEventListener("click", () => {
  logoutStatus.textContent = "";
  logoutDialog.showModal();
});
logoutCancel.addEventListener("click", () => logoutDialog.close());
logoutDialog.addEventListener("cancel", (event) => {
  if (logoutConfirm.disabled) event.preventDefault();
});
logoutConfirm.addEventListener("click", async () => {
  logoutConfirm.disabled = true;
  logoutCancel.disabled = true;
  logoutStatus.textContent = "Mengakhiri sesi…";
  try {
    await request("POST", { body: { action: "logout" } });
    showLogin();
    loginForm.elements.email.focus();
  } catch (error) {
    reportError(error, logoutStatus);
  } finally {
    logoutConfirm.disabled = false;
    logoutCancel.disabled = false;
  }
});

setInterval(() => {
  if (
    !document.hidden &&
    !dashboard.hidden &&
    !detailDialog.open &&
    !deleteDialog.open &&
    !logoutDialog.open &&
    !reading
  ) {
    void loadRows(page, search, true);
  }
}, 30000);
new ResizeObserver(() => {
  dashboard.style.setProperty("--admin-header-height", `${adminHeader.getBoundingClientRect().height}px`);
}).observe(adminHeader, { box: "border-box" });
void loadRows();
