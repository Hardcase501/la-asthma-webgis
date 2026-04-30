let map;
let geojsonLayer;
let useScaledSymbols = true;
let allFeatures = [];
let filteredFeatures = [];
let selectedId = null;
let currentHighlightedRange = null;

const attribute = "CASTHMA_CrudePrev";
const sharedId = "TractFIPS";

const tooltip = {
  el: null
};

function createMap() {
  tooltip.el = document.getElementById("tooltip");

  map = L.map("map", {
    center: [34.05, -118.25],
    zoom: 9
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  getData();
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
  return attValue * 1.2;
}

function getFixedRadius() {
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
    weight: 0.6,
    opacity: 1,
    fillOpacity: 0.65,
    radius: useScaledSymbols ? calcPropRadius(attValue) : getFixedRadius()
  };

  const layer = L.circleMarker(latlng, options);

  layer.bindPopup(buildPopupContent(props), {
    offset: new L.Point(0, -options.radius)
  });

  // Mobile-friendly interaction: click/tap is primary
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
}

function updatePropSymbols() {
  if (!geojsonLayer) return;

  geojsonLayer.eachLayer(function (layer) {
    if (layer.feature && layer.feature.properties[attribute] !== undefined) {
      const props = layer.feature.properties;
      const value = Number(props[attribute]);
      const radius = useScaledSymbols ? calcPropRadius(value) : getFixedRadius();

      layer.setRadius(radius);
      layer.setStyle({
        fillColor: getColor(value),
        color: "#222",
        weight: 0.6,
        fillOpacity: 0.65
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
    svg.attr("viewBox", "0 0 720 420");
    svg.append("text")
      .attr("x", 360)
      .attr("y", 210)
      .attr("text-anchor", "middle")
      .text("No data available for this filter.");
    return;
  }

  const width = 720;
  const height = window.innerWidth <= 768 ? 260 : 420;  const margin = { top: 20, right: 20, bottom: 50, left: 60 };

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
    // Mobile-friendly interaction: click/tap instead of hover dependence
    .on("click", function (event, d) {
      selectedId = null;
      currentHighlightedRange = [d.x0, d.x1];
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
}

function resetHighlight() {
  if (geojsonLayer) {
    geojsonLayer.eachLayer(function (layer) {
      const value = Number(layer.feature.properties[attribute]);
      layer.setStyle({
        fillColor: getColor(value),
        color: "#222",
        weight: 0.6,
        fillOpacity: 0.65
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
  const toggle = document.querySelector("#symbolToggle");
  const filterSelect = document.querySelector("#filterSelect");

  toggle.addEventListener("change", function () {
    useScaledSymbols = this.checked;
    updatePropSymbols();
  });

  filterSelect.addEventListener("change", function () {
    applyFilter(this.value);
  });
}

function showTooltip(content, x, y) {
  if (!tooltip.el) return;

  tooltip.el.innerHTML = content;

  // fallback positions in case pageX/pageY are not available
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

// Register service worker for PWA support
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