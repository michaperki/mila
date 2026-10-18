/**
 * The light behind the tree, by local hour: cool at dawn, warm through the day,
 * golden toward evening, a soft dusk at night. Never dark, so the tree always reads.
 */
type Key = { hour: number; top: string; bottom: string; sun: string; sunY: number };

const KEYS: Key[] = [
  { hour: 0, top: '#E9E4DD', bottom: '#DCD3CA', sun: '#EFE8DC', sunY: 470 },
  { hour: 5, top: '#E9E4DD', bottom: '#DCD3CA', sun: '#EFE8DC', sunY: 480 },
  { hour: 7, top: '#F6EDE6', bottom: '#EEDDD2', sun: '#F5D6C6', sunY: 470 },
  { hour: 10, top: '#F5F0E6', bottom: '#EBE2D2', sun: '#F4E2C4', sunY: 410 },
  { hour: 14, top: '#F7EEDF', bottom: '#EEDCC6', sun: '#F6D3B4', sunY: 400 },
  { hour: 18, top: '#F8E9D6', bottom: '#F0D5B8', sun: '#F4BF92', sunY: 450 },
  { hour: 20.5, top: '#F0E4DA', bottom: '#E4D3C6', sun: '#EAC6B2', sunY: 480 },
  { hour: 23, top: '#E9E4DD', bottom: '#DCD3CA', sun: '#EFE8DC', sunY: 470 },
  { hour: 24, top: '#E9E4DD', bottom: '#DCD3CA', sun: '#EFE8DC', sunY: 470 },
];

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a: string, b: string, t: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
};

export interface Sky {
  top: string;
  bottom: string;
  sun: string;
  /** Sun height in world units (lower near dawn and dusk). */
  sunY: number;
}

export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].hour <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (h - a.hour) / (b.hour - a.hour)));
  const e = t * t * (3 - 2 * t);
  return {
    top: mixHex(a.top, b.top, e),
    bottom: mixHex(a.bottom, b.bottom, e),
    sun: mixHex(a.sun, b.sun, e),
    sunY: a.sunY + (b.sunY - a.sunY) * e,
  };
}

/** The current local hour as a fraction, e.g. 18.5 for half past six. */
export const hourNow = (d = new Date()) => d.getHours() + d.getMinutes() / 60;
