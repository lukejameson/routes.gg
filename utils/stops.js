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
  const airportMatch = text.match(/\b(airport)\b/i);
  const isAirport = !!airportMatch;
  const airportIndex = airportMatch ? airportMatch.index : -1;
  
  let originCandidates = [];
  let destCandidates = [];
  let isAirportDestination = false;
  
  const fromMatch = text.match(/\bfrom\s+([A-Za-z0-9''\s]+?)(?:\s+(?:for|at|to|by|before|on)\b|$)/i);
  const toMatch = text.match(/\bto\s+(?:the\s+)?([A-Za-z0-9''\s]+?)(?:\s+(?:from|for|at|by|before|on)\b|$)/i);
  
  if (fromMatch) {
    const fromStop = fromMatch[1].trim().toLowerCase();
    if (fromStop.includes('airport')) {
      originCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
    } else {
      originCandidates = fuzzyMatchStops(fromMatch[1].trim(), allStopNames);
    }
  }
  
  if (toMatch) {
    const toStop = toMatch[1].trim().toLowerCase();
    if (toStop.includes('airport')) {
      destCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
      isAirportDestination = true;
    } else if (!isAirport) {
      destCandidates = fuzzyMatchStops(toMatch[1].trim(), allStopNames);
    }
  }
  
  if (!originCandidates.length || !destCandidates.length) {
    const prefixless = text.match(/^([A-Za-z0-9''\s]+?)\s+to\s+(?:the\s+)?([A-Za-z0-9''\s]+?)(?:\s+(?:for|at|by|before|on)\b|\s+\d|$)/i);
    if (prefixless) {
      const left = prefixless[1].trim().toLowerCase();
      const right = prefixless[2].trim().toLowerCase();
      
      if (left.includes('airport')) {
        originCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
      } else {
        const leftMatches = fuzzyMatchStops(prefixless[1].trim(), allStopNames);
        if (!originCandidates.length && leftMatches.length) originCandidates = leftMatches;
      }
      
      if (right.includes('airport')) {
        destCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
        isAirportDestination = true;
      } else if (!isAirport || airportIndex === -1 || airportIndex > text.toLowerCase().indexOf('to')) {
        const rightMatches = fuzzyMatchStops(prefixless[2].trim(), allStopNames);
        if (!destCandidates.length && rightMatches.length) destCandidates = rightMatches;
      }
    }
    
    if (isAirport && !originCandidates.length && !destCandidates.length) {
      const flightPattern = text.match(/^([A-Za-z0-9''\s]+?)(?:\s+(?:flight|fly|at|for)\b|\s+\d)/i);
      if (flightPattern) {
        const origin = fuzzyMatchStops(flightPattern[1].trim(), allStopNames);
        if (origin.length) {
          originCandidates = origin;
          destCandidates = allStopNames.filter(s => s.toLowerCase().includes('airport'));
          isAirportDestination = true;
        }
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
