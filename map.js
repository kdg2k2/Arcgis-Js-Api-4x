// Khởi tạo các biến module-level
let _view, _map;
let _wmsLayers = new Map();

// Cấu hình WMS Layers với thuộc tính defaultVisible để xác định các layer hiển thị mặc định
const WMS_LAYERS = [
    {
        id: "wms_1",
        name: "Ranh giới tỉnh",
        url: "https://bando.ifee.edu.vn:8453/geoserver/ws_ranhgioi/wms",
        layer: "ws_ranhgioi:rg_vn_tinh",
        version: "1.1.1",
        defaultVisible: true,
        zoomPriority: 10,
    },
    {
        id: "wms_2",
        name: "Bản đồ hiện trạng rừng Cúc Phương",
        url: "https://maps-150.ifee.edu.vn:8453/geoserver/ws_6VQG/wms",
        layer: "ws_6VQG:htr_cucphuong",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 9,
    },
    {
        id: "wms_3",
        name: "Bản đồ hiện trạng rừng Nghệ An",
        url: "https://maps-151.ifee.edu.vn:8453/geoserver/NgheAnPfes/wms",
        layer: "NgheAnPfes:htr",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 8,
    },
    {
        id: "wms_4",
        name: "Bản đồ EUDR 2025",
        url: "https://maps-150.ifee.edu.vn:8453/geoserver/_2025_EUDR/wms",
        layer: "_2025_EUDR:gardens",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 8,
    },
];

