// ==================== MÓDULO: COBRO DE SERVICIOS ====================

// Lista de servicios con sus IDs y comisiones
const SERVICIOS_CONFIG = [
    { id: 214, nombre: "Pago SPAY", comision: 10 },
    { id: 215, nombre: "Pago PayJoy", comision: 10 },
    { id: 216, nombre: "Pago Credicel", comision: 10 },
    { id: 219, nombre: "Recarga Subdistribuidor", comision: 0 },
    //{ id: 237, nombre: "Portabilidad Telcel", comision: 0 },
    //{ id: 238, nombre: "Portabilidad Servicel", comision: 0 },
    { id: 259, nombre: "Pago Pospago Telcel", comision: 10 },
    { id: 260, nombre: "Pago Amigo Paguitos", comision: 10 },
    { id: 995, nombre: "Abono Capital SPAY", comision: 0 },
    { id: 1094, nombre: "Reparación Credicel", comision: 0 }
];

// Función para consultar un servicio específico
async function fetchServicioData(productId, startDateTime, endDateTime) {
    // Usamos per_page=1 porque solo nos interesan los totales
    const url = `${CONFIG.API_SALES}?page=1&per_page=1&total=1&sale_type=services&start_date=${startDateTime}&end_date=${endDateTime}&product_ids[]=${productId}`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            console.warn(`Error consultando servicio ${productId}: ${response.status}`);
            return { neto: 0, cantidad: 0 };
        }
        
        const data = await response.json();
        
        // Cantidad de transacciones: viene en meta.total
        const cantidad = data.meta?.total || 0;
        
        // Neto cobrado: viene en data.total (fuera del meta)
        const neto = parseFloat(data.total) || 0;
        
        return { neto: neto, cantidad: cantidad };
        
    } catch (error) {
        console.error(`Error en fetchServicioData para ${productId}:`, error);
        return { neto: 0, cantidad: 0 };
    }
}

async function searchServicios() {
    const date = document.getElementById('serviciosDate').value;
    if (!date) {
        showError('servicios', 'Seleccione una fecha');
        return;
    }

    const btn = document.getElementById('searchServiciosBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando servicios... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('serviciosResults').style.display = 'none';
    document.getElementById('serviciosErrorAlert').style.display = 'none';
    document.getElementById('serviciosInfoAlert').style.display = 'none';

    try {
        const range = getDateRangeServicios(date);
        if (!range) throw new Error('Error en fecha');
        
        const startDateTime = range.start;
        const endDateTime = range.end;
        
        // Consultar todos los servicios en paralelo
        const promises = SERVICIOS_CONFIG.map(servicio => 
            fetchServicioData(servicio.id, startDateTime, endDateTime)
        );
        
        const resultadosServicios = await Promise.all(promises);
        
        // Procesar resultados
        const serviciosMap = new Map();
        let totalTransacciones = 0;
        let totalNetoGeneral = 0;
        let totalComisionesGeneral = 0;
        
        for (let i = 0; i < SERVICIOS_CONFIG.length; i++) {
            const servicio = SERVICIOS_CONFIG[i];
            const data = resultadosServicios[i];
            
            if (data.cantidad > 0) {
                const comisionTotal = data.cantidad * servicio.comision;
                const montoCobrado = data.neto - comisionTotal;
                
                serviciosMap.set(servicio.nombre, {
                    nombre: servicio.nombre,
                    cantidad: data.cantidad,
                    monto: montoCobrado,
                    comisiones: comisionTotal,
                    neto: data.neto
                });
                
                totalTransacciones += data.cantidad;
                totalNetoGeneral += data.neto;
                totalComisionesGeneral += comisionTotal;
            }
        }
        
        const totalMontoGeneral = totalNetoGeneral - totalComisionesGeneral;
        
        // Actualizar estadísticas
        document.getElementById('serviciosTotalTransacciones').innerHTML = totalTransacciones;
        document.getElementById('serviciosTotalMonto').innerHTML = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalMontoGeneral);
        document.getElementById('serviciosTotalComisiones').innerHTML = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalComisionesGeneral);
        document.getElementById('serviciosTotalNeto').innerHTML = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalNetoGeneral);
        
        // Convertir a array y ordenar de mayor a menor por monto cobrado
        const resultados = Array.from(serviciosMap.values());
        resultados.sort((a, b) => b.monto - a.monto);
        
        // Renderizar tabla
        const tbody = document.getElementById('serviciosTableBody');
        
        if (resultados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">⚠️ No se encontraron cobros de servicios para esta fecha</div></tr>';
        } else {
            let html = '';
            resultados.forEach((item, index) => {
                html += `
                    <tr>
                        <td style="text-align: center; width: 50px;">${index + 1}</div>
                        <td><strong>${escapeHtml(item.nombre)}</strong></div>
                        <td style="text-align: center;">${item.cantidad}</div>
                        <td style="text-align: right; color: #059669;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.monto)}</div>
                        <td style="text-align: right; color: #ea580c;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.comisiones)}</div>
                        <td style="text-align: right; color: #7c3aed;"><strong>${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.neto)}</strong></div>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
        
        document.getElementById('serviciosResults').style.display = 'block';
        
        if (totalTransacciones === 0) {
            showInfo('servicios', `⚠️ No se encontraron cobros de servicios para el día ${formatDate(date)}`, true);
        } else {
            showInfo('servicios', `✅ Se encontraron ${totalTransacciones} transacciones de servicios`, false);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('servicios', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Función para obtener rango de fecha (misma que contado)
function getDateRangeServicios(dateStr) {
    if (!dateStr) return null;
    const startDate = new Date(dateStr);
    startDate.setHours(18, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const startStr = startDate.toISOString().slice(0, 19).replace('T', '+');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', '+');
    
    return { start: startStr, end: endStr };
}