let charts = {};
let maps = {};
let refreshInterval = null;
const REFRESH_MS = 30000;

// Global filter state
let currentFilters = {
  from: null,
  to: null,
  timeFrom: null,
  timeTo: null,
  days: null,
  preset: null
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initMaps();
  initFilters();
  loadAllData();
  startAutoRefresh();
  
  document.getElementById('refresh-btn').addEventListener('click', () => {
    loadAllData();
  });
});

function initNavigation() {
  const links = document.querySelectorAll('.nav-links a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      showView(view);
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${viewName}-view`).classList.add('active');
}

function initMaps() {
  maps.overview = L.map('overview-map').setView([49.45, -2.55], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(maps.overview);

  maps.delay = L.map('delay-map').setView([49.45, -2.55], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(maps.delay);

  maps.congestion = L.map('congestion-map').setView([49.45, -2.55], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(maps.congestion);
}

function initFilters() {
  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilters.preset = btn.dataset.preset;
      
      // Clear date inputs when preset is selected
      document.getElementById('filter-from').value = '';
      document.getElementById('filter-to').value = '';
      
      updateFilterIndicator();
      loadAllData();
    });
  });
  
  // Apply filters button
  document.getElementById('apply-filters').addEventListener('click', () => {
    currentFilters.from = document.getElementById('filter-from').value || null;
    currentFilters.to = document.getElementById('filter-to').value || null;
    currentFilters.timeFrom = document.getElementById('filter-time-from').value || null;
    currentFilters.timeTo = document.getElementById('filter-time-to').value || null;
    
    // Get selected days
    const selectedDays = Array.from(document.querySelectorAll('.day-checkbox:checked'))
      .map(cb => cb.value)
      .join(',');
    currentFilters.days = selectedDays || null;
    
    // Clear preset when custom filters applied
    currentFilters.preset = null;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    
    updateFilterIndicator();
    loadAllData();
  });
  
  // Reset filters button
  document.getElementById('reset-filters').addEventListener('click', () => {
    currentFilters = { from: null, to: null, timeFrom: null, timeTo: null, days: null, preset: null };
    
    // Clear all inputs
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-time-from').value = '';
    document.getElementById('filter-time-to').value = '';
    document.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    
    updateFilterIndicator();
    loadAllData();
  });

  // Congestion controls
  const thresholdSlider = document.getElementById('congestion-threshold');
  const thresholdValue = document.getElementById('threshold-value');
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', (e) => {
      thresholdValue.textContent = e.target.value;
    });

    document.getElementById('congestion-refresh-btn').addEventListener('click', loadCongestion);
  }
}

function updateFilterIndicator() {
  const indicator = document.getElementById('active-filters');
  const hasFilters = currentFilters.from || currentFilters.to || currentFilters.timeFrom || 
                     currentFilters.timeTo || currentFilters.days || currentFilters.preset;
  
  if (hasFilters) {
    indicator.textContent = '⚡ Filtered';
    indicator.classList.add('active');
  } else {
    indicator.textContent = '';
    indicator.classList.remove('active');
  }
}

function buildQueryString() {
  const params = new URLSearchParams();
  
  if (currentFilters.preset) {
    params.append('preset', currentFilters.preset);
  } else {
    if (currentFilters.from) params.append('from', currentFilters.from);
    if (currentFilters.to) params.append('to', currentFilters.to);
    if (currentFilters.timeFrom) params.append('timeFrom', currentFilters.timeFrom);
    if (currentFilters.timeTo) params.append('timeTo', currentFilters.timeTo);
    if (currentFilters.days) params.append('days', currentFilters.days);
  }
  
  return params.toString() ? '?' + params.toString() : '';
}

function startAutoRefresh() {
  refreshInterval = setInterval(loadAllData, REFRESH_MS);
}

async function loadAllData() {
  try {
    await Promise.all([
      loadMetrics(),
      loadLiveFleet(),
      loadPunctuality(),
      loadOccupancy(),
      loadStops(),
      loadIssues(),
      loadSpeeds(),
      loadCongestion()
    ]);

    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

async function fetchApi(endpoint) {
  const queryString = buildQueryString();
  const response = await fetch(`/api/${endpoint}${queryString}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadMetrics() {
  const data = await fetchApi('metrics');
  
  // Update KPIs with actual data
  document.getElementById('kpi-vehicles').textContent = data.activeVehicles;
  
  const delayElem = document.getElementById('kpi-delay');
  delayElem.textContent = `${data.avgDelay.toFixed(1)} min`;
  delayElem.className = `kpi-value ${data.avgDelay > 5 ? 'delay-late' : data.avgDelay < -2 ? 'delay-early' : 'delay-ontime'}`;
  
  const ontimeElem = document.getElementById('kpi-ontime');
  if (ontimeElem) {
    ontimeElem.textContent = `${data.onTimePercentage.toFixed(0)}%`;
    ontimeElem.className = `kpi-value ${data.onTimePercentage > 80 ? '' : data.onTimePercentage > 60 ? 'delay-ontime' : 'delay-late'}`;
  }
  
  const qualityElem = document.getElementById('kpi-quality');
  qualityElem.textContent = `${data.avgOccupancy.toFixed(0)}%`;
  qualityElem.className = `kpi-value ${data.avgOccupancy > 66 ? 'occupancy-high' : data.avgOccupancy > 33 ? 'occupancy-medium' : 'occupancy-low'}`;
  
  const coverageElem = document.getElementById('kpi-coverage');
  if (coverageElem) {
    coverageElem.textContent = `${data.occupancyCoverage.toFixed(0)}%`;
  }
}

async function loadLiveFleet() {
  const data = await fetchApi('live-fleet');
  
  const tbody = document.querySelector('#fleet-table tbody');
  tbody.innerHTML = data.map(row => `
    <tr>
      <td class="clickable" onclick="showVehicleDetail('${row.Vehicle}')">${row.Vehicle}</td>
      <td class="clickable" onclick="showRouteDetail('${row.Route}')">${row.Route}</td>
      <td>${row.Dir}</td>
      <td>${row.Destination}</td>
      <td>${row.Dep}</td>
      <td>${row['At Stop']}</td>
      <td>${row['Next Stop']}</td>
      <td>${row.Done}/${row.Total} (${row.Pct})</td>
      <td><button onclick="showVehicleDetail('${row.Vehicle}')">Details</button></td>
    </tr>
  `).join('');
  
  const routes = [...new Set(data.map(r => r.Route))].sort();
  const routeFilter = document.getElementById('fleet-route-filter');
  routeFilter.innerHTML = '<option value="">All Routes</option>' + 
    routes.map(r => `<option value="${r}">${r}</option>`).join('');
  
  // Update map
  maps.overview.eachLayer(layer => {
    if (layer instanceof L.Marker) maps.overview.removeLayer(layer);
  });
  
  data.forEach(row => {
    if (row.lat && row.lng) {
      const color = row.Route.startsWith('S') || row.Route.includes('HS') ? '#fbbf24' : '#38bdf8';
      L.circleMarker([row.lat, row.lng], {
        radius: 6,
        fillColor: color,
        color: '#1e293b',
        weight: 2,
        fillOpacity: 0.9
      })
        .bindPopup(`<b>${row.Vehicle}</b><br>Route: ${row.Route}<br>To: ${row['Next Stop']}<br>Progress: ${row.Pct}`)
        .addTo(maps.overview);
    }
  });
}

async function loadPunctuality() {
  const data = await fetchApi('punctuality');
  
  // Update summary KPIs
  if (data.summary) {
    document.getElementById('kpi-ontime') && (document.getElementById('kpi-ontime').textContent = `${data.summary.overall_on_time_pct.toFixed(0)}%`);
  }
  
  // Route delay chart
  if (charts.routeDelay) charts.routeDelay.destroy();
  charts.routeDelay = new Chart(document.getElementById('route-delay-chart'), {
    type: 'bar',
    data: {
      labels: data.byRoute.map(r => r.line_name),
      datasets: [{
        label: 'Avg Delay (min)',
        data: data.byRoute.map(r => r.avg_delay_min),
        backgroundColor: data.byRoute.map(r => {
          if (r.avg_delay_min > 5) return '#f87171';
          if (r.avg_delay_min < 0) return '#4ade80';
          return '#38bdf8';
        })
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const route = data.byRoute[ctx.dataIndex];
              return `On-time: ${route.on_time_pct.toFixed(0)}% (${route.sample_count} samples)`;
            }
          }
        }
      },
      scales: {
        y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      },
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const route = data.byRoute[elements[0].index].line_name;
          showRouteDetail(route);
        }
      }
    }
  });
  
  // Overview punctuality chart
  if (charts.punctuality) charts.punctuality.destroy();
  charts.punctuality = new Chart(document.getElementById('punctuality-chart'), {
    type: 'bar',
    data: {
      labels: data.byRoute.slice(0, 10).map(r => r.line_name),
      datasets: [{
        label: 'Delay (min)',
        data: data.byRoute.slice(0, 10).map(r => r.avg_delay_min),
        backgroundColor: '#38bdf8'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });
  
  // Hour delay chart
  if (charts.hourDelay) charts.hourDelay.destroy();
  charts.hourDelay = new Chart(document.getElementById('hour-delay-chart'), {
    type: 'line',
    data: {
      labels: data.byHour.map(h => `${h.hour}:00`),
      datasets: [{
        label: 'Avg Delay (min)',
        data: data.byHour.map(h => h.avg_delay_min),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { 
          grid: { color: '#334155' }, 
          ticks: { color: '#94a3b8' },
          title: { display: true, text: 'Minutes', color: '#64748b' }
        },
        x: { 
          grid: { color: '#334155' }, 
          ticks: { color: '#94a3b8' },
          title: { display: true, text: 'Hour of Day', color: '#64748b' }
        }
      }
    }
  });
  
  // Variance table
  const tbody = document.querySelector('#variance-table tbody');
  tbody.innerHTML = data.live.slice(0, 20).map(row => {
    const varianceClass = row.VarianceMin > 3 ? 'delay-late' : row.VarianceMin < -2 ? 'delay-early' : 'delay-ontime';
    const varianceText = row.VarianceMin === null ? '—' : row.VarianceMin > 0 ? `+${row.VarianceMin} min late` : `${row.VarianceMin} min early`;
    return `
      <tr>
        <td>${row.Route}</td>
        <td>${row.Vehicle}</td>
        <td class="${varianceClass}">${varianceText}</td>
        <td>${row['Next Stop']}</td>
      </tr>
    `;
  }).join('');
}

async function loadOccupancy() {
  const data = await fetchApi('occupancy');
  
  // Route chart
  if (charts.occupancyRoute) charts.occupancyRoute.destroy();
  charts.occupancyRoute = new Chart(document.getElementById('occupancy-route-chart'), {
    type: 'bar',
    data: {
      labels: data.byRoute.map(r => r.Route),
      datasets: [{
        label: 'Avg Occupancy %',
        data: data.byRoute.map(r => r['Avg Occupancy %']),
        backgroundColor: data.byRoute.map(r => {
          if (r['Avg Occupancy %'] > 66) return '#f87171';
          if (r['Avg Occupancy %'] > 33) return '#fbbf24';
          return '#4ade80';
        })
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { max: 100, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });
  
  // Distribution chart
  const summary = data.summary;
  if (charts.occupancyDist) charts.occupancyDist.destroy();
  charts.occupancyDist = new Chart(document.getElementById('occupancy-dist-chart'), {
    type: 'doughnut',
    data: {
      labels: ['Low (<33%)', 'Medium (33-66%)', 'High (>66%)'],
      datasets: [{
        data: [summary.low_count, summary.medium_count, summary.high_count],
        backgroundColor: ['#4ade80', '#fbbf24', '#f87171']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8' } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = summary.total_with_occupancy;
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return `${ctx.label}: ${ctx.raw} (${pct}%)`;
            }
          }
        }
      }
    }
  });
  
  // Overview occupancy chart
  if (charts.occupancy) charts.occupancy.destroy();
  charts.occupancy = new Chart(document.getElementById('occupancy-chart'), {
    type: 'doughnut',
    data: {
      labels: ['Low', 'Medium', 'High'],
      datasets: [{
        data: [summary.low_count, summary.medium_count, summary.high_count],
        backgroundColor: ['#4ade80', '#fbbf24', '#f87171']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8' } }
      }
    }
  });
  
  // Table
  const tbody = document.querySelector('#occupancy-table tbody');
  tbody.innerHTML = data.byRoute.map(row => `
    <tr>
      <td>${row.Route}</td>
      <td>${row.Samples.toLocaleString()}</td>
      <td class="${row['Avg Occupancy %'] > 66 ? 'occupancy-high' : row['Avg Occupancy %'] > 33 ? 'occupancy-medium' : 'occupancy-low'}">${row['Avg Occupancy %'].toFixed(1)}%</td>
      <td>${row['Peak Occupancy %'].toFixed(1)}%</td>
      <td>${row.Low}</td>
      <td>${row.Medium}</td>
      <td>${row.High}</td>
    </tr>
  `).join('');
}

async function loadSpeeds() {
  const data = await fetchApi('speeds');
  
  // Update speeds KPI if element exists
  const speedElem = document.getElementById('kpi-speed');
  if (speedElem && data.stats) {
    speedElem.textContent = `${data.stats.avg_speed.toFixed(0)} mph`;
  }
  
  // Speed distribution chart
  const speeds = data.speeds.map(s => s.speed_mph);
  const buckets = {
    '0-10': 0, '10-20': 0, '20-30': 0, '30+': 0
  };
  speeds.forEach(s => {
    if (s < 10) buckets['0-10']++;
    else if (s < 20) buckets['10-20']++;
    else if (s < 30) buckets['20-30']++;
    else buckets['30+']++;
  });
  
  if (charts.speedDist) charts.speedDist.destroy();
  charts.speedDist = new Chart(document.getElementById('speed-chart'), {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        label: 'Number of Readings',
        data: Object.values(buckets),
        backgroundColor: '#38bdf8'
      }]
    },
    options: {
      responsive: true,
      plugins: { 
        legend: { display: false },
        title: { display: true, text: `Speed Distribution (Avg: ${data.stats.avg_speed} mph)`, color: '#94a3b8' }
      },
      scales: {
        y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

async function loadStops() {
  const data = await fetchApi('stops');
  
  // Update stops KPI
  const stopsElem = document.getElementById('kpi-stops');
  if (stopsElem) {
    stopsElem.textContent = data.popularity.length;
  }
  
  // Popular stops table
  const popTbody = document.querySelector('#popular-stops-table tbody');
  popTbody.innerHTML = data.popularity.map(row => `
    <tr>
      <td>${row.Stop}</td>
      <td>${row.Observations.toLocaleString()}</td>
      <td>${row['Distinct Vehicles']}</td>
      <td>${row.Routes}</td>
    </tr>
  `).join('');
  
  // Filter handler
  document.getElementById('stop-filter').addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    const rows = popTbody.querySelectorAll('tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(filter) ? '' : 'none';
    });
  });
}

async function loadDwellTimes() {
  const data = await fetchApi('dwell-times');
  const tbody = document.querySelector('#dwell-table tbody');
  tbody.innerHTML = data.map(row => `
    <tr>
      <td>${row.stop_name}</td>
      <td>${row.line_name}</td>
      <td>${row.avg_dwell_seconds.toFixed(1)}s</td>
      <td>${row.max_dwell_seconds.toFixed(1)}s</td>
    </tr>
  `).join('');
}

async function loadIssues() {
  const [bunching, geoDelays, hoppers] = await Promise.all([
    fetchApi('bunching'),
    fetchApi('geo-delays'),
    fetchApi('route-hoppers')
  ]);
  
  // Update bunching KPI
  document.getElementById('kpi-bunching').textContent = bunching.length;
  
  // Bunching table
  const bunchTbody = document.querySelector('#bunching-table tbody');
  bunchTbody.innerHTML = bunching.slice(0, 10).map(row => `
    <tr>
      <td>${row.line_name}</td>
      <td>${row.vehicle_ref}</td>
      <td>${row.prev_vehicle}</td>
      <td class="delay-late">${row.minutes_behind_prev_bus.toFixed(1)} min</td>
    </tr>
  `).join('');
  
  // Geo delays map
  maps.delay.eachLayer(layer => {
    if (layer instanceof L.CircleMarker) maps.delay.removeLayer(layer);
  });
  
  geoDelays.forEach(row => {
    const color = row.avg_delay_min > 10 ? '#ef4444' : row.avg_delay_min > 5 ? '#f97316' : '#eab308';
    L.circleMarker([row.lat_zone, row.lng_zone], {
      radius: Math.min(row.samples / 2, 20),
      fillColor: color,
      color: color,
      fillOpacity: 0.6
    })
    .bindPopup(`<b>${row.avg_delay_min.toFixed(1)} min avg delay</b><br>${row.samples} samples<br>Routes: ${row.routes_affected}`)
    .addTo(maps.delay);
  });
  
  // Hoppers table
  const hopTbody = document.querySelector('#hoppers-table tbody');
  hopTbody.innerHTML = hoppers.slice(0, 15).map(row => `
    <tr>
      <td class="clickable" onclick="showVehicleDetail('${row.vehicle_ref}')">${row.vehicle_ref}</td>
      <td>${row.routes_worked}</td>
      <td>${row.route_count}</td>
      <td>${row.hours_active.toFixed(1)}h</td>
    </tr>
  `).join('');
}

async function loadCongestion() {
  try {
    const refreshBtn = document.getElementById('congestion-refresh-btn');
    const originalText = refreshBtn?.textContent;
    if (refreshBtn) refreshBtn.textContent = 'Loading...';

    const threshold = parseFloat(document.getElementById('congestion-threshold')?.value) || 0.3;
    const window_min = parseInt(document.getElementById('congestion-window')?.value) || 30;
    const baselineWeeks = parseInt(document.getElementById('congestion-baseline')?.value) || 4;

    // Get hour range
    const hourFrom = document.getElementById('congestion-hour-from')?.value;
    const hourTo = document.getElementById('congestion-hour-to')?.value;

    // Get selected days of week
    const selectedDays = Array.from(document.querySelectorAll('.congestion-day-checkbox:checked'))
      .map(cb => cb.value)
      .join(',');

    // Build query string for congestion (independent of global filters)
    const params = new URLSearchParams();
    params.append('threshold', threshold);
    params.append('window', window_min);
    params.append('baselineWeeks', baselineWeeks);

    // Add hour filters if specified
    if (hourFrom !== '') {
      params.append('hourFrom', parseInt(hourFrom));
    }
    if (hourTo !== '') {
      params.append('hourTo', parseInt(hourTo));
    }

    // Add day filters if specified
    if (selectedDays) {
      params.append('days', selectedDays);
    }

    const queryString = params.toString() ? '?' + params.toString() : '';
    const response = await fetch(`/api/congestion${queryString}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Clear previous markers
    maps.congestion.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) {
        maps.congestion.removeLayer(layer);
      }
    });

    // Render hotspots on map (optimized for performance)
    const layer = L.featureGroup();
    data.hotspots.slice(0, 50).forEach(spot => {
      const score = parseFloat(spot.congestion_score) || 0;
      let color;
      if (score > 0.7) {
        color = '#ef4444'; // Red for severe
      } else if (score > 0.4) {
        color = '#f97316'; // Orange for moderate
      } else {
        color = '#eab308'; // Yellow for light
      }

      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: Math.min(spot.vehicle_count * 3 + 5, 25),
        fillColor: color,
        color: color,
        fillOpacity: 0.7,
        weight: 1
      });

      marker.bindPopup(
        `<b>${(score * 100).toFixed(0)}%</b> | ${spot.current_speed_mph.toFixed(1)} mph<br>` +
        `Baseline: ${spot.baseline_speed_mph.toFixed(1)} mph | Vehicles: ${spot.vehicle_count}`
      );

      layer.addLayer(marker);
    });
    layer.addTo(maps.congestion);

    // Update table
    const tbody = document.querySelector('#congestion-table tbody');
    tbody.innerHTML = data.hotspots.slice(0, 20).map(row => `
      <tr>
        <td>${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}</td>
        <td>${row.current_speed_mph.toFixed(1)} mph</td>
        <td>${row.baseline_speed_mph.toFixed(1)} mph</td>
        <td class="${parseFloat(row.congestion_score) > 0.7 ? 'delay-late' : parseFloat(row.congestion_score) > 0.4 ? 'delay-ontime' : ''}">${(parseFloat(row.congestion_score) * 100).toFixed(0)}%</td>
        <td>${row.vehicle_count}</td>
        <td>${row.route_count}</td>
        <td>${row.baseline_samples > 10 ? 'High' : row.baseline_samples > 5 ? 'Medium' : 'Low'}</td>
      </tr>
    `).join('');

    // Update summary stats
    document.getElementById('congestion-total').textContent = data.summary.total_hotspots;
    document.getElementById('congestion-avg-score').textContent = (parseFloat(data.summary.avg_congestion_score) * 100).toFixed(0) + '%';
    document.getElementById('congestion-timestamp').textContent = new Date(data.generated_at).toLocaleTimeString();

    if (refreshBtn) refreshBtn.textContent = originalText || 'Refresh Congestion';
  } catch (err) {
    console.error('Error loading congestion data:', err);
    const tbody = document.querySelector('#congestion-table tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7">Error loading congestion data</td></tr>';
    }
    if (refreshBtn) refreshBtn.textContent = originalText || 'Refresh Congestion';
  }
}

async function showVehicleDetail(vehicleId) {
  const modal = document.getElementById('vehicle-modal');
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');
  
  title.textContent = `Vehicle ${vehicleId}`;
  body.innerHTML = '<p>Loading...</p>';
  modal.classList.add('active');
  
  try {
    const data = await fetchApi(`vehicle/${vehicleId}`);
    
    if (data.length === 0) {
      body.innerHTML = '<p>No data available</p>';
      return;
    }
    
    const latest = data[0];
    const routeHistory = [...new Set(data.map(d => d.line_name).filter(Boolean))];
    
    // Calculate speed from recent positions if available
    let avgSpeed = 'N/A';
    if (data.length >= 2 && data[0].lat && data[1].lat) {
      const dist = calculateDistance(data[1].lat, data[1].lng, data[0].lat, data[0].lng);
      const time = (new Date(data[0].reported) - new Date(data[1].reported)) / 1000 / 60 / 60; // hours
      if (time > 0) {
        avgSpeed = (dist / time).toFixed(1);
      }
    }
    
    body.innerHTML = `
      <div class="vehicle-info">
        <p><strong>Current Route:</strong> ${latest.line_name || 'Unknown'}</p>
        <p><strong>Latest Position:</strong> ${latest.stop_name || 'Unknown'}</p>
        <p><strong>Occupancy:</strong> ${latest.occupancy ? Math.round(latest.occupancy * 100) + '%' : 'N/A'}</p>
        <p><strong>Bearing:</strong> ${latest.bearing ? latest.bearing + '°' : 'N/A'}</p>
        <p><strong>Est. Speed:</strong> ${avgSpeed} mph</p>
        <p><strong>Route History:</strong> ${routeHistory.join(', ') || 'N/A'}</p>
        <p><strong>Total Records:</strong> ${data.length}</p>
      </div>
      <h4>Recent Positions</h4>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Time</th><th>Route</th><th>Stop</th><th>Occupancy</th></tr>
          </thead>
          <tbody>
            ${data.slice(0, 20).map(row => `
              <tr>
                <td>${new Date(row.reported).toLocaleTimeString()}</td>
                <td>${row.line_name || '—'}</td>
                <td>${row.stop_name || '—'}</td>
                <td>${row.occupancy ? Math.round(row.occupancy * 100) + '%' : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<p>Error loading data: ${err.message}</p>`;
  }
}

async function showRouteDetail(routeId) {
  const modal = document.getElementById('vehicle-modal');
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');
  
  title.textContent = `Route ${routeId}`;
  body.innerHTML = '<p>Loading...</p>';
  modal.classList.add('active');
  
  try {
    const data = await fetchApi(`route/${routeId}`);
    
    body.innerHTML = `
      <div class="route-info">
        <p><strong>Active Vehicles:</strong> ${data.fleet.length}</p>
        <p><strong>Avg Occupancy:</strong> ${data.occupancy?.avg_occupancy || 'N/A'}%</p>
        <p><strong>Occupancy Samples:</strong> ${data.occupancy?.samples || 0}</p>
      </div>
      <h4>Active Fleet</h4>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Vehicle</th><th>Time</th><th>Next Stop</th></tr>
          </thead>
          <tbody>
            ${data.fleet.map(row => `
              <tr>
                <td class="clickable" onclick="showVehicleDetail('${row.vehicle_ref}')">${row.vehicle_ref}</td>
                <td>${row.time}</td>
                <td>${row.next_stop}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<p>Error loading data: ${err.message}</p>`;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Event listeners
document.querySelector('.close').addEventListener('click', () => {
  document.getElementById('vehicle-modal').classList.remove('active');
});

document.getElementById('vehicle-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('vehicle-modal')) {
    document.getElementById('vehicle-modal').classList.remove('active');
  }
});

document.getElementById('fleet-filter')?.addEventListener('input', (e) => {
  const filter = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#fleet-table tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
});

document.getElementById('fleet-route-filter')?.addEventListener('change', (e) => {
  const route = e.target.value;
  const rows = document.querySelectorAll('#fleet-table tbody tr');
  rows.forEach(row => {
    if (!route) {
      row.style.display = '';
    } else {
      const rowRoute = row.cells[1]?.textContent;
      row.style.display = rowRoute === route ? '' : 'none';
    }
  });
});

document.querySelector('[data-view="stops"]')?.addEventListener('click', loadDwellTimes);
