// ==================== MÓDULO: INVENTARIO ACCESORIOS ====================
// Este módulo consulta el inventario de accesorios (classification_id=2)
// y muestra el stock clasificado por rutas + tarjetas de costo, precio, markup y ventas

let accesoriosCache = [];
let accesoriosCargados = false;
let cargandoCatalogoAccesorios = false;
let currentAccesorioId = null;
let searchTimeoutAccesorios = null;
let currentAccesorioName = '';
let currentStockData = [];
let currentSalesByBranch = {};

// ==================== CONFIGURACIÓN ====================
// NOTA: RUTAS_CONFIG y ALMACEN_GENERAL_KEYWORDS ahora vienen de config.js
// No es necesario redeclararlas aquí

const ACCESORIOS_CLASSIFICATION_ID = 2;
const FACTOR_INVENTARIO_SUGERIDO = 2; // Multiplicador para inventario sugerido (semana * 2)
const INVENTARIO_MINIMO_SIN_VENTAS = 1; // Inventario mínimo cuando no hay ventas
const IVA = 1.16; // Factor de IVA

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

function formatCurrency(value) {
    if (value === undefined || value === null || isNaN(value)) return '$0.00';
    return '$' + parseFloat(value).toFixed(2);
}

// ==================== OBTENER COSTO DEL PRODUCTO ====================
async function fetchProductCost(productId) {
    try {
        const url = `https://supply.gcasan.com/api/products/${productId}/cost`;
        console.log(`📡 Consultando costo: ${url}`);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            console.warn(`⚠️ Error al obtener costo: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        console.log(`💰 Costo obtenido:`, data);
        
        if (data && data.data && data.data.cost !== undefined) {
            const costValue = parseFloat(data.data.cost);
            if (!isNaN(costValue) && costValue > 0) {
                return costValue;
            }
        }
        
        if (data && data.cost !== undefined) {
            const costValue = parseFloat(data.cost);
            if (!isNaN(costValue) && costValue > 0) {
                return costValue;
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Error consultando costo:', error);
        return null;
    }
}

// ==================== OBTENER PRECIO DE VENTA ====================
async function fetchProductPrice(productId) {
    try {
        const url = `https://catalogs.gcasan.com/api/products/${productId}/price?per_page=-1&product_id=${productId}&price_type_id=1`;
        console.log(`📡 Consultando precio: ${url}`);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            console.warn(`⚠️ Error al obtener precio: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        console.log(`💰 Precio obtenido:`, data);
        
        if (data && data.data && data.data.length > 0) {
            const priceItem = data.data.find(p => p.branch_id === null) || data.data[0];
            const price = parseFloat(priceItem.price);
            if (!isNaN(price) && price > 0) {
                return price;
            }
        }
        return null;
        
    } catch (error) {
        console.error('❌ Error consultando precio:', error);
        return null;
    }
}

// ==================== OBTENER VENTAS POR TIENDA DEL MES ANTERIOR ====================
async function fetchSalesByBranch(productId) {
    try {
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const startDate = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01 06:00:00`;
        const lastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
        const endDate = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 06:00:00`;
        
        const url = `https://reports.gcasan.com/api/sales/product-sales?start_date=${startDate}&end_date=${endDate}&product_ids[]=${productId}&page=1&per_page=1000`;
        console.log(`📡 Consultando ventas por tienda: ${url}`);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            console.warn(`⚠️ Error al obtener ventas por tienda: ${response.status}`);
            return {};
        }
        
        const data = await response.json();
        console.log(`📊 Ventas por tienda (respuesta completa):`, data);
        
        const salesByBranch = {};
        let totalQuantity = 0;
        let totalAmount = 0;
        
        if (data && data.data && Array.isArray(data.data)) {
            data.data.forEach(item => {
                const branchName = item.branch || '';
                const quantity = parseInt(item.quantity) || 0;
                const amount = parseFloat(item.total) || 0;
                
                if (branchName) {
                    const normalized = normalizeText(branchName);
                    
                    if (!salesByBranch[normalized]) {
                        salesByBranch[normalized] = {
                            quantity: 0,
                            amount: 0
                        };
                    }
                    salesByBranch[normalized].quantity += quantity;
                    salesByBranch[normalized].amount += amount;
                    totalQuantity += quantity;
                    totalAmount += amount;
                    
                    console.log(`   📊 ${branchName}: ${quantity} piezas ($${amount.toFixed(2)})`);
                }
            });
        }
        
        console.log(`📊 Ventas por tienda procesadas:`, salesByBranch);
        console.log(`📦 Total piezas vendidas: ${totalQuantity}`);
        console.log(`💰 Total ventas: ${formatCurrency(totalAmount)}`);
        
        salesByBranch._totalQuantity = totalQuantity;
        salesByBranch._totalAmount = totalAmount;
        
        return salesByBranch;
        
    } catch (error) {
        console.error('❌ Error consultando ventas por tienda:', error);
        return {};
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
        
        // Obtener TODOS los productos y filtrar en cliente
        const firstUrl = `${CONFIG.API_PRODUCTS}?page=1&per_page=100`;
        console.log('📡 Consultando todos los productos...');
        
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
            
            const url = `${CONFIG.API_PRODUCTS}?page=${page}&per_page=100`;
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
                searchInput.placeholder = `Cargando... ${percent}% (${allProducts.length} productos)`;
            }
        }
        
        console.log(`📊 Total productos obtenidos: ${allProducts.length}`);
        
        // FILTRO ESTRICTO: Solo classification.id === 2
        allProducts = allProducts.filter(p => {
            // Validación básica
            if (!p || !p.id || !p.name || p.name === 'null' || p.name === 'undefined') {
                return false;
            }
            
            // Verificar classification.id
            const classificationId = p.classification?.id || p.classification_id;
            if (classificationId === ACCESORIOS_CLASSIFICATION_ID) {
                return true;
            }
            
            return false;
        });
        
        console.log(`✅ Accesorios encontrados: ${allProducts.length}`);
        
        allProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        accesoriosCache = allProducts;
        accesoriosCargados = true;
        
        console.log(`✅ Catálogo de accesorios cargado: ${accesoriosCache.length} productos`);
        
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = '🔍 Buscar accesorio (ej: funda, cargador, case)...';
        }
        
        if (infoAlert) {
            if (accesoriosCache.length === 0) {
                infoAlert.innerHTML = `⚠️ No se encontraron accesorios (classification_id=${ACCESORIOS_CLASSIFICATION_ID})`;
                infoAlert.style.background = '#fef2f2';
                infoAlert.style.color = '#dc2626';
            } else {
                infoAlert.innerHTML = `✅ ${accesoriosCache.length} accesorios disponibles`;
            }
            setTimeout(() => {
                if (infoAlert) infoAlert.style.display = 'none';
            }, 3000);
        }
        
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
    currentSalesByBranch = {};
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
    
    for (const keyword of ALMACEN_GENERAL_KEYWORDS) {
        if (cleaned.includes(keyword.toLowerCase())) {
            console.log(`✅ Almacén General detectado: "${nameToCheck}"`);
            return true;
        }
    }
    return false;
}

