// ==================== DASHBOARD ADMINISTRATIVO ====================
// Dashboard mensual. Solo consulta/renderiza datos cuando la sesión tiene rol admin.
(function () {
    'use strict';

    const PAGE_SIZE = 100;
    const MAX_PAGES = 500;
    const SERVICE_LOOKUP_CONCURRENCY = 1;
    const REQUEST_TIMEOUT_MS = 45000;
    const SALE_TYPES = [
        { key: 'products', label: 'Contado' },
        { key: 'services', label: 'Servicios' },
        { key: 'credit', label: 'Créditos' }
    ];
    const SERVICIOS_ACTIVOS_DEFAULT = [
        { id: 214, nombre: 'Pago SPAY', comision: 10 },
        { id: 215, nombre: 'Pago PayJoy', comision: 10 },
        { id: 216, nombre: 'Pago Credicel', comision: 10 },
        { id: 219, nombre: 'Recarga Subdistribuidor', comision: 0 },
        { id: 259, nombre: 'Pago Pospago Telcel', comision: 10 },
        { id: 260, nombre: 'Pago Amigo Paguitos', comision: 10 },
        { id: 995, nombre: 'Abono Capital SPAY', comision: 0 },
        { id: 1094, nombre: 'Reparación Credicel', comision: 0 }
    ];
    // Productos SADECO identificados en las capturas del catálogo compartidas por el usuario.
    // Se agregan solo al desglose del dashboard; no alteran las comisiones del módulo de cobro.
    const SERVICIOS_SADECO = [
        { id: 1322, nombre: 'Pago SADECO CFE', comision: 15 },
        { id: 1327, nombre: 'Pago SADECO Elektra', comision: 15 },
        { id: 1328, nombre: 'Pago SADECO Sky', comision: 15 },
        { id: 1329, nombre: 'Pago SADECO Dish', comision: 15 },
        { id: 1331, nombre: 'Pago SADECO Izzi', comision: 15 },
        { id: 1332, nombre: 'Pago SADECO Betterware', comision: 15 },
        { id: 1333, nombre: 'Pago SADECO Arabela', comision: 15 },
        { id: 1334, nombre: 'Pago SADECO Ilusión', comision: 15 },
        { id: 1335, nombre: 'Pago SADECO Jafra', comision: 15 },
        { id: 1336, nombre: 'Pago SADECO Herbalife', comision: 15 },
        { id: 1337, nombre: 'Pago SADECO Avon', comision: 15 },
        { id: 1338, nombre: 'Pago SADECO Blue Telecom', comision: 15 },
        { id: 1339, nombre: 'Pago SADECO Cablemás', comision: 15 },
        { id: 1340, nombre: 'Pago SADECO Totalplay', comision: 15 },
        { id: 1341, nombre: 'Pago SADECO Upperware', comision: 15 },
        { id: 1342, nombre: 'Pago SADECO Star TV', comision: 15 },
        { id: 1343, nombre: "Pago SADECO L'Bel", comision: 15 },
        { id: 1344, nombre: 'Pago SADECO Google', comision: 15 },
        { id: 1345, nombre: 'Pago SADECO Netflix', comision: 15 },
        { id: 1346, nombre: 'Pago SADECO Amazon Prime', comision: 15 },
        { id: 1347, nombre: 'Pago SADECO Nintendo', comision: 15 },
        { id: 1348, nombre: 'Pago SADECO Xbox Live', comision: 15 },
        { id: 1349, nombre: 'Pago SADECO Play Station Store', comision: 15 },
        { id: 1358, nombre: 'Pago SADECO Fuller', comision: 15 },
        { id: 1359, nombre: 'Pago SADECO Telmex', comision: 15 }
    ];

    let loadSequence = 0;
    let singleDashboardCacheKey = null;
    let comparisonDashboardCacheKey = null;
    let yesterdaySummaryCache = null;
    let apiRequestQueue = Promise.resolve();
    const periodDataCache = new Map();

    function currentUser() {
        try {
            return JSON.parse(sessionStorage.getItem('servicel_user') || 'null');
        } catch (_) {
            return null;
        }
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function localDateString(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    // Las fechas se forman con componentes locales y se envían como fechas de calendario,
    // sin pasar por toISOString(), para evitar que la zona horaria cambie el día solicitado.
    function currentMonthRange(now) {
        const date = now || new Date();
        const firstDay = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-01`;
        const lastDay = localDateString(date);
        return {
            start: `${firstDay} 00:00:00`,
            end: `${lastDay} 23:59:59`,
            startDate: firstDay,
            endDate: lastDay
        };
    }

    function localMonthValue(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    }

    function parseMonthValue(value) {
        const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        if (month < 1 || month > 12) return null;
        return { year: year, month: month, value: `${match[1]}-${match[2]}` };
    }

    function monthRange(monthValue, cutoffDay) {
        const parsed = parseMonthValue(monthValue);
        if (!parsed) throw new Error('Selecciona un mes válido.');
        const finalDayOfMonth = new Date(parsed.year, parsed.month, 0).getDate();
        const requestedDay = cutoffDay == null ? finalDayOfMonth : Math.min(finalDayOfMonth, cutoffDay);
        const endDay = Math.max(1, requestedDay);
        const startDate = `${parsed.value}-01`;
        const endDate = `${parsed.value}-${pad2(endDay)}`;
        return {
            month: parsed.value,
            start: `${startDate} 00:00:00`,
            end: `${endDate} 23:59:59`,
            startDate: startDate,
            endDate: endDate
        };
    }

    function selectedMonthRange(monthValue, now) {
        const date = now || new Date();
        const currentMonth = localMonthValue(date);
        if (String(monthValue) > currentMonth) throw new Error('No puedes seleccionar un mes futuro.');
        return monthRange(monthValue, monthValue === currentMonth ? date.getDate() : null);
    }

    function comparisonRanges(firstMonth, secondMonth, now) {
        const date = now || new Date();
        const first = parseMonthValue(firstMonth);
        const second = parseMonthValue(secondMonth);
        if (!first || !second) throw new Error('Selecciona los dos meses que quieres comparar.');
        if (first.value === second.value) throw new Error('Elige dos meses diferentes para comparar.');

        const currentMonth = localMonthValue(date);
        if (first.value > currentMonth || second.value > currentMonth) throw new Error('No puedes comparar meses futuros.');
        const hasCurrentMonth = first.value === currentMonth || second.value === currentMonth;
        const elapsedDay = hasCurrentMonth ? date.getDate() : null;
        return {
            first: monthRange(first.value, elapsedDay),
            second: monthRange(second.value, elapsedDay),
            alignedByElapsedDays: hasCurrentMonth
        };
    }

    function monthLabel(monthValue) {
        const parsed = parseMonthValue(monthValue);
        if (!parsed) return String(monthValue || 'Mes');
        return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })
            .format(new Date(parsed.year, parsed.month - 1, 1));
    }

    function displayDate(dateStr) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
        if (!match) return String(dateStr || '');
        const localDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }).format(localDate);
    }

    function currency(value) {
        const number = Number(value) || 0;
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(number);
    }

    function number(value) {
        return (Number(value) || 0).toLocaleString('es-MX');
    }

    function safeHtml(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(String(value == null ? '' : value));
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
    }

    function buildUrl(base, params) {
        const url = new URL(base);
        Object.entries(params).forEach(function (entry) {
            const key = entry[0];
            const value = entry[1];
            if (Array.isArray(value)) {
                value.forEach(function (item) { url.searchParams.append(key, String(item)); });
            } else if (value !== undefined && value !== null) {
                // getDateRangeContado devuelve '+' como separador de fecha/hora para
                // interpolación directa. Al usar URLSearchParams, '+' literal se codifica
                // como %2B y el API recibe un signo más en vez de un espacio. Normalizarlo
                // produce el '+' de formulario que el servidor interpreta como espacio.
                const normalizedValue = (key === 'start_date' || key === 'end_date')
                    ? String(value).replace(/\+/g, ' ')
                    : String(value);
                url.searchParams.set(key, normalizedValue);
            }
        });
        return url.toString();
    }

    function fetchJson(url) {
        const performRequest = async function () {
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
            try {
                const requestOptions = { headers: { Authorization: `Bearer ${CONFIG.FIXED_TOKEN}` } };
                if (controller) requestOptions.signal = controller.signal;
                const response = await fetch(url, requestOptions);
                if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    throw new Error(`Tiempo de espera agotado (${Math.round(REQUEST_TIMEOUT_MS / 1000)} s).`);
                }
                throw error;
            } finally {
                if (timeoutId !== null) clearTimeout(timeoutId);
            }
        };
        const queuedRequest = apiRequestQueue.then(performRequest, performRequest);
        apiRequestQueue = queuedRequest.then(function () {}, function () {});
        return queuedRequest;
    }

    function fetchPeriodData(metric, range, fetcher, forceRefresh) {
        const cacheKey = `${metric}|${range.start}|${range.end}`;
        if (forceRefresh) periodDataCache.delete(cacheKey);
        if (periodDataCache.has(cacheKey)) return periodDataCache.get(cacheKey);

        let requestPromise;
        requestPromise = Promise.resolve().then(fetcher).then(function (result) {
            const hasPartialErrors = result && (
                (Array.isArray(result.errors) && result.errors.length > 0) ||
                (Array.isArray(result.queryErrors) && result.queryErrors.length > 0)
            );
            if (hasPartialErrors && periodDataCache.get(cacheKey) === requestPromise) periodDataCache.delete(cacheKey);
            return result;
        }).catch(function (error) {
            if (periodDataCache.get(cacheKey) === requestPromise) periodDataCache.delete(cacheKey);
            throw error;
        });
        periodDataCache.set(cacheKey, requestPromise);
        return requestPromise;
    }

    function amountFrom(payload) {
        const raw = payload && (
            payload.total_amount !== undefined ? payload.total_amount :
            payload.total !== undefined ? payload.total :
            payload.total_sales !== undefined ? payload.total_sales :
            payload.amount
        );
        const parsed = Number.parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function operationsFrom(payload) {
        const raw = payload && (
            payload.meta && payload.meta.total !== undefined ? payload.meta.total :
            payload.pagination && payload.pagination.total !== undefined ? payload.pagination.total :
            payload.count !== undefined ? payload.count :
            payload.total_count !== undefined ? payload.total_count :
            Array.isArray(payload.data) ? payload.data.length : 0
        );
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    async function fetchSalesAggregate(saleType, range) {
        const url = buildUrl(CONFIG.API_SALES, {
            page: 1,
            per_page: 1,
            total: 1,
            start_date: range.start,
            end_date: range.end,
            sale_type: saleType
        });
        const payload = await fetchJson(url);
        return { operations: operationsFrom(payload), amount: amountFrom(payload) };
    }

    async function fetchProductAggregate(productId, range) {
        const url = buildUrl(CONFIG.API_SALES, {
            page: 1,
            per_page: 1,
            total: 1,
            start_date: range.start,
            end_date: range.end,
            sale_type: 'services',
            'product_ids[]': [productId]
        });
        const payload = await fetchJson(url);
        return { operations: operationsFrom(payload), amount: amountFrom(payload) };
    }

    async function fetchAllPages(base, baseParams) {
        const allRows = [];
        let page = 1;

        while (page <= MAX_PAGES) {
            const payload = await fetchJson(buildUrl(base, Object.assign({}, baseParams, {
                page: page,
                per_page: PAGE_SIZE,
                total: 0
            })));
            const rows = Array.isArray(payload.data) ? payload.data : [];
            allRows.push.apply(allRows, rows);

            const lastPageValue = payload.last_page ||
                (payload.meta && payload.meta.last_page) ||
                (payload.pagination && payload.pagination.last_page);
            const lastPage = Number.parseInt(lastPageValue, 10);
            if (Number.isFinite(lastPage) && lastPage > 0) {
                if (page >= lastPage) break;
            } else if (rows.length < PAGE_SIZE) {
                break;
            }
            page += 1;
        }

        if (page > MAX_PAGES) throw new Error(`La consulta excedió el límite de ${MAX_PAGES} páginas`);
        return allRows;
    }

    function getActiveServices() {
        const configuredServices = typeof SERVICIOS_CONFIG !== 'undefined' && Array.isArray(SERVICIOS_CONFIG)
            ? SERVICIOS_CONFIG.map(function (service) {
                return { id: service.id, nombre: service.nombre, comision: Number(service.comision) || 0 };
            })
            : SERVICIOS_ACTIVOS_DEFAULT.slice();
        const servicesById = new Map();
        configuredServices.concat(SERVICIOS_SADECO).forEach(function (service) {
            servicesById.set(String(service.id), service);
        });
        return Array.from(servicesById.values());
    }

    async function fetchServices(range) {
        const services = getActiveServices();
        const results = new Array(services.length);
        const errors = [];
        let nextIndex = 0;
        const workerCount = Math.min(SERVICE_LOOKUP_CONCURRENCY, services.length);
        const workers = Array.from({ length: workerCount }, async function () {
            while (true) {
                const index = nextIndex++;
                if (index >= services.length) return;
                const service = services[index];
                try {
                    const totals = await fetchProductAggregate(service.id, range);
                    const commissionPerOperation = Number(service.comision) || 0;
                    results[index] = {
                        id: service.id,
                        nombre: service.nombre,
                        operations: totals.operations,
                        amount: totals.amount,
                        commissionPerOperation: commissionPerOperation,
                        commissionAmount: totals.operations * commissionPerOperation
                    };
                } catch (error) {
                    errors.push({ service: service.nombre, message: error && error.message ? error.message : 'Error de consulta' });
                }
            }
        });
        await Promise.all(workers);
        const validResults = results.filter(Boolean);
        if (!validResults.length && errors.length) {
            throw new Error(`No se pudo consultar ningún servicio. ${errors[0].service}: ${errors[0].message}`);
        }
        if (errors.length) validResults.queryErrors = errors;
        const sortedResults = validResults;
        sortedResults.sort(function (a, b) { return b.amount - a.amount || a.nombre.localeCompare(b.nombre); });
        return sortedResults;
    }

    async function fetchCashEquipment(range) {
        const lineIds = [4, 5];
        const salesByLine = await Promise.all(lineIds.map(function (lineId) {
            return fetchAllPages(CONFIG.API_SALES, {
                sale_type: 'products',
                start_date: range.start,
                end_date: range.end,
                line_id: lineId,
                'classification_ids[]': [9, 3]
            }).then(function (sales) { return { lineId: lineId, sales: sales }; });
        }));

        const result = {
            Libre: { quantity: 0, amount: 0 },
            Telcel: { quantity: 0, amount: 0 }
        };
        const seenDetails = new Set();

        salesByLine.forEach(function (lineResult) {
            lineResult.sales.forEach(function (sale, saleIndex) {
                const saleKey = sale && sale.id != null ? String(sale.id) : `line${lineResult.lineId}-sale${saleIndex}`;
                (sale.details || []).forEach(function (detail, detailIndex) {
                    const product = detail.product || {};
                    const productLineId = Number(product.line_id || product.lineId || 0);
                    if (productLineId && productLineId !== lineResult.lineId) return;

                    const productName = String(product.name || detail.product_name || '').trim();
                    if (!productName && !productLineId) return;
                    const category = productName.toLowerCase().includes('libre') ? 'Libre' : 'Telcel';
                    const specificationValues = [];
                    (detail.specification_groups || []).forEach(function (group) {
                        (group.specification_details || []).forEach(function (spec) {
                            if (spec && spec.value != null && spec.value !== '') specificationValues.push(String(spec.value));
                        });
                    });
                    const productId = product.id || detail.product_id || 'producto';
                    const detailKey = detail.id != null
                        ? `${saleKey}|detail${detail.id}`
                        : `${saleKey}|line${lineResult.lineId}|product${productId}|${specificationValues.join(',')}|index${detailIndex}`;
                    if (seenDetails.has(detailKey)) return;
                    seenDetails.add(detailKey);

                    const rawQuantity = Number.parseFloat(detail.quantity);
                    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0
                        ? rawQuantity
                        : (specificationValues.length || 1);
                    const rawAmount = Number.parseFloat(detail.total_amount);
                    const fallbackAmount = Number.parseFloat(detail.total);
                    const amount = Number.isFinite(rawAmount) ? rawAmount : (Number.isFinite(fallbackAmount) ? fallbackAmount : 0);
                    result[category].quantity += quantity;
                    result[category].amount += amount;
                });
            });
        });

        return result;
    }

    async function fetchCreditProviders(range) {
        const sales = await fetchAllPages(CONFIG.API_SALES, {
            sale_type: 'credit',
            start_date: range.start,
            end_date: range.end
        });
        const providers = new Map();
        const seenSales = new Set();

        sales.forEach(function (sale, index) {
            const saleId = sale && sale.id != null ? String(sale.id) : `sale-${index}`;
            if (seenSales.has(saleId)) return;
            seenSales.add(saleId);

            const provider = sale.credit_provider || {};
            const providerName = provider.equipment_value || provider.name ||
                (provider.id != null ? `Proveedor ${provider.id}` : 'Sin proveedor');
            const key = provider.id != null ? String(provider.id) : String(providerName);
            if (!providers.has(key)) {
                providers.set(key, { name: String(providerName), operations: 0, downPayment: 0 });
            }
            const row = providers.get(key);
            row.operations += 1;
            (sale.details || []).forEach(function (detail) {
                if (String(detail.payment_type || '').trim().toLowerCase() !== 'enganche') return;
                const raw = Number.parseFloat(detail.total_amount);
                const fallback = Number.parseFloat(detail.total);
                row.downPayment += Number.isFinite(raw) ? raw : (Number.isFinite(fallback) ? fallback : 0);
            });
        });

        return Array.from(providers.values()).sort(function (a, b) {
            return b.downPayment - a.downPayment || a.name.localeCompare(b.name);
        });
    }

    function taeGroups() {
        const otherCompanies = CONFIG.TAE_OTHER_COMPANIES || {};
        const otherIds = Object.values(otherCompanies).reduce(function (all, ids) {
            return all.concat(Array.isArray(ids) ? ids : []);
        }, []);
        return [
            { name: 'TAE Telcel', ids: [220, 319] },
            { name: 'Apps Creativas', ids: Array.isArray(CONFIG.TAE_APPS_IDS) ? CONFIG.TAE_APPS_IDS : [] },
            { name: 'Otras compañías', ids: otherIds }
        ];
    }

    async function fetchTaeAmount(productIds, range) {
        if (!productIds.length) return 0;
        const base = `${String(CONFIG.API_REPORTS).replace(/\/$/, '')}/sales/product-sales`;
        const url = buildUrl(base, {
            start_date: range.start,
            end_date: range.end,
            page: 1,
            per_page: 1,
            'product_ids[]': productIds
        });
        const payload = await fetchJson(url);
        return amountFrom(payload);
    }

    async function fetchTaeBreakdown(range) {
        return Promise.all(taeGroups().map(async function (group) {
            return { name: group.name, amount: await fetchTaeAmount(group.ids, range) };
        }));
    }

    function setStatus(id, text, state) {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = text;
        element.className = `dashboard-panel-status${state ? ` is-${state}` : ''}`;
        if (typeof element.setAttribute === 'function') element.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    }

    function setCardLoading(id, active) {
        const element = document.getElementById(id);
        if (!element) return;
        const classes = new Set(String(element.className || '').split(/\s+/).filter(Boolean));
        if (active) classes.add('is-loading-progress');
        else classes.delete('is-loading-progress');
        element.className = Array.from(classes).join(' ');
        if (typeof element.setAttribute === 'function') element.setAttribute('aria-busy', active ? 'true' : 'false');
    }

    function renderCash(data) {
        const element = document.getElementById('adminDashCashContent');
        if (!element) return;
        element.innerHTML = `
            <div class="dashboard-detail-grid">
                ${['Libre', 'Telcel'].map(function (name) {
                    const item = data[name];
                    return `<div class="dashboard-detail-card">
                        <div class="dashboard-detail-title">${name === 'Libre' ? '🔓 Equipos Libres' : '📶 Equipos Telcel'}</div>
                        <div class="dashboard-detail-number">${number(item.quantity)} <small>equipos</small></div>
                        <div class="dashboard-detail-amount">${currency(item.amount)}</div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    function renderServices(data) {
        const element = document.getElementById('adminDashServicesContent');
        if (!element) return;
        const soldServices = data.filter(function (row) { return row.operations > 0; });
        const totalOperations = soldServices.reduce(function (sum, row) { return sum + row.operations; }, 0);
        const totalAmount = soldServices.reduce(function (sum, row) { return sum + row.amount; }, 0);
        const totalCommission = soldServices.reduce(function (sum, row) { return sum + row.commissionAmount; }, 0);
        const partialNotice = data.queryErrors && data.queryErrors.length
            ? `<div class="dashboard-query-warning">Resultados parciales: ${data.queryErrors.length} servicio(s) no respondieron. ${safeHtml(data.queryErrors[0].service)}: ${safeHtml(data.queryErrors[0].message)}</div>`
            : '';
        const rows = soldServices.map(function (row) {
            return `<tr><td>${safeHtml(row.nombre)}</td><td class="dashboard-table-number">${number(row.operations)}</td><td class="dashboard-table-money">${currency(row.amount)}</td><td class="dashboard-table-money">${currency(row.commissionPerOperation)}</td><td class="dashboard-table-money">${currency(row.commissionAmount)}</td></tr>`;
        }).join('');
        element.innerHTML = `
            <div class="dashboard-section-total"><span>${number(totalOperations)} operaciones activas</span><strong>${currency(totalAmount)}</strong></div>
            <div class="dashboard-services-commission-total">Comisiones del período: <strong>${currency(totalCommission)}</strong></div>
            ${partialNotice}
            <div class="dashboard-table-wrap"><table class="dashboard-table">
                <thead><tr><th>Servicio</th><th>Operaciones</th><th>Monto antes de comisión</th><th>Comisión por operación</th><th>Comisión total</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5">No hubo ventas de servicios en el período</td></tr>'}</tbody>
            </table></div>`;
    }

    function serviceComparisonRows(dataA, dataB) {
        const mapA = new Map(dataA.map(function (item) { return [String(item.id), item]; }));
        const mapB = new Map(dataB.map(function (item) { return [String(item.id), item]; }));
        const keys = Array.from(new Set(Array.from(mapA.keys()).concat(Array.from(mapB.keys()))));
        const rows = [];
        keys.forEach(function (key) {
            const itemA = mapA.get(key) || null;
            const itemB = mapB.get(key) || null;
            const operationsA = Number(itemA && itemA.operations) || 0;
            const operationsB = Number(itemB && itemB.operations) || 0;
            if (operationsA <= 0 && operationsB <= 0) return;
            const label = (itemA && itemA.nombre) || (itemB && itemB.nombre) || key;
            const defaultRate = Number(itemA ? itemA.commissionPerOperation : itemB.commissionPerOperation) || 0;
            rows.push(
                { label: `${label} · operaciones`, a: operationsA, b: operationsB, type: 'number' },
                { label: `${label} · monto antes de comisión`, a: Number(itemA && itemA.amount) || 0, b: Number(itemB && itemB.amount) || 0, type: 'money' },
                { label: `${label} · comisión por operación`, a: itemA ? Number(itemA.commissionPerOperation) || 0 : defaultRate, b: itemB ? Number(itemB.commissionPerOperation) || 0 : defaultRate, type: 'money' },
                { label: `${label} · comisión total`, a: Number(itemA && itemA.commissionAmount) || 0, b: Number(itemB && itemB.commissionAmount) || 0, type: 'money' }
            );
        });
        return rows;
    }

    function renderCredits(data) {
        const element = document.getElementById('adminDashCreditsContent');
        if (!element) return;
        const totalOperations = data.reduce(function (sum, row) { return sum + row.operations; }, 0);
        const totalDownPayment = data.reduce(function (sum, row) { return sum + row.downPayment; }, 0);
        const rows = data.map(function (row) {
            return `<tr><td>${safeHtml(row.name)}</td><td class="dashboard-table-number">${number(row.operations)}</td><td class="dashboard-table-money">${currency(row.downPayment)}</td></tr>`;
        }).join('');
        element.innerHTML = `
            <div class="dashboard-section-total"><span>${number(totalOperations)} operaciones de crédito</span><strong>${currency(totalDownPayment)} de enganches</strong></div>
            <div class="dashboard-table-wrap"><table class="dashboard-table">
                <thead><tr><th>Proveedor</th><th>Operaciones</th><th>Enganche cobrado</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="3">No se encontraron operaciones de crédito</td></tr>'}</tbody>
            </table></div>`;
    }

    function renderTae(data) {
        const element = document.getElementById('adminDashTaeContent');
        if (!element) return;
        const total = data.reduce(function (sum, row) { return sum + row.amount; }, 0);
        element.innerHTML = `
            <div class="dashboard-tae-total"><span>Total TAE</span><strong>${currency(total)}</strong></div>
            <div class="dashboard-tae-grid">${data.map(function (row) {
                return `<div class="dashboard-detail-card"><div class="dashboard-detail-title">${safeHtml(row.name)}</div><div class="dashboard-detail-amount">${currency(row.amount)}</div></div>`;
            }).join('')}</div>`;
    }

    function renderMonthlySummary(state) {
        const amountElement = document.getElementById('adminDashMonthSales');
        const operationsElement = document.getElementById('adminDashMonthOperations');
        const ticketElement = document.getElementById('adminDashMonthTicket');
        const typesElement = document.getElementById('adminDashSalesByType');
        if (!amountElement || !operationsElement || !ticketElement || !typesElement) return;

        const allReady = SALE_TYPES.every(function (type) { return state[type.key] !== undefined; });
        const hasError = SALE_TYPES.some(function (type) { return state[type.key] && state[type.key].error; });
        const successful = SALE_TYPES.filter(function (type) { return state[type.key] && !state[type.key].error; });
        const amount = successful.reduce(function (sum, type) { return sum + state[type.key].amount; }, 0);
        const operations = successful.reduce(function (sum, type) { return sum + state[type.key].operations; }, 0);

        amountElement.textContent = allReady ? currency(amount) : 'Cargando…';
        operationsElement.textContent = allReady ? number(operations) : 'Cargando…';
        ticketElement.textContent = allReady
            ? (hasError ? 'Incompleto' : currency(operations ? amount / operations : 0))
            : 'Cargando…';

        typesElement.innerHTML = SALE_TYPES.map(function (type) {
            const data = state[type.key];
            const value = !data ? 'Cargando…' : (data.error ? 'No disponible' : currency(data.amount));
            const count = !data ? 'Consultando operaciones…' : (data.error ? safeHtml(data.errorMessage || 'Error de consulta') : `${number(data.operations)} operaciones`);
            const loadingClass = !data ? ' is-loading-progress' : '';
            const errorClass = data && data.error ? ' has-query-error' : '';
            return `<div class="dashboard-type-card dashboard-type-${type.key}${loadingClass}${errorClass}">
                <span class="dashboard-type-name">${type.label}</span>
                <strong>${value}</strong>
                <small>${count}</small>
            </div>`;
        }).join('');
    }

    function comparisonValue(value, type) {
        return type === 'number' ? number(value) : currency(value);
    }

    function comparisonChange(valueA, valueB, type) {
        const delta = (Number(valueB) || 0) - (Number(valueA) || 0);
        const amountText = type === 'number'
            ? `${delta > 0 ? '+' : ''}${number(delta)}`
            : `${delta > 0 ? '+' : ''}${currency(delta)}`;
        const base = Number(valueA) || 0;
        const percentage = base === 0
            ? (delta === 0 ? '0.0%' : '—')
            : `${delta > 0 ? '+' : ''}${((delta / Math.abs(base)) * 100).toFixed(1)}%`;
        return { amount: amountText, percentage: percentage };
    }

    function renderComparisonTable(statusId, contentId, resultA, resultB, rows, labels) {
        const content = document.getElementById(contentId);
        if (!resultA || !resultB) {
            setStatus(statusId, 'Consultando ambos meses…', 'loading');
            return;
        }
        if (resultA.error || resultB.error) {
            const failures = [];
            if (resultA.error) failures.push(`${labels.first}: ${resultA.message || 'error de consulta'}`);
            if (resultB.error) failures.push(`${labels.second}: ${resultB.message || 'error de consulta'}`);
            const message = `No se pudo completar la comparación de ${labels.first} y ${labels.second}. ${failures.join(' · ')}`;
            setStatus(statusId, message, 'error');
            if (content) content.innerHTML = `<div class="dashboard-comparison-empty">${safeHtml(message)}</div>`;
            return;
        }

        const tableRows = rows(resultA.data, resultB.data);
        if (content) {
            content.innerHTML = `<div class="dashboard-comparison-table-wrap"><table class="dashboard-table dashboard-comparison-table">
                <colgroup><col class="comparison-col-indicator"><col class="comparison-col-month"><col class="comparison-col-month"><col class="comparison-col-difference"><col class="comparison-col-change"></colgroup>
                <thead><tr><th>Indicador</th><th>Mes 1<br><small>${safeHtml(labels.first)}</small></th><th>Mes 2<br><small>${safeHtml(labels.second)}</small></th><th>Diferencia<br><small>Mes 2 − Mes 1</small></th><th>Variación</th></tr></thead>
                <tbody>${tableRows.map(function (row) {
                    const change = comparisonChange(row.a, row.b, row.type);
                    return `<tr><td>${safeHtml(row.label)}</td>
                        <td class="dashboard-table-money">${comparisonValue(row.a, row.type)}</td>
                        <td class="dashboard-table-money">${comparisonValue(row.b, row.type)}</td>
                        <td class="dashboard-table-money">${change.amount}</td>
                        <td class="dashboard-table-number">${change.percentage}</td></tr>`;
                }).join('') || '<tr><td colspan="5">Sin datos para mostrar.</td></tr>'}</tbody>
            </table></div>`;
        }
        setStatus(statusId, 'Comparación cargada', 'success');
    }

    function summaryRows(dataA, dataB, detailed) {
        const rows = [];
        if (!detailed) {
            rows.push({ label: 'Ventas totales', a: dataA.amount, b: dataB.amount, type: 'money' });
            rows.push({ label: 'Operaciones totales', a: dataA.operations, b: dataB.operations, type: 'number' });
            rows.push({ label: 'Ticket promedio', a: dataA.ticket, b: dataB.ticket, type: 'money' });
            return rows;
        }
        SALE_TYPES.forEach(function (type) {
            rows.push({
                label: `${type.label} · monto`,
                a: dataA.byType[type.key].amount,
                b: dataB.byType[type.key].amount,
                type: 'money'
            });
            rows.push({
                label: `${type.label} · operaciones`,
                a: dataA.byType[type.key].operations,
                b: dataB.byType[type.key].operations,
                type: 'number'
            });
        });
        return rows;
    }

    function equipmentRows(dataA, dataB) {
        return ['Libre', 'Telcel'].flatMap(function (name) {
            return [
                { label: `${name} · equipos`, a: dataA[name].quantity, b: dataB[name].quantity, type: 'number' },
                { label: `${name} · monto`, a: dataA[name].amount, b: dataB[name].amount, type: 'money' }
            ];
        });
    }

    function keyedRows(dataA, dataB, keyProperty, labelProperty, measures) {
        const mapA = new Map(dataA.map(function (item) { return [String(item[keyProperty]), item]; }));
        const mapB = new Map(dataB.map(function (item) { return [String(item[keyProperty]), item]; }));
        const keys = new Set(Array.from(mapA.keys()).concat(Array.from(mapB.keys())));
        const rows = [];
        keys.forEach(function (key) {
            const itemA = mapA.get(key) || {};
            const itemB = mapB.get(key) || {};
            const label = itemA[labelProperty] || itemB[labelProperty] || key;
            measures.forEach(function (measure) {
                rows.push({
                    label: `${label} · ${measure.label}`,
                    a: Number(itemA[measure.property]) || 0,
                    b: Number(itemB[measure.property]) || 0,
                    type: measure.type
                });
            });
        });
        return rows;
    }

    async function fetchSalesSummary(range) {
        const settled = await Promise.all(SALE_TYPES.map(async function (type) {
            try {
                return { type: type, data: await fetchPeriodData(`sales:${type.key}`, range, function () {
                    return fetchSalesAggregate(type.key, range);
                }) };
            }
            catch (error) { return { type: type, error: error && error.message ? error.message : 'Error de consulta' }; }
        }));
        const byType = {};
        const errors = [];
        settled.forEach(function (result) {
            byType[result.type.key] = result.data || { operations: 0, amount: 0, error: true, errorMessage: result.error };
            if (result.error) errors.push(`${result.type.label}: ${result.error}`);
        });
        const successful = settled.filter(function (result) { return result.data; }).map(function (result) { return result.data; });
        const amount = successful.reduce(function (sum, item) { return sum + item.amount; }, 0);
        const operations = successful.reduce(function (sum, item) { return sum + item.operations; }, 0);
        return { byType: byType, amount: amount, operations: operations, ticket: operations ? amount / operations : 0, errors: errors };
    }

    function startComparisonMetric(key, rangeA, rangeB, labels, requestId, fetcher, render, cacheMetric) {
        const results = { first: null, second: null };
        function refresh() {
            if (requestId !== loadSequence) return;
            render(results, labels);
        }
        return Promise.all([
            { slot: 'first', range: rangeA },
            { slot: 'second', range: rangeB }
        ].map(function (period) {
            return Promise.resolve().then(function () {
                if (cacheMetric) {
                    return fetchPeriodData(cacheMetric, period.range, function () { return fetcher(period.range); });
                }
                return fetcher(period.range);
            })
                .then(function (data) { results[period.slot] = { data: data }; })
                .catch(function (error) {
                    console.error(`[Dashboard admin] Error en comparación (${key}, ${period.slot}):`, error);
                    results[period.slot] = { error: true, message: error && error.message ? error.message : 'Error de consulta' };
                })
                .then(refresh);
        }));
    }

    function loadComparisonDashboard(requestId, ranges) {
        const labels = { first: monthLabel(ranges.first.month), second: monthLabel(ranges.second.month) };
        const period = document.getElementById('adminDashboardPeriod');
        if (period) {
            const alignment = ranges.alignedByElapsedDays
                ? ` · ambos meses hasta el día ${Number(ranges.first.endDate.slice(-2))}`
                : ' · meses completos';
            period.textContent = `Comparando ${labels.first} (${displayDate(ranges.first.startDate)} – ${displayDate(ranges.first.endDate)}) con ${labels.second} (${displayDate(ranges.second.startDate)} – ${displayDate(ranges.second.endDate)})${alignment}`;
        }

        [
            ['adminDashCompareSummaryStatus', 'adminDashCompareSalesStatus', 'adminDashCompareCashStatus',
             'adminDashCompareServicesStatus', 'adminDashCompareCreditsStatus', 'adminDashCompareTaeStatus']
        ].flat().forEach(function (id) { setStatus(id, 'Consultando ambos meses por turno…', 'loading'); });
        ['adminDashCompareSummary', 'adminDashCompareSales', 'adminDashCompareCash',
         'adminDashCompareServices', 'adminDashCompareCredits', 'adminDashCompareTae'].forEach(function (id) {
            const content = document.getElementById(id);
            if (content) content.innerHTML = '';
        });

        const compareButton = document.getElementById('adminDashCompareButton');
        if (compareButton) {
            compareButton.disabled = true;
            compareButton.textContent = 'Comparando…';
        }
        const tasks = [];
        tasks.push(startComparisonMetric('ventas', ranges.first, ranges.second, labels, requestId, fetchSalesSummary, function (result, monthLabels) {
            renderComparisonTable('adminDashCompareSummaryStatus', 'adminDashCompareSummary', result.first, result.second,
                function (a, b) { return summaryRows(a, b, false); }, monthLabels);
            renderComparisonTable('adminDashCompareSalesStatus', 'adminDashCompareSales', result.first, result.second,
                function (a, b) { return summaryRows(a, b, true); }, monthLabels);
            if (result.first && result.second && result.first.data && result.second.data) {
                const errors = result.first.data.errors.map(function (message) { return `${monthLabels.first}: ${message}`; })
                    .concat(result.second.data.errors.map(function (message) { return `${monthLabels.second}: ${message}`; }));
                if (errors.length) {
                    const message = `Resultados parciales: ${errors.join(' · ')}`;
                    setStatus('adminDashCompareSummaryStatus', message, 'error');
                    setStatus('adminDashCompareSalesStatus', message, 'error');
                }
            }
        }));
        tasks.push(startComparisonMetric('equipos contado', ranges.first, ranges.second, labels, requestId, fetchCashEquipment, function (result, monthLabels) {
            renderComparisonTable('adminDashCompareCashStatus', 'adminDashCompareCash', result.first, result.second,
                equipmentRows, monthLabels);
        }, 'cash-equipment'));
        tasks.push(startComparisonMetric('servicios', ranges.first, ranges.second, labels, requestId, fetchServices, function (result, monthLabels) {
            renderComparisonTable('adminDashCompareServicesStatus', 'adminDashCompareServices', result.first, result.second,
                function (a, b) {
                    return serviceComparisonRows(a, b);
                }, monthLabels);
            if (result.first && result.second && result.first.data && result.second.data) {
                const errors = (result.first.data.queryErrors || []).concat(result.second.data.queryErrors || []);
                if (errors.length) {
                    setStatus('adminDashCompareServicesStatus', `Resultados parciales: ${errors.length} servicio(s) no consultado(s). ${errors[0].message}`, 'error');
                }
            }
        }, 'services-breakdown'));
        tasks.push(startComparisonMetric('créditos', ranges.first, ranges.second, labels, requestId, fetchCreditProviders, function (result, monthLabels) {
            renderComparisonTable('adminDashCompareCreditsStatus', 'adminDashCompareCredits', result.first, result.second,
                function (a, b) {
                    return keyedRows(a, b, 'name', 'name', [
                        { property: 'operations', label: 'operaciones', type: 'number' },
                        { property: 'downPayment', label: 'enganche cobrado', type: 'money' }
                    ]);
                }, monthLabels);
        }, 'credit-providers'));
        tasks.push(startComparisonMetric('TAE', ranges.first, ranges.second, labels, requestId, fetchTaeBreakdown, function (result, monthLabels) {
            renderComparisonTable('adminDashCompareTaeStatus', 'adminDashCompareTae', result.first, result.second,
                function (a, b) {
                    return keyedRows(a, b, 'name', 'name', [
                        { property: 'amount', label: 'monto', type: 'money' }
                    ]);
                }, monthLabels);
        }, 'tae-breakdown'));

        Promise.allSettled(tasks).then(function () {
            if (requestId !== loadSequence || !compareButton) return;
            compareButton.disabled = false;
            compareButton.textContent = '🔍 Comparar meses';
        });
    }

    async function fetchYesterdaySummary(forceRefresh) {
        // Usa la misma fecha calendario local y el mismo helper que el banner de resumen original.
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = localDateString(yesterday);
        const range = typeof getDateRangeContado === 'function'
            ? getDateRangeContado(dateStr)
            : { start: `${dateStr} 00:00:00`, end: `${dateStr} 23:59:59` };
        const results = await Promise.all(SALE_TYPES.map(async function (type) {
            try {
                return { success: true, data: await fetchPeriodData(`sales:${type.key}`, range, function () {
                    return fetchSalesAggregate(type.key, range);
                }, forceRefresh) };
            } catch (error) {
                console.error(`[Dashboard admin] Error en resumen diario (${type.key}):`, error);
                return { success: false };
            }
        }));
        const successful = results.filter(function (result) { return result.success; });
        if (!successful.length) throw new Error('No se pudo consultar ningún tipo de venta del día anterior.');
        const operations = successful.reduce(function (sum, item) { return sum + item.data.operations; }, 0);
        const amount = successful.reduce(function (sum, item) { return sum + item.data.amount; }, 0);
        return {
            operations: operations,
            amount: amount,
            ticketAverage: operations > 0 ? amount / operations : 0,
            date: dateStr,
            partial: successful.length < SALE_TYPES.length,
            availableTypes: successful.length
        };
    }

    function loadYesterdaySummaryCard(forceRefresh) {
        const operationsElement = document.getElementById('adminDashYesterdayOperations');
        const amountElement = document.getElementById('adminDashYesterdayAmount');
        const ticketElement = document.getElementById('adminDashYesterdayTicket');
        const dateElement = document.getElementById('adminDashYesterdayDate');
        if (!operationsElement || !amountElement || !ticketElement || !dateElement) return;

        if (forceRefresh) yesterdaySummaryCache = null;
        setCardLoading('adminDashYesterdayCard', true);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const cacheDate = localDateString(yesterday);
        if (yesterdaySummaryCache && yesterdaySummaryCache.date === cacheDate) {
            const cachedPromise = yesterdaySummaryCache.promise;
            cachedPromise.then(function (summary) {
                if (yesterdaySummaryCache && yesterdaySummaryCache.promise === cachedPromise) {
                    setCardLoading('adminDashYesterdayCard', false);
                    render(summary);
                }
            }).catch(function (error) {
                if (yesterdaySummaryCache && yesterdaySummaryCache.promise === cachedPromise) {
                    setCardLoading('adminDashYesterdayCard', false);
                    renderError(error);
                }
            });
            return;
        }

        operationsElement.textContent = 'Cargando…';
        amountElement.textContent = 'Cargando…';
        ticketElement.textContent = 'Cargando…';
        dateElement.textContent = 'Consultando el día anterior…';
        const promise = fetchYesterdaySummary(forceRefresh);
        yesterdaySummaryCache = { date: cacheDate, promise: promise };
        promise.then(function (summary) {
            if (yesterdaySummaryCache && yesterdaySummaryCache.promise === promise) {
                setCardLoading('adminDashYesterdayCard', false);
                render(summary);
            }
        }).catch(function (error) {
            if (yesterdaySummaryCache && yesterdaySummaryCache.promise === promise) {
                yesterdaySummaryCache = null;
                setCardLoading('adminDashYesterdayCard', false);
                renderError(error);
            }
        });

        function render(summary) {
            operationsElement.textContent = number(summary.operations);
            amountElement.textContent = currency(summary.amount);
            ticketElement.textContent = currency(summary.ticketAverage);
            dateElement.textContent = `Día anterior: ${displayDate(summary.date)}${summary.partial ? ` · Datos parciales (${summary.availableTypes} de ${SALE_TYPES.length} tipos)` : ''}`;
        }

        function renderError(error) {
            console.error('[Dashboard admin] Error en ventas del día anterior:', error);
            operationsElement.textContent = 'No disponible';
            amountElement.textContent = 'No disponible';
            ticketElement.textContent = 'No disponible';
            dateElement.textContent = 'No se pudo consultar el día anterior';
        }
    }

    function sectionTask(requestId, promise, statusId, successText, renderer) {
        return promise.then(function (data) {
            if (requestId !== loadSequence) return;
            renderer(data);
            if (data && Array.isArray(data.queryErrors) && data.queryErrors.length) {
                setStatus(statusId, `${successText}. Parcial: ${data.queryErrors.length} error(es); ${data.queryErrors[0].message}`, 'error');
            } else {
                setStatus(statusId, successText, 'success');
            }
        }).catch(function (error) {
            if (requestId !== loadSequence) return;
            console.error('[Dashboard admin] Error en consulta:', error);
            setStatus(statusId, `No se pudo cargar: ${error && error.message ? error.message : 'error de consulta'}. Usa “Actualizar” para reintentar.`, 'error');
        });
    }

    async function loadSingleDashboard(requestId, range, forceRefresh) {
        const period = document.getElementById('adminDashboardPeriod');
        if (period) period.textContent = `${monthLabel(range.month)} · ${displayDate(range.startDate)} al ${displayDate(range.endDate)}`;
        const compareView = document.getElementById('adminDashboardCompareView');
        const singleView = document.getElementById('adminDashboardSingleView');
        if (compareView) compareView.style.display = 'none';
        if (singleView) singleView.style.display = '';

        ['adminDashCashStatus', 'adminDashServicesStatus', 'adminDashCreditsStatus', 'adminDashTaeStatus'].forEach(function (id) {
            setStatus(id, 'En cola de consultas secuenciales…', 'loading');
        });
        ['adminDashMonthSalesCard', 'adminDashMonthOperationsCard', 'adminDashMonthTicketCard'].forEach(function (id) {
            setCardLoading(id, true);
        });
        ['adminDashCashContent', 'adminDashServicesContent', 'adminDashCreditsContent', 'adminDashTaeContent'].forEach(function (id) {
            const content = document.getElementById(id);
            if (content) content.innerHTML = '';
        });
        const typeState = {};
        renderMonthlySummary(typeState);
        const summaryTasks = SALE_TYPES.map(function (type) {
            return fetchPeriodData(`sales:${type.key}`, range, function () {
                return fetchSalesAggregate(type.key, range);
            }, forceRefresh).then(function (data) {
                if (requestId !== loadSequence) return;
                typeState[type.key] = data;
                renderMonthlySummary(typeState);
            }).catch(function (error) {
                console.error(`[Dashboard admin] Error en total mensual ${type.key}:`, error);
                if (requestId !== loadSequence) return;
                typeState[type.key] = { error: true, errorMessage: error && error.message, operations: 0, amount: 0 };
                renderMonthlySummary(typeState);
            });
        });
        const summaryTask = Promise.allSettled(summaryTasks).then(function () {
            if (requestId === loadSequence) {
                ['adminDashMonthSalesCard', 'adminDashMonthOperationsCard', 'adminDashMonthTicketCard'].forEach(function (id) {
                    setCardLoading(id, false);
                });
            }
        });

        const sectionTasks = [
            sectionTask(requestId, fetchPeriodData('cash-equipment', range, function () { return fetchCashEquipment(range); }, forceRefresh), 'adminDashCashStatus', 'Equipos libres y Telcel', renderCash),
            sectionTask(requestId, fetchPeriodData('services-breakdown', range, function () { return fetchServices(range); }, forceRefresh), 'adminDashServicesStatus', 'Servicios con ventas · monto y comisiones', renderServices),
            sectionTask(requestId, fetchPeriodData('credit-providers', range, function () { return fetchCreditProviders(range); }, forceRefresh), 'adminDashCreditsStatus', 'Desglose por proveedor · enganche cobrado', renderCredits),
            sectionTask(requestId, fetchPeriodData('tae-breakdown', range, function () { return fetchTaeBreakdown(range); }, forceRefresh), 'adminDashTaeStatus', 'Importes del mes por grupo', renderTae)
        ];

        await Promise.allSettled([summaryTask].concat(sectionTasks));
    }

    function previousMonthValue(monthValue) {
        const parsed = parseMonthValue(monthValue);
        if (!parsed) return localMonthValue(new Date());
        return localMonthValue(new Date(parsed.year, parsed.month - 2, 1));
    }

    function clearComparisonResults(message) {
        loadSequence += 1;
        comparisonDashboardCacheKey = null;
        const period = document.getElementById('adminDashboardPeriod');
        if (period) period.textContent = message;
        const compareButton = document.getElementById('adminDashCompareButton');
        if (compareButton) {
            compareButton.disabled = false;
            compareButton.textContent = '🔍 Comparar meses';
        }
        const entries = [
            ['adminDashCompareSummaryStatus', 'adminDashCompareSummary'],
            ['adminDashCompareSalesStatus', 'adminDashCompareSales'],
            ['adminDashCompareCashStatus', 'adminDashCompareCash'],
            ['adminDashCompareServicesStatus', 'adminDashCompareServices'],
            ['adminDashCompareCreditsStatus', 'adminDashCompareCredits'],
            ['adminDashCompareTaeStatus', 'adminDashCompareTae']
        ];
        entries.forEach(function (entry) {
            setStatus(entry[0], 'Pendiente de comparar', 'pending');
            const content = document.getElementById(entry[1]);
            if (content) content.innerHTML = '';
        });
    }

    function setAdminDashboardCompareMode(enabled) {
        const primaryInput = document.getElementById('adminDashPrimaryMonth');
        const secondInput = document.getElementById('adminDashSecondMonth');
        const secondField = document.getElementById('adminDashSecondMonthField');
        const primaryLabel = document.getElementById('adminDashPrimaryMonthLabel');
        const singleView = document.getElementById('adminDashboardSingleView');
        const compareView = document.getElementById('adminDashboardCompareView');
        const compareButton = document.getElementById('adminDashCompareButton');
        const refreshButton = document.getElementById('adminDashboardRefreshBtn');
        if (!primaryInput || !secondInput) return;

        const currentMonth = localMonthValue(new Date());
        primaryInput.max = currentMonth;
        secondInput.max = currentMonth;
        if (!primaryInput.value) primaryInput.value = currentMonth;

        if (enabled) {
            // Switching modes invalidates any in-flight single-view render.
            singleDashboardCacheKey = null;
            if (!secondInput.value) {
                secondInput.value = previousMonthValue(primaryInput.value);
            }
            if (secondField) secondField.style.display = '';
            if (primaryLabel) primaryLabel.textContent = 'Mes 1';
            if (singleView) singleView.style.display = 'none';
            if (compareView) compareView.style.display = '';
            if (compareButton) compareButton.style.display = 'inline-flex';
            if (refreshButton) refreshButton.style.display = 'none';
            clearComparisonResults('Revisa los dos meses y pulsa “Comparar meses” para consultar.');
        } else {
            // Cancel any in-flight comparison render after leaving comparison mode.
            loadSequence += 1;
            comparisonDashboardCacheKey = null;
            if (secondField) secondField.style.display = 'none';
            if (primaryLabel) primaryLabel.textContent = 'Mes del dashboard';
            if (singleView) singleView.style.display = '';
            if (compareView) compareView.style.display = 'none';
            if (compareButton) {
                compareButton.style.display = 'none';
                compareButton.disabled = false;
                compareButton.textContent = '🔍 Comparar meses';
            }
            if (refreshButton) refreshButton.style.display = '';
        }
    }

    function markComparisonPending() {
        const toggle = document.getElementById('adminDashCompareToggle');
        if (toggle && toggle.checked) {
            clearComparisonResults('Cambiaste la selección. Pulsa “Comparar meses” para actualizar el comparativo.');
        }
    }

    async function loadAdminDashboard(options) {
        const user = currentUser();
        if (!user || user.role !== 'admin') return;

        const dashboard = document.getElementById('adminDashboardModule');
        if (!dashboard) return;
        loadYesterdaySummaryCard(!!(options && options.forceRefresh === true));
        const now = new Date();
        const currentMonth = localMonthValue(now);
        const primaryInput = document.getElementById('adminDashPrimaryMonth');
        const secondInput = document.getElementById('adminDashSecondMonth');
        const compareToggle = document.getElementById('adminDashCompareToggle');
        const secondField = document.getElementById('adminDashSecondMonthField');
        const primaryLabel = document.getElementById('adminDashPrimaryMonthLabel');
        if (!primaryInput || !compareToggle || !secondInput) return;

        primaryInput.max = currentMonth;
        secondInput.max = currentMonth;
        if (!primaryInput.value) primaryInput.value = currentMonth;
        if (compareToggle.checked && !secondInput.value) {
            secondInput.value = previousMonthValue(primaryInput.value);
        }

        const compareMode = compareToggle.checked;
        if (secondField) secondField.style.display = compareMode ? '' : 'none';
        if (primaryLabel) primaryLabel.textContent = compareMode ? 'Mes 1' : 'Mes del dashboard';

        const singleView = document.getElementById('adminDashboardSingleView');
        const compareView = document.getElementById('adminDashboardCompareView');
        if (singleView) singleView.style.display = compareMode ? 'none' : '';
        if (compareView) compareView.style.display = compareMode ? '' : 'none';

        try {
            if (compareMode) {
                const ranges = comparisonRanges(primaryInput.value, secondInput.value, now);
                const cacheKey = `${ranges.first.start}|${ranges.first.end}::${ranges.second.start}|${ranges.second.end}`;
                const explicitCompare = !!(options && options.explicitCompare === true);
                if (!explicitCompare && comparisonDashboardCacheKey === cacheKey) return;
                if (!explicitCompare) {
                    setAdminDashboardCompareMode(true);
                    return;
                }
                const requestId = ++loadSequence;
                comparisonDashboardCacheKey = cacheKey;
                loadComparisonDashboard(requestId, ranges);
            } else {
                const range = selectedMonthRange(primaryInput.value, now);
                const cacheKey = `${range.start}|${range.end}`;
                const forceRefresh = !!(options && options.forceRefresh === true);
                if (!forceRefresh && singleDashboardCacheKey === cacheKey) return;
                const requestId = ++loadSequence;
                singleDashboardCacheKey = cacheKey;
                loadSingleDashboard(requestId, range, forceRefresh);
            }
        } catch (error) {
            if (compareMode) comparisonDashboardCacheKey = null;
            const period = document.getElementById('adminDashboardPeriod');
            if (period) period.textContent = error.message || 'Revisa los meses seleccionados.';
            if (compareMode) {
                setStatus('adminDashCompareSummaryStatus', error.message || 'Revisa los meses seleccionados.', 'error');
                ['adminDashCompareSalesStatus', 'adminDashCompareCashStatus', 'adminDashCompareServicesStatus',
                 'adminDashCompareCreditsStatus', 'adminDashCompareTaeStatus'].forEach(function (id) {
                    setStatus(id, error.message || 'Revisa los meses seleccionados.', 'error');
                });
                const summary = document.getElementById('adminDashCompareSummary');
                if (summary) summary.innerHTML = '';
                ['adminDashCompareSales', 'adminDashCompareCash', 'adminDashCompareServices',
                 'adminDashCompareCredits', 'adminDashCompareTae'].forEach(function (id) {
                    const content = document.getElementById(id);
                    if (content) content.innerHTML = '';
                });
            }
        }
    }

    window.loadAdminDashboard = loadAdminDashboard;
    window.setAdminDashboardCompareMode = setAdminDashboardCompareMode;
    window.markAdminDashboardComparisonPending = markComparisonPending;
    window.adminDashboardCurrentMonthRange = currentMonthRange;
    window.adminDashboardMonthRange = selectedMonthRange;
    window.adminDashboardComparisonRanges = comparisonRanges;
})();
