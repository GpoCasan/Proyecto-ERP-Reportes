// ==================== ALERTA DE TRANSFERENCIAS PENDIENTES (MODAL CON PESTAÑAS POR ALMACÉN) ====================

// Variable para evitar múltiples ejecuciones automáticas
let alertaTransferenciasCargada = false;
let alertaTransferenciasInicializada = false;
// Variable para almacenar los datos de las transferencias
let cachedTransferenciasData = null;

// NOTA: RUTAS_CONFIG y ALMACEN_GENERAL_KEYWORDS ahora vienen de config.js
// No es necesario redeclararlas aquí

// ==================== FUNCIÓN PRINCIPAL ====================

async function verificarTransferenciasPendientes(forzar = false) {
    // Si se fuerza o no hay datos en caché, consultar nuevamente
    if (!forzar && alertaTransferenciasCargada && cachedTransferenciasData) {
        console.log('📦 Mostrando datos en caché...');
        mostrarModalTransferencias(cachedTransferenciasData);
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
            mostrarSinTransferencias();
            return;
        }

        // Obtener las rutas desde RUTAS_CONFIG (config.js)
        // Si por alguna razón no está disponible, usar un fallback
        const rutasConfig = typeof RUTAS_CONFIG !== 'undefined' ? RUTAS_CONFIG : {
            "Ruta 1": { sucursales: ["Calkini", "Halacho", "Hecelchakan", "Hunucma", "Muna", "Tenabo", "Ticul 2", "Uman"], color: "#3b82f6" },
            "Ruta 2": { sucursales: ["Acanceh", "Chemax", "Chemax 2", "Hoctun", "Homun", "Huhi", "Kanasin", "Piste 2", "Sotuta", "Seye", "Valladolid Waldos", "Xocchel"], color: "#059669" },
            "Ruta 3": { sucursales: ["Baca", "Buctzotz", "Conkal", "Izamal", "Motul Mercado", "Dzidzantun", "Temax", "Tixkokob", "Tizimin", "Tizimin 2"], color: "#dc2626" },
            "Ruta 4": { sucursales: ["Dziuche", "Morelos", "Oxkutzcab 2", "Oxkutzcab 3", "Peto 2", "Teabo", "Tecoh", "Tekax", "Tekax 2", "Tekit", "Tzucacab"], color: "#f97316" }
        };

        // Función para obtener la ruta de una tienda
        function obtenerRutaDeTienda(tiendaNombre) {
            for (const [rutaNombre, rutaData] of Object.entries(rutasConfig)) {
                if (rutaData.sucursales.some(s => s.toLowerCase() === tiendaNombre.toLowerCase())) {
                    return { nombre: rutaNombre, color: rutaData.color };
                }
            }
            return null;
        }

        // Clasificar por almacén origen
        const almacenesMap = new Map();

        allTransfers.forEach(transfer => {
            // Obtener nombre del almacén origen
            let almacenOrigen = 'Otros';
            if (transfer.origin_warehouse?.name) {
                const nombreAlmacen = transfer.origin_warehouse.name.toLowerCase();
                if (nombreAlmacen.includes('tae')) {
                    almacenOrigen = 'TAE';
                } else if (nombreAlmacen.includes('equipos matriz') || nombreAlmacen.includes('equipos matrix')) {
                    almacenOrigen = 'Equipos Matriz';
                } else if (nombreAlmacen.includes('accesorios matriz') || nombreAlmacen.includes('accesorios matrix')) {
                    almacenOrigen = 'Accesorios Matriz';
                } else if (nombreAlmacen.includes('promocionales') || nombreAlmacen.includes('promocional')) {
                    almacenOrigen = 'Promocionales';    
                } else {
                    almacenOrigen = 'Otros';
                }
            }

            // Obtener tienda destino
            let tiendaNombre = 'Sin tienda asignada';
            if (transfer.target_warehouse?.branch?.name) {
                tiendaNombre = transfer.target_warehouse.branch.name;
            } else if (transfer.target_warehouse?.name) {
                tiendaNombre = transfer.target_warehouse.name;
            }

            // Obtener fecha
            const fecha = transfer.dispatched_at ? formatDateOnly(transfer.dispatched_at) : 'No disponible';

            if (!almacenesMap.has(almacenOrigen)) {
                almacenesMap.set(almacenOrigen, new Map());
            }

            const tiendasMap = almacenesMap.get(almacenOrigen);
            if (!tiendasMap.has(tiendaNombre)) {
                tiendasMap.set(tiendaNombre, {
                    tienda: tiendaNombre,
                    cantidad: 0,
                    transferencias: [],
                    ruta: obtenerRutaDeTienda(tiendaNombre)
                });
            }

            const tienda = tiendasMap.get(tiendaNombre);
            tienda.cantidad++;
            tienda.transferencias.push({
                id: transfer.id,
                origen: transfer.origin_warehouse?.name || 'No disponible',
                fecha: fecha,
                status: transfer.status || 'En tránsito'
            });
        });

        // Construir estructura final
        const resultado = {
            total: allTransfers.length,
            almacenes: {}
        };

        // Orden de almacenes
        const ordenAlmacenes = ['TAE', 'Equipos Matriz', 'Accesorios Matriz','Promocionales', 'Otros'];

        for (const almacen of ordenAlmacenes) {
            if (almacenesMap.has(almacen)) {
                const tiendasMap = almacenesMap.get(almacen);
                const tiendas = Array.from(tiendasMap.values())
                    .sort((a, b) => {
                        const rutaA = a.ruta ? a.ruta.nombre : "Sin Ruta";
                        const rutaB = b.ruta ? b.ruta.nombre : "Sin Ruta";
                        const ordenRutas = ["Ruta 1", "Ruta 2", "Ruta 3", "Ruta 4"];
                        const indexA = ordenRutas.indexOf(rutaA);
                        const indexB = ordenRutas.indexOf(rutaB);
                        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                        if (indexA !== -1 && indexB === -1) return -1;
                        if (indexA === -1 && indexB !== -1) return 1;
                        return a.tienda.localeCompare(b.tienda);
                    });
                
                resultado.almacenes[almacen] = {
                    tiendas: tiendas,
                    totalTiendas: tiendas.length,
                    totalTransferencias: tiendas.reduce((sum, t) => sum + t.cantidad, 0)
                };
            }
        }

        // Guardar en caché
        cachedTransferenciasData = resultado;

        // Mostrar el modal
        mostrarModalTransferencias(resultado);

        alertaTransferenciasCargada = true;

    } catch (error) {
        console.error('❌ Error verificando transferencias:', error);
    }
}

