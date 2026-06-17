// ==================== MÓDULO: EXISTENCIAS (RANKING DE VENTAS + INVENTARIO) ====================

// Variable global para almacenar las ventas completas por modelo y sucursal
let cachedSalesByModel = new Map(); // key: modelo, value: Map de sucursal -> { contado, credito, total }
// Variable para almacenar ventas por asesor por sucursal
let cachedSalesByAdvisor = new Map(); // key: modelo|sucursal, value: Map de asesor -> { contado, credito, total }

// Función para obtener inventario TOTAL de un producto (sumando todas las páginas)
async function fetchTotalInventory(productId) {
    if (!productId) return 0;
    
    try {
        let totalQuantity = 0;
        let currentPage = 1;
        let lastPage = 1;
        
        do {
            const url = `${CONFIG.API_STOCK}?page=${currentPage}&per_page=100&total=0&product_id=${productId}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });
            
            if (!response.ok) {
                console.warn(`Error consultando inventario para product_id ${productId}: ${response.status}`);
                break;
            }
            
            const data = await response.json();
            const stockItems = data.data || [];
            
            // Sumar cantidades de todos los items en esta página
            for (const item of stockItems) {
                totalQuantity += (item.quantity || 0) + (item.transfer_quantity || 0);
            }
            
            lastPage = data.last_page || data.meta?.last_page || currentPage;
            currentPage++;
            
            // Pequeña pausa para no saturar
            if (currentPage <= lastPage) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
        } while (currentPage <= lastPage);
        
        console.log(`📦 Producto ID ${productId}: Inventario total = ${totalQuantity}`);
        return totalQuantity;
        
    } catch (error) {
        console.error(`Error en consulta de inventario para ${productId}:`, error);
        return 0;
    }
}

async function searchExistencias() {
    const selectedDate = document.getElementById('existenciasDate').value;
    
    if (!selectedDate) {
        showError('existencias', 'Seleccione una fecha');
        return;
    }
    
    // Formatear fechas con el rango horario (de 6:00 AM a 6:00 AM del día siguiente)
    const range = getDateRangeContado(selectedDate);
    if (!range) throw new Error('Error en fecha');
    
    const startDateTime = range.start;
    const endDateTime = range.end;
    
    const btn = document.getElementById('searchExistenciasBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando ranking... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    document.getElementById('existenciasResults').style.display = 'none';
    document.getElementById('existenciasErrorAlert').style.display = 'none';
    document.getElementById('existenciasInfoAlert').style.display = 'none';
    
    try {
        // Consultar SOLO líneas 4 y 5
        const [resLine4, resLine5] = await Promise.all([
            fetch(`${CONFIG.API_SALES}?page=1&per_page=100&total=0&start_date=${startDateTime}&end_date=${endDateTime}&line_id=4`, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            }),
            fetch(`${CONFIG.API_SALES}?page=1&per_page=100&total=0&start_date=${startDateTime}&end_date=${endDateTime}&line_id=5`, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            })
        ]);
        
        if (!resLine4.ok) throw new Error(`Error en línea 4: ${resLine4.status}`);
        if (!resLine5.ok) throw new Error(`Error en línea 5: ${resLine5.status}`);
        
        const dataLine4 = await resLine4.json();
        const dataLine5 = await resLine5.json();
        
        // Solo ventas de líneas 4 y 5
        let allSales = [...(dataLine4.data || []), ...(dataLine5.data || [])];
        
        // Verificar si hay más páginas en línea 4
        const lastPage4 = dataLine4.last_page || dataLine4.meta?.last_page || 1;
        if (lastPage4 > 1) {
            for (let page = 2; page <= lastPage4; page++) {
                const response = await fetch(`${CONFIG.API_SALES}?page=${page}&per_page=100&total=0&start_date=${startDateTime}&end_date=${endDateTime}&line_id=4`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    allSales.push(...(data.data || []));
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Verificar si hay más páginas en línea 5
        const lastPage5 = dataLine5.last_page || dataLine5.meta?.last_page || 1;
        if (lastPage5 > 1) {
            for (let page = 2; page <= lastPage5; page++) {
                const response = await fetch(`${CONFIG.API_SALES}?page=${page}&per_page=100&total=0&start_date=${startDateTime}&end_date=${endDateTime}&line_id=5`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    allSales.push(...(data.data || []));
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`Total de ventas procesadas (solo líneas 4 y 5): ${allSales.length}`);
        
        // Procesar ventas para contar modelos, obtener product_id, y ventas por sucursal
        const modelStats = new Map(); // key: nombre del modelo, value: { contado, credito, total, product_id, line_id }
        cachedSalesByModel.clear(); // Limpiar cache anterior
        cachedSalesByAdvisor.clear(); // Limpiar cache de asesores
        
        for (const sale of allSales) {
            const isCredit = sale.is_credit === true;
            // Obtener nombre de la sucursal
            const branchName = sale.warehouse?.branch?.name || sale.branch_name || 'Sucursal no especificada';
            // Obtener nombre del asesor/vendedor
            const advisorName = sale.user?.name || sale.seller_name || sale.vendor || 'No especificado';
            
            for (const detail of (sale.details || [])) {
                const productName = detail.product?.name;
                const productLineId = detail.product?.line_id;
                const productId = detail.product?.id;
                
                // SOLO incluir productos que sean de línea 4 o 5
                if (!productName) continue;
                if (productLineId !== 4 && productLineId !== 5) continue;
                
                const quantity = detail.quantity || 1;
                
                // Estadísticas por modelo
                if (!modelStats.has(productName)) {
                    modelStats.set(productName, {
                        modelo: productName,
                        contado: 0,
                        credito: 0,
                        total: 0,
                        product_id: productId,
                        line_id: productLineId,
                        inventario_total: 0
                    });
                }
                
                const stat = modelStats.get(productName);
                if (isCredit) {
                    stat.credito += quantity;
                } else {
                    stat.contado += quantity;
                }
                stat.total += quantity;
                if (!stat.product_id && productId) stat.product_id = productId;
                
                // Ventas por sucursal
                const branchKey = productName;
                if (!cachedSalesByModel.has(branchKey)) {
                    cachedSalesByModel.set(branchKey, new Map());
                }
                
                const branchMap = cachedSalesByModel.get(branchKey);
                if (!branchMap.has(branchName)) {
                    branchMap.set(branchName, { contado: 0, credito: 0, total: 0 });
                }
                
                const branchStat = branchMap.get(branchName);
                if (isCredit) {
                    branchStat.credito += quantity;
                } else {
                    branchStat.contado += quantity;
                }
                branchStat.total += quantity;
                
                // Ventas por asesor dentro de cada sucursal
                const advisorKey = `${productName}|${branchName}`;
                if (!cachedSalesByAdvisor.has(advisorKey)) {
                    cachedSalesByAdvisor.set(advisorKey, new Map());
                }
                
                const advisorMap = cachedSalesByAdvisor.get(advisorKey);
                if (!advisorMap.has(advisorName)) {
                    advisorMap.set(advisorName, { contado: 0, credito: 0, total: 0 });
                }
                
                const advisorStat = advisorMap.get(advisorName);
                if (isCredit) {
                    advisorStat.credito += quantity;
                } else {
                    advisorStat.contado += quantity;
                }
                advisorStat.total += quantity;
            }
        }
        
        // Convertir a array y ordenar por total (mayor a menor)
        const ranking = Array.from(modelStats.values());
        ranking.sort((a, b) => b.total - a.total);
        
        // Tomar solo los primeros 15
        const top15 = ranking.slice(0, 15);
        
        // ==================== CONSULTAR INVENTARIO REAL PARA CADA MODELO ====================
        btn.innerHTML = 'Consultando inventario de los 15 modelos... <span class="loading-spinner"></span>';
        
        // Crear promesas para consultar inventario de cada producto (AHORA SÍ suma total)
        const inventoryPromises = top15.map(async (item) => {
            if (!item.product_id) {
                console.warn(`No se encontró product_id para: ${item.modelo}`);
                return { modelo: item.modelo, inventario: 0, success: false };
            }
            
            const inventarioTotal = await fetchTotalInventory(item.product_id);
            return { 
                modelo: item.modelo, 
                inventario: inventarioTotal, 
                success: true 
            };
        });
        
        // Ejecutar todas las consultas de inventario en paralelo
        const inventoryResults = await Promise.all(inventoryPromises);
        
        // Mapear resultados de inventario a los modelos
        const inventoryMap = new Map();
        for (const inv of inventoryResults) {
            inventoryMap.set(inv.modelo, inv.inventario);
        }
        
        // Asignar inventario a cada item del top15
        for (const item of top15) {
            item.inventario_total = inventoryMap.get(item.modelo) || 0;
        }
        
        // Calcular totales generales (solo líneas 4 y 5)
        const totalEquipos = ranking.reduce((sum, item) => sum + item.total, 0);
        const totalContado = ranking.reduce((sum, item) => sum + item.contado, 0);
        const totalCredito = ranking.reduce((sum, item) => sum + item.credito, 0);
        const modelosUnicos = ranking.length;
        
        // Calcular porcentajes de contado y crédito
        const porcentajeContado = totalEquipos > 0 ? ((totalContado / totalEquipos) * 100).toFixed(1) : 0;
        const porcentajeCredito = totalEquipos > 0 ? ((totalCredito / totalEquipos) * 100).toFixed(1) : 0;
        
        // Mostrar información de la fecha consultada
        const fechaTexto = `${formatDate(selectedDate)} (desde las 6:00 AM hasta las 6:00 AM del día siguiente)`;
        
        // Barra visual de proporción contado/crédito
        const barraContadoWidth = porcentajeContado;
        const barraCreditoWidth = porcentajeCredito;
        
        const barraProporcionHtml = `
            <div style="margin-bottom: 20px; background: #f8fafc; border-radius: 12px; padding: 12px 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.75rem;">
                    <span style="color: #059669;">💰 Contado (${porcentajeContado}%)</span>
                    <span style="color: #ea580c;">💳 Crédito (${porcentajeCredito}%)</span>
                </div>
                <div style="display: flex; height: 24px; border-radius: 12px; overflow: hidden;">
                    <div style="width: ${barraContadoWidth}%; background: linear-gradient(90deg, #059669, #10b981); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.7rem; font-weight: bold;">
                        ${barraContadoWidth > 8 ? `${porcentajeContado}%` : ''}
                    </div>
                    <div style="width: ${barraCreditoWidth}%; background: linear-gradient(90deg, #ea580c, #f97316); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.7rem; font-weight: bold;">
                        ${barraCreditoWidth > 8 ? `${porcentajeCredito}%` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Generar HTML de estadísticas
        const statsHtml = `
            <div class="stats">
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number">${totalEquipos}</div>
                    <div class="stat-label">📱 Total Equipos Vendidos</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                    <div class="stat-number">${totalContado}</div>
                    <div class="stat-label">💰 Contado</div>
                    <div style="font-size: 0.7rem; margin-top: 4px; opacity: 0.9;">${porcentajeContado}% del total</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);">
                    <div class="stat-number">${totalCredito}</div>
                    <div class="stat-label">💳 Crédito</div>
                    <div style="font-size: 0.7rem; margin-top: 4px; opacity: 0.9;">${porcentajeCredito}% del total</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number">${modelosUnicos}</div>
                    <div class="stat-label">📊 Modelos Únicos</div>
                </div>
            </div>
            <div class="alert alert-info" style="margin-bottom: 20px;">
                📅 Período consultado: <strong>${fechaTexto}</strong><br>
                🏆 Mostrando los <strong>${top15.length}</strong> modelos más vendidos (solo líneas 4 y 5 - Equipos)<br>
                📦 El inventario mostrado es la <strong>suma total de existencias</strong> (en almacén + en tránsito) de cada modelo en todas las sucursales<br>
                💡 <strong>Haz clic en cualquier fila</strong> para ver el desglose de ventas por sucursal<br>
                👥 <strong>En el modal, pasa el mouse sobre cualquier sucursal</strong> para ver qué asesores vendieron y cuánto
            </div>
        `;
        
        if (totalEquipos === 0) {
            document.getElementById('existenciasResults').innerHTML = statsHtml + `
                <div class="alert alert-warning" style="margin-top: 20px;">
                    ⚠️ No se encontraron ventas de equipos (líneas 4 y 5) para el período ${fechaTexto}
                </div>
            `;
            document.getElementById('existenciasResults').style.display = 'block';
            showInfo('existencias', `⚠️ No se encontraron ventas de equipos para el período ${fechaTexto}`, true);
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        
        // Generar tabla de ranking CON INVENTARIO REAL
        let tableHtml = `
            <div class="table-container">
                <table class="ranking-table" id="rankingTable">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Modelo / Producto</th>
                            <th style="text-align: center;">💰 Contado</th>
                            <th style="text-align: center;">💳 Crédito</th>
                            <th style="text-align: center;">📱 Vendidos</th>
                            <th style="text-align: center;">📦 Inventario Total</th>
                            <th style="text-align: center;">📊 % Participación</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        top15.forEach((item, index) => {
            const porcentaje = totalEquipos > 0 ? ((item.total / totalEquipos) * 100).toFixed(1) : 0;
            
            // Determinar si el modelo es de línea Libre (5) o Telcel (4)
            let lineBadge = '';
            if (item.line_id === 5) {
                lineBadge = '<span class="badge-libre" style="font-size: 0.65rem; margin-left: 6px;">LIBRE</span>';
            } else if (item.line_id === 4) {
                lineBadge = '<span class="badge-telcel" style="font-size: 0.65rem; margin-left: 6px;">TELCEL</span>';
            }
            
            // Color para el inventario según la cantidad
            let inventoryColor = '';
            let inventoryTooltip = '';
            if (item.inventario_total === 0) {
                inventoryColor = 'color: #dc2626; font-weight: bold;';
                inventoryTooltip = 'title="¡Agotado! No hay stock de este modelo"';
            } else if (item.inventario_total < 5) {
                inventoryColor = 'color: #d97706; font-weight: bold;';
                inventoryTooltip = 'title="Stock bajo"';
            } else {
                inventoryColor = 'color: #059669; font-weight: bold;';
                inventoryTooltip = 'title="Stock disponible"';
            }
            
            // Agregar clase 'clickable-row' y data-modelo para identificar la fila
            tableHtml += `
                <tr class="clickable-row" data-modelo="${escapeHtml(item.modelo).replace(/"/g, '&quot;')}" style="cursor: pointer;">
                    <td style="text-align: center; font-weight: bold; width: 50px;">${index + 1}</div>
                    <td style="text-align: left;">
                        ${escapeHtml(item.modelo)}
                        ${lineBadge}
                    </div>
                    <td style="text-align: center; color: #059669; font-weight: 600;">${item.contado}</div>
                    <td style="text-align: center; color: #ea580c; font-weight: 600;">${item.credito}</div>
                    <td style="text-align: center; font-weight: bold; background: #f0f9ff;">${item.total}</div>
                    <td style="text-align: center; ${inventoryColor}" ${inventoryTooltip}>
                        ${item.inventario_total}
                    </div>
                    <td style="text-align: center;">
                        <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                            <div style="width: 80px; background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 8px;">
                                <div style="width: ${porcentaje}%; background: linear-gradient(90deg, #f97316, #ea580c); height: 100%; border-radius: 20px;"></div>
                            </div>
                            <span style="font-size: 0.8rem; font-weight: 600;">${porcentaje}%</span>
                        </div>
                    </div>
                </tr>
            `;
        });
        
        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;
        
        // Gráfica de distribución de ventas
        const maxTotal = top15[0].total;
        
        let chartHtml = `
            <div style="margin-top: 30px; margin-bottom: 20px;">
                <h4 style="color: #1e40af; margin-bottom: 16px; border-left: 4px solid #f97316; padding-left: 12px;">📊 Distribución de Ventas por Modelo</h4>
                <div style="background: #f8fafc; border-radius: 16px; padding: 20px;">
        `;
        
        top15.forEach((item, index) => {
            const barWidth = (item.total / maxTotal) * 100;
            const barColor = item.line_id === 5 ? '#10b981' : '#3b82f6';
            
            chartHtml += `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                        <span style="font-weight: 600; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.modelo)}">
                            ${index + 1}. ${escapeHtml(item.modelo.substring(0, 45))}${item.modelo.length > 45 ? '...' : ''}
                        </span>
                        <span style="font-weight: bold; color: ${barColor};">${item.total} unidades</span>
                    </div>
                    <div style="background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 28px;">
                        <div style="width: ${barWidth}%; background: linear-gradient(90deg, ${barColor}, ${barColor === '#10b981' ? '#34d399' : '#60a5fa'}); height: 100%; border-radius: 20px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: white; font-size: 0.7rem; font-weight: bold;">
                            ${barWidth > 15 ? `${item.total}` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        chartHtml += `
                    <div style="margin-top: 12px; display: flex; gap: 20px; justify-content: center; font-size: 0.7rem;">
                        <div><span style="display: inline-block; width: 12px; height: 12px; background: #3b82f6; border-radius: 2px; margin-right: 6px;"></span> Línea 4 (Telcel)</div>
                        <div><span style="display: inline-block; width: 12px; height: 12px; background: #10b981; border-radius: 2px; margin-right: 6px;"></span> Línea 5 (Libre)</div>
                    </div>
                </div>
            </div>
        `;
        
        // Mostrar todo
        document.getElementById('existenciasResults').innerHTML = statsHtml + barraProporcionHtml + tableHtml + chartHtml;
        document.getElementById('existenciasResults').style.display = 'block';
        
        // Agregar event listeners a las filas clickeables
        document.querySelectorAll('.clickable-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Evitar que el click en el tooltip o en elementos internos cause problemas
                if (e.target.closest('.badge-libre') || e.target.closest('.badge-telcel')) {
                    return;
                }
                const modelo = row.getAttribute('data-modelo');
                openBranchSalesModal(modelo);
            });
        });
        
        showInfo('existencias', `✅ Ranking generado: ${totalEquipos} equipos vendidos, inventario real consultado para los ${top15.length} modelos.`, false);
        
    } catch (error) {
        console.error('Error en Existencias:', error);
        showError('existencias', `Error al generar ranking: ${error.message}`);
        document.getElementById('existenciasResults').style.display = 'none';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== MODAL DE VENTAS POR SUCURSAL ====================
function openBranchSalesModal(modelo) {
    const branchMap = cachedSalesByModel.get(modelo);
    
    if (!branchMap || branchMap.size === 0) {
        showError('existencias', `No hay información de ventas por sucursal para: ${modelo}`);
        return;
    }
    
    // Convertir el Map a array y ordenar por total de ventas (mayor a menor)
    const branches = Array.from(branchMap.entries())
        .map(([branchName, stats]) => ({
            sucursal: branchName,
            contado: stats.contado,
            credito: stats.credito,
            total: stats.total
        }))
        .sort((a, b) => b.total - a.total);
    
    const totalGeneral = branches.reduce((sum, b) => sum + b.total, 0);
    const totalContado = branches.reduce((sum, b) => sum + b.contado, 0);
    const totalCredito = branches.reduce((sum, b) => sum + b.credito, 0);
    
    // Calcular porcentajes para el modal
    const porcentajeContado = totalGeneral > 0 ? ((totalContado / totalGeneral) * 100).toFixed(1) : 0;
    const porcentajeCredito = totalGeneral > 0 ? ((totalCredito / totalGeneral) * 100).toFixed(1) : 0;
    
    // Crear o obtener el modal
    let modal = document.getElementById('branchSalesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'branchSalesModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3 id="branchModalTitle">📊 Ventas por Sucursal</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body" id="branchModalBody" style="max-height: 70vh; overflow-y: auto;">
                    <div class="loader-modal">
                        <div class="spinner-modal"></div>
                        <p>Cargando información...</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="closeBranchModalBtn" style="padding: 6px 16px;">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        const closeBtn = document.getElementById('closeBranchModalBtn');
        if (closeBtn) {
            closeBtn.onclick = () => modal.style.display = 'none';
        }
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    // Actualizar título del modal
    const titleElement = document.getElementById('branchModalTitle');
    if (titleElement) {
        titleElement.innerHTML = `📊 Ventas por Sucursal - ${escapeHtml(modelo)}`;
    }
    
    // Función para generar el tooltip HTML con los asesores
    const getAdvisorTooltip = (sucursal) => {
        const advisorKey = `${modelo}|${sucursal}`;
        const advisorMap = cachedSalesByAdvisor.get(advisorKey);
        
        if (!advisorMap || advisorMap.size === 0) {
            return 'No hay información de asesores';
        }
        
        // Convertir a array y ordenar por total (mayor a menor)
        const advisors = Array.from(advisorMap.entries())
            .map(([advisorName, stats]) => ({
                nombre: advisorName,
                contado: stats.contado,
                credito: stats.credito,
                total: stats.total
            }))
            .sort((a, b) => b.total - a.total);
        
        // Generar HTML del tooltip
        let tooltipHtml = '<div style="font-family: monospace; font-size: 11px; line-height: 1.4;">';
        tooltipHtml += '<div style="font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">👥 Desglose por Asesor:</div>';
        
        advisors.forEach(advisor => {
            tooltipHtml += `<div style="margin: 3px 0;">
                <strong>${escapeHtml(advisor.nombre)}</strong>: 
                <span style="color: #059669;">💰 ${advisor.contado}</span> | 
                <span style="color: #ea580c;">💳 ${advisor.credito}</span> | 
                <span style="font-weight: bold;">📱 ${advisor.total}</span>
            </div>`;
        });
        
        tooltipHtml += '</div>';
        return tooltipHtml;
    };
    
    // Barra visual de proporción para el modal
    const barraProporcionHtml = `
        <div style="margin-bottom: 20px; background: #f8fafc; border-radius: 12px; padding: 12px 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.75rem;">
                <span style="color: #059669;">💰 Contado (${porcentajeContado}%)</span>
                <span style="color: #ea580c;">💳 Crédito (${porcentajeCredito}%)</span>
            </div>
            <div style="display: flex; height: 24px; border-radius: 12px; overflow: hidden;">
                <div style="width: ${porcentajeContado}%; background: linear-gradient(90deg, #059669, #10b981); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.7rem; font-weight: bold;">
                    ${porcentajeContado > 8 ? `${porcentajeContado}%` : ''}
                </div>
                <div style="width: ${porcentajeCredito}%; background: linear-gradient(90deg, #ea580c, #f97316); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.7rem; font-weight: bold;">
                    ${porcentajeCredito > 8 ? `${porcentajeCredito}%` : ''}
                </div>
            </div>
        </div>
    `;
    
    // Generar HTML con la tabla de sucursales (con tooltips)
    let tableHtml = `
        <div class="stats" style="margin-bottom: 20px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <div class="stat-number">${branches.length}</div>
                <div class="stat-label">🏢 Sucursales con ventas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                <div class="stat-number">${totalContado}</div>
                <div class="stat-label">💰 Total Contado</div>
                <div style="font-size: 0.7rem; margin-top: 4px; opacity: 0.9;">${porcentajeContado}% del total</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);">
                <div class="stat-number">${totalCredito}</div>
                <div class="stat-label">💳 Total Crédito</div>
                <div style="font-size: 0.7rem; margin-top: 4px; opacity: 0.9;">${porcentajeCredito}% del total</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                <div class="stat-number">${totalGeneral}</div>
                <div class="stat-label">📱 Total Unidades</div>
            </div>
        </div>
        <div class="alert alert-info" style="margin-bottom: 16px;">
            💡 <strong>Pasa el mouse sobre cualquier sucursal</strong> para ver qué asesores vendieron y cuántas unidades
        </div>
        ${barraProporcionHtml}
        <div class="table-container">
            <table class="branch-sales-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Sucursal</th>
                        <th style="text-align: center;">💰 Contado</th>
                        <th style="text-align: center;">💳 Crédito</th>
                        <th style="text-align: center;">📱 Total</th>
                        <th style="text-align: center;">📊 %</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    branches.forEach((branch, index) => {
        const porcentaje = totalGeneral > 0 ? ((branch.total / totalGeneral) * 100).toFixed(1) : 0;
        const tooltipContent = getAdvisorTooltip(branch.sucursal);
        
        tableHtml += `
            <tr class="branch-hoverable" style="cursor: help;">
                <td style="text-align: center; font-weight: bold; width: 50px;">${index + 1}</div>
                <td style="text-align: left; font-weight: 600; position: relative;">
                    <span class="branch-name" data-tooltip="${escapeHtml(tooltipContent).replace(/"/g, '&quot;')}">
                        🏪 ${escapeHtml(branch.sucursal)}
                        <span style="font-size: 0.7rem; color: #64748b; margin-left: 5px;">ⓘ</span>
                    </span>
                </div>
                <td style="text-align: center; color: #059669;">${branch.contado}</div>
                <td style="text-align: center; color: #ea580c;">${branch.credito}</div>
                <td style="text-align: center; font-weight: bold; background: #f0f9ff;">${branch.total}</div>
                <td style="text-align: center;">
                    <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                        <div style="width: 60px; background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 6px;">
                            <div style="width: ${porcentaje}%; background: linear-gradient(90deg, #f97316, #ea580c); height: 100%; border-radius: 20px;"></div>
                        </div>
                        <span style="font-size: 0.7rem; font-weight: 600;">${porcentaje}%</span>
                    </div>
                </div>
            </tr>
        `;
    });
    
    tableHtml += `
                </tbody>
            </table>
        </div>
    `;
    
    const modalBody = document.getElementById('branchModalBody');
    if (modalBody) {
        modalBody.innerHTML = tableHtml;
    }
    
    // Agregar event listeners para tooltips personalizados
    setTimeout(() => {
        document.querySelectorAll('.branch-name').forEach(element => {
            const tooltipText = element.getAttribute('data-tooltip');
            if (tooltipText && tooltipText !== 'No hay información de asesores') {
                // Crear tooltip flotante personalizado
                element.addEventListener('mouseenter', (e) => {
                    let tooltipDiv = document.getElementById('customTooltip');
                    if (!tooltipDiv) {
                        tooltipDiv = document.createElement('div');
                        tooltipDiv.id = 'customTooltip';
                        tooltipDiv.style.cssText = `
                            position: fixed;
                            background: #1e293b;
                            color: #f1f5f9;
                            padding: 10px 14px;
                            border-radius: 12px;
                            font-size: 12px;
                            z-index: 10000;
                            max-width: 300px;
                            white-space: normal;
                            word-wrap: break-word;
                            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                            pointer-events: none;
                            border-left: 3px solid #f97316;
                            font-family: monospace;
                            line-height: 1.4;
                        `;
                        document.body.appendChild(tooltipDiv);
                    }
                    tooltipDiv.innerHTML = tooltipText;
                    tooltipDiv.style.display = 'block';
                    
                    const updatePosition = (event) => {
                        tooltipDiv.style.left = (event.clientX + 15) + 'px';
                        tooltipDiv.style.top = (event.clientY - 30) + 'px';
                    };
                    
                    updatePosition(e);
                    
                    element.addEventListener('mousemove', updatePosition);
                    
                    element.addEventListener('mouseleave', () => {
                        tooltipDiv.style.display = 'none';
                        element.removeEventListener('mousemove', updatePosition);
                    }, { once: true });
                });
            }
        });
    }, 100);
    
    modal.style.display = 'block';
}