// ==================== MÓDULO: ACCESORIOS ====================

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

// Variable global para almacenar datos de accesorios
var cachedAccesoriosData = null;

// Función para formatear moneda
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(amount);
}

// ==================== FUNCIÓN CORREGIDA PARA OBTENER COSTO ====================
async function obtenerCostoProducto(productId) {
    if (!productId || productId === 0) return null;
    try {
        var costData = await fetchProductCost(productId);
        console.log('📊 Costo obtenido para ' + productId + ':', costData);
        
        // Extraer el costo de la estructura correcta
        var costo = null;
        if (costData) {
            // Si es un número directamente
            if (typeof costData === 'number') {
                costo = costData;
            }
            // Si tiene costoConIva (de fetchProductCost)
            else if (costData.costoConIva !== undefined && costData.costoConIva !== null) {
                costo = costData.costoConIva;
            }
            // Si tiene cost (estructura de la API)
            else if (costData.cost !== undefined && costData.cost !== null) {
                costo = parseFloat(costData.cost);
            }
            // Si tiene data.cost (estructura anidada)
            else if (costData.data && costData.data.cost !== undefined) {
                costo = parseFloat(costData.data.cost);
            }
            // Si tiene costo (otra estructura)
            else if (costData.costo !== undefined && costData.costo !== null) {
                costo = parseFloat(costData.costo);
            }
        }
        
        // Si el costo es 0 o null, retornar null
        if (costo === null || costo === 0 || isNaN(costo)) {
            console.warn('⚠️ Costo no válido para ' + productId + ':', costData);
            return null;
        }
        
        // Multiplicar por IVA (1.16) porque el costo viene sin IVA
        var costoConIva = costo * 1.16;
        console.log('✅ Costo con IVA para ' + productId + ':', costoConIva);
        return costoConIva;
        
    } catch (error) {
        console.warn('Error obteniendo costo para producto ' + productId + ':', error);
        return null;
    }
}

