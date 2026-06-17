// ==================== MÓDULO: VENTAS TOTALES ====================

// Función para formatear moneda a 2 decimales consistentemente
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', { 
        style: 'currency', 
        currency: 'MXN', 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

// Función para obtener el total de un sale_type específico en un rango de fechas
async function fetchTotalBySaleType(startDateTime, endDateTime, saleType) {
    let url = `${CONFIG.API_SALES}?page=1&per_page=1&total=1&start_date=${startDateTime}&end_date=${endDateTime}&sale_type=${saleType}`;
    
    try {
        const response = await fetch(url, { 
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } 
        });
        
        if (!response.ok) {
            console.warn(`Error HTTP ${response.status} para ${saleType}`);
            return 0;
        }
        
        const data = await response.json();
        
        let total = 0;
        if (data.total !== undefined && data.total !== null) {
            total = parseFloat(data.total);
        }
        
        return total;
        
    } catch (error) {
        console.error(`Error en fetchTotalBySaleType (${saleType}):`, error);
        return 0;
    }
}

// Función para obtener el nombre del día de la semana en español (versión corta)
function getDayName(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[date.getUTCDay()];
}

// Función para formatear fecha como "Jue 04/06"
function formatDateWithDay(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dayName = getDayName(year, month, day);
    const dayFormatted = String(day).padStart(2, '0');
    const monthFormatted = String(month).padStart(2, '0');
    return `${dayName} ${dayFormatted}/${monthFormatted}`;
}

// Función para obtener datos (puede ser 1 día o 7 días)
async function fetchData(referenceDate, verSemana) {
    const data = [];
    const saleTypes = ['products', 'services', 'credit'];
    const referenceDateObj = new Date(referenceDate);
    
    let startIndex, endIndex;
    
    if (verSemana) {
        // 7 días: desde hace 6 días atrás hasta la fecha de referencia
        startIndex = 6;
        endIndex = 0;
    } else {
        // Solo 1 día: solo la fecha de referencia
        startIndex = 0;
        endIndex = 0;
    }
    
    for (let i = startIndex; i >= endIndex; i--) {
        const consultDate = new Date(referenceDateObj);
        consultDate.setDate(referenceDateObj.getDate() - i);
        const dateStr = consultDate.toISOString().split('T')[0];
        
        const startDateForDay = new Date(dateStr);
        startDateForDay.setHours(18, 0, 0, 0);
        const endDateForDay = new Date(startDateForDay);
        endDateForDay.setDate(endDateForDay.getDate() + 1);
        
        const startDateTime = startDateForDay.toISOString().slice(0, 19).replace('T', '+');
        const endDateTime = endDateForDay.toISOString().slice(0, 19).replace('T', '+');
        
        console.log(`Consultando día: ${dateStr} | Rango: ${startDateTime} → ${endDateTime}`);
        
        const [totalProducts, totalServices, totalCredit] = await Promise.all([
            fetchTotalBySaleType(startDateTime, endDateTime, 'products'),
            fetchTotalBySaleType(startDateTime, endDateTime, 'services'),
            fetchTotalBySaleType(startDateTime, endDateTime, 'credit')
        ]);
        
        const dayTotal = totalProducts + totalServices + totalCredit;
        
        data.push({
            fecha: dateStr,
            fechaDisplay: formatDateWithDay(dateStr),
            products: totalProducts,
            services: totalServices,
            credit: totalCredit,
            total: dayTotal
        });
    }
    
    return data;
}

// Variables globales para almacenar los datos de las gráficas
let cachedData = null;
let cachedTotalGeneralProducts = 0;
let cachedTotalGeneralServices = 0;
let cachedTotalGeneralCredit = 0;
let cachedTotalGeneralAll = 0;
let cachedVerSemana = true;

