import { getStopVariants } from '../utils/stops.js';
import { allStopNames } from '../data/loader.js';

const DAY_MAP = {
  'sunday': 'sunday', 'sun': 'sunday',
  'monday': 'monday', 'mon': 'monday',
  'tuesday': 'tuesday', 'tue': 'tuesday', 'tues': 'tuesday',
  'wednesday': 'wednesday', 'wed': 'wednesday',
  'thursday': 'thursday', 'thu': 'thursday', 'thurs': 'thursday',
  'friday': 'friday', 'fri': 'friday',
  'saturday': 'saturday', 'sat': 'saturday'
};

export function parseDay(text) {
  const lower = text.toLowerCase();
  
  // Check for tomorrow
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][tomorrow.getDay()];
  }
  
  // Check for today (return null since we default to today anyway)
  if (/\btoday\b/.test(lower)) {
    return null;
  }
  
  // Check for specific days - look for whole words only
  const words = lower.match(/\b\w+\b/g) || [];
  for (const word of words) {
    if (DAY_MAP[word]) {
      return DAY_MAP[word];
    }
  }
  
  return null;
}

export function parseTime(text) {
  const lower = text.toLowerCase();
  
  if (/\b(now|soon|next|asap)\b/.test(lower)) {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
  
  if (/\bmorning\b/.test(lower)) return 8 * 60;
  if (/\bafternoon\b/.test(lower)) return 14 * 60;
  if (/\bevening\b/.test(lower)) return 18 * 60;
  if (/\bnoon\b/.test(lower) || /\bmidday\b/.test(lower)) return 12 * 60;
  
  if (/\bfirst\b/.test(lower)) return 6 * 60;
  if (/\blast\b/.test(lower)) return 23 * 60 + 30;
  
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = ampm[2] ? parseInt(ampm[2]) : 0;
    const p = ampm[3].toLowerCase();
    if (p === 'pm' && h !== 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    return h * 60 + m;
  }
  const h24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return parseInt(h24[1]) * 60 + parseInt(h24[2]);
  return null;
}

export function detectIntent(text, isAirportDestination = false) {
  const lower = text.toLowerCase();
  if (isAirportDestination && /\b(flight|fly|plane|airport)\b/i.test(text)) {
    return 'flight';
  }
  if (/\b(for|by)\s+\d/.test(lower)) return 'arrive';
  if (/\bfirst\b/.test(lower)) return 'first';
  if (/\blast\b/.test(lower)) return 'last';
  return 'general';
}

export function populateManualDropdowns(originSel, destSel, askBtn, pickBtn) {
  const opts = allStopNames.map(s => `<option value="${s}">${s}</option>`).join('');
  originSel.innerHTML = '<option value="">Select stop...</option>' + opts;
  destSel.innerHTML = '<option value="">Select stop...</option>' + opts;
  askBtn.disabled = false;
  pickBtn.disabled = false;
}
