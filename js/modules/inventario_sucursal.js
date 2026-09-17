// ==================== MÓDULO: INVENTARIO POR SUCURSAL ====================

let cachedInventarioSucursalData = null;
let inventarioSucursalInicializado = false;
let sucursalesCargadas = false;
let reintentosSucursales = 0;
const MAX_REINTENTOS_SUCURSALES = 10;

// 🔥 Clasificaciones fijas (2 consultas separadas)
const CLASIFICACIONES_A_CONSULTAR = [3, 9];

// 🔥 Estado del ordenamiento actual
let ordenActual = { columna: null, direccion: 'asc' };

// ==================== INICIALIZACIÓN ====================

async function initInventarioSucursalModule() {
    console.log('🔄 [INVENTARIO SUCURSAL] Iniciando módulo...');
    
    if (inventarioSucursalInicializado) {
        const selectSuc = document.getElementById('inventarioSucursalSelect');
        if (selectSuc && selectSuc.options.length <= 1) {
            sucursalesCargadas = false;
            await cargarSucursalesParaInventarioConReintentos();
        }
        setupInventarioSucursalEventListeners();
        return;
    }
    
    inventarioSucursalInicializado = true;
    setupInventarioSucursalEventListeners();
    await cargarSucursalesParaInventarioConReintentos();
    
    console.log('✅ [INVENTARIO SUCURSAL] Inicialización completa');
}

// ==================== CARGAR SUCURSALES ====================

async function cargarSucursalesParaInventarioConReintentos() {
    for (let i = 0; i < MAX_REINTENTOS_SUCURSALES; i++) {
        const exito = await cargarSucursalesParaInventario();
        if (exito) return true;
        await new Promise(r => setTimeout(r, 1500));
    }
    return false;
}

async function cargarSucursalesParaInventario() {
    const select = document.getElementById('inventarioSucursalSelect');
    if (!select) return false;

    if (sucursalesCargadas && select.options.length > 1) return true;

    // ESTRATEGIA 1: Reutilizar del módulo de transferencias
    const branchDestinySelect = document.getElementById('branchDestinySelect');
    
    if (branchDestinySelect && branchDestinySelect.options.length > 1) {
        console.log('♻️ [INVENTARIO SUCURSAL] Reutilizando sucursales de transferencias');
        
        select.innerHTML = '<option value="">-- Seleccione una sucursal --</option>';
        
        let copiadas = 0;
        Array.from(branchDestinySelect.options).forEach((opt, idx) => {
            if (idx === 0 || !opt.value || opt.value === '') return;
            
            const newOption = document.createElement('option');
            newOption.value = opt.value;
            newOption.textContent = opt.textContent;
            select.appendChild(newOption);
            copiadas++;
        });
        
        if (copiadas > 0) {
            select.disabled = false;
            sucursalesCargadas = true;
            console.log(`✅ [INVENTARIO SUCURSAL] ${copiadas} sucursales copiadas`);
            return true;
        }
    }

    // ESTRATEGIA 2: Cargar desde la API
    select.innerHTML = '<option value="">⏳ Cargando sucursales...</option>';
    select.disabled = true;

    try {
        let allBranches = [];
        let currentPage = 1;
        let lastPage = 1;

        do {
            const url = `${CONFIG.API_BRANCHES}?page=${currentPage}&per_page=100&totalPages=0`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const branches = data.data || (Array.isArray(data) ? data : []);
            allBranches = allBranches.concat(branches);
            
            lastPage = data.last_page || data.meta?.last_page || 1;
            currentPage++;
            
            if (currentPage <= lastPage) await new Promise(r => setTimeout(r, 100));
        } while (currentPage <= lastPage);

        if (allBranches.length === 0) {
            select.innerHTML = '<option value="">No hay sucursales</option>';
            select.disabled = false;
            return false;
        }

        allBranches.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        select.innerHTML = '<option value="">-- Seleccione una sucursal --</option>';
        allBranches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.name || `Sucursal ${branch.id}`;
            select.appendChild(option);
        });
        
        select.disabled = false;
        sucursalesCargadas = true;
        console.log(`✅ [INVENTARIO SUCURSAL] ${allBranches.length} sucursales cargadas`);
        return true;

    } catch (error) {
        console.error('❌ [INVENTARIO SUCURSAL] Error:', error);
        select.innerHTML = '<option value="">❌ Error al cargar</option>';
        select.disabled = false;
        return false;
    }
}

