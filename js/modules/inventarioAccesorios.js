// ==================== MÓDULO: INVENTARIO ACCESORIOS ====================
// Este módulo consulta el inventario de accesorios (classification_id=2)
// y muestra el stock clasificado por rutas + exportación a Excel

let accesoriosCache = [];
let accesoriosCargados = false;
let cargandoCatalogoAccesorios = false;
let currentAccesorioId = null;
let searchTimeoutAccesorios = null;
let currentAccesorioName = '';
let currentStockData = [];

// ==================== CONFIGURACIÓN DE RUTAS (con nombre único) ====================
const RUTAS_ACCESORIOS_CONFIG = {
    "Ruta 1": {
        sucursales: ["Calkini", "Halacho", "Hecelchakan", "Hunucma", "Muna", "Tenabo", "Ticul 2", "Uman"],
        color: "#3b82f6",
        icon: "🚚"
    },
    "Ruta 2": {
        sucursales: ["Acanceh", "Chemax", "Chemax 2", "Hoctun", "Homun", "Huhi", "Kanasin", "Piste 2", "Sotuta", "Seye", "Valladolid Waldos", "Xocchel"],
        color: "#059669",
        icon: "🚚"
    },
    "Ruta 3": {
        sucursales: ["Baca", "Buctzotz", "Conkal", "Izamal", "Motul Mercado", "Dzidzantun", "Temax", "Tixkokob", "Tizimin", "Tizimin 2"],
        color: "#dc2626",
        icon: "🚚"
    },
    "Ruta 4": {
        sucursales: ["Dziuche", "Morelos", "Oxkutzcab 2", "Oxkutzcab 3", "Peto 2", "Teabo", "Tecoh", "Tekax", "Tekax 2", "Tekit", "Tzucacab"],
        color: "#f97316",
        icon: "🚚"
    }
};

// Palabras clave para detectar Almacén General
const ALMACEN_GENERAL_ACCESORIOS_KEYWORDS = [
    "almacen general", 
    "accesorios matriz", 
    "casa matriz", 
    "almacen matriz", 
    "matriz",
    "almacén general"
];

// ==================== CONFIGURACIÓN ====================
const ACCESORIOS_CLASSIFICATION_ID = 2;

// ==================== FUNCIONES DE UTILERÍA ====================
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

// ==================== CARGA DE CATÁLOGO DE ACCESORIOS ====================
async function loadAccesoriosCatalog() {
    console.log('📦 Iniciando carga de catálogo de accesorios...');
    
    if (accesoriosCargados) {
        console.log(`✅ Catálogo ya cargado: ${accesoriosCache.length} accesorios`);
        return accesoriosCache;
    }
    
    if (cargandoCatalogoAccesorios) {
        while (cargandoCatalogoAccesorios) await delay(100);
        return accesoriosCache;
    }
    
    cargandoCatalogoAccesorios = true;
    const searchInput = document.getElementById('accesorioSearchInput');
    const infoAlert = document.getElementById('inventarioAccesoriosInfoAlert');
    
    if (searchInput) {
        searchInput.disabled = true;
        searchInput.placeholder = 'Cargando catálogo de accesorios...';
    }
    
    if (infoAlert) {
        infoAlert.innerHTML = '📦 Cargando catálogo de accesorios...';
        infoAlert.style.display = 'block';
    }
    
    try {
        let allProducts = [];
        let currentPage = 1;
        let lastPage = 1;
        
        const firstUrl = `${CONFIG.API_PRODUCTS}?page=1&per_page=100&classification_id=${ACCESORIOS_CLASSIFICATION_ID}`;
        
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
            
            const url = `${CONFIG.API_PRODUCTS}?page=${page}&per_page=100&classification_id=${ACCESORIOS_CLASSIFICATION_ID}`;
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
                searchInput.placeholder = `Cargando... ${percent}% (${allProducts.length} accesorios)`;
            }
        }
        
        allProducts = allProducts.filter(p => p && p.id && p.name && p.name !== 'null' && p.name !== 'undefined');
        allProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        accesoriosCache = allProducts;
        accesoriosCargados = true;
        
        console.log(`✅ Catálogo de accesorios cargado: ${accesoriosCache.length} productos`);
        
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = '🔍 Buscar accesorio (ej: funda, cargador, case)...';
        }
        
        if (infoAlert) {
            infoAlert.innerHTML = `✅ ${accesoriosCache.length} accesorios disponibles`;
            setTimeout(() => {
                if (infoAlert) infoAlert.style.display = 'none';
            }, 3000);
        }
        
        // Activar el input para búsqueda después de cargar
        setupAccesoriosEventListeners();
        
        return accesoriosCache;
        
    } catch (error) {
        console.error('❌ Error:', error);
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = 'Error al cargar. Recarga la página.';
        }
        showError('inventarioAccesorios', `Error: ${error.message}`);
        return [];
    } finally {
        cargandoCatalogoAccesorios = false;
    }
}