// ==================== MOSTRAR MODAL CON PESTAÑAS ====================

function mostrarModalTransferencias(data) {
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

    // Generar pestañas
    const ordenAlmacenes = ['TAE', 'Equipos Matriz', 'Accesorios Matriz', 'Promocionales', 'Otros'];
    let tabsHtml = '';
    let contentHtml = '';

    // Iconos por almacén
    const iconosAlmacenes = {
        'TAE': '📱',
        'Equipos Matriz': '📱',
        'Accesorios Matriz': '🔌',
        'Promocionales': '📦',
        'Otros': '📦'
    };

    // Colores por almacén
    const coloresAlmacenes = {
        'TAE': '#8b5cf6',
        'Equipos Matriz': '#3b82f6',
        'Accesorios Matriz': '#f97316',
        'Promocionales': '#14af3b',
        'Otros': '#64748b'
    };

    let primeraPestana = true;
    let tabsHtmlGenerado = '';
    let contentHtmlGenerado = '';

    for (const almacen of ordenAlmacenes) {
        if (data.almacenes[almacen]) {
            const almacenData = data.almacenes[almacen];
            const activeClass = primeraPestana ? 'active' : '';
            const displayStyle = primeraPestana ? 'block' : 'none';
            const color = coloresAlmacenes[almacen] || '#64748b';
            const icono = iconosAlmacenes[almacen] || '📦';

            // Generar HTML de tiendas para este almacén
            let tiendasHtml = '';
            
            // Agrupar tiendas por ruta dentro de este almacén
            const tiendasPorRuta = {};
            const tiendasSinRuta = [];

            almacenData.tiendas.forEach(tienda => {
                if (tienda.ruta) {
                    if (!tiendasPorRuta[tienda.ruta.nombre]) {
                        tiendasPorRuta[tienda.ruta.nombre] = {
                            color: tienda.ruta.color,
                            tiendas: []
                        };
                    }
                    tiendasPorRuta[tienda.ruta.nombre].tiendas.push(tienda);
                } else {
                    tiendasSinRuta.push(tienda);
                }
            });

            // Generar HTML por ruta
            for (const [rutaNombre, rutaData] of Object.entries(tiendasPorRuta)) {
                tiendasHtml += `
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: ${rutaData.color}; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${rutaData.color};"></span>
                            ${rutaNombre}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-left: 16px;">
                            ${rutaData.tiendas.map(tienda => `
                                <div class="tienda-pendiente" 
                                     data-tienda="${escapeHtml(tienda.tienda)}"
                                     data-transferencias='${JSON.stringify(tienda.transferencias).replace(/'/g, "&#39;")}'
                                     style="
                                        background: ${rutaData.color}12;
                                        border: 1px solid ${rutaData.color}30;
                                        border-radius: 6px;
                                        padding: 6px 12px;
                                        display: flex;
                                        align-items: center;
                                        gap: 8px;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                        flex: 0 1 auto;
                                        font-size: 0.8rem;
                                    "
                                    onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';"
                                    onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                                    <span style="font-size: 0.9rem;">🏪</span>
                                    <span style="font-weight: 500; color: #1e293b;">${escapeHtml(tienda.tienda)}</span>
                                    <span style="
                                        background: ${rutaData.color};
                                        color: white;
                                        border-radius: 50%;
                                        padding: 0 8px;
                                        font-size: 0.7rem;
                                        font-weight: 700;
                                        min-width: 20px;
                                        text-align: center;
                                    ">${tienda.cantidad}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Tiendas sin ruta
            if (tiendasSinRuta.length > 0) {
                tiendasHtml += `
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #64748b;"></span>
                            Sin Ruta
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-left: 16px;">
                            ${tiendasSinRuta.map(tienda => `
                                <div class="tienda-pendiente" 
                                     data-tienda="${escapeHtml(tienda.tienda)}"
                                     data-transferencias='${JSON.stringify(tienda.transferencias).replace(/'/g, "&#39;")}'
                                     style="
                                        background: #64748b12;
                                        border: 1px solid #64748b30;
                                        border-radius: 6px;
                                        padding: 6px 12px;
                                        display: flex;
                                        align-items: center;
                                        gap: 8px;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                        flex: 0 1 auto;
                                        font-size: 0.8rem;
                                    "
                                    onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';"
                                    onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                                    <span style="font-size: 0.9rem;">🏪</span>
                                    <span style="font-weight: 500; color: #1e293b;">${escapeHtml(tienda.tienda)}</span>
                                    <span style="
                                        background: #64748b;
                                        color: white;
                                        border-radius: 50%;
                                        padding: 0 8px;
                                        font-size: 0.7rem;
                                        font-weight: 700;
                                        min-width: 20px;
                                        text-align: center;
                                    ">${tienda.cantidad}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Si no hay tiendas en este almacén
            if (!tiendasHtml) {
                tiendasHtml = `
                    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 0.9rem;">
                        ✅ No hay transferencias pendientes desde este almacén
                    </div>
                `;
            }

            // Pestaña
            tabsHtmlGenerado += `
                <button class="almacen-tab ${activeClass}" 
                        data-almacen="${almacen}"
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
                    <span>${icono}</span>
                    ${almacen}
                    <span style="
                        background: ${activeClass ? 'rgba(255,255,255,0.2)' : color};
                        color: ${activeClass ? 'white' : 'white'};
                        border-radius: 50%;
                        padding: 0 8px;
                        font-size: 0.65rem;
                        min-width: 18px;
                        text-align: center;
                    ">${almacenData.totalTransferencias}</span>
                </button>
            `;

            // Contenido
            contentHtmlGenerado += `
                <div class="almacen-content" data-almacen="${almacen}" style="display: ${displayStyle}; padding: 16px 0;">
                    ${tiendasHtml}
                </div>
            `;

            primeraPestana = false;
        }
    }

    // Si no hay ningún almacén con datos
    if (!tabsHtmlGenerado) {
        mostrarSinTransferencias();
        return;
    }

    // Contenido del modal
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 750px; animation: modalFadeIn 0.3s ease-out;">
            <div class="modal-header" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.8rem;">📦</span>
                    <span>Transferencias Pendientes de Recibir</span>
                </h3>
                <span class="close-modal" id="cerrarModalTransferencias" style="font-size: 32px; cursor: pointer;">&times;</span>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <div style="text-align: center; margin-bottom: 16px;">
                    <div style="font-size: 2rem; font-weight: 800; color: #ea580c;">
                        ${data.total}
                    </div>
                    <div style="font-size: 0.85rem; color: #64748b;">
                        Transferencia(s) en tránsito pendientes de recibir
                    </div>
                </div>

                <div style="border-top: 2px solid #e2e8f0; padding-top: 12px;">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 2px solid #e2e8f0;">
                        ${tabsHtmlGenerado}
                    </div>
                    <div style="padding-top: 8px;">
                        ${contentHtmlGenerado}
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="btnActualizarTransferencias" style="
                    background: #1e40af;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    🔄 Actualizar
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

    // Eventos de pestañas
    document.querySelectorAll('.almacen-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const almacen = this.dataset.almacen;
            
            // Desactivar todas las pestañas
            document.querySelectorAll('.almacen-tab').forEach(t => {
                t.classList.remove('active');
                t.style.background = 'transparent';
                t.style.color = t.dataset.color || '#64748b';
                t.style.borderBottom = `2px solid ${t.dataset.color || '#64748b'}30`;
            });
            
            // Activar esta pestaña
            this.classList.add('active');
            const color = this.dataset.color || '#64748b';
            this.style.background = color;
            this.style.color = 'white';
            this.style.borderBottom = 'none';
            
            // Mostrar contenido
            document.querySelectorAll('.almacen-content').forEach(c => {
                c.style.display = 'none';
            });
            document.querySelector(`.almacen-content[data-almacen="${almacen}"]`).style.display = 'block';
        });
        
        // Guardar color para usar en eventos
        const color = coloresAlmacenes[tab.textContent.trim().split(' ')[0]] || '#64748b';
        tab.dataset.color = color;
    });

    // Eventos para cerrar
    document.getElementById('cerrarModalTransferencias').addEventListener('click', cerrarModalTransferencias);
    document.getElementById('btnCerrarModalTransferencias').addEventListener('click', cerrarModalTransferencias);
    
    // Evento para actualizar
    document.getElementById('btnActualizarTransferencias').addEventListener('click', function() {
        alertaTransferenciasCargada = false;
        cachedTransferenciasData = null;
        cerrarModalTransferencias();
        setTimeout(() => {
            verificarTransferenciasPendientes(true);
        }, 300);
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarModalTransferencias();
        }
    });

    // Eventos para las tiendas clickeables
    document.querySelectorAll('.tienda-pendiente').forEach(element => {
        element.addEventListener('click', function() {
            const tiendaNombre = this.dataset.tienda;
            const transferenciasData = JSON.parse(this.dataset.transferencias);
            abrirDetalleTienda(tiendaNombre, transferenciasData);
        });
    });
}