// Gráfica de pastel
function renderPieChart(productsTotal, servicesTotal, creditTotal, totalGeneral) {
    const ctx = document.getElementById('ventasPieChart');
    if (!ctx) {
        console.warn('No se encontró el canvas ventasPieChart');
        return;
    }
    
    if (window.ventasChart && typeof window.ventasChart.destroy === 'function') {
        window.ventasChart.destroy();
    }
    
    const porcentajeProducts = totalGeneral > 0 ? ((productsTotal / totalGeneral) * 100).toFixed(1) : 0;
    const porcentajeServices = totalGeneral > 0 ? ((servicesTotal / totalGeneral) * 100).toFixed(1) : 0;
    const porcentajeCredit = totalGeneral > 0 ? ((creditTotal / totalGeneral) * 100).toFixed(1) : 0;
    
    window.ventasChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [
                `📱 Productos: ${formatCurrency(productsTotal)} (${porcentajeProducts}%)`,
                `💰 Servicios: ${formatCurrency(servicesTotal)} (${porcentajeServices}%)`,
                `💳 Crédito: ${formatCurrency(creditTotal)} (${porcentajeCredit}%)`
            ],
            datasets: [{
                data: [productsTotal, servicesTotal, creditTotal],
                backgroundColor: ['#3b82f6', '#10b981', '#f97316'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: 11 },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            }
        }
    });
}

