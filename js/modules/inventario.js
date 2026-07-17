// ==================== MÓDULO: INVENTARIO POR MODELO ====================

let productosCache = [];
let productosCargados = false;
let cargandoCatalogo = false;
let currentProductId = null;
let searchTimeout = null;
let currentProductName = '';
let currentProductBarcode = '';
let stockDataGlobal = []; // Almacenar datos de stock para usar en el modal
let almacenGeneralWarehouseIds = []; // Almacenar los warehouse_ids del almacén general

// ==================== CONFIGURACIÓN DE RUTAS (USAR LA GLOBAL) ====================
// NOTA: RUTAS_CONFIG y ALMACEN_GENERAL_KEYWORDS ahora vienen de config.js
// No es necesario redeclararlas aquí

function getLineName(lineId) {
    if (lineId === 4) return "Telcel";
    if (lineId === 5) return "Libre";
    return "Equipo";
}

function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[#@$%&*+=\[\]{}()<>\/\\|;:.,?¿!¡]/g, "")
        .replace(/\s+/g, ' ')
        .replace(/ñ/g, "n")
        .trim();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getSafeName(product) {
    if (!product) return 'Sin nombre';
    if (product.name && product.name !== 'null' && product.name !== 'undefined') {
        return product.name;
    }
    return `Producto ID: ${product.id}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(module, message) {
    const alert = document.getElementById(`${module}ErrorAlert`);
    if (alert) {
        alert.innerHTML = `❌ ${message}`;
        alert.style.display = 'block';
        setTimeout(() => { alert.style.display = 'none'; }, 5000);
    }
}

function showInfo(module, message) {
    const alert = document.getElementById(`${module}InfoAlert`);
    if (alert) {
        alert.innerHTML = `ℹ️ ${message}`;
        alert.style.display = 'block';
        setTimeout(() => { alert.style.display = 'none'; }, 4000);
    }
}

// ==================== CARGA DE CATÁLOGO ====================
async function loadProductCatalog() {
    console.log('📦 Iniciando carga de catálogo...');
    
    if (productosCargados) {
        console.log(`✅ Catálogo ya cargado: ${productosCache.length} equipos`);
        return productosCache;
    }
    
    if (cargandoCatalogo) {
        while (cargandoCatalogo) await delay(100);
        return productosCache;
    }
    
    cargandoCatalogo = true;
    const searchInput = document.getElementById('productoSearchInput');
    const infoAlert = document.getElementById('inventarioInfoAlert');
    
    if (searchInput) {
        searchInput.disabled = true;
        searchInput.placeholder = 'Cargando catálogo de equipos...';
    }
    
    if (infoAlert) {
        infoAlert.innerHTML = '📦 Cargando catálogo de equipos (Telcel y Libre)...';
        infoAlert.style.display = 'block';
    }
    
    try {
        let allProducts = [];
        let currentPage = 1;
        let lastPage = 1;
        
        const firstUrl = `${CONFIG.API_PRODUCTS}?page=1&per_page=100&excludes_tae=true&line_ids[]=4&line_ids[]=5`;
        
        const response = await fetch(firstUrl, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const firstProducts = data.data || [];
        allProducts.push(...firstProducts);
        
        lastPage = data.last_page || data.meta?.last_page || 1;
        
        for (let page = 2; page <= lastPage; page++) {
            await delay(300);
            
            const url = `${CONFIG.API_PRODUCTS}?page=${page}&per_page=100&excludes_tae=true&line_ids[]=4&line_ids[]=5`;
            const pageResponse = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });
            
            if (pageResponse.ok) {
                const pageData = await pageResponse.json();
                const products = pageData.data || [];
                allProducts.push(...products);
            }
            
            if (searchInput) {
                const percent = Math.round((page / lastPage) * 100);
                searchInput.placeholder = `Cargando... ${percent}% (${allProducts.length} equipos)`;
            }
        }
        
        allProducts = allProducts.filter(p => p && p.id && p.name && p.name !== 'null' && p.name !== 'undefined');
        allProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        productosCache = allProducts;
        productosCargados = true;
        
        console.log(`✅ Catálogo cargado: ${productosCache.length} equipos`);
        
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = '🔍 Buscar equipo (ej: Samsung, iPhone, A55)...';
        }
        
        if (infoAlert) {
            infoAlert.innerHTML = `✅ ${productosCache.length} equipos disponibles`;
            setTimeout(() => {
                if (infoAlert) infoAlert.style.display = 'none';
            }, 3000);
        }
        
        return productosCache;
        
    } catch (error) {
        console.error('❌ Error:', error);
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = 'Error al cargar. Recarga la página.';
        }
        showError('inventario', `Error: ${error.message}`);
        return [];
    } finally {
        cargandoCatalogo = false;
    }
}

// ==================== BÚSQUEDA LOCAL ====================
function searchProductsLocal(query) {
    if (!query || query.length < 3) return [];
    if (!productosCargados || productosCache.length === 0) return [];
    
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    
    const results = productosCache.filter(product => {
        const normalizedName = normalizeText(product.name || '');
        let match = normalizedName.includes(normalizedQuery);
        if (!match && queryWords.length > 1) {
            match = queryWords.every(word => normalizedName.includes(word));
        }
        return match;
    });
    
    results.sort((a, b) => {
        const aName = normalizeText(a.name || '');
        const bName = normalizeText(b.name || '');
        const aStarts = aName.startsWith(normalizedQuery);
        const bStarts = bName.startsWith(normalizedQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return aName.localeCompare(bName);
    });
    
    return results.slice(0, 15);
}

function showSuggestions(suggestions) {
    const container = document.getElementById('suggestionsContainer');
    if (!container) return;
    
    const searchQuery = document.getElementById('productoSearchInput')?.value || '';
    
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = `<div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; color: #64748b; z-index: 1000;">
            ❌ No se encontraron equipos con "${searchQuery}"
        </div>`;
        return;
    }
    
    const suggestionsHtml = `
        <div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; max-height: 300px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            ${suggestions.map(prod => {
                const lineName = getLineName(prod.line_id);
                const safeName = getSafeName(prod);
                return `
                    <div class="suggestion-item" data-id="${prod.id}" data-name="${escapeHtml(safeName)}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #e2e8f0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <strong>${escapeHtml(safeName)}</strong>
                                <div style="font-size: 0.65rem; color: #64748b;">ID: ${prod.id} | ${lineName}</div>
                            </div>
                            <span class="badge-${lineName === 'Telcel' ? 'telcel' : 'libre'}" style="font-size: 0.6rem;">${lineName}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.innerHTML = suggestionsHtml;
    
    document.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            const productId = parseInt(el.dataset.id);
            const productName = el.dataset.name;
            selectProduct(productId, productName);
        });
    });
}

function selectProduct(productId, productName) {
    currentProductId = productId;
    currentProductName = productName;
    
    const searchInput = document.getElementById('productoSearchInput');
    if (searchInput) searchInput.value = productName;
    
    const selectedInfo = document.getElementById('selectedProductInfo');
    const selectedName = document.getElementById('selectedProductName');
    if (selectedInfo && selectedName) {
        selectedName.textContent = productName;
        selectedInfo.style.display = 'block';
    }
    
    const searchBtn = document.getElementById('searchInventarioBtn');
    if (searchBtn) searchBtn.disabled = false;
    
    const container = document.getElementById('suggestionsContainer');
    if (container) container.innerHTML = '';
}

function clearSelectedProduct() {
    currentProductId = null;
    currentProductName = '';
    currentProductBarcode = '';
    stockDataGlobal = [];
    almacenGeneralWarehouseIds = [];
    
    const searchInput = document.getElementById('productoSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    
    const selectedInfo = document.getElementById('selectedProductInfo');
    if (selectedInfo) selectedInfo.style.display = 'none';
    
    const searchBtn = document.getElementById('searchInventarioBtn');
    if (searchBtn) searchBtn.disabled = true;
    
    // Ocultar y limpiar resultados
    const results = document.getElementById('inventarioResults');
    if (results) {
        results.style.display = 'none';
        results.innerHTML = '';
    }
    
    // Ocultar botón de exportación
    const exportContainer = document.getElementById('exportContainer');
    if (exportContainer) {
        exportContainer.style.display = 'none';
    }
    
    // Cerrar modal de IMEIs si está abierto
    closeImeiModal();
}

// ==================== CONSULTA DE INVENTARIO ====================
async function fetchInventoryByProduct(productId) {
    try {
        let allStock = [];
        let currentPage = 1;
        let lastPage = 1;
        
        do {
            const url = `${CONFIG.API_STOCK}?page=${currentPage}&per_page=100&total=0&product_id=${productId}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const stockItems = data.data || [];
            allStock.push(...stockItems);
            
            lastPage = data.last_page || data.meta?.last_page || currentPage;
            currentPage++;
            if (currentPage <= lastPage) await delay(200);
            
        } while (currentPage <= lastPage);
        
        return allStock;
        
    } catch (error) {
        console.error('Error consultando inventario:', error);
        throw error;
    }
}

// ==================== FUNCIONES DE IDENTIFICACIÓN ====================
function isAlmacenGeneral(branchName, warehouseName) {
    const nameToCheck = (branchName || warehouseName || '').toLowerCase();
    const cleaned = nameToCheck.replace(/[^a-z0-9\sáéíóúüñ]/g, '').trim();
    
    for (const keyword of ALMACEN_GENERAL_KEYWORDS) {
        if (cleaned.includes(keyword.toLowerCase())) {
            console.log(`✅ Almacén General detectado: "${nameToCheck}"`);
            return true;
        }
    }
    return false;
}

// ==================== FUNCIÓN MEJORADA: getInventoryBySucursal ====================
function getInventoryBySucursal(stockItems, sucursalNombre) {
    if (!stockItems || stockItems.length === 0) {
        return {
            quantity: 0,
            transfer_quantity: 0,
            total: 0,
            hasStock: false,
            warehouseId: null,
            stockItem: null
        };
    }
    
    const searchName = sucursalNombre.toLowerCase().trim();
    
    // 1. Coincidencia exacta (case insensitive)
    let item = stockItems.find(s => {
        const branchName = (s.branch_name || '').toLowerCase().trim();
        const warehouseName = (s.warehouse_name || '').toLowerCase().trim();
        return branchName === searchName || warehouseName === searchName;
    });
    
    // 2. Si no hay coincidencia exacta, intentar con normalización
    if (!item) {
        const normalizedSearch = normalizeText(sucursalNombre);
        item = stockItems.find(s => {
            const branchName = normalizeText(s.branch_name || '');
            const warehouseName = normalizeText(s.warehouse_name || '');
            return branchName === normalizedSearch || warehouseName === normalizedSearch;
        });
    }
    
    // 3. Si aún no hay, buscar coincidencia exacta con el nombre completo
    if (!item) {
        const exactMatches = stockItems.filter(s => {
            const branchName = (s.branch_name || '').toLowerCase().trim();
            const warehouseName = (s.warehouse_name || '').toLowerCase().trim();
            return branchName === searchName || warehouseName === searchName;
        });
        if (exactMatches.length === 1) {
            item = exactMatches[0];
        } else if (exactMatches.length > 1) {
            // Si hay múltiples coincidencias, usar la que tenga el nombre más corto (probablemente la original)
            const sorted = [...exactMatches].sort((a, b) => {
                const aLen = (a.branch_name || '').length;
                const bLen = (b.branch_name || '').length;
                return aLen - bLen;
            });
            // Verificar que la primera coincidencia tenga exactamente el nombre buscado
            if (sorted[0] && (sorted[0].branch_name || '').toLowerCase().trim() === searchName) {
                item = sorted[0];
            }
        }
    }
    
    // 4. Último recurso: buscar que el nombre termine en el nombre buscado (para casos como "Chemax 2" no coincida con "Chemax")
    if (!item) {
        const exactEndMatches = stockItems.filter(s => {
            const branchName = (s.branch_name || '').toLowerCase().trim();
            return branchName === searchName || branchName.endsWith(' ' + searchName);
        });
        if (exactEndMatches.length === 1) {
            item = exactEndMatches[0];
        }
    }
    
    return {
        quantity: item?.quantity || 0,
        transfer_quantity: item?.transfer_quantity || 0,
        total: (item?.quantity || 0) + (item?.transfer_quantity || 0),
        hasStock: (item?.quantity || 0) > 0 || (item?.transfer_quantity || 0) > 0,
        warehouseId: item?.warehouse_id || null,
        stockItem: item || null
    };
}

// ==================== FUNCIONES PARA OBTENER IMEIs POR ALMACÉN ====================

/**
 * Obtiene los IMEIs de un producto en uno o varios warehouses
 */
async function fetchSeriesByProductAndWarehouses(productId, warehouseIds) {
    try {
        // Si es un solo warehouse, usar la URL con parámetro
        if (Array.isArray(warehouseIds) && warehouseIds.length === 1) {
            return await fetchSeriesByProductAndWarehouse(productId, warehouseIds[0]);
        }
        
        // Si son múltiples warehouses, obtener todos y combinar
        let allResults = [];
        const ids = Array.isArray(warehouseIds) ? warehouseIds : [warehouseIds];
        
        for (const id of ids) {
            const result = await fetchSeriesByProductAndWarehouse(productId, id);
            allResults = allResults.concat(result);
            await delay(100);
        }
        
        return allResults;
    } catch (error) {
        console.error('❌ Error obteniendo IMEIs:', error);
        return [];
    }
}

/**
 * Obtiene los IMEIs de un producto en un warehouse específico
 */
async function fetchSeriesByProductAndWarehouse(productId, warehouseId) {
    try {
        const url = `https://inventory.gcasan.com/api/specification-groups?product_id=${productId}&warehouse_id=${warehouseId}`;
        console.log('🔍 Consultando IMEIs para warehouse:', warehouseId, url);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Respuesta IMEIs:', data);
        
        let result = [];
        if (data.data && Array.isArray(data.data)) {
            result = data.data;
        } else if (Array.isArray(data)) {
            result = data;
        } else if (data.result && Array.isArray(data.result)) {
            result = data.result;
        } else if (data.items && Array.isArray(data.items)) {
            result = data.items;
        } else {
            for (const key in data) {
                if (Array.isArray(data[key]) && data[key].length > 0) {
                    console.log(`📊 Encontrado array en la clave: "${key}"`);
                    result = data[key];
                    break;
                }
            }
        }
        
        console.log(`📊 IMEIs encontrados para warehouse ${warehouseId}:`, result.length);
        return result;
    } catch (error) {
        console.error('❌ Error obteniendo IMEIs para warehouse:', warehouseId, error);
        return [];
    }
}

/**
 * Extrae el IMEI de un objeto de especificación
 */
function extractImei(spec) {
    if (spec.specification_details && spec.specification_details.length > 0) {
        const imeiDetail = spec.specification_details.find(d => d.product_specification_id === 1);
        if (imeiDetail && imeiDetail.value) {
            return imeiDetail.value;
        }
        if (spec.specification_details[0] && spec.specification_details[0].value) {
            return spec.specification_details[0].value;
        }
    }
    return spec.serie || spec.code || spec.value || spec.serial || spec.imei || 'N/A';
}

/**
 * Formatea una fecha ISO a formato legible
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

/**
 * Obtiene la fecha de ingreso al almacén
 */
function getIngresoDate(spec) {
    if (spec.in_warehouse_since) {
        return formatDate(spec.in_warehouse_since);
    }
    if (spec.stock && spec.stock.created_at) {
        return formatDate(spec.stock.created_at);
    }
    return 'N/A';
}

/**
 * Obtiene la fecha de compra
 */
function getPurchaseDate(spec) {
    if (spec.created_at) {
        return formatDate(spec.created_at);
    }
    if (spec.purchase_detail && spec.purchase_detail.created_at) {
        return formatDate(spec.purchase_detail.created_at);
    }
    if (spec.stock && spec.stock.created_at) {
        return formatDate(spec.stock.created_at);
    }
    return 'N/A';
}

// ==================== MODAL DE IMEIs (MEJORADO) ====================

/**
 * Abre el modal con los IMEIs de una tienda o almacén general
 */
async function openImeiModal(sucursalNombre, warehouseIds, isAlmacenGeneral = false) {
    if (!currentProductId) {
        alert('❌ No hay producto seleccionado');
        return;
    }
    
    // Si es almacén general y no se pasaron warehouseIds, usar los guardados
    if (isAlmacenGeneral && (!warehouseIds || warehouseIds.length === 0)) {
        warehouseIds = almacenGeneralWarehouseIds;
    }
    
    // Si no hay warehouseIds, obtenerlos del stockDataGlobal con coincidencia EXACTA
    if (!warehouseIds || warehouseIds.length === 0) {
        const normalizedSearch = normalizeText(sucursalNombre);
        const searchName = sucursalNombre.toLowerCase().trim();
        
        // 1. Coincidencia exacta primero
        let items = stockDataGlobal.filter(item => {
            const branchName = (item.branch_name || '').toLowerCase().trim();
            const warehouseName = (item.warehouse_name || '').toLowerCase().trim();
            return branchName === searchName || warehouseName === searchName;
        });
        
        // 2. Si no hay, intentar con normalización
        if (items.length === 0) {
            items = stockDataGlobal.filter(item => {
                const branchName = normalizeText(item.branch_name || '');
                const warehouseName = normalizeText(item.warehouse_name || '');
                return branchName === normalizedSearch || warehouseName === normalizedSearch;
            });
        }
        
        // 3. Si aún no hay, buscar que el nombre termine exactamente igual
        if (items.length === 0) {
            items = stockDataGlobal.filter(item => {
                const branchName = (item.branch_name || '').toLowerCase().trim();
                return branchName === searchName || branchName.endsWith(' ' + searchName);
            });
        }
        
        // 4. Si hay múltiples coincidencias, filtrar para obtener solo la coincidencia exacta
        if (items.length > 1) {
            // Si hay una coincidencia exacta, usarla
            const exactItem = items.find(item => {
                const branchName = (item.branch_name || '').toLowerCase().trim();
                return branchName === searchName;
            });
            if (exactItem) {
                items = [exactItem];
            } else {
                // Si no, usar la que tenga el nombre más corto (la original)
                items.sort((a, b) => {
                    const aLen = (a.branch_name || '').length;
                    const bLen = (b.branch_name || '').length;
                    return aLen - bLen;
                });
                items = [items[0]];
            }
        }
        
        warehouseIds = items.map(item => item.warehouse_id).filter(id => id);
        
        if (warehouseIds.length === 0) {
            // Último intento: buscar por el nombre exacto en los datos
            const exactItem = stockDataGlobal.find(item => {
                const branchName = (item.branch_name || '').toLowerCase().trim();
                return branchName === searchName;
            });
            if (exactItem && exactItem.warehouse_id) {
                warehouseIds = [exactItem.warehouse_id];
            } else {
                alert(`❌ No se encontró información de almacén para "${sucursalNombre}"`);
                return;
            }
        }
    }
    
    // Asegurar que warehouseIds sea un array
    if (!Array.isArray(warehouseIds)) {
        warehouseIds = [warehouseIds];
    }
    
    // Eliminar duplicados
    warehouseIds = [...new Set(warehouseIds)];
    
    console.log(`📊 Abriendo modal para "${sucursalNombre}" con warehouseIds:`, warehouseIds);
    
    // Mostrar loading en el modal
    const modal = document.getElementById('imeiModal');
    const body = document.getElementById('imeiModalBody');
    const title = document.getElementById('imeiModalTitle');
    
    if (!modal || !body || !title) {
        console.error('❌ Elementos del modal no encontrados');
        return;
    }
    
    const displayName = isAlmacenGeneral ? '🏭 Almacén General' : sucursalNombre;
    title.textContent = `📱 IMEIs - ${displayName}`;
    body.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div class="loading-spinner" style="display: inline-block; width: 40px; height: 40px;"></div>
            <p style="margin-top: 16px; color: #64748b;">⏳ Cargando IMEIs (${warehouseIds.length} almacenes)...</p>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    try {
        // Obtener IMEIs de todos los warehouses
        const specs = await fetchSeriesByProductAndWarehouses(currentProductId, warehouseIds);
        
        if (!specs || specs.length === 0) {
            body.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 48px;">📭</div>
                    <p style="margin-top: 16px; color: #64748b;">No se encontraron IMEIs en ${displayName}</p>
                    <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 8px;">Warehouse IDs: ${warehouseIds.join(', ')}</p>
                </div>
            `;
            return;
        }
        
        // Construir tabla de IMEIs
        let html = `
            <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong style="font-size: 0.9rem;">Total: ${specs.length} IMEIs</strong>
                    ${warehouseIds.length > 1 ? `<span style="margin-left: 10px; font-size: 0.7rem; color: #64748b;">(${warehouseIds.length} almacenes)</span>` : ''}
                </div>
                <button onclick="exportImeiModalToCSV()" style="
                    background: linear-gradient(135deg, #1e7e34, #28a745);
                    color: white;
                    border: none;
                    padding: 6px 16px;
                    border-radius: 6px;
                    font-size: 0.8rem;
                    cursor: pointer;
                ">
                    📊 Exportar CSV
                </button>
            </div>
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
                    <thead style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; position: sticky; top: 0; z-index: 10;">
                        <tr>
                            <th style="padding: 10px; text-align: left;">#</th>
                            <th style="padding: 10px; text-align: left;">IMEI</th>
                            <th style="padding: 10px; text-align: left;">Fecha de ingreso</th>
                            <th style="padding: 10px; text-align: left;">Fecha de compra</th>
                            <th style="padding: 10px; text-align: left;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        specs.forEach((spec, index) => {
            const imei = extractImei(spec);
            const ingreso = getIngresoDate(spec);
            const compra = getPurchaseDate(spec);
            const status = spec.status || 'N/A';
            const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
            
            html += `
                <tr style="background: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; text-align: center;">${index + 1}</td>
                    <td style="padding: 8px 10px; font-family: monospace; font-weight: 500;">${escapeHtml(imei)}</td>
                    <td style="padding: 8px 10px;">${ingreso}</td>
                    <td style="padding: 8px 10px;">${compra}</td>
                    <td style="padding: 8px 10px;">
                        <span style="
                            background: ${status === 'available' ? '#dcfce7' : '#fef3c7'};
                            color: ${status === 'available' ? '#166534' : '#92400e'};
                            padding: 2px 10px;
                            border-radius: 20px;
                            font-size: 0.65rem;
                            font-weight: 600;
                        ">${status}</span>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        body.innerHTML = html;
        
        // Guardar los specs para exportar desde el modal
        window._imeiModalData = {
            specs: specs,
            sucursal: displayName,
            productName: currentProductName,
            warehouseIds: warehouseIds
        };
        
    } catch (error) {
        console.error('❌ Error cargando IMEIs:', error);
        body.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #dc2626;">
                <div style="font-size: 48px;">❌</div>
                <p style="margin-top: 16px;">Error al cargar los IMEIs: ${error.message}</p>
                <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 8px;">Warehouse IDs: ${warehouseIds.join(', ')}</p>
            </div>
        `;
    }
}

/**
 * Cierra el modal de IMEIs
 */
function closeImeiModal() {
    const modal = document.getElementById('imeiModal');
    if (modal) {
        modal.style.display = 'none';
    }
    window._imeiModalData = null;
}

/**
 * Exporta los IMEIs del modal a CSV
 */
function exportImeiModalToCSV() {
    const data = window._imeiModalData;
    if (!data || !data.specs || data.specs.length === 0) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    let csv = '\uFEFF';
    csv += `"Producto","${data.productName}"\n`;
    csv += `"Ubicación","${data.sucursal}"\n`;
    csv += `"Total IMEIs",${data.specs.length}\n\n`;
    csv += '"#","IMEI","Fecha de ingreso","Fecha de compra","Status"\n';
    
    data.specs.forEach((spec, index) => {
        const imei = extractImei(spec);
        const ingreso = getIngresoDate(spec);
        const compra = getPurchaseDate(spec);
        const status = spec.status || 'N/A';
        csv += `"${index + 1}","${imei}","${ingreso}","${compra}","${status}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `IMEIs_${data.sucursal.replace(/\s+/g, '_')}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// ==================== RENDERIZADO DE TABLAS (MEJORADO) ====================
function renderRutaTab(rutaNombre, rutaData, stockItems) {
    const sucursales = rutaData.sucursales;
    const color = rutaData.color;
    const icon = rutaData.icon;
    
    let sucursalesData = [];
    let totalQuantity = 0;
    let totalTransfer = 0;
    
    for (const sucursal of sucursales) {
        const inv = getInventoryBySucursal(stockItems, sucursal);
        // Verificar que el nombre coincida exactamente
        let nombreMostrar = sucursal;
        if (inv.stockItem && inv.stockItem.branch_name) {
            nombreMostrar = inv.stockItem.branch_name;
        }
        sucursalesData.push({
            nombre: nombreMostrar,
            nombreOriginal: sucursal,
            quantity: inv.quantity,
            transfer: inv.transfer_quantity,
            total: inv.total,
            hasStock: inv.hasStock,
            warehouseId: inv.warehouseId,
            stockItem: inv.stockItem
        });
        totalQuantity += inv.quantity;
        totalTransfer += inv.transfer_quantity;
    }
    
    const totalGeneral = totalQuantity + totalTransfer;
    const sinStockCount = sucursalesData.filter(s => !s.hasStock).length;
    
    return `
        <div style="background: white; border-radius: 16px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: ${color}; color: white; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size: 1.2rem;">${icon}</span>
                        <strong style="margin-left: 8px;">${rutaNombre}</strong>
                        <span style="margin-left: 10px; font-size: 0.7rem; opacity: 0.9;">${sucursales.length} sucursales</span>
                        ${sinStockCount > 0 ? `<span style="margin-left: 10px; font-size: 0.65rem; background: rgba(0,0,0,0.2); padding: 2px 8px; border-radius: 20px;">⚠️ ${sinStockCount} sin stock</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 0.75rem;">
                        <span>📦 ${totalQuantity}</span>
                        <span>🚚 ${totalTransfer}</span>
                        <span style="font-weight: bold;">📊 ${totalGeneral}</span>
                    </div>
                </div>
            </div>
            <div style="padding: 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
                    <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <tr>
                            <th style="padding: 10px; text-align: left;">#</th>
                            <th style="padding: 10px; text-align: left;">Sucursal</th>
                            <th style="padding: 10px; text-align: center; width: 70px;">📦</th>
                            <th style="padding: 10px; text-align: center; width: 70px;">🚚</th>
                            <th style="padding: 10px; text-align: center; width: 70px;">📊</th>
                            <th style="padding: 10px; text-align: center; width: 60px;">📱</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sucursalesData.map((suc, idx) => `
                            <tr style="border-bottom: 1px solid #e2e8f0; ${!suc.hasStock ? 'background-color: #fef2f2;' : 'cursor: pointer;'} ${suc.hasStock ? 'class="clickable-row"' : ''}" 
                                ${suc.hasStock ? `onclick="openImeiModal('${escapeHtml(suc.nombreOriginal)}', [${suc.warehouseId}])"` : ''}
                                ${suc.hasStock ? `title="Haz clic para ver los IMEIs"` : ''}>
                                <td style="padding: 10px; text-align: center;">${idx + 1}</td>
                                <td style="padding: 10px; font-weight: 500;">
                                    🏪 ${escapeHtml(suc.nombre)}
                                    ${!suc.hasStock ? '<span style="margin-left: 8px; font-size: 0.65rem; color: #dc2626;">⚠️ SIN STOCK</span>' : ''}
                                </td>
                                <td style="padding: 10px; text-align: center; color: #059669; font-weight: bold;">${suc.quantity}</td>
                                <td style="padding: 10px; text-align: center; color: #f97316; font-weight: bold;">${suc.transfer}</td>
                                <td style="padding: 10px; text-align: center; font-weight: bold; background: #f0f9ff;">${suc.total}</td>
                                <td style="padding: 10px; text-align: center;">
                                    ${suc.hasStock ? '<span style="font-size: 1.1rem;">📱</span>' : '—'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background: #f8fafc; border-top: 2px solid ${color};">
                        <tr style="font-weight: bold;">
                            <td colspan="2" style="padding: 10px; text-align: right;">TOTAL ${rutaNombre}:</td>
                            <td style="padding: 10px; text-align: center; color: #059669;">${totalQuantity}</td>
                            <td style="padding: 10px; text-align: center; color: #f97316;">${totalTransfer}</td>
                            <td style="padding: 10px; text-align: center; background: #e8f4f8;">${totalGeneral}</td>
                            <td style="padding: 10px; text-align: center;"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

function renderSinRutaTab(sucursalesData) {
    if (sucursalesData.length === 0) return '';
    
    let totalQuantity = 0;
    let totalTransfer = 0;
    
    for (const suc of sucursalesData) {
        totalQuantity += suc.quantity;
        totalTransfer += suc.transfer;
    }
    
    const totalGeneral = totalQuantity + totalTransfer;
    const sinStockCount = sucursalesData.filter(s => !s.hasStock).length;
    
    return `
        <div style="background: white; border-radius: 16px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: #64748b; color: white; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size: 1.2rem;">⚠️</span>
                        <strong style="margin-left: 8px;">Sin Ruta Asignada</strong>
                        <span style="margin-left: 10px; font-size: 0.7rem; opacity: 0.9;">${sucursalesData.length} sucursales</span>
                        ${sinStockCount > 0 ? `<span style="margin-left: 10px; font-size: 0.65rem; background: rgba(0,0,0,0.2); padding: 2px 8px; border-radius: 20px;">⚠️ ${sinStockCount} sin stock</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 0.75rem;">
                        <span>📦 ${totalQuantity}</span>
                        <span>🚚 ${totalTransfer}</span>
                        <span style="font-weight: bold;">📊 ${totalGeneral}</span>
                    </div>
                </div>
            </div>
            <div style="padding: 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
                    <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <tr>
                            <th style="padding: 10px; text-align: left;">#</th>
                            <th style="padding: 10px; text-align: left;">Sucursal</th>
                            <th style="padding: 10px; text-align: center; width: 70px;">📦</th>
                            <th style="padding: 10px; text-align: center; width: 70px;">🚚</th>
                            <th style="padding: 10px; text-align: center; width: 70px;">📊</th>
                            <th style="padding: 10px; text-align: center; width: 60px;">📱</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sucursalesData.map((suc, idx) => `
                            <tr style="border-bottom: 1px solid #e2e8f0; ${!suc.hasStock ? 'background-color: #fef2f2;' : 'cursor: pointer;'} ${suc.hasStock ? 'class="clickable-row"' : ''}" 
                                ${suc.hasStock ? `onclick="openImeiModal('${escapeHtml(suc.nombre)}', ${JSON.stringify(suc.warehouseIds || [suc.warehouseId])})"` : ''}
                                ${suc.hasStock ? `title="Haz clic para ver los IMEIs"` : ''}>
                                <td style="padding: 10px; text-align: center;">${idx + 1}</td>
                                <td style="padding: 10px; font-weight: 500;">
                                    🏪 ${escapeHtml(suc.nombre)}
                                    ${!suc.hasStock ? '<span style="margin-left: 8px; font-size: 0.65rem; color: #dc2626;">⚠️ SIN STOCK</span>' : ''}
                                </td>
                                <td style="padding: 10px; text-align: center; color: #059669; font-weight: bold;">${suc.quantity}</td>
                                <td style="padding: 10px; text-align: center; color: #f97316; font-weight: bold;">${suc.transfer}</td>
                                <td style="padding: 10px; text-align: center; font-weight: bold; background: #f0f9ff;">${suc.total}</td>
                                <td style="padding: 10px; text-align: center;">
                                    ${suc.hasStock ? '<span style="font-size: 1.1rem;">📱</span>' : '—'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background: #f8fafc; border-top: 2px solid #64748b;">
                        <tr style="font-weight: bold;">
                            <td colspan="2" style="padding: 10px; text-align: right;">TOTAL:</td>
                            <td style="padding: 10px; text-align: center; color: #059669;">${totalQuantity}</td>
                            <td style="padding: 10px; text-align: center; color: #f97316;">${totalTransfer}</td>
                            <td style="padding: 10px; text-align: center; background: #e8f4f8;">${totalGeneral}</td>
                            <td style="padding: 10px; text-align: center;"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// ==================== FUNCIÓN PRINCIPAL ====================
async function searchInventario() {
    if (!currentProductId) {
        showError('inventario', 'Por favor, selecciona un producto de la lista');
        return;
    }
    
    const btn = document.getElementById('searchInventarioBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando inventario... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    // Ocultar botón de exportación mientras se consulta
    const exportContainer = document.getElementById('exportContainer');
    if (exportContainer) {
        exportContainer.style.display = 'none';
    }
    
    document.getElementById('inventarioResults').style.display = 'none';
    document.getElementById('inventarioErrorAlert').style.display = 'none';
    document.getElementById('inventarioInfoAlert').style.display = 'none';
    
    try {
        const stockData = await fetchInventoryByProduct(currentProductId);
        stockDataGlobal = stockData; // Guardar para uso en el modal
        
        // DEBUG: Mostrar todas las sucursales
        console.log('📊 DATOS RECIBIDOS:');
        stockData.forEach(item => {
            console.log(`   - "${item.branch_name}" (${item.warehouse_name}) -> 📦${item.quantity} 🚚${item.transfer_quantity} (warehouse_id: ${item.warehouse_id})`);
        });
        
        // ========== SEPARAR ALMACÉN GENERAL ==========
        let almacenGeneralQuantity = 0;
        let almacenGeneralTransfer = 0;
        const otrasSucursales = [];
        const almacenGeneralIds = [];
        
        for (const item of stockData) {
            const branchName = item.branch_name || '';
            const warehouseName = item.warehouse_name || '';
            
            if (isAlmacenGeneral(branchName, warehouseName)) {
                almacenGeneralQuantity += item.quantity || 0;
                almacenGeneralTransfer += item.transfer_quantity || 0;
                if (item.warehouse_id) {
                    almacenGeneralIds.push(item.warehouse_id);
                }
                console.log(`🏭 ALMACÉN GENERAL: +${item.quantity} (${branchName}) warehouse_id: ${item.warehouse_id}`);
            } else {
                otrasSucursales.push(item);
                console.log(`📦 Otra: ${branchName} -> +${item.quantity} (warehouse_id: ${item.warehouse_id})`);
            }
        }
        
        // Guardar los warehouse_ids del almacén general para usarlos en el modal
        almacenGeneralWarehouseIds = [...new Set(almacenGeneralIds)]; // Eliminar duplicados
        console.log(`📊 ALMACÉN GENERAL: ${almacenGeneralWarehouseIds.length} warehouses encontrados:`, almacenGeneralWarehouseIds);
        
        console.log(`📊 TOTAL ALMACÉN GENERAL: ${almacenGeneralQuantity} + ${almacenGeneralTransfer} en tránsito`);
        
        // ========== ENCONTRAR SUCURSALES SIN RUTA (SOLO CON STOCK > 0) ==========
        const sucursalesEnRuta = new Set();
        for (const ruta of Object.values(RUTAS_CONFIG)) {
            for (const suc of ruta.sucursales) {
                sucursalesEnRuta.add(normalizeText(suc));
            }
        }
        
        const sucursalesSinRuta = [];
        for (const item of otrasSucursales) {
            const branchName = item.branch_name;
            if (branchName) {
                const normalizedBranch = normalizeText(branchName);
                // SOLO incluir si tiene stock > 0 Y no está en ruta
                const hasStock = (item.quantity > 0 || item.transfer_quantity > 0);
                if (!sucursalesEnRuta.has(normalizedBranch) && hasStock) {
                    const existing = sucursalesSinRuta.find(s => s.nombre === branchName);
                    if (existing) {
                        existing.quantity += item.quantity || 0;
                        existing.transfer += item.transfer_quantity || 0;
                        existing.total = existing.quantity + existing.transfer;
                        existing.hasStock = true;
                        // Guardar warehouse_id para el modal
                        if (item.warehouse_id) {
                            existing.warehouseIds = existing.warehouseIds || [];
                            existing.warehouseIds.push(item.warehouse_id);
                        }
                    } else {
                        sucursalesSinRuta.push({
                            nombre: branchName,
                            quantity: item.quantity || 0,
                            transfer: item.transfer_quantity || 0,
                            total: (item.quantity || 0) + (item.transfer_quantity || 0),
                            hasStock: true,
                            warehouseId: item.warehouse_id,
                            warehouseIds: item.warehouse_id ? [item.warehouse_id] : []
                        });
                    }
                }
            }
        }
        
        console.log(`📊 Sucursales sin ruta con stock: ${sucursalesSinRuta.length}`);
        
        // ========== CALCULAR TOTALES GENERALES ==========
        let totalGeneralQuantity = almacenGeneralQuantity;
        let totalGeneralTransfer = almacenGeneralTransfer;
        
        for (const ruta of Object.values(RUTAS_CONFIG)) {
            for (const sucursal of ruta.sucursales) {
                const inv = getInventoryBySucursal(otrasSucursales, sucursal);
                totalGeneralQuantity += inv.quantity;
                totalGeneralTransfer += inv.transfer_quantity;
            }
        }
        
        for (const suc of sucursalesSinRuta) {
            totalGeneralQuantity += suc.quantity;
            totalGeneralTransfer += suc.transfer;
        }
        
        const totalGeneral = totalGeneralQuantity + totalGeneralTransfer;
        
        // Determinar si el almacén general tiene stock para hacerlo clickeable
        const hasAlmacenGeneralStock = almacenGeneralQuantity > 0 || almacenGeneralTransfer > 0;
        const almacenGeneralClickAttr = hasAlmacenGeneralStock && almacenGeneralWarehouseIds.length > 0 
            ? `onclick="openImeiModal('Almacén General', ${JSON.stringify(almacenGeneralWarehouseIds)}, true)" style="cursor: pointer;" title="Haz clic para ver los IMEIs del Almacén General"`
            : '';
        const almacenGeneralIcon = hasAlmacenGeneralStock ? '📱' : '—';
        
        // ========== CONSTRUIR HTML ==========
        let resultsHtml = `
            <!-- Tarjetas de resumen -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number" style="font-size: 0.75rem;">${escapeHtml(currentProductName.length > 30 ? currentProductName.substring(0, 30) + '...' : currentProductName)}</div>
                    <div class="stat-label">📱 Producto</div>
                </div>
                <div class="stat-card almacen-general-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); ${hasAlmacenGeneralStock ? 'cursor: pointer;' : ''}" 
                    ${almacenGeneralClickAttr}>
                    <div class="stat-number">${almacenGeneralQuantity}</div>
                    <div class="stat-label">🏭 Almacén General ${hasAlmacenGeneralStock ? '📱' : ''}</div>
                    ${almacenGeneralTransfer > 0 ? `<div style="font-size: 0.65rem;">🚚 +${almacenGeneralTransfer} en tránsito</div>` : ''}
                    ${hasAlmacenGeneralStock && almacenGeneralWarehouseIds.length > 0 ? `<div style="font-size: 0.55rem; opacity: 0.8;">${almacenGeneralWarehouseIds.length} almacenes • Haz clic para ver IMEIs</div>` : ''}
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                    <div class="stat-number">${totalGeneralQuantity}</div>
                    <div class="stat-label">📦 Total almacenes</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                    <div class="stat-number">${totalGeneralTransfer}</div>
                    <div class="stat-label">🚚 Total tránsito</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                    <div class="stat-number">${totalGeneral}</div>
                    <div class="stat-label">📊 TOTAL GENERAL</div>
                </div>
            </div>
            
            <!-- Pestañas -->
            <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; flex-wrap: wrap;">
                <button class="inventario-tab-button active" data-tab="ruta1">🚚 Ruta 1</button>
                <button class="inventario-tab-button" data-tab="ruta2">🚚 Ruta 2</button>
                <button class="inventario-tab-button" data-tab="ruta3">🚚 Ruta 3</button>
                <button class="inventario-tab-button" data-tab="ruta4">🚚 Ruta 4</button>
                ${sucursalesSinRuta.length > 0 ? '<button class="inventario-tab-button" data-tab="sinruta">⚠️ Sin Ruta</button>' : ''}
            </div>
            
            <!-- Contenido de pestañas -->
            <div id="inventarioTabRuta1" class="inventario-tab-content active-tab">
                ${renderRutaTab("Ruta 1", RUTAS_CONFIG["Ruta 1"], otrasSucursales)}
            </div>
            <div id="inventarioTabRuta2" class="inventario-tab-content" style="display: none;">
                ${renderRutaTab("Ruta 2", RUTAS_CONFIG["Ruta 2"], otrasSucursales)}
            </div>
            <div id="inventarioTabRuta3" class="inventario-tab-content" style="display: none;">
                ${renderRutaTab("Ruta 3", RUTAS_CONFIG["Ruta 3"], otrasSucursales)}
            </div>
            <div id="inventarioTabRuta4" class="inventario-tab-content" style="display: none;">
                ${renderRutaTab("Ruta 4", RUTAS_CONFIG["Ruta 4"], otrasSucursales)}
            </div>
        `;
        
        if (sucursalesSinRuta.length > 0) {
            resultsHtml += `
                <div id="inventarioTabSinRuta" class="inventario-tab-content" style="display: none;">
                    ${renderSinRutaTab(sucursalesSinRuta)}
                </div>
            `;
        }
        
        // Agregar el contenedor del botón de exportación debajo de las tablas
        resultsHtml += `
            <div id="exportContainer" style="margin-top: 20px; display: flex; justify-content: flex-end;">
                <button id="exportSeriesBtn" class="btn-export" style="
                    background: linear-gradient(135deg, #1e7e34, #28a745);
                    color: white;
                    border: none;
                    padding: 10px 24px;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    📊 Exportar IMEIs a XLS
                </button>
            </div>
        `;
        
        document.getElementById('inventarioResults').innerHTML = resultsHtml;
        document.getElementById('inventarioResults').style.display = 'block';
        
        // Inicializar pestañas
        initInventarioTabs();
        
        // Agregar event listener al botón de exportación
        const exportBtn = document.getElementById('exportSeriesBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportSeriesToXLS);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('inventario', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== INICIALIZAR PESTAÑAS ====================
function initInventarioTabs() {
    const tabButtons = document.querySelectorAll('.inventario-tab-button');
    if (tabButtons.length === 0) return;
    
    tabButtons.forEach(button => {
        button.removeEventListener('click', handleTabClick);
        button.addEventListener('click', handleTabClick);
    });
}

function handleTabClick(e) {
    const button = e.currentTarget;
    const tabId = button.getAttribute('data-tab');
    
    document.querySelectorAll('.inventario-tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');
    
    document.querySelectorAll('.inventario-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    let targetId = '';
    if (tabId === 'sinruta') {
        targetId = 'inventarioTabSinRuta';
    } else {
        targetId = `inventarioTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`;
    }
    
    const targetContent = document.getElementById(targetId);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}

// ==================== FUNCIONES DE EXPORTACIÓN A XLS ====================

/**
 * Obtiene las series de un producto
 */
async function fetchSeriesByProduct(productId) {
    try {
        const url = `https://inventory.gcasan.com/api/specification-groups?product_id=${productId}`;
        console.log('🔍 Consultando IMEIs:', url);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Respuesta completa:', data);
        
        let result = [];
        if (data.data && Array.isArray(data.data)) {
            result = data.data;
        } else if (Array.isArray(data)) {
            result = data;
        } else if (data.result && Array.isArray(data.result)) {
            result = data.result;
        } else if (data.items && Array.isArray(data.items)) {
            result = data.items;
        } else {
            for (const key in data) {
                if (Array.isArray(data[key]) && data[key].length > 0) {
                    console.log(`📊 Encontrado array en la clave: "${key}"`);
                    result = data[key];
                    break;
                }
            }
        }
        
        console.log('📊 IMEIs encontrados:', result.length);
        console.log('📊 Primer IMEI:', result.length > 0 ? result[0] : 'Ninguno');
        
        return result;
    } catch (error) {
        console.error('❌ Error obteniendo IMEIs:', error);
        throw error;
    }
}

/**
 * Obtiene el código de barras del producto
 */
async function getProductBarcode(productId) {
    try {
        // Buscar en el caché primero
        const cached = productosCache.find(p => p.id === productId);
        if (cached && cached.barcode) {
            return cached.barcode;
        }
        
        const url = `${CONFIG.API_PRODUCTS}/${productId}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            console.warn('No se pudo obtener código de barras');
            return 'N/A';
        }
        
        const data = await response.json();
        const product = data.data || data;
        const barcode = product.barcode || product.code || product.sku || 'N/A';
        currentProductBarcode = barcode;
        return barcode;
    } catch (error) {
        console.warn('Error obteniendo código de barras:', error);
        return 'N/A';
    }
}

/**
 * Exporta los IMEIs a XLS con resumen
 */
async function exportSeriesToXLS() {
    console.log('🚀 INICIANDO EXPORTACIÓN A XLS...');
    
    if (!currentProductId) {
        showError('inventario', 'Primero selecciona un producto');
        alert('❌ Primero selecciona un producto');
        return;
    }
    
    const btn = document.getElementById('exportSeriesBtn');
    if (!btn) {
        console.error('❌ Botón de exportación no encontrado');
        return;
    }
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Exportando...';
    btn.disabled = true;
    
    try {
        // PASO 1: Obtener inventario para el mapa de warehouses
        console.log('📦 Obteniendo inventario...');
        const stockData = await fetchInventoryByProduct(currentProductId);
        console.log('✅ Stock obtenido:', stockData.length, 'items');
        
        // PASO 2: Crear mapa de warehouse_id -> nombre de sucursal
        console.log('🏪 Creando mapa de warehouses...');
        const warehouseMap = {};
        stockData.forEach(item => {
            const id = item.warehouse_id || item.id;
            const name = item.branch_name || item.warehouse_name || 'Sin nombre';
            warehouseMap[id] = name;
        });
        console.log('✅ Mapa de warehouses creado con', Object.keys(warehouseMap).length, 'elementos');
        
        // PASO 3: Obtener código de barras
        console.log('📷 Obteniendo código de barras...');
        const barcode = await getProductBarcode(currentProductId);
        console.log('✅ Código de barras:', barcode);
        
        // PASO 4: Obtener IMEIs del producto
        console.log('🔍 Obteniendo IMEIs del producto ID:', currentProductId);
        const allSpecs = await fetchSeriesByProduct(currentProductId);
        console.log('✅ IMEIs obtenidos:', allSpecs.length);
        
        if (allSpecs.length === 0) {
            showInfo('inventario', 'No se encontraron IMEIs para este producto');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        
        // PASO 5: Calcular cantidad total
        const totalIMEIs = allSpecs.length;
        
        // PASO 6: Procesar datos para la tabla
        console.log('📊 Procesando', allSpecs.length, 'IMEIs...');
        
        // Preparar datos para el Excel
        const excelData = [];
        
        // FILA 1: Título del reporte
        excelData.push(['REPORTE DE IMEIs']);
        excelData.push([]); // Fila en blanco
        
        // FILA 2: Descripción
        excelData.push(['Descripción', currentProductName]);
        
        // FILA 3: Código de barras
        excelData.push(['Código de barras', barcode]);
        
        // FILA 4: Cantidad total
        excelData.push(['Cantidad total', totalIMEIs]);
        
        // FILA 5: Fila en blanco
        excelData.push([]);
        
        // FILA 6: Cabeceras de la tabla
        excelData.push(['Almacén', 'IMEI', 'Fecha de ingreso', 'Fecha de compra']);
        
        // Procesar cada IMEI
        let conUbicacion = 0;
        let sinUbicacion = 0;
        
        for (const spec of allSpecs) {
            // Extraer IMEI
            const imei = extractImei(spec);
            
            // Extraer warehouse_id
            let warehouseId = null;
            let branchName = 'Sin ubicación';
            
            if (spec.stock && spec.stock.warehouse_id) {
                warehouseId = spec.stock.warehouse_id;
            }
            
            // Obtener nombre de la sucursal
            if (warehouseId && warehouseMap[warehouseId]) {
                branchName = warehouseMap[warehouseId];
                conUbicacion++;
            } else if (warehouseId) {
                const found = stockData.find(s => {
                    const id = s.warehouse_id || s.id;
                    return id == warehouseId;
                });
                if (found) {
                    branchName = found.branch_name || found.warehouse_name || `Warehouse ${warehouseId}`;
                    conUbicacion++;
                } else {
                    branchName = `Warehouse ${warehouseId}`;
                    sinUbicacion++;
                }
            } else {
                sinUbicacion++;
            }
            
            // Obtener fecha de ingreso
            const ingresoDate = getIngresoDate(spec);
            
            // Obtener fecha de compra
            const compraDate = getPurchaseDate(spec);
            
            // Agregar fila
            excelData.push([branchName, imei, ingresoDate, compraDate]);
        }
        
        console.log(`📊 RESUMEN: ${totalIMEIs} IMEIs, ${conUbicacion} con ubicación, ${sinUbicacion} sin ubicación`);
        
        // PASO 7: Crear el archivo XLS con SheetJS
        console.log('📊 Creando archivo XLS...');
        
        let XLSX;
        try {
            XLSX = window.XLSX;
            if (!XLSX) {
                // Intentar cargar desde CDN si no está disponible
                console.log('📦 Cargando librería XLSX desde CDN...');
                await loadXLSXLibrary();
                XLSX = window.XLSX;
            }
        } catch (e) {
            console.error('❌ Error al cargar XLSX:', e);
            // Fallback a CSV si no se puede cargar XLSX
            alert('⚠️ No se pudo cargar la librería XLSX. Se exportará en formato CSV.');
            exportSeriesCSVFallback(allSpecs, warehouseMap, stockData);
            return;
        }
        
        // Crear libro de trabajo
        const wb = XLSX.utils.book_new();
        
        // Convertir datos a hoja de trabajo
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // Ajustar anchos de columna
        const colWidths = [
            { wch: 35 }, // Almacén
            { wch: 22 }, // IMEI
            { wch: 18 }, // Fecha de ingreso
            { wch: 18 }  // Fecha de compra
        ];
        ws['!cols'] = colWidths;
        
        // Agregar hoja al libro
        XLSX.utils.book_append_sheet(wb, ws, 'IMEIs');
        
        // Generar archivo
        console.log('💾 Generando archivo XLS...');
        const wbout = XLSX.write(wb, { 
            bookType: 'xlsx', 
            type: 'array',
            bookSST: false
        });
        
        // Crear Blob y descargar
        const blob = new Blob([wbout], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `IMEIs_${currentProductName.replace(/\s+/g, '_')}_${dateStr}.xlsx`;
        link.download = fileName;
        
        document.body.appendChild(link);
        link.click();
        console.log('✅ Click en descarga ejecutado');
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log('✅ Limpieza completada');
        }, 100);
        
        showInfo('inventario', `✅ Exportados ${totalIMEIs} IMEIs a "${fileName}" (${conUbicacion} con ubicación)`);
        alert(`✅ Exportados ${totalIMEIs} IMEIs a "${fileName}"`);
        
    } catch (error) {
        console.error('❌ ERROR EN EXPORTACIÓN:', error);
        alert('❌ Error: ' + error.message);
        showError('inventario', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        console.log('🏁 EXPORTACIÓN FINALIZADA');
    }
}

/**
 * Función de respaldo para exportar a CSV si XLSX no está disponible
 */
function exportSeriesCSVFallback(allSpecs, warehouseMap, stockData) {
    let csvContent = '\uFEFF';
    csvContent += 'Descripción,Código de barras,Cantidad total\n';
    csvContent += `"${currentProductName}","${currentProductBarcode || 'N/A'}","${allSpecs.length}"\n\n`;
    csvContent += 'Almacén,IMEI,Fecha de ingreso,Fecha de compra\n';
    
    for (const spec of allSpecs) {
        const imei = extractImei(spec);
        let branchName = 'Sin ubicación';
        let warehouseId = null;
        
        if (spec.stock && spec.stock.warehouse_id) {
            warehouseId = spec.stock.warehouse_id;
        }
        
        if (warehouseId && warehouseMap[warehouseId]) {
            branchName = warehouseMap[warehouseId];
        } else if (warehouseId) {
            const found = stockData.find(s => {
                const id = s.warehouse_id || s.id;
                return id == warehouseId;
            });
            if (found) {
                branchName = found.branch_name || found.warehouse_name || `Warehouse ${warehouseId}`;
            } else {
                branchName = `Warehouse ${warehouseId}`;
            }
        }
        
        const ingresoDate = getIngresoDate(spec);
        const compraDate = getPurchaseDate(spec);
        csvContent += `"${branchName}","${imei}","${ingresoDate}","${compraDate}"\n`;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `IMEIs_${currentProductName.replace(/\s+/g, '_')}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Carga la librería XLSX desde CDN
 */
function loadXLSXLibrary() {
    return new Promise((resolve, reject) => {
        if (window.XLSX) {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
        script.onload = () => {
            console.log('✅ XLSX library loaded');
            resolve();
        };
        script.onerror = () => {
            reject(new Error('Failed to load XLSX library'));
        };
        document.head.appendChild(script);
    });
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    const searchInput = document.getElementById('productoSearchInput');
    if (searchInput && !searchInput.hasAttribute('data-listener')) {
        searchInput.setAttribute('data-listener', 'true');
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            if (searchTimeout) clearTimeout(searchTimeout);
            
            if (!query || query.length < 3) {
                document.getElementById('suggestionsContainer').innerHTML = '';
                return;
            }
            
            if (!productosCargados) {
                document.getElementById('suggestionsContainer').innerHTML = '<div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; color: #64748b;">⏳ Cargando...</div>';
                return;
            }
            
            searchTimeout = setTimeout(() => {
                const suggestions = searchProductsLocal(query);
                showSuggestions(suggestions);
            }, 300);
        });
        
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                const container = document.getElementById('suggestionsContainer');
                if (container) container.innerHTML = '';
            }, 200);
        });
    }
    
    const clearBtn = document.getElementById('clearProductBtn');
    if (clearBtn && !clearBtn.hasAttribute('data-listener')) {
        clearBtn.setAttribute('data-listener', 'true');
        clearBtn.addEventListener('click', clearSelectedProduct);
    }
    
    const searchBtn = document.getElementById('searchInventarioBtn');
    if (searchBtn && !searchBtn.hasAttribute('data-listener')) {
        searchBtn.setAttribute('data-listener', 'true');
        searchBtn.addEventListener('click', searchInventario);
    }
}

// ==================== INICIALIZAR MÓDULO ====================
async function initInventarioModule() {
    console.log('🔄 Inicializando módulo de inventario...');
    await loadProductCatalog();
    setupEventListeners();
    crearModalIMEI(); // Crear el modal de IMEIs
    
    const searchInput = document.getElementById('productoSearchInput');
    if (searchInput) searchInput.focus();
}

// ==================== CREAR MODAL DE IMEIs ====================
function crearModalIMEI() {
    // Verificar si ya existe el modal
    if (document.getElementById('imeiModal')) return;
    
    const modalHTML = `
        <div id="imeiModal" class="modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; justify-content: center; align-items: center; overflow-y: auto; padding: 20px;">
            <div style="background: white; border-radius: 16px; max-width: 800px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: modalFadeIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;">
                    <h3 id="imeiModalTitle" style="margin: 0; font-size: 1.1rem; color: #1e40af;">📱 IMEIs</h3>
                    <button onclick="closeImeiModal()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b; padding: 0 8px;">&times;</button>
                </div>
                <div id="imeiModalBody" style="padding: 20px; overflow-y: auto; flex: 1;">
                    <div style="text-align: center; padding: 40px; color: #64748b;">Cargando...</div>
                </div>
                <div style="padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; flex-shrink: 0;">
                    <button onclick="closeImeiModal()" style="padding: 8px 24px; background: #64748b; color: white; border: none; border-radius: 8px; cursor: pointer;">Cerrar</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes modalFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            .clickable-row:hover {
                background-color: #f0f9ff !important;
                transition: background-color 0.2s;
            }
            .clickable-row {
                cursor: pointer;
            }
            .clickable-row td:last-child {
                color: #3b82f6;
            }
            .almacen-general-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(124, 58, 237, 0.3);
                transition: all 0.3s ease;
            }
            .almacen-general-card {
                transition: all 0.3s ease;
            }
        </style>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('✅ Modal de IMEIs creado');
}

// ==================== ESTILOS ADICIONALES ====================
const inventarioStyles = `
    .suggestion-item:hover { background-color: #f0f9ff !important; }
    .stat-card { transition: all 0.3s ease; }
    .stat-card:hover { transform: translateY(-2px); }
    .inventario-tab-button {
        background: transparent;
        color: #64748b;
        border: none;
        padding: 8px 16px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border-radius: 8px 8px 0 0;
    }
    .inventario-tab-button:hover {
        background: #f1f5f9;
        color: #1e40af;
    }
    .inventario-tab-button.active {
        background: white;
        color: #f97316;
        border-bottom: 3px solid #f97316;
    }
    .btn-export:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(40, 167, 69, 0.4);
    }
    .btn-export:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none !important;
        box-shadow: none !important;
    }
    .clickable-row:hover {
        background-color: #f0f9ff !important;
        transition: background-color 0.2s;
    }
    .clickable-row {
        cursor: pointer;
    }
    .clickable-row td:last-child {
        color: #3b82f6;
    }
    .almacen-general-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(124, 58, 237, 0.3);
        transition: all 0.3s ease;
    }
    .almacen-general-card {
        transition: all 0.3s ease;
    }
`;

if (!document.querySelector('#inventario-styles')) {
    const style = document.createElement('style');
    style.id = 'inventario-styles';
    style.textContent = inventarioStyles;
    document.head.appendChild(style);
}

// ==================== INICIALIZAR CUANDO SE ACTIVE EL MÓDULO ====================
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si el módulo ya está activo
    const inventarioModule = document.getElementById('inventarioModule');
    if (inventarioModule && inventarioModule.classList.contains('active-module') && !productosCargados && !cargandoCatalogo) {
        initInventarioModule();
    }
    
    // Observar cambios en el módulo
    const observer = new MutationObserver(() => {
        const inventarioModule = document.getElementById('inventarioModule');
        if (inventarioModule && inventarioModule.classList.contains('active-module') && !productosCargados && !cargandoCatalogo) {
            initInventarioModule();
        }
    });
    
    if (inventarioModule) {
        observer.observe(inventarioModule, { attributes: true, attributeFilter: ['class'] });
    }
});

console.log('🔄 Módulo de inventario con exportación de IMEIs a XLS y modal por tienda/almacén general cargado');