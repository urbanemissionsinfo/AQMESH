(function(){

  // ---------- Map setup ----------
  const map = L.map('map', { zoomControl:true }).setView([22.9734, 78.6569], 5);
  
  const lightCarto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  const satelliteEsri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
  });

  const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  const gridLayer = new L.FeatureGroup();
  map.addLayer(gridLayer);

  // Group base layers & overlays for switcher control
  const baseLayers = {
    "Light Minimal": lightCarto,
    "Satellite Imagery": satelliteEsri,
    "Street Map": openStreetMap
  };

  const overlays = {
    "Drawn BBox": drawnItems,
    "Grid Preview": gridLayer
  };

  // Add Layer Control widget safely after layers are created
  L.control.layers(baseLayers, overlays, { position: 'topright' }).addTo(map);

  // Track active base layer to dynamically adjust styles
  let isSatelliteActive = false;

  map.on('baselayerchange', function(e) {
    isSatelliteActive = (e.layer === satelliteEsri);
    const bbox = getBbox();
    if (bbox) {
      drawBboxRectangleFromInputs(bbox);
    }
    if (currentCells) {
      renderGridPreview(currentCells, currentCells.length, 1);
    }
  });

  // ---------- Prominent Draw Button Integration ----------
  const drawRectBtn = document.getElementById('drawRectBtn');

  if (drawRectBtn) {
    drawRectBtn.addEventListener('click', function() {
      for (let id in drawControl._toolbars.draw._modes) {
        if (drawControl._toolbars.draw._modes[id].handler instanceof L.Draw.Rectangle) {
          drawControl._toolbars.draw._modes[id].handler.enable();
          break;
        }
      }
    });
  }

  // Dynamic draw control options based on active layer
  const drawControl = new L.Control.Draw({
    draw: {
      polygon:false, polyline:false, circle:false, circlemarker:false, marker:false,
      rectangle: { 
        shapeOptions: { 
          get color() { return isSatelliteActive ? '#ffcc00' : '#b84c00'; }, 
          weight: 2.5, 
          fillOpacity: 0.1, 
          opacity: 0.9 
        } 
      }
    },
    edit: { featureGroup: drawnItems, remove:false }
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, function(e){
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    const b = e.layer.getBounds();
    setBboxInputs(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
    onBboxChanged();
  });
  map.on(L.Draw.Event.EDITED, function(e){
    e.layers.eachLayer(function(layer){
      const b = layer.getBounds();
      setBboxInputs(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
    });
    onBboxChanged();
  });

  // ---------- Elements ----------
  const swLngEl = document.getElementById('swLng');
  const swLatEl = document.getElementById('swLat');
  const neLngEl = document.getElementById('neLng');
  const neLatEl = document.getElementById('neLat');
  const clearBtn = document.getElementById('clearBbox');
  
  const downloadBboxGeojsonBtn = document.getElementById('downloadBboxGeojson');

  const unitDegBtn = document.getElementById('unitDeg');
  const unitKmBtn  = document.getElementById('unitKm');
  const unitLabel  = document.getElementById('unitLabel');
  const kmNote     = document.getElementById('kmNote');
  const resValueEl = document.getElementById('resValue');

  const statDims = document.getElementById('statDims');
  const statCells = document.getElementById('statCells');
  const statCellSize = document.getElementById('statCellSize');

  const generateBtn = document.getElementById('generateBtn');
  const downloadsEl = document.getElementById('downloads');
  const downloadCsvBtn = document.getElementById('downloadCsv');
  const downloadGeojsonBtn = document.getElementById('downloadGeojson');
  const errorMsg = document.getElementById('errorMsg');
  const topbarStatus = document.getElementById('topbarStatus');

  let resUnit = 'deg';
  let currentCells = null; 

  // ---------- Helpers ----------
  function setBboxInputs(swLng, swLat, neLng, neLat){
    swLngEl.value = swLng.toFixed(2);
    swLatEl.value = swLat.toFixed(2);
    neLngEl.value = neLng.toFixed(2);
    neLatEl.value = neLat.toFixed(2);
  }

  function getBbox(){
    const swLng = parseFloat(swLngEl.value);
    const swLat = parseFloat(swLatEl.value);
    const neLng = parseFloat(neLngEl.value);
    const neLat = parseFloat(neLatEl.value);
    if ([swLng,swLat,neLng,neLat].some(v => Number.isNaN(v))) return null;
    if (neLng <= swLng || neLat <= swLat) return null;
    return { swLng, swLat, neLng, neLat };
  }

  function haversineKm(lat1, lon1, lat2, lon2){
    const R = 6371;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function resolutionInDegrees(bbox){
    const val = parseFloat(resValueEl.value);
    if (!val || val <= 0) return null;
    if (resUnit === 'deg') return { x: val, y: val };
    const centerLat = (bbox.swLat + bbox.neLat) / 2;
    const kmPerDegLat = 110.574;
    const kmPerDegLng = 111.320 * Math.cos(centerLat * Math.PI/180);
    if (kmPerDegLng <= 0) return null;
    return { x: val / kmPerDegLng, y: val / kmPerDegLat };
  }

  function drawBboxRectangleFromInputs(bbox){
    drawnItems.clearLayers();
    const strokeColor = isSatelliteActive ? '#ffcc00' : '#b84c00';
    const rect = L.rectangle(
      [[bbox.swLat, bbox.swLng],[bbox.neLat, bbox.neLng]],
      { color: strokeColor, weight: 2.5, fillOpacity: 0.1, opacity: 0.9 }
    );
    drawnItems.addLayer(rect);
  }

  function showError(msg) {
    if(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    } else {
        errorMsg.style.display = 'none';
        errorMsg.textContent = '';
    }
  }

  function updateStats(){
    showError(false);
    const bbox = getBbox();
    gridLayer.clearLayers();
    downloadsEl.hidden = true;
    currentCells = null;

    if (!bbox){
      statDims.textContent = '—';
      statCells.textContent = '—';
      statCellSize.textContent = '—';
      generateBtn.disabled = true;
      topbarStatus.textContent = 'No bounding box set';
      return;
    }

    topbarStatus.textContent = `BBox: ${bbox.swLng.toFixed(2)}, ${bbox.swLat.toFixed(2)} → ${bbox.neLng.toFixed(2)}, ${bbox.neLat.toFixed(2)}`;

    const resDeg = resolutionInDegrees(bbox);
    if (!resDeg){
      statDims.textContent = '—';
      statCells.textContent = '—';
      statCellSize.textContent = '—';
      generateBtn.disabled = true;
      showError('Enter a resolution greater than 0.');
      return;
    }

    const ncols = Math.round((bbox.neLng - bbox.swLng) / resDeg.x);
    const nrows = Math.round((bbox.neLat - bbox.swLat) / resDeg.y);
    const total = ncols * nrows;

    statDims.textContent = `${ncols} × ${nrows}`;
    statCells.textContent = total.toLocaleString();

    const centerLat = (bbox.swLat + bbox.neLat) / 2;
    const cellWKm = haversineKm(centerLat, 0, centerLat, resDeg.x);
    const cellHKm = haversineKm(0, 0, resDeg.y, 0);
    statCellSize.textContent = resUnit === 'km'
      ? `${parseFloat(resValueEl.value)} km (~${resDeg.x.toFixed(4)}°)`
      : `${resDeg.x.toFixed(4)}° (~${cellWKm.toFixed(1)}km)`;

    if (total > 200000){
      generateBtn.disabled = true;
      showError(`Calculated ${total.toLocaleString()} cells. Increase resolution or shrink bounding box to proceed.`);
      return;
    }

    generateBtn.disabled = false;
  }

  function onBboxChanged(){
    const bbox = getBbox();
    if (bbox){
      drawBboxRectangleFromInputs(bbox);
      map.fitBounds([[bbox.swLat, bbox.swLng],[bbox.neLat, bbox.neLng]], { padding:[20,20] });
    }
    updateStats();
  }

  // ---------- Grid computation ----------
  function computeGrid(bbox, resDeg){
    const ncols = Math.round((bbox.neLng - bbox.swLng) / resDeg.x);
    const nrows = Math.round((bbox.neLat - bbox.swLat) / resDeg.y);
    const cells = [];
    for (let row = 0; row < nrows; row++){
      const cellSwLat = bbox.swLat + row * resDeg.y;
      const cellNeLat = bbox.swLat + (row + 1) * resDeg.y; 
      for (let col = 0; col < ncols; col++){
        const cellSwLng = bbox.swLng + col * resDeg.x;
        const cellNeLng = bbox.swLng + (col + 1) * resDeg.x; 
        const centerLng = (cellSwLng + cellNeLng) / 2;
        const centerLat = (cellSwLat + cellNeLat) / 2;
        const widthKm  = haversineKm(centerLat, cellSwLng, centerLat, cellNeLng);
        const heightKm = haversineKm(cellSwLat, centerLng, cellNeLat, centerLng);
        cells.push({
          ncol: col + 1,
          nrow: row + 1,
          sw_long: cellSwLng, sw_lat: cellSwLat,
          ne_long: cellNeLng, ne_lat: cellNeLat,
          center_long: centerLng, center_lat: centerLat,
          area_km2: widthKm * heightKm
        });
      }
    }
    return { cells, ncols, nrows };
  }

  function renderGridPreview(cells, ncols, nrows){
    gridLayer.clearLayers();
    const total = cells.length;
    if (total > 4000) return;
    
    const strokeColor = isSatelliteActive ? '#00ff66' : '#164D12';
    cells.forEach(c => {
      L.rectangle(
        [[c.sw_lat, c.sw_long],[c.ne_lat, c.ne_long]],
        { color: strokeColor, weight: isSatelliteActive ? 1 : 0.6, opacity: 0.8, fillOpacity: 0.03, interactive:false }
      ).addTo(gridLayer);
    });
  }

  function toCSV(cells){
    const header = ['ncol','nrow','sw_long','sw_lat','ne_long','ne_lat','center_long','center_lat','area_km2'];
    const lines = [header.join(',')];
    cells.forEach(c => {
      lines.push([
        c.ncol, c.nrow,
        c.sw_long.toFixed(6), c.sw_lat.toFixed(6),
        c.ne_long.toFixed(6), c.ne_lat.toFixed(6),
        c.center_long.toFixed(6), c.center_lat.toFixed(6),
        c.area_km2.toFixed(4)
      ].join(','));
    });
    return lines.join('\n');
  }

  function toGeoJSON(cells){
    return {
      type: 'FeatureCollection',
      features: cells.map(c => ({
        type: 'Feature',
        properties: {
          ncol: c.ncol,
          nrow: c.nrow,
          center_long: Number(c.center_long.toFixed(6)),
          center_lat: Number(c.center_lat.toFixed(6)),
          area_km2: Number(c.area_km2.toFixed(4))
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [c.sw_long, c.sw_lat],
            [c.ne_long, c.sw_lat],
            [c.ne_long, c.ne_lat],
            [c.sw_long, c.ne_lat],
            [c.sw_long, c.sw_lat]
          ]]
        }
      }))
    };
  }

  // ---------- KML Export Helper ----------
  function toKML(cells){
    let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kml += '<Document>\n';
    kml += '<name>Grid Cells</name>\n';
    
    cells.forEach(c => {
      kml += '<Placemark>\n';
      kml += `  <name>Cell Col ${c.ncol}, Row ${c.nrow}</name>\n`;
      kml += '  <ExtendedData>\n';
      kml += `    <Data name="ncol"><value>${c.ncol}</value></Data>\n`;
      kml += `    <Data name="nrow"><value>${c.nrow}</value></Data>\n`;
      kml += `    <Data name="center_long"><value>${c.center_long.toFixed(6)}</value></Data>\n`;
      kml += `    <Data name="center_lat"><value>${c.center_lat.toFixed(6)}</value></Data>\n`;
      kml += `    <Data name="area_km2"><value>${c.area_km2.toFixed(4)}</value></Data>\n`;
      kml += '  </ExtendedData>\n';
      kml += '  <Polygon>\n';
      kml += '    <outerBoundaryIs>\n';
      kml += '      <LinearRing>\n';
      kml += '        <coordinates>\n';
      kml += `          ${c.sw_long},${c.sw_lat},0 ${c.ne_long},${c.sw_lat},0 ${c.ne_long},${c.ne_lat},0 ${c.sw_long},${c.ne_lat},0 ${c.sw_long},${c.sw_lat},0\n`;
      kml += '        </coordinates>\n';
      kml += '      </LinearRing>\n';
      kml += '    </outerBoundaryIs>\n';
      kml += '  </Polygon>\n';
      kml += '</Placemark>\n';
    });
    
    kml += '</Document>\n';
    kml += '</kml>';
    return kml;
  }

  function bboxToGeoJSON(bbox) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          description: "User defined bounding box"
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [bbox.swLng, bbox.swLat],
            [bbox.neLng, bbox.swLat],
            [bbox.neLng, bbox.neLat],
            [bbox.swLng, bbox.neLat],
            [bbox.swLng, bbox.swLat]
          ]]
        }
      }]
    };
  }

  function downloadBlob(content, filename, mime){
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- Event wiring ----------
  [swLngEl, swLatEl, neLngEl, neLatEl].forEach(el => {
    el.addEventListener('change', onBboxChanged);
  });

  clearBtn.addEventListener('click', function(){
    swLngEl.value = ''; swLatEl.value = ''; neLngEl.value = ''; neLatEl.value = '';
    drawnItems.clearLayers();
    gridLayer.clearLayers();
    updateStats();
  });

  downloadBboxGeojsonBtn.addEventListener('click', function(){
    const bbox = getBbox();
    if (!bbox) {
      showError('No valid bounding box defined to download.');
      return;
    }
    downloadBlob(JSON.stringify(bboxToGeoJSON(bbox), null, 2), 'bounding_box.geojson', 'application/geo+json');
  });

  const downloadKmlBtn = document.getElementById('downloadKml');

  downloadKmlBtn.addEventListener('click', function(){
    if (!currentCells) return;
    downloadBlob(toKML(currentCells), 'grid.kml', 'application/vnd.google-earth.kml+xml');
  });

  unitDegBtn.addEventListener('click', function(){
    resUnit = 'deg';
    unitDegBtn.classList.add('active');
    unitKmBtn.classList.remove('active');
    unitLabel.textContent = '(degrees)';
    kmNote.hidden = true;
    resValueEl.value = 0.01;
    updateStats();
  });

  unitKmBtn.addEventListener('click', function(){
    resUnit = 'km';
    unitKmBtn.classList.add('active');
    unitDegBtn.classList.remove('active');
    unitLabel.textContent = '(kilometers)';
    kmNote.hidden = false;
    resValueEl.value = 1;
    updateStats();
  });

  resValueEl.addEventListener('input', updateStats);

  generateBtn.addEventListener('click', function(){
    const bbox = getBbox();
    if (!bbox) return;
    const resDeg = resolutionInDegrees(bbox);
    if (!resDeg) return;
    const { cells, ncols, nrows } = computeGrid(bbox, resDeg);
    currentCells = cells;
    renderGridPreview(cells, ncols, nrows);
    downloadsEl.hidden = false;
    
    if(cells.length > 4000) {
      showError(`Grid generated (${cells.length.toLocaleString()} cells). Too dense to preview on map, but files are ready for download.`);
    } else {
      showError(false);
    }
  });

  downloadCsvBtn.addEventListener('click', function(){
    if (!currentCells) return;
    downloadBlob(toCSV(currentCells), 'grid.csv', 'text/csv');
  });

  downloadGeojsonBtn.addEventListener('click', function(){
    if (!currentCells) return;
    downloadBlob(JSON.stringify(toGeoJSON(currentCells), null, 2), 'grid.geojson', 'application/geo+json');
  });

  updateStats();

})();