// ==================== BÚSQUEDA LOCAL ====================
function searchAccesoriosLocal(query) {
    if (!query || query.length < 3) return [];
    if (!accesoriosCargados || accesoriosCache.length === 0) return [];
    
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    
    const results = accesoriosCache.filter(product => {
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

function showAccesoriosSuggestions(suggestions) {
    const container = document.getElementById('accesoriosSuggestionsContainer');
    if (!container) return;
    
    const searchQuery = document.getElementById('accesorioSearchInput')?.value || '';
    
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = `<div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; color: #64748b; z-index: 1000;">
            ❌ No se encontraron accesorios con "${searchQuery}"
        </div>`;
        return;
    }
    
    const suggestionsHtml = `
        <div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; max-height: 300px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            ${suggestions.map(prod => {
                const safeName = getSafeName(prod);
                return `
                    <div class="suggestion-item" data-id="${prod.id}" data-name="${escapeHtml(safeName)}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #e2e8f0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <strong>${escapeHtml(safeName)}</strong>
                                <div style="font-size: 0.65rem; color: #64748b;">ID: ${prod.id}</div>
                            </div>
                            <span class="badge-accesorio" style="font-size: 0.6rem; background: #8b5cf6; color: white; padding: 2px 10px; border-radius: 20px;">Accesorio</span>
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
            selectAccesorio(productId, productName);
        });
    });
}

function selectAccesorio(productId, productName) {
    currentAccesorioId = productId;
    currentAccesorioName = productName;
    
    const searchInput = document.getElementById('accesorioSearchInput');
    if (searchInput) searchInput.value = productName;
    
    const selectedInfo = document.getElementById('selectedAccesorioInfo');
    const selectedName = document.getElementById('selectedAccesorioName');
    if (selectedInfo && selectedName) {
        selectedName.textContent = productName;
        selectedInfo.style.display = 'block';
    }
    
    const searchBtn = document.getElementById('searchInventarioAccesoriosBtn');
    if (searchBtn) searchBtn.disabled = false;
    
    const container = document.getElementById('accesoriosSuggestionsContainer');
    if (container) container.innerHTML = '';
}

function clearSelectedAccesorio() {
    currentAccesorioId = null;
    currentAccesorioName = '';
    
    const searchInput = document.getElementById('accesorioSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    
    const selectedInfo = document.getElementById('selectedAccesorioInfo');
    if (selectedInfo) selectedInfo.style.display = 'none';
    
    const searchBtn = document.getElementById('searchInventarioAccesoriosBtn');
    if (searchBtn) searchBtn.disabled = true;
    
    const results = document.getElementById('inventarioAccesoriosResults');
    if (results) {
        results.style.display = 'none';
        results.innerHTML = '';
    }
    
    currentStockData = [];
}

// ==================== CONSULTA DE INVENTARIO POR ACCESORIO ====================
async function fetchInventoryByAccesorio(productId) {
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
        console.error('Error consultando inventario de accesorios:', error);
        throw error;
    }
}

