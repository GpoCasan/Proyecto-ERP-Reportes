// ==================== MÓDULO: TRANSFERENCIAS Y VENTAS ====================

// IDs fijos para origen
const ORIGEN_SUCURSAL_ID = 1;     // Almacén General
const ORIGEN_ALMACEN_ID = 2;      // Accesorios Matriz

// ==================== CARGAR SUCURSALES ====================
async function loadBranches() {
    const branchDestinySelect = document.getElementById('branchDestinySelect');
    
    if (!branchDestinySelect) return;
    
    // Deshabilitar y fijar el select de origen con el valor por defecto
    const branchOriginSelect = document.getElementById('branchOriginSelect');
    if (branchOriginSelect) {
        branchOriginSelect.innerHTML = `<option value="${ORIGEN_SUCURSAL_ID}" selected>Almacén General</option>`;
        branchOriginSelect.disabled = true;
    }
    
    branchDestinySelect.innerHTML = '<option value="">Cargando sucursales...</option>';
    branchDestinySelect.disabled = true;
    
    try {
        const url = `${CONFIG.API_BRANCHES}?page=1&per_page=100&totalPages=0`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        let branches = [];
        if (data.data && Array.isArray(data.data)) {
            branches = data.data;
        } else if (Array.isArray(data)) {
            branches = data;
        } else if (data.branches && Array.isArray(data.branches)) {
            branches = data.branches;
        } else {
            console.warn('Estructura de sucursales no reconocida:', data);
            branchDestinySelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
            branchDestinySelect.disabled = false;
            return;
        }
        
        if (branches.length === 0) {
            branchDestinySelect.innerHTML = '<option value="">No hay sucursales disponibles</option>';
            branchDestinySelect.disabled = false;
            return;
        }
        
        branchDestinySelect.innerHTML = '<option value="">Seleccionar sucursal destino</option>';
        
        branches.forEach(branch => {
            const optionDestiny = document.createElement('option');
            optionDestiny.value = branch.id;
            optionDestiny.textContent = branch.name;
            branchDestinySelect.appendChild(optionDestiny);
        });
        
        branchDestinySelect.disabled = false;
        
        // Cargar almacén origen fijo
        await loadFixedWarehouse();
        
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        branchDestinySelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
        branchDestinySelect.disabled = false;
        showError('transferencias', `Error al cargar sucursales: ${error.message}`);
    }
}

// ==================== CARGAR ALMACÉN ORIGEN FIJO ====================
async function loadFixedWarehouse() {
    const warehouseOriginSelect = document.getElementById('warehouseOriginSelect');
    if (!warehouseOriginSelect) return;
    
    warehouseOriginSelect.innerHTML = `<option value="${ORIGEN_ALMACEN_ID}" selected>Accesorios Matriz</option>`;
    warehouseOriginSelect.disabled = true;
}

// ==================== CARGAR ALMACENES POR SUCURSAL DESTINO ====================
async function loadWarehousesByBranch(branchId, targetSelectId) {
    const targetSelect = document.getElementById(targetSelectId);
    if (!targetSelect) return;
    
    targetSelect.innerHTML = '<option value="">Cargando almacenes...</option>';
    targetSelect.disabled = true;
    
    try {
        const url = `${CONFIG.API_WAREHOUSES}?page=1&per_page=100&totalPages=0`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        let allWarehouses = [];
        if (data.data && Array.isArray(data.data)) {
            allWarehouses = data.data;
        } else if (Array.isArray(data)) {
            allWarehouses = data;
        } else if (data.warehouses && Array.isArray(data.warehouses)) {
            allWarehouses = data.warehouses;
        } else {
            console.warn('Estructura de almacenes no reconocida:', data);
            targetSelect.innerHTML = '<option value="">Error al cargar almacenes</option>';
            targetSelect.disabled = false;
            return;
        }
        
        const filteredWarehouses = allWarehouses.filter(warehouse => warehouse.branch_id == branchId);
        
        if (filteredWarehouses.length === 0) {
            targetSelect.innerHTML = '<option value="">No hay almacenes para esta sucursal</option>';
            targetSelect.disabled = false;
            return;
        }
        
        targetSelect.innerHTML = '<option value="">Seleccionar almacén destino</option>';
        filteredWarehouses.forEach(warehouse => {
            const option = document.createElement('option');
            option.value = warehouse.id;
            option.textContent = warehouse.name;
            targetSelect.appendChild(option);
        });
        targetSelect.disabled = false;
        
    } catch (error) {
        console.error('Error cargando almacenes:', error);
        targetSelect.innerHTML = '<option value="">Error al cargar almacenes</option>';
        targetSelect.disabled = false;
        showError('transferencias', `Error al cargar almacenes: ${error.message}`);
    }
}

