/**
 * =============================================================================
 * ARCGIS MAPS SDK FOR JAVASCRIPT 4.33
 * =============================================================================
 *
 * Hỗ trợ khởi tạo nhiều map instances với cấu hình linh hoạt
 * Mỗi map có thể bật/tắt các tính năng riêng biệt:
 * - WMS Layer Management
 * - Sketch Tools (Draw, Merge, Split, Save)
 * - Control Manager (Basemap, Navigation)
 *
 */

// =============================================================================
// BIẾN TOÀN CỤC VÀ CẤU HÌNH
// =============================================================================

/**
 * Map để lưu trữ tất cả instances của map
 * Key: containerId, Value: MapInstance object
 */
const MAP_INSTANCES = new Map();

/**
 * Cấu hình WMS Layers mặc định
 * Có thể override khi khởi tạo map
 */
const DEFAULT_WMS_LAYERS = [
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
        name: "Ranh giới xã",
        url: "https://bando.ifee.edu.vn:8453/geoserver/ws_ranhgioi/wms",
        layer: "ws_ranhgioi:rg_vn_xa",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 9,
    },
    {
        id: "wms_3",
        name: "Bản đồ EUDR 2025",
        url: "https://maps-150.ifee.edu.vn:8453/geoserver/_2025_EUDR/wms",
        layer: "_2025_EUDR:gardens",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 8,
    },
];

// =============================================================================
// WMS LAYER MANAGER - QUẢN LÝ LỚP WMS
// =============================================================================

/**
 * Class quản lý các layer WMS cho một map instance
 * Hỗ trợ load, remove, query thông tin từ WMS services
 */
class WMSLayerManager {
    /**
     * Khởi tạo WMS Layer Manager
     * @param {Object} view - ArcGIS SceneView instance
     * @param {Object} map - ArcGIS Map instance
     * @param {Array} wmsLayers - Danh sách cấu hình WMS layers
     */
    constructor(view, map, wmsLayers = DEFAULT_WMS_LAYERS) {
        this.view = view;
        this.map = map;
        this.wmsLayers = new Map();
        this.wmsConfigs = wmsLayers;
        this.setupCORS();
    }

    /**
     * Thiết lập CORS cho các server WMS
     * Cho phép truy cập cross-origin đến các WMS endpoints
     */
    setupCORS() {
        require(["esri/config"], (esriConfig) => {
            if (!esriConfig.request) return;

            if (!esriConfig.request.corsEnabledServers) {
                esriConfig.request.corsEnabledServers = [];
            }

            // Tự động extract domains từ WMS layers
            const domains = this.extractDomainsFromWMSLayers();

            // Thêm các domain vào CORS enabled servers
            domains.forEach((domain) => {
                if (!esriConfig.request.corsEnabledServers.includes(domain)) {
                    esriConfig.request.corsEnabledServers.push(domain);
                }
            });
        });
    }

    /**
     * Extract domains từ danh sách WMS layers
     * @returns {Array} Mảng các domain unique
     */
    extractDomainsFromWMSLayers() {
        const domains = new Set(); // Dùng Set để tránh duplicate

        this.wmsConfigs.forEach((layer) => {
            if (layer.url) {
                const domain = this.extractDomainFromURL(layer.url);
                if (domain) {
                    domains.add(domain);
                }
            }

            // Nếu có wfsUrl riêng thì cũng extract
            if (layer.wfsUrl) {
                const wfsDomain = this.extractDomainFromURL(layer.wfsUrl);
                if (wfsDomain) {
                    domains.add(wfsDomain);
                }
            }
        });

        return Array.from(domains);
    }

    /**
     * Extract domain từ URL
     * @param {string} url - URL cần extract domain
     * @returns {string|null} Domain hoặc null nếu invalid
     */
    extractDomainFromURL(url) {
        try {
            const urlObj = new URL(url);

            // Lấy hostname (bao gồm subdomain)
            // Ví dụ: https://maps-150.ifee.edu.vn:8453/geoserver/ws/wms
            // => maps-150.ifee.edu.vn
            let domain = urlObj.hostname;

            return domain;
        } catch (error) {
            console.warn(`Invalid URL for CORS extraction: ${url}`, error);
            return null;
        }
    }

    /**
     * Zoom đến extent của WMS layer dựa trên GetCapabilities
     * @param {string} wmsUrl - URL của WMS service
     * @param {string} layerName - Tên layer cần zoom đến
     */
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

