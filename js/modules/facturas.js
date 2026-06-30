// ==================== MÓDULO: PROCESADOR DE FACTURAS (PDF → CSV → EXCEL) ====================

// Variables globales
let csvData = [];
let filteredData = [];
let processedData = [];
let barcodeData = {};
let currentCsvFileName = '';
let originalFileName = '';
let catalogoCompleto = [];
let catalogoCargado = false;
let catalogoSearchTimeout = null;
let hayArchivoCSVCargado = false;

// Variables para PDF Converter
const API_KEY = '02f7a6ae2d25a3da993f28b38d0cd8af';
let conversionId = null;
let pdfFileData = null;

// ==================== LIMPIAR DATOS AL RECARGAR ====================

function limpiarDatosAlRecargar() {
    const keysToRemove = [
        'facturasProcessedData',
        'facturasCsvFile', 
        'facturasBarcodeData',
        'facturasOriginalFileName',
        'facturasShowTable2'
    ];
    
    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
    });
    
    sessionStorage.removeItem('facturasData');
    console.log('🧹 Datos de facturas limpiados al recargar');
}

limpiarDatosAlRecargar();

window.addEventListener('beforeunload', function() {
    limpiarDatosAlRecargar();
});

// ==================== INICIALIZACIÓN ====================

function initFacturasModule() {
    console.log('🔄 Inicializando módulo de facturas...');
    loadSavedData();
    setupFacturasEventListeners();
    cargarCatalogoCompleto();
}

// ==================== FUNCIONES DE CARGA DE DATOS ====================

function loadSavedData() {
    const savedData = localStorage.getItem('facturasProcessedData');
    if (savedData) {
        processedData = JSON.parse(savedData);
        displayData(processedData);
        document.getElementById('facturasProcessedSection').style.display = 'block';
        document.getElementById('facturasCsvTableContainer').classList.add('hidden');
        document.getElementById('facturasCsvControls').classList.add('hidden');
    }
    
    const savedBarcode = localStorage.getItem('facturasBarcodeData');
    if (savedBarcode) {
        const jsonData = JSON.parse(savedBarcode);
        barcodeData = {};
        jsonData.forEach(item => {
            if (item.name && item.barcode) {
                barcodeData[item.name] = item.barcode;
            }
        });
    }
}

// ==================== CARGA DEL CATÁLOGO DEL ERP ====================

async function cargarCatalogoCompleto() {
    if (catalogoCargado) {
        console.log('📦 Catálogo ya cargado.');
        return;
    }

    console.log('📦 Cargando catálogo del ERP...');
    const infoAlert = document.getElementById('facturasInfoAlert');
    if (infoAlert) {
        infoAlert.innerHTML = '⏳ Cargando catálogo de productos del ERP...';
        infoAlert.style.display = 'block';
    }

    try {
        let allProducts = [];
        let currentPage = 1;
        const perPage = 100;
        let lastPage = 1;

        do {
            const url = `${CONFIG.API_PRODUCTS}?page=${currentPage}&per_page=${perPage}&excludes_tae=true`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${CONFIG.FIXED_TOKEN}` }
            });

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status} al cargar la página ${currentPage}`);
            }

            const data = await response.json();
            const products = data.data || [];
            allProducts = allProducts.concat(products);

            lastPage = data.last_page || data.meta?.last_page || currentPage;
            currentPage++;

            if (infoAlert) {
                infoAlert.innerHTML = `⏳ Cargando catálogo... ${Math.round((currentPage - 1) / lastPage * 100)}% (${allProducts.length} productos)`;
            }

            await new Promise(resolve => setTimeout(resolve, 200));

        } while (currentPage <= lastPage);

        catalogoCompleto = allProducts;
        catalogoCargado = true;
        console.log(`✅ Catálogo cargado: ${catalogoCompleto.length} productos.`);

        if (infoAlert) {
            infoAlert.innerHTML = `✅ Catálogo cargado (${catalogoCompleto.length} productos).`;
            setTimeout(() => { infoAlert.style.display = 'none'; }, 3000);
        }

    } catch (error) {
        console.error('❌ Error cargando catálogo:', error);
        if (infoAlert) {
            infoAlert.innerHTML = `❌ Error cargando catálogo: ${error.message}`;
            infoAlert.style.display = 'block';
            setTimeout(() => { infoAlert.style.display = 'none'; }, 5000);
        }
    }
}

function buscarCodigoEnCatalogo(descripcion) {
    if (!catalogoCargado || catalogoCompleto.length === 0) return null;
    
    let producto = catalogoCompleto.find(p => p.name === descripcion);
    if (producto && producto.barcode) return producto.barcode;
    
    const descLower = descripcion.toLowerCase();
    producto = catalogoCompleto.find(p => 
        p.name && descLower.includes(p.name.toLowerCase()) || 
        p.name && p.name.toLowerCase().includes(descLower)
    );
    if (producto && producto.barcode) return producto.barcode;
    
    return null;
}

// ==================== BUSCADOR EN EL CATÁLOGO ====================

function buscarEnCatalogo(query) {
    if (!query || query.length < 2) return [];
    if (!catalogoCargado || catalogoCompleto.length === 0) return [];
    
    const queryLower = query.toLowerCase().trim();
    const palabras = queryLower.split(' ').filter(p => p.length > 1);
    
    const results = catalogoCompleto.filter(product => {
        if (!product.name) return false;
        const nombreLower = product.name.toLowerCase();
        if (palabras.length > 0) {
            return palabras.every(palabra => nombreLower.includes(palabra));
        }
        return nombreLower.includes(queryLower);
    });
    
    results.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStarts = aName.startsWith(queryLower);
        const bStarts = bName.startsWith(queryLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return aName.localeCompare(bName);
    });
    
    return results.slice(0, 15);
}

function mostrarSugerenciasCatalogo(sugerencias, inputId, containerId, onSelectCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const searchQuery = document.getElementById(inputId)?.value || '';
    
    if (!sugerencias || sugerencias.length === 0) {
        container.innerHTML = `<div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; color: #64748b; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            ❌ No se encontraron productos con "${searchQuery}"
        </div>`;
        return;
    }
    
    const suggestionsHtml = `
        <div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; max-height: 250px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            ${sugerencias.map(prod => {
                const barcode = prod.barcode || 'Sin código';
                return `
                    <div class="catalogo-suggestion-item" data-name="${escapeHtml(prod.name)}" data-barcode="${barcode}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #e2e8f0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <strong>${escapeHtml(prod.name)}</strong>
                                <div style="font-size: 0.65rem; color: #64748b;">Código: ${barcode}</div>
                            </div>
                            <span style="font-size: 0.6rem; background: #059669; color: white; padding: 2px 8px; border-radius: 20px;">${barcode}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.innerHTML = suggestionsHtml;
    
    document.querySelectorAll('.catalogo-suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.dataset.name;
            const barcode = el.dataset.barcode;
            if (onSelectCallback) {
                onSelectCallback(name, barcode);
            }
            container.innerHTML = '';
        });
    });
}

