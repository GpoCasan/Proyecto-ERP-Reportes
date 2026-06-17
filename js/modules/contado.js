// ==================== MÓDULO: VENTAS DE CONTADO ====================
async function generateSalesReportAllLines() {
    const date = document.getElementById('contadoDate').value;
    if (!date) { showError('contado', 'Seleccione fecha'); return; }
    const btn = document.getElementById('btnAllLines');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;
    try {
        const range = getDateRangeContado(date);
        if (!range) throw new Error('Error en fecha');
        
        const [res4, res5] = await Promise.all([
            fetch(`${CONFIG.API_SALES}?page=1&per_page=100&sale_type=products&classification_ids[]=9&classification_ids[]=3&line_id=4&start_date=${range.start}&end_date=${range.end}`, { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } }),
            fetch(`${CONFIG.API_SALES}?page=1&per_page=100&sale_type=products&classification_ids[]=9&classification_ids[]=3&line_id=5&start_date=${range.start}&end_date=${range.end}`, { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } })
        ]);
        const data4 = await res4.json(), data5 = await res5.json();
        const sales = [...(data4.data||[]), ...(data5.data||[])];
        const map = new Map();
        for (let sale of sales) {
            for (let detail of (sale.details||[])) {
                for (let group of (detail.specification_groups||[])) {
                    for (let spec of (group.specification_details||[])) {
                        if (spec.specification?.name === 'IMEI' && isValidImei(spec.value) && !map.has(spec.value)) {
                            const isLibre = (detail.product?.name||'').toLowerCase().includes('libre');
                            map.set(spec.value, {
                                imei: spec.value,
                                product: detail.product?.name || 'Desconocido',
                                price: parseFloat(detail.total_amount || detail.total || 0),
                                saleId: sale.id,
                                seller: sale.user?.name || 'No disponible',
                                sellerId: sale.user?.id || null,
                                line: isLibre ? 'Libre' : 'Telcel',
                                productId: detail.product?.id || null
                            });
                        }
                    }
                }
            }
        }
        const results = Array.from(map.values());
        cachedSalesData = { date: date, results: results };
        
        const statsHtml = `
            <button class="stat-card-btn" data-filter="all"><div class="stat-number">${results.length}</div><div class="stat-label">📱 Total IMEIs</div></button>
            <button class="stat-card-btn" data-filter="telcel"><div class="stat-number">${results.filter(r=>r.line==='Telcel').length}</div><div class="stat-label">📶 Telcel</div></button>
            <button class="stat-card-btn" data-filter="libre"><div class="stat-number">${results.filter(r=>r.line==='Libre').length}</div><div class="stat-label">🔓 Libre</div></button>
            <button class="stat-card-btn" id="btnAnalyzeAllMarkup" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                <div class="stat-number">📊</div>
                <div class="stat-label">Analizar Markup</div>
                <div style="font-size:0.65rem; margin-top:4px;">General del día</div>
            </button>
            <button class="stat-card-btn" id="btnAsesorSummary"><div class="stat-number">👥</div><div class="stat-label">Resumen Asesores</div></button>
        `;
        document.getElementById('contadoStats').innerHTML = statsHtml;
        document.getElementById('contadoStats').style.display = 'grid';
        
        // Resetear análisis de markup para la nueva consulta
        resetMarkupAnalysis();
        
        // Separar equipos por precio: >= 1500 y < 1500
        const highPriceResults = results.filter(item => item.price >= 1500);
        const lowPriceResults = results.filter(item => item.price < 1500);
        
        // Ordenar cada grupo por vendedor (alfabéticamente)
        const sortBySeller = (a, b) => a.seller.localeCompare(b.seller);
        highPriceResults.sort(sortBySeller);
        lowPriceResults.sort(sortBySeller);
        
        let html = `<div class="table-container">`;
        
        // Sección de equipos de $1500 o más
        if (highPriceResults.length > 0) {
            html += `
                <div class="section-header" style="background-color: #2c7da0; color: white; padding: 8px 12px; margin-top: 10px; border-radius: 8px;">
                    <strong>💰 EQUIPOS DE $1,500 O MÁS (${highPriceResults.length} equipos)</strong>
                </div>
                <table class="imei-table">
                    <thead>
                        <tr><th>#</th><th>Venta</th><th>Línea</th><th>IMEI</th><th>Producto</th><th>Vendedor</th><th>Precio</th><th>Acción</th></tr>
                    </thead>
                    <tbody>`;
            highPriceResults.forEach((item, i) => {
                html += `<tr>
                    <td>${i+1}</td>
                    <td><button class="badge-sale-id" onclick="openReceipt(${item.saleId})">📄 #${item.saleId}</button></td>
                    <td><span class="badge-${item.line==='Telcel'?'telcel':'libre'}">📱 ${item.line}</span></td>
                    <td><code>${item.imei}</code></td>
                    <td>${escapeHtml(item.product)}</div>
                    <td>${escapeHtml(item.seller)}</div>
                    <td>$${item.price.toFixed(2)} MXN</div>
                    <td><button class="btn-analyze" data-imei="${item.imei}" data-price="${item.price}" data-date="${date}">🔍 Analizar</button></div>
                </tr>`;
            });
            html += `</tbody></table>`;
        }
        
        // Sección de equipos de menos de $1500
        if (lowPriceResults.length > 0) {
            html += `
                <div class="section-header" style="background-color: #52b788; color: white; padding: 8px 12px; margin-top: 20px; border-radius: 8px;">
                    <strong>🛒 EQUIPOS DE MENOS DE $1,500 (${lowPriceResults.length} equipos)</strong>
                </div>
                <table class="imei-table">
                    <thead>
                        <tr><th>#</th><th>Venta</th><th>Línea</th><th>IMEI</th><th>Producto</th><th>Vendedor</th><th>Precio</th><th>Acción</th></tr>
                    </thead>
                    <tbody>`;
            lowPriceResults.forEach((item, i) => {
                html += `<tr>
                    <td>${i+1}</td>
                    <td><button class="badge-sale-id" onclick="openReceipt(${item.saleId})">📄 #${item.saleId}</button></td>
                    <td><span class="badge-${item.line==='Telcel'?'telcel':'libre'}">📱 ${item.line}</span></td>
                    <td><code>${item.imei}</code></td>
                    <td>${escapeHtml(item.product)}</div>
                    <td>${escapeHtml(item.seller)}</div>
                    <td>$${item.price.toFixed(2)} MXN</div>
                    <td><button class="btn-analyze" data-imei="${item.imei}" data-price="${item.price}" data-date="${date}">🔍 Analizar</button></div>
                </tr>`;
            });
            html += `</tbody> </div>`;
        }
        
        html += `</div>`;
        document.getElementById('contadoResults').innerHTML = html;
        document.getElementById('contadoResults').style.display = 'block';
        
        // Asignar eventos de análisis
        document.querySelectorAll('#contadoResults .btn-analyze').forEach(btn => {
            btn.addEventListener('click', async (e) => { await openAnalysisModal(btn.dataset.imei, parseFloat(btn.dataset.price), btn.dataset.date, 'Contado'); });
        });
        
        // Asignar eventos de estadísticas
        document.querySelectorAll('#contadoStats .stat-card-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => openResumenModal(btn.getAttribute('data-filter')));
        });
        
        // Evento para el botón de resumen de asesores
        const btnAsesorSummary = document.getElementById('btnAsesorSummary');
        if (btnAsesorSummary) {
            btnAsesorSummary.addEventListener('click', (e) => {
                e.stopPropagation();
                openAsesorSummaryModal();
            });
        }
        
        // Evento para el botón de análisis de markup general
        const btnAnalyzeAllMarkup = document.getElementById('btnAnalyzeAllMarkup');
        if (btnAnalyzeAllMarkup) {
            btnAnalyzeAllMarkup.addEventListener('click', (e) => {
                e.stopPropagation();
                analyzeAllMarkup();
            });
        }
        
    } catch(e) { showError('contado', e.message); }
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}