// ==================== CARGAR PRODUCTOS ====================
async function loadProducts() {
    const productSelect = document.getElementById('productSelect');
    if (!productSelect) return;
    
    productSelect.innerHTML = '<option value="">Cargando productos...</option>';
    productSelect.disabled = true;
    
    try {
        let allProducts = [];
        let currentPage = 1;
        let lastPage = 1;
        
        do {
            const url = `${CONFIG.API_PRODUCTS}?page=${currentPage}&per_page=100&excludes_tae=true&classification_ids[]=2`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const products = data.data || [];
            allProducts.push(...products);
            
            lastPage = data.last_page || data.meta?.last_page || currentPage;
            currentPage++;
            
        } while (currentPage <= lastPage);
        
        productSelect.innerHTML = '<option value="">Todos los productos</option>';
        
        if (allProducts.length === 0) {
            productSelect.innerHTML = '<option value="">No hay productos disponibles</option>';
            productSelect.disabled = false;
            return;
        }
        
        allProducts.sort((a, b) => a.name.localeCompare(b.name));
        
        allProducts.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.name}`;
            productSelect.appendChild(option);
        });
        
        productSelect.disabled = false;
        
    } catch (error) {
        console.error('Error cargando productos:', error);
        productSelect.innerHTML = '<option value="">Error al cargar productos</option>';
        productSelect.disabled = false;
        showError('transferencias', `Error al cargar productos: ${error.message}`);
    }
}

// ==================== CONSULTAR VENTAS ====================
async function searchSales(branchDestinyId, productId, startDate) {
    try {
        // Fecha fin = hoy (fecha actual)
        const endDate = new Date();
        const startDateObj = new Date(startDate);
        
        const formatDateForAPI = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };
        
        const startDateFormatted = formatDateForAPI(startDateObj);
        const endDateFormatted = formatDateForAPI(endDate);
        
        let url = `${CONFIG.API_SALES_ENDPOINT}?page=1&per_page=100&total=0`;
        url += `&start_date=${encodeURIComponent(startDateFormatted)}`;
        url += `&end_date=${encodeURIComponent(endDateFormatted)}`;
        
        if (branchDestinyId && branchDestinyId !== '') {
            url += `&branch_ids[]=${branchDestinyId}`;
        }
        
        if (productId && productId !== '') {
            url += `&product_ids[]=${productId}`;
        }
        
        console.log('Consultando ventas URL:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            responseData = { error: 'La respuesta no es un JSON válido', rawText: await response.text() };
        }
        
        return responseData;
        
    } catch (error) {
        console.error('Error en consulta de ventas:', error);
        return { error: error.message };
    }
}

// ==================== RENDERIZAR TABLA DE VENTAS ====================
function renderSalesTable(salesData) {
    const tbody = document.getElementById('salesTableBody');
    
    if (!salesData || salesData.error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px;">❌ Error al cargar ventas: ${salesData?.error || 'No se pudieron obtener los datos'}</div>`;
        return;
    }
    
    let sales = [];
    let totalVentas = 0;
    
    if (salesData.data && Array.isArray(salesData.data)) {
        sales = salesData.data;
        totalVentas = salesData.total || sales.length;
    } else if (salesData.sales && Array.isArray(salesData.sales)) {
        sales = salesData.sales;
        totalVentas = salesData.total || sales.length;
    } else if (Array.isArray(salesData)) {
        sales = salesData;
        totalVentas = sales.length;
    } else {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">
            <strong>⚠️ Estructura de datos no reconocida</strong><br>
            Revisa la consola para analizar la respuesta
           </div>`;
        return;
    }
    
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">⚠️ No se encontraron ventas para los filtros seleccionados</div><tr>';
        return;
    }
    
    let html = '';
    sales.forEach((sale, index) => {
        const saleId = sale.id || sale.sale_id || index + 1;
        const fecha = sale.sale_date || sale.created_at || sale.date || 'No disponible';
        const fechaFormateada = fecha !== 'No disponible' ? formatDateOnly(fecha) : fecha;
        
        let productName = 'Producto no especificado';
        let quantity = 0;
        let unitPrice = 0;
        let total = 0;
        
        if (sale.details && Array.isArray(sale.details) && sale.details.length > 0) {
            productName = sale.details.map(d => d.product?.name || `ID: ${d.product_id}`).join(', ');
            quantity = sale.details.reduce((sum, d) => sum + (d.quantity || 0), 0);
            unitPrice = sale.details[0]?.unit_price || sale.details[0]?.price || 0;
            total = sale.details.reduce((sum, d) => sum + (d.total_amount || d.total || 0), 0);
        } else {
            productName = sale.product_name || sale.product?.name || `Producto ID: ${sale.product_id}`;
            quantity = sale.quantity || sale.total_quantity || sale.qty || 0;
            unitPrice = sale.unit_price || sale.price || sale.unitPrice || 0;
            total = sale.total || sale.total_amount || (quantity * unitPrice) || 0;
        }
        
        const seller = sale.user?.name || sale.seller_name || sale.vendor || sale.created_by?.name || 'No disponible';
        
        html += `
            <tr>
                <td><button class="sale-receipt-btn" data-sale-id="${saleId}">📄 #${saleId}</button></div>
                <td>${fechaFormateada}</div>
                <td>${escapeHtml(productName)}</div>
                <td style="text-align: center;">${quantity}</div>
                <td style="text-align: right;">$${parseFloat(unitPrice).toFixed(2)}</div>
                <td style="text-align: right;"><strong>$${parseFloat(total).toFixed(2)}</strong></div>
                <td>${escapeHtml(seller)}</div>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    document.querySelectorAll('.sale-receipt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const saleId = btn.getAttribute('data-sale-id');
            if (saleId) {
                window.open(`https://sales.gcasan.com/api/sales/${saleId}/receipt`, '_blank');
            }
        });
    });
}

