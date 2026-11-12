import { test } from "node:test";
import assert from "node:assert/strict";
import admin from "../api/admin.js";

test("rejects missing sessions and sessions from other Supabase users before accessing data", async (t) => {
  const config = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    REDIAL_ADMIN_USER_ID: "allowed-admin",
  };
  const oldValues = Object.fromEntries(
    Object.keys(config).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, config);
  t.after(() => {
    for (const [key, value] of Object.entries(oldValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const auth = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, config.SUPABASE_URL + "/auth/v1/user");
    return new Response(JSON.stringify({ id: "another-user" }));
  });
  const response = () => ({
    setHeader() {},
    status(code) {
      this.code = code;
      return this;
    },
    json() {},
  });
  const anonymous = response();
  await admin({ method: "GET", headers: {} }, anonymous);
  assert.equal(anonymous.code, 401);
  assert.equal(auth.mock.callCount(), 0);
  for (const method of ["GET", "PATCH", "DELETE"]) {
    const denied = response();
    await admin(
      {
        method,
        headers: {
          cookie: "redial_admin_session=other.user.token",
          "content-type": "application/json",
        },
      },
      denied,
    );
    assert.equal(denied.code, 401);
  }
  assert.equal(auth.mock.callCount(), 3);
});

test("downloads only the requested file after admin authorization", async (t) => {
  const config = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    REDIAL_ADMIN_USER_ID: "allowed-admin",
  };
  const oldValues = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  t.after(() => {
    for (const [key, value] of Object.entries(oldValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const requestId = "66f7e08f-0c76-4f43-82dc-0620e4fcb767";
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.pathname === "/auth/v1/user") return Response.json({ id: "allowed-admin" });
    assert.equal(parsed.searchParams.get("request_id"), "eq." + requestId);
    assert.equal(parsed.searchParams.get("select"), "qr_tactlink,qr_tactlink_mime");
    return Response.json([{ qr_tactlink: "\\x" + bytes.toString("hex"), qr_tactlink_mime: "image/png" }]);
  });
  const response = () => ({
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json() {},
    end(body) { this.body = body; },
  });
  const url = `/api/admin?proof=${requestId}&file=tactlink`;
  const denied = response();
  await admin({ method: "GET", url, headers: {} }, denied);
  assert.equal(denied.code, 401);
  assert.equal(requests.length, 0);

  const allowed = response();
  await admin({ method: "GET", url, headers: { cookie: "redial_admin_session=valid.admin.token" } }, allowed);
  assert.equal(allowed.code, 200);
  assert.deepEqual(allowed.body, bytes);
  assert.equal(allowed.headers["Cache-Control"], "no-store");
  assert.match(allowed.headers["Content-Disposition"], /^attachment; filename="qr-tactlink-.*\.png"$/);
  assert.equal(requests.length, 2);
});
