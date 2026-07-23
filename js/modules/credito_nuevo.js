// ==================== MÓDULO: VENTAS A CRÉDITO (sale_type=credit) ====================

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

// Variable global para almacenar datos
var cachedCreditData = null;

// Función para formatear moneda
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(amount);
}

// Función para obtener el IMEI de una venta (SOLO IMEI, product_specification_id === 1)
function obtenerImei(sale) {
    var details = sale.details || [];
    for (var dIdx = 0; dIdx < details.length; dIdx++) {
        var detail = details[dIdx];
        var groups = detail.specification_groups || [];
        for (var gIdx = 0; gIdx < groups.length; gIdx++) {
            var group = groups[gIdx];
            var specs = group.specification_details || [];
            for (var sIdx = 0; sIdx < specs.length; sIdx++) {
                var spec = specs[sIdx];
                // SOLO IMEI (product_specification_id === 1)
                if (spec.product_specification_id === 1 && spec.value && isValidImei(spec.value)) {
                    return spec.value;
                }
            }
        }
    }
    return null;
}

// Función para verificar si una venta tiene IMEI
function tieneImeiValido(sale) {
    return obtenerImei(sale) !== null;
}

// Función para obtener el producto asociado al IMEI
function obtenerProductoPorImei(sale, imei) {
    var details = sale.details || [];
    for (var dIdx = 0; dIdx < details.length; dIdx++) {
        var detail = details[dIdx];
        var groups = detail.specification_groups || [];
        for (var gIdx = 0; gIdx < groups.length; gIdx++) {
            var group = groups[gIdx];
            var specs = group.specification_details || [];
            for (var sIdx = 0; sIdx < specs.length; sIdx++) {
                var spec = specs[sIdx];
                if (spec.value === imei) {
                    if (detail.product && detail.product.name) {
                        return {
                            name: detail.product.name,
                            id: detail.product.id,
                            line_id: detail.product.line_id
                        };
                    }
                }
            }
        }
    }
    return null;
}

