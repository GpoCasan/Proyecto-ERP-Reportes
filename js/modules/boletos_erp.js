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

// ==================== FUNCIÓN PARA EXTRAER Y SEPARAR TELÉFONO Y BOLETO ====================

function extraerTelefonoYBoleto(texto) {
    if (!texto || texto === 'N/A') return { telefono: null, boletos: [] };
    
    let telefono = null;
    let boletos = [];
    
    const telefonoMatch = texto.match(/\b\d{10}\b/);
    if (telefonoMatch) {
        telefono = telefonoMatch[0];
    }
    
    const boletoMatches = texto.match(/\b\d{1,3}\b/g);
    if (boletoMatches) {
        boletos = boletoMatches
            .filter(num => num.length <= 3 && num !== telefono)
            .map(num => num.padStart(3, '0'));
    }
    
    if (!telefono) {
        const largoMatch = texto.match(/\d{10,}/);
        if (largoMatch) {
            telefono = largoMatch[0].substring(0, 10);
            const resto = largoMatch[0].substring(10);
            const restoBoletos = resto.match(/\d{1,3}/g);
            if (restoBoletos) {
                boletos = restoBoletos.map(num => num.padStart(3, '0'));
            }
        }
    }
    
    return { telefono, boletos };
}

function extraerTelefono(texto) {
    if (!texto || texto === 'N/A') return null;
    const result = extraerTelefonoYBoleto(texto);
    return result.telefono;
}

function extraerNumerosBoleto(texto) {
    if (!texto || texto === 'N/A') return [];
    const result = extraerTelefonoYBoleto(texto);
    return result.boletos;
}

// ==================== ABRIR VERIFICACIÓN EN NUEVA PESTAÑA ====================

function abrirVerificacionEnNuevaPestana(telefono, boleto) {
    let url;
    let label;
    
    if (boleto) {
        url = `https://servicel.rfs.mx/evento-2/verificador?q=${boleto}`;
        label = `Boleto #${boleto}`;
    } else if (telefono) {
        url = `https://servicel.rfs.mx/evento-2/verificador?q=${telefono}`;
        label = `Teléfono ${telefono}`;
    } else {
        alert('⚠️ No se encontró información para verificar');
        return;
    }
    
    console.log(`🔗 [VERIFICAR] Abriendo: ${url}`);
    window.open(url, '_blank');
}

// ==================== ABRIR MODAL CON OPCIÓN DE VERIFICACIÓN ====================

