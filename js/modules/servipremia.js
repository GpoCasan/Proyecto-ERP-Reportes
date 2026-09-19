// ==================== MÓDULO: SERVIPREMIA (RECOMPENSAS) ====================
// Consulta las operaciones de Rewardix (Servipremia) y las cruza con las
// operaciones del ERP para mostrar métricas de puntos ganados/canjeados.

let cachedServipremiaData = null;
let servipremiaInicializado = false;

// ==================== CONFIGURACIÓN ====================
const SERVIPREMIA_CONFIG = {
    PROXY_URL: 'https://proyecto-erp-reportes-gamma.vercel.app/api/rewardix',
    TIPOS_PUNTOS: {
        'points earned':   { label: '⭐ Puntos Ganados',   color: '#059669', icon: '⭐' },
        'points redeemed': { label: '🎁 Puntos Canjeados', color: '#f97316', icon: '🎁' }
    }
};

// ==================== HELPERS DE FECHA (evitan bug de zona horaria) ====================
function servipremiaFormatDateInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getRewardixUrl() {
    return SERVIPREMIA_CONFIG.PROXY_URL;
}

// ==================== VALIDACIÓN DE TELÉFONOS ====================
// Rewardix puede entregar el teléfono con nombres de campo diferentes
// según la versión de la respuesta. Se revisan los nombres habituales.
function normalizeServipremiaPhone(value) {
    if (value === null || value === undefined) return null;

    const digits = String(value).replace(/\D/g, '');
    if (!digits) return null;

    // Normalización para teléfonos mexicanos:
    // +52 9991234567 -> 9991234567
    // +521 9991234567 -> 9991234567
    if (digits.length === 13 && digits.startsWith('521')) {
        return digits.slice(3);
    }

    if (digits.length === 12 && digits.startsWith('52')) {
        return digits.slice(2);
    }

    // Para otros formatos se conserva el número completo normalizado.
    return digits.length >= 7 ? digits : null;
}

function normalizeServipremiaKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

function findServipremiaField(operation, aliases, maxDepth = 4) {
    if (!operation || typeof operation !== 'object') return null;

    const aliasSet = new Set(aliases.map(normalizeServipremiaKey));

    const visit = (value, depth = 0) => {
        if (!value || typeof value !== 'object' || depth > maxDepth) return null;

        for (const [key, fieldValue] of Object.entries(value)) {
            if (
                aliasSet.has(normalizeServipremiaKey(key)) &&
                fieldValue !== null &&
                fieldValue !== undefined &&
                typeof fieldValue !== 'object'
            ) {
                return fieldValue;
            }
        }

        for (const nestedValue of Object.values(value)) {
            if (nestedValue && typeof nestedValue === 'object') {
                const found = visit(nestedValue, depth + 1);
                if (found !== null && found !== undefined) return found;
            }
        }

        return null;
    };

    return visit(operation);
}

function getServipremiaPhone(operation) {
    const phone = findServipremiaField(operation, [
        'phone', 'phoneNumber', 'phone_number',
        'mobile', 'mobileNumber', 'mobile_number',
        'telephone', 'telephoneNumber', 'telephone_number',
        'tel', 'telefono', 'númeroTelefono', 'numeroTelefono',
        'customerPhone', 'customer_phone',
        'userPhone', 'user_phone', 'msisdn'
    ]);

    return normalizeServipremiaPhone(phone);
}

function getServipremiaClientIdentity(operation, fallbackIndex) {
    const phone = getServipremiaPhone(operation);
    const emailValue = findServipremiaField(operation, [
        'email', 'emailAddress', 'email_address',
        'customerEmail', 'customer_email',
        'userEmail', 'user_email', 'correo'
    ]);
    const email = emailValue ? String(emailValue).trim().toLowerCase() : null;

    const firstName = findServipremiaField(operation, [
        'firstName', 'first_name', 'customerFirstName', 'customer_first_name',
        'userFirstName', 'user_first_name', 'nombre'
    ]);
    const lastName = findServipremiaField(operation, [
        'lastName', 'last_name', 'customerLastName', 'customer_last_name',
        'userLastName', 'user_last_name', 'apellido', 'apellidos'
    ]);
    const nameValue = findServipremiaField(operation, [
        'customerName', 'customer_name', 'clientName', 'client_name',
        'fullName', 'full_name', 'userName', 'user_name',
        'customer', 'client', 'nombreCliente', 'nombre_completo', 'name'
    ]);

    const composedName = [firstName, lastName]
        .filter(value => value !== null && value !== undefined && String(value).trim())
        .map(value => String(value).trim())
        .join(' ');
    const name = String(nameValue || composedName || '').trim() || 'Cliente no identificado';

    const idValue = findServipremiaField(operation, [
        'customerId', 'customer_id', 'clientId', 'client_id',
        'userId', 'user_id', 'memberId', 'member_id', 'customerUuid',
        'uuid'
    ]);
    const clientId = idValue !== null && idValue !== undefined
        ? String(idValue).trim()
        : null;

    let key;
    if (phone) key = `phone:${phone}`;
    else if (email) key = `email:${email}`;
    else if (clientId) key = `id:${clientId}`;
    else if (name !== 'Cliente no identificado') {
        key = `name:${normalizeServipremiaKey(name)}`;
    } else {
        key = `unknown:${fallbackIndex}`;
    }

    return {
        key,
        name,
        phone,
        email,
        clientId
    };
}

function getServipremiaOperationDate(operation) {
    return findServipremiaField(operation, [
        'createdAt', 'created_at', 'eventDate', 'event_date',
        'operationDate', 'operation_date', 'occurredAt', 'occurred_at',
        'timestamp', 'date', 'fecha'
    ]);
}

function getServipremiaBranchName(operation) {
    const branch = findServipremiaField(operation, [
        'branchName', 'branch_name', 'storeName', 'store_name',
        'locationName', 'location_name', 'branch', 'store',
        'sucursal', 'sucursalName', 'sucursal_name'
    ]);

    return branch ? String(branch) : 'No disponible';
}

