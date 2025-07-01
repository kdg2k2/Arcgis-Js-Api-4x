// Khởi tạo các biến module-level
let _view, _map;
let _wmsLayers = new Map(); // key: wmsId, value: WMSLayer
let _mapControlsContainer; // Container cho các button điều khiển

// Cấu hình WMS Layers với thuộc tính defaultVisible để xác định các layer hiển thị mặc định
const WMS_LAYERS = [
    {
        id: "wms_1",
        name: "Ranh giới tỉnh",
        url: "https://bando.ifee.edu.vn:8453/geoserver/ws_ranhgioi/wms",
        layer: "ws_ranhgioi:rg_vn_tinh",
        version: "1.1.1",
        defaultVisible: true,
        zoomPriority: 2,
    },
    {
        id: "wms_2",
        name: "Bản đồ hiện trạng rừng Cúc Phương",
        url: "https://maps-150.ifee.edu.vn:8453/geoserver/ws_6VQG/wms",
        layer: "ws_6VQG:htr_cucphuong",
        version: "1.1.1",
        defaultVisible: true,
        zoomPriority: 1,
    },
];

// Module-level function để xử lý WMS layers
const WMSLayerManager = {
    createAndAddWMSLayer: function(config) {
        return new Promise((resolve, reject) => {
            require(["esri/layers/WMSLayer"], function(WMSLayer) {
                console.log(`Creating WMS layer for: ${config.id}`);
                const wmsLayer = new WMSLayer({
                    url: config.url,
                    sublayers: [{
                        name: config.layer
                    }],
                    version: config.version,
                    customParameters: {
                        transparent: true,
                        format: "image/png"
                    },
                    opacity: 0.8
                });

                wmsLayer.load().then(() => {
                    console.log(`WMS layer ${config.id} loaded successfully`);
                    _map.add(wmsLayer);
                    _wmsLayers.set(config.id, wmsLayer);
                    
                    // Cập nhật UI
                    const button = document.querySelector(`button[data-wms-id="${config.id}"]`);
                    if (button) {
                        button.classList.add('active');
                        button.innerHTML = '<i class="bi bi-eye-slash"></i>';
                    }
                    resolve(wmsLayer);
                }).catch(error => {
                    console.error(`Error loading WMS layer ${config.id}:`, error);
                    reject(error);
                });
            });
        });
    },

    removeWMSLayer: function(wmsId) {
        const wmsLayer = _wmsLayers.get(wmsId);
        if (wmsLayer) {
            _map.remove(wmsLayer);
            _wmsLayers.delete(wmsId);
        }
    },

    loadDefaultWMSLayers: function() {
        console.log("Loading default WMS layers...");
        const defaultLayers = WMS_LAYERS
            .filter(config => config.defaultVisible)
            .sort((a, b) => a.zoomPriority - b.zoomPriority);

        console.log("Default layers to load:", defaultLayers);

        if (defaultLayers.length === 0) {
            console.log("No default layers configured");
            return;
        }

        const loadPromises = defaultLayers.map(config => this.createAndAddWMSLayer(config));

        Promise.all(loadPromises)
            .then(() => {
                console.log("All default layers loaded");
                if (defaultLayers.length > 0) {
                    const highestPriorityLayer = defaultLayers[0];
                    zoomToWMSExtent(highestPriorityLayer.url, highestPriorityLayer.layer.split(':')[1]);
                }
            })
            .catch(error => {
                console.error("Error loading default layers:", error);
            });
    }
};

// Cập nhật hàm toggle WMS layer
window.toggleWMSLayer = function(wmsId, button) {
    const wmsConfig = WMS_LAYERS.find(config => config.id === wmsId);
    if (!wmsConfig) return;

    button.disabled = true;

    if (_wmsLayers.has(wmsId)) {
        WMSLayerManager.removeWMSLayer(wmsId);
        button.classList.remove('active');
        button.innerHTML = '<i class="bi bi-eye"></i>';
        button.disabled = false;
    } else {
        button.innerHTML = '<i class="bi bi-hourglass-split"></i>';
        
        WMSLayerManager.createAndAddWMSLayer(wmsConfig)
            .then(() => {
                button.classList.add('active');
                button.innerHTML = '<i class="bi bi-eye-slash"></i>';
                
                const visibleLayers = Array.from(_wmsLayers.keys())
                    .map(id => WMS_LAYERS.find(config => config.id === id))
                    .sort((a, b) => a.zoomPriority - b.zoomPriority);
                
                if (visibleLayers[0].id === wmsId) {
                    zoomToWMSExtent(wmsConfig.url, wmsConfig.layer.split(':')[1]);
                }
            })
            .catch(error => {
                console.error("Error toggling WMS layer:", error);
                button.innerHTML = '<i class="bi bi-eye"></i>';
            })
            .finally(() => {
                button.disabled = false;
            });
    }
};

