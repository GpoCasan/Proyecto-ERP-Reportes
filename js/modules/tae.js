// ==================== MÓDULO: TAE (USANDO ENDPOINT ERP - RÁPIDO) ====================

// Variable global para almacenar datos de desglose
let cachedTaeData = null;
let cachedHistoricalData = null;

// Función para consultar total de un grupo de productos
async function fetchTaeTotal(productIds, startDateTime, endDateTime) {
    if (!productIds || productIds.length === 0) return 0;
    
    let url = `${CONFIG.API_REPORTS}/sales/product-sales?start_date=${startDateTime}&end_date=${endDateTime}&page=1&per_page=1`;
    productIds.forEach(id => {
        url += `&product_ids[]=${id}`;
    });
    
    try {
        const response = await fetch(url, { 
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } 
        });
        
        if (!response.ok) {
            console.warn(`Error HTTP ${response.status}`);
            return 0;
        }
        
        const data = await response.json();
        
        let total = 0;
        if (data.total_amount !== undefined && data.total_amount !== null) {
            total = parseFloat(data.total_amount);
        } else if (data.total !== undefined && data.total !== null) {
            total = parseFloat(data.total);
        }
        
        return total;
        
    } catch (error) {
        console.error('Error en fetchTaeTotal:', error);
        return 0;
    }
}

// Función para obtener el nombre del día en español (corto) - CORREGIDA
function getDayNameShort(dateStr) {
    // Dividir la fecha en partes para evitar problemas de zona horaria
    const [year, month, day] = dateStr.split('-').map(Number);
    // Crear fecha usando UTC para evitar desfases
    const date = new Date(Date.UTC(year, month - 1, day));
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[date.getUTCDay()];
}

// Función para formatear fecha como "Lun 10/03" - CORREGIDA
function formatDateShort(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const dayName = getDayNameShort(dateStr);
    return `${dayName} ${day}/${month}`;
}

// Función para obtener datos de TAE (puede ser 1 día o 7 días)
async function fetchTaeData(referenceDate, verSemana) {
    const TELCEL_IDS = [220, 319];
    const allOtherIds = Object.values(CONFIG.TAE_OTHER_COMPANIES).flat();
    const appsIds = CONFIG.TAE_APPS_IDS;
    
    const data = [];
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
        
        const startDate = new Date(dateStr);
        startDate.setHours(18, 0, 0, 0);
        const startDateTime = startDate.toISOString().slice(0, 19).replace('T', '+');
        const endDateTime = startDateTime;
        
        console.log(`Consultando TAE día: ${dateStr} | Rango: ${startDateTime}`);
        
        const [totalTelcel, totalOther, totalApps] = await Promise.all([
            fetchTaeTotal(TELCEL_IDS, startDateTime, endDateTime),
            fetchTaeTotal(allOtherIds, startDateTime, endDateTime),
            fetchTaeTotal(appsIds, startDateTime, endDateTime)
        ]);
        
        const dayTotal = totalTelcel + totalApps + totalOther;
        
        data.push({
            fecha: dateStr,
            fechaDisplay: formatDateShort(dateStr),
            telcel: totalTelcel,
            apps: totalApps,
            otras: totalOther,
            total: dayTotal
        });
    }
    
    return data;
}

