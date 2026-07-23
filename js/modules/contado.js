// ==================== MÓDULO: VENTAS DE CONTADO ====================

// Función para obtener la ruta de una sucursal
function getRutaByBranch(branchName) {
    if (!branchName) return 'Sin Ruta';
    
    var normalizedBranch = branchName.toLowerCase().trim();
    
    for (var rutaNombre in RUTAS_CONFIG) {
        if (RUTAS_CONFIG.hasOwnProperty(rutaNombre)) {
            var rutaData = RUTAS_CONFIG[rutaNombre];
            for (var i = 0; i < rutaData.sucursales.length; i++) {
                var sucursal = rutaData.sucursales[i];
                if (sucursal.toLowerCase().trim() === normalizedBranch) {
                    return rutaNombre;
                }
            }
        }
    }
    return 'Sin Ruta';
}

// Función para obtener el ICCID de una venta (buscando en TODOS los detalles)
function obtenerIccidDeVenta(sale) {
    var details = sale.details || [];
    for (var dIdx = 0; dIdx < details.length; dIdx++) {
        var detail = details[dIdx];
        var groups = detail.specification_groups || [];
        for (var gIdx = 0; gIdx < groups.length; gIdx++) {
            var group = groups[gIdx];
            var specs = group.specification_details || [];
            for (var sIdx = 0; sIdx < specs.length; sIdx++) {
                var spec = specs[sIdx];
                // ICCID (product_specification_id === 2)
                if (spec.product_specification_id === 2 && spec.value) {
                    return spec.value;
                }
                // También por nombre de especificación
                if (spec.specification && spec.specification.name === 'ICCID' && spec.value) {
                    return spec.value;
                }
            }
        }
    }
    return null;
}

// ==================== FUNCIÓN PARA EXPORTAR CSV (FALLBACK) ====================
function exportToCSV(data, filename) {
    console.log('📊 Usando exportación CSV (fallback)...');
    var csv = '';
    data.forEach(function(row) {
        csv += row.join(',') + '\n';
    });
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log('✅ CSV exportado correctamente');
}

