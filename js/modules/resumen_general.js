// ==================== MÓDULO: RESUMEN EJECUTIVO ====================
// Archivo: js/modules/resumen_general.js
// Este módulo muestra un banner con el resumen del día anterior y un módulo
// para consultar resúmenes por período (solo visible para admin)

(function() {
    'use strict';

    // ==================== CONSTANTES ====================
    const RESUMEN_CARD_ID = 'resumenGeneralBanner';
    const RESUMEN_VALOR_TOTAL_ID = 'resumenTotalOperaciones';
    const RESUMEN_VALOR_MONTO_ID = 'resumenMontoTotal';
    const RESUMEN_VALOR_TICKET_ID = 'resumenTicketPromedio';
    const RESUMEN_MODULE_ID = 'resumenGeneralModule';

    // ==================== FUNCIONES PRINCIPALES ====================

    /**
     * Obtiene el resumen de un día específico para un tipo de venta
     * @param {string} dateStr - Fecha en formato YYYY-MM-DD
     * @param {string} saleType - Tipo de venta: 'products', 'services', 'credit'
     * @returns {Promise<Object>} - { total: number, monto: number }
     */
    async function obtenerResumenPorTipo(dateStr, saleType) {
        try {
            const range = getDateRangeContado(dateStr);
            if (!range) throw new Error('Error en rango de fechas');

            const url = `${CONFIG.API_SALES}?page=1&per_page=1&total=1&start_date=${range.start}&end_date=${range.end}&sale_type=${saleType}`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });

            if (!response.ok) {
                console.warn(`⚠️ Error consultando ${saleType}: ${response.status}`);
                return { total: 0, monto: 0 };
            }

            const data = await response.json();
            
            const total = data.meta?.total || data.total || 0;
            const monto = parseFloat(data.total) || 0;

            return { total, monto };
        } catch (error) {
            console.error(`Error en obtenerResumenPorTipo (${saleType}):`, error);
            return { total: 0, monto: 0 };
        }
    }

    /**
     * Obtiene el resumen completo del día anterior
     * @returns {Promise<Object>} - { fecha, totalOperaciones, montoTotal, ticketPromedio }
     */
    async function obtenerResumenDiaAnterior() {
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        const dateStr = ayer.toISOString().split('T')[0];
        
        console.log(`📊 [RESUMEN] Consultando día anterior: ${dateStr}`);

        const tipos = ['products', 'services', 'credit'];
        const promesas = tipos.map(tipo => obtenerResumenPorTipo(dateStr, tipo));
        
        const resultados = await Promise.all(promesas);
        
        let totalOperaciones = 0;
        let montoTotal = 0;

        resultados.forEach((r, index) => {
            totalOperaciones += r.total;
            montoTotal += r.monto;
            console.log(`   ${tipos[index]}: ${r.total} transacciones, $${r.monto.toFixed(2)}`);
        });

        const ticketPromedio = totalOperaciones > 0 ? (montoTotal / totalOperaciones) : 0;

        console.log(`📊 [RESUMEN] Total: ${totalOperaciones} operaciones, $${montoTotal.toFixed(2)}, Ticket: $${ticketPromedio.toFixed(2)}`);

        return {
            fecha: dateStr,
            totalOperaciones,
            montoTotal,
            ticketPromedio
        };
    }

    /**
     * Actualiza el banner con el resumen del día anterior
     */
    async function actualizarBannerResumen() {
        const bannerElement = document.getElementById(RESUMEN_CARD_ID);
        if (!bannerElement) return;

        document.getElementById(RESUMEN_VALOR_TOTAL_ID).textContent = '...';
        document.getElementById(RESUMEN_VALOR_MONTO_ID).textContent = '...';
        document.getElementById(RESUMEN_VALOR_TICKET_ID).textContent = '...';

        try {
            const resumen = await obtenerResumenDiaAnterior();

            document.getElementById(RESUMEN_VALOR_TOTAL_ID).textContent = resumen.totalOperaciones.toLocaleString('es-MX');
            document.getElementById(RESUMEN_VALOR_MONTO_ID).textContent = new Intl.NumberFormat('es-MX', { 
                style: 'currency', 
                currency: 'MXN',
                minimumFractionDigits: 2
            }).format(resumen.montoTotal);
            document.getElementById(RESUMEN_VALOR_TICKET_ID).textContent = new Intl.NumberFormat('es-MX', { 
                style: 'currency', 
                currency: 'MXN',
                minimumFractionDigits: 2
            }).format(resumen.ticketPromedio);

            const fechaElement = document.getElementById('resumenFechaDisplay');
            if (fechaElement) {
                fechaElement.textContent = formatDate(resumen.fecha);
            }

        } catch (error) {
            console.error('❌ Error actualizando banner:', error);
            document.getElementById(RESUMEN_VALOR_TOTAL_ID).textContent = 'Error';
            document.getElementById(RESUMEN_VALOR_MONTO_ID).textContent = 'Error';
            document.getElementById(RESUMEN_VALOR_TICKET_ID).textContent = 'Error';
        }
    }

    // ==================== MÓDULO DE CONSULTA POR PERÍODO ====================

    /**
     * Obtiene el resumen para un período y tipo específico
     */
    async function obtenerResumenPeriodo(startDate, endDate, saleType) {
        try {
            const rangeStart = getDateRangeContado(startDate);
            const rangeEnd = getDateRangeContado(endDate);
            
            if (!rangeStart || !rangeEnd) throw new Error('Error en rango de fechas');

            const startDateTime = rangeStart.start;
            const endDateTime = rangeEnd.end;

            console.log(`📊 [PERIODO] ${saleType} | ${startDateTime} → ${endDateTime}`);

            const tipos = ['products', 'services', 'credit'];
            const tiposAConsultar = saleType === 'all' ? tipos : [saleType];
            
            const resultados = {};
            let totalGeneral = 0;
            let montoGeneral = 0;

            for (const tipo of tiposAConsultar) {
                const url = `${CONFIG.API_SALES}?page=1&per_page=1&total=1&start_date=${startDateTime}&end_date=${endDateTime}&sale_type=${tipo}`;
                
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
                });

                if (!response.ok) {
                    console.warn(`⚠️ Error consultando ${tipo}: ${response.status}`);
                    resultados[tipo] = { total: 0, monto: 0 };
                    continue;
                }

                const data = await response.json();
                const total = data.meta?.total || data.total || 0;
                const monto = parseFloat(data.total) || 0;
                
                resultados[tipo] = { total, monto };
                totalGeneral += total;
                montoGeneral += monto;
            }

            const ticketPromedioGeneral = totalGeneral > 0 ? (montoGeneral / totalGeneral) : 0;

            for (const tipo of tiposAConsultar) {
                const data = resultados[tipo];
                data.ticketPromedio = data.total > 0 ? (data.monto / data.total) : 0;
            }

            return {
                totalGeneral,
                montoGeneral,
                ticketPromedioGeneral,
                porTipo: resultados,
                tiposConsultados: tiposAConsultar,
                fechaInicio: startDate,
                fechaFin: endDate
            };

        } catch (error) {
            console.error('Error en obtenerResumenPeriodo:', error);
            throw error;
        }
    }

    /**
     * Renderiza las tarjetas de estadísticas
     */
    function renderizarTarjetasResumen(result, saleType) {
        const tipoLabels = {
            'products': '📱 Contado',
            'services': '💰 Servicios',
            'credit': '💳 Crédito'
        };

        const colores = {
            'products': { bg: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', icon: '📱' },
            'services': { bg: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', icon: '💰' },
            'credit': { bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', icon: '💳' }
        };

        let html = '';

        if (saleType === 'all') {
            const tipos = ['products', 'services', 'credit'];
            for (const tipo of tipos) {
                const data = result.porTipo[tipo] || { total: 0, monto: 0, ticketPromedio: 0 };
                const color = colores[tipo] || { bg: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' };
                const label = tipoLabels[tipo] || tipo;

                html += `
                    <div class="stat-card" style="background: ${color.bg};">
                        <div class="stat-number" style="font-size: 1.2rem;">${data.total.toLocaleString('es-MX')}</div>
                        <div class="stat-label">${label} - Operaciones</div>
                        <div style="font-size: 0.8rem; margin-top: 4px; opacity: 0.9;">
                            ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(data.monto)}
                        </div>
                        <div style="font-size: 0.7rem; margin-top: 2px; opacity: 0.8;">
                            🎫 ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(data.ticketPromedio)}
                        </div>
                    </div>
                `;
            }

            html += `
                <div class="stat-card" style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
                    <div class="stat-number" style="font-size: 1.8rem;">${result.totalGeneral.toLocaleString('es-MX')}</div>
                    <div class="stat-label">📊 TOTAL OPERACIONES</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number" style="font-size: 1.5rem;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(result.montoGeneral)}</div>
                    <div class="stat-label">💰 MONTO TOTAL</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);">
                    <div class="stat-number" style="font-size: 1.5rem;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(result.ticketPromedioGeneral)}</div>
                    <div class="stat-label">🎫 TICKET PROMEDIO</div>
                </div>
            `;

        } else {
            const data = result.porTipo[saleType] || { total: 0, monto: 0, ticketPromedio: 0 };
            const color = colores[saleType] || { bg: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' };
            const label = tipoLabels[saleType] || saleType;

            html += `
                <div class="stat-card" style="background: ${color.bg};">
                    <div class="stat-number">${data.total.toLocaleString('es-MX')}</div>
                    <div class="stat-label">${label} - Operaciones</div>
                    <div style="font-size: 0.9rem; margin-top: 4px; opacity: 0.9;">
                        💰 ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(data.monto)}
                    </div>
                    <div style="font-size: 0.8rem; margin-top: 2px; opacity: 0.8;">
                        🎫 ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(data.ticketPromedio)}
                    </div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
                    <div class="stat-number" style="font-size: 1.8rem;">${data.total.toLocaleString('es-MX')}</div>
                    <div class="stat-label">📊 TOTAL OPERACIONES</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number" style="font-size: 1.5rem;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(data.monto)}</div>
                    <div class="stat-label">💰 MONTO TOTAL</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);">
                    <div class="stat-number" style="font-size: 1.5rem;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(data.ticketPromedio)}</div>
                    <div class="stat-label">🎫 TICKET PROMEDIO</div>
                </div>
            `;
        }

        return html;
    }

    /**
     * Función principal para consultar el resumen por período
     */
    async function consultarResumenPeriodo() {
        const startDate = document.getElementById('resumenStartDate').value;
        const endDate = document.getElementById('resumenEndDate').value;
        const saleType = document.getElementById('resumenTipoSelect').value;

        if (!startDate || !endDate) {
            showError('resumenGeneral', 'Selecciona un rango de fechas');
            return;
        }

        if (new Date(startDate) > new Date(endDate)) {
            showError('resumenGeneral', 'La fecha de inicio debe ser menor o igual a la fecha de fin');
            return;
        }

        const btn = document.getElementById('consultarResumenBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
        btn.disabled = true;

        document.getElementById('resumenErrorAlert').style.display = 'none';
        document.getElementById('resumenInfoAlert').style.display = 'none';
        document.getElementById('resumenResults').style.display = 'none';

        try {
            const result = await obtenerResumenPeriodo(startDate, endDate, saleType);

            const tipoLabels = {
                'all': 'Todos los tipos',
                'products': 'Contado',
                'services': 'Servicios',
                'credit': 'Crédito'
            };
            const tipoLabel = tipoLabels[saleType] || saleType;

            const tarjetasHtml = renderizarTarjetasResumen(result, saleType);

            let gridColumns = 'repeat(3, 1fr)';
            if (saleType === 'all') {
                gridColumns = 'repeat(3, 1fr)';
            }

            const html = `
                <div style="display: grid; grid-template-columns: ${gridColumns}; gap: 16px; margin-bottom: 16px;">
                    ${tarjetasHtml}
                </div>
                <div class="alert alert-info" style="margin-top: 8px;">
                    📅 Período: ${formatDate(startDate)} - ${formatDate(endDate)} | ${tipoLabel}
                    ${saleType === 'all' ? ' | 📊 Resumen consolidado de todas las ventas' : ''}
                </div>
            `;

            const resultsContainer = document.getElementById('resumenResults');
            resultsContainer.innerHTML = html;
            resultsContainer.style.display = 'block';

            if (result.totalGeneral === 0) {
                showInfo('resumenGeneral', `⚠️ No se encontraron ${tipoLabel} en el período seleccionado`, true);
            } else {
                const totalMsg = saleType === 'all' ? 
                    `${result.totalGeneral} transacciones - Total: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(result.montoGeneral)}` :
                    `${result.porTipo[saleType]?.total || 0} transacciones - Total: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(result.porTipo[saleType]?.monto || 0)}`;
                showInfo('resumenGeneral', `✅ ${totalMsg}`, false);
            }

        } catch (error) {
            console.error('❌ Error:', error);
            showError('resumenGeneral', `Error: ${error.message}`);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // ==================== INICIALIZACIÓN DEL MÓDULO ====================

    /**
     * Inicializa el módulo de resumen general
     */
    function initResumenGeneralModule() {
        console.log('📊 [RESUMEN EJECUTIVO] Inicializando módulo...');

        // Configurar fechas por defecto para el módulo (últimos 30 días)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const formatDateInput = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const startInput = document.getElementById('resumenStartDate');
        const endInput = document.getElementById('resumenEndDate');
        
        if (startInput) startInput.value = formatDateInput(startDate);
        if (endInput) endInput.value = formatDateInput(endDate);

        // Configurar botón de consulta
        const consultarBtn = document.getElementById('consultarResumenBtn');
        if (consultarBtn) {
            const newBtn = consultarBtn.cloneNode(true);
            consultarBtn.parentNode.replaceChild(newBtn, consultarBtn);
            newBtn.addEventListener('click', consultarResumenPeriodo);
        }

        console.log('✅ [RESUMEN EJECUTIVO] Módulo inicializado');
    }

    // ==================== CONTROL DE VISIBILIDAD ====================

    /**
     * Muestra u oculta el banner y el módulo según el rol del usuario
     * @param {Object} user - Objeto del usuario autenticado
     */
    function mostrarResumenSegunRol(user) {
        const banner = document.getElementById(RESUMEN_CARD_ID);
        const moduleNav = document.querySelector(`.nav-card[data-module="${RESUMEN_MODULE_ID}"]`);

        if (user && user.role === 'admin') {
            // Mostrar banner
            if (banner) {
                banner.style.display = 'flex';
                // Actualizar datos automáticamente
                actualizarBannerResumen();
            }
            // Mostrar módulo en navegación (la tarjeta)
            if (moduleNav) {
                moduleNav.style.display = 'block';
            }
            // NO tocar el display del contenido del módulo aquí
            // Eso lo maneja switchModule cuando se hace clic en la tarjeta
        } else {
            // Ocultar todo para no administradores
            if (banner) banner.style.display = 'none';
            if (moduleNav) moduleNav.style.display = 'none';
            
            // También ocultar el contenido del módulo si no es admin
            const moduleContent = document.getElementById(RESUMEN_MODULE_ID);
            if (moduleContent) {
                moduleContent.style.display = 'none';
                moduleContent.classList.remove('active-module');
            }
        }
    }

    // ==================== HOOKS DE AUTENTICACIÓN ====================

    /**
     * Inyecta los hooks necesarios en el flujo de autenticación
     */
    function initResumenGeneralHooks() {
        console.log('📊 [RESUMEN EJECUTIVO] Inyectando hooks...');

        // 1. Hook en updateUIForUser
        const originalUpdateUI = window.updateUIForUser;
        if (typeof originalUpdateUI === 'function') {
            window.updateUIForUser = function(user) {
                originalUpdateUI(user);
                mostrarResumenSegunRol(user);
            };
        } else {
            window.updateUIForUser = function(user) {
                mostrarResumenSegunRol(user);
            };
        }

        // 2. Hook en checkExistingSession
        const originalCheckSession = window.checkExistingSession;
        if (typeof originalCheckSession === 'function') {
            window.checkExistingSession = function() {
                const result = originalCheckSession();
                const user = sessionStorage.getItem('servicel_user') 
                    ? JSON.parse(sessionStorage.getItem('servicel_user')) 
                    : null;
                mostrarResumenSegunRol(user);
                return result;
            };
        }

        // 3. Hook en logout
        const originalLogout = window.logout;
        if (typeof originalLogout === 'function') {
            window.logout = function() {
                originalLogout();
                const banner = document.getElementById(RESUMEN_CARD_ID);
                if (banner) banner.style.display = 'none';
                const moduleNav = document.querySelector(`.nav-card[data-module="${RESUMEN_MODULE_ID}"]`);
                if (moduleNav) moduleNav.style.display = 'none';
                const moduleContent = document.getElementById(RESUMEN_MODULE_ID);
                if (moduleContent) {
                    moduleContent.style.display = 'none';
                    moduleContent.classList.remove('active-module');
                }
            };
        }

        // 4. Evento para cuando se cambia de módulo
        document.addEventListener('moduleChanged', function(e) {
            const user = sessionStorage.getItem('servicel_user') 
                ? JSON.parse(sessionStorage.getItem('servicel_user')) 
                : null;
            
            if (user && user.role === 'admin') {
                const module = document.getElementById(RESUMEN_MODULE_ID);
                if (module && module.classList.contains('active-module')) {
                    initResumenGeneralModule();
                }
            }
        });

        // 5. Verificar sesión inicial
        const user = sessionStorage.getItem('servicel_user') 
            ? JSON.parse(sessionStorage.getItem('servicel_user')) 
            : null;
        if (user) {
            mostrarResumenSegunRol(user);
        }

        console.log('✅ [RESUMEN EJECUTIVO] Hooks inyectados correctamente');
    }

    // ==================== EXPORTAR FUNCIONES GLOBALES ====================
    window.initResumenGeneralModule = initResumenGeneralModule;
    window.consultarResumenPeriodo = consultarResumenPeriodo;
    window.actualizarBannerResumen = actualizarBannerResumen;

    // ==================== AUTOINICIALIZACIÓN ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initResumenGeneralHooks);
    } else {
        setTimeout(initResumenGeneralHooks, 100);
    }

    console.log('📊 [RESUMEN EJECUTIVO] Módulo cargado correctamente');
})();