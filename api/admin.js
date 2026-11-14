import {
  getRegistrationStore,
  isRequestId,
  validateRegistrationFields,
} from "../server/registration-store.js";
import { getProofExtension } from "../server/payment-proof.js";

const sessionCookie = "redial_admin_session";
const pageSize = 30;
const columns = "request_id,nama,instansi,jenis_kelamin,nomor_telepon,email,jenis_tiket,paket_sponsor,bukti_transfer_mime,qr_tactlink_mime,created_at";
const tokenPattern = /^[\w-]+\.[\w-]+\.[\w-]+$/;

function setSession(req, res, token, maxAge) {
  const secure = process.env.VERCEL === "1" || req.socket?.encrypted;
  res.setHeader(
    "Set-Cookie",
    sessionCookie +
      "=" +
      token +
      "; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=" +
      maxAge +
      (secure ? "; Secure" : ""),
  );
}

function getToken(req) {
  return req.headers.cookie
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(sessionCookie + "="))
    ?.slice(sessionCookie.length + 1);
}

function authRequest(url, key, path, options = {}) {
  return fetch(url + "/auth/v1/" + path, {
    ...options,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
}

async function sendRegistrationFile(store, requestId, kind, res) {
  if (!isRequestId(requestId))
    return res.status(400).json({ error: "Referensi pendaftaran tidak valid." });
  if (kind !== "payment" && kind !== "tactlink")
    return res.status(400).json({ error: "Jenis berkas tidak valid." });
  const column = kind === "tactlink" ? "qr_tactlink" : "bukti_transfer";
  const filename = kind === "tactlink" ? "qr-tactlink" : "bukti-transfer";

  const response = await store.request(new URLSearchParams({
    select: column + "," + column + "_mime",
    request_id: "eq." + requestId,
    limit: "1",
  }));
  if (!response.ok) throw new Error("Read failed");
  const [row] = await response.json();
  const data = row?.[column];
  if (!data)
    return res.status(404).json({ error: "Berkas belum tersedia." });

  const extension = getProofExtension(row[column + "_mime"]);
  if (!extension || !data.startsWith("\\x")) throw new Error("Invalid stored file");
  const bytes = Buffer.from(data.slice(2), "hex");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}-${requestId}.${extension}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).end(bytes);
}

export default async function admin(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const { method, body } = req;
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Metode tidak didukung." });
  }
  if (
    method !== "GET" &&
    req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
      "application/json"
  ) {
    return res.status(415).json({ error: "Format data tidak valid." });
  }
  if (req.headers["sec-fetch-site"] === "cross-site") {
    return res.status(403).json({ error: "Akses ditolak." });
  }
  if (method === "POST" && body?.action === "logout") {
    setSession(req, res, "", 0);
    return res.status(200).json({ ok: true });
  }

  const store = getRegistrationStore();
  const authKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const adminId = process.env.REDIAL_ADMIN_USER_ID;
  if (!store || !authKey || !adminId) {
    return res
      .status(503)
      .json({ error: "Konfigurasi dashboard admin belum tersedia." });
  }

  try {
    if (method === "POST") {
      const email = typeof body?.email === "string" ? body.email.trim() : "";
      const password = body?.password;
      if (
        !email ||
        email.length > 254 ||
        typeof password !== "string" ||
        !password ||
        password.length > 1024
      ) {
        return res.status(400).json({ error: "Periksa email dan kata sandi." });
      }
      const response = await authRequest(
        store.url,
        authKey,
        "token?grant_type=password",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
      if (response.status === 429) {
        return res
          .status(429)
          .json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
      }
      if (response.status >= 500) throw new Error("Auth unavailable");
      const session = response.ok ? await response.json() : null;
      if (
        session?.user?.id !== adminId ||
        typeof session.access_token !== "string" ||
        !tokenPattern.test(session.access_token)
      ) {
        return res
          .status(401)
          .json({ error: "Email atau kata sandi admin salah." });
      }
      const expires = Number(session.expires_in);
      if (!Number.isFinite(expires) || expires < 1)
        throw new Error("Invalid expiry");
      setSession(
        req,
        res,
        session.access_token,
        Math.min(3600, Math.floor(expires)),
      );
      return res.status(200).json({ ok: true });
    }

    const token = getToken(req);
    if (!token || !tokenPattern.test(token)) {
      return res
        .status(401)
        .json({ error: "Masuk sebagai admin untuk melanjutkan." });
    }
    const auth = await authRequest(store.url, authKey, "user", {
      headers: { Authorization: "Bearer " + token },
    });
    if (auth.status >= 500 || auth.status === 429)
      throw new Error("Auth unavailable");
    const user = auth.ok ? await auth.json() : null;
    if (user?.id !== adminId) {
      setSession(req, res, "", 0);
      return res
        .status(401)
        .json({ error: "Sesi admin berakhir. Silakan masuk kembali." });
    }

    if (method === "GET") {
      const filters = new URL(req.url, "http://localhost").searchParams;
      const proofRequestId = filters.get("proof");
      if (proofRequestId !== null)
        return await sendRegistrationFile(store, proofRequestId, filters.get("file") ?? "payment", res);
      const page = Number(filters.get("page") ?? "1");
      const search = (filters.get("q") ?? "").trim().slice(0, 120);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
        return res.status(400).json({ error: "Nomor halaman tidak valid." });
      }
      const offset = (page - 1) * pageSize;
      const query = new URLSearchParams({
        select: columns,
        order: "created_at.desc,id.desc",
        limit: String(pageSize + 1),
        offset: String(offset),
      });
      if (search) {
        // Escape the literal search for PostgreSQL regex and PostgREST's quoted filter.
        const pattern = search
          .replace(/[.*+?^$(){}|[\]\\]/g, "\\$&")
          .replace(/["\\]/g, "\\$&");
        query.set(
          "or",
          '(nama.imatch."' + pattern + '",instansi.imatch."' + pattern + '")',
        );
      }
      const response = await store.request(query);
      if (!response.ok) throw new Error("Read failed");
      const rows = await response.json();
      return res
        .status(200)
        .json({
          rows: rows.slice(0, pageSize),
          hasNext: rows.length > pageSize,
          offset,
        });
    }

    if (!isRequestId(body?.requestId)) {
      return res
        .status(400)
        .json({ error: "Referensi pendaftaran tidak valid." });
    }
    const fields = method === "PATCH" ? validateRegistrationFields(body) : null;
    if (method === "PATCH" && !fields) {
      return res
        .status(400)
        .json({ error: "Periksa kembali data pendaftaran." });
    }
    const response = await store.request(
      new URLSearchParams({
        select: "request_id",
        request_id: "eq." + body.requestId,
      }),
      {
        method,
        headers: { Prefer: "return=representation" },
        body: fields ? JSON.stringify(fields) : undefined,
      },
    );
    if (!response.ok) throw new Error("Write failed");
    const rows = await response.json();
    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "Data pendaftaran sudah tidak tersedia." });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res
      .status(502)
      .json({ error: "Data admin belum dapat diproses. Coba lagi." });
  }
}
