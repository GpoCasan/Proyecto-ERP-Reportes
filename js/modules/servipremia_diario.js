/* Reporte diario de Servipremia/Rewardix.
 * Reutiliza las tarjetas existentes del módulo y sustituye solo los desgloses.
 * El selector consulta un único día; los rangos enviados a Ventas representan
 * ese día calendario local convertido a la hora que espera el API.
 */
(function () {
    'use strict';

    const PAGE_SIZE = 200;
    const MAX_PAGES = 100;
    const DATE_INPUT_ID = 'servipremiaDate';
    const RESULTS_ID = 'servipremiaResults';
    const BUTTON_ID = 'searchServipremiaBtn';
    const PROGRESS_ID = 'servipremiaDailyProgress';
    const REWARDIX_PAGE_SIZE = 1000;
    const REWARDIX_MAX_PAGES = 100;
    const CARD_CATALOG_TTL_MS = 5 * 60 * 1000;
    let cardCatalogCache = null;
    let cardCatalogCacheAt = 0;
    let cardCatalogPromise = null;
    const cardHistoryCache = new Map();
    const cardHistoryPromises = new Map();

    function localDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatLocalDate(dateValue) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
        if (!match) return String(dateValue || '');
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return new Intl.DateTimeFormat('es-MX', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }).format(date);
    }

    function apiDateTime(date) {
        // URLSearchParams convertirá el espacio a '+' (formato usado por el ERP).
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }

    function getSingleDayRange(dateValue) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
        if (!match) throw new Error('Selecciona una fecha válida.');

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const start = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (localDateString(start) !== dateValue) throw new Error('La fecha seleccionada no es válida.');

        const today = new Date();
        const todayValue = localDateString(today);
        if (dateValue > todayValue) throw new Error('No puedes consultar una fecha futura.');

        let end;
        if (dateValue === todayValue) {
            // Como en el endpoint compartido, el día actual termina en la hora de consulta.
            end = today;
        } else {
            end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
            end.setSeconds(end.getSeconds() - 1);
        }

        return { start: apiDateTime(start), end: apiDateTime(end) };
    }

    function buildSalesUrl(page, range, pageSize = PAGE_SIZE) {
        const url = new URL(CONFIG.API_SALES);
        url.searchParams.set('page', String(page));
        url.searchParams.set('per_page', String(pageSize));
        url.searchParams.set('total', '0');
        url.searchParams.set('start_date', range.start);
        url.searchParams.set('end_date', range.end);
        return url.toString();
    }

    async function fetchSalesForDay(dateValue, onPageProgress) {
        const range = getSingleDayRange(dateValue);
        const allSales = [];
        let page = 1;
        let pageSize = PAGE_SIZE;
        let reportedTotal = null;

        while (page <= MAX_PAGES) {
            const url = buildSalesUrl(page, range, pageSize);
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${CONFIG.FIXED_TOKEN}`,
                    Accept: 'application/json'
                },
                cache: 'no-store'
            });
            if (!response.ok) {
                if (page === 1 && pageSize > 100 && [400, 422].includes(response.status)) {
                    pageSize = 100;
                    if (typeof onPageProgress === 'function') {
                        onPageProgress({ stage: 'sales', loaded: 0, total: null, page: 1, totalPages: null, pageSize, fallbackPageSize: true, sales: allSales });
                    }
                    continue;
                }
                throw new Error(`Ventas ERP respondió HTTP ${response.status}.`);
            }

            const payload = await response.json();
            const rows = Array.isArray(payload.data) ? payload.data : [];
            allSales.push(...rows);

            const totalValue = payload.meta && payload.meta.total;
            const parsedTotal = Number.parseInt(totalValue, 10);
            reportedTotal = totalValue !== undefined && totalValue !== null && totalValue !== ''
                && Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : null;
            const pageValue = payload.last_page ||
                (payload.meta && payload.meta.last_page) ||
                (payload.pagination && payload.pagination.last_page);
            const lastPage = Number.parseInt(pageValue, 10);
            const totalPages = Number.isFinite(lastPage) && lastPage > 0
                ? lastPage
                : reportedTotal !== null ? Math.max(1, Math.ceil(reportedTotal / pageSize)) : null;

            if (typeof onPageProgress === 'function') {
                onPageProgress({
                    stage: 'sales', loaded: allSales.length, total: reportedTotal,
                    page, totalPages, pageSize, sales: allSales
                });
            }

            if (Number.isFinite(lastPage) && lastPage > 0) {
                if (page >= lastPage) break;
            } else {
                if (reportedTotal !== null && allSales.length >= reportedTotal) break;
                if (rows.length < pageSize) break;
            }
            page += 1;
        }

        if (page > MAX_PAGES) throw new Error(`La consulta excedió ${MAX_PAGES} páginas para un solo día.`);
        return { sales: allSales, range, total: reportedTotal, pageSize };
    }

    async function fetchRewardixCollection(resource, filters, onPageProgress) {
        if (typeof getRewardixUrl !== 'function') throw new Error('No está configurada la conexión con Rewardix.');
        const baseUrl = String(getRewardixUrl()).replace(/\/+$/, '');
        const allRows = [];
        let totalItems = null;

        for (let page = 1; page <= REWARDIX_MAX_PAGES; page += 1) {
            const url = new URL(`${baseUrl}/${resource}`);
            url.searchParams.set('page', String(page));
            url.searchParams.set('itemsPerPage', String(REWARDIX_PAGE_SIZE));
            Object.entries(filters || {}).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
            });

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Rewardix ${resource} respondió HTTP ${response.status}.`);

            const payload = await response.json();
            if (!Array.isArray(payload.data)) throw new Error(`Rewardix ${resource} devolvió una respuesta no reconocida.`);
            const rows = payload.data;
            allRows.push(...rows);

            const totalValue = payload.meta && payload.meta.totalItems;
            const parsedTotal = Number(totalValue);
            totalItems = totalValue !== undefined && totalValue !== null && totalValue !== '' && Number.isFinite(parsedTotal)
                ? parsedTotal
                : null;
            const totalPages = totalItems !== null
                ? Math.max(1, Math.ceil(totalItems / REWARDIX_PAGE_SIZE))
                : null;
            if (typeof onPageProgress === 'function') {
                onPageProgress({ stage: resource === 'cards' ? 'cards' : 'history', loaded: allRows.length, total: totalItems, page, totalPages });
            }

            if (!rows.length) {
                if (totalItems !== null && allRows.length < totalItems) {
                    throw new Error(`Rewardix ${resource} devolvió una página vacía antes de completar ${totalItems} registros.`);
                }
                return allRows;
            }
            if (totalItems !== null && allRows.length >= totalItems) return allRows;
            if (totalItems === null && rows.length < REWARDIX_PAGE_SIZE) return allRows;
            if (page === REWARDIX_MAX_PAGES) {
                throw new Error(`Rewardix ${resource} excedió el límite de ${REWARDIX_MAX_PAGES} páginas.`);
            }
        }

        return allRows;
    }

    function fetchRewardixCardCatalog(onPageProgress) {
        if (Array.isArray(cardCatalogCache) && Date.now() - cardCatalogCacheAt < CARD_CATALOG_TTL_MS) {
            if (typeof onPageProgress === 'function') {
                onPageProgress({ stage: 'cards', loaded: cardCatalogCache.length, total: cardCatalogCache.length, page: 1, totalPages: 1, cached: true });
            }
            return Promise.resolve(cardCatalogCache);
        }
        if (cardCatalogPromise) return cardCatalogPromise;

        cardCatalogPromise = fetchRewardixCollection('cards', {}, onPageProgress)
            .then(rows => {
                cardCatalogCache = rows;
                cardCatalogCacheAt = Date.now();
                return rows;
            })
            .finally(() => { cardCatalogPromise = null; });
        return cardCatalogPromise;
    }

    function fetchRewardixCardHistory(cardId) {
        const key = normalizeCardId(cardId);
        if (!key) return Promise.resolve([]);
        if (cardHistoryCache.has(key)) return Promise.resolve(cardHistoryCache.get(key));
        if (cardHistoryPromises.has(key)) return cardHistoryPromises.get(key);

        const promise = fetchRewardixCollection('operations', { cardId: String(cardId) })
            .then(rows => {
                if (cardHistoryCache.size >= 50) cardHistoryCache.delete(cardHistoryCache.keys().next().value);
                cardHistoryCache.set(key, rows);
                return rows;
            })
            .finally(() => { cardHistoryPromises.delete(key); });
        cardHistoryPromises.set(key, promise);
        return promise;
    }

    function numberValue(value) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function numberOrNull(value) {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function isTrue(value) {
        return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
    }

    function effectivePoints(sale) {
        if (isTrue(sale.is_cancelled)) return { earned: 0, redeemed: 0 };

        const accrued = Math.max(0,
            numberValue(sale.loyalty_accrued_value) - numberValue(sale.loyalty_accrued_withdrawn));
        const redeemed = Math.max(0,
            numberValue(sale.loyalty_redeemed_amount) - numberValue(sale.loyalty_redeemed_returned));

        // Algunos registros antiguos solo guardan la fecha de reversión, sin el monto revertido.
        if (sale.loyalty_reverted_at && !numberValue(sale.loyalty_accrued_withdrawn)
            && !numberValue(sale.loyalty_redeemed_returned)) {
            return { earned: 0, redeemed: 0 };
        }
        return { earned: accrued, redeemed: redeemed };
    }

    function normalizeCardId(value) {
        return String(value === null || value === undefined ? '' : value)
            .trim()
            .toLocaleLowerCase('es-MX')
            .replace(/[\s-]/g, '');
    }

    function eventDateTimestamp(operation) {
        const value = operation && (operation.createdAt || operation.created_at || operation.date || operation.timestamp);
        const timestamp = value ? Date.parse(value) : NaN;
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function rewardixProfilesByCard(rewardixOperations, rewardixCards) {
        const profiles = new Map();
        const historyByCard = new Map();
        const historyByPhone = new Map();

        const getOrCreateProfile = (cardKey, rawCardId) => {
            if (!profiles.has(cardKey)) {
                profiles.set(cardKey, {
                    cardId: rawCardId,
                    name: '',
                    phone: null,
                    profileTimestamp: -1,
                    balance: null,
                    balanceTimestamp: -1,
                    fromCatalog: false
                });
            }
            return profiles.get(cardKey);
        };

        (Array.isArray(rewardixCards) ? rewardixCards : []).forEach(card => {
            const rawCardId = String(card.id || card.cardId || card.card_id || '').trim();
            const cardKey = normalizeCardId(rawCardId);
            if (!cardKey) return;

            const customer = card.customer && typeof card.customer === 'object' ? card.customer : {};
            const firstName = String(customer.firstName || customer.first_name || card.firstName || '').trim();
            const lastName = String(customer.surname || customer.lastName || customer.last_name || card.surname || '').trim();
            const name = [firstName, lastName].filter(Boolean).join(' ')
                || String(customer.fullName || customer.name || '').trim();
            const rawPhone = typeof getServipremiaPhone === 'function'
                ? (getServipremiaPhone(customer) || getServipremiaPhone(card))
                : (customer.phone || card.customerPhone || card.phone || '');
            const phone = rawPhone && typeof normalizeServipremiaPhone === 'function'
                ? normalizeServipremiaPhone(rawPhone)
                : String(rawPhone || '').replace(/\D/g, '');
            const timestamps = [customer.updatedAt, card.updatedAt, customer.createdAt, card.createdAt]
                .map(value => value ? Date.parse(value) : NaN)
                .filter(Number.isFinite);
            const timestamp = timestamps.length ? Math.max(...timestamps) : 0;

            const profile = getOrCreateProfile(cardKey, rawCardId);
            profile.fromCatalog = true;
            if (name && (timestamp >= profile.profileTimestamp || !profile.name)) profile.name = name;
            if (phone && (timestamp >= profile.profileTimestamp || !profile.phone)) profile.phone = phone;
            profile.profileTimestamp = Math.max(profile.profileTimestamp, timestamp);
        });

        (Array.isArray(rewardixOperations) ? rewardixOperations : []).forEach(operation => {
            const rawCardId = String(operation.cardId || operation.card_id || operation.loyalty_card_id || '').trim();
            const cardKey = normalizeCardId(rawCardId);
            const rawPhone = typeof getServipremiaPhone === 'function' ? getServipremiaPhone(operation) : null;
            const phone = rawPhone && typeof normalizeServipremiaPhone === 'function'
                ? normalizeServipremiaPhone(rawPhone)
                : rawPhone;
            if (phone) {
                if (!historyByPhone.has(phone)) historyByPhone.set(phone, []);
                historyByPhone.get(phone).push(operation);
            }
            if (!cardKey) return;

            if (!historyByCard.has(cardKey)) historyByCard.set(cardKey, []);
            historyByCard.get(cardKey).push(operation);

            const customer = operation.customer && typeof operation.customer === 'object'
                ? operation.customer
                : {};
            const firstNameValue = typeof findServipremiaField === 'function'
                ? findServipremiaField(operation, ['firstName', 'first_name', 'customerFirstName', 'customer_first_name', 'nombre'])
                : (customer.firstName || customer.first_name);
            const lastNameValue = typeof findServipremiaField === 'function'
                ? findServipremiaField(operation, ['surname', 'lastName', 'last_name', 'customerLastName', 'customer_last_name', 'apellido', 'apellidos'])
                : (customer.surname || customer.lastName || customer.last_name);
            const firstName = String(firstNameValue || '').trim();
            const lastName = String(lastNameValue || '').trim();
            const name = [firstName, lastName].filter(Boolean).join(' ');
            const timestamp = eventDateTimestamp(operation);
            const balance = numberOrNull(operation.balance);
            const profile = getOrCreateProfile(cardKey, rawCardId);
            if (name && (timestamp >= profile.profileTimestamp || !profile.name)) profile.name = name;
            if (phone && (timestamp >= profile.profileTimestamp || !profile.phone)) profile.phone = phone;
            profile.profileTimestamp = Math.max(profile.profileTimestamp, timestamp);
            if (balance !== null && timestamp >= profile.balanceTimestamp) {
                profile.balance = balance;
                profile.balanceTimestamp = timestamp;
            }
        });

        const byPhone = new Map();
        profiles.forEach(profile => {
            if (!profile.phone) return;
            if (!byPhone.has(profile.phone)) {
                byPhone.set(profile.phone, { profile, ambiguous: false });
            } else if (byPhone.get(profile.phone).profile !== profile) {
                byPhone.get(profile.phone).ambiguous = true;
            }
        });
        return { byCard: profiles, byPhone, historyByCard, historyByPhone };
    }

    function findRewardixProfile(cardKey, phone, indexes) {
        const byCard = indexes && indexes.byCard;
        const direct = byCard && byCard.get(cardKey);
        if (direct) return { profile: direct, method: 'cardId' };

        const phoneMatch = indexes && indexes.byPhone && indexes.byPhone.get(phone);
        if (phoneMatch && !phoneMatch.ambiguous) return { profile: phoneMatch.profile, method: 'teléfono' };
        return { profile: null, method: 'sin coincidencia' };
    }

    function fallbackSaleClient(sale) {
        const client = [sale.client, sale.customer, sale.customer_data, sale.loyalty_customer]
            .find(value => value && typeof value === 'object') || {};
        const firstNameValue = typeof findServipremiaField === 'function'
            ? findServipremiaField(client, ['firstName', 'first_name', 'customerFirstName', 'customer_first_name', 'nombre'])
            : (client.firstName || client.first_name);
        const lastNameValue = typeof findServipremiaField === 'function'
            ? findServipremiaField(client, ['surname', 'lastName', 'last_name', 'customerLastName', 'customer_last_name', 'apellido', 'apellidos'])
            : (client.surname || client.lastName || client.last_name);
        const firstName = String(firstNameValue || sale.first_name || sale.customer_first_name || '').trim();
        const lastName = String(lastNameValue || sale.last_name || sale.customer_last_name || '').trim();
        const composedName = [firstName, lastName].filter(Boolean).join(' ');
        const clientNameValue = typeof findServipremiaField === 'function'
            ? findServipremiaField(client, ['fullName', 'full_name', 'customerName', 'customer_name', 'clientName', 'client_name', 'name'])
            : client.name;
        const clientName = String(clientNameValue || sale.client_name || '').trim();
        const isPublic = normalizeName(clientName) === 'publicogeneral';
        const name = composedName || (!isPublic && clientName ? clientName : 'Nombre no disponible');
        const clientPhone = typeof getServipremiaPhone === 'function' ? getServipremiaPhone(client) : null;
        const rawPhone = sale.loyalty_phone || clientPhone || sale.phone || '';
        const phone = typeof normalizeServipremiaPhone === 'function'
            ? normalizeServipremiaPhone(rawPhone)
            : String(rawPhone || '').replace(/\D/g, '');
        return { name, phone };
    }

    function normalizeName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase();
    }

    function buildDailyBreakdowns(sales, rewardixOperations, rewardixCards) {
        const cards = Array.isArray(rewardixCards) ? rewardixCards : [];
        const profileIndexes = rewardixProfilesByCard(rewardixOperations, cards);
        const advisors = new Map();
        const clients = new Map();

        (Array.isArray(sales) ? sales : []).forEach(sale => {
            if (!sale) return;
            const cancelled = isTrue(sale.is_cancelled);

            const user = sale.user && typeof sale.user === 'object' ? sale.user : {};
            const advisorName = String(user.name || sale.user_name || 'Asesor no identificado').trim();
            const advisorId = sale.user_id || user.id;
            const advisorKey = advisorId !== undefined && advisorId !== null
                ? `id:${advisorId}`
                : `name:${normalizeName(advisorName)}`;
            const points = effectivePoints(sale);

            if (!cancelled) {
                if (!advisors.has(advisorKey)) {
                    advisors.set(advisorKey, {
                        advisor: advisorName || 'Asesor no identificado',
                        operations: 0,
                        accruedOperationCount: 0,
                        salesAmount: 0,
                        pointsEarned: 0,
                        pointsRedeemed: 0,
                        earnedSales: []
                    });
                }
                const advisor = advisors.get(advisorKey);
                advisor.operations += 1;
                advisor.salesAmount += numberValue(sale.total);
                advisor.pointsEarned += points.earned;
                advisor.pointsRedeemed += points.redeemed;
                if (points.earned > 0) {
                    advisor.accruedOperationCount += 1;
                    advisor.earnedSales.push(sale);
                }
            }

            const rawCardId = String(sale.loyalty_card_id || '').trim();
            const cardKey = normalizeCardId(rawCardId);
            if (!cardKey) return;

            if (!clients.has(cardKey)) {
                const fallback = fallbackSaleClient(sale);
                clients.set(cardKey, {
                    cardKey,
                    cardId: rawCardId,
                    name: fallback.name,
                    phone: fallback.phone,
                    operations: 0,
                    accruedOperationCount: 0,
                    salesAmount: 0,
                    pointsEarned: 0,
                    pointsRedeemed: 0,
                    saleBalance: null,
                    saleBalanceTimestamp: -1,
                    sales: [],
                    earnedSales: []
                });
            }
            const client = clients.get(cardKey);
            const fallback = fallbackSaleClient(sale);
            if ((!client.name || client.name === 'Nombre no disponible')
                && fallback.name !== 'Nombre no disponible') client.name = fallback.name;
            if (!client.phone && fallback.phone) client.phone = fallback.phone;

            client.sales.push(sale);
            if (!cancelled) {
                client.operations += 1;
                client.salesAmount += numberValue(sale.total);
                client.pointsEarned += points.earned;
                client.pointsRedeemed += points.redeemed;
                if (points.earned > 0) {
                    client.accruedOperationCount += 1;
                    client.earnedSales.push(sale);
                }
            }

            const saleTimestamp = eventDateTimestamp(sale);
            const saleBalance = numberOrNull(sale.loyalty_balance_after);
            if (!cancelled && saleBalance !== null && saleTimestamp >= client.saleBalanceTimestamp) {
                client.saleBalance = saleBalance;
                client.saleBalanceTimestamp = saleTimestamp;
            }
        });

        const advisorRows = Array.from(advisors.values()).sort((a, b) =>
            b.salesAmount - a.salesAmount || b.pointsEarned - a.pointsEarned || a.advisor.localeCompare(b.advisor, 'es-MX'));

        const clientRows = Array.from(clients.values()).map(client => {
            const phoneKey = client.phone || '';
            const match = findRewardixProfile(client.cardKey, phoneKey, profileIndexes);
            const profile = match.profile;
            if (profile && profile.name) client.name = profile.name;
            if (profile && profile.phone) client.phone = profile.phone;
            client.profileSource = profile && profile.fromCatalog
                ? 'catálogo Rewardix'
                : profile ? 'movimientos Rewardix' : 'ERP';
            const rewardixBalance = profile ? profile.balance : null;
            client.closingBalance = rewardixBalance !== null && rewardixBalance !== undefined
                ? rewardixBalance
                : client.saleBalance;
            client.balanceSource = rewardixBalance !== null && rewardixBalance !== undefined
                ? 'Rewardix'
                : client.saleBalance !== null ? 'ERP' : 'No disponible';
            client.rewardixMatchMethod = match.method;
            client.rewardixHistory = profileIndexes.historyByCard.get(client.cardKey) ||
                (phoneKey && profileIndexes.historyByPhone.get(phoneKey)) || [];
            return client;
        }).sort((a, b) =>
            (b.pointsEarned + b.pointsRedeemed) - (a.pointsEarned + a.pointsRedeemed)
            || a.name.localeCompare(b.name, 'es-MX'));

        return {
            advisors: advisorRows,
            clients: clientRows,
            profileSummary: {
                totalCards: clientRows.length,
                catalogCards: cards.length,
                catalogMatched: clientRows.filter(row => row.profileSource === 'catálogo Rewardix').length,
                matchedByCardId: clientRows.filter(row => row.rewardixMatchMethod === 'cardId').length,
                matchedByPhone: clientRows.filter(row => row.rewardixMatchMethod === 'teléfono').length,
                notMatched: clientRows.filter(row => row.rewardixMatchMethod === 'sin coincidencia').length
            }
        };
    }

    function escapeHtml(value) {
        const text = String(value === null || value === undefined ? '' : value);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(text);
        return text.replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2
        }).format(numberValue(value));
    }

    function formatPoints(value) {
        return new Intl.NumberFormat('es-MX', {
            minimumFractionDigits: 0, maximumFractionDigits: 2
        }).format(numberValue(value));
    }

    function renderSalesProgressPreview(sales) {
        const rows = Array.isArray(sales) ? sales : [];
        const advisors = new Map();
        let amount = 0;
        let accruedOperations = 0;
        let pointsEarned = 0;
        let pointsRedeemed = 0;

        rows.forEach(sale => {
            if (!sale) return;
            amount += numberValue(sale.total);
            const points = effectivePoints(sale);
            pointsEarned += points.earned;
            pointsRedeemed += points.redeemed;
            if (isTrue(sale.is_cancelled)) return;

            const user = sale.user && typeof sale.user === 'object' ? sale.user : {};
            const name = String(user.name || sale.user_name || 'Asesor no identificado').trim();
            const key = sale.user_id || user.id ? `id:${sale.user_id || user.id}` : `name:${normalizeName(name)}`;
            if (!advisors.has(key)) advisors.set(key, { name, operations: 0, accrued: 0, amount: 0, pointsEarned: 0, pointsRedeemed: 0 });
            const advisor = advisors.get(key);
            advisor.operations += 1;
            advisor.amount += numberValue(sale.total);
            advisor.pointsEarned += points.earned;
            advisor.pointsRedeemed += points.redeemed;
            if (points.earned > 0) {
                advisor.accrued += 1;
                accruedOperations += 1;
            }
        });

        const topAdvisors = Array.from(advisors.values())
            .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es-MX'))
            .slice(0, 8);
        const advisorRows = topAdvisors.map(row => `<tr>
            <td>${escapeHtml(row.name)}</td>
            <td style="text-align:right;">${row.operations.toLocaleString('es-MX')}</td>
            <td style="text-align:right;">${row.accrued.toLocaleString('es-MX')}</td>
            <td style="text-align:right;">${formatCurrency(row.amount)}</td>
            <td style="text-align:right;">${formatPoints(row.pointsEarned)}</td>
            <td style="text-align:right;">${formatPoints(row.pointsRedeemed)}</td>
        </tr>`).join('');

        return `<div class="servipremia-partial-summary">
            <div><span>Ventas ERP recibidas</span><strong>${rows.length.toLocaleString('es-MX')}</strong></div>
            <div><span>Monto parcial</span><strong>${formatCurrency(amount)}</strong></div>
            <div><span>Operaciones con acumulación</span><strong>${accruedOperations.toLocaleString('es-MX')}</strong></div>
            <div><span>Puntos acumulados (parcial)</span><strong>${formatPoints(pointsEarned)}</strong></div>
            <div><span>Puntos canjeados (parcial)</span><strong>${formatPoints(pointsRedeemed)}</strong></div>
        </div>
        <div class="servipremia-partial-advisors"><strong>Avance por asesor (provisional; hasta 8 principales)</strong>
            ${advisorRows ? `<div class="table-container"><table class="imei-table"><thead><tr><th>Asesor</th><th style="text-align:right;">Operaciones</th><th style="text-align:right;">Ops. con acumulación</th><th style="text-align:right;">Ventas</th><th style="text-align:right;">Puntos acumulados</th><th style="text-align:right;">Puntos canjeados</th></tr></thead><tbody>${advisorRows}</tbody></table></div>` : '<div class="servipremia-progress-empty">Esperando ventas para mostrar el desglose…</div>'}
        </div>`;
    }

    function updateDailyProgress(state) {
        const root = document.getElementById(PROGRESS_ID);
        if (!root) return;
        const title = document.getElementById('servipremiaDailyProgressTitle');
        const track = document.getElementById('servipremiaDailyProgressTrack');
        const bar = document.getElementById('servipremiaDailyProgressBar');
        const percentLabel = document.getElementById('servipremiaDailyProgressPercent');
        const detail = document.getElementById('servipremiaDailyProgressDetail');
        const partial = document.getElementById('servipremiaDailyPartialData');
        const labels = {
            sales: 'Consultando ventas del ERP',
            cards: 'Consultando tarjetas y perfiles Rewardix',
            operations: 'Consultando movimientos Rewardix',
            error: 'Consulta detenida'
        };
        const bands = { sales: [0, 55], cards: [55, 75], operations: [75, 99] };
        const loaded = Number(state.loaded) || 0;
        const total = state.total === null || state.total === undefined ? null : Number(state.total);
        let fraction = null;
        if (total !== null && Number.isFinite(total)) fraction = total > 0 ? loaded / total : 1;
        else if (Number(state.totalPages) > 0) fraction = (Number(state.page) || 0) / Number(state.totalPages);

        let percentage = null;
        if (state.stage === 'error') percentage = 100;
        else if (state.stage === 'complete') percentage = 100;
        else if (fraction !== null && bands[state.stage]) {
            const [start, end] = bands[state.stage];
            percentage = Math.round(start + (end - start) * Math.max(0, Math.min(1, fraction)));
        }

        root.style.display = 'block';
        if (typeof root.setAttribute === 'function') root.setAttribute('aria-busy', state.stage === 'error' ? 'false' : 'true');
        if (title) title.textContent = state.title || labels[state.stage] || 'Consultando…';
        if (track && typeof track.setAttribute === 'function' && percentage !== null) {
            track.setAttribute('aria-valuenow', String(percentage));
        }
        if (bar) {
            bar.className = `servipremia-progress-bar${percentage === null ? ' is-indeterminate' : ''}${state.stage === 'error' ? ' is-error' : ''}`;
            bar.style.width = percentage === null ? '38%' : `${percentage}%`;
        }
        if (percentLabel) percentLabel.textContent = percentage === null ? 'En curso' : `${percentage}%`;

        let detailText = state.message || '';
        if (!detailText && state.stage === 'sales') {
            detailText = total === null
                ? `${loaded.toLocaleString('es-MX')} ventas recibidas${state.page ? ` · página ${state.page}` : ''}${state.pageSize ? ` · ${state.pageSize} por página` : ''}`
                : `${loaded.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} ventas${state.totalPages ? ` · página ${state.page} de ${state.totalPages}` : ''}`;
        } else if (!detailText && state.stage === 'cards') {
            detailText = state.cached
                ? `Catálogo en caché: ${loaded.toLocaleString('es-MX')} tarjetas`
                : `${loaded.toLocaleString('es-MX')} tarjetas cargadas${total !== null ? ` de ${total.toLocaleString('es-MX')}` : ''}${state.page ? ` · página ${state.page}` : ''}`;
        } else if (!detailText && state.stage === 'operations') {
            detailText = `${loaded.toLocaleString('es-MX')} movimientos cargados${total !== null ? ` de ${total.toLocaleString('es-MX')}` : ''}${state.page ? ` · página ${state.page}` : ''}`;
        }
        if (detail) detail.textContent = detailText;
        if (partial && Object.prototype.hasOwnProperty.call(state, 'sales')) {
            partial.innerHTML = renderSalesProgressPreview(state.sales);
        }
    }

    function hideDailyProgress() {
        const root = document.getElementById(PROGRESS_ID);
        if (root) {
            root.style.display = 'none';
            if (typeof root.setAttribute === 'function') root.setAttribute('aria-busy', 'false');
        }
    }

    function renderAdvisorTable(rows) {
        if (!rows.length) return '<div class="alert alert-info">No hay ventas por asesor para esta fecha.</div>';
        const tableId = 'servipremiaDailyAdvisorsTable';
        const body = rows.map((row, index) => `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td><button type="button" class="servipremia-open-advisor" data-advisor-index="${index}" style="border:0;background:none;padding:0;color:#1e40af;text-decoration:underline;cursor:pointer;font:inherit;font-weight:700;">${escapeHtml(row.advisor)}</button></td>
                <td style="text-align:right;">${row.operations.toLocaleString('es-MX')}</td>
                <td style="text-align:right;font-weight:700;">${row.accruedOperationCount.toLocaleString('es-MX')}</td>
                <td style="text-align:right;">${formatCurrency(row.salesAmount)}</td>
                <td style="text-align:right;">${formatPoints(row.pointsEarned)}</td>
                <td style="text-align:right;">${formatPoints(row.pointsRedeemed)}</td>
            </tr>`).join('');

        return `${renderServipremiaPaginationControls(tableId)}
            <div class="table-container">
                <table id="${tableId}" class="imei-table" style="font-size:0.85rem;">
                    <thead><tr>
                        <th data-sort-index="0" style="width:55px;text-align:center;">#<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="1">Asesor<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="2" style="text-align:right;">Operaciones<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="3" style="text-align:right;">Ops. con acumulación<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="4" style="text-align:right;">Ventas totales<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="5" style="text-align:right;">Puntos acumulados<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="6" style="text-align:right;">Puntos canjeados<span data-sort-indicator> ↕</span></th>
                    </tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>`;
    }

    function renderCustomerTable(rows, profileSummary) {
        if (!rows.length) return '<div class="alert alert-info">No hay ventas asociadas a una tarjeta Rewardix para esta fecha.</div>';
        const tableId = 'servipremiaDailyCustomersTable';
        const body = rows.map((row, index) => `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td>${escapeHtml(row.phone || 'No disponible')}</td>
                <td><button type="button" class="servipremia-open-client" data-client-index="${index}" style="border:0;background:none;padding:0;color:#1e40af;text-decoration:underline;cursor:pointer;font:inherit;font-weight:700;">${escapeHtml(row.name || 'Nombre no disponible')}</button></td>
                <td>${escapeHtml(row.cardId)}</td>
                <td style="text-align:right;font-weight:700;">${row.accruedOperationCount.toLocaleString('es-MX')}</td>
                <td style="text-align:right;">${formatPoints(row.pointsEarned)}</td>
                <td style="text-align:right;">${formatPoints(row.pointsRedeemed)}</td>
                <td style="text-align:right;" title="${escapeHtml(`Fuente: ${row.balanceSource}`)}">${row.closingBalance === null || row.closingBalance === undefined ? 'No disponible' : formatPoints(row.closingBalance)}</td>
            </tr>`).join('');

        return `${renderServipremiaPaginationControls(tableId)}
            <div class="table-container">
                <table id="${tableId}" class="imei-table" style="font-size:0.85rem;">
                    <thead><tr>
                        <th data-sort-index="0" style="width:55px;text-align:center;">#<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="1">Teléfono<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="2">Nombre y apellido<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="3">Tarjeta Rewardix<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="4" style="text-align:right;">Ops. con acumulación<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="5" style="text-align:right;">Puntos acumulados<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="6" style="text-align:right;">Puntos canjeados<span data-sort-indicator> ↕</span></th>
                        <th data-sort-index="7" style="text-align:right;">Saldo al cierre<span data-sort-indicator> ↕</span></th>
                    </tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
            <div class="alert alert-info" style="margin-top:10px;">Catálogo general Rewardix: ${profileSummary.catalogCards} tarjetas consultadas. De las ${profileSummary.totalCards} tarjetas con ventas en la fecha, ${profileSummary.catalogMatched} se asociaron por cardId del catálogo, ${profileSummary.matchedByPhone} por teléfono y ${profileSummary.notMatched} no tuvieron coincidencia. El catálogo no depende de movimientos del día.</div>
            ${profileSummary.catalogError ? `<div class="alert alert-warning" style="margin-top:10px;">No se pudo consultar el catálogo Rewardix (${escapeHtml(profileSummary.catalogError)}). El reporte conserva los datos del ERP y los movimientos disponibles; para cargar todos los perfiles, despliega la actualización del proxy.</div>` : ''}
            <small style="display:block;margin-top:8px;color:#64748b;">El saldo al cierre proviene del último movimiento Rewardix del día consultado; cuando no hay movimiento, se muestra el último balance guardado en la venta ERP.</small>`;
    }

    let activeModalEscHandler = null;
    let activeClientHistoryRequestId = 0;

    function displayTimestamp(value) {
        if (!value) return 'No disponible';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-MX');
    }

    function openSale(saleId) {
        if (saleId === null || saleId === undefined || String(saleId).trim() === '') return;
        const normalizedId = /^\d+$/.test(String(saleId)) ? Number(saleId) : String(saleId);
        if (typeof window.abrirVentaERP === 'function') {
            window.abrirVentaERP(normalizedId);
        } else if (typeof window.openReceipt === 'function') {
            window.openReceipt(normalizedId);
        } else if (typeof window.alert === 'function') {
            window.alert('No está disponible la función para abrir la venta.');
        }
    }

    function renderSaleHistoryTable(sales, clientProfile) {
        if (!Array.isArray(sales) || !sales.length) return '<div class="alert alert-info">No hay ventas ERP para mostrar.</div>';
        const ordered = sales.slice().sort((a, b) => eventDateTimestamp(a) - eventDateTimestamp(b));
        const rows = ordered.map(sale => {
            const points = effectivePoints(sale);
            const saleId = sale.id;
            const folio = sale.folio || sale.id || 'Sin folio';
            const saleButton = saleId === null || saleId === undefined
                ? escapeHtml(folio)
                : `<button type="button" class="servipremia-open-sale" data-sale-id="${escapeHtml(saleId)}" style="border:0;background:none;padding:0;color:#1e40af;text-decoration:underline;cursor:pointer;font:inherit;font-weight:700;">#${escapeHtml(folio)}</button>`;
            const client = fallbackSaleClient(sale);
            const displayName = client.name && client.name !== 'Nombre no disponible'
                ? client.name
                : (clientProfile && clientProfile.name) || client.name || 'Nombre no disponible';
            const displayPhone = client.phone || (clientProfile && clientProfile.phone) || '';
            const cancelled = isTrue(sale.is_cancelled);
            return `<tr>
                <td>${escapeHtml(displayTimestamp(sale.created_at || sale.date))}</td>
                <td>${saleButton}</td>
                <td>${escapeHtml(displayName)}${displayPhone ? `<br><small>${escapeHtml(displayPhone)}</small>` : ''}</td>
                <td style="text-align:right;">${formatCurrency(sale.total)}</td>
                <td style="text-align:right;">${formatPoints(points.earned)}</td>
                <td style="text-align:right;">${formatPoints(points.redeemed)}</td>
                <td>${cancelled ? 'Cancelada' : 'Vigente'}</td>
            </tr>`;
        }).join('');
        return `<div class="table-container" style="max-height:48vh;overflow:auto;">
            <table class="imei-table" style="font-size:0.82rem;min-width:900px;">
                <thead><tr><th>Fecha y hora</th><th>Folio / venta</th><th>Cliente</th><th>Importe</th><th>Puntos acumulados</th><th>Puntos canjeados</th><th>Estado</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    function isRewardixPointsEvent(operation) {
        const eventName = String(operation && (operation.eventName || operation.type) || '')
            .toLowerCase().trim().replace(/\s+/g, ' ');
        return ['points earned', 'points redeemed', 'puntos ganados', 'puntos canjeados'].includes(eventName);
    }

    function renderRewardixHistoryTable(operations) {
        const pointOperations = Array.isArray(operations) ? operations.filter(isRewardixPointsEvent) : [];
        if (!pointOperations.length) return '<div class="alert alert-info">No hay registros de puntos ganados o redimidos para esta tarjeta.</div>';
        const ordered = pointOperations.slice().sort((a, b) => eventDateTimestamp(a) - eventDateTimestamp(b));
        const rows = ordered.map(operation => {
            const comment = operation.comment || operation.description || operation.note || '—';
            return `<tr>
                <td>${escapeHtml(displayTimestamp(operation.createdAt || operation.created_at || operation.date))}</td>
                <td>${escapeHtml(operation.eventName || operation.type || 'Movimiento Rewardix')}</td>
                <td style="text-align:right;">${formatPoints(operation.amount)}</td>
                <td style="text-align:right;">${operation.balance === null || operation.balance === undefined ? 'No disponible' : formatPoints(operation.balance)}</td>
                <td>${escapeHtml(comment)}</td>
            </tr>`;
        }).join('');
        return `<div class="table-container" style="max-height:42vh;overflow:auto;">
            <table class="imei-table" style="font-size:0.82rem;min-width:760px;">
                <thead><tr><th>Fecha y hora</th><th>Movimiento</th><th>Puntos</th><th>Balance</th><th>Comentario</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    function closeDailyModal() {
        activeClientHistoryRequestId += 1;
        const host = document.getElementById('servipremiaDailyModalHost');
        if (host) {
            host.style.display = 'none';
            host.innerHTML = '';
            host.onclick = null;
        }
        if (activeModalEscHandler) {
            document.removeEventListener('keydown', activeModalEscHandler);
            activeModalEscHandler = null;
        }
    }

    function showDailyModal(title, body) {
        const host = document.getElementById('servipremiaDailyModalHost');
        if (!host) return;
        if (activeModalEscHandler) document.removeEventListener('keydown', activeModalEscHandler);
        host.innerHTML = `<div class="servipremia-daily-modal-backdrop" style="position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:18px;">
            <section role="dialog" aria-modal="true" aria-labelledby="servipremiaDailyModalTitle" style="width:min(1180px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 22px 70px rgba(15,23,42,.35);padding:20px;">
                <header style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px;">
                    <h3 id="servipremiaDailyModalTitle" style="margin:0;color:#1e3a8a;">${escapeHtml(title)}</h3>
                    <button type="button" data-servipremia-modal-close aria-label="Cerrar" style="border:0;background:#e2e8f0;border-radius:8px;padding:6px 12px;font-size:1.2rem;cursor:pointer;">×</button>
                </header>
                <div>${body}</div>
            </section>
        </div>`;
        host.style.display = 'block';
        host.onclick = event => {
            const target = event.target;
            if (target && (target.matches('[data-servipremia-modal-close]')
                || target.classList.contains('servipremia-daily-modal-backdrop'))) {
                closeDailyModal();
                return;
            }
            const saleButton = target && target.closest('.servipremia-open-sale');
            if (saleButton) {
                event.preventDefault();
                openSale(saleButton.getAttribute('data-sale-id'));
            }
        };
        activeModalEscHandler = event => {
            if (event.key === 'Escape') closeDailyModal();
        };
        document.addEventListener('keydown', activeModalEscHandler);
    }

    function openAdvisorDetails(index) {
        const advisor = cachedServipremiaData && cachedServipremiaData.advisorRows[index];
        if (!advisor) return;
        const title = `${advisor.advisor} — ${advisor.accruedOperationCount} operaciones con acumulación`;
        const body = `<p style="margin:0 0 14px;color:#475569;">Ventas del asesor en las que se acumularon puntos durante el día consultado. Selecciona el folio para abrir el recibo.</p>${renderSaleHistoryTable(advisor.earnedSales)}`;
        showDailyModal(title, body);
    }

    function renderClientDetailsBody(client, rewardixHistory, loading, historyError) {
        const operations = Array.isArray(rewardixHistory) ? rewardixHistory : [];
        const pointOperations = operations.filter(isRewardixPointsEvent);
        const historyHeading = `Historial de puntos Rewardix${loading ? ' (consultando…)' : ` (${pointOperations.length})`}`;
        const historyContent = loading
            ? '<div class="alert alert-info">Consultando el historial completo de esta tarjeta en Rewardix…</div>'
            : historyError
                ? `<div class="alert alert-error">No se pudo consultar el historial completo: ${escapeHtml(historyError)}</div>`
                : renderRewardixHistoryTable(pointOperations);

        return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
                <span class="alert alert-info" style="margin:0;">Teléfono: ${escapeHtml(client.phone || 'No disponible')}</span>
                <span class="alert alert-info" style="margin:0;">Tarjeta: ${escapeHtml(client.cardId)}</span>
                <span class="alert alert-info" style="margin:0;">Operaciones con acumulación: ${client.accruedOperationCount}</span>
                <span class="alert alert-info" style="margin:0;">Acumulados: ${formatPoints(client.pointsEarned)}</span>
                <span class="alert alert-info" style="margin:0;">Canjeados: ${formatPoints(client.pointsRedeemed)}</span>
                <span class="alert alert-info" style="margin:0;">Saldo al cierre: ${client.closingBalance === null || client.closingBalance === undefined ? 'No disponible' : formatPoints(client.closingBalance)}</span>
            </div>
            <h4 style="color:#1e40af;margin:16px 0 8px;">Ventas ERP del día (${client.sales.length})</h4>
            ${renderSaleHistoryTable(client.sales, client)}
            <h4 style="color:#1e40af;margin:20px 0 8px;">${historyHeading}</h4>
            ${historyContent}`;
    }

    async function openClientDetails(index) {
        const client = cachedServipremiaData && cachedServipremiaData.clientRows[index];
        if (!client) return;
        const requestId = ++activeClientHistoryRequestId;
        const title = `${client.name || 'Cliente'} — historial completo`;
        showDailyModal(title, renderClientDetailsBody(client, [], true, ''));

        try {
            const history = await fetchRewardixCardHistory(client.cardId);
            if (requestId !== activeClientHistoryRequestId) return;
            client.rewardixHistory = history;
            showDailyModal(title, renderClientDetailsBody(client, history, false, ''));
        } catch (error) {
            if (requestId !== activeClientHistoryRequestId) return;
            showDailyModal(title, renderClientDetailsBody(client, [], false, error && error.message ? error.message : 'error desconocido'));
        }
    }

    function setupDailyTabs() {
        const panels = {
            advisors: document.getElementById('servipremiaDailyAdvisorsPanel'),
            customers: document.getElementById('servipremiaDailyCustomersPanel')
        };
        document.querySelectorAll('.servipremia-breakdown-tab').forEach(button => {
            button.addEventListener('click', () => {
                const selected = button.dataset.servipremiaTab;
                document.querySelectorAll('.servipremia-breakdown-tab').forEach(tab => {
                    const active = tab.dataset.servipremiaTab === selected;
                    tab.style.background = active ? '#1e40af' : '#e2e8f0';
                    tab.style.color = active ? '#ffffff' : '#334155';
                    tab.setAttribute('aria-selected', active ? 'true' : 'false');
                });
                Object.entries(panels).forEach(([key, panel]) => {
                    if (panel) panel.style.display = key === selected ? 'block' : 'none';
                });
            });
        });
        setupServipremiaTable('servipremiaDailyAdvisorsTable');
        setupServipremiaTable('servipremiaDailyCustomersTable');
        document.querySelectorAll('.servipremia-open-advisor').forEach(button => {
            button.addEventListener('click', () => openAdvisorDetails(Number(button.dataset.advisorIndex)));
        });
        document.querySelectorAll('.servipremia-open-client').forEach(button => {
            button.addEventListener('click', () => openClientDetails(Number(button.dataset.clientIndex)));
        });
    }

    function renderDailyResults(data) {
        const container = document.getElementById(RESULTS_ID);
        if (!container) return;

        const {
            date, erpTotal, erpMonto, pointsEarnedCount, pointsRedeemedCount,
            cardInstalledCount, totalPointsEarned, totalPointsRedeemed,
            advisorRows, clientRows, profileSummary
        } = data;
        const redemptionRate = totalPointsEarned > 0 ? (totalPointsRedeemed / totalPointsEarned) * 100 : 0;
        const earnedCoverage = erpTotal > 0 ? (pointsEarnedCount / erpTotal) * 100 : 0;
        const maxPoints = Math.max(totalPointsEarned, totalPointsRedeemed, 1);
        const earnedWidth = (totalPointsEarned / maxPoints) * 100;
        const redeemedWidth = (totalPointsRedeemed / maxPoints) * 100;

        container.innerHTML = `
            <div class="alert alert-info" style="margin-bottom:20px;">
                📅 <strong>Día consultado:</strong> ${escapeHtml(formatLocalDate(date))}
                <span style="margin-left:20px;">🔄 <strong>Actualizado:</strong> ${new Date().toLocaleString('es-MX')}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px;">
                <div class="stat-card" style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);">
                    <div class="stat-number">${numberValue(erpTotal).toLocaleString('es-MX')}</div>
                    <div class="stat-label">📊 Total Operaciones ERP</div>
                    <div style="font-size:0.75rem;margin-top:6px;opacity:0.9;">💰 ${formatCurrency(erpMonto)}</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);">
                    <div class="stat-number">${numberValue(pointsEarnedCount).toLocaleString('es-MX')}</div>
                    <div class="stat-label">⭐ Transacciones Puntos Ganados</div>
                    <div style="font-size:0.75rem;margin-top:6px;opacity:0.9;">${formatPoints(totalPointsEarned)} puntos</div>
                    <div style="font-size:0.65rem;margin-top:4px;opacity:0.8;">${earnedCoverage.toFixed(2)}% de las operaciones ERP</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">
                    <div class="stat-number">${numberValue(pointsRedeemedCount).toLocaleString('es-MX')}</div>
                    <div class="stat-label">🎁 Transacciones Puntos Canjeados</div>
                    <div style="font-size:0.75rem;margin-top:6px;opacity:0.9;">${formatPoints(totalPointsRedeemed)} puntos</div>
                    <div style="font-size:0.65rem;margin-top:4px;opacity:0.8;">${redemptionRate.toFixed(2)}% de los puntos ganados</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#7c3aed 0%,#8b5cf6 100%);">
                    <div class="stat-number" style="font-size:1.6rem;">${redemptionRate.toFixed(1)}%</div>
                    <div class="stat-label">📈 Tasa de Canje</div>
                    <div style="font-size:0.7rem;margin-top:6px;opacity:0.9;">Puntos canjeados / ganados</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#0891b2 0%,#06b6d4 100%);">
                    <div class="stat-number">${numberValue(cardInstalledCount).toLocaleString('es-MX')}</div>
                    <div class="stat-label">💳 Card Installed</div>
                    <div style="font-size:0.7rem;margin-top:6px;opacity:0.9;">Teléfonos únicos en el día</div>
                </div>
            </div>
            <div style="background:#f8fafc;border-radius:16px;padding:20px;margin-bottom:24px;border:1px solid #e2e8f0;">
                <h4 style="color:#1e40af;margin-bottom:16px;text-align:center;">📊 Comparativa de Puntos</h4>
                <div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;"><span style="color:#059669;font-weight:600;">⭐ Puntos Ganados</span><span style="font-weight:bold;color:#059669;">${formatPoints(totalPointsEarned)}</span></div>
                    <div style="background:#e2e8f0;border-radius:20px;overflow:hidden;height:28px;"><div style="width:${earnedWidth}%;background:linear-gradient(90deg,#059669,#10b981);height:100%;border-radius:20px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;color:white;font-weight:bold;font-size:0.8rem;">${earnedWidth > 15 ? formatPoints(totalPointsEarned) : ''}</div></div>
                </div>
                <div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;"><span style="color:#f97316;font-weight:600;">🎁 Puntos Canjeados</span><span style="font-weight:bold;color:#f97316;">${formatPoints(totalPointsRedeemed)}</span></div>
                    <div style="background:#e2e8f0;border-radius:20px;overflow:hidden;height:28px;"><div style="width:${redeemedWidth}%;background:linear-gradient(90deg,#f97316,#ea580c);height:100%;border-radius:20px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;color:white;font-weight:bold;font-size:0.8rem;">${redeemedWidth > 15 ? formatPoints(totalPointsRedeemed) : ''}</div></div>
                </div>
                <div style="margin-top:20px;padding-top:16px;border-top:1px dashed #cbd5e1;text-align:center;">
                    <div style="font-size:0.8rem;color:#64748b;">Diferencia neta de puntos</div>
                    <div style="font-size:1.8rem;font-weight:800;color:${totalPointsEarned - totalPointsRedeemed >= 0 ? '#059669' : '#dc2626'};">${formatPoints(totalPointsEarned - totalPointsRedeemed)}</div>
                    <div style="font-size:0.7rem;color:#94a3b8;">(${totalPointsEarned - totalPointsRedeemed >= 0 ? 'saldo a favor' : 'déficit'})</div>
                </div>
            </div>
            <div style="margin-top:28px;">
                <h4 style="color:#1e40af;margin-bottom:12px;">📋 Desgloses del día</h4>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;border-bottom:2px solid #e2e8f0;padding-bottom:10px;">
                    <button type="button" class="servipremia-breakdown-tab" data-servipremia-tab="advisors" aria-selected="true" style="border:0;border-radius:8px;padding:9px 14px;background:#1e40af;color:#ffffff;cursor:pointer;font-weight:700;">👥 Ventas por asesor</button>
                    <button type="button" class="servipremia-breakdown-tab" data-servipremia-tab="customers" aria-selected="false" style="border:0;border-radius:8px;padding:9px 14px;background:#e2e8f0;color:#334155;cursor:pointer;font-weight:700;">🎁 Acumulación por cliente</button>
                </div>
                <div id="servipremiaDailyAdvisorsPanel">${renderAdvisorTable(advisorRows)}</div>
                <div id="servipremiaDailyCustomersPanel" style="display:none;">${renderCustomerTable(clientRows, profileSummary)}</div>
            </div>
            <div id="servipremiaDailyModalHost" style="display:none;"></div>
            <div style="display:flex;justify-content:flex-end;margin-top:20px;">
                <button id="exportarServipremiaBtn" style="background:linear-gradient(135deg,#059669,#10b981);color:white;border:none;padding:10px 24px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;gap:8px;">📊 Exportar a Excel</button>
            </div>`;

        container.style.display = 'block';
        setupDailyTabs();
        const exportButton = document.getElementById('exportarServipremiaBtn');
        if (exportButton) exportButton.addEventListener('click', exportDailyReport);
    }

    function initServipremiaDailyModule() {
        const dateInput = document.getElementById(DATE_INPUT_ID);
        if (!dateInput) return;

        const today = localDateString(new Date());
        dateInput.max = today;
        if (!dateInput.value || dateInput.value > today) dateInput.value = today;

        const searchButton = document.getElementById(BUTTON_ID);
        if (searchButton && !searchButton.hasAttribute('data-daily-listener')) {
            searchButton.setAttribute('data-daily-listener', 'true');
            searchButton.addEventListener('click', searchServipremiaDaily);
        }
        if (!dateInput.hasAttribute('data-daily-listener')) {
            dateInput.setAttribute('data-daily-listener', 'true');
            dateInput.addEventListener('change', () => {
                const results = document.getElementById(RESULTS_ID);
                const error = document.getElementById('servipremiaErrorAlert');
                if (results) results.style.display = 'none';
                hideDailyProgress();
                if (error) error.style.display = 'none';
                if (typeof showInfo === 'function') showInfo('servipremia', 'Fecha modificada. Pulsa “Consultar” para cargar ese día.');
            });
        }
    }

    async function searchServipremiaDaily() {
        const dateInput = document.getElementById(DATE_INPUT_ID);
        const button = document.getElementById(BUTTON_ID);
        if (!dateInput || !button) return;

        const dateValue = dateInput.value;
        try {
            getSingleDayRange(dateValue);
        } catch (error) {
            if (typeof showError === 'function') showError('servipremia', error.message);
            return;
        }

        const results = document.getElementById(RESULTS_ID);
        const previousButtonText = button.innerHTML;
        const previousDisabled = button.disabled;
        button.disabled = true;
        dateInput.disabled = true;
        if (results) results.style.display = 'none';
        const errorAlert = document.getElementById('servipremiaErrorAlert');
        if (errorAlert) errorAlert.style.display = 'none';
        const infoAlert = document.getElementById('servipremiaInfoAlert');
        if (infoAlert) infoAlert.style.display = 'none';
        updateDailyProgress({ stage: 'sales', loaded: 0, total: null, page: 0, pageSize: PAGE_SIZE, sales: [] });

        try {
            button.innerHTML = 'Consultando ventas del día… <span class="loading-spinner"></span>';
            const salesResult = await fetchSalesForDay(dateValue, updateDailyProgress);
            const sales = salesResult.sales;
            updateDailyProgress({
                stage: 'sales', loaded: sales.length, total: sales.length,
                page: 1, totalPages: 1, pageSize: salesResult.pageSize, sales,
                message: `${sales.length.toLocaleString('es-MX')} ventas ERP cargadas · ${formatCurrency(sales.reduce((sum, sale) => sum + numberValue(sale && sale.total), 0))} acumulados`
            });

            let rewardixCards = [];
            let cardCatalogError = '';
            if (sales.some(sale => sale && normalizeCardId(sale.loyalty_card_id))) {
                button.innerHTML = 'Consultando catálogo de tarjetas Rewardix… <span class="loading-spinner"></span>';
                updateDailyProgress({ stage: 'cards', loaded: 0, total: null, page: 0, title: 'Consultando tarjetas y perfiles Rewardix' });
                try {
                    rewardixCards = await fetchRewardixCardCatalog(updateDailyProgress);
                } catch (error) {
                    cardCatalogError = error && error.message ? error.message : 'no se pudo consultar el catálogo';
                    console.warn('[SERVIPREMIA] Catálogo de tarjetas Rewardix no disponible:', cardCatalogError);
                    updateDailyProgress({ stage: 'cards', loaded: 0, total: null, message: `El catálogo falló (${cardCatalogError}); continúo con los movimientos del día.` });
                }
            } else {
                updateDailyProgress({ stage: 'cards', loaded: 0, total: 0, page: 1, totalPages: 1, message: 'No hay tarjetas Rewardix en las ventas; se omite el catálogo.' });
            }

            button.innerHTML = 'Consultando movimientos Rewardix… <span class="loading-spinner"></span>';
            updateDailyProgress({ stage: 'operations', loaded: 0, total: null, page: 0, title: 'Consultando movimientos Rewardix del día' });
            const rewardixOperations = await fetchRewardixOperations(dateValue, dateValue, updateDailyProgress);

            const pointsEarned = rewardixOperations.filter(operation => {
                const eventName = String(operation.eventName || '').toLowerCase().trim();
                return eventName === 'points earned' || eventName === 'puntos ganados';
            });
            const pointsRedeemed = rewardixOperations.filter(operation => {
                const eventName = String(operation.eventName || '').toLowerCase().trim();
                return eventName === 'points redeemed' || eventName === 'puntos canjeados' || eventName === 'points used';
            });
            const cardInstalled = rewardixOperations.filter(operation =>
                String(operation.eventName || '').toLowerCase().trim() === 'card installed');
            const uniquePhones = new Set();
            cardInstalled.forEach(operation => {
                const phone = typeof getServipremiaPhone === 'function' ? getServipremiaPhone(operation) : null;
                if (phone) uniquePhones.add(phone);
            });

            const breakdowns = buildDailyBreakdowns(sales, rewardixOperations, rewardixCards);
            breakdowns.profileSummary.catalogError = cardCatalogError;
            const erpAmount = sales.reduce((sum, sale) => sum + numberValue(sale && sale.total), 0);
            const totalPointsEarned = pointsEarned.reduce((sum, operation) => sum + numberValue(operation.amount), 0);
            const totalPointsRedeemed = pointsRedeemed.reduce((sum, operation) => sum + numberValue(operation.amount), 0);
            cachedServipremiaData = {
                date: dateValue,
                startDate: dateValue,
                endDate: dateValue,
                erpTotal: sales.length,
                erpMonto: erpAmount,
                totalOps: rewardixOperations.length,
                pointsEarnedCount: pointsEarned.length,
                pointsRedeemedCount: pointsRedeemed.length,
                cardInstalledCount: uniquePhones.size,
                totalPointsEarned,
                totalPointsRedeemed,
                advisorRows: breakdowns.advisors,
                clientRows: breakdowns.clients,
                profileSummary: breakdowns.profileSummary,
                salesRows: sales,
                rewardixOperations,
                fechaConsulta: new Date().toISOString()
            };

            renderDailyResults(cachedServipremiaData);
            hideDailyProgress();
        } catch (error) {
            console.error('[SERVIPREMIA] Error en consulta diaria:', error && error.message ? error.message : 'Error desconocido');
            updateDailyProgress({
                stage: 'error', title: 'Consulta interrumpida',
                message: `${error.message || 'No se pudo completar la consulta del día.'} Los datos parciales siguen visibles arriba.`
            });
            if (typeof showError === 'function') showError('servipremia', `Error: ${error.message || 'No se pudo completar la consulta del día.'}`);
        } finally {
            button.innerHTML = previousButtonText;
            button.disabled = previousDisabled;
            dateInput.disabled = false;
        }
    }

    function exportDailyReport() {
        if (!cachedServipremiaData) {
            if (typeof showError === 'function') showError('servipremia', 'No hay datos para exportar.');
            return;
        }
        if (typeof XLSX === 'undefined' || !XLSX.utils) {
            if (typeof showError === 'function') showError('servipremia', 'No está disponible la exportación a Excel.');
            return;
        }

        const data = cachedServipremiaData;
        const workbook = XLSX.utils.book_new();
        const summaryRows = [
            ['SERVIPREMIA - REPORTE DIARIO'],
            ['Fecha', data.date],
            ['Generado', new Date().toLocaleString('es-MX')],
            [],
            ['RESUMEN GENERAL'],
            ['Métrica', 'Valor'],
            ['Total Operaciones ERP', data.erpTotal],
            ['Monto Total ERP', data.erpMonto],
            ['Transacciones Puntos Ganados', data.pointsEarnedCount],
            ['Puntos Ganados', data.totalPointsEarned],
            ['Transacciones Puntos Canjeados', data.pointsRedeemedCount],
            ['Puntos Canjeados', data.totalPointsRedeemed],
            ['Card Installed - Teléfonos únicos', data.cardInstalledCount]
        ];
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
        summarySheet['!cols'] = [{ wch: 36 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

        const advisorRows = [
            ['Asesor', 'Operaciones', 'Ops. con acumulación', 'Ventas totales MXN', 'Puntos acumulados', 'Puntos canjeados'],
            ...data.advisorRows.map(row => [row.advisor, row.operations, row.accruedOperationCount, row.salesAmount, row.pointsEarned, row.pointsRedeemed])
        ];
        const advisorSheet = XLSX.utils.aoa_to_sheet(advisorRows);
        advisorSheet['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, advisorSheet, 'Ventas por asesor');

        const customerRows = [
            ['Teléfono', 'Nombre y apellido', 'Tarjeta Rewardix', 'Operaciones', 'Ops. con acumulación', 'Ventas totales MXN', 'Puntos acumulados', 'Puntos canjeados', 'Saldo al cierre'],
            ...data.clientRows.map(row => [row.phone || '', row.name, row.cardId, row.operations, row.accruedOperationCount, row.salesAmount, row.pointsEarned, row.pointsRedeemed, row.closingBalance])
        ];
        const customerSheet = XLSX.utils.aoa_to_sheet(customerRows);
        customerSheet['!cols'] = [
            { wch: 16 }, { wch: 30 }, { wch: 24 }, { wch: 14 },
            { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 18 }
        ];
        XLSX.utils.book_append_sheet(workbook, customerSheet, 'Clientes por tarjeta');

        const filename = `servipremia_${data.date}.xlsx`;
        XLSX.writeFile(workbook, filename);
        if (typeof showInfo === 'function') showInfo('servipremia', `✅ Exportado: ${filename}`);
    }

    // Sobrescribe solo el selector/búsqueda y las pestañas del módulo existente.
    window.initServipremiaModule = initServipremiaDailyModule;
    window.searchServipremia = searchServipremiaDaily;
    window.exportarServipremiaToExcel = exportDailyReport;
})();
