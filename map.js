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
    createAndAddWMSLayer: function (config) {
        return new Promise((resolve, reject) => {
            require(["esri/layers/WMSLayer"], function (WMSLayer) {
                console.log(`Creating WMS layer for: ${config.id}`);
                const wmsLayer = new WMSLayer({
                    url: config.url,
                    sublayers: [
                        {
                            name: config.layer,
                        },
                    ],
                    version: config.version,
                    customParameters: {
                        transparent: true,
                        format: "image/png",
                    },
                    opacity: 0.8,
                });

                wmsLayer
                    .load()
                    .then(() => {
                        console.log(
                            `WMS layer ${config.id} loaded successfully`
                        );
                        _map.add(wmsLayer);
                        _wmsLayers.set(config.id, wmsLayer);

                        // Cập nhật UI
                        const button = document.querySelector(
                            `button[data-wms-id="${config.id}"]`
                        );
                        if (button) {
                            button.classList.add("active");
                            button.innerHTML =
                                '<i class="bi bi-eye-slash"></i>';
                        }
                        resolve(wmsLayer);
                    })
                    .catch((error) => {
                        console.error(
                            `Error loading WMS layer ${config.id}:`,
                            error
                        );
                        reject(error);
                    });
            });
        });
    },

    removeWMSLayer: function (wmsId) {
        const wmsLayer = _wmsLayers.get(wmsId);
        if (wmsLayer) {
            _map.remove(wmsLayer);
            _wmsLayers.delete(wmsId);
        }
    },

    loadDefaultWMSLayers: function () {
        console.log("Loading default WMS layers...");
        const defaultLayers = WMS_LAYERS.filter(
            (config) => config.defaultVisible
        ).sort((a, b) => a.zoomPriority - b.zoomPriority);

        console.log("Default layers to load:", defaultLayers);

        if (defaultLayers.length === 0) {
            console.log("No default layers configured");
            return;
        }

        const loadPromises = defaultLayers.map((config) =>
            this.createAndAddWMSLayer(config)
        );

        Promise.all(loadPromises)
            .then(() => {
                console.log("All default layers loaded");
                if (defaultLayers.length > 0) {
                    const highestPriorityLayer = defaultLayers[0];
                    zoomToWMSExtent(
                        highestPriorityLayer.url,
                        highestPriorityLayer.layer.split(":")[1]
                    );
                }
            })
            .catch((error) => {
                console.error("Error loading default layers:", error);
            });
    },

    // Hàm truy vấn thông tin WMS
    getFeatureInfo: function (event, wmsLayer, wmsConfig) {
        console.log("Starting getFeatureInfo");

        return new Promise((resolve, reject) => {
            require(["esri/geometry/support/webMercatorUtils"], (
                webMercatorUtils
            ) => {
                // Lấy thông tin click point
                const screenPoint = event.screenPoint;
                const mapPoint = event.mapPoint;
                const view = _view;

                // Xử lý tọa độ click - chuẩn hóa về WGS84
                let clickPointWGS84;
                if (mapPoint.spatialReference.wkid === 4326) {
                    clickPointWGS84 = mapPoint;
                } else if (
                    mapPoint.spatialReference.wkid === 102100 ||
                    mapPoint.spatialReference.wkid === 3857
                ) {
                    clickPointWGS84 =
                        webMercatorUtils.webMercatorToGeographic(mapPoint);
                    if (!clickPointWGS84) {
                        console.error("Failed to convert click point to WGS84");
                        return;
                    }
                }

                // Xử lý extent cho bbox
                const extent = view.extent;
                let bboxForWMS;
                let targetSRS = "EPSG:4326";

                if (extent.spatialReference.wkid === 4326) {
                    bboxForWMS = extent;
                } else if (
                    extent.spatialReference.wkid === 102100 ||
                    extent.spatialReference.wkid === 3857
                ) {
                    try {
                        bboxForWMS =
                            webMercatorUtils.webMercatorToGeographic(extent);
                        if (!bboxForWMS) {
                            console.error("Failed to convert extent to WGS84");
                            return;
                        }
                    } catch (error) {
                        console.error("Error converting extent:", error);
                        return;
                    }
                }

                // Tính toán tọa độ pixel
                const pixelX = Math.round(screenPoint.x);
                const pixelY = Math.round(screenPoint.y);

                // Tạo URL GetFeatureInfo
                const url = new URL(wmsConfig.url);
                const params = new URLSearchParams({
                    SERVICE: "WMS",
                    VERSION: wmsConfig.version,
                    REQUEST: "GetFeatureInfo",
                    LAYERS: wmsConfig.layer,
                    QUERY_LAYERS: wmsConfig.layer,
                    STYLES: "",
                    BBOX: `${bboxForWMS.xmin},${bboxForWMS.ymin},${bboxForWMS.xmax},${bboxForWMS.ymax}`,
                    WIDTH: view.width,
                    HEIGHT: view.height,
                    FORMAT: "image/png",
                    INFO_FORMAT: "application/json",
                    SRS: targetSRS,
                    X: pixelX,
                    Y: pixelY,
                    TRANSPARENT: "true",
                });

                const getFeatureInfoUrl = `${url.origin}${
                    url.pathname
                }?${params.toString()}`;
                console.log("GetFeatureInfo URL:", getFeatureInfoUrl);

                // Thực hiện request
                const xhr = new XMLHttpRequest();
                xhr.open("GET", getFeatureInfoUrl, true);

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        try {
                            const responseText = xhr.responseText.trim();

                            // Kiểm tra nếu response là XML error
                            if (
                                responseText.startsWith("<?xml") ||
                                responseText.startsWith(
                                    "<ServiceExceptionReport"
                                )
                            ) {
                                const parser = new DOMParser();
                                const xmlDoc = parser.parseFromString(
                                    responseText,
                                    "text/xml"
                                );
                                const serviceException =
                                    xmlDoc.getElementsByTagName(
                                        "ServiceException"
                                    )[0];

                                if (serviceException) {
                                    console.error(
                                        "WMS Error:",
                                        serviceException.textContent
                                    );
                                    resolve({
                                        layerId: wmsConfig.id,
                                        layerName: wmsConfig.name,
                                        data: [],
                                        error: serviceException.textContent,
                                        clickPoint: clickPointWGS84,
                                    });
                                    return;
                                }
                            }

                            // Parse JSON response
                            const response = JSON.parse(responseText);
                            resolve({
                                layerId: wmsConfig.id,
                                layerName: wmsConfig.name,
                                data: response.features || [],
                                clickPoint: clickPointWGS84,
                            });
                        } catch (e) {
                            console.error(
                                "Error parsing GetFeatureInfo response:",
                                e
                            );
                            console.log("Raw response:", xhr.responseText);
                            resolve({
                                layerId: wmsConfig.id,
                                layerName: wmsConfig.name,
                                data: [],
                                error: "Error parsing response",
                                clickPoint: clickPointWGS84,
                            });
                        }
                    } else {
                        console.error(
                            "GetFeatureInfo request failed:",
                            xhr.status,
                            xhr.statusText
                        );
                        resolve({
                            layerId: wmsConfig.id,
                            layerName: wmsConfig.name,
                            data: [],
                            error: `Request failed: ${xhr.status} ${xhr.statusText}`,
                            clickPoint: clickPointWGS84,
                        });
                    }
                };

                xhr.onerror = () => {
                    console.error("Error executing GetFeatureInfo request");
                    resolve({
                        layerId: wmsConfig.id,
                        layerName: wmsConfig.name,
                        data: [],
                        error: "Network error",
                        clickPoint: clickPointWGS84,
                    });
                };

                xhr.send();
            });
        });
    },

    // Hàm lấy kiểu dữ liệu và format cho field
    getFieldFormat: function (key, value) {
        // Kiểm tra nếu là số
        if (typeof value === "number") {
            switch (key) {
                case "dtich":
                    return {
                        digitSeparator: true,
                        places: 2,
                    };
                case "namtr":
                case "captuoi":
                case "matinh":
                case "mahuyen":
                case "maxa":
                    return {
                        digitSeparator: true,
                        places: 0,
                    };
                default:
                    // Cho các số khác
                    return value % 1 === 0
                        ? { digitSeparator: true, places: 0 }
                        : { digitSeparator: true, places: 2 };
            }
        }
        // Trường hợp không phải số thì return null
        return null;
    },

    // Hàm lấy nhãn hiển thị cho thuộc tính
    getPropertyLabel: function (key) {
        const labelMap = {
            tinh: "Tỉnh",
            huyen: "Huyện",
            xa: "Xã",
            tk: "Tiểu khu",
            khoanh: "Khoảnh",
            lo: "Lô",
            dtich: "Diện tích (ha)",
            ldlr: "Loại đất lâm nghiệp",
            mdsd: "Mục đích sử dụng",
            churung: "Chủ rừng",
            pa: "Phương án",
            pkcn_ht: "Phân khu chức năng hiện trạng",
            pkcn_qh: "Phân khu chức năng quy hoạch",
            namtr: "Năm trồng",
            captuoi: "Cấp tuổi",
            ddanh: "Địa danh",
            tobando: "Tờ bản đồ",
            // Thêm các label khác tùy theo data
        };
        return labelMap[key] || this.formatKeyToLabel(key);
    },

    // Hàm format key thành label khi không có trong labelMap
    formatKeyToLabel: function (key) {
        return key
            .split("_")
            .map(
                (word) =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join(" ");
    },

    // Tạo template động cho popup
    createPopupTemplate: function (result) {
        if (!result.data || !result.data[0]) return null;

        const feature = result.data[0];
        const properties = feature.properties;

        // Tạo fieldInfos động từ properties
        const fieldInfos = Object.entries(properties)
            .filter(([key, value]) => {
                // Lọc bỏ các trường không cần hiển thị
                const excludedFields = ["id", "geometry_name", "geom"];
                return (
                    !excludedFields.includes(key) &&
                    value !== null &&
                    value !== ""
                );
            })
            .map(([key, value]) => {
                // Tạo field info cho mỗi property
                const fieldInfo = {
                    fieldName: key,
                    label: this.getPropertyLabel(key),
                    visible: true,
                };

                // Thêm format nếu là số
                const format = this.getFieldFormat(key, value);
                if (format) {
                    fieldInfo.format = format;
                }

                return fieldInfo;
            })
            // Sắp xếp các trường theo thứ tự ưu tiên
            .sort((a, b) => {
                const orderPriority = [
                    "tinh",
                    "huyen",
                    "xa",
                    "tk",
                    "khoanh",
                    "lo",
                    "dtich",
                    "ldlr",
                    "mdsd",
                    "churung",
                    "pa",
                ];
                const aIndex = orderPriority.indexOf(a.fieldName);
                const bIndex = orderPriority.indexOf(b.fieldName);

                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });

        return {
            title: properties.churung || "Thông tin khu vực",
            content: [
                {
                    type: "text",
                    text: `
                        <div class="coordinates-info">
                            <strong>Tọa độ (WGS84):</strong><br>
                            Kinh độ: ${result.clickPoint.longitude.toFixed(
                                6
                            )}<br>
                            Vĩ độ: ${result.clickPoint.latitude.toFixed(6)}
                        </div>
                    `,
                },
                {
                    type: "fields",
                    fieldInfos: fieldInfos,
                },
                {
                    type: "text",
                    text: `
                        <div class="source-info">
                            <small class="text-muted">
                                Thời gian truy vấn: ${new Date().toLocaleString(
                                    "vi-VN"
                                )}
                            </small>
                        </div>
                    `,
                },
            ],
        };
    },

    // Hàm xử lý click và hiển thị popup
    handleMapClick: async function (event) {
        try {
            const highestPriorityLayer = Array.from(_wmsLayers.entries())
                .map(([id, layer]) => ({
                    id,
                    layer,
                    config: WMS_LAYERS.find((c) => c.id === id),
                }))
                .sort(
                    (a, b) => a.config.zoomPriority - b.config.zoomPriority
                )[0];

            if (!highestPriorityLayer) return;

            // Hiển thị loading state
            _view.popup.open({
                location: event.mapPoint,
                content: "Đang tải thông tin...",
            });

            const result = await this.getFeatureInfo(
                event,
                highestPriorityLayer.layer,
                highestPriorityLayer.config
            );

            if (!result.data || result.data.length === 0) {
                _view.popup.content =
                    "Không tìm thấy thông tin tại vị trí này.";
                return;
            }

            // Tạo Graphic cho feature đầu tiên
            require(["esri/Graphic", "esri/PopupTemplate"], (
                Graphic,
                PopupTemplate
            ) => {
                const feature = result.data[0];

                // Tạo graphic từ feature
                const graphic = new Graphic({
                    geometry: {
                        type: "point",
                        longitude: result.clickPoint.longitude,
                        latitude: result.clickPoint.latitude,
                        spatialReference: { wkid: 4326 },
                    },
                    attributes: feature.properties,
                });

                // Tạo và áp dụng template
                const popupTemplate = new PopupTemplate(
                    this.createPopupTemplate(result)
                );
                graphic.popupTemplate = popupTemplate;

                // Hiển thị popup với graphic
                _view.popup.open({
                    location: event.mapPoint,
                    features: [graphic],
                });
            });
        } catch (error) {
            console.error("Error in handleMapClick:", error);
            _view.popup.content = "Có lỗi xảy ra khi truy vấn thông tin.";
        }
    },
};

