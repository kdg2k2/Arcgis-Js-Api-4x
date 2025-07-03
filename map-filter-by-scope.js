/**
 * =============================================================================
 * MAP FILTERS - XỬ LÝ SELECT VÀ CQL FILTER
 * =============================================================================
 *
 * Kế thừa logic từ map-optimize.js để xử lý filter theo province/commune
 */

// =============================================================================
// BIẾN TOÀN CỤC
// =============================================================================

let mapInstance = null;
let wmsManager = null;
let currentFilters = {
    province: null,
    commune: null,
};

// =============================================================================
// KHỞI TẠO MAP VÀ SETUP
// =============================================================================

/**
 * Khởi tạo map với full chức năng và setup events
 */
async function initializeMap() {
    try {
        // Khởi tạo map với full chức năng
        mapInstance = await initMap3D("mapDiv");
        wmsManager = mapInstance.getWMSManager();

        // Setup events cho select elements
        setupSelectEvents();

        // Mặc định hiển thị WMS tỉnh (đã được load sẵn do defaultVisible: true)
    } catch (error) {
        console.error("❌ Failed to initialize map:", error);
    }
}

/**
 * Setup events cho các select elements
 */
function setupSelectEvents() {
    const provinceSelect = document.getElementById("step-1-province-select");
    const communeSelect = document.getElementById("step-1-commune-select");

    if (provinceSelect) {
        provinceSelect.addEventListener("change", handleProvinceChange);
    }

    if (communeSelect) {
        communeSelect.addEventListener("change", handleCommuneChange);
    }
}

// =============================================================================
// XỬ LÝ SỰ KIỆN PROVINCE SELECT
// =============================================================================

/**
 * Xử lý khi change province select
 * @param {Event} event - Change event
 */
async function handleProvinceChange(event) {
    const provinceCode = event.target.value;

    if (!provinceCode) {
        // Reset về trạng thái ban đầu
        await resetToDefault();
        return;
    }

    // Lưu filter hiện tại
    currentFilters.province = provinceCode;
    currentFilters.commune = null;

    // Reset commune select
    resetCommuneSelect();

    try {
        // 1. Hiển thị WMS tỉnh với filter
        await showProvinceWithFilter(provinceCode);

        // 2. Hiển thị WMS xã với filter theo tỉnh
        await showCommuneLayerByProvince(provinceCode);

        // 3. Hiển thị WMS EUDR với filter theo tỉnh
        await showEUDRLayerByProvince(provinceCode);
    } catch (error) {
        console.error("❌ Error applying province filter:", error);
    }
}

/**
 * Hiển thị WMS tỉnh với CQL filter
 * @param {string} provinceCode - Mã tỉnh
 */
async function showProvinceWithFilter(provinceCode) {
    const provinceConfig = {
        id: "wms_1",
        name: "Ranh giới tỉnh",
        url: "https://bando.ifee.edu.vn:8453/geoserver/ws_ranhgioi/wms",
        layer: "ws_ranhgioi:rg_vn_tinh",
        version: "1.1.1",
        defaultVisible: true,
        zoomPriority: 10,
    };

    // Remove existing layer
    wmsManager.removeWMSLayer("wms_1");

    // Add with CQL filter
    await wmsManager.createAndAddWMSLayer(provinceConfig, {
        cqlFilter: `MATINH='${provinceCode}'`,
    });

    // Zoom to filtered province extent
    setTimeout(() => {
        wmsManager.zoomToWMSExtent(
            provinceConfig.url,
            provinceConfig.layer.split(":")[1],
            `MATINH='${provinceCode}'`
        );
    }, 1000);
}

/**
 * Hiển thị WMS xã theo tỉnh
 * @param {string} provinceCode - Mã tỉnh
 */
async function showCommuneLayerByProvince(provinceCode) {
    const communeConfig = {
        id: "wms_2",
        name: "Ranh giới xã",
        url: "https://bando.ifee.edu.vn:8453/geoserver/ws_ranhgioi/wms",
        layer: "ws_ranhgioi:rg_vn_xa",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 9,
    };

    // Remove existing layer if any
    wmsManager.removeWMSLayer("wms_2");

    // Add with CQL filter
    await wmsManager.createAndAddWMSLayer(communeConfig, {
        cqlFilter: `MATINH='${provinceCode}'`,
    });

    // Update UI button state
    wmsManager.updateButtonStateForLayer("wms_2", true);
}

/**
 * Hiển thị WMS EUDR theo tỉnh
 * @param {string} provinceCode - Mã tỉnh
 */
async function showEUDRLayerByProvince(provinceCode) {
    const eudrConfig = {
        id: "wms_3",
        name: "EUDR",
        url: "https://maps-150.ifee.edu.vn:8453/geoserver/_2025_EUDR/wms",
        layer: "_2025_EUDR:gardens",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 8,
    };

    // Remove existing layer if any
    wmsManager.removeWMSLayer("wms_3");

    // Add with CQL filter
    await wmsManager.createAndAddWMSLayer(eudrConfig, {
        cqlFilter: `province_code='${provinceCode}'`,
    });

    // Update UI button state
    wmsManager.updateButtonStateForLayer("wms_3", true);
}