function getServipremiaManagerName(operation, managersById = null) {
    const explicitName = findServipremiaField(operation, [
        'managerName', 'manager_name', 'managerFullName', 'manager_full_name',
        'managerFullname', 'gerente', 'gerenteName', 'gerente_name'
    ]);

    if (explicitName) return String(explicitName);

    const managerId = findServipremiaField(operation, ['managerId', 'manager_id']);
    if (managerId !== null && managerId !== undefined && managersById) {
        const manager = managersById.get(String(managerId));
        if (manager) return manager;
    }

    return managerId ? `Gerente #${managerId}` : 'No disponible';
}

function getServipremiaOperationComment(operation) {
    const comment = findServipremiaField(operation, [
        'comment', 'comments', 'comentario', 'note', 'notes',
        'description', 'descripcion', 'message', 'remark', 'remarks',
        'reason', 'details', 'detail', 'observations', 'observaciones'
    ]);

    return comment === null || comment === undefined || String(comment).trim() === ''
        ? 'Sin comentario'
        : String(comment).trim();
}

function getServipremiaOperationId(operation) {
    const id = findServipremiaField(operation, [
        'operationId', 'operation_id', 'transactionId', 'transaction_id',
        'eventId', 'event_id', 'uuid', 'id'
    ]);

    return id === null || id === undefined || id === '' ? 'Sin identificador' : String(id);
}

function formatServipremiaOperationDate(value) {
    if (!value) return 'Fecha no disponible';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('es-MX');
}

function buildServipremiaClientBreakdown(operations, managersById = null) {
    const clients = new Map();

    operations.forEach((operation, index) => {
        const identity = getServipremiaClientIdentity(operation, index);
        const amount = parseFloat(operation.amount) || 0;

        if (!clients.has(identity.key)) {
            clients.set(identity.key, {
                key: identity.key,
                name: identity.name,
                phone: identity.phone,
                email: identity.email,
                clientId: identity.clientId,
                operationCount: 0,
                totalPoints: 0,
                operations: []
            });
        }

        const client = clients.get(identity.key);
        client.operationCount++;
        client.totalPoints += amount;
        client.operations.push({
            amount,
            date: getServipremiaOperationDate(operation),
            location: getServipremiaBranchName(operation),
            managerName: getServipremiaManagerName(operation, managersById),
            comment: getServipremiaOperationComment(operation),
            operationId: getServipremiaOperationId(operation),
            phone: identity.phone,
            email: identity.email,
            raw: operation
        });
    });

    return Array.from(clients.values())
        .sort((a, b) => b.totalPoints - a.totalPoints || b.operationCount - a.operationCount);
}

// ==================== INICIALIZACIÓN ====================
function initServipremiaModule() {
    console.log('🎁 [SERVIPREMIA] Inicializando módulo...');

    if (servipremiaInicializado) {
        console.log('✅ [SERVIPREMIA] Ya estaba inicializado');
        setupServipremiaEventListeners();
        return;
    }

    servipremiaInicializado = true;

    // Fechas por defecto: últimos 7 días (usando helper sin zona horaria)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);

    const startInput = document.getElementById('servipremiaStartDate');
    const endInput = document.getElementById('servipremiaEndDate');

    if (startInput && !startInput.value) startInput.value = servipremiaFormatDateInput(startDate);
    if (endInput && !endInput.value) endInput.value = servipremiaFormatDateInput(endDate);

    setupServipremiaEventListeners();

    console.log('✅ [SERVIPREMIA] Módulo inicializado');
}

// ==================== EVENT LISTENERS ====================
function setupServipremiaEventListeners() {
    const searchBtn = document.getElementById('searchServipremiaBtn');
    if (searchBtn && !searchBtn.hasAttribute('data-listener')) {
        searchBtn.setAttribute('data-listener', 'true');
        searchBtn.addEventListener('click', searchServipremia);
        console.log('✅ [SERVIPREMIA] Listener del botón configurado');
    }
}