// Cập nhật hàm toggle WMS layer
window.toggleWMSLayer = function (wmsId, button) {
    const wmsConfig = WMS_LAYERS.find((config) => config.id === wmsId);
    if (!wmsConfig) return;

    button.disabled = true;

    if (_wmsLayers.has(wmsId)) {
        WMSLayerManager.removeWMSLayer(wmsId);
        button.classList.remove("active");
        button.innerHTML = '<i class="bi bi-eye"></i>';
        button.disabled = false;
    } else {
        button.innerHTML = '<i class="bi bi-hourglass-split"></i>';

        WMSLayerManager.createAndAddWMSLayer(wmsConfig)
            .then(() => {
                button.classList.add("active");
                button.innerHTML = '<i class="bi bi-eye-slash"></i>';

                const visibleLayers = Array.from(_wmsLayers.keys())
                    .map((id) => WMS_LAYERS.find((config) => config.id === id))
                    .sort((a, b) => a.zoomPriority - b.zoomPriority);

                if (visibleLayers[0].id === wmsId) {
                    zoomToWMSExtent(
                        wmsConfig.url,
                        wmsConfig.layer.split(":")[1]
                    );
                }
            })
            .catch((error) => {
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
        "esri/geometry/Extent",
    ], function (
        Map,
        SceneView,
        WMSLayer,
        esriConfig,
        Camera,
        BasemapGallery,
        Extent
    ) {
        setupCORS(esriConfig);

        _map = new Map({
            basemap: "dark-gray-vector",
            ground: "world-elevation",
        });

        _view = new SceneView({
            container: containerId,
            map: _map,
            camera: {
                position: {
                    longitude: center[0],
                    latitude: center[1],
                    z: 40000000,
                },
                tilt: 0,
                heading: 0,
            },
            qualityProfile: "high",
        });

        _view.when(() => {
            console.log("View loaded at:", new Date().toISOString());

            // Tạo button và offcanvas cho basemap
            const basemapControl = createControlButton({
                id: "basemap",
                title: "Bản đồ nền",
                icon: "layers",
                offcanvasTitle: "Chọn bản đồ nền",
                buttonClass: "btn-primary",
            });

            // Khởi tạo BasemapGallery trong offcanvas content
            const basemapGallery = new BasemapGallery({
                view: _view,
                container: basemapControl.contentContainer,
            });

            // Tạo button và offcanvas cho WMS
            const wmsControl = createControlButton({
                id: "wms",
                title: "Lớp WMS",
                icon: "map",
                offcanvasTitle: "Lớp bản đồ WMS",
                buttonClass: "btn-success",
            });

            // Khởi tạo danh sách WMS trong offcanvas content
            initializeWMSList(wmsControl.contentContainer);
            WMSLayerManager.loadDefaultWMSLayers();
        });

        _view.watch("updating", function (val) {
            if (!val) {
                console.log("Map loaded completely");
            }
        });

        _view.on("click", (event) => {
            WMSLayerManager.handleMapClick(event);
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
