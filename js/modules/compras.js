// ==================== MÓDULO: COMPRAS POR PROVEEDOR ====================

let cachedComprasData = null;

function getComprasDateRange(startDateStr, endDateStr) {
    const startDate = new Date(startDateStr);
    startDate.setHours(6, 0, 0, 0);
    const endDate = new Date(endDateStr);
    endDate.setHours(23, 59, 59, 0);
    const startStr = startDate.toISOString().slice(0, 19).replace('T', '+');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', '+');
    return { start: startStr, end: endStr };
}

async function fetchAllCompras(startDateTime, endDateTime) {
    let allPurchases = [];
    let currentPage = 1;
    let lastPage = 1;
    do {
        const url = `https://supply.gcasan.com/api/purchases?page=${currentPage}&per_page=100&total=0&start_date=${startDateTime}&end_date=${endDateTime}`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const purchases = data.data || [];
        allPurchases.push(...purchases);
        lastPage = data.last_page || data.meta?.last_page || currentPage;
        currentPage++;
        if (currentPage <= lastPage) await new Promise(resolve => setTimeout(resolve, 200));
    } while (currentPage <= lastPage);
    return allPurchases;
}

function extraerProveedoresUnicos(compras) {
    const proveedoresMap = new Map();
    for (const compra of compras) {
        if (compra.supplier?.name && !proveedoresMap.has(compra.supplier.name)) {
            proveedoresMap.set(compra.supplier.name, { id: compra.supplier.id, name: compra.supplier.name });
        }
    }
    return Array.from(proveedoresMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function filtrarComprasPorProveedor(compras, proveedorNombre) {
    if (!proveedorNombre || proveedorNombre === '') return compras;
    return compras.filter(compra => compra.supplier?.name === proveedorNombre);
}

function ordenarComprasPorAlmacen(compras) {
    return [...compras].sort((a, b) => {
        const almacenA = a.warehouse?.name || 'Sin almacén';
        const almacenB = b.warehouse?.name || 'Sin almacén';
        return almacenA.localeCompare(almacenB);
    });
}

function agruparComprasPorAlmacen(compras) {
    const grupos = new Map();
    for (const compra of compras) {
        const almacenNombre = compra.warehouse?.name || 'Sin almacén';
        const sucursalNombre = compra.warehouse?.branch?.name || 'Sin sucursal';
        const key = almacenNombre;
        if (!grupos.has(key)) {
            grupos.set(key, { almacen: almacenNombre, sucursal: sucursalNombre, compras: [], totalDescuento: 0, totalMonto: 0 });
        }
        const grupo = grupos.get(key);
        grupo.compras.push(compra);
        grupo.totalDescuento += compra.discount_amount || 0;
        grupo.totalMonto += compra.total || 0;
    }
    return Array.from(grupos.values()).sort((a, b) => a.almacen.localeCompare(b.almacen));
}

async function loadProveedoresDesdeCompras(startDate, endDate) {
    const proveedorSelect = document.getElementById('proveedorSelect');
    if (!proveedorSelect) return;
    if (!startDate || !endDate) {
        proveedorSelect.innerHTML = '<option value="">Seleccione fechas primero</option>';
        proveedorSelect.disabled = true;
        return;
    }
    proveedorSelect.innerHTML = '<option value="">Cargando proveedores...</option>';
    proveedorSelect.disabled = true;
    try {
        const range = getComprasDateRange(startDate, endDate);
        const compras = await fetchAllCompras(range.start, range.end);
        const proveedores = extraerProveedoresUnicos(compras);
        proveedorSelect.innerHTML = '<option value="">Seleccione un proveedor</option>';
        proveedores.forEach(proveedor => {
            const option = document.createElement('option');
            option.value = proveedor.name;
            option.textContent = proveedor.name;
            proveedorSelect.appendChild(option);
        });
        proveedorSelect.disabled = false;
        cachedComprasData = { compras, startDate, endDate };
        return compras;
    } catch (error) {
        proveedorSelect.innerHTML = '<option value="">Error al cargar proveedores</option>';
        proveedorSelect.disabled = false;
        showError('compras', `Error: ${error.message}`);
        return [];
    }
}

// ==================== FUNCIÓN PARA OBTENER ESPECIFICACIONES ====================
async function fetchSpecifications(groupIds) {
    if (!groupIds || groupIds.length === 0) {
        console.log('❌ No hay groupIds para consultar');
        return [];
    }
    
    console.log(`🔍 Consultando especificaciones para ${groupIds.length} groupIds:`, groupIds);
    
    try {
        let url = `https://inventory.gcasan.com/api/specification-groups?per_page=100`;
        
        const statuses = ['available', 'unavailable', 'in_transit', 'reserved', 'disabled_by_audit', 'waiting_to_invoice', 'Cancelado'];
        statuses.forEach(status => {
            url += `&status[]=${status}`;
        });
        
        groupIds.forEach(id => {
            url += `&ids[]=${id}`;
        });
        
        console.log(`📡 URL: ${url}`);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            console.error(`❌ Error HTTP ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const groups = Array.isArray(data) ? data : (data.data || []);
        
        console.log(`📦 Grupos recibidos: ${groups.length}`);
        
        const specifications = [];
        
        for (const group of groups) {
            if (group.specification_details && Array.isArray(group.specification_details)) {
                for (const specDetail of group.specification_details) {
                    let specName = '';
                    let specValue = specDetail.value || '';
                    
                    // Obtener el nombre de la especificación desde el objeto anidado
                    if (specDetail.specification && specDetail.specification.name) {
                        specName = specDetail.specification.name;
                    } else if (specDetail.product_specification_id === 1) {
                        specName = 'IMEI';
                    } else if (specDetail.product_specification_id === 2) {
                        specName = 'ICCID';
                    } else if (specDetail.product_specification_id === 3) {
                        specName = 'Serie';
                    } else if (specDetail.product_specification_id === 4) {
                        specName = 'SERIE FICHA';
                    }
                    
                    console.log(`  📌 Especificación encontrada: "${specName}" = "${specValue}"`);
                    
                    // Incluir todos los tipos relevantes
                    const tiposValidos = ['IMEI', 'ICCID', 'Serie', 'SERIE FICHA', 'serie ficha'];
                    if (tiposValidos.includes(specName) && specValue) {
                        // Normalizar "SERIE FICHA" y "serie ficha" a "Serie" para consistencia
                        let normalizedType = specName;
                        if (specName === 'SERIE FICHA' || specName === 'serie ficha') {
                            normalizedType = 'Serie';
                        }
                        specifications.push({
                            type: normalizedType,
                            value: specValue,
                            originalType: specName // Guardar tipo original por si acaso
                        });
                    } else if (specValue && specValue.match(/^\d{15}$/)) {
                        specifications.push({ type: 'IMEI', value: specValue });
                    } else if (specValue && specValue.match(/^\d{18,20}$/)) {
                        specifications.push({ type: 'ICCID', value: specValue });
                    }
                }
            }
        }
        
        console.log(`✅ Especificaciones extraídas: ${specifications.length}`);
        
        if (specifications.length > 0) {
            console.log('📋 Resumen de especificaciones encontradas:');
            const tiposCount = {};
            specifications.forEach(spec => {
                tiposCount[spec.type] = (tiposCount[spec.type] || 0) + 1;
            });
            Object.entries(tiposCount).forEach(([tipo, count]) => {
                console.log(`  ${tipo}: ${count}`);
            });
        }
        
        return specifications;
        
    } catch (error) {
        console.error('❌ Error en fetchSpecifications:', error);
        return [];
    }
}

// ==================== MODAL PARA VER SERIES/IMEIs (VERSIÓN MEJORADA) ====================
async function openSeriesModal(groupIds, productName) {
    console.log(`🖱️ openSeriesModal llamado`);
    console.log(`   Producto: ${productName}`);
    console.log(`   GroupIds:`, groupIds);
    
    let modal = document.getElementById('seriesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'seriesModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 750px;">
                <div class="modal-header">
                    <h3>📱 <span id="seriesModalTitle">Especificaciones</span></h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body" id="seriesModalBody">
                    <div class="loader-modal">
                        <div class="spinner-modal"></div>
                        <p>Cargando especificaciones...</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="exportSeriesBtn">📊 Exportar a Excel</button>
                    <button onclick="closeSeriesModal()">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    const titleSpan = document.getElementById('seriesModalTitle');
    if (titleSpan) {
        titleSpan.textContent = productName;
    }
    
    modal.style.display = 'block';
    
    try {
        document.getElementById('seriesModalBody').innerHTML = `
            <div class="loader-modal">
                <div class="spinner-modal"></div>
                <p>Consultando ${groupIds.length} equipo(s)...</p>
            </div>
        `;
        
        const specifications = await fetchSpecifications(groupIds);
        
        console.log(`📊 Especificaciones obtenidas: ${specifications.length}`);
        
        let html = '';
        
        if (specifications.length === 0) {
            html = `
                <div class="alert alert-warning" style="text-align: center; padding: 30px;">
                    ⚠️ No se encontraron especificaciones (IMEI, ICCID o Series) para este producto.<br><br>
                    <small>IDs consultados: ${groupIds.join(', ')}</small>
                </div>
            `;
        } else {
            const tiposUnicos = [...new Set(specifications.map(s => s.type))];
            const tipoPrincipal = tiposUnicos.length === 1 ? tiposUnicos[0] : 'Especificaciones';
            
            html = `
                <div class="specs-counter-card">
                    <div class="specs-counter-number">${specifications.length}</div>
                    <div class="specs-counter-label">${tipoPrincipal}</div>
                </div>
                
                <div class="specs-table-container">
                    <table class="specs-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${tipoPrincipal}</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            specifications.forEach((item, idx) => {
                html += `<tr>
                    <td>${idx + 1}</td>
                    <td>${escapeHtml(item.value)}</div>
                </tr>`;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        document.getElementById('seriesModalBody').innerHTML = html;
        
        const exportBtn = document.getElementById('exportSeriesBtn');
        if (exportBtn) {
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            newExportBtn.onclick = () => exportSpecificationsToExcel(productName, specifications);
        }
        
    } catch (error) {
        console.error('❌ Error en openSeriesModal:', error);
        document.getElementById('seriesModalBody').innerHTML = `
            <div class="alert alert-error" style="text-align: center; padding: 30px;">
                ❌ Error: ${error.message}<br><br>
                <button onclick="location.reload()" style="margin-top: 10px;">Recargar página</button>
            </div>
        `;
    }
}

function closeSeriesModal() {
    const modal = document.getElementById('seriesModal');
    if (modal) modal.style.display = 'none';
}

// ==================== EXPORTAR ESPECIFICACIONES A EXCEL ====================
function exportSpecificationsToExcel(productName, specifications) {
    if (!specifications || specifications.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    const excelData = [
        [`ESPECIFICACIONES - ${productName}`],
        [],
        ['#', 'Especificación']
    ];
    
    specifications.forEach((spec, idx) => {
        excelData.push([idx + 1, spec.value]);
    });
    
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `especificaciones_${productName.replace(/[^a-z0-9]/gi, '_')}`);
    } else {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, 'Especificaciones');
        XLSX.writeFile(wb, `especificaciones_${productName.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
    }
}

// ==================== EXPORTAR DETALLE DE FACTURA CON ESPECIFICACIONES ====================
async function exportPurchaseDetailToExcel(purchaseId, compraData, productosMap) {
    if (!productosMap || productosMap.size === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    const btn = document.getElementById('exportPurchaseDetailBtn');
    if (btn) {
        btn.innerHTML = 'Exportando...';
        btn.disabled = true;
    }
    
    try {
        const shipmentCost = parseFloat(compraData.shipment_cost) || 0;
        const totalDescuento = parseFloat(compraData.discount_amount) || 0;
        
        const excelData = [
            [`RESUMEN DE COMPRA - Folio: ${compraData.folio || compraData.id}`],
            [`Proveedor: ${compraData.supplier?.name || 'No disponible'}`],
            [`Fecha: ${compraData.purchase_date ? compraData.purchase_date.split('T')[0] : 'No disponible'}`],
            [`Sucursal: ${compraData.warehouse?.branch?.name || 'No disponible'}`],
            [`Almacén: ${compraData.warehouse?.name || 'No disponible'}`],
            shipmentCost > 0 ? [`Gastos de Envío: $${shipmentCost.toFixed(2)}`] : [],
            [`Descuento: $${totalDescuento.toFixed(2)}`],
            [],
            ['ID', 'Descripción', 'Serie/IMEI/ICCID']
        ];
        
        for (const [key, producto] of productosMap) {
            if (producto.hasSeries && producto.groupIds && producto.groupIds.length > 0) {
                const specifications = await fetchSpecifications(producto.groupIds);
                
                if (specifications.length > 0) {
                    for (const spec of specifications) {
                        excelData.push([
                            producto.productId || '',
                            producto.nombre,
                            spec.value
                        ]);
                    }
                } else {
                    excelData.push([
                        producto.productId || '',
                        producto.nombre,
                        'Sin especificaciones'
                    ]);
                }
            } else {
                excelData.push([
                    producto.productId || '',
                    producto.nombre,
                    'Sin especificaciones'
                ]);
            }
        }
        
        const filename = `detalle_compra_${compraData.folio || compraData.id}`;
        
        if (typeof exportToExcel === 'function') {
            exportToExcel(excelData, filename);
        } else {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            XLSX.utils.book_append_sheet(wb, ws, 'Detalle Compra');
            XLSX.writeFile(wb, `${filename}.xlsx`);
        }
        
        alert('✅ Exportación completada');
        
    } catch (error) {
        console.error('Error exportando:', error);
        alert('❌ Error al exportar: ' + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = '📊 Exportar a Excel';
            btn.disabled = false;
        }
    }
}

// ==================== ABRIR MODAL DE RESUMEN DE FACTURA ====================
async function openPurchaseDetail(purchaseId) {
    console.log(`📄 Abriendo detalle de compra: ${purchaseId}`);
    
    let modal = document.getElementById('purchaseDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'purchaseDetailModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1000px;">
                <div class="modal-header">
                    <h3>📋 Resumen de Compra</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body" id="purchaseDetailBody" style="max-height: 70vh; overflow-y: auto;">
                    <div class="loader-modal">
                        <div class="spinner-modal"></div>
                        <p>Cargando detalles de la compra...</p>
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: space-between;">
                    <button id="exportPurchaseDetailBtn" style="background: #10b981; padding: 6px 16px; cursor: pointer;">📊 Exportar a Excel</button>
                    <button onclick="closePurchaseDetailModal()" style="padding: 6px 16px; cursor: pointer;">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    modal.style.display = 'block';
    
    try {
        const url = `https://supply.gcasan.com/api/purchases/${purchaseId}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const compra = data.data || data;
        const details = compra.details || [];
        
        console.log(`📋 Total detalles: ${details.length}`);
        
        // Extraer gastos de envío
        const shipmentCost = parseFloat(compra.shipment_cost) || 0;
        const discountAmount = parseFloat(compra.discount_amount) || 0;
        const totalCompra = parseFloat(compra.total) || 0;
        
        console.log(`📦 Gastos de envío: $${shipmentCost}`);
        
        const productosMap = new Map();
        
        for (let i = 0; i < details.length; i++) {
            const detail = details[i];
            const productId = detail.product_id;
            const productName = detail.product?.name || `Producto ID: ${productId}`;
            const quantity = detail.quantity || 0;
            const unitPrice = parseFloat(detail.unit_price) || 0;
            const total = parseFloat(detail.total) || 0;
            const specificationGroups = detail.specification_groups || [];
            
            const groupIds = specificationGroups.map(g => g.id);
            
            console.log(`  Detalle ${i+1}: ${productName}, Cant: ${quantity}, GroupIds: [${groupIds.join(', ')}]`);
            
            const key = productId || productName;
            
            if (productosMap.has(key)) {
                const existing = productosMap.get(key);
                existing.cantidad += quantity;
                existing.total += total;
                existing.precioUnitario = existing.total / existing.cantidad;
                if (groupIds.length > 0) {
                    existing.hasSeries = true;
                    existing.groupIds.push(...groupIds);
                }
            } else {
                productosMap.set(key, {
                    productId: productId,
                    nombre: productName,
                    cantidad: quantity,
                    precioUnitario: unitPrice,
                    total: total,
                    hasSeries: groupIds.length > 0,
                    groupIds: groupIds
                });
            }
        }
        
        for (const producto of productosMap.values()) {
            if (producto.groupIds && producto.groupIds.length > 0) {
                producto.groupIds = [...new Set(producto.groupIds)];
                console.log(`  📦 ${producto.nombre}: ${producto.groupIds.length} groupIds únicos`);
            }
        }
        
        const productosResumen = Array.from(productosMap.values());
        productosResumen.sort((a, b) => b.total - a.total);
        
        const totalProductos = productosResumen.length;
        const totalUnidades = productosResumen.reduce((sum, p) => sum + p.cantidad, 0);
        const folio = compra.folio || compra.id;
        const proveedor = compra.supplier?.name || 'No disponible';
        const sucursal = compra.warehouse?.branch?.name || 'No disponible';
        const almacen = compra.warehouse?.name || 'No disponible';
        const fecha = compra.purchase_date ? compra.purchase_date.split('T')[0] : 'No disponible';
        
        let productosHtml = '';
        
        productosResumen.forEach((producto, index) => {
            productosHtml += `
                <tr>
                    <td style="padding: 10px; text-align: center;">${index + 1}</div>
                    <td style="padding: 10px;">
                        ${escapeHtml(producto.nombre)}
                        ${producto.hasSeries && producto.groupIds.length > 0 ? `<br><span class="badge-sim" onclick="openSeriesModal(${JSON.stringify(producto.groupIds)}, '${escapeHtml(producto.nombre).replace(/'/g, "\\'")}')">🔍 Ver Especificaciones (${producto.groupIds.length})</span>` : ''}
                    </div>
                    <td style="padding: 10px; text-align: center;">${producto.cantidad}</div>
                    <td style="padding: 10px; text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(producto.precioUnitario)}</div>
                    <td style="padding: 10px; text-align: right; font-weight: bold;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(producto.total)}</div>
                </tr>
            `;
        });
        
        // Construir las tarjetas: solo agregar la de envío si existe
        let tarjetasHtml = `
            <div style="display: flex; gap: 15px; margin-bottom: 25px;">
                <div class="stat-card" style="flex:1; padding:12px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number" style="font-size:1.5rem;">${totalProductos}</div>
                    <div class="stat-label">Tipos de Productos</div>
                </div>
                <div class="stat-card" style="flex:1; padding:12px; background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                    <div class="stat-number" style="font-size:1.5rem;">${totalUnidades}</div>
                    <div class="stat-label">Total Unidades</div>
                </div>
                <div class="stat-card" style="flex:1; padding:12px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                    <div class="stat-number" style="font-size:1rem;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(discountAmount)}</div>
                    <div class="stat-label">Descuento</div>
                </div>
                <div class="stat-card" style="flex:1; padding:12px; background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number" style="font-size:1.2rem;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalCompra)}</div>
                    <div class="stat-label">Total General</div>
                </div>
            </div>
        `;
        
        // Si hay gastos de envío, agregar una tarjeta extra
        if (shipmentCost > 0) {
            tarjetasHtml += `
            <div style="display: flex; gap: 15px; margin-bottom: 25px;">
                <div class="stat-card" style="flex:1; padding:12px; background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);">
                    <div class="stat-number" style="font-size:1.2rem;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(shipmentCost)}</div>
                    <div class="stat-label">✈️ Gastos de Envío</div>
                </div>
            </div>
            `;
        }
        
        const detailHtml = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                <div class="analysis-card-info"><div style="font-size: 0.7rem;">Folio</div><div style="font-size: 1rem; font-weight: bold;">${folio}</div></div>
                <div class="analysis-card-info"><div style="font-size: 0.7rem;">Fecha</div><div style="font-size: 1rem; font-weight: bold;">${fecha}</div></div>
                <div class="analysis-card-info"><div style="font-size: 0.7rem;">Proveedor</div><div style="font-size: 0.9rem; font-weight: bold;">${escapeHtml(proveedor)}</div></div>
                <div class="analysis-card-info"><div style="font-size: 0.7rem;">Sucursal</div><div style="font-size: 0.9rem; font-weight: bold;">${escapeHtml(sucursal)}</div></div>
                <div class="analysis-card-info"><div style="font-size: 0.7rem;">Almacén</div><div style="font-size: 0.9rem; font-weight: bold;">${escapeHtml(almacen)}</div></div>
                <div class="analysis-card-info"><div style="font-size: 0.7rem;">Status</div><div style="font-size: 0.9rem; font-weight: bold;">${compra.status || 'Registrado'}</div></div>
            </div>
            
            ${tarjetasHtml}
            
            <h4 style="color: #1e40af; margin-bottom: 12px;">📦 Productos</h4>
            <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f0f9ff;">
                        <tr>
                            <th style="padding:10px;">#</th>
                            <th style="padding:10px;">Producto</th>
                            <th style="padding:10px; text-align:center;">Cantidad</th>
                            <th style="padding:10px; text-align:right;">Precio</th>
                            <th style="padding:10px; text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${productosHtml}</tbody>
                    <tfoot>
                        <tr>
                            <td colspan="5" style="padding:10px; text-align:right; font-weight: bold;">TOTAL GENERAL: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalCompra)}</div>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        
        document.getElementById('purchaseDetailBody').innerHTML = detailHtml;
        
        const exportBtn = document.getElementById('exportPurchaseDetailBtn');
        if (exportBtn) {
            exportBtn.onclick = () => exportPurchaseDetailToExcel(purchaseId, compra, productosMap);
        }
        
    } catch (error) {
        console.error('❌ Error en openPurchaseDetail:', error);
        document.getElementById('purchaseDetailBody').innerHTML = `<div class="alert alert-error">❌ Error: ${error.message}</div>`;
    }
}

function closePurchaseDetailModal() {
    const modal = document.getElementById('purchaseDetailModal');
    if (modal) modal.style.display = 'none';
}

// ==================== FUNCIÓN PRINCIPAL DE BÚSQUEDA ====================
async function searchCompras() {
    const startDate = document.getElementById('comprasStartDate').value;
    const endDate = document.getElementById('comprasEndDate').value;
    const proveedorNombre = document.getElementById('proveedorSelect').value;
    
    if (!startDate || !endDate || !proveedorNombre) {
        showError('compras', 'Complete todos los filtros');
        return;
    }
    
    const btn = document.getElementById('searchComprasBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando compras... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    document.getElementById('comprasResults').style.display = 'none';
    document.getElementById('comprasErrorAlert').style.display = 'none';
    document.getElementById('comprasInfoAlert').style.display = 'none';
    
    try {
        let compras;
        
        if (cachedComprasData && cachedComprasData.startDate === startDate && cachedComprasData.endDate === endDate) {
            compras = cachedComprasData.compras;
        } else {
            const range = getComprasDateRange(startDate, endDate);
            compras = await fetchAllCompras(range.start, range.end);
            cachedComprasData = { compras, startDate, endDate };
            
            const proveedores = extraerProveedoresUnicos(compras);
            const proveedorSelect = document.getElementById('proveedorSelect');
            const currentValue = proveedorSelect.value;
            
            proveedorSelect.innerHTML = '<option value="">Seleccione un proveedor</option>';
            proveedores.forEach(proveedor => {
                const option = document.createElement('option');
                option.value = proveedor.name;
                option.textContent = proveedor.name;
                proveedorSelect.appendChild(option);
            });
            
            if (currentValue && proveedores.some(p => p.name === currentValue)) {
                proveedorSelect.value = currentValue;
            }
            proveedorSelect.disabled = false;
        }
        
        const comprasFiltradas = filtrarComprasPorProveedor(compras, proveedorNombre);
        const comprasOrdenadas = ordenarComprasPorAlmacen(comprasFiltradas);
        const gruposPorAlmacen = agruparComprasPorAlmacen(comprasOrdenadas);
        
        let totalGeneralDescuento = 0;
        let totalGeneralMonto = 0;
        
        for (const grupo of gruposPorAlmacen) {
            totalGeneralDescuento += grupo.totalDescuento;
            totalGeneralMonto += grupo.totalMonto;
        }
        
        cachedComprasData.gruposPorAlmacen = gruposPorAlmacen;
        cachedComprasData.proveedorNombre = proveedorNombre;
        cachedComprasData.totalGeneralDescuento = totalGeneralDescuento;
        cachedComprasData.totalGeneralMonto = totalGeneralMonto;
        
        let html = `
            <div class="stats" style="margin-bottom: 20px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number">${comprasFiltradas.length}</div>
                    <div class="stat-label">📋 Total Compras</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                    <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalGeneralDescuento)}</div>
                    <div class="stat-label">💰 Total Descuentos</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                    <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalGeneralMonto)}</div>
                    <div class="stat-label">💰 Total General</div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div class="alert alert-info" style="margin-bottom: 0;">
                    📅 Período: ${formatDate(startDate)} - ${formatDate(endDate)} | 🏢 Proveedor: ${escapeHtml(proveedorNombre)} | 🏭 Almacenes: ${gruposPorAlmacen.length}
                </div>
                <button id="exportComprasBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;">📊 Exportar a Excel</button>
            </div>
        `;
        
        for (const grupo of gruposPorAlmacen) {
            html += `
                <div class="almacen-header">
                    <div>
                        <span style="font-size: 1.1rem;">🏭 ${escapeHtml(grupo.almacen)}</span>
                        <span style="margin-left: 10px; font-size: 0.7rem; opacity: 0.8;">📍 ${escapeHtml(grupo.sucursal)}</span>
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 0.7rem;">
                        <span>📋 ${grupo.compras.length} compras</span>
                        <span>💰 Desc: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(grupo.totalDescuento)}</span>
                        <span>💰 Total: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(grupo.totalMonto)}</span>
                    </div>
                </div>
                
                <div class="table-container">
                    <table class="compras-table">
                        <thead>
                            <tr><th>#</th><th>Folio</th><th>Proveedor</th><th>Sucursal</th><th>Almacén</th><th style="text-align: right;">Descuento</th><th style="text-align: right;">Total</th></tr>
                        </thead>
                        <tbody>
            `;
            
            grupo.compras.forEach((compra, idx) => {
                const folio = compra.folio || compra.id;
                const proveedor = compra.supplier?.name || 'No disponible';
                const sucursal = compra.warehouse?.branch?.name || 'No disponible';
                const almacen = compra.warehouse?.name || 'No disponible';
                const descuento = compra.discount_amount || 0;
                const total = compra.total || 0;
                
                html += `<tr>
                    <td style="text-align: center;">${idx + 1}</div>
                    <td style="text-align: center;"><a href="#" class="purchase-link" data-id="${compra.id}">${folio}</a></div>
                    <td>${escapeHtml(proveedor)}</div>
                    <td>${escapeHtml(sucursal)}</div>
                    <td>${escapeHtml(almacen)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(descuento)}</div>
                    <td style="text-align: right; font-weight: bold; color: #059669;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(total)}</div>
                </tr>`;
            });
            
            html += `
                        </tbody>
                        <tfoot class="almacen-total">
                            <tr><td colspan="5" style="text-align: right;">TOTAL ${escapeHtml(grupo.almacen)}:</div><td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(grupo.totalDescuento)}</div><td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(grupo.totalMonto)}</div></tr>
                        </tfoot>
                    </table>
                </div>
            `;
        }
        
        document.getElementById('comprasResults').innerHTML = html;
        document.getElementById('comprasResults').style.display = 'block';
        
        document.querySelectorAll('.purchase-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                openPurchaseDetail(link.getAttribute('data-id'));
            });
        });
        
        const exportBtn = document.getElementById('exportComprasBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportComprasToExcel);
        }
        
        if (comprasFiltradas.length === 0) {
            showInfo('compras', `⚠️ No se encontraron compras`, true);
        } else {
            showInfo('compras', `✅ ${comprasFiltradas.length} compras en ${gruposPorAlmacen.length} almacenes`, false);
        }
        
    } catch (error) {
        showError('compras', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function exportComprasToExcel() {
    if (!cachedComprasData?.gruposPorAlmacen?.length) {
        showError('compras', 'No hay datos para exportar');
        return;
    }
    
    const { gruposPorAlmacen, startDate, endDate, proveedorNombre, totalGeneralDescuento, totalGeneralMonto } = cachedComprasData;
    
    const excelData = [
        ['REPORTE DE COMPRAS'],
        [`Período: ${formatDate(startDate)} - ${formatDate(endDate)}`],
        [`Proveedor: ${proveedorNombre}`],
        [],
        ['ALMACÉN', '#', 'Folio', 'Proveedor', 'Sucursal', 'Descuento', 'Total']
    ];
    
    for (const grupo of gruposPorAlmacen) {
        excelData.push([`🏭 ${grupo.almacen}`, '', '', '', '', '', '']);
        excelData.push(['', '#', 'Folio', 'Proveedor', 'Sucursal', 'Descuento', 'Total']);
        grupo.compras.forEach((compra, idx) => {
            excelData.push(['', idx + 1, compra.folio || compra.id, compra.supplier?.name || 'No disponible', compra.warehouse?.branch?.name || 'No disponible', compra.discount_amount || 0, compra.total || 0]);
        });
        excelData.push(['', '', '', '', 'TOTAL:', grupo.totalDescuento, grupo.totalMonto]);
        excelData.push([]);
    }
    
    excelData.push(['', '', '', '', 'TOTAL GENERAL:', totalGeneralDescuento, totalGeneralMonto]);
    
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `compras_${proveedorNombre.replace(/[^a-z0-9]/gi, '_')}_${startDate}_${endDate}`);
    }
}

function initComprasModule() {
    console.log('🔄 Inicializando módulo de compras...');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateInput = document.getElementById('comprasStartDate');
    const endDateInput = document.getElementById('comprasEndDate');
    if (startDateInput) startDateInput.value = startDate.toISOString().split('T')[0];
    if (endDateInput) endDateInput.value = endDate.toISOString().split('T')[0];
    if (startDateInput) startDateInput.addEventListener('change', () => { if (startDateInput.value && endDateInput?.value) loadProveedoresDesdeCompras(startDateInput.value, endDateInput.value); });
    if (endDateInput) endDateInput.addEventListener('change', () => { if (startDateInput?.value && endDateInput.value) loadProveedoresDesdeCompras(startDateInput.value, endDateInput.value); });
    const searchBtn = document.getElementById('searchComprasBtn');
    if (searchBtn && !searchBtn.hasAttribute('data-listener')) {
        searchBtn.setAttribute('data-listener', 'true');
        searchBtn.addEventListener('click', searchCompras);
    }
    setTimeout(() => { if (startDateInput?.value && endDateInput?.value) loadProveedoresDesdeCompras(startDateInput.value, endDateInput.value); }, 500);
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.closePurchaseDetailModal = closePurchaseDetailModal;
window.closeSeriesModal = closeSeriesModal;
window.openSeriesModal = openSeriesModal;