function getInventoryBySucursalAccesorios(stockItems, sucursalNombre, salesByBranch) {
    const sucursalLower = sucursalNombre.toLowerCase();
    const item = stockItems.find(s => {
        const branchName = (s.branch_name || '').toLowerCase();
        const warehouseName = (s.warehouse_name || '').toLowerCase();
        return branchName.includes(sucursalLower) || warehouseName.includes(sucursalLower);
    });
    
    const quantity = item?.quantity || 0;
    const normalizedBranch = normalizeText(sucursalNombre);
    const salesData = salesByBranch[normalizedBranch] || { quantity: 0, amount: 0 };
    const salesQuantity = salesData.quantity || 0;
    
    // Calcular inventario sugerido: (ventas / 4 semanas) * FACTOR (2)
    let suggestedInventory = 0;
    if (salesQuantity > 0) {
        suggestedInventory = Math.ceil((salesQuantity / 4) * FACTOR_INVENTARIO_SUGERIDO);
    } else {
        // Si no tuvo ventas, inventario mínimo de 1
        suggestedInventory = INVENTARIO_MINIMO_SIN_VENTAS;
    }
    
    const difference = quantity - suggestedInventory;
    
    return {
        quantity: quantity,
        hasStock: quantity > 0,
        salesQuantity: salesQuantity,
        suggestedInventory: suggestedInventory,
        difference: difference
    };
}