// ==================== ABRIR DETALLE DE TIENDA ====================

function abrirDetalleTienda(tiendaNombre, transferencias) {
    // Crear modal de detalle
    let modal = document.getElementById('detalleTiendaTransferencias');
    if (modal) {
        modal.remove();
    }

    modal = document.createElement('div');
    modal.id = 'detalleTiendaTransferencias';
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex !important;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    // Generar tabla de transferencias
    let tablaHtml = '';
    if (transferencias.length === 0) {
        tablaHtml = '<div style="text-align: center; padding: 20px; color: #64748b;">No hay transferencias pendientes para esta tienda</div>';
    } else {
        tablaHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <th style="padding: 10px; text-align: left;"># Transferencia</th>
                        <th style="padding: 10px; text-align: left;">Almacén Origen</th>
                        <th style="padding: 10px; text-align: left;">Fecha</th>
                        <th style="padding: 10px; text-align: center;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${transferencias.map(t => `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px; font-weight: 600; color: #1e40af;">#${t.id}</td>
                            <td style="padding: 10px;">${escapeHtml(t.origen)}</td>
                            <td style="padding: 10px;">${t.fecha}</td>
                            <td style="padding: 10px; text-align: center;">
                                <span class="status-badge status-en-proceso" style="font-size: 0.7rem;">${t.status}</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; animation: modalFadeIn 0.3s ease-out;">
            <div class="modal-header" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.5rem;">🏪</span>
                    <span>Detalle de Transferencias - ${escapeHtml(tiendaNombre)}</span>
                </h3>
                <span class="close-modal" onclick="cerrarDetalleTienda()" style="font-size: 32px; cursor: pointer;">&times;</span>
            </div>
            <div class="modal-body" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                <div style="margin-bottom: 16px; display: flex; gap: 16px; flex-wrap: wrap;">
                    <div style="background: #f8fafc; padding: 8px 16px; border-radius: 8px;">
                        <span style="color: #64748b; font-size: 0.75rem;">Total Transferencias</span>
                        <div style="font-size: 1.5rem; font-weight: 700; color: #1e40af;">${transferencias.length}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 8px 16px; border-radius: 8px;">
                        <span style="color: #64748b; font-size: 0.75rem;">Tienda</span>
                        <div style="font-size: 1rem; font-weight: 600; color: #1e293b;">${escapeHtml(tiendaNombre)}</div>
                    </div>
                </div>
                ${tablaHtml}
            </div>
            <div class="modal-footer">
                <button onclick="cerrarDetalleTienda()" style="
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

    // Cerrar al hacer clic fuera
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarDetalleTienda();
        }
    });
}

