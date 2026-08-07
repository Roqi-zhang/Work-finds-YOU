// Anonymous device key — lets a visitor run their free JD parse before signing up,
// and lets the backend claim those records once they create an account.

const KEY = "wfy.guestKey";

export function getGuestKey(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "");
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return "anonymous";
  }
}