// ==================== FUNCIÓN PRINCIPAL ====================
async function searchAccesorios() {
    var date = document.getElementById('accesoriosDate').value;
    if (!date) {
        showError('accesorios', 'Seleccione una fecha');
        return;
    }

    var btn = document.getElementById('searchAccesoriosBtn');
    var originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('accesoriosResults').style.display = 'none';
    document.getElementById('accesoriosErrorAlert').style.display = 'none';
    document.getElementById('accesoriosInfoAlert').style.display = 'none';

    try {
        var range = getDateRangeContado(date);
        if (!range) throw new Error('Error en fecha');
        
        var url = CONFIG.API_SALES + '?page=1&per_page=100&total=0&sale_type=products&classification_ids[]=2&start_date=' + range.start + '&end_date=' + range.end;
        console.log('📡 Consultando accesorios:', url);
        
        var response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + CONFIG.FIXED_TOKEN }
        });
        
        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        var data = await response.json();
        var sales = data.data || [];
        
        console.log('📊 Total ventas de accesorios (crudas):', sales.length);
        
        var ventasIndividuales = [];
        var productosMap = new Map();
        var asesorMap = new Map();
        var totalUnidades = 0;
        var totalVentaGeneral = 0;
        var totalCostoGeneral = 0;
        var totalVentasConAccesorios = 0;
        
        var productIdsSet = new Set();
        var ventasTemp = [];
        
        for (var saleIdx = 0; saleIdx < sales.length; saleIdx++) {
            var sale = sales[saleIdx];
            var tieneAccesorios = false;
            
            var branchName = 'No disponible';
            if (sale.warehouse && sale.warehouse.branch && sale.warehouse.branch.name) {
                branchName = sale.warehouse.branch.name;
            } else if (sale.branch_name) {
                branchName = sale.branch_name;
            }
            
            var ruta = getRutaByBranch(branchName);
            var asesorId = sale.user && sale.user.id || null;
            var asesorNombre = sale.user && sale.user.name || 'No disponible';
            
            var details = sale.details || [];
            for (var dIdx = 0; dIdx < details.length; dIdx++) {
                var detail = details[dIdx];
                var classificationId = detail.product && detail.product.classification_id;
                
                if (classificationId === 2) {
                    tieneAccesorios = true;
                    var productName = detail.product && detail.product.name || 'Desconocido';
                    var productId = detail.product && detail.product.id || 0;
                    var quantity = detail.quantity || 1;
                    var unitPriceSinIva = parseFloat(detail.unit_price) || 0;
                    var unitPriceConIva = unitPriceSinIva * 1.16;
                    var totalProducto = unitPriceConIva * quantity;
                    
                    totalUnidades += quantity;
                    totalVentaGeneral += totalProducto;
                    
                    if (productId && productId !== 0) {
                        productIdsSet.add(productId);
                    }
                    
                    ventasTemp.push({
                        saleId: sale.id,
                        product: productName,
                        productId: productId,
                        quantity: quantity,
                        precioUnitario: unitPriceConIva,
                        total: totalProducto,
                        seller: asesorNombre,
                        sellerId: asesorId,
                        branch: branchName,
                        ruta: ruta
                    });
                    
                    var key = asesorId || asesorNombre;
                    if (asesorMap.has(key)) {
                        var existing = asesorMap.get(key);
                        existing.cantidad += quantity;
                    } else {
                        asesorMap.set(key, {
                            id: asesorId,
                            nombre: asesorNombre,
                            cantidad: quantity
                        });
                    }
                    
                    if (productosMap.has(productName)) {
                        var existingProd = productosMap.get(productName);
                        existingProd.cantidad += quantity;
                        existingProd.total += totalProducto;
                    } else {
                        productosMap.set(productName, {
                            nombre: productName,
                            productId: productId,
                            cantidad: quantity,
                            precioUnitario: unitPriceConIva,
                            total: totalProducto
                        });
                    }
                }
            }
            if (tieneAccesorios) {
                totalVentasConAccesorios++;
            }
        }
        
        // ========== OBTENER COSTOS EN PARALELO ==========
        var costosMap = new Map();
        var productIdsArray = Array.from(productIdsSet);
        console.log('📊 Obteniendo costos para ' + productIdsArray.length + ' productos...');
        
        btn.innerHTML = 'Obteniendo costos... <span class="loading-spinner"></span>';
        
        var batchSize = 10;
        for (var i = 0; i < productIdsArray.length; i += batchSize) {
            var batch = productIdsArray.slice(i, i + batchSize);
            var promises = batch.map(function(id) {
                return obtenerCostoProducto(id);
            });
            var results = await Promise.all(promises);
            for (var j = 0; j < batch.length; j++) {
                costosMap.set(batch[j], results[j]);
            }
            var progreso = Math.round(((i + batch.length) / productIdsArray.length) * 100);
            btn.innerHTML = 'Obteniendo costos... ' + progreso + '% <span class="loading-spinner"></span>';
        }
        
        // ========== ASIGNAR COSTOS A CADA VENTA ==========
        ventasIndividuales = ventasTemp.map(function(item) {
            var costo = costosMap.get(item.productId) || null;
            var costoTotal = costo !== null ? costo * item.quantity : null;
            var utilidad = costo !== null ? item.total - costoTotal : null;
            var margen = (costo !== null && item.total > 0) ? ((item.total - costoTotal) / item.total) * 100 : null;
            
            if (costo !== null) {
                totalCostoGeneral += costoTotal;
            }
            
            return {
                saleId: item.saleId,
                product: item.product,
                productId: item.productId,
                quantity: item.quantity,
                precioUnitario: item.precioUnitario,
                total: item.total,
                seller: item.seller,
                sellerId: item.sellerId,
                branch: item.branch,
                ruta: item.ruta,
                costo: costo,
                costoTotal: costoTotal,
                utilidad: utilidad,
                margen: margen
            };
        });
        
        // ========== ORDENAR VENTAS ==========
        ventasIndividuales.sort(function(a, b) {
            var rutaCompare = (a.ruta || 'Sin Ruta').localeCompare(b.ruta || 'Sin Ruta');
            if (rutaCompare !== 0) return rutaCompare;
            var branchCompare = (a.branch || 'No disponible').localeCompare(b.branch || 'No disponible');
            if (branchCompare !== 0) return branchCompare;
            return (a.seller || '').localeCompare(b.seller || '');
        });
        
        var asesores = Array.from(asesorMap.values()).sort(function(a, b) { return b.cantidad - a.cantidad; });
        
        console.log('📊 Ventas individuales encontradas:', ventasIndividuales.length);
        console.log('📊 Total unidades:', totalUnidades);
        console.log('📊 Total venta:', totalVentaGeneral);
        console.log('📊 Total costo:', totalCostoGeneral);
        
        cachedAccesoriosData = { 
            date: date, 
            asesores: asesores, 
            totalUnidades: totalUnidades,
            ventasIndividuales: ventasIndividuales
        };
        
        window._cachedAccesoriosData = {
            date: date,
            ventasIndividuales: ventasIndividuales,
            totalUnidades: totalUnidades,
            totalVentaGeneral: totalVentaGeneral,
            totalCostoGeneral: totalCostoGeneral,
            totalVentasConAccesorios: totalVentasConAccesorios
        };
        
        var margenPromedioGeneral = totalVentaGeneral > 0 ? ((totalVentaGeneral - totalCostoGeneral) / totalVentaGeneral) * 100 : 0;
        var utilidadTotalGeneral = totalVentaGeneral - totalCostoGeneral;
        
        var marginHtml = '';
        if (totalCostoGeneral > 0) {
            marginHtml = '\
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">\
                    <div class="stat-number" style="color: #ffffff;">' + margenPromedioGeneral.toFixed(1) + '%</div>\
                    <div class="stat-label" style="color: #e9d5ff;">📊 Margen Promedio</div>\
                    <div style="font-size: 0.7rem; margin-top: 8px; color: #c4b5fd;">\
                        Utilidad: ' + formatCurrency(utilidadTotalGeneral) + '\
                    </div>\
                </div>\
            ';
        } else {
            marginHtml = '\
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">\
                    <div class="stat-number" style="color: #ffffff;">N/A</div>\
                    <div class="stat-label" style="color: #e9d5ff;">📊 Margen Promedio</div>\
                    <div style="font-size: 0.7rem; margin-top: 8px; color: #c4b5fd;">Sin costos disponibles</div>\
                </div>\
            ';
        }
        
        var statsHtml = '\
            <div class="stats">\
                <div class="stat-card"><div class="stat-number">' + totalUnidades + '</div><div class="stat-label">Total Unidades</div></div>\
                <div class="stat-card"><div class="stat-number">' + formatCurrency(totalVentaGeneral) + '</div><div class="stat-label">Total Venta</div></div>\
                <div class="stat-card"><div class="stat-number">' + totalVentasConAccesorios + '</div><div class="stat-label">Ventas con accesorios</div></div>\
                ' + marginHtml + '\
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); cursor: pointer;" id="btnAsesorSummaryAccesorios">\
                    <div class="stat-number">👥 ' + asesores.length + '</div>\
                    <div class="stat-label">Resumen Asesores</div>\
                </div>\
            </div>\
        ';
        
        var html = '<div class="table-container">';
        
        if (ventasIndividuales.length > 0) {
            html += '\
                <div style="display: flex; justify-content: flex-end; margin-bottom: 16px; gap: 10px;">\
                    <button id="exportAllAccesoriosBtn" style="\
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
            <table class="accesorios-table">\
                <thead>\
                    <tr>\
                        <th>#</th>\
                        <th>Venta</th>\
                        <th>Ruta</th>\
                        <th>Sucursal</th>\
                        <th>Vendedor</th>\
                        <th>Producto</th>\
                        <th>Cantidad</th>\
                        <th>Precio Unit.</th>\
                        <th>Costo Unit.</th>\
                        <th>Utilidad</th>\
                        <th>Margen</th>\
                        <th>Total</th>\
                    </tr>\
                </thead>\
                <tbody>';
        
        if (ventasIndividuales.length > 0) {
            ventasIndividuales.forEach(function(item, i) {
                var rutaColor = item.ruta === 'Sin Ruta' ? '#94a3b8' : '#f97316';
                var costoDisplay = item.costo !== null ? formatCurrency(item.costo) : '<span style="color: #94a3b8;">N/A</span>';
                var utilidadDisplay = item.utilidad !== null ? formatCurrency(item.utilidad) : '<span style="color: #94a3b8;">N/A</span>';
                var margenDisplay = item.margen !== null ? '<span style="color: ' + (item.margen >= 40 ? '#10b981' : (item.margen >= 20 ? '#f59e0b' : '#ef4444')) + '; font-weight: bold;">' + item.margen.toFixed(1) + '%</span>' : '<span style="color: #94a3b8;">N/A</span>';
                
                html += '<tr>\
                    <td>' + (i+1) + '</td>\
                    <td><button class="badge-sale-id" onclick="openReceipt(' + item.saleId + ')">📄 #' + item.saleId + '</button></td>\
                    <td><span style="background: ' + rutaColor + '; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.65rem;">' + item.ruta + '</span></td>\
                    <td>' + escapeHtml(item.branch) + '</td>\
                    <td>' + escapeHtml(item.seller) + '</td>\
                    <td>' + escapeHtml(item.product) + '</td>\
                    <td style="text-align: center;">' + item.quantity + '</td>\
                    <td style="text-align: right;">' + formatCurrency(item.precioUnitario) + '</td>\
                    <td style="text-align: right;">' + costoDisplay + '</td>\
                    <td style="text-align: right; font-weight: bold; color: ' + (item.utilidad !== null && item.utilidad >= 0 ? '#059669' : '#dc2626') + ';">' + utilidadDisplay + '</td>\
                    <td style="text-align: center;">' + margenDisplay + '</td>\
                    <td style="text-align: right; font-weight: bold; color: #059669;">' + formatCurrency(item.total) + '</td>\
                </tr>';
            });
        } else {
            html += '<tr><td colspan="12" style="text-align: center; padding: 20px;">⚠️ No se encontraron accesorios para esta fecha</td></tr>';
        }
        
        html += '</tbody></table></div>';
        
        document.getElementById('accesoriosResults').innerHTML = statsHtml + html;
        document.getElementById('accesoriosResults').style.display = 'block';
        
        var btnAsesorSummary = document.getElementById('btnAsesorSummaryAccesorios');
        if (btnAsesorSummary) {
            btnAsesorSummary.addEventListener('click', function(e) {
                e.stopPropagation();
                openAsesorSummaryAccesoriosModal();
            });
        }
        
        var exportBtn = document.getElementById('exportAllAccesoriosBtn');
        if (exportBtn) {
            var newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            newExportBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                exportAllAccesoriosToExcel();
            };
        }
        
        if (ventasIndividuales.length === 0) {
            showInfo('accesorios', '⚠️ No se encontraron accesorios para esta fecha', true);
        } else {
            var msg = '✅ Se encontraron ' + ventasIndividuales.length + ' ventas de accesorios (' + totalUnidades + ' unidades)';
            if (totalCostoGeneral > 0) {
                msg += ' | Margen: ' + margenPromedioGeneral.toFixed(1) + '%';
            }
            showInfo('accesorios', msg, false);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('accesorios', 'Error: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== EXPORTAR TODAS LAS VENTAS DE ACCESORIOS ====================

function exportAllAccesoriosToExcel() {
    console.log('📊 [EXPORT ACCESORIOS] Iniciando exportación...');
    
    var data = window._cachedAccesoriosData;
    
    if (!data || !data.ventasIndividuales || data.ventasIndividuales.length === 0) {
        alert('⚠️ Primero debes consultar las ventas usando el botón "Consultar"');
        showError('accesorios', 'Primero consulta las ventas');
        return;
    }
    
    // ====== FECHA DEL INPUT (fecha consultada) ======
    var date = data.date; // Esta es la fecha del input
    var results = data.ventasIndividuales;
    
    console.log('📊 Exportando ' + results.length + ' registros...');
    console.log('📅 Fecha consultada:', date);
    
    var excelData = [
        ['REPORTE DE VENTAS DE ACCESORIOS'],
        ['Fecha consultada: ' + formatDateInput(date)],
        ['Total de ventas: ' + results.length],
        [],
        ['#', 'Venta', 'Ruta', 'Sucursal', 'Vendedor', 'Producto', 'Cantidad', 'Precio Unit.', 'Costo Unit.', 'Utilidad', 'Margen %', 'Total']
    ];
    
    var sortedResults = [].concat(results).sort(function(a, b) {
        var rutaCompare = (a.ruta || 'Sin Ruta').localeCompare(b.ruta || 'Sin Ruta');
        if (rutaCompare !== 0) return rutaCompare;
        var branchCompare = (a.branch || 'No disponible').localeCompare(b.branch || 'No disponible');
        if (branchCompare !== 0) return branchCompare;
        return (a.seller || '').localeCompare(b.seller || '');
    });
    
    sortedResults.forEach(function(item, index) {
        excelData.push([
            index + 1,
            item.saleId || 'N/A',
            item.ruta || 'Sin Ruta',
            item.branch || 'No disponible',
            item.seller || 'N/A',
            item.product || 'N/A',
            item.quantity || 0,
            (item.precioUnitario || 0).toFixed(2),
            item.costo !== null ? item.costo.toFixed(2) : 'N/A',
            item.utilidad !== null ? item.utilidad.toFixed(2) : 'N/A',
            item.margen !== null ? item.margen.toFixed(1) : 'N/A',
            (item.total || 0).toFixed(2)
        ]);
    });
    
    var totalVenta = results.reduce(function(sum, r) { return sum + (r.total || 0); }, 0);
    var totalUnidades = results.reduce(function(sum, r) { return sum + (r.quantity || 0); }, 0);
    var totalUtilidad = results.reduce(function(sum, r) { return sum + (r.utilidad || 0); }, 0);
    var margenPromedio = totalVenta > 0 ? (totalUtilidad / totalVenta) * 100 : 0;
    
    excelData.push([]);
    excelData.push(['RESUMEN']);
    excelData.push(['Total Ventas', results.length]);
    excelData.push(['Total Unidades', totalUnidades]);
    excelData.push(['Total Venta', totalVenta.toFixed(2)]);
    excelData.push(['Total Utilidad', totalUtilidad.toFixed(2)]);
    excelData.push(['Margen Promedio', margenPromedio.toFixed(1) + '%']);
    
    var rutasUnicas = [];
    var rutaSet = new Set();
    results.forEach(function(r) { rutaSet.add(r.ruta || 'Sin Ruta'); });
    rutasUnicas = Array.from(rutaSet).sort();
    
    if (rutasUnicas.length > 0) {
        excelData.push([]);
        excelData.push(['RESUMEN POR RUTA']);
        excelData.push(['Ruta', 'Ventas', 'Unidades', 'Monto Total', 'Utilidad']);
        rutasUnicas.forEach(function(ruta) {
            var itemsRuta = results.filter(function(r) { return (r.ruta || 'Sin Ruta') === ruta; });
            var totalRuta = itemsRuta.reduce(function(sum, r) { return sum + (r.total || 0); }, 0);
            var cantidadRuta = itemsRuta.reduce(function(sum, r) { return sum + (r.quantity || 0); }, 0);
            var utilidadRuta = itemsRuta.reduce(function(sum, r) { return sum + (r.utilidad || 0); }, 0);
            excelData.push([ruta, itemsRuta.length, cantidadRuta, totalRuta.toFixed(2), utilidadRuta.toFixed(2)]);
        });
    }
    
    try {
        if (typeof XLSX !== 'undefined') {
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(excelData);
            ws['!cols'] = [
                { wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
                { wch: 25 }, { wch: 35 }, { wch: 10 }, { wch: 18 },
                { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Ventas Accesorios');
            XLSX.writeFile(wb, 'ventas_accesorios_' + date + '.xlsx');
            showInfo('accesorios', '✅ Exportadas ' + results.length + ' ventas a Excel');
        } else {
            exportToCSV(excelData, 'ventas_accesorios_' + date);
            showInfo('accesorios', '✅ Exportadas ' + results.length + ' ventas a CSV');
        }
    } catch(e) {
        console.error('Error exportando:', e);
        exportToCSV(excelData, 'ventas_accesorios_' + date);
        showInfo('accesorios', '✅ Exportadas ' + results.length + ' ventas a CSV (fallback)');
    }
}

// ==================== RESUMEN POR ASESOR (ACCESORIOS) ====================

function openAsesorSummaryAccesoriosModal() {
    if (!cachedAccesoriosData || !cachedAccesoriosData.asesores) { 
        showError('accesorios', 'Primero consulta las ventas de accesorios'); 
        return; 
    }
    
    var asesores = cachedAccesoriosData.asesores;
    var totalUnidades = cachedAccesoriosData.totalUnidades;
    var fecha = cachedAccesoriosData.date;
    
    var ventasPorAsesor = new Map();
    for (var i = 0; i < asesores.length; i++) {
        var asesor = asesores[i];
        ventasPorAsesor.set(asesor.id || asesor.nombre, {
            id: asesor.id,
            nombre: asesor.nombre,
            cantidad: asesor.cantidad
        });
    }
    
    var equipos = [];
    
    for (var teamName in TEAM_STRUCTURE) {
        if (TEAM_STRUCTURE.hasOwnProperty(teamName)) {
            var teamData = TEAM_STRUCTURE[teamName];
            var liderCantidad = 0;
            var liderInfo = null;
            
            if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
                liderInfo = ventasPorAsesor.get(teamData.liderId);
                liderCantidad = liderInfo.cantidad;
            } else {
                for (var kv of ventasPorAsesor) {
                    if (kv[1].nombre === teamData.liderNombre) {
                        liderCantidad = kv[1].cantidad;
                        liderInfo = kv[1];
                        break;
                    }
                }
            }
            
            var miembros = [];
            var equipoTotal = liderCantidad;
            
            for (var mIdx = 0; mIdx < teamData.miembros.length; mIdx++) {
                var miembroId = teamData.miembros[mIdx];
                var miembroCantidad = 0;
                var miembroInfo = null;
                
                if (ventasPorAsesor.has(miembroId)) {
                    miembroInfo = ventasPorAsesor.get(miembroId);
                    miembroCantidad = miembroInfo.cantidad;
                } else {
                    for (var kv2 of ventasPorAsesor) {
                        if (kv2[1].id === miembroId) {
                            miembroCantidad = kv2[1].cantidad;
                            miembroInfo = kv2[1];
                            break;
                        }
                    }
                }
                
                if (miembroCantidad > 0 && miembroInfo) {
                    miembros.push({
                        nombre: miembroInfo.nombre,
                        cantidad: miembroCantidad
                    });
                    equipoTotal += miembroCantidad;
                }
            }
            
            miembros.sort(function(a, b) { return b.cantidad - a.cantidad; });
            
            if (equipoTotal > 0) {
                equipos.push({
                    nombre: teamName,
                    liderNombre: teamData.liderNombre,
                    liderCantidad: liderCantidad,
                    miembros: miembros,
                    equipoTotal: equipoTotal
                });
            }
        }
    }
    
    equipos.sort(function(a, b) { return b.equipoTotal - a.equipoTotal; });
    var totalGeneral = equipos.reduce(function(sum, e) { return sum + e.equipoTotal; }, 0);
    
    var modal = document.getElementById('asesorSummaryAccesoriosModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'asesorSummaryAccesoriosModal';
        modal.className = 'modal';
        modal.innerHTML = '\
            <div class="modal-content" style="max-width: 700px;">\
                <div class="modal-header">\
                    <h3>👥 Resumen por Equipo - Accesorios</h3>\
                    <span class="close-modal">&times;</span>\
                </div>\
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">\
                    <button id="exportAccesoriosExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>\
                </div>\
                <div class="modal-body" id="asesorSummaryAccesoriosModalBody"></div>\
                <div class="modal-footer">\
                    Ventas de accesorios | Cantidad de piezas\
                </div>\
            </div>\
        ';
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = function() { modal.style.display = 'none'; };
        window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    var html = '\
        <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">\
            <div style="flex: 1; background: #059669; color: white; padding: 12px; border-radius: 12px; text-align: center;">\
                <div style="font-size: 24px; font-weight: bold;">' + totalGeneral + '</div>\
                <div style="font-size: 11px;">📦 Total Piezas</div>\
            </div>\
            <div style="flex: 1; background: #047857; color: white; padding: 12px; border-radius: 12px; text-align: center;">\
                <div style="font-size: 24px; font-weight: bold;">' + equipos.length + '</div>\
                <div style="font-size: 11px;">👥 Equipos con ventas</div>\
            </div>\
        </div>\
        <div style="max-height: 500px; overflow-y: auto;">\
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">\
                <thead style="position: sticky; top: 0; background: #f8fafc;">\
                    <tr style="border-bottom: 2px solid #059669;">\
                        <th style="padding: 10px; text-align: center;">#</th>\
                        <th style="padding: 10px; text-align: left;">Equipo / Asesor</th>\
                        <th style="padding: 10px; text-align: center;">📦 Piezas</th>\
                    </tr>\
                </thead>\
                <tbody>';
    
    var index = 1;
    for (var eIdx = 0; eIdx < equipos.length; eIdx++) {
        var equipo = equipos[eIdx];
        html += '\
            <tr style="background-color: #e8f4f8; border-top: 2px solid #059669;">\
                <td style="padding: 8px; text-align: center; font-weight: bold;">' + index + '</td>\
                <td style="padding: 8px; text-align: left; font-weight: bold; color: #059669;">📁 ' + equipo.nombre + '</td>\
                <td style="padding: 8px; text-align: center; font-weight: bold;">' + equipo.equipoTotal + '</td>\
             </tr>';
        index++;
        
        html += '\
            <tr style="border-bottom: 1px solid #e2e8f0;">\
                <td style="padding: 6px 8px; text-align: center;"></td>\
                <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">👑 ' + equipo.liderNombre + '</td>\
                <td style="padding: 6px 8px; text-align: center; ' + (equipo.liderCantidad === 0 ? 'color: #94a3b8;' : 'font-weight: bold;') + '">' + equipo.liderCantidad + '</td>\
             </tr>';
        
        for (var mIdx2 = 0; mIdx2 < equipo.miembros.length; mIdx2++) {
            var miembro = equipo.miembros[mIdx2];
            html += '\
                <tr style="border-bottom: 1px solid #e2e8f0;">\
                    <td style="padding: 6px 8px; text-align: center;"></td>\
                    <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">└─ ' + escapeHtml(miembro.nombre) + '</td>\
                    <td style="padding: 6px 8px; text-align: center;">' + miembro.cantidad + '</td>\
                 </tr>';
        }
    }
    
    html += '\
                </tbody>\
            </table>\
        </div>';
    
    document.getElementById('asesorSummaryAccesoriosModalBody').innerHTML = html;
    modal.style.display = 'block';
    
    var exportBtn = document.getElementById('exportAccesoriosExcelBtn');
    if (exportBtn) {
        var newExportBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
        newExportBtn.addEventListener('click', function() { exportAccesoriosSummaryToExcel(equipos, totalGeneral, fecha); });
    }
}

// ==================== EXPORTAR RESUMEN DE ASESORES ====================

function exportAccesoriosSummaryToExcel(equipos, totalGeneral, fecha) {
    var excelData = [
        ['Resumen por Equipo - Accesorios'],
        [],
        ['#', 'Equipo / Asesor', 'Piezas']
    ];
    
    for (var i = 0; i < equipos.length; i++) {
        var equipo = equipos[i];
        excelData.push(['Lider', equipo.liderNombre, equipo.liderCantidad]);
        for (var j = 0; j < equipo.miembros.length; j++) {
            var miembro = equipo.miembros[j];
            excelData.push(['', miembro.nombre, miembro.cantidad]);
        }
        excelData.push(['', '', '']);
    }
    
    excelData.push(['', 'TOTAL GENERAL:', totalGeneral]);
    excelData.push([]);
    
    try {
        if (typeof XLSX !== 'undefined') {
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(excelData);
            XLSX.utils.book_append_sheet(wb, ws, 'Resumen Accesorios');
            XLSX.writeFile(wb, 'resumen_accesorios_' + fecha + '.xlsx');
        } else {
            exportToCSV(excelData, 'resumen_accesorios_' + fecha);
        }
    } catch(e) {
        console.error('Error exportando:', e);
        exportToCSV(excelData, 'resumen_accesorios_' + fecha);
    }
}

// ==================== FUNCIÓN PARA EXPORTAR CSV ====================

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

// Agregar estilo para el spinner pequeño si no existe
if (!document.querySelector('#accesorios-spinner-style')) {
    var style = document.createElement('style');
    style.id = 'accesorios-spinner-style';
    style.textContent = '\
        .loading-spinner-small {\
            display: inline-block;\
            width: 20px;\
            height: 20px;\
            border: 2px solid rgba(255,255,255,0.3);\
            border-radius: 50%;\
            border-top-color: white;\
            animation: spin 0.8s linear infinite;\
        }\
        @keyframes spin {\
            to { transform: rotate(360deg); }\
        }\
    ';
    document.head.appendChild(style);
}

// ==================== EXPONER FUNCIONES GLOBALMENTE ====================
window.searchAccesorios = searchAccesorios;
window.exportAllAccesoriosToExcel = exportAllAccesoriosToExcel;
window.openAsesorSummaryAccesoriosModal = openAsesorSummaryAccesoriosModal;
window.exportAccesoriosSummaryToExcel = exportAccesoriosSummaryToExcel;

console.log('✅ Módulo accesorios.js cargado correctamente');