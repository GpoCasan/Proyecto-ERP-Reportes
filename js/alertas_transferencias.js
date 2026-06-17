// ==================== ALERTA DE TRANSFERENCIAS PENDIENTES (MODAL) ====================

// Variable para evitar múltiples ejecuciones
let alertaTransferenciasCargada = false;

// ==================== FUNCIÓN PRINCIPAL ====================

async function verificarTransferenciasPendientes() {
    // Evitar ejecuciones duplicadas
    if (alertaTransferenciasCargada) {
        console.log('⏳ Alerta de transferencias ya verificada');
        return;
    }

    console.log('📦 Verificando transferencias pendientes...');

    try {
        // Obtener todas las transferencias en tránsito
        let allTransfers = [];
        let currentPage = 1;
        let lastPage = 1;

        do {
            const url = `${CONFIG.API_TRANSFERS}?page=${currentPage}&per_page=100&status=En+tr%C3%A1nsito`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });

            if (!response.ok) {
                console.warn(`⚠️ Error al consultar transferencias: ${response.status}`);
                return;
            }

            const data = await response.json();
            const transfers = data.data || [];

            if (currentPage === 1) {
                lastPage = data.last_page || data.meta?.last_page || 1;
            }

            allTransfers.push(...transfers);
            currentPage++;

            await new Promise(resolve => setTimeout(resolve, 200));

        } while (currentPage <= lastPage);

        console.log(`✅ ${allTransfers.length} transferencias en tránsito encontradas`);

        if (allTransfers.length === 0) {
            console.log('✅ No hay transferencias pendientes');
            return;
        }

        // Agrupar por tienda destino
        const tiendasMap = new Map();

        allTransfers.forEach(transfer => {
            let tiendaNombre = 'Sin tienda asignada';
            if (transfer.target_warehouse?.branch?.name) {
                tiendaNombre = transfer.target_warehouse.branch.name;
            } else if (transfer.target_warehouse?.name) {
                tiendaNombre = transfer.target_warehouse.name;
            }

            if (!tiendasMap.has(tiendaNombre)) {
                tiendasMap.set(tiendaNombre, {
                    tienda: tiendaNombre,
                    cantidad: 0,
                    transferencias: []
                });
            }

            const tienda = tiendasMap.get(tiendaNombre);
            tienda.cantidad++;
            tienda.transferencias.push(transfer);
        });

        // Convertir a array y ordenar por cantidad (mayor a menor)
        const tiendas = Array.from(tiendasMap.values())
            .sort((a, b) => b.cantidad - a.cantidad);

        // Mostrar el modal
        mostrarModalTransferencias(tiendas, allTransfers.length);

        alertaTransferenciasCargada = true;

    } catch (error) {
        console.error('❌ Error verificando transferencias:', error);
    }
}

// ==================== MOSTRAR MODAL ====================

function mostrarModalTransferencias(tiendas, totalTransferencias) {
    // Verificar si ya existe el modal para no duplicar
    const modalExistente = document.getElementById('modalTransferenciasPendientes');
    if (modalExistente) {
        modalExistente.remove();
    }

    // Crear el modal
    const modal = document.createElement('div');
    modal.id = 'modalTransferenciasPendientes';
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex !important;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;

    // Contenido del modal
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; animation: modalFadeIn 0.3s ease-out;">
            <div class="modal-header" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.8rem;">📦</span>
                    <span>Transferencias Pendientes de Recibir</span>
                </h3>
                <span class="close-modal" id="cerrarModalTransferencias" style="font-size: 32px; cursor: pointer;">&times;</span>
            </div>
            <div class="modal-body" style="padding: 24px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 2.5rem; font-weight: 800; color: #ea580c;">
                        ${totalTransferencias}
                    </div>
                    <div style="font-size: 0.9rem; color: #64748b;">
                        transferencia(s) en tránsito pendientes de recibir
                    </div>
                </div>

                <div style="border-top: 2px solid #fef3c7; padding-top: 16px; margin-top: 8px;">
                    <div style="font-weight: 600; color: #1e40af; margin-bottom: 12px; font-size: 0.9rem;">
                        🏪 Tiendas con transferencias pendientes:
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${tiendas.map(tienda => `
                            <div style="
                                background: #f8fafc;
                                border: 1px solid #e2e8f0;
                                border-radius: 10px;
                                padding: 10px 16px;
                                display: flex;
                                align-items: center;
                                gap: 10px;
                                flex: 1 1 calc(50% - 10px);
                                min-width: 150px;
                            ">
                                <span style="font-size: 1.2rem;">🏪</span>
                                <span style="font-weight: 500; color: #1e293b; flex: 1;">${escapeHtml(tienda.tienda)}</span>
                                <span style="
                                    background: #f97316;
                                    color: white;
                                    border-radius: 50%;
                                    padding: 2px 10px;
                                    font-size: 0.8rem;
                                    font-weight: 700;
                                    min-width: 24px;
                                    text-align: center;
                                ">${tienda.cantidad}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f97316;">
                    <div style="font-size: 0.8rem; color: #92400e;">
                        ⚠️ Estas transferencias ya fueron enviadas desde el almacén origen y están en camino. 
                        Por favor, verifica su recepción en las tiendas correspondientes.
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="btnVerTransferenciasPendientes" style="
                    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    📋 Ver Detalle
                </button>
                <button id="btnCerrarModalTransferencias" style="
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

    // Evento para cerrar con la X
    document.getElementById('cerrarModalTransferencias').addEventListener('click', function() {
        cerrarModalTransferencias();
    });

    // Evento para cerrar con el botón
    document.getElementById('btnCerrarModalTransferencias').addEventListener('click', function() {
        cerrarModalTransferencias();
    });

    // Evento para ver detalle (abre el módulo de transferencias pendientes)
    document.getElementById('btnVerTransferenciasPendientes').addEventListener('click', function() {
        cerrarModalTransferencias();
        // Cambiar al módulo de transferencias pendientes si existe
        const navCard = document.querySelector('.nav-card[data-module="transferencias_pendientes"]');
        if (navCard) {
            navCard.click();
        } else {
            // Si no existe el módulo, mostrar mensaje
            alert('El módulo de transferencias pendientes no está disponible.');
        }
    });

    // Cerrar al hacer clic fuera del modal
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarModalTransferencias();
        }
    });
}

// ==================== CERRAR MODAL ====================

function cerrarModalTransferencias() {
    const modal = document.getElementById('modalTransferenciasPendientes');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// ==================== EJECUTAR AL INICIO ====================

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
            }, 2000);
        }
    }, 500);

    // También ejecutar cuando se cambie de módulo (por si el login fue posterior)
    document.addEventListener('moduleChanged', function() {
        const userBar = document.getElementById('userInfoBar');
        if (userBar && userBar.style.display !== 'none' && !alertaTransferenciasCargada) {
            if (typeof verificarTransferenciasPendientes === 'function') {
                verificarTransferenciasPendientes();
            }
        }
    });
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initAlertasTransferencias = initAlertasTransferencias;
window.verificarTransferenciasPendientes = verificarTransferenciasPendientes;
window.cerrarModalTransferencias = cerrarModalTransferencias;