// ==================== CONFIGURACIÓN DE EVENTOS ====================

function setupFacturasEventListeners() {
    console.log('🔧 Configurando event listeners de facturas...');

    const pdfFileInput = document.getElementById('facturasPdfFileInput');
    if (pdfFileInput) {
        pdfFileInput.addEventListener('change', handlePDFFileSelect);
        console.log('✅ Event listener de PDF configurado');
    } else {
        console.error('❌ No se encontró facturasPdfFileInput');
    }

    const pdfUploadArea = document.getElementById('facturasPdfUploadArea');
    if (pdfUploadArea) {
        pdfUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            pdfUploadArea.classList.add('active');
        });
        pdfUploadArea.addEventListener('dragleave', () => {
            pdfUploadArea.classList.remove('active');
        });
        pdfUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            pdfUploadArea.classList.remove('active');
            if (e.dataTransfer.files.length) {
                pdfFileInput.files = e.dataTransfer.files;
                handlePDFFileSelect({ target: pdfFileInput });
            }
        });
    }

    const convertBtn = document.getElementById('facturasConvertBtn');
    if (convertBtn) {
        convertBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🔄 Click en Convertir');
            convertPDFtoCSV();
        });
    }

    const continueToProcessorBtn = document.getElementById('facturasContinueToProcessorBtn');
    if (continueToProcessorBtn) {
        continueToProcessorBtn.addEventListener('click', function() {
            console.log('➡️ Click en Continuar al Procesador CSV');
            switchToCSVProcessorTab();
        });
    }

    document.querySelectorAll('.facturas-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            console.log(`📑 Cambiando a tab: ${tabId}`);
            switchToFacturasTab(tabId);
        });
    });

    const csvFileInput = document.getElementById('facturasCsvFileInput');
    if (csvFileInput) {
        csvFileInput.addEventListener('change', handleFileUpload);
    }

    const csvUploadArea = document.getElementById('facturasCsvUploadArea');
    if (csvUploadArea) {
        csvUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            csvUploadArea.classList.add('active');
        });
        csvUploadArea.addEventListener('dragleave', () => {
            csvUploadArea.classList.remove('active');
        });
        csvUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            csvUploadArea.classList.remove('active');
            if (e.dataTransfer.files.length) {
                csvFileInput.files = e.dataTransfer.files;
                handleFileUpload({ target: csvFileInput });
            }
        });
    }

    const selectAllBtn = document.getElementById('facturasSelectAllButton');
    if (selectAllBtn) { 
        selectAllBtn.addEventListener('click', toggleSelectAll); 
    }
    
    const continueBtn = document.getElementById('facturasContinueButton');
    if (continueBtn) { 
        continueBtn.addEventListener('click', continueToProcessedData); 
    }
    
    const continueBottomBtn = document.getElementById('facturasContinueButtonBottom');
    if (continueBottomBtn) { 
        continueBottomBtn.addEventListener('click', continueToProcessedData); 
    }

    const searchInput = document.getElementById('facturasSearchInput');
    if (searchInput) { 
        searchInput.addEventListener('input', filterData); 
    }

    const searchCatalogBtn = document.getElementById('facturasSearchCatalogBtn');
    if (searchCatalogBtn) {
        searchCatalogBtn.addEventListener('click', buscarCodigosEnCatalogo);
    }

    const checkBarcodesBtn = document.getElementById('facturasCheckBarcodesButton');
    if (checkBarcodesBtn) { 
        checkBarcodesBtn.addEventListener('click', checkBarcodes); 
    }
    
    const exportExcelBtn = document.getElementById('facturasExportExcelButton');
    if (exportExcelBtn) { 
        exportExcelBtn.addEventListener('click', exportToExcel); 
    }
    
    const exportExcelBottomBtn = document.getElementById('facturasExportExcelButtonBottom');
    if (exportExcelBottomBtn) { 
        exportExcelBottomBtn.addEventListener('click', exportToExcel); 
    }
    
    const backBtn = document.getElementById('facturasBackButton');
    if (backBtn) { 
        backBtn.addEventListener('click', goBackToCSVTable); 
    }
    
    const summaryBtn = document.getElementById('facturasSummaryButton');
    if (summaryBtn) { 
        summaryBtn.addEventListener('click', showSummary); 
    }
    
    const clearStorageBtn = document.getElementById('facturasClearStorageButton');
    if (clearStorageBtn) { 
        clearStorageBtn.addEventListener('click', clearLocalStorage); 
    }

    document.querySelectorAll('#facturasSummaryModal .close, #facturasMissingDescriptionsModal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            closeBtn.closest('.modal').style.display = 'none';
        });
    });
    
    const closePopupBtn = document.getElementById('facturasClosePopupButton');
    if (closePopupBtn) { 
        closePopupBtn.addEventListener('click', closePopup); 
    }
}

// ==================== FUNCIONES DE PESTAÑAS ====================