// ==================== FUNCIÓN PRINCIPAL ====================
async function searchServipremia() {
    const startDate = document.getElementById('servipremiaStartDate').value;
    const endDate = document.getElementById('servipremiaEndDate').value;

    if (!startDate || !endDate) {
        showError('servipremia', 'Selecciona ambas fechas');
        return;
    }

    if (startDate > endDate) {
        showError('servipremia', 'La fecha inicial no puede ser mayor a la final');
        return;
    }

    const btn = document.getElementById('searchServipremiaBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando... <span class="loading-spinner"></span>';
    btn.disabled = true;

    document.getElementById('servipremiaResults').style.display = 'none';
    document.getElementById('servipremiaErrorAlert').style.display = 'none';
    document.getElementById('servipremiaInfoAlert').style.display = 'none';

    try {
        btn.innerHTML = 'Consultando ERP y Servipremia... <span class="loading-spinner"></span>';

        const [erpData, rewardixOps] = await Promise.all([
            fetchERPOperations(startDate, endDate),
            fetchRewardixOperations(startDate, endDate)
        ]);

        console.log('📊 [SERVIPREMIA] ERP operations:', erpData);
        console.log('📊 [SERVIPREMIA] Rewardix operations:', rewardixOps.length);

        // Filtrar por tipo de evento
        const pointsEarned = rewardixOps.filter(op => {
            const eventName = String(op.eventName || '').toLowerCase().trim();
            return eventName === 'points earned' || eventName === 'puntos ganados';
        });

        const pointsRedeemed = rewardixOps.filter(op => {
            const eventName = String(op.eventName || '').toLowerCase().trim();
            return eventName === 'points redeemed'
                || eventName === 'puntos canjeados'
                || eventName === 'points used';
        });

        const cardInstalled = rewardixOps.filter(op => {
            const eventName = String(op.eventName || '').toLowerCase().trim();
            return eventName === 'card installed';
        });

        const cardInstalledPhones = new Set();
        let cardInstalledWithoutPhone = 0;

        cardInstalled.forEach(operation => {
            const phone = getServipremiaPhone(operation);

            if (phone) {
                cardInstalledPhones.add(phone);
            } else {
                cardInstalledWithoutPhone++;
            }
        });

        const cardInstalledUniqueCount = cardInstalledPhones.size;

        console.log(`🎯 [SERVIPREMIA] Points earned: ${pointsEarned.length}, Points redeemed: ${pointsRedeemed.length}, Card installed: ${cardInstalled.length}, teléfonos únicos: ${cardInstalledUniqueCount}, sin teléfono: ${cardInstalledWithoutPhone}`);

        // Totales de puntos
        const totalPointsEarned = pointsEarned.reduce((sum, op) => {
            return sum + (parseFloat(op.amount) || 0);
        }, 0);

        const totalPointsRedeemed = pointsRedeemed.reduce((sum, op) => {
            return sum + (parseFloat(op.amount) || 0);
        }, 0);

        // Desglose por sucursal/gerente
        const managersData = await fetchRewardixManagers();

        const managersById = new Map(
            managersData.map(manager => [
                String(manager.id),
                manager.fullName || manager.name || manager.email || `Gerente #${manager.id}`
            ])
        );

        const desglosePorSucursal = buildDesglosePorSucursal(
            managersData,
            pointsEarned,
            pointsRedeemed
        );

        const clientesGanaron = buildServipremiaClientBreakdown(pointsEarned, managersById);
        const clientesCanjearon = buildServipremiaClientBreakdown(pointsRedeemed, managersById);

        // Cache
        cachedServipremiaData = {
            startDate,
            endDate,
            erpTotal: erpData.total,
            erpMonto: erpData.monto,
            totalOps: rewardixOps.length,
            pointsEarnedCount: pointsEarned.length,
            pointsRedeemedCount: pointsRedeemed.length,
            cardInstalledCount: cardInstalledUniqueCount,
            cardInstalledRawCount: cardInstalled.length,
            cardInstalledWithoutPhone,
            totalPointsEarned,
            totalPointsRedeemed,
            desglosePorSucursal,
            clientesGanaron,
            clientesCanjearon,
            fechaConsulta: new Date().toISOString()
        };

        renderServipremiaResults(cachedServipremiaData);

    } catch (error) {
        console.error('❌ [SERVIPREMIA] Error:', error);
        showError('servipremia', `Error: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== CONSULTAR ERP (operaciones totales) ====================
async function fetchERPOperations(startDate, endDate) {
    try {
        const rangeStart = getDateRangeContado(startDate);
        const rangeEnd = getDateRangeContado(endDate);

        if (!rangeStart || !rangeEnd) {
            throw new Error('Error procesando fechas');
        }

        const startDateTime = rangeStart.start;
        const endDateTime = rangeEnd.end;

        console.log(`📡 [SERVIPREMIA] Consultando ERP: ${startDateTime} → ${endDateTime}`);

        const tipos = ['products', 'services', 'credit'];
        const results = await Promise.all(
            tipos.map(async (tipo) => {
                const url = `${CONFIG.API_SALES}?page=1&per_page=1&total=1&start_date=${startDateTime}&end_date=${endDateTime}&sale_type=${tipo}`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
                });

                if (!response.ok) {
                    console.warn(`⚠️ Error consultando ${tipo}: ${response.status}`);
                    return { total: 0, monto: 0 };
                }

                const data = await response.json();
                return {
                    total: data.meta?.total || data.total || 0,
                    monto: parseFloat(data.total) || 0
                };
            })
        );

        const totalOps = results.reduce((sum, r) => sum + r.total, 0);
        const montoTotal = results.reduce((sum, r) => sum + r.monto, 0);

        return { total: totalOps, monto: montoTotal };

    } catch (error) {
        console.error('❌ [SERVIPREMIA] Error consultando ERP:', error);
        return { total: 0, monto: 0 };
    }
}

// ==================== CONSULTAR REWARDIX (operations) ====================
async function fetchRewardixOperations(startDate, endDate) {
    try {
        const baseUrl = getRewardixUrl();
        const itemsPerPage = 1000;
        const allOperations = [];
        let page = 1;
        let totalItems = null;

        while (true) {
            const url = `${baseUrl}/operations?page=${page}&itemsPerPage=${itemsPerPage}&startDate=${startDate}&endDate=${endDate}`;

            console.log(`📡 [SERVIPREMIA] GET ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`Rewardix HTTP ${response.status}`);
            }

            const payload = await response.json();
            const rows = Array.isArray(payload.data) ? payload.data : [];

            allOperations.push(...rows);

            if (payload.meta && payload.meta.totalItems !== undefined) {
                totalItems = Number(payload.meta.totalItems);
            }

            if (!rows.length || rows.length < itemsPerPage) break;
            if (Number.isFinite(totalItems) && allOperations.length >= totalItems) break;

            page++;
            if (page > 100) {
                console.warn('⚠️ Demasiadas páginas, deteniendo por seguridad');
                break;
            }
        }

        console.log(`✅ [SERVIPREMIA] ${allOperations.length} operaciones obtenidas`);
        return allOperations;

    } catch (error) {
        console.error('❌ [SERVIPREMIA] Error consultando Rewardix:', error);
        throw new Error(`Error al consultar Servipremia: ${error.message}`);
    }
}

// ==================== CONSULTAR GERENTES (sucursales) ====================
async function fetchRewardixManagers() {
    try {
        const baseUrl = getRewardixUrl();
        const url = `${baseUrl}/managers?page=1&itemsPerPage=1000`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            cache: 'no-store'
        });

        if (!response.ok) return [];

        const payload = await response.json();
        return Array.isArray(payload.data) ? payload.data : [];

    } catch (error) {
        console.warn('⚠️ Error consultando managers:', error);
        return [];
    }
}

