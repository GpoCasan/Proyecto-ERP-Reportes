/* Auditoría diaria de concentraciones de registro.
 * El ERP solo entrega created_at, por lo que este módulo identifica patrones
 * de concentración; no afirma la hora real en que ocurrió la venta.
 */
(function () {
    'use strict';

    const MODULE_KEY = 'auditoriaRegistroVentas';
    const DATE_ID = 'auditRegistroFecha';
    const BUTTON_ID = 'auditRegistroConsultar';
    const RESULTS_ID = 'auditRegistroResultados';
    const PROGRESS_ID = 'auditRegistroProgreso';
    const PAGE_SIZE = 200;
    const MAX_PAGES = 100;
    const LARGE_PAGE_SIZE_FALLBACK = 100;
    const LATE_HOUR_MIN_SALES = 5;
    const LATE_HOUR_MIN_SHARE = 0.40;
    const PEAK_HOUR_MIN_SALES = 5;
    const PEAK_HOUR_MIN_SHARE = 0.50;
    const SHIFTS = [
        { id: 'manana', label: 'Mañana · 07:00–14:00', start: 7 * 60, end: 14 * 60 },
        { id: 'tarde', label: 'Tarde · 14:00–21:00', start: 14 * 60, end: 21 * 60 }
    ];
    let isLoading = false;

    function canAccessAudit() {
        try {
            const user = JSON.parse(sessionStorage.getItem('servicel_user') || 'null');
            return !!(user && ['admin', 'comercial'].includes(user.role)
                && Array.isArray(user.modules) && user.modules.includes(MODULE_KEY));
        } catch (_) {
            return false;
        }
    }

    function localDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function parseDateValue(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
        if (!match) throw new Error('Selecciona una fecha válida.');
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(year, month - 1, day);
        if (localDateString(date) !== value) throw new Error('La fecha seleccionada no es válida.');
        if (value > localDateString(new Date())) throw new Error('No puedes consultar una fecha futura.');
        return { year, month, day, date };
    }

    function apiDateTime(date) {
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }

    function dateRangeForDay(dateValue) {
        const parsed = parseDateValue(dateValue);
        const start = new Date(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0);
        const now = new Date();
        let end;
        if (dateValue === localDateString(now)) {
            end = now;
        } else {
            end = new Date(parsed.year, parsed.month - 1, parsed.day + 1, 0, 0, 0, 0);
            end.setSeconds(end.getSeconds() - 1);
        }
        return { start: apiDateTime(start), end: apiDateTime(end) };
    }

    function makeSalesUrl(page, pageSize, range) {
        const url = new URL(CONFIG.API_SALES);
        url.searchParams.set('page', String(page));
        url.searchParams.set('per_page', String(pageSize));
        url.searchParams.set('total', '0');
        url.searchParams.set('start_date', range.start);
        url.searchParams.set('end_date', range.end);
        return url.toString();
    }

    async function fetchDaySales(dateValue, onPage) {
        const range = dateRangeForDay(dateValue);
        const allSales = [];
        let page = 1;
        let pageSize = PAGE_SIZE;
        let total = null;

        while (page <= MAX_PAGES) {
            const response = await fetch(makeSalesUrl(page, pageSize, range), {
                headers: {
                    Authorization: `Bearer ${CONFIG.FIXED_TOKEN}`,
                    Accept: 'application/json'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                if (page === 1 && pageSize > LARGE_PAGE_SIZE_FALLBACK && [400, 422].includes(response.status)) {
                    pageSize = LARGE_PAGE_SIZE_FALLBACK;
                    if (typeof onPage === 'function') {
                        onPage({ loaded: 0, total: null, page: 1, totalPages: null, pageSize, fallback: true, sales: allSales });
                    }
                    continue;
                }
                throw new Error(`La API de ventas respondió HTTP ${response.status}.`);
            }

            const payload = await response.json();
            const rows = Array.isArray(payload.data) ? payload.data : [];
            allSales.push(...rows);

            const meta = payload.meta || {};
            const totalValue = meta.total !== undefined ? meta.total : payload.total;
            const parsedTotal = Number.parseInt(totalValue, 10);
            total = totalValue !== null && totalValue !== undefined && totalValue !== ''
                && Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : null;
            const pageValue = payload.last_page || meta.last_page || (payload.pagination && payload.pagination.last_page);
            const lastPage = Number.parseInt(pageValue, 10);
            const totalPages = Number.isFinite(lastPage) && lastPage > 0
                ? lastPage
                : total !== null ? Math.max(1, Math.ceil(total / pageSize)) : null;

            if (typeof onPage === 'function') {
                onPage({ loaded: allSales.length, total, page, totalPages, pageSize, sales: allSales });
            }

            if (Number.isFinite(lastPage) && lastPage > 0) {
                if (page >= lastPage) break;
            } else {
                if (total !== null && allSales.length >= total) break;
                if (rows.length < pageSize) break;
            }
            page += 1;
        }

        if (page > MAX_PAGES) throw new Error(`La consulta superó el límite de ${MAX_PAGES} páginas para un día.`);
        return { sales: allSales, range, total, pageSize };
    }

    function readCreatedAt(value) {
        if (!value) return null;
        let text = String(value).trim();
        if (!text) return null;
        text = text.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
        const parsed = new Date(text);
        if (Number.isFinite(parsed.getTime())) return parsed;

        // Respaldo para valores sin zona horaria o con precisión de fracciones no estándar.
        const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value));
        if (!match) return null;
        const local = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
        return Number.isFinite(local.getTime()) ? local : null;
    }

    function isCancelled(sale) {
        const value = sale && (sale.is_cancelled !== undefined ? sale.is_cancelled : sale.cancelled);
        return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
    }

    function getAdvisor(sale) {
        const user = sale && sale.user && typeof sale.user === 'object' ? sale.user : {};
        const name = String(user.name || sale.user_name || sale.advisor_name || 'Asesor no identificado').trim();
        const id = sale && (sale.user_id || user.id);
        return { id: id === undefined || id === null || id === '' ? '' : String(id), name: name || 'Asesor no identificado' };
    }

    function getBranch(sale) {
        const warehouse = sale && sale.warehouse && typeof sale.warehouse === 'object' ? sale.warehouse : {};
        const branch = warehouse.branch && typeof warehouse.branch === 'object' ? warehouse.branch : {};
        const directBranch = sale && sale.branch && typeof sale.branch === 'object' ? sale.branch : {};
        const store = sale && sale.store && typeof sale.store === 'object' ? sale.store : {};
        return String(branch.name || (sale && sale.branch_name) || directBranch.name || store.name || warehouse.name || 'Sucursal no identificada').trim();
    }

    function getShift(minutes) {
        return SHIFTS.find(shift => minutes >= shift.start && minutes < shift.end) || null;
    }

    function countSummary(sales, selectedDate) {
        const now = new Date();
        const isToday = selectedDate === localDateString(now);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const groups = new Map();
        let cancelledCount = 0;
        let missingDateCount = 0;
        let otherLocalDayCount = 0;
        let activeDatedSales = 0;
        let outsideShiftCount = 0;

        (Array.isArray(sales) ? sales : []).forEach(sale => {
            if (!sale) return;
            if (isCancelled(sale)) {
                cancelledCount += 1;
                return;
            }
            const createdAt = readCreatedAt(sale.created_at);
            if (!createdAt) {
                missingDateCount += 1;
                return;
            }
            if (localDateString(createdAt) !== selectedDate) {
                otherLocalDayCount += 1;
                return;
            }

            activeDatedSales += 1;
            const minutes = createdAt.getHours() * 60 + createdAt.getMinutes();
            const shift = getShift(minutes);
            if (!shift) outsideShiftCount += 1;
            const advisor = getAdvisor(sale);
            const branch = getBranch(sale);
            const shiftId = shift ? shift.id : 'fuera';
            const key = `${advisor.id ? `id:${advisor.id}` : `name:${advisor.name.toLocaleLowerCase('es-MX')}`}|${branch.toLocaleLowerCase('es-MX')}|${shiftId}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    advisor: advisor.name,
                    branch,
                    shift,
                    shiftLabel: shift ? shift.label : 'Fuera de turno',
                    operations: 0,
                    amount: 0,
                    createdMinutes: [],
                    hourCounts: shift ? Array(7).fill(0) : [],
                    sales: []
                });
            }
            const group = groups.get(key);
            group.operations += 1;
            group.amount += Number(sale.total || sale.total_amount || 0) || 0;
            group.createdMinutes.push(minutes);
            group.sales.push(sale);
            if (shift) {
                const bucket = Math.floor((minutes - shift.start) / 60);
                if (bucket >= 0 && bucket < group.hourCounts.length) group.hourCounts[bucket] += 1;
            }
        });

        const rows = Array.from(groups.values()).map(group => {
            group.createdMinutes.sort((a, b) => a - b);
            const shift = group.shift;
            const maxHourCount = group.hourCounts.length ? Math.max(...group.hourCounts) : 0;
            const peakHourIndex = group.hourCounts.indexOf(maxHourCount);
            const peakHourStart = shift && peakHourIndex >= 0 ? shift.start + peakHourIndex * 60 : null;
            const lastHourOperations = shift
                ? group.createdMinutes.filter(minute => minute >= shift.end - 60 && minute < shift.end).length
                : 0;
            const lastHourShare = group.operations ? lastHourOperations / group.operations : 0;
            const peakHourShare = group.operations ? maxHourCount / group.operations : 0;
            const shiftComplete = !shift || !isToday || nowMinutes >= shift.end;
            let status;
            let statusKind;

            if (!shift) {
                status = 'Fuera de turno';
                statusKind = 'outside';
            } else if (!shiftComplete) {
                status = 'Turno en curso';
                statusKind = 'pending';
            } else if (group.operations >= LATE_HOUR_MIN_SALES
                && lastHourOperations >= LATE_HOUR_MIN_SALES
                && lastHourShare >= LATE_HOUR_MIN_SHARE) {
                status = 'Revisar concentración al cierre';
                statusKind = 'alert';
            } else if (group.operations >= PEAK_HOUR_MIN_SALES
                && maxHourCount >= PEAK_HOUR_MIN_SALES
                && peakHourShare >= PEAK_HOUR_MIN_SHARE) {
                status = 'Pico concentrado';
                statusKind = 'warning';
            } else {
                status = 'Sin señal fuerte';
                statusKind = 'normal';
            }

            return {
                ...group,
                lastHourOperations,
                lastHourShare,
                maxHourCount,
                peakHourIndex,
                peakHourStart,
                peakHourShare,
                status,
                statusKind
            };
        });

        const statusOrder = { alert: 0, warning: 1, pending: 2, normal: 3, outside: 4 };
        rows.sort((a, b) => (statusOrder[a.statusKind] - statusOrder[b.statusKind])
            || (b.lastHourShare - a.lastHourShare)
            || (b.operations - a.operations)
            || a.advisor.localeCompare(b.advisor, 'es-MX'));

        return {
            rows,
            totalReceived: Array.isArray(sales) ? sales.length : 0,
            activeDatedSales,
            cancelledCount,
            missingDateCount,
            otherLocalDayCount,
            outsideShiftCount,
            flaggedCount: rows.filter(row => row.statusKind === 'alert').length,
            isToday
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
        }).format(Number(value) || 0);
    }

    function formatCount(value) {
        return (Number(value) || 0).toLocaleString('es-MX');
    }

    function formatPercent(value) {
        return `${(Number(value || 0) * 100).toFixed(1)}%`;
    }

    function minuteLabel(value) {
        if (value === null || value === undefined) return '—';
        const hour = Math.floor(value / 60) % 24;
        const minute = value % 60;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    function renderHourlyBars(row) {
        if (!row.shift || !row.hourCounts.length) return '<span class="audit-no-hours">Fuera de turno</span>';
        const max = Math.max(1, ...row.hourCounts);
        return `<div class="audit-hour-bars" role="img" aria-label="Distribución de ventas por hora">${row.hourCounts.map((count, index) => {
            const start = row.shift.start + index * 60;
            const end = start + 60;
            const height = count ? Math.max(5, Math.round(count / max * 30)) : 2;
            return `<span class="audit-hour-column" title="${minuteLabel(start)}–${minuteLabel(end)}: ${formatCount(count)} ventas">
                <i style="height:${height}px;"></i><small>${String(Math.floor(start / 60)).padStart(2, '0')}</small>
            </span>`;
        }).join('')}</div>`;
    }

    function renderResults(analysis, dateValue, partial, loaded, total) {
        const results = document.getElementById(RESULTS_ID);
        if (!results) return;
        results.style.display = 'block';
        const dateLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            .format(new Date(`${dateValue}T12:00:00`));
        const activeRows = analysis.rows.filter(row => row.statusKind !== 'outside');
        const note = analysis.isToday
            ? '<div class="audit-note is-current">El día seleccionado es hoy: el turno de la tarde puede seguir en curso y no se evalúa como cierre hasta las 21:00.</div>'
            : '';
        const partialNote = partial
            ? `<div class="audit-note is-partial">Vista parcial mientras termina la consulta: ${formatCount(loaded)} ventas cargadas${total !== null ? ` de ${formatCount(total)}` : ''}.</div>`
            : '';
        const rowsHtml = analysis.rows.map(row => {
            let peakText = '—';
            if (row.peakHourStart !== null && row.maxHourCount > 0) {
                peakText = `${minuteLabel(row.peakHourStart)}–${minuteLabel(row.peakHourStart + 60)} · ${formatCount(row.maxHourCount)} (${formatPercent(row.peakHourShare)})`;
            }
            return `<tr>
                <td><strong>${escapeHtml(row.advisor)}</strong></td>
                <td>${escapeHtml(row.branch)}</td>
                <td>${escapeHtml(row.shiftLabel)}</td>
                <td class="audit-num">${formatCount(row.operations)}</td>
                <td class="audit-num">${formatCurrency(row.amount)}</td>
                <td class="audit-num">${formatCount(row.lastHourOperations)} · ${formatPercent(row.lastHourShare)}</td>
                <td>${escapeHtml(peakText)}</td>
                <td>${renderHourlyBars(row)}</td>
                <td><span class="audit-status is-${row.statusKind}">${escapeHtml(row.status)}</span></td>
            </tr>`;
        }).join('');

        const outsideRows = analysis.rows.filter(row => row.statusKind === 'outside').length;
        const missing = analysis.missingDateCount + analysis.otherLocalDayCount;
        results.innerHTML = `${note}${partialNote}
            <div class="audit-method-note"><strong>Cómo leerlo:</strong> solo se usa <code>created_at</code>, que indica cuándo quedó registrada la venta. “Revisar concentración al cierre” es una señal, no una prueba de captura tardía. Umbral inicial: 5 o más ventas y al menos 40% del turno dentro de su última hora. “Pico concentrado” señala 5 o más ventas en una hora que representan al menos 50% del turno.</div>
            <div class="audit-summary-cards">
                <div><span>Ventas recibidas</span><strong>${formatCount(analysis.totalReceived)}</strong></div>
                <div><span>Ventas activas analizadas</span><strong>${formatCount(analysis.activeDatedSales)}</strong></div>
                <div><span>Con cancelación</span><strong>${formatCount(analysis.cancelledCount)}</strong></div>
                <div><span>Señales al cierre</span><strong class="${analysis.flaggedCount ? 'audit-highlight' : ''}">${formatCount(analysis.flaggedCount)}</strong></div>
            </div>
            <div class="audit-data-quality">Fuera de turno: ${formatCount(analysis.outsideShiftCount)} · Sin fecha o fuera del día local: ${formatCount(missing)} · Grupos de turno: ${formatCount(activeRows.length)} · Grupos fuera de turno: ${formatCount(outsideRows)}</div>
            <h3 class="audit-date-heading">Análisis del ${escapeHtml(dateLabel)}</h3>
            ${analysis.rows.length ? `<div class="audit-table-wrap"><table class="audit-table">
                <thead><tr><th>Asesor</th><th>Sucursal</th><th>Turno</th><th>Ventas</th><th>Monto</th><th>Última hora<br><small>ventas · % turno</small></th><th>Hora pico</th><th>Distribución por hora</th><th>Señal</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table></div>` : '<div class="audit-empty">No se encontraron ventas activas con hora de registro válida para ese día.</div>'}
            <p class="audit-footnote">Turnos usados: mañana 07:00–14:00; tarde 14:00–21:00. Las 14:00 pertenecen al turno de la tarde. Las ventas canceladas no participan en las señales.</p>`;
    }

    function setProgress(state) {
        const root = document.getElementById(PROGRESS_ID);
        if (!root) return;
        const title = document.getElementById('auditRegistroProgresoTitulo');
        const detail = document.getElementById('auditRegistroProgresoDetalle');
        const track = document.getElementById('auditRegistroProgresoTrack');
        const bar = document.getElementById('auditRegistroProgresoBar');
        const pct = document.getElementById('auditRegistroProgresoPct');
        const loaded = Number(state.loaded) || 0;
        const total = state.total === null || state.total === undefined ? null : Number(state.total);
        let percent = null;
        if (state.stage === 'error') percent = 100;
        else if (state.stage === 'complete') percent = 100;
        else if (total !== null && Number.isFinite(total)) percent = total > 0 ? Math.round(loaded / total * 100) : 100;
        else if (Number(state.totalPages) > 0) percent = Math.round((Number(state.page) || 0) / Number(state.totalPages) * 100);

        root.style.display = 'block';
        if (typeof root.setAttribute === 'function') root.setAttribute('aria-busy', state.stage === 'complete' || state.stage === 'error' ? 'false' : 'true');
        if (title) title.textContent = state.title || (state.stage === 'error' ? 'Consulta interrumpida' : state.stage === 'complete' ? 'Consulta terminada' : 'Consultando ventas del día');
        if (detail) {
            if (state.message) detail.textContent = state.message;
            else detail.textContent = `${formatCount(loaded)} ventas cargadas${total !== null ? ` de ${formatCount(total)}` : ''}${state.page ? ` · página ${state.page}${state.totalPages ? ` de ${state.totalPages}` : ''}` : ''}${state.pageSize ? ` · ${state.pageSize} por página` : ''}`;
        }
        if (bar) {
            bar.className = `audit-progress-bar${percent === null ? ' is-indeterminate' : ''}${state.stage === 'error' ? ' is-error' : ''}`;
            bar.style.width = percent === null ? '38%' : `${percent}%`;
        }
        if (track && typeof track.setAttribute === 'function' && percent !== null) track.setAttribute('aria-valuenow', String(percent));
        if (pct) pct.textContent = percent === null ? 'En curso' : `${percent}%`;
    }

    async function querySelectedDay() {
        if (isLoading) return;
        if (!canAccessAudit()) {
            showAuditError('Este informe está disponible solo para administrador o Comercial con el permiso asignado.');
            return;
        }
        const dateInput = document.getElementById(DATE_ID);
        const button = document.getElementById(BUTTON_ID);
        if (!dateInput || !button) return;
        const dateValue = dateInput.value;
        try {
            parseDateValue(dateValue);
        } catch (error) {
            showAuditError(error.message);
            return;
        }

        isLoading = true;
        const previousButtonText = button.innerHTML;
        button.disabled = true;
        dateInput.disabled = true;
        const errorBox = document.getElementById('auditRegistroError');
        if (errorBox) errorBox.style.display = 'none';
        const results = document.getElementById(RESULTS_ID);
        if (results) { results.style.display = 'none'; results.innerHTML = ''; }
        setProgress({ loaded: 0, total: null, page: 0, pageSize: PAGE_SIZE });

        try {
            button.innerHTML = 'Analizando… <span class="loading-spinner"></span>';
            const result = await fetchDaySales(dateValue, progress => {
                setProgress(progress);
                const partialAnalysis = countSummary(progress.sales, dateValue);
                renderResults(partialAnalysis, dateValue, true, progress.loaded, progress.total);
            });
            const analysis = countSummary(result.sales, dateValue);
            renderResults(analysis, dateValue, false, result.sales.length, result.total);
            setProgress({ stage: 'complete', loaded: result.sales.length, total: result.sales.length, message: `Día procesado: ${formatCount(result.sales.length)} ventas recibidas, ${formatCount(analysis.flaggedCount)} señales de cierre para revisar.` });
        } catch (error) {
            setProgress({ stage: 'error', loaded: 0, total: null, message: `${error && error.message ? error.message : 'No se pudo completar la consulta.'} Si ya llegaron páginas, el análisis parcial queda visible.` });
            showAuditError(error && error.message ? error.message : 'No se pudo completar la consulta.');
        } finally {
            button.innerHTML = previousButtonText;
            button.disabled = false;
            dateInput.disabled = false;
            isLoading = false;
        }
    }

    function showAuditError(message) {
        const errorBox = document.getElementById('auditRegistroError');
        if (errorBox) {
            errorBox.textContent = message;
            errorBox.style.display = 'block';
        }
    }

    function initAuditoriaRegistroVentas() {
        if (!canAccessAudit()) return;
        const dateInput = document.getElementById(DATE_ID);
        const button = document.getElementById(BUTTON_ID);
        if (!dateInput || !button) return;
        const today = new Date();
        dateInput.max = localDateString(today);
        if (!dateInput.value) {
            const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            yesterday.setDate(yesterday.getDate() - 1);
            dateInput.value = localDateString(yesterday);
        }
        if (!button.hasAttribute('data-audit-listener')) {
            button.setAttribute('data-audit-listener', 'true');
            button.addEventListener('click', querySelectedDay);
        }
        if (!dateInput.hasAttribute('data-audit-listener')) {
            dateInput.setAttribute('data-audit-listener', 'true');
            dateInput.addEventListener('change', () => {
                const results = document.getElementById(RESULTS_ID);
                const progress = document.getElementById(PROGRESS_ID);
                const error = document.getElementById('auditRegistroError');
                if (results) { results.style.display = 'none'; results.innerHTML = ''; }
                if (progress) progress.style.display = 'none';
                if (error) error.style.display = 'none';
            });
        }
    }

    window.initAuditoriaRegistroVentas = initAuditoriaRegistroVentas;
    window.queryAuditoriaRegistroVentas = querySelectedDay;
})();