// ==================== FUNCIONES DE IDENTIFICACIÓN ====================
function isAlmacenGeneralAccesorios(branchName, warehouseName) {
    const nameToCheck = (branchName || warehouseName || '').toLowerCase();
    const cleaned = nameToCheck.replace(/[^a-z0-9\sáéíóúüñ]/g, '').trim();
    
    for (const keyword of ALMACEN_GENERAL_ACCESORIOS_KEYWORDS) {
        if (cleaned.includes(keyword.toLowerCase())) {
            console.log(`✅ Almacén General detectado: "${nameToCheck}"`);
            return true;
        }
    }
    return false;
}

function getInventoryBySucursalAccesorios(stockItems, sucursalNombre) {
    const sucursalLower = sucursalNombre.toLowerCase();
    const item = stockItems.find(s => {
        const branchName = (s.branch_name || '').toLowerCase();
        const warehouseName = (s.warehouse_name || '').toLowerCase();
        return branchName.includes(sucursalLower) || warehouseName.includes(sucursalLower);
    });
    
    return {
        quantity: item?.quantity || 0,
        transfer_quantity: item?.transfer_quantity || 0,
        total: (item?.quantity || 0) + (item?.transfer_quantity || 0),
        hasStock: (item?.quantity || 0) > 0 || (item?.transfer_quantity || 0) > 0
    };
}

