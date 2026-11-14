export function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const phone = value.trim();
  if (phone.length > 32 || !/^\+?\d[\d ()-]*\d$/.test(phone)) return null;
  const normalized = phone.replace(/[ ()-]/g, "");
  return /^\+?\d{8,15}$/.test(normalized) ? normalized : null;
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim();
  const pattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return email.length <= 254 && pattern.test(email) ? email : null;
}

export function whatsappUrl(value) {
  const phone = normalizePhone(value);
  if (!phone) return null;

  const international = phone.startsWith("0")
    ? "62" + phone.slice(1)
    : phone.replace(/^\+/, "");
  return "https://wa.me/" + international;
}
