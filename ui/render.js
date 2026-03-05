import { minsToTime, durStr } from '../utils/time.js';

const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];

function renderDays(serviceDays) {
  const today = new Date().getDay();
  return DAYS.map((d, i) => {
    const on = serviceDays[['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][i]];
    const isToday = i === today;
    return `<div class="day ${on ? 'on' : ''} ${isToday ? 'today' : ''}">${d}</div>`;
  }).join('');
}

function renderLeg(leg) {
  const dur = leg.arr - leg.dep;
  return `
    <div class="leg">
      <div class="leg-route">
        <div class="route-num">${leg.routeNumber}</div>
      </div>
      <div class="leg-info">
        <div class="time-row">${minsToTime(leg.dep)} → ${minsToTime(leg.arr)}</div>
        <div class="stop-row">${leg.fromStop} → ${leg.toStop}</div>
        <div class="dur-row">${durStr(dur)} · ${leg.headsign}</div>
      </div>
    </div>`;
}

export function renderJourney(j, idx) {
  const isBest = idx === 0;
  const totalDur = j.totalArr - j.totalDep;
  
  let legsHtml = '';
  for (let i = 0; i < j.legs.length; i++) {
    legsHtml += renderLeg(j.legs[i]);
    if (i < j.legs.length - 1) {
      const waitMins = j.legs[i + 1].dep - j.legs[i].arr;
      legsHtml += `
        <div class="change">
          <span>Change at <strong>${j.legs[i].toStop}</strong></span>
          <span class="change-wait">${durStr(waitMins)} wait</span>
        </div>`;
    }
  }
  
  const changeText = j.type === 'direct' ? 'Direct journey' : 
                     j.type === 'multi' ? '2 changes' : '1 change';
  
  return `
    <div class="result ${isBest ? 'best' : ''}">
      <div class="meta">
        ${changeText} · ${durStr(totalDur)} total
        ${isBest ? '<span class="badge">Best option</span>' : ''}
      </div>
      <div class="legs">${legsHtml}</div>
      <div class="days">${renderDays(j.legs[0].serviceDays)}</div>
    </div>`;
}

export function renderHeader(intent, origin, destination, threshold, timeMins, isAirportDestination = false, dayName = null) {
  let html = '';
  const isDepartingFromAirport = origin && origin.toLowerCase().includes('airport');
  
  // Format day name for display
  const dayDisplay = dayName ? ` on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}` : '';
  
  if (intent === 'flight' && isAirportDestination) {
    html += `
      <div class="banner">
        <span>Flight at ${minsToTime(timeMins)}${dayDisplay} — arrive at airport by ${minsToTime(threshold)}</span>
      </div>`;
  } else if (isDepartingFromAirport) {
    html += `
      <div class="banner">
        <span>Departing from airport at ${minsToTime(threshold)}${dayDisplay} · to ${destination}</span>
      </div>`;
  } else if (intent === 'arrive') {
    html += `
      <div class="banner arrive">
        <span>Arrive by ${minsToTime(threshold)}${dayDisplay} · ${origin} to ${destination}</span>
      </div>`;
  } else if (intent === 'first') {
    html += `
      <div class="banner first">
        <span>First buses${dayDisplay} · ${origin} to ${destination}</span>
      </div>`;
  } else if (intent === 'last') {
    html += `
      <div class="banner last">
        <span>Last buses${dayDisplay} · ${origin} to ${destination}</span>
      </div>`;
  } else {
    html += `
      <div class="banner">
        <span>Leaving after ${minsToTime(threshold)}${dayDisplay} · ${origin} to ${destination}</span>
      </div>`;
  }
  return html;
}
  return html;
}

export function renderEmpty(icon, title, message) {
  return `
    <div class="empty">
      <div class="empty-icon ${icon}"></div>
      <div class="empty-title">${title}</div>
      <div class="empty-text">${message}</div>
    </div>`;
}

export function renderLoading() {
  return `
    <div class="loading">
      <div class="spinner"></div>
      <div class="loading-text">Loading bus timetables...</div>
    </div>`;
}

export function renderSearching() {
  return `
    <div class="loading">
      <div class="spinner"></div>
      <div class="loading-text">Finding the best routes...</div>
    </div>`;
}

export function renderNoResults() {
  return renderEmpty(
    '',
    'No buses found',
    "We couldn't find any buses for that route and time. Try a different time or check if there's a connecting route."
  );
}

export function renderError(message) {
  return renderEmpty(
    'error',
    'Something went wrong',
    `We had trouble loading the bus data. ${message}`
  );
}

export function renderSearchInputError() {
  return renderEmpty(
    '',
    "Couldn't understand that",
    "Try something like: <strong>Cobo to Bridge at 5pm</strong> or <strong>First bus from Town to Vazon</strong>"
  );
}

export function renderSelectFieldsError() {
  return renderEmpty(
    '',
    'Missing information',
    'Please select where you want to go from and to, and what time you need to travel.'
  );
}