async function generateCreditReport() {
    var date = document.getElementById('creditoNuevoDate').value;
    if (!date) { showError('creditoNuevo', 'Seleccione fecha'); return; }
    
    var btn = document.getElementById('btnCreditoNuevo');
    var originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    try {
        var range = getDateRangeContado(date);
        if (!range) throw new Error('Error en fecha');
        
        // ====== UNA SOLA CONSULTA ======
        var url = CONFIG.API_SALES + '?page=1&per_page=100&sale_type=credit&start_date=' + range.start + '&end_date=' + range.end;
        console.log('📡 Consultando ventas a crédito:', url);
        
        var response = await fetch(url, { 
            headers: { 'Authorization': 'Bearer ' + CONFIG.FIXED_TOKEN } 
        });
        
        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        var data = await response.json();
        var sales = data.data || [];
        
        console.log('📊 Total ventas a crédito:', sales.length);
        
        // Mapa para almacenar resultados
        var ventasMap = new Map();
        
        // Contadores por plataforma
        var platformCount = new Map();
        var platformDownPayment = new Map();
        var advisorByPlatform = new Map();
        
        // Contadores
        var ventasSinImeiCount = 0;
        var ventasLineaNuevaCount = 0;
        var ventasConImeiCount = 0;
        
        for (var saleIdx = 0; saleIdx < sales.length; saleIdx++) {
            var sale = sales[saleIdx];
            
            // Obtener la plataforma de crédito
            var creditPlatform = 'No especificada';
            var creditProviderId = null;
            if (sale.credit_provider) {
                creditProviderId = sale.credit_provider.id;
                if (sale.credit_provider.equipment_value) {
                    creditPlatform = sale.credit_provider.equipment_value;
                } else if (sale.credit_provider.name) {
                    creditPlatform = sale.credit_provider.name;
                }
            }
            
            // Verificar si es Linea Nueva Telcel (credit_provider_id=5)
            var esLineaNueva = (creditProviderId === 5);
            
            // Obtener la sucursal de la venta
            var branchName = 'No disponible';
            if (sale.warehouse && sale.warehouse.branch && sale.warehouse.branch.name) {
                branchName = sale.warehouse.branch.name;
            } else if (sale.branch_name) {
                branchName = sale.branch_name;
            }
            
            // Obtener la ruta de la sucursal
            var ruta = getRutaByBranch(branchName);
            
            // Calcular el enganche total de la venta
            var downPayment = 0;
            var details = sale.details || [];
            for (var dIdx = 0; dIdx < details.length; dIdx++) {
                var detail = details[dIdx];
                if (detail.payment_type === 'Enganche') {
                    var montoEnganche = parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;
                    downPayment += montoEnganche;
                }
            }
            
            // Obtener el asesor
            var advisorId = sale.user && sale.user.id || null;
            var advisorName = sale.user && sale.user.name || 'No disponible';
            
            // ====== DETERMINAR SI TIENE IMEI (SOLO IMEI) ======
            var imeiValue = obtenerImei(sale);
            var tieneImei = imeiValue !== null;
            
            // Obtener información del producto asociado al IMEI
            var productoInfo = null;
            var productName = '';
            var productId = null;
            var lineId = null;
            var isLibre = false;
            var line = 'Telcel';
            
            if (tieneImei) {
                productoInfo = obtenerProductoPorImei(sale, imeiValue);
                if (productoInfo) {
                    productName = productoInfo.name;
                    productId = productoInfo.id;
                    lineId = productoInfo.line_id;
                    isLibre = (productName || '').toLowerCase().includes('libre');
                    line = isLibre ? 'Libre' : 'Telcel';
                } else {
                    // Buscar producto en cualquier detalle
                    for (var dIdx2 = 0; dIdx2 < details.length; dIdx2++) {
                        var detail2 = details[dIdx2];
                        if (detail2.product && detail2.product.name) {
                            productName = detail2.product.name;
                            productId = detail2.product.id;
                            lineId = detail2.product.line_id;
                            isLibre = (productName || '').toLowerCase().includes('libre');
                            line = isLibre ? 'Libre' : 'Telcel';
                            break;
                        }
                    }
                }
            }
            
            // ====== REGLAS DE FILTRADO ======
            var incluirVenta = false;
            
            if (esLineaNueva) {
                // Linea Nueva Telcel: SIEMPRE se incluye
                incluirVenta = true;
                ventasLineaNuevaCount++;
                
                if (!tieneImei) {
                    ventasSinImeiCount++;
                    productName = 'N/A';
                    productId = null;
                    imeiValue = '';
                } else {
                    ventasConImeiCount++;
                }
            } else {
                // Otras plataformas: SOLO se incluyen si tienen IMEI
                if (tieneImei) {
                    incluirVenta = true;
                    ventasConImeiCount++;
                }
            }
            
            // ====== CONTAR POR PLATAFORMA (SOLO VENTAS QUE SE INCLUYEN) ======
            if (incluirVenta) {
                var platformName = creditPlatform;
                if (esLineaNueva) {
                    platformName = 'Linea Nueva Telcel';
                }
                
                if (platformCount.has(platformName)) {
                    platformCount.set(platformName, platformCount.get(platformName) + 1);
                } else {
                    platformCount.set(platformName, 1);
                }
                
                if (platformDownPayment.has(platformName)) {
                    platformDownPayment.set(platformName, platformDownPayment.get(platformName) + downPayment);
                } else {
                    platformDownPayment.set(platformName, downPayment);
                }
                
                var advisorKey = (advisorId || advisorName) + '|' + platformName;
                if (!advisorByPlatform.has(advisorKey)) {
                    advisorByPlatform.set(advisorKey, {
                        asesorId: advisorId,
                        asesor: advisorName,
                        plataforma: platformName,
                        cantidad: 0
                    });
                }
                advisorByPlatform.get(advisorKey).cantidad++;
                
                var key = 'sale_' + sale.id;
                if (!ventasMap.has(key)) {
                    ventasMap.set(key, {
                        imei: imeiValue || '',
                        product: productName || (tieneImei ? 'Producto sin nombre' : 'N/A'),
                        saleId: sale.id,
                        seller: advisorName,
                        sellerId: advisorId,
                        line: line,
                        productId: productId,
                        creditPlatform: esLineaNueva ? 'Linea Nueva Telcel' : creditPlatform,
                        downPayment: downPayment,
                        branch: branchName,
                        ruta: ruta,
                        tieneImei: tieneImei,
                        esLineaNueva: esLineaNueva
                    });
                }
            }
        }
        
        var results = Array.from(ventasMap.values());
        
        // ========== ORDENAR POR RUTA, SUCURSAL, VENDEDOR ==========
        results.sort(function(a, b) {
            var rutaCompare = (a.ruta || 'Sin Ruta').localeCompare(b.ruta || 'Sin Ruta');
            if (rutaCompare !== 0) return rutaCompare;
            var branchCompare = (a.branch || 'No disponible').localeCompare(b.branch || 'No disponible');
            if (branchCompare !== 0) return branchCompare;
            return (a.seller || '').localeCompare(b.seller || '');
        });
        
        var sinImeiCount = results.filter(function(r) { return r.esLineaNueva && !r.tieneImei; }).length;
        var totalResults = results.length;
        
        console.log('📊 RESULTADOS FINALES:');
        console.log('  Total ventas en tabla:', totalResults);
        console.log('  Con IMEI:', ventasConImeiCount);
        console.log('  Linea Nueva:', ventasLineaNuevaCount);
        console.log('  Sin IMEI (Linea Nueva):', sinImeiCount);
        console.log('  Plataformas:', platformCount.size);
        
        // Estadísticas de plataformas
        var platformStats = Array.from(platformCount.entries()).map(function(entry) { 
            return { 
                name: entry[0], 
                count: entry[1],
                downPayment: platformDownPayment.get(entry[0]) || 0
            };
        }).sort(function(a, b) { return b.count - a.count; });
        
        // Guardar en caché
        window.cachedCreditData = { 
            date: date, 
            results: results, 
            platformStats: platformStats,
            ventasLineaNuevaCount: ventasLineaNuevaCount,
            sinImeiCount: sinImeiCount,
            ventasConImeiCount: ventasConImeiCount
        };
        cachedCreditData = window.cachedCreditData;
        
        // Guardar en storage
        try {
            var dataToStore = {
                date: date,
                results: results,
                platformStats: platformStats,
                ventasLineaNuevaCount: ventasLineaNuevaCount,
                sinImeiCount: sinImeiCount,
                ventasConImeiCount: ventasConImeiCount
            };
            sessionStorage.setItem('creditoData', JSON.stringify(dataToStore));
            localStorage.setItem('creditoData', JSON.stringify(dataToStore));
        } catch(e) {}
        
        // Resetear análisis de enganche
        resetEngancheAnalysis();
        
        // Mostrar estadísticas
        var statsHtml = '\
            <button class="stat-card-btn" data-filter="all"><div class="stat-number">' + totalResults + '</div><div class="stat-label">📱 Total Ventas</div></button>\
            <button class="stat-card-btn" data-filter="telcel"><div class="stat-number">' + results.filter(function(r){return r.line==='Telcel';}).length + '</div><div class="stat-label">📶 Telcel</div></button>\
            <button class="stat-card-btn" data-filter="libre"><div class="stat-number">' + results.filter(function(r){return r.line==='Libre';}).length + '</div><div class="stat-label">🔓 Libre</div></button>\
            <button class="stat-card-btn" data-filter="plataformas"><div class="stat-number">' + platformStats.length + '</div><div class="stat-label">🏦 Plataformas</div></button>\
            <button class="stat-card-btn" id="btnAnalyzeAllEnganche" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">\
                <div class="stat-number">📊</div>\
                <div class="stat-label">Analizar Enganche</div>\
                <div style="font-size:0.65rem; margin-top:4px;">% sobre costo</div>\
            </button>\
            <button class="stat-card-btn" id="btnAsesorSummaryCredit"><div class="stat-number">👥</div><div class="stat-label">Resumen Asesores</div></button>\
        ';
        document.getElementById('creditoNuevoStats').innerHTML = statsHtml;
        document.getElementById('creditoNuevoStats').style.display = 'grid';
        
        // ========== TABLA ==========
        var html = '<div class="table-container">';
        
        if (results.length > 0) {
            html += '\
                <div style="display: flex; justify-content: flex-end; margin-bottom: 16px; gap: 10px;">\
                    <button id="exportAllCreditBtn" style="\
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
        
        html += '\
            <table class="imei-table">\
                <thead>\
                    <tr>\
                        <th>#</th>\
                        <th>Venta</th>\
                        <th>Línea</th>\
                        <th>Plataforma</th>\
                        <th>IMEI</th>\
                        <th>Producto</th>\
                        <th>Ruta</th>\
                        <th>Tienda</th>\
                        <th>Vendedor</th>\
                        <th>Enganche</th>\
                    </tr>\
                </thead>\
                <tbody>';
        
        results.forEach(function(item, i) {
            var imeiDisplay = '';
            var productoDisplay = '';
            var rowBg = '';
            
            if (item.esLineaNueva && !item.tieneImei) {
                // Estilo personalizado para Linea Nueva sin IMEI
                imeiDisplay = '<span style="color: #dc2626; font-style: italic; font-weight: bold;">  -- LINEA</span>';
                productoDisplay = '<span style="color: #dc2626; font-style: italic; font-weight: bold;">LIBRE --</span>';
                rowBg = ' style="background-color: #fef2f2;"';
            } else if (item.tieneImei) {
                imeiDisplay = '<code>' + item.imei + '</code>';
                productoDisplay = escapeHtml(item.product);
            } else {
                imeiDisplay = '<span style="color: #94a3b8;">N/A</span>';
                productoDisplay = '<span style="color: #94a3b8;">N/A</span>';
            }
            
            var rutaColor = item.ruta === 'Sin Ruta' ? '#94a3b8' : '#f97316';
            
            html += '<tr' + rowBg + '>\
                <td>' + (i+1) + '</td>\
                <td><button class="badge-sale-id" onclick="openReceipt(' + item.saleId + ')">📄 #' + item.saleId + '</button></td>\
                <td><span class="badge-' + (item.line==='Telcel'?'telcel':'libre') + '">📱 ' + item.line + '</span></td>\
                <td><span class="badge-credit-platform" style="background: #7c3aed; color: white; padding: 2px 10px; border-radius: 20px; font-size: 0.7rem;">🏦 ' + escapeHtml(item.creditPlatform) + '</span></td>\
                <td>' + imeiDisplay + '</td>\
                <td>' + productoDisplay + '</td>\
                <td><span style="background: ' + rutaColor + '; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.65rem;">' + item.ruta + '</span></td>\
                <td>' + escapeHtml(item.branch) + '</td>\
                <td>' + escapeHtml(item.seller) + '</td>\
                <td style="text-align: right; font-weight: bold; color: #f97316;">' + formatCurrency(item.downPayment) + '</td>\
            </tr>';
        });
        
        html += '</tbody></table></div>';
        
        document.getElementById('creditoNuevoResults').innerHTML = html;
        document.getElementById('creditoNuevoResults').style.display = 'block';
        
        // Eventos de estadísticas
        document.querySelectorAll('#creditoNuevoStats .stat-card-btn[data-filter]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var filter = btn.getAttribute('data-filter');
                if (filter === 'plataformas') {
                    openCreditPlatformModal(platformStats);
                } else {
                    openCreditResumenModal(filter);
                }
            });
        });
        
        // Evento para resumen de asesores
        var btnAsesorSummary = document.getElementById('btnAsesorSummaryCredit');
        if (btnAsesorSummary) {
            btnAsesorSummary.addEventListener('click', function(e) {
                e.stopPropagation();
                openAsesorSummaryCreditModal();
            });
        }
        
        // Evento para análisis de enganche
        var btnAnalyzeAllEnganche = document.getElementById('btnAnalyzeAllEnganche');
        if (btnAnalyzeAllEnganche) {
            btnAnalyzeAllEnganche.addEventListener('click', function(e) {
                e.stopPropagation();
                analyzeAllEnganche();
            });
        }
        
        // Evento para exportar todas las ventas
        var exportBtn = document.getElementById('exportAllCreditBtn');
        if (exportBtn) {
            var newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            newExportBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                exportAllCreditToExcel();
            };
        }
        
        if (totalResults === 0) {
            showInfo('creditoNuevo', '⚠️ No se encontraron ventas a crédito para el día ' + formatDate(date), true);
        } else {
            var msg = '✅ Se encontraron ' + totalResults + ' ventas a crédito';
            if (sinImeiCount > 0) {
                msg += ' (' + sinImeiCount + ' sin IMEI de Linea Nueva Telcel)';
            }
            showInfo('creditoNuevo', msg, false);
        }
        
    } catch(e) { 
        console.error('Error en generateCreditReport:', e);
        showError('creditoNuevo', e.message); 
    } finally { 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
    }
}

