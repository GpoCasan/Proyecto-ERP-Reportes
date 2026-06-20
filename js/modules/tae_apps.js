// ==================== MÓDULO: TAE APPS CREATIVAS ====================

// Variables globales
let taeAppsLineNamesCache = new Map();
let taeAppsLineColorsCache = new Map();
let taeAppsCatalogoCargado = false;
let taeAppsExportDataGlobal = null; // Backup

// ==================== FUNCIONES AUXILIARES ====================

function taeAppsFormatCurrency(v) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(v || 0);
}

function taeAppsEscapeHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

function taeAppsGetDateRangeContado(dateStr) {
    if (!dateStr) return null;
    const startDate = new Date(dateStr);
    startDate.setHours(18, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    const startStr = startDate.toISOString().slice(0, 19).replace('T', '+');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', '+');
    return { start: startStr, end: endStr };
}

// ==================== CARGAR CATÁLOGO DE LÍNEAS ====================

async function taeAppsLoadLineNames() {
    console.log('📦 [TAE APPS] Cargando catálogo de líneas...');
    
    if (taeAppsCatalogoCargado && taeAppsLineNamesCache.size > 0) {
        console.log(`✅ [TAE APPS] Catálogo ya cargado: ${taeAppsLineNamesCache.size} líneas`);
        return taeAppsLineNamesCache;
    }

    try {
        let allLines = [];
        let currentPage = 1;
        let lastPage = 1;

        do {
            const url = `${CONFIG.API_LINES || 'https://catalogs.gcasan.com/api/product-lines'}?page=${currentPage}&per_page=100`;
            console.log(`📡 [TAE APPS] Consultando líneas página ${currentPage}...`);
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const lines = data.data?.data || data.data;
            if (!Array.isArray(lines)) {
                throw new Error('La respuesta del catálogo no contiene un array');
            }
            allLines.push(...lines);

            lastPage = data.last_page || data.meta?.last_page || currentPage;
            currentPage++;

            await new Promise(resolve => setTimeout(resolve, 100));

        } while (currentPage <= lastPage);

        for (const line of allLines) {
            if (line.id && line.name) {
                taeAppsLineNamesCache.set(line.id, line.name);
                if (line.color) {
                    taeAppsLineColorsCache.set(line.id, line.color);
                }
            }
        }

        taeAppsCatalogoCargado = true;
        console.log(`✅ [TAE APPS] Catálogo cargado: ${taeAppsLineNamesCache.size} líneas`);
        return taeAppsLineNamesCache;

    } catch (error) {
        console.error('❌ [TAE APPS] Error cargando líneas:', error);
        taeAppsCatalogoCargado = false;
        throw error;
    }
}

function taeAppsGetLineName(lineId) {
    if (taeAppsLineNamesCache.has(lineId)) {
        return taeAppsLineNamesCache.get(lineId);
    }
    if (taeAppsCatalogoCargado) {
        return `ID: ${lineId}`;
    }
    return `Cargando... ${lineId}`;
}

function taeAppsGetLineColor(lineId) {
    if (taeAppsLineColorsCache.has(lineId)) {
        return taeAppsLineColorsCache.get(lineId);
    }
    return '#64748b';
}

// ==================== CONSULTAR VENTAS ====================

async function taeAppsFetchAllSales(startDateTime, endDateTime) {
    let allSales = [];
    let currentPage = 1;
    let lastPage = 1;

    const progressContainer = document.getElementById('taeAppsProgressContainer');
    const progressBar = document.getElementById('taeAppsProgressBar');
    const progressText = document.getElementById('taeAppsProgressText');

    if (progressContainer) progressContainer.classList.remove('hidden');

    do {
        const url = `${CONFIG.API_SALES || 'https://sales.gcasan.com/api/sales'}?page=${currentPage}&per_page=200&total=0&start_date=${startDateTime}&end_date=${endDateTime}&family_id=30`;

        console.log(`📡 [TAE APPS] Consultando página ${currentPage}...`);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const sales = data.data || [];
        allSales.push(...sales);

        lastPage = data.last_page || data.meta?.last_page || 1;
        currentPage++;

        if (progressBar && progressText) {
            const progress = lastPage > 1 ? Math.round(((currentPage - 1) / lastPage) * 100) : 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Página ${currentPage - 1} de ${lastPage} | ${allSales.length} ventas`;
        }

        await new Promise(resolve => setTimeout(resolve, 100));

    } while (currentPage <= lastPage);

    if (progressContainer) progressContainer.classList.add('hidden');
    console.log(`📊 [TAE APPS] Total ventas obtenidas: ${allSales.length}`);

    return allSales;
}

// ==================== FUNCIÓN PRINCIPAL DE CONSULTA ====================

async function taeAppsConsultar() {
    const startDate = document.getElementById('taeAppsStartDate').value;
    const endDate = document.getElementById('taeAppsEndDate').value;

    if (!startDate || !endDate) {
        taeAppsShowError('❌ Selecciona un rango de fechas');
        return;
    }

    const btn = document.getElementById('taeAppsConsultarBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="spinner"></span>';
    btn.disabled = true;

    taeAppsHideResults();

    // Limpiar datos anteriores
    window.__taeAppsData = null;
    taeAppsExportDataGlobal = null;
    const exportBtn = document.getElementById('taeAppsExportBtn');
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.style.opacity = '0.5';
        exportBtn.style.cursor = 'not-allowed';
        exportBtn.textContent = '📊 Exportar a Excel';
    }

    try {
        await taeAppsLoadLineNames();
        console.log('✅ [TAE APPS] Catálogo cargado correctamente');

        const rangeStart = taeAppsGetDateRangeContado(startDate);
        const rangeEnd = taeAppsGetDateRangeContado(endDate);

        if (!rangeStart || !rangeEnd) {
            throw new Error('Error al procesar las fechas');
        }

        const startDateTime = rangeStart.start;
        const endDateTime = rangeEnd.end;

        console.log('📅 [TAE APPS] Rango API:', { startDateTime, endDateTime });

        const sales = await taeAppsFetchAllSales(startDateTime, endDateTime);

        if (sales.length === 0) {
            taeAppsShowNoResults();
            btn.innerHTML = originalText;
            btn.disabled = false;
            window.__taeAppsData = null;
            taeAppsExportDataGlobal = null;
            return;
        }

        // ==================== PROCESAR DATOS ====================
        const branchMap = new Map();
        let totalGeneralVentas = 0;
        let totalGeneralMonto = 0;
        const lineasGlobal = new Map();

        for (const sale of sales) {
            const branch = sale.warehouse?.branch || {};
            const branchName = branch.name || sale.branch_name || 'Sin Sucursal';
            const branchId = branch.id || sale.branch_id || 0;

            if (!branchMap.has(branchId)) {
                branchMap.set(branchId, {
                    branchId,
                    branchName,
                    lineas: new Map()
                });
            }
            const branchData = branchMap.get(branchId);

            for (const detail of (sale.details || [])) {
                const product = detail.product || {};
                const lineId = product.line_id || 0;
                const total = parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;

                totalGeneralVentas += 1;
                totalGeneralMonto += total;

                if (!lineasGlobal.has(lineId)) {
                    lineasGlobal.set(lineId, {
                        lineId,
                        ventas: 0,
                        monto: 0
                    });
                }
                const lineaGlobal = lineasGlobal.get(lineId);
                lineaGlobal.ventas += 1;
                lineaGlobal.monto += total;

                if (!branchData.lineas.has(lineId)) {
                    branchData.lineas.set(lineId, {
                        lineId,
                        ventas: 0,
                        monto: 0
                    });
                }
                const lineaData = branchData.lineas.get(lineId);
                lineaData.ventas += 1;
                lineaData.monto += total;
            }
        }

        // GUARDAR DATOS PARA EXPORTACIÓN - Usamos dos variables para mayor seguridad
        window.__taeAppsData = {
            branchMap: branchMap,
            lineasGlobal: lineasGlobal,
            totalGeneralVentas: totalGeneralVentas,
            totalGeneralMonto: totalGeneralMonto,
            startDate: startDate,
            endDate: endDate,
            salesCount: sales.length
        };
        taeAppsExportDataGlobal = window.__taeAppsData; // Backup

        console.log('📦 [TAE APPS] Datos GUARDADOS en window.__taeAppsData:', {
            sucursales: branchMap.size,
            lineas: lineasGlobal.size,
            totalVentas: totalGeneralVentas,
            totalMonto: totalGeneralMonto
        });
        console.log('📦 [TAE APPS] taeAppsExportDataGlobal también guardado.');

        // Mostrar resultados
        taeAppsRenderResults(sales, branchMap, lineasGlobal, totalGeneralVentas, totalGeneralMonto, startDate, endDate);

        // HABILITAR EL BOTÓN DE EXPORTAR
        const exportBtn2 = document.getElementById('taeAppsExportBtn');
        if (exportBtn2) {
            exportBtn2.disabled = false;
            exportBtn2.style.opacity = '1';
            exportBtn2.style.cursor = 'pointer';
            exportBtn2.style.background = '#059669';
            exportBtn2.textContent = '📊 Exportar a Excel';
            console.log('✅ [TAE APPS] Botón de exportar HABILITADO');
        } else {
            console.error('❌ [TAE APPS] No se encontró el botón de exportar');
        }

    } catch (error) {
        console.error('❌ [TAE APPS] Error:', error);
        taeAppsShowError(`❌ ${error.message}`);
        window.__taeAppsData = null;
        taeAppsExportDataGlobal = null;
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== RENDERIZAR RESULTADOS ====================

function taeAppsRenderResults(sales, branchMap, lineasGlobal, totalGeneralVentas, totalGeneralMonto, startDate, endDate) {
    const container = document.getElementById('taeAppsResults');
    const noResults = document.getElementById('taeAppsNoResults');
    
    if (container) {
        container.classList.remove('hidden');
    }
    if (noResults) {
        noResults.classList.add('hidden');
    }

    // ==================== TARJETAS DE ESTADÍSTICAS ====================
    const statsContainer = document.getElementById('taeAppsStatsContainer');
    if (!statsContainer) return;

    const lineasOrdenadas = Array.from(lineasGlobal.values())
        .sort((a, b) => b.monto - a.monto);

    const coloresLineas = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', 
        '#f97316', '#06b6d4', '#ef4444', '#6366f1', '#14b8a6'
    ];

    let statsHtml = `
        <div class="tae-stats-grid">
            <div class="tae-stat-main">
                <div class="tae-stat-main-icon">💰</div>
                <div class="tae-stat-main-content">
                    <div class="tae-stat-main-number">${taeAppsFormatCurrency(totalGeneralMonto)}</div>
                    <div class="tae-stat-main-label">VENTAS TOTALES</div>
                    <div class="tae-stat-main-sub">${sales.length} ventas · ${branchMap.size} sucursales</div>
                </div>
            </div>
    `;

    lineasOrdenadas.forEach((linea, index) => {
        const color = coloresLineas[index % coloresLineas.length];
        const lineName = taeAppsGetLineName(linea.lineId);
        statsHtml += `
            <div class="tae-stat-linea" style="border-left-color: ${color};">
                <div class="tae-stat-linea-name">${taeAppsEscapeHtml(lineName)}</div>
                <div class="tae-stat-linea-number" style="color: ${color};">${taeAppsFormatCurrency(linea.monto)}</div>
                <div class="tae-stat-linea-sub">${linea.ventas} ventas</div>
                <div class="tae-stat-linea-bar" style="width: ${Math.min((linea.monto / totalGeneralMonto) * 100, 100)}%; background: ${color};"></div>
            </div>
        `;
    });

    statsHtml += `</div>`;
    statsContainer.innerHTML = statsHtml;

    // ==================== TABLA PRINCIPAL ====================
    const tableContainer = document.getElementById('taeAppsMainTable');
    if (!tableContainer) return;

    const branchesOrdenadas = Array.from(branchMap.values())
        .sort((a, b) => {
            const totalA = Array.from(a.lineas.values()).reduce((sum, l) => sum + l.monto, 0);
            const totalB = Array.from(b.lineas.values()).reduce((sum, l) => sum + l.monto, 0);
            return totalB - totalA;
        });

    const branchCount = document.getElementById('taeAppsBranchCount');
    if (branchCount) {
        branchCount.textContent = branchesOrdenadas.length;
    }

    let tableHtml = `
        <div class="tae-table-wrapper">
            <table class="tae-table">
                <thead>
                    <tr>
                        <th class="tae-col-num">#</th>
                        <th class="tae-col-sucursal">Sucursal / Línea</th>
                        <th class="tae-col-ventas"># Ventas</th>
                        <th class="tae-col-monto">💰 Monto</th>
                    </tr>
                </thead>
                <tbody>
    `;

    let indexBranch = 1;
    let grandTotalVentas = 0;
    let grandTotalMonto = 0;

    for (const branch of branchesOrdenadas) {
        const lineasArray = Array.from(branch.lineas.values())
            .sort((a, b) => b.monto - a.monto);
        
        const branchTotalVentas = lineasArray.reduce((sum, l) => sum + l.ventas, 0);
        const branchTotalMonto = lineasArray.reduce((sum, l) => sum + l.monto, 0);

        grandTotalVentas += branchTotalVentas;
        grandTotalMonto += branchTotalMonto;

        tableHtml += `
            <tr class="tae-row-branch">
                <td class="tae-col-num">${indexBranch}</td>
                <td class="tae-col-sucursal"><span class="tae-branch-icon">🏢</span> ${taeAppsEscapeHtml(branch.branchName)}</td>
                <td class="tae-col-ventas">${branchTotalVentas}</td>
                <td class="tae-col-monto">${taeAppsFormatCurrency(branchTotalMonto)}</td>
            </tr>
        `;

        for (const linea of lineasArray) {
            const lineName = taeAppsGetLineName(linea.lineId);
            const color = taeAppsGetLineColor(linea.lineId);

            tableHtml += `
                <tr class="tae-row-linea">
                    <td class="tae-col-num"></td>
                    <td class="tae-col-sucursal">
                        <span class="tae-linea-badge" style="background: ${color};">${lineName}</span>
                    </td>
                    <td class="tae-col-ventas">${linea.ventas}</td>
                    <td class="tae-col-monto">${taeAppsFormatCurrency(linea.monto)}</td>
                </tr>
            `;
        }

        tableHtml += `
            <tr class="tae-row-subtotal">
                <td colspan="2" class="tae-col-subtotal-label">SUBTOTAL ${taeAppsEscapeHtml(branch.branchName)}</td>
                <td class="tae-col-ventas"><strong>${branchTotalVentas}</strong></td>
                <td class="tae-col-monto"><strong>${taeAppsFormatCurrency(branchTotalMonto)}</strong></td>
            </tr>
        `;

        indexBranch++;
    }

    tableHtml += `
            <tr class="tae-row-total">
                <td colspan="2" class="tae-col-total-label">TOTAL GENERAL</td>
                <td class="tae-col-ventas"><strong>${grandTotalVentas}</strong></td>
                <td class="tae-col-monto"><strong>${taeAppsFormatCurrency(grandTotalMonto)}</strong></td>
            </tr>
        `;

    tableHtml += `
                </tbody>
            </table>
        </div>
    `;

    tableContainer.innerHTML = tableHtml;

    // Mostrar contenedor de exportar
    const exportContainer = document.getElementById('taeAppsExportContainer');
    if (exportContainer) {
        exportContainer.classList.remove('hidden');
    }

    taeAppsShowSuccess(`✅ ${sales.length} ventas - ${taeAppsFormatCurrency(grandTotalMonto)}`);
}

// ==================== EXPORTAR A EXCEL (CON DESCARGA MANUAL) ====================

function taeAppsExportToExcel() {
    console.log('📊 [TAE APPS] ===== INICIANDO EXPORTACIÓN =====');
    
    // Intentar obtener datos desde ambas variables
    let data = window.__taeAppsData || taeAppsExportDataGlobal;
    console.log('📦 Datos obtenidos:', data ? '✅ Existen' : '❌ NO EXISTEN');
    
    if (!data) {
        console.error('❌ No hay datos para exportar');
        taeAppsShowError('⚠️ No hay datos para exportar. Primero consulta.');
        return;
    }

    // Verificar que haya datos válidos
    if (!data.branchMap || data.branchMap.size === 0) {
        console.error('❌ branchMap está vacío o no existe');
        taeAppsShowError('⚠️ No hay datos para exportar');
        return;
    }

    console.log('📊 Datos a exportar:', {
        sucursales: data.branchMap.size,
        lineas: data.lineasGlobal.size,
        totalVentas: data.totalGeneralVentas,
        totalMonto: data.totalGeneralMonto
    });

    const { branchMap, lineasGlobal, startDate, endDate } = data;

    // Preparar datos para Excel (array de arrays)
    const excelData = [
        ['TAE - APPS CREATIVAS'],
        [`Período: ${startDate || 'No definida'} - ${endDate || 'No definida'}`],
        [],
        ['RESUMEN POR SUCURSAL Y LÍNEA'],
        ['#', 'Sucursal / Línea', '# Ventas', 'Monto']
    ];

    const branchesOrdenadas = Array.from(branchMap.values())
        .sort((a, b) => {
            const totalA = Array.from(a.lineas.values()).reduce((sum, l) => sum + l.monto, 0);
            const totalB = Array.from(b.lineas.values()).reduce((sum, l) => sum + l.monto, 0);
            return totalB - totalA;
        });

    let index = 1;
    let grandTotalVentas = 0;
    let grandTotalMonto = 0;

    for (const branch of branchesOrdenadas) {
        const lineasArray = Array.from(branch.lineas.values())
            .sort((a, b) => b.monto - a.monto);
        
        const branchTotalVentas = lineasArray.reduce((sum, l) => sum + l.ventas, 0);
        const branchTotalMonto = lineasArray.reduce((sum, l) => sum + l.monto, 0);

        grandTotalVentas += branchTotalVentas;
        grandTotalMonto += branchTotalMonto;

        excelData.push([index, `🏢 ${branch.branchName}`, branchTotalVentas, branchTotalMonto]);

        for (const linea of lineasArray) {
            const lineName = taeAppsGetLineName(linea.lineId);
            excelData.push(['', `  ${lineName}`, linea.ventas, linea.monto]);
        }

        excelData.push(['', `SUBTOTAL ${branch.branchName}`, branchTotalVentas, branchTotalMonto]);
        excelData.push([]);
        index++;
    }

    excelData.push(['', 'TOTAL GENERAL', grandTotalVentas, grandTotalMonto]);

    // Resumen por línea
    excelData.push([]);
    excelData.push(['RESUMEN POR LÍNEA']);
    excelData.push(['Línea', '# Ventas', 'Monto']);

    const lineasOrdenadas = Array.from(lineasGlobal.values())
        .sort((a, b) => b.monto - a.monto);

    for (const linea of lineasOrdenadas) {
        const lineName = taeAppsGetLineName(linea.lineId);
        excelData.push([lineName, linea.ventas, linea.monto]);
    }

    const totalLineasVentas = lineasOrdenadas.reduce((sum, l) => sum + l.ventas, 0);
    const totalLineasMonto = lineasOrdenadas.reduce((sum, l) => sum + l.monto, 0);
    excelData.push(['TOTAL', totalLineasVentas, totalLineasMonto]);

    // ==================== EXPORTAR MANUALMENTE USANDO XLSX ====================
    try {
        // Verificar que XLSX esté disponible
        if (typeof XLSX === 'undefined') {
            console.error('❌ La librería XLSX no está cargada.');
            taeAppsShowError('❌ Error: La librería XLSX no está disponible. Verifica la conexión a Internet o recarga la página.');
            return;
        }

        console.log('📊 Creando archivo Excel con XLSX...');
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        // Ajustar ancho de columnas
        ws['!cols'] = excelData[0].map(() => ({ wch: 25 }));
        XLSX.utils.book_append_sheet(wb, ws, 'TAE APPS');

        // Generar nombre de archivo
        const filename = `tae_apps_${startDate || 'fecha'}_${endDate || 'fecha'}`.replace(/[^a-zA-Z0-9_-]/g, '_') + '.xlsx';
        console.log(`📊 Guardando archivo: ${filename}`);

        // Usar XLSX.write para generar un array buffer y luego crear un blob para descarga manual
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        
        // Crear enlace de descarga
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log('✅ Archivo Excel generado y descargado correctamente.');
        taeAppsShowSuccess('✅ Exportación completada correctamente');
    } catch (error) {
        console.error('❌ Error al exportar con XLSX:', error);
        taeAppsShowError('❌ Error al exportar: ' + error.message);
    }
}

// ==================== FUNCIONES DE UTILIDAD ====================

function taeAppsHideResults() {
    const results = document.getElementById('taeAppsResults');
    const noResults = document.getElementById('taeAppsNoResults');
    const errorAlert = document.getElementById('taeAppsErrorAlert');
    const infoAlert = document.getElementById('taeAppsInfoAlert');
    const successAlert = document.getElementById('taeAppsSuccessAlert');
    const exportContainer = document.getElementById('taeAppsExportContainer');
    
    if (results) results.classList.add('hidden');
    if (noResults) noResults.classList.add('hidden');
    if (errorAlert) errorAlert.style.display = 'none';
    if (infoAlert) infoAlert.style.display = 'none';
    if (successAlert) successAlert.style.display = 'none';
    if (exportContainer) exportContainer.classList.add('hidden');
}

function taeAppsShowError(msg) {
    const el = document.getElementById('taeAppsErrorAlert');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 8000);
    }
}

function taeAppsShowSuccess(msg) {
    const el = document.getElementById('taeAppsSuccessAlert');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 5000);
    }
}

function taeAppsShowInfo(msg) {
    const el = document.getElementById('taeAppsInfoAlert');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 5000);
    }
}

function taeAppsShowNoResults() {
    const noResults = document.getElementById('taeAppsNoResults');
    if (noResults) {
        noResults.classList.remove('hidden');
    }
    taeAppsShowInfo('⚠️ No se encontraron ventas en el período seleccionado');
}

// ==================== INICIALIZAR MÓDULO ====================

function initTaeAppsModule() {
    console.log('🔄 [TAE APPS] Inicializando módulo...');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const formatDateInput = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startInput = document.getElementById('taeAppsStartDate');
    const endInput = document.getElementById('taeAppsEndDate');
    
    if (startInput) startInput.value = formatDateInput(startDate);
    if (endInput) endInput.value = formatDateInput(endDate);

    // Configurar botón de consulta
    const searchBtn = document.getElementById('taeAppsConsultarBtn');
    if (searchBtn) {
        const newBtn = searchBtn.cloneNode(true);
        searchBtn.parentNode.replaceChild(newBtn, searchBtn);
        newBtn.addEventListener('click', taeAppsConsultar);
        console.log('✅ [TAE APPS] Botón de consulta configurado');
    }

    // Configurar botón de exportar usando addEventListener
    const exportBtn = document.getElementById('taeAppsExportBtn');
    if (exportBtn) {
        // Deshabilitar inicialmente
        exportBtn.disabled = true;
        exportBtn.style.opacity = '0.5';
        exportBtn.style.cursor = 'not-allowed';
        exportBtn.textContent = '📊 Exportar a Excel';
        
        // Remover eventos antiguos y agregar nuevo
        const newExportBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
        newExportBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🖱️ [TAE APPS] CLICK EN BOTÓN EXPORTAR (desde addEventListener)');
            taeAppsExportToExcel();
        });
        console.log('✅ [TAE APPS] Botón de exportar configurado con addEventListener');
    } else {
        console.error('❌ [TAE APPS] No se encontró el botón de exportar en el DOM');
    }

    // Precargar catálogo
    taeAppsLoadLineNames().catch(err => {
        console.warn('⚠️ [TAE APPS] Error precargando catálogo:', err);
    });

    console.log('✅ [TAE APPS] Módulo inicializado correctamente');
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initTaeAppsModule = initTaeAppsModule;
window.taeAppsConsultar = taeAppsConsultar;
window.taeAppsExportToExcel = taeAppsExportToExcel;