// Cập nhật hàm initMap3D
function initMap3D(containerId, center = [105.85, 21.0245], targetZoom = 12) {
    require([
        "esri/Map",
        "esri/views/SceneView",
        "esri/layers/WMSLayer",
        "esri/config",
        "esri/Camera",
        "esri/widgets/BasemapGallery",
        "esri/geometry/Extent"
    ], function(Map, SceneView, WMSLayer, esriConfig, Camera, BasemapGallery, Extent) {
        setupCORS(esriConfig);
        
        _map = new Map({
            basemap: "dark-gray-vector",
            ground: "world-elevation"
        });

        _view = new SceneView({
            container: containerId,
            map: _map,
            camera: {
                position: {
                    longitude: center[0],
                    latitude: center[1],
                    z: 40000000
                },
                tilt: 0,
                heading: 0
            },
            qualityProfile: "high"
        });

        _view.when(() => {
            console.log("View loaded at:", new Date().toISOString());
            
            // Tạo button và offcanvas cho basemap
            const basemapControl = createControlButton({
                id: 'basemap',
                title: 'Bản đồ nền',
                icon: 'layers',
                offcanvasTitle: 'Chọn bản đồ nền',
                buttonClass: 'btn-primary'
            });

            // Khởi tạo BasemapGallery trong offcanvas content
            const basemapGallery = new BasemapGallery({
                view: _view,
                container: basemapControl.contentContainer
            });

            // Tạo button và offcanvas cho WMS
            const wmsControl = createControlButton({
                id: 'wms',
                title: 'Lớp WMS',
                icon: 'map',
                offcanvasTitle: 'Lớp bản đồ WMS',
                buttonClass: 'btn-success'
            });

            // Khởi tạo danh sách WMS trong offcanvas content
            initializeWMSList(wmsControl.contentContainer);
            WMSLayerManager.loadDefaultWMSLayers();
        });

        _view.watch("updating", function(val) {
            if (!val) {
                console.log("Map loaded completely");
            }
        });
    });
}

// Hàm tạo container cho các button điều khiển
function createMapControlsContainer() {
    if (_mapControlsContainer) return _mapControlsContainer;

    _mapControlsContainer = document.createElement("div");
    _mapControlsContainer.className = "map-controls-container";
    _mapControlsContainer.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        z-index: 99;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: rgba(255, 255, 255, 0.9);
        padding: 10px;
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    `;

    document.querySelector("#mapDiv").appendChild(_mapControlsContainer);
    return _mapControlsContainer;
}

// Hàm tạo button và offcanvas
function createControlButton({
    id,
    title,
    icon,
    offcanvasTitle,
    offcanvasContent,
    buttonClass = "btn-primary",
}) {
    // Tạo container nếu chưa có
    const container = createMapControlsContainer();

    // Tạo button
    const button = document.createElement("button");
    button.className = `btn ${buttonClass}`;
    button.setAttribute("type", "button");
    button.setAttribute("data-bs-toggle", "offcanvas");
    button.setAttribute("data-bs-target", `#${id}Offcanvas`);
    button.innerHTML = `<i class="bi bi-${icon}"></i> ${title}`;
    container.appendChild(button);

    // Tạo offcanvas
    const offcanvas = document.createElement("div");
    offcanvas.className = "offcanvas offcanvas-end";
    offcanvas.id = `${id}Offcanvas`;
    offcanvas.innerHTML = `
        <div class="offcanvas-header">
            <h5 class="offcanvas-title">${offcanvasTitle}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button>
        </div>
        <div class="offcanvas-body" id="${id}Content">
            ${offcanvasContent || ""}
        </div>
    `;
    document.body.appendChild(offcanvas);

    return {
        button,
        offcanvas,
        contentContainer: offcanvas.querySelector(`#${id}Content`),
    };
}

