import { allTrips, stopIndex, isTripActiveOnDay } from '../data/loader.js';
import { timeToMins } from '../utils/time.js';

const MIN_CHANGE = 5;

export function searchDirect(originSet, destSet, threshold, intent, dayName = null) {
  const results = [];

  for (const trip of allTrips) {
    const stops = trip.stopTimes;
    let oi = -1, os = null, di = -1, ds = null;
    for (let i = 0; i < stops.length; i++) {
      if (oi === -1 && originSet.has(stops[i].stopName)) { oi = i; os = stops[i].stopName; }
      if (di === -1 && destSet.has(stops[i].stopName)) { di = i; ds = stops[i].stopName; }
    }
    if (oi === -1 || di === -1 || oi >= di) continue;

    const dep = timeToMins(stops[oi].departure);
    const arr = timeToMins(stops[di].arrival);

    if ((intent === 'flight' || intent === 'arrive') && arr > threshold) continue;
    if (intent === 'general' && dep < threshold) continue;
    if (!isTripActiveOnDay(trip, dayName)) continue;

    results.push({
      type: 'direct',
      totalDep: dep,
      totalArr: arr,
      legs: [{
        routeNumber: trip.routeNumber,
        routeDesc: trip.routeDesc,
        headsign: trip.headsign,
        serviceDays: trip.serviceDays,
        fromStop: os,
        dep,
        toStop: ds,
        arr,
      }],
    });
  }

  return results;
}

export function searchConnecting(originSet, destSet, threshold, intent, dayName = null) {
  const results = [];
  for (const trip1 of allTrips) {
    const stops1 = trip1.stopTimes;
    const oi = stops1.findIndex(s => originSet.has(s.stopName));
    if (oi === -1) continue;
    const dep1 = timeToMins(stops1[oi].departure);
    if (intent === 'general' && dep1 < threshold) continue;
    if (intent === 'last' && dep1 > threshold) continue;
    if (!isTripActiveOnDay(trip1, dayName)) continue;

    for (let ii = stops1.length - 1; ii > oi; ii--) {
      const iStop = stops1[ii].stopName;
      const arr1 = timeToMins(stops1[ii].arrival);
      const leg2idxs = stopIndex[iStop];
      if (!leg2idxs) continue;

      let found = false;
      for (const t2i of leg2idxs) {
        const trip2 = allTrips[t2i];
        if (trip2 === trip1 || !isTripActiveOnDay(trip2, dayName)) continue;

        const stops2 = trip2.stopTimes;
        const xi = stops2.findIndex(s => s.stopName === iStop);
        if (xi === -1) continue;

        const dep2 = timeToMins(stops2[xi].departure);
        if (dep2 < arr1 + MIN_CHANGE) continue;

        const di = stops2.findIndex((s, i) => i > xi && destSet.has(s.stopName));
        if (di === -1) continue;

        const arr2 = timeToMins(stops2[di].arrival);
        if ((intent === 'flight' || intent === 'arrive') && arr2 > threshold) continue;

        found = true;
        results.push({
          type: 'connecting',
          totalDep: dep1,
          totalArr: arr2,
          waitMins: dep2 - arr1,
          legs: [
            {
              routeNumber: trip1.routeNumber,
              routeDesc: trip1.routeDesc,
              headsign: trip1.headsign,
              serviceDays: trip1.serviceDays,
              fromStop: stops1[oi].stopName,
              dep: dep1,
              toStop: iStop,
              arr: arr1,
            },
            {
              routeNumber: trip2.routeNumber,
              routeDesc: trip2.routeDesc,
              headsign: trip2.headsign,
              serviceDays: trip2.serviceDays,
              fromStop: iStop,
              dep: dep2,
              toStop: stops2[di].stopName,
              arr: arr2,
            },
          ],
        });
      }
      if (found) break;
    }
  }
  return results;
}

