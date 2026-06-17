// ==================== MÓDULO: ACCESORIOS ====================

// Variable global para almacenar datos de accesorios por asesor
let cachedAccesoriosData = null;

// Función para calcular el margen promedio
async function calculateAverageMargin(productosMap, totalVentaGeneral) {
    let totalCostoConIva = 0;
    let productosConCosto = 0;
    
    // Obtener los costos de todos los productos en paralelo
    const productosArray = Array.from(productosMap.values());
    const costPromises = productosArray.map(async (item) => {
        try {
            const costData = await fetchProductCost(item.productId);
            if (costData && costData.costoConIva > 0) {
                totalCostoConIva += costData.costoConIva * item.cantidad;
                productosConCosto++;
                // Guardar el costo en el item para usarlo después
                item.costoObtenido = costData.costoConIva;
                item.margenProducto = item.precioUnitario > 0 ? ((item.precioUnitario - costData.costoConIva) / item.precioUnitario) * 100 : 0;
                return { success: true, costo: costData.costoConIva };
            }
        } catch (error) {
            console.warn(`Error obteniendo costo para ${item.nombre}:`, error);
        }
        item.costoObtenido = null;
        item.margenProducto = null;
        return { success: false };
    });
    
    await Promise.all(costPromises);
    
    if (totalVentaGeneral > 0 && totalCostoConIva > 0) {
        const utilidadTotal = totalVentaGeneral - totalCostoConIva;
        const margenPromedio = (utilidadTotal / totalVentaGeneral) * 100;
        return {
            margenPromedio: margenPromedio,
            utilidadTotal: utilidadTotal,
            totalCosto: totalCostoConIva,
            productosAnalizados: productosConCosto,
            totalProductos: productosArray.length
        };
    }
    
    return null;
}