function setupCORS(esriConfig) {
    if (esriConfig.request) {
        if (!esriConfig.request.corsEnabledServers) {
            esriConfig.request.corsEnabledServers = [];
        }
        // Thêm tất cả các server cần thiết
        esriConfig.request.corsEnabledServers.push(
            "bando.ifee.edu.vn",
            "maps-150.ifee.edu.vn"
        );
    }
}

function zoomToWMSExtent(wmsUrl, layerName) {
    console.log("Starting zoomToWMSExtent with:", { wmsUrl, layerName });
    const capsURL = `${wmsUrl}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`;

    fetch(capsURL)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then((text) => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");
            const layers = xmlDoc.getElementsByTagName("Layer");

            console.log("Found layers:", layers.length);

            for (let layer of layers) {
                const nameElement = layer.getElementsByTagName("Name")[0];
                if (nameElement) {
                    const layerFullName = nameElement.textContent;
                    console.log("Checking layer:", {
                        layerFullName,
                        searchingFor: layerName,
                        matches: layerFullName.includes(layerName),
                    });

                    if (layerFullName.includes(layerName)) {
                        const bboxElement =
                            layer.getElementsByTagName("BoundingBox")[0];
                        if (bboxElement) {
                            console.log(
                                "Found matching layer with BoundingBox:",
                                {
                                    minx: bboxElement.getAttribute("minx"),
                                    miny: bboxElement.getAttribute("miny"),
                                    maxx: bboxElement.getAttribute("maxx"),
                                    maxy: bboxElement.getAttribute("maxy"),
                                }
                            );

                            require(["esri/geometry/Extent"], function (
                                Extent
                            ) {
                                const extent = new Extent({
                                    xmin: parseFloat(
                                        bboxElement.getAttribute("minx")
                                    ),
                                    ymin: parseFloat(
                                        bboxElement.getAttribute("miny")
                                    ),
                                    xmax: parseFloat(
                                        bboxElement.getAttribute("maxx")
                                    ),
                                    ymax: parseFloat(
                                        bboxElement.getAttribute("maxy")
                                    ),
                                    spatialReference: { wkid: 4326 },
                                });

                                console.log("Created extent:", extent);

                                _view
                                    .goTo(
                                        {
                                            target: extent.expand(1.2),
                                            tilt: 45,
                                            heading: 0,
                                            position: {
                                                z: 800000,
                                            },
                                        },
                                        {
                                            duration: 3000,
                                            easing: "out-quad",
                                        }
                                    )
                                    .then(() => {
                                        console.log(
                                            "Zoom completed successfully"
                                        );
                                    })
                                    .catch((error) => {
                                        console.error("Zoom failed:", error);
                                    });
                            });
                            return;
                        } else {
                            console.log(
                                "No BoundingBox found for matching layer"
                            );
                        }
                    }
                }
            }
            console.log("No matching layer found");
        })
        .catch((error) =>
            console.error("Error getting WMS capabilities:", error)
        );
}

function initializeWMSList(container = document.getElementById("wmsListDiv")) {
    if (!container) return;

    container.innerHTML = "";
    const wmsListElement = document.createElement("ul");
    wmsListElement.className = "wms-list";
    wmsListElement.style.cssText = `
        list-style: none;
        padding: 0;
        margin: 0;
    `;

    WMS_LAYERS.forEach((wmsConfig) => {
        const listItem = document.createElement("li");
        listItem.className = "wms-item";
        listItem.style.cssText = `
            padding: 10px;
            border-bottom: 1px solid #dee2e6;
            margin-bottom: 5px;
        `;

        listItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>${wmsConfig.name}</span>
                <button class="btn btn-sm btn-outline-primary toggle-wms" 
                        data-wms-id="${wmsConfig.id}"
                        onclick="toggleWMSLayer('${wmsConfig.id}', this)">
                    <i class="bi bi-eye"></i>
                </button>
            </div>
        `;
        wmsListElement.appendChild(listItem);
    });

    container.appendChild(wmsListElement);
}

window.initMap3D = initMap3D;