// ==================== EVENTOS DE SUCURSALES ====================
function onBranchOriginChange() {
    // Origen fijo, no hacer nada
    console.log('Sucursal origen es fija: Almacén General');
}

function onBranchDestinyChange() {
    const branchDestinySelect = document.getElementById('branchDestinySelect');
    const branchId = branchDestinySelect.value;
    
    if (branchId && branchId !== '') {
        loadWarehousesByBranch(branchId, 'warehouseDestinySelect');
    } else {
        const warehouseDestinySelect = document.getElementById('warehouseDestinySelect');
        warehouseDestinySelect.innerHTML = '<option value="">Primero seleccione una sucursal destino</option>';
        warehouseDestinySelect.disabled = true;
    }
}

// ==================== CONSULTA PRINCIPAL (SIN INVENTARIO) ====================
async function searchTransfer() {
    const startDate = document.getElementById('startDateTransfer').value;
    // La fecha final es siempre hoy
    const endDate = new Date().toISOString().split('T')[0];
    
    // Usar IDs fijos para origen
    const branchOriginId = ORIGEN_SUCURSAL_ID;
    const branchDestinyId = document.getElementById('branchDestinySelect').value;
    const warehouseOriginId = ORIGEN_ALMACEN_ID;
    const warehouseDestinyId = document.getElementById('warehouseDestinySelect').value;
    const productId = document.getElementById('productSelect').value;
    
    if (!startDate) {
        showError('transferencias', 'Por favor, selecciona una fecha de inicio');
        return;
    }
    
    if (!branchDestinyId) {
        showError('transferencias', 'Por favor, selecciona una sucursal destino');
        return;
    }
    
    if (!warehouseDestinyId) {
        showError('transferencias', 'Por favor, selecciona un almacén destino');
        return;
    }
    
    const btn = document.getElementById('searchTransferBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Consultando Transferencias y Ventas... <span class="loading-spinner"></span>';
    btn.disabled = true;
    
    document.getElementById('transferenciasErrorAlert').style.display = 'none';
    document.getElementById('transferenciasInfoAlert').style.display = 'none';
    
    // Ocultar el contenedor de inventario
    const inventoryContainer = document.getElementById('inventoryContainer');
    if (inventoryContainer) {
        inventoryContainer.style.display = 'none';
    }
    
    // Mostrar información de fechas
    const fechaFinTexto = formatDate(endDate);
    showInfo('transferencias', `📅 Consultando desde ${formatDate(startDate)} hasta hoy (${fechaFinTexto})`, false);
    setTimeout(() => {
        document.getElementById('transferenciasInfoAlert').style.display = 'none';
    }, 3000);
    
    try {
        const formatDateForAPI = (dateStr) => {
            const date = new Date(dateStr);
            date.setHours(6, 0, 0, 0);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day}+${hours}:${minutes}:${seconds}`;
        };
        
        const startDateFormatted = formatDateForAPI(startDate);
        const endDateFormatted = formatDateForAPI(endDate);
        
        let urlOriginToDestiny = `${CONFIG.API_TRANSFERS}?page=1&per_page=100&total=0`;
        urlOriginToDestiny += `&start_date=${encodeURIComponent(startDateFormatted)}`;
        urlOriginToDestiny += `&end_date=${encodeURIComponent(endDateFormatted)}`;
        urlOriginToDestiny += `&origin_warehouse_id=${warehouseOriginId}`;
        urlOriginToDestiny += `&target_warehouse_id=${warehouseDestinyId}`;
        urlOriginToDestiny += `&dates[]=${encodeURIComponent(startDateFormatted)}`;
        urlOriginToDestiny += `&dates[]=${encodeURIComponent(endDateFormatted)}`;
        
        let urlDestinyToOrigin = `${CONFIG.API_TRANSFERS}?page=1&per_page=100&total=0`;
        urlDestinyToOrigin += `&start_date=${encodeURIComponent(startDateFormatted)}`;
        urlDestinyToOrigin += `&end_date=${encodeURIComponent(endDateFormatted)}`;
        urlDestinyToOrigin += `&origin_warehouse_id=${warehouseDestinyId}`;
        urlDestinyToOrigin += `&target_warehouse_id=${warehouseOriginId}`;
        urlDestinyToOrigin += `&dates[]=${encodeURIComponent(startDateFormatted)}`;
        urlDestinyToOrigin += `&dates[]=${encodeURIComponent(endDateFormatted)}`;
        
        // Solo consultamos transferencias y ventas (sin inventario)
        const salesPromise = searchSales(branchDestinyId, productId, startDate);
        
        const [responseOriginToDestiny, responseDestinyToOrigin, salesData] = await Promise.all([
            fetch(urlOriginToDestiny, { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } }),
            fetch(urlDestinyToOrigin, { headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` } }),
            salesPromise
        ]);
        
        let allTransfers = [];
        
        if (!responseOriginToDestiny.ok) {
            showError('transferencias', `Error en consulta Origen→Destino: ${responseOriginToDestiny.status}`);
        } else {
            let dataOD = await responseOriginToDestiny.json();
            const transfersOD = dataOD.data || [];
            allTransfers.push(...transfersOD);
        }
        
        if (!responseDestinyToOrigin.ok) {
            showError('transferencias', `Error en consulta Destino→Origen: ${responseDestinyToOrigin.status}`);
        } else {
            let dataDO = await responseDestinyToOrigin.json();
            const transfersDO = dataDO.data || [];
            allTransfers.push(...transfersDO);
        }
        
        const transfersWithDetails = [];
        
        for (const transfer of allTransfers) {
            try {
                const detailUrl = `${CONFIG.API_TRANSFERS}/${transfer.id}`;
                const detailResponse = await fetch(detailUrl, {
                    headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
                });
                
                if (detailResponse.ok) {
                    const detailData = await detailResponse.json();
                    const details = detailData.data?.details || [];
                    
                    let productQuantity = 0;
                    let hasProduct = false;
                    
                    if (productId && productId !== '') {
                        const productDetail = details.find(detail => 
                            detail.product_id == productId || 
                            detail.product?.id == productId
                        );
                        if (productDetail) {
                            productQuantity = productDetail.quantity || 0;
                            hasProduct = true;
                        }
                    } else {
                        productQuantity = details.reduce((sum, detail) => sum + (detail.quantity || 0), 0);
                        hasProduct = true;
                    }
                    
                    if (hasProduct) {
                        transfersWithDetails.push({
                            ...transfer,
                            productQuantity: productQuantity,
                            detalles: details
                        });
                    }
                } else {
                    transfersWithDetails.push({
                        ...transfer,
                        productQuantity: 0
                    });
                }
            } catch (e) {
                console.warn(`Error obteniendo detalle de transferencia ${transfer.id}:`, e);
                transfersWithDetails.push({
                    ...transfer,
                    productQuantity: 0
                });
            }
        }
        
        transfersWithDetails.sort((a, b) => {
            return new Date(b.dispatched_at) - new Date(a.dispatched_at);
        });
        
        const tbody = document.getElementById('transferTableBody');
        
        if (transfersWithDetails.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px;">📦 No se encontraron transferencias para el período seleccionado</div></tr>`;
        } else {
            let html = '';
            for (const transfer of transfersWithDetails) {
                const fecha = transfer.dispatched_at ? formatDateOnly(transfer.dispatched_at) : 'No disponible';
                const origenNombre = transfer.origin_warehouse?.name || `ID: ${transfer.origin_warehouse_id}`;
                const destinoNombre = transfer.target_warehouse?.name || `ID: ${transfer.target_warehouse_id}`;
                
                let asesorNombre = 'No disponible';
                if (transfer.received_by?.name) {
                    asesorNombre = transfer.received_by.name;
                } else if (transfer.creator?.name) {
                    asesorNombre = transfer.creator.name;
                }
                
                let statusClass = 'status-badge';
                let statusText = transfer.status || 'Desconocido';
                switch (transfer.status?.toLowerCase()) {
                    case 'finalizado':
                        statusClass += ' status-finalizado';
                        break;
                    case 'pendiente':
                        statusClass += ' status-pendiente';
                        break;
                    case 'cancelado':
                        statusClass += ' status-cancelado';
                        break;
                    case 'en proceso':
                        statusClass += ' status-en-proceso';
                        break;
                    default:
                        statusClass += ' status-pendiente';
                }
                
                html += `
                    <tr>
                        <td><a href="#" class="transfer-link" data-id="${transfer.id}">#${transfer.id}</a></div>
                        <td>${fecha}</div>
                        <td>${escapeHtml(origenNombre)}</div>
                        <td>${escapeHtml(destinoNombre)}</div>
                        <td>${escapeHtml(asesorNombre)}</div>
                        <td><strong>${transfer.productQuantity}</strong></div>
                        <td><span class="${statusClass}">${statusText}</span></div>
                    </tr>
                `;
            }
            tbody.innerHTML = html;
            
            document.querySelectorAll('.transfer-link').forEach(link => {
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const transferId = link.getAttribute('data-id');
                    await showTransferDetails(transferId);
                });
            });
        }
        
        renderSalesTable(salesData);
        
        // Mostrar pestaña de transferencias
        const transfersTab = document.getElementById('transfersTab');
        const salesTab = document.getElementById('salesTab');
        const transfersButton = document.querySelector('.transfer-tab-button[data-tab="transfers"]');
        const salesButton = document.querySelector('.transfer-tab-button[data-tab="sales"]');
        
        if (transfersTab) {
            transfersTab.style.display = 'block';
            transfersTab.classList.add('active-tab');
        }
        if (salesTab) {
            salesTab.style.display = 'none';
            salesTab.classList.remove('active-tab');
        }
        if (transfersButton) transfersButton.classList.add('active');
        if (salesButton) salesButton.classList.remove('active');
        
    } catch (error) {
        console.error('Error en consulta:', error);
        showError('transferencias', `Error de red o de conexión: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== MODAL DETALLES TRANSFERENCIA ====================
async function showTransferDetails(transferId) {
    let modal = document.getElementById('transferDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'transferDetailModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1000px;">
                <div class="modal-header">
                    <h3>📋 Detalle de Transferencia #${transferId}</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body" id="transferDetailBody" style="max-height: 70vh; overflow-y: auto;">
                    <div class="loader-modal">
                        <div class="spinner-modal"></div>
                        <p>Cargando detalles de la transferencia...</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="closeModalBtn" style="padding: 6px 16px;">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        if (document.getElementById('closeModalBtn')) {
            document.getElementById('closeModalBtn').onclick = () => modal.style.display = 'none';
        }
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    } else {
        modal.querySelector('.modal-header h3').innerHTML = `📋 Detalle de Transferencia #${transferId}`;
        document.getElementById('transferDetailBody').innerHTML = `
            <div class="loader-modal">
                <div class="spinner-modal"></div>
                <p>Cargando detalles de la transferencia...</p>
            </div>
        `;
    }
    
    modal.style.display = 'block';
    
    try {
        const url = `${CONFIG.API_TRANSFERS}/${transferId}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        const transfer = result.data;
        
        const origenNombre = transfer.origin_warehouse?.branch?.name || transfer.origin_warehouse?.name || 'N/A';
        const destinoNombre = transfer.target_warehouse?.branch?.name || transfer.target_warehouse?.name || 'N/A';
        const status = transfer.status || 'Desconocido';
        
        let statusClass = 'status-badge';
        switch (status?.toLowerCase()) {
            case 'finalizado':
                statusClass += ' status-finalizado';
                break;
            case 'pendiente':
                statusClass += ' status-pendiente';
                break;
            case 'cancelado':
                statusClass += ' status-cancelado';
                break;
            default:
                statusClass += ' status-pendiente';
        }
        
        const details = transfer.details || [];
        let productosHtml = '';
        
        if (details.length === 0) {
            productosHtml = '<tr><td colspan="2" style="text-align: center; padding: 40px;">⚠️ No hay productos en esta transferencia</div></tr>';
        } else {
            details.forEach((detail, index) => {
                const productName = detail.product?.name || `Producto ID: ${detail.product_id}`;
                const quantity = detail.quantity || 0;
                
                productosHtml += `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${index + 1}</div>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(productName)}</div>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${quantity}</div>
                    </tr>
                `;
            });
        }
        
        const totalProductos = details.length;
        const totalUnidades = details.reduce((sum, detail) => sum + (detail.quantity || 0), 0);
        
        const detailHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 25px;">
                <div class="analysis-card-info" style="background: linear-gradient(135deg, #1e40af10 0%, #3b82f610 100%);">
                    <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 5px;">🏭 Almacén Origen</div>
                    <div style="font-size: 1rem; font-weight: bold; color: #1e40af;">${escapeHtml(origenNombre)}</div>
                    ${transfer.origin_warehouse?.name ? `<div style="font-size: 0.75rem; color: #64748b; margin-top: 3px;">${escapeHtml(transfer.origin_warehouse.name)}</div>` : ''}
                </div>
                <div class="analysis-card-info" style="background: linear-gradient(135deg, #1e40af10 0%, #3b82f610 100%);">
                    <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 5px;">🏭 Almacén Destino</div>
                    <div style="font-size: 1rem; font-weight: bold; color: #1e40af;">${escapeHtml(destinoNombre)}</div>
                    ${transfer.target_warehouse?.name ? `<div style="font-size: 0.75rem; color: #64748b; margin-top: 3px;">${escapeHtml(transfer.target_warehouse.name)}</div>` : ''}
                </div>
                <div class="analysis-card-info" style="background: linear-gradient(135deg, #1e40af10 0%, #3b82f610 100%);">
                    <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 5px;">📊 Estado</div>
                    <div><span class="${statusClass}" style="font-size: 0.9rem; padding: 6px 14px;">${status}</span></div>
                </div>
            </div>
            
            <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <div class="stat-card" style="flex: 1; padding: 12px;">
                    <div class="stat-number" style="font-size: 1.5rem;">${totalProductos}</div>
                    <div class="stat-label">Tipos de Productos</div>
                </div>
                <div class="stat-card" style="flex: 1; padding: 12px;">
                    <div class="stat-number" style="font-size: 1.5rem;">${totalUnidades}</div>
                    <div class="stat-label">Total de Unidades</div>
                </div>
            </div>
            
            <div style="margin-top: 20px;">
                <h4 style="color: #1e40af; margin-bottom: 12px; border-left: 4px solid #f97316; padding-left: 10px;">📦 Productos Transferidos</h4>
                <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                    <table class="transfer-details-table" style="width: 100%; border-collapse: collapse;">
                        <thead style="position: sticky; top: 0; background: #f0f9ff;">
                            <tr>
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">#</th>
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Descripción</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #e2e8f0;">Cantidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productosHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        document.getElementById('transferDetailBody').innerHTML = detailHtml;
        
        const closeBtn = document.getElementById('closeModalBtn');
        if (closeBtn) {
            closeBtn.onclick = () => modal.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error en consulta de transferencia:', error);
        document.getElementById('transferDetailBody').innerHTML = `
            <div class="alert alert-error">
                <strong>❌ Error al cargar los detalles:</strong><br>
                ${error.message}<br><br>
                <strong>Posibles causas:</strong><br>
                • El servidor no está respondiendo<br>
                • La transferencia no existe<br>
                • El token de autenticación ha expirado
            </div>
        `;
    }
}

// ==================== INICIALIZAR PESTAÑAS ====================
function initTransferenciasTabs() {
    const tabButtons = document.querySelectorAll('.transfer-tab-button');
    if (tabButtons.length === 0) return;
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            const transfersTab = document.getElementById('transfersTab');
            const salesTab = document.getElementById('salesTab');
            
            if (transfersTab) {
                transfersTab.classList.remove('active-tab');
                transfersTab.style.display = 'none';
            }
            if (salesTab) {
                salesTab.classList.remove('active-tab');
                salesTab.style.display = 'none';
            }
            
            button.classList.add('active');
            const activeContent = document.getElementById(`${tabId}Tab`);
            if (activeContent) {
                activeContent.classList.add('active-tab');
                activeContent.style.display = 'block';
            }
        });
    });
}