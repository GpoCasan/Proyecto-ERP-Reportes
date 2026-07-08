// ==================== CONFIGURACIÓN GLOBAL ====================
const CONFIG = {
    FIXED_TOKEN: "71185|aP92nbw0SWxApAOaKUFRI6alhQa7KnBnTKG1ngBq",
   
    
    // APIs
    API_LOGS: 'https://inventory.gcasan.com/api/specifications-group/logs',
    API_SALES: 'https://sales.gcasan.com/api/sales',
    API_PAYJOY: 'https://www.payjoy.com/admin-console/api/reports',
    API_PAYJOY_LOGIN: 'https://www.payjoy.com/admin-console/api/auth/login',
    API_TAE_BALANCE: 'https://catalogs.gcasan.com/api/tae/balance',
    API_SUPPLY_COST: 'https://supply.gcasan.com/api/products',
    API_REPORTS: 'https://reports.gcasan.com/api',
    API_TRANSFERS: 'https://inventory.gcasan.com/api/transfers',
    API_WAREHOUSES: 'https://catalogs.gcasan.com/api/warehouses',
    API_PRODUCTS: 'https://catalogs.gcasan.com/api/products',
    API_BRANCHES: 'https://catalogs.gcasan.com/api/branches',
    API_SALES_ENDPOINT: 'https://sales.gcasan.com/api/sales',
    API_STOCK_HISTORY: 'https://inventory.gcasan.com/api/stock/history',
    API_STOCK: 'https://inventory.gcasan.com/api/stock',
    
    // TAE IDs
    TAE_APPS_IDS: [452,453,454,455,456,457,458,459,461,460,938,940,939,926,943,937,925,942,944,927,945,930,933,946,936,932,947,948,1237,934,935,941,928,929,931],
    
    TAE_OTHER_COMPANIES: {
        "AT&T": [501,495,496,490,497,491,498,492,499,493,500,494],
        "BAIT": [633,638,643,639,634,640,644,1133,635,641,1134,636,642,637],
        "Bienestar": [871,875,872,1204,876,1205,1206,1207,873,874,1208,1209,1210,1211,868,1212,869,1213,1203,870],
        "Cierto": [515,512,516,513,517,514,518],
        "DIRI": [1124,627,1127,628,629,1128,1129,630,1130,631,1131,1125,632,1132,626,1126],
        "FlashMobile": [546,554,555,556,547,557,558,548,559,549,550,560,551,552,553],
        "FreedomPop": [607,605,606,602,603,604],
        "Giit": [864,865,866,862,867,863],
        "Movistar": [462,470,471,472,473,463,474,475,464,476,465,466,477,467,468,469],
        "NEWWW": [723,724,727,1158,725,728,1159,726,1160,722],
        "OUI": [561,574,571,562,575,563,576,572,564,565,577,566,578,567,568,569,570,573],
        "PilloFon": [608,1118,609,610,1119,1120,614,611,1121,612,1116,1122,613,1123,1117],
        "Soriana": [616,620,624,621,617,622,625,618,615,619,623],
        "Unefon": [478,484,485,479,486,480,487,481,488,482,489,483],
        "Vasanta": [842,848,857,843,844,845,849,858,850,1202,851,837,846,852,853,854,847,838,839,855,856,840,841],
        "Virgin": [511,506,507,502,508,503,509,504,505,510],
        "WimoTelecom": [1110,593,594,1111,600,601,1112,595,1113,596,1114,591,1115,597,598,592,1109,599,967,968,969,970,971,972,973,974,975,976]
    }
};

// ==================== CONFIGURACIÓN DE RUTAS (CENTRALIZADA) ====================
const RUTAS_CONFIG = {
    "Ruta 1": {
        sucursales: ["Calkini", "Halacho", "Hecelchakan", "Hunucma", "Muna", "Tenabo", "Ticul 2", "Uman"],
        color: "#3b82f6",
        icon: "🚚"
    },
    "Ruta 2": {
        sucursales: ["Acanceh", "Chemax", "Chemax 2", "Hoctun", "Homun", "Huhi", "Kanasin", "Piste 2", "Sotuta", "Seye", "Valladolid Waldos", "Xocchel"],
        color: "#059669",
        icon: "🚚"
    },
    "Ruta 3": {
        sucursales: ["Baca", "Buctzotz", "Conkal", "Izamal", "Motul Mercado", "Dzidzantun", "Temax", "Tixkokob", "Tizimin", "Tizimin 2"],
        color: "#dc2626",
        icon: "🚚"
    },
    "Ruta 4": {
        sucursales: ["Dziuche", "Morelos", "Oxkutzcab 2", "Oxkutzcab 3", "Peto 2", "Teabo", "Tecoh", "Tekax", "Tekax 2", "Tekit", "Tzucacab"],
        color: "#f97316",
        icon: "🚚"
    }
};

// ==================== PALABRAS CLAVE PARA ALMACÉN GENERAL ====================
const ALMACEN_GENERAL_KEYWORDS = [
    "almacen general", 
    "equipos matriz", 
    "casa matriz", 
    "almacen matriz", 
    "matriz",
    "almacén general"
];

const TEAM_STRUCTURE = {
    "👑 Lider A": {
        liderId: 145,
        liderNombre: "Guadalupe Pech",
        miembros: [124, 132, 92, 36, 45, 59, 83, 113, 49, 109, 86, 118, 164]
    },
    "👑 Lider B": {
        liderId: 141,
        liderNombre: "Beatriz Pech",
        miembros: [78, 121, 43, 56, 133, 115, 104, 105, 103, 110, 77, 114, 168, 172]
    },
    "👑 Lider C": {
        liderId: 58,
        liderNombre: "Rocio Tamay Xool",
        miembros: [87, 165, 38, 51, 91, 67, 30, 116, 111, 158, 159, 163, 169, 170]
    },
    "👑 Lider D": {
        liderId: 94,
        liderNombre: "Ligia Valdez",
        miembros: [72, 90, 85, 130, 126, 119, 106, 137, 100, 152, 35, 148, 160]
    },
    "👑 Lider E": {
        liderId: 120,
        liderNombre: "Erika Pacheco",
        miembros: [102, 117, 60, 46, 108, 95, 127, 122, 139, 33, 125, 73, 129, 162]
    },
    "👑 Lider F": {
        liderId: 52,
        liderNombre: "Valeria Cauich",
        miembros: [101, 123, 57, 50, 147, 144, 89, 80, 150, 156, 88, 166, 171]
    },
    "🔹 Equipo X": {
        liderId: null,
        liderNombre: "Sin Líder",
        miembros: [134, 146]
    }
};

// Variables globales
let currentPayJoyToken = null;
let tokenExpirationTime = null;
let cachedSalesData = null;