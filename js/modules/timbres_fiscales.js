// ==================== MÓDULO: TIMBRES FISCALES ====================
// Archivo: js/modules/timbres_fiscales.js
// Este módulo se encarga de consultar y mostrar los timbres fiscales disponibles
// Solo visible para usuarios con rol 'admin'.

(function() {
    'use strict';

    // ==================== CONSTANTES ====================
    const TIMBRES_ENDPOINT = 'https://sales.gcasan.com/api/nuberp/timbres';
    const TIMBRES_CARD_ID = 'timbresCard';
    const TIMBRES_VALUE_ID = 'timbresDisponibles';
    const ADVERTENCIA_CLASS = 'timbres-advertencia';

    // ==================== FUNCIONES PRINCIPALES ====================

    /**
     * Obtiene el número de timbres fiscales disponibles desde el endpoint.
     * @returns {Promise<number|null>} - Cantidad de timbres o null si hay error.
     */
    async function obtenerTimbresFiscales() {
        try {
            const response = await fetch(TIMBRES_ENDPOINT, {
                headers: {
                    'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}`
                }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Extraer timbres_disponibles de la estructura correcta
            let timbres = data?.data?.timbres_disponibles ?? 
                          data?.timbres_disponibles ?? 
                          0;
            
            timbres = Number(timbres);
            return isNaN(timbres) ? 0 : timbres;
        } catch (error) {
            console.error('[TIMBRES FISCALES] Error al cargar:', error);
            return null;
        }
    }

    /**
     * Formatea un número sin decimales y con separadores de miles.
     * @param {number} numero - Número a formatear.
     * @returns {string} - Número formateado (ej: 9,744).
     */
    function formatearNumero(numero) {
        return numero.toLocaleString('es-MX', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    /**
     * Actualiza la interfaz con el número de timbres.
     * @param {number|null} timbres - Cantidad de timbres disponibles.
     */
    function actualizarInterfazTimbres(timbres) {
        const timbresElement = document.getElementById(TIMBRES_VALUE_ID);
        if (!timbresElement) return;

        // Limpiar advertencia anterior
        const advertenciaExistente = timbresElement.querySelector(`.${ADVERTENCIA_CLASS}`);
        if (advertenciaExistente) {
            advertenciaExistente.remove();
        }

        if (timbres === null) {
            timbresElement.textContent = 'No disponible';
            return;
        }

        // Mostrar el número formateado SIN decimales
        timbresElement.textContent = formatearNumero(timbres);

        // Advertencia si los timbres son bajos (<= 5)
        if (timbres <= 5) {
            const span = document.createElement('span');
            span.className = ADVERTENCIA_CLASS;
            span.textContent = ' ⚠️ ¡Bajo!';
            timbresElement.appendChild(span);
        }
    }

    /**
     * Carga los timbres fiscales y actualiza la interfaz.
     */
    async function cargarTimbresFiscales() {
        const timbres = await obtenerTimbresFiscales();
        actualizarInterfazTimbres(timbres);
    }

    /**
     * Muestra u oculta la tarjeta de timbres según el rol del usuario.
     * @param {Object} user - Objeto del usuario autenticado.
     */
    function mostrarTimbresSegunRol(user) {
        const timbresCard = document.getElementById(TIMBRES_CARD_ID);
        if (!timbresCard) return;

        if (user && user.role === 'admin') {
            timbresCard.style.display = 'flex';
            cargarTimbresFiscales();
        } else {
            timbresCard.style.display = 'none';
        }
    }

    // ==================== FUNCIONES DE INICIALIZACIÓN ====================

    /**
     * Inicializa el módulo inyectando los hooks necesarios en el flujo de autenticación.
     */
    function initTimbresFiscalesModule() {
        console.log('[TIMBRES FISCALES] Inicializando módulo...');

        // 1. Modificar updateUIForUser (definido en auth.js)
        const originalUpdateUI = window.updateUIForUser;
        if (typeof originalUpdateUI === 'function') {
            window.updateUIForUser = function(user) {
                originalUpdateUI(user);
                mostrarTimbresSegunRol(user);
            };
            console.log('[TIMBRES FISCALES] Hook en updateUIForUser OK');
        } else {
            // Si la función no existe, crearla
            window.updateUIForUser = function(user) {
                mostrarTimbresSegunRol(user);
            };
            console.warn('[TIMBRES FISCALES] updateUIForUser no existía, se creó override');
        }

        // 2. Modificar checkExistingSession (definido en auth.js)
        const originalCheckSession = window.checkExistingSession;
        if (typeof originalCheckSession === 'function') {
            window.checkExistingSession = function() {
                const result = originalCheckSession();
                const user = sessionStorage.getItem('servicel_user') 
                    ? JSON.parse(sessionStorage.getItem('servicel_user')) 
                    : null;
                mostrarTimbresSegunRol(user);
                return result;
            };
            console.log('[TIMBRES FISCALES] Hook en checkExistingSession OK');
        }

        // 3. Modificar logout (definido en auth.js)
        const originalLogout = window.logout;
        if (typeof originalLogout === 'function') {
            window.logout = function() {
                originalLogout();
                const timbresCard = document.getElementById(TIMBRES_CARD_ID);
                if (timbresCard) {
                    timbresCard.style.display = 'none';
                }
            };
            console.log('[TIMBRES FISCALES] Hook en logout OK');
        }

        // 4. Evento 'moduleChanged' disparado por app.js
        document.addEventListener('moduleChanged', function() {
            const user = sessionStorage.getItem('servicel_user') 
                ? JSON.parse(sessionStorage.getItem('servicel_user')) 
                : null;
            if (user && user.role === 'admin') {
                const timbresCard = document.getElementById(TIMBRES_CARD_ID);
                if (timbresCard && timbresCard.style.display !== 'flex') {
                    timbresCard.style.display = 'flex';
                    cargarTimbresFiscales();
                }
            }
        });
        console.log('[TIMBRES FISCALES] Event listener moduleChanged OK');

        // 5. Verificar si ya hay sesión activa al cargar el módulo
        const user = sessionStorage.getItem('servicel_user') 
            ? JSON.parse(sessionStorage.getItem('servicel_user')) 
            : null;
        if (user) {
            mostrarTimbresSegunRol(user);
        }

        console.log('[TIMBRES FISCALES] Módulo inicializado correctamente.');
    }

    // ==================== EXPORTAR FUNCIONES GLOBALES ====================
    window.initTimbresFiscalesModule = initTimbresFiscalesModule;
    window.cargarTimbresFiscales = cargarTimbresFiscales;
    window.obtenerTimbresFiscales = obtenerTimbresFiscales;

    // ==================== AUTOINICIALIZACIÓN ====================
    // Si el DOM ya está cargado, inicializar; de lo contrario, esperar.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTimbresFiscalesModule);
    } else {
        // Si el DOM ya está listo, ejecutar inmediatamente (después de que auth.js se haya cargado)
        // Usamos setTimeout para dar prioridad a otros scripts
        setTimeout(initTimbresFiscalesModule, 100);
    }

    console.log('[TIMBRES FISCALES] Módulo cargado correctamente.');
})();