// ==================== FUNCIÓN PRINCIPAL ====================
function generateSalesReportAllLines() {
    var date = document.getElementById('contadoDate').value;
    if (!date) { showError('contado', 'Seleccione fecha'); return; }
    var btn = document.getElementById('btnAllLines');
    var originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    (async function() {
        try {
            var range = getDateRangeContado(date);
            if (!range) throw new Error('Error en fecha');
            
            var [res4, res5] = await Promise.all([
                fetch(CONFIG.API_SALES + '?page=1&per_page=100&sale_type=products&classification_ids[]=9&classification_ids[]=3&line_id=4&start_date=' + range.start + '&end_date=' + range.end, { headers: { 'Authorization': 'Bearer ' + CONFIG.FIXED_TOKEN } }),
                fetch(CONFIG.API_SALES + '?page=1&per_page=100&sale_type=products&classification_ids[]=9&classification_ids[]=3&line_id=5&start_date=' + range.start + '&end_date=' + range.end, { headers: { 'Authorization': 'Bearer ' + CONFIG.FIXED_TOKEN } })
            ]);
            var data4 = await res4.json(), data5 = await res5.json();
            var sales = [].concat(data4.data || [], data5.data || []);
            var map = new Map();
            
            for (var saleIdx = 0; saleIdx < sales.length; saleIdx++) {
                var sale = sales[saleIdx];
                var branchName = 'No disponible';
                if (sale.warehouse && sale.warehouse.branch && sale.warehouse.branch.name) {
                    branchName = sale.warehouse.branch.name;
                } else if (sale.branch_name) {
                    branchName = sale.branch_name;
                }
                
                var ruta = getRutaByBranch(branchName);
                
                // Obtener ICCID de TODA la venta (buscar en todos los detalles)
                var iccidValue = obtenerIccidDeVenta(sale);
                
                var details = sale.details || [];
                for (var dIdx = 0; dIdx < details.length; dIdx++) {
                    var detail = details[dIdx];
                    var groups = detail.specification_groups || [];
                    for (var gIdx = 0; gIdx < groups.length; gIdx++) {
                        var group = groups[gIdx];
                        var specs = group.specification_details || [];
                        for (var sIdx = 0; sIdx < specs.length; sIdx++) {
                            var spec = specs[sIdx];
                            // Buscar IMEI (product_specification_id === 1)
                            if (spec.product_specification_id === 1 && isValidImei(spec.value)) {
                                var imeiValue = spec.value;
                                
                                if (!map.has(imeiValue)) {
                                    var productName = '';
                                    var productId = null;
                                    var isLibre = false;
                                    
                                    if (detail.product && detail.product.name) {
                                        productName = detail.product.name;
                                        productId = detail.product.id;
                                        isLibre = (productName || '').toLowerCase().includes('libre');
                                    }
                                    
                                    var line = isLibre ? 'Libre' : 'Telcel';
                                    var price = parseFloat(detail.total_amount || detail.total || 0);
                                    
                                    map.set(imeiValue, {
                                        imei: imeiValue,
                                        iccid: iccidValue || '',
                                        product: productName || 'Desconocido',
                                        price: price,
                                        saleId: sale.id,
                                        seller: sale.user && sale.user.name || 'No disponible',
                                        sellerId: sale.user && sale.user.id || null,
                                        line: line,
                                        productId: productId || null,
                                        branch: branchName,
                                        ruta: ruta
                                    });
                                }
                                break;
                            }
                        }
                    }
                }
            }
            
            var results = Array.from(map.values());
            
            // ========== GUARDAR LA FECHA DE CONSULTA ==========
            var fechaConsulta = date; // La fecha que seleccionó el usuario
            
            // Guardar datos
            window.cachedSalesData = { date: fechaConsulta, results: results };
            window._cachedContadoFullData = {
                date: fechaConsulta,
                results: results,
                allSales: sales
            };
            
            try {
                var dataToStore = {
                    date: fechaConsulta,
                    results: results,
                    allSales: sales || []
                };
                sessionStorage.setItem('contadoData', JSON.stringify(dataToStore));
                localStorage.setItem('contadoData', JSON.stringify(dataToStore));
                console.log('✅ Datos guardados en sessionStorage y localStorage');
            } catch(e) {
                console.warn('No se pudo guardar en storage:', e);
            }
            
            console.log('✅ DATOS GUARDADOS:');
            console.log('  window.cachedSalesData:', window.cachedSalesData ? window.cachedSalesData.results.length : 'null');
            console.log('  window._cachedContadoFullData:', window._cachedContadoFullData ? window._cachedContadoFullData.results.length : 'null');
            console.log('  Fecha consulta:', fechaConsulta);
            
            var statsHtml = '\
                <button class="stat-card-btn" data-filter="all"><div class="stat-number">' + results.length + '</div><div class="stat-label">📱 Total IMEIs</div></button>\
                <button class="stat-card-btn" data-filter="telcel"><div class="stat-number">' + results.filter(function(r){return r.line==='Telcel';}).length + '</div><div class="stat-label">📶 Telcel</div></button>\
                <button class="stat-card-btn" data-filter="libre"><div class="stat-number">' + results.filter(function(r){return r.line==='Libre';}).length + '</div><div class="stat-label">🔓 Libre</div></button>\
                <button class="stat-card-btn" id="btnAnalyzeAllMarkup" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">\
                    <div class="stat-number">📊</div>\
                    <div class="stat-label">Analizar Markup</div>\
                    <div style="font-size:0.65rem; margin-top:4px;">General del día</div>\
                </button>\
                <button class="stat-card-btn" id="btnAsesorSummary"><div class="stat-number">👥</div><div class="stat-label">Resumen Asesores</div></button>\
            ';
            document.getElementById('contadoStats').innerHTML = statsHtml;
            document.getElementById('contadoStats').style.display = 'grid';
            
            resetMarkupAnalysis();
            
            // ========== ORDENAR POR RUTA, SUCURSAL, VENDEDOR ==========
            results.sort(function(a, b) {
                var rutaCompare = (a.ruta || 'Sin Ruta').localeCompare(b.ruta || 'Sin Ruta');
                if (rutaCompare !== 0) return rutaCompare;
                var branchCompare = (a.branch || 'No disponible').localeCompare(b.branch || 'No disponible');
                if (branchCompare !== 0) return branchCompare;
                return (a.seller || '').localeCompare(b.seller || '');
            });
            
            var highPriceResults = results.filter(function(item) { return item.price >= 1500; });
            var lowPriceResults = results.filter(function(item) { return item.price < 1500; });
            
            var html = '<div class="table-container">';
            
            if (results.length > 0) {
                html += '\
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 16px; gap: 10px;">\
                        <button id="exportAllContadoBtn" style="\
                            background: linear-gradient(135deg, #059669 0%, #10b981 100%);\
                            color: white;\
                            border: none;\
                            padding: 8px 20px;\
                            border-radius: 8px;\
                            font-size: 0.85rem;\
                            font-weight: 600;\
                            cursor: pointer;\
                            transition: all 0.2s;\
                            display: flex;\
                            align-items: center;\
                            gap: 8px;\
                        ">\
                            📊 Exportar Todas las Ventas\
                        </button>\
                    </div>\
                ';
            }
            
            // ========== TABLA: RUTA | SUCURSAL | VENDEDOR | IMEI | ICCID | MODELO | PRECIO ==========
            if (highPriceResults.length > 0) {
                html += '\
                    <div class="section-header" style="background-color: #2c7da0; color: white; padding: 8px 12px; margin-top: 10px; border-radius: 8px;">\
                        <strong>💰 EQUIPOS DE $1,500 O MÁS (' + highPriceResults.length + ' equipos)</strong>\
                    </div>\
                    <table class="imei-table">\
                        <thead>\
                            <tr>\
                                <th>#</th>\
                                <th>Venta</th>\
                                <th>Ruta</th>\
                                <th>Sucursal</th>\
                                <th>Vendedor</th>\
                                <th>IMEI</th>\
                                <th>ICCID</th>\
                                <th>Modelo</th>\
                                <th>Precio</th>\
                            </tr>\
                        </thead>\
                        <tbody>';
                for (var i = 0; i < highPriceResults.length; i++) {
                    var item = highPriceResults[i];
                    html += '<tr>\
                        <td>' + (i+1) + '</td>\
                        <td><button class="badge-sale-id" onclick="openReceipt(' + item.saleId + ')">📄 #' + item.saleId + '</button></td>\
                        <td><span style="background: ' + (item.ruta === 'Sin Ruta' ? '#94a3b8' : '#f97316') + '; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.65rem;">' + item.ruta + '</span></td>\
                        <td>' + escapeHtml(item.branch) + '</td>\
                        <td>' + escapeHtml(item.seller) + '</td>\
                        <td><code>' + item.imei + '</code></td>\
                        <td><code style="font-size: 0.7rem;">' + (item.iccid ? item.iccid : '<span style="color: #94a3b8;">N/A</span>') + '</code></td>\
                        <td>' + escapeHtml(item.product) + '</td>\
                        <td style="text-align: right; font-weight: bold;">$' + item.price.toFixed(2) + ' MXN</td>\
                    </tr>';
                }
                html += '</tbody></table>';
            }
            
            if (lowPriceResults.length > 0) {
                html += '\
                    <div class="section-header" style="background-color: #52b788; color: white; padding: 8px 12px; margin-top: 20px; border-radius: 8px;">\
                        <strong>🛒 EQUIPOS DE MENOS DE $1,500 (' + lowPriceResults.length + ' equipos)</strong>\
                    </div>\
                    <table class="imei-table">\
                        <thead>\
                            <tr>\
                                <th>#</th>\
                                <th>Venta</th>\
                                <th>Ruta</th>\
                                <th>Sucursal</th>\
                                <th>Vendedor</th>\
                                <th>IMEI</th>\
                                <th>ICCID</th>\
                                <th>Modelo</th>\
                                <th>Precio</th>\
                            </tr>\
                        </thead>\
                        <tbody>';
                for (var j = 0; j < lowPriceResults.length; j++) {
                    var item2 = lowPriceResults[j];
                    html += '<tr>\
                        <td>' + (j+1) + '</td>\
                        <td><button class="badge-sale-id" onclick="openReceipt(' + item2.saleId + ')">📄 #' + item2.saleId + '</button></td>\
                        <td><span style="background: ' + (item2.ruta === 'Sin Ruta' ? '#94a3b8' : '#f97316') + '; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.65rem;">' + item2.ruta + '</span></td>\
                        <td>' + escapeHtml(item2.branch) + '</td>\
                        <td>' + escapeHtml(item2.seller) + '</td>\
                        <td><code>' + item2.imei + '</code></td>\
                        <td><code style="font-size: 0.7rem;">' + (item2.iccid ? item2.iccid : '<span style="color: #94a3b8;">N/A</span>') + '</code></td>\
                        <td>' + escapeHtml(item2.product) + '</td>\
                        <td style="text-align: right; font-weight: bold;">$' + item2.price.toFixed(2) + ' MXN</td>\
                    </tr>';
                }
                html += '</tbody></table>';
            }
            
            html += '</div>';
            document.getElementById('contadoResults').innerHTML = html;
            document.getElementById('contadoResults').style.display = 'block';
            
            // Eventos de estadísticas
            document.querySelectorAll('#contadoStats .stat-card-btn[data-filter]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    openResumenModal(btn.getAttribute('data-filter'));
                });
            });
            
            var btnAsesorSummary = document.getElementById('btnAsesorSummary');
            if (btnAsesorSummary) {
                btnAsesorSummary.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openAsesorSummaryModal();
                });
            }
            
            var btnAnalyzeAllMarkup = document.getElementById('btnAnalyzeAllMarkup');
            if (btnAnalyzeAllMarkup) {
                btnAnalyzeAllMarkup.addEventListener('click', function(e) {
                    e.stopPropagation();
                    analyzeAllMarkup();
                });
            }
            
            var exportBtn = document.getElementById('exportAllContadoBtn');
            if (exportBtn) {
                var newExportBtn = exportBtn.cloneNode(true);
                exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
                newExportBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🖱️ Click en exportar todas las ventas');
                    exportAllContadoToExcel();
                };
                console.log('✅ Botón exportAllContadoBtn configurado con onclick');
            }
            
        } catch(e) {
            console.error('Error en generateSalesReportAllLines:', e);
            showError('contado', e.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    })();
}