// ==================== EXPORTAR TODAS LAS VENTAS A EXCEL ====================

function exportAllCreditToExcel() {
    console.log('📊 [EXPORT CREDIT] Iniciando exportación...');
    
    var data = obtenerDatosCredito();
    
    if (!data || !data.results || data.results.length === 0) {
        alert('⚠️ Primero debes consultar las ventas usando el botón "Consultar"');
        showError('creditoNuevo', 'Primero consulta las ventas');
        return;
    }
    
    var date = data.date;
    var results = data.results;
    
    console.log('📊 Exportando ' + results.length + ' registros...');
    
    var excelData = [
        ['REPORTE DE VENTAS A CRÉDITO'],
        ['Fecha: ' + formatDateInput(date)],
        ['Total de ventas: ' + results.length],
        [],
        ['#', 'Venta ID', 'Línea', 'Plataforma', 'IMEI', 'Producto', 'Ruta', 'Tienda', 'Vendedor', 'Enganche']
    ];
    
    var sortedResults = [].concat(results).sort(function(a, b) {
        var rutaCompare = (a.ruta || 'Sin Ruta').localeCompare(b.ruta || 'Sin Ruta');
        if (rutaCompare !== 0) return rutaCompare;
        var branchCompare = (a.branch || 'No disponible').localeCompare(b.branch || 'No disponible');
        if (branchCompare !== 0) return branchCompare;
        return (a.seller || '').localeCompare(b.seller || '');
    });
    
    sortedResults.forEach(function(item, index) {
        var imeiValue = '';
        var productValue = '';
        
        if (item.esLineaNueva && !item.tieneImei) {
            imeiValue = 'SIN IMEI';
            productValue = 'N/A';
        } else {
            imeiValue = item.imei || 'N/A';
            productValue = item.product || 'N/A';
        }
        
        excelData.push([
            index + 1,
            item.saleId || 'N/A',
            item.line || 'N/A',
            item.creditPlatform || 'N/A',
            imeiValue,
            productValue,
            item.ruta || 'Sin Ruta',
            item.branch || 'No disponible',
            item.seller || 'N/A',
            (item.downPayment || 0).toFixed(2)
        ]);
    });
    
    var totalEnganche = results.reduce(function(sum, r) { return sum + (r.downPayment || 0); }, 0);
    var totalTelcel = results.filter(function(r) { return r.line === 'Telcel'; }).length;
    var totalLibre = results.filter(function(r) { return r.line === 'Libre'; }).length;
    var sinImeiCount = results.filter(function(r) { return r.esLineaNueva && !r.tieneImei; }).length;
    
    excelData.push([]);
    excelData.push(['RESUMEN']);
    excelData.push(['Total Ventas', results.length]);
    excelData.push(['Total Telcel', totalTelcel]);
    excelData.push(['Total Libre', totalLibre]);
    excelData.push(['Sin IMEI (Linea Nueva)', sinImeiCount]);
    excelData.push(['Total Enganche', totalEnganche.toFixed(2)]);
    
    try {
        if (typeof XLSX !== 'undefined') {
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(excelData);
            ws['!cols'] = [
                { wch: 5 }, { wch: 12 }, { wch: 10 }, { wch: 20 },
                { wch: 18 }, { wch: 35 }, { wch: 12 }, { wch: 25 },
                { wch: 25 }, { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Ventas Crédito');
            XLSX.writeFile(wb, 'ventas_credito_' + date + '.xlsx');
            showInfo('creditoNuevo', '✅ Exportadas ' + results.length + ' ventas a Excel');
        } else {
            exportToCSV(excelData, 'ventas_credito_' + date);
            showInfo('creditoNuevo', '✅ Exportadas ' + results.length + ' ventas a CSV');
        }
    } catch(e) {
        console.error('Error exportando:', e);
        exportToCSV(excelData, 'ventas_credito_' + date);
        showInfo('creditoNuevo', '✅ Exportadas ' + results.length + ' ventas a CSV (fallback)');
    }
}

// ==================== FUNCIÓN PARA OBTENER DATOS ====================

function obtenerDatosCredito() {
    console.log('🔍 [obtenerDatosCredito] Buscando datos...');
    
    if (window.cachedCreditData && window.cachedCreditData.results && window.cachedCreditData.results.length > 0) {
        console.log('✅ Datos obtenidos de window.cachedCreditData:', window.cachedCreditData.results.length);
        return window.cachedCreditData;
    }
    
    if (cachedCreditData && cachedCreditData.results && cachedCreditData.results.length > 0) {
        console.log('✅ Datos obtenidos de cachedCreditData:', cachedCreditData.results.length);
        return cachedCreditData;
    }
    
    try {
        var stored = sessionStorage.getItem('creditoData');
        if (stored) {
            var parsed = JSON.parse(stored);
            if (parsed && parsed.results && parsed.results.length > 0) {
                console.log('✅ Datos obtenidos de sessionStorage:', parsed.results.length);
                return parsed;
            }
        }
    } catch(e) {}
    
    try {
        var stored2 = localStorage.getItem('creditoData');
        if (stored2) {
            var parsed2 = JSON.parse(stored2);
            if (parsed2 && parsed2.results && parsed2.results.length > 0) {
                console.log('✅ Datos obtenidos de localStorage:', parsed2.results.length);
                return parsed2;
            }
        }
    } catch(e) {}
    
    console.log('❌ No se encontraron datos de crédito');
    return null;
}

// ==================== RESUMEN POR PLATAFORMA ====================

function openCreditPlatformModal(platformStats) {
    var modal = document.getElementById('creditoPlatformModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'creditoPlatformModal';
        modal.className = 'modal';
        modal.innerHTML = '\
            <div class="modal-content" style="max-width: 800px;">\
                <div class="modal-header">\
                    <h3>🏦 Ventas por Plataforma de Crédito</h3>\
                    <span class="close-modal">&times;</span>\
                </div>\
                <div class="modal-body" id="creditoPlatformModalBody"></div>\
                <div class="modal-footer">Plataformas detectadas en las ventas a crédito</div>\
            </div>\
        ';
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = function() { modal.style.display = 'none'; };
        window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    var totalVentas = platformStats.reduce(function(sum, p) { return sum + p.count; }, 0);
    var totalEnganche = platformStats.reduce(function(sum, p) { return sum + (p.downPayment || 0); }, 0);
    
    var tableHtml = '\
        <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">\
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); flex: 1;">\
                <div class="stat-number">' + totalVentas + '</div>\
                <div class="stat-label">Total Ventas</div>\
            </div>\
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); flex: 1;">\
                <div class="stat-number">' + platformStats.length + '</div>\
                <div class="stat-label">Plataformas</div>\
            </div>\
            <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); flex: 1;">\
                <div class="stat-number">' + formatCurrency(totalEnganche) + '</div>\
                <div class="stat-label">💰 Total Enganche</div>\
            </div>\
        </div>\
        <div class="table-container">\
            <table class="resumen-table">\
                <thead>\
                    <tr>\
                        <th>#</th>\
                        <th>Plataforma</th>\
                        <th>Ventas</th>\
                        <th>💰 Total Enganche</th>\
                        <th>%</th>\
                    </tr>\
                </thead>\
                <tbody>';
    
    platformStats.forEach(function(platform, idx) {
        var percentage = totalVentas > 0 ? ((platform.count / totalVentas) * 100).toFixed(1) : 0;
        tableHtml += '<tr>\
            <td>' + (idx+1) + '</td>\
            <td style="text-align:left"><strong>' + escapeHtml(platform.name) + '</strong></td>\
            <td style="text-align:center"><span class="badge-credit-platform" style="background:#7c3aed; color:white; padding:4px 12px;">' + platform.count + '</span></td>\
            <td style="text-align:right; color: #f97316; font-weight: bold;">' + formatCurrency(platform.downPayment || 0) + '</td>\
            <td style="text-align:center;">\
                <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">\
                    <div style="width: 60px; background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 6px;">\
                        <div style="width: ' + percentage + '%; background: linear-gradient(90deg, #7c3aed, #8b5cf6); height: 100%; border-radius: 20px;"></div>\
                    </div>\
                    <span style="font-size: 0.7rem; font-weight: 600;">' + percentage + '%</span>\
                </div>\
            </td>\
        </tr>';
    });
    
    tableHtml += '</tbody></table></div>';
    document.getElementById('creditoPlatformModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
}

// ==================== RESUMEN POR MODELO ====================

function openCreditResumenModal(filter) {
    var data = obtenerDatosCredito();
    if (!data || !data.results) { 
        showError('creditoNuevo', 'Primero consulta las ventas'); 
        return; 
    }
    
    var results = data.results;
    var title = '📱 Resumen de Crédito (Todos)';
    if (filter === 'telcel') { 
        results = data.results.filter(function(r) { return r.line === 'Telcel'; }); 
        title = '📶 Resumen de Crédito TELCEL'; 
    } else if (filter === 'libre') { 
        results = data.results.filter(function(r) { return r.line === 'Libre'; }); 
        title = '🔓 Resumen de Crédito LIBRE'; 
    }
    
    var productMap = new Map();
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var productName = item.product || 'N/A';
        if (item.esLineaNueva && !item.tieneImei) {
            productName = 'N/A';
        }
        if (productMap.has(productName)) {
            var existing = productMap.get(productName);
            existing.cantidad++;
            existing.totalEnganche += (item.downPayment || 0);
        } else {
            productMap.set(productName, { 
                nombre: productName, 
                cantidad: 1, 
                totalEnganche: (item.downPayment || 0)
            });
        }
    }
    var productos = Array.from(productMap.values()).sort(function(a,b) { return a.nombre.localeCompare(b.nombre); });
    var totalUnidades = productos.reduce(function(sum, p) { return sum + p.cantidad; }, 0);
    var totalEnganche = productos.reduce(function(sum, p) { return sum + p.totalEnganche; }, 0);
    
    var modal = document.getElementById('creditoResumenModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'creditoResumenModal';
        modal.className = 'modal';
        modal.innerHTML = '<div class="modal-content"><div class="modal-header"><h3 id="creditoResumenModalTitle">📊 Resumen de equipos a crédito</h3><span class="close-modal">&times;</span></div><div class="modal-body" id="creditoResumenModalBody"></div></div>';
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = function() { modal.style.display = 'none'; };
        window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    document.getElementById('creditoResumenModalTitle').innerHTML = title;
    
    var tableHtml = '<div class="stats" style="margin-bottom:20px">\
        <div class="stat-card"><div class="stat-number">' + totalUnidades + '</div><div class="stat-label">Total Equipos</div></div>\
        <div class="stat-card"><div class="stat-number">' + formatCurrency(totalEnganche) + '</div><div class="stat-label">Total Enganche</div></div>\
    </div>\
    <div class="table-container">\
        <table class="resumen-table">\
            <thead><tr><th>#</th><th>Modelo / Producto</th><th>Cantidad</th><th>Total Enganche</th></tr></thead>\
            <tbody>';
    
    productos.forEach(function(prod, idx) { 
        tableHtml += '<tr>\
            <td>' + (idx+1) + '</td>\
            <td style="text-align:left">' + escapeHtml(prod.nombre) + '</td>\
            <td style="text-align:center"><strong>' + prod.cantidad + '</strong></td>\
            <td style="text-align:right; color: #f97316;">' + formatCurrency(prod.totalEnganche) + '</td>\
        </tr>';
    });
    
    tableHtml += '</tbody></table></div>';
    document.getElementById('creditoResumenModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
}

// ==================== RESUMEN DE ASESORES (CORREGIDO) ====================

function openAsesorSummaryCreditModal() {
    var data = obtenerDatosCredito();
    if (!data || !data.results) { 
        showError('creditoNuevo', 'Primero consulta las ventas'); 
        return; 
    }
    
    var results = data.results;
    var ventasPorAsesor = new Map();
    var todasPlataformas = new Set();
    
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var asesorId = item.sellerId;
        var asesorNombre = item.seller;
        var plataforma = item.creditPlatform || 'No especificada';
        
        // Determinar si es Linea Nueva sin IMEI (va a columna LIBRE)
        var esLineaNuevaSinImei = item.esLineaNueva && !item.tieneImei;
        // Determinar si es Linea Nueva CON IMEI (va a columna Linea Nueva Telcel)
        var esLineaNuevaConImei = item.esLineaNueva && item.tieneImei;
        
        todasPlataformas.add(plataforma);
        
        var key = asesorId || asesorNombre;
        if (!ventasPorAsesor.has(key)) {
            ventasPorAsesor.set(key, {
                id: asesorId,
                nombre: asesorNombre,
                totalEquipos: 0,
                lineaNueva: 0,      // Linea Nueva CON IMEI
                libreSinImei: 0,    // Linea Nueva SIN IMEI (columna LIBRE)
                porPlataforma: new Map()
            });
        }
        
        var asesorData = ventasPorAsesor.get(key);
        asesorData.totalEquipos++;
        
        if (esLineaNuevaConImei) {
            asesorData.lineaNueva++;
        }
        if (esLineaNuevaSinImei) {
            asesorData.libreSinImei++;
        }
        
        // Solo contar en plataforma si NO es Linea Nueva sin IMEI
        if (!esLineaNuevaSinImei) {
            if (asesorData.porPlataforma.has(plataforma)) {
                asesorData.porPlataforma.set(plataforma, asesorData.porPlataforma.get(plataforma) + 1);
            } else {
                asesorData.porPlataforma.set(plataforma, 1);
            }
        }
    }
    
    // Ordenar plataformas: primero las que no son "Linea Nueva Telcel", luego esa
    var plataformasList = Array.from(todasPlataformas).sort(function(a, b) {
        if (a === 'Linea Nueva Telcel') return 1;
        if (b === 'Linea Nueva Telcel') return -1;
        return a.localeCompare(b);
    });
    
    var equipos = [];
    
    for (var teamName in TEAM_STRUCTURE) {
        if (TEAM_STRUCTURE.hasOwnProperty(teamName)) {
            var teamData = TEAM_STRUCTURE[teamName];
            var liderTotal = 0;
            var liderLineaNueva = 0;
            var liderLibreSinImei = 0;
            var liderPorPlataforma = new Map();
            plataformasList.forEach(function(p) { liderPorPlataforma.set(p, 0); });
            
            if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
                var lider = ventasPorAsesor.get(teamData.liderId);
                liderTotal = lider.totalEquipos;
                liderLineaNueva = lider.lineaNueva || 0;
                liderLibreSinImei = lider.libreSinImei || 0;
                for (var pIdx = 0; pIdx < plataformasList.length; pIdx++) {
                    var plat = plataformasList[pIdx];
                    liderPorPlataforma.set(plat, lider.porPlataforma.get(plat) || 0);
                }
            } else {
                for (var kv of ventasPorAsesor) {
                    if (kv[1].nombre === teamData.liderNombre) {
                        liderTotal = kv[1].totalEquipos;
                        liderLineaNueva = kv[1].lineaNueva || 0;
                        liderLibreSinImei = kv[1].libreSinImei || 0;
                        for (var pIdx2 = 0; pIdx2 < plataformasList.length; pIdx2++) {
                            var plat2 = plataformasList[pIdx2];
                            liderPorPlataforma.set(plat2, kv[1].porPlataforma.get(plat2) || 0);
                        }
                        break;
                    }
                }
            }
            
            var miembros = [];
            var equipoTotal = liderTotal;
            var equipoLineaNueva = liderLineaNueva;
            var equipoLibreSinImei = liderLibreSinImei;
            var equipoPorPlataforma = new Map();
            plataformasList.forEach(function(p) { equipoPorPlataforma.set(p, liderPorPlataforma.get(p)); });
            
            for (var mIdx = 0; mIdx < teamData.miembros.length; mIdx++) {
                var miembroId = teamData.miembros[mIdx];
                var miembroTotal = 0;
                var miembroLineaNueva = 0;
                var miembroLibreSinImei = 0;
                var miembroPorPlataforma = new Map();
                plataformasList.forEach(function(p) { miembroPorPlataforma.set(p, 0); });
                var miembroInfo = null;
                
                if (ventasPorAsesor.has(miembroId)) {
                    miembroInfo = ventasPorAsesor.get(miembroId);
                    miembroTotal = miembroInfo.totalEquipos;
                    miembroLineaNueva = miembroInfo.lineaNueva || 0;
                    miembroLibreSinImei = miembroInfo.libreSinImei || 0;
                    for (var pIdx3 = 0; pIdx3 < plataformasList.length; pIdx3++) {
                        var plat3 = plataformasList[pIdx3];
                        miembroPorPlataforma.set(plat3, miembroInfo.porPlataforma.get(plat3) || 0);
                    }
                } else {
                    for (var kv2 of ventasPorAsesor) {
                        if (kv2[1].id === miembroId) {
                            miembroTotal = kv2[1].totalEquipos;
                            miembroLineaNueva = kv2[1].lineaNueva || 0;
                            miembroLibreSinImei = kv2[1].libreSinImei || 0;
                            miembroInfo = kv2[1];
                            for (var pIdx4 = 0; pIdx4 < plataformasList.length; pIdx4++) {
                                var plat4 = plataformasList[pIdx4];
                                miembroPorPlataforma.set(plat4, kv2[1].porPlataforma.get(plat4) || 0);
                            }
                            break;
                        }
                    }
                }
                
                if (miembroTotal > 0 && miembroInfo) {
                    miembros.push({
                        nombre: miembroInfo.nombre,
                        total: miembroTotal,
                        lineaNueva: miembroLineaNueva,
                        libreSinImei: miembroLibreSinImei,
                        porPlataforma: miembroPorPlataforma
                    });
                    equipoTotal += miembroTotal;
                    equipoLineaNueva += miembroLineaNueva;
                    equipoLibreSinImei += miembroLibreSinImei;
                    for (var pIdx5 = 0; pIdx5 < plataformasList.length; pIdx5++) {
                        var plat5 = plataformasList[pIdx5];
                        equipoPorPlataforma.set(plat5, equipoPorPlataforma.get(plat5) + miembroPorPlataforma.get(plat5));
                    }
                }
            }
            
            miembros.sort(function(a, b) { return b.total - a.total; });
            
            if (equipoTotal > 0) {
                equipos.push({
                    nombre: teamName,
                    liderNombre: teamData.liderNombre,
                    liderTotal: liderTotal,
                    liderLineaNueva: liderLineaNueva,
                    liderLibreSinImei: liderLibreSinImei,
                    liderPorPlataforma: liderPorPlataforma,
                    miembros: miembros,
                    equipoTotal: equipoTotal,
                    equipoLineaNueva: equipoLineaNueva,
                    equipoLibreSinImei: equipoLibreSinImei,
                    equipoPorPlataforma: equipoPorPlataforma
                });
            }
        }
    }
    
    equipos.sort(function(a, b) { return b.equipoTotal - a.equipoTotal; });
    var totalGeneral = equipos.reduce(function(sum, e) { return sum + e.equipoTotal; }, 0);
    var totalLineaNueva = equipos.reduce(function(sum, e) { return sum + e.equipoLineaNueva; }, 0);
    var totalLibreSinImei = equipos.reduce(function(sum, e) { return sum + e.equipoLibreSinImei; }, 0);
    
    var modal = document.getElementById('asesorSummaryCreditModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'asesorSummaryCreditModal';
        modal.className = 'modal';
        modal.innerHTML = '\
            <div class="modal-content" style="max-width: 1200px;">\
                <div class="modal-header">\
                    <h3>👥 Resumen por Equipo - Ventas a Crédito</h3>\
                    <span class="close-modal">&times;</span>\
                </div>\
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">\
                    <button id="exportCreditExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>\
                </div>\
                <div class="modal-body" id="asesorSummaryCreditModalBody"></div>\
                <div class="modal-footer">Ventas a crédito | Cantidades de equipos</div>\
            </div>\
        ';
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = function() { modal.style.display = 'none'; };
        window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    // Construir cabecera: Total | Linea Nueva | LIBRE | [Plataformas]
    var headerColumns = '<th>#</th><th>Equipo / Asesor</th><th style="background: #6d28d9; color: white;">📱 Total</th>';
    headerColumns += '<th style="background: #f97316; color: white;">📱 Linea Nueva</th>';
    headerColumns += '<th style="background: #dc2626; color: white; font-weight: bold;">🔓 LIBRE</th>';
    
    for (var pIdx6 = 0; pIdx6 < plataformasList.length; pIdx6++) {
        var plataforma = plataformasList[pIdx6];
        // Saltar Linea Nueva Telcel porque ya la mostramos como columna separada
        if (plataforma === 'Linea Nueva Telcel') continue;
        var color = '#7c3aed';
        if (plataforma === 'PayJoy') color = '#059669';
        else if (plataforma === 'Amigo Paguitos') color = '#2563eb';
        headerColumns += '<th style="background: ' + color + '; color: white;">🏦 ' + escapeHtml(plataforma.substring(0, 12)) + '</th>';
    }
    
    var tableHtml = '\
        <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px; flex-wrap: wrap;">\
            <div class="stat-card" style="background: #6d28d9; flex: 1;">\
                <div class="stat-number">' + equipos.length + '</div>\
                <div class="stat-label">👥 Equipos con ventas</div>\
            </div>\
            <div class="stat-card" style="background: #1e40af; flex: 1;">\
                <div class="stat-number">' + totalGeneral + '</div>\
                <div class="stat-label">📱 Total Ventas</div>\
            </div>\
            <div class="stat-card" style="background: #f97316; flex: 1;">\
                <div class="stat-number">' + totalLineaNueva + '</div>\
                <div class="stat-label">📱 Linea Nueva</div>\
            </div>\
            <div class="stat-card" style="background: #dc2626; flex: 1;">\
                <div class="stat-number">' + totalLibreSinImei + '</div>\
                <div class="stat-label">🔓 LIBRE (Sin IMEI)</div>\
            </div>\
        </div>\
        <div class="table-container" style="max-height: 500px; overflow-y: auto;">\
            <table class="resumen-table" style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">\
                <thead style="position: sticky; top: 0; background: #f8f9fa;">\
                    <tr>' + headerColumns + '</tr>\
                </thead>\
                <tbody>';
    
    var index = 1;
    for (var eIdx = 0; eIdx < equipos.length; eIdx++) {
        var equipo = equipos[eIdx];
        
        var equipoRow = '<tr style="background-color: #f3e8ff; border-top: 2px solid #7c3aed;">\
            <td style="padding: 6px 8px; text-align: center; font-weight: bold;">' + index + '</td>\
            <td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #7c3aed;">📁 ' + equipo.nombre + '</td>\
            <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #6d28d9;">' + equipo.equipoTotal + '</td>\
            <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #f97316;">' + equipo.equipoLineaNueva + '</td>\
            <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #dc2626;">' + equipo.equipoLibreSinImei + '</td>';
        
        for (var pIdx7 = 0; pIdx7 < plataformasList.length; pIdx7++) {
            var plat6 = plataformasList[pIdx7];
            if (plat6 === 'Linea Nueva Telcel') continue;
            equipoRow += '<td style="padding: 6px 8px; text-align: center; font-weight: bold;">' + equipo.equipoPorPlataforma.get(plat6) + '</td>';
        }
        equipoRow += '</tr>';
        tableHtml += equipoRow;
        index++;
        
        var liderRow = '<tr style="border-bottom: 1px solid #e2e8f0;">\
            <td style="padding: 4px 8px; text-align: center;"></td>\
            <td style="padding: 4px 8px; text-align: left; padding-left: 24px;">👑 ' + equipo.liderNombre + '</td>\
            <td style="padding: 4px 8px; text-align: center; font-weight: bold;">' + equipo.liderTotal + '</td>\
            <td style="padding: 4px 8px; text-align: center; color: #f97316;">' + equipo.liderLineaNueva + '</td>\
            <td style="padding: 4px 8px; text-align: center; color: #dc2626;">' + equipo.liderLibreSinImei + '</td>';
        
        for (var pIdx8 = 0; pIdx8 < plataformasList.length; pIdx8++) {
            var plat7 = plataformasList[pIdx8];
            if (plat7 === 'Linea Nueva Telcel') continue;
            liderRow += '<td style="padding: 4px 8px; text-align: center;">' + equipo.liderPorPlataforma.get(plat7) + '</td>';
        }
        liderRow += '</tr>';
        tableHtml += liderRow;
        
        for (var mIdx2 = 0; mIdx2 < equipo.miembros.length; mIdx2++) {
            var miembro = equipo.miembros[mIdx2];
            var miembroRow = '<tr style="border-bottom: 1px solid #e2e8f0;">\
                <td style="padding: 4px 8px; text-align: center;"></td>\
                <td style="padding: 4px 8px; text-align: left; padding-left: 24px;">└─ ' + escapeHtml(miembro.nombre) + '</td>\
                <td style="padding: 4px 8px; text-align: center;">' + miembro.total + '</td>\
                <td style="padding: 4px 8px; text-align: center; color: #f97316;">' + miembro.lineaNueva + '</td>\
                <td style="padding: 4px 8px; text-align: center; color: #dc2626;">' + miembro.libreSinImei + '</td>';
            
            for (var pIdx9 = 0; pIdx9 < plataformasList.length; pIdx9++) {
                var plat8 = plataformasList[pIdx9];
                if (plat8 === 'Linea Nueva Telcel') continue;
                miembroRow += '<td style="padding: 4px 8px; text-align: center;">' + miembro.porPlataforma.get(plat8) + '</td>';
            }
            miembroRow += '</tr>';
            tableHtml += miembroRow;
        }
    }
    
    tableHtml += '\
                </tbody>\
            </table>\
        </div>';
    
    document.getElementById('asesorSummaryCreditModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
    
    var exportBtn = document.getElementById('exportCreditExcelBtn');
    if (exportBtn) {
        var newExportBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
        newExportBtn.addEventListener('click', function() { exportCreditSummaryToExcel(equipos, plataformasList); });
    }
}

// ==================== EXPORTAR RESUMEN DE ASESORES ====================

function exportCreditSummaryToExcel(equipos, plataformasList) {
    var data = obtenerDatosCredito();
    var fecha = data && data.date || 'No disponible';
    
    // Filtrar plataformas para no incluir "Linea Nueva Telcel" (ya está como columna separada)
    var plataformasFiltradas = plataformasList.filter(function(p) { return p !== 'Linea Nueva Telcel'; });
    
    var excelData = [
        ['RESUMEN POR EQUIPO - VENTAS A CRÉDITO'],
        ['Fecha: ' + date],
        [],
        ['#', 'Equipo / Asesor', 'Total', 'Linea Nueva', 'LIBRE'].concat(plataformasFiltradas)
    ];
    
    for (var eIdx = 0; eIdx < equipos.length; eIdx++) {
        var equipo = equipos[eIdx];
        
        var liderRow = ['Lider', equipo.liderNombre, equipo.liderTotal, equipo.liderLineaNueva, equipo.liderLibreSinImei];
        for (var pIdx = 0; pIdx < plataformasFiltradas.length; pIdx++) {
            liderRow.push(equipo.liderPorPlataforma.get(plataformasFiltradas[pIdx]) || 0);
        }
        excelData.push(liderRow);
        
        for (var mIdx = 0; mIdx < equipo.miembros.length; mIdx++) {
            var miembro = equipo.miembros[mIdx];
            var miembroRow = ['', miembro.nombre, miembro.total, miembro.lineaNueva, miembro.libreSinImei];
            for (var pIdx2 = 0; pIdx2 < plataformasFiltradas.length; pIdx2++) {
                miembroRow.push(miembro.porPlataforma.get(plataformasFiltradas[pIdx2]) || 0);
            }
            excelData.push(miembroRow);
        }
        excelData.push(['', '', '', '', ''].concat(plataformasFiltradas.map(function() { return ''; })));
    }
    
    var totalGeneral = equipos.reduce(function(sum, e) { return sum + e.equipoTotal; }, 0);
    var totalLineaNueva = equipos.reduce(function(sum, e) { return sum + e.equipoLineaNueva; }, 0);
    var totalLibreSinImei = equipos.reduce(function(sum, e) { return sum + e.equipoLibreSinImei; }, 0);
    var totalesPorPlataforma = new Map();
    plataformasFiltradas.forEach(function(p) { totalesPorPlataforma.set(p, 0); });
    
    for (var eIdx2 = 0; eIdx2 < equipos.length; eIdx2++) {
        var equipo2 = equipos[eIdx2];
        for (var pIdx3 = 0; pIdx3 < plataformasFiltradas.length; pIdx3++) {
            var plat = plataformasFiltradas[pIdx3];
            totalesPorPlataforma.set(plat, totalesPorPlataforma.get(plat) + (equipo2.equipoPorPlataforma.get(plat) || 0));
        }
    }
    
    var totalRow = ['', 'TOTAL GENERAL:', totalGeneral, totalLineaNueva, totalLibreSinImei];
    for (var pIdx4 = 0; pIdx4 < plataformasFiltradas.length; pIdx4++) {
        totalRow.push(totalesPorPlataforma.get(plataformasFiltradas[pIdx4]) || 0);
    }
    excelData.push(totalRow);
    
    try {
        if (typeof XLSX !== 'undefined') {
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(excelData);
            XLSX.utils.book_append_sheet(wb, ws, 'Resumen Crédito');
            XLSX.writeFile(wb, 'resumen_credito_' + fecha + '.xlsx');
        } else {
            exportToCSV(excelData, 'resumen_credito_' + fecha);
        }
    } catch(e) {
        console.error('Error exportando:', e);
        exportToCSV(excelData, 'resumen_credito_' + fecha);
    }
}

// ==================== ANÁLISIS DE ENGANCHE ====================

var engancheAnalizadoEnConsultaActual = false;
var cachedEngancheResults = null;

function analyzeAllEnganche() {
    console.log('📊 [ENGANCHE] Iniciando análisis de enganche...');
    
    var data = obtenerDatosCredito();
    if (!data || !data.results || data.results.length === 0) {
        showError('creditoNuevo', 'Primero consulta las ventas del día');
        return;
    }
    
    if (engancheAnalizadoEnConsultaActual) {
        showInfo('creditoNuevo', '⚠️ Ya se analizó el enganche de esta consulta.', true);
        return;
    }
    
    var btnCard = document.getElementById('btnAnalyzeAllEnganche');
    if (!btnCard) return;
    
    var originalContent = btnCard.innerHTML;
    btnCard.innerHTML = '\
        <div class="stat-number">\
            <span class="loading-spinner-small" style="width:24px;height:24px;border-width:3px;"></span>\
        </div>\
        <div class="stat-label">Analizando enganche...</div>\
        <div style="font-size:0.65rem; margin-top:4px;">Obteniendo costos</div>\
    ';
    btnCard.style.cursor = 'wait';
    btnCard.disabled = true;
    
    (async function() {
        try {
            var results = data.results;
            var totalVentas = results.length;
            var equiposConCosto = [];
            var equiposSinCosto = [];
            var sumaEnganches = 0;
            var sumaCostos = 0;
            
            console.log('📊 [ENGANCHE] Procesando ' + totalVentas + ' ventas...');
            
            for (var i = 0; i < results.length; i++) {
                var item = results[i];
                var productId = item.productId;
                
                if (item.esLineaNueva && !item.tieneImei) {
                    equiposSinCosto.push({
                        imei: 'SIN IMEI',
                        producto: 'N/A',
                        enganche: item.downPayment || 0,
                        razon: 'Linea Nueva sin IMEI'
                    });
                    continue;
                }
                
                if (!productId || productId === 0) {
                    equiposSinCosto.push({
                        imei: item.imei || 'Sin IMEI',
                        producto: item.product || 'Sin producto',
                        enganche: item.downPayment || 0,
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
                        var enganche = item.downPayment || 0;
                        var porcentaje = costoConIva > 0 ? (enganche / costoConIva) * 100 : 0;
                        
                        equiposConCosto.push({
                            success: true,
                            imei: item.imei || 'Sin IMEI',
                            producto: item.product || 'Sin producto',
                            costo: costoConIva,
                            enganche: enganche,
                            porcentaje: porcentaje,
                            vendedor: item.seller,
                            plataforma: item.creditPlatform,
                            tieneImei: item.tieneImei,
                            esLineaNueva: item.esLineaNueva
                        });
                        sumaEnganches += enganche;
                        sumaCostos += costoConIva;
                    } else {
                        equiposSinCosto.push({
                            imei: item.imei || 'Sin IMEI',
                            producto: item.product || 'Sin producto',
                            enganche: item.downPayment || 0,
                            razon: 'Costo no disponible'
                        });
                    }
                } catch (error) {
                    equiposSinCosto.push({
                        imei: item.imei || 'Sin IMEI',
                        producto: item.product || 'Sin producto',
                        enganche: item.downPayment || 0,
                        razon: 'Error: ' + error.message
                    });
                }
                
                var progreso = Math.round(((i + 1) / totalVentas) * 100);
                btnCard.innerHTML = '\
                    <div class="stat-number">\
                        <span class="loading-spinner-small" style="width:24px;height:24px;border-width:3px;"></span>\
                    </div>\
                    <div class="stat-label">Analizando enganche...</div>\
                    <div style="font-size:0.65rem; margin-top:4px;">' + (i + 1) + '/' + totalVentas + ' (' + progreso + '%)</div>\
                ';
            }
            
            var equiposAnalizados = equiposConCosto.length;
            var porcentajePromedio = sumaCostos > 0 ? (sumaEnganches / sumaCostos) * 100 : 0;
            
            console.log('📊 [ENGANCHE] RESULTADOS:');
            console.log('  Equipos analizados:', equiposAnalizados);
            console.log('  Equipos sin costo:', equiposSinCosto.length);
            console.log('  Suma Enganches:', sumaEnganches);
            console.log('  Suma Costos:', sumaCostos);
            console.log('  Porcentaje Promedio:', porcentajePromedio);
            
            cachedEngancheResults = {
                fecha: data.date,
                equiposConCosto: equiposConCosto,
                equiposSinCosto: equiposSinCosto,
                totalVentas: totalVentas,
                equiposAnalizados: equiposAnalizados,
                sumaEnganches: sumaEnganches,
                sumaCostos: sumaCostos,
                porcentajePromedio: porcentajePromedio
            };
            
            var warningHtml = '';
            if (equiposSinCosto.length > 0) {
                warningHtml = '\
                    <div style="font-size:0.6rem; margin-top:8px; color:#fcd34d; cursor:help; border-top:1px solid rgba(255,255,255,0.2); padding-top:6px;" \
                         title="Equipos sin costo: ' + equiposSinCosto.length + ' de ' + totalVentas + '">\
                        ⚠️ ' + equiposSinCosto.length + ' equipos sin costo\
                    </div>\
                ';
            }
            
            if (equiposAnalizados > 0) {
                btnCard.innerHTML = '\
                    <div class="stat-number" style="font-size:1.5rem;">' + porcentajePromedio.toFixed(1) + '%</div>\
                    <div class="stat-label">📊 Enganche Promedio</div>\
                    <div style="font-size:0.7rem; margin-top:4px;">\
                        Total Enganche: ' + formatCurrency(sumaEnganches) + '\
                    </div>\
                    <div style="font-size:0.6rem; margin-top:2px; opacity:0.8;">\
                        Basado en ' + equiposAnalizados + '/' + totalVentas + ' equipos\
                    </div>\
                    ' + warningHtml + '\
                ';
                showInfo('creditoNuevo', '✅ Análisis completado: ' + porcentajePromedio.toFixed(1) + '% de enganche promedio sobre costo', false);
            } else {
                btnCard.innerHTML = '\
                    <div class="stat-number" style="font-size:1.2rem;">⚠️</div>\
                    <div class="stat-label">Sin datos de costo</div>\
                    <div style="font-size:0.6rem; margin-top:4px; opacity:0.8;">' + totalVentas + ' equipos sin costo</div>\
                    ' + warningHtml + '\
                ';
                showInfo('creditoNuevo', '⚠️ No se pudo calcular el enganche: ningún producto tiene costo registrado', true);
            }
            btnCard.style.cursor = 'pointer';
            btnCard.disabled = false;
            
            engancheAnalizadoEnConsultaActual = true;
            
        } catch (error) {
            console.error('❌ [ENGANCHE] Error:', error);
            btnCard.innerHTML = originalContent;
            btnCard.style.cursor = 'pointer';
            btnCard.disabled = false;
            showError('creditoNuevo', 'Error al analizar enganche: ' + error.message);
        }
    })();
}

function resetEngancheAnalysis() {
    engancheAnalizadoEnConsultaActual = false;
    cachedEngancheResults = null;
    var btnCard = document.getElementById('btnAnalyzeAllEnganche');
    if (btnCard) {
        btnCard.innerHTML = '\
            <div class="stat-number">📊</div>\
            <div class="stat-label">Analizar Enganche</div>\
            <div style="font-size:0.65rem; margin-top:4px;">% sobre costo</div>\
        ';
        btnCard.style.cursor = 'pointer';
        btnCard.disabled = false;
    }
}

// ==================== EXPONER FUNCIONES GLOBALMENTE ====================
window.generateCreditReport = generateCreditReport;
window.exportAllCreditToExcel = exportAllCreditToExcel;
window.openCreditPlatformModal = openCreditPlatformModal;
window.openCreditResumenModal = openCreditResumenModal;
window.openAsesorSummaryCreditModal = openAsesorSummaryCreditModal;
window.analyzeAllEnganche = analyzeAllEnganche;
window.resetEngancheAnalysis = resetEngancheAnalysis;
window.obtenerDatosCredito = obtenerDatosCredito;

console.log('✅ Módulo credito_nuevo.js cargado correctamente');