// =============================================================================
// XỬ LÝ SỰ KIỆN COMMUNE SELECT
// =============================================================================

/**
 * Xử lý khi change commune select
 * @param {Event} event - Change event
 */
async function handleCommuneChange(event) {
    const communeCode = event.target.value;

    if (!communeCode) {
        // Quay lại hiển thị theo province
        if (currentFilters.province) {
            await handleProvinceChange({
                target: { value: currentFilters.province },
            });
        }
        return;
    }

    // Lưu filter hiện tại
    currentFilters.commune = communeCode;

    try {
        // 1. Gỡ hiển thị WMS tỉnh
        await hideProvinceLayer();

        // 2. Hiển thị WMS xã với filter theo xã
        await showCommuneWithFilter(communeCode);

        // 3. Hiển thị WMS EUDR với filter theo xã
        await showEUDRLayerByCommune(communeCode);
    } catch (error) {
        console.error("❌ Error applying commune filter:", error);
    }
}

/**
 * Ẩn layer tỉnh
 */
async function hideProvinceLayer() {
    wmsManager.removeWMSLayer("wms_1");
    wmsManager.updateButtonStateForLayer("wms_1", false);
}

/**
 * Hiển thị WMS xã với CQL filter theo xã
 * @param {string} communeCode - Mã xã
 */
async function showCommuneWithFilter(communeCode) {
    const communeConfig = {
        id: "wms_2",
        name: "Ranh giới xã",
        url: "https://bando.ifee.edu.vn:8453/geoserver/ws_ranhgioi/wms",
        layer: "ws_ranhgioi:rg_vn_xa",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 9,
    };

    // Remove existing layer
    wmsManager.removeWMSLayer("wms_2");

    // Add with CQL filter
    await wmsManager.createAndAddWMSLayer(communeConfig, {
        cqlFilter: `MAXA='${communeCode}'`,
    });

    // Zoom to filtered commune extent
    setTimeout(() => {
        wmsManager.zoomToWMSExtent(
            communeConfig.url,
            communeConfig.layer.split(":")[1],
            `MAXA='${communeCode}'`
        );
    }, 1000);
}

/**
 * Hiển thị WMS EUDR theo xã
 * @param {string} communeCode - Mã xã
 */
async function showEUDRLayerByCommune(communeCode) {
    const eudrConfig = {
        id: "wms_3",
        name: "EUDR",
        url: "https://maps-150.ifee.edu.vn:8453/geoserver/_2025_EUDR/wms",
        layer: "_2025_EUDR:gardens",
        version: "1.1.1",
        defaultVisible: false,
        zoomPriority: 8,
    };

    // Remove existing layer if any
    wmsManager.removeWMSLayer("wms_3");

    // Add with CQL filter
    await wmsManager.createAndAddWMSLayer(eudrConfig, {
        cqlFilter: `commune_code='${communeCode}'`,
    });

    // Update UI button state
    wmsManager.updateButtonStateForLayer("wms_3", true);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Reset về trạng thái mặc định
 */
async function resetToDefault() {
    // Clear filters
    currentFilters.province = null;
    currentFilters.commune = null;

    // Reset commune select
    resetCommuneSelect();

    // Remove all custom filters, restore default
    try {
        // Remove filtered layers
        wmsManager.removeWMSLayer("wms_1");
        wmsManager.removeWMSLayer("wms_2");
        wmsManager.removeWMSLayer("wms_3");

        // Restore default province layer (without filter)
        const defaultProvinceConfig = {
            id: "wms_1",
            name: "Ranh giới tỉnh",
            url: "https://bando.ifee.edu.vn:8453/geoserver/ws_ranhgioi/wms",
            layer: "ws_ranhgioi:rg_vn_tinh",
            version: "1.1.1",
            defaultVisible: true,
            zoomPriority: 10,
        };

        await wmsManager.createAndAddWMSLayer(defaultProvinceConfig);

        // Update UI states
        wmsManager.updateButtonStateForLayer("wms_1", true);
        wmsManager.updateButtonStateForLayer("wms_2", false);
        wmsManager.updateButtonStateForLayer("wms_3", false);

        // Zoom to default extent
        setTimeout(() => {
            wmsManager.zoomToWMSExtent(
                defaultProvinceConfig.url,
                defaultProvinceConfig.layer.split(":")[1],
                null // Không có filter = toàn quốc
            );
        }, 1000);
    } catch (error) {
        console.error("❌ Error resetting to default:", error);
    }
}

/**
 * Reset commune select về trạng thái ban đầu
 */
function resetCommuneSelect() {
    const communeSelect = document.getElementById("step-1-commune-select");
    if (communeSelect) {
        communeSelect.value = "";
    }
}

// Tự động khởi tạo khi DOM ready
document.addEventListener("DOMContentLoaded", function () {
    initializeMap();
});
