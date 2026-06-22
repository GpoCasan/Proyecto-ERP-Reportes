// ==================== MÓDULO: INVENTARIO TAE ====================

// Configuración de rutas (misma que inventario.js)
const TAE_RUTAS_CONFIG = {
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

// Palabras clave para detectar Almacén General (con prefijo TAE para evitar conflictos)
const TAE_ALMACEN_GENERAL_KEYWORDS = [
    "almacen general", 
    "equipos matriz", 
    "casa matriz", 
    "almacen matriz", 
    "matriz",
    "almacén general"
];

// Variables globales
let taeInventarioData = null;
let taeInventarioModalAbierto = false;

// ==================== OBTENER TRANSFERENCIAS PENDIENTES (REUTILIZANDO CACHÉ) ====================

function getTransferenciasPendientesDesdeCache() {
    // Intentar obtener los datos del caché global de transferencias
    // cachedTransferenciasData se define en alertas_transferencias.js
    if (typeof cachedTransferenciasData !== 'undefined' && cachedTransferenciasData) {
        console.log('📦 [TAE INVENTARIO] Reutilizando caché de transferencias pendientes');
        
        const transfersPorTienda = new Map();
        
        // Recorrer todos los almacenes
        for (const [almacen, almacenData] of Object.entries(cachedTransferenciasData.almacenes || {})) {
            // Solo nos interesan las transferencias desde TAE
            if (almacen !== 'TAE') continue;
            
            // Recorrer las tiendas de este almacén
            for (const tienda of (almacenData.tiendas || [])) {
                const tiendaNombre = tienda.tienda;
                const cantidad = tienda.cantidad;
                const transferencias = tienda.transferencias || [];
                
                transfersPorTienda.set(tiendaNombre, {
                    tienda: tiendaNombre,
                    cantidad: cantidad,
                    transferencias: transferencias
                });
            }
        }
        
        console.log(`📦 [TAE INVENTARIO] ${transfersPorTienda.size} tiendas con transferencias desde TAE`);
        return transfersPorTienda;
    }
    
    console.log('📦 [TAE INVENTARIO] No hay caché de transferencias, consultando directamente...');
    return null;
}

// ==================== OBTENER TRANSFERENCIAS PENDIENTES (FALLBACK) ====================

async function fetchTransferenciasPendientesTAE() {
    console.log('📦 [TAE INVENTARIO] Consultando transferencias pendientes (fallback)...');
    
    try {
        let allTransfers = [];
        let currentPage = 1;
        let lastPage = 1;
        
        do {
            const url = `${CONFIG.API_TRANSFERS}?page=${currentPage}&per_page=100&status=En+tr%C3%A1nsito`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });
            
            if (!response.ok) {
                console.warn(`⚠️ Error al consultar transferencias: ${response.status}`);
                break;
            }
            
            const data = await response.json();
            const transfers = data.data || [];
            allTransfers.push(...transfers);
            
            lastPage = data.last_page || data.meta?.last_page || 1;
            currentPage++;
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } while (currentPage <= lastPage);
        
        console.log(`✅ ${allTransfers.length} transferencias en tránsito encontradas`);
        
        // Mapear por tienda destino
        const transfersPorTienda = new Map();
        
        for (const transfer of allTransfers) {
            let tiendaNombre = 'Sin tienda asignada';
            if (transfer.target_warehouse?.branch?.name) {
                tiendaNombre = transfer.target_warehouse.branch.name;
            } else if (transfer.target_warehouse?.name) {
                tiendaNombre = transfer.target_warehouse.name;
            }
            
            // Solo contar transferencias desde TAE
            const origenNombre = transfer.origin_warehouse?.name || '';
            if (origenNombre.toLowerCase().includes('tae')) {
                if (!transfersPorTienda.has(tiendaNombre)) {
                    transfersPorTienda.set(tiendaNombre, {
                        tienda: tiendaNombre,
                        cantidad: 0,
                        transferencias: []
                    });
                }
                const tienda = transfersPorTienda.get(tiendaNombre);
                tienda.cantidad++;
                tienda.transferencias.push({
                    id: transfer.id,
                    fecha: transfer.dispatched_at ? formatDateOnly(transfer.dispatched_at) : 'No disponible'
                });
            }
        }
        
        return transfersPorTienda;
        
    } catch (error) {
        console.error('❌ Error consultando transferencias:', error);
        return new Map();
    }
}