// ==================== CONSULTA PRINCIPAL ====================

async function searchInventarioSucursal() {
    const branchId = document.getElementById('inventarioSucursalSelect').value;

    if (!branchId) {
        showError('inventarioSucursal', 'Por favor, selecciona una sucursal.');
        return;
    }

    const btn = document.getElementById('searchInventarioSucursalBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('inventarioSucursalResults').style.display = 'none';
    document.getElementById('inventarioSucursalErrorAlert').style.display = 'none';
    document.getElementById('inventarioSucursalInfoAlert').style.display = 'none';

    // Resetear orden
    ordenActual = { columna: null, direccion: 'asc' };

    try {
        // PASO 1: Obtener almacenes de la sucursal
        btn.innerHTML = 'Obteniendo almacenes... <span class="loading-spinner"></span>';
        const branchWarehouses = await fetchWarehousesByBranch(branchId);
        
        console.log(`📦 [INVENTARIO SUCURSAL] Almacenes:`, 
            branchWarehouses.map(w => `${w.id}: ${w.name}`));
        
        if (branchWarehouses.length === 0) {
            throw new Error('No se encontraron almacenes para esta sucursal');
        }

        // PASO 2: Por cada almacén, hacer 2 consultas (clasificación 3 y 9)
        let allStock = [];
        
        for (let i = 0; i < branchWarehouses.length; i++) {
            const wh = branchWarehouses[i];
            
            for (let j = 0; j < CLASIFICACIONES_A_CONSULTAR.length; j++) {
                const clasifId = CLASIFICACIONES_A_CONSULTAR[j];
                btn.innerHTML = `Consultando ${wh.name} (clasif ${clasifId})... <span class="loading-spinner"></span>`;
                
                const items = await fetchStockByWarehouseAndClassification(wh.id, clasifId);
                console.log(`   ✅ ${wh.name} | clasificación ${clasifId}: ${items.length} items`);
                
                allStock.push(...items);
            }
        }

        console.log(`📦 [INVENTARIO SUCURSAL] Total items: ${allStock.length}`);

        // PASO 3: Filtrar SOLO los que tienen quantity > 0
        const stockConCantidad = allStock.filter(item => (item.quantity || 0) > 0);
        console.log(`📊 [INVENTARIO SUCURSAL] Con cantidad > 0: ${stockConCantidad.length}`);

        if (stockConCantidad.length === 0) {
            document.getElementById('inventarioSucursalResults').innerHTML = `
                <div class="alert alert-info" style="text-align:center;padding:30px;">
                    📭 No se encontraron productos con stock en esta sucursal.
                </div>
            `;
            document.getElementById('inventarioSucursalResults').style.display = 'block';
            showInfo('inventarioSucursal', 'No hay productos con stock disponible.', true);
            return;
        }

        // PASO 4: Agrupar por producto
        const productosMap = new Map();
        stockConCantidad.forEach(item => {
            const productId = item.product_id || item.id;
            if (!productosMap.has(productId)) {
                productosMap.set(productId, {
                    productId: productId,
                    nombre: item.product_name || `Producto ID: ${productId}`,
                    cantidad: 0,
                    warehouse_id: item.warehouse_id,
                    branch_id: item.branch_id,
                    barcode: item.product_barcode || null,
                    familyName: item.family_name || null,
                    subfamilyName: item.subfamily_name || null,
                    lineName: item.line_name || null,
                    classificationName: item.classification_name || null,
                    hasSpecifications: item.has_specifications === true
                });
            }
            productosMap.get(productId).cantidad += item.quantity || 0;
        });

        const productosArray = Array.from(productosMap.values())
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        console.log(`✅ [INVENTARIO SUCURSAL] Productos únicos: ${productosArray.length}`);

        // Guardar en caché global
        const selectBranch = document.getElementById('inventarioSucursalSelect');
        const nombreSucursal = selectBranch.options[selectBranch.selectedIndex]?.text || '';
        
        cachedInventarioSucursalData = {
            branchId,
            nombreSucursal,
            productos: productosArray,
            branchWarehouses,
            fechaConsulta: new Date().toISOString()
        };

        renderInventarioSucursalTable(productosArray);

    } catch (error) {
        console.error('❌ [INVENTARIO SUCURSAL] Error:', error);
        showError('inventarioSucursal', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== HELPER: Obtener almacenes ====================

async function fetchWarehousesByBranch(branchId) {
    try {
        const url = `${CONFIG.API_WAREHOUSES}?page=1&per_page=100&totalPages=0`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const warehouses = data.data || (Array.isArray(data) ? data : []);
        
        return warehouses.filter(w => String(w.branch_id) === String(branchId));
    } catch (error) {
        console.error('❌ Error obteniendo almacenes:', error);
        return [];
    }
}

// ==================== HELPER: Consultar stock ====================

async function fetchStockByWarehouseAndClassification(warehouseId, classificationId) {
    let allItems = [];
    let currentPage = 1;
    let lastPage = 1;

    do {
        const url = `${CONFIG.API_STOCK}?page=${currentPage}&per_page=100&total=0&warehouse_id=${warehouseId}&classification_id=${classificationId}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            console.warn(`⚠️ Error HTTP ${response.status} wh=${warehouseId} clasif=${classificationId}`);
            break;
        }
        
        const data = await response.json();
        const items = data.data || [];
        allItems.push(...items);
        
        lastPage = data.last_page || data.meta?.last_page || 1;
        currentPage++;
        
        if (currentPage <= lastPage) await new Promise(r => setTimeout(r, 100));
    } while (currentPage <= lastPage);

    return allItems;
}

// ==================== ORDENAMIENTO ====================

function ordenarInventarioSucursal(columna) {
    if (!cachedInventarioSucursalData || !cachedInventarioSucursalData.productos) return;
    
    // Si es la misma columna, cambiar dirección
    if (ordenActual.columna === columna) {
        ordenActual.direccion = ordenActual.direccion === 'asc' ? 'desc' : 'asc';
    } else {
        ordenActual.columna = columna;
        ordenActual.direccion = 'asc';
    }
    
    const productos = [...cachedInventarioSucursalData.productos];
    const dir = ordenActual.direccion === 'asc' ? 1 : -1;
    
    productos.sort((a, b) => {
        let valA, valB;
        
        switch (columna) {
            case 'nombre':
                valA = (a.nombre || '').toLowerCase();
                valB = (b.nombre || '').toLowerCase();
                return valA.localeCompare(valB) * dir;
            
            case 'clasificacion':
                valA = (a.classificationName || '').toLowerCase();
                valB = (b.classificationName || '').toLowerCase();
                return valA.localeCompare(valB) * dir;
            
            case 'cantidad':
                return ((a.cantidad || 0) - (b.cantidad || 0)) * dir;
            
            default:
                return 0;
        }
    });
    
    console.log(`🔄 Ordenando por "${columna}" (${ordenActual.direccion})`);
    renderInventarioSucursalTable(productos);
}

// ==================== RENDERIZAR TABLA ====================

function renderInventarioSucursalTable(productos) {
    const container = document.getElementById('inventarioSucursalResults');
    
    const totalProductos = productos.length;
    const totalUnidades = productos.reduce((sum, p) => sum + p.cantidad, 0);
    
    const selectBranch = document.getElementById('inventarioSucursalSelect');
    const nombreSucursal = selectBranch.options[selectBranch.selectedIndex]?.text || '';

    // Icono de orden por columna
    const iconoOrden = (col) => {
        if (ordenActual.columna !== col) return '<span style="opacity:0.3; font-size:0.7rem;">⇅</span>';
        return ordenActual.direccion === 'asc' 
            ? '<span style="font-size:0.9rem;">▲</span>' 
            : '<span style="font-size:0.9rem;">▼</span>';
    };
    
    const thStyle = 'cursor:pointer; user-select:none;';
    const thHover = `onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background=''"`;

    let html = `
        <div class="alert alert-info" style="margin-bottom:16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
                🏪 <strong>${escapeHtml(nombreSucursal)}</strong> | 📅 ${new Date().toLocaleString('es-MX')}
            </div>
            <button id="exportarInventarioSucursalBtn" style="
                background: linear-gradient(135deg, #059669, #10b981);
                color: white;
                border: none;
                padding: 8px 20px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                font-size: 0.85rem;
                display: flex;
                align-items: center;
                gap: 6px;
            ">
                📊 Exportar con Series
            </button>
        </div>
        <div class="stats" style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <div class="stat-number">${totalProductos}</div>
                <div class="stat-label">📦 Tipos de Producto</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                <div class="stat-number">${totalUnidades}</div>
                <div class="stat-label">📱 Total Unidades</div>
            </div>
        </div>
        <div class="table-container">
            <table class="imei-table" style="font-size: 0.85rem;">
                <thead>
                    <tr>
                        <th style="width:45px; text-align:center;">#</th>
                        <th style="${thStyle} min-width: 300px;" ${thHover} onclick="ordenarInventarioSucursal('nombre')">
                            Descripción ${iconoOrden('nombre')}
                        </th>
                        <th style="${thStyle} width: 140px;" ${thHover} onclick="ordenarInventarioSucursal('clasificacion')">
                            Clasificación ${iconoOrden('clasificacion')}
                        </th>
                        <th style="${thStyle} text-align: center; width: 90px;" ${thHover} onclick="ordenarInventarioSucursal('cantidad')">
                            Cantidad ${iconoOrden('cantidad')}
                        </th>
                        <th style="text-align: center; width: 120px;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
    `;

    productos.forEach((prod, index) => {
        const nombreEscapado = escapeHtml(prod.nombre).replace(/'/g, "\\'");
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        
        const detalles = [
            prod.familyName,
            prod.subfamilyName,
            prod.lineName
        ].filter(Boolean).join(' · ');
        
        let clasifColor = '#64748b';
        const clasifUpper = (prod.classificationName || '').toUpperCase();
        if (clasifUpper.includes('TELCEL')) clasifColor = '#3b82f6';
        else if (clasifUpper.includes('LIBRE')) clasifColor = '#10b981';
        else if (clasifUpper.includes('SERVICIO')) clasifColor = '#8b5cf6';
        else if (clasifUpper.includes('EQUIPO')) clasifColor = '#1e40af';
        
        html += `
            <tr style="background:${rowBg}; border-bottom:1px solid #e2e8f0;">
                <td style="text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
                <td style="padding: 10px;">
                    <div style="font-weight: 600; color: #1e293b; font-size: 0.9rem;">${escapeHtml(prod.nombre)}</div>
                    ${detalles ? `<div style="font-size: 0.72rem; color: #64748b; margin-top: 3px;">${escapeHtml(detalles)}</div>` : ''}
                    ${prod.barcode ? `<div style="font-size: 0.7rem; color: #94a3b8; font-family: monospace; margin-top: 2px;">📊 ${prod.barcode}</div>` : ''}
                </td>
                <td style="padding: 10px;">
                    ${prod.classificationName ? `<span style="background:${clasifColor}; color:white; padding:3px 10px; border-radius:12px; font-size:0.7rem; font-weight:600;">${escapeHtml(prod.classificationName)}</span>` : '—'}
                </td>
                <td style="text-align: center; font-weight: bold; color: #1e40af; font-size: 1.15rem;">${prod.cantidad}</td>
                <td style="text-align: center;">
                    ${prod.hasSpecifications ? `
                        <button class="btn-analyze" 
                                onclick="openSeriesInventarioSucursalModal(${prod.productId}, '${nombreEscapado}', ${prod.warehouse_id})"
                                style="padding:6px 12px; font-size:0.75rem; background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                            📱 Ver Series
                        </button>
                    ` : `
                        <span style="color: #94a3b8; font-size: 0.7rem;">Sin series</span>
                    `}
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
    container.style.display = 'block';
    
    // Listener del botón exportar
    const exportBtn = document.getElementById('exportarInventarioSucursalBtn');
    if (exportBtn) {
        const newBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newBtn, exportBtn);
        newBtn.addEventListener('click', exportarInventarioConSeries);
    }
}

// ==================== EXPORTAR CON SERIES ====================

async function exportarInventarioConSeries() {
    if (!cachedInventarioSucursalData || !cachedInventarioSucursalData.productos) {
        showError('inventarioSucursal', 'No hay datos para exportar.');
        return;
    }
    
    const { productos, nombreSucursal, branchWarehouses } = cachedInventarioSucursalData;
    
    const btn = document.getElementById('exportarInventarioSucursalBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Obteniendo series...';
    btn.disabled = true;
    
    try {
        console.log(`📊 [EXPORT] Exportando ${productos.length} productos con series...`);
        
        // Fila por cada serie
        const filas = [];
        
        // Encabezados
        filas.push([
            'Descripción',
            'Familia',
            'Subfamilia',
            'Línea',
            'Clasificación',
            'Código de Barras',
            'IMEI',
            'ICCID',
            'Serie',
            'Fecha de Ingreso a Sucursal',
            'Almacén',
            'Status'
        ]);
        
        let totalSeries = 0;
        let productosConSeries = 0;
        let productosSinSeries = 0;
        
        // Iterar por cada producto
        for (let i = 0; i < productos.length; i++) {
            const prod = productos[i];
            btn.innerHTML = `⏳ Consultando series ${i+1}/${productos.length}: ${prod.nombre.substring(0, 30)}...`;
            
            // Si no tiene series, agregar una fila con la info del producto pero sin datos de serie
            if (!prod.hasSpecifications) {
                productosSinSeries++;
                // Por cada unidad en stock, podríamos agregar una fila, pero como no hay series,
                // solo agregamos 1 fila indicando que no tiene trazabilidad
                filas.push([
                    prod.nombre,
                    prod.familyName || '',
                    prod.subfamilyName || '',
                    prod.lineName || '',
                    prod.classificationName || '',
                    prod.barcode || '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    `Sin series (${prod.cantidad} pzas)`
                ]);
                continue;
            }
            
            productosConSeries++;
            
            // Consultar series de este producto
            try {
                const url = `https://inventory.gcasan.com/api/specification-groups?product_id=${prod.productId}&warehouse_id=${prod.warehouse_id}`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
                });
                
                if (!response.ok) {
                    console.warn(`⚠️ Error HTTP ${response.status} al consultar series de ${prod.productId}`);
                    continue;
                }
                
                const data = await response.json();
                const specs = data.data || (Array.isArray(data) ? data : []);
                
                if (!Array.isArray(specs) || specs.length === 0) {
                    filas.push([
                        prod.nombre,
                        prod.familyName || '',
                        prod.subfamilyName || '',
                        prod.lineName || '',
                        prod.classificationName || '',
                        prod.barcode || '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        `Sin series registradas (${prod.cantidad} pzas en stock)`
                    ]);
                    continue;
                }
                
                // Una fila por cada serie
                specs.forEach(spec => {
                    const details = spec.specification_details || [];
                    const imei = details.find(d => d.product_specification_id === 1)?.value || '';
                    const iccid = details.find(d => d.product_specification_id === 2)?.value || '';
                    const serie = details.find(d => d.product_specification_id === 3)?.value || '';
                    
                    const fechaIngreso = spec.in_warehouse_since 
                        ? new Date(spec.in_warehouse_since).toLocaleDateString('es-MX')
                        : (spec.stock?.created_at ? new Date(spec.stock.created_at).toLocaleDateString('es-MX') : '');
                    
                    filas.push([
                        prod.nombre,
                        prod.familyName || '',
                        prod.subfamilyName || '',
                        prod.lineName || '',
                        prod.classificationName || '',
                        prod.barcode || '',
                        imei,
                        iccid,
                        serie,
                        fechaIngreso,
                        nombreSucursal,
                        spec.status || ''
                    ]);
                    
                    totalSeries++;
                });
                
            } catch (error) {
                console.error(`❌ Error consultando series de ${prod.productId}:`, error);
            }
            
            // Pequeña pausa para no saturar la API
            await new Promise(r => setTimeout(r, 100));
        }
        
        console.log(`📊 [EXPORT] Total series: ${totalSeries}, productos con series: ${productosConSeries}, sin series: ${productosSinSeries}`);
        
        // Fila resumen al final
        filas.push([]);
        filas.push(['RESUMEN']);
        filas.push(['Total Series Exportadas', totalSeries]);
        filas.push(['Productos con Series', productosConSeries]);
        filas.push(['Productos sin Series', productosSinSeries]);
        filas.push(['Sucursal', nombreSucursal]);
        filas.push(['Fecha de Exportación', new Date().toLocaleString('es-MX')]);
        
        // Generar Excel
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(filas);
        
        // Anchos de columna
        ws['!cols'] = [
            { wch: 40 }, // Descripción
            { wch: 15 }, // Familia
            { wch: 18 }, // Subfamilia
            { wch: 15 }, // Línea
            { wch: 18 }, // Clasificación
            { wch: 18 }, // Código de Barras
            { wch: 20 }, // IMEI
            { wch: 22 }, // ICCID
            { wch: 18 }, // Serie
            { wch: 22 }, // Fecha
            { wch: 20 }, // Almacén
            { wch: 15 }  // Status
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario con Series');
        
        const fechaArchivo = new Date().toISOString().split('T')[0];
        const nombreArchivo = `inventario_series_${nombreSucursal.replace(/[^a-zA-Z0-9]/g, '_')}_${fechaArchivo}.xlsx`;
        
        XLSX.writeFile(wb, nombreArchivo);
        
        console.log(`✅ [EXPORT] Archivo generado: ${nombreArchivo}`);
        showInfo('inventarioSucursal', `✅ Exportadas ${totalSeries} series de ${productosConSeries} productos`);
        
    } catch (error) {
        console.error('❌ [EXPORT] Error:', error);
        showError('inventarioSucursal', `Error al exportar: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== MODAL DE SERIES ====================

async function openSeriesInventarioSucursalModal(productId, productName, warehouseId) {
    let modal = document.getElementById('seriesSucursalModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'seriesSucursalModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;position:fixed;z-index:10000;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.7);align-items:center;justify-content:center;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; width: 90%;">
                <div class="modal-header">
                    <h3>📱 <span id="seriesSucursalModalTitle">Series</span></h3>
                    <span class="close-modal" onclick="closeSeriesSucursalModal()" style="cursor:pointer;">&times;</span>
                </div>
                <div class="modal-body" id="seriesSucursalModalBody" style="max-height: 70vh; overflow-y: auto;">
                    <div class="loader-modal">
                        <div class="spinner-modal"></div>
                        <p>Cargando series...</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button onclick="closeSeriesSucursalModal()" style="padding:8px 20px; cursor:pointer;">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSeriesSucursalModal();
        });
    }

    document.getElementById('seriesSucursalModalTitle').innerHTML = `📱 ${escapeHtml(productName)}`;
    const body = document.getElementById('seriesSucursalModalBody');
    body.innerHTML = '<div class="loader-modal"><div class="spinner-modal"></div><p>Consultando series...</p></div>';
    modal.style.display = 'flex';

    try {
        const url = `https://inventory.gcasan.com/api/specification-groups?product_id=${productId}&warehouse_id=${warehouseId}`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const specs = data.data || (Array.isArray(data) ? data : []);

        if (!Array.isArray(specs) || specs.length === 0) {
            body.innerHTML = '<div class="alert alert-info" style="text-align:center;padding:30px;">📭 No se encontraron series para este producto.</div>';
            return;
        }

        const seriesData = specs.map(spec => {
            const details = spec.specification_details || [];
            const imei = details.find(d => d.product_specification_id === 1)?.value || null;
            const iccid = details.find(d => d.product_specification_id === 2)?.value || null;
            const serie = details.find(d => d.product_specification_id === 3)?.value || null;
            
            const ingreso = spec.in_warehouse_since 
                ? new Date(spec.in_warehouse_since).toLocaleDateString('es-MX')
                : (spec.stock?.created_at ? new Date(spec.stock.created_at).toLocaleDateString('es-MX') : 'N/A');
            
            return { imei, iccid, serie, ingreso, status: spec.status || 'N/A' };
        });

        let tableHtml = `
            <div style="margin-bottom: 12px; font-weight: 600; color: #1e40af; font-size: 0.95rem;">
                📊 Total: ${seriesData.length} series
            </div>
            <div class="table-container" style="max-height: 450px; overflow-y: auto; border:1px solid #e2e8f0; border-radius:8px;">
                <table class="specs-table" style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                    <thead style="position:sticky; top:0; background:linear-gradient(135deg,#1e40af,#3b82f6); color:white;">
                        <tr>
                            <th style="padding:8px;">#</th>
                            <th style="padding:8px;">IMEI</th>
                            <th style="padding:8px;">ICCID</th>
                            <th style="padding:8px;">Serie</th>
                            <th style="padding:8px;">Fecha Ingreso</th>
                            <th style="padding:8px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        seriesData.forEach((item, idx) => {
            const bg = idx % 2 === 0 ? '#f8fafc' : 'white';
            tableHtml += `
                <tr style="background:${bg}; border-bottom:1px solid #e2e8f0;">
                    <td style="padding:6px 8px; text-align:center;">${idx + 1}</td>
                    <td style="padding:6px 8px; font-family: monospace; font-size:0.75rem;">${item.imei || '—'}</td>
                    <td style="padding:6px 8px; font-family: monospace; font-size:0.75rem;">${item.iccid || '—'}</td>
                    <td style="padding:6px 8px; font-family: monospace; font-size:0.75rem;">${item.serie || '—'}</td>
                    <td style="padding:6px 8px; text-align:center; font-size:0.75rem;">${item.ingreso}</td>
                    <td style="padding:6px 8px; text-align:center; font-size:0.7rem;">
                        <span style="background:${item.status === 'available' ? '#dcfce7' : '#fef3c7'}; color:${item.status === 'available' ? '#166534' : '#92400e'}; padding:2px 8px; border-radius:12px; font-weight:600;">
                            ${item.status}
                        </span>
                    </td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table></div>`;
        body.innerHTML = tableHtml;

    } catch (error) {
        console.error('❌ [SERIES] Error:', error);
        body.innerHTML = `<div class="alert alert-error" style="text-align:center;padding:30px;">❌ Error: ${error.message}</div>`;
    }
}

function closeSeriesSucursalModal() {
    const modal = document.getElementById('seriesSucursalModal');
    if (modal) modal.style.display = 'none';
}

// ==================== EVENT LISTENERS ====================

function setupInventarioSucursalEventListeners() {
    const searchBtn = document.getElementById('searchInventarioSucursalBtn');
    if (searchBtn && !searchBtn.hasAttribute('data-listener')) {
        searchBtn.setAttribute('data-listener', 'true');
        searchBtn.addEventListener('click', searchInventarioSucursal);
        console.log('✅ [INVENTARIO SUCURSAL] Listener del botón configurado');
    }
}

// ==================== EXPORTAR ====================
window.initInventarioSucursalModule = initInventarioSucursalModule;
window.searchInventarioSucursal = searchInventarioSucursal;
window.openSeriesInventarioSucursalModal = openSeriesInventarioSucursalModal;
window.closeSeriesSucursalModal = closeSeriesSucursalModal;
window.ordenarInventarioSucursal = ordenarInventarioSucursal;
window.exportarInventarioConSeries = exportarInventarioConSeries;

console.log('✅ Módulo INVENTARIO SUCURSAL cargado');