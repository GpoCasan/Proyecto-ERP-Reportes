// ==================== FUNCIONES AUXILIARES ====================
function showError(module, msg) {
    const el = document.getElementById(`${module}ErrorAlert`);
    if (el) { el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 8000); }
}

function showInfo(module, msg, isWarning = false) {
    const el = document.getElementById(`${module}InfoAlert`);
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        if (isWarning) el.classList.add('alert-warning');
        setTimeout(() => { el.style.display = 'none'; el.classList.remove('alert-warning'); }, 5000);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return 'No disponible';
    try { const date = new Date(dateStr); return date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }); } catch(e) { return dateStr; }
}

function formatDateTime(dateStr) {
    if (!dateStr) return 'No disponible';
    try { const date = new Date(dateStr); return date.toLocaleString('es-MX'); } catch(e) { return dateStr; }
}

function formatDateOnly(dateStr) {
    if (!dateStr) return 'No disponible';
    try { const date = new Date(dateStr); return date.toLocaleDateString('es-MX'); } catch(e) { return dateStr; }
}

function isValidImei(value) { return /^\d{15}$/.test(value); }

function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

function getDateRangeContado(dateStr) {
    if (!dateStr) return null;
    const startDate = new Date(dateStr);
    startDate.setHours(18, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const startStr = startDate.toISOString().slice(0, 19).replace('T', '+');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', '+');
    
    return { start: startStr, end: endStr };
}
function getTeamInfoByUserId(userId) {
    for (const [teamName, teamData] of Object.entries(TEAM_STRUCTURE)) {
        if (teamData.liderId === userId) {
            return { teamName, role: 'lider', teamData };
        }
        if (teamData.miembros.includes(userId)) {
            return { teamName, role: 'miembro', teamData };
        }
    }
    return { teamName: '🔹 Sin Equipo', role: 'independiente', teamData: null };
}

function agruparVentasPorLider(ventasPorAsesor) {
    // ventasPorAsesor es un Map donde key = userId, value = { nombre, cantidad, ... }
    const grupos = new Map();
    
    for (const [userId, data] of ventasPorAsesor) {
        const teamInfo = getTeamInfoByUserId(userId);
        const teamName = teamInfo.teamName;
        
        if (!grupos.has(teamName)) {
            grupos.set(teamName, {
                teamName: teamName,
                liderId: teamInfo.teamData?.liderId,
                liderNombre: teamInfo.teamData?.liderNombre,
                totalEquipos: 0,
                miembros: []
            });
        }
        
        const grupo = grupos.get(teamName);
        grupo.totalEquipos += data.cantidad;
        grupo.miembros.push({
            userId: userId,
            nombre: data.nombre,
            cantidad: data.cantidad,
            esLider: teamInfo.role === 'lider'
        });
    }
    
    // Ordenar miembros dentro de cada grupo (líder primero, luego por cantidad descendente)
    for (const grupo of grupos.values()) {
        grupo.miembros.sort((a, b) => {
            if (a.esLider && !b.esLider) return -1;
            if (!a.esLider && b.esLider) return 1;
            return b.cantidad - a.cantidad;
        });
    }
    
    return Array.from(grupos.values()).sort((a, b) => b.totalEquipos - a.totalEquipos);
}

// ==================== EXPORTAR A EXCEL ====================
function exportToExcel(data, filename) {
    // data es un array de arrays: [["Col1", "Col2", ...], ["fila1", "fila2", ...]]
    const wsData = data;
    
    // Crear libro y hoja de trabajo
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Ajustar ancho de columnas (opcional)
    ws['!cols'] = [];
    for (let i = 0; i < wsData[0].length; i++) {
        ws['!cols'].push({ wch: 20 });
    }
    
    // Agregar hoja al libro
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
    
    // Exportar
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

function getDateRangeTAE(dateStr) {
    if (!dateStr) return null;
    
    const startDate = new Date(dateStr);
    startDate.setHours(18, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const startStr = startDate.toISOString().slice(0, 19).replace('T', '+');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', '+');
    
    return { start: startStr, end: endStr };
}

function openReceipt(saleId) { window.open(`https://sales.gcasan.com/api/sales/${saleId}/receipt`, '_blank'); }

async function fetchInventoryCost(imei) {
    const res = await fetch(`${CONFIG.API_LOGS}?value=${encodeURIComponent(imei)}`, { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } });
    const data = await res.json();
    if (!data.data) throw new Error('IMEI no encontrado');
    return data.data;
}
        // ==================== FUNCIONES PARA BUSCAR VENTA ====================

        function openSaleSearchModal() {
            const modal = document.getElementById('saleSearchModal');
            if (modal) {
                modal.style.display = 'block';
                // Limpiar input y errores
                const input = document.getElementById('saleNumberInput');
                if (input) {
                    input.value = '';
                    input.focus();
                }
            }
        }

        function closeSaleSearchModal() {
            const modal = document.getElementById('saleSearchModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function openSaleByNumber() {
            const saleNumber = document.getElementById('saleNumberInput').value.trim();
            
            if (!saleNumber) {
                alert('❌ Por favor, ingresa un número de venta');
                return;
            }
            
            if (isNaN(saleNumber) || parseInt(saleNumber) <= 0) {
                alert('❌ Ingresa un número de venta válido');
                return;
            }
            
            // Abrir en nueva pestaña
            const url = `https://sales.gcasan.com/api/sales/${saleNumber}/receipt`;
            window.open(url, '_blank');
            
            // Cerrar modal
            closeSaleSearchModal();
        }
async function fetchProductCost(productId) {
    if (!productId || productId === 0) return null;
    try {
        const url = CONFIG.API_SUPPLY_COST + '/' + productId + '/cost';
        const response = await fetch(url, { headers: { 'Authorization': 'Bearer ' + CONFIG.FIXED_TOKEN } });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        
        console.log('📡 [fetchProductCost] Respuesta para ' + productId + ':', data);
        
        let costoSinIva = 0;
        
        // Estructura esperada: { data: { cost: 1421.77 } }
        if (data && data.data && data.data.cost !== undefined && data.data.cost !== null) {
            costoSinIva = parseFloat(data.data.cost);
        } 
        // Fallback: { cost: 1421.77 }
        else if (data && data.cost !== undefined && data.cost !== null) {
            costoSinIva = parseFloat(data.cost);
        }
        // Fallback: { costo: 1421.77 }
        else if (data && data.costo !== undefined && data.costo !== null) {
            costoSinIva = parseFloat(data.costo);
        }
        // Fallback: el dato es un número directamente
        else if (typeof data === 'number') {
            costoSinIva = data;
        }
        
        if (costoSinIva === 0 || isNaN(costoSinIva)) {
            console.warn('⚠️ [fetchProductCost] Costo no encontrado para ' + productId, data);
            return null;
        }
        
        console.log('✅ [fetchProductCost] Costo para ' + productId + ':', costoSinIva);
        
        return { 
            costoSinIva: costoSinIva, 
            costoConIva: costoSinIva * 1.16 
        };
        
    } catch(error) { 
        console.warn('⚠️ [fetchProductCost] Error para ' + productId + ':', error);
        return null; 
    }
}

async function loginPayJoy() {
    try {
        const res = await fetch(CONFIG.API_PAYJOY_LOGIN, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: CONFIG.PAYJOY_EMAIL, password: CONFIG.PAYJOY_PASSWORD })
        });
        const data = await res.json();
        let token = data.jwt || data.token;
        if (!token) throw new Error('No token');
        try { const payload = JSON.parse(atob(token.split('.')[1])); tokenExpirationTime = payload.exp * 1000; } catch(e) {}
        currentPayJoyToken = token;
        return token;
    } catch(e) { throw e; }
}

async function getValidToken() {
    if (!currentPayJoyToken || (tokenExpirationTime && Date.now() >= tokenExpirationTime)) await loginPayJoy();
    return currentPayJoyToken;
}

// ==================== SALDO TAE (AGREGADA) ====================
async function loadTaeBalance() {
    const el = document.getElementById('saldoTaeValue');
    if (!el) return;
    try {
        const res = await fetch(CONFIG.API_TAE_BALANCE, { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } });
        if (!res.ok) throw new Error();
        const data = await res.json();
        let saldo = data.data?.saldo_tae || 0;
        el.innerHTML = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(saldo) + ' <small>MXN</small>';
    } catch(e) { el.innerHTML = 'No disponible'; }
}