                    if (
                        nameElement &&
                        nameElement.textContent.includes(layerName)
                    ) {
                        const bboxElement =
                            layer.getElementsByTagName("BoundingBox")[0];

                        if (bboxElement) {
                            this.performWMSZoom(bboxElement);
                            return;
                        }
                    }
                }
                console.log("No matching layer found for zoom");
            })
            .catch((error) =>
                console.error("Error getting WMS capabilities:", error)
            );
    }

    /**
     * Thực hiện zoom đến extent được chỉ định
     * @param {Element} bboxElement - DOM element chứa thông tin BoundingBox
     */
    async performWMSZoom(bboxElement) {
        // Lấy MapInstance để dùng hàm performZoom chung

        const mapInstance = MAP_INSTANCES.get(this.view.container.id);
        console.log({ bboxElement, mapInstance });
        if (!mapInstance) {
            console.error("Map instance not found");
            return;
        }

        try {
            await mapInstance.performZoom(
                {
                    type: "extent",
                    xmin: parseFloat(bboxElement.getAttribute("minx")),
                    ymin: parseFloat(bboxElement.getAttribute("miny")),
                    xmax: parseFloat(bboxElement.getAttribute("maxx")),
                    ymax: parseFloat(bboxElement.getAttribute("maxy")),
                    z: 800000,
                },
                {
                    expandFactor: 1.2, // Mở rộng extent
                }
            );
        } catch (error) {
            console.error("Failed to zoom to WMS extent:", error);
        }
    }

    /**
     * Tạo danh sách WMS layers trong container HTML
     * @param {HTMLElement} container - Container element để chứa danh sách
     */
    initializeWMSList(container) {
        if (!container) return;

        container.innerHTML = "";
        const wmsListElement = document.createElement("ul");
        wmsListElement.className = "wms-list";
        wmsListElement.style.cssText = `
            list-style: none;
            padding: 0;
            margin: 0;
        `;

        this.wmsConfigs.forEach((wmsConfig) => {
            const listItem = this.createWMSListItem(wmsConfig);
            wmsListElement.appendChild(listItem);
        });

        container.appendChild(wmsListElement);
    }

    /**
     * Tạo một item trong danh sách WMS
     * @param {Object} wmsConfig - Cấu hình WMS layer
     * @returns {HTMLElement} List item element
     */
    createWMSListItem(wmsConfig) {
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
                        data-container-id="${this.view.container.id}">
                    <i class="bi bi-eye"></i>
                </button>
            </div>
        `;

        // Thêm event listener cho button toggle
        const button = listItem.querySelector(".toggle-wms");
        button.addEventListener("click", () => {
            this.toggleWMSLayer(wmsConfig.id, button);
        });

        return listItem;
    }

    /**
     * Bật/tắt hiển thị WMS layer
     * @param {string} wmsId - ID của WMS layer
     * @param {HTMLElement} button - Button element để cập nhật UI
     */
    toggleWMSLayer(wmsId, button) {
        const wmsConfig = this.wmsConfigs.find((config) => config.id === wmsId);
        if (!wmsConfig) return;

        button.disabled = true;

        if (this.wmsLayers.has(wmsId)) {
            // Remove layer
            this.removeWMSLayer(wmsId);
            button.classList.remove("active");
            button.innerHTML = '<i class="bi bi-eye"></i>';
            button.disabled = false;
        } else {
            // Add layer
            button.innerHTML = '<i class="bi bi-hourglass-split"></i>';
            this.createAndAddWMSLayer(wmsConfig)
                .then(() => {
                    button.classList.add("active");
                    button.innerHTML = '<i class="bi bi-eye-slash"></i>';

                    const visibleLayers = Array.from(this.wmsLayers.keys())
                        .map((id) =>
                            this.wmsConfigs.find((config) => config.id === id)
                        )
                        .filter((config) => config) // Lọc null/undefined
                        .sort((a, b) => a.zoomPriority - b.zoomPriority);

                    // Zoom đến layer vừa thêm nếu nó có priority cao nhất
                    if (
                        visibleLayers.length > 0 &&
                        visibleLayers[0].id === wmsId
                    ) {
                        this.zoomToWMSExtent(
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
    }

    /**
     * Tạo và thêm WMS layer vào map (cập nhật để sync UI)
     * @param {Object} config - Cấu hình WMS layer
     * @param {Object} options - Tùy chọn bổ sung (CQL filter, etc.)
     * @returns {Promise} Promise resolve khi layer được load thành công
     */
    createAndAddWMSLayer(config, options = {}) {
        return new Promise((resolve, reject) => {
            require(["esri/layers/WMSLayer"], (WMSLayer) => {
                // Xử lý CQL Filter nếu có
                const cqlFilter = this.buildCQLFilter(
                    config.cqlFilter,
                    options.cqlFilter
                );

                // Tạo custom parameters cho WMS request
                const customParameters = {
                    transparent: true,
                    format: "image/png",
                    ...(cqlFilter && { CQL_FILTER: cqlFilter }),
                };

                const wmsLayer = new WMSLayer({
                    url: config.url,
                    sublayers: [{ name: config.layer }],
                    version: config.version,
                    customParameters: customParameters,
                    opacity: 0.8,
                });

                wmsLayer
                    .load()
                    .then(() => {
                        this.map.add(wmsLayer);
                        this.wmsLayers.set(config.id, wmsLayer);
                        wmsLayer.cqlFilter = cqlFilter;

                        // THÊM: Cập nhật UI button state khi load thành công
                        this.updateButtonStateForLayer(config.id, true);

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
    }

    /**
     * Xóa WMS layer khỏi map
     * @param {string} wmsId - ID của WMS layer cần xóa
     */
    removeWMSLayer(wmsId) {
        const wmsLayer = this.wmsLayers.get(wmsId);
        if (wmsLayer) {
            this.map.remove(wmsLayer);
            this.wmsLayers.delete(wmsId);
        }
    }

    /**
     * Load các WMS layers mặc định
     * Tự động hiển thị các layer có defaultVisible = true
     */
    loadDefaultWMSLayers() {
        const defaultLayers = this.wmsConfigs
            .filter((config) => config.defaultVisible)
            .sort((a, b) => a.zoomPriority - b.zoomPriority);

        if (defaultLayers.length === 0) return;

        const loadPromises = defaultLayers.map((config) =>
            this.createAndAddWMSLayer(config)
        );

        Promise.all(loadPromises)
            .then(() => {
                // THÊM: Cập nhật UI cho các default layers
                defaultLayers.forEach((config) => {
                    this.updateButtonStateForLayer(config.id, true);
                });

                // Zoom đến layer có priority cao nhất
                if (defaultLayers.length > 0) {
                    const highestPriorityLayer = defaultLayers[0];
                    this.zoomToWMSExtent(
                        highestPriorityLayer.url,
                        highestPriorityLayer.layer.split(":")[1]
                    );
                }
            })
            .catch((error) =>
                console.error("Error loading default layers:", error)
            );
    }

    /**
     * Cập nhật trạng thái UI button cho một layer
     * @param {string} wmsId - ID của WMS layer
     * @param {boolean} isActive - Trạng thái active (true = mở, false = đóng)
     */
    updateButtonStateForLayer(wmsId, isActive) {
        // Tìm button theo data-wms-id và container-id
        const button = document.querySelector(
            `button[data-wms-id="${wmsId}"][data-container-id="${this.view.container.id}"]`
        );

        if (button) {
            if (isActive) {
                button.classList.add("active");
                button.innerHTML = '<i class="bi bi-eye-slash"></i>';
            } else {
                button.classList.remove("active");
                button.innerHTML = '<i class="bi bi-eye"></i>';
            }
        } else {
            // Nếu button chưa tồn tại, thử lại sau một chút (cho trường hợp UI chưa render xong)
            setTimeout(() => {
                this.updateButtonStateForLayer(wmsId, isActive);
            }, 500);
        }
    }

    /**
     * Xây dựng CQL Filter từ nhiều điều kiện
     * @param {string} baseFilter - Filter cơ bản
     * @param {string} additionalFilter - Filter bổ sung
     * @returns {string|null} CQL Filter string hoặc null
     */
    buildCQLFilter(baseFilter, additionalFilter) {
        let filters = [];
        if (baseFilter && baseFilter.trim()) {
            filters.push(`(${baseFilter})`);
        }
        if (additionalFilter && additionalFilter.trim()) {
            filters.push(`(${additionalFilter})`);
        }
        return filters.length > 0 ? filters.join(" AND ") : null;
    }

    /**
     * Xử lý sự kiện click trên map để query thông tin WMS
     * @param {Object} event - Map click event
     */
    async handleMapClick(event) {
        try {
            // THÊM: Validation popup trước khi sử dụng
            if (
                !this.view ||
                !this.view.popup ||
                typeof this.view.popup.open !== "function"
            ) {
                console.warn("Popup not available, skipping click handler");
                return;
            }

            // Tìm layer có priority cao nhất
            const highestPriorityLayer = Array.from(this.wmsLayers.entries())
                .map(([id, layer]) => ({
                    id,
                    layer,
                    config: this.wmsConfigs.find((c) => c.id === id),
                }))
                .sort(
                    (a, b) => a.config.zoomPriority - b.config.zoomPriority
                )[0];

            if (!highestPriorityLayer) return;

            // THÊM: Validation popup trước mỗi lần sử dụng
            if (
                !this.view.popup ||
                typeof this.view.popup.open !== "function"
            ) {
                console.warn("Popup became unavailable during execution");
                return;
            }

            // Hiển thị loading state
            this.view.popup.open({
                location: event.mapPoint,
                content: "Đang tải thông tin...",
            });

            // Query thông tin từ WMS
            const result = await this.getFeatureInfo(
                event,
                highestPriorityLayer.layer,
                highestPriorityLayer.config
            );

            if (!result.data || result.data.length === 0) {
                this.view.popup.content =
                    "Không tìm thấy thông tin tại vị trí này.";
                return;
            }

            // Hiển thị popup với thông tin
            this.displayFeatureInfo(result, event.mapPoint);
        } catch (error) {
            console.error("Error in handleMapClick:", error);
            if (
                this.view &&
                this.view.popup &&
                typeof this.view.popup.open === "function"
            ) {
                this.view.popup.content =
                    "Có lỗi xảy ra khi truy vấn thông tin.";
            } else {
                // Fallback: Hiển thị alert nếu popup không khả dụng
                console.warn("Cannot show error in popup, popup unavailable");
            }
        }
    }

    /**
     * Thực hiện GetFeatureInfo request đến WMS service
     * @param {Object} event - Map click event
     * @param {Object} wmsLayer - WMS layer object
     * @param {Object} wmsConfig - WMS layer configuration
     * @returns {Promise} Promise với kết quả query
     */
    getFeatureInfo(event, wmsLayer, wmsConfig) {
        return new Promise((resolve) => {
            require(["esri/geometry/support/webMercatorUtils"], (
                webMercatorUtils
            ) => {
                // Xử lý tọa độ click point
                const screenPoint = event.screenPoint;
                const mapPoint = event.mapPoint;

                // Chuẩn hóa tọa độ về WGS84
                let clickPointWGS84;
                if (mapPoint.spatialReference.wkid === 4326) {
                    clickPointWGS84 = mapPoint;
                } else if (
                    mapPoint.spatialReference.wkid === 102100 ||
                    mapPoint.spatialReference.wkid === 3857
                ) {
                    clickPointWGS84 =
                        webMercatorUtils.webMercatorToGeographic(mapPoint);
                }

                if (!clickPointWGS84) {
                    resolve({
                        data: [],
                        error: "Failed to convert coordinates",
                    });
                    return;
                }

                // Xử lý extent cho bounding box
                const extent = this.view.extent;
                let bboxForWMS;

                if (extent.spatialReference.wkid === 4326) {
                    bboxForWMS = extent;
                } else {
                    bboxForWMS =
                        webMercatorUtils.webMercatorToGeographic(extent);
                }

                if (!bboxForWMS) {
                    resolve({ data: [], error: "Failed to convert extent" });
                    return;
                }

                // Tạo GetFeatureInfo request
                this.executeGetFeatureInfo({
                    wmsConfig,
                    wmsLayer,
                    screenPoint,
                    bboxForWMS,
                    clickPointWGS84,
                    viewWidth: this.view.width,
                    viewHeight: this.view.height,
                }).then(resolve);
            });
        });
    }

    /**
     * Thực thi GetFeatureInfo request
     * @param {Object} params - Tham số cho request
     * @returns {Promise} Promise với kết quả
     */
    executeGetFeatureInfo(params) {
        return new Promise((resolve) => {
            const {
                wmsConfig,
                wmsLayer,
                screenPoint,
                bboxForWMS,
                clickPointWGS84,
                viewWidth,
                viewHeight,
            } = params;

            // Tạo URL GetFeatureInfo
            const url = new URL(wmsConfig.url);
            const requestParams = new URLSearchParams({
                SERVICE: "WMS",
                VERSION: wmsConfig.version,
                REQUEST: "GetFeatureInfo",
                LAYERS: wmsConfig.layer,
                QUERY_LAYERS: wmsConfig.layer,
                STYLES: "",
                BBOX: `${bboxForWMS.xmin},${bboxForWMS.ymin},${bboxForWMS.xmax},${bboxForWMS.ymax}`,
                WIDTH: viewWidth,
                HEIGHT: viewHeight,
                FORMAT: "image/png",
                INFO_FORMAT: "application/json",
                SRS: "EPSG:4326",
                X: Math.round(screenPoint.x),
                Y: Math.round(screenPoint.y),
                TRANSPARENT: "true",
            });

            // Thêm CQL Filter nếu có
            const cqlFilter = this.buildCQLFilter(wmsLayer.cqlFilter);
            if (cqlFilter) {
                requestParams.set("CQL_FILTER", cqlFilter);
            }

            const getFeatureInfoUrl = `${url.origin}${
                url.pathname
            }?${requestParams.toString()}`;

            // Thực hiện HTTP request
            fetch(getFeatureInfoUrl)
                .then((response) => response.text())
                .then((text) => {
                    try {
                        // Kiểm tra lỗi XML
                        if (
                            text.startsWith("<?xml") ||
                            text.startsWith("<ServiceExceptionReport")
                        ) {
                            resolve({
                                layerId: wmsConfig.id,
                                layerName: wmsConfig.name,
                                data: [],
                                error: "WMS Service Error",
                                clickPoint: clickPointWGS84,
                            });
                            return;
                        }

                        // Parse JSON response
                        const response = JSON.parse(text);
                        resolve({
                            layerId: wmsConfig.id,
                            layerName: wmsConfig.name,
                            data: response.features || [],
                            clickPoint: clickPointWGS84,
                        });
                    } catch (e) {
                        resolve({
                            layerId: wmsConfig.id,
                            layerName: wmsConfig.name,
                            data: [],
                            error: "Error parsing response",
                            clickPoint: clickPointWGS84,
                        });
                    }
                })
                .catch(() => {
                    resolve({
                        layerId: wmsConfig.id,
                        layerName: wmsConfig.name,
                        data: [],
                        error: "Network error",
                        clickPoint: clickPointWGS84,
                    });
                });
        });
    }

    /**
     * Hiển thị thông tin feature trong popup
     * @param {Object} result - Kết quả query
     * @param {Object} mapPoint - Điểm click trên map
     */
    displayFeatureInfo(result, mapPoint) {
        require(["esri/Graphic", "esri/PopupTemplate"], (
            Graphic,
            PopupTemplate
        ) => {
            const feature = result.data[0];

            // Tạo graphic cho popup
            const graphic = new Graphic({
                geometry: {
                    type: "point",
                    longitude: result.clickPoint.longitude,
                    latitude: result.clickPoint.latitude,
                    spatialReference: { wkid: 4326 },
                },
                attributes: feature.properties,
            });

            // Tạo popup template
            const popupTemplate = new PopupTemplate({
                title: feature.properties.churung || "Thông tin khu vực",
                content: this.createPopupContent(result),
            });

            graphic.popupTemplate = popupTemplate;

            // Hiển thị popup
            this.view.popup.open({
                location: mapPoint,
                features: [graphic],
            });
        });
    }

    /**
     * Tạo nội dung cho popup
     * @param {Object} result - Kết quả query
     * @returns {Array} Mảng content cho popup
     */
    createPopupContent(result) {
        const feature = result.data[0];
        const properties = feature.properties;

        // Lọc và sắp xếp các thuộc tính
        const fieldInfos = Object.entries(properties)
            .filter(([key, value]) => {
                const excludedFields = ["id", "geometry_name", "geom"];
                return (
                    !excludedFields.includes(key) &&
                    value !== null &&
                    value !== ""
                );
            })
            .map(([key, value]) => ({
                fieldName: key,
                label: this.getPropertyLabel(key),
                visible: true,
                format: this.getFieldFormat(key, value),
            }))
            .filter((field) => field.format !== undefined);

        return [
            {
                type: "text",
                text: `
                    <div class="coordinates-info">
                        <strong>Tọa độ (WGS84):</strong><br>
                        Kinh độ: ${result.clickPoint.longitude.toFixed(6)}<br>
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
        ];
    }

    /**
     * Lấy nhãn hiển thị cho thuộc tính
     * @param {string} key - Tên thuộc tính
     * @returns {string} Nhãn hiển thị
     */
    getPropertyLabel(key) {
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
        };
        return labelMap[key] || this.formatKeyToLabel(key);
    }

    /**
     * Format key thành label khi không có trong mapping
     * @param {string} key - Key cần format
     * @returns {string} Label đã format
     */
    formatKeyToLabel(key) {
        return key
            .split("_")
            .map(
                (word) =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join(" ");
    }

    /**
     * Lấy format hiển thị cho field
     * @param {string} key - Tên field
     * @param {*} value - Giá trị field
     * @returns {Object|null} Format object hoặc null
     */
    getFieldFormat(key, value) {
        if (typeof value !== "number") return null;

        switch (key) {
            case "dtich":
                return { digitSeparator: true, places: 2 };
            case "namtr":
            case "captuoi":
            case "matinh":
            case "mahuyen":
            case "maxa":
                return { digitSeparator: true, places: 0 };
            default:
                return value % 1 === 0
                    ? { digitSeparator: true, places: 0 }
                    : { digitSeparator: true, places: 2 };
        }
    }
}