// Función para renderizar gráfica de líneas del histórico
function renderHistoricalLineChart(historicalData) {
    const ctx = document.getElementById('taeHistoricalChart');
    if (!ctx) {
        console.warn('No se encontró el canvas taeHistoricalChart');
        return;
    }
    
    if (window.taeLineChart && typeof window.taeLineChart.destroy === 'function') {
        window.taeLineChart.destroy();
    }
    
    const labels = historicalData.map(d => d.fechaDisplay);
    const telcelData = historicalData.map(d => d.telcel);
    const appsData = historicalData.map(d => d.apps);
    const otrasData = historicalData.map(d => d.otras);
    
    window.taeLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '📶 TAE Telcel',
                    data: telcelData,
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
                    label: '🎨 TAE Apps Creativas',
                    data: appsData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#8b5cf6'
                },
                {
                    label: '🏢 TAE Otras Compañías',
                    data: otrasData,
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
                            return `${label}: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(value)}`;
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
                            return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
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
function openTaeChartModal() {
    const modal = document.getElementById('chartModal');
    if (!modal) {
        console.error('No se encontró el modal chartModal');
        return;
    }
    
    const modalTitle = document.getElementById('chartModalTitle');
    const modalBody = document.getElementById('chartModalBody');
    
    modalTitle.innerHTML = '📈 Evolución Diaria de TAE';
    modalBody.innerHTML = '<canvas id="modalTaeChart" style="max-height: 500px; width: 100%;"></canvas>';
    modal.style.display = 'block';
    
    setTimeout(() => {
        const ctx = document.getElementById('modalTaeChart');
        if (ctx && cachedHistoricalData && cachedHistoricalData.length > 1) {
            if (window.modalTaeChart && typeof window.modalTaeChart.destroy === 'function') {
                window.modalTaeChart.destroy();
            }
            
            const labels = cachedHistoricalData.map(d => d.fechaDisplay);
            const telcelData = cachedHistoricalData.map(d => d.telcel);
            const appsData = cachedHistoricalData.map(d => d.apps);
            const otrasData = cachedHistoricalData.map(d => d.otras);
            
            window.modalTaeChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '📶 TAE Telcel',
                            data: telcelData,
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
                            label: '🎨 TAE Apps Creativas',
                            data: appsData,
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.3,
                            pointRadius: 5,
                            pointHoverRadius: 8,
                            pointBackgroundColor: '#8b5cf6'
                        },
                        {
                            label: '🏢 TAE Otras Compañías',
                            data: otrasData,
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
                                    return `${label}: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(value)}`;
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
                                    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
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

// Función principal de búsqueda TAE
async function searchTaeVentas() {
    const date = document.getElementById('taeDate').value;
    const verSemana = document.getElementById('verSemanaTaeCheckbox')?.checked || false;
    
    if (!date) {
        showError('tae', 'Seleccione una fecha');
        return;
    }

    const btn = document.getElementById('searchTaeBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando TAE... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('taeResults').style.display = 'none';
    document.getElementById('taeErrorAlert').style.display = 'none';
    document.getElementById('taeInfoAlert').style.display = 'none';

    try {
        const historicalData = await fetchTaeData(date, verSemana);
        
        cachedHistoricalData = historicalData;
        
        // Calcular totales generales del período
        let totalTelcelGeneral = 0;
        let totalAppsGeneral = 0;
        let totalOtrasGeneral = 0;
        let totalGeneral = 0;
        
        historicalData.forEach(day => {
            totalTelcelGeneral += day.telcel;
            totalAppsGeneral += day.apps;
            totalOtrasGeneral += day.otras;
            totalGeneral += day.total;
        });
        
        const fechaInicio = historicalData[0].fechaDisplay;
        const fechaFin = historicalData[historicalData.length - 1].fechaDisplay;
        const periodoTexto = verSemana ? `últimos 7 días (${fechaInicio} al ${fechaFin})` : `día ${fechaFin}`;
        
        const porcentajeTelcel = totalGeneral > 0 ? ((totalTelcelGeneral / totalGeneral) * 100).toFixed(1) : 0;
        const porcentajeApps = totalGeneral > 0 ? ((totalAppsGeneral / totalGeneral) * 100).toFixed(1) : 0;
        const porcentajeOtras = totalGeneral > 0 ? ((totalOtrasGeneral / totalGeneral) * 100).toFixed(1) : 0;
        
        let html = `
            <div class="alert alert-info" style="margin-bottom: 20px;">
                📅 Período consultado: <strong>${periodoTexto}</strong><br>
                ⚡ Fecha de referencia: ${formatDate(date)} ${verSemana ? '(incluida en la consulta)' : ''}<br>
                ⚡ Cada día se consulta desde las 6:00 AM hasta las 6:00 AM del día siguiente
            </div>
            
            <div class="stats" style="margin-bottom: 24px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                    <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalGeneral)}</div>
                    <div class="stat-label">💰 TOTAL TAE ${verSemana ? 'SEMANAL' : 'DEL DÍA'}</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
                    <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalTelcelGeneral)}</div>
                    <div class="stat-label">📶 Telcel (${porcentajeTelcel}%)</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">
                    <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalAppsGeneral)}</div>
                    <div class="stat-label">🎨 Apps Creativas (${porcentajeApps}%)</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                    <div class="stat-number">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(totalOtrasGeneral)}</div>
                    <div class="stat-label">🏢 Otras Compañías (${porcentajeOtras}%)</div>
                </div>
            </div>
        `;
        
        // Barra visual de porcentajes
        html += `
            <div style="margin-bottom: 20px; background: #f8fafc; border-radius: 12px; padding: 12px 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.75rem;">
                    <span style="color: #3b82f6;">📶 Telcel (${porcentajeTelcel}%)</span>
                    <span style="color: #8b5cf6;">🎨 Apps (${porcentajeApps}%)</span>
                    <span style="color: #f97316;">🏢 Otras (${porcentajeOtras}%)</span>
                </div>
                <div style="display: flex; height: 24px; border-radius: 12px; overflow: hidden;">
                    <div style="width: ${porcentajeTelcel}%; background: linear-gradient(90deg, #3b82f6, #60a5fa); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.7rem; font-weight: bold;">
                        ${porcentajeTelcel > 8 ? `${porcentajeTelcel}%` : ''}
                    </div>
                    <div style="width: ${porcentajeApps}%; background: linear-gradient(90deg, #8b5cf6, #a78bfa); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.7rem; font-weight: bold;">
                        ${porcentajeApps > 8 ? `${porcentajeApps}%` : ''}
                    </div>
                    <div style="width: ${porcentajeOtras}%; background: linear-gradient(90deg, #f97316, #fb923c); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.7rem; font-weight: bold;">
                        ${porcentajeOtras > 8 ? `${porcentajeOtras}%` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Mostrar tabla solo si hay más de 1 día
        if (historicalData.length > 1) {
            // Calcular promedios diarios
            const promTelcel = totalTelcelGeneral / historicalData.length;
            const promApps = totalAppsGeneral / historicalData.length;
            const promOtras = totalOtrasGeneral / historicalData.length;
            const promTotal = totalGeneral / historicalData.length;
            
            html += `
                <div style="margin-bottom: 16px; display: flex; gap: 16px; background: #f1f5f9; padding: 12px 20px; border-radius: 12px;">
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 0.7rem; color: #64748b;">📊 Promedio Diario</div>
                        <div style="font-size: 1.2rem; font-weight: bold; color: #1e40af;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(promTotal)}</div>
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 0.7rem; color: #64748b;">📶 Prom. Telcel</div>
                        <div style="font-size: 1rem; font-weight: bold; color: #3b82f6;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(promTelcel)}</div>
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 0.7rem; color: #64748b;">🎨 Prom. Apps</div>
                        <div style="font-size: 1rem; font-weight: bold; color: #8b5cf6;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(promApps)}</div>
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 0.7rem; color: #64748b;">🏢 Prom. Otras</div>
                        <div style="font-size: 1rem; font-weight: bold; color: #f97316;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(promOtras)}</div>
                    </div>
                </div>
            `;
            
            html += `
                <div class="table-container">
                    <table class="ventas-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th style="text-align: right;">📶 TAE Telcel</th>
                                <th style="text-align: right;">🎨 Apps Creativas</th>
                                <th style="text-align: right;">🏢 Otras Compañías</th>
                                <th style="text-align: right;">📊 Total Día</th>
                                <th style="text-align: center;">📈 % Semana</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            for (let i = 0; i < historicalData.length; i++) {
                const day = historicalData[i];
                const porcentajeSemana = totalGeneral > 0 ? ((day.total / totalGeneral) * 100).toFixed(1) : 0;
                const isLastDay = (i === historicalData.length - 1);
                const rowStyle = isLastDay ? 'background-color: #fff3e0; border-left: 4px solid #f97316;' : '';
                
                html += `
                    <tr style="${rowStyle}">
                        <td style="font-weight: bold; ${isLastDay ? 'color: #f97316;' : ''}">${day.fechaDisplay}${isLastDay ? ' 📍' : ''}</div>
                        <td style="text-align: right; color: #3b82f6;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(day.telcel)}</div>
                        <td style="text-align: right; color: #8b5cf6;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(day.apps)}</div>
                        <td style="text-align: right; color: #f97316;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(day.otras)}</div>
                        <td style="text-align: right; font-weight: bold; background: #f0f9ff;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(day.total)}</div>
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
            
            // Gráfica de líneas
            html += `
                <div style="margin-top: 30px; background: #f8fafc; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; cursor: pointer;" onclick="openTaeChartModal()">
                    <h4 style="color: #1e40af; margin-bottom: 16px; text-align: center;">📈 Evolución Diaria de TAE</h4>
                    <canvas id="taeHistoricalChart" style="max-height: 300px; width: 100%;"></canvas>
                    <div style="text-align: center; margin-top: 10px; font-size: 11px; color: #64748b;">🔍 Haz clic para ampliar</div>
                </div>
            `;
        }
        
        document.getElementById('taeResults').innerHTML = html;
        document.getElementById('taeResults').style.display = 'block';
        
        // Renderizar gráfica si hay más de 1 día
        if (historicalData.length > 1) {
            setTimeout(() => {
                renderHistoricalLineChart(historicalData);
            }, 200);
        }
        
        if (totalGeneral === 0) {
            showInfo('tae', `⚠️ No se encontraron ventas TAE para el ${periodoTexto}. Verifica que haya ventas en esa fecha.`, true);
        } else {
            showInfo('tae', `✅ Total TAE: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalGeneral)}`, false);
        }
        
    } catch (error) {
        console.error('Error en TAE:', error);
        showError('tae', `Error al consultar ventas TAE: ${error.message}`);
        document.getElementById('taeResults').style.display = 'none';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Hacer la función global para el modal
window.openTaeChartModal = openTaeChartModal;