// ==================== RENDERIZADO DE TABLAS POR RUTA ====================
function renderRutaTabAccesorios(rutaNombre, rutaData, stockItems) {
    const sucursales = rutaData.sucursales;
    const color = rutaData.color;
    const icon = rutaData.icon;
    
    let sucursalesData = [];
    let totalQuantity = 0;
    let totalTransfer = 0;
    
    for (const sucursal of sucursales) {
        const inv = getInventoryBySucursalAccesorios(stockItems, sucursal);
        sucursalesData.push({
            nombre: sucursal,
            quantity: inv.quantity,
            transfer: inv.transfer_quantity,
            total: inv.total,
            hasStock: inv.hasStock
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
                        </tr>
                    </thead>
                    <tbody>
                        ${sucursalesData.map((suc, idx) => `
                            <tr style="border-bottom: 1px solid #e2e8f0; ${!suc.hasStock ? 'background-color: #fef2f2;' : ''}">
                                <td style="padding: 10px; text-align: center;">${idx + 1}</td>
                                <td style="padding: 10px; font-weight: 500;">
                                    🏪 ${escapeHtml(suc.nombre)}
                                    ${!suc.hasStock ? '<span style="margin-left: 8px; font-size: 0.65rem; color: #dc2626;">⚠️ SIN STOCK</span>' : ''}
                                </td>
                                <td style="padding: 10px; text-align: center; color: #059669; font-weight: bold;">${suc.quantity}</td>
                                <td style="padding: 10px; text-align: center; color: #f97316; font-weight: bold;">${suc.transfer}</td>
                                <td style="padding: 10px; text-align: center; font-weight: bold; background: #f0f9ff;">${suc.total}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background: #f8fafc; border-top: 2px solid ${color};">
                        <tr style="font-weight: bold;">
                            <td colspan="2" style="padding: 10px; text-align: right;">TOTAL ${rutaNombre}:</td>
                            <td style="padding: 10px; text-align: center; color: #059669;">${totalQuantity}</td>
                            <td style="padding: 10px; text-align: center; color: #f97316;">${totalTransfer}</td>
                            <td style="padding: 10px; text-align: center; background: #e8f4f8;">${totalGeneral}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

function renderSinRutaTabAccesorios(sucursalesData) {
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
                        </tr>
                    </thead>
                    <tbody>
                        ${sucursalesData.map((suc, idx) => `
                            <tr style="border-bottom: 1px solid #e2e8f0; ${!suc.hasStock ? 'background-color: #fef2f2;' : ''}">
                                <td style="padding: 10px; text-align: center;">${idx + 1}</td>
                                <td style="padding: 10px; font-weight: 500;">
                                    🏪 ${escapeHtml(suc.nombre)}
                                    ${!suc.hasStock ? '<span style="margin-left: 8px; font-size: 0.65rem; color: #dc2626;">⚠️ SIN STOCK</span>' : ''}
                                </td>
                                <td style="padding: 10px; text-align: center; color: #059669; font-weight: bold;">${suc.quantity}</td>
                                <td style="padding: 10px; text-align: center; color: #f97316; font-weight: bold;">${suc.transfer}</td>
                                <td style="padding: 10px; text-align: center; font-weight: bold; background: #f0f9ff;">${suc.total}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background: #f8fafc; border-top: 2px solid #64748b;">
                        <tr style="font-weight: bold;">
                            <td colspan="2" style="padding: 10px; text-align: right;">TOTAL:</td>
                            <td style="padding: 10px; text-align: center; color: #059669;">${totalQuantity}</td>
                            <td style="padding: 10px; text-align: center; color: #f97316;">${totalTransfer}</td>
                            <td style="padding: 10px; text-align: center; background: #e8f4f8;">${totalGeneral}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// ==================== FUNCIÓN PRINCIPAL ====================
async function searchInventarioAccesorios() {
    if (!currentAccesorioId) {
        showError('inventarioAccesorios', 'Por favor, selecciona un accesorio de la lista');
        return;
    }
    
    const btn = document.getElementById('searchInventarioAccesoriosBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando inventario... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    document.getElementById('inventarioAccesoriosResults').style.display = 'none';
    document.getElementById('inventarioAccesoriosErrorAlert').style.display = 'none';
    document.getElementById('inventarioAccesoriosInfoAlert').style.display = 'none';
    
    try {
        const stockData = await fetchInventoryByAccesorio(currentAccesorioId);
        currentStockData = stockData;
        
        console.log('📊 DATOS RECIBIDOS:');
        stockData.forEach(item => {
            console.log(`   - "${item.branch_name}" (${item.warehouse_name}) -> 📦${item.quantity} 🚚${item.transfer_quantity}`);
        });
        
        // ========== SEPARAR ALMACÉN GENERAL ==========
        let almacenGeneralQuantity = 0;
        let almacenGeneralTransfer = 0;
        const otrasSucursales = [];
        
        for (const item of stockData) {
            const branchName = item.branch_name || '';
            const warehouseName = item.warehouse_name || '';
            
            if (isAlmacenGeneralAccesorios(branchName, warehouseName)) {
                almacenGeneralQuantity += item.quantity || 0;
                almacenGeneralTransfer += item.transfer_quantity || 0;
                console.log(`🏭 ALMACÉN GENERAL: +${item.quantity} (${branchName})`);
            } else {
                otrasSucursales.push(item);
                console.log(`📦 Otra: ${branchName} -> +${item.quantity}`);
            }
        }
        
        console.log(`📊 TOTAL ALMACÉN GENERAL: ${almacenGeneralQuantity} + ${almacenGeneralTransfer} en tránsito`);
        
        // ========== ENCONTRAR SUCURSALES SIN RUTA ==========
        const sucursalesEnRuta = new Set();
        for (const ruta of Object.values(RUTAS_ACCESORIOS_CONFIG)) {
            for (const suc of ruta.sucursales) {
                sucursalesEnRuta.add(normalizeText(suc));
            }
        }
        
        const sucursalesSinRuta = [];
        for (const item of otrasSucursales) {
            const branchName = item.branch_name;
            if (branchName) {
                const normalizedBranch = normalizeText(branchName);
                const hasStock = (item.quantity > 0 || item.transfer_quantity > 0);
                if (!sucursalesEnRuta.has(normalizedBranch) && hasStock) {
                    const existing = sucursalesSinRuta.find(s => s.nombre === branchName);
                    if (existing) {
                        existing.quantity += item.quantity || 0;
                        existing.transfer += item.transfer_quantity || 0;
                        existing.total = existing.quantity + existing.transfer;
                        existing.hasStock = true;
                    } else {
                        sucursalesSinRuta.push({
                            nombre: branchName,
                            quantity: item.quantity || 0,
                            transfer: item.transfer_quantity || 0,
                            total: (item.quantity || 0) + (item.transfer_quantity || 0),
                            hasStock: true
                        });
                    }
                }
            }
        }
        
        console.log(`📊 Sucursales sin ruta con stock: ${sucursalesSinRuta.length}`);
        
        // ========== CALCULAR TOTALES GENERALES ==========
        let totalGeneralQuantity = almacenGeneralQuantity;
        let totalGeneralTransfer = almacenGeneralTransfer;
        
        for (const ruta of Object.values(RUTAS_ACCESORIOS_CONFIG)) {
            for (const sucursal of ruta.sucursales) {
                const inv = getInventoryBySucursalAccesorios(otrasSucursales, sucursal);
                totalGeneralQuantity += inv.quantity;
                totalGeneralTransfer += inv.transfer_quantity;
            }
        }
        
        for (const suc of sucursalesSinRuta) {
            totalGeneralQuantity += suc.quantity;
            totalGeneralTransfer += suc.transfer;
        }
        
        const totalGeneral = totalGeneralQuantity + totalGeneralTransfer;
        
        // ========== CONSTRUIR HTML ==========
        let resultsHtml = `
            <!-- Tarjetas de resumen -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number" style="font-size: 0.75rem;">${escapeHtml(currentAccesorioName.length > 30 ? currentAccesorioName.substring(0, 30) + '...' : currentAccesorioName)}</div>
                    <div class="stat-label">🔌 Accesorio</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number">${almacenGeneralQuantity}</div>
                    <div class="stat-label">🏭 Almacén General</div>
                    ${almacenGeneralTransfer > 0 ? `<div style="font-size: 0.65rem;">🚚 +${almacenGeneralTransfer} en tránsito</div>` : ''}
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
                ${renderRutaTabAccesorios("Ruta 1", RUTAS_ACCESORIOS_CONFIG["Ruta 1"], otrasSucursales)}
            </div>
            <div id="inventarioTabRuta2" class="inventario-tab-content" style="display: none;">
                ${renderRutaTabAccesorios("Ruta 2", RUTAS_ACCESORIOS_CONFIG["Ruta 2"], otrasSucursales)}
            </div>
            <div id="inventarioTabRuta3" class="inventario-tab-content" style="display: none;">
                ${renderRutaTabAccesorios("Ruta 3", RUTAS_ACCESORIOS_CONFIG["Ruta 3"], otrasSucursales)}
            </div>
            <div id="inventarioTabRuta4" class="inventario-tab-content" style="display: none;">
                ${renderRutaTabAccesorios("Ruta 4", RUTAS_ACCESORIOS_CONFIG["Ruta 4"], otrasSucursales)}
            </div>
        `;
        
        if (sucursalesSinRuta.length > 0) {
            resultsHtml += `
                <div id="inventarioTabSinRuta" class="inventario-tab-content" style="display: none;">
                    ${renderSinRutaTabAccesorios(sucursalesSinRuta)}
                </div>
            `;
        }
        
        // ====== BOTÓN DE EXPORTAR ======
        resultsHtml += `
            <div style="display: flex; justify-content: flex-end; margin-top: 20px; gap: 10px;">
                <button id="exportAccesoriosExcelBtn" class="btn-export-excel" style="background: #059669; padding: 10px 24px; border-radius: 8px; color: white; border: none; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    📊 Exportar a Excel
                </button>
            </div>
        `;
        
        document.getElementById('inventarioAccesoriosResults').innerHTML = resultsHtml;
        document.getElementById('inventarioAccesoriosResults').style.display = 'block';
        
        // Inicializar pestañas
        initInventarioTabsAccesorios();
        
        // Agregar listener al botón de exportar
        const exportBtn = document.getElementById('exportAccesoriosExcelBtn');
        if (exportBtn) {
            exportBtn.removeEventListener('click', exportAccesoriosToExcel);
            exportBtn.addEventListener('click', exportAccesoriosToExcel);
        }
        
        const hasStock = stockData.some(item => 
            (item.quantity || 0) > 0 || (item.transfer_quantity || 0) > 0
        );
        
        if (!hasStock) {
            showInfo('inventarioAccesorios', '⚠️ No hay inventario disponible para este accesorio en ninguna sucursal');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('inventarioAccesorios', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== INICIALIZAR PESTAÑAS ====================
function initInventarioTabsAccesorios() {
    const tabButtons = document.querySelectorAll('.inventario-tab-button');
    if (tabButtons.length === 0) return;
    
    tabButtons.forEach(button => {
        button.removeEventListener('click', handleTabClickAccesorios);
        button.addEventListener('click', handleTabClickAccesorios);
    });
}

function handleTabClickAccesorios(e) {
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

// ==================== EXPORTAR A EXCEL ====================
function exportAccesoriosToExcel() {
    if (!currentStockData || currentStockData.length === 0) {
        showError('inventarioAccesorios', 'No hay datos para exportar');
        return;
    }
    
    try {
        const filteredData = currentStockData.filter(item => 
            (item.quantity || 0) > 0 || (item.transfer_quantity || 0) > 0
        );
        
        if (filteredData.length === 0) {
            showError('inventarioAccesorios', 'No hay datos con stock para exportar');
            return;
        }
        
        const excelData = [];
        
        excelData.push(['INVENTARIO DE ACCESORIOS']);
        excelData.push(['Producto:', currentAccesorioName]);
        excelData.push(['Fecha de consulta:', new Date().toLocaleString()]);
        excelData.push([]);
        
        excelData.push(['#', 'Sucursal', 'Almacén', 'Cantidad', 'En Tránsito', 'Total']);
        
        const sortedData = [...filteredData].sort((a, b) => {
            const branchA = (a.branch_name || '').toLowerCase();
            const branchB = (b.branch_name || '').toLowerCase();
            if (branchA < branchB) return -1;
            if (branchA > branchB) return 1;
            return 0;
        });
        
        let totalQty = 0;
        let totalTransfer = 0;
        
        sortedData.forEach((item, index) => {
            const qty = item.quantity || 0;
            const transfer = item.transfer_quantity || 0;
            totalQty += qty;
            totalTransfer += transfer;
            
            excelData.push([
                index + 1,
                item.branch_name || 'Sin sucursal',
                item.warehouse_name || 'Sin almacén',
                qty,
                transfer,
                qty + transfer
            ]);
        });
        
        excelData.push([]);
        excelData.push(['', '', 'TOTALES:', totalQty, totalTransfer, totalQty + totalTransfer]);
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        ws['!cols'] = [
            { wch: 5 },
            { wch: 30 },
            { wch: 30 },
            { wch: 12 },
            { wch: 12 },
            { wch: 12 }
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
        
        const fileName = `Inventario_Accesorios_${currentAccesorioName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
        
        showInfo('inventarioAccesorios', `✅ Excel exportado correctamente: ${fileName}`);
        
    } catch (error) {
        console.error('Error exportando a Excel:', error);
        showError('inventarioAccesorios', `Error al exportar: ${error.message}`);
    }
}

// ==================== EVENT LISTENERS ====================
function setupAccesoriosEventListeners() {
    console.log('🔧 Configurando event listeners para búsqueda de accesorios...');
    
    const searchInput = document.getElementById('accesorioSearchInput');
    if (!searchInput) {
        console.warn('⚠️ No se encontró el input de búsqueda');
        return;
    }
    
    searchInput.removeEventListener('input', handleSearchInput);
    searchInput.removeEventListener('blur', handleSearchBlur);
    
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('blur', handleSearchBlur);
    
    console.log('✅ Event listeners configurados correctamente');
}

function handleSearchInput(e) {
    const query = e.target.value;
    if (searchTimeoutAccesorios) clearTimeout(searchTimeoutAccesorios);
    
    if (!query || query.length < 3) {
        document.getElementById('accesoriosSuggestionsContainer').innerHTML = '';
        return;
    }
    
    if (!accesoriosCargados) {
        document.getElementById('accesoriosSuggestionsContainer').innerHTML = '<div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; color: #64748b;">⏳ Cargando...</div>';
        return;
    }
    
    searchTimeoutAccesorios = setTimeout(() => {
        const suggestions = searchAccesoriosLocal(query);
        showAccesoriosSuggestions(suggestions);
    }, 300);
}

function handleSearchBlur() {
    setTimeout(() => {
        const container = document.getElementById('accesoriosSuggestionsContainer');
        if (container) container.innerHTML = '';
    }, 200);
}

function setupButtonListeners() {
    const clearBtn = document.getElementById('clearAccesorioBtn');
    if (clearBtn) {
        clearBtn.removeEventListener('click', clearSelectedAccesorio);
        clearBtn.addEventListener('click', clearSelectedAccesorio);
    }
    
    const searchBtn = document.getElementById('searchInventarioAccesoriosBtn');
    if (searchBtn) {
        searchBtn.removeEventListener('click', searchInventarioAccesorios);
        searchBtn.addEventListener('click', searchInventarioAccesorios);
    }
}

// ==================== INICIALIZAR MÓDULO ====================
async function initInventarioAccesoriosModule() {
    console.log('🔄 Inicializando módulo de inventario de accesorios...');
    
    if (!accesoriosCargados && !cargandoCatalogoAccesorios) {
        await loadAccesoriosCatalog();
    } else if (accesoriosCargados) {
        console.log(`📦 Usando catálogo en caché: ${accesoriosCache.length} accesorios`);
    }
    
    setupAccesoriosEventListeners();
    setupButtonListeners();
    
    const searchInput = document.getElementById('accesorioSearchInput');
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
    }
    
    if (!currentAccesorioId) {
        const searchBtn = document.getElementById('searchInventarioAccesoriosBtn');
        if (searchBtn) searchBtn.disabled = true;
    }
}

// ==================== ESTILOS ADICIONALES ====================
const accesoriosStyles = `
    .suggestion-item:hover { background-color: #f5f3ff !important; }
    .stat-card { transition: all 0.3s ease; }
    .stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .badge-accesorio { background: #8b5cf6; color: white; padding: 2px 10px; border-radius: 20px; font-size: 0.6rem; }
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
        color: #7c3aed;
    }
    .inventario-tab-button.active {
        background: white;
        color: #7c3aed;
        border-bottom: 3px solid #7c3aed;
    }
`;

if (!document.querySelector('#inventario-accesorios-styles')) {
    const style = document.createElement('style');
    style.id = 'inventario-accesorios-styles';
    style.textContent = accesoriosStyles;
    document.head.appendChild(style);
}

// ==================== INICIALIZAR CUANDO SE ACTIVE EL MÓDULO ====================
let moduleObserverAccesorios = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM cargado, buscando módulo de inventario accesorios...');
    
    const moduleElement = document.getElementById('inventarioAccesoriosModule');
    if (moduleElement && moduleElement.classList.contains('active-module')) {
        console.log('🔍 Módulo ya activo, inicializando...');
        initInventarioAccesoriosModule();
    }
    
    if (moduleObserverAccesorios) {
        moduleObserverAccesorios.disconnect();
    }
    
    moduleObserverAccesorios = new MutationObserver(() => {
        const module = document.getElementById('inventarioAccesoriosModule');
        if (module && module.classList.contains('active-module')) {
            console.log('🔍 Módulo activado, inicializando...');
            initInventarioAccesoriosModule();
        }
    });
    
    if (moduleElement) {
        moduleObserverAccesorios.observe(moduleElement, { attributes: true, attributeFilter: ['class'] });
        console.log('👀 Observando cambios en el módulo');
    } else {
        console.warn('⚠️ No se encontró el módulo inventarioAccesoriosModule en el DOM');
    }
});

console.log('📦 Módulo de Inventario de Accesorios cargado correctamente');