function abrirModalVerificacion(telefono, boleto, tipo, datoOriginal, esBoleto = false) {
    console.log(`🔍 [MODAL] Verificando: ${esBoleto ? 'boleto' : 'teléfono'} = ${esBoleto ? boleto : telefono} (${tipo})`);
    
    const modal = document.getElementById('boletosVerificacionModal');
    const body = document.getElementById('boletosVerificacionBody');
    const title = document.getElementById('boletosVerificacionTitle');
    
    if (!modal || !body || !title) {
        console.error('❌ [MODAL] Elementos del modal no encontrados');
        abrirVerificacionEnNuevaPestana(telefono, boleto);
        return;
    }
    
    const valorMostrar = esBoleto ? boleto : telefono;
    const etiqueta = esBoleto ? '🎫 Boleto' : '📱 Teléfono';
    const boletos = extraerNumerosBoleto(datoOriginal);
    
    title.textContent = `🔍 Verificar ${esBoleto ? 'boleto' : 'teléfono'}: ${valorMostrar}`;
    
    let opcionesHtml = '';
    
    if (telefono) {
        opcionesHtml += `
            <button onclick="abrirVerificacionEnNuevaPestana('${telefono}', null)" style="
                background:linear-gradient(135deg,#1e40af,#3b82f6);
                color:white;border:none;padding:12px 24px;border-radius:10px;
                font-weight:600;cursor:pointer;font-size:1rem;
                transition:all 0.2s;width:100%;
            "
            onmouseover="this.style.transform='scale(1.02)'"
            onmouseout="this.style.transform='scale(1)'">
                📱 Verificar por teléfono: ${telefono}
            </button>
        `;
    }
    
    if (boleto) {
        opcionesHtml += `
            <button onclick="abrirVerificacionEnNuevaPestana(null, '${boleto}')" style="
                background:linear-gradient(135deg,#059669,#10b981);
                color:white;border:none;padding:12px 24px;border-radius:10px;
                font-weight:600;cursor:pointer;font-size:1rem;
                transition:all 0.2s;width:100%;
            "
            onmouseover="this.style.transform='scale(1.02)'"
            onmouseout="this.style.transform='scale(1)'">
                🎫 Verificar por boleto: ${boleto}
            </button>
        `;
    }
    
    if (boletos.length > 1) {
        let boletosHtml = '';
        boletos.forEach(b => {
            boletosHtml += `
                <button onclick="abrirVerificacionEnNuevaPestana(null, '${b}')" style="
                    background:linear-gradient(135deg,#7c3aed,#8b5cf6);
                    color:white;border:none;padding:6px 14px;border-radius:8px;
                    font-weight:500;cursor:pointer;font-size:0.8rem;
                    transition:all 0.2s;
                "
                onmouseover="this.style.transform='scale(1.02)'"
                onmouseout="this.style.transform='scale(1)'">
                    🎫 #${b}
                </button>
            `;
        });
        opcionesHtml += `
            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
                ${boletosHtml}
            </div>
        `;
    }
    
    body.innerHTML = `
        <div style="text-align:center;padding:16px;">
            <div style="font-size:2.5rem;margin-bottom:12px;">🔍</div>
            <p style="font-size:1rem;font-weight:600;color:#1e293b;">
                Verificar ${esBoleto ? 'boleto' : 'teléfono'}
            </p>
            <div style="margin:12px 0;padding:12px;background:#f8fafc;border-radius:10px;text-align:left;font-size:0.8rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <div><span style="color:#64748b;">${etiqueta}:</span> <strong>${valorMostrar}</strong></div>
                    <div><span style="color:#64748b;">🎫 Tipo:</span> <strong>${tipo === 'pagado' ? '💰 Pagado' : '🎁 Promoción'}</strong></div>
                    ${telefono ? `<div><span style="color:#64748b;">📱 Teléfono:</span> <strong>${telefono}</strong></div>` : ''}
                    ${boleto ? `<div><span style="color:#64748b;">🎫 Boleto:</span> <strong>${boleto}</strong></div>` : ''}
                    <div style="grid-column: span 2;color:#94a3b8;font-size:0.7rem;margin-top:4px;word-break:break-all;">
                        📌 Dato original: ${datoOriginal || 'N/A'}
                    </div>
                    ${boletos.length > 1 ? `<div style="grid-column: span 2;color:#64748b;font-size:0.7rem;margin-top:4px;">📋 Boletos: ${boletos.join(', ')}</div>` : ''}
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
                ${opcionesHtml}
            </div>
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:0.7rem;color:#94a3b8;">
                💡 Se abrirá en una nueva pestaña
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function cerrarModalVerificacion() {
    const modal = document.getElementById('boletosVerificacionModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ==================== FUNCIÓN PRINCIPAL (CONSULTAR VENTAS) ====================

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
            let boletosExtraidos = [];
            let esValido = true;
            let mensajeValidacion = '';
            let totalPagadoProducto = 0;

            detalles.forEach(detail => {
                const productId = detail.product_id;
                const totalAmount = parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;
                
                if (productId === BOLETOS_PRODUCT_NOTA) {
                    tipo = 'promocion';
                    cantidadBoletos = 1;
                    nota1 = detail.note || null;
                    nota1_2 = detail.note_2 || null;
                    totalPagadoProducto = totalAmount;
                }

                if (productId === BOLETOS_PRODUCT_REFERENCIA) {
                    tipo = 'pagado';
                    referencia1 = detail.reference_1 || null;
                    referencia2 = detail.reference_2 || null;
                    totalPagadoProducto = totalAmount;
                }
            });

            if (nota1 || referencia1) {
                if (referencia1) {
                    tipo = 'pagado';
                    const separado = extraerTelefonoYBoleto(referencia2 || '');
                    boletosExtraidos = separado.boletos;
                    cantidadBoletos = boletosExtraidos.length;
                    
                    const totalEsperado = cantidadBoletos * PRECIO_BOLETO;
                    
                    if (cantidadBoletos > 0 && totalPagadoProducto !== totalEsperado) {
                        esValido = false;
                        mensajeValidacion = `⚠️ Total $${totalPagadoProducto} no coincide con ${cantidadBoletos} boletos ($${totalEsperado})`;
                        console.warn(`⚠️ Venta ${sale.id}: ${mensajeValidacion}`);
                    }
                    
                } else if (nota1) {
                    tipo = 'promocion';
                    const separado = extraerTelefonoYBoleto(nota1_2 || '');
                    boletosExtraidos = separado.boletos;
                    cantidadBoletos = boletosExtraidos.length > 0 ? boletosExtraidos.length : 1;
                    
                    if (cantidadBoletos === 0) {
                        cantidadBoletos = 1;
                    }
                }

                const dato1Separado = extraerTelefonoYBoleto(tipo === 'pagado' ? referencia1 : nota1);
                const telefono1 = dato1Separado.telefono;
                const boletos1 = dato1Separado.boletos;
                
                const dato2Separado = extraerTelefonoYBoleto(tipo === 'pagado' ? referencia2 : nota1_2);
                let boletos2 = dato2Separado.boletos;
                if (boletos2.length === 0 && boletos1.length > 0) {
                    boletos2 = boletos1;
                }
                
                const mostrarDato1 = telefono1 || (tipo === 'pagado' ? referencia1 : nota1) || 'N/A';
                const mostrarDato2 = boletos2.length > 0 ? boletos2.join(', ') : (tipo === 'pagado' ? referencia2 : nota1_2) || 'N/A';

                const item = {
                    ventaId: sale.id,
                    folio: sale.folio || sale.id,
                    fecha: sale.created_at,
                    sucursal: sale.warehouse?.branch?.name || 'N/A',
                    vendedor: sale.user?.name || 'N/A',
                    cliente: sale.client?.name || 'N/A',
                    total: totalPagadoProducto,
                    tipo: tipo,
                    cantidadBoletos: cantidadBoletos,
                    dato1: mostrarDato1,
                    dato2: mostrarDato2,
                    _dato1Original: tipo === 'pagado' ? referencia1 : nota1,
                    _dato2Original: tipo === 'pagado' ? referencia2 : nota1_2,
                    telefono: telefono1,
                    boletos: boletos2,
                    tieneDato: tipo === 'pagado' ? !!referencia1 : !!nota1,
                    esValido: esValido,
                    mensajeValidacion: mensajeValidacion
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
            // SOLO boletos pagados (NO promoción)
            const totalPagado = resultados
                .filter(r => r.tipo === 'pagado')
                .reduce((sum, r) => sum + r.total, 0);
            const invalidos = resultados.filter(r => !r.esValido).length;
            let mensaje = `✅ ${resultados.length} registros | ${totalPagados} pagados, ${totalPromocion} promoción | ${totalBoletos} boletos totales | Total pagado: $${totalPagado.toFixed(2)}`;
            if (invalidos > 0) {
                mensaje += ` ⚠️ ${invalidos} con inconsistencia`;
            }
            document.getElementById('boletosInfoAlert').textContent = mensaje;
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
    // SOLO boletos pagados (NO promoción)
    const totalPagado = resultados
        .filter(r => r.tipo === 'pagado')
        .reduce((sum, r) => sum + r.total, 0);
    const invalidos = resultados.filter(r => !r.esValido).length;

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
            <div class="stat-card" style="background:linear-gradient(135deg,#f59e0b,#f97316);">
                <div class="stat-number" style="font-size:1.2rem;">$${totalPagado.toFixed(2)}</div>
                <div class="stat-label">💰 Total pagado</div>
            </div>
            ${invalidos > 0 ? `
            <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#ef4444);">
                <div class="stat-number">${invalidos}</div>
                <div class="stat-label">⚠️ Inconsistencias</div>
            </div>
            ` : ''}
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
            <div style="font-size:0.75rem;color:#64748b;">
                💡 Haz clic en los números para verificar (teléfono o boleto)
                ${invalidos > 0 ? ' | ⚠️ Las filas con fondo rojo tienen inconsistencia en el total' : ''}
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="exportBoletosERPToExcel()" style="
                    background:linear-gradient(135deg,#059669,#10b981);
                    color:white;border:none;padding:8px 20px;border-radius:8px;
                    font-weight:600;cursor:pointer;
                ">
                    📊 Exportar a Excel
                </button>
                <button onclick="openResumenBoletosModal()" style="
                    background:linear-gradient(135deg,#7c3aed,#8b5cf6);
                    color:white;border:none;padding:8px 20px;border-radius:8px;
                    font-weight:600;cursor:pointer;
                ">
                    👥 Resumen por Ruta
                </button>
            </div>
        </div>

        <div class="table-container">
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                <thead style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;position:sticky;top:0;">
                    <tr>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('folio')">Venta</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('tipo')">Tipo</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('cantidadBoletos')">🎫</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('total')">Total</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('sucursal')">Sucursal</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('vendedor')">Vendedor</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;min-width:130px;max-width:150px;" onclick="ordenarBoletos('dato1')">📝 # Celular</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;min-width:120px;max-width:150px;" onclick="ordenarBoletos('dato2')">📝 Boleto(s)</th>
                        <th style="padding:8px;cursor:pointer;text-align:center;" onclick="ordenarBoletos('fecha')">Fecha</th>
                    </tr>
                </thead>
                <tbody>
    `;

    resultados.forEach((item, index) => {
        const bgColor = item.esValido ? (index % 2 === 0 ? '#f8fafc' : 'white') : '#fef2f2';
        const tipoIcon = item.tipo === 'pagado' ? '💰' : '🎁';
        
        const formatearDato = (texto) => {
            if (!texto || texto === 'N/A') return '—';
            if (texto.length <= 15) return texto;
            const partes = [];
            for (let i = 0; i < texto.length; i += 15) {
                partes.push(texto.substring(i, i + 15));
            }
            return partes.join('<br>');
        };
        
        const telefono = item.telefono;
        const boletos = item.boletos || [];
        
        const mostrarDato1 = item.dato1 && item.dato1 !== 'N/A' ? formatearDato(item.dato1) : '—';
        const mostrarDato2 = item.dato2 && item.dato2 !== 'N/A' ? formatearDato(item.dato2) : '—';
        
        const esClickeable1 = telefono !== null && telefono !== undefined;
        const dato1Html = esClickeable1
            ? `<a href="#" onclick="abrirModalVerificacion('${telefono}', null, '${item.tipo}', '${item._dato1Original || item.dato1}', false);return false;" style="color:#2563eb;text-decoration:underline;cursor:pointer;">${mostrarDato1}</a>`
            : mostrarDato1;
        
        let dato2Html = mostrarDato2;
        if (boletos.length > 0) {
            if (boletos.length === 1) {
                dato2Html = `<a href="#" onclick="abrirModalVerificacion('${telefono || ''}', '${boletos[0]}', '${item.tipo}', '${item._dato2Original || item.dato2}', true);return false;" style="color:#059669;text-decoration:underline;cursor:pointer;">${mostrarDato2}</a>`;
            } else {
                const boletosHtml = boletos.map(b => 
                    `<a href="#" onclick="abrirModalVerificacion('${telefono || ''}', '${b}', '${item.tipo}', '${item._dato2Original || item.dato2}', true);return false;" style="color:#059669;text-decoration:underline;cursor:pointer;display:inline-block;margin:1px 3px;">${b}</a>`
                ).join(' ');
                dato2Html = boletosHtml;
            }
        }
        
        const warningIcon = !item.esValido ? ' ⚠️' : '';
        
        html += `
            <tr style="border-bottom:1px solid #e2e8f0;background:${bgColor};">
                <td style="padding:8px 8px;font-weight:600;color:#1e40af;text-align:center;">
                    <a href="#" onclick="openReceipt(${item.ventaId});return false;" style="color:#1e40af;text-decoration:none;">
                        📄 #${item.folio}${warningIcon}
                    </a>
                    ${!item.esValido ? `<div style="font-size:0.55rem;color:#dc2626;cursor:help;" title="${item.mensajeValidacion}">⚠️ ${item.mensajeValidacion}</div>` : ''}
                </td>
                <td style="padding:8px 8px;text-align:center;font-size:1.3rem;">
                    ${tipoIcon}
                </td>
                <td style="padding:8px 8px;text-align:center;font-weight:bold;font-size:1.1rem;color:#1e40af;">
                    ${item.cantidadBoletos}
                </td>
                <td style="padding:8px 8px;text-align:center;font-weight:bold;color:#059669;font-size:0.85rem;">
                    $${item.total.toFixed(2)}
                </td>
                <td style="padding:8px 8px;font-size:0.75rem;text-align:center;">${item.sucursal}</td>
                <td style="padding:8px 8px;font-size:0.75rem;text-align:center;">${item.vendedor}</td>
                <td style="padding:8px 8px;font-weight:500;font-size:0.75rem;font-family:monospace;text-align:center;word-break:break-word;line-height:1.4;min-width:130px;max-width:150px;">
                    ${dato1Html}
                </td>
                <td style="padding:8px 8px;font-size:0.7rem;font-family:monospace;text-align:center;word-break:break-word;line-height:1.6;min-width:120px;max-width:150px;">
                    ${dato2Html}
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

// ==================== MODAL RESUMEN POR RUTA (TABLA PLANA) ====================

function openResumenBoletosModal() {
    const resultados = window._boletosERPData || currentResults;
    
    if (!resultados || resultados.length === 0) {
        alert('⚠️ No hay datos para mostrar. Primero consulta.');
        return;
    }

    // ========== 1. AGRUPAR DATOS POR RUTA -> ASESOR ==========
    const rutasMap = new Map();

    resultados.forEach(item => {
        const sucursal = item.sucursal || 'Sin tienda';
        const vendedor = item.vendedor || 'Sin vendedor';
        const tipo = item.tipo || 'promocion';
        const cantidad = item.cantidadBoletos || 0;
        const total = item.total || 0;

        let rutaNombre = 'Sin Ruta';
        let rutaColor = '#64748b';
        let rutaIcon = '⚠️';

        for (const [nombre, data] of Object.entries(RUTAS_CONFIG)) {
            if (data.sucursales.some(s => s.toLowerCase() === sucursal.toLowerCase())) {
                rutaNombre = nombre;
                rutaColor = data.color;
                rutaIcon = data.icon || '🚚';
                break;
            }
        }

        if (!rutasMap.has(rutaNombre)) {
            rutasMap.set(rutaNombre, {
                nombre: rutaNombre,
                color: rutaColor,
                icon: rutaIcon,
                asesores: new Map(),
                totalBoletosPromo: 0,
                totalBoletosPagados: 0,
                totalPagadoPromo: 0,
                totalPagadoPagados: 0,
                totalRegistros: 0,
                totalAsesores: 0
            });
        }

        const ruta = rutasMap.get(rutaNombre);
        const keyAsesor = `${vendedor}|${sucursal}`;

        if (!ruta.asesores.has(keyAsesor)) {
            ruta.asesores.set(keyAsesor, {
                asesor: vendedor,
                tienda: sucursal,
                boletosPromo: 0,
                boletosPagados: 0,
                totalPagadoPromo: 0,
                totalPagadoPagados: 0,
                totalBoletos: 0,
                totalPagado: 0,
                registros: []
            });
            ruta.totalAsesores++;
        }

        const asesorData = ruta.asesores.get(keyAsesor);

        if (tipo === 'promocion') {
            asesorData.boletosPromo += cantidad;
            asesorData.totalPagadoPromo += total;
            ruta.totalBoletosPromo += cantidad;
            ruta.totalPagadoPromo += total;
        } else {
            asesorData.boletosPagados += cantidad;
            asesorData.totalPagadoPagados += total;
            ruta.totalBoletosPagados += cantidad;
            ruta.totalPagadoPagados += total;
        }

        asesorData.totalBoletos += cantidad;
        asesorData.totalPagado += total;
        asesorData.registros.push(item);
        ruta.totalRegistros++;
    });

    // ========== 2. CREAR MODAL ==========
    let modal = document.getElementById('boletosResumenModal');
    if (modal) {
        modal.remove();
    }

    modal = document.createElement('div');
    modal.id = 'boletosResumenModal';
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex !important;
        align-items: center;
        justify-content: center;
        z-index: 10002;
    `;

    // ========== 3. GENERAR PESTAÑAS POR RUTA ==========
    const rutasOrdenadas = Array.from(rutasMap.values())
        .sort((a, b) => {
            const orden = ['Ruta 1', 'Ruta 2', 'Ruta 3', 'Ruta 4', 'Sin Ruta'];
            return orden.indexOf(a.nombre) - orden.indexOf(b.nombre);
        });

    let tabsHtml = '';
    let contentHtml = '';
    let primera = true;

    rutasOrdenadas.forEach((ruta) => {
        const activeClass = primera ? 'active' : '';
        const displayStyle = primera ? 'block' : 'none';
        const color = ruta.color;

        tabsHtml += `
            <button class="boletos-ruta-tab ${activeClass}" 
                    data-ruta="${ruta.nombre}"
                    data-color="${color}"
                    style="
                        background: ${activeClass ? color : 'transparent'};
                        color: ${activeClass ? 'white' : color};
                        border: none;
                        padding: 8px 16px;
                        border-radius: 8px 8px 0 0;
                        font-weight: 600;
                        font-size: 0.8rem;
                        cursor: pointer;
                        transition: all 0.2s;
                        border-bottom: ${activeClass ? 'none' : `2px solid ${color}30`};
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    "
                    onmouseover="if(!this.classList.contains('active')){this.style.background='${color}20';}"
                    onmouseout="if(!this.classList.contains('active')){this.style.background='transparent';}">
                ${ruta.icon} ${ruta.nombre}
                <span style="
                    background: ${activeClass ? 'rgba(255,255,255,0.2)' : color};
                    color: ${activeClass ? 'white' : 'white'};
                    border-radius: 50%;
                    padding: 0 8px;
                    font-size: 0.65rem;
                    min-width: 18px;
                    text-align: center;
                ">${ruta.totalRegistros}</span>
            </button>
        `;

        // ========== 4. GENERAR TABLA PLANA: ASESOR | TIENDA | PROMO | PAGADOS | TOTAL ==========
        const asesoresArray = Array.from(ruta.asesores.values())
            .sort((a, b) => b.totalBoletos - a.totalBoletos);

        let tablaHtml = '';
        asesoresArray.forEach((item, idx) => {
            const bgRow = idx % 2 === 0 ? '#f8fafc' : 'white';
            tablaHtml += `
                <tr style="background:${bgRow}; border-bottom:1px solid #e2e8f0;">
                    <td style="padding:10px 12px; font-weight:500;">👤 ${escapeHtml(item.asesor)}</td>
                    <td style="padding:10px 12px;">🏪 ${escapeHtml(item.tienda)}</td>
                    <td style="padding:10px 12px; text-align:center; color:#f97316; font-weight:600;">
                        ${item.boletosPromo}
                        ${item.totalPagadoPromo > 0 ? `<br><span style="font-size:0.6rem;color:#94a3b8;">$${item.totalPagadoPromo.toFixed(2)}</span>` : ''}
                    </td>
                    <td style="padding:10px 12px; text-align:center; color:#059669; font-weight:600;">
                        ${item.boletosPagados}
                        ${item.totalPagadoPagados > 0 ? `<br><span style="font-size:0.6rem;color:#94a3b8;">$${item.totalPagadoPagados.toFixed(2)}</span>` : ''}
                    </td>
                    <td style="padding:10px 12px; text-align:center; font-weight:bold; font-size:1.05rem; color:#1e40af;">
                        ${item.totalBoletos}
                        <br><span style="font-size:0.65rem;color:#059669;">$${item.totalPagado.toFixed(2)}</span>
                    </td>
                </tr>
            `;
        });

        const totalRutaBoletos = ruta.totalBoletosPromo + ruta.totalBoletosPagados;
        const totalRutaPagado = ruta.totalPagadoPromo + ruta.totalPagadoPagados;

        contentHtml += `
            <div class="boletos-ruta-content" data-ruta="${ruta.nombre}" style="display: ${displayStyle}; padding: 16px 0;">
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px;">
                    <div class="stat-card" style="background: ${ruta.color}; padding: 10px; border-radius: 10px; color: white; text-align: center;">
                        <div style="font-size: 1.2rem; font-weight: bold;">${ruta.totalRegistros}</div>
                        <div style="font-size: 0.6rem; opacity: 0.9;">📊 Ventas</div>
                    </div>
                    <div class="stat-card" style="background: ${ruta.color}dd; padding: 10px; border-radius: 10px; color: white; text-align: center;">
                        <div style="font-size: 1.2rem; font-weight: bold;">${ruta.totalAsesores}</div>
                        <div style="font-size: 0.6rem; opacity: 0.9;">👤 Asesores</div>
                    </div>
                    <div class="stat-card" style="background: #f97316; padding: 10px; border-radius: 10px; color: white; text-align: center;">
                        <div style="font-size: 1.2rem; font-weight: bold;">${ruta.totalBoletosPromo}</div>
                        <div style="font-size: 0.6rem; opacity: 0.9;">🎁 Promoción</div>
                        <div style="font-size:0.6rem;opacity:0.8;">$${ruta.totalPagadoPromo.toFixed(2)}</div>
                    </div>
                    <div class="stat-card" style="background: #059669; padding: 10px; border-radius: 10px; color: white; text-align: center;">
                        <div style="font-size: 1.2rem; font-weight: bold;">${ruta.totalBoletosPagados}</div>
                        <div style="font-size: 0.6rem; opacity: 0.9;">💰 Pagados</div>
                        <div style="font-size:0.6rem;opacity:0.8;">$${ruta.totalPagadoPagados.toFixed(2)}</div>
                    </div>
                    <div class="stat-card" style="background: #1e40af; padding: 10px; border-radius: 10px; color: white; text-align: center;">
                        <div style="font-size: 1.2rem; font-weight: bold;">${totalRutaBoletos}</div>
                        <div style="font-size: 0.6rem; opacity: 0.9;">🎫 Total</div>
                        <div style="font-size:0.6rem;opacity:0.8;">$${totalRutaPagado.toFixed(2)}</div>
                    </div>
                </div>

                <div class="table-container">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead style="background: linear-gradient(135deg, ${ruta.color}, ${ruta.color}dd); color: white;">
                            <tr>
                                <th style="padding: 10px 12px; text-align: left;">👤 Asesor</th>
                                <th style="padding: 10px 12px; text-align: left;">🏪 Tienda</th>
                                <th style="padding: 10px 12px; text-align: center;">🎁 Promoción</th>
                                <th style="padding: 10px 12px; text-align: center;">💰 Pagados</th>
                                <th style="padding: 10px 12px; text-align: center;">🎫 Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tablaHtml}
                            <tr style="background: ${ruta.color}20; border-top: 2px solid ${ruta.color}; font-weight: bold;">
                                <td style="padding: 10px 12px;">📊 TOTAL ${ruta.nombre}</td>
                                <td style="padding: 10px 12px; text-align:center;">${ruta.totalAsesores} asesores</td>
                                <td style="padding: 10px 12px; text-align: center; color: #f97316;">
                                    ${ruta.totalBoletosPromo}
                                    <br><span style="font-size:0.6rem;color:#94a3b8;">$${ruta.totalPagadoPromo.toFixed(2)}</span>
                                </td>
                                <td style="padding: 10px 12px; text-align: center; color: #059669;">
                                    ${ruta.totalBoletosPagados}
                                    <br><span style="font-size:0.6rem;color:#94a3b8;">$${ruta.totalPagadoPagados.toFixed(2)}</span>
                                </td>
                                <td style="padding: 10px 12px; text-align: center; font-size: 1.1rem;">
                                    ${totalRutaBoletos}
                                    <br><span style="font-size:0.65rem;color:#059669;">$${totalRutaPagado.toFixed(2)}</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        primera = false;
    });

    // ========== 5. CONTENIDO COMPLETO DEL MODAL ==========
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 950px; animation: modalFadeIn 0.3s ease-out;">
            <div class="modal-header" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.8rem;">🎫</span>
                    <span>Resumen de Boletos por Ruta</span>
                </h3>
                <span class="close-modal" onclick="cerrarBoletosResumenModal()" style="font-size: 32px; cursor: pointer;">&times;</span>
            </div>
            <div class="modal-body" style="padding: 20px; max-height: 75vh; overflow-y: auto;">
                <div style="display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 2px solid #e2e8f0; margin-bottom: 8px;">
                    ${tabsHtml}
                </div>
                ${contentHtml}
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
                <button onclick="cerrarBoletosResumenModal()" style="
                    background: #64748b;
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    Cerrar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // ========== 6. EVENTOS DE PESTAÑAS ==========
    document.querySelectorAll('.boletos-ruta-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const ruta = this.dataset.ruta;
            const color = this.dataset.color || '#64748b';
            
            document.querySelectorAll('.boletos-ruta-tab').forEach(t => {
                t.classList.remove('active');
                t.style.background = 'transparent';
                t.style.color = t.dataset.color || '#64748b';
                t.style.borderBottom = `2px solid ${t.dataset.color || '#64748b'}30`;
            });
            
            this.classList.add('active');
            this.style.background = color;
            this.style.color = 'white';
            this.style.borderBottom = 'none';
            
            document.querySelectorAll('.boletos-ruta-content').forEach(c => {
                c.style.display = 'none';
            });
            document.querySelector(`.boletos-ruta-content[data-ruta="${ruta}"]`).style.display = 'block';
        });
    });

    // Cerrar al hacer clic fuera
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarBoletosResumenModal();
        }
    });
}

// ==================== CERRAR MODAL RESUMEN ====================

function cerrarBoletosResumenModal() {
    const modal = document.getElementById('boletosResumenModal');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// ==================== EXPORTAR A EXCEL ====================

function exportBoletosERPToExcel() {
    const resultados = window._boletosERPData || currentResults;
    
    console.log('📊 [EXPORT] Iniciando exportación...');
    console.log(`📊 [EXPORT] Total registros: ${resultados?.length || 0}`);
    
    if (!resultados || resultados.length === 0) {
        alert('⚠️ No hay datos para exportar. Primero consulta.');
        return;
    }

    const excelData = [
        ['BOLETOS RIFA - VENTAS ERP'],
        [`Fecha de consulta: ${new Date().toLocaleString()}`],
        [''],
        ['Venta', 'Tipo', 'Boletos', 'Total Pagado', 'Sucursal', 'Vendedor', '# Celular', 'Boleto(s)', 'Fecha']
    ];

    resultados.forEach((item) => {
        excelData.push([
            item.folio || item.ventaId,
            item.tipo === 'pagado' ? 'Pagado' : 'Promoción',
            item.cantidadBoletos || 0,
            (item.total || 0).toFixed(2),
            item.sucursal,
            item.vendedor,
            item.dato1 || '',
            item.dato2 || '',
            new Date(item.fecha).toLocaleString()
        ]);
    });

    const totalVentas = resultados.length;
    const totalPagados = resultados.filter(r => r.tipo === 'pagado').length;
    const totalPromocion = resultados.filter(r => r.tipo === 'promocion').length;
    
    const boletosPagados = resultados
        .filter(r => r.tipo === 'pagado')
        .reduce((sum, r) => sum + (r.cantidadBoletos || 0), 0);
    
    const boletosPromocion = resultados
        .filter(r => r.tipo === 'promocion')
        .reduce((sum, r) => sum + (r.cantidadBoletos || 0), 0);
    
    const totalBoletos = boletosPagados + boletosPromocion;
    
    // SOLO boletos pagados (NO promoción)
    const totalPagadoGeneral = resultados
        .filter(r => r.tipo === 'pagado')
        .reduce((sum, r) => sum + r.total, 0);
    
    const invalidos = resultados.filter(r => !r.esValido).length;

    excelData.push([]);
    excelData.push(['RESUMEN']);
    excelData.push(['Total Ventas', totalVentas]);
    excelData.push(['Total Pagados', totalPagados]);
    excelData.push(['Total Promoción', totalPromocion]);
    excelData.push(['Boletos Pagados', boletosPagados]);
    excelData.push(['Boletos Promoción', boletosPromocion]);
    excelData.push(['Total Boletos', totalBoletos]);
    excelData.push(['Total Pagado', totalPagadoGeneral.toFixed(2)]);
    if (invalidos > 0) {
        excelData.push(['⚠️ Inconsistencias', invalidos]);
    }

    try {
        if (typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            ws['!cols'] = [
                { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
                { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 22 }
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

    if (!document.getElementById('boletosVerificacionModal')) {
        const modalHTML = `
            <div id="boletosVerificacionModal" class="modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;justify-content:center;align-items:center;overflow-y:auto;padding:20px;">
                <div style="background:white;border-radius:16px;max-width:550px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:modalFadeIn 0.3s ease;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
                        <h3 id="boletosVerificacionTitle" style="margin:0;font-size:1.1rem;color:#1e40af;">🔍 Verificación de Boleto</h3>
                        <button onclick="cerrarModalVerificacion()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;padding:0 8px;">&times;</button>
                    </div>
                    <div id="boletosVerificacionBody" style="padding:16px 20px;overflow-y:auto;flex:1;">
                        <div style="text-align:center;padding:40px;color:#64748b;">
                            <div style="font-size:3rem;margin-bottom:16px;">🔍</div>
                            <p>Selecciona un número para verificar</p>
                        </div>
                    </div>
                    <div style="padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;flex-shrink:0;">
                        <button onclick="cerrarModalVerificacion()" style="padding:8px 24px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;">Cerrar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

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

    document.addEventListener('click', function(e) {
        const modal = document.getElementById('boletosVerificacionModal');
        if (modal && e.target === modal) {
            cerrarModalVerificacion();
        }
    });

    console.log('✅ [BOLETOS ERP] Módulo inicializado');
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initBoletosERPModule = initBoletosERPModule;
window.consultarBoletosERP = consultarBoletosERP;
window.exportBoletosERPToExcel = exportBoletosERPToExcel;
window.ordenarBoletos = ordenarBoletos;
window.abrirModalVerificacion = abrirModalVerificacion;
window.abrirVerificacionEnNuevaPestana = abrirVerificacionEnNuevaPestana;
window.cerrarModalVerificacion = cerrarModalVerificacion;
window.openResumenBoletosModal = openResumenBoletosModal;
window.cerrarBoletosResumenModal = cerrarBoletosResumenModal;
window.extraerTelefono = extraerTelefono;
window.extraerNumerosBoleto = extraerNumerosBoleto;
window.extraerTelefonoYBoleto = extraerTelefonoYBoleto;

console.log('✅ Módulo BOLETOS ERP cargado correctamente');