// Gráfica de líneas (evolución diaria)
function renderLineChart(data) {
    const ctx = document.getElementById('ventasLineChart');
    if (!ctx) {
        console.warn('No se encontró el canvas ventasLineChart');
        return;
    }
    
    if (window.ventasLineChart && typeof window.ventasLineChart.destroy === 'function') {
        window.ventasLineChart.destroy();
    }
    
    const labels = data.map(d => d.fechaDisplay);
    const productsData = data.map(d => d.products);
    const servicesData = data.map(d => d.services);
    const creditData = data.map(d => d.credit);
    
    window.ventasLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '📱 Productos',
                    data: productsData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: '💰 Servicios',
                    data: servicesData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#10b981'
                },
                {
                    label: '💳 Crédito',
                    data: creditData,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#f97316'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let value = context.raw;
                            return `${label}: ${formatCurrency(value)}`;
                        }
                    }
                },
                legend: {
                    position: 'top',
                    labels: {
                        font: { size: 11 },
                        usePointStyle: true,
                        boxWidth: 10
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        },
                        font: { size: 10 }
                    },
                    grid: {
                        color: '#e2e8f0'
                    }
                },
                x: {
                    ticks: {
                        font: { size: 10 },
                        rotation: 0
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Función para abrir modal con gráfica expandida
function openChartModal(chartType) {
    const modal = document.getElementById('chartModal');
    if (!modal) {
        console.error('No se encontró el modal chartModal');
        return;
    }
    
    const modalTitle = document.getElementById('chartModalTitle');
    const modalBody = document.getElementById('chartModalBody');
    
    if (chartType === 'pie') {
        modalTitle.innerHTML = '📊 Distribución de Ventas por Tipo';
        modalBody.innerHTML = '<canvas id="modalPieChart" style="max-height: 500px; width: 100%;"></canvas>';
        modal.style.display = 'block';
        
        setTimeout(() => {
            const ctx = document.getElementById('modalPieChart');
            if (ctx) {
                if (window.modalPieChart && typeof window.modalPieChart.destroy === 'function') {
                    window.modalPieChart.destroy();
                }
                
                const totalGeneral = cachedTotalGeneralAll;
                const productsTotal = cachedTotalGeneralProducts;
                const servicesTotal = cachedTotalGeneralServices;
                const creditTotal = cachedTotalGeneralCredit;
                
                const porcentajeProducts = totalGeneral > 0 ? ((productsTotal / totalGeneral) * 100).toFixed(1) : 0;
                const porcentajeServices = totalGeneral > 0 ? ((servicesTotal / totalGeneral) * 100).toFixed(1) : 0;
                const porcentajeCredit = totalGeneral > 0 ? ((creditTotal / totalGeneral) * 100).toFixed(1) : 0;
                
                window.modalPieChart = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: [
                            `📱 Productos: ${formatCurrency(productsTotal)} (${porcentajeProducts}%)`,
                            `💰 Servicios: ${formatCurrency(servicesTotal)} (${porcentajeServices}%)`,
                            `💳 Crédito: ${formatCurrency(creditTotal)} (${porcentajeCredit}%)`
                        ],
                        datasets: [{
                            data: [productsTotal, servicesTotal, creditTotal],
                            backgroundColor: ['#3b82f6', '#10b981', '#f97316'],
                            borderWidth: 0,
                            hoverOffset: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    font: { size: 14 },
                                    padding: 15,
                                    usePointStyle: true,
                                    pointStyle: 'circle'
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const label = context.label || '';
                                        const value = context.raw;
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                        return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }, 100);
        
    } else if (chartType === 'line') {
        modalTitle.innerHTML = '📈 Evolución Diaria de Ventas';
        modalBody.innerHTML = '<canvas id="modalLineChart" style="max-height: 500px; width: 100%;"></canvas>';
        modal.style.display = 'block';
        
        setTimeout(() => {
            const ctx = document.getElementById('modalLineChart');
            if (ctx && cachedData) {
                if (window.modalLineChart && typeof window.modalLineChart.destroy === 'function') {
                    window.modalLineChart.destroy();
                }
                
                const labels = cachedData.map(d => d.fechaDisplay);
                const productsData = cachedData.map(d => d.products);
                const servicesData = cachedData.map(d => d.services);
                const creditData = cachedData.map(d => d.credit);
                
                window.modalLineChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: '📱 Productos',
                                data: productsData,
                                borderColor: '#3b82f6',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.3,
                                pointRadius: 5,
                                pointHoverRadius: 8,
                                pointBackgroundColor: '#3b82f6'
                            },
                            {
                                label: '💰 Servicios',
                                data: servicesData,
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.3,
                                pointRadius: 5,
                                pointHoverRadius: 8,
                                pointBackgroundColor: '#10b981'
                            },
                            {
                                label: '💳 Crédito',
                                data: creditData,
                                borderColor: '#f97316',
                                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.3,
                                pointRadius: 5,
                                pointHoverRadius: 8,
                                pointBackgroundColor: '#f97316'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        interaction: {
                            mode: 'index',
                            intersect: false
                        },
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        let value = context.raw;
                                        return `${label}: ${formatCurrency(value)}`;
                                    }
                                }
                            },
                            legend: {
                                position: 'top',
                                labels: {
                                    font: { size: 14 },
                                    usePointStyle: true,
                                    boxWidth: 12
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return formatCurrency(value);
                                    },
                                    font: { size: 12 }
                                },
                                grid: {
                                    color: '#e2e8f0'
                                }
                            },
                            x: {
                                ticks: {
                                    font: { size: 12 },
                                    rotation: 0
                                },
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                });
            }
        }, 100);
    }
}

// Función para cerrar el modal
function closeChartModal() {
    const modal = document.getElementById('chartModal');
    if (modal) {
        modal.style.display = 'none';
        const modalBody = document.getElementById('chartModalBody');
        if (modalBody) {
            modalBody.innerHTML = '';
        }
    }
}