// ==================== MOSTRAR MENSAJE SIN TRANSFERENCIAS ====================

function mostrarSinTransferencias() {
    const modal = document.getElementById('modalTransferenciasPendientes');
    if (modal) {
        modal.remove();
    }

    const newModal = document.createElement('div');
    newModal.id = 'modalTransferenciasPendientes';
    newModal.className = 'modal';
    newModal.style.cssText = `
        display: flex !important;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;

    newModal.innerHTML = `
        <div class="modal-content" style="max-width: 450px; animation: modalFadeIn 0.3s ease-out;">
            <div class="modal-header" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.8rem;">✅</span>
                    <span>Sin Transferencias Pendientes</span>
                </h3>
                <span class="close-modal" onclick="cerrarModalTransferencias()" style="font-size: 32px; cursor: pointer;">&times;</span>
            </div>
            <div class="modal-body" style="padding: 30px; text-align: center;">
                <div style="font-size: 4rem; margin-bottom: 16px;">📦</div>
                <div style="font-size: 1.2rem; font-weight: 600; color: #1e293b; margin-bottom: 8px;">
                    No hay transferencias en tránsito
                </div>
                <div style="color: #64748b; font-size: 0.9rem;">
                    Todas las transferencias han sido recibidas correctamente.
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: center;">
                <button onclick="cerrarModalTransferencias()" style="
                    background: #059669;
                    color: white;
                    border: none;
                    padding: 8px 30px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    Entendido
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(newModal);

    newModal.addEventListener('click', function(e) {
        if (e.target === newModal) {
            cerrarModalTransferencias();
        }
    });
}