// =============================================================================
// SKETCH MANAGER - QUẢN LÝ CÔNG CỤ VẼ
// =============================================================================

/**
 * Class quản lý công cụ vẽ và chỉnh sửa polygon
 * Hỗ trợ vẽ, gộp, tách, lưu polygon
 */
class SketchManager {
    /**
     * Khởi tạo Sketch Manager
     * @param {Object} view - ArcGIS SceneView instance
     * @param {Object} options - Tùy chọn cấu hình
     */
    constructor(view, options = {}) {
        this.view = view;
        this.map = view.map;
        this.options = {
            enableSave: true,
            enableMerge: true,
            enableSplit: true,
            apiEndpoint: "/api/polygons/save",
            ...options,
        };

        // State variables
        this.sketch = null;
        this.sketchLayer = null;
        this.mergeButton = null;
        this.splitButton = null;
        this.saveButton = null;
        this.splitSketch = null;
        this.splitLayer = null;
        this.isSplitMode = false;
        this.selectedPolygonForSplit = null;
        this.escKeyHandler = null;
        this.savedPolygons = [];
        this.isDirty = false;
        this._modules = null;

        // Symbol definitions
        this.fillSymbol = {
            type: "simple-fill",
            color: [227, 139, 79, 0.8],
            outline: { color: [255, 255, 255], width: 1 },
        };

        this.mergeSymbol = {
            type: "simple-fill",
            color: [227, 139, 255],
            outline: { color: [255, 255, 255], width: 1 },
        };
    }

    /**
     * Khởi tạo Sketch Manager với tất cả components
     */
    initialize() {
        require([
            "esri/layers/GraphicsLayer",
            "esri/widgets/Sketch",
            "esri/geometry/geometryEngine",
            "esri/Graphic",
            "esri/geometry/support/webMercatorUtils",
        ], (
            GraphicsLayer,
            Sketch,
            geometryEngine,
            Graphic,
            webMercatorUtils
        ) => {
            // Lưu modules để sử dụng trong các methods khác
            this._modules = {
                GraphicsLayer,
                Sketch,
                geometryEngine,
                Graphic,
                webMercatorUtils,
            };

            // Tạo các components chính
            this.createSketchLayer();
            this.createSketchWidget();
            this.setupSketchEvents();

            // Khi sketch widget ready
            this.sketch.when(() => {
                this.enableTooltipsAndLabels();
                this.setupToolButtons();
            });
        });
    }

    /**
     * Tạo graphics layer cho sketch
     */
    createSketchLayer() {
        this.sketchLayer = new this._modules.GraphicsLayer({
            id: `sketchLayer_${this.view.container.id}`,
            title: "Sketch Layer",
            elevationInfo: { mode: "on-the-ground" },
            visible: false,
        });
        this.map.add(this.sketchLayer);
    }

