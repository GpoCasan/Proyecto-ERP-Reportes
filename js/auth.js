// ==================== SISTEMA DE AUTENTICACIÓN ====================

// Configuración de usuarios (hardcodeada temporalmente)
const USERS = {
    "admin": {
        password: "admin2026",
        role: "admin",
        name: "Administrador",
        modules: ["contado", "credito_nuevo", "accesorios", "inventario", "simexpress", "existencias", "transferencias", "transferencias_pendientes", "tae", "ventasTotales", "servicios", "ingresos", "credito", "compras", "facturas", "analisis_margen","tae_apps","inventarioAccesorios"],
        showTaeBalance: true
    },
    "comercial": {
        password: "comercial2026",
        role: "comercial",
        name: "Comercial",
        modules: ["contado", "credito_nuevo", "accesorios", "inventario", "simexpress", "existencias","inventarioAccesorios"],
        showTaeBalance: false
    },
    "operaciones": {
        password: "operaciones2026",
        role: "operaciones",
        name: "Operaciones",
        modules: ["inventario", "existencias", "transferencias", "compras","inventarioAccesorios"],
        showTaeBalance: false
    },
    "ingresos": {
        password: "ingresos2026",
        role: "ingresos",
        name: "Ingresos",
        modules: ["ingresos"],
        showTaeBalance: false
    }
};

let currentUser = null;
let alertaTransferenciasMostrada = false;

// Función para mostrar/ocultar módulos según permisos
function filterModulesByPermissions(modulesAllowed) {
    // Ocultar TODOS los módulos primero (usando clase CSS, no style.display)
    document.querySelectorAll('.module').forEach(module => {
        module.classList.remove('active-module');
        // Guardar los módulos permitidos como atributo para referencia
        module.style.display = '';
    });
    
    // Ocultar todas las tarjetas de navegación
    document.querySelectorAll('.nav-card').forEach(card => {
        card.style.display = 'none';
    });
    
    // Mostrar solo las tarjetas de los módulos permitidos
    modulesAllowed.forEach(moduleKey => {
        const navCard = document.querySelector(`.nav-card[data-module="${moduleKey}"]`);
        if (navCard) {
            navCard.style.display = 'block';
        }
    });
    
    // Si hay módulos permitidos, activar el primero
    if (modulesAllowed.length > 0) {
        const firstModule = modulesAllowed[0];
        if (typeof switchModule === 'function') {
            switchModule(firstModule);
        }
    }
}

// Función para mostrar/ocultar el SALDO TAE según permisos del usuario
function updateTaeBalanceVisibility(user) {
    const saldoTaeContainer = document.getElementById('saldoTaeValue');
    const saldoTaeLabel = document.querySelector('.saldo-tae-label');
    const saldoTaeIcon = document.querySelector('.saldo-tae-icon');
    
    if (user.showTaeBalance) {
        // Mostrar el TAE
        if (saldoTaeContainer) {
            saldoTaeContainer.style.display = 'block';
            // Cargar el saldo
            if (typeof loadTaeBalance === 'function') {
                loadTaeBalance();
            }
        }
        if (saldoTaeLabel) saldoTaeLabel.style.display = 'block';
        if (saldoTaeIcon) saldoTaeIcon.style.display = 'flex';
    } else {
        // Ocultar solo el contenido del TAE, mantener la tarjeta para el logo
        if (saldoTaeContainer) {
            saldoTaeContainer.style.display = 'none';
        }
        if (saldoTaeLabel) saldoTaeLabel.style.display = 'none';
        if (saldoTaeIcon) saldoTaeIcon.style.display = 'none';
    }
}

// Función para actualizar la interfaz con el usuario logueado
function updateUIForUser(user) {
    // Mostrar barra de usuario
    const userBar = document.getElementById('userInfoBar');
    if (userBar) {
        userBar.style.display = 'flex';
    }
    
    // Actualizar información del usuario
    document.getElementById('userNameDisplay').textContent = user.name;
    document.getElementById('userRoleDisplay').textContent = user.role === 'admin' ? 'Administrador' : 
                                                       (user.role === 'comercial' ? 'Comercial' :
                                                       (user.role === 'operaciones' ? 'Operaciones' : 'Ingresos'));
    document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
    
    // Filtrar módulos según permisos
    filterModulesByPermissions(user.modules);
    
    // Mostrar/ocultar el SALDO TAE según permisos
    updateTaeBalanceVisibility(user);
    
    
}

