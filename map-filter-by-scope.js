// Constants
const DELAY_MS = 1000;
const LAYER_NAMES = {
    PROVINCE: "ws_ranhgioi:rg_vn_tinh",
    COMMUNE: "ws_ranhgioi:rg_vn_xa",
    EUDR: "_2025_EUDR:gardens",
};

// State
const state = {
    mapInstance: null,
    wmsManager: null,
    configs: {},
    currentFilters: {
        province: null,
        commune: null,
    },
};

/**
 * Khởi tạo map và setup
 */
async function initializeMap() {
    try {
        state.mapInstance = await initMap3D("map-step-1");
        state.wmsManager = state.mapInstance.getWMSManager();

        // Cache configs
        state.configs = {
            province: state.wmsManager.getWmsConfigWithNameLayer(
                LAYER_NAMES.PROVINCE
            ),
            commune: state.wmsManager.getWmsConfigWithNameLayer(
                LAYER_NAMES.COMMUNE
            ),
            eudr: state.wmsManager.getWmsConfigWithNameLayer(LAYER_NAMES.EUDR),
        };

        setupSelectEvents();
    } catch (error) {
        console.error("Failed to initialize map:", error);
    }
}

/**
 * Setup events cho select elements
 */
function setupSelectEvents() {
    const elements = {
        province: document.getElementById("step-1-province-select"),
        commune: document.getElementById("step-1-commune-select"),
    };

    elements.province?.addEventListener("change", handleProvinceChange);
    elements.commune?.addEventListener("change", handleCommuneChange);
}

/**
 * Helper để update WMS layer
 */
async function updateWMSLayer(configKey, cqlFilter = null, shouldZoom = false) {
    const config = state.configs[configKey];
    if (!config) return;

    // Remove existing
    state.wmsManager.removeWMSLayer(config.id);

    // Add with filter
    if (cqlFilter) {
        await state.wmsManager.createAndAddWMSLayer(config, { cqlFilter });

        if (shouldZoom) {
            setTimeout(() => {
                state.wmsManager.zoomToWMSExtent(
                    config.url,
                    config.layer,
                    cqlFilter
                );
            }, DELAY_MS);
        }
    }
}

/**
 * Xử lý change province
 */
async function handleProvinceChange(event) {
    const provinceCode = event.target.value;

    if (!provinceCode) {
        await resetToDefault();
        return;
    }

    state.currentFilters.province = provinceCode;
    state.currentFilters.commune = null;

    // fillCommuneSelect(provinceCode);

    try {
        await Promise.all([
            updateWMSLayer("province", `MATINH='${provinceCode}'`, true),
            updateWMSLayer("commune", `MATINH='${provinceCode}'`),
            updateWMSLayer("eudr", `province_code='${provinceCode}'`),
        ]);
    } catch (error) {
        console.error("Error applying province filter:", error);
    }
}

/**
 * Xử lý change commune
 */
async function handleCommuneChange(event) {
    const communeCode = event.target.value;

    if (!communeCode && state.currentFilters.province) {
        await handleProvinceChange({
            target: { value: state.currentFilters.province },
        });
        return;
    }

    state.currentFilters.commune = communeCode;

    try {
        await Promise.all([
            updateWMSLayer("province"), // Remove province layer
            updateWMSLayer("commune", `MAXA='${communeCode}'`, true),
            updateWMSLayer("eudr", `commune_code='${communeCode}'`),
        ]);
    } catch (error) {
        console.error("Error applying commune filter:", error);
    }
}

/**
 * Reset về mặc định
 */
async function resetToDefault() {
    // Clear state
    state.currentFilters = { province: null, commune: null };

    // fillProvinceSelect();
    // fillCommuneSelect(null);

    try {
        // Remove all layers
        Object.keys(state.configs).forEach((key) => {
            state.wmsManager.removeWMSLayer(state.configs[key].id);
        });

        // Restore default province
        await updateWMSLayer("province", null, true);
    } catch (error) {
        console.error("Error resetting:", error);
    }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", initializeMap);
