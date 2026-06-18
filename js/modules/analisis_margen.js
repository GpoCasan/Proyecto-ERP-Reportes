// ==================== MÓDULO: ANÁLISIS DE MARGEN POR CATEGORÍA ====================

// Variables globales
let cachedMargenData = null;
let margenChart = null;

// Cache de costos para evitar consultas repetidas
const costCache = new Map();

// ==================== CONFIGURACIÓN ====================

const CATEGORIAS_MARGEN = {
    'EQUIPOS_TELCEL': {
        label: '📱 Equipos Telcel',
        lineId: 4,
        color: '#3b82f6',
        icon: '📱'
    },
    'EQUIPOS_LIBRE': {
        label: '🔓 Equipos Libre',
        lineId: 5,
        color: '#10b981',
        icon: '🔓'
    },
    'ACCESORIOS': {
        label: '🔌 Accesorios',
        lineId: 2,
        color: '#f97316',
        icon: '🔌'
    }
};

const RANGOS_PRECIO = [
    { label: 'Menos de $1,500', min: 0, max: 1500 },
    { label: 'Más de $1,500', min: 1500, max: Infinity }
];

// ==================== FUNCIÓN PRINCIPAL ====================

async function searchAnalisisMargen() {
    const startDate = document.getElementById('margenStartDate').value;
    const endDate = document.getElementById('margenEndDate').value;
    const categoriaSeleccionada = document.getElementById('margenCategoriaSelect').value;
    
    if (!startDate || !endDate) {
        showError('analisisMargen', 'Selecciona un rango de fechas');
        return;
    }

    const btn = document.getElementById('searchAnalisisMargenBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Analizando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('analisisMargenResults').style.display = 'none';
    document.getElementById('analisisMargenErrorAlert').style.display = 'none';
    document.getElementById('analisisMargenInfoAlert').style.display = 'none';

    try {
        // Limpiar caché de costos para una nueva consulta
        costCache.clear();
        
        // Obtener todas las ventas del período (optimizado por línea)
        const allSales = await fetchAllSales(startDate, endDate, categoriaSeleccionada);
        
        if (allSales.length === 0) {
            showInfo('analisisMargen', '⚠️ No se encontraron ventas en el período seleccionado', true);
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        // Procesar datos por categoría
        const resultados = await procesarDatosMargen(allSales, categoriaSeleccionada);
        
        // Guardar en caché
        cachedMargenData = {
            startDate,
            endDate,
            resultados,
            categoriaSeleccionada
        };

        // Renderizar resultados
        renderResultadosMargen(resultados, categoriaSeleccionada, startDate, endDate);

        showInfo('analisisMargen', `✅ Análisis completado: ${resultados.totalProductos} productos analizados`, false);

    } catch (error) {
        console.error('❌ Error en análisis de margen:', error);
        showError('analisisMargen', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== OBTENER VENTAS (OPTIMIZADO POR LÍNEA) ====================

async function fetchAllSales(startDate, endDate, categoriaSeleccionada) {
    // Obtener el rango de fechas con el formato correcto (6:00 AM a 6:00 AM)
    const rangeStart = getDateRangeContado(startDate);
    const rangeEnd = getDateRangeContado(endDate);
    
    const startDateTime = rangeStart.start;
    const endDateTime = rangeEnd.end;

    // Determinar las líneas a consultar según la categoría seleccionada
    let lineIds = [];
    
    if (categoriaSeleccionada === 'todos') {
        lineIds = [2, 4, 5]; // Accesorios, Telcel, Libre
    } else if (categoriaSeleccionada === 'EQUIPOS_TELCEL') {
        lineIds = [4];
    } else if (categoriaSeleccionada === 'EQUIPOS_LIBRE') {
        lineIds = [5];
    } else if (categoriaSeleccionada === 'ACCESORIOS') {
        lineIds = [2];
    } else {
        lineIds = [2, 4, 5];
    }

    let allSales = [];
    let totalPaginas = 0;
    
    // Consultar cada línea por separado (más eficiente)
    for (const lineId of lineIds) {
        let currentPage = 1;
        let lastPage = 1;

        do {
            const url = `${CONFIG.API_SALES}?page=${currentPage}&per_page=500&total=0&sale_type=products&start_date=${startDateTime}&end_date=${endDateTime}&line_id=${lineId}`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });

            if (!response.ok) {
                console.warn(`⚠️ Error consultando línea ${lineId}: ${response.status}`);
                break;
            }

            const data = await response.json();
            const sales = data.data || [];
            allSales = allSales.concat(sales);

            lastPage = data.last_page || data.meta?.last_page || currentPage;
            currentPage++;
            totalPaginas++;

            // Actualizar progreso en el botón
            const btn = document.getElementById('searchAnalisisMargenBtn');
            if (btn) {
                btn.innerHTML = `Analizando línea ${lineId}... ${Math.round((currentPage - 1) / lastPage * 100)}% <span class="loading-spinner"></span>`;
            }

            await new Promise(resolve => setTimeout(resolve, 100));

        } while (currentPage <= lastPage);
    }

    console.log(`📊 ${allSales.length} ventas obtenidas para las líneas: ${lineIds.join(', ')} (${totalPaginas} páginas)`);
    return allSales;
}

// ==================== OBTENER COSTO CON CACHÉ ====================

async function getProductCost(productId) {
    if (!productId || productId === 0) return 0;
    
    if (costCache.has(productId)) {
        return costCache.get(productId);
    }
    
    try {
        const costData = await fetchProductCost(productId);
        const costoConIva = costData?.costoConIva || 0;
        costCache.set(productId, costoConIva);
        return costoConIva;
    } catch (error) {
        console.warn(`⚠️ Error obteniendo costo para producto ${productId}:`, error);
        costCache.set(productId, 0);
        return 0;
    }
}

// ==================== PROCESAR DATOS DE MARGEN (OPTIMIZADO) ====================

async function procesarDatosMargen(sales, categoriaFiltro) {
    const resultados = {
        categorias: {},
        totalProductos: 0,
        totalVentas: 0,
        totalUtilidad: 0,
        margenPromedioGeneral: 0,
        porRangoPrecio: {},
        productosDestacados: {
            mejorMargen: null,
            peorMargen: null,
            masVendido: null
        }
    };

    // Inicializar categorías
    for (const [key, cat] of Object.entries(CATEGORIAS_MARGEN)) {
        if (categoriaFiltro && categoriaFiltro !== 'todos' && categoriaFiltro !== key) continue;
        
        resultados.categorias[key] = {
            ...cat,
            productos: [],
            totalUnidades: 0,
            totalVenta: 0,
            totalCosto: 0,
            utilidadTotal: 0,
            margenPromedio: 0
        };
    }

    // Inicializar rangos de precio
    RANGOS_PRECIO.forEach(rango => {
        resultados.porRangoPrecio[rango.label] = {
            productos: [],
            totalUnidades: 0,
            totalVenta: 0,
            totalCosto: 0,
            utilidadTotal: 0,
            margenPromedio: 0
        };
    });

    // Primera pasada: recolectar productIds para consultar costos en batch
    const productIdsNeeded = new Set();
    const salesDetails = [];

    for (const sale of sales) {
        for (const detail of (sale.details || [])) {
            const productLineId = detail.product?.line_id;
            const productId = detail.product?.id;
            
            // Solo procesar líneas que nos interesan
            if (![2, 4, 5].includes(productLineId)) continue;
            
            // Verificar si la categoría está filtrada
            let categoriaKey = null;
            if (productLineId === 4) categoriaKey = 'EQUIPOS_TELCEL';
            else if (productLineId === 5) categoriaKey = 'EQUIPOS_LIBRE';
            else if (productLineId === 2) categoriaKey = 'ACCESORIOS';
            else continue;

            if (categoriaFiltro && categoriaFiltro !== 'todos' && categoriaFiltro !== categoriaKey) continue;

            const productName = detail.product?.name || 'Desconocido';
            const quantity = detail.quantity || 1;
            const unitPriceSinIva = parseFloat(detail.unit_price) || 0;
            const unitPriceConIva = unitPriceSinIva * 1.16;
            const totalProducto = unitPriceConIva * quantity;

            // Determinar rango de precio
            let rangoKey = 'Más de $5,000';
            for (const rango of RANGOS_PRECIO) {
                if (unitPriceConIva >= rango.min && unitPriceConIva < rango.max) {
                    rangoKey = rango.label;
                    break;
                }
            }

            salesDetails.push({
                productId,
                productName,
                quantity,
                unitPriceConIva,
                totalProducto,
                categoriaKey,
                rangoKey
            });

            if (productId) {
                productIdsNeeded.add(productId);
            }
        }
    }

    // Consultar costos en paralelo con límite de concurrencia
    const costPromises = Array.from(productIdsNeeded).map(id => getProductCost(id));
    await Promise.all(costPromises);

    // Segunda pasada: procesar con los costos ya obtenidos
    for (const detalle of salesDetails) {
        const costoConIva = costCache.get(detalle.productId) || 0;
        const utilidad = detalle.unitPriceConIva - costoConIva;
        
        // Fórmula correcta: ((Precio - Costo) / Precio) * 100
        const margen = detalle.unitPriceConIva > 0 ? (utilidad / detalle.unitPriceConIva) * 100 : 0;

        // Verificar si el producto tiene costo 0 (no se puede calcular margen real)
        const sinCosto = costoConIva === 0;

        const productoData = {
            nombre: detalle.productName,
            productId: detalle.productId,
            cantidad: detalle.quantity,
            precioUnitario: detalle.unitPriceConIva,
            total: detalle.totalProducto,
            costoUnitario: costoConIva,
            utilidad: utilidad,
            margen: margen,
            categoria: detalle.categoriaKey,
            rangoPrecio: detalle.rangoKey,
            sinCosto: sinCosto
        };

        // Agregar a la categoría (siempre, incluso sin costo)
        if (resultados.categorias[detalle.categoriaKey]) {
            resultados.categorias[detalle.categoriaKey].productos.push(productoData);
            resultados.categorias[detalle.categoriaKey].totalUnidades += detalle.quantity;
            resultados.categorias[detalle.categoriaKey].totalVenta += detalle.totalProducto;
            resultados.categorias[detalle.categoriaKey].totalCosto += costoConIva * detalle.quantity;
            resultados.categorias[detalle.categoriaKey].utilidadTotal += utilidad * detalle.quantity;
        }

        // Agregar al rango de precio
        if (resultados.porRangoPrecio[detalle.rangoKey]) {
            resultados.porRangoPrecio[detalle.rangoKey].productos.push(productoData);
            resultados.porRangoPrecio[detalle.rangoKey].totalUnidades += detalle.quantity;
            resultados.porRangoPrecio[detalle.rangoKey].totalVenta += detalle.totalProducto;
            resultados.porRangoPrecio[detalle.rangoKey].totalCosto += costoConIva * detalle.quantity;
            resultados.porRangoPrecio[detalle.rangoKey].utilidadTotal += utilidad * detalle.quantity;
        }

        // Totales generales
        resultados.totalProductos += detalle.quantity;
        resultados.totalVentas += detalle.totalProducto;
        resultados.totalUtilidad += utilidad * detalle.quantity;

        // Productos destacados - solo si tienen costo > 0
        if (!sinCosto) {
            if (!resultados.productosDestacados.mejorMargen || margen > resultados.productosDestacados.mejorMargen.margen) {
                resultados.productosDestacados.mejorMargen = { ...productoData };
            }
            if (!resultados.productosDestacados.peorMargen || margen < resultados.productosDestacados.peorMargen.margen) {
                resultados.productosDestacados.peorMargen = { ...productoData };
            }
        }
        
        // Más vendido (independientemente del costo)
        if (!resultados.productosDestacados.masVendido || detalle.quantity > resultados.productosDestacados.masVendido.cantidad) {
            resultados.productosDestacados.masVendido = { ...productoData };
        }
    }

    // Calcular márgenes promedio por categoría (excluyendo productos sin costo)
    for (const [key, cat] of Object.entries(resultados.categorias)) {
        const productosConCosto = cat.productos.filter(p => !p.sinCosto);
        const totalVentaConCosto = productosConCosto.reduce((sum, p) => sum + p.total, 0);
        const totalUtilidadConCosto = productosConCosto.reduce((sum, p) => sum + p.utilidad, 0);
        cat.margenPromedio = totalVentaConCosto > 0 ? (totalUtilidadConCosto / totalVentaConCosto) * 100 : 0;
        cat.productosConCosto = productosConCosto.length;
        cat.productosSinCosto = cat.productos.length - productosConCosto.length;
    }

    // Calcular márgenes promedio por rango de precio (excluyendo productos sin costo)
    for (const [key, rango] of Object.entries(resultados.porRangoPrecio)) {
        const productosConCosto = rango.productos.filter(p => !p.sinCosto);
        const totalVentaConCosto = productosConCosto.reduce((sum, p) => sum + p.total, 0);
        const totalUtilidadConCosto = productosConCosto.reduce((sum, p) => sum + p.utilidad, 0);
        rango.margenPromedio = totalVentaConCosto > 0 ? (totalUtilidadConCosto / totalVentaConCosto) * 100 : 0;
    }

    // Margen promedio general (excluyendo productos sin costo)
    const productosConCostoGlobal = salesDetails.filter(d => costCache.get(d.productId) > 0);
    const totalVentaConCostoGlobal = productosConCostoGlobal.reduce((sum, d) => sum + d.totalProducto, 0);
    const totalUtilidadConCostoGlobal = productosConCostoGlobal.reduce((sum, d) => {
        const costo = costCache.get(d.productId) || 0;
        return sum + (d.unitPriceConIva - costo) * d.quantity;
    }, 0);
    resultados.margenPromedioGeneral = totalVentaConCostoGlobal > 0 ? (totalUtilidadConCostoGlobal / totalVentaConCostoGlobal) * 100 : 0;

    return resultados;
}

// ==================== RENDERIZAR RESULTADOS ====================

function renderResultadosMargen(resultados, categoriaFiltro, startDate, endDate) {
    const container = document.getElementById('analisisMargenResults');
    
    // Tarjetas de resumen
    const statsHtml = `
        <div class="stats" style="margin-bottom: 24px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <div class="stat-number">${resultados.totalProductos}</div>
                <div class="stat-label">📦 Total Productos</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                <div class="stat-number">${resultados.margenPromedioGeneral.toFixed(1)}%</div>
                <div class="stat-label">📊 Margen Promedio General</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(resultados.totalVentas)}</div>
                <div class="stat-label">💰 Total Ventas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(resultados.totalUtilidad)}</div>
                <div class="stat-label">💵 Utilidad Total</div>
            </div>
        </div>
    `;

    // Productos destacados
    const destacadosHtml = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #10b981 0%, #34d399 100%); cursor: default; padding: 16px; color: white;">
                <div style="font-size: 0.7rem; opacity: 0.8;">🏆 Mejor Margen</div>
                <div style="font-weight: 700; font-size: 0.9rem; margin-top: 4px; color: white;">${escapeHtml(resultados.productosDestacados.mejorMargen?.nombre || 'N/A')}</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: white;">${resultados.productosDestacados.mejorMargen?.margen?.toFixed(1) || 0}%</div>
                <div style="font-size: 0.6rem; opacity: 0.7; color: white;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(resultados.productosDestacados.mejorMargen?.precioUnitario || 0)}</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); cursor: default; padding: 16px; color: white;">
                <div style="font-size: 0.7rem; opacity: 0.8;">⚠️ Peor Margen</div>
                <div style="font-weight: 700; font-size: 0.9rem; margin-top: 4px; color: white;">${escapeHtml(resultados.productosDestacados.peorMargen?.nombre || 'N/A')}</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: white;">${resultados.productosDestacados.peorMargen?.margen?.toFixed(1) || 0}%</div>
                <div style="font-size: 0.6rem; opacity: 0.7; color: white;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(resultados.productosDestacados.peorMargen?.precioUnitario || 0)}</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); cursor: default; padding: 16px; color: white;">
                <div style="font-size: 0.7rem; opacity: 0.8;">📦 Más Vendido</div>
                <div style="font-weight: 700; font-size: 0.9rem; margin-top: 4px; color: white;">${escapeHtml(resultados.productosDestacados.masVendido?.nombre || 'N/A')}</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: white;">${resultados.productosDestacados.masVendido?.cantidad || 0} pzas.</div>
                <div style="font-size: 0.6rem; opacity: 0.7; color: white;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(resultados.productosDestacados.masVendido?.total || 0)}</div>
            </div>
        </div>
    `;

    // Tabla de categorías - CON BARRA DE CONTRIBUCIÓN A LA UTILIDAD TOTAL
    let categoriasHtml = `
        <h4 style="color: #1e40af; margin-bottom: 12px;">📊 Margen por Categoría</h4>
        <div class="table-container">
            <table class="resumen-table">
                <thead>
                    <tr>
                        <th>Categoría</th>
                        <th style="text-align: center;">Unidades</th>
                        <th style="text-align: right;">Venta Total</th>
                        <th style="text-align: right;">Utilidad</th>
                        <th style="text-align: center;">Margen</th>
                        <th style="text-align: center;">Contribución</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Calcular la utilidad total de todas las categorías
    const utilidadTotalGeneral = Object.values(resultados.categorias).reduce((sum, cat) => sum + cat.utilidadTotal, 0);

    for (const [key, cat] of Object.entries(resultados.categorias)) {
        if (cat.productos.length === 0) continue;
        
        // Margen real (0-100%) - solo para mostrar el número
        const margenDisplay = cat.margenPromedio;
        
        // Contribución a la utilidad total (%)
        const contribucionPorcentaje = utilidadTotalGeneral > 0 ? (cat.utilidadTotal / utilidadTotalGeneral) * 100 : 0;
        const barWidthContribucion = Math.min(contribucionPorcentaje, 100);
        
        const color = cat.color || '#64748b';
        const margenColor = cat.margenPromedio >= 40 ? '#10b981' : cat.margenPromedio >= 25 ? '#f59e0b' : '#ef4444';
        
        // Mostrar advertencia si hay productos sin costo
        const sinCostoWarning = cat.productosSinCosto > 0 ? 
            `<span style="font-size: 0.6rem; color: #f59e0b; margin-left: 4px;" title="${cat.productosSinCosto} productos sin costo">⚠️</span>` : '';
        
        categoriasHtml += `
            <tr>
                <td><span style="color: ${color}; font-weight: 600;">${cat.icon} ${cat.label}</span> ${sinCostoWarning}</td>
                <td style="text-align: center;">${cat.totalUnidades}</td>
                <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cat.totalVenta)}</td>
                <td style="text-align: right; color: #059669; font-weight: 600;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cat.utilidadTotal)}</td>
                <td style="text-align: center; font-weight: bold; color: ${margenColor};">
                    ${margenDisplay.toFixed(1)}%
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 8px;">
                            <div style="width: ${barWidthContribucion}%; background: ${color}; height: 100%; border-radius: 20px;"></div>
                        </div>
                        <span style="font-size: 0.7rem; color: ${color}; font-weight: 600;">${contribucionPorcentaje.toFixed(1)}%</span>
                    </div>
                </td>
            </tr>
        `;
    }

    categoriasHtml += `
                </tbody>
            </table>
        </div>
    `;

    // Tabla de rangos de precio
    let rangosHtml = `
        <h4 style="color: #1e40af; margin: 24px 0 12px;">💰 Margen por Rango de Precio</h4>
        <div class="table-container">
            <table class="resumen-table">
                <thead>
                    <tr>
                        <th>Rango de Precio</th>
                        <th style="text-align: center;">Productos</th>
                        <th style="text-align: right;">Venta Total</th>
                        <th style="text-align: right;">Utilidad</th>
                        <th style="text-align: center;">Margen</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const [rangoLabel, rangoData] of Object.entries(resultados.porRangoPrecio)) {
        if (rangoData.productos.length === 0) continue;
        
        const margenColor = rangoData.margenPromedio >= 40 ? '#10b981' : rangoData.margenPromedio >= 25 ? '#f59e0b' : '#ef4444';
        
        rangosHtml += `
            <tr>
                <td><strong>${rangoLabel}</strong></td>
                <td style="text-align: center;">${rangoData.productos.length}</td>
                <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(rangoData.totalVenta)}</td>
                <td style="text-align: right; color: #059669;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(rangoData.utilidadTotal)}</td>
                <td style="text-align: center; font-weight: bold; color: ${margenColor};">
                    ${rangoData.margenPromedio.toFixed(1)}%
                </td>
            </tr>
        `;
    }

    rangosHtml += `
                </tbody>
            </table>
        </div>
    `;

    // Botón de exportar
    const exportHtml = `
        <div style="display: flex; justify-content: flex-end; margin-top: 24px; gap: 10px;">
            <button id="exportAnalisisMargenBtn" class="btn-export-excel" style="background: #059669; padding: 8px 16px; border-radius: 8px; color: white; border: none; cursor: pointer;">
                📊 Exportar a Excel
            </button>
        </div>
    `;

    container.innerHTML = statsHtml + destacadosHtml + categoriasHtml + rangosHtml + exportHtml;
    container.style.display = 'block';

    // Event listener para exportar
    const exportBtn = document.getElementById('exportAnalisisMargenBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportAnalisisMargenToExcel(resultados, startDate, endDate));
    }

    // Renderizar gráfica
    setTimeout(() => renderMargenChart(resultados), 300);
}

// ==================== GRÁFICA DE MARGEN ====================

function renderMargenChart(resultados) {
    const ctx = document.getElementById('margenChart');
    if (!ctx) return;

    if (window.margenChartInstance) {
        window.margenChartInstance.destroy();
    }

    const labels = [];
    const data = [];
    const colors = [];

    for (const [key, cat] of Object.entries(resultados.categorias)) {
        if (cat.productos.length === 0) continue;
        labels.push(cat.label);
        data.push(cat.margenPromedio);
        colors.push(cat.color || '#64748b');
    }

    window.margenChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Margen Promedio (%)',
                data: data,
                backgroundColor: colors.map(c => c + '80'),
                borderColor: colors,
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Margen: ${context.raw.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

// ==================== EXPORTAR A EXCEL ====================

function exportAnalisisMargenToExcel(resultados, startDate, endDate) {
    const excelData = [
        ['ANÁLISIS DE MARGEN POR CATEGORÍA'],
        [`Período: ${formatDate(startDate)} - ${formatDate(endDate)}`],
        [`Margen Promedio General: ${resultados.margenPromedioGeneral.toFixed(1)}%`],
        [],
        ['RESUMEN POR CATEGORÍA'],
        ['Categoría', 'Unidades', 'Venta Total', 'Utilidad', 'Margen (%)', 'Contribución (%)']
    ];

    // Calcular utilidad total para contribuciones
    const utilidadTotalGeneral = Object.values(resultados.categorias).reduce((sum, cat) => sum + cat.utilidadTotal, 0);

    for (const [key, cat] of Object.entries(resultados.categorias)) {
        if (cat.productos.length === 0) continue;
        const contribucion = utilidadTotalGeneral > 0 ? (cat.utilidadTotal / utilidadTotalGeneral) * 100 : 0;
        excelData.push([
            cat.label,
            cat.totalUnidades,
            cat.totalVenta,
            cat.utilidadTotal,
            cat.margenPromedio.toFixed(1),
            contribucion.toFixed(1)
        ]);
    }

    excelData.push([]);
    excelData.push(['RESUMEN POR RANGO DE PRECIO']);
    excelData.push(['Rango', 'Productos', 'Venta Total', 'Utilidad', 'Margen (%)']);

    for (const [rangoLabel, rangoData] of Object.entries(resultados.porRangoPrecio)) {
        if (rangoData.productos.length === 0) continue;
        excelData.push([
            rangoLabel,
            rangoData.productos.length,
            rangoData.totalVenta,
            rangoData.utilidadTotal,
            rangoData.margenPromedio.toFixed(1)
        ]);
    }

    excelData.push([]);
    excelData.push(['PRODUCTOS DESTACADOS']);
    excelData.push(['Tipo', 'Producto', 'Cantidad', 'Precio', 'Margen (%)']);
    
    if (resultados.productosDestacados.mejorMargen) {
        excelData.push([
            '🏆 Mejor Margen',
            resultados.productosDestacados.mejorMargen.nombre,
            resultados.productosDestacados.mejorMargen.cantidad,
            resultados.productosDestacados.mejorMargen.precioUnitario,
            resultados.productosDestacados.mejorMargen.margen.toFixed(1)
        ]);
    }
    if (resultados.productosDestacados.peorMargen) {
        excelData.push([
            '⚠️ Peor Margen',
            resultados.productosDestacados.peorMargen.nombre,
            resultados.productosDestacados.peorMargen.cantidad,
            resultados.productosDestacados.peorMargen.precioUnitario,
            resultados.productosDestacados.peorMargen.margen.toFixed(1)
        ]);
    }
    if (resultados.productosDestacados.masVendido) {
        excelData.push([
            '📦 Más Vendido',
            resultados.productosDestacados.masVendido.nombre,
            resultados.productosDestacados.masVendido.cantidad,
            resultados.productosDestacados.masVendido.precioUnitario,
            resultados.productosDestacados.masVendido.margen.toFixed(1)
        ]);
    }

    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `analisis_margen_${startDate}_${endDate}`);
    } else {
        console.error('La función exportToExcel no está disponible');
        alert('Error: No se pudo exportar. La función de exportación no está disponible.');
    }
}

// ==================== INICIALIZAR MÓDULO ====================

function initAnalisisMargenModule() {
    console.log('🔄 Inicializando módulo de análisis de margen...');
    
    // Configurar fechas por defecto (últimos 30 días)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startInput = document.getElementById('margenStartDate');
    const endInput = document.getElementById('margenEndDate');
    
    if (startInput) {
        const year = startDate.getFullYear();
        const month = String(startDate.getMonth() + 1).padStart(2, '0');
        const day = String(startDate.getDate()).padStart(2, '0');
        startInput.value = `${year}-${month}-${day}`;
    }
    if (endInput) {
        const year = endDate.getFullYear();
        const month = String(endDate.getMonth() + 1).padStart(2, '0');
        const day = String(endDate.getDate()).padStart(2, '0');
        endInput.value = `${year}-${month}-${day}`;
    }
    
    // Configurar event listener del botón
    const searchBtn = document.getElementById('searchAnalisisMargenBtn');
    if (searchBtn) {
        const newBtn = searchBtn.cloneNode(true);
        searchBtn.parentNode.replaceChild(newBtn, searchBtn);
        newBtn.addEventListener('click', searchAnalisisMargen);
    }
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initAnalisisMargenModule = initAnalisisMargenModule;
window.searchAnalisisMargen = searchAnalisisMargen;