import { sponsorPackages } from "../src/sponsor-packages.js";
import { normalizeEmail, normalizePhone } from "../src/registration-contact.js";

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRequestId(value) {
  return typeof value === "string" && requestIdPattern.test(value);
}

export function validateRegistrationFields(body) {
  if (!body || typeof body !== "object") return null;
  const { name, institution, gender, sponsorPackage, phone, email } = body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120)
    return null;
  if (
    typeof institution !== "string" ||
    !institution.trim() ||
    institution.trim().length > 160
  )
    return null;
  if (!["laki-laki", "perempuan"].includes(gender)) return null;
  const fields = {
    nama: name.trim(),
    instansi: institution.trim(),
    jenis_kelamin: gender,
  };
  if (sponsorPackage !== undefined) {
    if (sponsorPackage !== "" && !sponsorPackages.includes(sponsorPackage))
      return null;
    fields.paket_sponsor = sponsorPackage || null;
  }
  if (phone !== undefined) {
    fields.nomor_telepon = normalizePhone(phone);
    if (!fields.nomor_telepon) return null;
  }
  if (email !== undefined) {
    fields.email = normalizeEmail(email);
    if (!fields.email) return null;
  }
  return fields;
}

export function getRegistrationStore() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + key;
  const rest = (path, options = {}) => fetch(url + "/rest/v1/" + path, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(10000),
  });

  return {
    url,
    request(query, options) {
      return rest("redial_pendaftaran?" + query, options);
    },
    async rpc(name, body) {
      const response = await rest("rpc/" + name, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Database operation failed");
      return response.json();
    },
  };
}