// ==================== HELPERS ====================
function buildDesglosePorSucursal(managers, pointsEarned, pointsRedeemed) {
    const managersMap = new Map();

    managers.forEach(m => {
        managersMap.set(String(m.id), {
            id: m.id,
            nombre: m.fullName || m.email || `Gerente #${m.id}`,
            email: m.email || '',
            earnedCount: 0,
            redeemedCount: 0,
            earnedPoints: 0,
            redeemedPoints: 0
        });
    });

    // Agrupar puntos ganados
    pointsEarned.forEach(op => {
        const key = String(op.managerId ?? 'unassigned');
        if (!managersMap.has(key)) {
            managersMap.set(key, {
                id: op.managerId ?? null,
                nombre: op.managerId ? `Gerente #${op.managerId}` : 'Sin sucursal',
                email: '',
                earnedCount: 0,
                redeemedCount: 0,
                earnedPoints: 0,
                redeemedPoints: 0
            });
        }
        const row = managersMap.get(key);
        row.earnedCount++;
        row.earnedPoints += parseFloat(op.amount) || 0;
    });

    // Agrupar puntos canjeados
    pointsRedeemed.forEach(op => {
        const key = String(op.managerId ?? 'unassigned');
        if (!managersMap.has(key)) {
            managersMap.set(key, {
                id: op.managerId ?? null,
                nombre: op.managerId ? `Gerente #${op.managerId}` : 'Sin sucursal',
                email: '',
                earnedCount: 0,
                redeemedCount: 0,
                earnedPoints: 0,
                redeemedPoints: 0
            });
        }
        const row = managersMap.get(key);
        row.redeemedCount++;
        row.redeemedPoints += parseFloat(op.amount) || 0;
    });

    return Array.from(managersMap.values())
        .filter(row => row.earnedCount > 0 || row.redeemedCount > 0)
        .sort((a, b) => (b.earnedPoints + b.redeemedPoints) - (a.earnedPoints + a.redeemedPoints));
}

function renderServipremiaPaginationControls(tableId) {
    return `
        <div data-servipremia-pagination-for="${tableId}" style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin:10px 0; padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; font-size:0.8rem; color:#475569;">
            <label style="display:flex; align-items:center; gap:6px; margin:0;">
                Filas por página:
                <select data-servipremia-page-size style="padding:5px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#ffffff;">
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                </select>
            </label>
            <span data-servipremia-page-summary></span>
            <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" data-servipremia-page-prev style="border:1px solid #cbd5e1; background:#ffffff; color:#334155; border-radius:6px; padding:5px 9px; cursor:pointer;">‹ Anterior</button>
                <span data-servipremia-page-number style="min-width:80px; text-align:center;"></span>
                <button type="button" data-servipremia-page-next style="border:1px solid #cbd5e1; background:#ffffff; color:#334155; border-radius:6px; padding:5px 9px; cursor:pointer;">Siguiente ›</button>
            </div>
        </div>
    `;
}

function getServipremiaSortValue(row, columnIndex) {
    if (columnIndex === 0) return Number(row.dataset.originalIndex || 0);

    const cell = row.cells[columnIndex];
    const text = String(cell?.textContent || '').trim();
    const numericText = text.replace(/[^0-9,.-]/g, '').replace(/,/g, '');
    const numericValue = Number(numericText);

    if (numericText && Number.isFinite(numericValue)) return numericValue;

    const dateValue = Date.parse(text);
    if (!Number.isNaN(dateValue) && /\d/.test(text)) return dateValue;

    return text.toLocaleLowerCase('es-MX');
}

function setupServipremiaTable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const controls = document.querySelector(`[data-servipremia-pagination-for="${tableId}"]`);
    if (!tbody || !controls) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((row, index) => {
        row.dataset.originalIndex = String(index);
    });

    const pageSizeSelect = controls.querySelector('[data-servipremia-page-size]');
    const pageSummary = controls.querySelector('[data-servipremia-page-summary]');
    const pageNumber = controls.querySelector('[data-servipremia-page-number]');
    const previousButton = controls.querySelector('[data-servipremia-page-prev]');
    const nextButton = controls.querySelector('[data-servipremia-page-next]');
    const state = { page: 1, pageSize: 25, sortColumn: null, sortDirection: 1 };

    const render = () => {
        const orderedRows = Array.from(tbody.querySelectorAll('tr'));

        if (state.sortColumn !== null) {
            orderedRows.sort((rowA, rowB) => {
                const valueA = getServipremiaSortValue(rowA, state.sortColumn);
                const valueB = getServipremiaSortValue(rowB, state.sortColumn);

                if (valueA < valueB) return -1 * state.sortDirection;
                if (valueA > valueB) return 1 * state.sortDirection;
                return 0;
            });
            orderedRows.forEach(row => tbody.appendChild(row));
        }

        const totalRows = orderedRows.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
        state.page = Math.min(state.page, totalPages);

        const firstVisible = totalRows === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
        const lastVisible = Math.min(state.page * state.pageSize, totalRows);

        orderedRows.forEach((row, index) => {
            row.style.display = index >= (state.page - 1) * state.pageSize && index < state.page * state.pageSize
                ? ''
                : 'none';

            if (row.cells[0]) row.cells[0].textContent = String(index + 1);
        });

        pageSummary.textContent = `Mostrando ${firstVisible}-${lastVisible} de ${totalRows}`;
        pageNumber.textContent = `Página ${state.page} de ${totalPages}`;
        previousButton.disabled = state.page <= 1;
        nextButton.disabled = state.page >= totalPages;
        previousButton.style.opacity = previousButton.disabled ? '0.5' : '1';
        nextButton.style.opacity = nextButton.disabled ? '0.5' : '1';

        table.querySelectorAll('th[data-sort-index]').forEach(header => {
            const indicator = header.querySelector('[data-sort-indicator]');
            const index = Number(header.dataset.sortIndex);
            if (indicator) {
                indicator.textContent = state.sortColumn === index
                    ? (state.sortDirection === 1 ? ' ▲' : ' ▼')
                    : ' ↕';
            }
            header.setAttribute('aria-sort', state.sortColumn === index
                ? (state.sortDirection === 1 ? 'ascending' : 'descending')
                : 'none');
        });
    };

    pageSizeSelect.addEventListener('change', () => {
        state.pageSize = Number(pageSizeSelect.value) || 25;
        state.page = 1;
        render();
    });
    previousButton.addEventListener('click', () => {
        if (state.page > 1) {
            state.page--;
            render();
        }
    });
    nextButton.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
        if (state.page < totalPages) {
            state.page++;
            render();
        }
    });
    table.querySelectorAll('th[data-sort-index]').forEach(header => {
        header.style.cursor = 'pointer';
        header.title = 'Haz clic para ordenar';
        header.addEventListener('click', () => {
            const column = Number(header.dataset.sortIndex);
            if (state.sortColumn === column) {
                state.sortDirection *= -1;
            } else {
                state.sortColumn = column;
                state.sortDirection = 1;
            }
            state.page = 1;
            render();
        });
    });

    render();
}

