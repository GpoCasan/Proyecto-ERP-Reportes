// ==================== MÓDULO: BOLETOS RIFA (ERP) ====================

// ==================== CONFIGURACIÓN ====================

const BOLETOS_PRODUCT_NOTA = 1316;      // Boleto Rifa Promo PAYJOY (PROMOCIÓN)
const BOLETOS_PRODUCT_REFERENCIA = 1315; // Boleto RIFA (PAGADO)
const PRECIO_BOLETO = 25;

// Catálogo de las siete rifas. La rifa de la tele conserva la lógica
// anterior de producto + servicio; las demás se consultan por servicio.
const RIFAS_CONFIG = Object.freeze({
    tele: {
        id: 'tele',
        nombre: 'Rifa de la Tele',
        esTele: true,
        precioBoleto: PRECIO_BOLETO,
        productoNotaId: BOLETOS_PRODUCT_NOTA,
        productoReferenciaId: BOLETOS_PRODUCT_REFERENCIA,
        servicioIds: [BOLETOS_PRODUCT_REFERENCIA]
    },
    rifa1350: { id: 'rifa1350', nombre: 'Rifa Conkal', esTele: false, precioBoleto: 10, servicioIds: [1350] },
    rifa1351: { id: 'rifa1351', nombre: 'Rifa Temax', esTele: false, precioBoleto: 10, servicioIds: [1351] },
    rifa1352: { id: 'rifa1352', nombre: 'Rifa Morelos', esTele: false, precioBoleto: 10, servicioIds: [1352] },
    rifa1353: { id: 'rifa1353', nombre: 'Rifa Tzucacab', esTele: false, precioBoleto: 10, servicioIds: [1353] },
    rifa1354: { id: 'rifa1354', nombre: 'Rifa Baca', esTele: false, precioBoleto: 10, servicioIds: [1354] },
    rifa1355: { id: 'rifa1355', nombre: 'Rifa Xocchel', esTele: false, precioBoleto: 10, servicioIds: [1355] }
});

let rifaSeleccionadaId = 'tele';

function obtenerRifaSeleccionada() {
    const select = document.getElementById('boletosRifaSelect');
    const id = select?.value || rifaSeleccionadaId;
    return RIFAS_CONFIG[id] || RIFAS_CONFIG.tele;
}

function cambiarRifaBoletos() {
    const select = document.getElementById('boletosRifaSelect');
    if (select) rifaSeleccionadaId = select.value;

    const rifa = obtenerRifaSeleccionada();
    currentResults = [];
    window._boletosERPData = null;
    window._boletosResumenData = null;
    sortDirection = {};
    currentPage = 1;

    const results = document.getElementById('boletosResults');
    if (results) {
        results.innerHTML = '';
        results.style.display = 'none';
    }

    const info = document.getElementById('boletosInfoAlert');
    if (info) {
        info.textContent = `Rifa seleccionada: ${rifa.nombre}. Selecciona el período y consulta.`;
        info.style.display = 'block';
    }

    const error = document.getElementById('boletosErrorAlert');
    if (error) error.style.display = 'none';
}

function crearSelectorRifas() {
    let select = document.getElementById('boletosRifaSelect');
    let selectorWrapper = document.getElementById('boletosRifaSelectorWrapper');

    if (!selectorWrapper) {
        selectorWrapper = document.createElement('div');
        selectorWrapper.id = 'boletosRifaSelectorWrapper';

        const label = document.createElement('label');
        label.htmlFor = 'boletosRifaSelect';
        label.textContent = '🎫 Rifa a consultar';
        label.style.cssText = 'font-weight:600;color:#1e293b;font-size:0.95rem;';
        selectorWrapper.appendChild(label);
    }

    if (!select) {
        select = document.createElement('select');
        select.id = 'boletosRifaSelect';
        select.setAttribute('aria-label', 'Seleccionar rifa');
    }

    // El selector ocupa toda la columna izquierda y queda separado del botón.
    selectorWrapper.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;max-width:100%;min-width:0;margin:0 0 16px 0;align-self:stretch;order:initial;';
    select.style.cssText = 'width:100%;min-height:54px;padding:14px 16px;border:2px solid #e2e8f0;border-radius:8px;background:white;color:#1e293b;font-size:1.05rem;font-weight:700;cursor:pointer;outline:none;box-sizing:border-box;';

    // Si el selector ya estaba en la columna derecha, se mueve dentro del bloque
    // de Fecha Inicio, antes de su etiqueta y campo.
    const fechaInicio = document.getElementById('boletosStartDate');
    const bloqueFechaInicio = fechaInicio?.closest('.form-group, .date-group, .input-group') || fechaInicio?.parentElement;

    if (bloqueFechaInicio) {
        if (select.parentNode !== selectorWrapper) selectorWrapper.appendChild(select);
        if (selectorWrapper.parentNode !== bloqueFechaInicio) {
            bloqueFechaInicio.insertBefore(selectorWrapper, bloqueFechaInicio.firstChild);
        }
    } else if (select.parentNode !== selectorWrapper) {
        selectorWrapper.appendChild(select);
        const boton = document.getElementById('consultarBoletosBtn');
        if (boton?.parentNode) {
            boton.parentNode.insertBefore(selectorWrapper, boton);
        } else {
            document.body.insertBefore(selectorWrapper, document.body.firstChild);
        }
    }

    select.innerHTML = Object.values(RIFAS_CONFIG)
        .map(rifa => `<option value="${rifa.id}">${rifa.nombre}</option>`)
        .join('');
    select.value = RIFAS_CONFIG[rifaSeleccionadaId] ? rifaSeleccionadaId : 'tele';
    select.onchange = cambiarRifaBoletos;
}

// Variable para controlar el ordenamiento
let sortDirection = {};
let currentResults = [];
let currentPage = 1;
let pageSize = 25;

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

// ==================== ABRIR VENTA ERP ====================

