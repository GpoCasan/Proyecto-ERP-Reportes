// ==================== MÓDULO: SIM EXPRESS ====================

// IDs de productos para la primera consulta
const SIM_PRODUCT_IDS = [1032, 217, 237, 238];

// IDs para E-SIM (producto y servicio)
const E_SIM_IDS = [1060];

// Colores por concepto
const CONCEPT_COLORS = {
    "Chip Express Plus": "#059669",      // Verde
    "Activacion ESIM": "#f59e0b",        // Ámbar
    "Portabilidad Servicel": "#3b82f6",  // Azul
    "Portabilidad Telcel": "#ea580c",    // Naranja
    "Recuperacion de numero": "#8b5cf6", // Morado
    "Express Numero Nuevo": "#ec489a"    // Rosa
};

// Orden de conceptos
const CONCEPT_ORDER = ["Chip Express Plus", "Activacion ESIM", "Portabilidad Servicel", "Portabilidad Telcel", "Recuperacion de numero", "Express Numero Nuevo"];

// Variable global para almacenar todos los detalles por concepto
let cachedDetailsByConcept = {
    "Chip Express Plus": [],
    "Activacion ESIM": [],
    "Portabilidad Servicel": [],
    "Portabilidad Telcel": [],
    "Recuperacion de numero": [],
    "Express Numero Nuevo": []
};

let cachedResumenAsesores = null;
let cachedDate = null;

// Función para obtener concepto según product_id
function getConceptByProductId(productId) {
    if (productId === 1032) return "Chip Express Plus";
    if (productId === 238) return "Portabilidad Servicel";
    if (productId === 237) return "Portabilidad Telcel";
    if (productId === 217) return "Recuperacion de numero";
    return null;
}