function openResumenModal(filter) {
    if (!cachedSalesData || !cachedSalesData.results) { showError('contado', 'Primero consulta las ventas'); return; }
    let filteredResults = cachedSalesData.results;
    let title = '📱 Resumen de Equipos (Todos)';
    if (filter === 'telcel') { filteredResults = cachedSalesData.results.filter(r => r.line === 'Telcel'); title = '📶 Resumen de Equipos TELCEL'; }
    else if (filter === 'libre') { filteredResults = cachedSalesData.results.filter(r => r.line === 'Libre'); title = '🔓 Resumen de Equipos LIBRE'; }
    
    const productMap = new Map();
    for (let item of filteredResults) {
        const productName = item.product;
        if (productMap.has(productName)) {
            const existing = productMap.get(productName);
            existing.cantidad++;
            existing.total += item.price;
        } else {
            productMap.set(productName, { nombre: productName, cantidad: 1, precioUnitario: item.price, total: item.price });
        }
    }
    const productos = Array.from(productMap.values()).sort((a,b) => a.nombre.localeCompare(b.nombre));
    const totalUnidades = productos.reduce((sum, p) => sum + p.cantidad, 0);
    const totalVenta = productos.reduce((sum, p) => sum + p.total, 0);
    
    let modal = document.getElementById('resumenModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resumenModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 id="resumenModalTitle">📊 Resumen de equipos</h3><span class="close-modal">&times;</span></div><div class="modal-body" id="resumenModalBody"></div><div class="modal-footer">Ventas de contado</div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    document.getElementById('resumenModalTitle').innerHTML = title;
    let tableHtml = `<div class="stats" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-number">${totalUnidades}</div><div class="stat-label">Total Equipos</div></div>
        <div class="stat-card"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totalVenta)}</div><div class="stat-label">Total Venta</div></div>
    </div>
    <div class="table-container">
        <table class="resumen-table">
            <thead>
                <tr><th>#</th><th>Producto</th><th>Cantidad</th><th>Precio Unitario</th><th>Total</th></tr>
            </thead>
            <tbody>`;
    productos.forEach((prod, idx) => { tableHtml += `<tr>
                <td>${idx+1}</td>
                <td style="text-align:left">${escapeHtml(prod.nombre)}</div>
                <td style="text-align:center"><strong>${prod.cantidad}</strong></div>
                <td style="text-align:right">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(prod.precioUnitario)}</div>
                <td style="text-align:right">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(prod.total)}</div>
            </tr>`;
    });
    tableHtml += `</tbody> </div>`;
    document.getElementById('resumenModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
}

async function openAnalysisModal(imei, salePrice, saleDate, saleType) {
    let modal = document.getElementById('analysisModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'analysisModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3>📊 Análisis de equipo</h3><span class="close-modal">&times;</span></div><div class="modal-body" id="modalBody"><div class="loader-modal"><div class="spinner-modal"></div><p>Cargando información del equipo...</p></div></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    try {
        const inv = await fetchInventoryCost(imei);
        const cost = parseFloat(inv.cost) || 0;
        const costConIva = cost * 1.16;
        const markup = salePrice - costConIva;
        const margin = salePrice > 0 ? (markup / salePrice) * 100 : 0;
        
        document.getElementById('modalBody').innerHTML = `
            <div class="analysis-card-info">
                <h4>📱 ${escapeHtml(inv.stock?.product?.name || 'Producto')}</h4>
                <div class="analysis-row"><span class="analysis-label">IMEI:</span><span class="analysis-value"><code>${imei}</code></span></div>
                <div class="analysis-row"><span class="analysis-label">Costo + IVA:</span><span class="analysis-value">$${costConIva.toFixed(2)} MXN</span></div>
                <div class="analysis-row"><span class="analysis-label">Precio Venta:</span><span class="analysis-value">$${salePrice.toFixed(2)} MXN</span></div>
            </div>
            <div class="grid-2cols">
                <div class="markup-card"><div class="value">$${markup.toFixed(2)} MXN</div><div>💰 Utilidad</div></div>
                <div class="margin-card"><div class="value">${margin.toFixed(1)}%</div><div>📊 Margen</div></div>
            </div>`;
    } catch(e) { document.getElementById('modalBody').innerHTML = `<div class="alert alert-error">❌ Error: ${e.message}</div>`; }
}

function openAsesorSummaryModal() {
    if (!cachedSalesData || !cachedSalesData.results) { 
        showError('contado', 'Primero consulta las ventas'); 
        return; 
    }
    
    const results = cachedSalesData.results;
    
    // Crear mapa de ventas por asesor (usando sellerId)
    const ventasPorAsesor = new Map();
    
    for (let item of results) {
        const id = item.sellerId;
        const nombre = item.seller;
        const isHighPrice = item.price >= 1500;
        
        const key = id || nombre;
        
        if (!ventasPorAsesor.has(key)) {
            ventasPorAsesor.set(key, {
                id: id,
                nombre: nombre,
                alta: 0,
                baja: 0,
                total: 0
            });
        }
        
        const data = ventasPorAsesor.get(key);
        if (isHighPrice) {
            data.alta++;
        } else {
            data.baja++;
        }
        data.total++;
    }
    
    // Construir estructura por equipos
    const equipos = [];
    
    for (const [teamName, teamData] of Object.entries(TEAM_STRUCTURE)) {
        let liderAlta = 0, liderBaja = 0, liderTotal = 0;
        
        if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
            const lider = ventasPorAsesor.get(teamData.liderId);
            liderAlta = lider.alta;
            liderBaja = lider.baja;
            liderTotal = lider.total;
        } else {
            for (const [key, value] of ventasPorAsesor) {
                if (value.nombre === teamData.liderNombre) {
                    liderAlta = value.alta;
                    liderBaja = value.baja;
                    liderTotal = value.total;
                    break;
                }
            }
        }
        
        const miembros = [];
        let equipoAlta = liderAlta;
        let equipoBaja = liderBaja;
        let equipoTotal = liderTotal;
        
        for (const miembroId of teamData.miembros) {
            let miembroAlta = 0, miembroBaja = 0, miembroTotal = 0;
            let miembroInfo = null;
            
            if (ventasPorAsesor.has(miembroId)) {
                miembroInfo = ventasPorAsesor.get(miembroId);
                miembroAlta = miembroInfo.alta;
                miembroBaja = miembroInfo.baja;
                miembroTotal = miembroInfo.total;
            } else {
                for (const [key, value] of ventasPorAsesor) {
                    if (value.id === miembroId) {
                        miembroAlta = value.alta;
                        miembroBaja = value.baja;
                        miembroTotal = value.total;
                        miembroInfo = value;
                        break;
                    }
                }
            }
            
            if (miembroTotal > 0 && miembroInfo) {
                miembros.push({
                    nombre: miembroInfo.nombre,
                    alta: miembroAlta,
                    baja: miembroBaja,
                    total: miembroTotal
                });
                equipoAlta += miembroAlta;
                equipoBaja += miembroBaja;
                equipoTotal += miembroTotal;
            }
        }
        
        miembros.sort((a, b) => b.total - a.total);
        
        if (equipoTotal > 0) {
            equipos.push({
                nombre: teamName,
                liderNombre: teamData.liderNombre,
                liderAlta: liderAlta,
                liderBaja: liderBaja,
                liderTotal: liderTotal,
                miembros: miembros,
                equipoAlta: equipoAlta,
                equipoBaja: equipoBaja,
                equipoTotal: equipoTotal
            });
        }
    }
    
    equipos.sort((a, b) => b.equipoTotal - a.equipoTotal);
    
    const totalGeneralAlta = equipos.reduce((sum, e) => sum + e.equipoAlta, 0);
    const totalGeneralBaja = equipos.reduce((sum, e) => sum + e.equipoBaja, 0);
    const totalGeneral = equipos.reduce((sum, e) => sum + e.equipoTotal, 0);
    
    // Crear modal
    let modal = document.getElementById('asesorSummaryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'asesorSummaryModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3>👥 Resumen por Equipo - Cantidades</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                    <button id="exportExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>
                </div>
                <div class="modal-body" id="asesorSummaryModalBody"></div>
                <div class="modal-footer">
                    Ventas de contado | Cantidades de equipos
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    // Generar tabla HTML
    let tableHtml = `
        <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">
            <div style="flex: 1; background: #2c7da0; color: white; padding: 12px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${totalGeneralAlta}</div>
                <div style="font-size: 11px;">💰 Equipos ≥ $1,500</div>
            </div>
            <div style="flex: 1; background: #52b788; color: white; padding: 12px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${totalGeneralBaja}</div>
                <div style="font-size: 11px;">🛒 Equipos < $1,500</div>
            </div>
            <div style="flex: 1; background: #1e6091; color: white; padding: 12px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${totalGeneral}</div>
                <div style="font-size: 11px;">📱 Total Equipos</div>
            </div>
        </div>
        
        <div style="max-height: 500px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead style="position: sticky; top: 0; background: #f8fafc;">
                    <tr style="border-bottom: 2px solid #2c7da0;">
                        <th style="padding: 10px; text-align: center;">#</th>
                        <th style="padding: 10px; text-align: left;">Equipo / Asesor</th>
                        <th style="padding: 10px; text-align: center; background: #2c7da0; color: white;">💰 ≥ $1,500</th>
                        <th style="padding: 10px; text-align: center; background: #52b788; color: white;">🛒 < $1,500</th>
                        <th style="padding: 10px; text-align: center;">📱 Total</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let index = 1;
    for (const equipo of equipos) {
        tableHtml += `
            <tr style="background-color: #e8f4f8; border-top: 2px solid #2c7da0;">
                <td style="padding: 8px; text-align: center; font-weight: bold;">${index}</div>
                <td style="padding: 8px; text-align: left; font-weight: bold; color: #2c7da0;">📁 ${equipo.nombre}</div>
                <td style="padding: 8px; text-align: center; font-weight: bold; background: #2c7da015;">${equipo.equipoAlta}</div>
                <td style="padding: 8px; text-align: center; font-weight: bold; background: #52b78815;">${equipo.equipoBaja}</div>
                <td style="padding: 8px; text-align: center; font-weight: bold;">${equipo.equipoTotal}</div>
            </tr>
        `;
        index++;
        
        tableHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; text-align: center;"></div>
                <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">👑 ${equipo.liderNombre}</div>
                <td style="padding: 6px 8px; text-align: center;">${equipo.liderAlta}</div>
                <td style="padding: 6px 8px; text-align: center;">${equipo.liderBaja}</div>
                <td style="padding: 6px 8px; text-align: center; font-weight: bold;">${equipo.liderTotal}</div>
            </tr>
        `;
        
        for (const miembro of equipo.miembros) {
            tableHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px 8px; text-align: center;"></div>
                    <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">└─ ${escapeHtml(miembro.nombre)}</div>
                    <td style="padding: 6px 8px; text-align: center;">${miembro.alta}</div>
                    <td style="padding: 6px 8px; text-align: center;">${miembro.baja}</div>
                    <td style="padding: 6px 8px; text-align: center;">${miembro.total}</div>
                </tr>
            `;
        }
    }
    
    tableHtml += `
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('asesorSummaryModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
    
    // Event listener para exportar a Excel
    const exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportAsesorSummaryToExcel(equipos));
    }
}

// Función para exportar a Excel
function exportAsesorSummaryToExcel(equipos) {
    // Preparar datos para Excel
    const excelData = [
        ['Resumen por Equipo - Ventas de Contado'],
        [],
        ['#', 'Equipo / Asesor', 'Equipos ≥ $1,500', 'Equipos < $1,500', 'Total Equipos']
    ];
    
    let rowIndex = 1;
    for (const equipo of equipos) {
        // Fila del líder
        excelData.push(['Lider', `${equipo.liderNombre}`, equipo.liderAlta, equipo.liderBaja, equipo.liderTotal]);
        
        // Filas de los miembros
        for (const miembro of equipo.miembros) {
            excelData.push(['', `${miembro.nombre}`, miembro.alta, miembro.baja, miembro.total]);
        }
        
        // Línea separadora
        excelData.push(['', '', '', '', '']);
    }
    
    // Agregar totales generales
    const totalAlta = equipos.reduce((sum, e) => sum + e.equipoAlta, 0);
    const totalBaja = equipos.reduce((sum, e) => sum + e.equipoBaja, 0);
    const totalGeneral = equipos.reduce((sum, e) => sum + e.equipoTotal, 0);
    
    excelData.push(['', 'TOTAL GENERAL:', totalAlta, totalBaja, totalGeneral]);
    excelData.push([]);
    
    // Llamar a la función global de exportación
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `resumen_equipos_${cachedSalesData.date}`);
    } else {
        console.error('La función exportToExcel no está disponible. Asegúrate de incluir SheetJS en index.html');
        alert('Error: No se pudo exportar. Verifica que la librería SheetJS esté cargada.');
    }
}

// ==================== ANÁLISIS DE MARKUP GENERAL PARA CONTADO ====================

// Variable para almacenar si ya se analizó en la consulta actual
let markupAnalizadoEnConsultaActual = false;
let cachedMarkupResults = null;

// Función principal para analizar markup de todos los equipos
async function analyzeAllMarkup() {
    // Verificar que existan datos de ventas
    if (!cachedSalesData || !cachedSalesData.results || cachedSalesData.results.length === 0) {
        showError('contado', 'Primero consulta las ventas del día');
        return;
    }
    
    // Verificar si ya se analizó en esta consulta
    if (markupAnalizadoEnConsultaActual) {
        showInfo('contado', '⚠️ Ya se analizó el markup de esta consulta. Consulta otra fecha para volver a analizar.', true);
        return;
    }
    
    const btnCard = document.getElementById('btnAnalyzeAllMarkup');
    if (!btnCard) return;
    
    // Guardar contenido original
    const originalContent = btnCard.innerHTML;
    
    // Cambiar a modo "analizando"
    btnCard.innerHTML = `
        <div class="stat-number">
            <span class="loading-spinner-small" style="width:24px;height:24px;border-width:3px;"></span>
        </div>
        <div class="stat-label">Analizando markup...</div>
        <div style="font-size:0.65rem; margin-top:4px;">Obteniendo costos</div>
    `;
    btnCard.style.cursor = 'wait';
    btnCard.disabled = true;
    
    try {
        const results = cachedSalesData.results;
        const totalEquipos = results.length;
        
        // Arrays para almacenar resultados
        const equiposConCosto = [];
        const equiposSinCosto = [];
        let sumaVentas = 0;
        let sumaCostos = 0;
        
        // Procesar cada equipo en paralelo con límite de concurrencia
        const concurrencyLimit = 10;
        const batches = [];
        
        for (let i = 0; i < results.length; i += concurrencyLimit) {
            batches.push(results.slice(i, i + concurrencyLimit));
        }
        
        let procesados = 0;
        
        for (const batch of batches) {
            const promises = batch.map(async (item) => {
                try {
                    const costData = await fetchProductCost(item.productId);
                    
                    if (costData && costData.costoConIva > 0) {
                        const costoConIva = costData.costoConIva;
                        const precioVenta = item.price;
                        const utilidad = precioVenta - costoConIva;
                        const margen = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;
                        
                        return {
                            success: true,
                            imei: item.imei,
                            producto: item.product,
                            precioVenta: precioVenta,
                            costo: costoConIva,
                            utilidad: utilidad,
                            margen: margen,
                            vendedor: item.seller,
                            linea: item.line
                        };
                    } else {
                        return {
                            success: false,
                            imei: item.imei,
                            producto: item.product,
                            precioVenta: item.price,
                            razon: 'No se encontró costo del producto'
                        };
                    }
                } catch (error) {
                    return {
                        success: false,
                        imei: item.imei,
                        producto: item.product,
                        precioVenta: item.price,
                        razon: `Error: ${error.message}`
                    };
                }
            });
            
            const batchResults = await Promise.all(promises);
            
            for (const result of batchResults) {
                if (result.success) {
                    equiposConCosto.push(result);
                    sumaVentas += result.precioVenta;
                    sumaCostos += result.costo;
                } else {
                    equiposSinCosto.push(result);
                }
            }
            
            procesados += batch.length;
            
            // Actualizar progreso
            btnCard.innerHTML = `
                <div class="stat-number">
                    <span class="loading-spinner-small" style="width:24px;height:24px;border-width:3px;"></span>
                </div>
                <div class="stat-label">Analizando markup...</div>
                <div style="font-size:0.65rem; margin-top:4px;">${procesados}/${totalEquipos} equipos</div>
            `;
        }
        
        // Calcular resultados finales
        const equiposConCostoCount = equiposConCosto.length;
        const utilidadTotal = sumaVentas - sumaCostos;
        const margenPromedio = sumaVentas > 0 ? (utilidadTotal / sumaVentas) * 100 : 0;
        
        // Guardar caché para posible uso futuro
        cachedMarkupResults = {
            fecha: cachedSalesData.date,
            equiposConCosto: equiposConCosto,
            equiposSinCosto: equiposSinCosto,
            totalEquipos: totalEquipos,
            equiposAnalizados: equiposConCostoCount,
            sumaVentas: sumaVentas,
            sumaCostos: sumaCostos,
            utilidadTotal: utilidadTotal,
            margenPromedio: margenPromedio
        };
        
        // Actualizar la tarjeta con los resultados
        let warningHtml = '';
        if (equiposSinCosto.length > 0) {
            const listaSinCosto = equiposSinCosto.map(e => `📱 ${e.producto.substring(0, 30)} (IMEI: ${e.imei})`).join('<br>');
            warningHtml = `
                <div style="font-size:0.6rem; margin-top:8px; color:#fcd34d; cursor:help; border-top:1px solid rgba(255,255,255,0.2); padding-top:6px;" 
                     title="Equipos sin costo: ${equiposSinCosto.length} de ${totalEquipos}">
                    ⚠️ ${equiposSinCosto.length} equipos sin costo
                </div>
            `;
        }
        
        btnCard.innerHTML = `
            <div class="stat-number" style="font-size:1.5rem;">${margenPromedio.toFixed(1)}%</div>
            <div class="stat-label">📊 Markup Promedio</div>
            <div style="font-size:0.7rem; margin-top:4px;">
                Utilidad: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(utilidadTotal)}
            </div>
            <div style="font-size:0.6rem; margin-top:2px; opacity:0.8;">
                Basado en ${equiposConCostoCount}/${totalEquipos} equipos
            </div>
            ${warningHtml}
        `;
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
        
        // Marcar como analizado
        markupAnalizadoEnConsultaActual = true;
        
        // Mostrar mensaje de éxito
        showInfo('contado', `✅ Análisis completado: ${margenPromedio.toFixed(1)}% de markup promedio (Utilidad: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(utilidadTotal)})`, false);
        
        // Si hay equipos sin costo, mostrar advertencia con tooltip
        if (equiposSinCosto.length > 0) {
            console.warn(`Equipos sin costo (${equiposSinCosto.length}):`, equiposSinCosto);
        }
        
    } catch (error) {
        console.error('Error en análisis de markup:', error);
        
        // Restaurar botón en caso de error
        btnCard.innerHTML = originalContent;
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
        
        showError('contado', `Error al analizar markup: ${error.message}`);
    }
}

// Función para resetear el estado del análisis (cuando se consulta una nueva fecha)
function resetMarkupAnalysis() {
    markupAnalizadoEnConsultaActual = false;
    cachedMarkupResults = null;
    
    const btnCard = document.getElementById('btnAnalyzeAllMarkup');
    if (btnCard) {
        btnCard.innerHTML = `
            <div class="stat-number">📊</div>
            <div class="stat-label">Analizar Markup</div>
            <div style="font-size:0.65rem; margin-top:4px;">General del día</div>
        `;
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
    }
}