function switchToFacturasTab(tabId) {
    document.querySelectorAll('.facturas-tab-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    document.querySelectorAll('.facturas-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const targetContent = document.getElementById(tabId);
    if (targetContent) {
        targetContent.style.display = 'block';
        targetContent.classList.add('active');
        console.log(`✅ Pestaña ${tabId} mostrada`);
    }
    document.querySelectorAll('.facturas-tab').forEach(tab => {
        if (tab.getAttribute('data-tab') === tabId) {
            tab.classList.add('active');
        }
    });
}

function switchToCSVProcessorTab() {
    console.log('🔄 Cambiando a procesador CSV...');
    
    document.querySelectorAll('.facturas-tab-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    document.querySelectorAll('.facturas-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const csvProcessor = document.getElementById('facturas-csv-processor');
    if (csvProcessor) {
        csvProcessor.style.display = 'block';
        csvProcessor.classList.add('active');
        console.log('✅ Procesador CSV mostrado');
    } else {
        console.error('❌ No se encontró facturas-csv-processor');
    }
    
    document.querySelectorAll('.facturas-tab').forEach(tab => {
        if (tab.getAttribute('data-tab') === 'facturas-csv-processor') {
            tab.classList.add('active');
        }
    });
    
    if (!catalogoCargado) {
        cargarCatalogoCompleto();
    }
}

// ==================== MANEJO DE PDF ====================

function handlePDFFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('❌ No se seleccionó ningún archivo');
        return;
    }
    
    console.log(`📄 Archivo PDF seleccionado: ${file.name}`);
    document.getElementById('facturasPdfFileName').textContent = `📄 Archivo seleccionado: ${file.name}`;
    pdfFileData = file;
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        document.getElementById('facturasPdfError').textContent = '❌ Solo se permiten archivos PDF';
        document.getElementById('facturasPdfError').style.display = 'block';
        document.getElementById('facturasConvertBtn').disabled = true;
        return;
    }
    
    document.getElementById('facturasPdfError').style.display = 'none';
    document.getElementById('facturasConvertBtn').disabled = false;
    console.log('✅ PDF cargado correctamente, botón de convertir habilitado');
}

async function convertPDFtoCSV() {
    console.log('🔄 Iniciando conversión PDF → CSV...');
    
    const file = pdfFileData || document.getElementById('facturasPdfFileInput').files[0];
    if (!file) {
        document.getElementById('facturasPdfError').textContent = '❌ Por favor selecciona un archivo PDF';
        document.getElementById('facturasPdfError').style.display = 'block';
        return;
    }

    const loader = document.getElementById('facturasPdfLoader');
    const convertBtn = document.getElementById('facturasConvertBtn');
    const errorDiv = document.getElementById('facturasPdfError');
    const downloadLink = document.getElementById('facturasDownloadLink');
    const continueBtn = document.getElementById('facturasContinueToProcessorBtn');

    loader.style.display = 'block';
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
    convertBtn.disabled = true;
    downloadLink.style.display = 'none';
    continueBtn.style.display = 'none';

    try {
        const base64 = await readFileAsBase64(file);

        const response = await fetch('https://api.convertio.co/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apikey: API_KEY,
                input: "base64",
                inputformat: "pdf",
                outputformat: "csv",
                file: base64,
                filename: file.name
            })
        });

        const data = await response.json();
        console.log('📥 Respuesta de API:', data);
        
        if (data.status === 'error') {
            throw new Error(data.error);
        }

        conversionId = data.data.id;
        console.log(`✅ ID de conversión: ${conversionId}`);
        checkConversionStatus();

    } catch (error) {
        console.error('❌ Error en conversión:', error);
        loader.style.display = 'none';
        errorDiv.textContent = `❌ Error: ${error.message}`;
        errorDiv.style.display = 'block';
        convertBtn.disabled = false;
    }
}

async function checkConversionStatus() {
    const loader = document.getElementById('facturasPdfLoader');
    const convertBtn = document.getElementById('facturasConvertBtn');
    const downloadLink = document.getElementById('facturasDownloadLink');
    const continueBtn = document.getElementById('facturasContinueToProcessorBtn');
    const errorDiv = document.getElementById('facturasPdfError');

    // Verificar que existan los elementos esenciales
    console.log('🔍 Verificando elementos en checkConversionStatus:', {
        loader: !!loader,
        convertBtn: !!convertBtn,
        downloadLink: !!downloadLink,
        continueBtn: !!continueBtn,
        errorDiv: !!errorDiv
    });

    try {
        const response = await fetch(`https://api.convertio.co/convert/${conversionId}/status`);
        const data = await response.json();

        console.log('📊 Estado de conversión:', data);

        if (data.status === 'error') {
            throw new Error(data.error || 'Error en la conversión');
        }

        // Si la conversión ha terminado
        if (data.data && data.data.step === 'finish') {
            console.log('✅ Conversión completada!');

            // Ocultar loader
            if (loader) loader.style.display = 'none';

            // Mostrar mensaje de éxito
            showInfo('facturas', '✅ PDF convertido correctamente. Haz clic en "Descargar CSV" para guardar el archivo.');

            // ---- Botón de descarga ----
            if (downloadLink) {
                console.log('📥 URL de descarga:', data.data.output.url);
                downloadLink.href = data.data.output.url;
                downloadLink.download = 'converted.csv';
                // Forzar visibilidad
                downloadLink.style.display = 'inline-block';
                downloadLink.style.visibility = 'visible';
                downloadLink.classList.remove('hidden');
                downloadLink.textContent = '📥 Descargar CSV';
                console.log('✅ Botón de descarga habilitado');
            } else {
                console.error('❌ No se encontró el elemento facturasDownloadLink');
                // Crear un enlace de descarga dinámico si no existe
                const container = document.querySelector('.facturas-pdf-upload-area') || document.body;
                const newLink = document.createElement('a');
                newLink.id = 'facturasDownloadLink';
                newLink.href = data.data.output.url;
                newLink.download = 'converted.csv';
                newLink.textContent = '📥 Descargar CSV';
                newLink.style.cssText = 'display:inline-block; margin-top:10px; padding:10px 20px; background:#1e40af; color:white; border-radius:8px; text-decoration:none;';
                container.appendChild(newLink);
                console.log('✅ Enlace de descarga creado dinámicamente');
            }

            // ---- Botón "Continuar" ----
            if (continueBtn) {
                continueBtn.style.display = 'inline-block';
                continueBtn.style.visibility = 'visible';
                continueBtn.classList.remove('hidden');
                console.log('✅ Botón "Continuar" habilitado');
            } else {
                console.error('❌ No se encontró el elemento facturasContinueToProcessorBtn');
                // Opcional: crear el botón dinámicamente
                const container = document.querySelector('.facturas-pdf-upload-area') || document.body;
                const newBtn = document.createElement('button');
                newBtn.id = 'facturasContinueToProcessorBtn';
                newBtn.className = 'btn-contado';
                newBtn.textContent = '➡️ Continuar al Procesador CSV';
                newBtn.style.cssText = 'display:inline-block; margin-top:10px; padding:10px 20px; background:#059669; color:white; border-radius:8px; border:none; cursor:pointer;';
                newBtn.addEventListener('click', function() {
                    console.log('➡️ Click en Continuar al Procesador CSV');
                    switchToCSVProcessorTab();
                });
                container.appendChild(newBtn);
                console.log('✅ Botón "Continuar" creado dinámicamente');
            }

            // Ocultar mensaje de error si existía
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.style.display = 'none';
            }

            // Habilitar el botón de convertir nuevamente (por si quieren repetir)
            if (convertBtn) convertBtn.disabled = false;

        } else {
            // Aún en proceso
            console.log(`⏳ Progreso: ${data.data?.step || 'procesando...'}`);
            // Seguir verificando después de 2 segundos
            setTimeout(checkConversionStatus, 2000);
        }

    } catch (error) {
        console.error('❌ Error verificando estado:', error);
        if (loader) loader.style.display = 'none';
        if (errorDiv) {
            errorDiv.textContent = `❌ Error: ${error.message}`;
            errorDiv.style.display = 'block';
        }
        if (convertBtn) convertBtn.disabled = false;
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            console.log('📄 Archivo leído correctamente');
            resolve(reader.result.split(',')[1]);
        };
        reader.onerror = error => {
            console.error('❌ Error leyendo archivo:', error);
            reject(error);
        };
        reader.readAsDataURL(file);
    });
}