// Función para consultar ventas de SIM Express (productos)
async function fetchSimSales(startDateTime, endDateTime) {
    let url = `${CONFIG.API_SALES}?page=1&per_page=100&total=0&start_date=${startDateTime}&end_date=${endDateTime}&sale_type=products`;
    
    SIM_PRODUCT_IDS.forEach(id => {
        url += `&product_ids[]=${id}`;
    });
    
    console.log('Consultando SIM Express (productos) URL:', url);
    
    try {
        const response = await fetch(url, { 
            headers: { 
                'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            } 
        });
        
        if (!response.ok) {
            console.error(`Error en consulta SIM: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const sales = data.data || [];
        
        const conceptDetails = [];
        
        for (let sale of sales) {
            for (let detail of (sale.details || [])) {
                const productId = detail.product_id;
                const quantity = detail.quantity || 1;
                const concept = getConceptByProductId(productId);
                
                if (concept) {
                    conceptDetails.push({
                        concept: concept,
                        quantity: quantity,
                        saleId: sale.id,
                        sellerId: sale.user?.id || null,
                        seller: sale.user?.name || 'No disponible',
                        branchName: sale.warehouse?.branch?.name || sale.branch_name || 'No disponible',
                        saleDate: sale.created_at
                    });
                }
            }
        }
        
        return conceptDetails;
        
    } catch (error) {
        console.error('Error en fetchSimSales:', error);
        return [];
    }
}

// Función para consultar Activacion ESIM
async function fetchActivacionESIM(startDateTime, endDateTime) {
    let url = `${CONFIG.API_SALES}?page=1&per_page=100&total=0&start_date=${startDateTime}&end_date=${endDateTime}`;
    
    E_SIM_IDS.forEach(id => {
        url += `&product_ids[]=${id}&service_ids[]=${id}`;
    });
    
    console.log('Consultando Activacion ESIM URL:', url);
    
    try {
        const response = await fetch(url, { 
            headers: { 
                'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            } 
        });
        
        if (!response.ok) {
            console.error(`Error en consulta ESIM: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const sales = data.data || [];
        
        const detalles = [];
        
        for (let sale of sales) {
            for (let detail of (sale.details || [])) {
                const quantity = detail.quantity || 1;
                detalles.push({
                    concept: "Activacion ESIM",
                    quantity: quantity,
                    saleId: sale.id,
                    sellerId: sale.user?.id || null,
                    seller: sale.user?.name || 'No disponible',
                    branchName: sale.warehouse?.branch?.name || sale.branch_name || 'No disponible',
                    saleDate: sale.created_at
                });
            }
        }
        
        return detalles;
        
    } catch (error) {
        console.error('Error en fetchActivacionESIM:', error);
        return [];
    }
}

// Función para consultar Express Numero Nuevo (kits)
async function fetchExpressNuevo(startDateTime, endDateTime) {
    try {
        if (!startDateTime || !endDateTime) {
            console.error('Fechas inválidas para fetchExpressNuevo');
            return [];
        }

        const formatForKits = (dateStr) => {
            return dateStr.replace('+', 'T');
        };

        const startFormatted = formatForKits(startDateTime);
        const endFormatted = formatForKits(endDateTime);

        const url = `${CONFIG.API_REPORTS}/kits/sales/details?page=1&per_page=100&total=0&kit_ids[]=12&dates[]=${startFormatted}&dates[]=${endFormatted}`;

        console.log('Consultando Express Numero Nuevo URL:', url);

        const response = await fetch(url, { 
            headers: { 
                'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            } 
        });

        if (!response.ok) {
            console.warn(`El endpoint de kits respondió con estado: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const ventas = data.data || [];
        
        const detalles = [];
        
        for (let venta of ventas) {
            detalles.push({
                concept: "Express Numero Nuevo",
                quantity: 1,
                saleId: venta.id,
                sellerId: venta.user_id || null,
                seller: venta.user_name || 'No disponible',
                branchName: venta.branch_name || 'No disponible',
                saleDate: venta.created_at
            });
        }
        
        return detalles;
        
    } catch (error) {
        console.error('Error en fetchExpressNuevo:', error);
        return [];
    }
}

// Función para generar resumen por asesor para un concepto específico
function generarResumenPorAsesorParaConcepto(detalles) {
    const resumenAsesor = new Map();
    
    for (let detail of detalles) {
        const asesorId = detail.sellerId;
        const asesor = detail.seller;
        const cantidad = detail.quantity;
        const saleId = detail.saleId;
        
        const key = asesorId || asesor;
        
        if (!resumenAsesor.has(key)) {
            resumenAsesor.set(key, {
                id: asesorId,
                nombre: asesor,
                totalUnidades: 0,
                ventas: []
            });
        }
        
        const asesorData = resumenAsesor.get(key);
        asesorData.totalUnidades += cantidad;
        asesorData.ventas.push(saleId);
    }
    
    return Array.from(resumenAsesor.values()).sort((a, b) => b.totalUnidades - a.totalUnidades);
}

// Función para generar resumen global por asesor (con IDs)
function generarResumenGlobalPorAsesor() {
    const resumenAsesor = new Map();
    
    for (const [concept, details] of Object.entries(cachedDetailsByConcept)) {
        for (let detail of details) {
            const asesorId = detail.sellerId;
            const asesor = detail.seller;
            const cantidad = detail.quantity;
            
            const key = asesorId || asesor;
            
            if (!resumenAsesor.has(key)) {
                resumenAsesor.set(key, {
                    id: asesorId,
                    nombre: asesor,
                    totalUnidades: 0,
                    porConcepto: {
                        "Chip Express Plus": 0,
                        "Activacion ESIM": 0,
                        "Portabilidad Servicel": 0,
                        "Portabilidad Telcel": 0,
                        "Recuperacion de numero": 0,
                        "Express Numero Nuevo": 0
                    }
                });
            }
            
            const asesorData = resumenAsesor.get(key);
            asesorData.totalUnidades += cantidad;
            asesorData.porConcepto[concept] = (asesorData.porConcepto[concept] || 0) + cantidad;
        }
    }
    
    return Array.from(resumenAsesor.values()).sort((a, b) => b.totalUnidades - a.totalUnidades);
}

// Función para exportar concepto a Excel
function exportConceptToExcel(equiposConVentas, concept, totalUnidades, fecha) {
    const excelData = [
        [`SIM Express - ${concept}`],
        //[`Fecha: ${formatDate(fecha)}`],
        [],
        ['#', 'Equipo / Asesor', 'Unidades']
    ];
    
    let index = 1;
    for (const equipo of equiposConVentas) {
        //excelData.push([index, equipo.nombre, equipo.equipoTotal]);
        //index++;
        
        excelData.push(['Lider', `${equipo.liderNombre}`, equipo.liderCantidad]);
        
        for (const miembro of equipo.miembros) {
            excelData.push(['', `${miembro.nombre}`, miembro.cantidad]);
        }
        
        excelData.push(['', '', '']);
    }
    
    const totalGeneral = equiposConVentas.reduce((sum, e) => sum + e.equipoTotal, 0);
    excelData.push(['', 'TOTAL GENERAL:', totalGeneral]);
    excelData.push([]);
    //excelData.push(['Nota:', 'Los líderes aparecen con 👑 y los miembros con └─']);
    
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `simexpress_${concept.replace(/ /g, '_')}_${fecha}`);
    } else {
        console.error('La función exportToExcel no está disponible');
        alert('Error: No se pudo exportar. La función de exportación no está disponible.');
    }
}

// Función para exportar resumen global a Excel
function exportResumenGlobalToExcel(equiposConVentas, conceptos, totalGeneral, fecha) {
    const excelData = [
        ['SIM Express - Resumen por Equipo'],
        [`Fecha: ${formatDate(fecha)}`],
        [],
        ['#', 'Equipo / Asesor', 'Total', ...conceptos.map(c => c.substring(0, 15))]
    ];
    
    let index = 1;
    for (const equipo of equiposConVentas) {
        const equipoRow = [index, equipo.nombre, equipo.equipoTotal];
        for (let concepto of conceptos) {
            equipoRow.push(equipo.equipoPorConcepto[concepto]);
        }
        excelData.push(equipoRow);
        index++;
        
        const liderRow = ['', `  👑 ${equipo.liderNombre}`, equipo.liderTotal];
        for (let concepto of conceptos) {
            liderRow.push(equipo.liderPorConcepto[concepto]);
        }
        excelData.push(liderRow);
        
        for (const miembro of equipo.miembros) {
            const miembroRow = ['', `  └─ ${miembro.nombre}`, miembro.total];
            for (let concepto of conceptos) {
                miembroRow.push(miembro.porConcepto[concepto]);
            }
            excelData.push(miembroRow);
        }
        
        excelData.push(['', '', '', ...conceptos.map(() => '')]);
    }
    
    excelData.push(['', 'TOTAL GENERAL:', totalGeneral]);
    for (let i = 0; i < conceptos.length; i++) {
        excelData[excelData.length - 1].push('');
    }
    excelData.push([]);
    excelData.push(['Nota:', 'Los líderes aparecen con 👑 y los miembros con └─']);
    
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `simexpress_resumen_equipos_${fecha}`);
    } else {
        console.error('La función exportToExcel no está disponible');
        alert('Error: No se pudo exportar. La función de exportación no está disponible.');
    }
}

// Función para mostrar modal de detalle por concepto (resumido por asesor)
function openConceptModal(concept) {
    const detalles = cachedDetailsByConcept[concept] || [];
    
    if (detalles.length === 0) {
        showError('simexpress', `No hay ventas de ${concept} para esta fecha`);
        return;
    }
    
    const resumenAsesor = generarResumenPorAsesorParaConcepto(detalles);
    const totalUnidades = detalles.reduce((sum, d) => sum + d.quantity, 0);
    const conceptColor = CONCEPT_COLORS[concept] || "#64748b";
    
    // Agrupar por equipo para el modal de concepto
    const ventasPorAsesor = new Map();
    for (const asesor of resumenAsesor) {
        ventasPorAsesor.set(asesor.id || asesor.nombre, {
            id: asesor.id,
            nombre: asesor.nombre,
            cantidad: asesor.totalUnidades,
            ventas: asesor.ventas
        });
    }
    
    // Construir estructura por equipos
    const equipos = [];
    
    for (const [teamName, teamData] of Object.entries(TEAM_STRUCTURE)) {
        let liderCantidad = 0;
        let liderVentas = [];
        let liderInfo = null;
        
        if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
            liderInfo = ventasPorAsesor.get(teamData.liderId);
            liderCantidad = liderInfo.cantidad;
            liderVentas = liderInfo.ventas || [];
        } else {
            for (const [key, value] of ventasPorAsesor) {
                if (value.nombre === teamData.liderNombre) {
                    liderCantidad = value.cantidad;
                    liderVentas = value.ventas || [];
                    liderInfo = value;
                    break;
                }
            }
        }
        
        const miembros = [];
        let equipoTotal = liderCantidad;
        
        for (const miembroId of teamData.miembros) {
            let miembroCantidad = 0;
            let miembroVentas = [];
            let miembroInfo = null;
            
            if (ventasPorAsesor.has(miembroId)) {
                miembroInfo = ventasPorAsesor.get(miembroId);
                miembroCantidad = miembroInfo.cantidad;
                miembroVentas = miembroInfo.ventas || [];
            } else {
                for (const [key, value] of ventasPorAsesor) {
                    if (value.id === miembroId) {
                        miembroCantidad = value.cantidad;
                        miembroVentas = value.ventas || [];
                        miembroInfo = value;
                        break;
                    }
                }
            }
            
            if (miembroCantidad > 0 && miembroInfo) {
                miembros.push({
                    nombre: miembroInfo.nombre,
                    cantidad: miembroCantidad,
                    ventas: miembroVentas
                });
                equipoTotal += miembroCantidad;
            }
        }
        
        miembros.sort((a, b) => b.cantidad - a.cantidad);
        
        if (equipoTotal > 0) {
            equipos.push({
                nombre: teamName,
                liderNombre: teamData.liderNombre,
                liderCantidad: liderCantidad,
                liderVentas: liderVentas,
                miembros: miembros,
                equipoTotal: equipoTotal
            });
        }
    }
    
    equipos.sort((a, b) => b.equipoTotal - a.equipoTotal);
    
    let modal = document.getElementById('conceptModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'conceptModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3 id="conceptModalTitle">📱 Detalle de ventas</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                    <button id="exportConceptExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>
                </div>
                <div class="modal-body" id="conceptModalBody"></div>
                <div class="modal-footer">SIM Express - Ventas del día</div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    document.getElementById('conceptModalTitle').innerHTML = `📱 ${concept} - ${totalUnidades} unidades`;
    
    const getTooltipContent = (ventas) => {
        if (!ventas || ventas.length === 0) return 'Sin ventas';
        return `Folios: ${ventas.join(', ')}`;
    };
    
    let tableHtml = `
        <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
            <div class="stat-card" style="background: ${conceptColor}; flex: 1;">
                <div class="stat-number">${equipos.length}</div>
                <div class="stat-label">Equipos con ventas</div>
            </div>
            <div class="stat-card" style="background: ${conceptColor}; flex: 1;">
                <div class="stat-number">${totalUnidades}</div>
                <div class="stat-label">Total Unidades</div>
            </div>
        </div>
        <div class="table-container" style="max-height: 500px; overflow-y: auto;">
            <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                <thead style="position: sticky; top: 0; background: #f8f9fa;">
                    <tr>
                        <th>#</th>
                        <th>Equipo / Asesor</th>
                        <th>Unidades</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let index = 1;
    for (const equipo of equipos) {
        tableHtml += `
            <tr style="background-color: ${conceptColor}20; border-top: 2px solid ${conceptColor};">
                <td style="padding: 8px; text-align: center; font-weight: bold;">${index}</div>
                <td style="padding: 8px; text-align: left; font-weight: bold; color: ${conceptColor};">📁 ${equipo.nombre}</div>
                <td style="padding: 8px; text-align: center; font-weight: bold;">${equipo.equipoTotal}</div>
            </tr>
        `;
        index++;
        
        tableHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; text-align: center;"></div>
                <td style="padding: 6px 8px; text-align: left; padding-left: 28px; cursor: help;" title="${getTooltipContent(equipo.liderVentas)}">
                    👑 ${equipo.liderNombre} <span style="font-size: 0.7rem; color: #64748b;">🛈</span>
                </div>
                <td style="padding: 6px 8px; text-align: center; ${equipo.liderCantidad === 0 ? 'color: #94a3b8;' : 'font-weight: bold;'}">${equipo.liderCantidad}</div>
            </tr>
        `;
        
        for (const miembro of equipo.miembros) {
            tableHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px 8px; text-align: center;"></div>
                    <td style="padding: 6px 8px; text-align: left; padding-left: 28px; cursor: help;" title="${getTooltipContent(miembro.ventas)}">
                        └─ ${escapeHtml(miembro.nombre)} <span style="font-size: 0.7rem; color: #64748b;">🛈</span>
                    </div>
                    <td style="padding: 6px 8px; text-align: center;">${miembro.cantidad}</div>
                </tr>
            `;
        }
    }
    
    tableHtml += `
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('conceptModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
    
    // Event listener para exportar a Excel
    const exportBtn = document.getElementById('exportConceptExcelBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportConceptToExcel(equipos, concept, totalUnidades, cachedDate));
    }
}

// Función para mostrar modal de resumen global por asesor (agrupado por equipos)
function openResumenAsesorModal() {
    if (!cachedResumenAsesores || cachedResumenAsesores.length === 0) {
        showError('simexpress', 'No hay datos de ventas para generar el resumen por asesor');
        return;
    }
    
    // Convertir cachedResumenAsesores a Map para agrupación
    const ventasPorAsesor = new Map();
    for (const asesor of cachedResumenAsesores) {
        ventasPorAsesor.set(asesor.id || asesor.nombre, {
            id: asesor.id,
            nombre: asesor.nombre,
            totalUnidades: asesor.totalUnidades,
            porConcepto: asesor.porConcepto
        });
    }
    
    // Construir estructura por equipos
    const equipos = [];
    const conceptos = ["Chip Express Plus", "Activacion ESIM", "Portabilidad Servicel", "Portabilidad Telcel", "Recuperacion de numero", "Express Numero Nuevo"];
    
    for (const [teamName, teamData] of Object.entries(TEAM_STRUCTURE)) {
        let liderTotal = 0;
        let liderPorConcepto = {};
        conceptos.forEach(c => liderPorConcepto[c] = 0);
        
        if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
            const lider = ventasPorAsesor.get(teamData.liderId);
            liderTotal = lider.totalUnidades;
            for (const concepto of conceptos) {
                liderPorConcepto[concepto] = lider.porConcepto[concepto] || 0;
            }
        } else {
            for (const [key, value] of ventasPorAsesor) {
                if (value.nombre === teamData.liderNombre) {
                    liderTotal = value.totalUnidades;
                    for (const concepto of conceptos) {
                        liderPorConcepto[concepto] = value.porConcepto[concepto] || 0;
                    }
                    break;
                }
            }
        }
        
        const miembros = [];
        let equipoTotal = liderTotal;
        let equipoPorConcepto = {...liderPorConcepto};
        
        for (const miembroId of teamData.miembros) {
            let miembroTotal = 0;
            let miembroPorConcepto = {};
            conceptos.forEach(c => miembroPorConcepto[c] = 0);
            let miembroInfo = null;
            
            if (ventasPorAsesor.has(miembroId)) {
                miembroInfo = ventasPorAsesor.get(miembroId);
                miembroTotal = miembroInfo.totalUnidades;
                for (const concepto of conceptos) {
                    miembroPorConcepto[concepto] = miembroInfo.porConcepto[concepto] || 0;
                }
            } else {
                for (const [key, value] of ventasPorAsesor) {
                    if (value.id === miembroId) {
                        miembroTotal = value.totalUnidades;
                        miembroInfo = value;
                        for (const concepto of conceptos) {
                            miembroPorConcepto[concepto] = value.porConcepto[concepto] || 0;
                        }
                        break;
                    }
                }
            }
            
            if (miembroTotal > 0 && miembroInfo) {
                miembros.push({
                    nombre: miembroInfo.nombre,
                    total: miembroTotal,
                    porConcepto: miembroPorConcepto
                });
                equipoTotal += miembroTotal;
                for (const concepto of conceptos) {
                    equipoPorConcepto[concepto] += miembroPorConcepto[concepto];
                }
            }
        }
        
        miembros.sort((a, b) => b.total - a.total);
        
        if (equipoTotal > 0) {
            equipos.push({
                nombre: teamName,
                liderNombre: teamData.liderNombre,
                liderTotal: liderTotal,
                liderPorConcepto: liderPorConcepto,
                miembros: miembros,
                equipoTotal: equipoTotal,
                equipoPorConcepto: equipoPorConcepto
            });
        }
    }
    
    equipos.sort((a, b) => b.equipoTotal - a.equipoTotal);
    
    const totalGeneral = equipos.reduce((sum, e) => sum + e.equipoTotal, 0);
    
    let modal = document.getElementById('resumenAsesorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resumenAsesorModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1100px;">
                <div class="modal-header">
                    <h3>📊 Resumen de Ventas por Equipo - SIM Express</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                    <button id="exportResumenExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>
                </div>
                <div class="modal-body" id="resumenAsesorModalBody"></div>
                <div class="modal-footer">SIM Express - Ventas del día | Cantidad de unidades</div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    // Generar cabecera de columnas
    let headerColumns = `<th>#</th><th>Equipo / Asesor</th><th>Total</th>`;
    for (let concepto of conceptos) {
        const color = CONCEPT_COLORS[concepto] || "#64748b";
        headerColumns += `<th style="background: ${color}; color: white;">${concepto.substring(0, 12)}</th>`;
    }
    
    let tableHtml = `
        <div class="stats" style="margin-bottom: 20px; display: flex; gap: 12px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); flex: 1;">
                <div class="stat-number">${equipos.length}</div>
                <div class="stat-label">👥 Equipos con ventas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); flex: 1;">
                <div class="stat-number">${totalGeneral}</div>
                <div class="stat-label">📊 Total Unidades</div>
            </div>
        </div>
        
        <div class="table-container" style="max-height: 500px; overflow-y: auto;">
            <table class="resumen-table" style="width: 100%; border-collapse: collapse;">
                <thead style="position: sticky; top: 0; background: #f8f9fa;">
                    <tr>${headerColumns}</tr>
                </thead>
                <tbody>
    `;
    
    let index = 1;
    for (const equipo of equipos) {
        // Fila del equipo
        let equipoRow = `<tr style="background-color: #e8f4f8; border-top: 2px solid #1e40af;">
            <td style="padding: 8px; text-align: center; font-weight: bold;">${index}</div>
            <td style="padding: 8px; text-align: left; font-weight: bold; color: #1e40af;">📁 ${equipo.nombre}</div>
            <td style="padding: 8px; text-align: center; font-weight: bold;">${equipo.equipoTotal}</div>`;
        
        for (let concepto of conceptos) {
            equipoRow += `<td style="padding: 8px; text-align: center; font-weight: bold;">${equipo.equipoPorConcepto[concepto]}</div>`;
        }
        equipoRow += `</tr>`;
        tableHtml += equipoRow;
        index++;
        
        // Fila del líder
        let liderRow = `<tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; text-align: center;"></div>
            <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">👑 ${equipo.liderNombre}</div>
            <td style="padding: 6px 8px; text-align: center; ${equipo.liderTotal === 0 ? 'color: #94a3b8;' : 'font-weight: bold;'}">${equipo.liderTotal}</div>`;
        
        for (let concepto of conceptos) {
            liderRow += `<td style="padding: 6px 8px; text-align: center;">${equipo.liderPorConcepto[concepto]}</div>`;
        }
        liderRow += `</tr>`;
        tableHtml += liderRow;
        
        // Filas de los miembros
        for (const miembro of equipo.miembros) {
            let miembroRow = `<tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; text-align: center;"></div>
                <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">└─ ${escapeHtml(miembro.nombre)}</div>
                <td style="padding: 6px 8px; text-align: center;">${miembro.total}</div>`;
            
            for (let concepto of conceptos) {
                miembroRow += `<td style="padding: 6px 8px; text-align: center;">${miembro.porConcepto[concepto]}</div>`;
            }
            miembroRow += `</tr>`;
            tableHtml += miembroRow;
        }
    }
    
    tableHtml += `
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('resumenAsesorModalBody').innerHTML = tableHtml;
    modal.style.display = 'block';
    
    // Event listener para exportar a Excel
    const exportBtn = document.getElementById('exportResumenExcelBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportResumenGlobalToExcel(equipos, conceptos, totalGeneral, cachedDate));
    }
}

// Función principal
async function searchSimExpress() {
    const date = document.getElementById('simexpressDate').value;
    if (!date) {
        showError('simexpress', 'Seleccione una fecha');
        return;
    }

    const btn = document.getElementById('searchSimExpressBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('simexpressResults').style.display = 'none';
    document.getElementById('simexpressErrorAlert').style.display = 'none';
    document.getElementById('simexpressInfoAlert').style.display = 'none';

    try {
        const range = getDateRangeContado(date);
        if (!range) throw new Error('Error en fecha');
        
        const startDateTime = range.start;
        const endDateTime = range.end;
        
        console.log('Rango de fechas SIM Express:', { startDateTime, endDateTime });
        
        const [simSales, esimSales, expressNuevo] = await Promise.all([
            fetchSimSales(startDateTime, endDateTime),
            fetchActivacionESIM(startDateTime, endDateTime),
            fetchExpressNuevo(startDateTime, endDateTime)
        ]);
        
        // Limpiar y llenar cachedDetailsByConcept
        for (let key in cachedDetailsByConcept) {
            cachedDetailsByConcept[key] = [];
        }
        
        for (let detail of simSales) {
            cachedDetailsByConcept[detail.concept].push(detail);
        }
        
        for (let detail of esimSales) {
            cachedDetailsByConcept["Activacion ESIM"].push(detail);
        }
        
        for (let detail of expressNuevo) {
            cachedDetailsByConcept["Express Numero Nuevo"].push(detail);
        }
        
        // Calcular conteos por concepto
        const concepts = CONCEPT_ORDER.map(concept => ({
            name: concept,
            count: cachedDetailsByConcept[concept].reduce((sum, d) => sum + d.quantity, 0)
        }));
        
        const totalVentas = concepts.reduce((sum, c) => sum + c.count, 0);
        
        // Generar resumen global por asesor
        cachedResumenAsesores = generarResumenGlobalPorAsesor();
        cachedDate = date;
        
        // Mostrar solo las tarjetas de estadísticas
        const statsHtml = `
            <div class="stats">
                <div class="stat-card" style="cursor: default; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number">${totalVentas}</div>
                    <div class="stat-label">📊 Total Unidades</div>
                </div>
                ${concepts.map(c => `
                    <div class="stat-card" style="background: ${CONCEPT_COLORS[c.name]}; cursor: pointer;" data-concept="${c.name}">
                        <div class="stat-number">${c.count}</div>
                        <div class="stat-label">${c.name}</div>
                    </div>
                `).join('')}
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); cursor: pointer;" id="btnResumenAsesor">
                    <div class="stat-number">👥 ${cachedResumenAsesores.length}</div>
                    <div class="stat-label">Ver Resumen por Asesor</div>
                </div>
            </div>
            <div class="alert alert-info" style="margin-top: 20px;">
                💡 Haz clic en cualquier tarjeta de concepto para ver el detalle por equipo
            </div>
        `;
        
        document.getElementById('simexpressStats').innerHTML = statsHtml;
        document.getElementById('simexpressStats').style.display = 'block';
        document.getElementById('simexpressResults').style.display = 'none';
        
        // Agregar event listeners a las tarjetas de concepto
        document.querySelectorAll('.stat-card[data-concept]').forEach(card => {
            card.addEventListener('click', () => {
                const concept = card.getAttribute('data-concept');
                openConceptModal(concept);
            });
        });
        
        // Event listener para resumen por asesor
        const btnResumen = document.getElementById('btnResumenAsesor');
        if (btnResumen) {
            btnResumen.addEventListener('click', openResumenAsesorModal);
        }
        
        if (totalVentas === 0) {
            showInfo('simexpress', `⚠️ No se encontraron ventas SIM Express para el día ${formatDate(date)}`, true);
        } else {
            showInfo('simexpress', `✅ Se encontraron ${totalVentas} ventas SIM Express. Haz clic en las tarjetas para ver el detalle por equipo.`, false);
        }
        
    } catch (error) {
        console.error('Error en SIM Express:', error);
        showError('simexpress', `Error al consultar: ${error.message}`);
        document.getElementById('simexpressResults').style.display = 'none';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}