// ==================== CERRAR MODALES ====================

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

function cerrarDetalleTienda() {
    const modal = document.getElementById('detalleTiendaTransferencias');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// ==================== ABRIR MODAL DESDE BOTÓN ====================

function abrirModalTransferencias() {
    if (cachedTransferenciasData) {
        console.log('📦 Mostrando datos en caché...');
        mostrarModalTransferencias(cachedTransferenciasData);
    } else {
        verificarTransferenciasPendientes(true);
    }
}

// ==================== EJECUTAR AL INICIO (UNA SOLA VEZ) ====================

function initAlertasTransferencias() {
    // Evitar múltiples inicializaciones
    if (alertaTransferenciasInicializada) {
        console.log('⏳ Alerta de transferencias ya inicializada');
        return;
    }
    
    alertaTransferenciasInicializada = true;
    console.log('🔔 Inicializando alerta de transferencias...');
    
    // Verificar una sola vez después del login
    const checkLogin = setInterval(() => {
        const userBar = document.getElementById('userInfoBar');
        if (userBar && userBar.style.display !== 'none') {
            clearInterval(checkLogin);
            console.log('🔐 Usuario autenticado, verificando transferencias (una sola vez)...');
            setTimeout(() => {
                if (typeof verificarTransferenciasPendientes === 'function') {
                    verificarTransferenciasPendientes(true);
                }
            }, 2000);
        }
    }, 500);
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initAlertasTransferencias = initAlertasTransferencias;
window.verificarTransferenciasPendientes = verificarTransferenciasPendientes;
window.cerrarModalTransferencias = cerrarModalTransferencias;
window.cerrarDetalleTienda = cerrarDetalleTienda;
window.abrirModalTransferencias = abrirModalTransferencias;

console.log('📦 [ALERTAS TRANSFERENCIAS] Módulo cargado correctamente');