async function searchAccesorios() {
    const date = document.getElementById('accesoriosDate').value;
    if (!date) {
        showError('accesorios', 'Seleccione una fecha');
        return;
    }

    const btn = document.getElementById('searchAccesoriosBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('accesoriosResults').style.display = 'none';
    document.getElementById('accesoriosErrorAlert').style.display = 'none';
    document.getElementById('accesoriosInfoAlert').style.display = 'none';

    try {
        const range = getDateRangeContado(date);
        if (!range) throw new Error('Error en fecha');
        
        const url = `${CONFIG.API_SALES}?page=1&per_page=100&sale_type=products&classification_ids[]=9&classification_ids[]=3&line_id=2&start_date=${range.start}&end_date=${range.end}`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const sales = data.data || [];
        
        const productosMap = new Map();
        let totalUnidades = 0;
        let totalVentaGeneral = 0;
        let totalVentasConAccesorios = 0;
        
        // Mapa para almacenar ventas por asesor (usando ID)
        const asesorMap = new Map(); // key: sellerId, value: { nombre, cantidad }
        
        for (let sale of sales) {
            let tieneAccesorios = false;
            const asesorId = sale.user?.id || null;
            const asesorNombre = sale.user?.name || 'No disponible';
            
            if (sale.details) {
                for (let detail of sale.details) {
                    const productLineId = detail.product?.line_id;
                    
                    if (productLineId === 2) {
                        tieneAccesorios = true;
                        const productName = detail.product?.name || 'Desconocido';
                        const productId = detail.product?.id || 0;
                        const quantity = detail.quantity || 1;
                        const unitPriceSinIva = parseFloat(detail.unit_price) || 0;
                        const unitPriceConIva = unitPriceSinIva * 1.16;
                        const totalProducto = unitPriceConIva * quantity;
                        
                        totalUnidades += quantity;
                        totalVentaGeneral += totalProducto;
                        
                        // Contar por asesor (usando ID como clave)
                        const key = asesorId || asesorNombre;
                        if (asesorMap.has(key)) {
                            const existing = asesorMap.get(key);
                            existing.cantidad += quantity;
                        } else {
                            asesorMap.set(key, {
                                id: asesorId,
                                nombre: asesorNombre,
                                cantidad: quantity
                            });
                        }
                        
                        if (productosMap.has(productName)) {
                            const existing = productosMap.get(productName);
                            existing.cantidad += quantity;
                            existing.total += totalProducto;
                        } else {
                            productosMap.set(productName, {
                                nombre: productName,
                                productId: productId,
                                cantidad: quantity,
                                precioUnitario: unitPriceConIva,
                                total: totalProducto
                            });
                        }
                    }
                }
            }
            if (tieneAccesorios) {
                totalVentasConAccesorios++;
            }
        }
        
        // Guardar datos de asesores en cache (convertir a array)
        const asesores = Array.from(asesorMap.values()).sort((a, b) => b.cantidad - a.cantidad);
        cachedAccesoriosData = { date: date, asesores: asesores, totalUnidades: totalUnidades };
        
        // Calcular el margen promedio
        let marginInfo = null;
        let marginHtml = '';
        
        if (productosMap.size > 0 && totalVentaGeneral > 0) {
            // Mostrar indicador de carga mientras se calculan los márgenes
            document.getElementById('accesoriosResults').innerHTML = `
                <div class="stats">
                    <div class="stat-card"><div class="stat-number">${totalUnidades}</div><div class="stat-label">Total Unidades</div></div>
                    <div class="stat-card"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalVentaGeneral)}</div><div class="stat-label">Total Venta</div></div>
                    <div class="stat-card"><div class="stat-number">${totalVentasConAccesorios}</div><div class="stat-label">Ventas con accesorios</div></div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);"><div class="stat-number"><span class="loading-spinner-small"></span></div><div class="stat-label">📊 Calculando margen...</div></div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); cursor: pointer;" id="btnAsesorSummaryAccesorios">
                        <div class="stat-number">👥 ${asesores.length}</div>
                        <div class="stat-label">Resumen Asesores</div>
                    </div>
                </div>
                <div class="table-container"><table class="accesorios-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio Unitario</th><th>Total</th><th>Costo Unitario</th><th>Margen</th></tr></thead><tbody><tr><td colspan="6" style="text-align: center; padding: 20px;">⏳ Calculando costos de productos......</div></tr></tbody>}</div>
            `;
            document.getElementById('accesoriosResults').style.display = 'block';
            
            marginInfo = await calculateAverageMargin(productosMap, totalVentaGeneral);
            
            if (marginInfo) {
                marginHtml = `
                    <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                        <div class="stat-number" style="color: #ffffff;">${marginInfo.margenPromedio.toFixed(1)}%</div>
                        <div class="stat-label" style="color: #e9d5ff;">📊 Margen Promedio</div>
                        <div style="font-size: 0.7rem; margin-top: 8px; color: #c4b5fd;">
                            Utilidad: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(marginInfo.utilidadTotal)}
                        </div>
                    </div>
                `;
            } else {
                marginHtml = `
                    <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                        <div class="stat-number" style="color: #ffffff;">❌</div>
                        <div class="stat-label" style="color: #e9d5ff;">Margen Promedio</div>
                        <div style="font-size: 0.7rem; margin-top: 8px; color: #c4b5fd;">No se pudo calcular</div>
                    </div>
                `;
            }
        } else {
            marginHtml = `
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number" style="color: #ffffff;">N/A</div>
                    <div class="stat-label" style="color: #e9d5ff;">📊 Margen Promedio</div>
                    <div style="font-size: 0.7rem; margin-top: 8px; color: #c4b5fd;">Sin productos</div>
                </div>
            `;
        }
        
        const resultados = Array.from(productosMap.values());
        resultados.sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        const statsHtml = `
            <div class="stats">
                <div class="stat-card"><div class="stat-number">${totalUnidades}</div><div class="stat-label">Total Unidades</div></div>
                <div class="stat-card"><div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalVentaGeneral)}</div><div class="stat-label">Total Venta</div></div>
                <div class="stat-card"><div class="stat-number">${totalVentasConAccesorios}</div><div class="stat-label">Ventas con accesorios</div></div>
                ${marginHtml}
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); cursor: pointer;" id="btnAsesorSummaryAccesorios">
                    <div class="stat-number">👥 ${asesores.length}</div>
                    <div class="stat-label">Resumen Asesores</div>
                </div>
            </div>
        `;
        
        let tableHtml = `<div class="table-container"><table class="accesorios-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio Unitario</th><th>Total</th><th>Costo Unitario</th><th>Margen</th></tr></thead><tbody>`;
        
        if (resultados.length > 0) {
            for (let item of resultados) {
                // Mostrar el costo unitario
                let costoDisplay = '';
                if (item.costoObtenido !== null && item.costoObtenido !== undefined) {
                    costoDisplay = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(item.costoObtenido);
                } else {
                    costoDisplay = '<span style="color: #9ca3af;">N/A</span>';
                }
                
                // Mostrar solo el porcentaje del margen
                let margenDisplay = '';
                if (item.margenProducto !== null && item.margenProducto !== undefined) {
                    const margen = item.margenProducto;
                    const margenColor = margen >= 40 ? '#10b981' : (margen >= 20 ? '#f59e0b' : '#ef4444');
                    margenDisplay = `<span style="font-weight: bold; color: ${margenColor};">${margen.toFixed(1)}%</span>`;
                } else {
                    margenDisplay = '<span style="color: #9ca3af;">N/A</span>';
                }
                
                tableHtml += `<tr>
                    <td><strong>${escapeHtml(item.nombre)}</strong></div>
                    <td style="text-align:center">${item.cantidad}</div>
                    <td style="text-align:right">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(item.precioUnitario)}</div>
                    <td style="text-align:right">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(item.total)}</div>
                    <td style="text-align:right">${costoDisplay}</div>
                    <td style="text-align:center">${margenDisplay}</div>
                </tr>`;
            }
        } else {
            tableHtml += '<tr><td colspan="6" style="text-align: center; padding: 20px;">⚠️ No se encontraron accesorios para esta fecha</div></tr>';
        }
        
        tableHtml += `</tbody></table></div>`;
        
        document.getElementById('accesoriosResults').innerHTML = statsHtml + tableHtml;
        document.getElementById('accesoriosResults').style.display = 'block';
        
        // Evento para el botón de resumen de asesores
        const btnAsesorSummary = document.getElementById('btnAsesorSummaryAccesorios');
        if (btnAsesorSummary) {
            btnAsesorSummary.addEventListener('click', (e) => {
                e.stopPropagation();
                openAsesorSummaryAccesoriosModal();
            });
        }
        
        if (productosMap.size > 0 && totalVentaGeneral > 0 && marginInfo) {
            showInfo('accesorios', `📊 Margen promedio del día: ${marginInfo.margenPromedio.toFixed(1)}% (Utilidad: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(marginInfo.utilidadTotal)})`, false);
        } else if (productosMap.size === 0) {
            showInfo('accesorios', '⚠️ No se encontraron accesorios para esta fecha', true);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('accesorios', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Modal de resumen por asesor - Accesorios (agrupado por equipos)
function openAsesorSummaryAccesoriosModal() {
    if (!cachedAccesoriosData || !cachedAccesoriosData.asesores) { 
        showError('accesorios', 'Primero consulta las ventas de accesorios'); 
        return; 
    }
    
    const asesores = cachedAccesoriosData.asesores;
    const totalUnidades = cachedAccesoriosData.totalUnidades;
    const fecha = cachedAccesoriosData.date;
    
    // Convertir array de asesores a Map para la función de agrupación
    const ventasPorAsesor = new Map();
    for (const asesor of asesores) {
        ventasPorAsesor.set(asesor.id || asesor.nombre, {
            id: asesor.id,
            nombre: asesor.nombre,
            cantidad: asesor.cantidad
        });
    }
    
    // Construir estructura por equipos
    const equipos = [];
    
    for (const [teamName, teamData] of Object.entries(TEAM_STRUCTURE)) {
        // Datos del líder
        let liderCantidad = 0;
        let liderInfo = null;
        
        if (teamData.liderId && ventasPorAsesor.has(teamData.liderId)) {
            liderInfo = ventasPorAsesor.get(teamData.liderId);
            liderCantidad = liderInfo.cantidad;
        } else {
            // Buscar por nombre si no se encontró por ID
            for (const [key, value] of ventasPorAsesor) {
                if (value.nombre === teamData.liderNombre) {
                    liderCantidad = value.cantidad;
                    liderInfo = value;
                    break;
                }
            }
        }
        
        // Datos de los miembros
        const miembros = [];
        let equipoTotal = liderCantidad;
        
        for (const miembroId of teamData.miembros) {
            let miembroCantidad = 0;
            let miembroInfo = null;
            
            if (ventasPorAsesor.has(miembroId)) {
                miembroInfo = ventasPorAsesor.get(miembroId);
                miembroCantidad = miembroInfo.cantidad;
            } else {
                // Buscar por nombre (puede no tener el ID registrado)
                for (const [key, value] of ventasPorAsesor) {
                    if (value.id === miembroId) {
                        miembroCantidad = value.cantidad;
                        miembroInfo = value;
                        break;
                    }
                }
            }
            
            if (miembroCantidad > 0 && miembroInfo) {
                miembros.push({
                    nombre: miembroInfo.nombre,
                    cantidad: miembroCantidad
                });
                equipoTotal += miembroCantidad;
            }
        }
        
        // Ordenar miembros por cantidad descendente
        miembros.sort((a, b) => b.cantidad - a.cantidad);
        
        if (equipoTotal > 0) {
            equipos.push({
                nombre: teamName,
                liderNombre: teamData.liderNombre,
                liderCantidad: liderCantidad,
                miembros: miembros,
                equipoTotal: equipoTotal
            });
        }
    }
    
    // Ordenar equipos por total
    equipos.sort((a, b) => b.equipoTotal - a.equipoTotal);
    
    const totalGeneral = equipos.reduce((sum, e) => sum + e.equipoTotal, 0);
    
    // Crear modal
    let modal = document.getElementById('asesorSummaryAccesoriosModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'asesorSummaryAccesoriosModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3>👥 Resumen por Equipo - Accesorios</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                    <button id="exportAccesoriosExcelBtn" style="background: #10b981; padding: 6px 12px; font-size: 12px; border-radius: 6px;">📊 Exportar a Excel</button>
                </div>
                <div class="modal-body" id="asesorSummaryAccesoriosModalBody"></div>
                <div class="modal-footer">
                    Ventas de accesorios | Cantidad de piezas
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    
    // Generar HTML con estructura jerárquica
    let html = `
        <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">
            <div style="flex: 1; background: #059669; color: white; padding: 12px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${totalGeneral}</div>
                <div style="font-size: 11px;">📦 Total Piezas</div>
            </div>
            <div style="flex: 1; background: #047857; color: white; padding: 12px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${equipos.length}</div>
                <div style="font-size: 11px;">👥 Equipos con ventas</div>
            </div>
        </div>
        
        <div style="max-height: 500px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead style="position: sticky; top: 0; background: #f8fafc;">
                    <tr style="border-bottom: 2px solid #059669;">
                        <th style="padding: 10px; text-align: center;">#</th>
                        <th style="padding: 10px; text-align: left;">Equipo / Asesor</th>
                        <th style="padding: 10px; text-align: center;">📦 Piezas</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let index = 1;
    for (const equipo of equipos) {
        // Fila del equipo
        html += `
            <tr style="background-color: #e8f4f8; border-top: 2px solid #059669;">
                <td style="padding: 8px; text-align: center; font-weight: bold;">${index}</div>
                <td style="padding: 8px; text-align: left; font-weight: bold; color: #059669;">📁 ${equipo.nombre}</div>
                <td style="padding: 8px; text-align: center; font-weight: bold;">${equipo.equipoTotal}</div>
             </tr>
        `;
        index++;
        
        // Fila del líder
        html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; text-align: center;"></div>
                <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">👑 ${equipo.liderNombre}</div>
                <td style="padding: 6px 8px; text-align: center; ${equipo.liderCantidad === 0 ? 'color: #94a3b8;' : 'font-weight: bold;'}">${equipo.liderCantidad}</div>
             </tr>
        `;
        
        // Filas de los miembros
        for (const miembro of equipo.miembros) {
            html += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px 8px; text-align: center;"></div>
                    <td style="padding: 6px 8px; text-align: left; padding-left: 28px;">└─ ${escapeHtml(miembro.nombre)}</div>
                    <td style="padding: 6px 8px; text-align: center;">${miembro.cantidad}</div>
                 </tr>
            `;
        }
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('asesorSummaryAccesoriosModalBody').innerHTML = html;
    modal.style.display = 'block';
    
    // Event listener para exportar a Excel
    const exportBtn = document.getElementById('exportAccesoriosExcelBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportAccesoriosToExcel(equipos, totalGeneral, fecha));
    }
}

// Función para exportar a Excel
function exportAccesoriosToExcel(equipos, totalGeneral, fecha) {
    // Preparar datos para Excel
    const excelData = [
        ['Resumen por Equipo - Accesorios'],
       // [`Fecha: ${formatDate(fecha)}`],
        [],
        ['#', 'Equipo / Asesor', 'Piezas']
    ];
    
    let index = 1;
    for (const equipo of equipos) {
        // Fila del equipo
        //excelData.push([index, equipo.nombre, equipo.equipoTotal]);
        //index++;
        
        // Fila del líder
        excelData.push(['Lider', `${equipo.liderNombre}`, equipo.liderCantidad]);
        
        // Filas de los miembros
        for (const miembro of equipo.miembros) {
            excelData.push(['', `${miembro.nombre}`, miembro.cantidad]);
        }
        
        // Línea separadora
        excelData.push(['', '', '']);
    }
    
    // Agregar total general
    excelData.push(['', 'TOTAL GENERAL:', totalGeneral]);
    excelData.push([]);
   // excelData.push(['Nota:', 'Los líderes aparecen con 👑 y los miembros con └─']);
    
    // Llamar a la función global de exportación
    if (typeof exportToExcel === 'function') {
        exportToExcel(excelData, `resumen_accesorios_${fecha}`);
    } else {
        console.error('La función exportToExcel no está disponible');
        alert('Error: No se pudo exportar. La función de exportación no está disponible.');
    }
}

// Agregar estilo para el spinner pequeño si no existe
if (!document.querySelector('#accesorios-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'accesorios-spinner-style';
    style.textContent = `
        .loading-spinner-small {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}