// ==================== PROCESAMIENTO DE CSV ====================

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log(`📄 Archivo CSV seleccionado: ${file.name}`);
    currentCsvFileName = file.name.replace('.csv', '');
    document.getElementById('facturasCsvFileName').textContent = `📄 Archivo seleccionado: ${file.name}`;
    hayArchivoCSVCargado = true;
    
    document.getElementById('facturasContinueButton').disabled = false;
    document.getElementById('facturasContinueButtonBottom').classList.remove('hidden');
    
    if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result.replace(/"/g, '');
            csvData = text.split('\n');
            
            const blob = new Blob([text], { type: 'text/csv' });
            const readerBlob = new FileReader();
            readerBlob.onload = function() {
                const base64data = readerBlob.result.split(',')[1];
                localStorage.setItem('facturasCsvFile', base64data);
            };
            readerBlob.readAsDataURL(blob);
            
            processCSVData(csvData);
        };
        reader.readAsText(file);
    } else {
        showError('facturas', 'Por favor, sube un archivo CSV válido.');
    }
}

function processCSVData(data) {
    const tbody = document.getElementById('facturasCsvTableBody');
    tbody.innerHTML = '';
    filteredData = [];
    
    data.forEach((row, index) => {
        if (row.trim() === '') return;
        
        const isValid = validateRow(row);
        const tr = document.createElement('tr');
        if (!isValid) tr.classList.add('marked-row');
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !isValid;
        checkbox.disabled = isValid;
        checkbox.className = 'facturas-row-checkbox';
        
        if (checkbox.checked) tr.classList.add('highlighted-row');
        checkbox.addEventListener('change', () => {
            tr.classList.toggle('highlighted-row', checkbox.checked);
        });
        
        const tdCheckbox = document.createElement('td');
        tdCheckbox.style.textAlign = 'center';
        tdCheckbox.appendChild(checkbox);
        tr.appendChild(tdCheckbox);
        
        const tdData = document.createElement('td');
        tdData.textContent = row;
        tr.appendChild(tdData);
        
        tr.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && !isValid) {
                checkbox.checked = !checkbox.checked;
                tr.classList.toggle('highlighted-row', checkbox.checked);
            }
        });
        
        tbody.appendChild(tr);
        if (isValid) filteredData.push(row);
    });
    
    document.getElementById('facturasCsvControls').classList.remove('hidden');
}

function validateRow(row) {
    const trimmedRow = row.trim();
    if (trimmedRow.startsWith('700')) return true;
    
    const firstCell = trimmedRow.split(/\s+/)[0];
    if (/^\d{7}$|^\d{8}$|^\d{15}$|^\d{19}$/.test(firstCell)) return true;
    if (firstCell.startsWith('895202')) return true;
    
    const segments = firstCell.split(/\s+/);
    if (segments.length >= 1 && segments.length <= 5) {
        return segments.every(segment => /^\d{15}$/.test(segment));
    }
    
    return false;
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('#facturasCsvTableBody input[type="checkbox"]:not(:disabled)');
    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
    checkboxes.forEach(checkbox => checkbox.checked = !allChecked);
    
    checkboxes.forEach(checkbox => {
        const tr = checkbox.closest('tr');
        tr.classList.toggle('highlighted-row', checkbox.checked);
    });
}

function continueToProcessedData() {
    if (!hayArchivoCSVCargado) {
        showError('facturas', 'Primero carga un archivo CSV.');
        return;
    }
    
    const rowsToExport = [];
    const rows = document.querySelectorAll('#facturasCsvTableBody tr');
    
    rows.forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (!checkbox.checked) {
            const rowData = row.querySelector('td:last-child').textContent;
            const concatenatedRow = rowData.split(',').join('');
            rowsToExport.push(concatenatedRow);
        }
    });
    
    const csvContent = rowsToExport.join('\n');
    processCleanCSV(csvContent);
    showProcessedDataSection();
}

function showProcessedDataSection() {
    document.getElementById('facturasCsvTableContainer').classList.add('hidden');
    document.getElementById('facturasCsvControls').classList.add('hidden');
    
    const csvTableBody = document.getElementById('facturasCsvTableBody');
    if (csvTableBody) {
        csvTableBody.innerHTML = '';
    }
    
    document.getElementById('facturasProcessedSection').style.display = 'block';
    localStorage.setItem('facturasShowTable2', 'true');
}

function processCleanCSV(data) {
    const rows = data.split('\n');
    let currentDescriptionRow = null;
    processedData = [];
    
    rows.forEach(row => {
        if (row.trim() === '') return;
        
        const clave = row.substring(0, 12).trim();
        const descripcion = row.substring(12, 72).trim();
        const restOfData = row.substring(72).trim().split(/\s{2,}/);
        
        if (restOfData.length >= 4) {
            currentDescriptionRow = {
                clave: clave,
                descripcion: descripcion,
                cantidad: parseFloat(restOfData[0]),
                costo: parseFloat(restOfData[1].replace(',', '')),
                descuento: parseFloat(restOfData[2].replace(',', '')),
                importe: parseFloat(restOfData[3].replace(',', '')),
                series: []
            };
            processedData.push(currentDescriptionRow);
        } else if (currentDescriptionRow) {
            const series = row.match(/\d{15,19}/g) || [];
            series.forEach(serie => {
                if ((serie.length === 19 && serie.startsWith('895202')) || serie.length === 15) {
                    currentDescriptionRow.series.push(serie);
                } else {
                    currentDescriptionRow.series.push('Serie Invalida');
                }
            });
        }
    });
    
    const groupedData = {};
    processedData.forEach(item => {
        if (!groupedData[item.descripcion]) {
            groupedData[item.descripcion] = {
                clave: item.clave,
                descripcion: item.descripcion,
                cantidad: 0,
                costo: item.costo,
                descuento: 0,
                importe: 0,
                series: []
            };
        }
        groupedData[item.descripcion].cantidad += item.cantidad;
        groupedData[item.descripcion].descuento += item.descuento;
        groupedData[item.descripcion].importe += item.importe;
        groupedData[item.descripcion].series = groupedData[item.descripcion].series.concat(item.series);
    });
    
    const finalData = Object.values(groupedData);
    finalData.sort((a, b) => a.descripcion.localeCompare(b.descripcion));
    
    localStorage.setItem('facturasProcessedData', JSON.stringify(finalData));
    displayData(finalData);
}

