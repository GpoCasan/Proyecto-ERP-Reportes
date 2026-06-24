// ==================== MÓDULO: INGRESOS (OPTIMIZADO) ====================

let cachedIngresosData = null;

// Configuración de conceptos con sus IDs
const CONCEPTOS_CONFIG = {
    'SERVINET_SUBS': { ids: [219], tipo: 'service', nombre: 'SERVINET SUBS' },
    'SERVINET_POSPAGO': { ids: [259, 260], tipo: 'service', nombre: 'SERVINET POS PAGO' },
    'SPAY_ENGANCHE': { creditProviderId: 1, nombre: 'SPAY ENGANCHE' },
    'SPAY_PAGOS': { ids: [214, 995], tipo: 'service', nombre: 'SPAY PAGOS' },
    'PAYJOY_ENGANCHE': { creditProviderId: 2, nombre: 'PAYJOY ENGANCHE' },
    'PAYJOY_PAGOS': { ids: [215], tipo: 'service', nombre: 'PAYJOY PAGOS' },
    'CREDICEL_ENGANCHE': { creditProviderId: 3, nombre: 'CREDICEL ENGANCHE' },
    'CREDICEL_PAGOS': { ids: [216], tipo: 'service', nombre: 'CREDICEL PAGOS' },
    'PAGUITOS_ENGANCHE': { creditProviderId: 7, nombre: 'PAGUITOS ENGANCHE' }
};

// Cache para evitar consultas repetidas a la misma fecha
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Función para obtener o establecer caché
function getCached(key) {
    const cached = queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCached(key, data) {
    queryCache.set(key, { data, timestamp: Date.now() });
}

// Función para cargar sucursales
async function loadIngresosBranches() {
    const branchSelect = document.getElementById('ingresosBranchSelect');
    if (!branchSelect) return;
    
    branchSelect.innerHTML = '<option value="">Cargando sucursales...</option>';
    branchSelect.disabled = true;
    
    try {
        const url = `${CONFIG.API_BRANCHES}?page=1&per_page=100&totalPages=0`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        let branches = [];
        if (data.data && Array.isArray(data.data)) {
            branches = data.data;
        } else if (Array.isArray(data)) {
            branches = data;
        } else if (data.branches && Array.isArray(data.branches)) {
            branches = data.branches;
        } else {
            console.warn('Estructura de sucursales no reconocida:', data);
            branchSelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
            branchSelect.disabled = false;
            return;
        }
        
        branchSelect.innerHTML = '';
        
        branches.sort((a, b) => a.name.localeCompare(b.name));
        
        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.name;
            branchSelect.appendChild(option);
        });
        
        branchSelect.disabled = false;
        
        if (branches.length > 0) {
            branchSelect.selectedIndex = 0;
        }
        
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        branchSelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
        branchSelect.disabled = false;
        showError('ingresos', `Error al cargar sucursales: ${error.message}`);
    }
}