function abrirVentaERP(ventaId) {
    console.log(`📄 [VENTA] Abriendo venta ID: ${ventaId}`);
    if (typeof openReceipt === 'function') {
        openReceipt(ventaId);
    } else {
        alert(`📄 Abrir venta #${ventaId}`);
    }
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

// ==================== BUSCADOR DE BOLETOS (MODAL SIMPLIFICADO) ====================

function abrirBuscadorBoletos() {
    const resultados = window._boletosERPData || currentResults;
    
    if (!resultados || resultados.length === 0) {
        alert('⚠️ Primero debes consultar ventas de boletos');
        return;
    }
    
    const modal = document.getElementById('boletosBuscadorModal');
    if (!modal) {
        console.error('❌ Modal buscador no encontrado');
        return;
    }
    
    // Limpiar el contenido del modal
    const body = document.getElementById('boletosBuscadorBody');
    if (body) {
        body.innerHTML = `
            <div style="padding: 20px 0;">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; color: #1e293b; margin-bottom: 8px; font-size: 0.9rem;">
                        🎫 Número de boleto (3 dígitos):
                    </label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" 
                               id="boletosBuscadorInput" 
                               placeholder="Ej: 005" 
                               maxlength="3"
                               style="
                                   flex: 1;
                                   padding: 10px 14px;
                                   border: 2px solid #e2e8f0;
                                   border-radius: 8px;
                                   font-size: 1.1rem;
                                   font-weight: 600;
                                   text-align: center;
                                   font-family: monospace;
                                   outline: none;
                                   transition: border-color 0.2s;
                               "
                               onfocus="this.style.borderColor='#3b82f6'"
                               onblur="this.style.borderColor='#e2e8f0'"
                               oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 3)">
                        <button onclick="buscarBoletoModal()" style="
                            background: linear-gradient(135deg, #1e40af, #3b82f6);
                            color: white;
                            border: none;
                            padding: 10px 24px;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s;
                            white-space: nowrap;
                        "
                        onmouseover="this.style.transform='scale(1.02)'"
                        onmouseout="this.style.transform='scale(1)'">
                            🔍 Buscar
                        </button>
                    </div>
                </div>
                <div id="boletosResultadoBusqueda" style="margin-top: 16px;">
                    <div style="text-align: center; color: #94a3b8; padding: 30px 0;">
                        <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
                        <p>Ingresa el número de boleto de 3 dígitos</p>
                        <p style="font-size: 0.8rem; margin-top: 8px;">Ejemplo: 001, 005, 123</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Configurar Enter en el input
    const input = document.getElementById('boletosBuscadorInput');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                buscarBoletoModal();
            }
        });
        // Enfocar automáticamente
        setTimeout(() => input.focus(), 100);
    }
    
    // Limpiar resultado de búsqueda anterior
    const resultadoDiv = document.getElementById('boletosResultadoBusqueda');
    if (resultadoDiv) {
        resultadoDiv.innerHTML = `
            <div style="text-align: center; color: #94a3b8; padding: 30px 0;">
                <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
                <p>Ingresa el número de boleto de 3 dígitos</p>
                <p style="font-size: 0.8rem; margin-top: 8px;">Ejemplo: 001, 005, 123</p>
            </div>
        `;
    }
    
    // Mostrar el modal
    modal.style.display = 'flex';
    document.getElementById('boletosBuscadorTitle').textContent = '🎫 Buscar Boleto';
}

function buscarBoletoModal() {
    const input = document.getElementById('boletosBuscadorInput');
    if (!input) return;
    
    const query = input.value.trim();
    
    // Validar que sean exactamente 3 dígitos
    if (!query || query.length !== 3 || !/^\d{3}$/.test(query)) {
        alert('⚠️ Debes ingresar exactamente 3 dígitos (001 al 999)');
        input.focus();
        input.select();
        return;
    }
    
    console.log(`🔍 [BUSCADOR] Buscando boleto: ${query}`);
    
    const resultados = window._boletosERPData || currentResults;
    
    if (!resultados || resultados.length === 0) {
        mostrarResultadoBusquedaModal(null, query, 'No hay ventas cargadas. Primero consulta ventas de boletos.');
        return;
    }
    
    // Buscar coincidencia EXACTA
    let ventasEncontradas = [];
    
    resultados.forEach(item => {
        if (item.boletos && item.boletos.length > 0) {
            // Buscar coincidencia exacta en el array de boletos
            const encontrado = item.boletos.some(b => b === query);
            if (encontrado) {
                ventasEncontradas.push(item);
            }
        }
        
        // También buscar en dato2 (string de boletos) con coincidencia exacta
        if (item.dato2) {
            // Buscar el boleto como palabra completa (con bordes de palabra)
            const regex = new RegExp(`\\b${query}\\b`);
            if (regex.test(item.dato2)) {
                if (!ventasEncontradas.includes(item)) {
                    ventasEncontradas.push(item);
                }
            }
        }
    });
    
    if (ventasEncontradas.length === 0) {
        mostrarResultadoBusquedaModal(null, query, `❌ Boleto #${query} no encontrado en el rango consultado.`);
        return;
    }
    
    if (ventasEncontradas.length === 1) {
        mostrarResultadoBusquedaModal(ventasEncontradas[0], query);
    } else {
        mostrarResultadoBusquedaModal(ventasEncontradas, query);
    }
}

function mostrarResultadoBusquedaModal(data, query, mensajeError = null) {
    const resultadoDiv = document.getElementById('boletosResultadoBusqueda');
    if (!resultadoDiv) return;
    
    // Si hay error o no hay datos
    if (mensajeError || !data) {
        resultadoDiv.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fef2f2; border-radius: 10px; border: 1px solid #fecaca;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">❌</div>
                <p style="color: #dc2626; font-weight: 600;">${mensajeError || 'No se encontró el boleto'}</p>
                <button onclick="limpiarBuscadorBoletos()" style="
                    margin-top: 12px;
                    background: #64748b;
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                ">
                    🔄 Limpiar
                </button>
            </div>
        `;
        return;
    }
    
    // Si es un array (múltiples ventas)
    if (Array.isArray(data)) {
        let ventasHtml = '';
        data.forEach((item, index) => {
            const bgColor = index % 2 === 0 ? '#f8fafc' : 'white';
            const tipoIcon = item.tipo === 'pagado' ? '💰' : '🎁';
            const fechaStr = new Date(item.fecha).toLocaleString();
            
            ventasHtml += `
                <div style="
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    gap: 10px;
                    padding: 10px 12px;
                    background: ${bgColor};
                    border-bottom: 1px solid #e2e8f0;
                    align-items: center;
                    cursor: pointer;
                "
                onclick="mostrarResultadoBusquedaModal(ventasEncontradas[${index}], '${query}')"
                onmouseover="this.style.background='#e2e8f0'"
                onmouseout="this.style.background='${bgColor}'">
                    <div style="font-size: 1.2rem;">${tipoIcon}</div>
                    <div>
                        <div style="font-weight: 600; color: #1e40af; cursor: pointer;" onclick="event.stopPropagation(); abrirVentaERP(${item.ventaId});">
                            📄 #${item.folio}
                        </div>
                        <div style="font-size: 0.7rem; color: #64748b;">${item.sucursal} - ${item.vendedor}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: #059669;">$${item.total.toFixed(2)}</div>
                        <div style="font-size: 0.65rem; color: #64748b;">${item.cantidadBoletos} boletos</div>
                    </div>
                </div>
            `;
        });
        
        resultadoDiv.innerHTML = `
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <div style="padding: 8px 12px; background: #f1f5f9; font-weight: 600; color: #1e293b; border-bottom: 1px solid #e2e8f0;">
                    🎫 Boleto #${query} - ${data.length} ventas encontradas
                </div>
                ${ventasHtml}
            </div>
            <div style="margin-top: 12px; display: flex; gap: 10px;">
                <button onclick="limpiarBuscadorBoletos()" style="
                    flex: 1;
                    background: #64748b;
                    color: white;
                    border: none;
                    padding: 10px;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                "
                onmouseover="this.style.transform='scale(1.02)'"
                onmouseout="this.style.transform='scale(1)'">
                    🔄 Limpiar
                </button>
            </div>
        `;
        return;
    }
    
    // Si es una sola venta (objeto)
    const item = data;
    const boletosStr = item.boletos && item.boletos.length > 0 ? item.boletos.join(', ') : 'N/A';
    const telefonoStr = item.telefono || 'N/A';
    const tipoStr = item.tipo === 'pagado' ? '💰 Pagado' : '🎁 Promoción';
    const fechaStr = new Date(item.fecha).toLocaleString();
    const esValidoStr = item.esValido ? '✅ Válido' : '⚠️ Inconsistencia';
    
    // Generar HTML para los boletos clickeables
    let boletosClickeablesHtml = '';
    if (item.boletos && item.boletos.length > 0) {
        boletosClickeablesHtml = item.boletos.map(b => 
            `<a href="#" onclick="abrirVerificacionEnNuevaPestana(null, '${b}');return false;" style="color:#059669;text-decoration:underline;cursor:pointer;font-weight:bold;margin:0 2px;">${b}</a>`
        ).join(', ');
    } else {
        boletosClickeablesHtml = 'N/A';
    }
    
    // Teléfono clickeable
    const telefonoClickeable = telefonoStr !== 'N/A' 
        ? `<a href="#" onclick="abrirVerificacionEnNuevaPestana('${telefonoStr}', null);return false;" style="color:#2563eb;text-decoration:underline;cursor:pointer;font-weight:bold;">${telefonoStr}</a>`
        : 'N/A';
    
    // Folio clickeable
    const folioClickeable = `<a href="#" onclick="abrirVentaERP(${item.ventaId});return false;" style="color:#1e40af;text-decoration:underline;cursor:pointer;font-weight:bold;">#${item.folio}</a>`;
    
    resultadoDiv.innerHTML = `
        <div style="background: #f0fdf4; border: 2px solid #059669; border-radius: 10px; padding: 16px; margin-top: 8px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #64748b;">📄 Folio</div>
                    <div style="font-size: 1.1rem;">${folioClickeable}</div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #64748b;">🎫 Tipo</div>
                    <div style="font-size: 1.1rem; font-weight: bold;">${tipoStr}</div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #64748b;">📱 Teléfono</div>
                    <div style="font-size: 1rem;">${telefonoClickeable}</div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #64748b;">🎫 Boleto(s)</div>
                    <div style="font-size: 1rem; font-weight: bold; color: #059669;">${boletosClickeablesHtml}</div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #64748b;">💰 Total</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: #059669;">$${item.total.toFixed(2)}</div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #64748b;">🏪 Sucursal</div>
                    <div style="font-size: 0.85rem; font-weight: 500;">${item.sucursal}</div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 8px; text-align: center; grid-column: span 2;">
                    <div style="font-size: 0.7rem; color: #64748b;">👤 Vendedor</div>
                    <div style="font-size: 0.85rem; font-weight: 500;">${item.vendedor}</div>
                </div>
                <div style="background: ${item.esValido ? '#f0fdf4' : '#fef2f2'}; padding: 8px; border-radius: 6px; grid-column: span 2; text-align: center; border: 1px solid ${item.esValido ? '#bbf7d0' : '#fecaca'};">
                    <div style="font-size: 0.85rem; font-weight: bold; color: ${item.esValido ? '#059669' : '#dc2626'};">${esValidoStr}</div>
                </div>
                <div style="grid-column: span 2; font-size: 0.7rem; color: #94a3b8; text-align: center;">
                    📅 ${fechaStr}
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="limpiarBuscadorBoletos()" style="
                    flex: 1;
                    background: #64748b;
                    color: white;
                    border: none;
                    padding: 10px;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                "
                onmouseover="this.style.transform='scale(1.02)'"
                onmouseout="this.style.transform='scale(1)'">
                    🔄 Limpiar
                </button>
            </div>
        </div>
    `;
}

function limpiarBuscadorBoletos() {
    const input = document.getElementById('boletosBuscadorInput');
    const resultadoDiv = document.getElementById('boletosResultadoBusqueda');
    
    if (input) {
        input.value = '';
        input.focus();
    }
    
    if (resultadoDiv) {
        resultadoDiv.innerHTML = `
            <div style="text-align: center; color: #94a3b8; padding: 30px 0;">
                <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
                <p>Ingresa el número de boleto de 3 dígitos</p>
                <p style="font-size: 0.8rem; margin-top: 8px;">Ejemplo: 001, 005, 123</p>
            </div>
        `;
    }
}

function cerrarBuscadorBoletos() {
    const modal = document.getElementById('boletosBuscadorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ==================== FUNCIÓN PARA OBTENER TODAS LAS VENTAS (PAGINACIÓN COMPLETA) ====================

function agregarFiltrosRifa(url, rifa) {
    if (!rifa || !Array.isArray(rifa.servicioIds) || rifa.servicioIds.length !== 1) {
        throw new Error('La rifa seleccionada no tiene configurado exactamente un servicio');
    }

    if (rifa.esTele) {
        return url
            + `&product_ids[]=${rifa.productoNotaId}`
            + `&product_ids[]=${rifa.productoReferenciaId}`
            + `&service_ids[]=${rifa.servicioIds[0]}`;
    }

    // Las rifas adicionales se consultan como servicios y requieren
    // producto + servicio con el mismo ID, además de sale_type=services.
    const servicioId = rifa.servicioIds[0];
    return url
        + `&product_ids[]=${servicioId}`
        + `&service_ids[]=${servicioId}`
        + '&sale_type=services';
}

async function obtenerTodasLasVentas(startFormatted, endFormatted, rifa = obtenerRifaSeleccionada()) {
    let todasLasVentas = [];
    let pagina = 1;
    const porPagina = 10;
    let total = 0;
    
    console.log(`📡 [BOLETOS ERP] Obteniendo ventas de ${rifa.nombre}...`);
    
    do {
        // Se conserva el formato manual de la versión original, porque el
        // endpoint del ERP espera los corchetes y el signo + sin recodificar.
        let url = `${CONFIG.API_SALES_ENDPOINT}?page=${pagina}&per_page=${porPagina}&total=0`;
        url += `&start_date=${startFormatted}`;
        url += `&end_date=${endFormatted}`;

        url = agregarFiltrosRifa(url, rifa);
        console.log(`📡 [BOLETOS ERP] Página ${pagina} (${rifa.nombre}): ${url}`);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const ventas = data.data || [];
        total = data.total || 0;
        
        console.log(`✅ [BOLETOS ERP] Página ${pagina}: ${ventas.length} ventas encontradas (Total: ${total})`);
        
        todasLasVentas = todasLasVentas.concat(ventas);
        pagina++;
        
        if (ventas.length === 0) break;
        if (todasLasVentas.length >= total) break;
        
    } while (true);
    
    console.log(`✅ [BOLETOS ERP] Total de ventas obtenidas para ${rifa.nombre}: ${todasLasVentas.length}`);
    return todasLasVentas;
}

// ==================== FUNCIÓN PRINCIPAL (CONSULTAR VENTAS) ====================

function obtenerValorDetalle(detail, keys) {
    for (const key of keys) {
        const value = detail?.[key];
        if (value !== null && value !== undefined && String(value).trim() !== '') {
            return value;
        }
    }
    return null;
}

function obtenerIdServicioDetalle(detail) {
    return Number(detail?.service_id ?? detail?.service?.id ?? detail?.serviceId ?? 0);
}

function validarTotalBoletos(total, cantidad, precio, ventaId) {
    if (!cantidad || cantidad <= 0) {
        return { esValido: true, mensaje: '' };
    }

    const totalEsperado = cantidad * precio;
    const diferencia = Math.abs(Number(total || 0) - totalEsperado);
    if (diferencia <= 0.01) {
        return { esValido: true, mensaje: '' };
    }

    const mensaje = `⚠️ Total $${Number(total || 0).toFixed(2)} no coincide con ${cantidad} boletos de $${precio.toFixed(2)} ($${totalEsperado.toFixed(2)})`;
    console.warn(`⚠️ Venta ${ventaId}: ${mensaje}`);
    return { esValido: false, mensaje };
}

async function consultarBoletosERP() {
    const rifa = obtenerRifaSeleccionada();
    console.log(`🎫 [BOLETOS ERP] Consultando ${rifa.nombre}...`);

    const startDate = document.getElementById('boletosStartDate').value;
    const endDate = document.getElementById('boletosEndDate').value;

    if (!startDate || !endDate) {
        document.getElementById('boletosErrorAlert').textContent = '⚠️ Selecciona ambas fechas (inicio y fin)';
        document.getElementById('boletosErrorAlert').style.display = 'block';
        return;
    }

    const btn = document.getElementById('consultarBoletosBtn');
    if (!btn) throw new Error('No se encontró el botón de consulta de boletos');

    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('boletosErrorAlert').style.display = 'none';
    document.getElementById('boletosInfoAlert').style.display = 'none';
    document.getElementById('boletosResults').style.display = 'none';

    try {
        const range = getDateRangeBoletos(startDate, endDate);
        if (!range) throw new Error('Error en el rango de fechas');

        const ventas = await obtenerTodasLasVentas(range.start, range.end, rifa);
        console.log(`✅ [BOLETOS ERP] ${ventas.length} ventas encontradas para ${rifa.nombre}`);

        const resultados = [];

        ventas.forEach(sale => {
            const detalles = Array.isArray(sale.details) ? sale.details : [];
            let nota1 = null;
            let nota1_2 = null;
            let referencia1 = null;
            let referencia2 = null;
            let detalleServicioRifa = null;
            let tipo = null;
            let cantidadBoletos = 0;
            let boletosExtraidos = [];
            let esValido = true;
            let mensajeValidacion = '';
            let totalPagadoProducto = 0;

            detalles.forEach(detail => {
                const productId = Number(detail.product_id);
                const serviceId = obtenerIdServicioDetalle(detail);
                const totalAmount = parseFloat(detail.total_amount) || parseFloat(detail.total) || 0;

                if (rifa.esTele && productId === rifa.productoNotaId) {
                    tipo = 'promocion';
                    cantidadBoletos = 1;
                    nota1 = detail.note || null;
                    nota1_2 = detail.note_2 || null;
                    totalPagadoProducto = totalAmount;
                }

                if (rifa.esTele && productId === rifa.productoReferenciaId) {
                    tipo = 'pagado';
                    referencia1 = detail.reference_1 || null;
                    referencia2 = detail.reference_2 || null;
                    totalPagadoProducto = totalAmount;
                }

                const esServicioRifa = !rifa.esTele && rifa.servicioIds.some(id =>
                    id === serviceId || id === productId
                );

                if (esServicioRifa) {
                    detalleServicioRifa = detail;
                    tipo = 'pagado';
                    referencia1 = obtenerValorDetalle(detail, [
                        'reference_1', 'reference1', 'phone', 'telephone', 'note'
                    ]);
                    referencia2 = obtenerValorDetalle(detail, [
                        'reference_2', 'reference2', 'ticket', 'tickets', 'note_2'
                    ]);
                    totalPagadoProducto = totalAmount;
                }
            });

            const tieneDatos = rifa.esTele
                ? (nota1 || referencia1)
                : detalleServicioRifa;

            if (!tieneDatos) return;

            if (rifa.esTele) {
                if (referencia1) {
                    tipo = 'pagado';
                    const separado = extraerTelefonoYBoleto(referencia2 || '');
                    boletosExtraidos = separado.boletos;
                    cantidadBoletos = boletosExtraidos.length;

                    // La validación se realiza después, usando el precio de la rifa.
                    // La promoción no se valida porque no representa un cobro de boletos.
                } else if (nota1) {
                    tipo = 'promocion';
                    const separado = extraerTelefonoYBoleto(nota1_2 || '');
                    boletosExtraidos = separado.boletos;
                    cantidadBoletos = boletosExtraidos.length > 0 ? boletosExtraidos.length : 1;
                }
            } else {
                tipo = 'pagado';
                const separado1 = extraerTelefonoYBoleto(referencia1 || '');
                const separado2 = extraerTelefonoYBoleto(referencia2 || '');
                boletosExtraidos = separado2.boletos.length > 0 ? separado2.boletos : separado1.boletos;
                cantidadBoletos = boletosExtraidos.length;

                const cantidadDetalle = Number(detalleServicioRifa?.quantity ?? detalleServicioRifa?.qty ?? 0);
                if (cantidadBoletos === 0 && Number.isFinite(cantidadDetalle) && cantidadDetalle > 0) {
                    cantidadBoletos = cantidadDetalle;
                }
            }

            const dato1Original = tipo === 'pagado' ? referencia1 : nota1;
            if (tipo === 'pagado') {
                const validacion = validarTotalBoletos(
                    totalPagadoProducto,
                    cantidadBoletos,
                    rifa.precioBoleto,
                    sale.id
                );
                esValido = validacion.esValido;
                mensajeValidacion = validacion.mensaje;
            }

            const dato2Original = tipo === 'pagado' ? referencia2 : nota1_2;
            const dato1Separado = extraerTelefonoYBoleto(dato1Original || '');
            const dato2Separado = extraerTelefonoYBoleto(dato2Original || '');
            let boletos2 = dato2Separado.boletos;
            if (boletos2.length === 0 && boletosExtraidos.length > 0) boletos2 = boletosExtraidos;
            if (boletos2.length === 0 && dato1Separado.boletos.length > 0) boletos2 = dato1Separado.boletos;

            resultados.push({
                ventaId: sale.id,
                folio: sale.folio || sale.id,
                fecha: sale.created_at,
                sucursal: sale.warehouse?.branch?.name || 'N/A',
                vendedor: sale.user?.name || 'N/A',
                cliente: sale.client?.name || 'N/A',
                rifa: rifa.nombre,
                rifaId: rifa.id,
                precioBoleto: rifa.precioBoleto,
                total: totalPagadoProducto,
                tipo,
                cantidadBoletos,
                dato1: dato1Separado.telefono || dato1Original || 'N/A',
                dato2: boletos2.length > 0 ? boletos2.join(', ') : dato2Original || 'N/A',
                _dato1Original: dato1Original,
                _dato2Original: dato2Original,
                telefono: dato1Separado.telefono,
                boletos: boletos2,
                tieneDato: !!dato1Original || !!dato2Original,
                esValido,
                mensajeValidacion
            });
        });

        resultados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        currentResults = resultados;
        window._boletosERPData = resultados;
        sortDirection = {};
        currentPage = 1;
        mostrarResultadosBoletosERP(resultados);

        if (resultados.length === 0) {
            document.getElementById('boletosInfoAlert').textContent = `⚠️ No se encontraron ventas de ${rifa.nombre} en el período.`;
            document.getElementById('boletosInfoAlert').style.display = 'block';
        } else {
            const totalPagados = resultados.filter(r => r.tipo === 'pagado').length;
            const totalPromocion = resultados.filter(r => r.tipo === 'promocion').length;
            const totalBoletos = resultados.reduce((sum, r) => sum + r.cantidadBoletos, 0);
            const totalPagado = resultados.filter(r => r.tipo === 'pagado').reduce((sum, r) => sum + r.total, 0);
            const invalidos = resultados.filter(r => !r.esValido).length;
            let mensaje = `✅ ${resultados.length} registros de ${rifa.nombre} | ${totalPagados} pagados, ${totalPromocion} promoción | ${totalBoletos} boletos totales | Total pagado: $${totalPagado.toFixed(2)}`;
            if (invalidos > 0) mensaje += ` ⚠️ ${invalidos} con inconsistencia`;
            document.getElementById('boletosInfoAlert').textContent = mensaje;
            document.getElementById('boletosInfoAlert').style.display = 'block';
        }
    } catch (error) {
        console.error(`❌ [BOLETOS ERP] Error consultando ${rifa.nombre}:`, error);
        document.getElementById('boletosErrorAlert').textContent = `❌ Error: ${error.message}`;
        document.getElementById('boletosErrorAlert').style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== FUNCIONES DE PAGINACIÓN ====================

function cambiarPaginaBoletos(direccion) {
    const totalPaginas = Math.ceil(currentResults.length / pageSize);
    if (direccion === 'anterior' && currentPage > 1) {
        currentPage--;
    } else if (direccion === 'siguiente' && currentPage < totalPaginas) {
        currentPage++;
    }
    mostrarResultadosBoletosERP(currentResults);
}

function cambiarTamanoPaginaBoletos(nuevoTamano) {
    pageSize = nuevoTamano;
    currentPage = 1;
    mostrarResultadosBoletosERP(currentResults);
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
    currentResults = sorted;
    currentPage = 1;
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

    // Calcular paginación
    const totalRegistros = resultados.length;
    const totalPaginas = Math.ceil(totalRegistros / pageSize);
    
    // Asegurar que currentPage no exceda el total
    if (currentPage > totalPaginas) {
        currentPage = totalPaginas;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }
    
    const inicio = (currentPage - 1) * pageSize;
    const fin = Math.min(inicio + pageSize, totalRegistros);
    const paginaActual = resultados.slice(inicio, fin);

    const totalPagados = resultados.filter(r => r.tipo === 'pagado').length;
    const totalPromocion = resultados.filter(r => r.tipo === 'promocion').length;
    const totalBoletos = resultados.reduce((sum, r) => sum + r.cantidadBoletos, 0);
    const totalPagado = resultados
        .filter(r => r.tipo === 'pagado')
        .reduce((sum, r) => sum + r.total, 0);
    const invalidos = resultados.filter(r => !r.esValido).length;
    const rifaActual = resultados[0]?.rifa || obtenerRifaSeleccionada().nombre;
    const precioBoletoActual = resultados[0]?.precioBoleto ?? obtenerRifaSeleccionada().precioBoleto;
    const boletosPagados = resultados
        .filter(r => r.tipo === 'pagado')
        .reduce((sum, r) => sum + r.cantidadBoletos, 0);
    const boletosPromocion = resultados
        .filter(r => r.tipo === 'promocion')
        .reduce((sum, r) => sum + r.cantidadBoletos, 0);

    let html = `
        <div style="margin-bottom:14px;padding:10px 14px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-weight:700;text-align:center;">
            🎫 ${escapeHtml(rifaActual)} <span style="font-size:0.85rem;font-weight:600;">(Boleto: $${Number(precioBoletoActual).toFixed(2)})</span>
        </div>
        <div class="stats" style="margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
            <!-- Tarjeta: Total Boletos (MÁS VISIBLE) -->
            <div class="stat-card" style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:18px 16px;border-radius:14px;color:white;text-align:center;box-shadow:0 4px 15px rgba(30,64,175,0.35);">
                <div class="stat-number" style="font-size:2.4rem;font-weight:800;line-height:1.2;">${totalBoletos}</div>
                <div class="stat-label" style="font-size:0.8rem;opacity:0.9;margin-top:2px;font-weight:600;">🎫 Total Boletos</div>
                <div style="font-size:0.65rem;opacity:0.7;margin-top:3px;">📊 ${resultados.length} ventas</div>
            </div>
            
            <!-- Tarjeta: Boletos Pagados -->
            <div class="stat-card" style="background:linear-gradient(135deg,#059669,#10b981);padding:18px 16px;border-radius:14px;color:white;text-align:center;box-shadow:0 4px 15px rgba(5,150,105,0.3);">
                <div class="stat-number" style="font-size:1.8rem;font-weight:700;line-height:1.2;">${boletosPagados}</div>
                <div class="stat-label" style="font-size:0.8rem;opacity:0.9;margin-top:2px;font-weight:600;">💰 Pagados</div>
                <div style="font-size:0.65rem;opacity:0.7;margin-top:3px;">📊 ${totalPagados} ventas</div>
            </div>
            
            <!-- Tarjeta: Boletos Promoción -->
            <div class="stat-card" style="background:linear-gradient(135deg,#f97316,#ea580c);padding:18px 16px;border-radius:14px;color:white;text-align:center;box-shadow:0 4px 15px rgba(249,115,22,0.3);">
                <div class="stat-number" style="font-size:1.8rem;font-weight:700;line-height:1.2;">${boletosPromocion}</div>
                <div class="stat-label" style="font-size:0.8rem;opacity:0.9;margin-top:2px;font-weight:600;">🎁 Promoción</div>
                <div style="font-size:0.65rem;opacity:0.7;margin-top:3px;">📊 ${totalPromocion} ventas</div>
            </div>
            
            <!-- Tarjeta: Total Pagado -->
            <div class="stat-card" style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:18px 16px;border-radius:14px;color:white;text-align:center;box-shadow:0 4px 15px rgba(245,158,11,0.3);">
                <div class="stat-number" style="font-size:1.6rem;font-weight:700;line-height:1.2;">$${totalPagado.toFixed(2)}</div>
                <div class="stat-label" style="font-size:0.8rem;opacity:0.9;margin-top:2px;font-weight:600;">💰 Total Cobrado</div>
                <div style="font-size:0.65rem;opacity:0.7;margin-top:3px;">🎫 ${boletosPagados} boletos</div>
            </div>
            
            <!-- Tarjeta: Inconsistencias (solo si hay) -->
            ${invalidos > 0 ? `
            <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:18px 16px;border-radius:14px;color:white;text-align:center;box-shadow:0 4px 15px rgba(220,38,38,0.3);">
                <div class="stat-number" style="font-size:1.6rem;font-weight:700;line-height:1.2;">${invalidos}</div>
                <div class="stat-label" style="font-size:0.8rem;opacity:0.9;margin-top:2px;font-weight:600;">⚠️ Inconsistencias</div>
                <div style="font-size:0.65rem;opacity:0.7;margin-top:3px;">revisar totales</div>
            </div>
            ` : ''}
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
            <div style="font-size:0.75rem;color:#64748b;">
                💡 Haz clic en los números para verificar (teléfono o boleto) | 📄 Folio abre la venta
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
                <button onclick="abrirBuscadorBoletos()" style="
                    background:linear-gradient(135deg,#f59e0b,#f97316);
                    color:white;border:none;padding:8px 20px;border-radius:8px;
                    font-weight:600;cursor:pointer;
                ">
                    🔍 Buscar Boleto
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

    paginaActual.forEach((item, index) => {
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
        
        // Folio clickeable - abre la venta
        const folioHtml = `<a href="#" onclick="abrirVentaERP(${item.ventaId});return false;" style="color:#1e40af;text-decoration:underline;cursor:pointer;font-weight:600;">📄 #${item.folio}${!item.esValido ? ' ⚠️' : ''}</a>`;
        
        // Teléfono clickeable - abre verificador por teléfono
        const esClickeable1 = telefono !== null && telefono !== undefined;
        const dato1Html = esClickeable1
            ? `<a href="#" onclick="abrirVerificacionEnNuevaPestana('${telefono}', null);return false;" style="color:#2563eb;text-decoration:underline;cursor:pointer;font-weight:500;">${mostrarDato1}</a>`
            : mostrarDato1;
        
        // Boletos clickeables - cada uno abre el verificador
        let dato2Html = '';
        if (boletos.length > 0) {
            if (boletos.length === 1) {
                dato2Html = `<a href="#" onclick="abrirVerificacionEnNuevaPestana(null, '${boletos[0]}');return false;" style="color:#059669;text-decoration:underline;cursor:pointer;font-weight:500;">${mostrarDato2}</a>`;
            } else {
                const boletosHtml = boletos.map(b => 
                    `<a href="#" onclick="abrirVerificacionEnNuevaPestana(null, '${b}');return false;" style="color:#059669;text-decoration:underline;cursor:pointer;font-weight:500;display:inline-block;margin:1px 3px;">${b}</a>`
                ).join(' ');
                dato2Html = boletosHtml;
            }
        } else {
            dato2Html = mostrarDato2;
        }
        
        html += `
            <tr style="border-bottom:1px solid #e2e8f0;background:${bgColor};">
                <td style="padding:8px 8px;text-align:center;">
                    ${folioHtml}
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

    // ==================== PAGINACIÓN ====================
    html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0 8px 0;gap:12px;flex-wrap:wrap;border-top:1px solid #e2e8f0;margin-top:12px;">
            <div style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:#64748b;">
                <span>Mostrando <strong>${inicio + 1}</strong> - <strong>${fin}</strong> de <strong>${totalRegistros}</strong> registros</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:0.75rem;color:#64748b;">Mostrar:</span>
                <select onchange="cambiarTamanoPaginaBoletos(parseInt(this.value))" style="
                    padding:4px 8px;
                    border:1px solid #e2e8f0;
                    border-radius:6px;
                    font-size:0.75rem;
                    background:white;
                    cursor:pointer;
                    outline:none;
                ">
                    <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                    <option value="${totalRegistros}" ${pageSize === totalRegistros ? 'selected' : ''}>Todos</option>
                </select>
                <div style="display:flex;gap:4px;">
                    <button onclick="cambiarPaginaBoletos('anterior')" ${currentPage <= 1 ? 'disabled' : ''} style="
                        padding:6px 12px;
                        border:1px solid #e2e8f0;
                        border-radius:6px;
                        background:${currentPage <= 1 ? '#f1f5f9' : 'white'};
                        color:${currentPage <= 1 ? '#94a3b8' : '#1e293b'};
                        cursor:${currentPage <= 1 ? 'not-allowed' : 'pointer'};
                        font-size:0.75rem;
                        transition:all 0.2s;
                    "
                    onmouseover="if(!this.disabled){this.style.background='#f1f5f9'}"
                    onmouseout="if(!this.disabled){this.style.background='white'}">
                        ◀ Anterior
                    </button>
                    <span style="padding:6px 12px;font-size:0.8rem;font-weight:600;color:#1e40af;">
                        Página ${currentPage} de ${totalPaginas}
                    </span>
                    <button onclick="cambiarPaginaBoletos('siguiente')" ${currentPage >= totalPaginas ? 'disabled' : ''} style="
                        padding:6px 12px;
                        border:1px solid #e2e8f0;
                        border-radius:6px;
                        background:${currentPage >= totalPaginas ? '#f1f5f9' : 'white'};
                        color:${currentPage >= totalPaginas ? '#94a3b8' : '#1e293b'};
                        cursor:${currentPage >= totalPaginas ? 'not-allowed' : 'pointer'};
                        font-size:0.75rem;
                        transition:all 0.2s;
                    "
                    onmouseover="if(!this.disabled){this.style.background='#f1f5f9'}"
                    onmouseout="if(!this.disabled){this.style.background='white'}">
                        Siguiente ▶
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

// ==================== FUNCIÓN PARA ESCAPAR HTML ====================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

    // Guardar datos globalmente para exportación
    window._boletosResumenData = rutasMap;

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
            <div class="modal-footer" style="display: flex; justify-content: space-between; gap: 10px;">
                <button onclick="exportResumenBoletosToExcel()" style="
                    background: linear-gradient(135deg, #059669, #10b981);
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">📊 Exportar Resumen a Excel</button>
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

// ==================== EXPORTAR RESUMEN POR RUTA A EXCEL ====================

function exportResumenBoletosToExcel() {
    const rutasMap = window._boletosResumenData;
    if (!rutasMap || rutasMap.size === 0) {
        alert('⚠️ No hay datos para exportar.');
        return;
    }

    // Construir filas para Excel
    const rows = [
        ['RESUMEN DE BOLETOS POR RUTA'],
        [`Fecha de consulta: ${new Date().toLocaleString()}`],
        [],
        ['RUTA', 'TIENDA', 'ASESOR', 'PROMOCION', 'PAGADOS', 'TOTAL DE BOLETOS', 'TOTAL COBRADO']
    ];

    let totalGeneralPromo = 0;
    let totalGeneralPagados = 0;
    let totalGeneralBoletos = 0;
    let totalGeneralCobrado = 0;

    // Ordenar rutas (Ruta 1, Ruta 2, Ruta 3, Ruta 4, Sin Ruta)
    const orden = ['Ruta 1', 'Ruta 2', 'Ruta 3', 'Ruta 4', 'Sin Ruta'];
    const rutasOrdenadas = Array.from(rutasMap.values())
        .sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre));

    rutasOrdenadas.forEach(ruta => {
        const asesoresArray = Array.from(ruta.asesores.values())
            .sort((a, b) => b.totalBoletos - a.totalBoletos);

        let subtotalPromo = 0;
        let subtotalPagados = 0;
        let subtotalBoletos = 0;
        let subtotalCobrado = 0;

        asesoresArray.forEach(item => {
            const promo = item.boletosPromo || 0;
            const pagados = item.boletosPagados || 0;
            const totalBoletos = item.totalBoletos || 0;
            const totalCobrado = item.totalPagadoPagados || 0; // solo pagados

            rows.push([
                ruta.nombre,
                item.tienda,
                item.asesor,
                promo,
                pagados,
                totalBoletos,
                totalCobrado.toFixed(2)
            ]);

            subtotalPromo += promo;
            subtotalPagados += pagados;
            subtotalBoletos += totalBoletos;
            subtotalCobrado += totalCobrado;
        });

        // Subtotales por ruta
        rows.push([
            `SUBTOTAL ${ruta.nombre}`,
            '',
            '',
            subtotalPromo,
            subtotalPagados,
            subtotalBoletos,
            subtotalCobrado.toFixed(2)
        ]);
        rows.push([]); // línea en blanco

        totalGeneralPromo += subtotalPromo;
        totalGeneralPagados += subtotalPagados;
        totalGeneralBoletos += subtotalBoletos;
        totalGeneralCobrado += subtotalCobrado;
    });

    // Total general
    rows.push(['TOTAL GENERAL', '', '', totalGeneralPromo, totalGeneralPagados, totalGeneralBoletos, totalGeneralCobrado.toFixed(2)]);

    // Generar archivo
    try {
        if (typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [
                { wch: 18 }, // RUTA
                { wch: 20 }, // TIENDA
                { wch: 22 }, // ASESOR
                { wch: 12 }, // PROMOCION
                { wch: 12 }, // PAGADOS
                { wch: 16 }, // TOTAL BOLETOS
                { wch: 16 }  // TOTAL COBRADO
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
            const fileName = `resumen_boletos_ruta_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            alert(`✅ Exportado correctamente: ${fileName}`);
        } else {
            // Fallback a CSV
            let csv = '\uFEFF';
            rows.forEach(row => {
                csv += row.join(',') + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `resumen_boletos_ruta_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('✅ Exportado correctamente en formato CSV');
        }
    } catch (error) {
        console.error('❌ Error exportando resumen:', error);
        alert('❌ Error al exportar: ' + error.message);
    }
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
    const rifaActual = resultados?.[0]?.rifa || obtenerRifaSeleccionada().nombre;
    const precioBoletoActual = resultados?.[0]?.precioBoleto ?? obtenerRifaSeleccionada().precioBoleto;
    
    console.log(`📊 [EXPORT] Iniciando exportación de ${rifaActual} ($${precioBoletoActual} por boleto)...`);
    console.log(`📊 [EXPORT] Total registros: ${resultados?.length || 0}`);
    
    if (!resultados || resultados.length === 0) {
        alert('⚠️ No hay datos para exportar. Primero consulta.');
        return;
    }

    const excelData = [
        ['BOLETOS RIFA - VENTAS ERP'],
        [`Rifa: ${rifaActual}`],
        [`Precio por boleto: $${Number(precioBoletoActual).toFixed(2)}`],
        [`Fecha de consulta: ${new Date().toLocaleString()}`],
        [''],
        ['Venta', 'Rifa', 'Tipo', 'Precio Boleto', 'Boletos', 'Total Pagado', 'Sucursal', 'Vendedor', '# Celular', 'Boleto(s)', 'Fecha']
    ];

    resultados.forEach((item) => {
        excelData.push([
            item.folio || item.ventaId,
            item.rifa || rifaActual,
            item.tipo === 'pagado' ? 'Pagado' : 'Promoción',
            Number(item.precioBoleto ?? precioBoletoActual).toFixed(2),
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
    excelData.push(['Ventas Pagados', totalPagados]);
    excelData.push(['Ventas Promoción', totalPromocion]);
    excelData.push(['Total Ventas', totalVentas]);
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
                { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
                { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 22 }
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Boletos');
            const rifaArchivo = rifaActual.replace(/[^a-z0-9áéíóúñ]+/gi, '_').replace(/^_|_$/g, '');
            const fileName = `boletos_erp_${rifaArchivo}_${new Date().toISOString().split('T')[0]}.xlsx`;
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
            const rifaArchivo = rifaActual.replace(/[^a-z0-9áéíóúñ]+/gi, '_').replace(/^_|_$/g, '');
            a.download = `boletos_erp_${rifaArchivo}_${new Date().toISOString().split('T')[0]}.csv`;
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

    // Crear modal de verificación si no existe
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

    // Crear modal de buscador de boletos si no existe
    if (!document.getElementById('boletosBuscadorModal')) {
        const buscadorModalHTML = `
            <div id="boletosBuscadorModal" class="modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;justify-content:center;align-items:center;overflow-y:auto;padding:20px;">
                <div style="background:white;border-radius:16px;max-width:550px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:modalFadeIn 0.3s ease;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
                        <h3 id="boletosBuscadorTitle" style="margin:0;font-size:1.1rem;color:#1e40af;">🎫 Buscar Boleto</h3>
                        <button onclick="cerrarBuscadorBoletos()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;padding:0 8px;">&times;</button>
                    </div>
                    <div id="boletosBuscadorBody" style="padding:16px 20px;overflow-y:auto;flex:1;">
                        <div style="text-align:center;padding:40px;color:#64748b;">
                            <div style="font-size:3rem;margin-bottom:16px;">🔍</div>
                            <p>Cargando buscador...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', buscadorModalHTML);
    }

    // Crear el selector de rifa
    crearSelectorRifas();

    // Configurar fechas
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

    rifaSeleccionadaId = 'tele';
    const rifaSelect = document.getElementById('boletosRifaSelect');
    if (rifaSelect) rifaSelect.value = rifaSeleccionadaId;

    currentResults = [];
    window._boletosERPData = null;
    window._boletosResumenData = null;
    sortDirection = {};
    currentPage = 1;
    pageSize = 25;

    // Configurar botón de consulta
    const btn = document.getElementById('consultarBoletosBtn');
    if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', consultarBoletosERP);
        console.log('✅ [BOLETOS ERP] Botón configurado');
    }

    // Cerrar modales al hacer clic fuera
    document.addEventListener('click', function(e) {
        const modalVerificacion = document.getElementById('boletosVerificacionModal');
        if (modalVerificacion && e.target === modalVerificacion) {
            cerrarModalVerificacion();
        }
        const modalBuscador = document.getElementById('boletosBuscadorModal');
        if (modalBuscador && e.target === modalBuscador) {
            cerrarBuscadorBoletos();
        }
    });

    console.log('✅ [BOLETOS ERP] Módulo inicializado');
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initBoletosERPModule = initBoletosERPModule;
window.consultarBoletosERP = consultarBoletosERP;
window.cambiarRifaBoletos = cambiarRifaBoletos;
window.agregarFiltrosRifa = agregarFiltrosRifa;
window.exportBoletosERPToExcel = exportBoletosERPToExcel;
window.exportResumenBoletosToExcel = exportResumenBoletosToExcel;
window.ordenarBoletos = ordenarBoletos;
window.cambiarPaginaBoletos = cambiarPaginaBoletos;
window.cambiarTamanoPaginaBoletos = cambiarTamanoPaginaBoletos;
window.abrirBuscadorBoletos = abrirBuscadorBoletos;
window.buscarBoletoModal = buscarBoletoModal;
window.limpiarBuscadorBoletos = limpiarBuscadorBoletos;
window.cerrarBuscadorBoletos = cerrarBuscadorBoletos;
window.mostrarResultadoBusquedaModal = mostrarResultadoBusquedaModal;
window.abrirModalVerificacion = abrirModalVerificacion;
window.abrirVerificacionEnNuevaPestana = abrirVerificacionEnNuevaPestana;
window.cerrarModalVerificacion = cerrarModalVerificacion;
window.abrirVentaERP = abrirVentaERP;
window.openResumenBoletosModal = openResumenBoletosModal;
window.cerrarBoletosResumenModal = cerrarBoletosResumenModal;
window.extraerTelefono = extraerTelefono;
window.extraerNumerosBoleto = extraerNumerosBoleto;
window.extraerTelefonoYBoleto = extraerTelefonoYBoleto;

console.log('✅ Módulo BOLETOS ERP cargado correctamente');