// ==================== OBTENER INVENTARIO TAE ====================

async function fetchAllTaeInventory() {
    console.log('📦 [TAE INVENTARIO] Consultando inventario TAE...');
    
    let allStock = [];
    let currentPage = 1;
    let lastPage = 1;
    const productId = 220; // ID del producto TAE
    
    try {
        do {
            const url = `https://inventory.gcasan.com/api/stock?page=${currentPage}&per_page=100&total=0&product_id=${productId}`;
            console.log(`📡 [TAE INVENTARIO] Consultando página ${currentPage}...`);
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });
            
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const stockItems = data.data || [];
            allStock.push(...stockItems);
            
            lastPage = data.last_page || data.meta?.last_page || 1;
            currentPage++;
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } while (currentPage <= lastPage);
        
        console.log(`✅ [TAE INVENTARIO] Total registros obtenidos: ${allStock.length}`);
        return allStock;
        
    } catch (error) {
        console.error('❌ [TAE INVENTARIO] Error:', error);
        throw error;
    }
}

// ==================== FUNCIONES AUXILIARES ====================

function taeNormalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[#@$%&*+=\[\]{}()<>\/\\|;:.,?¿!¡]/g, "")
        .replace(/\s+/g, ' ')
        .replace(/ñ/g, "n")
        .trim();
}

function taeFormatCurrency(v) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(v || 0);
}

