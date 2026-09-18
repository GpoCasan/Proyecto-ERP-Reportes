// ==================== MÓDULO: SERVIPREMIA (RECOMPENSAS) ====================
// Consulta las operaciones de Rewardix (Servipremia) y las cruza con las
// operaciones del ERP para mostrar métricas de puntos ganados/canjeados.

let cachedServipremiaData = null;
let servipremiaInicializado = false;

// ==================== CONFIGURACIÓN ====================
const SERVIPREMIA_CONFIG = {
    BASE_URL: 'https://api-pymes.rewardix.com/api/v2',
    API_KEY: '95135d6e412043bf0c8f3576a5763d7d',
    LOCAL_PROXY: '/api/rewardix/api/v2',
    TIPOS_PUNTOS: {
        'points earned':   { label: '⭐ Puntos Ganados',   color: '#059669', icon: '⭐' },
        'points redeemed': { label: '🎁 Puntos Canjeados', color: '#f97316', icon: '🎁' }
    }
};

// ==================== HELPERS DE FECHA (evitan bug de zona horaria) ====================
function servipremiaFormatDateInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getRewardixUrl() {
    // En file:// no hay proxy, vamos directo a Rewardix
    if (window.location.protocol === 'file:') {
        return SERVIPREMIA_CONFIG.BASE_URL;
    }
    return `${window.location.origin}${SERVIPREMIA_CONFIG.LOCAL_PROXY}`;
}

// ==================== INICIALIZACIÓN ====================
function initServipremiaModule() {
    console.log('🎁 [SERVIPREMIA] Inicializando módulo...');

    if (servipremiaInicializado) {
        console.log('✅ [SERVIPREMIA] Ya estaba inicializado');
        setupServipremiaEventListeners();
        return;
    }

    servipremiaInicializado = true;

    // Fechas por defecto: últimos 7 días (usando helper sin zona horaria)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);

    const startInput = document.getElementById('servipremiaStartDate');
    const endInput = document.getElementById('servipremiaEndDate');

    if (startInput && !startInput.value) startInput.value = servipremiaFormatDateInput(startDate);
    if (endInput && !endInput.value) endInput.value = servipremiaFormatDateInput(endDate);

    setupServipremiaEventListeners();

    console.log('✅ [SERVIPREMIA] Módulo inicializado');
}

// ==================== EVENT LISTENERS ====================
function setupServipremiaEventListeners() {
    const searchBtn = document.getElementById('searchServipremiaBtn');
    if (searchBtn && !searchBtn.hasAttribute('data-listener')) {
        searchBtn.setAttribute('data-listener', 'true');
        searchBtn.addEventListener('click', searchServipremia);
        console.log('✅ [SERVIPREMIA] Listener del botón configurado');
    }
}