    /**
     * Tạo sketch widget chính
     */
    createSketchWidget() {
        this.sketch = new this._modules.Sketch({
            view: this.view,
            layer: this.sketchLayer,
            creationMode: "update",
            availableCreateTools: ["polygon"],
            defaultCreateOptions: {
                mode: "click",
                elevationOptions: { enabled: false },
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
                createTools: { point: false, polyline: false, polygon: true },
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
        this.view.ui.add(this.sketch, "top-right");
    }

    /**
     * Tạo split layer tạm thời cho việc vẽ đường cắt
     */
    createSplitLayer() {
        if (!this.splitLayer) {
            this.splitLayer = new this._modules.GraphicsLayer({
                id: `splitLayer_${this.view.container.id}`,
                title: "Split Layer",
                elevationInfo: { mode: "on-the-ground" },
                listMode: "hide", // Ẩn khỏi layer list
                visible: true,
            });
            this.map.add(this.splitLayer);
        }
    }

    /**
     * Tạo sketch widget riêng cho split line
     */
    createSplitSketch() {
        if (!this.splitSketch) {
            this.splitSketch = new this._modules.Sketch({
                view: this.view,
                layer: this.splitLayer,
                creationMode: "single",
                availableCreateTools: ["polyline"],
                defaultCreateOptions: { mode: "click" },
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

            this.view.ui.add(this.splitSketch, "top-right");

            // Event khi vẽ xong split line
            this.splitSketch.on("create", (event) => {
                if (
                    event.state === "complete" &&
                    this.selectedPolygonForSplit
                ) {
                    this.performSplit(event.graphic.geometry);
                }
            });
        }
    }

    /**
     * Thiết lập các event listeners cho sketch widget
     */
    setupSketchEvents() {
        // Event khi tạo mới polygon
        this.sketch.on("create", (event) => {
            if (event.state === "complete") {
                const graphic = event.graphic;
                if (graphic) {
                    graphic.symbol = this.fillSymbol;
                    graphic.elevationInfo = { mode: "on-the-ground" };
                    this.trackChanges();
                }
            }
        });

        // Event khi update polygon
        this.sketch.on("update", (event) => {
            this.updateToolButtonsState(event);

            if (event.state === "complete") {
                this.resetButtonStates();
                this.trackChanges();
            }
        });

        // Event khi xóa polygon
        this.sketch.on("delete", () => {
            this.trackChanges();
        });
    }

    /**
     * Bật tooltip và labels cho sketch widget
     */
    enableTooltipsAndLabels() {
        if (this.sketch.viewModel) {
            // Bật tooltip (chú giải công cụ)
            if (this.sketch.viewModel.tooltipOptions) {
                this.sketch.viewModel.tooltipOptions.enabled = true;
            }
            // Bật labels (nhãn phân vùng)
            if (this.sketch.viewModel.labelOptions) {
                this.sketch.viewModel.labelOptions.enabled = true;
            }
            // Backup methods
            this.sketch.viewModel.set("tooltipsEnabled", true);
            this.sketch.viewModel.set("labelsEnabled", true);
        }
    }

    /**
     * Thiết lập các tool buttons (merge, split, save)
     */
    setupToolButtons() {
        if (this.options.enableSplit) {
            this.createSplitLayer();
        }

        setTimeout(() => {
            let allCreated = true;

            if (this.options.enableMerge) {
                allCreated &= this.createMergeButton();
            }
            if (this.options.enableSave) {
                allCreated &= this.createSaveButton();
            }
            if (this.options.enableSplit) {
                allCreated &= this.createSplitButton();
            }

            if (allCreated) return;

            // Fallback với MutationObserver nếu buttons chưa tạo được
            this.setupButtonObserver();
        }, 1000);
    }

    /**
     * Thiết lập MutationObserver để tạo buttons khi DOM ready
     */
    setupButtonObserver() {
        const sketchContainer = this.sketch.container;
        const observer = new MutationObserver(() => {
            let allCreated = true;

            if (this.options.enableMerge && !this.mergeButton) {
                allCreated &= this.createMergeButton();
            }
            if (this.options.enableSave && !this.saveButton) {
                allCreated &= this.createSaveButton();
            }
            if (this.options.enableSplit && !this.splitButton) {
                allCreated &= this.createSplitButton();
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
    }

    /**
     * Tạo merge button trong toolbar
     */
    createMergeButton() {
        const actionBar = this.sketch.container.querySelector(
            "calcite-action-bar[calcite-hydrated]"
        );
        if (!actionBar) return false;

        const polygonGroup = this.findPolygonGroup(actionBar);
        if (!polygonGroup) return false;

        const mergeGroup = document.createElement("calcite-action-group");
        mergeGroup.setAttribute("layout", "horizontal");
        mergeGroup.setAttribute("scale", "m");

        const mergeAction = document.createElement("calcite-action");
        mergeAction.setAttribute("title", "Chọn ít nhất 2 vùng để gộp");
        mergeAction.setAttribute("scale", "m");
        mergeAction.setAttribute("appearance", "solid");
        mergeAction.style.display = "block";
        mergeAction.setAttribute("disabled", "true");
        mergeAction.innerHTML = "<i class='bi bi-subtract'></i>";

        mergeAction.addEventListener("click", () => this.handleMerge());
        mergeGroup.appendChild(mergeAction);
        polygonGroup.parentNode.insertBefore(
            mergeGroup,
            polygonGroup.nextSibling
        );

        this.mergeButton = mergeAction;
        return true;
    }

    /**
     * Tạo save button trong toolbar
     */
    createSaveButton() {
        const actionBar = this.sketch.container.querySelector(
            "calcite-action-bar[calcite-hydrated]"
        );
        if (!actionBar) return false;

        const mergeGroup = actionBar.querySelector(
            "calcite-action-group:has(calcite-action[title*='Gộp'])"
        );
        const polygonGroup = this.findPolygonGroup(actionBar);

        const saveGroup = document.createElement("calcite-action-group");
        saveGroup.setAttribute("layout", "horizontal");
        saveGroup.setAttribute("scale", "m");

        const saveAction = document.createElement("calcite-action");
        saveAction.setAttribute("title", "Không có polygon để lưu");
        saveAction.setAttribute("scale", "m");
        saveAction.setAttribute("appearance", "solid");
        saveAction.style.display = "block";
        saveAction.setAttribute("disabled", "true");
        saveAction.innerHTML = "<i class='bi bi-cloud-upload'></i>";

        saveAction.addEventListener("click", () => this.handleSave());
        saveGroup.appendChild(saveAction);

        // Chèn sau merge group hoặc polygon group
        const insertAfter = mergeGroup || polygonGroup;
        insertAfter.parentNode.insertBefore(saveGroup, insertAfter.nextSibling);

        this.saveButton = saveAction;
        return true;
    }

    /**
     * Tạo split button trong toolbar
     */
    createSplitButton() {
        const actionBar = this.sketch.container.querySelector(
            "calcite-action-bar[calcite-hydrated]"
        );
        if (!actionBar) return false;

        const saveGroup = actionBar.querySelector(
            "calcite-action-group:has(calcite-action[title*='lưu'])"
        );
        const mergeGroup = actionBar.querySelector(
            "calcite-action-group:has(calcite-action[title*='Gộp'])"
        );
        const polygonGroup = this.findPolygonGroup(actionBar);

        const splitGroup = document.createElement("calcite-action-group");
        splitGroup.setAttribute("layout", "horizontal");
        splitGroup.setAttribute("scale", "m");

        const splitAction = document.createElement("calcite-action");
        splitAction.setAttribute("title", "Chọn 1 vùng để tách");
        splitAction.setAttribute("scale", "m");
        splitAction.setAttribute("appearance", "solid");
        splitAction.style.display = "block";
        splitAction.setAttribute("disabled", "true");
        splitAction.innerHTML = "<i class='bi bi-scissors'></i>";

        splitAction.addEventListener("click", () => this.handleSplit());
        splitGroup.appendChild(splitAction);

        // Chèn sau save/merge/polygon group
        const insertAfter = saveGroup || mergeGroup || polygonGroup;
        insertAfter.parentNode.insertBefore(
            splitGroup,
            insertAfter.nextSibling
        );

        this.splitButton = splitAction;
        return true;
    }

    /**
     * Tìm polygon group trong action bar
     */
    findPolygonGroup(actionBar) {
        const polygonAction = actionBar.querySelector(
            'calcite-action[data-action-key="polygon-button"]'
        );
        return polygonAction
            ? polygonAction.closest("calcite-action-group")
            : null;
    }

    /**
     * Cập nhật trạng thái của tất cả tool buttons
     */
    updateToolButtonsState(event) {
        const graphics = event?.graphics || this.sketch.updateGraphics;
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
    }

    /**
     * Reset trạng thái các buttons về disabled
     */
    resetButtonStates() {
        if (this.mergeButton) {
            this.mergeButton.setAttribute("disabled", "true");
            this.mergeButton.setAttribute(
                "title",
                "Chọn ít nhất 2 vùng để gộp"
            );
        }
        if (this.splitButton) {
            this.splitButton.setAttribute("disabled", "true");
            this.splitButton.setAttribute("title", "Chọn 1 vùng để tách");
        }
    }

    /**
     * Xử lý merge polygons
     */
    handleMerge() {
        const selectedGraphics = this.sketch.updateGraphics;
        if (!selectedGraphics || selectedGraphics.length < 2) return;

        try {
            const { webMercatorUtils, geometryEngine, Graphic } = this._modules;
            const updatedGeometry = [];

            // Chuẩn hóa geometry về cùng spatial reference
            selectedGraphics.forEach((graphic) => {
                if (!graphic?.geometry) return;

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

            // Thực hiện union
            const joinedPolygon = geometryEngine.union(updatedGeometry);
            if (!joinedPolygon) return;

            // Xóa polygons gốc
            selectedGraphics.forEach((graphic) => {
                if (graphic) this.sketchLayer.remove(graphic);
            });

            // Thêm polygon đã merge
            const resultGraphic = new Graphic({
                geometry: joinedPolygon,
                symbol: this.mergeSymbol,
                elevationInfo: { mode: "on-the-ground" },
                attributes: {
                    creator: "sketch_tool",
                    createdAt: new Date().toISOString(),
                    type: "merged",
                },
            });

            this.sketchLayer.add(resultGraphic);

            // Clear selection
            if (this.sketch.updateGraphics) {
                this.sketch.updateGraphics.removeAll();
            }

            this.trackChanges();
        } catch (error) {
            console.error("Error during merge:", error);
        }
    }

    /**
     * Xử lý split polygon
     */
    handleSplit() {
        const selectedGraphics = this.sketch.updateGraphics;
        if (!selectedGraphics || selectedGraphics.length !== 1) return;

        // Tạo split sketch nếu chưa có
        if (!this.splitSketch) {
            this.createSplitSketch();
        }

        this.enterSplitMode();
    }

    /**
     * Vào chế độ split
     */
    enterSplitMode() {
        const selectedGraphics = this.sketch.updateGraphics;
        if (!selectedGraphics || selectedGraphics.length !== 1) return;

        this.selectedPolygonForSplit = selectedGraphics.getItemAt(0);
        this.isSplitMode = true;

        // Ẩn sketch chính, hiện split sketch
        this.sketch.visible = false;
        this.splitSketch.visible = true;

        // Auto activate polyline tool
        setTimeout(() => {
            if (
                this.splitSketch &&
                this.splitSketch.activeTool !== "polyline"
            ) {
                this.splitSketch.create("polyline");
            }
        }, 100);

        // Thay đổi cursor và hiển thị hướng dẫn
        this.view.container.style.cursor = "crosshair";
        this.showSplitInstruction();
    }

    /**
     * Thoát chế độ split
     */
    exitSplitMode() {
        this.isSplitMode = false;
        this.selectedPolygonForSplit = null;

        // Hiện lại sketch chính
        if (this.splitSketch) {
            this.splitSketch.visible = false;
        }
        this.sketch.visible = true;

        // Auto select pointer tool
        setTimeout(() => {
            if (this.sketch && typeof this.sketch.cancel === "function") {
                this.sketch.cancel();
            }
        }, 100);

        // Reset cursor và UI
        this.view.container.style.cursor = "default";

        if (this.splitLayer) {
            this.splitLayer.removeAll();
        }

        if (this.sketch.updateGraphics) {
            this.sketch.updateGraphics.removeAll();
        }

        this.hideSplitInstruction();
    }

    /**
     * Thực hiện split polygon với line do user vẽ
     */
    performSplit(splitLine) {
        if (!this.selectedPolygonForSplit || !splitLine) return;

        const { webMercatorUtils, geometryEngine, Graphic } = this._modules;

        try {
            let polygonGeometry = this.selectedPolygonForSplit.geometry;
            let splitLineGeometry = splitLine;

            // Chuẩn hóa spatial reference
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

            // Extend line để đảm bảo cắt qua polygon
            const extendedLine = geometryEngine.geodesicDensify(
                splitLineGeometry,
                1000,
                "meters"
            );

            // Thực hiện cut
            const splitResult = geometryEngine.cut(
                polygonGeometry,
                extendedLine
            );

            if (splitResult && splitResult.length > 1) {
                // Xóa polygon gốc
                this.sketchLayer.remove(this.selectedPolygonForSplit);

                // Thêm các polygon đã split
                splitResult.forEach((splitGeom, index) => {
                    const splitGraphic = new Graphic({
                        geometry: splitGeom,
                        symbol: {
                            type: "simple-fill",
                            color:
                                index === 0
                                    ? [227, 139, 79, 0.8]
                                    : [139, 227, 79, 0.8],
                            outline: { color: [255, 255, 255], width: 1 },
                        },
                        elevationInfo: { mode: "on-the-ground" },
                        attributes: {
                            creator: "sketch_tool",
                            createdAt: new Date().toISOString(),
                            type: "split",
                            splitIndex: index,
                        },
                    });
                    this.sketchLayer.add(splitGraphic);
                });

                this.trackChanges();
                console.log(`Split polygon into ${splitResult.length} parts`);
            } else {
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
    }

    /**
     * Hiển thị hướng dẫn split
     */
    showSplitInstruction() {
        const instruction = document.createElement("div");
        instruction.id = `splitInstruction_${this.view.container.id}`;
        instruction.style.cssText = `
            position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
            border-radius: 5px; z-index: 1000; font-size: 14px;
        `;
        instruction.innerHTML = `
            <div>🔪 Vẽ đường cắt qua polygon</div>
            <div><small>Nhấn ESC để hủy</small></div>
        `;
        document.body.appendChild(instruction);

        // ESC key handler
        this.escKeyHandler = (e) => {
            if (e.key === "Escape") {
                this.exitSplitMode();
            }
        };
        document.addEventListener("keydown", this.escKeyHandler);
    }

    /**
     * Ẩn hướng dẫn split
     */
    hideSplitInstruction() {
        const instruction = document.getElementById(
            `splitInstruction_${this.view.container.id}`
        );
        if (instruction) {
            instruction.remove();
        }

        if (this.escKeyHandler) {
            document.removeEventListener("keydown", this.escKeyHandler);
            this.escKeyHandler = null;
        }
    }

    // =============================================================================
    // SAVE FUNCTIONALITY - CHỨC NĂNG LƯU
    // =============================================================================

    /**
     * Đếm số polygon trên layer
     */
    getPolygonCount() {
        return this.sketchLayer ? this.sketchLayer.graphics.length : 0;
    }

    /**
     * Kiểm tra có thay đổi chưa lưu
     */
    hasUnsavedChanges() {
        return this.isDirty || this.getPolygonCount() > 0;
    }

    /**
     * Track changes để cập nhật save button
     */
    trackChanges() {
        this.isDirty = true;
        this.updateSaveButtonState();
    }

    /**
     * Cập nhật trạng thái save button
     */
    updateSaveButtonState() {
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

            // Thay đổi màu theo trạng thái
            this.saveButton.style.background = hasUnsaved
                ? "#ff9800"
                : "#4caf50";
        } else {
            this.saveButton.setAttribute("disabled", "true");
            this.saveButton.setAttribute("title", "Không có polygon để lưu");
            this.saveButton.style.background = "";
        }
    }

    /**
     * Xử lý save polygons
     */
    async handleSave() {
        try {
            const polygonData = this.getAllPolygonsForAPI();

            if (polygonData.polygons.length === 0) {
                alert("Không có polygon nào để lưu!");
                return;
            }

            this.setSaveButtonLoading(true);

            // Gọi API để lưu
            const response = await this.saveToAPI(polygonData);

            if (response.success) {
                this.saveToLocalStorage(polygonData);
                this.savedPolygons = [...polygonData.polygons];
                this.isDirty = false;
                this.showSaveSuccess(polygonData.polygons.length);
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
    }

    /**
     * Chuyển đổi tất cả polygons thành format API
     */
    getAllPolygonsForAPI() {
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
                mapId: this.view.container.id,
                projectId: this.getCurrentProjectId(),
            },
        };
    }

    /**
     * Chuyển đổi graphic thành WKT format
     */
    graphicToWKT(graphic) {
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
                mapId: this.view.container.id,
            },
        };
    }

    /**
     * Tạo ID unique cho polygon
     */
    generatePolygonId() {
        return `polygon_${this.view.container.id}_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
    }

    /**
     * Tính diện tích polygon
     */
    calculatePolygonArea(geometry) {
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
    }

    /**
     * Tính chu vi polygon
     */
    calculatePolygonPerimeter(geometry) {
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
    }

    /**
     * Gọi API để lưu polygons
     */
    async saveToAPI(polygonData) {
        try {
            const response = await fetch(this.options.apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(polygonData),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.warn("API save failed, saving locally only:", error);
            return {
                success: true,
                message: "Đã lưu cục bộ (API không khả dụng)",
            };
        }
    }

    /**
     * Lưu vào localStorage
     */
    saveToLocalStorage(polygonData) {
        try {
            const storageKey = `sketch_polygons_${this.view.container.id}`;
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
    }

    /**
     * Lấy project ID hiện tại
     */
    getCurrentProjectId() {
        return window.currentProjectId || this.view.container.id;
    }

    /**
     * Set loading state cho save button
     */
    setSaveButtonLoading(isLoading) {
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
    }

    /**
     * Hiển thị thông báo thành công
     */
    showSaveSuccess(count) {
        this.showNotification(
            `✅ Đã lưu ${count} polygon thành công!`,
            "success"
        );
    }

    /**
     * Hiển thị thông báo lỗi
     */
    showSaveError(errorMessage) {
        this.showNotification(`❌ Lỗi khi lưu: ${errorMessage}`, "error");
    }

    /**
     * Hệ thống notification
     */
    showNotification(message, type = "info") {
        const notification = document.createElement("div");
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: ${
                type === "success"
                    ? "#4CAF50"
                    : type === "error"
                    ? "#f44336"
                    : "#2196F3"
            };
            color: white; padding: 12px 20px; border-radius: 5px;
            font-size: 14px; max-width: 300px;
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
    }

    /**
     * Toggle visibility của sketch tool
     */
    toggle() {
        if (!this.sketch) return false;

        this.sketch.visible = !this.sketch.visible;
        if (this.sketchLayer) {
            this.sketchLayer.visible = this.sketch.visible;
        }

        // Thoát split mode nếu đang active
        if (this.isSplitMode) {
            this.exitSplitMode();
        }

        // Ẩn/hiện các buttons
        const buttons = [this.mergeButton, this.splitButton, this.saveButton];
        buttons.forEach((button) => {
            if (button) {
                button.style.display = this.sketch.visible ? "block" : "none";
            }
        });

        return this.sketch.visible;
    }

    /**
     * Kiểm tra sketch có đang visible không
     */
    isVisible() {
        return this.sketch ? this.sketch.visible : false;
    }

    /**
     * Cleanup khi destroy instance
     */
    destroy() {
        if (this.escKeyHandler) {
            document.removeEventListener("keydown", this.escKeyHandler);
        }

        if (this.sketch) {
            this.view.ui.remove(this.sketch);
        }

        if (this.splitSketch) {
            this.view.ui.remove(this.splitSketch);
        }

        if (this.sketchLayer) {
            this.map.remove(this.sketchLayer);
        }

        if (this.splitLayer) {
            this.map.remove(this.splitLayer);
        }
    }
}

// =============================================================================
// CONTROL MANAGER - QUẢN LÝ CÁC CONTROL UI
// =============================================================================

/**
 * Class quản lý các control UI (basemap, navigation, etc.)
 */
class ControlManager {
    /**
     * Khởi tạo Control Manager
     * @param {Object} view - ArcGIS SceneView instance
     * @param {Object} options - Tùy chọn cấu hình
     */
    constructor(view, options = {}) {
        this.view = view;
        this.options = {
            enableBasemap: true,
            enableWMS: true,
            enableSketch: true,
            ...options,
        };
        this.wmsManager = null;
        this.sketchManager = null;
    }

    /**
     * Khởi tạo tất cả controls
     * @param {WMSLayerManager} wmsManager - WMS Manager instance
     * @param {SketchManager} sketchManager - Sketch Manager instance
     */
    initializeControls(wmsManager = null, sketchManager = null) {
        this.wmsManager = wmsManager;
        this.sketchManager = sketchManager;

        // Basemap control
        if (this.options.enableBasemap) {
            this.createBasemapControl();
        }

        // WMS control
        if (this.options.enableWMS && this.wmsManager) {
            this.createWMSControl();
        }

        // Sketch control
        if (this.options.enableSketch && this.sketchManager) {
            this.createSketchControl();
        }
    }

    /**
     * Tạo basemap control
     */
    createBasemapControl() {
        const basemapControl = this.createControlButton({
            id: `basemap_${this.view.container.id}`,
            title: "Bản đồ nền",
            icon: "layers",
            offcanvasTitle: "Chọn bản đồ nền",
        });

        // Khởi tạo BasemapGallery
        this.createTrueModernBasemapGallery(basemapControl.contentContainer);
    }

    /**
     * Tạo basemap gallery với web component (NO WARNINGS)
     */
    async createTrueModernBasemapGallery(container) {
        try {
            // Tạo web component
            const basemapGallery = document.createElement(
                "arcgis-basemap-gallery"
            );

            // Set properties
            basemapGallery.style.cssText = `
                width: 100%;
                height: 400px;
                border: none;
                display: block;
            `;

            // Thêm vào DOM trước
            container.appendChild(basemapGallery);

            // Set view reference
            basemapGallery.view = this.view;

            // Optional - set additional properties
            basemapGallery.headingLevel = 4;
        } catch (error) {
            console.error("createTrueModernBasemapGallery failed:", error);
        }
    }

    /**
     * Tạo WMS control
     */
    createWMSControl() {
        const wmsControl = this.createControlButton({
            id: `wms_${this.view.container.id}`,
            title: "Lớp WMS",
            icon: "map",
            offcanvasTitle: "Lớp bản đồ WMS",
        });

        // Khởi tạo WMS list
        this.wmsManager.initializeWMSList(wmsControl.contentContainer);
    }

    /**
     * Tạo sketch control
     */
    createSketchControl() {
        this.createControlButton({
            id: `sketch_${this.view.container.id}`,
            title: "Công cụ vẽ",
            icon: "pencil",
            buttonClass: "sketch-tool-btn",
            onClick: (button) => {
                const isVisible = this.sketchManager.toggle();
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
    }

    /**
     * Tạo control button generic
     */
    createControlButton({
        id,
        title,
        icon,
        offcanvasTitle,
        offcanvasContent = "",
        buttonClass = "",
        onClick,
    }) {
        // Tìm trong container của view hiện tại
        const container = this.view.container.querySelector(
            ".esri-component.esri-navigation-toggle.esri-widget"
        );

        if (!container) {
            console.warn("Navigation toggle container not found");
            return { button: null, offcanvas: null, contentContainer: null };
        }

        const button = document.createElement("button");
        const baseClasses = [
            "border-0",
            "esri-widget--button",
            "esri-widget",
            "esri-interactive",
        ];

        if (buttonClass) baseClasses.push(buttonClass);
        button.className = baseClasses.join(" ");

        button.setAttribute(
            "style",
            "border-top: solid 1px rgba(110, 110, 110, .3) !important;"
        );
        button.setAttribute("type", "button");
        button.setAttribute("title", title);
        button.innerHTML = `<span class="bi bi-${icon}"></span>`;

        // Thêm onclick hoặc offcanvas
        if (onClick) {
            button.onclick = () => onClick(button);
        } else if (offcanvasTitle) {
            button.setAttribute("data-bs-toggle", "offcanvas");
            button.setAttribute("data-bs-target", `#${id}Offcanvas`);
        }

        container.appendChild(button);

        // Tạo offcanvas nếu cần
        let offcanvas = null;
        if (!onClick && offcanvasTitle) {
            offcanvas = this.createOffCanvas(
                id,
                offcanvasTitle,
                offcanvasContent
            );
        }

        return {
            button,
            offcanvas,
            contentContainer: offcanvas?.querySelector(`#${id}Content`) || null,
        };
    }

    /**
     * Tạo offcanvas
     */
    createOffCanvas(id, title, content) {
        const offcanvas = document.createElement("div");
        offcanvas.className = "offcanvas offcanvas-end";
        offcanvas.id = `${id}Offcanvas`;
        offcanvas.innerHTML = `
            <div class="offcanvas-header">
                <h5 class="offcanvas-title">${title}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button>
            </div>
            <div class="offcanvas-body" id="${id}Content">
                ${content}
            </div>
        `;
        document.body.appendChild(offcanvas);
        return offcanvas;
    }

    /**
     * Cleanup khi destroy
     */
    destroy() {
        // Remove offcanvas elements
        const offcanvases = document.querySelectorAll(
            `[id*="${this.view.container.id}Offcanvas"]`
        );
        offcanvases.forEach((element) => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
    }
}

// =============================================================================
// MAP INSTANCE CLASS - CLASS QUẢN LÝ INSTANCE MAP
// =============================================================================

/**
 * Class đại diện cho một instance map hoàn chỉnh
 * Quản lý tất cả các managers và widgets cho một map
 */
class MapInstance {
    /**
     * Khởi tạo Map Instance
     * @param {string} containerId - ID của container chứa map
     * @param {Object} options - Tùy chọn cấu hình map
     */
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        const mergedWMSLayers = options.wmsLayers
            ? [...DEFAULT_WMS_LAYERS, ...options.wmsLayers] // Merge: default + custom
            : DEFAULT_WMS_LAYERS; // Chỉ dùng default

        // Tách wmsLayers ra khỏi options
        const { wmsLayers, ...restOptions } = options;

        this.options = {
            // Map options
            basemap: "satellite",
            ground: "world-elevation",
            center: [105.85, 21.0245],
            zoom: 12,
            qualityProfile: "high",

            // Feature options
            enableWMS: true,
            enableSketch: true,
            enableControls: true,

            // WMS options
            wmsLayers: mergedWMSLayers,
            loadDefaultWMS: true,

            // Sketch options
            sketchOptions: {
                enableSave: true,
                enableMerge: true,
                enableSplit: true,
                apiEndpoint: "/api/polygons/save",
            },

            // Control options
            controlOptions: {
                enableBasemap: true,
                enableWMS: true,
                enableSketch: true,
            },

            ...restOptions,
        };

        // Instance variables
        this.view = null;
        this.map = null;
        this.wmsManager = null;
        this.sketchManager = null;
        this.controlManager = null;
        this.isInitialized = false;
    }

    /**
     * Khởi tạo map instance
     * @returns {Promise} Promise khi map được khởi tạo xong
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn(
                `Map instance ${this.containerId} already initialized`
            );
            return this;
        }

        try {
            await this.createMapAndView();
            await this.initializeManagers();
            this.setupEventHandlers();

            this.isInitialized = true;

            return this;
        } catch (error) {
            console.error(
                `Failed to initialize map instance ${this.containerId}:`,
                error
            );
            throw error;
        }
    }

    /**
     * Tạo Map và SceneView
     */
    createMapAndView() {
        return new Promise((resolve, reject) => {
            require(["esri/Map", "esri/views/SceneView"], (Map, SceneView) => {
                try {
                    // Tạo Map
                    this.map = new Map({
                        basemap: this.options.basemap,
                        ground: this.options.ground,
                    });

                    // Tạo SceneView
                    this.view = new SceneView({
                        container: this.containerId,
                        map: this.map,
                        camera: {
                            position: {
                                longitude: this.options.center[0],
                                latitude: this.options.center[1],
                                z: 40000000,
                            },
                            tilt: 0,
                            heading: 0,
                        },
                        qualityProfile: this.options.qualityProfile,
                    });

                    this.view
                        .when(() => {
                            resolve();
                        })
                        .catch(reject);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Khởi tạo các managers
     */
    async initializeManagers() {
        // Khởi tạo WMS Manager
        if (this.options.enableWMS) {
            this.wmsManager = new WMSLayerManager(
                this.view,
                this.map,
                this.options.wmsLayers
            );

            if (this.options.loadDefaultWMS) {
                this.wmsManager.loadDefaultWMSLayers();
            }
        }

        // Khởi tạo Sketch Manager
        if (this.options.enableSketch) {
            this.sketchManager = new SketchManager(
                this.view,
                this.options.sketchOptions
            );
            this.sketchManager.initialize();
        }

        // Khởi tạo Control Manager
        if (this.options.enableControls) {
            this.controlManager = new ControlManager(
                this.view,
                this.options.controlOptions
            );
            this.controlManager.initializeControls(
                this.wmsManager,
                this.sketchManager
            );
        }

        // Zoom về center nếu không có WMS hoặc không load default WMS
        if (!this.options.enableWMS || !this.options.loadDefaultWMS) {
            this.zoomToCenter();
        }
    }

    /**
     * Hàm zoom chung với các tùy chọn linh hoạt
     * @param {Object} target - Target để zoom đến
     * @param {Object} options - Tùy chọn zoom
     */
    async performZoom(target, options = {}) {
        const defaultOptions = {
            delay: 2000, // Delay trước khi zoom (ms)
            duration: 3000, // Thời gian zoom (ms)
            easing: "out-quad", // Hiệu ứng
            tilt: 0, // Góc nghiêng
            heading: 0, // Hướng
            expandFactor: 1.2, // Hệ số mở rộng cho extent
        };

        const zoomOptions = { ...defaultOptions, ...options };

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Xử lý target dựa trên loại
                let goToTarget = {};

                if (target.type === "center") {
                    // Zoom đến tọa độ center
                    goToTarget = {
                        target: {
                            longitude: target.longitude,
                            latitude: target.latitude,
                        },
                        zoom: target.zoom || this.options.zoom,
                        tilt: zoomOptions.tilt,
                        heading: zoomOptions.heading,
                    };
                } else if (target.type === "extent") {
                    // Zoom đến extent
                    require(["esri/geometry/Extent"], (Extent) => {
                        const extent = new Extent({
                            xmin: target.xmin,
                            ymin: target.ymin,
                            xmax: target.xmax,
                            ymax: target.ymax,
                            spatialReference: { wkid: 4326 },
                        });

                        goToTarget = {
                            target: extent.expand(zoomOptions.expandFactor),
                            tilt: zoomOptions.tilt,
                            heading: zoomOptions.heading,
                            position: { z: target.z || 800000 },
                        };

                        this.executeZoom(
                            goToTarget,
                            zoomOptions,
                            resolve,
                            reject
                        );
                    });
                    return; // Return early cho extent case
                }

                this.executeZoom(goToTarget, zoomOptions, resolve, reject);
            }, zoomOptions.delay);
        });
    }

    /**
     * Thực thi zoom với goTo
     * @param {Object} goToTarget - Target cho view.goTo
     * @param {Object} zoomOptions - Tùy chọn zoom
     * @param {Function} resolve - Promise resolve
     * @param {Function} reject - Promise reject
     */
    executeZoom(goToTarget, zoomOptions, resolve, reject) {
        this.view
            .goTo(goToTarget, {
                duration: zoomOptions.duration,
                easing: zoomOptions.easing,
            })
            .then(() => {
                resolve();
            })
            .catch((error) => {
                console.error("Zoom failed:", error);
                reject(error);
            });
    }

    /**
     * Zoom về tọa độ center được chỉ định trong options
     */
    async zoomToCenter() {
        try {
            await this.performZoom({
                type: "center",
                longitude: this.options.center[0],
                latitude: this.options.center[1],
                zoom: this.options.zoom,
            });
        } catch (error) {
            console.error("Failed to zoom to center:", error);
        }
    }

    /**
     * Thiết lập event handlers
     */
    setupEventHandlers() {
        // Map click handler cho WMS query
        if (this.wmsManager) {
            const boundHandleMapClick = this.wmsManager.handleMapClick.bind(
                this.wmsManager
            );

            this.view.on("click", (event) => {
                // Chỉ xử lý khi không ở chế độ sketch
                if (!this.sketchManager || !this.sketchManager.isVisible()) {
                    // THÊM: Delay nhỏ để đảm bảo view đã ready
                    setTimeout(() => {
                        boundHandleMapClick(event);
                    }, 50);
                }
            });
        }

        // Watch updating state
        require(["esri/core/reactiveUtils"], (reactiveUtils) => {
            reactiveUtils.watch(
                () => this.view.updating,
                (updating) => {
                    if (!updating) {
                        console.log(
                            `Map ${this.containerId} loaded completely`
                        );
                    }
                }
            );
        });
    }

    /**
     * Lấy reference đến các managers
     */
    getWMSManager() {
        return this.wmsManager;
    }

    getSketchManager() {
        return this.sketchManager;
    }

    getControlManager() {
        return this.controlManager;
    }

    getView() {
        return this.view;
    }

    getMap() {
        return this.map;
    }

    /**
     * Destroy map instance và cleanup
     */
    destroy() {
        try {
            // Cleanup managers
            if (this.sketchManager) {
                this.sketchManager.destroy();
            }

            if (this.controlManager) {
                this.controlManager.destroy();
            }

            // Destroy view
            if (this.view) {
                this.view.destroy();
            }

            // Remove from instances map
            MAP_INSTANCES.delete(this.containerId);

            this.isInitialized = false;
            console.log(`Map instance ${this.containerId} destroyed`);
        } catch (error) {
            console.error(
                `Error destroying map instance ${this.containerId}:`,
                error
            );
        }
    }
}

// =============================================================================
// PUBLIC API - API CÔNG KHAI
// =============================================================================

/**
 * Khởi tạo một map instance mới
 * @param {string} containerId - ID của container HTML chứa map
 * @param {Object} options - Tùy chọn cấu hình map
 * @returns {Promise<MapInstance>} Promise resolve với MapInstance
 *
 * @example
 * // Map cơ bản với tất cả tính năng
 * const mapInstance = await initMap3D("mapDiv");
 *
 * @example
 * // Map chỉ hiển thị với WMS, không có sketch tools
 * const viewOnlyMap = await initMap3D("viewMapDiv", {
 *   enableSketch: false,
 *   enableControls: false,
 *   controlOptions: { enableSketch: false }
 * });
 *
 * @example
 * // Map với cấu hình custom
 * const customMap = await initMap3D("customMapDiv", {
 *   basemap: "satellite",
 *   center: [106.7, 10.8], // TP.HCM
 *   wmsLayers: [...customWMSLayers],
 *   sketchOptions: {
 *     enableSave: false,
 *     enableSplit: false
 *   }
 * });
 */
async function initMap3D(containerId, options = {}) {
    // Kiểm tra container tồn tại
    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error(`Container with ID '${containerId}' not found`);
    }

    // Kiểm tra instance đã tồn tại
    if (MAP_INSTANCES.has(containerId)) {
        console.warn(
            `Map instance for '${containerId}' already exists. Destroying old instance.`
        );
        MAP_INSTANCES.get(containerId).destroy();
    }

    // Tạo instance mới
    const mapInstance = new MapInstance(containerId, options);

    try {
        await mapInstance.initialize();
        MAP_INSTANCES.set(containerId, mapInstance);
        return mapInstance;
    } catch (error) {
        console.error(`Failed to initialize map for ${containerId}:`, error);
        throw error;
    }
}

/**
 * Lấy map instance theo container ID
 * @param {string} containerId - ID của container
 * @returns {MapInstance|null} Map instance hoặc null nếu không tìm thấy
 */
function getMapInstance(containerId) {
    return MAP_INSTANCES.get(containerId) || null;
}

/**
 * Lấy tất cả map instances
 * @returns {Map} Map chứa tất cả instances
 */
function getAllMapInstances() {
    return new Map(MAP_INSTANCES);
}

/**
 * Destroy một map instance
 * @param {string} containerId - ID của container cần destroy
 */
function destroyMapInstance(containerId) {
    const instance = MAP_INSTANCES.get(containerId);
    if (instance) {
        instance.destroy();
    } else {
        console.warn(`No map instance found for '${containerId}'`);
    }
}

/**
 * Destroy tất cả map instances
 */
function destroyAllMapInstances() {
    MAP_INSTANCES.forEach((instance, containerId) => {
        try {
            instance.destroy();
        } catch (error) {
            console.error(`Error destroying instance ${containerId}:`, error);
        }
    });
    MAP_INSTANCES.clear();
}

// =============================================================================
// EXPOSE TO GLOBAL SCOPE - XUẤT RA PHẠM VI TOÀN CỤC
// =============================================================================

// Xuất các hàm chính ra window object để có thể sử dụng globally
window.initMap3D = initMap3D;
window.getMapInstance = getMapInstance;
window.getAllMapInstances = getAllMapInstances;
window.destroyMapInstance = destroyMapInstance;
window.destroyAllMapInstances = destroyAllMapInstances;

// Xuất các classes để có thể sử dụng advanced
window.MapInstance = MapInstance;
window.WMSLayerManager = WMSLayerManager;
window.SketchManager = SketchManager;
window.ControlManager = ControlManager;

// Xuất constants
window.DEFAULT_WMS_LAYERS = DEFAULT_WMS_LAYERS;

// =============================================================================
// INITIALIZATION - KHỞI TẠO
// =============================================================================

// Auto cleanup khi page unload
window.addEventListener("beforeunload", () => {
    destroyAllMapInstances();
});

/**
 * =============================================================================
 * USAGE EXAMPLES - VÍ DỤ SỬ DỤNG
 * =============================================================================
 *

// 1. MAP ĐẦY ĐỦ CHỨC NĂNG (mặc định)
const fullMap = await initMap3D("mapDiv1");

// 2. MAP CHỈ XEM - KHÔNG CÓ TOOLS GÌ HẾT
const viewOnlyMap = await initMap3D("mapDiv2", {
    enableWMS: false,           // Tắt WMS layers
    enableSketch: false,        // Tắt sketch tools
    enableControls: false,      // Tắt tất cả controls (basemap, WMS, sketch buttons)
    loadDefaultWMS: false       // Không load WMS mặc định
});

// 3. MAP CHỈ CÓ BASEMAP CONTROL
const basemapOnlyMap = await initMap3D("mapDiv3", {
    enableWMS: false,
    enableSketch: false,
    controlOptions: {
        enableBasemap: true,    // Chỉ bật basemap
        enableWMS: false,       // Tắt WMS control
        enableSketch: false     // Tắt sketch control
    }
});

// 4. MAP CHỈ CÓ WMS - KHÔNG CÓ SKETCH
const wmsOnlyMap = await initMap3D("mapDiv4", {
    enableSketch: false,        // Tắt sketch tools
    controlOptions: {
        enableSketch: false     // Tắt sketch button
    }
});

// 5. MAP CHỈ CÓ SKETCH - KHÔNG CÓ WMS
const sketchOnlyMap = await initMap3D("mapDiv5", {
    enableWMS: false,           // Tắt WMS layers
    loadDefaultWMS: false,      // Không load WMS mặc định
    controlOptions: {
        enableWMS: false        // Tắt WMS control
    }
});

// 6. MAP VẼ NHƯNG KHÔNG LƯU
const drawNoSaveMap = await initMap3D("mapDiv6", {
    sketchOptions: {
        enableSave: false       // Tắt nút save
    }
});

// 7. MAP VẼ ĐƠN GIẢN - CHỈ VẼ KHÔNG MERGE/SPLIT
const simpleDrawMap = await initMap3D("mapDiv7", {
    sketchOptions: {
        enableSave: false,      // Không lưu
        enableMerge: false,     // Không gộp
        enableSplit: false      // Không tách
    }
});

// 8. MAP TUỲ CHỈNH HOÀN TOÀN
const customMap = await initMap3D("mapDiv8", {
    // Map settings
    basemap: "satellite",       // Đổi basemap
    center: [106.7, 10.8],      // Tọa độ TP.HCM
    
    // WMS settings
    enableWMS: true,
    loadDefaultWMS: false,      // Không load mặc định
    wmsLayers: [                // WMS custom
        {
            id: "custom_wms",
            name: "Layer tùy chỉnh",
            url: "https://your-server.com/wms",
            layer: "workspace:layer",
            version: "1.1.1",
            defaultVisible: true,
            zoomPriority: 1
        }
    ],
    
    // Sketch settings
    sketchOptions: {
        enableSave: true,
        enableMerge: true,
        enableSplit: false,
        apiEndpoint: "/api/custom-save"  // API endpoint riêng
    },
    
    // Control settings
    controlOptions: {
        enableBasemap: true,
        enableWMS: true,
        enableSketch: true
    }
});

// =============================================
// TẤT CẢ OPTIONS CÓ THỂ DÙNG
// =============================================

const allOptions = {
    // === MAP SETTINGS ===
    basemap: "dark-gray-vector",        // Loại basemap
    ground: "world-elevation",          // Terrain
    center: [105.85, 21.0245],         // Tọa độ trung tâm [lng, lat]
    zoom: 12,                          // Zoom level
    qualityProfile: "high",            // Chất lượng render
    
    // === FEATURE TOGGLES ===
    enableWMS: true,                   // Bật/tắt WMS layers
    enableSketch: true,                // Bật/tắt sketch tools
    enableControls: true,              // Bật/tắt tất cả controls
    
    // === WMS OPTIONS ===
    wmsLayers: DEFAULT_WMS_LAYERS,     // Danh sách WMS layers
    loadDefaultWMS: true,              // Load WMS mặc định khi khởi tạo
    
    // === SKETCH OPTIONS ===
    sketchOptions: {
        enableSave: true,              // Nút save
        enableMerge: true,             // Nút merge (gộp)
        enableSplit: true,             // Nút split (tách)
        apiEndpoint: "/api/polygons/save"  // API endpoint lưu data
    },
    
    // === CONTROL OPTIONS ===
    controlOptions: {
        enableBasemap: true,           // Control đổi basemap
        enableWMS: true,               // Control toggle WMS
        enableSketch: true             // Button bật/tắt sketch
    }
};

// =============================================
// CÁC TRƯỜNG HỢP THƯỜNG DÙNG
// =============================================

// A. Website hiển thị data - chỉ xem
const displayMap = await initMap3D("displayDiv", {
    enableSketch: false,
    controlOptions: { enableSketch: false }
});

// B. Công cụ vẽ cho admin - đầy đủ tính năng  
const adminMap = await initMap3D("adminDiv");  // Mặc định là full

// C. Demo đơn giản - chỉ basemap
const demoMap = await initMap3D("demoDiv", {
    enableWMS: false,
    enableSketch: false,
    loadDefaultWMS: false,
    controlOptions: {
        enableWMS: false,
        enableSketch: false
    }
});

// D. Map nhúng iframe - tối giản
const embedMap = await initMap3D("embedDiv", {
    enableControls: false,  // Tắt hết controls
    enableSketch: false,
    loadDefaultWMS: true    // Chỉ hiển thị data
});
 *
 * =============================================================================
 */
