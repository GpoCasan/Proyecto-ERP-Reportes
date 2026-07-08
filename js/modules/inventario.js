// ==================== MÓDULO: INVENTARIO POR MODELO ====================

let productosCache = [];
let productosCargados = false;
let cargandoCatalogo = false;
let currentProductId = null;
let searchTimeout = null;
let currentProductName = '';

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
    
    const searchInput = document.getElementById('productoSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    
    const selectedInfo = document.getElementById('selectedProductInfo');
    if (selectedInfo) selectedInfo.style.display = 'none';
    
    const searchBtn = document.getElementById('searchInventarioBtn');
    if (searchBtn) searchBtn.disabled = true;
    
    const results = document.getElementById('inventarioResults');
    if (results) {
        results.style.display = 'none';
        results.innerHTML = '';
    }
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

function getInventoryBySucursal(stockItems, sucursalNombre) {
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

// ==================== RENDERIZADO DE TABLAS ====================
function renderRutaTab(rutaNombre, rutaData, stockItems) {
    const sucursales = rutaData.sucursales;
    const color = rutaData.color;
    const icon = rutaData.icon;
    
    let sucursalesData = [];
    let totalQuantity = 0;
    let totalTransfer = 0;
    
    for (const sucursal of sucursales) {
        const inv = getInventoryBySucursal(stockItems, sucursal);
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
async function searchInventario() {
    if (!currentProductId) {
        showError('inventario', 'Por favor, selecciona un producto de la lista');
        return;
    }
    
    const btn = document.getElementById('searchInventarioBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando inventario... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    document.getElementById('inventarioResults').style.display = 'none';
    document.getElementById('inventarioErrorAlert').style.display = 'none';
    document.getElementById('inventarioInfoAlert').style.display = 'none';
    
    try {
        const stockData = await fetchInventoryByProduct(currentProductId);
        
        // DEBUG: Mostrar todas las sucursales
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
            
            if (isAlmacenGeneral(branchName, warehouseName)) {
                almacenGeneralQuantity += item.quantity || 0;
                almacenGeneralTransfer += item.transfer_quantity || 0;
                console.log(`🏭 ALMACÉN GENERAL: +${item.quantity} (${branchName})`);
            } else {
                otrasSucursales.push(item);
                console.log(`📦 Otra: ${branchName} -> +${item.quantity}`);
            }
        }
        
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
        
        // ========== CONSTRUIR HTML ==========
        let resultsHtml = `
            <!-- Tarjetas de resumen -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number" style="font-size: 0.75rem;">${escapeHtml(currentProductName.length > 30 ? currentProductName.substring(0, 30) + '...' : currentProductName)}</div>
                    <div class="stat-label">📱 Producto</div>
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
        
        document.getElementById('inventarioResults').innerHTML = resultsHtml;
        document.getElementById('inventarioResults').style.display = 'block';
        
        // Inicializar pestañas
        initInventarioTabs();
        
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
    
    const searchInput = document.getElementById('productoSearchInput');
    if (searchInput) searchInput.focus();
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
`;

if (!document.querySelector('#inventario-styles')) {
    const style = document.createElement('style');
    style.id = 'inventario-styles';
    style.textContent = inventarioStyles;
    document.head.appendChild(style);
}

// ==================== INICIALIZAR CUANDO SE ACTIVE EL MÓDULO ====================
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
        const inventarioModule = document.getElementById('inventarioModule');
        if (inventarioModule && inventarioModule.classList.contains('active-module') && !productosCargados && !cargandoCatalogo) {
            initInventarioModule();
        }
    });
    
    const moduleElement = document.getElementById('inventarioModule');
    if (moduleElement) {
        observer.observe(moduleElement, { attributes: true, attributeFilter: ['class'] });
    }
});