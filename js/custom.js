// 커스텀 시나리오: 설정 검증 · 공유 링크 인코딩 (DOM/three 의존 없음 → 단위 테스트 가능)

export const CUSTOM_FIELDS = {
  count: { min: 1, max: 8, step: 1, def: 3 },
  size: { min: 0.15, max: 1.5, step: 0.05, def: 0.5 },
  distance: { min: 8, max: 35, step: 1, def: 16 },
  spreadYaw: { min: 2, max: 60, step: 1, def: 25 },
  spreadPitch: { min: 2, max: 30, step: 1, def: 14 },
  moveSpeed: { min: 0, max: 60, step: 1, def: 0 },
  lifetime: { min: 0, max: 5, step: 0.1, def: 0 },
  hp: { min: 0.3, max: 3, step: 0.1, def: 1.2 },
  duration: { min: 15, max: 120, step: 15, def: 60 },
};

const clampNum = (v, { min, max, def }) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

/** 외부(공유 링크 등)에서 온 값도 안전하게: 허용된 필드/범위만 남김 */
export function sanitizeCustom(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {
    name: String(r.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Custom',
    type: r.type === 'track' ? 'track' : 'click',
  };
  for (const [k, f] of Object.entries(CUSTOM_FIELDS)) out[k] = clampNum(r[k], f);
  out.count = Math.round(out.count);
  if (typeof r.id === 'string' && /^[a-z0-9]{4,16}$/.test(r.id)) out.id = r.id;
  return out;
}

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(cfg) {
  const { id, ...rest } = sanitizeCustom(cfg);
  return b64urlEncode(JSON.stringify(rest));
}

/** 실패하면 null */
export function decodeShare(code) {
  try {
    if (typeof code !== 'string' || code.length > 2000) return null;
    return sanitizeCustom(JSON.parse(b64urlDecode(code)));
  } catch {
    return null;
  }
}

export function newCustomId() {
  return Math.random().toString(36).slice(2, 10).padEnd(6, '0');
}