// Función para obtener rango de fecha para un día específico (6:00 PM a 6:00 PM del día siguiente)
function getDateRangeForDay(dateStr) {
    const startDate = new Date(dateStr);
    startDate.setHours(18, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const startStr = startDate.toISOString().slice(0, 19).replace('T', '+');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', '+');
    
    return { start: startStr, end: endStr };
}

// Función optimizada: Consulta TODOS los servicios de un día (sin filtrar por producto)
async function fetchAllServices(startDateTime, endDateTime, branchId) {
    const cacheKey = `services_${startDateTime}_${endDateTime}_${branchId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    
    let url = `${CONFIG.API_SALES}?page=1&per_page=100&total=0&sale_type=services&start_date=${startDateTime}&end_date=${endDateTime}`;
    
    if (branchId && branchId !== '') {
        url += `&branch_ids[]=${branchId}`;
    }
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const sales = data.data || [];
        
        // Procesar y agrupar por asesor inmediatamente
        const result = new Map();
        
        for (const sale of sales) {
            const asesor = sale.user?.name || 'No disponible';
            const serviceFee = parseFloat(sale.service_fee) || 0;
            
            if (!result.has(asesor)) {
                result.set(asesor, {
                    asesor: asesor,
                    comisiones: 0,
                    servicios: {
                        SERVINET_SUBS: 0, SERVINET_SUBS_CANT: 0,
                        SERVINET_POSPAGO: 0, SERVINET_POSPAGO_CANT: 0,
                        SPAY_PAGOS: 0, SPAY_PAGOS_CANT: 0,
                        PAYJOY_PAGOS: 0, PAYJOY_PAGOS_CANT: 0,
                        CREDICEL_PAGOS: 0, CREDICEL_PAGOS_CANT: 0
                    }
                });
            }
            
            const asesorData = result.get(asesor);
            asesorData.comisiones += serviceFee;
            
            for (const detail of (sale.details || [])) {
                const totalAmount = parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;
                const productId = detail.product_id;
                const quantity = detail.quantity || 1;
                
                if (CONCEPTOS_CONFIG.SERVINET_SUBS.ids.includes(productId)) {
                    asesorData.servicios.SERVINET_SUBS += totalAmount;
                    asesorData.servicios.SERVINET_SUBS_CANT += quantity;
                }
                if (CONCEPTOS_CONFIG.SERVINET_POSPAGO.ids.includes(productId)) {
                    asesorData.servicios.SERVINET_POSPAGO += totalAmount;
                    asesorData.servicios.SERVINET_POSPAGO_CANT += quantity;
                }
                if (CONCEPTOS_CONFIG.SPAY_PAGOS.ids.includes(productId)) {
                    asesorData.servicios.SPAY_PAGOS += totalAmount;
                    asesorData.servicios.SPAY_PAGOS_CANT += quantity;
                }
                if (CONCEPTOS_CONFIG.PAYJOY_PAGOS.ids.includes(productId)) {
                    asesorData.servicios.PAYJOY_PAGOS += totalAmount;
                    asesorData.servicios.PAYJOY_PAGOS_CANT += quantity;
                }
                if (CONCEPTOS_CONFIG.CREDICEL_PAGOS.ids.includes(productId)) {
                    asesorData.servicios.CREDICEL_PAGOS += totalAmount;
                    asesorData.servicios.CREDICEL_PAGOS_CANT += quantity;
                }
            }
        }
        
        setCached(cacheKey, result);
        return result;
        
    } catch (error) {
        console.error('Error en fetchAllServices:', error);
        return new Map();
    }
}

// Función optimizada: Consulta TODOS los créditos de un día (todos los proveedores)
async function fetchAllCredits(startDateTime, endDateTime, branchId) {
    const cacheKey = `credits_${startDateTime}_${endDateTime}_${branchId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    
    let url = `${CONFIG.API_SALES}?page=1&per_page=100&total=0&sale_type=credit&start_date=${startDateTime}&end_date=${endDateTime}`;
    
    if (branchId && branchId !== '') {
        url += `&branch_ids[]=${branchId}`;
    }
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const sales = data.data || [];
        
        // Procesar y agrupar por asesor inmediatamente
        const result = new Map();
        
        for (const sale of sales) {
            const asesor = sale.user?.name || 'No disponible';
            const creditProviderId = sale.credit_provider?.id;
            
            if (!result.has(asesor)) {
                result.set(asesor, {
                    asesor: asesor,
                    creditos: {
                        SPAY_ENGANCHE: 0,
                        PAYJOY_ENGANCHE: 0,
                        CREDICEL_ENGANCHE: 0,
                        PAGUITOS_ENGANCHE: 0
                    }
                });
            }
            
            let totalEnganche = 0;
            for (const detail of (sale.details || [])) {
                if (detail.payment_type === 'Enganche') {
                    totalEnganche += parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;
                }
            }
            
            if (totalEnganche > 0) {
                const asesorData = result.get(asesor);
                if (creditProviderId === 1) asesorData.creditos.SPAY_ENGANCHE += totalEnganche;
                else if (creditProviderId === 2) asesorData.creditos.PAYJOY_ENGANCHE += totalEnganche;
                else if (creditProviderId === 3) asesorData.creditos.CREDICEL_ENGANCHE += totalEnganche;
                else if (creditProviderId === 7) asesorData.creditos.PAGUITOS_ENGANCHE += totalEnganche;
            }
        }
        
        setCached(cacheKey, result);
        return result;
        
    } catch (error) {
        console.error('Error en fetchAllCredits:', error);
        return new Map();
    }
}

// Función optimizada: Consulta ventas de contado por asesor
async function fetchContadoPorAsesor(startDateTime, endDateTime, branchId) {
    const cacheKey = `contado_${startDateTime}_${endDateTime}_${branchId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    
    let url = `${CONFIG.API_SALES}?page=1&per_page=100&total=0&sale_type=products&start_date=${startDateTime}&end_date=${endDateTime}`;
    
    if (branchId && branchId !== '') {
        url += `&branch_ids[]=${branchId}`;
    }
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const sales = data.data || [];
        
        const totalPorAsesor = new Map();
        
        for (const sale of sales) {
            const asesor = sale.user?.name || 'No disponible';
            let totalVenta = 0;
            
            for (const detail of (sale.details || [])) {
                totalVenta += parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;
            }
            
            if (totalVenta > 0) {
                totalPorAsesor.set(asesor, (totalPorAsesor.get(asesor) || 0) + totalVenta);
            }
        }
        
        setCached(cacheKey, totalPorAsesor);
        return totalPorAsesor;
        
    } catch (error) {
        console.error('Error en fetchContadoPorAsesor:', error);
        return new Map();
    }
}

// Función para generar lista de fechas entre dos fechas
function getDatesBetween(startDateStr, endDateStr) {
    const dates = [];
    const startParts = startDateStr.split('-');
    const endParts = endDateStr.split('-');
    
    const startYear = parseInt(startParts[0]);
    const startMonth = parseInt(startParts[1]) - 1;
    const startDay = parseInt(startParts[2]);
    
    const endYear = parseInt(endParts[0]);
    const endMonth = parseInt(endParts[1]) - 1;
    const endDay = parseInt(endParts[2]);
    
    const start = new Date(startYear, startMonth, startDay);
    const end = new Date(endYear, endMonth, endDay);
    
    let current = new Date(start);
    while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

// Función para formatear fecha
function formatDateDisplay(dateStr) {
    if (!dateStr) return 'No disponible';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Función para procesar un día (ahora con solo 3 consultas)
async function procesarDiaOptimizado(fechaDisplay, branchId) {
    const range = getDateRangeForDay(fechaDisplay);
    
    // Solo 3 consultas en paralelo en lugar de 6
    const [serviciosPorAsesor, creditosPorAsesor, contadoPorAsesor] = await Promise.all([
        fetchAllServices(range.start, range.end, branchId),
        fetchAllCredits(range.start, range.end, branchId),
        fetchContadoPorAsesor(range.start, range.end, branchId)
    ]);
    
    // Combinar todos los asesores únicos
    const allAsesores = new Set();
    for (const [asesor] of serviciosPorAsesor) allAsesores.add(asesor);
    for (const [asesor] of creditosPorAsesor) allAsesores.add(asesor);
    for (const [asesor] of contadoPorAsesor) allAsesores.add(asesor);
    
    const resultados = [];
    
    for (const asesor of allAsesores) {
        const servicios = serviciosPorAsesor.get(asesor) || { servicios: {}, comisiones: 0 };
        const creditos = creditosPorAsesor.get(asesor) || { creditos: {} };
        const totalContado = contadoPorAsesor.get(asesor) || 0;
        
        resultados.push({
            asesor: asesor,
            fecha: fechaDisplay,
            totalContado: totalContado,
            SERVINET_SUBS: servicios.servicios?.SERVINET_SUBS || 0,
            SERVINET_SUBS_CANT: servicios.servicios?.SERVINET_SUBS_CANT || 0,
            SERVINET_POSPAGO: servicios.servicios?.SERVINET_POSPAGO || 0,
            SERVINET_POSPAGO_CANT: servicios.servicios?.SERVINET_POSPAGO_CANT || 0,
            SPAY_ENGANCHE: creditos.creditos?.SPAY_ENGANCHE || 0,
            SPAY_PAGOS: servicios.servicios?.SPAY_PAGOS || 0,
            SPAY_PAGOS_CANT: servicios.servicios?.SPAY_PAGOS_CANT || 0,
            PAYJOY_ENGANCHE: creditos.creditos?.PAYJOY_ENGANCHE || 0,
            PAYJOY_PAGOS: servicios.servicios?.PAYJOY_PAGOS || 0,
            PAYJOY_PAGOS_CANT: servicios.servicios?.PAYJOY_PAGOS_CANT || 0,
            CREDICEL_ENGANCHE: creditos.creditos?.CREDICEL_ENGANCHE || 0,
            CREDICEL_PAGOS: servicios.servicios?.CREDICEL_PAGOS || 0,
            CREDICEL_PAGOS_CANT: servicios.servicios?.CREDICEL_PAGOS_CANT || 0,
            PAGUITOS_ENGANCHE: creditos.creditos?.PAGUITOS_ENGANCHE || 0,
            comisiones: servicios.comisiones || 0
        });
    }
    
    return resultados;
}

// Función principal searchIngresos
async function searchIngresos() {
    const startDate = document.getElementById('ingresosStartDate').value;
    const endDate = document.getElementById('ingresosEndDate').value;
    const branchId = document.getElementById('ingresosBranchSelect').value;
    
    if (!startDate) { showError('ingresos', 'Seleccione una fecha de inicio'); return; }
    if (!endDate) { showError('ingresos', 'Seleccione una fecha de fin'); return; }
    if (!branchId) { showError('ingresos', 'Debe seleccionar una sucursal'); return; }
    
    const fechas = getDatesBetween(startDate, endDate);
    const diffDays = fechas.length;
    
    if (diffDays > 4) {
        showError('ingresos', `El período máximo es de 4 días (actual: ${diffDays} días). Seleccione un rango menor.`);
        return;
    }
    
    const btn = document.getElementById('searchIngresosBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    document.getElementById('ingresosResults').style.display = 'none';
    document.getElementById('ingresosErrorAlert').style.display = 'none';
    document.getElementById('ingresosInfoAlert').style.display = 'none';
    
    try {
        // Procesar días en paralelo (máximo 4 días)
        const promises = fechas.map(fecha => procesarDiaOptimizado(fecha, branchId));
        const resultadosPorDia = await Promise.all(promises);
        
        let datosTabla = [];
        for (const dia of resultadosPorDia) datosTabla.push(...dia);
        
        datosTabla.sort((a, b) => {
            if (a.asesor !== b.asesor) return a.asesor.localeCompare(b.asesor);
            return a.fecha.localeCompare(b.fecha);
        });
        
        const totales = {
            totalContado: 0,
            SERVINET_SUBS: 0, SERVINET_SUBS_CANT: 0,
            SERVINET_POSPAGO: 0, SERVINET_POSPAGO_CANT: 0,
            SPAY_ENGANCHE: 0, SPAY_PAGOS: 0, SPAY_PAGOS_CANT: 0,
            PAYJOY_ENGANCHE: 0, PAYJOY_PAGOS: 0, PAYJOY_PAGOS_CANT: 0,
            CREDICEL_ENGANCHE: 0, CREDICEL_PAGOS: 0, CREDICEL_PAGOS_CANT: 0,
            PAGUITOS_ENGANCHE: 0,
            comisiones: 0
        };
        
        for (const row of datosTabla) {
            totales.totalContado += row.totalContado;
            totales.SERVINET_SUBS += row.SERVINET_SUBS;
            totales.SERVINET_SUBS_CANT += row.SERVINET_SUBS_CANT;
            totales.SERVINET_POSPAGO += row.SERVINET_POSPAGO;
            totales.SERVINET_POSPAGO_CANT += row.SERVINET_POSPAGO_CANT;
            totales.SPAY_ENGANCHE += row.SPAY_ENGANCHE;
            totales.SPAY_PAGOS += row.SPAY_PAGOS;
            totales.SPAY_PAGOS_CANT += row.SPAY_PAGOS_CANT;
            totales.PAYJOY_ENGANCHE += row.PAYJOY_ENGANCHE;
            totales.PAYJOY_PAGOS += row.PAYJOY_PAGOS;
            totales.PAYJOY_PAGOS_CANT += row.PAYJOY_PAGOS_CANT;
            totales.CREDICEL_ENGANCHE += row.CREDICEL_ENGANCHE;
            totales.CREDICEL_PAGOS += row.CREDICEL_PAGOS;
            totales.CREDICEL_PAGOS_CANT += row.CREDICEL_PAGOS_CANT;
            totales.PAGUITOS_ENGANCHE += row.PAGUITOS_ENGANCHE;
            totales.comisiones += row.comisiones;
        }
        
        const sucursalNombre = document.getElementById('ingresosBranchSelect').options[document.getElementById('ingresosBranchSelect').selectedIndex]?.text || 'Sucursal seleccionada';
        
        cachedIngresosData = { datosTabla, totales, startDate, endDate, branchId, diffDays, sucursalNombre };
        
        // Resto del código de renderizado (statsHtml, tableHtml, etc.) igual que antes...
        // [Mantén el mismo código de renderizado que ya tenías]
        
        // Tarjetas de estadísticas
        const statsHtml = `
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 16px; margin-bottom: 24px;">
                <div class="stat-card-btn" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); cursor: pointer;" onclick="openIngresosModal('contado')">
                    <div class="stat-number">💰</div>
                    <div class="stat-label">CONTADO</div>
                </div>
                <div class="stat-card-btn" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); cursor: pointer;" onclick="openIngresosModal('servinet')">
                    <div class="stat-number">💰</div>
                    <div class="stat-label">SERVINET</div>
                </div>
                <div class="stat-card-btn" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); cursor: pointer;" onclick="openIngresosModal('spay')">
                    <div class="stat-number">💳</div>
                    <div class="stat-label">SPAY</div>
                </div>
                <div class="stat-card-btn" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); cursor: pointer;" onclick="openIngresosModal('payjoy')">
                    <div class="stat-number">💰</div>
                    <div class="stat-label">PAYJOY</div>
                </div>
                <div class="stat-card-btn" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); cursor: pointer;" onclick="openIngresosModal('credicel')">
                    <div class="stat-number">💳</div>
                    <div class="stat-label">CREDICEL</div>
                </div>
                <div class="stat-card-btn" style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); cursor: pointer;" onclick="openIngresosModal('paguitos')">
                    <div class="stat-number">💳</div>
                    <div class="stat-label">PAGUITOS</div>
                </div>
                <div class="stat-card-btn" style="background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); cursor: pointer;" onclick="openIngresosModal('comisiones')">
                    <div class="stat-number">💸</div>
                    <div class="stat-label">COMISIONES</div>
                </div>
            </div>
        `;
        
        // Generar tabla HTML
        let tableHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div class="alert alert-info" style="margin-bottom: 0; margin-top: 20px; flex: 1;">
                    📅 Período: ${formatDate(startDate)} - ${formatDate(endDate)} (${diffDays} días) | 🏢 Sucursal: ${sucursalNombre}
                </div>
                <button id="exportIngresosTableBtn" style="background: #10b981; padding: 8px 16px; font-size: 13px; border-radius: 8px; margin-left: 15px;">📊 Exportar a Excel</button>
            </div>
            <div class="ingresos-table-container">
                <table class="ingresos-table" id="ingresosMainTable">
                    <thead>
                        <tr>
                            <th rowspan="2">Asesor</th>
                            <th rowspan="2">Fecha</th>
                            <th rowspan="2">TOTAL<br>CONTADO</th>
                            <th colspan="2">SERVINET</th>
                            <th colspan="2">SPAY</th>
                            <th colspan="2">PAYJOY</th>
                            <th colspan="2">CREDICEL</th>
                            <th rowspan="2">PAGUITOS<br>ENGANCHE</th>
                            <th rowspan="2">COMISIONES<br>(\$10)</th>
                        </tr>
                        <tr>
                            <th>SUBS</th><th>POS PAGO</th>
                            <th>ENGANCHE</th><th>PAGOS</th>
                            <th>ENGANCHE</th><th>PAGOS</th>
                            <th>ENGANCHE</th><th>PAGOS</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let i = 0;
        let isFirstAsesor = true;
        
        while (i < datosTabla.length) {
            const asesorActual = datosTabla[i].asesor;
            let j = i;
            while (j < datosTabla.length && datosTabla[j].asesor === asesorActual) j++;
            const rowspan = j - i;
            
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator"><td colspan="13" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div></tr>`;
            }
            
            for (let k = i; k < j; k++) {
                const row = datosTabla[k];
                const isFirstRowOfAsesor = (k === i);
                
                tableHtml += `<tr>`;
                if (isFirstRowOfAsesor) {
                    tableHtml += `<td style="text-align: left; font-weight: 500; background-color: #f8fafc;" rowspan="${rowspan}">${escapeHtml(row.asesor)}</td>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(row.fecha)}</td>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(row.totalContado)}</td>
                    <td style="text-align: right;">${formatServiceCell(row.SERVINET_SUBS, row.SERVINET_SUBS_CANT)}</td>
                    <td style="text-align: right;">${formatServiceCell(row.SERVINET_POSPAGO, row.SERVINET_POSPAGO_CANT)}</td>
                    <td style="text-align: right;">${formatCreditCell(row.SPAY_ENGANCHE)}</td>
                    <td style="text-align: right;">${formatServiceCell(row.SPAY_PAGOS, row.SPAY_PAGOS_CANT)}</td>
                    <td style="text-align: right;">${formatCreditCell(row.PAYJOY_ENGANCHE)}</td>
                    <td style="text-align: right;">${formatServiceCell(row.PAYJOY_PAGOS, row.PAYJOY_PAGOS_CANT)}</td>
                    <td style="text-align: right;">${formatCreditCell(row.CREDICEL_ENGANCHE)}</td>
                    <td style="text-align: right;">${formatServiceCell(row.CREDICEL_PAGOS, row.CREDICEL_PAGOS_CANT)}</td>
                    <td style="text-align: right;">${formatCreditCell(row.PAGUITOS_ENGANCHE)}</td>
                    <td style="text-align: right; color: #ea580c;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(row.comisiones)}</td>
                </tr>`;
            }
            
            isFirstAsesor = false;
            i = j;
        }
        
        tableHtml += `
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="2" style="text-align: right;">TOTALES:</td>
                        <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.totalContado)}</td>
                        <td style="text-align: right;">${formatServiceCell(totales.SERVINET_SUBS, totales.SERVINET_SUBS_CANT)}</td>
                        <td style="text-align: right;">${formatServiceCell(totales.SERVINET_POSPAGO, totales.SERVINET_POSPAGO_CANT)}</td>
                        <td style="text-align: right;">${formatCreditCell(totales.SPAY_ENGANCHE)}</td>
                        <td style="text-align: right;">${formatServiceCell(totales.SPAY_PAGOS, totales.SPAY_PAGOS_CANT)}</td>
                        <td style="text-align: right;">${formatCreditCell(totales.PAYJOY_ENGANCHE)}</td>
                        <td style="text-align: right;">${formatServiceCell(totales.PAYJOY_PAGOS, totales.PAYJOY_PAGOS_CANT)}</td>
                        <td style="text-align: right;">${formatCreditCell(totales.CREDICEL_ENGANCHE)}</td>
                        <td style="text-align: right;">${formatServiceCell(totales.CREDICEL_PAGOS, totales.CREDICEL_PAGOS_CANT)}</td>
                        <td style="text-align: right;">${formatCreditCell(totales.PAGUITOS_ENGANCHE)}</td>
                        <td style="text-align: right; color: #ea580c;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.comisiones)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        `;
        
        document.getElementById('ingresosResults').innerHTML = statsHtml + tableHtml;
        document.getElementById('ingresosResults').style.display = 'block';
        
        const exportBtn = document.getElementById('exportIngresosTableBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportIngresosToExcel);
        }
        
        if (totales.comisiones === 0 && totales.totalContado === 0 && totales.SERVINET_SUBS === 0) {
            showInfo('ingresos', `⚠️ No se encontraron ingresos para el período seleccionado`, true);
        } else {
            showInfo('ingresos', `✅ Comisiones: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totales.comisiones)}`, false);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('ingresos', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Funciones auxiliares de formato
function formatServiceCell(monto, cantidad) {
    if (monto === 0 && cantidad === 0) return '<span style="color: #94a3b8;">$0</span>';
    const montoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(monto);
    return `${montoFormateado}<br><span style="font-size: 9px; color: #64748b;">${cantidad}</span>`;
}

function formatCreditCell(monto) {
    if (monto === 0) return '<span style="color: #94a3b8;">$0</span>';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(monto);
}

// Función para exportar a Excel
function exportIngresosToExcel() {
    if (!cachedIngresosData) {
        showError('ingresos', 'Primero consulte los datos');
        return;
    }
    
    const { datosTabla, totales, startDate, endDate, sucursalNombre } = cachedIngresosData;
    
    const excelData = [
        ['INGRESOS POR SUCURSAL'],
        [`Período: ${formatDate(startDate)} - ${formatDate(endDate)}`],
        [`Sucursal: ${sucursalNombre}`],
        [],
        ['Asesor', 'Fecha', 'TOTAL CONTADO', 
         'SERVINET SUBS (Monto)', 'SERVINET SUBS (Cant)', 
         'SERVINET POS PAGO (Monto)', 'SERVINET POS PAGO (Cant)',
         'SPAY ENGANCHE', 'SPAY PAGOS (Monto)', 'SPAY PAGOS (Cant)',
         'PAYJOY ENGANCHE', 'PAYJOY PAGOS (Monto)', 'PAYJOY PAGOS (Cant)',
         'CREDICEL ENGANCHE', 'CREDICEL PAGOS (Monto)', 'CREDICEL PAGOS (Cant)',
         'PAGUITOS ENGANCHE', 'COMISIONES']
    ];
    
    for (const row of datosTabla) {
        excelData.push([
            row.asesor,
            formatDateDisplay(row.fecha),
            row.totalContado,
            row.SERVINET_SUBS, row.SERVINET_SUBS_CANT,
            row.SERVINET_POSPAGO, row.SERVINET_POSPAGO_CANT,
            row.SPAY_ENGANCHE,
            row.SPAY_PAGOS, row.SPAY_PAGOS_CANT,
            row.PAYJOY_ENGANCHE,
            row.PAYJOY_PAGOS, row.PAYJOY_PAGOS_CANT,
            row.CREDICEL_ENGANCHE,
            row.CREDICEL_PAGOS, row.CREDICEL_PAGOS_CANT,
            row.PAGUITOS_ENGANCHE,
            row.comisiones
        ]);
    }
    
    excelData.push([]);
    excelData.push(['TOTALES:', '', totales.totalContado,
        totales.SERVINET_SUBS, totales.SERVINET_SUBS_CANT,
        totales.SERVINET_POSPAGO, totales.SERVINET_POSPAGO_CANT,
        totales.SPAY_ENGANCHE,
        totales.SPAY_PAGOS, totales.SPAY_PAGOS_CANT,
        totales.PAYJOY_ENGANCHE,
        totales.PAYJOY_PAGOS, totales.PAYJOY_PAGOS_CANT,
        totales.CREDICEL_ENGANCHE,
        totales.CREDICEL_PAGOS, totales.CREDICEL_PAGOS_CANT,
        totales.PAGUITOS_ENGANCHE,
        totales.comisiones
    ]);
    
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `ingresos_${cachedIngresosData.startDate}_${cachedIngresosData.endDate}`);
    } else {
        console.error('La función exportToExcel no está disponible');
        alert('Error: No se pudo exportar. La función de exportación no está disponible.');
    }
}