export function searchMultiConnecting(originSet, destSet, threshold, intent, dayName = null) {
  const results = [];
  const MAX_RESULTS = 3;

  for (const trip1 of allTrips) {
    const stops1 = trip1.stopTimes;
    const oi = stops1.findIndex(s => originSet.has(s.stopName));
    if (oi === -1) continue;
    const dep1 = timeToMins(stops1[oi].departure);
    if (intent === 'general' && dep1 < threshold) continue;
    if (!isTripActiveOnDay(trip1, dayName)) continue;

    for (let ii = stops1.length - 1; ii > oi; ii--) {
      const stopA = stops1[ii].stopName;
      const arr1 = timeToMins(stops1[ii].arrival);
      const tripsFromA = stopIndex[stopA];
      if (!tripsFromA) continue;

      for (const t2i of tripsFromA) {
        const trip2 = allTrips[t2i];
        if (trip2 === trip1 || !isTripActiveOnDay(trip2, dayName)) continue;

        const stops2 = trip2.stopTimes;
        const idxA = stops2.findIndex(s => s.stopName === stopA);
        if (idxA === -1) continue;

        const dep2 = timeToMins(stops2[idxA].departure);
        if (dep2 < arr1 + MIN_CHANGE) continue;

        for (let ji = stops2.length - 1; ji > idxA; ji--) {
          const stopB = stops2[ji].stopName;
          if (destSet.has(stopB)) continue;

          const arr2 = timeToMins(stops2[ji].arrival);
          const tripsFromB = stopIndex[stopB];
          if (!tripsFromB) continue;

          for (const t3i of tripsFromB) {
            const trip3 = allTrips[t3i];
            if (trip3 === trip2 || trip3 === trip1 || !isTripActiveOnDay(trip3, dayName)) continue;

            const stops3 = trip3.stopTimes;
            const idxB = stops3.findIndex(s => s.stopName === stopB);
            if (idxB === -1) continue;

            const dep3 = timeToMins(stops3[idxB].departure);
            if (dep3 < arr2 + MIN_CHANGE) continue;

            const di = stops3.findIndex((s, i) => i > idxB && destSet.has(s.stopName));
            if (di === -1) continue;

            const arr3 = timeToMins(stops3[di].arrival);
            if ((intent === 'flight' || intent === 'arrive') && arr3 > threshold) continue;

            results.push({
              type: 'multi',
              totalDep: dep1,
              totalArr: arr3,
              legs: [
                {
                  routeNumber: trip1.routeNumber,
                  routeDesc: trip1.routeDesc,
                  headsign: trip1.headsign,
                  serviceDays: trip1.serviceDays,
                  fromStop: stops1[oi].stopName,
                  dep: dep1,
                  toStop: stopA,
                  arr: arr1,
                },
                {
                  routeNumber: trip2.routeNumber,
                  routeDesc: trip2.routeDesc,
                  headsign: trip2.headsign,
                  serviceDays: trip2.serviceDays,
                  fromStop: stopA,
                  dep: dep2,
                  toStop: stopB,
                  arr: arr2,
                },
                {
                  routeNumber: trip3.routeNumber,
                  routeDesc: trip3.routeDesc,
                  headsign: trip3.headsign,
                  serviceDays: trip3.serviceDays,
                  fromStop: stopB,
                  dep: dep3,
                  toStop: stops3[di].stopName,
                  arr: arr3,
                },
              ],
            });

            if (results.length >= MAX_RESULTS) return results;
          }
        }
      }
    }
  }
  return results;
}

function dedupe(results) {
  const seen = new Set();
  return results.filter(r => {
    const key = r.legs.map(l => `${l.routeNumber}|${l.dep}|${l.arr}`).join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function search(originCandidates, destCandidates, threshold, intent, dayName = null) {
  const originSet = new Set(originCandidates);
  const destSet = new Set(destCandidates);
  
  const searchThreshold = (intent === 'first') ? 0 : threshold;
  
  const direct = searchDirect(originSet, destSet, searchThreshold, intent, dayName);
  
  let sortFn;
  if (intent === 'flight') {
    sortFn = (a, b) => b.totalDep - a.totalDep;
  } else if (intent === 'first') {
    sortFn = (a, b) => a.totalDep - b.totalDep;
  } else if (intent === 'last') {
    sortFn = (a, b) => b.totalDep - a.totalDep;
  } else {
    sortFn = (a, b) => a.totalArr - b.totalArr;
  }
  
  if (direct.length >= 3) {
    return dedupe(direct.sort(sortFn)).slice(0, 5);
  }
  const connecting = searchConnecting(originSet, destSet, searchThreshold, intent, dayName);
  let combined = [...direct, ...connecting].sort(sortFn);
  combined = dedupe(combined);
  
  if (intent === 'arrive' && combined.length > 0) {
    const bestArrival = combined[0].totalArr;
    if (bestArrival > threshold + 30) {
      const multi = searchMultiConnecting(originSet, destSet, searchThreshold, intent, dayName);
      combined = [...combined, ...multi].sort(sortFn);
      combined = dedupe(combined);
    }
  } else if (combined.length === 0) {
    const multi = searchMultiConnecting(originSet, destSet, searchThreshold, intent, dayName);
    combined = multi.sort(sortFn);
  }
  
  if (intent === 'last') {
    combined = combined.filter(r => r.totalDep <= threshold);
  }
  
  return combined.slice(0, 5);
}
