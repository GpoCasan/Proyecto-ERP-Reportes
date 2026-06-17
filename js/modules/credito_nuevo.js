// ==================== MÓDULO: VENTAS A CRÉDITO (sale_type=credit) ====================
async function generateCreditReport() {
    const date = document.getElementById('creditoNuevoDate').value;
    if (!date) { showError('creditoNuevo', 'Seleccione fecha'); return; }
    
    const btn = document.getElementById('btnCreditoNuevo');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    try {
        const range = getDateRangeContado(date);
        if (!range) throw new Error('Error en fecha');
        
        // Consultar línea 4 y línea 5 con sale_type=credit
        const [res4, res5] = await Promise.all([
            fetch(`${CONFIG.API_SALES}?page=1&per_page=100&sale_type=credit&line_id=4&start_date=${range.start}&end_date=${range.end}`, 
                { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } }),
            fetch(`${CONFIG.API_SALES}?page=1&per_page=100&sale_type=credit&line_id=5&start_date=${range.start}&end_date=${range.end}`, 
                { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } })
        ]);
        
        const data4 = await res4.json();
        const data5 = await res5.json();
        const sales = [...(data4.data||[]), ...(data5.data||[])];
        
        // Extraer IMEIs y plataforma de crédito
        const map = new Map();
        const platformCount = new Map(); // Para contar ventas por plataforma
        const platformDownPayment = new Map(); // Para sumar enganches por plataforma
        const advisorByPlatform = new Map(); // Para almacenar ventas por asesor y plataforma
        
        // Almacenar información completa de cada venta (incluyendo enganche)
        const ventasInfo = []; // Array para guardar datos de cada venta (IMEI, productId, enganche, etc)
        
        for (let sale of sales) {
            // Obtener la plataforma de crédito (equipment_value)
            let creditPlatform = 'No especificada';
            if (sale.credit_provider && sale.credit_provider.equipment_value) {
                creditPlatform = sale.credit_provider.equipment_value;
            }
            
            // Calcular el enganche total de la venta (suma de todos los detalles con payment_type = "Enganche")
            let downPayment = 0;
            for (let detail of (sale.details || [])) {
                if (detail.payment_type === 'Enganche') {
                    const montoEnganche = parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;
                    downPayment += montoEnganche;
                }
            }
            
            // Obtener el asesor (con ID)
            const advisorId = sale.user?.id || null;
            const advisorName = sale.user?.name || 'No disponible';
            
            // Contar por plataforma (cada venta cuenta como 1)
            if (platformCount.has(creditPlatform)) {
                platformCount.set(creditPlatform, platformCount.get(creditPlatform) + 1);
            } else {
                platformCount.set(creditPlatform, 1);
            }
            
            // Sumar enganche por plataforma
            if (platformDownPayment.has(creditPlatform)) {
                platformDownPayment.set(creditPlatform, platformDownPayment.get(creditPlatform) + downPayment);
            } else {
                platformDownPayment.set(creditPlatform, downPayment);
            }
            
            // Contar por asesor y plataforma (usando ID como clave)
            const advisorKey = advisorId || advisorName;
            const platformKey = `${advisorKey}|${creditPlatform}`;
            if (!advisorByPlatform.has(platformKey)) {
                advisorByPlatform.set(platformKey, {
                    asesorId: advisorId,
                    asesor: advisorName,
                    plataforma: creditPlatform,
                    cantidad: 0
                });
            }
            advisorByPlatform.get(platformKey).cantidad++;
            
            for (let detail of (sale.details||[])) {
                for (let group of (detail.specification_groups||[])) {
                    for (let spec of (group.specification_details||[])) {
                        if (spec.specification?.name === 'IMEI' && isValidImei(spec.value) && !map.has(spec.value)) {
                            const isLibre = (detail.product?.name||'').toLowerCase().includes('libre');
                            map.set(spec.value, {
                                imei: spec.value,
                                product: detail.product?.name || 'Desconocido',
                                saleId: sale.id,
                                seller: sale.user?.name || 'No disponible',
                                sellerId: sale.user?.id || null,
                                line: isLibre ? 'Libre' : 'Telcel',
                                productId: detail.product?.id || null,
                                creditPlatform: creditPlatform,
                                downPayment: downPayment  // Guardar el enganche
                            });
                        }
                    }
                }
            }
            
            // Guardar información de la venta para análisis de enganche
            for (let detail of (sale.details||[])) {
                for (let group of (detail.specification_groups||[])) {
                    for (let spec of (group.specification_details||[])) {
                        if (spec.specification?.name === 'IMEI' && isValidImei(spec.value)) {
                            ventasInfo.push({
                                imei: spec.value,
                                productId: detail.product?.id || null,
                                productName: detail.product?.name || 'Desconocido',
                                downPayment: downPayment,
                                seller: sale.user?.name || 'No disponible',
                                sellerId: sale.user?.id || null,
                                creditPlatform: creditPlatform,
                                saleId: sale.id
                            });
                            break; // Solo tomar el primer IMEI por venta
                        }
                    }
                }
            }
        }
        
        const results = Array.from(map.values());
        window.cachedCreditData = { date: date, results: results, advisorByPlatform: advisorByPlatform, ventasInfo: ventasInfo };
        
        // Convertir platformCount a array y ordenar, incluyendo el total de enganche
        const platformStats = Array.from(platformCount.entries())
            .map(([name, count]) => ({ 
                name: name, 
                count: count,
                downPayment: platformDownPayment.get(name) || 0
            }))
            .sort((a, b) => b.count - a.count);
        
        // Resetear análisis de enganche para la nueva consulta
        resetEngancheAnalysis();
        
        // Mostrar estadísticas con el nuevo botón
        const statsHtml = `
            <button class="stat-card-btn" data-filter="all"><div class="stat-number">${results.length}</div><div class="stat-label">📱 Total IMEIs</div></button>
            <button class="stat-card-btn" data-filter="telcel"><div class="stat-number">${results.filter(r=>r.line==='Telcel').length}</div><div class="stat-label">📶 Telcel</div></button>
            <button class="stat-card-btn" data-filter="libre"><div class="stat-number">${results.filter(r=>r.line==='Libre').length}</div><div class="stat-label">🔓 Libre</div></button>
            <button class="stat-card-btn" data-filter="plataformas"><div class="stat-number">${platformStats.length}</div><div class="stat-label">🏦 Plataformas</div></button>
            <button class="stat-card-btn" id="btnAnalyzeAllEnganche" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                <div class="stat-number">📊</div>
                <div class="stat-label">Analizar Enganche</div>
                <div style="font-size:0.65rem; margin-top:4px;">% sobre costo</div>
            </button>
            <button class="stat-card-btn" id="btnAsesorSummaryCredit"><div class="stat-number">👥</div><div class="stat-label">Resumen Asesores</div></button>
        `;
        document.getElementById('creditoNuevoStats').innerHTML = statsHtml;
        document.getElementById('creditoNuevoStats').style.display = 'grid';
        
        // Renderizar tabla
        let html = `<div class="table-container"><table class="imei-table"><thead><tr>
            <th>#</th>
            <th>Venta</th>
            <th>Línea</th>
            <th>Plataforma Crédito</th>
            <th>IMEI</th>
            <th>Producto</th>
            <th>Vendedor</th>
            <th>Enganche</th>
        </tr></thead><tbody>`;
        
        results.forEach((item, i) => {
            html += `<tr>
                <td>${i+1}</td>
                <td><button class="badge-sale-id" onclick="openReceipt(${item.saleId})">📄 #${item.saleId}</button></td>
                <td><span class="badge-${item.line==='Telcel'?'telcel':'libre'}">📱 ${item.line}</span></td>
                <td><span class="badge-credit-platform">🏦 ${escapeHtml(item.creditPlatform)}</span></td>
                <td><code>${item.imei}</code></td>
                <td>${escapeHtml(item.product)}</div>
                <td>${escapeHtml(item.seller)}</div>
                <td>💰 $${item.downPayment.toFixed(2)}</div>
            </tr>`;
        });
        
        html += `</tbody>}</div>`;
        document.getElementById('creditoNuevoResults').innerHTML = html;
        document.getElementById('creditoNuevoResults').style.display = 'block';
        
        // Eventos de estadísticas (SOLO para los botones con data-filter)
        document.querySelectorAll('#creditoNuevoStats .stat-card-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                if (filter === 'plataformas') {
                    openCreditPlatformModal(platformStats);
                } else {
                    openCreditResumenModal(filter);
                }
            });
        });
        
        // Evento para el botón de resumen de asesores
        const btnAsesorSummary = document.getElementById('btnAsesorSummaryCredit');
        if (btnAsesorSummary) {
            btnAsesorSummary.addEventListener('click', (e) => {
                e.stopPropagation();
                openAsesorSummaryCreditModal();
            });
        }
        
        // Evento para el botón de análisis de enganche
        const btnAnalyzeAllEnganche = document.getElementById('btnAnalyzeAllEnganche');
        if (btnAnalyzeAllEnganche) {
            btnAnalyzeAllEnganche.addEventListener('click', (e) => {
                e.stopPropagation();
                analyzeAllEnganche();
            });
        }
        
    } catch(e) { 
        showError('creditoNuevo', e.message); 
    } finally { 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
    }
}

