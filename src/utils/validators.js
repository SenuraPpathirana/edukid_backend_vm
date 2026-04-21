export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  const e = normalizeEmail(email);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(e);
}

export function isStrongPassword(pw) {
  const p = String(pw || "");
  return p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p);
}


