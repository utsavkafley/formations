// Login-free identity. We keep a random, stable device id in localStorage and
// remember which squad member this device belongs to, so a person's IN/OUT pick
// sticks to them across visits without any account.
const DEVICE_KEY = "yolo.device.v1";
const MEMBER_KEY = "yolo.member.v1"; // { id, name }

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getMe() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_KEY)) || null;
  } catch {
    return null;
  }
}

export function setMe(member) {
  if (member) localStorage.setItem(MEMBER_KEY, JSON.stringify({ id: member.id, name: member.name }));
  else localStorage.removeItem(MEMBER_KEY);
}