function renderServipremiaBranchTable(rows) {
    if (!rows || rows.length === 0) {
        return '<div class="alert alert-info">No hay datos de sucursales para este periodo.</div>';
    }

    const tableId = 'servipremiaBranchesTable';
    let html = `
        ${renderServipremiaPaginationControls(tableId)}
        <div class="table-container">
            <table id="${tableId}" class="imei-table" style="font-size:0.85rem;">
                <thead>
                    <tr>
                        <th data-sort-index="0" style="width:50px; text-align:center;">#<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="1">Sucursal / Gerente<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="2" style="text-align:center;">⭐ Tx Ganados<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="3" style="text-align:right;">⭐ Puntos Ganados<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="4" style="text-align:center;">🎁 Tx Canjeados<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="5" style="text-align:right;">🎁 Puntos Canjeados<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="6" style="text-align:center;">📈 Tasa de Canje<span data-sort-indicator> ↕</span></th>
                    </tr>
                </thead>
                <tbody>
    `;

    rows.forEach((row, idx) => {
        const tasaCanje = row.earnedPoints > 0
            ? (row.redeemedPoints / row.earnedPoints) * 100
            : 0;
        const tasaColor = tasaCanje >= 80 ? '#059669'
                        : tasaCanje >= 50 ? '#f59e0b'
                        : '#f97316';
        const bgRow = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

        html += `
            <tr style="background:${bgRow}; border-bottom:1px solid #e2e8f0;">
                <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                <td>
                    <div style="font-weight:600; color:#1e293b;">${escapeHtml(row.nombre)}</div>
                    ${row.email ? `<div style="font-size:0.7rem; color:#64748b;">${escapeHtml(row.email)}</div>` : ''}
                </td>
                <td style="text-align:center; color:#059669; font-weight:600;">${row.earnedCount.toLocaleString('es-MX')}</td>
                <td style="text-align:right; color:#059669; font-weight:700;">${row.earnedPoints.toLocaleString('es-MX')}</td>
                <td style="text-align:center; color:#f97316; font-weight:600;">${row.redeemedCount.toLocaleString('es-MX')}</td>
                <td style="text-align:right; color:#f97316; font-weight:700;">${row.redeemedPoints.toLocaleString('es-MX')}</td>
                <td style="text-align:center;">
                    <span style="background:${tasaColor}; color:white; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">
                        ${tasaCanje.toFixed(1)}%
                    </span>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
                <tfoot style="background:#f1f5f9; border-top:2px solid #1e40af;">
                    <tr style="font-weight:bold;">
                        <td colspan="2" style="text-align:right; padding:10px;">TOTALES:</td>
                        <td style="text-align:center; color:#059669; padding:10px;">${rows.reduce((sum, row) => sum + row.earnedCount, 0).toLocaleString('es-MX')}</td>
                        <td style="text-align:right; color:#059669; padding:10px;">${rows.reduce((sum, row) => sum + row.earnedPoints, 0).toLocaleString('es-MX')}</td>
                        <td style="text-align:center; color:#f97316; padding:10px;">${rows.reduce((sum, row) => sum + row.redeemedCount, 0).toLocaleString('es-MX')}</td>
                        <td style="text-align:right; color:#f97316; padding:10px;">${rows.reduce((sum, row) => sum + row.redeemedPoints, 0).toLocaleString('es-MX')}</td>
                        <td style="text-align:center; padding:10px;">—</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    return html;
}

function renderServipremiaClientTable(clients, type) {
    if (!clients || clients.length === 0) {
        return '<div class="alert alert-info">No hay clientes para este tipo de operación en el periodo seleccionado.</div>';
    }

    const isEarned = type === 'earned';
    const accentColor = isEarned ? '#059669' : '#f97316';
    const pointLabel = isEarned ? 'Puntos acumulados' : 'Puntos canjeados';
    const tableId = `servipremiaClients${type === 'earned' ? 'Earned' : 'Redeemed'}Table`;

    let html = `
        ${renderServipremiaPaginationControls(tableId)}
        <div class="table-container">
            <table id="${tableId}" class="imei-table" style="font-size:0.85rem;">
                <thead>
                    <tr>
                        <th data-sort-index="0" style="width:50px; text-align:center;">#<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="1">Cliente<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="2">Teléfono<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="3">Correo<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="4" style="text-align:center;">Operaciones<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="5" style="text-align:right;">${pointLabel}<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="6" style="text-align:center;">Detalle<span data-sort-indicator> ↕</span></th>
                    </tr>
                </thead>
                <tbody>
    `;

    clients.forEach((client, index) => {
        html += `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="text-align:center; color:#64748b;">${index + 1}</td>
                <td>
                    <button type="button" class="servipremia-client-link" data-client-type="${type}" data-client-index="${index}" style="border:0; background:transparent; color:${accentColor}; font-weight:700; cursor:pointer; padding:0; text-align:left; text-decoration:underline;">
                        ${escapeHtml(client.name)}
                    </button>
                    ${client.clientId ? `<div style="font-size:0.7rem; color:#64748b; margin-top:3px;">ID: ${escapeHtml(client.clientId)}</div>` : ''}
                </td>
                <td>${escapeHtml(client.phone || 'No disponible')}</td>
                <td>${escapeHtml(client.email || 'No disponible')}</td>
                <td style="text-align:center; font-weight:700;">${client.operationCount.toLocaleString('es-MX')}</td>
                <td style="text-align:right; color:${accentColor}; font-weight:700;">${client.totalPoints.toLocaleString('es-MX')}</td>
                <td style="text-align:center;">
                    <button type="button" class="servipremia-client-link" data-client-type="${type}" data-client-index="${index}" style="border:0; background:${accentColor}; color:white; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:0.75rem;">
                        Ver operaciones
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
                <tfoot style="background:#f1f5f9; border-top:2px solid ${accentColor};">
                    <tr style="font-weight:bold;">
                        <td colspan="4" style="text-align:right; padding:10px;">TOTALES:</td>
                        <td style="text-align:center; padding:10px;">${clients.reduce((sum, client) => sum + client.operationCount, 0).toLocaleString('es-MX')}</td>
                        <td style="text-align:right; color:${accentColor}; padding:10px;">${clients.reduce((sum, client) => sum + client.totalPoints, 0).toLocaleString('es-MX')}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    return html;
}

function renderServipremiaClientModal(client, type) {
    const isEarned = type === 'earned';
    const accentColor = isEarned ? '#059669' : '#f97316';
    const title = isEarned ? 'Operaciones donde acumuló puntos' : 'Operaciones donde canjeó puntos';
    const operations = client.operations || [];

    let html = `
        <div style="background:#f8fafc; border-left:4px solid ${accentColor}; padding:12px; border-radius:8px; margin-bottom:16px;">
            <div style="font-weight:700; color:#1e293b; font-size:1rem;">${escapeHtml(client.name)}</div>
            <div style="font-size:0.8rem; color:#475569; margin-top:5px;">
                📱 ${escapeHtml(client.phone || 'Teléfono no disponible')}
                ${client.email ? `&nbsp;&nbsp;✉️ ${escapeHtml(client.email)}` : ''}
            </div>
            <div style="font-size:0.8rem; color:${accentColor}; font-weight:700; margin-top:6px;">
                ${client.operationCount.toLocaleString('es-MX')} operaciones · ${client.totalPoints.toLocaleString('es-MX')} puntos
            </div>
        </div>

        <h4 style="color:#1e40af; margin:0 0 10px;">${title}</h4>
        ${renderServipremiaPaginationControls('servipremiaClientOperationsTable')}
        <div class="table-container">
            <table id="servipremiaClientOperationsTable" class="imei-table" style="font-size:0.8rem;">
                <thead>
                    <tr>
                        <th data-sort-index="0">#<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="1">Fecha<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="2" style="text-align:right;">Puntos<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="3">Sucursal<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="4">Gerente<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="5">Comentario<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="6">Identificador<span data-sort-indicator> ↕</span></th>
                    </tr>
                </thead>
                <tbody>
    `;

    operations.forEach((operation, index) => {
        html += `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td>${escapeHtml(formatServipremiaOperationDate(operation.date))}</td>
                <td style="text-align:right; color:${accentColor}; font-weight:700;">${operation.amount.toLocaleString('es-MX')}</td>
                <td>${escapeHtml(operation.location)}</td>
                <td>${escapeHtml(operation.managerName || 'No disponible')}</td>
                <td style="min-width:220px; white-space:normal;">${escapeHtml(operation.comment || 'Sin comentario')}</td>
                <td>${escapeHtml(operation.operationId)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}

function openServipremiaClientModal(client, type) {
    const modal = document.getElementById('servipremiaClientModal');
    const title = document.getElementById('servipremiaClientModalTitle');
    const body = document.getElementById('servipremiaClientModalBody');

    if (!modal || !title || !body || !client) return;

    title.textContent = type === 'earned'
        ? '⭐ Cliente que acumuló puntos'
        : '🎁 Cliente que canjeó puntos';
    body.innerHTML = renderServipremiaClientModal(client, type);
    modal.style.display = 'block';
    setupServipremiaTable('servipremiaClientOperationsTable');
}

function setupServipremiaBreakdownEvents(clientesGanaron, clientesCanjearon) {
    const panels = {
        branches: document.getElementById('servipremiaBranchesPanel'),
        earned: document.getElementById('servipremiaEarnedPanel'),
        redeemed: document.getElementById('servipremiaRedeemedPanel')
    };

    document.querySelectorAll('.servipremia-breakdown-tab').forEach(button => {
        button.addEventListener('click', () => {
            const selected = button.dataset.servipremiaTab;

            document.querySelectorAll('.servipremia-breakdown-tab').forEach(tab => {
                tab.style.background = tab.dataset.servipremiaTab === selected ? '#1e40af' : '#e2e8f0';
                tab.style.color = tab.dataset.servipremiaTab === selected ? '#ffffff' : '#334155';
            });

            Object.entries(panels).forEach(([key, panel]) => {
                if (panel) panel.style.display = key === selected ? 'block' : 'none';
            });
        });
    });

    const clientLists = {
        earned: clientesGanaron || [],
        redeemed: clientesCanjearon || []
    };

    setupServipremiaTable('servipremiaBranchesTable');
    setupServipremiaTable('servipremiaClientsEarnedTable');
    setupServipremiaTable('servipremiaClientsRedeemedTable');

    document.querySelectorAll('.servipremia-client-link').forEach(button => {
        button.addEventListener('click', () => {
            const type = button.dataset.clientType;
            const index = Number(button.dataset.clientIndex);
            openServipremiaClientModal(clientLists[type]?.[index], type);
        });
    });

    const modal = document.getElementById('servipremiaClientModal');
    const closeModal = () => {
        if (modal) modal.style.display = 'none';
    };
    const closeButton = document.getElementById('servipremiaClientModalClose');

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modal) {
        modal.addEventListener('click', event => {
            if (event.target === modal) closeModal();
        });
    }
}

// ==================== RENDERIZAR ====================
function renderServipremiaResults(data) {
    const container = document.getElementById('servipremiaResults');

    const {
        startDate, endDate,
        erpTotal, erpMonto,
        totalOps,
        pointsEarnedCount, pointsRedeemedCount,
        cardInstalledCount,
        totalPointsEarned, totalPointsRedeemed,
        desglosePorSucursal,
        clientesGanaron = [],
        clientesCanjearon = []
    } = data;

    // Calcular porcentajes
    const porcentajeGanados = erpTotal > 0 ? (pointsEarnedCount / erpTotal) * 100 : 0;
    const porcentajeCanjeados = totalPointsEarned > 0
        ? (totalPointsRedeemed / totalPointsEarned) * 100
        : 0;

    const fechaTexto = `${formatDate(startDate)} - ${formatDate(endDate)}`;

    let html = `
        <div class="alert alert-info" style="margin-bottom:20px;">
            📅 <strong>Período:</strong> ${fechaTexto}
            <span style="margin-left:20px;">🔄 <strong>Actualizado:</strong> ${new Date().toLocaleString('es-MX')}</span>
        </div>
    `;

    // Tarjetas principales
    html += `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="stat-card" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                <div class="stat-number">${erpTotal.toLocaleString('es-MX')}</div>
                <div class="stat-label">📊 Total Operaciones ERP</div>
                <div style="font-size:0.75rem; margin-top:6px; opacity:0.9;">
                    💰 ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(erpMonto)}
                </div>
            </div>
            
            <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                <div class="stat-number">${pointsEarnedCount.toLocaleString('es-MX')}</div>
                <div class="stat-label">⭐ Transacciones Puntos Ganados</div>
                <div style="font-size:0.75rem; margin-top:6px; opacity:0.9;">
                    ${totalPointsEarned.toLocaleString('es-MX')} puntos
                </div>
                <div style="font-size:0.65rem; margin-top:4px; opacity:0.8;">
                    ${porcentajeGanados.toFixed(2)}% de las operaciones ERP
                </div>
            </div>
            
            <div class="stat-card" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                <div class="stat-number">${pointsRedeemedCount.toLocaleString('es-MX')}</div>
                <div class="stat-label">🎁 Transacciones Puntos Canjeados</div>
                <div style="font-size:0.75rem; margin-top:6px; opacity:0.9;">
                    ${totalPointsRedeemed.toLocaleString('es-MX')} puntos
                </div>
                <div style="font-size:0.65rem; margin-top:4px; opacity:0.8;">
                    ${porcentajeCanjeados.toFixed(2)}% de los puntos ganados
                </div>
            </div>
            
            <div class="stat-card" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                <div class="stat-number" style="font-size:1.6rem;">${porcentajeCanjeados.toFixed(1)}%</div>
                <div class="stat-label">📈 Tasa de Canje</div>
                <div style="font-size:0.7rem; margin-top:6px; opacity:0.9;">
                    Puntos canjeados / ganados
                </div>
            </div>

            <div class="stat-card" style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);">
                <div class="stat-number">${cardInstalledCount.toLocaleString('es-MX')}</div>
                <div class="stat-label">💳 Card Installed</div>
                <div style="font-size:0.7rem; margin-top:6px; opacity:0.9;">
                    Teléfonos únicos en el periodo
                </div>
            </div>
        </div>
    `;

    // Comparativa de puntos
    const maxPuntos = Math.max(totalPointsEarned, totalPointsRedeemed, 1);
    const anchoGanados = (totalPointsEarned / maxPuntos) * 100;
    const anchoCanjeados = (totalPointsRedeemed / maxPuntos) * 100;

    html += `
        <div style="background: #f8fafc; border-radius: 16px; padding: 20px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
            <h4 style="color: #1e40af; margin-bottom: 16px; text-align: center;">📊 Comparativa de Puntos</h4>
            
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
                    <span style="color: #059669; font-weight: 600;">⭐ Puntos Ganados</span>
                    <span style="font-weight: bold; color: #059669;">${totalPointsEarned.toLocaleString('es-MX')}</span>
                </div>
                <div style="background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 28px;">
                    <div style="width: ${anchoGanados}%; background: linear-gradient(90deg, #059669, #10b981); height: 100%; border-radius: 20px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; color: white; font-weight: bold; font-size: 0.8rem;">
                        ${anchoGanados > 15 ? totalPointsEarned.toLocaleString('es-MX') : ''}
                    </div>
                </div>
            </div>

            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
                    <span style="color: #f97316; font-weight: 600;">🎁 Puntos Canjeados</span>
                    <span style="font-weight: bold; color: #f97316;">${totalPointsRedeemed.toLocaleString('es-MX')}</span>
                </div>
                <div style="background: #e2e8f0; border-radius: 20px; overflow: hidden; height: 28px;">
                    <div style="width: ${anchoCanjeados}%; background: linear-gradient(90deg, #f97316, #ea580c); height: 100%; border-radius: 20px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; color: white; font-weight: bold; font-size: 0.8rem;">
                        ${anchoCanjeados > 15 ? totalPointsRedeemed.toLocaleString('es-MX') : ''}
                    </div>
                </div>
            </div>

            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px dashed #cbd5e1; text-align: center;">
                <div style="font-size: 0.8rem; color: #64748b;">Diferencia neta de puntos</div>
                <div style="font-size: 1.8rem; font-weight: 800; color: ${totalPointsEarned - totalPointsRedeemed >= 0 ? '#059669' : '#dc2626'};">
                    ${(totalPointsEarned - totalPointsRedeemed).toLocaleString('es-MX')}
                </div>
                <div style="font-size: 0.7rem; color: #94a3b8;">
                    (${totalPointsEarned - totalPointsRedeemed >= 0 ? 'saldo a favor' : 'déficit'})
                </div>
            </div>
        </div>
    `;

    // Desglose interactivo: sucursales y clientes
    html += `
        <div style="margin-top:28px;">
            <h4 style="color:#1e40af; margin-bottom:12px;">📋 Desgloses detallados</h4>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; border-bottom:2px solid #e2e8f0; padding-bottom:10px;">
                <button type="button" class="servipremia-breakdown-tab" data-servipremia-tab="branches" style="border:0; border-radius:8px; padding:9px 14px; background:#1e40af; color:#ffffff; cursor:pointer; font-weight:700;">
                    🏪 Por sucursal
                </button>
                <button type="button" class="servipremia-breakdown-tab" data-servipremia-tab="earned" style="border:0; border-radius:8px; padding:9px 14px; background:#e2e8f0; color:#334155; cursor:pointer; font-weight:700;">
                    ⭐ Clientes que acumularon
                </button>
                <button type="button" class="servipremia-breakdown-tab" data-servipremia-tab="redeemed" style="border:0; border-radius:8px; padding:9px 14px; background:#e2e8f0; color:#334155; cursor:pointer; font-weight:700;">
                    🎁 Clientes que canjearon
                </button>
            </div>

            <div id="servipremiaBranchesPanel">
                ${renderServipremiaBranchTable(desglosePorSucursal)}
            </div>

            <div id="servipremiaEarnedPanel" style="display:none;">
                ${renderServipremiaClientTable(clientesGanaron, 'earned')}
            </div>

            <div id="servipremiaRedeemedPanel" style="display:none;">
                ${renderServipremiaClientTable(clientesCanjearon, 'redeemed')}
            </div>
        </div>

        <div id="servipremiaClientModal" style="display:none; position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.72); padding:20px; overflow:auto;">
            <div style="background:#ffffff; max-width:1000px; margin:4vh auto; border-radius:16px; box-shadow:0 20px 50px rgba(0,0,0,0.3); overflow:hidden;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; background:linear-gradient(135deg,#1e40af,#3b82f6); color:#ffffff;">
                    <h3 id="servipremiaClientModalTitle" style="margin:0; font-size:1rem;">Detalle del cliente</h3>
                    <button type="button" id="servipremiaClientModalClose" aria-label="Cerrar" style="border:0; background:rgba(255,255,255,0.2); color:#ffffff; border-radius:8px; width:34px; height:34px; cursor:pointer; font-size:1.3rem;">&times;</button>
                </div>
                <div id="servipremiaClientModalBody" style="padding:20px; max-height:72vh; overflow:auto;"></div>
            </div>
        </div>
    `;

    // Botón exportar
    html += `
        <div style="display:flex; justify-content:flex-end; margin-top:20px;">
            <button id="exportarServipremiaBtn" style="
                background: linear-gradient(135deg, #059669, #10b981);
                color: white;
                border: none;
                padding: 10px 24px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                📊 Exportar a Excel
            </button>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';

    const exportBtn = document.getElementById('exportarServipremiaBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportarServipremiaToExcel);
    }

    setupServipremiaBreakdownEvents(clientesGanaron, clientesCanjearon);
}

// ==================== EXPORTAR A EXCEL ====================
function exportarServipremiaToExcel() {
    if (!cachedServipremiaData) {
        showError('servipremia', 'No hay datos para exportar');
        return;
    }

    const {
        startDate, endDate,
        erpTotal, erpMonto,
        pointsEarnedCount, pointsRedeemedCount,
        cardInstalledCount,
        totalPointsEarned, totalPointsRedeemed,
        desglosePorSucursal
    } = cachedServipremiaData;

    const porcentajeCanjeados = totalPointsEarned > 0
        ? (totalPointsRedeemed / totalPointsEarned) * 100
        : 0;

    const excelData = [
        ['SERVIPREMIA - REPORTE DE PUNTOS'],
        [`Período: ${formatDate(startDate)} - ${formatDate(endDate)}`],
        [`Generado: ${new Date().toLocaleString('es-MX')}`],
        [],
        ['RESUMEN GENERAL'],
        ['Métrica', 'Valor'],
        ['Total Operaciones ERP', erpTotal],
        ['Monto Total ERP', erpMonto],
        ['Transacciones Puntos Ganados', pointsEarnedCount],
        ['Puntos Ganados', totalPointsEarned],
        ['Transacciones Puntos Canjeados', pointsRedeemedCount],
        ['Puntos Canjeados', totalPointsRedeemed],
        ['Card Installed - Teléfonos únicos', cardInstalledCount],
        ['Tasa de Canje (%)', porcentajeCanjeados.toFixed(2)],
        [],
        ['DESGLOSE POR SUCURSAL'],
        ['#', 'Sucursal', 'Email', 'Tx Ganados', 'Puntos Ganados', 'Tx Canjeados', 'Puntos Canjeados', 'Tasa de Canje (%)']
    ];

    desglosePorSucursal.forEach((row, idx) => {
        const tasaCanje = row.earnedPoints > 0
            ? (row.redeemedPoints / row.earnedPoints) * 100
            : 0;

        excelData.push([
            idx + 1,
            row.nombre,
            row.email,
            row.earnedCount,
            row.earnedPoints,
            row.redeemedCount,
            row.redeemedPoints,
            tasaCanje.toFixed(2)
        ]);
    });

    excelData.push([
        '', 'TOTALES', '',
        pointsEarnedCount, totalPointsEarned,
        pointsRedeemedCount, totalPointsRedeemed,
        porcentajeCanjeados.toFixed(2)
    ]);

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);

        ws['!cols'] = [
            { wch: 8 }, { wch: 30 }, { wch: 30 },
            { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 18 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Servipremia');

        const nombreArchivo = `servipremia_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);

        showInfo('servipremia', `✅ Exportado: ${nombreArchivo}`);
    } catch (error) {
        console.error('❌ Error exportando:', error);
        showError('servipremia', `Error al exportar: ${error.message}`);
    }
}

// ==================== EXPORTAR GLOBAL ====================
window.initServipremiaModule = initServipremiaModule;
window.searchServipremia = searchServipremia;
window.exportarServipremiaToExcel = exportarServipremiaToExcel;

console.log('✅ Módulo SERVIPREMIA cargado');