function displayData(data) {
    const savedData = localStorage.getItem('facturasProcessedData');
    if (savedData) {
        data = JSON.parse(savedData);
    }
    
    const tbody = document.getElementById('facturasDataTableBody');
    tbody.innerHTML = '';
    
    data.forEach(item => {
        const row = document.createElement('tr');
        
        let seriesHtml = '';
        let seriesArray = [];
        
        if (item.series && item.series.length > 0) {
            const seriesValidas = item.series.filter(s => s && s !== 'Serie Invalida');
            if (seriesValidas.length > 0) {
                seriesArray = seriesValidas;
                const seriesGroups = [];
                for (let i = 0; i < seriesValidas.length; i += 3) {
                    seriesGroups.push(seriesValidas.slice(i, i + 3));
                }
                
                seriesHtml = seriesGroups.map(group => {
                    return group.map(s => {
                        let className = 'series-other';
                        if (s.length === 15) className = 'series-imei';
                        else if (s.length === 19) className = 'series-iccid';
                        return `<span class="${className}" data-serie="${s}" title="${s.length === 15 ? 'IMEI' : s.length === 19 ? 'ICCID' : 'Serie'}">${s}</span>`;
                    }).join(' ');
                }).join('<br>');
            } else {
                seriesHtml = '<span style="color: #94a3b8; font-style: italic;">Sin series válidas</span>';
            }
        } else {
            seriesHtml = '<span style="color: #94a3b8; font-style: italic;">Sin series</span>';
        }
        
        row.innerHTML = `
            <td>${item.clave || '-'}</td>
            <td><strong>${escapeHtml(item.descripcion)}</strong></td>
            <td style="text-align: center; font-weight: bold;">${item.cantidad}</td>
            <td style="text-align: right;">${formatCurrency(item.costo)}</td>
            <td style="text-align: right; color: #f97316;">${formatCurrency(item.descuento)}</td>
            <td style="text-align: right; font-weight: bold; color: #059669;">${formatCurrency(item.importe)}</td>
            <td>${seriesHtml}</td>
            <td style="text-align: center;" class="facturas-barcode-cell"></td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('facturasCheckBarcodesButton').disabled = false;
}

// ==================== CÓDIGOS DE BARRAS ====================

async function buscarCodigosEnCatalogo() {
    if (!catalogoCargado) {
        showInfo('facturas', '⏳ El catálogo aún no está cargado. Intentando cargar ahora...');
        await cargarCatalogoCompleto();
        if (!catalogoCargado) {
            showError('facturas', '❌ No se pudo cargar el catálogo. Intenta de nuevo más tarde.');
            return;
        }
    }

    const rows = document.querySelectorAll('#facturasDataTableBody tr');
    if (rows.length === 0) {
        showError('facturas', 'No hay productos en la tabla para buscar.');
        return;
    }

    showInfo('facturas', '🔍 Buscando códigos de barras en el catálogo...');
    let encontrados = 0;
    let noEncontrados = 0;

    rows.forEach(row => {
        const descripcionCelda = row.querySelector('td:nth-child(2)');
        const barcodeCell = row.querySelector('td:nth-child(8)');
        if (!descripcionCelda || !barcodeCell) return;

        const descripcion = descripcionCelda.textContent.trim();
        const barcode = buscarCodigoEnCatalogo(descripcion);
        
        if (barcode) {
            barcodeCell.textContent = barcode;
            barcodeCell.style.color = '#059669';
            row.classList.remove('highlight-search');
            barcodeData[descripcion] = barcode;
            encontrados++;
        } else {
            barcodeCell.textContent = '❌ No encontrado';
            barcodeCell.style.color = '#dc2626';
            row.classList.add('highlight-search');
            noEncontrados++;
        }
    });

    const jsonData = Object.keys(barcodeData).map(key => ({
        name: key,
        barcode: barcodeData[key]
    }));
    localStorage.setItem('facturasBarcodeData', JSON.stringify(jsonData));

    const infoAlert = document.getElementById('facturasInfoAlert');
    if (infoAlert) {
        infoAlert.innerHTML = `✅ Búsqueda completada: ${encontrados} encontrados, ${noEncontrados} no encontrados.`;
        infoAlert.style.display = 'block';
        setTimeout(() => { infoAlert.style.display = 'none'; }, 5000);
    }

    if (noEncontrados > 0) {
        const missingDescriptions = [];
        rows.forEach(row => {
            const descripcion = row.querySelector('td:nth-child(2)').textContent;
            const barcodeCell = row.querySelector('td:nth-child(8)');
            if (barcodeCell && barcodeCell.textContent.includes('No encontrado')) {
                if (!missingDescriptions.includes(descripcion)) {
                    missingDescriptions.push(descripcion);
                }
            }
        });
        showMissingDescriptionsModal(missingDescriptions);
    }

    document.getElementById('facturasExportExcelButton').classList.remove('hidden');
    document.getElementById('facturasExportExcelButtonBottom').classList.remove('hidden');
}

function checkBarcodes() {
    const rows = document.querySelectorAll('#facturasDataTableBody tr');
    let missingDescriptions = [];
    
    rows.forEach(row => {
        const descripcion = row.querySelector('td:nth-child(2)').textContent;
        const barcodeCell = row.querySelector('td:nth-child(8)');
        
        if (!barcodeCell.textContent || barcodeCell.textContent.includes('No encontrado')) {
            barcodeCell.textContent = '❌ No encontrado';
            barcodeCell.style.color = '#dc2626';
            row.classList.add('highlight-search');
            if (!missingDescriptions.includes(descripcion)) {
                missingDescriptions.push(descripcion);
            }
        } else {
            row.classList.remove('highlight-search');
        }
    });
    
    if (missingDescriptions.length > 0) {
        showMissingDescriptionsModal(missingDescriptions);
    } else {
        const modal = document.getElementById('facturasMissingDescriptionsModal');
        if (modal) modal.style.display = 'none';
        showInfo('facturas', '✅ Todos los productos tienen código de barras.');
    }
    
    document.getElementById('facturasExportExcelButton').classList.remove('hidden');
    document.getElementById('facturasExportExcelButtonBottom').classList.remove('hidden');
}

// ==================== MODAL CON BUSCADOR DE CATÁLOGO ====================

function showMissingDescriptionsModal(missingDescriptions) {
    const modal = document.getElementById('facturasMissingDescriptionsModal');
    const modalContent = document.getElementById('facturasMissingDescriptionsModalContent');
    modalContent.innerHTML = '';
    
    const countMsg = document.createElement('p');
    countMsg.style.cssText = 'color: #1e40af; font-weight: 600; margin-bottom: 12px;';
    countMsg.textContent = `📝 ${missingDescriptions.length} descripción(es) sin código de barras.`;
    modalContent.appendChild(countMsg);
    
    if (missingDescriptions.length > 0) {
        const selectContainer = document.createElement('div');
        selectContainer.style.cssText = 'margin-bottom: 15px;';
        
        const selectLabel = document.createElement('label');
        selectLabel.style.cssText = 'font-weight: 600; color: #1e40af; display: block; margin-bottom: 5px;';
        selectLabel.textContent = 'Selecciona la descripción a corregir:';
        selectContainer.appendChild(selectLabel);
        
        const select = document.createElement('select');
        select.id = 'facturasMissingDescriptionsSelect';
        select.style.cssText = 'width:100%; padding:10px; border-radius:10px; border:2px solid #bfdbfe; font-size:0.9rem;';
        const uniqueDescriptions = [...new Set(missingDescriptions)];
        uniqueDescriptions.forEach(desc => {
            const option = document.createElement('option');
            option.value = desc;
            option.textContent = desc;
            select.appendChild(option);
        });
        selectContainer.appendChild(select);
        modalContent.appendChild(selectContainer);
    }
    
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = 'margin: 15px 0; position: relative;';
    
    const searchLabel = document.createElement('label');
    searchLabel.style.cssText = 'font-weight: 600; color: #1e40af; display: block; margin-bottom: 5px;';
    searchLabel.textContent = '🔍 Buscar en el catálogo del ERP:';
    searchContainer.appendChild(searchLabel);
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'facturasCatalogSearchInput';
    searchInput.placeholder = 'Escribe al menos 2 caracteres para buscar...';
    searchInput.style.cssText = 'width:100%; padding:10px; border:2px solid #bfdbfe; border-radius:10px; font-size:0.9rem;';
    searchContainer.appendChild(searchInput);
    
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'facturasCatalogSuggestions';
    suggestionsContainer.style.cssText = 'position: relative; width: 100%;';
    searchContainer.appendChild(suggestionsContainer);
    
    modalContent.appendChild(searchContainer);
    
    const selectedContainer = document.createElement('div');
    selectedContainer.id = 'facturasCatalogSelected';
    selectedContainer.style.cssText = 'display: none; padding: 12px; background: #f0f9ff; border-radius: 10px; border-left: 4px solid #f97316; margin: 10px 0;';
    selectedContainer.innerHTML = `
        <strong>✅ Producto seleccionado:</strong> <span id="facturasCatalogSelectedName"></span>
        <br>
        <strong>Código de barras:</strong> <span id="facturasCatalogSelectedBarcode"></span>
        <button id="facturasCatalogSelectedClear" style="margin-left: 10px; padding: 2px 10px; font-size: 0.7rem; background: #dc2626; border: none; border-radius: 6px; color: white; cursor: pointer;">✖ Limpiar</button>
    `;
    modalContent.appendChild(selectedContainer);
    
    const saveContainer = document.createElement('div');
    saveContainer.style.cssText = 'margin-top: 15px;';
    
    const saveBtn = document.createElement('button');
    saveBtn.id = 'facturasSaveBarcodeBtn';
    saveBtn.className = 'btn-contado';
    saveBtn.style.cssText = 'width:100%; padding:10px;';
    saveBtn.textContent = '💾 Guardar Código Seleccionado';
    saveContainer.appendChild(saveBtn);
    modalContent.appendChild(saveContainer);
    
    let selectedProduct = null;
    
    window.selectCatalogProduct = function(name, barcode) {
        selectedProduct = { name, barcode };
        document.getElementById('facturasCatalogSelectedName').textContent = name;
        document.getElementById('facturasCatalogSelectedBarcode').textContent = barcode;
        document.getElementById('facturasCatalogSelected').style.display = 'block';
        document.getElementById('facturasCatalogSearchInput').value = name;
        document.getElementById('facturasCatalogSuggestions').innerHTML = '';
    };
    
    searchInput.addEventListener('input', function() {
        const query = this.value;
        if (catalogoSearchTimeout) clearTimeout(catalogoSearchTimeout);
        
        if (!query || query.length < 2) {
            document.getElementById('facturasCatalogSuggestions').innerHTML = '';
            return;
        }
        
        if (!catalogoCargado) {
            document.getElementById('facturasCatalogSuggestions').innerHTML = 
                '<div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; color: #64748b; z-index: 1000;">⏳ Cargando catálogo...</div>';
            return;
        }
        
        catalogoSearchTimeout = setTimeout(() => {
            const results = buscarEnCatalogo(query);
            mostrarSugerenciasCatalogo(results, 'facturasCatalogSearchInput', 'facturasCatalogSuggestions', window.selectCatalogProduct);
        }, 300);
    });
    
    document.getElementById('facturasCatalogSelectedClear').addEventListener('click', function() {
        selectedProduct = null;
        document.getElementById('facturasCatalogSelected').style.display = 'none';
        document.getElementById('facturasCatalogSearchInput').value = '';
        document.getElementById('facturasCatalogSuggestions').innerHTML = '';
    });
    
    saveBtn.addEventListener('click', function() {
        const select = document.getElementById('facturasMissingDescriptionsSelect');
        if (!select) return;
        
        const selectedDesc = select.value;
        
        if (!selectedProduct) {
            alert('⚠️ Por favor selecciona un producto del catálogo usando el buscador.');
            return;
        }
        
        const barcode = selectedProduct.barcode;
        
        if (!barcode) {
            alert('⚠️ El producto seleccionado no tiene código de barras.');
            return;
        }
        
        barcodeData[selectedDesc] = barcode;
        const jsonData = Object.keys(barcodeData).map(key => ({ name: key, barcode: barcodeData[key] }));
        localStorage.setItem('facturasBarcodeData', JSON.stringify(jsonData));
        
        const rows = document.querySelectorAll('#facturasDataTableBody tr');
        rows.forEach(row => {
            const descripcion = row.querySelector('td:nth-child(2)').textContent;
            const barcodeCell = row.querySelector('td:nth-child(8)');
            if (descripcion === selectedDesc && barcodeCell) {
                barcodeCell.textContent = barcode;
                barcodeCell.style.color = '#059669';
                row.classList.remove('highlight-search');
            }
        });
        
        document.getElementById('facturasCatalogSelected').style.display = 'none';
        document.getElementById('facturasCatalogSearchInput').value = '';
        document.getElementById('facturasCatalogSuggestions').innerHTML = '';
        selectedProduct = null;
        
        let hasMissing = false;
        const missingDescriptions = [];
        rows.forEach(row => {
            const barcodeCell = row.querySelector('td:nth-child(8)');
            if (barcodeCell && barcodeCell.textContent.includes('No encontrado')) {
                hasMissing = true;
                const desc = row.querySelector('td:nth-child(2)').textContent;
                if (!missingDescriptions.includes(desc)) {
                    missingDescriptions.push(desc);
                }
            }
        });
        
        if (!hasMissing) {
            modal.style.display = 'none';
            alert('✅ ¡Todos los códigos de barras han sido asignados correctamente!');
            showInfo('facturas', '✅ Todos los códigos de barras han sido asignados.');
        } else {
            const select = document.getElementById('facturasMissingDescriptionsSelect');
            if (select) {
                select.innerHTML = '';
                missingDescriptions.forEach(desc => {
                    const option = document.createElement('option');
                    option.value = desc;
                    option.textContent = desc;
                    select.appendChild(option);
                });
            }
            const countMsg = document.querySelector('#facturasMissingDescriptionsModalContent p:first-child');
            if (countMsg) {
                countMsg.textContent = `📝 ${missingDescriptions.length} descripción(es) sin código de barras.`;
            }
        }
    });
    
    function cerrarModal() {
        let hasMissing = false;
        let count = 0;
        document.querySelectorAll('#facturasDataTableBody tr').forEach(row => {
            const barcodeCell = row.querySelector('td:nth-child(8)');
            if (barcodeCell && barcodeCell.textContent.includes('No encontrado')) {
                hasMissing = true;
                count++;
            }
        });
        if (hasMissing) {
            if (confirm(`⚠️ Aún hay ${count} producto(s) sin código de barras asignado. ¿Seguro que quieres cerrar?`)) {
                modal.style.display = 'none';
            }
        } else {
            modal.style.display = 'none';
        }
    }
    
    const closeBtn = document.getElementById('facturasCloseMissingModalBtn');
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', cerrarModal);
    }
    
    const closeX = document.getElementById('facturasMissingCloseX');
    if (closeX) {
        const newCloseX = closeX.cloneNode(true);
        closeX.parentNode.replaceChild(newCloseX, closeX);
        newCloseX.addEventListener('click', cerrarModal);
    }
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = this.value;
            if (query.length >= 2) {
                const results = buscarEnCatalogo(query);
                if (results.length > 0) {
                    window.selectCatalogProduct(results[0].name, results[0].barcode);
                }
            }
        }
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarModal();
        }
    });
    
    modal.style.display = 'flex';
}

// ==================== EXPORTAR A EXCEL (CON SERIES CORREGIDAS) ====================

function exportToExcel() {
    const data = [];
    document.querySelectorAll('#facturasDataTableBody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        const descripcion = cells[1].textContent;
        const cantidad = parseFloat(cells[2].textContent);
        const costo = parseFloat(cells[3].textContent.replace(/[^0-9.-]+/g, ''));
        const descuentoTotal = parseFloat(cells[4].textContent.replace(/[^0-9.-]+/g, ''));
        const barcode = cells[7].textContent;
        
        // Extraer las series del HTML
        const seriesHtml = cells[6].innerHTML;
        const series = [];
        
        // Buscar spans con data-serie
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = seriesHtml;
        const spanElements = tempDiv.querySelectorAll('span[data-serie]');
        spanElements.forEach(span => {
            const serie = span.getAttribute('data-serie');
            if (serie && serie.trim()) {
                series.push(serie.trim());
            }
        });
        
        // Si no se encontraron con data-serie, intentar con texto
        if (series.length === 0) {
            const textSeries = cells[6].textContent.split(',').map(s => s.trim());
            textSeries.forEach(s => {
                if (s && s !== 'Sin series' && s !== 'Sin series válidas' && s !== 'Sin series' && s !== 'Sin series válidas' && s !== '') {
                    series.push(s);
                }
            });
        }
        
        let descuentoPorUnidad = "0.00";
        if (!isNaN(descuentoTotal) && descuentoTotal !== 0 && cantidad > 0) {
            descuentoPorUnidad = (descuentoTotal / cantidad).toFixed(2);
        }
        
        if (series.length === 0) {
            data.push({
                "CODIGOBARRAS": barcode,
                "COSTO_UNITARIO": costo,
                "DESCUENTO_1": descuentoPorUnidad,
                "DESCUENTO_2": "0.00",
                "IMEI": "",
                "ICCID": "",
                "SERIE TAF": "",
                "SERIE FICHA": ""
            });
        } else {
            series.forEach(serie => {
                const rowData = {
                    "CODIGOBARRAS": barcode,
                    "COSTO_UNITARIO": costo,
                    "DESCUENTO_1": descuentoPorUnidad,
                    "DESCUENTO_2": "0.00",
                    "IMEI": "",
                    "ICCID": "",
                    "SERIE TAF": "",
                    "SERIE FICHA": ""
                };
                
                if (serie.length === 15) {
                    rowData["IMEI"] = serie;
                } else if (serie.length === 19) {
                    rowData["ICCID"] = serie;
                } else {
                    rowData["SERIE TAF"] = serie;
                }
                
                data.push(rowData);
            });
        }
    });
    
    if (data.length === 0) {
        alert('⚠️ No hay datos para exportar.');
        return;
    }
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    
    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const exportFileName = currentCsvFileName ? `${currentCsvFileName}.xlsx` : 'datos_exportados.xlsx';
    
    saveFile(blob, exportFileName).then(() => {
        showInfo('facturas', '✅ Archivo exportado correctamente.');
        limpiarDatosCompletos();
        showInfo('facturas', '🔄 Datos limpiados. Puedes cargar un nuevo archivo CSV o PDF.');
    }).catch(error => {
        console.error('Error al guardar el archivo:', error);
        showError('facturas', 'Error al guardar el archivo');
    });
}

// ==================== LIMPIAR DATOS COMPLETOS ====================

function limpiarDatosCompletos() {
    localStorage.removeItem('facturasProcessedData');
    localStorage.removeItem('facturasCsvFile');
    localStorage.removeItem('facturasBarcodeData');
    localStorage.removeItem('facturasOriginalFileName');
    localStorage.removeItem('facturasShowTable2');
    
    csvData = [];
    filteredData = [];
    processedData = [];
    barcodeData = {};
    currentCsvFileName = '';
    hayArchivoCSVCargado = false;
    
    const tbody = document.getElementById('facturasDataTableBody');
    if (tbody) {
        tbody.innerHTML = '';
    }
    
    document.getElementById('facturasProcessedSection').style.display = 'none';
    document.getElementById('facturasCsvTableContainer').classList.remove('hidden');
    document.getElementById('facturasCsvControls').classList.remove('hidden');
    
    const csvTableBody = document.getElementById('facturasCsvTableBody');
    if (csvTableBody) {
        csvTableBody.innerHTML = '';
    }
    
    document.getElementById('facturasContinueButton').disabled = true;
    document.getElementById('facturasContinueButtonBottom').classList.add('hidden');
    document.getElementById('facturasCsvFileName').textContent = '';
    
    document.getElementById('facturasExportExcelButton').classList.add('hidden');
    document.getElementById('facturasExportExcelButtonBottom').classList.add('hidden');
    document.getElementById('facturasCheckBarcodesButton').disabled = true;
}

async function saveFile(blob, suggestedName) {
    try {
        if (window.showSaveFilePicker) {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: suggestedName,
                types: [{
                    description: 'Archivos Excel',
                    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
                }],
            });
            
            const writableStream = await fileHandle.createWritable();
            await writableStream.write(blob);
            await writableStream.close();
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Guardado cancelado por el usuario.');
        } else {
            throw error;
        }
    }
}

// ==================== FILTROS Y BÚSQUEDA ====================

function filterData() {
    const searchTerm = document.getElementById('facturasSearchInput').value.toLowerCase();
    const rows = document.querySelectorAll('#facturasDataTableBody tr');
    
    rows.forEach(row => {
        const descripcion = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        const series = row.querySelector('td:nth-child(7)').textContent.toLowerCase();
        
        if (descripcion.includes(searchTerm) || series.includes(searchTerm)) {
            row.style.display = '';
            highlightSearchTerm(row.querySelector('td:nth-child(2)'), searchTerm);
            highlightSearchTerm(row.querySelector('td:nth-child(7)'), searchTerm);
        } else {
            row.style.display = 'none';
        }
    });
}

function highlightSearchTerm(element, searchTerm) {
    if (!searchTerm) {
        element.innerHTML = element.textContent;
        return;
    }
    
    const text = element.textContent;
    const regex = new RegExp(searchTerm, 'gi');
    element.innerHTML = text.replace(regex, match => `<span class="highlight-search">${match}</span>`);
}

// ==================== SUMMARY ====================

function showSummary() {
    let equiposTotal = 0;
    let simcardsTotal = 0;
    let equiposImporteTotal = 0;
    let simcardsImporteTotal = 0;
    let equiposDescuentoTotal = 0;
    let simcardsDescuentoTotal = 0;
    
    const savedData = localStorage.getItem('facturasProcessedData');
    if (!savedData) {
        alert('No hay datos para mostrar el resumen');
        return;
    }
    
    const data = JSON.parse(savedData);
    
    data.forEach(item => {
        if (item.descripcion.includes('TARJETA') || item.descripcion.toLowerCase().includes('sim')) {
            simcardsTotal += item.cantidad;
            simcardsImporteTotal += item.importe;
            simcardsDescuentoTotal += item.descuento;
        } else {
            equiposTotal += item.cantidad;
            equiposImporteTotal += item.importe;
            equiposDescuentoTotal += item.descuento;
        }
    });
    
    document.getElementById('facturasEquiposTotal').textContent = `${equiposTotal} Pzas.`;
    document.getElementById('facturasSimcardsTotal').textContent = `${simcardsTotal} Pzas.`;
    document.getElementById('facturasEquiposImporteTotal').textContent = formatCurrency(equiposImporteTotal);
    document.getElementById('facturasSimcardsImporteTotal').textContent = formatCurrency(simcardsImporteTotal);
    document.getElementById('facturasEquiposDescuentoTotal').textContent = formatCurrency(equiposDescuentoTotal);
    document.getElementById('facturasSimcardsDescuentoTotal').textContent = formatCurrency(simcardsDescuentoTotal);
    
    document.getElementById('facturasSummaryModal').style.display = 'flex';
}

function closePopup() {
    document.getElementById('facturasSummaryModal').style.display = 'none';
}

// ==================== FUNCIONES DE UTILIDAD ====================

function formatCurrency(value) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
    }).format(value);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(module, msg) {
    const el = document.getElementById(`${module}ErrorAlert`);
    if (el) { 
        el.textContent = msg; 
        el.style.display = 'block'; 
        setTimeout(() => el.style.display = 'none', 8000); 
    }
}

function showInfo(module, msg, isWarning = false) {
    const el = document.getElementById(`${module}InfoAlert`);
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        if (isWarning) el.classList.add('alert-warning');
        setTimeout(() => { 
            el.style.display = 'none'; 
            el.classList.remove('alert-warning'); 
        }, 5000);
    }
}

function goBackToCSVTable() {
    document.getElementById('facturasCsvTableContainer').classList.remove('hidden');
    document.getElementById('facturasProcessedSection').style.display = 'none';
    localStorage.removeItem('facturasShowTable2');
}

function clearLocalStorage() {
    if (confirm('¿Estás seguro de borrar todos los datos almacenados?')) {
        limpiarDatosCompletos();
        alert('Datos borrados correctamente.');
    }
}

// ==================== EXPORTAR FUNCIONES GLOBALES ====================
window.initFacturasModule = initFacturasModule;
window.convertPDFtoCSV = convertPDFtoCSV;