// Resumen por modelo (solo cantidades, sin precios)
function openCreditResumenModal(filter) {
    if (!window.cachedCreditData || !window.cachedCreditData.results) { 
        showError('creditoNuevo', 'Primero consulta las ventas'); 
        return; 
    }
    
    let filteredResults = window.cachedCreditData.results;
    let title = '📱 Resumen de Crédito (Todos)';
    if (filter === 'telcel') { 
        filteredResults = window.cachedCreditData.results.filter(r => r.line === 'Telcel'); 
        title = '📶 Resumen de Crédito TELCEL'; 
    } else if (filter === 'libre') { 
        filteredResults = window.cachedCreditData.results.filter(r => r.line === 'Libre'); 
        title = '🔓 Resumen de Crédito LIBRE'; 
    }
    
    // Agrupar por modelo de producto (solo cantidad)
    const productMap = new Map();
    for (let item of filteredResults) {
        const productName = item.product;
        if (productMap.has(productName)) {
            const existing = productMap.get(productName);
            existing.cantidad++;
        } else {
            productMap.set(productName, { nombre: productName, cantidad: 1 });
        }
    }
    
    const productos = Array.from(productMap.values()).sort((a,b) => a.nombre.localeCompare(b.nombre));
    const totalUnidades = productos.reduce((sum, p) => sum + p.cantidad, 0);
    
    let modal = document.getElementById('creditoResumenModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'creditoResumenModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 id="creditoResumenModalTitle">📊 Resumen de equipos a crédito</h3><span class="close-modal">&times;</span></div><div class="modal-body" id="creditoResumenModalBody"></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    document.getElementById('creditoResumenModalTitle').innerHTML = title;
    
    let tableHtml = `<div class="stats" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-number">${totalUnidades}</div><div class="stat-label">Total Equipos</div></div>
    </div>
    <div class="table-container">
        <table class="resumen-table">
            <thead><tr><th>#</th><th>Modelo / Producto</th><th>Cantidad</th></tr></thead>
            <tbody>`;
    
    productos.forEach((prod, idx) => { 
        tableHtml += `<tr>
            <td>${idx+1}</td>
            <td style="text-align:left">${escapeHtml(prod.nombre)}</div>
            <td style="text-align:center"><strong>${prod.cantidad}</strong></div>
        </tr>`;
    });
    
    tableHtml += `</tbody>}</div>`;
    document.getElementById('creditoResumenModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
}

// Modal de resumen por plataforma de crédito (CON COLUMNA DE ENGANCHE)
function openCreditPlatformModal(platformStats) {
    let modal = document.getElementById('creditoPlatformModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'creditoPlatformModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3>🏦 Ventas por Plataforma de Crédito</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body" id="creditoPlatformModalBody"></div>
                <div class="modal-footer">Plataformas detectadas en las ventas a crédito</div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    const totalVentas = platformStats.reduce((sum, p) => sum + p.count, 0);
    const totalEnganche = platformStats.reduce((sum, p) => sum + (p.downPayment || 0), 0);
    
    let tableHtml = `
        <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); flex: 1;">
                <div class="stat-number">${totalVentas}</div>
                <div class="stat-label">Total Ventas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); flex: 1;">
                <div class="stat-number">${platformStats.length}</div>
                <div class="stat-label">Plataformas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); flex: 1;">
                <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalEnganche)}</div>
                <div class="stat-label">💰 Total Enganche</div>
            </div>
        </div>
        <div class="table-container">
            <table class="resumen-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Plataforma</th>
                        <th>Ventas</th>
                        <th>💰 Total Enganche</th>
                        <th>%</th>
                    </tr>
                </thead>
                <tbody>`;
    
    platformStats.forEach((platform, idx) => {
        const percentage = totalVentas > 0 ? ((platform.count / totalVentas) * 100).toFixed(1) : 0;
        tableHtml += `<tr>
            <td>${idx+1}</td>
            <td style="text-align:left"><strong>${escapeHtml(platform.name)}</strong></div>
            <td style="text-align:center"><span class="badge-credit-platform" style="background:#7c3aed; color:white; padding:4px 12px;">${platform.count}</span></div>
            <td style="text-align:right; color: #f97316; font-weight: bold;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(platform.downPayment || 0)}</div>
            <td style="text-align:center;">
                <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                    <div style="width: 60px; background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 6px;">
                        <div style="width: ${percentage}%; background: linear-gradient(90deg, #7c3aed, #8b5cf6); height: 100%; border-radius: 20px;"></div>
                    </div>
                    <span style="font-size: 0.7rem; font-weight: 600;">${percentage}%</span>
                </div>
            </div>
        </tr>`;
    });
    
    tableHtml += `</tbody>}</div>`;
    document.getElementById('creditoPlatformModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
}

// Modal de resumen por asesor (ventas a crédito por plataforma) - AGRUPADO POR EQUIPOS
function openAsesorSummaryCreditModal() {
    if (!window.cachedCreditData || !window.cachedCreditData.results) { 
        showError('creditoNuevo', 'Primero consulta las ventas'); 
        return; 
    }
    
    const results = window.cachedCreditData.results;
    
    // Crear mapa para almacenar datos por asesor (usando ID)
    const ventasPorAsesor = new Map(); // key: sellerId o nombre, value: { id, nombre, totalEquipos, porPlataforma }
    
    for (let item of results) {
        const asesorId = item.sellerId;
        const asesorNombre = item.seller;
        const plataforma = item.creditPlatform;
        
        const key = asesorId || asesorNombre;
        
        if (!ventasPorAsesor.has(key)) {
            ventasPorAsesor.set(key, {
                id: asesorId,
                nombre: asesorNombre,
                totalEquipos: 0,
                porPlataforma: new Map()
            });
        }
        
        const asesorData = ventasPorAsesor.get(key);
        asesorData.totalEquipos++;
        
        if (asesorData.porPlataforma.has(plataforma)) {
            asesorData.porPlataforma.set(plataforma, asesorData.porPlataforma.get(plataforma) + 1);
        } else {
            asesorData.porPlataforma.set(plataforma, 1);
        }
    }
    
    // Obtener todas las plataformas únicas
    const todasPlataformas = new Set();
    for (let asesorData of ventasPorAsesor.values()) {
        for (let plataforma of asesorData.porPlataforma.keys()) {
            todasPlataformas.add(plataforma);
        }
    }
    const plataformasList = Array.from(todasPlataformas).sort();
    
    // Construir estructura por equipos
    const equipos = [];
    
    for (const [teamName, teamData] of Object.entries(TEAM_STRUCTURE)) {
        // Datos del líder
        let liderTotal = 0;
        let liderPorPlataforma = new Map();
        plataformasList.forEach(p => liderPorPlataforma.set(p, 0));
        
        if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
            const lider = ventasPorAsesor.get(teamData.liderId);
            liderTotal = lider.totalEquipos;
            for (let plataforma of plataformasList) {
                liderPorPlataforma.set(plataforma, lider.porPlataforma.get(plataforma) || 0);
            }
        } else {
            for (const [key, value] of ventasPorAsesor) {
                if (value.nombre === teamData.liderNombre) {
                    liderTotal = value.totalEquipos;
                    for (let plataforma of plataformasList) {
                        liderPorPlataforma.set(plataforma, value.porPlataforma.get(plataforma) || 0);
                    }
                    break;
                }
            }
        }
        
        // Datos de los miembros
        const miembros = [];
        let equipoTotal = liderTotal;
        let equipoPorPlataforma = new Map();
        plataformasList.forEach(p => equipoPorPlataforma.set(p, liderPorPlataforma.get(p)));
        
        for (const miembroId of teamData.miembros) {
            let miembroTotal = 0;
            let miembroPorPlataforma = new Map();
            plataformasList.forEach(p => miembroPorPlataforma.set(p, 0));
            let miembroInfo = null;
            
            if (ventasPorAsesor.has(miembroId)) {
                miembroInfo = ventasPorAsesor.get(miembroId);
                miembroTotal = miembroInfo.totalEquipos;
                for (let plataforma of plataformasList) {
                    miembroPorPlataforma.set(plataforma, miembroInfo.porPlataforma.get(plataforma) || 0);
                }
            } else {
                for (const [key, value] of ventasPorAsesor) {
                    if (value.id === miembroId) {
                        miembroTotal = value.totalEquipos;
                        miembroInfo = value;
                        for (let plataforma of plataformasList) {
                            miembroPorPlataforma.set(plataforma, value.porPlataforma.get(plataforma) || 0);
                        }
                        break;
                    }
                }
            }
            
            if (miembroTotal > 0 && miembroInfo) {
                miembros.push({
                    nombre: miembroInfo.nombre,
                    total: miembroTotal,
                    porPlataforma: miembroPorPlataforma
                });
                equipoTotal += miembroTotal;
                for (let plataforma of plataformasList) {
                    equipoPorPlataforma.set(plataforma, equipoPorPlataforma.get(plataforma) + miembroPorPlataforma.get(plataforma));
                }
            }
        }
        
        miembros.sort((a, b) => b.total - a.total);
        
        if (equipoTotal > 0) {
            equipos.push({
                nombre: teamName,
                liderNombre: teamData.liderNombre,
                liderTotal: liderTotal,
                liderPorPlataforma: liderPorPlataforma,
                miembros: miembros,
                equipoTotal: equipoTotal,
                equipoPorPlataforma: equipoPorPlataforma
            });
        }
    }
    
    // Filtrar equipos con al menos una venta
    equipos.sort((a, b) => b.equipoTotal - a.equipoTotal);
    
    const totalGeneral = equipos.reduce((sum, e) => sum + e.equipoTotal, 0);
    
    // Crear modal
    let modal = document.getElementById('asesorSummaryCreditModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'asesorSummaryCreditModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1000px;">
                <div class="modal-header">
                    <h3>👥 Resumen por Equipo - Ventas a Crédito</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                    <button id="exportCreditExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>
                </div>
                <div class="modal-body" id="asesorSummaryCreditModalBody"></div>
                <div class="modal-footer">
                    Ventas a crédito | Solo cantidades de equipos
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    // Generar cabecera de columnas
    let headerColumns = `<th>#</th><th>Equipo / Asesor</th><th>Total</th>`;
    for (let plataforma of plataformasList) {
        headerColumns += `<th style="background: #7c3aed; color: white;">🏦 ${escapeHtml(plataforma.substring(0, 15))}</th>`;
    }
    
    let tableHtml = `
        <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
            <div class="stat-card" style="background: #7c3aed; flex: 1;">
                <div class="stat-number">${equipos.length}</div>
                <div class="stat-label">👥 Equipos con ventas</div>
            </div>
            <div class="stat-card" style="background: #6d28d9; flex: 1;">
                <div class="stat-number">${totalGeneral}</div>
                <div class="stat-label">📱 Total Equipos</div>
            </div>
        </div>
        
        <div class="table-container" style="max-height: 500px; overflow-y: auto;">
            <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                <thead style="position: sticky; top: 0; background: #f8f9fa;">
                    <tr>${headerColumns}</tr>
                </thead>
                <tbody>
    `;
    
    let index = 1;
    for (const equipo of equipos) {
        // Fila del equipo
        let equipoRow = `<tr style="background-color: #f3e8ff; border-top: 2px solid #7c3aed;">
            <td style="padding: 8px; text-align: center; font-weight: bold;">${index}</div>
            <td style="padding: 8px; text-align: left; font-weight: bold; color: #7c3aed;">📁 ${equipo.nombre}</div>
            <td style="padding: 8px; text-align: center; font-weight: bold;">${equipo.equipoTotal}</div>`;
        
        for (let plataforma of plataformasList) {
            equipoRow += `<td style="padding: 8px; text-align: center; font-weight: bold;">${equipo.equipoPorPlataforma.get(plataforma)}</div>`;
        }
        equipoRow += `</tr>`;
        tableHtml += equipoRow;
        index++;
        
        // Fila del líder
        let liderRow = `<tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; text-align: center;"></div>
            <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">👑 ${equipo.liderNombre}</div>
            <td style="padding: 6px 8px; text-align: center; ${equipo.liderTotal === 0 ? 'color: #94a3b8;' : 'font-weight: bold;'}">${equipo.liderTotal}</div>`;
        
        for (let plataforma of plataformasList) {
            liderRow += `<td style="padding: 6px 8px; text-align: center;">${equipo.liderPorPlataforma.get(plataforma)}</div>`;
        }
        liderRow += `</tr>`;
        tableHtml += liderRow;
        
        // Filas de los miembros
        for (const miembro of equipo.miembros) {
            let miembroRow = `<tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; text-align: center;"></div>
                <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">└─ ${escapeHtml(miembro.nombre)}</div>
                <td style="padding: 6px 8px; text-align: center;">${miembro.total}</div>`;
            
            for (let plataforma of plataformasList) {
                miembroRow += `<td style="padding: 6px 8px; text-align: center;">${miembro.porPlataforma.get(plataforma)}</div>`;
            }
            miembroRow += `</tr>`;
            tableHtml += miembroRow;
        }
    }
    
    tableHtml += `
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('asesorSummaryCreditModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
    
    // Event listener para exportar a Excel
    const exportBtn = document.getElementById('exportCreditExcelBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportCreditSummaryToExcel(equipos, plataformasList));
    }
}

// Función para exportar a Excel
function exportCreditSummaryToExcel(equipos, plataformasList) {
    // Preparar datos para Excel
    const excelData = [
        ['Resumen por Equipo - Ventas a Crédito'],
        [],
        ['#', 'Equipo / Asesor', 'Total', ...plataformasList.map(p => p)]
    ];
    
    for (const equipo of equipos) {
        // Fila del líder
        const liderRow = ['Lider', `${equipo.liderNombre}`, equipo.liderTotal];
        for (let plataforma of plataformasList) {
            liderRow.push(equipo.liderPorPlataforma.get(plataforma));
        }
        excelData.push(liderRow);
        
        // Filas de los miembros
        for (const miembro of equipo.miembros) {
            const miembroRow = ['', `${miembro.nombre}`, miembro.total];
            for (let plataforma of plataformasList) {
                miembroRow.push(miembro.porPlataforma.get(plataforma));
            }
            excelData.push(miembroRow);
        }
        
        // Línea separadora
        excelData.push(['', '', '', ...plataformasList.map(() => '')]);
    }
    
    // Agregar totales generales
    const totalGeneral = equipos.reduce((sum, e) => sum + e.equipoTotal, 0);
    const totalesPorPlataforma = new Map();
    plataformasList.forEach(p => totalesPorPlataforma.set(p, 0));
    
    for (const equipo of equipos) {
        for (let plataforma of plataformasList) {
            totalesPorPlataforma.set(plataforma, totalesPorPlataforma.get(plataforma) + equipo.equipoPorPlataforma.get(plataforma));
        }
    }
    
    const totalRow = ['', 'TOTAL GENERAL:', totalGeneral];
    for (let plataforma of plataformasList) {
        totalRow.push(totalesPorPlataforma.get(plataforma));
    }
    excelData.push(totalRow);
    
    // Llamar a la función global de exportación
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `resumen_credito_${window.cachedCreditData.date}`);
    } else {
        console.error('La función exportToExcel no está disponible');
        alert('Error: No se pudo exportar. La función de exportación no está disponible.');
    }
}

// ==================== ANÁLISIS DE ENGANCHE PARA CRÉDITO NUEVO ====================

// Variable para almacenar si ya se analizó en la consulta actual
let engancheAnalizadoEnConsultaActual = false;
let cachedEngancheResults = null;

// Función principal para analizar enganche de todos los equipos a crédito
async function analyzeAllEnganche() {
    // Verificar que existan datos de ventas
    if (!window.cachedCreditData || !window.cachedCreditData.ventasInfo || window.cachedCreditData.ventasInfo.length === 0) {
        showError('creditoNuevo', 'Primero consulta las ventas del día');
        return;
    }
    
    // Verificar si ya se analizó en esta consulta
    if (engancheAnalizadoEnConsultaActual) {
        showInfo('creditoNuevo', '⚠️ Ya se analizó el enganche de esta consulta. Consulta otra fecha para volver a analizar.', true);
        return;
    }
    
    const btnCard = document.getElementById('btnAnalyzeAllEnganche');
    if (!btnCard) return;
    
    // Guardar contenido original
    const originalContent = btnCard.innerHTML;
    
    // Cambiar a modo "analizando"
    btnCard.innerHTML = `
        <div class="stat-number">
            <span class="loading-spinner-small" style="width:24px;height:24px;border-width:3px;"></span>
        </div>
        <div class="stat-label">Analizando enganche...</div>
        <div style="font-size:0.65rem; margin-top:4px;">Obteniendo costos</div>
    `;
    btnCard.style.cursor = 'wait';
    btnCard.disabled = true;
    
    try {
        const ventasInfo = window.cachedCreditData.ventasInfo;
        const totalVentas = ventasInfo.length;
        
        // Arrays para almacenar resultados
        const equiposConCosto = [];
        const equiposSinCosto = [];
        let sumaEnganches = 0;
        let sumaCostos = 0;
        
        // Procesar cada equipo en paralelo con límite de concurrencia
        const concurrencyLimit = 10;
        const batches = [];
        
        for (let i = 0; i < ventasInfo.length; i += concurrencyLimit) {
            batches.push(ventasInfo.slice(i, i + concurrencyLimit));
        }
        
        let procesados = 0;
        
        for (const batch of batches) {
            const promises = batch.map(async (item) => {
                try {
                    const costData = await fetchProductCost(item.productId);
                    
                    if (costData && costData.costoConIva > 0) {
                        const costoConIva = costData.costoConIva;
                        const enganche = item.downPayment;
                        const porcentajeEnganche = costoConIva > 0 ? (enganche / costoConIva) * 100 : 0;
                        
                        return {
                            success: true,
                            imei: item.imei,
                            producto: item.productName,
                            costo: costoConIva,
                            enganche: enganche,
                            porcentaje: porcentajeEnganche,
                            vendedor: item.seller,
                            plataforma: item.creditPlatform
                        };
                    } else {
                        return {
                            success: false,
                            imei: item.imei,
                            producto: item.productName,
                            enganche: item.downPayment,
                            razon: 'No se encontró costo del producto'
                        };
                    }
                } catch (error) {
                    return {
                        success: false,
                        imei: item.imei,
                        producto: item.productName,
                        enganche: item.downPayment,
                        razon: `Error: ${error.message}`
                    };
                }
            });
            
            const batchResults = await Promise.all(promises);
            
            for (const result of batchResults) {
                if (result.success) {
                    equiposConCosto.push(result);
                    sumaEnganches += result.enganche;
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
                <div class="stat-label">Analizando enganche...</div>
                <div style="font-size:0.65rem; margin-top:4px;">${procesados}/${totalVentas} equipos</div>
            `;
        }
        
        // Calcular resultados finales
        const equiposAnalizados = equiposConCosto.length;
        const porcentajeEnganchePromedio = sumaCostos > 0 ? (sumaEnganches / sumaCostos) * 100 : 0;
        
        // Guardar caché para posible uso futuro
        cachedEngancheResults = {
            fecha: window.cachedCreditData.date,
            equiposConCosto: equiposConCosto,
            equiposSinCosto: equiposSinCosto,
            totalVentas: totalVentas,
            equiposAnalizados: equiposAnalizados,
            sumaEnganches: sumaEnganches,
            sumaCostos: sumaCostos,
            porcentajePromedio: porcentajeEnganchePromedio
        };
        
        // Actualizar la tarjeta con los resultados
        let warningHtml = '';
        if (equiposSinCosto.length > 0) {
            const listaSinCosto = equiposSinCosto.map(e => `📱 ${e.producto.substring(0, 30)} (IMEI: ${e.imei})`).join('<br>');
            warningHtml = `
                <div style="font-size:0.6rem; margin-top:8px; color:#fcd34d; cursor:help; border-top:1px solid rgba(255,255,255,0.2); padding-top:6px;" 
                     title="Equipos sin costo: ${equiposSinCosto.length} de ${totalVentas}">
                    ⚠️ ${equiposSinCosto.length} equipos sin costo
                </div>
            `;
        }
        
        btnCard.innerHTML = `
            <div class="stat-number" style="font-size:1.5rem;">${porcentajeEnganchePromedio.toFixed(1)}%</div>
            <div class="stat-label">📊 Enganche Promedio</div>
            <div style="font-size:0.7rem; margin-top:4px;">
                Total Enganche: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(sumaEnganches)}
            </div>
            <div style="font-size:0.6rem; margin-top:2px; opacity:0.8;">
                Basado en ${equiposAnalizados}/${totalVentas} equipos
            </div>
            ${warningHtml}
        `;
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
        
        // Marcar como analizado
        engancheAnalizadoEnConsultaActual = true;
        
        // Mostrar mensaje de éxito
        showInfo('creditoNuevo', `✅ Análisis completado: ${porcentajeEnganchePromedio.toFixed(1)}% de enganche promedio sobre costo (Total enganche: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(sumaEnganches)})`, false);
        
        // Si hay equipos sin costo, mostrar advertencia con tooltip
        if (equiposSinCosto.length > 0) {
            console.warn(`Equipos sin costo (${equiposSinCosto.length}):`, equiposSinCosto);
        }
        
    } catch (error) {
        console.error('Error en análisis de enganche:', error);
        
        // Restaurar botón en caso de error
        btnCard.innerHTML = originalContent;
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
        
        showError('creditoNuevo', `Error al analizar enganche: ${error.message}`);
    }
}

// Función para resetear el estado del análisis (cuando se consulta una nueva fecha)
function resetEngancheAnalysis() {
    engancheAnalizadoEnConsultaActual = false;
    cachedEngancheResults = null;
    
    const btnCard = document.getElementById('btnAnalyzeAllEnganche');
    if (btnCard) {
        btnCard.innerHTML = `
            <div class="stat-number">📊</div>
            <div class="stat-label">Analizar Enganche</div>
            <div style="font-size:0.65rem; margin-top:4px;">% sobre costo</div>
        `;
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
    }
}