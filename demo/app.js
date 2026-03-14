import { loadData, allStopNames } from './data/loader.js';
import { parseTime, parseDay, detectIntent, populateManualDropdowns } from './search/parse.js';
import { extractStops, getStopVariants } from './utils/stops.js';
import { search } from './search/core.js';
import { renderJourney, renderHeader, renderLoading, renderSearching, renderNoResults, renderError, renderSearchInputError, renderSelectFieldsError } from './ui/render.js';

const FLIGHT_BUFFER = 60;

let timetableData = null;

const askBtn = document.getElementById('askBtn');
const pickBtn = document.getElementById('pickBtn');
const resultsEl = document.getElementById('results');
const queryInput = document.getElementById('query');
const manualOrigin = document.getElementById('manualOrigin');
const manualDest = document.getElementById('manualDest');
const manualTime = document.getElementById('manualTime');
const manualType = document.getElementById('manualType');

export function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === 'tab-' + tab);
  });
}

window.switchTab = switchTab;

export function setQuery(text) {
  queryInput.value = text;
  runQuery();
}

window.setQuery = setQuery;

export function runQuery() {
  const input = queryInput.value.trim();
  if (!input) return;
  if (!timetableData) {
    resultsEl.innerHTML = renderLoading();
    return;
  }
  
  const { origin, destination, originCandidates, destCandidates, isAirportDestination } = extractStops(input);
  const intent = detectIntent(input, isAirportDestination);
  const timeMins = parseTime(input);
  const dayName = parseDay(input);
  
  let threshold = null;
  if (timeMins !== null) {
    if (intent === 'flight' && isAirportDestination) threshold = timeMins - FLIGHT_BUFFER;
    else threshold = timeMins;
  }
  
  const originVariants = origin ? getStopVariants(origin) : [];
  const destVariants = destination ? getStopVariants(destination) : [];
  executeSearch(origin, destination, originVariants, destVariants, threshold, intent, timeMins, isAirportDestination, dayName);
}

window.runQuery = runQuery;

export function runManualQuery() {
  const origin = manualOrigin.value;
  const dest = manualDest.value;
  const timeVal = manualTime.value;
  const type = manualType.value;
  
  if (!origin || !dest || !timeVal) {
    resultsEl.innerHTML = renderSelectFieldsError();
    return;
  }
  
  const timeMins = timeToMins(timeVal);
  
  let intent, threshold;
  if (type === 'flight') {
    intent = 'flight';
    threshold = timeMins - FLIGHT_BUFFER;
  } else if (type === 'arrive') {
    intent = 'general';
    threshold = timeMins;
  } else {
    intent = 'general';
    threshold = timeMins;
  }
  
  const originVariants = getStopVariants(origin);
  const destVariants = getStopVariants(dest);
  executeSearch(origin, dest, originVariants, destVariants, threshold, intent, timeMins, false, null);
}

window.runManualQuery = runManualQuery;

function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function executeSearch(origin, destination, originCandidates, destCandidates, threshold, intent, timeMins, isAirportDestination = false, dayName = null) {
  if (!origin || !destination || threshold === null) {
    resultsEl.innerHTML = renderSearchInputError();
    return;
  }

  let html = renderHeader(intent, origin, destination, threshold, timeMins, isAirportDestination, dayName);
  resultsEl.innerHTML = html + renderSearching();

  setTimeout(() => {
    const journeys = search(originCandidates, destCandidates, threshold, intent, dayName);

    if (!journeys.length) {
      resultsEl.innerHTML = html + renderNoResults();
      return;
    }

    resultsEl.innerHTML = html + journeys.map((j, i) => renderJourney(j, i, dayName)).join('');
  }, 0);
}

function init() {
  askBtn.disabled = true;
  pickBtn.disabled = true;
  resultsEl.innerHTML = renderLoading();

  loadData().then(() => {
    timetableData = true;
    populateManualDropdowns(manualOrigin, manualDest, askBtn, pickBtn);
    askBtn.disabled = false;
    pickBtn.disabled = false;
    resultsEl.innerHTML = '';
  }).catch(err => {
    resultsEl.innerHTML = renderError(err.message);
  });

  queryInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') runQuery();
  });
}

init();
