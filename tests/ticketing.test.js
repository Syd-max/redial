import { test } from "node:test";
import assert from "node:assert/strict";
import admin from "../api/admin.js";

test("admin sends both DUO PDFs to the same recipient and reuses a prior attempt key", async (t) => {
  for (const [key, value] of Object.entries({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    REDIAL_ADMIN_USER_ID: "example-admin",
    BREVO_API_KEY: "test-key",
    BREVO_SENDER_EMAIL: "tiket@example.org",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const requestId = "66f7e08f-0c76-4f43-82dc-0620e4fcb767";
  const ids = ["0345254679082301", "8572340626771582"];
  const claim = {
    status: "sending",
    key: "fc37ecaa-9b93-43f4-8051-51269c4195cc",
    attempt: "2026-11-17T08:00:00+00:00",
    kind: "DUO",
    email: "participant@example.org",
    codes: ids,
  };
  const sent = [];
  let state = "pending";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const { pathname, searchParams } = new URL(url);
    const data = JSON.parse(options.body ?? "null");
    if (pathname === "/auth/v1/user") return Response.json({ id: "example-admin" });
    if (pathname === "/rest/v1/rpc/redial_claim_ticket_email") {
      assert.deepEqual(data, { p_request_id: requestId, p_email: claim.email, p_kind: claim.kind });
      if (state === "accepted") return Response.json({ status: "accepted" });
      return Response.json({ ...claim, retrying: state === "uncertain" });
    }
    if (pathname === "/v3/smtp/email") {
      sent.push(data);
      if (sent.length === 1) throw new Error("network timeout");
      return Response.json({ code: "duplicate_parameter", message: "Idempotency key already used" }, { status: 400 });
    }
    assert.equal(pathname, "/rest/v1/redial_pendaftaran");
    assert.equal(searchParams.get("ticket_email_key"), "eq." + claim.key);
    assert.equal(searchParams.get("ticket_email_attempt_at"), "eq." + claim.attempt);
    state = data.ticket_email_status;
    return Response.json([{ ticket_approved_at: claim.attempt }]);
  });

  const makeRequest = async (authenticated) => {
    const res = {
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; },
    };
    await admin({
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: authenticated ? "redial_admin_session=valid.admin.token" : "",
      },
      body: { action: "approve-ticket", requestId, email: claim.email, ticketType: claim.kind },
    }, res);
    return res;
  };

  assert.equal((await makeRequest(false)).code, 401);
  assert.equal(sent.length, 0);
  assert.equal((await makeRequest(true)).body.ticketEmailStatus, "uncertain");
  assert.equal((await makeRequest(true)).body.ticketEmailStatus, "accepted");
  assert.equal((await makeRequest(true)).body.ticketEmailStatus, "accepted");
  assert.equal(sent.length, 2);
  for (const message of sent) {
    assert.deepEqual(message.to, [{ email: claim.email }]);
    assert.equal(message.headers.idempotencyKey, claim.key);
    assert.match(message.htmlContent, /Selah Hall/);
    assert.deepEqual(message.attachment.map(({ name }) => name), ids.map((id) => `REDIAL-${id}.pdf`));
    for (const item of message.attachment) {
      assert.match(Buffer.from(item.content, "base64").subarray(0, 8).toString(), /^%PDF-/);
    }
  }
});
