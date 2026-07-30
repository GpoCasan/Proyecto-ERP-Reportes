// ==================== MÓDULO: BOLETOS RIFA (ERP) ====================

// ==================== CONFIGURACIÓN ====================

const BOLETOS_PRODUCT_NOTA = 1316;      // Boleto Rifa Promo PAYJOY (PROMOCIÓN)
const BOLETOS_PRODUCT_REFERENCIA = 1315; // Boleto RIFA (PAGADO)
const PRECIO_BOLETO = 20;

// Variable para controlar el ordenamiento
let sortDirection = {};
let currentResults = [];

// ==================== FUNCIÓN PARA OBTENER RANGO DE FECHAS ====================

function getDateRangeBoletos(startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return null;
    
    const startDate = new Date(`${startDateStr}T06:00:00Z`);
    const endDate = new Date(`${endDateStr}T06:00:00Z`);
    endDate.setDate(endDate.getDate() + 1);
    
    const startStr = startDate.toISOString().slice(0, 19).replace('T', '+');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', '+');
    
    console.log(`📅 [BOLETOS ERP] Rango: ${startStr} → ${endStr}`);
    
    return { start: startStr, end: endStr };
}

// ==================== FUNCIÓN PRINCIPAL ====================

async function consultarBoletosERP() {
    console.log('🎫 [BOLETOS ERP] Consultando ventas de boletos...');

    const startDate = document.getElementById('boletosStartDate').value;
    const endDate = document.getElementById('boletosEndDate').value;

    if (!startDate || !endDate) {
        document.getElementById('boletosErrorAlert').textContent = '⚠️ Selecciona ambas fechas (inicio y fin)';
        document.getElementById('boletosErrorAlert').style.display = 'block';
        return;
    }

    const btn = document.getElementById('consultarBoletosBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('boletosErrorAlert').style.display = 'none';
    document.getElementById('boletosInfoAlert').style.display = 'none';
    document.getElementById('boletosResults').style.display = 'none';

    try {
        const range = getDateRangeBoletos(startDate, endDate);
        if (!range) throw new Error('Error en el rango de fechas');
        
        const startFormatted = range.start;
        const endFormatted = range.end;

        let url = `${CONFIG.API_SALES_ENDPOINT}?page=1&per_page=100&total=0`;
        url += `&start_date=${startFormatted}`;
        url += `&end_date=${endFormatted}`;
        url += `&product_ids[]=${BOLETOS_PRODUCT_NOTA}`;
        url += `&product_ids[]=${BOLETOS_PRODUCT_REFERENCIA}`;
        url += `&service_ids[]=${BOLETOS_PRODUCT_REFERENCIA}`;

        console.log('📡 [BOLETOS ERP] URL:', url);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const ventas = data.data || [];

        console.log(`✅ [BOLETOS ERP] ${ventas.length} ventas encontradas`);

        const resultados = [];

        ventas.forEach(sale => {
            const detalles = sale.details || [];
            let nota1 = null;
            let nota1_2 = null;
            let referencia1 = null;
            let referencia2 = null;
            let tipo = null;
            let cantidadBoletos = 0;

            detalles.forEach(detail => {
                const productId = detail.product_id;
                
                // Producto 1316: Promoción (notas)
                if (productId === BOLETOS_PRODUCT_NOTA) {
                    tipo = 'promocion';
                    cantidadBoletos = 1;
                    nota1 = detail.note || null;
                    nota1_2 = detail.note_2 || null;
                }

                // Producto 1315: Pagado (referencias)
                if (productId === BOLETOS_PRODUCT_REFERENCIA) {
                    tipo = 'pagado';
                    const total = parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;
                    cantidadBoletos = Math.round(total / PRECIO_BOLETO);
                    referencia1 = detail.reference_1 || null;
                    referencia2 = detail.reference_2 || null;
                }
            });

            if (nota1 || referencia1) {
                // Si tiene referencia, es pagado
                if (referencia1) {
                    tipo = 'pagado';
                    cantidadBoletos = Math.round(parseFloat(sale.total) / PRECIO_BOLETO);
                } else if (nota1) {
                    tipo = 'promocion';
                    cantidadBoletos = 1;
                }

                // Construir objeto con campos unificados
                const item = {
                    ventaId: sale.id,
                    folio: sale.folio || sale.id,
                    fecha: sale.created_at,
                    sucursal: sale.warehouse?.branch?.name || 'N/A',
                    vendedor: sale.user?.name || 'N/A',
                    cliente: sale.client?.name || 'N/A',
                    total: parseFloat(sale.total) || 0,
                    tipo: tipo,
                    cantidadBoletos: cantidadBoletos,
                    // DATOS UNIFICADOS: según el tipo usan notas o referencias
                    dato1: tipo === 'pagado' ? (referencia1 || 'N/A') : (nota1 || 'N/A'),
                    dato2: tipo === 'pagado' ? (referencia2 || 'N/A') : (nota1_2 || 'N/A'),
                    // Guardar originales por si acaso
                    _nota1: nota1,
                    _nota1_2: nota1_2,
                    _referencia1: referencia1,
                    _referencia2: referencia2,
                    tieneDato: tipo === 'pagado' ? !!referencia1 : !!nota1
                };
                
                resultados.push(item);
            }
        });

        resultados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        currentResults = resultados;
        window._boletosERPData = resultados;
        sortDirection = {};

        mostrarResultadosBoletosERP(resultados);

        if (resultados.length === 0) {
            document.getElementById('boletosInfoAlert').textContent = '⚠️ No se encontraron ventas de boletos en el período.';
            document.getElementById('boletosInfoAlert').style.display = 'block';
        } else {
            const totalPagados = resultados.filter(r => r.tipo === 'pagado').length;
            const totalPromocion = resultados.filter(r => r.tipo === 'promocion').length;
            const totalBoletos = resultados.reduce((sum, r) => sum + r.cantidadBoletos, 0);
            document.getElementById('boletosInfoAlert').textContent = `✅ ${resultados.length} registros | ${totalPagados} pagados, ${totalPromocion} promoción | ${totalBoletos} boletos totales`;
            document.getElementById('boletosInfoAlert').style.display = 'block';
        }

    } catch (error) {
        console.error('❌ [BOLETOS ERP] Error:', error);
        document.getElementById('boletosErrorAlert').textContent = `❌ Error: ${error.message}`;
        document.getElementById('boletosErrorAlert').style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== ORDENAR TABLA ====================

function ordenarBoletos(columna) {
    if (!currentResults || currentResults.length === 0) return;

    if (!sortDirection[columna]) {
        sortDirection[columna] = 'asc';
    } else if (sortDirection[columna] === 'asc') {
        sortDirection[columna] = 'desc';
    } else {
        sortDirection[columna] = 'asc';
    }

    const direction = sortDirection[columna];

    const sorted = [...currentResults].sort((a, b) => {
        let valA = a[columna];
        let valB = b[columna];

        if (columna === 'fecha') {
            valA = new Date(valA);
            valB = new Date(valB);
        } else if (columna === 'tipo') {
            const order = { 'pagado': 0, 'promocion': 1 };
            valA = order[valA] !== undefined ? order[valA] : 2;
            valB = order[valB] !== undefined ? order[valB] : 2;
        } else if (columna === 'cantidadBoletos' || columna === 'ventaId' || columna === 'total') {
            valA = Number(valA);
            valB = Number(valB);
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    window._boletosERPData = sorted;
    mostrarResultadosBoletosERP(sorted);
}

// ==================== RENDERIZAR RESULTADOS ====================

function mostrarResultadosBoletosERP(resultados) {
    const container = document.getElementById('boletosResults');
    
    if (!resultados || resultados.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning" style="text-align:center;padding:30px;">
                ⚠️ No se encontraron ventas de boletos en el período
            </div>
        `;
        container.style.display = 'block';
        return;
    }

    const totalPagados = resultados.filter(r => r.tipo === 'pagado').length;
    const totalPromocion = resultados.filter(r => r.tipo === 'promocion').length;
    const totalBoletos = resultados.reduce((sum, r) => sum + r.cantidadBoletos, 0);

    let html = `
        <div class="stats" style="margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
            <div class="stat-card" style="background:linear-gradient(135deg,#1e40af,#3b82f6);">
                <div class="stat-number">${resultados.length}</div>
                <div class="stat-label">📊 Total ventas</div>
            </div>
            <div class="stat-card" style="background:linear-gradient(135deg,#059669,#10b981);">
                <div class="stat-number">${totalPagados}</div>
                <div class="stat-label">💰 Pagados</div>
                <div style="font-size:0.65rem;opacity:0.8;">${totalBoletos - totalPromocion} boletos</div>
            </div>
            <div class="stat-card" style="background:linear-gradient(135deg,#f97316,#ea580c);">
                <div class="stat-number">${totalPromocion}</div>
                <div class="stat-label">🎁 Promoción</div>
                <div style="font-size:0.65rem;opacity:0.8;">${totalPromocion} boletos</div>
            </div>
            <div class="stat-card" style="background:linear-gradient(135deg,#7c3aed,#8b5cf6);">
                <div class="stat-number">${totalBoletos}</div>
                <div class="stat-label">🎫 Total boletos</div>
            </div>
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
            <div style="font-size:0.75rem;color:#64748b;">
                💡 Haz clic en los encabezados para ordenar
            </div>
            <button onclick="exportBoletosERPToExcel()" style="
                background:linear-gradient(135deg,#059669,#10b981);
                color:white;border:none;padding:8px 20px;border-radius:8px;
                font-weight:600;cursor:pointer;
            ">
                📊 Exportar a Excel
            </button>
        </div>

        <div class="table-container">
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                <thead style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;position:sticky;top:0;">
                    <tr>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('folio')">Venta</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('tipo')">Tipo</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('cantidadBoletos')">🎫</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('sucursal')">Sucursal</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('vendedor')">Vendedor</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;min-width:130px;max-width:150px;" onclick="ordenarBoletos('dato1')">📝 # Celular</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;min-width:100px;max-width:120px;" onclick="ordenarBoletos('dato2')">📝 Boleto(s)</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('fecha')">Fecha</th>
                    </tr>
                </thead>
                <tbody>
    `;

    resultados.forEach((item, index) => {
        const bgColor = index % 2 === 0 ? '#f8fafc' : 'white';
        const tipoIcon = item.tipo === 'pagado' ? '💰' : '🎁';
        
        const formatearDato = (texto) => {
            if (!texto || texto === 'N/A') return '—';
            if (texto.length <= 18) return texto;
            const partes = [];
            for (let i = 0; i < texto.length; i += 18) {
                partes.push(texto.substring(i, i + 18));
            }
            return partes.join('<br>');
        };
        
        // Determinar qué mostrar en cada columna
        const mostrarDato1 = item.tieneDato ? formatearDato(item.dato1) : '—';
        const mostrarDato2 = item.tieneDato ? formatearDato(item.dato2) : '—';
        
        html += `
            <tr style="border-bottom:1px solid #e2e8f0;background:${bgColor};">
                <td style="padding:8px 8px;font-weight:600;color:#1e40af;text-align:center;">
                    <a href="#" onclick="openReceipt(${item.ventaId});return false;" style="color:#1e40af;text-decoration:none;">
                        📄 #${item.folio}
                    </a>
                </td>
                <td style="padding:8px 8px;text-align:center;font-size:1.3rem;">
                    ${tipoIcon}
                </td>
                <td style="padding:8px 8px;text-align:center;font-weight:bold;font-size:1.1rem;color:#1e40af;">
                    ${item.cantidadBoletos}
                </td>
                <td style="padding:8px 8px;font-size:0.75rem;text-align:center;">${item.sucursal}</td>
                <td style="padding:8px 8px;font-size:0.75rem;text-align:center;">${item.vendedor}</td>
                <td style="padding:8px 8px;font-weight:500;color:#2563eb;font-size:0.75rem;font-family:monospace;text-align:center;word-break:break-word;line-height:1.4;min-width:130px;max-width:150px;">
                    ${mostrarDato1}
                </td>
                <td style="padding:8px 8px;font-size:0.7rem;color:#64748b;font-family:monospace;text-align:center;word-break:break-word;line-height:1.4;min-width:100px;max-width:120px;">
                    ${mostrarDato2}
                </td>
                <td style="padding:8px 8px;font-size:0.65rem;color:#64748b;text-align:center;">
                    ${new Date(item.fecha).toLocaleString()}
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

// ==================== EXPORTAR A EXCEL ====================

function exportBoletosERPToExcel() {
    const resultados = window._boletosERPData || currentResults;
    
    console.log('📊 [BOLETOS ERP] Exportando a Excel...', resultados);
    
    if (!resultados || resultados.length === 0) {
        alert('⚠️ No hay datos para exportar. Primero consulta.');
        return;
    }

    const excelData = [
        ['BOLETOS RIFA - VENTAS ERP'],
        [`Fecha de consulta: ${new Date().toLocaleString()}`],
        [''],
        ['Venta', 'Tipo', 'Boletos', 'Sucursal', 'Vendedor', '# Celular', 'Boleto(s)', 'Fecha']
    ];

    resultados.forEach((item) => {
        excelData.push([
            item.folio || item.ventaId,
            item.tipo === 'pagado' ? 'Pagado' : 'Promoción',
            item.cantidadBoletos,
            item.sucursal,
            item.vendedor,
            item.tieneDato ? item.dato1 : '',
            item.tieneDato ? item.dato2 : '',
            new Date(item.fecha).toLocaleString()
        ]);
    });

    const totalPagados = resultados.filter(r => r.tipo === 'pagado').length;
    const totalPromocion = resultados.filter(r => r.tipo === 'promocion').length;
    const totalBoletos = resultados.reduce((sum, r) => sum + r.cantidadBoletos, 0);

    excelData.push([]);
    excelData.push(['RESUMEN']);
    excelData.push(['Total Ventas', resultados.length]);
    excelData.push(['Pagados', totalPagados]);
    excelData.push(['Promoción', totalPromocion]);
    excelData.push(['Total Boletos', totalBoletos]);

    try {
        if (typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            ws['!cols'] = [
                { wch: 12 },  // Venta
                { wch: 12 },  // Tipo
                { wch: 10 },  // Boletos
                { wch: 20 },  // Sucursal
                { wch: 20 },  // Vendedor
                { wch: 18 },  // # Celular
                { wch: 18 },  // Boleto(s)
                { wch: 22 }   // Fecha
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Boletos');
            const fileName = `boletos_erp_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            alert(`✅ Exportado correctamente: ${fileName}`);
        } else {
            let csv = '\uFEFF';
            excelData.forEach(row => {
                csv += row.join(',') + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `boletos_erp_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('✅ Exportado correctamente en formato CSV');
        }
    } catch (error) {
        console.error('❌ [BOLETOS ERP] Error exportando:', error);
        alert('❌ Error al exportar: ' + error.message);
    }
}

// ==================== INICIALIZAR MÓDULO ====================

function initBoletosERPModule() {
    console.log('🔄 [BOLETOS ERP] Inicializando módulo...');

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const formatDateInput = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startInput = document.getElementById('boletosStartDate');
    const endInput = document.getElementById('boletosEndDate');
    if (startInput) startInput.value = formatDateInput(today);
    if (endInput) endInput.value = formatDateInput(tomorrow);

    currentResults = [];
    window._boletosERPData = null;
    sortDirection = {};

    const btn = document.getElementById('consultarBoletosBtn');
    if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', consultarBoletosERP);
        console.log('✅ [BOLETOS ERP] Botón configurado');
    }

    console.log('✅ [BOLETOS ERP] Módulo inicializado');
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initBoletosERPModule = initBoletosERPModule;
window.consultarBoletosERP = consultarBoletosERP;
window.exportBoletosERPToExcel = exportBoletosERPToExcel;
window.ordenarBoletos = ordenarBoletos;

console.log('✅ Módulo BOLETOS ERP cargado correctamente');