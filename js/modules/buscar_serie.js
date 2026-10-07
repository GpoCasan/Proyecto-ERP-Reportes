/* ==================== MÓDULO: TRAZABILIDAD DE SERIES ==================== */
(() => {
    const PAGE_SIZE = 100;
    const MAX_PAGES_PER_SEARCH = 5;
    const MAX_SALE_SEARCHES = 12;

    function normalizeIdentifier(value) {
        return String(value ?? '').trim().replace(/\s+/g, '').toLocaleLowerCase('es-MX');
    }

    function normalizeMovementType(value) {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es-MX');
    }

    function saleTypesForMovement(type) {
        const normalized = normalizeMovementType(type);
        if (normalized.includes('credito')) return ['credit'];
        if (normalized.includes('venta') || normalized.includes('contado')) return ['products'];
        return [];
    }

    function localDateFrom(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function nextLocalDate(dayString) {
        const [year, month, day] = dayString.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        date.setDate(date.getDate() + 1);
        const nextYear = date.getFullYear();
        const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
        const nextDay = String(date.getDate()).padStart(2, '0');
        return `${nextYear}-${nextMonth}-${nextDay}`;
    }

    function buildSalesSearchCandidates(logs) {
        const candidates = new Map();
        const list = Array.isArray(logs) ? logs : [];

        for (const log of list) {
            const saleTypes = saleTypesForMovement(log?.type);
            const day = localDateFrom(log?.created_at);
            if (!day || saleTypes.length === 0) continue;

            for (const saleType of saleTypes) {
                const key = `${saleType}|${day}`;
                const existing = candidates.get(key);
                const candidate = { saleType, day, timestamp: log.created_at };
                if (!existing || new Date(candidate.timestamp) > new Date(existing.timestamp)) {
                    candidates.set(key, candidate);
                }
            }
        }

        let result = Array.from(candidates.values());

        // Si el historial solo reporta una cancelación, revisa ambos tipos de venta
        // en esa fecha para intentar recuperar el folio original.
        if (result.length === 0) {
            for (const log of list) {
                if (!normalizeMovementType(log?.type).includes('cancel')) continue;
                const day = localDateFrom(log?.created_at);
                if (!day) continue;
                for (const saleType of ['credit', 'products']) {
                    const key = `${saleType}|${day}`;
                    if (!candidates.has(key)) {
                        candidates.set(key, { saleType, day, timestamp: log.created_at });
                    }
                }
            }
            result = Array.from(candidates.values());
        }

        return result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    function inventoryRecordFrom(payload) {
        let data = payload?.data ?? payload;
        if (Array.isArray(data)) data = data[0] ?? null;
        return data && typeof data === 'object' ? data : null;
    }

    function saleRowsFrom(payload) {
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.data?.data)) return payload.data.data;
        if (Array.isArray(payload?.sales)) return payload.sales;
        return [];
    }

    function lastPageFrom(payload) {
        const value = payload?.meta?.last_page
            ?? payload?.last_page
            ?? payload?.data?.meta?.last_page
            ?? payload?.data?.last_page;
        const page = Number(value);
        return Number.isFinite(page) && page > 0 ? page : null;
    }

    function apiBoolean(value) {
        return value === true || value === 1 || ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());
    }

    function saleMatchesIdentifier(sale, identifier) {
        const target = normalizeIdentifier(identifier);
        if (!target) return false;

        for (const detail of (Array.isArray(sale?.details) ? sale.details : [])) {
            for (const group of (Array.isArray(detail?.specification_groups) ? detail.specification_groups : [])) {
                for (const spec of (Array.isArray(group?.specification_details) ? group.specification_details : [])) {
                    if (normalizeIdentifier(spec?.value) === target) return true;
                }
            }
        }
        return false;
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        if (!response.ok) throw new Error(`La API respondió HTTP ${response.status}.`);
        return response.json();
    }

    async function searchSalesForCandidate(candidate, identifier, state, productId) {
        const endDate = nextLocalDate(candidate.day);

        for (let page = 1; page <= MAX_PAGES_PER_SEARCH; page += 1) {
            const params = new URLSearchParams({
                page: String(page),
                per_page: String(PAGE_SIZE),
                sale_type: candidate.saleType,
                start_date: `${candidate.day} 00:00:00`,
                end_date: `${endDate} 23:59:59`
            });
            const numericProductId = Number(productId);
            if (Number.isInteger(numericProductId) && numericProductId > 0) {
                params.append('product_ids[]', String(numericProductId));
            }
            const url = `${CONFIG.API_SALES}?${params.toString()}`;
            const payload = await fetchJson(url);
            const rows = saleRowsFrom(payload);
            const lastPage = lastPageFrom(payload);

            for (const sale of rows) {
                if (!saleMatchesIdentifier(sale, identifier) || sale?.id == null) continue;
                const key = String(sale.id);
                if (!state.matches.has(key)) {
                    state.matches.set(key, {
                        id: sale.id,
                        createdAt: sale.created_at,
                        saleType: candidate.saleType,
                        cancelled: apiBoolean(sale.is_cancelled)
                    });
                }
            }

            if (lastPage !== null && page >= lastPage) break;
            if (lastPage === null && rows.length < PAGE_SIZE) break;
            if (page === MAX_PAGES_PER_SEARCH && (lastPage === null || lastPage > page)) {
                state.pageLimitReached = true;
            }
        }
    }

    async function findLinkedSales(logs, identifier, productId) {
        const candidates = buildSalesSearchCandidates(logs);
        const selected = candidates.slice(0, MAX_SALE_SEARCHES);
        const state = { matches: new Map(), errors: [], pageLimitReached: false };

        for (const candidate of selected) {
            try {
                await searchSalesForCandidate(candidate, identifier, state, productId);
            } catch (error) {
                state.errors.push({ candidate, message: error?.message || 'Error al consultar ventas.' });
            }
        }

        const sales = Array.from(state.matches.values())
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        return {
            sales,
            candidateCount: candidates.length,
            searchedCandidateCount: selected.length,
            skippedCandidateCount: Math.max(0, candidates.length - selected.length),
            errors: state.errors,
            pageLimitReached: state.pageLimitReached
        };
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function appendInfoRow(container, label, value) {
        const row = element('div', 'analysis-row');
        row.appendChild(element('span', 'analysis-label', label));
        row.appendChild(element('span', 'analysis-value', value || '—'));
        container.appendChild(row);
    }

    function formatDateTime(value) {
        if (!value) return 'No disponible';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    }

    function sortMovementLogs(logs) {
        return (Array.isArray(logs) ? [...logs] : []).sort((a, b) => {
            const dateA = Date.parse(a?.created_at || '');
            const dateB = Date.parse(b?.created_at || '');
            const validA = Number.isFinite(dateA);
            const validB = Number.isFinite(dateB);
            if (!validA && !validB) return 0;
            if (!validA) return 1;
            if (!validB) return -1;
            if (dateA !== dateB) return dateA - dateB;
            return Number(a?.id || 0) - Number(b?.id || 0);
        });
    }

    function createSaleLink(sale) {
        const link = element('a', 'sale-receipt-btn', `#${sale.id}`);
        const apiBase = String(CONFIG.API_SALES || 'https://sales.gcasan.com/api/sales').replace(/\/$/, '');
        link.href = `${apiBase}/${encodeURIComponent(String(sale.id))}/receipt`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = 'Abrir venta en una pestaña nueva';
        link.addEventListener('click', (event) => {
            event.preventDefault();
            if (typeof openReceipt === 'function') {
                openReceipt(sale.id);
            } else {
                window.open(link.href, '_blank', 'noopener,noreferrer');
            }
        });
        return link;
    }

    function displayStatus(value) {
        const status = String(value ?? '').trim();
        const known = {
            available: 'Disponible',
            sold: 'Vendido',
            reserved: 'Apartado',
            cancelled: 'Cancelado',
            canceled: 'Cancelado',
            unavailable: 'No disponible'
        };
        return known[status.toLowerCase()] || status || 'No disponible';
    }

    function warehouseName(warehouse) {
        if (!warehouse || typeof warehouse !== 'object') return 'No disponible';
        return warehouse.branch?.name || warehouse.name || 'No disponible';
    }

    function setAlert(id, message, visible) {
        const alert = document.getElementById(id);
        if (!alert) return;
        alert.textContent = message || '';
        alert.style.display = visible ? 'block' : 'none';
    }

    function renderSalesSection(container, lookup) {
        const section = element('div', 'analysis-card-info');
        section.style.marginTop = '16px';
        section.appendChild(element('h4', '', 'Folios de venta relacionados'));

        if (lookup.sales.length > 0) {
            section.appendChild(element('p', '', `Coincidencias encontradas: ${lookup.sales.length}`));
            for (const sale of lookup.sales) {
                const row = element('div', 'analysis-row');
                row.appendChild(createSaleLink(sale));
                const typeLabel = sale.saleType === 'credit' ? 'Crédito' : 'Contado / producto';
                const cancelledLabel = sale.cancelled ? ' · Cancelada' : '';
                row.appendChild(element('span', 'analysis-value', `${typeLabel} · ${formatDateTime(sale.createdAt)}${cancelledLabel}`));
                section.appendChild(row);
            }
        } else if (lookup.errors.length > 0) {
            section.appendChild(element('p', '', 'Los movimientos se cargaron, pero no se pudo completar la consulta de folios en ventas.'));
        } else if (lookup.candidateCount === 0) {
            section.appendChild(element('p', '', 'El historial no contiene un movimiento de venta identificable para asociar un folio.'));
        } else {
            section.appendChild(element('p', '', 'No se encontró una venta con este identificador en las fechas de los movimientos de venta.'));
        }

        if (lookup.skippedCandidateCount > 0 || lookup.pageLimitReached) {
            section.appendChild(element('p', '', 'La búsqueda se limitó para evitar consultas excesivas. Puede haber más resultados en historiales muy extensos.'));
        }
        container.appendChild(section);
    }

    function renderMovements(container, logs) {
        const section = element('div');
        section.style.marginTop = '16px';
        section.appendChild(element('h3', '', `Historial de movimientos (${logs.length})`));
        //section.appendChild(element('small', '', 'Orden cronológico: del más antiguo al más reciente.'));

        if (logs.length === 0) {
            section.appendChild(element('p', '', 'No hay movimientos registrados para este identificador.'));
            container.appendChild(section);
            return;
        }

        const tableContainer = element('div', 'table-container');
        const table = element('table', 'imei-table');
        const thead = element('thead');
        const headerRow = element('tr');
        for (const title of ['Movimiento', 'Fecha y hora', 'Sucursal / almacén']) {
            headerRow.appendChild(element('th', '', title));
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = element('tbody');
        const sortedLogs = sortMovementLogs(logs);
        for (const log of sortedLogs) {
            const row = element('tr');
            row.appendChild(element('td', '', log?.type || 'Movimiento'));
            row.appendChild(element('td', '', formatDateTime(log?.created_at)));
            row.appendChild(element('td', '', warehouseName(log?.warehouse)));
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        section.appendChild(tableContainer);
        container.appendChild(section);
    }

    function renderResult(record, identifier, lookup) {
        const results = document.getElementById('buscarSerieResults');
        if (!results) return;
        results.replaceChildren();
        results.style.display = 'block';

        const stock = record.stock || {};
        const product = stock.product || {};
        const summary = element('div', 'grid-2cols');
        const inventoryCard = element('div', 'analysis-card-info');
        inventoryCard.appendChild(element('h4', '', 'Estado actual'));
        appendInfoRow(inventoryCard, 'Identificador', identifier);
        appendInfoRow(inventoryCard, 'Estado', displayStatus(record.status));
        appendInfoRow(inventoryCard, 'Producto', product.name || 'No disponible');
        appendInfoRow(inventoryCard, 'Sucursal / almacén', warehouseName(stock.warehouse));
        appendInfoRow(inventoryCard, 'Existencia actual', stock.quantity ?? 'No disponible');
        appendInfoRow(inventoryCard, 'Última actualización', formatDateTime(record.updated_at));
        summary.appendChild(inventoryCard);
        results.appendChild(summary);

        renderSalesSection(results, lookup);
        renderMovements(results, Array.isArray(record.logs) ? record.logs : []);
    }

    async function consultarTrazabilidad(event) {
        event.preventDefault();
        const input = document.getElementById('buscarSerieInput');
        const button = document.getElementById('buscarSerieBtn');
        const results = document.getElementById('buscarSerieResults');
        const identifier = normalizeIdentifier(input?.value);

        setAlert('buscarSerieErrorAlert', '', false);
        setAlert('buscarSerieInfoAlert', '', false);
        if (!identifier) {
            setAlert('buscarSerieErrorAlert', 'Escribe una serie, IMEI o ICCID para consultar.', true);
            input?.focus();
            return;
        }

        const user = typeof currentUser !== 'undefined' ? currentUser : null;
        if (!user || user.role !== 'admin') {
            setAlert('buscarSerieErrorAlert', 'Este módulo está disponible solo para Administrador.', true);
            return;
        }

        const originalButtonText = button?.textContent || '🔍 Consultar';
        if (button) {
            button.disabled = true;
            button.textContent = 'Buscando...';
            const spinner = element('span', 'loading-spinner');
            spinner.setAttribute('aria-hidden', 'true');
            button.appendChild(spinner);
        }
        if (results) {
            results.replaceChildren();
            results.style.display = 'none';
        }
        setAlert('buscarSerieInfoAlert', 'Consultando historial y buscando el folio en las ventas del ERP…', true);

        try {
            const logsUrl = `${CONFIG.API_LOGS}?value=${encodeURIComponent(identifier)}`;
            const payload = await fetchJson(logsUrl);
            const record = inventoryRecordFrom(payload);
            if (!record) {
                setAlert('buscarSerieErrorAlert', 'No se encontró información para ese identificador.', true);
                return;
            }

            const productId = record.stock?.product_id ?? record.stock?.product?.id;
            const lookup = await findLinkedSales(record.logs, identifier, productId);
            renderResult(record, identifier, lookup);

            if (lookup.errors.length > 0) {
                setAlert('buscarSerieInfoAlert', 'Se muestran los movimientos; la consulta de folios tuvo una falla parcial.', true);
            } else {
                setAlert('buscarSerieInfoAlert', 'Consulta completada.', true);
            }
        } catch (error) {
            setAlert('buscarSerieErrorAlert', error?.message || 'No se pudo completar la consulta.', true);
        } finally {
            setAlert('buscarSerieInfoAlert', '', false);
            if (button) {
                button.disabled = false;
                button.textContent = originalButtonText;
            }
        }
    }

    function initModule() {
        const form = document.getElementById('buscarSerieForm');
        if (form) form.addEventListener('submit', consultarTrazabilidad);
    }

    window.BusquedaSerieERP = Object.freeze({
        normalizeIdentifier,
        saleTypesForMovement,
        buildSalesSearchCandidates,
        saleMatchesIdentifier,
        findLinkedSales,
        sortMovementLogs,
        createSaleLink
    });

    document.addEventListener('DOMContentLoaded', initModule);
})();
