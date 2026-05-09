let map;
let geojsonLayer;
let freewayLayer;
let useScaledSymbols = true;
let allFeatures = [];
let filteredFeatures = [];
let selectedId = null;
let currentHighlightedRange = null;
let countyLayer;
const attribute = "CASTHMA_CrudePrev";
const sharedId = "TractFIPS";

const tooltip = {
  el: null
};

// Caltrans State Highway Network Lines ArcGIS REST service
const freewayServiceUrl =
  "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/SHN_Lines/FeatureServer/0/query";

function createMap() {
  tooltip.el = document.getElementById("tooltip");

  map = L.map("map", {
    center: [34.05, -118.25],
    zoom: 9
  });

  // Cleaner, lighter basemap so asthma symbols and freeways stand out
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(map);

  getData();
  addFreewayLayer();
  addCountyBoundary();
}

function addCountyBoundary() {
  fetch("data/la_county.geojson")
    .then(res => res.json())
    .then(data => {
      countyLayer = L.geoJson(data, {
        style: {
          color: "#2b6cb0",
          weight: 1.5,
          fill: false,
          opacity: 0.9
        }
      }).addTo(map);

      countyLayer.bringToFront();
    })
    .catch(err => console.error("County boundary error:", err));
}

function getAttributeLabel() {
  return "Adult Asthma Prevalence (%)";
}

function formatValue(value) {
  return Number(value).toFixed(1) + "%";
}

function getColor(value) {
  if (value > 10) return "#800026";
  if (value > 8) return "#FC4E2A";
  return "#FEB24C";
}

function calcPropRadius(attValue) {
  if (attValue > 10) return 12;
  if (attValue > 8) return 8;
  return 5;
}

function buildPopupContent(props) {
  let popupContent = `<p><b>Tract FIPS:</b> ${props[sharedId]}</p>`;
  popupContent += `<p><b>${getAttributeLabel()}:</b> ${formatValue(props[attribute])}</p>`;

  if (props.CountyName) {
    popupContent += `<p><b>County:</b> ${props.CountyName}</p>`;
  }

  return popupContent;
}

function pointToLayer(feature, latlng) {
  const props = feature.properties;
  const attValue = Number(props[attribute]);

  const options = {
    fillColor: getColor(attValue),
    color: "#222",
    weight: 0.7,
    opacity: 1,
    fillOpacity: 0.68,
    radius: calcPropRadius(attValue)  };

  const layer = L.circleMarker(latlng, options);

  layer.bindPopup(buildPopupContent(props), {
    offset: new L.Point(0, -options.radius)
  });

  layer.on({
    click: function () {
      selectedId = props[sharedId];
      currentHighlightedRange = null;
      highlightById(selectedId);
      layer.openPopup();
      hideTooltip();
    }
  });

  return layer;
}

function drawMap(features) {
  if (geojsonLayer) {
    map.removeLayer(geojsonLayer);
  }

  geojsonLayer = L.geoJson(
    {
      type: "FeatureCollection",
      features: features
    },
    {
      pointToLayer: function (feature, latlng) {
        return pointToLayer(feature, latlng);
      }
    }
  ).addTo(map);

  // Keep freeway layer visually above basemap but below selected point interaction
  if (freewayLayer && map.hasLayer(freewayLayer)) {
    freewayLayer.bringToFront();
  }
}

function updatePropSymbols() {
  if (!geojsonLayer) return;

  geojsonLayer.eachLayer(function (layer) {
    if (layer.feature && layer.feature.properties[attribute] !== undefined) {
      const props = layer.feature.properties;
      const value = Number(props[attribute]);
      const radius = calcPropRadius(value);
      layer.setRadius(radius);
      layer.setStyle({
        fillColor: getColor(value),
        color: "#222",
        weight: 0.7,
        fillOpacity: 0.68
      });

      if (layer.getPopup()) {
        layer.getPopup().setContent(buildPopupContent(props)).update();
      }
    }
  });

  if (selectedId) {
    highlightById(selectedId);
  } else if (currentHighlightedRange) {
    highlightMapByRange(currentHighlightedRange[0], currentHighlightedRange[1]);
  }
}

function drawChart(features) {
  const values = features.map(function (feature) {
    return Number(feature.properties[attribute]);
  });

  const svg = d3.select("#chart");
  svg.selectAll("*").remove();

  if (values.length === 0) {
    svg.attr("viewBox", "0 0 720 260");
    svg.append("text")
      .attr("x", 360)
      .attr("y", 130)
      .attr("text-anchor", "middle")
      .text("No data available for this filter.");
    return;
  }

  const width = 720;
  const height = window.innerWidth <= 768 ? 260 : 420;
  const margin = { top: 20, right: 20, bottom: 50, left: 60 };

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("preserveAspectRatio", "xMinYMin meet");

  const x = d3.scaleLinear()
    .domain(d3.extent(values))
    .nice()
    .range([margin.left, width - margin.right]);

  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(10)(values);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, function (d) { return d.length; })])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .text("Adult Asthma Prevalence (%)");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .text("Number of Tracts");

  svg.selectAll(".hist-bar")
    .data(bins)
    .enter()
    .append("rect")
    .attr("class", "bar hist-bar")
    .attr("x", function (d) { return x(d.x0) + 1; })
    .attr("y", function (d) { return y(d.length); })
    .attr("width", function (d) {
      return Math.max(0, x(d.x1) - x(d.x0) - 2);
    })
    .attr("height", function (d) {
      return y(0) - y(d.length);
    })
    .on("click", function (event, d) {
      const clickedRange = [d.x0, d.x1];

      if (
        currentHighlightedRange &&
        currentHighlightedRange[0] === clickedRange[0] &&
        currentHighlightedRange[1] === clickedRange[1]
      ) {
        currentHighlightedRange = null;
        selectedId = null;
        resetHighlight();
        hideTooltip();
        return;
      }

      selectedId = null;
      currentHighlightedRange = clickedRange;
      highlightHistogramBin(this);
      highlightMapByRange(d.x0, d.x1);

      showTooltip(
        `<p><b>Range:</b> ${d.x0.toFixed(1)}% - ${d.x1.toFixed(1)}%</p>
         <p><b>Tracts:</b> ${d.length}</p>`,
        event.pageX,
        event.pageY
      );
    });
}

