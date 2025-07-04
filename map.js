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

                for (let layer of layers) {
                    const nameElement = layer.getElementsByTagName("Name")[0];
                    if (nameElement) {
                        const layerFullName = nameElement.textContent;
                        if (layerFullName.includes(layerName)) {
                            const bboxElement =
                                layer.getElementsByTagName("BoundingBox")[0];
                            if (bboxElement) {
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
                                            .then(() => {})
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
        const defaultLayers = WMS_LAYERS.filter(
            (config) => config.defaultVisible
        ).sort((a, b) => a.zoomPriority - b.zoomPriority);

        if (defaultLayers.length === 0) return;

        const loadPromises = defaultLayers.map((config) =>
            this.createAndAddWMSLayer(config)
        );

        Promise.all(loadPromises)
            .then(() => {
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
                const ttField = this.findFieldCaseInsensitive(props, "tt");

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
    splitButton: null,
    saveButton: null,
    isSplitMode: false,
    selectedPolygonForSplit: null,
    splitSketch: null,
    splitLayer: null,
    escKeyHandler: null,
    _modules: null,
    savedPolygons: [],
    isDirty: false,

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

    // Đếm tổng số polygon trên layer
    getPolygonCount: function () {
        return this.sketchLayer ? this.sketchLayer.graphics.length : 0;
    },

    // Kiểm tra có polygon nào chưa lưu
    hasUnsavedChanges: function () {
        return this.isDirty || this.getPolygonCount() > 0;
    },

    // Chuyển đổi graphic thành WKT format cho PostgreSQL
    graphicToWKT: function (graphic) {
        const geometry = graphic.geometry;
        const attributes = graphic.attributes || {};

        // Convert rings to WKT POLYGON format
        let wktCoords = [];
        if (geometry.rings && geometry.rings.length > 0) {
            geometry.rings.forEach((ring) => {
                const coordsStr = ring
                    .map((coord) => `${coord[0]} ${coord[1]}`)
                    .join(", ");
                wktCoords.push(`(${coordsStr})`);
            });
        }

        const wktGeometry = `POLYGON(${wktCoords.join(", ")})`;

        return {
            id: attributes.id || this.generatePolygonId(),
            name: attributes.name || `Polygon ${Date.now()}`,
            description: attributes.description || "",
            geometry_wkt: wktGeometry,
            srid: geometry.spatialReference.wkid || 4326,
            area: this.calculatePolygonArea(geometry),
            perimeter: this.calculatePolygonPerimeter(geometry),
            properties: {
                ...attributes,
                createdAt: attributes.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                creator: "sketch_tool",
            },
        };
    },

    // Tạo ID unique cho polygon
    generatePolygonId: function () {
        return (
            "polygon_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9)
        );
    },

    // Tính diện tích polygon (sử dụng ArcGIS geometryEngine)
    calculatePolygonArea: function (geometry) {
        try {
            const { geometryEngine } = this._modules;
            if (
                geometryEngine &&
                typeof geometryEngine.geodesicArea === "function"
            ) {
                return geometryEngine.geodesicArea(geometry, "square-meters");
            }
        } catch (error) {
            console.warn("Could not calculate area:", error);
        }
        return 0;
    },

    // Tính chu vi polygon
    calculatePolygonPerimeter: function (geometry) {
        try {
            const { geometryEngine } = this._modules;
            if (
                geometryEngine &&
                typeof geometryEngine.geodesicLength === "function"
            ) {
                return geometryEngine.geodesicLength(geometry, "meters");
            }
        } catch (error) {
            console.warn("Could not calculate perimeter:", error);
        }
        return 0;
    },

    // Lấy tất cả polygons cho API
    getAllPolygonsForAPI: function () {
        const polygons = [];

        if (this.sketchLayer) {
            this.sketchLayer.graphics.forEach((graphic) => {
                if (graphic.geometry && graphic.geometry.type === "polygon") {
                    polygons.push(this.graphicToWKT(graphic));
                }
            });
        }

        return {
            polygons: polygons,
            metadata: {
                totalCount: polygons.length,
                exportedAt: new Date().toISOString(),
                creator: "SketchManager",
                projectId: this.getCurrentProjectId(),
            },
        };
    },

    // Xử lý save polygons
    handleSave: async function () {
        try {
            const polygonData = this.getAllPolygonsForAPI();

            if (polygonData.polygons.length === 0) {
                alert("Không có polygon nào để lưu!");
                return;
            }

            // Hiển thị loading state
            this.setSaveButtonLoading(true);

            // Gọi API để lưu
            const response = await this.saveToAPI(polygonData);

            if (response.success) {
                // Lưu vào local storage để backup
                this.saveToLocalStorage(polygonData);

                // Update saved polygons array
                this.savedPolygons = [...polygonData.polygons];
                this.isDirty = false;

                // Thông báo thành công
                this.showSaveSuccess(polygonData.polygons.length);

                // Update button state
                this.updateSaveButtonState();
            } else {
                throw new Error(response.message || "Lưu thất bại");
            }
        } catch (error) {
            console.error("Save error:", error);
            this.showSaveError(error.message);
        } finally {
            this.setSaveButtonLoading(false);
        }
    },

    // API call để lưu polygons với WKT format
    saveToAPI: async function (polygonData) {
        // Thay thế bằng API endpoint thực tế của bạn
        const API_ENDPOINT = "/api/polygons/save";

        try {
            const response = await fetch(API_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // Thêm authentication headers nếu cần
                    // 'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(polygonData),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            // Fallback: chỉ lưu local nếu API fail
            console.warn("API save failed, saving locally only:", error);
            return {
                success: true,
                message: "Đã lưu cục bộ (API không khả dụng)",
            };
        }
    },

    // Lưu vào localStorage để backup
    saveToLocalStorage: function (polygonData) {
        try {
            const storageKey = `sketch_polygons_${
                this.getCurrentProjectId() || "default"
            }`;
            localStorage.setItem(
                storageKey,
                JSON.stringify({
                    data: polygonData,
                    savedAt: new Date().toISOString(),
                })
            );
        } catch (error) {
            console.warn("Could not save to localStorage:", error);
        }
    },

    // Load từ localStorage
    loadFromLocalStorage: function () {
        try {
            const storageKey = `sketch_polygons_${
                this.getCurrentProjectId() || "default"
            }`;
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                return parsed.data;
            }
        } catch (error) {
            console.warn("Could not load from localStorage:", error);
        }
        return null;
    },

    // Lấy project ID hiện tại
    getCurrentProjectId: function () {
        // Thay thế bằng logic lấy project ID thực tế
        return window.currentProjectId || null;
    },

    // Set loading state cho save button
    setSaveButtonLoading: function (isLoading) {
        if (this.saveButton) {
            if (isLoading) {
                this.saveButton.setAttribute("disabled", "true");
                this.saveButton.innerHTML =
                    '<i class="bi bi-hourglass-split"></i>';
                this.saveButton.setAttribute("title", "Đang lưu...");
            } else {
                this.updateSaveButtonState();
            }
        }
    },

    // Hiển thị thông báo thành công
    showSaveSuccess: function (count) {
        const message = `✅ Đã lưu ${count} polygon thành công!`;
        this.showNotification(message, "success");
    },

    // Hiển thị thông báo lỗi
    showSaveError: function (errorMessage) {
        const message = `❌ Lỗi khi lưu: ${errorMessage}`;
        this.showNotification(message, "error");
    },

    // Hệ thống notification đơn giản
    showNotification: function (message, type = "info") {
        const notification = document.createElement("div");
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${
                type === "success"
                    ? "#4CAF50"
                    : type === "error"
                    ? "#f44336"
                    : "#2196F3"
            };
            color: white;
            padding: 12px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-size: 14px;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        notification.innerHTML = message;
        document.body.appendChild(notification);

        // Tự động ẩn sau 3s
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    },

    // Cập nhật state của save button
    updateSaveButtonState: function () {
        if (!this.saveButton) return;

        const polygonCount = this.getPolygonCount();
        const hasUnsaved = this.hasUnsavedChanges();

        if (polygonCount > 0) {
            this.saveButton.removeAttribute("disabled");
            this.saveButton.style.display = "block";
            this.saveButton.innerHTML = '<i class="bi bi-cloud-upload"></i>';
            this.saveButton.setAttribute(
                "title",
                hasUnsaved
                    ? `Lưu ${polygonCount} polygon`
                    : `${polygonCount} polygon đã lưu`
            );

            // Thay đổi màu button dựa trên trạng thái
            if (hasUnsaved) {
                this.saveButton.style.background = "#ff9800"; // Orange cho unsaved
            } else {
                this.saveButton.style.background = "#4caf50"; // Green cho saved
            }
        } else {
            this.saveButton.setAttribute("disabled", "true");
            this.saveButton.style.display = "block";
            this.saveButton.innerHTML = '<i class="bi bi-cloud-upload"></i>';
            this.saveButton.setAttribute("title", "Không có polygon để lưu");
            this.saveButton.style.background = "";
        }
    },

    // Track changes để update save button
    trackChanges: function () {
        this.isDirty = true;
        this.updateSaveButtonState();
    },

    // Load polygons từ server (optional)
    loadPolygonsFromAPI: async function (projectId) {
        try {
            const response = await fetch(`/api/polygons/load/${projectId}`);
            if (response.ok) {
                const data = await response.json();
                this.loadPolygonsToLayer(data);
            }
        } catch (error) {
            console.warn("Could not load polygons from API:", error);
            // Fallback to localStorage
            const localData = this.loadFromLocalStorage();
            if (localData) {
                this.loadPolygonsToLayer(localData);
            }
        }
    },

    // Load polygons vào layer từ WKT
    loadPolygonsToLayer: function (polygonData) {
        if (!polygonData || !polygonData.polygons) return;

        const { Graphic, Polygon } = this._modules;

        polygonData.polygons.forEach((item) => {
            try {
                // Parse WKT để tạo geometry (simplified - có thể cần thư viện WKT parser)
                const polygon = this.parseWKTToPolygon(item.geometry_wkt);

                const graphic = new Graphic({
                    geometry: polygon,
                    symbol: this.fillSymbol,
                    attributes: {
                        ...item.properties,
                        id: item.id,
                        name: item.name,
                        description: item.description,
                    },
                });

                this.sketchLayer.add(graphic);
            } catch (error) {
                console.warn("Could not load polygon:", error);
            }
        });

        this.savedPolygons = [...polygonData.polygons];
        this.isDirty = false;
        this.updateSaveButtonState();
    },

    // Parse WKT thành Polygon (simplified version)
    parseWKTToPolygon: function (wktString) {
        const { Polygon } = this._modules;

        // Simple WKT parser - có thể cần thư viện chuyên dụng cho production
        const coordsMatch = wktString.match(/POLYGON\s*\(\s*\((.*?)\)\s*\)/);
        if (coordsMatch) {
            const coordsStr = coordsMatch[1];
            const coords = coordsStr.split(",").map((coord) => {
                const [x, y] = coord.trim().split(" ");
                return [parseFloat(x), parseFloat(y)];
            });

            return new Polygon({
                rings: [coords],
                spatialReference: { wkid: 4326 },
            });
        }

        throw new Error("Invalid WKT format");
    },

    // Tạo graphics layer
    createSketchLayer: function (view, GraphicsLayer) {
        this.sketchLayer = new GraphicsLayer({
            id: "sketchLayer",
            title: "Sketch Layer",
            elevationInfo: {
                mode: "on-the-ground",
            },
            visible: false,
        });
        view.map.add(this.sketchLayer);
    },

    // Tạo sketch widget
    createSketchWidget: function (view, Sketch) {
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
                featureSources: [{ layer: this.sketchLayer, enabled: true }],
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
        view.ui.add(this.sketch, "top-right");
    },

    // Tạo temporary layer cho split line
    createSplitLayer: function (GraphicsLayer) {
        if (!this.splitLayer) {
            this.splitLayer = new GraphicsLayer({
                id: "splitLayer",
                title: "Split Layer",
                elevationInfo: {
                    mode: "on-the-ground",
                },
                listMode: "hide",
                visible: true,
            });
            _view.map.add(this.splitLayer);
        }
    },

    // Tạo sketch widget riêng cho split line
    createSplitSketch: function (Sketch) {
        if (!this.splitSketch) {
            this.splitSketch = new Sketch({
                view: _view,
                layer: this.splitLayer,
                creationMode: "single",
                availableCreateTools: ["polyline"],
                defaultCreateOptions: {
                    mode: "click",
                },
                visibleElements: {
                    createTools: {
                        point: false,
                        polyline: true,
                        polygon: false,
                    },
                    selectionTools: {
                        "lasso-selection": false,
                        "rectangle-selection": false,
                    },
                    settingsMenu: false,
                    undoRedoMenu: false,
                },
                visible: false,
            });

            _view.ui.add(this.splitSketch, "top-right");

            this.splitSketch.on("create", (event) => {
                if (
                    event.state === "complete" &&
                    this.selectedPolygonForSplit
                ) {
                    this.performSplit(event.graphic.geometry);
                }
            });
        }
    },

    // Cập nhật state của merge, split và save button
    updateToolButtonsState: function (event) {
        const graphics =
            event && event.graphics
                ? event.graphics
                : this.sketch.updateGraphics;
        const count = graphics ? graphics.length : 0;

        // Update merge button
        if (this.mergeButton) {
            if (count > 1) {
                this.mergeButton.removeAttribute("disabled");
                this.mergeButton.setAttribute("title", "Gộp vùng đã chọn");
            } else {
                this.mergeButton.setAttribute("disabled", "true");
                this.mergeButton.setAttribute(
                    "title",
                    "Chọn ít nhất 2 vùng để gộp"
                );
            }
        }

        // Update split button
        if (this.splitButton) {
            if (count === 1) {
                this.splitButton.removeAttribute("disabled");
                this.splitButton.setAttribute("title", "Tách vùng đã chọn");
            } else {
                this.splitButton.setAttribute("disabled", "true");
                this.splitButton.setAttribute("title", "Chọn 1 vùng để tách");
            }
        }

        // Update save button
        this.updateSaveButtonState();
    },

    // Xử lý logic merge polygons
    handleMerge: function (webMercatorUtils, geometryEngine, Graphic) {
        const selectedGraphics = this.sketch.updateGraphics;
        if (!selectedGraphics || selectedGraphics.length < 2) return;

        try {
            const updatedGeometry = [];
            selectedGraphics.forEach((graphic) => {
                if (!graphic || !graphic.geometry) return;

                if (graphic.geometry.spatialReference.wkid === 4326) {
                    updatedGeometry.push(
                        webMercatorUtils.geographicToWebMercator(
                            graphic.geometry.clone()
                        )
                    );
                } else {
                    updatedGeometry.push(graphic.geometry.clone());
                }
            });

            if (updatedGeometry.length < 2) return;

            const joinedPolygon = geometryEngine.union(updatedGeometry);
            if (!joinedPolygon) return;

            selectedGraphics.forEach((graphic) => {
                if (graphic) this.sketchLayer.remove(graphic);
            });

            const resultGraphic = new Graphic({
                geometry: joinedPolygon,
                symbol: this.mergeSymbol,
                elevationInfo: {
                    mode: "on-the-ground",
                },
            });

            this.sketchLayer.add(resultGraphic);
            if (this.sketch.updateGraphics) {
                this.sketch.updateGraphics.removeAll();
            }

            this.trackChanges();
        } catch (error) {
            console.error("Error during merge:", error);
        }
    },

    // Hàm xử lý logic split polygon
    handleSplit: function () {
        const selectedGraphics = this.sketch.updateGraphics;
        if (!selectedGraphics || selectedGraphics.length !== 1) return;

        if (!this.splitSketch) {
            this.createSplitSketch(this._modules.Sketch);
        }

        this.enterSplitMode();
    },

    // Thực hiện split với line do user vẽ
    performSplit: function (splitLine) {
        if (!this.selectedPolygonForSplit || !splitLine) return;

        const { webMercatorUtils, geometryEngine, Graphic } = this._modules;

        try {
            let polygonGeometry = this.selectedPolygonForSplit.geometry;
            let splitLineGeometry = splitLine;

            if (
                polygonGeometry.spatialReference.wkid === 4326 &&
                splitLineGeometry.spatialReference.wkid !== 4326
            ) {
                polygonGeometry =
                    webMercatorUtils.geographicToWebMercator(polygonGeometry);
            } else if (
                polygonGeometry.spatialReference.wkid !== 4326 &&
                splitLineGeometry.spatialReference.wkid === 4326
            ) {
                splitLineGeometry =
                    webMercatorUtils.geographicToWebMercator(splitLineGeometry);
            }

            const extendedLine = geometryEngine.geodesicDensify(
                splitLineGeometry,
                1000,
                "meters"
            );
            const splitResult = geometryEngine.cut(
                polygonGeometry,
                extendedLine
            );

            if (splitResult && splitResult.length > 1) {
                this.sketchLayer.remove(this.selectedPolygonForSplit);

                splitResult.forEach((splitGeom, index) => {
                    const splitGraphic = new Graphic({
                        geometry: splitGeom,
                        symbol: {
                            type: "simple-fill",
                            color:
                                index === 0
                                    ? [227, 139, 79, 0.8]
                                    : [139, 227, 79, 0.8],
                            outline: {
                                color: [255, 255, 255],
                                width: 1,
                            },
                        },
                        elevationInfo: {
                            mode: "on-the-ground",
                        },
                    });
                    this.sketchLayer.add(splitGraphic);
                });

                this.trackChanges();
                console.log(`Split polygon into ${splitResult.length} parts`);
            } else {
                console.warn(
                    "Could not split polygon - line may not intersect properly"
                );
                alert(
                    "Không thể tách polygon. Đảm bảo đường cắt đi qua polygon."
                );
            }
        } catch (error) {
            console.error("Error during split:", error);
            alert("Lỗi khi tách polygon: " + error.message);
        } finally {
            this.exitSplitMode();
        }
    },

    // Bắt đầu split mode
    enterSplitMode: function () {
        const selectedGraphics = this.sketch.updateGraphics;
        if (!selectedGraphics || selectedGraphics.length !== 1) return;

        this.selectedPolygonForSplit = selectedGraphics.getItemAt(0);
        this.isSplitMode = true;

        this.sketch.visible = false;
        this.splitSketch.visible = true;

        setTimeout(() => {
            if (
                this.splitSketch &&
                this.splitSketch.activeTool !== "polyline"
            ) {
                this.splitSketch.create("polyline");
            }
        }, 100);

        _view.container.style.cursor = "crosshair";
        this.showSplitInstruction();

        console.log("Entered split mode - polyline tool activated");
    },

    // Thoát split mode
    exitSplitMode: function () {
        this.isSplitMode = false;
        this.selectedPolygonForSplit = null;

        if (this.splitSketch) {
            this.splitSketch.visible = false;
        }
        this.sketch.visible = true;

        setTimeout(() => {
            if (this.sketch && typeof this.sketch.cancel === "function") {
                this.sketch.cancel();
            }
        }, 100);

        _view.container.style.cursor = "default";

        if (this.splitLayer) {
            this.splitLayer.removeAll();
        }

        if (this.sketch.updateGraphics) {
            this.sketch.updateGraphics.removeAll();
        }

        this.hideSplitInstruction();
    },

    // Hiển thị hướng dẫn split
    showSplitInstruction: function () {
        const instruction = document.createElement("div");
        instruction.id = "splitInstruction";
        instruction.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            font-size: 14px;
        `;
        instruction.innerHTML = `
            <div>Vẽ đường cắt qua polygon</div>
            <div><small>Nhấn ESC để hủy</small></div>
        `;
        document.body.appendChild(instruction);

        this.escKeyHandler = (e) => {
            if (e.key === "Escape") {
                this.exitSplitMode();
            }
        };
        document.addEventListener("keydown", this.escKeyHandler);
    },

    // Ẩn hướng dẫn split
    hideSplitInstruction: function () {
        const instruction = document.getElementById("splitInstruction");
        if (instruction) {
            instruction.remove();
        }

        if (this.escKeyHandler) {
            document.removeEventListener("keydown", this.escKeyHandler);
            this.escKeyHandler = null;
        }
    },

    // Tạo merge button
    createMergeButton: function (webMercatorUtils, geometryEngine, Graphic) {
        const sketchContainer = this.sketch.container;
        const actionBar = sketchContainer.querySelector(
            "calcite-action-bar[calcite-hydrated]"
        );

        if (actionBar) {
            const polygonAction = actionBar.querySelector(
                'calcite-action[data-action-key="polygon-button"]'
            );
            const polygonGroup = polygonAction
                ? polygonAction.closest("calcite-action-group")
                : null;

            if (polygonGroup) {
                const mergeGroup = document.createElement(
                    "calcite-action-group"
                );
                mergeGroup.setAttribute("layout", "horizontal");
                mergeGroup.setAttribute("scale", "m");

                const mergeAction = document.createElement("calcite-action");
                mergeAction.setAttribute("title", "Chọn ít nhất 2 vùng để gộp");
                mergeAction.setAttribute("scale", "m");
                mergeAction.setAttribute("appearance", "solid");
                mergeAction.style.display = "block";
                mergeAction.setAttribute("disabled", "true");
                mergeAction.innerHTML = "<i class='bi bi-subtract'></i>";

                mergeAction.addEventListener("click", () => {
                    this.handleMerge(webMercatorUtils, geometryEngine, Graphic);
                });

                mergeGroup.appendChild(mergeAction);
                polygonGroup.parentNode.insertBefore(
                    mergeGroup,
                    polygonGroup.nextSibling
                );

                this.mergeButton = mergeAction;
                return true;
            }
        }
        return false;
    },

    // Tạo split button
    createSplitButton: function (webMercatorUtils, geometryEngine, Graphic) {
        const sketchContainer = this.sketch.container;
        const actionBar = sketchContainer.querySelector(
            "calcite-action-bar[calcite-hydrated]"
        );

        if (actionBar) {
            const polygonAction = actionBar.querySelector(
                'calcite-action[data-action-key="polygon-button"]'
            );
            const polygonGroup = polygonAction
                ? polygonAction.closest("calcite-action-group")
                : null;

            if (polygonGroup) {
                const mergeGroup = polygonGroup.parentNode.querySelector(
                    "calcite-action-group:has(calcite-action[title*='Gộp'])"
                );

                const splitGroup = document.createElement(
                    "calcite-action-group"
                );
                splitGroup.setAttribute("layout", "horizontal");
                splitGroup.setAttribute("scale", "m");

                const splitAction = document.createElement("calcite-action");
                splitAction.setAttribute("title", "Chọn 1 vùng để tách");
                splitAction.setAttribute("scale", "m");
                splitAction.setAttribute("appearance", "solid");
                splitAction.style.display = "block";
                splitAction.setAttribute("disabled", "true");
                splitAction.innerHTML = "<i class='bi bi-scissors'></i>";

                splitAction.addEventListener("click", () => {
                    this.handleSplit();
                });

                splitGroup.appendChild(splitAction);

                const insertAfter = mergeGroup || polygonGroup;
                insertAfter.parentNode.insertBefore(
                    splitGroup,
                    insertAfter.nextSibling
                );

                this.splitButton = splitAction;
                return true;
            }
        }
        return false;
    },

    // Tạo save button
    createSaveButton: function () {
        const sketchContainer = this.sketch.container;
        const actionBar = sketchContainer.querySelector(
            "calcite-action-bar[calcite-hydrated]"
        );

        if (actionBar) {
            const polygonAction = actionBar.querySelector(
                'calcite-action[data-action-key="polygon-button"]'
            );
            const polygonGroup = polygonAction
                ? polygonAction.closest("calcite-action-group")
                : null;

            if (polygonGroup) {
                // Tìm merge group để chèn save button sau nó
                const mergeGroup = polygonGroup.parentNode.querySelector(
                    "calcite-action-group:has(calcite-action[title*='Gộp'])"
                );

                const saveGroup = document.createElement(
                    "calcite-action-group"
                );
                saveGroup.setAttribute("layout", "horizontal");
                saveGroup.setAttribute("scale", "m");

                const saveAction = document.createElement("calcite-action");
                saveAction.setAttribute("title", "Không có polygon để lưu");
                saveAction.setAttribute("scale", "m");
                saveAction.setAttribute("appearance", "solid");
                saveAction.style.display = "block";
                saveAction.setAttribute("disabled", "true");
                saveAction.innerHTML = "<i class='bi bi-cloud-upload'></i>";

                saveAction.addEventListener("click", () => {
                    this.handleSave();
                });

                saveGroup.appendChild(saveAction);

                // THAY ĐỔI: Chèn ngay sau merge group
                if (mergeGroup) {
                    mergeGroup.parentNode.insertBefore(
                        saveGroup,
                        mergeGroup.nextSibling
                    );
                } else {
                    // Fallback nếu không tìm thấy merge group
                    polygonGroup.parentNode.insertBefore(
                        saveGroup,
                        polygonGroup.nextSibling
                    );
                }

                this.saveButton = saveAction;
                return true;
            }
        }
        return false;
    },

    // Bật tooltip và labels
    enableTooltipsAndLabels: function () {
        if (this.sketch.viewModel && this.sketch.viewModel.tooltipOptions) {
            this.sketch.viewModel.tooltipOptions.enabled = true;
        }

        if (this.sketch.viewModel && this.sketch.viewModel.labelOptions) {
            this.sketch.viewModel.labelOptions.enabled = true;
        }

        if (this.sketch.viewModel) {
            this.sketch.viewModel.set("tooltipsEnabled", true);
            this.sketch.viewModel.set("labelsEnabled", true);
        }
    },

    // Setup merge, split và save button
    setupToolButtons: function (
        webMercatorUtils,
        geometryEngine,
        Graphic,
        GraphicsLayer,
        Sketch
    ) {
        this.createSplitLayer(GraphicsLayer);

        setTimeout(() => {
            const mergeCreated = this.createMergeButton(
                webMercatorUtils,
                geometryEngine,
                Graphic
            );
            const splitCreated = this.createSplitButton(
                webMercatorUtils,
                geometryEngine,
                Graphic
            );
            const saveCreated = this.createSaveButton();

            if (mergeCreated && splitCreated && saveCreated) {
                return;
            }

            const sketchContainer = this.sketch.container;
            const observer = new MutationObserver((mutations) => {
                let allCreated = true;

                if (!this.mergeButton) {
                    allCreated &= this.createMergeButton(
                        webMercatorUtils,
                        geometryEngine,
                        Graphic
                    );
                }

                if (!this.splitButton) {
                    allCreated &= this.createSplitButton(
                        webMercatorUtils,
                        geometryEngine,
                        Graphic
                    );
                }

                if (!this.saveButton) {
                    allCreated &= this.createSaveButton();
                }

                if (allCreated) {
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
    },

    // Setup sketch events
    setupSketchEvents: function () {
        // Handle create events
        this.sketch.on("create", (event) => {
            if (event.state === "complete") {
                const graphic = event.graphic;
                if (graphic) {
                    graphic.symbol = this.fillSymbol;
                    graphic.elevationInfo = {
                        mode: "on-the-ground",
                    };

                    this.trackChanges();
                }
            }
        });

        // Handle update events
        this.sketch.on("update", (event) => {
            this.updateToolButtonsState(event);

            if (event.state === "complete") {
                if (this.mergeButton) {
                    this.mergeButton.setAttribute("disabled", "true");
                    this.mergeButton.setAttribute(
                        "title",
                        "Chọn ít nhất 2 vùng để gộp"
                    );
                }
                if (this.splitButton) {
                    this.splitButton.setAttribute("disabled", "true");
                    this.splitButton.setAttribute(
                        "title",
                        "Chọn 1 vùng để tách"
                    );
                }

                this.trackChanges();
            }
        });

        // Track delete events
        this.sketch.on("delete", (event) => {
            this.trackChanges();
        });
    },

    // Hàm chính initialize
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
            // Lưu modules để dùng ở các hàm khác
            this._modules = {
                GraphicsLayer,
                Sketch,
                geometryEngine,
                Graphic,
                webMercatorUtils,
            };

            // Tạo các components chính
            this.createSketchLayer(view, GraphicsLayer);
            this.createSketchWidget(view, Sketch);

            // Setup events
            this.setupSketchEvents();

            // Khi sketch ready
            this.sketch.when(() => {
                // Bật tooltip và labels
                this.enableTooltipsAndLabels();

                // Setup merge, split và save button
                this.setupToolButtons(
                    webMercatorUtils,
                    geometryEngine,
                    Graphic,
                    GraphicsLayer,
                    Sketch
                );
            });
        }.bind(this));
    },

    toggle: function () {
        if (!this.sketch) return false;

        this.sketch.visible = !this.sketch.visible;
        if (this.sketchLayer) {
            this.sketchLayer.visible = this.sketch.visible;
        }

        // Thoát split mode nếu đang active
        if (this.isSplitMode) {
            this.exitSplitMode();
        }

        if (!this.sketch.visible) {
            if (this.mergeButton) this.mergeButton.style.display = "none";
            if (this.splitButton) this.splitButton.style.display = "none";
            if (this.saveButton) this.saveButton.style.display = "none";
        } else {
            if (this.mergeButton) this.mergeButton.style.display = "block";
            if (this.splitButton) this.splitButton.style.display = "block";
            if (this.saveButton) this.saveButton.style.display = "block";
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
            // Khởi tạo các managers
            SketchManager.initialize(_view);
            ControlManager.initializeControls(_view);
            WMSLayerManager.loadDefaultWMSLayers();
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