// Función principal
async function searchVentasTotales() {
    const userSelectedDate = document.getElementById('ventasTotalesEndDate').value;
    const verSemana = document.getElementById('verSemanaCheckbox').checked;
    
    if (!userSelectedDate) {
        showError('ventasTotales', 'Seleccione una fecha');
        return;
    }

    const btn = document.getElementById('searchVentasTotalesBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('ventasTotalesResults').style.display = 'none';
    document.getElementById('ventasTotalesErrorAlert').style.display = 'none';
    document.getElementById('ventasTotalesInfoAlert').style.display = 'none';

    try {
        const data = await fetchData(userSelectedDate, verSemana);
        
        let totalGeneralProducts = 0;
        let totalGeneralServices = 0;
        let totalGeneralCredit = 0;
        let totalGeneralAll = 0;
        
        data.forEach(day => {
            totalGeneralProducts += day.products;
            totalGeneralServices += day.services;
            totalGeneralCredit += day.credit;
            totalGeneralAll += day.total;
        });
        
        // Guardar en caché para el modal
        cachedData = data;
        cachedTotalGeneralProducts = totalGeneralProducts;
        cachedTotalGeneralServices = totalGeneralServices;
        cachedTotalGeneralCredit = totalGeneralCredit;
        cachedTotalGeneralAll = totalGeneralAll;
        cachedVerSemana = verSemana;
        
        const porcentajeProducts = totalGeneralAll > 0 ? ((totalGeneralProducts / totalGeneralAll) * 100).toFixed(1) : 0;
        const porcentajeServices = totalGeneralAll > 0 ? ((totalGeneralServices / totalGeneralAll) * 100).toFixed(1) : 0;
        const porcentajeCredit = totalGeneralAll > 0 ? ((totalGeneralCredit / totalGeneralAll) * 100).toFixed(1) : 0;
        
        const fechaInicio = formatDateWithDay(data[0].fecha);
        const fechaFin = formatDateWithDay(data[data.length - 1].fecha);
        const periodoTexto = verSemana ? `últimos 7 días (${fechaInicio} al ${fechaFin})` : `día ${fechaFin}`;
        
        let html = `
            <div class="alert alert-info" style="margin-bottom: 20px;">
                📅 Período consultado: <strong>${periodoTexto}</strong><br>
                ⚡ Fecha de referencia: ${formatDateWithDay(userSelectedDate)} ${verSemana ? '(incluida en la consulta - ÚLTIMA FILA DE LA TABLA)' : ''}<br>
                ⚡ Cada día se consulta desde las 6:00 AM hasta las 6:00 AM del día siguiente
            </div>
            
            <div class="stats" style="margin-bottom: 24px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number">${formatCurrency(totalGeneralAll)}</div>
                    <div class="stat-label">💰 TOTAL ${verSemana ? 'SEMANAL' : 'DEL DÍA'}</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                    <div class="stat-number">${formatCurrency(totalGeneralProducts)}</div>
                    <div class="stat-label">📱 Productos (${porcentajeProducts}%)</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);">
                    <div class="stat-number">${formatCurrency(totalGeneralServices)}</div>
                    <div class="stat-label">💰 Servicios (${porcentajeServices}%)</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                    <div class="stat-number">${formatCurrency(totalGeneralCredit)}</div>
                    <div class="stat-label">💳 Crédito (${porcentajeCredit}%)</div>
                </div>
            </div>
        `;
        
        // Solo mostrar la tabla si hay más de 1 día
        if (data.length > 1) {
            html += `
            <div class="table-container">
                <table class="ventas-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th style="text-align: right;">📱 Productos</th>
                            <th style="text-align: right;">💰 Servicios</th>
                            <th style="text-align: right;">💳 Crédito</th>
                            <th style="text-align: right;">📊 Total Día</th>
                            <th style="text-align: center;">📈 % Semana</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            for (let i = 0; i < data.length; i++) {
                const day = data[i];
                const fechaMostrar = day.fechaDisplay;
                const porcentajeSemana = totalGeneralAll > 0 ? ((day.total / totalGeneralAll) * 100).toFixed(1) : 0;
                
                const isLastDay = (i === data.length - 1);
                const rowStyle = isLastDay ? 'background-color: #fff3e0; border-left: 4px solid #f97316;' : '';
                
                html += `
                    <tr style="${rowStyle}">
                        <td style="font-weight: bold; ${isLastDay ? 'color: #f97316;' : ''}">${fechaMostrar}${isLastDay ? ' 📍' : ''}</div>
                        <td style="text-align: right; color: #3b82f6;">${formatCurrency(day.products)}</div>
                        <td style="text-align: right; color: #10b981;">${formatCurrency(day.services)}</div>
                        <td style="text-align: right; color: #f97316;">${formatCurrency(day.credit)}</div>
                        <td style="text-align: right; font-weight: bold; background: #f0f9ff;">${formatCurrency(day.total)}</div>
                        <td style="text-align: center;">
                            <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                                <div style="width: 60px; background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 8px;">
                                    <div style="width: ${porcentajeSemana}%; background: linear-gradient(90deg, #f97316, #ea580c); height: 100%; border-radius: 20px;"></div>
                                </div>
                                <span style="font-size: 0.75rem; font-weight: 600; color: #f97316;">${porcentajeSemana}%</span>
                            </div>
                        </div>
                    </tr>
                `;
            }
            
            html += `
                    </tbody>
                </table>
            </div>
            `;
        }
        
        // Gráficas
        if (data.length > 1) {
            html += `
            <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 24px; margin-top: 30px;">
                <div style="background: #f8fafc; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; cursor: pointer;" onclick="openChartModal('pie')">
                    <h4 style="color: #1e40af; margin-bottom: 16px; text-align: center;">📊 Distribución por Tipo</h4>
                    <canvas id="ventasPieChart" style="max-height: 280px; width: 100%;"></canvas>
                    <div style="text-align: center; margin-top: 10px; font-size: 11px; color: #64748b;">🔍 Haz clic para ampliar</div>
                </div>
                <div style="background: #f8fafc; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; cursor: pointer;" onclick="openChartModal('line')">
                    <h4 style="color: #1e40af; margin-bottom: 16px; text-align: center;">📈 Evolución Diaria</h4>
                    <canvas id="ventasLineChart" style="max-height: 280px; width: 100%;"></canvas>
                    <div style="text-align: center; margin-top: 10px; font-size: 11px; color: #64748b;">🔍 Haz clic para ampliar</div>
                </div>
            </div>
            `;
        } else {
            // Solo un día: mostrar solo la gráfica de pastel
            html += `
            <div style="display: flex; justify-content: center; margin-top: 30px;">
                <div style="width: 50%; background: #f8fafc; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; cursor: pointer;" onclick="openChartModal('pie')">
                    <h4 style="color: #1e40af; margin-bottom: 16px; text-align: center;">📊 Distribución por Tipo</h4>
                    <canvas id="ventasPieChart" style="max-height: 280px; width: 100%;"></canvas>
                    <div style="text-align: center; margin-top: 10px; font-size: 11px; color: #64748b;">🔍 Haz clic para ampliar</div>
                </div>
            </div>
            `;
        }
        
        document.getElementById('ventasTotalesResults').innerHTML = html;
        document.getElementById('ventasTotalesResults').style.display = 'block';
        
        setTimeout(() => {
            renderPieChart(totalGeneralProducts, totalGeneralServices, totalGeneralCredit, totalGeneralAll);
            if (data.length > 1) {
                renderLineChart(data);
            }
        }, 200);
        
        if (totalGeneralAll === 0) {
            showInfo('ventasTotales', `⚠️ No se encontraron ventas para el ${periodoTexto}`, true);
        } else {
            showInfo('ventasTotales', `✅ Datos cargados: Total: ${formatCurrency(totalGeneralAll)}`, false);
        }
        
    } catch (error) {
        console.error('Error en Ventas Totales:', error);
        showError('ventasTotales', `Error al consultar ventas: ${error.message}`);
        document.getElementById('ventasTotalesResults').style.display = 'none';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Hacer las funciones globales
window.openChartModal = openChartModal;
window.closeChartModal = closeChartModal;