function addFreewayLayer() {
  const queryUrl =
    freewayServiceUrl +
    "?where=County%20%3D%20%27LA%27" +
    "&outFields=Route,County" +
    "&returnGeometry=true" +
    "&f=geojson";

  fetch(queryUrl)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      freewayLayer = L.geoJson(data, {
        style: function () {
          return {
            color: "#1f1f1f",
            weight: 2.2,
            opacity: 0.85
          };
        },
        onEachFeature: function (feature, layer) {
          const route = feature.properties.Route || "Unknown";
          layer.bindPopup(`<p><b>Caltrans Route:</b> ${route}</p>`);
        }
      });

      const freewayToggle = document.querySelector("#freewayToggle");

      if (freewayToggle && freewayToggle.checked) {
        freewayLayer.addTo(map);
        freewayLayer.bringToFront();
      }
    })
    .catch(function (error) {
      console.error("Error loading freeway layer:", error);
    });
}

function highlightHistogramBin(element) {
  d3.selectAll(".hist-bar").classed("active", false);
  d3.select(element).classed("active", true);
}

function highlightById(id) {
  resetHighlight();

  if (!geojsonLayer) return;

  geojsonLayer.eachLayer(function (layer) {
    if (layer.feature.properties[sharedId] === id) {
      layer.setStyle({
        color: "#000",
        weight: 2,
        fillOpacity: 0.95
      });

      if (layer.bringToFront) {
        layer.bringToFront();
      }
    }
  });

  if (freewayLayer && map.hasLayer(freewayLayer)) {
    freewayLayer.bringToFront();
  }
}

function highlightMapByRange(minValue, maxValue) {
  resetHighlight();

  if (!geojsonLayer) return;

  geojsonLayer.eachLayer(function (layer) {
    const value = Number(layer.feature.properties[attribute]);

    if (value >= minValue && value < maxValue) {
      layer.setStyle({
        color: "#000",
        weight: 1.5,
        fillOpacity: 0.95
      });

      if (layer.bringToFront) {
        layer.bringToFront();
      }
    }
  });

  if (freewayLayer && map.hasLayer(freewayLayer)) {
    freewayLayer.bringToFront();
  }
}

function resetHighlight() {
  if (geojsonLayer) {
    geojsonLayer.eachLayer(function (layer) {
      const value = Number(layer.feature.properties[attribute]);
      layer.setStyle({
        fillColor: getColor(value),
        color: "#222",
        weight: 0.7,
        fillOpacity: 0.68
      });
    });
  }

  d3.selectAll(".bar").classed("active", false);
}

function applyFilter(filterValue) {
  filteredFeatures = allFeatures.filter(function (feature) {
    const value = Number(feature.properties[attribute]);

    if (filterValue === "low") return value < 8;
    if (filterValue === "medium") return value >= 8 && value <= 10;
    if (filterValue === "high") return value > 10;
    return true;
  });

  selectedId = null;
  currentHighlightedRange = null;
  hideTooltip();

  drawMap(filteredFeatures);
  drawChart(filteredFeatures);
}

function createUIControls() {
  const filterSelect = document.querySelector("#filterSelect");
  const freewayToggle = document.querySelector("#freewayToggle");

  filterSelect.addEventListener("change", function () {
    applyFilter(this.value);
  });

  freewayToggle.addEventListener("change", function () {
    if (!freewayLayer) return;

    if (this.checked) {
      freewayLayer.addTo(map);
      freewayLayer.bringToFront();
    } else {
      map.removeLayer(freewayLayer);
    }
  });
}

function showTooltip(content, x, y) {
  if (!tooltip.el) return;

  tooltip.el.innerHTML = content;

  const left = typeof x === "number" ? x + 12 : 20;
  const top = typeof y === "number" ? y + 12 : 20;

  tooltip.el.style.left = left + "px";
  tooltip.el.style.top = top + "px";
  tooltip.el.classList.remove("hidden");
}

function hideTooltip() {
  if (tooltip.el) {
    tooltip.el.classList.add("hidden");
  }
}

function getData() {
  fetch("data/asthma_2024.geojson")
    .then(function (response) {
      return response.json();
    })
    .then(function (json) {
      allFeatures = json.features.filter(function (feature) {
        return feature.properties[attribute] !== null &&
               feature.properties[attribute] !== undefined &&
               !isNaN(Number(feature.properties[attribute]));
      });

      filteredFeatures = allFeatures.slice();

      drawMap(filteredFeatures);
      drawChart(filteredFeatures);
      createUIControls();
    })
    .catch(function (error) {
      console.error("Error loading GeoJSON:", error);
    });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.js")
      .then(function () {
        console.log("Service Worker Registered");
      })
      .catch(function (error) {
        console.error("Service Worker registration failed:", error);
      });
  });
}

document.addEventListener("DOMContentLoaded", createMap);