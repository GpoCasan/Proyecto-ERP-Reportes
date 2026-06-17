// ==================== MÓDULO: PAYJOY (CRÉDITO) ====================
async function searchPayJoy() {
    const date = document.getElementById('creditoDate').value;
    if (!date) { showError('credito', 'Seleccione fecha'); return; }
    
    const btn = document.getElementById('searchCreditoBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Autenticando... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    // Obtener el límite de páginas seleccionado
    const maxPagesSelect = document.getElementById('maxPagesSelect');
    const maxPages = maxPagesSelect ? parseInt(maxPagesSelect.value) : 0;
    
    try {
        const token = await getValidToken();
        const startDate = new Date(date);
        startDate.setHours(18, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        const startTs = Math.floor(startDate.getTime() / 1000);
        const endTs = Math.floor(endDate.getTime() / 1000);
        
        let allItems = [];
        let currentPage = 1;
        let lastPage = 1;
        let hasMorePages = true;
        
        // Determinar el límite de páginas (0 = todas)
        const pageLimit = maxPages > 0 ? maxPages : 999;
        
        while (hasMorePages && currentPage <= pageLimit) {
            // Actualizar mensaje de progreso
            btn.innerHTML = `Consultando página ${currentPage}... <span class="loading-spinner"></span>`;
            
            const url = `${CONFIG.API_PAYJOY}?startDate=${startTs}&endDate=${endTs}&page=${currentPage}&type=finance`;
            console.log(`Consultando PayJoy página ${currentPage}:`, url);
            
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            
            const data = await res.json();
            
            // Obtener items según la estructura de la respuesta
            let items = data.data || data.finance || [];
            
            if (!items.length) {
                // No hay más items, salir
                break;
            }
            
            allItems.push(...items);
            
            // Obtener información de paginación del JSON
            // Según tu ejemplo: last_page, current_page, per_page, total
            if (data.last_page !== undefined) {
                lastPage = data.last_page;
                currentPage = data.current_page || currentPage;
                hasMorePages = currentPage < lastPage;
            } else if (data.meta && data.meta.last_page !== undefined) {
                lastPage = data.meta.last_page;
                currentPage = data.meta.current_page || currentPage;
                hasMorePages = currentPage < lastPage;
            } else if (data.links && data.links.next) {
                hasMorePages = data.links.next !== null;
            } else {
                // Si no hay información de paginación, asumimos que es la única página
                hasMorePages = false;
            }
            
            currentPage++;
            
            // Pequeña pausa para no sobrecargar la API
            await new Promise(r => setTimeout(r, 300));
        }
        
        console.log(`Total de registros obtenidos: ${allItems.length} de ${lastPage} páginas`);
        
        // Procesar resultados
        const results = [];
        for (let item of allItems) {
            let imei = item.imei || item.deviceImei;
            if (imei && isValidImei(imei.toString())) {
                results.push({ 
                    imei: imei.toString(), 
                    model: item.deviceFamily || item.model || 'N/A', 
                    seller: item.salesClerkName || item.seller || 'N/A', 
                    amount: parseFloat(item.amount) || 0, 
                    down: parseFloat(item.downPayment) || 0 
                });
            }
        }
        
        // Mostrar estadísticas
        let html = `
            <div class="stats">
                <div class="stat-card"><div class="stat-number">${results.length}</div><div class="stat-label">📱 Ventas</div></div>
                <div class="stat-card"><div class="stat-number">${lastPage}</div><div class="stat-label">📄 Total Páginas</div></div>
            </div>
        `;
        
        if (results.length) {
            html += `<div class="table-container"><table class="imei-table"><thead><tr>
                <th>#</th>
                <th>IMEI</th>
                <th>Modelo</th>
                <th>Vendedor</th>
                <th>Precio</th>
                <th>Enganche</th>
                <th>Saldo</th>
                <th>Acción</th>
            </tr></thead><tbody>`;
            
            let total = 0, totalDown = 0;
            results.forEach((item, i) => {
                total += item.amount;
                totalDown += item.down;
                html += `<tr>
                    <td>${i+1}</td>
                    <td><code>${item.imei}</code></td>
                    <td>${escapeHtml(item.model)}</div>
                    <td>${escapeHtml(item.seller)}</div>
                    <td>$${item.amount.toFixed(2)}</div>
                    <td>$${item.down.toFixed(2)}</div>
                    <td>$${(item.amount - item.down).toFixed(2)}</div>
                    <td><button class="btn-analyze" data-imei="${item.imei}" data-price="${item.amount}" data-date="${date}">🔍 Analizar</button></div>
                </tr>`;
            });
            
            html += `
                <tr style="background:#f0f9ff; font-weight: bold;">
                    <td colspan="4"><strong>TOTALES:</strong></div>
                    <td><strong>$${total.toFixed(2)}</strong></div>
                    <td><strong>$${totalDown.toFixed(2)}</strong></div>
                    <td><strong>$${(total - totalDown).toFixed(2)}</strong></div>
                    <td></div>
                </tr>
            </tbody>}</div>`;
        } else {
            html += `<div class="alert alert-warning">⚠️ No se encontraron IMEIs para ${formatDate(date)}</div>`;
        }
        
        document.getElementById('creditoResults').innerHTML = html;
        document.getElementById('creditoResults').style.display = 'block';
        
        // Asignar eventos de análisis
        document.querySelectorAll('#creditoResults .btn-analyze').forEach(btn => {
            btn.addEventListener('click', async (e) => { 
                await openAnalysisModal(btn.dataset.imei, parseFloat(btn.dataset.price), btn.dataset.date, 'Crédito'); 
            });
        });
        
        if (results.length === 0) {
            showInfo('credito', `⚠️ No se encontraron ventas PayJoy para el día ${formatDate(date)}`, true);
        } else {
            showInfo('credito', `✅ Se encontraron ${results.length} ventas PayJoy en ${lastPage} páginas`, false);
        }
        
    } catch(e) { 
        console.error('Error en searchPayJoy:', e);
        showError('credito', `Error: ${e.message}`); 
    } finally { 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
    }
}