// ==================== FUNCIÓN PRINCIPAL ====================
async function searchServipremia() {
    const startDate = document.getElementById('servipremiaStartDate').value;
    const endDate = document.getElementById('servipremiaEndDate').value;

    if (!startDate || !endDate) {
        showError('servipremia', 'Selecciona ambas fechas');
        return;
    }

    if (startDate > endDate) {
        showError('servipremia', 'La fecha inicial no puede ser mayor a la final');
        return;
    }

    const btn = document.getElementById('searchServipremiaBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('servipremiaResults').style.display = 'none';
    document.getElementById('servipremiaErrorAlert').style.display = 'none';
    document.getElementById('servipremiaInfoAlert').style.display = 'none';

    try {
        btn.innerHTML = 'Consultando ERP y Servipremia... <span class="loading-spinner"></span>';

        const [erpData, rewardixOps] = await Promise.all([
            fetchERPOperations(startDate, endDate),
            fetchRewardixOperations(startDate, endDate)
        ]);

        console.log('📊 [SERVIPREMIA] ERP operations:', erpData);
        console.log('📊 [SERVIPREMIA] Rewardix operations:', rewardixOps.length);

        // Filtrar por tipo de evento
        const pointsEarned = rewardixOps.filter(op => {
            const eventName = String(op.eventName || '').toLowerCase().trim();
            return eventName === 'points earned' || eventName === 'puntos ganados';
        });

        const pointsRedeemed = rewardixOps.filter(op => {
            const eventName = String(op.eventName || '').toLowerCase().trim();
            return eventName === 'points redeemed'
                || eventName === 'puntos canjeados'
                || eventName === 'points used';
        });

        console.log(`🎯 [SERVIPREMIA] Points earned: ${pointsEarned.length}, Points redeemed: ${pointsRedeemed.length}`);

        // Totales de puntos
        const totalPointsEarned = pointsEarned.reduce((sum, op) => {
            return sum + (parseFloat(op.amount) || 0);
        }, 0);

        const totalPointsRedeemed = pointsRedeemed.reduce((sum, op) => {
            return sum + (parseFloat(op.amount) || 0);
        }, 0);

        // Desglose por sucursal/gerente
        const managersData = await fetchRewardixManagers();

        const desglosePorSucursal = buildDesglosePorSucursal(
            managersData,
            pointsEarned,
            pointsRedeemed
        );

        // Cache
        cachedServipremiaData = {
            startDate,
            endDate,
            erpTotal: erpData.total,
            erpMonto: erpData.monto,
            totalOps: rewardixOps.length,
            pointsEarnedCount: pointsEarned.length,
            pointsRedeemedCount: pointsRedeemed.length,
            totalPointsEarned,
            totalPointsRedeemed,
            desglosePorSucursal,
            fechaConsulta: new Date().toISOString()
        };

        renderServipremiaResults(cachedServipremiaData);

    } catch (error) {
        console.error('❌ [SERVIPREMIA] Error:', error);
        showError('servipremia', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== CONSULTAR ERP (operaciones totales) ====================
async function fetchERPOperations(startDate, endDate) {
    try {
        const rangeStart = getDateRangeContado(startDate);
        const rangeEnd = getDateRangeContado(endDate);

        if (!rangeStart || !rangeEnd) {
            throw new Error('Error procesando fechas');
        }

        const startDateTime = rangeStart.start;
        const endDateTime = rangeEnd.end;

        console.log(`📡 [SERVIPREMIA] Consultando ERP: ${startDateTime} → ${endDateTime}`);

        const tipos = ['products', 'services', 'credit'];
        const results = await Promise.all(
            tipos.map(async (tipo) => {
                const url = `${CONFIG.API_SALES}?page=1&per_page=1&total=1&start_date=${startDateTime}&end_date=${endDateTime}&sale_type=${tipo}`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
                });

                if (!response.ok) {
                    console.warn(`⚠️ Error consultando ${tipo}: ${response.status}`);
                    return { total: 0, monto: 0 };
                }

                const data = await response.json();
                return {
                    total: data.meta?.total || data.total || 0,
                    monto: parseFloat(data.total) || 0
                };
            })
        );

        const totalOps = results.reduce((sum, r) => sum + r.total, 0);
        const montoTotal = results.reduce((sum, r) => sum + r.monto, 0);

        return { total: totalOps, monto: montoTotal };

    } catch (error) {
        console.error('❌ [SERVIPREMIA] Error consultando ERP:', error);
        return { total: 0, monto: 0 };
    }
}

// ==================== CONSULTAR REWARDIX (operations) ====================
async function fetchRewardixOperations(startDate, endDate) {
    try {
        const baseUrl = getRewardixUrl();
        const itemsPerPage = 1000;
        const allOperations = [];
        let page = 1;
        let totalItems = null;

        while (true) {
            const url = `${baseUrl}/operations?page=${page}&itemsPerPage=${itemsPerPage}&startDate=${startDate}&endDate=${endDate}`;

            console.log(`📡 [SERVIPREMIA] GET ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-Key': SERVIPREMIA_CONFIG.API_KEY,
                    'X-Rewardix-Base': SERVIPREMIA_CONFIG.BASE_URL
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`Rewardix HTTP ${response.status}`);
            }

            const payload = await response.json();
            const rows = Array.isArray(payload.data) ? payload.data : [];

            allOperations.push(...rows);

            if (payload.meta && payload.meta.totalItems !== undefined) {
                totalItems = Number(payload.meta.totalItems);
            }

            if (!rows.length || rows.length < itemsPerPage) break;
            if (Number.isFinite(totalItems) && allOperations.length >= totalItems) break;

            page++;
            if (page > 100) {
                console.warn('⚠️ Demasiadas páginas, deteniendo por seguridad');
                break;
            }
        }

        console.log(`✅ [SERVIPREMIA] ${allOperations.length} operaciones obtenidas`);
        return allOperations;

    } catch (error) {
        console.error('❌ [SERVIPREMIA] Error consultando Rewardix:', error);
        throw new Error(`Error al consultar Servipremia: ${error.message}`);
    }
}

// ==================== CONSULTAR GERENTES (sucursales) ====================
async function fetchRewardixManagers() {
    try {
        const baseUrl = getRewardixUrl();
        const url = `${baseUrl}/managers?page=1&itemsPerPage=1000`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-API-Key': SERVIPREMIA_CONFIG.API_KEY,
                'X-Rewardix-Base': SERVIPREMIA_CONFIG.BASE_URL
            },
            cache: 'no-store'
        });

        if (!response.ok) return [];

        const payload = await response.json();
        return Array.isArray(payload.data) ? payload.data : [];

    } catch (error) {
        console.warn('⚠️ Error consultando managers:', error);
        return [];
    }
}

// ==================== HELPERS ====================
function buildDesglosePorSucursal(managers, pointsEarned, pointsRedeemed) {
    const managersMap = new Map();

    managers.forEach(m => {
        managersMap.set(String(m.id), {
            id: m.id,
            nombre: m.fullName || m.email || `Gerente #${m.id}`,
            email: m.email || '',
            earnedCount: 0,
            redeemedCount: 0,
            earnedPoints: 0,
            redeemedPoints: 0
        });
    });

    // Agrupar puntos ganados
    pointsEarned.forEach(op => {
        const key = String(op.managerId ?? 'unassigned');
        if (!managersMap.has(key)) {
            managersMap.set(key, {
                id: op.managerId ?? null,
                nombre: op.managerId ? `Gerente #${op.managerId}` : 'Sin sucursal',
                email: '',
                earnedCount: 0,
                redeemedCount: 0,
                earnedPoints: 0,
                redeemedPoints: 0
            });
        }
        const row = managersMap.get(key);
        row.earnedCount++;
        row.earnedPoints += parseFloat(op.amount) || 0;
    });

    // Agrupar puntos canjeados
    pointsRedeemed.forEach(op => {
        const key = String(op.managerId ?? 'unassigned');
        if (!managersMap.has(key)) {
            managersMap.set(key, {
                id: op.managerId ?? null,
                nombre: op.managerId ? `Gerente #${op.managerId}` : 'Sin sucursal',
                email: '',
                earnedCount: 0,
                redeemedCount: 0,
                earnedPoints: 0,
                redeemedPoints: 0
            });
        }
        const row = managersMap.get(key);
        row.redeemedCount++;
        row.redeemedPoints += parseFloat(op.amount) || 0;
    });

    return Array.from(managersMap.values())
        .filter(row => row.earnedCount > 0 || row.redeemedCount > 0)
        .sort((a, b) => (b.earnedPoints + b.redeemedPoints) - (a.earnedPoints + a.redeemedPoints));
}

// ==================== RENDERIZAR ====================
function renderServipremiaResults(data) {
    const container = document.getElementById('servipremiaResults');

    const {
        startDate, endDate,
        erpTotal, erpMonto,
        totalOps,
        pointsEarnedCount, pointsRedeemedCount,
        totalPointsEarned, totalPointsRedeemed,
        desglosePorSucursal
    } = data;

    // Calcular porcentajes
    const porcentajeGanados = erpTotal > 0 ? (pointsEarnedCount / erpTotal) * 100 : 0;
    const porcentajeCanjeados = totalPointsEarned > 0
        ? (totalPointsRedeemed / totalPointsEarned) * 100
        : 0;

    const fechaTexto = `${formatDate(startDate)} - ${formatDate(endDate)}`;

    let html = `
        <div class="alert alert-info" style="margin-bottom:20px;">
            📅 <strong>Período:</strong> ${fechaTexto}
            <span style="margin-left:20px;">🔄 <strong>Actualizado:</strong> ${new Date().toLocaleString('es-MX')}</span>
        </div>
    `;

    // Tarjetas principales
    html += `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <div class="stat-number">${erpTotal.toLocaleString('es-MX')}</div>
                <div class="stat-label">📊 Total Operaciones ERP</div>
                <div style="font-size:0.75rem; margin-top:6px; opacity:0.9;">
                    💰 ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(erpMonto)}
                </div>
            </div>
            
            <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                <div class="stat-number">${pointsEarnedCount.toLocaleString('es-MX')}</div>
                <div class="stat-label">⭐ Transacciones Puntos Ganados</div>
                <div style="font-size:0.75rem; margin-top:6px; opacity:0.9;">
                    ${totalPointsEarned.toLocaleString('es-MX')} puntos
                </div>
                <div style="font-size:0.65rem; margin-top:4px; opacity:0.8;">
                    ${porcentajeGanados.toFixed(2)}% de las operaciones ERP
                </div>
            </div>
            
            <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                <div class="stat-number">${pointsRedeemedCount.toLocaleString('es-MX')}</div>
                <div class="stat-label">🎁 Transacciones Puntos Canjeados</div>
                <div style="font-size:0.75rem; margin-top:6px; opacity:0.9;">
                    ${totalPointsRedeemed.toLocaleString('es-MX')} puntos
                </div>
                <div style="font-size:0.65rem; margin-top:4px; opacity:0.8;">
                    ${porcentajeCanjeados.toFixed(2)}% de los puntos ganados
                </div>
            </div>
            
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                <div class="stat-number" style="font-size:1.6rem;">${porcentajeCanjeados.toFixed(1)}%</div>
                <div class="stat-label">📈 Tasa de Canje</div>
                <div style="font-size:0.7rem; margin-top:6px; opacity:0.9;">
                    Puntos canjeados / ganados
                </div>
            </div>
        </div>
    `;

    // Comparativa de puntos
    const maxPuntos = Math.max(totalPointsEarned, totalPointsRedeemed, 1);
    const anchoGanados = (totalPointsEarned / maxPuntos) * 100;
    const anchoCanjeados = (totalPointsRedeemed / maxPuntos) * 100;

    html += `
        <div style="background: #f8fafc; border-radius: 16px; padding: 20px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
            <h4 style="color: #1e40af; margin-bottom: 16px; text-align: center;">📊 Comparativa de Puntos</h4>
            
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
                    <span style="color: #059669; font-weight: 600;">⭐ Puntos Ganados</span>
                    <span style="font-weight: bold; color: #059669;">${totalPointsEarned.toLocaleString('es-MX')}</span>
                </div>
                <div style="background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 28px;">
                    <div style="width: ${anchoGanados}%; background: linear-gradient(90deg, #059669, #10b981); height: 100%; border-radius: 20px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; color: white; font-weight: bold; font-size: 0.8rem;">
                        ${anchoGanados > 15 ? totalPointsEarned.toLocaleString('es-MX') : ''}
                    </div>
                </div>
            </div>

            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
                    <span style="color: #f97316; font-weight: 600;">🎁 Puntos Canjeados</span>
                    <span style="font-weight: bold; color: #f97316;">${totalPointsRedeemed.toLocaleString('es-MX')}</span>
                </div>
                <div style="background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 28px;">
                    <div style="width: ${anchoCanjeados}%; background: linear-gradient(90deg, #f97316, #ea580c); height: 100%; border-radius: 20px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; color: white; font-weight: bold; font-size: 0.8rem;">
                        ${anchoCanjeados > 15 ? totalPointsRedeemed.toLocaleString('es-MX') : ''}
                    </div>
                </div>
            </div>

            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px dashed #cbd5e1; text-align: center;">
                <div style="font-size: 0.8rem; color: #64748b;">Diferencia neta de puntos</div>
                <div style="font-size: 1.8rem; font-weight: 800; color: ${totalPointsEarned - totalPointsRedeemed >= 0 ? '#059669' : '#dc2626'};">
                    ${(totalPointsEarned - totalPointsRedeemed).toLocaleString('es-MX')}
                </div>
                <div style="font-size: 0.7rem; color: #94a3b8;">
                    (${totalPointsEarned - totalPointsRedeemed >= 0 ? 'saldo a favor' : 'déficit'})
                </div>
            </div>
        </div>
    `;

    // Desglose por sucursal
    if (desglosePorSucursal.length > 0) {
        html += `
            <h4 style="color: #1e40af; margin-bottom: 12px;">🏪 Desglose por Sucursal</h4>
            <div class="table-container">
                <table class="imei-table" style="font-size:0.85rem;">
                    <thead>
                        <tr>
                            <th style="width:50px; text-align:center;">#</th>
                            <th>Sucursal / Gerente</th>
                            <th style="text-align:center;">⭐ Tx Ganados</th>
                            <th style="text-align:right;">⭐ Puntos Ganados</th>
                            <th style="text-align:center;">🎁 Tx Canjeados</th>
                            <th style="text-align:right;">🎁 Puntos Canjeados</th>
                            <th style="text-align:center;">📈 Tasa de Canje</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        desglosePorSucursal.forEach((row, idx) => {
            const tasaCanje = row.earnedPoints > 0
                ? (row.redeemedPoints / row.earnedPoints) * 100
                : 0;

            const tasaColor = tasaCanje >= 80 ? '#059669'
                            : tasaCanje >= 50 ? '#f59e0b'
                            : '#f97316';

            const bgRow = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

            html += `
                <tr style="background:${bgRow}; border-bottom:1px solid #e2e8f0;">
                    <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                    <td>
                        <div style="font-weight:600; color:#1e293b;">${escapeHtml(row.nombre)}</div>
                        ${row.email ? `<div style="font-size:0.7rem; color:#64748b;">${escapeHtml(row.email)}</div>` : ''}
                    </td>
                    <td style="text-align:center; color:#059669; font-weight:600;">${row.earnedCount.toLocaleString('es-MX')}</td>
                    <td style="text-align:right; color:#059669; font-weight:700;">${row.earnedPoints.toLocaleString('es-MX')}</td>
                    <td style="text-align:center; color:#f97316; font-weight:600;">${row.redeemedCount.toLocaleString('es-MX')}</td>
                    <td style="text-align:right; color:#f97316; font-weight:700;">${row.redeemedPoints.toLocaleString('es-MX')}</td>
                    <td style="text-align:center;">
                        <span style="background:${tasaColor}; color:white; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">
                            ${tasaCanje.toFixed(1)}%
                        </span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                    <tfoot style="background:#f1f5f9; border-top:2px solid #1e40af;">
                        <tr style="font-weight:bold;">
                            <td colspan="2" style="text-align:right; padding:10px;">TOTALES:</td>
                            <td style="text-align:center; color:#059669; padding:10px;">${pointsEarnedCount.toLocaleString('es-MX')}</td>
                            <td style="text-align:right; color:#059669; padding:10px;">${totalPointsEarned.toLocaleString('es-MX')}</td>
                            <td style="text-align:center; color:#f97316; padding:10px;">${pointsRedeemedCount.toLocaleString('es-MX')}</td>
                            <td style="text-align:right; color:#f97316; padding:10px;">${totalPointsRedeemed.toLocaleString('es-MX')}</td>
                            <td style="text-align:center; padding:10px;">
                                <span style="background:#7c3aed; color:white; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">
                                    ${porcentajeCanjeados.toFixed(1)}%
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    // Botón exportar
    html += `
        <div style="display:flex; justify-content:flex-end; margin-top:20px;">
            <button id="exportarServipremiaBtn" style="
                background: linear-gradient(135deg, #059669, #10b981);
                color: white;
                border: none;
                padding: 10px 24px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                📊 Exportar a Excel
            </button>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';

    const exportBtn = document.getElementById('exportarServipremiaBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportarServipremiaToExcel);
    }
}

// ==================== EXPORTAR A EXCEL ====================
function exportarServipremiaToExcel() {
    if (!cachedServipremiaData) {
        showError('servipremia', 'No hay datos para exportar');
        return;
    }

    const {
        startDate, endDate,
        erpTotal, erpMonto,
        pointsEarnedCount, pointsRedeemedCount,
        totalPointsEarned, totalPointsRedeemed,
        desglosePorSucursal
    } = cachedServipremiaData;

    const porcentajeCanjeados = totalPointsEarned > 0
        ? (totalPointsRedeemed / totalPointsEarned) * 100
        : 0;

    const excelData = [
        ['SERVIPREMIA - REPORTE DE PUNTOS'],
        [`Período: ${formatDate(startDate)} - ${formatDate(endDate)}`],
        [`Generado: ${new Date().toLocaleString('es-MX')}`],
        [],
        ['RESUMEN GENERAL'],
        ['Métrica', 'Valor'],
        ['Total Operaciones ERP', erpTotal],
        ['Monto Total ERP', erpMonto],
        ['Transacciones Puntos Ganados', pointsEarnedCount],
        ['Puntos Ganados', totalPointsEarned],
        ['Transacciones Puntos Canjeados', pointsRedeemedCount],
        ['Puntos Canjeados', totalPointsRedeemed],
        ['Tasa de Canje (%)', porcentajeCanjeados.toFixed(2)],
        [],
        ['DESGLOSE POR SUCURSAL'],
        ['#', 'Sucursal', 'Email', 'Tx Ganados', 'Puntos Ganados', 'Tx Canjeados', 'Puntos Canjeados', 'Tasa de Canje (%)']
    ];

    desglosePorSucursal.forEach((row, idx) => {
        const tasaCanje = row.earnedPoints > 0
            ? (row.redeemedPoints / row.earnedPoints) * 100
            : 0;

        excelData.push([
            idx + 1,
            row.nombre,
            row.email,
            row.earnedCount,
            row.earnedPoints,
            row.redeemedCount,
            row.redeemedPoints,
            tasaCanje.toFixed(2)
        ]);
    });

    excelData.push([
        '', 'TOTALES', '',
        pointsEarnedCount, totalPointsEarned,
        pointsRedeemedCount, totalPointsRedeemed,
        porcentajeCanjeados.toFixed(2)
    ]);

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);

        ws['!cols'] = [
            { wch: 8 }, { wch: 30 }, { wch: 30 },
            { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 18 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Servipremia');

        const nombreArchivo = `servipremia_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);

        showInfo('servipremia', `✅ Exportado: ${nombreArchivo}`);
    } catch (error) {
        console.error('❌ Error exportando:', error);
        showError('servipremia', `Error al exportar: ${error.message}`);
    }
}

// ==================== EXPORTAR GLOBAL ====================
window.initServipremiaModule = initServipremiaModule;
window.searchServipremia = searchServipremia;
window.exportarServipremiaToExcel = exportarServipremiaToExcel;

console.log('✅ Módulo SERVIPREMIA cargado');