// ==================== EXPORTAR TODAS LAS VENTAS A EXCEL ====================

function exportAllContadoToExcel() {
    console.log('📊 [EXPORT] Iniciando exportación...');
    
    var data = obtenerDatosContado();
    
    if (!data || !data.results || data.results.length === 0) {
        console.error('❌ No hay datos para exportar');
        alert('⚠️ Primero debes consultar las ventas usando el botón "Consultar"');
        showError('contado', 'Primero consulta las ventas');
        return;
    }
    
    var date = data.date; // Fecha de consulta (la que seleccionó el usuario)
    var results = data.results;
    
    console.log('📊 Exportando ' + results.length + ' registros...');
    console.log('📅 Fecha de consulta:', date);
    
    // ========== EXPORTAR CON ORDEN: RUTA | SUCURSAL | VENDEDOR | IMEI | ICCID | MODELO | PRECIO ==========
    var sortedResults = [].concat(results).sort(function(a, b) {
        var rutaCompare = (a.ruta || 'Sin Ruta').localeCompare(b.ruta || 'Sin Ruta');
        if (rutaCompare !== 0) return rutaCompare;
        var branchCompare = (a.branch || 'No disponible').localeCompare(b.branch || 'No disponible');
        if (branchCompare !== 0) return branchCompare;
        return (a.seller || '').localeCompare(b.seller || '');
    });
    
    var excelData = [
        ['REPORTE DE VENTAS DE CONTADO'],
        ['Fecha consultada: ' + formatDateInput(date)],
        ['Total de equipos: ' + results.length],
        [],
        ['#', 'Venta', 'Ruta', 'Sucursal', 'Vendedor', 'IMEI', 'ICCID', 'Modelo', 'Precio']
    ];
    
    sortedResults.forEach(function(item, index) {
        excelData.push([
            index + 1,
            item.saleId || 'N/A',
            item.ruta || 'Sin Ruta',
            item.branch || 'No disponible',
            item.seller || 'N/A',
            item.imei || 'N/A',
            item.iccid || 'N/A',
            item.product || 'N/A',
            (item.price || 0).toFixed(2)
        ]);
    });
    
    var totalContado = results.reduce(function(sum, r) { return sum + (r.price || 0); }, 0);
    var totalTelcel = results.filter(function(r) { return r.line === 'Telcel'; }).length;
    var totalLibre = results.filter(function(r) { return r.line === 'Libre'; }).length;
    var conIccid = results.filter(function(r) { return r.iccid && r.iccid !== ''; }).length;
    
    excelData.push([]);
    excelData.push(['RESUMEN']);
    excelData.push(['Total Equipos', results.length]);
    excelData.push(['Total Telcel', totalTelcel]);
    excelData.push(['Total Libre', totalLibre]);
    excelData.push(['Con ICCID', conIccid]);
    excelData.push(['Monto Total', totalContado.toFixed(2)]);
    
    // Resumen por ruta
    var rutasUnicas = [];
    var rutaSet = new Set();
    results.forEach(function(r) { rutaSet.add(r.ruta || 'Sin Ruta'); });
    rutasUnicas = Array.from(rutaSet).sort();
    
    if (rutasUnicas.length > 0) {
        excelData.push([]);
        excelData.push(['RESUMEN POR RUTA']);
        excelData.push(['Ruta', 'Cantidad', 'Monto Total']);
        rutasUnicas.forEach(function(ruta) {
            var itemsRuta = results.filter(function(r) { return (r.ruta || 'Sin Ruta') === ruta; });
            var totalRuta = itemsRuta.reduce(function(sum, r) { return sum + (r.price || 0); }, 0);
            excelData.push([ruta, itemsRuta.length, totalRuta.toFixed(2)]);
        });
    }
    
    try {
        if (typeof XLSX !== 'undefined') {
            console.log('📊 Creando archivo Excel con XLSX...');
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(excelData);
            ws['!cols'] = [
                { wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
                { wch: 25 }, { wch: 18 }, { wch: 22 }, { wch: 35 }, { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Ventas Contado');
            XLSX.writeFile(wb, 'ventas_contado_' + date + '.xlsx');
            console.log('✅ Archivo Excel generado correctamente.');
            showInfo('contado', '✅ Exportadas ' + results.length + ' ventas a Excel');
        } else {
            console.warn('⚠️ XLSX no disponible, usando CSV');
            exportToCSV(excelData, 'ventas_contado_' + date);
            showInfo('contado', '✅ Exportadas ' + results.length + ' ventas a CSV');
        }
    } catch(e) {
        console.error('❌ Error exportando:', e);
        exportToCSV(excelData, 'ventas_contado_' + date);
        showInfo('contado', '✅ Exportadas ' + results.length + ' ventas a CSV (fallback)');
    }
}

// ==================== FUNCIÓN PARA OBTENER DATOS ====================

function obtenerDatosContado() {
    console.log('🔍 [obtenerDatosContado] Buscando datos...');
    
    if (window.cachedSalesData && window.cachedSalesData.results && window.cachedSalesData.results.length > 0) {
        console.log('✅ Datos obtenidos de window.cachedSalesData:', window.cachedSalesData.results.length);
        return { date: window.cachedSalesData.date, results: window.cachedSalesData.results, allSales: [] };
    }
    
    if (window._cachedContadoFullData && window._cachedContadoFullData.results && window._cachedContadoFullData.results.length > 0) {
        console.log('✅ Datos obtenidos de window._cachedContadoFullData:', window._cachedContadoFullData.results.length);
        return window._cachedContadoFullData;
    }
    
    try {
        var stored = sessionStorage.getItem('contadoData');
        if (stored) {
            var parsed = JSON.parse(stored);
            if (parsed && parsed.results && parsed.results.length > 0) {
                console.log('✅ Datos obtenidos de sessionStorage:', parsed.results.length);
                return parsed;
            }
        }
    } catch(e) {}
    
    try {
        var stored2 = localStorage.getItem('contadoData');
        if (stored2) {
            var parsed2 = JSON.parse(stored2);
            if (parsed2 && parsed2.results && parsed2.results.length > 0) {
                console.log('✅ Datos obtenidos de localStorage:', parsed2.results.length);
                return parsed2;
            }
        }
    } catch(e) {}
    
    console.log('❌ No se encontraron datos en ninguna fuente');
    return null;
}

// ==================== RESUMEN POR MODELO ====================

function openResumenModal(filter) {
    var data = obtenerDatosContado();
    if (!data || !data.results) { 
        showError('contado', 'Primero consulta las ventas'); 
        return; 
    }
    
    var results = data.results;
    var title = '📱 Resumen de Equipos (Todos)';
    if (filter === 'telcel') { 
        results = data.results.filter(function(r) { return r.line === 'Telcel'; }); 
        title = '📶 Resumen de Equipos TELCEL'; 
    } else if (filter === 'libre') { 
        results = data.results.filter(function(r) { return r.line === 'Libre'; }); 
        title = '🔓 Resumen de Equipos LIBRE'; 
    }
    
    var productMap = new Map();
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var productName = item.product;
        if (productMap.has(productName)) {
            var existing = productMap.get(productName);
            existing.cantidad++;
            existing.total += item.price;
        } else {
            productMap.set(productName, { nombre: productName, cantidad: 1, precioUnitario: item.price, total: item.price });
        }
    }
    var productos = Array.from(productMap.values()).sort(function(a,b) { return a.nombre.localeCompare(b.nombre); });
    var totalUnidades = productos.reduce(function(sum, p) { return sum + p.cantidad; }, 0);
    var totalVenta = productos.reduce(function(sum, p) { return sum + p.total; }, 0);
    
    var modal = document.getElementById('resumenModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resumenModal';
        modal.className = 'modal';
        modal.innerHTML = '<div class="modal-content"><div class="modal-header"><h3 id="resumenModalTitle">📊 Resumen de equipos</h3><span class="close-modal">&times;</span></div><div class="modal-body" id="resumenModalBody"></div><div class="modal-footer">Ventas de contado</div></div>';
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = function() { modal.style.display = 'none'; };
        window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    }
    document.getElementById('resumenModalTitle').innerHTML = title;
    var tableHtml = '<div class="stats" style="margin-bottom:20px">\
        <div class="stat-card"><div class="stat-number">' + totalUnidades + '</div><div class="stat-label">Total Equipos</div></div>\
        <div class="stat-card"><div class="stat-number">' + new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totalVenta) + '</div><div class="stat-label">Total Venta</div></div>\
    </div>\
    <div class="table-container">\
        <table class="resumen-table">\
            <thead>\
                <tr><th>#</th><th>Producto</th><th>Cantidad</th><th>Precio Unitario</th><th>Total</th></tr>\
            </thead>\
            <tbody>';
    productos.forEach(function(prod, idx) { 
        tableHtml += '<tr>\
            <td>' + (idx+1) + '</td>\
            <td style="text-align:left">' + escapeHtml(prod.nombre) + '</td>\
            <td style="text-align:center"><strong>' + prod.cantidad + '</strong></td>\
            <td style="text-align:right">' + new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(prod.precioUnitario) + '</td>\
            <td style="text-align:right">' + new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(prod.total) + '</td>\
        </tr>';
    });
    tableHtml += '</tbody></table></div>';
    document.getElementById('resumenModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
}

// ==================== RESUMEN DE ASESORES ====================

function openAsesorSummaryModal() {
    var data = obtenerDatosContado();
    if (!data || !data.results) { 
        showError('contado', 'Primero consulta las ventas'); 
        return; 
    }
    
    var results = data.results;
    var ventasPorAsesor = new Map();
    
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var id = item.sellerId;
        var nombre = item.seller;
        var isHighPrice = item.price >= 1500;
        var key = id || nombre;
        
        if (!ventasPorAsesor.has(key)) {
            ventasPorAsesor.set(key, {
                id: id,
                nombre: nombre,
                alta: 0,
                baja: 0,
                total: 0
            });
        }
        var asesorData = ventasPorAsesor.get(key);
        if (isHighPrice) {
            asesorData.alta++;
        } else {
            asesorData.baja++;
        }
        asesorData.total++;
    }
    
    var equipos = [];
    
    for (var teamName in TEAM_STRUCTURE) {
        if (TEAM_STRUCTURE.hasOwnProperty(teamName)) {
            var teamData = TEAM_STRUCTURE[teamName];
            var liderAlta = 0, liderBaja = 0, liderTotal = 0;
            
            if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
                var lider = ventasPorAsesor.get(teamData.liderId);
                liderAlta = lider.alta;
                liderBaja = lider.baja;
                liderTotal = lider.total;
            } else {
                for (var kv of ventasPorAsesor) {
                    if (kv[1].nombre === teamData.liderNombre) {
                        liderAlta = kv[1].alta;
                        liderBaja = kv[1].baja;
                        liderTotal = kv[1].total;
                        break;
                    }
                }
            }
            
            var miembros = [];
            var equipoAlta = liderAlta;
            var equipoBaja = liderBaja;
            var equipoTotal = liderTotal;
            
            for (var mIdx = 0; mIdx < teamData.miembros.length; mIdx++) {
                var miembroId = teamData.miembros[mIdx];
                var miembroAlta = 0, miembroBaja = 0, miembroTotal = 0;
                var miembroInfo = null;
                
                if (ventasPorAsesor.has(miembroId)) {
                    miembroInfo = ventasPorAsesor.get(miembroId);
                    miembroAlta = miembroInfo.alta;
                    miembroBaja = miembroInfo.baja;
                    miembroTotal = miembroInfo.total;
                } else {
                    for (var kv2 of ventasPorAsesor) {
                        if (kv2[1].id === miembroId) {
                            miembroAlta = kv2[1].alta;
                            miembroBaja = kv2[1].baja;
                            miembroTotal = kv2[1].total;
                            miembroInfo = kv2[1];
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
            
            miembros.sort(function(a, b) { return b.total - a.total; });
            
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
    }
    
    equipos.sort(function(a, b) { return b.equipoTotal - a.equipoTotal; });
    
    var totalGeneralAlta = equipos.reduce(function(sum, e) { return sum + e.equipoAlta; }, 0);
    var totalGeneralBaja = equipos.reduce(function(sum, e) { return sum + e.equipoBaja; }, 0);
    var totalGeneral = equipos.reduce(function(sum, e) { return sum + e.equipoTotal; }, 0);
    
    var modal = document.getElementById('asesorSummaryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'asesorSummaryModal';
        modal.className = 'modal';
        modal.innerHTML = '\
            <div class="modal-content" style="max-width: 800px;">\
                <div class="modal-header">\
                    <h3>👥 Resumen por Equipo - Cantidades</h3>\
                    <span class="close-modal">&times;</span>\
                </div>\
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">\
                    <button id="exportExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>\
                </div>\
                <div class="modal-body" id="asesorSummaryModalBody"></div>\
                <div class="modal-footer">\
                    Ventas de contado | Cantidades de equipos\
                </div>\
            </div>\
        ';
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = function() { modal.style.display = 'none'; };
        window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    var tableHtml = '\
        <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">\
            <div style="flex: 1; background: #2c7da0; color: white; padding: 12px; border-radius: 12px; text-align: center;">\
                <div style="font-size: 24px; font-weight: bold;">' + totalGeneralAlta + '</div>\
                <div style="font-size: 11px;">💰 Equipos ≥ $1,500</div>\
            </div>\
            <div style="flex: 1; background: #52b788; color: white; padding: 12px; border-radius: 12px; text-align: center;">\
                <div style="font-size: 24px; font-weight: bold;">' + totalGeneralBaja + '</div>\
                <div style="font-size: 11px;">🛒 Equipos < $1,500</div>\
            </div>\
            <div style="flex: 1; background: #1e6091; color: white; padding: 12px; border-radius: 12px; text-align: center;">\
                <div style="font-size: 24px; font-weight: bold;">' + totalGeneral + '</div>\
                <div style="font-size: 11px;">📱 Total Equipos</div>\
            </div>\
        </div>\
        <div style="max-height: 500px; overflow-y: auto;">\
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">\
                <thead style="position: sticky; top: 0; background: #f8fafc;">\
                    <tr style="border-bottom: 2px solid #2c7da0;">\
                        <th style="padding: 10px; text-align: center;">#</th>\
                        <th style="padding: 10px; text-align: left;">Equipo / Asesor</th>\
                        <th style="padding: 10px; text-align: center; background: #2c7da0; color: white;">💰 ≥ $1,500</th>\
                        <th style="padding: 10px; text-align: center; background: #52b788; color: white;">🛒 < $1,500</th>\
                        <th style="padding: 10px; text-align: center;">📱 Total</th>\
                    </tr>\
                </thead>\
                <tbody>';
    
    var index = 1;
    for (var eIdx = 0; eIdx < equipos.length; eIdx++) {
        var equipo = equipos[eIdx];
        tableHtml += '\
            <tr style="background-color: #e8f4f8; border-top: 2px solid #2c7da0;">\
                <td style="padding: 8px; text-align: center; font-weight: bold;">' + index + '</td>\
                <td style="padding: 8px; text-align: left; font-weight: bold; color: #2c7da0;">📁 ' + equipo.nombre + '</td>\
                <td style="padding: 8px; text-align: center; font-weight: bold; background: #2c7da015;">' + equipo.equipoAlta + '</td>\
                <td style="padding: 8px; text-align: center; font-weight: bold; background: #52b78815;">' + equipo.equipoBaja + '</td>\
                <td style="padding: 8px; text-align: center; font-weight: bold;">' + equipo.equipoTotal + '</td>\
            </tr>';
        index++;
        
        tableHtml += '\
            <tr style="border-bottom: 1px solid #e2e8f0;">\
                <td style="padding: 6px 8px; text-align: center;"></td>\
                <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">👑 ' + equipo.liderNombre + '</td>\
                <td style="padding: 6px 8px; text-align: center;">' + equipo.liderAlta + '</td>\
                <td style="padding: 6px 8px; text-align: center;">' + equipo.liderBaja + '</td>\
                <td style="padding: 6px 8px; text-align: center; font-weight: bold;">' + equipo.liderTotal + '</td>\
            </tr>';
        
        for (var mIdx2 = 0; mIdx2 < equipo.miembros.length; mIdx2++) {
            var miembro = equipo.miembros[mIdx2];
            tableHtml += '\
                <tr style="border-bottom: 1px solid #e2e8f0;">\
                    <td style="padding: 6px 8px; text-align: center;"></td>\
                    <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">└─ ' + escapeHtml(miembro.nombre) + '</td>\
                    <td style="padding: 6px 8px; text-align: center;">' + miembro.alta + '</td>\
                    <td style="padding: 6px 8px; text-align: center;">' + miembro.baja + '</td>\
                    <td style="padding: 6px 8px; text-align: center;">' + miembro.total + '</td>\
                </tr>';
        }
    }
    
    tableHtml += '\
                </tbody>\
            </table>\
        </div>';
    
    document.getElementById('asesorSummaryModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
    
    var exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) {
        var newExportBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
        newExportBtn.addEventListener('click', function() { exportAsesorSummaryToExcel(equipos); });
    }
}

// ==================== EXPORTAR RESUMEN DE ASESORES ====================

function exportAsesorSummaryToExcel(equipos) {
    if (!equipos || equipos.length === 0) {
        alert('⚠️ No hay datos de equipos para exportar');
        return;
    }
    
    var data = obtenerDatosContado();
    var fecha = data && data.date || 'No disponible';
    
    var excelData = [
        ['RESUMEN POR EQUIPO - VENTAS DE CONTADO'],
        ['Fecha: ' + formatDate(fecha)],
        [],
        ['Equipo / Asesor', 'Equipos ≥ $1,500', 'Equipos < $1,500', 'Total Equipos']
    ];
    
    for (var i = 0; i < equipos.length; i++) {
        var equipo = equipos[i];
        excelData.push(['📁 ' + equipo.nombre + ' (TOTAL)', equipo.equipoAlta, equipo.equipoBaja, equipo.equipoTotal]);
        excelData.push(['  👑 ' + equipo.liderNombre, equipo.liderAlta, equipo.liderBaja, equipo.liderTotal]);
        for (var j = 0; j < equipo.miembros.length; j++) {
            var miembro = equipo.miembros[j];
            excelData.push(['  └─ ' + miembro.nombre, miembro.alta, miembro.baja, miembro.total]);
        }
        excelData.push(['', '', '', '']);
    }
    
    var totalAlta = equipos.reduce(function(sum, e) { return sum + e.equipoAlta; }, 0);
    var totalBaja = equipos.reduce(function(sum, e) { return sum + e.equipoBaja; }, 0);
    var totalGeneral = equipos.reduce(function(sum, e) { return sum + e.equipoTotal; }, 0);
    
    excelData.push(['TOTAL GENERAL:', totalAlta, totalBaja, totalGeneral]);
    excelData.push([]);
    excelData.push(['Nota:', 'Los líderes aparecen con 👑 y los miembros con └─']);
    
    try {
        if (typeof XLSX !== 'undefined') {
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(excelData);
            ws['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Resumen Equipos');
            XLSX.writeFile(wb, 'resumen_equipos_' + fecha + '.xlsx');
            console.log('✅ Resumen exportado correctamente.');
        } else {
            exportToCSV(excelData, 'resumen_equipos_' + fecha);
        }
    } catch(e) {
        console.error('❌ Error exportando resumen:', e);
        exportToCSV(excelData, 'resumen_equipos_' + fecha);
    }
}

// ==================== ANÁLISIS DE MARKUP ====================

var markupAnalizadoEnConsultaActual = false;
var cachedMarkupResults = null;

function analyzeAllMarkup() {
    console.log('📊 [MARKUP] Iniciando análisis de markup...');
    
    var data = obtenerDatosContado();
    if (!data || !data.results || data.results.length === 0) {
        showError('contado', 'Primero consulta las ventas del día');
        return;
    }
    
    if (markupAnalizadoEnConsultaActual) {
        showInfo('contado', '⚠️ Ya se analizó el markup de esta consulta.', true);
        return;
    }
    
    var btnCard = document.getElementById('btnAnalyzeAllMarkup');
    if (!btnCard) return;
    
    var originalContent = btnCard.innerHTML;
    btnCard.innerHTML = '\
        <div class="stat-number">\
            <span class="loading-spinner-small" style="width:24px;height:24px;border-width:3px;"></span>\
        </div>\
        <div class="stat-label">Analizando markup...</div>\
        <div style="font-size:0.65rem; margin-top:4px;">Obteniendo costos</div>\
    ';
    btnCard.style.cursor = 'wait';
    btnCard.disabled = true;
    
    (async function() {
        try {
            var results = data.results;
            var totalEquipos = results.length;
            var equiposConCosto = [];
            var equiposSinCosto = [];
            var sumaVentas = 0;
            var sumaCostos = 0;
            
            console.log('📊 [MARKUP] Procesando ' + totalEquipos + ' equipos...');
            
            for (var i = 0; i < results.length; i++) {
                var item = results[i];
                var productId = item.productId;
                
                if (!productId || productId === 0) {
                    equiposSinCosto.push({
                        imei: item.imei,
                        producto: item.product,
                        precioVenta: item.price,
                        razon: 'Sin productId'
                    });
                    continue;
                }
                
                try {
                    var costData = await fetchProductCost(productId);
                    
                    var costoConIva = 0;
                    if (costData && costData.costoConIva !== undefined && costData.costoConIva !== null) {
                        costoConIva = costData.costoConIva;
                    } else if (costData && typeof costData === 'number') {
                        costoConIva = costData * 1.16;
                    } else if (costData && costData.cost !== undefined) {
                        costoConIva = parseFloat(costData.cost) * 1.16;
                    } else if (costData && costData.data && costData.data.cost !== undefined) {
                        costoConIva = parseFloat(costData.data.cost) * 1.16;
                    }
                    
                    if (costoConIva > 0) {
                        var precioVenta = item.price;
                        var utilidad = precioVenta - costoConIva;
                        var margen = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;
                        
                        equiposConCosto.push({
                            success: true,
                            imei: item.imei,
                            producto: item.product,
                            precioVenta: precioVenta,
                            costo: costoConIva,
                            utilidad: utilidad,
                            margen: margen,
                            vendedor: item.seller,
                            linea: item.line,
                            branch: item.branch,
                            ruta: item.ruta,
                            iccid: item.iccid
                        });
                        sumaVentas += precioVenta;
                        sumaCostos += costoConIva;
                    } else {
                        equiposSinCosto.push({
                            imei: item.imei,
                            producto: item.product,
                            precioVenta: item.price,
                            razon: 'Costo no disponible'
                        });
                    }
                } catch (error) {
                    equiposSinCosto.push({
                        imei: item.imei,
                        producto: item.product,
                        precioVenta: item.price,
                        razon: 'Error: ' + error.message
                    });
                }
                
                var progreso = Math.round(((i + 1) / totalEquipos) * 100);
                btnCard.innerHTML = '\
                    <div class="stat-number">\
                        <span class="loading-spinner-small" style="width:24px;height:24px;border-width:3px;"></span>\
                    </div>\
                    <div class="stat-label">Analizando markup...</div>\
                    <div style="font-size:0.65rem; margin-top:4px;">' + (i + 1) + '/' + totalEquipos + ' (' + progreso + '%)</div>\
                ';
            }
            
            var equiposConCostoCount = equiposConCosto.length;
            var utilidadTotal = sumaVentas - sumaCostos;
            var margenPromedio = sumaVentas > 0 ? (utilidadTotal / sumaVentas) * 100 : 0;
            
            console.log('📊 [MARKUP] RESULTADOS:');
            console.log('  Equipos con costo:', equiposConCostoCount);
            console.log('  Equipos sin costo:', equiposSinCosto.length);
            console.log('  Suma Ventas:', sumaVentas);
            console.log('  Suma Costos:', sumaCostos);
            console.log('  Utilidad Total:', utilidadTotal);
            console.log('  Margen Promedio:', margenPromedio);
            
            cachedMarkupResults = {
                fecha: data.date,
                equiposConCosto: equiposConCosto,
                equiposSinCosto: equiposSinCosto,
                totalEquipos: totalEquipos,
                equiposAnalizados: equiposConCostoCount,
                sumaVentas: sumaVentas,
                sumaCostos: sumaCostos,
                utilidadTotal: utilidadTotal,
                margenPromedio: margenPromedio
            };
            
            var warningHtml = '';
            if (equiposSinCosto.length > 0) {
                var listaProductos = equiposSinCosto.slice(0, 5).map(function(e) { return e.producto; }).join(', ');
                if (equiposSinCosto.length > 5) {
                    listaProductos += '... y ' + (equiposSinCosto.length - 5) + ' más';
                }
                warningHtml = '\
                    <div style="font-size:0.6rem; margin-top:8px; color:#fcd34d; cursor:help; border-top:1px solid rgba(255,255,255,0.2); padding-top:6px;" \
                         title="Equipos sin costo: ' + equiposSinCosto.length + ' de ' + totalEquipos + '\\n' + listaProductos + '">\
                        ⚠️ ' + equiposSinCosto.length + ' equipos sin costo\
                    </div>\
                ';
            }
            
            if (equiposConCostoCount > 0) {
                btnCard.innerHTML = '\
                    <div class="stat-number" style="font-size:1.5rem;">' + margenPromedio.toFixed(1) + '%</div>\
                    <div class="stat-label">📊 Markup Promedio</div>\
                    <div style="font-size:0.7rem; margin-top:4px;">\
                        Utilidad: ' + new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(utilidadTotal) + '\
                    </div>\
                    <div style="font-size:0.6rem; margin-top:2px; opacity:0.8;">\
                        Basado en ' + equiposConCostoCount + '/' + totalEquipos + ' equipos\
                    </div>\
                    ' + warningHtml + '\
                ';
                showInfo('contado', '✅ Análisis completado: ' + margenPromedio.toFixed(1) + '% de markup promedio (Utilidad: ' + new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(utilidadTotal) + ')', false);
            } else {
                btnCard.innerHTML = '\
                    <div class="stat-number" style="font-size:1.2rem;">⚠️</div>\
                    <div class="stat-label">Sin datos de costo</div>\
                    <div style="font-size:0.6rem; margin-top:4px; opacity:0.8;">' + totalEquipos + ' equipos sin costo</div>\
                    ' + warningHtml + '\
                ';
                showInfo('contado', '⚠️ No se pudo calcular el markup: ningún producto tiene costo registrado', true);
            }
            btnCard.style.cursor = 'pointer';
            btnCard.disabled = false;
            
            markupAnalizadoEnConsultaActual = true;
            
        } catch (error) {
            console.error('❌ [MARKUP] Error en análisis:', error);
            btnCard.innerHTML = originalContent;
            btnCard.style.cursor = 'pointer';
            btnCard.disabled = false;
            showError('contado', 'Error al analizar markup: ' + error.message);
        }
    })();
}

function resetMarkupAnalysis() {
    markupAnalizadoEnConsultaActual = false;
    cachedMarkupResults = null;
    var btnCard = document.getElementById('btnAnalyzeAllMarkup');
    if (btnCard) {
        btnCard.innerHTML = '\
            <div class="stat-number">📊</div>\
            <div class="stat-label">Analizar Markup</div>\
            <div style="font-size:0.65rem; margin-top:4px;">General del día</div>\
        ';
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
    }
}

// ==================== EXPONER FUNCIONES GLOBALMENTE ====================
window.generateSalesReportAllLines = generateSalesReportAllLines;
window.exportAllContadoToExcel = exportAllContadoToExcel;
window.openResumenModal = openResumenModal;
window.openAsesorSummaryModal = openAsesorSummaryModal;
window.exportAsesorSummaryToExcel = exportAsesorSummaryToExcel;
window.analyzeAllMarkup = analyzeAllMarkup;
window.resetMarkupAnalysis = resetMarkupAnalysis;
window.obtenerDatosContado = obtenerDatosContado;

console.log('✅ Módulo contado.js cargado correctamente');