// Función para cerrar sesión
function logout() {
    currentUser = null;
    sessionStorage.removeItem('servicel_user');
    alertaTransferenciasMostrada = false;
    
    // Ocultar barra de usuario
    const userBar = document.getElementById('userInfoBar');
    if (userBar) {
        userBar.style.display = 'none';
    }
    
    // Eliminar la alerta de transferencias si existe
    const alertaContainer = document.getElementById('alertaTransferenciasContainer');
    if (alertaContainer) {
        alertaContainer.remove();
    }
    
    // Mostrar todas las tarjetas temporalmente para que el login se vea normal
    document.querySelectorAll('.nav-card').forEach(card => {
        card.style.display = 'block';
    });
    
    // Restaurar la visibilidad del TAE (se ocultará después del login si no tiene permiso)
    const saldoTaeContainer = document.getElementById('saldoTaeValue');
    const saldoTaeLabel = document.querySelector('.saldo-tae-label');
    const saldoTaeIcon = document.querySelector('.saldo-tae-icon');
    if (saldoTaeContainer) saldoTaeContainer.style.display = 'block';
    if (saldoTaeLabel) saldoTaeLabel.style.display = 'block';
    if (saldoTaeIcon) saldoTaeIcon.style.display = 'flex';
    
    // Mostrar login
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) {
        loginOverlay.style.display = 'flex';
    }
    
    // Limpiar campos de login
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.style.display = 'none';
}

// Función para intentar login
function attemptLogin(username, password) {
    const userKey = username.toLowerCase();
    const user = USERS[userKey];
    
    if (user && user.password === password) {
        currentUser = {
            username: userKey,
            role: user.role,
            name: user.name,
            modules: user.modules,
            showTaeBalance: user.showTaeBalance || false
        };
        
        // Guardar en sessionStorage para persistencia
        sessionStorage.setItem('servicel_user', JSON.stringify(currentUser));
        
        // Ocultar login
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            loginOverlay.style.display = 'none';
        }
        
        // Actualizar UI
        updateUIForUser(currentUser);
        
        // Cargar datos iniciales después del login (solo si existen las funciones)
        if (typeof loadBranches === 'function') loadBranches();
        if (typeof loadProducts === 'function') loadProducts();
        if (typeof loadIngresosBranches === 'function') loadIngresosBranches();
        
        return true;
    }
    
    return false;
}

// Verificar sesión existente al cargar la página
function checkExistingSession() {
    const savedUser = sessionStorage.getItem('servicel_user');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            // Verificar que el usuario aún existe en la configuración
            if (USERS[user.username]) {
                currentUser = user;
                
                // Ocultar login
                const loginOverlay = document.getElementById('loginOverlay');
                if (loginOverlay) {
                    loginOverlay.style.display = 'none';
                }
                
                // Actualizar UI
                updateUIForUser(currentUser);
                
                // Cargar datos iniciales
                if (typeof loadBranches === 'function') loadBranches();
                if (typeof loadProducts === 'function') loadProducts();
                if (typeof loadIngresosBranches === 'function') loadIngresosBranches();
                
                return true;
            }
        } catch(e) {
            console.error('Error al restaurar sesión:', e);
        }
    }
    return false;
}

// Inicializar eventos de login
function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const errorEl = document.getElementById('loginError');
            
            if (!username || !password) {
                if (errorEl) {
                    errorEl.textContent = '❌ Por favor, ingresa usuario y contraseña';
                    errorEl.style.display = 'block';
                }
                return;
            }
            
            if (attemptLogin(username, password)) {
                if (errorEl) errorEl.style.display = 'none';
            } else {
                if (errorEl) {
                    errorEl.textContent = '❌ Usuario o contraseña incorrectos';
                    errorEl.style.display = 'block';
                }
            }
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Permitir login con Enter
    const handleEnter = (e) => {
        if (e.key === 'Enter' && loginBtn) {
            loginBtn.click();
        }
    };
    
    if (usernameInput) usernameInput.addEventListener('keypress', handleEnter);
    if (passwordInput) passwordInput.addEventListener('keypress', handleEnter);
    
    // Verificar sesión existente
    const hasSession = checkExistingSession();
    
    // Si no hay sesión, asegurar que el login esté visible
    if (!hasSession) {
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            loginOverlay.style.display = 'flex';
        }
    }
}