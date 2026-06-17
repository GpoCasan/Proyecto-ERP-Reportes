// ==================== ALERTA DE TRANSFERENCIAS PENDIENTES ====================

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
            // Obtener nombre de la tienda destino
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

        // Mostrar la alerta
        mostrarAlertaTransferencias(tiendas, allTransfers.length);

        alertaTransferenciasCargada = true;

    } catch (error) {
        console.error('❌ Error verificando transferencias:', error);
    }
}

// ==================== MOSTRAR ALERTA ====================

function mostrarAlertaTransferencias(tiendas, totalTransferencias) {
    // Verificar si ya existe la alerta para no duplicar
    const alertaExistente = document.getElementById('alertaTransferenciasContainer');
    if (alertaExistente) {
        alertaExistente.remove();
    }

    // Crear contenedor de la alerta
    const container = document.createElement('div');
    container.id = 'alertaTransferenciasContainer';
    container.style.cssText = `
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-left: 5px solid #f97316;
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 20px;
        box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2);
        animation: slideDown 0.5s ease-out;
        position: relative;
    `;

    // Título de la alerta
    const title = document.createElement('div');
    title.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
    `;
    title.innerHTML = `
        <span style="font-size: 1.8rem;">📦</span>
        <span style="font-weight: 700; font-size: 1.1rem; color: #92400e;">
            ⚠️ ${totalTransferencias} transferencia(s) en tránsito pendientes de recibir
        </span>
        <button id="cerrarAlertaTransferencias" style="
            margin-left: auto;
            background: rgba(0,0,0,0.1);
            border: none;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            font-size: 1.2rem;
            cursor: pointer;
            color: #92400e;
            transition: all 0.2s;
        ">✕</button>
    `;
    container.appendChild(title);

    // Lista de tiendas
    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 8px;
    `;

    tiendas.forEach(tienda => {
        const badge = document.createElement('span');
        badge.style.cssText = `
            background: white;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            color: #1e40af;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            display: inline-flex;
            align-items: center;
            gap: 8px;
        `;
        badge.innerHTML = `
            🏪 ${escapeHtml(tienda.tienda)}
            <span style="
                background: #f97316;
                color: white;
                border-radius: 50%;
                padding: 0 8px;
                font-size: 0.7rem;
                min-width: 20px;
                text-align: center;
            ">${tienda.cantidad}</span>
        `;
        listContainer.appendChild(badge);
    });

    container.appendChild(listContainer);

    // Agregar la alerta después de la barra de usuario
    const userBar = document.getElementById('userInfoBar');
    if (userBar) {
        userBar.parentNode.insertBefore(container, userBar.nextSibling);
    } else {
        // Fallback: agregar al inicio del contenedor
        const containerMain = document.querySelector('.container');
        if (containerMain) {
            containerMain.insertBefore(container, containerMain.firstChild);
        }
    }

    // Evento para cerrar la alerta
    const closeBtn = document.getElementById('cerrarAlertaTransferencias');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            container.style.opacity = '0';
            container.style.transform = 'translateY(-20px)';
            container.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                container.remove();
            }, 300);
        });
    }

    // Agregar estilos para la animación si no existen
    if (!document.querySelector('#alertaTransferenciasStyles')) {
        const style = document.createElement('style');
        style.id = 'alertaTransferenciasStyles';
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// ==================== EJECUTAR AL INICIO ====================

// Ejecutar después del login
function initAlertasTransferencias() {
    // Esperar a que el usuario esté autenticado
    const checkLogin = setInterval(() => {
        const userBar = document.getElementById('userInfoBar');
        if (userBar && userBar.style.display !== 'none') {
            clearInterval(checkLogin);
            console.log('🔐 Usuario autenticado, verificando transferencias...');
            setTimeout(verificarTransferenciasPendientes, 1500);
        }
    }, 500);

    // También ejecutar cuando se cambie de módulo (por si el login fue posterior)
    document.addEventListener('moduleChanged', function() {
        const userBar = document.getElementById('userInfoBar');
        if (userBar && userBar.style.display !== 'none' && !alertaTransferenciasCargada) {
            verificarTransferenciasPendientes();
        }
    });
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initAlertasTransferencias = initAlertasTransferencias;
window.verificarTransferenciasPendientes = verificarTransferenciasPendientes;