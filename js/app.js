// ==================== APLICACIÓN PRINCIPAL ====================

function switchModule(moduleName) {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('active-module'));
    const targetModule = document.getElementById(`${moduleName}Module`);
    if (targetModule) {
        targetModule.classList.add('active-module');
    }
    document.querySelectorAll('.nav-card').forEach(c => c.classList.remove('active'));
    const activeCard = document.querySelector(`.nav-card[data-module="${moduleName}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
    }
    
    // Disparar evento personalizado para la alerta de transferencias
    const event = new CustomEvent('moduleChanged', { detail: { module: moduleName } });
    document.dispatchEvent(event);
}

// Inicializar eventos de navegación
function initEventListeners() {
    const btnAllLines = document.getElementById('btnAllLines');
    if (btnAllLines) btnAllLines.addEventListener('click', generateSalesReportAllLines);
    
    const searchCreditoBtn = document.getElementById('searchCreditoBtn');
    if (searchCreditoBtn) searchCreditoBtn.addEventListener('click', searchPayJoy);
    
    const btnCreditoNuevo = document.getElementById('btnCreditoNuevo');
    if (btnCreditoNuevo) btnCreditoNuevo.addEventListener('click', generateCreditReport);
    
    const searchAccesoriosBtn = document.getElementById('searchAccesoriosBtn');
    if (searchAccesoriosBtn) searchAccesoriosBtn.addEventListener('click', searchAccesorios);
    
    const searchTaeBtn = document.getElementById('searchTaeBtn');
    if (searchTaeBtn) searchTaeBtn.addEventListener('click', searchTaeVentas);
    
    const searchTransferBtn = document.getElementById('searchTransferBtn');
    if (searchTransferBtn) searchTransferBtn.addEventListener('click', searchTransfer);
    
    const searchServiciosBtn = document.getElementById('searchServiciosBtn');
    if (searchServiciosBtn) searchServiciosBtn.addEventListener('click', searchServicios);
    
    const searchSimExpressBtn = document.getElementById('searchSimExpressBtn');
    if (searchSimExpressBtn) searchSimExpressBtn.addEventListener('click', searchSimExpress);
    
    const searchExistenciasBtn = document.getElementById('searchExistenciasBtn');
    if (searchExistenciasBtn) searchExistenciasBtn.addEventListener('click', searchExistencias);
    
    const searchVentasTotalesBtn = document.getElementById('searchVentasTotalesBtn');
    if (searchVentasTotalesBtn) searchVentasTotalesBtn.addEventListener('click', searchVentasTotales);
    
    const searchIngresosBtn = document.getElementById('searchIngresosBtn');
    if (searchIngresosBtn) searchIngresosBtn.addEventListener('click', searchIngresos);
    
    const searchComprasBtn = document.getElementById('searchComprasBtn');
    if (searchComprasBtn) searchComprasBtn.addEventListener('click', searchCompras);
}

// Establecer fechas por defecto
function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const contadoDate = document.getElementById('contadoDate');
    if (contadoDate) contadoDate.value = today;
    
    const creditoDate = document.getElementById('creditoDate');
    if (creditoDate) creditoDate.value = today;
    
    const creditoNuevoDate = document.getElementById('creditoNuevoDate');
    if (creditoNuevoDate) creditoNuevoDate.value = today;
    
    const accesoriosDate = document.getElementById('accesoriosDate');
    if (accesoriosDate) accesoriosDate.value = today;
    
    const taeDate = document.getElementById('taeDate');
    if (taeDate) taeDate.value = today;
    
    const serviciosDate = document.getElementById('serviciosDate');
    if (serviciosDate) serviciosDate.value = today;
    
    const simexpressDate = document.getElementById('simexpressDate');
    if (simexpressDate) simexpressDate.value = today;
    
    const existenciasDate = document.getElementById('existenciasDate');
    if (existenciasDate) existenciasDate.value = today;
    
    const ventasTotalesEndDate = document.getElementById('ventasTotalesEndDate');
    if (ventasTotalesEndDate) ventasTotalesEndDate.value = today;
    
    // Fechas para transferencias (últimos 30 días)
    const endDateTransfer = new Date();
    const startDateTransfer = new Date();
    startDateTransfer.setDate(startDateTransfer.getDate() - 30);
    const startDateTransferEl = document.getElementById('startDateTransfer');
    if (startDateTransferEl) {
        startDateTransferEl.value = startDateTransfer.toISOString().split('T')[0];
    }
    const endDateTransferEl = document.getElementById('endDateTransfer');
    if (endDateTransferEl) {
        endDateTransferEl.value = endDateTransfer.toISOString().split('T')[0];
    }
    
    // Fechas para compras (últimos 30 días)
    const comprasStartDate = document.getElementById('comprasStartDate');
    const comprasEndDate = document.getElementById('comprasEndDate');
    if (comprasStartDate) {
        comprasStartDate.value = startDateTransfer.toISOString().split('T')[0];
    }
    if (comprasEndDate) {
        comprasEndDate.value = endDateTransfer.toISOString().split('T')[0];
    }
    
    // Fechas por defecto para el módulo de Ingresos (últimos 4 días)
    const ingresosEndDate = new Date();
    const ingresosStartDate = new Date();
    ingresosStartDate.setDate(ingresosStartDate.getDate() - 3);
    const ingresosStartDateEl = document.getElementById('ingresosStartDate');
    if (ingresosStartDateEl) {
        ingresosStartDateEl.value = ingresosStartDate.toISOString().split('T')[0];
    }
    const ingresosEndDateEl = document.getElementById('ingresosEndDate');
    if (ingresosEndDateEl) {
        ingresosEndDateEl.value = ingresosEndDate.toISOString().split('T')[0];
    }
}

// Inicializar navegación de tarjetas
function initNavigation() {
    document.querySelectorAll('.nav-card').forEach(card => {
        card.addEventListener('click', () => {
            const moduleName = card.getAttribute('data-module');
            switchModule(moduleName);
            
            // Inicializar módulos específicos si es necesario
            if (moduleName === 'inventario' && typeof initInventarioModule === 'function' && typeof productosCargados !== 'undefined' && !productosCargados) {
                initInventarioModule();
            }
            if (moduleName === 'compras' && typeof initComprasModule === 'function') {
                initComprasModule();
            }
            if (moduleName === 'facturas' && typeof initFacturasModule === 'function') {
                setTimeout(initFacturasModule, 100);
            }
            if (moduleName === 'transferencias_pendientes' && typeof initTransferenciasPendientesModule === 'function') {
                setTimeout(initTransferenciasPendientesModule, 100);
            }
        });
    });
}

// Event listeners para sucursales de transferencias
function initBranchListeners() {
    const branchOriginSelect = document.getElementById('branchOriginSelect');
    if (branchOriginSelect && typeof onBranchOriginChange === 'function') {
        branchOriginSelect.addEventListener('change', onBranchOriginChange);
    }
    
    const branchDestinySelect = document.getElementById('branchDestinySelect');
    if (branchDestinySelect && typeof onBranchDestinyChange === 'function') {
        branchDestinySelect.addEventListener('change', onBranchDestinyChange);
    }
}

// Inicializar pestañas de transferencias
function initTabs() {
    if (typeof initTransferenciasTabs === 'function') {
        initTransferenciasTabs();
    }
}

// ==================== INICIALIZAR BÚSQUEDA DE VENTA ====================
function initSaleSearchEvents() {
    const openBtn = document.getElementById('openSaleSearchBtn');
    const confirmBtn = document.getElementById('confirmSaleSearchBtn');
    const saleInput = document.getElementById('saleNumberInput');
    
    if (openBtn) {
        openBtn.addEventListener('click', openSaleSearchModal);
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', openSaleByNumber);
    }
    
    // Cerrar modal al hacer clic fuera
    const modal = document.getElementById('saleSearchModal');
    if (modal) {
        window.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeSaleSearchModal();
            }
        });
    }
    
    // Permitir Enter en el input
    if (saleInput) {
        saleInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                openSaleByNumber();
            }
        });
    }
}

// ==================== INICIALIZAR MÓDULO DE COMPRAS ====================
function initComprasIfNeeded() {
    // Verificar si el módulo de compras está visible y no se ha inicializado
    const comprasModule = document.getElementById('comprasModule');
    if (comprasModule && comprasModule.classList.contains('active-module')) {
        if (typeof initComprasModule === 'function') {
            initComprasModule();
        }
    }
}

// ==================== INICIALIZAR MÓDULO DE FACTURAS ====================
function initFacturasIfNeeded() {
    // Verificar si el módulo de facturas está visible y no se ha inicializado
    const facturasModule = document.getElementById('facturasModule');
    if (facturasModule && facturasModule.classList.contains('active-module')) {
        if (typeof initFacturasModule === 'function') {
            setTimeout(initFacturasModule, 100);
        }
    }
}

// ==================== INICIALIZAR MÓDULO DE TRANSFERENCIAS PENDIENTES ====================
function initTransferenciasPendientesIfNeeded() {
    const module = document.getElementById('transferencias_pendientesModule');
    if (module && module.classList.contains('active-module')) {
        if (typeof initTransferenciasPendientesModule === 'function') {
            setTimeout(initTransferenciasPendientesModule, 100);
        }
    }
}

// ==================== INICIALIZAR ALERTA DE TRANSFERENCIAS ====================
function initAlertasTransferencias() {
    // Esperar a que el usuario esté autenticado
    const checkLogin = setInterval(() => {
        const userBar = document.getElementById('userInfoBar');
        if (userBar && userBar.style.display !== 'none') {
            clearInterval(checkLogin);
            console.log('🔐 Usuario autenticado, verificando transferencias...');
            setTimeout(() => {
                if (typeof verificarTransferenciasPendientes === 'function') {
                    verificarTransferenciasPendientes();
                }
            }, 1500);
        }
    }, 500);

    // También ejecutar cuando se cambie de módulo (por si el login fue posterior)
    document.addEventListener('moduleChanged', function() {
        const userBar = document.getElementById('userInfoBar');
        if (userBar && userBar.style.display !== 'none') {
            if (typeof verificarTransferenciasPendientes === 'function') {
                // Verificar si ya se cargó la alerta para no duplicar
                const alertaExistente = document.getElementById('alertaTransferenciasContainer');
                if (!alertaExistente) {
                    verificarTransferenciasPendientes();
                }
            }
        }
    });
}

// Ejecutar inicialización después de que el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar autenticación primero
    if (typeof initAuth === 'function') {
        initAuth();
    }
    // Botón para abrir modal de transferencias pendientes
        const openTransferenciasBtn = document.getElementById('openTransferenciasBtn');
        if (openTransferenciasBtn) {
            openTransferenciasBtn.addEventListener('click', function() {
                if (typeof abrirModalTransferencias === 'function') {
                    abrirModalTransferencias();
                } else {
                    console.warn('⚠️ La función abrirModalTransferencias no está disponible');
                }
            });
        }
    
    // Configurar el resto de eventos
    initEventListeners();
    setDefaultDates();
    initNavigation();
    initBranchListeners();
    initTabs();
    initSaleSearchEvents();
    
    // Inicializar módulo de compras si es necesario (por si está activo por defecto)
    initComprasIfNeeded();
    
    // Inicializar módulo de facturas si es necesario
    initFacturasIfNeeded();
    
    // Inicializar módulo de transferencias pendientes si es necesario
    initTransferenciasPendientesIfNeeded();
    
    // Inicializar alerta de transferencias pendientes
    if (typeof initAlertasTransferencias === 'function') {
        initAlertasTransferencias();
    }
    
    // Configurar el botón de limpiar en inventario si existe
    const clearProductBtn = document.getElementById('clearProductBtn');
    if (clearProductBtn && typeof clearSelectedProduct === 'function') {
        clearProductBtn.addEventListener('click', clearSelectedProduct);
    }
});