// Funciones de modales (openIngresosModal) - mantener igual que antes
function openIngresosModal(tipo) {
    if (!cachedIngresosData) {
        showError('ingresos', 'Primero consulte los datos');
        return;
    }
    
    const { datosTabla, totales } = cachedIngresosData;
    
    let title = '';
    let tableHtml = '';
    
    if (tipo === 'contado') {
        title = '💰 CONTADO - Desglose por Asesor y Día';
        const asesoresMap = new Map();
        for (const row of datosTabla) {
            if (!asesoresMap.has(row.asesor)) asesoresMap.set(row.asesor, []);
            asesoresMap.get(row.asesor).push({ fecha: row.fecha, monto: row.totalContado });
        }
        
        tableHtml = `
            <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
                <div class="stat-card" style="background: #3b82f6; flex: 1;"><div class="stat-number">${asesoresMap.size}</div><div class="stat-label">👥 Asesores</div></div>
                <div class="stat-card" style="background: #3b82f6; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.totalContado)}</div><div class="stat-label">💰 Total</div></div>
            </div>
            <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa;"><tr><th>Asesor</th><th>Fecha</th><th>Monto</th></tr></thead>
                    <tbody>`;
        
        let isFirstAsesor = true;
        for (const [asesor, registros] of asesoresMap) {
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator-modal"><td colspan="3" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div><tr>`;
            }
            isFirstAsesor = false;
            
            const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
            for (let i = 0; i < sorted.length; i++) {
                tableHtml += `<tr>`;
                if (i === 0) {
                    tableHtml += `<td style="text-align: left; font-weight: 500;" rowspan="${sorted.length}">${escapeHtml(asesor)}</div>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(sorted[i].fecha)}</div>
                    <td style="text-align: right; color: #3b82f6;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(sorted[i].monto)}</div>
                </tr>`;
            }
        }
        tableHtml += `</tbody>}</div>`;
    }
    // ... (mantener el resto de los casos: servinet, spay, payjoy, credicel, paguitos, comisiones igual que antes)
    else if (tipo === 'servinet') {
        title = '💰 SERVINET - Desglose por Asesor y Día';
        const asesoresMap = new Map();
        for (const row of datosTabla) {
            if (!asesoresMap.has(row.asesor)) asesoresMap.set(row.asesor, []);
            asesoresMap.get(row.asesor).push({
                fecha: row.fecha,
                subs: row.SERVINET_SUBS, subsCant: row.SERVINET_SUBS_CANT,
                pospago: row.SERVINET_POSPAGO, pospagoCant: row.SERVINET_POSPAGO_CANT
            });
        }
        
        tableHtml = `
            <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
                <div class="stat-card" style="background: #3b82f6; flex: 1;"><div class="stat-number">${asesoresMap.size}</div><div class="stat-label">👥 Asesores</div></div>
                <div class="stat-card" style="background: #3b82f6; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.SERVINET_SUBS + totales.SERVINET_POSPAGO)}</div><div class="stat-label">💰 Total</div></div>
            </div>
            <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa;">
                        <tr><th>Asesor</th><th>Fecha</th><th colspan="2">SUBS</th><th colspan="2">POS PAGO</th></tr>
                        <tr><th></th><th></th><th>Monto</th><th>Cant</th><th>Monto</th><th>Cant</th></tr>
                    </thead>
                    <tbody>`;
        
        let isFirstAsesor = true;
        for (const [asesor, registros] of asesoresMap) {
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator-modal"><td colspan="7" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div></tr>`;
            }
            isFirstAsesor = false;
            
            const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
            for (let i = 0; i < sorted.length; i++) {
                const r = sorted[i];
                tableHtml += `<tr>`;
                if (i === 0) {
                    tableHtml += `<td style="text-align: left; font-weight: 500;" rowspan="${sorted.length}">${escapeHtml(asesor)}</div>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(r.fecha)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.subs)}</div>
                    <td style="text-align: center;">${r.subsCant}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.pospago)}</div>
                    <td style="text-align: center;">${r.pospagoCant}</div>
                </tr>`;
            }
        }
        tableHtml += `</tbody>}</div>`;
    }
    else if (tipo === 'spay') {
        title = '💳 SPAY - Desglose por Asesor y Día';
        const asesoresMap = new Map();
        for (const row of datosTabla) {
            if (!asesoresMap.has(row.asesor)) asesoresMap.set(row.asesor, []);
            asesoresMap.get(row.asesor).push({
                fecha: row.fecha,
                enganche: row.SPAY_ENGANCHE,
                pagos: row.SPAY_PAGOS, pagosCant: row.SPAY_PAGOS_CANT
            });
        }
        
        tableHtml = `
            <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
                <div class="stat-card" style="background: #7c3aed; flex: 1;"><div class="stat-number">${asesoresMap.size}</div><div class="stat-label">👥 Asesores</div></div>
                <div class="stat-card" style="background: #7c3aed; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.SPAY_PAGOS)}</div><div class="stat-label">💰 Total Pagos</div></div>
                <div class="stat-card" style="background: #7c3aed; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.SPAY_ENGANCHE)}</div><div class="stat-label">💸 Total Enganche</div></div>
            </div>
            <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa;">
                        <tr><th>Asesor</th><th>Fecha</th><th>ENGANCHE</th><th colspan="2">PAGOS</th></tr>
                        <tr><th></th><th></th><th>Monto</th><th>Monto</th><th>Cant</th></tr>
                    </thead>
                    <tbody>`;
        
        let isFirstAsesor = true;
        for (const [asesor, registros] of asesoresMap) {
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator-modal"><td colspan="6" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div></table>`;
            }
            isFirstAsesor = false;
            
            const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
            for (let i = 0; i < sorted.length; i++) {
                const r = sorted[i];
                tableHtml += `<tr>`;
                if (i === 0) {
                    tableHtml += `<td style="text-align: left; font-weight: 500;" rowspan="${sorted.length}">${escapeHtml(asesor)}</div>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(r.fecha)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.enganche)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.pagos)}</div>
                    <td style="text-align: center;">${r.pagosCant}</div>
                </tr>`;
            }
        }
        tableHtml += `</tbody>}</div>`;
    }
    else if (tipo === 'payjoy') {
        title = '💰 PAYJOY - Desglose por Asesor y Día';
        const asesoresMap = new Map();
        for (const row of datosTabla) {
            if (!asesoresMap.has(row.asesor)) asesoresMap.set(row.asesor, []);
            asesoresMap.get(row.asesor).push({
                fecha: row.fecha,
                enganche: row.PAYJOY_ENGANCHE,
                pagos: row.PAYJOY_PAGOS, pagosCant: row.PAYJOY_PAGOS_CANT
            });
        }
        
        tableHtml = `
            <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
                <div class="stat-card" style="background: #059669; flex: 1;"><div class="stat-number">${asesoresMap.size}</div><div class="stat-label">👥 Asesores</div></div>
                <div class="stat-card" style="background: #059669; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.PAYJOY_PAGOS)}</div><div class="stat-label">💰 Total Pagos</div></div>
                <div class="stat-card" style="background: #059669; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.PAYJOY_ENGANCHE)}</div><div class="stat-label">💸 Total Enganche</div></div>
            </div>
            <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa;">
                        <tr><th>Asesor</th><th>Fecha</th><th>ENGANCHE</th><th colspan="2">PAGOS</th></tr>
                        <tr><th></th><th></th><th>Monto</th><th>Monto</th><th>Cant</th></tr>
                    </thead>
                    <tbody>`;
        
        let isFirstAsesor = true;
        for (const [asesor, registros] of asesoresMap) {
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator-modal"><td colspan="6" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div></tr>`;
            }
            isFirstAsesor = false;
            
            const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
            for (let i = 0; i < sorted.length; i++) {
                const r = sorted[i];
                tableHtml += `<tr>`;
                if (i === 0) {
                    tableHtml += `<td style="text-align: left; font-weight: 500;" rowspan="${sorted.length}">${escapeHtml(asesor)}</div>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(r.fecha)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.enganche)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.pagos)}</div>
                    <td style="text-align: center;">${r.pagosCant}</div>
                </tr>`;
            }
        }
        tableHtml += `</tbody>}</div>`;
    }
    else if (tipo === 'credicel') {
        title = '💳 CREDICEL - Desglose por Asesor y Día';
        const asesoresMap = new Map();
        for (const row of datosTabla) {
            if (!asesoresMap.has(row.asesor)) asesoresMap.set(row.asesor, []);
            asesoresMap.get(row.asesor).push({
                fecha: row.fecha,
                enganche: row.CREDICEL_ENGANCHE,
                pagos: row.CREDICEL_PAGOS, pagosCant: row.CREDICEL_PAGOS_CANT
            });
        }
        
        tableHtml = `
            <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
                <div class="stat-card" style="background: #dc2626; flex: 1;"><div class="stat-number">${asesoresMap.size}</div><div class="stat-label">👥 Asesores</div></div>
                <div class="stat-card" style="background: #dc2626; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.CREDICEL_PAGOS)}</div><div class="stat-label">💰 Total Pagos</div></div>
                <div class="stat-card" style="background: #dc2626; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.CREDICEL_ENGANCHE)}</div><div class="stat-label">💸 Total Enganche</div></div>
            </div>
            <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa;">
                        <tr><th>Asesor</th><th>Fecha</th><th>ENGANCHE</th><th colspan="2">PAGOS</th></tr>
                        <tr><th></th><th></th><th>Monto</th><th>Monto</th><th>Cant</th></tr>
                    </thead>
                    <tbody>`;
        
        let isFirstAsesor = true;
        for (const [asesor, registros] of asesoresMap) {
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator-modal"><td colspan="6" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div></tr>`;
            }
            isFirstAsesor = false;
            
            const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
            for (let i = 0; i < sorted.length; i++) {
                const r = sorted[i];
                tableHtml += `<tr>`;
                if (i === 0) {
                    tableHtml += `<td style="text-align: left; font-weight: 500;" rowspan="${sorted.length}">${escapeHtml(asesor)}</div>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(r.fecha)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.enganche)}</div>
                    <td style="text-align: right;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.pagos)}</div>
                    <td style="text-align: center;">${r.pagosCant}</div>
                </tr>`;
            }
        }
        tableHtml += `</tbody>}</div>`;
    }
    else if (tipo === 'paguitos') {
        title = '💳 PAGUITOS - Desglose por Asesor y Día';
        const asesoresMap = new Map();
        for (const row of datosTabla) {
            if (!asesoresMap.has(row.asesor)) asesoresMap.set(row.asesor, []);
            asesoresMap.get(row.asesor).push({ fecha: row.fecha, enganche: row.PAGUITOS_ENGANCHE });
        }
        
        tableHtml = `
            <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
                <div class="stat-card" style="background: #f59e0b; flex: 1;"><div class="stat-number">${asesoresMap.size}</div><div class="stat-label">👥 Asesores</div></div>
                <div class="stat-card" style="background: #f59e0b; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.PAGUITOS_ENGANCHE)}</div><div class="stat-label">💰 Total Enganche</div></div>
            </div>
            <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa;"><tr><th>Asesor</th><th>Fecha</th><th>ENGANCHE</th></tr></thead>
                    <tbody>`;
        
        let isFirstAsesor = true;
        for (const [asesor, registros] of asesoresMap) {
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator-modal"><td colspan="3" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div></tr>`;
            }
            isFirstAsesor = false;
            
            const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
            for (let i = 0; i < sorted.length; i++) {
                const r = sorted[i];
                tableHtml += `<tr>`;
                if (i === 0) {
                    tableHtml += `<td style="text-align: left; font-weight: 500;" rowspan="${sorted.length}">${escapeHtml(asesor)}</div>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(r.fecha)}</div>
                    <td style="text-align: right; color: #f59e0b;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(r.enganche)}</div>
                </tr>`;
            }
        }
        tableHtml += `</tbody>}</div>`;
    }
    else if (tipo === 'comisiones') {
        title = '💸 COMISIONES - Desglose por Asesor y Día';
        const asesoresMap = new Map();
        for (const row of datosTabla) {
            if (!asesoresMap.has(row.asesor)) asesoresMap.set(row.asesor, []);
            asesoresMap.get(row.asesor).push({ fecha: row.fecha, comisiones: row.comisiones });
        }
        
        tableHtml = `
            <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
                <div class="stat-card" style="background: #ea580c; flex: 1;"><div class="stat-number">${asesoresMap.size}</div><div class="stat-label">👥 Asesores</div></div>
                <div class="stat-card" style="background: #ea580c; flex: 1;"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(totales.comisiones)}</div><div class="stat-label">💰 Total Comisiones</div></div>
            </div>
            <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa;"><tr><th>Asesor</th><th>Fecha</th><th>Comisiones</th></tr></thead>
                    <tbody>`;
        
        let isFirstAsesor = true;
        for (const [asesor, registros] of asesoresMap) {
            if (!isFirstAsesor) {
                tableHtml += `<tr class="asesor-separator-modal"><td colspan="3" style="padding: 4px; background-color: #e8f4f8; border-top: 3px solid #1e40af;">&nbsp;</div></tr>`;
            }
            isFirstAsesor = false;
            
            const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
            for (let i = 0; i < sorted.length; i++) {
                tableHtml += `<tr>`;
                if (i === 0) {
                    tableHtml += `<td style="text-align: left; font-weight: 500;" rowspan="${sorted.length}">${escapeHtml(asesor)}</div>`;
                }
                tableHtml += `
                    <td style="text-align: center;">${formatDateDisplay(sorted[i].fecha)}</div>
                    <td style="text-align: right; color: #ea580c;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(sorted[i].comisiones)}</div>
                </tr>`;
            }
        }
        tableHtml += `</tbody>}</div>`;
    }
    
    let modal = document.getElementById('ingresosDetalleModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ingresosDetalleModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1100px;">
                <div class="modal-header">
                    <h3 id="ingresosModalTitle">📊 ${title}</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body" id="ingresosModalBody"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    document.getElementById('ingresosModalTitle').innerHTML = `📊 ${title}`;
    document.getElementById('ingresosModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
}