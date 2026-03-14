import { baseStopMap, allStopNames } from '../data/loader.js';

export function getStopVariants(baseName) {
  return baseStopMap.get(baseName) || [baseName];
}

export function fuzzyMatchStops(query, names) {
  const q = query.toLowerCase().trim();
  const regularNames = names.filter(s => !s.toLowerCase().includes('school bus'));
  
  const exact = regularNames.filter(s => s.toLowerCase() === q);
  if (exact.length) return exact;
  const contains = regularNames.filter(s => s.toLowerCase().includes(q));
  if (contains.length) return contains;
  const words = q.split(/\s+/);
  const multi = regularNames.filter(s => words.every(w => s.toLowerCase().includes(w)));
  if (multi.length) return multi;
  const scored = regularNames.map(s => {
    let score = 0;
    for (const w of words) if (s.toLowerCase().includes(w)) score += w.length;
    return { s, score };
  }).filter(x => x.score > 2).sort((a, b) => b.score - a.score);
  return scored.map(x => x.s);
}

export function extractStops(text) {
  const lower = text.toLowerCase();
  
  // Remove day references and time patterns from text for stop matching
  const dayWords = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'tomorrow', 'today'];
  let cleanText = text;
  for (const day of dayWords) {
    cleanText = cleanText.replace(new RegExp(`\\b${day}\\b`, 'gi'), '');
  }
  // Remove time patterns like "at 8pm", "8:00", etc.
  cleanText = cleanText.replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '');
  cleanText = cleanText.replace(/\b\d{1,2}:\d{2}\b/g, '');
  cleanText = cleanText.replace(/\b\d{1,2}\s*(am|pm)\b/gi, '');
  cleanText = cleanText.replace(/\s+/g, ' ').trim();
  
  console.log('Clean text:', cleanText);
  
  let originCandidates = [];
  let destCandidates = [];
  let isAirportDestination = false;
  
  // Look for explicit "from X to Y" pattern
  const fromMatch = cleanText.match(/\bfrom\s+([A-Za-z0-9''\s]+?)(?:\s+to\b|\s*$)/i);
  const toMatch = cleanText.match(/\bto\s+(?:the\s+)?([A-Za-z0-9''\s]+?)(?:\s+from\b|\s*$)/i);
  
  console.log('fromMatch:', fromMatch);
  console.log('toMatch:', toMatch);
  
  if (fromMatch) {
    const fromStop = fromMatch[1].trim().toLowerCase();
    console.log('fromStop:', fromStop);
    if (fromStop.includes('airport')) {
      originCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
    } else {
      originCandidates = fuzzyMatchStops(fromMatch[1].trim(), allStopNames);
    }
  }
  
  if (toMatch) {
    const toStop = toMatch[1].trim().toLowerCase();
    console.log('toStop:', toStop);
    if (toStop.includes('airport')) {
      destCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
      isAirportDestination = true;
    } else {
      destCandidates = fuzzyMatchStops(toMatch[1].trim(), allStopNames);
    }
  }
  
  // If no explicit from/to, look for "X to Y" pattern
  if (!originCandidates.length || !destCandidates.length) {
    const toIndex = cleanText.toLowerCase().indexOf(' to ');
    console.log('toIndex:', toIndex);
    if (toIndex !== -1) {
      // Split on " to "
      const beforeTo = cleanText.substring(0, toIndex).trim();
      const afterTo = cleanText.substring(toIndex + 4).trim();
      
      console.log('beforeTo:', beforeTo);
      console.log('afterTo:', afterTo);
      
      if (!originCandidates.length && beforeTo) {
        if (beforeTo.toLowerCase().includes('airport')) {
          originCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
        } else {
          const matches = fuzzyMatchStops(beforeTo, allStopNames);
          if (matches.length) originCandidates = matches;
        }
      }
      
      if (!destCandidates.length && afterTo) {
        if (afterTo.toLowerCase().includes('airport')) {
          destCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
          isAirportDestination = true;
          console.log('Set isAirportDestination = true');
        } else {
          const matches = fuzzyMatchStops(afterTo, allStopNames);
          if (matches.length) destCandidates = matches;
        }
      }
    }
  }
  
  console.log('origin:', originCandidates[0]);
  console.log('destination:', destCandidates[0]);
  console.log('isAirportDestination:', isAirportDestination);
  
  // Handle flight/airport queries without explicit "to" (e.g., "Town flight 5pm")
  if (!originCandidates.length && !destCandidates.length) {
    const flightPattern = cleanText.match(/^([A-Za-z0-9''\s]+?)(?:\s+(?:flight|fly)\b)/i);
    if (flightPattern) {
      const origin = fuzzyMatchStops(flightPattern[1].trim(), allStopNames);
      if (origin.length) {
        originCandidates = origin;
        destCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
        isAirportDestination = true;
      }
    }
  }
  
  return { 
    origin: originCandidates[0] || null, 
    destination: destCandidates[0] || null, 
    originCandidates, 
    destCandidates,
    isAirportDestination 
  };
}
