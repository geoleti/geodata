(() => {
  "use strict";

  const DATA_URLS = {
    airports: "data/sudamerica/aeropuertos_sudamerica.geojson",
    operations: "data/sudamerica/datos_operativos_aeropuertos.csv"
  };

  const TYPE_META = {
    internacional: { label: "Internacional", className: "international", color: "#e85d3f" },
    "doméstico": { label: "Doméstico", className: "domestic", color: "#008f9c" },
    "militar-mixto": { label: "Militar-mixto", className: "mixed", color: "#7957c8" }
  };

  const ALL_TYPES = Object.keys(TYPE_META);
  const NUMBER_FORMAT = new Intl.NumberFormat("es-AR");
  const DECIMAL_FORMAT = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

  const dom = {
    loading: document.getElementById("loadingOverlay"),
    error: document.getElementById("mapError"),
    errorMessage: document.getElementById("mapErrorMessage"),
    retry: document.getElementById("retryButton"),
    search: document.getElementById("searchInput"),
    clearSearch: document.getElementById("clearSearch"),
    country: document.getElementById("countrySelect"),
    cargoOnly: document.getElementById("cargoOnly"),
    operationalOnly: document.getElementById("operationalOnly"),
    typeChips: [...document.querySelectorAll("[data-type]")],
    typeCounts: [...document.querySelectorAll("[data-count-type]")],
    selectAllTypes: document.getElementById("selectAllTypes"),
    resetFilters: document.getElementById("resetFilters"),
    resultList: document.getElementById("resultList"),
    showMore: document.getElementById("showMoreButton"),
    visibleCount: document.getElementById("visibleCount"),
    countryCount: document.getElementById("countryCount"),
    operationalCount: document.getElementById("operationalCount"),
    fitMap: document.getElementById("fitMapButton"),
    fullscreen: document.getElementById("fullscreenButton"),
    mapStage: document.getElementById("mapStage"),
    legend: document.getElementById("mapLegend"),
    legendToggle: document.getElementById("legendToggle"),
    sidebar: document.getElementById("sidebar"),
    mobileFilter: document.getElementById("mobileFilterButton"),
    mobileBackdrop: document.getElementById("mobileBackdrop"),
    detailPanel: document.getElementById("detailPanel"),
    detailContent: document.getElementById("detailContent"),
    detailClose: document.getElementById("detailClose"),
    aboutButton: document.getElementById("aboutButton"),
    aboutDialog: document.getElementById("aboutDialog"),
    aboutClose: document.getElementById("aboutClose")
  };

  const state = {
    map: null,
    cluster: null,
    airports: [],
    filtered: [],
    markers: new Map(),
    operational: new Map(),
    activeTypes: new Set(ALL_TYPES),
    selectedId: null,
    resultsLimit: 18,
    loaded: false
  };

  function initMap() {
    if (!window.L) {
      throw new Error("La biblioteca del mapa no está disponible.");
    }

    const lightLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap &copy; CARTO"
      }
    );

    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    });

    state.map = L.map("map", {
      center: [-18, -60],
      zoom: 4,
      minZoom: 3,
      maxZoom: 18,
      zoomControl: false,
      worldCopyJump: true,
      layers: [lightLayer]
    });

    L.control.zoom({ position: "topleft" }).addTo(state.map);
    L.control.layers(
      { "Mapa claro": lightLayer, OpenStreetMap: osmLayer },
      null,
      { position: "bottomleft", collapsed: true }
    ).addTo(state.map);

    state.cluster = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 30,
      maxClusterRadius: 42,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      animate: true
    });

    state.map.addLayer(state.cluster);
    state.map.on("click", () => closeDetail());
  }

  async function loadData() {
    setLoading(true);
    dom.error.hidden = true;
    dom.errorMessage.textContent = "Comprobá la conexión y volvé a intentar.";

    try {
      const [geoResponse, operationsResponse] = await Promise.all([
        fetch(DATA_URLS.airports, { cache: "no-cache" }),
        fetch(DATA_URLS.operations, { cache: "no-cache" })
      ]);

      if (!geoResponse.ok || !operationsResponse.ok) {
        throw new Error("No se pudieron descargar los archivos de datos.");
      }

      const [geojson, operationsText] = await Promise.all([
        geoResponse.json(),
        operationsResponse.text()
      ]);

      if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
        throw new Error("El archivo geográfico no es un FeatureCollection válido.");
      }

      state.operational = buildOperationalIndex(parseCSV(operationsText));
      state.airports = geojson.features
        .filter(isValidPointFeature)
        .map(normalizeAirportFeature);

      if (!state.airports.length) {
        throw new Error("La capa no contiene puntos válidos.");
      }

      state.markers.clear();
      state.airports.forEach((airport) => {
        state.markers.set(airport.id, createAirportMarker(airport));
      });

      populateCountries();
      renderTypeCounts();
      state.loaded = true;
      applyFilters({ fit: true });
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
      dom.errorMessage.textContent = error.message || "No se pudieron cargar los archivos del mapa.";
      dom.error.hidden = false;
    }
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }

    const headers = rows.shift() || [];
    return rows
      .filter((values) => values.some((value) => value !== ""))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  function buildOperationalIndex(rows) {
    const index = new Map();

    rows.forEach((row) => {
      const normalized = {
        ...row,
        hasData: [
          "pasajeros_totales_anuales",
          "pasajeros_nacionales",
          "pasajeros_internacionales",
          "operaciones_aeronaves_anuales",
          "carga_toneladas_anuales",
          "correo_toneladas_anuales"
        ].some((key) => hasValue(row[key]))
      };

      const iata = String(row.codigo_iata || "").trim().toUpperCase();
      const icao = String(row.codigo_oaci || "").trim().toUpperCase();
      if (iata) index.set(iata, normalized);
      if (icao) index.set(icao, normalized);
    });

    return index;
  }

  function isValidPointFeature(feature) {
    if (feature?.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) return false;
    const [longitude, latitude] = feature.geometry.coordinates;
    return Number.isFinite(Number(longitude)) && Number.isFinite(Number(latitude));
  }

  function normalizeAirportFeature(feature, index) {
    const properties = feature.properties || {};
    const iata = String(properties.codigo_iata || "").trim().toUpperCase();
    const icao = String(properties.codigo_oaci || "").trim().toUpperCase();
    const id = String(feature.id || properties.clave_union || iata || icao || `airport-${index}`);
    const operational = state.operational.get(iata) || state.operational.get(icao) || null;
    const roles = Array.isArray(properties.roles_adicionales) ? properties.roles_adicionales : [];
    const [longitude, latitude] = feature.geometry.coordinates.map(Number);

    return {
      id,
      geometry: { longitude, latitude },
      properties,
      iata,
      icao,
      country: String(properties.pais || "Sin país"),
      name: String(properties.nombre_oficial || "Aeropuerto sin nombre"),
      city: String(properties.ciudad || "Localidad no informada"),
      region: String(properties.provincia_estado_departamento || "No informada"),
      type: TYPE_META[properties.tipo] ? properties.tipo : "doméstico",
      roles,
      hasCargo: roles.includes("carga_relevante"),
      hasOperational: Boolean(operational?.hasData),
      operational,
      searchText: normalizeSearch([
        properties.nombre_oficial,
        properties.ciudad,
        properties.provincia_estado_departamento,
        properties.pais,
        iata,
        icao
      ].filter(Boolean).join(" "))
    };
  }

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .trim();
  }

  function populateCountries() {
    const countries = [...new Set(state.airports.map((airport) => airport.country))]
      .sort((a, b) => a.localeCompare(b, "es"));

    dom.country.replaceChildren(new Option("Todos los países", ""));
    countries.forEach((country) => dom.country.add(new Option(country, country)));
  }

  function renderTypeCounts() {
    const counts = countBy(state.airports, (airport) => airport.type);
    dom.typeCounts.forEach((element) => {
      element.textContent = NUMBER_FORMAT.format(counts[element.dataset.countType] || 0);
    });
  }

  function createAirportMarker(airport) {
    const marker = L.marker([airport.geometry.latitude, airport.geometry.longitude], {
      icon: createAirportIcon(airport),
      title: `${airport.iata || airport.icao} · ${airport.name}`,
      alt: `Aeropuerto ${airport.name}, ${airport.city}, ${airport.country}`,
      keyboard: true,
      riseOnHover: true
    });

    marker.bindTooltip(
      `<strong>${escapeHTML(airport.iata || airport.icao)}</strong><span>${escapeHTML(airport.city)} · ${escapeHTML(airport.country)}</span>`,
      { direction: "top", offset: [0, -8], className: "airport-tooltip" }
    );
    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      selectAirport(airport, { zoom: true });
    });
    return marker;
  }

  function createAirportIcon(airport, selected = false) {
    const size = markerSize(airport.properties.longitud_pista_m);
    const meta = TYPE_META[airport.type];
    const classes = [
      "airport-marker",
      airport.hasCargo ? "has-cargo" : "",
      selected ? "is-selected" : ""
    ].filter(Boolean).join(" ");

    return L.divIcon({
      className: "airport-marker-wrap",
      html: `<span class="${classes}" style="--marker-size:${size}px;--marker-color:${meta.color}"></span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
  }

  function markerSize(runwayLength) {
    const value = Number(runwayLength);
    if (!Number.isFinite(value)) return 12;
    if (value >= 3200) return 18;
    if (value >= 2400) return 16;
    if (value >= 1600) return 14;
    return 12;
  }

  function applyFilters({ fit = false } = {}) {
    if (!state.loaded) return;

    const country = dom.country.value;
    const searchTokens = normalizeSearch(dom.search.value).split(/\s+/).filter(Boolean);
    const cargoOnly = dom.cargoOnly.checked;
    const operationalOnly = dom.operationalOnly.checked;

    state.filtered = state.airports
      .filter((airport) => state.activeTypes.has(airport.type))
      .filter((airport) => !country || airport.country === country)
      .filter((airport) => !cargoOnly || airport.hasCargo)
      .filter((airport) => !operationalOnly || airport.hasOperational)
      .filter((airport) => searchTokens.every((token) => airport.searchText.includes(token)))
      .sort((a, b) => compareAirports(a, b, searchTokens));

    renderMarkers();
    renderResults();
    renderSummary();
    updateFilterControls();

    if (fit) fitFilteredAirports();
  }

  function compareAirports(a, b, searchTokens) {
    if (searchTokens.length) {
      const query = searchTokens.join(" ");
      const score = (airport) => {
        if (airport.iata.toLocaleLowerCase("es") === query || airport.icao.toLocaleLowerCase("es") === query) return 0;
        if (normalizeSearch(airport.name).startsWith(query)) return 1;
        if (normalizeSearch(airport.city).startsWith(query)) return 2;
        return 3;
      };
      const scoreDifference = score(a) - score(b);
      if (scoreDifference) return scoreDifference;
    }
    return a.country.localeCompare(b.country, "es") || a.name.localeCompare(b.name, "es");
  }

  function renderMarkers() {
    state.cluster.clearLayers();
    const markers = state.filtered.map((airport) => state.markers.get(airport.id)).filter(Boolean);
    state.cluster.addLayers(markers);
  }

  function renderResults() {
    dom.resultList.replaceChildren();
    const visibleResults = state.filtered.slice(0, state.resultsLimit);

    if (!visibleResults.length) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent = "No hay aeropuertos que coincidan con los filtros seleccionados.";
      dom.resultList.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      visibleResults.forEach((airport) => fragment.append(createResultItem(airport)));
      dom.resultList.append(fragment);
    }

    dom.showMore.hidden = state.filtered.length <= state.resultsLimit;
    if (!dom.showMore.hidden) {
      dom.showMore.textContent = `Ver más resultados (${NUMBER_FORMAT.format(state.filtered.length - state.resultsLimit)})`;
    }
  }

  function createResultItem(airport) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `result-item${state.selectedId === airport.id ? " is-selected" : ""}`;
    button.dataset.airportId = airport.id;
    button.setAttribute("aria-label", `Ver ${airport.name}, ${airport.city}`);

    const code = document.createElement("span");
    code.className = "result-code";
    code.textContent = airport.iata || airport.icao;

    const copy = document.createElement("span");
    copy.className = "result-copy";
    const name = document.createElement("strong");
    name.textContent = airport.name;
    const location = document.createElement("span");
    location.textContent = `${airport.city} · ${airport.country}`;
    copy.append(name, location);

    const arrow = svgElement('<path d="m9 6 6 6-6 6"/>');
    button.append(code, copy, arrow);
    button.addEventListener("click", () => selectAirport(airport, { zoom: true }));
    return button;
  }

  function renderSummary() {
    dom.visibleCount.textContent = NUMBER_FORMAT.format(state.filtered.length);
    dom.countryCount.textContent = NUMBER_FORMAT.format(new Set(state.filtered.map((airport) => airport.country)).size);
    dom.operationalCount.textContent = NUMBER_FORMAT.format(state.filtered.filter((airport) => airport.hasOperational).length);
  }

  function updateFilterControls() {
    dom.clearSearch.hidden = !dom.search.value;
    dom.typeChips.forEach((chip) => {
      const isActive = state.activeTypes.has(chip.dataset.type);
      chip.classList.toggle("is-active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    });
    dom.selectAllTypes.textContent = state.activeTypes.size === ALL_TYPES.length ? "Todos activos" : "Mostrar todos";
  }

  function fitFilteredAirports() {
    if (!state.map || !state.filtered.length) return;
    const bounds = L.latLngBounds(state.filtered.map((airport) => [airport.geometry.latitude, airport.geometry.longitude]));
    if (!bounds.isValid()) return;

    const rightPadding = dom.detailPanel.classList.contains("is-open") && window.innerWidth > 760 ? 430 : 30;
    state.map.fitBounds(bounds, {
      paddingTopLeft: [30, 30],
      paddingBottomRight: [rightPadding, 40],
      maxZoom: state.filtered.length === 1 ? 10 : 7,
      animate: true
    });
  }

  function selectAirport(airport, { zoom = false } = {}) {
    if (state.selectedId && state.markers.has(state.selectedId)) {
      const previous = state.airports.find((item) => item.id === state.selectedId);
      if (previous) state.markers.get(previous.id).setIcon(createAirportIcon(previous, false));
    }

    state.selectedId = airport.id;
    const marker = state.markers.get(airport.id);
    if (marker) marker.setIcon(createAirportIcon(airport, true));

    renderDetail(airport);
    dom.detailPanel.classList.add("is-open");
    dom.detailPanel.setAttribute("aria-hidden", "false");
    renderResults();
    setSidebarOpen(false);

    if (zoom && state.map) {
      const targetZoom = Math.max(state.map.getZoom(), 8);
      const longitudeOffset = window.innerWidth > 760 ? -0.35 : 0;
      state.map.flyTo([airport.geometry.latitude, airport.geometry.longitude + longitudeOffset], targetZoom, {
        duration: .65
      });
    }
  }

  function closeDetail() {
    if (!state.selectedId) return;
    const previous = state.airports.find((airport) => airport.id === state.selectedId);
    if (previous && state.markers.has(previous.id)) {
      state.markers.get(previous.id).setIcon(createAirportIcon(previous, false));
    }
    state.selectedId = null;
    dom.detailPanel.classList.remove("is-open");
    dom.detailPanel.setAttribute("aria-hidden", "true");
    renderResults();
  }

  function renderDetail(airport) {
    const properties = airport.properties;
    const type = TYPE_META[airport.type];
    const operational = airport.operational;
    const roleBadges = airport.roles.map((role) => {
      const label = role === "carga_relevante"
        ? "Función carguera relevante"
        : role === "función_internacional"
          ? "Función internacional"
          : role === "uso_militar_compartido"
            ? "Uso militar compartido"
            : role.replaceAll("_", " ");
      return `<span class="role-badge${role === "carga_relevante" ? " cargo" : ""}">${escapeHTML(label)}</span>`;
    }).join("");

    const sources = collectSources(airport);
    const operationalSection = airport.hasOperational
      ? renderOperationalMetrics(operational)
      : `<p class="missing-data-note">No se incorporaron cifras operativas anuales verificadas para este aeropuerto. Los campos vacíos no representan cero.</p>`;

    dom.detailContent.innerHTML = `
      <header class="detail-hero">
        <p class="detail-country">${escapeHTML(airport.city)} · ${escapeHTML(airport.country)}</p>
        <h2>${escapeHTML(airport.name)}</h2>
        <div class="detail-codes">
          <span class="code-badge">IATA&nbsp; ${escapeHTML(airport.iata || "—")}</span>
          <span class="code-badge">OACI&nbsp; ${escapeHTML(airport.icao || "—")}</span>
        </div>
      </header>
      <div class="detail-body">
        <div class="detail-tags">
          <span class="type-badge"><span class="legend-dot ${type.className}"></span>${escapeHTML(type.label)}</span>
          ${roleBadges}
        </div>

        <section class="detail-section">
          <h3>Ubicación e infraestructura</h3>
          <div class="fact-grid">
            <div class="fact wide"><span>Provincia / estado / departamento</span><strong>${escapeHTML(airport.region)}</strong></div>
            <div class="fact"><span>Elevación</span><strong>${formatMeasure(properties.elevacion_m, "m s. n. m.")}</strong></div>
            <div class="fact"><span>Pista principal</span><strong>${formatMeasure(properties.longitud_pista_m, "m")}</strong></div>
            <div class="fact"><span>Latitud</span><strong>${formatCoordinate(airport.geometry.latitude)}</strong></div>
            <div class="fact"><span>Longitud</span><strong>${formatCoordinate(airport.geometry.longitude)}</strong></div>
            <div class="fact wide"><span>Entidad operadora</span><strong>${escapeHTML(properties.entidad_operadora || "No verificada en fuente oficial abierta")}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <div class="operational-heading">
            <h3>Actividad operativa</h3>
            ${operational?.anio ? `<span class="data-year">Año ${escapeHTML(operational.anio)}</span>` : ""}
          </div>
          ${operationalSection}
        </section>

        <section class="detail-section">
          <h3>Fuentes y trazabilidad</h3>
          <div class="source-list">${sources.map(renderSourceLink).join("")}</div>
          ${properties.fecha_actualizacion_dato ? `<p class="source-update">Dato geográfico actualizado: ${escapeHTML(formatDate(properties.fecha_actualizacion_dato))}</p>` : ""}
        </section>

        ${properties.observaciones ? `
          <section class="detail-section">
            <details class="technical-details">
              <summary>Notas técnicas del registro</summary>
              <p>${escapeHTML(properties.observaciones)}</p>
            </details>
          </section>` : ""}
      </div>`;

    dom.detailPanel.scrollTop = 0;
  }

  function renderOperationalMetrics(data) {
    const totalPassengers = numericValue(data.pasajeros_totales_anuales);
    const domesticPassengers = numericValue(data.pasajeros_nacionales);
    const internationalPassengers = numericValue(data.pasajeros_internacionales);
    const compositionAvailable = totalPassengers > 0 && domesticPassengers !== null && internationalPassengers !== null;
    const domesticShare = compositionAvailable ? (domesticPassengers / totalPassengers) * 100 : 0;
    const internationalShare = compositionAvailable ? (internationalPassengers / totalPassengers) * 100 : 0;

    return `
      <div class="metric-grid">
        ${metricCard("Pasajeros totales", data.pasajeros_totales_anuales, "personas")}
        ${metricCard("Operaciones", data.operaciones_aeronaves_anuales, "movimientos")}
        ${metricCard("Carga", data.carga_toneladas_anuales, "toneladas", true)}
        ${metricCard("Correo", data.correo_toneladas_anuales, "toneladas", true)}
      </div>
      ${compositionAvailable ? `
        <div class="composition">
          <div class="composition-labels">
            <span>Nacionales ${DECIMAL_FORMAT.format(domesticShare)} %</span>
            <span>Internacionales ${DECIMAL_FORMAT.format(internationalShare)} %</span>
          </div>
          <div class="composition-bar" aria-label="Composición de pasajeros nacionales e internacionales">
            <span style="width:${domesticShare}%"></span>
            <span style="width:${internationalShare}%"></span>
          </div>
        </div>` : ""}`;
  }

  function metricCard(label, rawValue, unit, decimals = false) {
    const value = numericValue(rawValue);
    if (value === null) {
      return `<div class="metric-card"><span>${escapeHTML(label)}</span><strong class="is-missing">Sin dato publicado</strong></div>`;
    }
    return `<div class="metric-card"><span>${escapeHTML(label)}</span><strong>${decimals ? DECIMAL_FORMAT.format(value) : NUMBER_FORMAT.format(value)}</strong><small>${escapeHTML(unit)}</small></div>`;
  }

  function collectSources(airport) {
    const properties = airport.properties;
    const sources = [];
    const addSource = (label, value, category) => {
      const url = extractURL(value);
      if (!url || sources.some((source) => source.url === url)) return;
      sources.push({ label, url, category, domain: safeDomain(url) });
    };

    addSource("Fuente aeronáutica oficial", properties.fuente_oficial, "Oficial");
    addSource("Fuente geográfica complementaria", properties.fuente_secundaria, "Complementaria");
    if (airport.hasOperational) {
      addSource("Fuente de actividad operativa", airport.operational.fuente_dato, "Estadística oficial");
    }
    return sources;
  }

  function renderSourceLink(source) {
    return `
      <a class="source-link" href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">
        <span class="source-icon">${svgString('<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>')}</span>
        <span class="source-copy"><strong>${escapeHTML(source.label)}</strong><span>${escapeHTML(source.category)} · ${escapeHTML(source.domain)}</span></span>
        ${svgString('<path d="m9 6 6 6-6 6"/>')}
      </a>`;
  }

  function extractURL(value) {
    const match = String(value || "").match(/https?:\/\/[^\s,]+/i);
    return match ? match[0].replace(/[.)]+$/, "") : "";
  }

  function safeDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "Fuente externa";
    }
  }

  function formatMeasure(value, unit) {
    const number = numericValue(value);
    return number === null ? "Sin dato" : `${NUMBER_FORMAT.format(number)} ${escapeHTML(unit)}`;
  }

  function formatCoordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(6) : "Sin dato";
  }

  function formatDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(Date.UTC(year, month - 1, day)));
  }

  function numericValue(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function countBy(items, keyFunction) {
    return items.reduce((counts, item) => {
      const key = keyFunction(item);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function resetFilters() {
    dom.search.value = "";
    dom.country.value = "";
    dom.cargoOnly.checked = false;
    dom.operationalOnly.checked = false;
    state.activeTypes = new Set(ALL_TYPES);
    state.resultsLimit = 18;
    closeDetail();
    applyFilters({ fit: true });
  }

  function setSidebarOpen(open) {
    dom.sidebar.classList.toggle("is-open", open);
    dom.mobileFilter.setAttribute("aria-expanded", String(open));
    dom.mobileBackdrop.hidden = !open;
  }

  function setLoading(loading) {
    dom.loading.classList.toggle("is-hidden", !loading);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }

  function escapeAttribute(value) {
    return escapeHTML(value);
  }

  function svgString(content) {
    return `<svg aria-hidden="true" viewBox="0 0 24 24">${content}</svg>`;
  }

  function svgElement(content) {
    const wrapper = document.createElement("span");
    wrapper.innerHTML = svgString(content);
    return wrapper.firstElementChild;
  }

  function bindEvents() {
    let searchTimer;
    dom.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      state.resultsLimit = 18;
      searchTimer = setTimeout(() => applyFilters(), 100);
      dom.clearSearch.hidden = !dom.search.value;
    });

    dom.search.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && state.filtered.length) {
        event.preventDefault();
        selectAirport(state.filtered[0], { zoom: true });
      }
    });

    dom.clearSearch.addEventListener("click", () => {
      dom.search.value = "";
      dom.search.focus();
      state.resultsLimit = 18;
      applyFilters({ fit: true });
    });

    dom.country.addEventListener("change", () => {
      state.resultsLimit = 18;
      closeDetail();
      applyFilters({ fit: true });
    });

    [dom.cargoOnly, dom.operationalOnly].forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        state.resultsLimit = 18;
        closeDetail();
        applyFilters({ fit: true });
      });
    });

    dom.typeChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const type = chip.dataset.type;
        if (state.activeTypes.has(type)) state.activeTypes.delete(type);
        else state.activeTypes.add(type);
        state.resultsLimit = 18;
        closeDetail();
        applyFilters({ fit: true });
      });
    });

    dom.selectAllTypes.addEventListener("click", () => {
      state.activeTypes = new Set(ALL_TYPES);
      applyFilters({ fit: true });
    });

    dom.resetFilters.addEventListener("click", resetFilters);
    dom.showMore.addEventListener("click", () => {
      state.resultsLimit += 18;
      renderResults();
    });
    dom.fitMap.addEventListener("click", fitFilteredAirports);
    dom.retry.addEventListener("click", loadData);
    dom.detailClose.addEventListener("click", closeDetail);

    dom.fullscreen.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await dom.mapStage.requestFullscreen();
        else await document.exitFullscreen();
      } catch (error) {
        console.warn("No se pudo cambiar el modo de pantalla completa.", error);
      }
    });

    document.addEventListener("fullscreenchange", () => {
      window.setTimeout(() => state.map?.invalidateSize(), 120);
    });

    dom.legendToggle.addEventListener("click", () => {
      const collapsed = dom.legend.classList.toggle("is-collapsed");
      dom.legendToggle.setAttribute("aria-expanded", String(!collapsed));
    });

    dom.mobileFilter.addEventListener("click", () => {
      setSidebarOpen(!dom.sidebar.classList.contains("is-open"));
    });
    dom.mobileBackdrop.addEventListener("click", () => setSidebarOpen(false));

    dom.aboutButton.addEventListener("click", () => dom.aboutDialog.showModal());
    dom.aboutClose.addEventListener("click", () => dom.aboutDialog.close());

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      setSidebarOpen(false);
      closeDetail();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) setSidebarOpen(false);
      state.map?.invalidateSize();
    });
  }

  function start() {
    try {
      initMap();
      bindEvents();
      loadData();
    } catch (error) {
      console.error(error);
      setLoading(false);
      dom.errorMessage.textContent = error.message || "No se pudo iniciar el mapa.";
      dom.error.hidden = false;
    }
  }

  start();
})();