function isTaeAlmacenGeneral(branchName, warehouseName) {
    const nameToCheck = (branchName || warehouseName || '').toLowerCase();
    const cleaned = nameToCheck.replace(/[^a-z0-9\sáéíóúüñ]/g, '').trim();
    
    for (const keyword of TAE_ALMACEN_GENERAL_KEYWORDS) {
        if (cleaned.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    return false;
}

function getTaeInventoryByBranch(stockItems, sucursalNombre) {
    const sucursalLower = taeNormalizeText(sucursalNombre);
    
    let foundItem = null;
    let bestMatch = 0;
    
    for (const item of stockItems) {
        const branchName = taeNormalizeText(item.branch_name || '');
        const warehouseName = taeNormalizeText(item.warehouse_name || '');
        
        // Saltar almacén general
        if (isTaeAlmacenGeneral(branchName, warehouseName)) {
            continue;
        }
        
        if (branchName === sucursalLower) {
            foundItem = item;
            break;
        }
        
        if (branchName.includes(sucursalLower) || sucursalLower.includes(branchName)) {
            const matchLength = Math.max(branchName.length, sucursalLower.length);
            if (matchLength > bestMatch) {
                bestMatch = matchLength;
                foundItem = item;
            }
        }
    }
    
    return {
        quantity: foundItem?.quantity || 0,
        hasStock: (foundItem?.quantity || 0) > 0
    };
}

function getTaeAlmacenGeneralStock(stockItems) {
    let totalQuantity = 0;
    
    for (const item of stockItems) {
        const branchName = item.branch_name || '';
        const warehouseName = item.warehouse_name || '';
        
        if (isTaeAlmacenGeneral(branchName, warehouseName)) {
            totalQuantity += item.quantity || 0;
        }
    }
    
    return totalQuantity;
}

// ==================== RENDERIZAR PESTAÑA DE RUTA ====================

function renderTaeRutaTab(rutaNombre, rutaData, stockItems, transfersMap) {
    const sucursales = rutaData.sucursales;
    const color = rutaData.color;
    const icon = rutaData.icon;
    
    let sucursalesData = [];
    let totalQuantity = 0;
    
    for (const sucursal of sucursales) {
        const inv = getTaeInventoryByBranch(stockItems, sucursal);
        const transferData = transfersMap.get(sucursal);
        const pendientes = transferData?.cantidad || 0;
        
        sucursalesData.push({
            nombre: sucursal,
            quantity: inv.quantity,
            hasStock: inv.hasStock,
            pendientes: pendientes,
            transferencias: transferData?.transferencias || []
        });
        totalQuantity += inv.quantity;
    }
    
    const sinStockCount = sucursalesData.filter(s => !s.hasStock).length;
    const totalPendientes = sucursalesData.reduce((sum, s) => sum + s.pendientes, 0);
    
    return `
        <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: ${color}; color: white; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size: 1.2rem;">${icon}</span>
                        <strong style="margin-left: 8px;">${rutaNombre}</strong>
                        <span style="margin-left: 10px; font-size: 0.7rem; opacity: 0.9;">${sucursales.length} sucursales</span>
                        ${sinStockCount > 0 ? `<span style="margin-left: 10px; font-size: 0.65rem; background: rgba(0,0,0,0.2); padding: 2px 8px; border-radius: 20px;">⚠️ ${sinStockCount} sin stock</span>` : ''}
                        ${totalPendientes > 0 ? `<span style="margin-left: 10px; font-size: 0.65rem; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px;">📦 ${totalPendientes} pendientes</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 0.75rem;">
                        <span>📦 ${totalQuantity}</span>
                    </div>
                </div>
            </div>
            <div style="padding: 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <tr>
                            <th style="padding: 12px 16px; text-align: left;">#</th>
                            <th style="padding: 12px 16px; text-align: left;">Sucursal</th>
                            <th style="padding: 12px 16px; text-align: center; width: 120px;">📱 TAE</th>
                            <th style="padding: 12px 16px; text-align: center; width: 140px;">📦 Transferencias Pendientes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sucursalesData.map((suc, idx) => `
                            <tr style="border-bottom: 1px solid #e2e8f0; ${!suc.hasStock ? 'background-color: #fef2f2;' : 'background-color: #f0fdf4;'}">
                                <td style="padding: 10px 16px; text-align: center;">${idx + 1}</td>
                                <td style="padding: 10px 16px; font-weight: 500;">
                                    🏪 ${suc.nombre}
                                    ${!suc.hasStock ? '<span style="margin-left: 8px; font-size: 0.7rem; color: #dc2626;">⚠️ SIN STOCK</span>' : ''}
                                    ${suc.quantity > 0 ? '<span style="margin-left: 8px; font-size: 0.65rem; color: #059669;">✓ Disponible</span>' : ''}
                                </td>
                                <td style="padding: 10px 16px; text-align: center; font-weight: bold; color: #7c3aed;">
                                    ${taeFormatCurrency(suc.quantity)}
                                </td>
                                <td style="padding: 10px 16px; text-align: center;">
                                    ${suc.pendientes > 0 ? `
                                        <span style="
                                            background: #f97316;
                                            color: white;
                                            padding: 4px 12px;
                                            border-radius: 20px;
                                            font-weight: bold;
                                            font-size: 0.85rem;
                                            cursor: pointer;
                                            transition: all 0.2s;
                                            display: inline-block;
                                        "
                                        onmouseover="this.style.transform='scale(1.05)'"
                                        onmouseout="this.style.transform='scale(1)'"
                                        onclick="verDetalleTransferenciasTAE('${suc.nombre}', ${JSON.stringify(suc.transferencias).replace(/"/g, '&quot;')})">
                                            📦 ${suc.pendientes}
                                        </span>
                                    ` : `
                                        <span style="color: #94a3b8; font-size: 0.8rem;">✓ Sin pendientes</span>
                                    `}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background: #f8fafc; border-top: 2px solid ${color};">
                        <tr style="font-weight: bold;">
                            <td colspan="2" style="padding: 10px 16px; text-align: right;">TOTAL ${rutaNombre}:</td>
                            <td style="padding: 10px 16px; text-align: center; color: #7c3aed;">${taeFormatCurrency(totalQuantity)}</td>
                            <td style="padding: 10px 16px; text-align: center; color: #f97316;">${totalPendientes}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// ==================== RENDERIZAR PESTAÑA SIN RUTA ====================

function renderTaeSinRutaTab(stockItems, transfersMap) {
    // Encontrar sucursales que no están en ninguna ruta y tienen TAE (excluyendo almacén general)
    const todasSucursales = new Map();
    for (const item of stockItems) {
        const branchName = item.branch_name || '';
        const warehouseName = item.warehouse_name || '';
        
        // Saltar almacén general
        if (isTaeAlmacenGeneral(branchName, warehouseName)) {
            continue;
        }
        
        if (branchName && item.quantity > 0) {
            todasSucursales.set(branchName, item.quantity);
        }
    }
    
    const sucursalesEnRuta = new Set();
    for (const ruta of Object.values(TAE_RUTAS_CONFIG)) {
        for (const suc of ruta.sucursales) {
            sucursalesEnRuta.add(taeNormalizeText(suc));
        }
    }
    
    const sucursalesSinRuta = [];
    for (const [nombre, cantidad] of todasSucursales) {
        const normalized = taeNormalizeText(nombre);
        if (!sucursalesEnRuta.has(normalized)) {
            const transferData = transfersMap.get(nombre);
            const pendientes = transferData?.cantidad || 0;
            
            sucursalesSinRuta.push({
                nombre: nombre,
                quantity: cantidad,
                hasStock: cantidad > 0,
                pendientes: pendientes,
                transferencias: transferData?.transferencias || []
            });
        }
    }
    
    if (sucursalesSinRuta.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: #94a3b8;">
                <div style="font-size: 3rem; margin-bottom: 16px;">✅</div>
                <p style="font-size: 1rem;">Todas las sucursales con TAE están asignadas a una ruta</p>
            </div>
        `;
    }
    
    sucursalesSinRuta.sort((a, b) => b.quantity - a.quantity);
    
    const totalQuantity = sucursalesSinRuta.reduce((sum, s) => sum + s.quantity, 0);
    const totalPendientes = sucursalesSinRuta.reduce((sum, s) => sum + s.pendientes, 0);
    
    return `
        <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: #64748b; color: white; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size: 1.2rem;">⚠️</span>
                        <strong style="margin-left: 8px;">Sin Ruta Asignada</strong>
                        <span style="margin-left: 10px; font-size: 0.7rem; opacity: 0.9;">${sucursalesSinRuta.length} sucursales</span>
                        ${totalPendientes > 0 ? `<span style="margin-left: 10px; font-size: 0.65rem; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px;">📦 ${totalPendientes} pendientes</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 0.75rem;">
                        <span>📦 ${totalQuantity}</span>
                    </div>
                </div>
            </div>
            <div style="padding: 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <tr>
                            <th style="padding: 12px 16px; text-align: left;">#</th>
                            <th style="padding: 12px 16px; text-align: left;">Sucursal</th>
                            <th style="padding: 12px 16px; text-align: center; width: 120px;">📱 TAE</th>
                            <th style="padding: 12px 16px; text-align: center; width: 140px;">📦 Transferencias Pendientes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sucursalesSinRuta.map((suc, idx) => `
                            <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f0fdf4;">
                                <td style="padding: 10px 16px; text-align: center;">${idx + 1}</td>
                                <td style="padding: 10px 16px; font-weight: 500;">
                                    🏪 ${suc.nombre}
                                    ${suc.quantity > 0 ? '<span style="margin-left: 8px; font-size: 0.65rem; color: #059669;">✓ Disponible</span>' : ''}
                                </td>
                                <td style="padding: 10px 16px; text-align: center; font-weight: bold; color: #7c3aed;">
                                    ${taeFormatCurrency(suc.quantity)}
                                </td>
                                <td style="padding: 10px 16px; text-align: center;">
                                    ${suc.pendientes > 0 ? `
                                        <span style="
                                            background: #f97316;
                                            color: white;
                                            padding: 4px 12px;
                                            border-radius: 20px;
                                            font-weight: bold;
                                            font-size: 0.85rem;
                                            cursor: pointer;
                                            transition: all 0.2s;
                                            display: inline-block;
                                        "
                                        onmouseover="this.style.transform='scale(1.05)'"
                                        onmouseout="this.style.transform='scale(1)'"
                                        onclick="verDetalleTransferenciasTAE('${suc.nombre}', ${JSON.stringify(suc.transferencias).replace(/"/g, '&quot;')})">
                                            📦 ${suc.pendientes}
                                        </span>
                                    ` : `
                                        <span style="color: #94a3b8; font-size: 0.8rem;">✓ Sin pendientes</span>
                                    `}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot style="background: #f8fafc; border-top: 2px solid #64748b;">
                        <tr style="font-weight: bold;">
                            <td colspan="2" style="padding: 10px 16px; text-align: right;">TOTAL:</td>
                            <td style="padding: 10px 16px; text-align: center; color: #7c3aed;">${taeFormatCurrency(totalQuantity)}</td>
                            <td style="padding: 10px 16px; text-align: center; color: #f97316;">${totalPendientes}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// ==================== MODAL DETALLE TRANSFERENCIAS ====================

function verDetalleTransferenciasTAE(tiendaNombre, transferencias) {
    let modal = document.getElementById('detalleTransferenciasTAE');
    if (modal) {
        modal.remove();
    }
    
    modal = document.createElement('div');
    modal.id = 'detalleTransferenciasTAE';
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex !important;
        align-items: center;
        justify-content: center;
        z-index: 10001;
    `;
    
    let tablaHtml = '';
    if (!transferencias || transferencias.length === 0) {
        tablaHtml = '<div style="text-align: center; padding: 20px; color: #64748b;">No hay transferencias pendientes para esta tienda</div>';
    } else {
        tablaHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <th style="padding: 10px; text-align: left;"># Transferencia</th>
                        <th style="padding: 10px; text-align: left;">Fecha</th>
                    </tr>
                </thead>
                <tbody>
                    ${transferencias.map(t => `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px; font-weight: 600; color: #1e40af;">#${t.id}</td>
                            <td style="padding: 10px;">${t.fecha || 'No disponible'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; animation: modalFadeIn 0.3s ease-out;">
            <div class="modal-header" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.5rem;">📦</span>
                    <span>Transferencias Pendientes - ${escapeHtml(tiendaNombre)}</span>
                </h3>
                <span class="close-modal" onclick="cerrarDetalleTransferenciasTAE()" style="font-size: 32px; cursor: pointer;">&times;</span>
            </div>
            <div class="modal-body" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                <div style="margin-bottom: 16px; display: flex; gap: 16px; flex-wrap: wrap;">
                    <div style="background: #f8fafc; padding: 8px 16px; border-radius: 8px;">
                        <span style="color: #64748b; font-size: 0.75rem;">Total Transferencias</span>
                        <div style="font-size: 1.5rem; font-weight: 700; color: #f97316;">${transferencias?.length || 0}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 8px 16px; border-radius: 8px;">
                        <span style="color: #64748b; font-size: 0.75rem;">Tienda</span>
                        <div style="font-size: 1rem; font-weight: 600; color: #1e293b;">${escapeHtml(tiendaNombre)}</div>
                    </div>
                </div>
                ${tablaHtml}
            </div>
            <div class="modal-footer">
                <button onclick="cerrarDetalleTransferenciasTAE()" style="
                    background: #64748b;
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarDetalleTransferenciasTAE();
        }
    });
}

function cerrarDetalleTransferenciasTAE() {
    const modal = document.getElementById('detalleTransferenciasTAE');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// ==================== FUNCIÓN PRINCIPAL ====================

async function abrirInventarioTAE() {
    console.log('🖱️ [TAE INVENTARIO] Abriendo modal...');
    
    if (taeInventarioModalAbierto) {
        const modalExistente = document.getElementById('taeInventarioModal');
        if (modalExistente) {
            modalExistente.style.display = 'flex';
            return;
        }
    }
    
    const modal = document.createElement('div');
    modal.id = 'taeInventarioModal';
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex !important;
        align-items: center;
        justify-content: center;
        z-index: 9998;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1100px; max-height: 90vh; animation: modalFadeIn 0.3s ease-out;">
            <div class="modal-header" style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.8rem;">📱</span>
                    <span>Inventario TAE - Todas las Tiendas</span>
                </h3>
                <span class="close-modal" id="cerrarInventarioTAE" style="font-size: 32px; cursor: pointer;">&times;</span>
            </div>
            <div class="modal-body" id="taeInventarioBody" style="padding: 20px; max-height: calc(90vh - 120px); overflow-y: auto;">
                <div class="loader-modal">
                    <div class="spinner-modal"></div>
                    <p>Cargando inventario TAE de todas las tiendas...</p>
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: space-between; gap: 10px;">
                <button id="btnActualizarInventarioTAE" style="
                    background: #7c3aed;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    🔄 Actualizar
                </button>
                <button id="btnCerrarInventarioTAE" style="
                    background: #64748b;
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    taeInventarioModalAbierto = true;
    
    // Eventos para cerrar
    document.getElementById('cerrarInventarioTAE').addEventListener('click', cerrarInventarioTAE);
    document.getElementById('btnCerrarInventarioTAE').addEventListener('click', cerrarInventarioTAE);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarInventarioTAE();
        }
    });
    
    // Evento para actualizar - USAR addEventListener DIRECTAMENTE
    const btnActualizar = document.getElementById('btnActualizarInventarioTAE');
    if (btnActualizar) {
        // Eliminar eventos anteriores clonando
        const newBtn = btnActualizar.cloneNode(true);
        btnActualizar.parentNode.replaceChild(newBtn, btnActualizar);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🔄 [TAE INVENTARIO] Click en Actualizar');
            taeInventarioData = null;
            // Forzar recarga
            cargarDatosInventarioTAE();
        });
        console.log('✅ [TAE INVENTARIO] Botón Actualizar configurado');
    }
    
    await cargarDatosInventarioTAE();
}

async function cargarDatosInventarioTAE() {
    console.log('📦 [TAE INVENTARIO] Cargando datos...');
    const body = document.getElementById('taeInventarioBody');
    if (!body) return;
    
    body.innerHTML = `
        <div class="loader-modal">
            <div class="spinner-modal"></div>
            <p>Cargando inventario TAE de todas las tiendas...</p>
        </div>
    `;
    
    try {
        // PRIMERO: Intentar obtener transferencias desde el caché global
        let transfersMap = getTransferenciasPendientesDesdeCache();
        
        // Si no hay caché, consultar directamente
        if (!transfersMap) {
            transfersMap = await fetchTransferenciasPendientesTAE();
        }
        
        // Obtener inventario (si no está en caché)
        if (!taeInventarioData) {
            taeInventarioData = await fetchAllTaeInventory();
        }
        
        renderInventarioTAE(taeInventarioData, transfersMap);
        
    } catch (error) {
        console.error('❌ Error cargando inventario TAE:', error);
        body.innerHTML = `
            <div class="alert alert-error" style="padding: 30px; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 16px;">❌</div>
                <h4 style="color: #dc2626; margin-bottom: 8px;">Error al cargar el inventario</h4>
                <p style="color: #64748b;">${error.message}</p>
                <button onclick="cargarDatosInventarioTAE()" style="margin-top: 16px; padding: 8px 20px; background: #7c3aed; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    🔄 Reintentar
                </button>
            </div>
        `;
    }
}

function renderInventarioTAE(stockItems, transfersMap) {
    const body = document.getElementById('taeInventarioBody');
    if (!body) return;
    
    // Calcular totales generales (excluyendo almacén general)
    let totalQuantity = 0;
    let totalPendientes = 0;
    let tiendasConStock = 0;
    let almacenGeneralQuantity = getTaeAlmacenGeneralStock(stockItems);
    
    for (const item of stockItems) {
        const branchName = item.branch_name || '';
        const warehouseName = item.warehouse_name || '';
        
        // Saltar almacén general para el conteo de tiendas
        if (isTaeAlmacenGeneral(branchName, warehouseName)) {
            continue;
        }
        
        if (item.quantity > 0) {
            totalQuantity += item.quantity;
            tiendasConStock++;
        }
    }
    
    for (const [tienda, data] of transfersMap) {
        totalPendientes += data.cantidad;
    }
    
    // Generar pestañas de rutas
    let tabsHtml = `
        <div style="margin-bottom: 20px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);">
                    <div class="stat-number">${taeFormatCurrency(totalQuantity)}</div>
                    <div class="stat-label">📱 Total TAE en Tiendas</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                    <div class="stat-number">${totalPendientes}</div>
                    <div class="stat-label">📦 Transferencias Pendientes</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                    <div class="stat-number">${tiendasConStock}</div>
                    <div class="stat-label">🏪 Tiendas con stock</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number">${taeFormatCurrency(almacenGeneralQuantity)}</div>
                    <div class="stat-label">🏭 Almacén General</div>
                </div>
            </div>
            
            <div class="alert alert-info" style="margin-bottom: 16px;">
                📱 <strong>Producto:</strong> TAE (ID: 220) | 📅 Datos en tiempo real
                <span style="margin-left: 16px;">💡 Haz clic en el número de transferencias pendientes para ver los detalles</span>
            </div>
            
            <div style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; flex-wrap: wrap;">
                <button class="tae-inventario-tab-button active" data-tab="ruta1" style="
                    background: #7c3aed;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 8px 8px 0 0;
                ">🚚 Ruta 1</button>
                <button class="tae-inventario-tab-button" data-tab="ruta2" style="
                    background: transparent;
                    color: #64748b;
                    border: none;
                    padding: 10px 20px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 8px 8px 0 0;
                ">🚚 Ruta 2</button>
                <button class="tae-inventario-tab-button" data-tab="ruta3" style="
                    background: transparent;
                    color: #64748b;
                    border: none;
                    padding: 10px 20px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 8px 8px 0 0;
                ">🚚 Ruta 3</button>
                <button class="tae-inventario-tab-button" data-tab="ruta4" style="
                    background: transparent;
                    color: #64748b;
                    border: none;
                    padding: 10px 20px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 8px 8px 0 0;
                ">🚚 Ruta 4</button>
                <button class="tae-inventario-tab-button" data-tab="sinruta" style="
                    background: transparent;
                    color: #64748b;
                    border: none;
                    padding: 10px 20px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 8px 8px 0 0;
                ">⚠️ Sin Ruta</button>
            </div>
        </div>
    `;
    
    // Contenido de las pestañas
    let contentHtml = `
        <div id="taeInventarioTabRuta1" class="tae-inventario-tab-content active-tab">
            ${renderTaeRutaTab("Ruta 1", TAE_RUTAS_CONFIG["Ruta 1"], stockItems, transfersMap)}
        </div>
        <div id="taeInventarioTabRuta2" class="tae-inventario-tab-content" style="display: none;">
            ${renderTaeRutaTab("Ruta 2", TAE_RUTAS_CONFIG["Ruta 2"], stockItems, transfersMap)}
        </div>
        <div id="taeInventarioTabRuta3" class="tae-inventario-tab-content" style="display: none;">
            ${renderTaeRutaTab("Ruta 3", TAE_RUTAS_CONFIG["Ruta 3"], stockItems, transfersMap)}
        </div>
        <div id="taeInventarioTabRuta4" class="tae-inventario-tab-content" style="display: none;">
            ${renderTaeRutaTab("Ruta 4", TAE_RUTAS_CONFIG["Ruta 4"], stockItems, transfersMap)}
        </div>
        <div id="taeInventarioTabSinRuta" class="tae-inventario-tab-content" style="display: none;">
            ${renderTaeSinRutaTab(stockItems, transfersMap)}
        </div>
    `;
    
    body.innerHTML = tabsHtml + contentHtml;
    initTaeInventarioTabs();
}

function initTaeInventarioTabs() {
    const tabButtons = document.querySelectorAll('.tae-inventario-tab-button');
    if (tabButtons.length === 0) return;
    
    tabButtons.forEach(button => {
        button.removeEventListener('click', handleTaeInventarioTabClick);
        button.addEventListener('click', handleTaeInventarioTabClick);
    });
}

function handleTaeInventarioTabClick(e) {
    const button = e.currentTarget;
    const tabId = button.getAttribute('data-tab');
    
    document.querySelectorAll('.tae-inventario-tab-button').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#64748b';
        btn.style.borderBottom = 'none';
    });
    
    button.classList.add('active');
    button.style.background = '#7c3aed';
    button.style.color = 'white';
    button.style.borderBottom = 'none';
    
    document.querySelectorAll('.tae-inventario-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    let targetId = '';
    if (tabId === 'sinruta') {
        targetId = 'taeInventarioTabSinRuta';
    } else {
        targetId = `taeInventarioTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`;
    }
    
    const targetContent = document.getElementById(targetId);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}

function cerrarInventarioTAE() {
    const modal = document.getElementById('taeInventarioModal');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            modal.remove();
            taeInventarioModalAbierto = false;
        }, 300);
    }
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.abrirInventarioTAE = abrirInventarioTAE;
window.cerrarInventarioTAE = cerrarInventarioTAE;
window.cargarDatosInventarioTAE = cargarDatosInventarioTAE;
window.verDetalleTransferenciasTAE = verDetalleTransferenciasTAE;
window.cerrarDetalleTransferenciasTAE = cerrarDetalleTransferenciasTAE;

console.log('✅ [TAE INVENTARIO] Módulo cargado correctamente');