// Module-level function để xử lý WMS layers
const WMSLayerManager = {
    setupCORS(esriConfig) {
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
    },

    zoomToWMSExtent(wmsUrl, layerName) {
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

                                    setTimeout(() => {
                                        _view
                                            .goTo(
                                                {
                                                    target: extent.expand(1.2),
                                                    tilt: 0,
                                                    heading: 0,
                                                    position: {
                                                        z: 800000,
                                                    },
                                                },
                                                {
                                                    duration: 5000,
                                                    easing: "out-quad",
                                                }
                                            )
                                            .then(() => {
                                                console.log(
                                                    "Zoom completed successfully"
                                                );
                                            })
                                            .catch((error) => {
                                                console.error(
                                                    "Zoom failed:",
                                                    error
                                                );
                                            });
                                    }, 2000);
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
    },

    initializeWMSList(container = document.getElementById("wmsListDiv")) {
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
    },

    // Hàm xử lý CQL Filter
    buildCQLFilter: function (baseFilter, additionalFilter) {
        let filters = [];

        if (baseFilter && baseFilter.trim()) {
            filters.push(`(${baseFilter})`);
        }

        if (additionalFilter && additionalFilter.trim()) {
            filters.push(`(${additionalFilter})`);
        }

        return filters.length > 0 ? filters.join(" AND ") : null;
    },

    createAndAddWMSLayer: function (config, options = {}) {
        return new Promise((resolve, reject) => {
            require(["esri/layers/WMSLayer"], function (WMSLayer) {
                console.log(`Creating WMS layer for: ${config.id}`);

                // Xử lý CQL Filter
                const cqlFilter = this.buildCQLFilter(
                    config.cqlFilter,
                    options.cqlFilter
                );

                // Custom parameters với CQL Filter
                const customParameters = {
                    transparent: true,
                    format: "image/png",
                    ...(cqlFilter && { CQL_FILTER: cqlFilter }),
                };

                console.log(`WMS Parameters for ${config.id}:`, {
                    url: config.url,
                    layer: config.layer,
                    cqlFilter: cqlFilter,
                    timestamp: new Date().toISOString(),
                });

                const wmsLayer = new WMSLayer({
                    url: config.url,
                    sublayers: [
                        {
                            name: config.layer,
                        },
                    ],
                    version: config.version,
                    customParameters: customParameters,
                    opacity: 0.8,
                });

                wmsLayer
                    .load()
                    .then(() => {
                        console.log(
                            `WMS layer ${
                                config.id
                            } loaded successfully at ${new Date().toISOString()}`
                        );
                        _map.add(wmsLayer);
                        _wmsLayers.set(config.id, wmsLayer);

                        // Lưu CQL Filter hiện tại vào layer để tham chiếu sau này
                        wmsLayer.cqlFilter = cqlFilter;

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
            }.bind(this)); // Bind this để sử dụng được buildCQLFilter
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
                    this.zoomToWMSExtent(
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
    getFeatureInfo: function (event, wmsLayer, wmsConfig, additionalCqlFilter) {
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

                // Xử lý CQL Filter
                const cqlFilter = this.buildCQLFilter(
                    wmsLayer.cqlFilter, // Sử dụng filter đã lưu trong layer
                    additionalCqlFilter
                );

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
                    ...(cqlFilter && { CQL_FILTER: cqlFilter }),
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

            if (result.data && result.data[0]) {
                const props = result.data[0].properties;
                // Giả sử bạn muốn dùng trường 'tt' (nhưng thực tế là 'TT')
                const ttField = this.findFieldCaseInsensitive(props, "tt");
                console.log({ props, ttField }); // Xem để chắc chắn

                if (ttField && props[ttField] !== undefined) {
                    // Nếu trường kiểu chuỗi
                    let highlightCql =
                        typeof props[ttField] === "string"
                            ? `${ttField}='${props[ttField]}'`
                            : `${ttField}=${props[ttField]}`;
                    await this.highlightSelectedFeatureArcgis(
                        highestPriorityLayer.config,
                        highlightCql
                    );
                } else {
                    console.warn(
                        "[Highlight] Không tìm thấy trường định danh TT/tt trên feature!"
                    );
                }
            }

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

    findFieldCaseInsensitive(props, searchField) {
        return Object.keys(props).find(
            (k) => k.toLowerCase() === searchField.toLowerCase()
        );
    },

    highlightPolygonOnMap: function (
        view,
        geojson,
        layerId = "highlightLotLayer"
    ) {
        require([
            "esri/geometry/Polygon",
            "esri/Graphic",
            "esri/layers/GraphicsLayer",
            "esri/Color",
        ], function (Polygon, Graphic, GraphicsLayer, Color) {
            // Xóa layer cũ nếu có
            let oldLayer = view.map.findLayerById(layerId);
            if (oldLayer) {
                view.map.remove(oldLayer);
            }
            // Tạo layer mới
            let highlightLayer = new GraphicsLayer({ id: layerId });

            geojson.features.forEach((f) => {
                let geom = f.geometry;
                if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
                    // Chuẩn hóa rings
                    let rings =
                        geom.type === "Polygon"
                            ? geom.coordinates
                            : geom.coordinates.flat();
                    let polygon = new Polygon({
                        rings: rings,
                        spatialReference: { wkid: 4326 },
                    });
                    let graphic = new Graphic({
                        geometry: polygon,
                        symbol: {
                            type: "simple-fill",
                            color: [255, 247, 188, 0.2],
                            outline: {
                                color: [255, 255, 134, 1],
                                width: 2,
                            },
                        },
                    });
                    highlightLayer.add(graphic);
                }
            });

            view.map.add(highlightLayer);
        });
    },

    // Hàm fetch GeoJSON feature theo CQL filter (qua WFS)
    fetchFeatureGeoJSON: async function (
        wfsUrl,
        typeName,
        cqlFilter,
        maxFeatures = 1
    ) {
        // Build WFS GetFeature URL
        let params = new URLSearchParams({
            service: "WFS",
            version: "1.1.0",
            request: "GetFeature",
            typeName: typeName,
            outputFormat: "application/json",
            srsName: "EPSG:4326",
            maxFeatures: maxFeatures,
        });
        if (cqlFilter) params.append("CQL_FILTER", cqlFilter);

        let fullUrl = `${wfsUrl}?${params.toString()}`;
        let response = await fetch(fullUrl);
        let text = await response.text();

        // Kiểm tra nếu là XML (GeoServer trả lỗi/lỗi truy vấn)
        if (text.trim().startsWith("<")) {
            // Có thể log ra hoặc parse lấy lỗi
            console.error("WFS response is XML (likely an error):", text);
            throw new Error("WFS server returned error or no feature: " + text);
        }
        // Nếu là JSON thì parse tiếp
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Failed to parse WFS JSON:", text);
            throw e;
        }
    },

    // Hàm sinh WFS url từ WMS url nếu cần
    generateWFSUrl: function (wmsUrl) {
        // Thay thế phần /wms bằng /wfs (cách phổ biến trên Geoserver)
        return wmsUrl.replace(/\/wms(\?.*)?$/, "/wfs");
    },

    // Hàm highlight feature theo kết quả truy vấn
    highlightSelectedFeatureArcgis: async function (wmsConfig, cqlFilter) {
        try {
            const wfsUrl =
                wmsConfig.wfsUrl || this.generateWFSUrl(wmsConfig.url);
            let geojson = await this.fetchFeatureGeoJSON(
                wfsUrl,
                wmsConfig.layer, // hoặc .layers tùy cấu hình
                cqlFilter,
                100
            );
            if (!geojson || !geojson.features || geojson.features.length === 0)
                return;
            this.highlightPolygonOnMap(_view, geojson, "highlightLotLayer");
        } catch (err) {
            console.error("Highlight feature error:", err);
        }
    },
};

const SketchManager = {
    sketch: null,
    sketchLayer: null,
    mergeButton: null,

    fillSymbol: {
        type: "simple-fill",
        color: [227, 139, 79, 0.8],
        outline: {
            color: [255, 255, 255],
            width: 1,
        },
    },

    mergeSymbol: {
        type: "simple-fill",
        color: [227, 139, 255],
        outline: {
            color: [255, 255, 255],
            width: 1,
        },
    },

    initialize: function (view) {
        require([
            "esri/layers/GraphicsLayer",
            "esri/widgets/Sketch",
            "esri/geometry/geometryEngine",
            "esri/Graphic",
            "esri/geometry/support/webMercatorUtils",
        ], function (
            GraphicsLayer,
            Sketch,
            geometryEngine,
            Graphic,
            webMercatorUtils
        ) {
            // Tạo graphics layer
            this.sketchLayer = new GraphicsLayer({
                id: "sketchLayer",
                title: "Sketch Layer",
                elevationInfo: {
                    mode: "on-the-ground",
                },
                visible: false,
            });

            view.map.add(this.sketchLayer);

            // Tạo sketch widget
            this.sketch = new Sketch({
                view: view,
                layer: this.sketchLayer,
                creationMode: "update",
                availableCreateTools: ["polygon"],
                defaultCreateOptions: {
                    mode: "click",
                    elevationOptions: {
                        enabled: false,
                    },
                },
                defaultUpdateOptions: {
                    tool: "reshape",
                    multipleSelectionEnabled: true,
                    enableZ: false,
                    enableVerticalEditing: false,
                    toggleToolOnClick: false,
                },
                snappingOptions: {
                    enabled: true,
                    featureSources: [
                        { layer: this.sketchLayer, enabled: true },
                    ],
                },
                visibleElements: {
                    createTools: {
                        point: false,
                        polyline: false,
                        polygon: true,
                    },
                    selectionTools: {
                        "lasso-selection": true,
                        "rectangle-selection": true,
                    },
                    settingsMenu: true,
                    duplicateButton: false,
                    undoRedoMenu: true,
                    elevationInfo: false,
                    z: false,
                },
                visible: false,
            });

            // Thêm widgets
            view.ui.add(this.sketch, "top-right");

            // Hàm cập nhật visibility của merge button - SỬA: Enable/Disable thay vì hide/show
            const updateMergeButtonVisibility = (event) => {
                console.log("Update event:", event);
                const graphics =
                    event && event.graphics
                        ? event.graphics
                        : this.sketch.updateGraphics;
                const count = graphics ? graphics.length : 0;

                // QUAN TRỌNG: Enable/disable button thay vì hide/show
                if (this.mergeButton) {
                    if (count > 1) {
                        this.mergeButton.removeAttribute("disabled");
                        this.mergeButton.setAttribute(
                            "title",
                            "Gộp vùng đã chọn"
                        );
                    } else {
                        this.mergeButton.setAttribute("disabled", "true");
                        this.mergeButton.setAttribute(
                            "title",
                            "Chọn ít nhất 2 vùng để gộp"
                        );
                    }
                }
            };

            // Hàm tạo merge button
            const createMergeButton = () => {
                const sketchContainer = this.sketch.container;
                const actionBar = sketchContainer.querySelector(
                    "calcite-action-bar[calcite-hydrated]"
                );

                if (actionBar) {
                    // Tìm group chứa polygon button để chèn sau nó
                    const polygonAction = actionBar.querySelector(
                        'calcite-action[data-action-key="polygon-button"]'
                    );
                    const polygonGroup = polygonAction
                        ? polygonAction.closest("calcite-action-group")
                        : null;

                    if (polygonGroup) {
                        // Tạo merge group
                        const mergeGroup = document.createElement(
                            "calcite-action-group"
                        );
                        mergeGroup.setAttribute("layout", "horizontal");
                        mergeGroup.setAttribute("scale", "m");

                        const mergeAction =
                            document.createElement("calcite-action");
                        mergeAction.setAttribute(
                            "title",
                            "Gộp polygon đã chọn"
                        );
                        mergeAction.setAttribute("scale", "m");
                        mergeAction.setAttribute("appearance", "solid");
                        // SỬA: Luôn hiển thị nhưng disable
                        mergeAction.style.display = "block";
                        mergeAction.setAttribute("disabled", "true");
                        mergeAction.innerHTML =
                            "<i class='bi bi-subtract'></i>";

                        // Thêm event listener cho merge
                        mergeAction.addEventListener("click", () => {
                            const selectedGraphics = this.sketch.updateGraphics;
                            if (
                                !selectedGraphics ||
                                selectedGraphics.length < 2
                            )
                                return;

                            try {
                                const updatedGeometry = [];
                                selectedGraphics.forEach((graphic) => {
                                    if (!graphic || !graphic.geometry) return;

                                    if (
                                        graphic.geometry.spatialReference
                                            .wkid === 4326
                                    ) {
                                        updatedGeometry.push(
                                            webMercatorUtils.geographicToWebMercator(
                                                graphic.geometry.clone()
                                            )
                                        );
                                    } else {
                                        updatedGeometry.push(
                                            graphic.geometry.clone()
                                        );
                                    }
                                });

                                if (updatedGeometry.length < 2) return;

                                const joinedPolygon =
                                    geometryEngine.union(updatedGeometry);
                                if (!joinedPolygon) return;

                                selectedGraphics.forEach((graphic) => {
                                    if (graphic)
                                        this.sketchLayer.remove(graphic);
                                });

                                const resultGraphic = new Graphic({
                                    geometry: joinedPolygon,
                                    symbol: this.mergeSymbol,
                                    elevationInfo: {
                                        mode: "on-the-ground",
                                    },
                                    attributes: {
                                        creator: "clonemail2k2",
                                        createdAt: new Date().toISOString(),
                                    },
                                });

                                this.sketchLayer.add(resultGraphic);
                                if (this.sketch.updateGraphics) {
                                    this.sketch.updateGraphics.removeAll();
                                }
                            } catch (error) {
                                console.error("Error during merge:", error);
                            }
                        });

                        mergeGroup.appendChild(mergeAction);

                        // Chèn sau polygon group
                        polygonGroup.parentNode.insertBefore(
                            mergeGroup,
                            polygonGroup.nextSibling
                        );

                        this.mergeButton = mergeAction;
                        console.log("Merge button added successfully");
                        return true;
                    }
                }
                return false;
            };

            // Bật sẵn tooltip và labels khi khởi tạo
            this.sketch.when(() => {
                // Bật tooltip (chú giải công cụ)
                if (
                    this.sketch.viewModel &&
                    this.sketch.viewModel.tooltipOptions
                ) {
                    this.sketch.viewModel.tooltipOptions.enabled = true;
                }

                // Bật labels (nhãn phân vùng)
                if (
                    this.sketch.viewModel &&
                    this.sketch.viewModel.labelOptions
                ) {
                    this.sketch.viewModel.labelOptions.enabled = true;
                }

                // Hoặc sử dụng cách khác nếu API khác
                if (this.sketch.viewModel) {
                    this.sketch.viewModel.set("tooltipsEnabled", true);
                    this.sketch.viewModel.set("labelsEnabled", true);
                }

                // Thử tạo merge button ngay lập tức
                setTimeout(() => {
                    if (createMergeButton()) {
                        return; // Đã tạo thành công
                    }

                    // Nếu chưa tạo được, dùng MutationObserver
                    const sketchContainer = this.sketch.container;
                    const observer = new MutationObserver((mutations) => {
                        if (createMergeButton()) {
                            observer.disconnect();
                        }
                    });

                    observer.observe(sketchContainer, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ["calcite-hydrated"],
                    });
                }, 1000);
            });

            // Handle sketch events
            this.sketch.on("create", (event) => {
                if (event.state === "complete") {
                    const graphic = event.graphic;
                    if (graphic) {
                        graphic.symbol = this.fillSymbol;
                        graphic.elevationInfo = {
                            mode: "on-the-ground",
                        };
                    }
                }
            });

            // Theo dõi update event để cập nhật button merge
            this.sketch.on("update", (event) => {
                updateMergeButtonVisibility(event);

                if (event.state === "complete" && this.mergeButton) {
                    this.mergeButton.style.display = "none";
                }
            });
        }.bind(this));
    },

    toggle: function () {
        if (!this.sketch) return false;

        this.sketch.visible = !this.sketch.visible;
        if (this.sketchLayer) {
            this.sketchLayer.visible = this.sketch.visible;
        }

        if (!this.sketch.visible) {
            if (this.mergeButton) {
                this.mergeButton.style.display = "none";
            }
        }

        return this.sketch.visible;
    },

    isVisible: function () {
        return this.sketch ? this.sketch.visible : false;
    },
};

const ControlManager = {
    createControlButton: function ({
        id,
        title,
        icon,
        offcanvasTitle,
        offcanvasContent = "",
        buttonClass = "",
        onClick,
    }) {
        const container = document.querySelector(
            ".esri-component.esri-navigation-toggle.esri-widget"
        );

        const button = document.createElement("button");

        // Base classes cho tất cả buttons
        const baseClasses = [
            "border-0",
            "esri-widget--button",
            "esri-widget",
            "esri-interactive",
        ];
        if (buttonClass) {
            baseClasses.push(buttonClass);
        }
        button.className = baseClasses.join(" ");

        // Style chung
        button.setAttribute(
            "style",
            "border-top: solid 1px rgba(110, 110, 110, .3) !important;"
        );
        button.setAttribute("type", "button");
        button.setAttribute("title", title);

        // QUAN TRỌNG: Chỉ thêm data attributes cho offcanvas buttons
        if (!onClick) {
            button.setAttribute("data-bs-toggle", "offcanvas");
            button.setAttribute("data-bs-target", `#${id}Offcanvas`);
        }

        // Icon và content
        button.innerHTML = `<span class="bi bi-${icon}"></span>`;

        // Thêm onclick event nếu có
        if (onClick) {
            button.onclick = () => onClick(button);
        }

        container.appendChild(button);

        // Chỉ tạo offcanvas cho buttons không có onClick
        let offcanvas = null;
        if (!onClick && (offcanvasTitle || offcanvasContent)) {
            offcanvas = this.createOffCanvas(
                id,
                offcanvasTitle,
                offcanvasContent
            );
        }

        return {
            button,
            offcanvas,
            contentContainer: offcanvas
                ? offcanvas.querySelector(`#${id}Content`)
                : null,
        };
    },

    createOffCanvas: function (id = "", title = "", content = "") {
        const offcanvas = document.createElement("div");
        offcanvas.className = "offcanvas offcanvas-end";
        offcanvas.id = `${id}Offcanvas`;
        offcanvas.innerHTML = `
            <div class="offcanvas-header">
                <h5 class="offcanvas-title">${title}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button>
            </div>
            <div class="offcanvas-body" id="${id}Content">
                ${content || ""}
            </div>
        `;
        document.body.appendChild(offcanvas);
        return offcanvas;
    },

    initializeControls: function (view) {
        // Basemap control
        const basemapControl = this.createControlButton({
            id: "basemap",
            title: "Bản đồ nền",
            icon: "layers",
            offcanvasTitle: "Chọn bản đồ nền",
        });

        // Khởi tạo BasemapGallery
        require(["esri/widgets/BasemapGallery"], function (BasemapGallery) {
            new BasemapGallery({
                view: view,
                container: basemapControl.contentContainer,
            });
        });

        // WMS control
        const wmsControl = this.createControlButton({
            id: "wms",
            title: "Lớp WMS",
            icon: "map",
            offcanvasTitle: "Lớp bản đồ WMS",
        });

        // Sketch control
        this.createControlButton({
            id: "sketch",
            title: "Công cụ vẽ",
            icon: "pencil",
            buttonClass: "sketch-tool-btn",
            onClick: (button) => {
                const isVisible = SketchManager.toggle();
                if (isVisible) {
                    button.classList.add("active");
                    button.innerHTML =
                        '<span class="bi bi-pencil-fill"></span>';
                } else {
                    button.classList.remove("active");
                    button.innerHTML = '<span class="bi bi-pencil"></span>';
                }
            },
        });

        // Khởi tạo WMS list
        WMSLayerManager.initializeWMSList(wmsControl.contentContainer);
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
                    WMSLayerManager.zoomToWMSExtent(
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
    require(["esri/Map", "esri/views/SceneView", "esri/config"], function (
        Map,
        SceneView,
        esriConfig
    ) {
        WMSLayerManager.setupCORS(esriConfig);

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

            // Khởi tạo các managers
            SketchManager.initialize(_view);
            ControlManager.initializeControls(_view);
            WMSLayerManager.loadDefaultWMSLayers();
        });

        _view.watch("updating", function (val) {
            if (!val) {
                console.log("Map loaded completely");
            }
        });

        _view.on("click", (event) => {
            // Chỉ xử lý click khi không ở chế độ vẽ
            if (!SketchManager.isVisible()) {
                WMSLayerManager.handleMapClick(event);
            }
        });
    });
}

window.initMap3D = initMap3D;