// ==================== RENDERIZADO DE TABLAS POR RUTA ====================
function renderRutaTabAccesorios(rutaNombre, rutaData, stockItems, salesByBranch) {
    const sucursales = rutaData.sucursales;
    const color = rutaData.color;
    const icon = rutaData.icon;
    
    let sucursalesData = [];
    let totalQuantity = 0;
    let totalSalesQuantity = 0;
    let totalSuggested = 0;
    let totalDifference = 0;
    
    for (const sucursal of sucursales) {
        const inv = getInventoryBySucursalAccesorios(stockItems, sucursal, salesByBranch);
        sucursalesData.push({
            nombre: sucursal,
            quantity: inv.quantity,
            hasStock: inv.hasStock,
            salesQuantity: inv.salesQuantity,
            suggestedInventory: inv.suggestedInventory,
            difference: inv.difference
        });
        totalQuantity += inv.quantity;
        totalSalesQuantity += inv.salesQuantity;
        totalSuggested += inv.suggestedInventory;
        totalDifference += inv.difference;
    }
    
    const sinStockCount = sucursalesData.filter(s => !s.hasStock).length;
    
    // Función para obtener el color y formato de la diferencia
    const getDifferenceDisplay = (diff) => {
        if (diff < 0) {
            return `<span style="color: #dc2626; font-weight: bold;">${diff}</span>`;
        } else if (diff >= 4) {
            return `<span style="color: #059669; font-weight: bold;">+${diff}</span>`;
        } else if (diff >= 0 && diff <= 3) {
            return `<span style="color: #2563eb; font-weight: bold;">+${diff}</span>`;
        }
        return `<span style="color: #94a3b8;">${diff}</span>`;
    };
    
    return `
        <div style="background: white; border-radius: 12px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.12);">
            <div style="background: ${color}; color: white; padding: 14px 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size: 1.4rem;">${icon}</span>
                        <strong style="font-size: 1.1rem; margin-left: 10px;">${rutaNombre}</strong>
                        <span style="margin-left: 12px; font-size: 0.8rem; opacity: 0.9;">${sucursales.length} sucursales</span>
                        ${sinStockCount > 0 ? `<span style="margin-left: 12px; font-size: 0.7rem; background: rgba(0,0,0,0.2); padding: 2px 12px; border-radius: 20px;">⚠️ ${sinStockCount} sin stock</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 20px; font-size: 0.9rem;">
                        <span style="font-weight: bold;">📦 ${totalQuantity}</span>
                        <span style="font-weight: bold;">📊 ${totalSalesQuantity} pzs</span>
                        <span style="font-weight: bold;">🎯 ${totalSuggested}</span>
                        <span style="font-weight: bold;">📊 ${totalDifference > 0 ? '+' : ''}${totalDifference}</span>
                    </div>
                </div>
            </div>
            <div style="padding: 0; overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                    <thead style="background: #f1f5f9; border-bottom: 2px solid #e2e8f0;">
                        <tr>
                            <th style="padding: 14px 16px; text-align: center; width: 40px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">#</th>
                            <th style="padding: 14px 16px; text-align: left; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">🏪 Sucursal</th>
                            <th style="padding: 14px 16px; text-align: center; width: 80px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">📦 Actual</th>
                            <th style="padding: 14px 16px; text-align: center; width: 80px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">📊 Ventas (pzs)</th>
                            <th style="padding: 14px 16px; text-align: center; width: 100px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">🎯 Sugerido</th>
                            <th style="padding: 14px 16px; text-align: center; width: 100px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">📊 Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sucursalesData.map((suc, idx) => `
                            <tr style="border-bottom: 1px solid #e2e8f0; ${!suc.hasStock ? 'background-color: #fef2f2;' : (idx % 2 === 0 ? 'background-color: #fafafa;' : '')}">
                                <td style="padding: 12px 16px; text-align: center; color: #64748b; font-size: 0.9rem;">${idx + 1}</td>
                                <td style="padding: 12px 16px; font-weight: 500; font-size: 0.95rem;">
                                    🏪 ${escapeHtml(suc.nombre)}
                                    ${!suc.hasStock ? '<span style="margin-left: 12px; font-size: 0.75rem; color: #dc2626; font-weight: 600;">⚠️ SIN STOCK</span>' : ''}
                                </td>
                                <td style="padding: 12px 16px; text-align: center; font-weight: bold; color: ${suc.hasStock ? '#059669' : '#94a3b8'}; font-size: 1.05rem;">${suc.quantity}</td>
                                <td style="padding: 12px 16px; text-align: center; font-weight: 500; color: ${suc.salesQuantity > 0 ? '#2563eb' : '#94a3b8'}; font-size: 0.95rem;">${suc.salesQuantity}</td>
                                <td style="padding: 12px 16px; text-align: center; font-weight: bold; color: ${suc.suggestedInventory > 0 ? '#7c3aed' : '#94a3b8'}; font-size: 0.95rem;">${suc.suggestedInventory > 0 ? suc.suggestedInventory : '—'}</td>
                                <td style="padding: 12px 16px; text-align: center; font-size: 1rem;">
                                    ${getDifferenceDisplay(suc.difference)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background: #f1f5f9; border-top: 2px solid ${color};">
                        <tr style="font-weight: bold;">
                            <td colspan="2" style="padding: 14px 16px; text-align: right; font-size: 0.95rem; color: #1e293b;">TOTAL ${rutaNombre}:</td>
                            <td style="padding: 14px 16px; text-align: center; font-size: 1.1rem; color: ${color};">${totalQuantity}</td>
                            <td style="padding: 14px 16px; text-align: center; font-size: 1.1rem; color: ${color};">${totalSalesQuantity}</td>
                            <td style="padding: 14px 16px; text-align: center; font-size: 1.1rem; color: ${color};">${totalSuggested}</td>
                            <td style="padding: 14px 16px; text-align: center; font-size: 1.1rem; color: ${color};">${totalDifference > 0 ? '+' : ''}${totalDifference}</td>
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
        const [stockData, cost, price, salesByBranch] = await Promise.all([
            fetchInventoryByAccesorio(currentAccesorioId),
            fetchProductCost(currentAccesorioId),
            fetchProductPrice(currentAccesorioId),
            fetchSalesByBranch(currentAccesorioId)
        ]);
        
        currentStockData = stockData;
        currentSalesByBranch = salesByBranch;
        
        console.log('📊 DATOS RECIBIDOS:');
        stockData.forEach(item => {
            console.log(`   - "${item.branch_name}" (${item.warehouse_name}) -> 📦${item.quantity}`);
        });
        console.log('📊 Ventas por tienda:', salesByBranch);
        
        // ========== SEPARAR ALMACÉN GENERAL ==========
        let almacenGeneralQuantity = 0;
        const otrasSucursales = [];
        
        for (const item of stockData) {
            const branchName = item.branch_name || '';
            const warehouseName = item.warehouse_name || '';
            
            if (isAlmacenGeneralAccesorios(branchName, warehouseName)) {
                almacenGeneralQuantity += item.quantity || 0;
                console.log(`🏭 ALMACÉN GENERAL: +${item.quantity} (${branchName})`);
            } else {
                otrasSucursales.push(item);
                console.log(`📦 Otra: ${branchName} -> +${item.quantity}`);
            }
        }
        
        console.log(`📊 TOTAL ALMACÉN GENERAL: ${almacenGeneralQuantity}`);
        
        // ========== CALCULAR TOTALES ==========
        let totalSucursalesConRuta = 0;
        let totalSalesQuantityConRuta = 0;
        let totalSalesAmountConRuta = 0;
        let totalSuggestedConRuta = 0;
        let totalDifferenceConRuta = 0;
        
        for (const item of otrasSucursales) {
            const branchName = item.branch_name;
            if (branchName) {
                const normalizedBranch = normalizeText(branchName);
                const quantity = item.quantity || 0;
                const salesData = salesByBranch[normalizedBranch] || { quantity: 0, amount: 0 };
                const salesQuantity = salesData.quantity || 0;
                const salesAmount = salesData.amount || 0;
                
                let suggestedInventory = 0;
                if (salesQuantity > 0) {
                    suggestedInventory = Math.ceil((salesQuantity / 4) * FACTOR_INVENTARIO_SUGERIDO);
                } else {
                    suggestedInventory = INVENTARIO_MINIMO_SIN_VENTAS;
                }
                
                totalSucursalesConRuta += quantity;
                totalSalesQuantityConRuta += salesQuantity;
                totalSalesAmountConRuta += salesAmount;
                totalSuggestedConRuta += suggestedInventory;
                totalDifferenceConRuta += (quantity - suggestedInventory);
            }
        }
        
        const inventarioTotal = almacenGeneralQuantity + totalSucursalesConRuta;
        const totalSalesQuantity = salesByBranch._totalQuantity || 0;
        const totalSalesAmount = salesByBranch._totalAmount || 0;
        
        // ========== CALCULAR MARKUP, UTILIDAD Y PIEZAS VENDIDAS ==========
        const markup = (price && cost && price > 0) ? ((price - cost) / price) * 100 : null;
        
        // === CÁLCULO CORREGIDO DE UTILIDAD ===
        // 1. Quitar IVA a las ventas totales
        const ventasSinIVA = totalSalesAmount / IVA;
        
        // 2. Calcular piezas vendidas (usando precio sin IVA)
        const precioSinIVA = price || 0;
        const piezasVendidas = precioSinIVA > 0 ? ventasSinIVA / precioSinIVA : 0;
        
        // 3. Utilidad por pieza (sin IVA)
        const utilidadPorPieza = (price && cost && price > 0) ? (price - cost) : 0;
        
        // 4. Utilidad total (sin IVA)
        const utilidadTotal = utilidadPorPieza * piezasVendidas;
        
        console.log('📊 CÁLCULO DE UTILIDAD:');
        console.log(`   Ventas totales (con IVA): ${formatCurrency(totalSalesAmount)}`);
        console.log(`   Ventas totales (sin IVA): ${formatCurrency(ventasSinIVA)}`);
        console.log(`   Precio unitario (sin IVA): ${formatCurrency(precioSinIVA)}`);
        console.log(`   Piezas vendidas: ${piezasVendidas.toFixed(2)}`);
        console.log(`   Utilidad por pieza: ${formatCurrency(utilidadPorPieza)}`);
        console.log(`   Utilidad total: ${formatCurrency(utilidadTotal)}`);
        
        // ========== CONSTRUIR HTML ==========
        let resultsHtml = `
            <!-- Tarjetas de resumen de inventario -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number" style="font-size: 1.50rem;">${escapeHtml(currentAccesorioName.length > 22 ? currentAccesorioName.substring(0, 22) + '...' : currentAccesorioName)}</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);">
                    <div class="stat-number">${almacenGeneralQuantity}</div>
                    <div class="stat-label">🏭 Almacén General</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                    <div class="stat-number">${totalSucursalesConRuta}</div>
                    <div class="stat-label">📦 Sucursales</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                    <div class="stat-number">${inventarioTotal}</div>
                    <div class="stat-label">📊 INVENTARIO TOTAL</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);">
                    <div class="stat-number" style="font-size: 1.1rem;">${totalSalesQuantity}</div>
                    <div class="stat-label">📊 Ventas (pzs mes ant.)</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #34d399 100%);">
                    <div class="stat-number" style="font-size: 1.1rem;">${formatCurrency(totalSalesAmount)}</div>
                    <div class="stat-label">💰 Ventas ($ mes ant.)</div>
                    <div style="font-size: 0.7rem; opacity: 0.9; margin-top: 2px;">
                        Utilidad: ${formatCurrency(utilidadTotal)}
                    </div>
                </div>
            </div>
            
            <!-- Tarjetas de costo, precio, markup -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number" style="font-size: 1.1rem;">${cost !== null && cost !== undefined ? formatCurrency(cost) : 'N/D'}</div>
                    <div class="stat-label">💰 Costo (sin IVA)</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number" style="font-size: 1.1rem;">${price !== null && price !== undefined ? formatCurrency(price) : 'N/D'}</div>
                    <div class="stat-label">🏷️ Precio Venta (sin IVA)</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);">
                    <div class="stat-number" style="font-size: 1.1rem; ${markup !== null && markup < 0 ? 'color: #dc2626;' : ''}">${markup !== null ? markup.toFixed(1) + '%' : 'N/D'}</div>
                    <div class="stat-label">📈 Markup</div>
                    ${markup !== null ? `<div style="font-size: 0.6rem; opacity: 0.8;">${markup >= 20 ? '✅ Buen margen' : markup >= 10 ? '⚠️ Margen medio' : '🔴 Margen bajo'}</div>` : ''}
                </div>
            </div>
            
            <!-- Pestañas de Rutas -->
            <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; flex-wrap: wrap;">
                <button class="inventario-tab-button active" data-tab="ruta1">🚚 Ruta 1</button>
                <button class="inventario-tab-button" data-tab="ruta2">🚚 Ruta 2</button>
                <button class="inventario-tab-button" data-tab="ruta3">🚚 Ruta 3</button>
                <button class="inventario-tab-button" data-tab="ruta4">🚚 Ruta 4</button>
            </div>
            
            <!-- Contenido de pestañas -->
            <div id="inventarioTabRuta1" class="inventario-tab-content active-tab">
                ${renderRutaTabAccesorios("Ruta 1", RUTAS_CONFIG["Ruta 1"], otrasSucursales, salesByBranch)}
            </div>
            <div id="inventarioTabRuta2" class="inventario-tab-content" style="display: none;">
                ${renderRutaTabAccesorios("Ruta 2", RUTAS_CONFIG["Ruta 2"], otrasSucursales, salesByBranch)}
            </div>
            <div id="inventarioTabRuta3" class="inventario-tab-content" style="display: none;">
                ${renderRutaTabAccesorios("Ruta 3", RUTAS_CONFIG["Ruta 3"], otrasSucursales, salesByBranch)}
            </div>
            <div id="inventarioTabRuta4" class="inventario-tab-content" style="display: none;">
                ${renderRutaTabAccesorios("Ruta 4", RUTAS_CONFIG["Ruta 4"], otrasSucursales, salesByBranch)}
            </div>
        `;
        
        resultsHtml += `
            <div style="display: flex; justify-content: flex-end; margin-top: 20px; gap: 10px;">
                <button id="exportAccesoriosExcelBtn" class="btn-export-excel" style="background: #059669; padding: 10px 24px; border-radius: 8px; color: white; border: none; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    📊 Exportar a Excel
                </button>
            </div>
        `;
        
        document.getElementById('inventarioAccesoriosResults').innerHTML = resultsHtml;
        document.getElementById('inventarioAccesoriosResults').style.display = 'block';
        
        initInventarioTabsAccesorios();
        
        const exportBtn = document.getElementById('exportAccesoriosExcelBtn');
        if (exportBtn) {
            exportBtn.removeEventListener('click', exportAccesoriosToExcel);
            exportBtn.addEventListener('click', exportAccesoriosToExcel);
        }
        
        const hasStock = stockData.some(item => (item.quantity || 0) > 0);
        
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
    
    const targetId = `inventarioTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`;
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
        const filteredData = currentStockData.filter(item => (item.quantity || 0) > 0);
        
        if (filteredData.length === 0) {
            showError('inventarioAccesorios', 'No hay datos con stock para exportar');
            return;
        }
        
        const excelData = [];
        
        excelData.push(['INVENTARIO DE ACCESORIOS']);
        excelData.push(['Producto:', currentAccesorioName]);
        excelData.push(['Fecha de consulta:', new Date().toLocaleString()]);
        excelData.push(['Factor de inventario sugerido:', FACTOR_INVENTARIO_SUGERIDO + 'x (ventas semanales)']);
        excelData.push(['Mínimo sin ventas:', INVENTARIO_MINIMO_SIN_VENTAS + ' pieza']);
        excelData.push([]);
        
        excelData.push(['#', 'Sucursal', 'Almacén', 'Cantidad Actual', 'Ventas (pzs)', 'Inventario Sugerido', 'Diferencia']);
        
        const sortedData = [...filteredData].sort((a, b) => {
            const branchA = (a.branch_name || '').toLowerCase();
            const branchB = (b.branch_name || '').toLowerCase();
            if (branchA < branchB) return -1;
            if (branchA > branchB) return 1;
            return 0;
        });
        
        let totalQty = 0;
        let totalSalesQty = 0;
        let totalSuggested = 0;
        let totalDiff = 0;
        
        sortedData.forEach((item, index) => {
            const qty = item.quantity || 0;
            totalQty += qty;
            
            const branchName = item.branch_name || 'Sin sucursal';
            const normalizedBranch = normalizeText(branchName);
            const salesData = currentSalesByBranch[normalizedBranch] || { quantity: 0, amount: 0 };
            const salesQuantity = salesData.quantity || 0;
            totalSalesQty += salesQuantity;
            
            let suggestedInventory = 0;
            if (salesQuantity > 0) {
                suggestedInventory = Math.ceil((salesQuantity / 4) * FACTOR_INVENTARIO_SUGERIDO);
            } else {
                suggestedInventory = INVENTARIO_MINIMO_SIN_VENTAS;
            }
            totalSuggested += suggestedInventory;
            
            const difference = qty - suggestedInventory;
            totalDiff += difference;
            
            excelData.push([
                index + 1,
                branchName,
                item.warehouse_name || 'Sin almacén',
                qty,
                salesQuantity,
                suggestedInventory,
                difference
            ]);
        });
        
        excelData.push([]);
        excelData.push(['', '', 'TOTAL:', totalQty, totalSalesQty, totalSuggested, totalDiff]);
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        ws['!cols'] = [
            { wch: 5 },
            { wch: 30 },
            { wch: 30 },
            { wch: 12 },
            { wch: 12 },
            { wch: 15 },
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