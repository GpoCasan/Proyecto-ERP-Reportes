const REWARDIX_BASE_URL = 'https://api-pymes.rewardix.com/api/v2';

const ALLOWED_RESOURCES = new Set(['operations', 'managers']);
const ALLOWED_QUERY_PARAMS = new Set([
  'page',
  'itemsPerPage',
  'startDate',
  'endDate'
]);

function getAllowedOrigin(requestOrigin) {
  const configuredOrigin = process.env.FRONTEND_ORIGIN;

  // En producción exige FRONTEND_ORIGIN. El fallback local facilita las pruebas.
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (process.env.VERCEL_ENV !== 'production') {
    return requestOrigin || 'http://localhost:3000';
  }

  return '';
}

function setCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin || '';
  const allowedOrigin = getAllowedOrigin(requestOrigin);

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function getResourcePath(req) {
  const queryPath = req.query?.path;
  const queryParts = Array.isArray(queryPath)
    ? queryPath
    : [queryPath];

  const queryResource = queryParts
    .filter(Boolean)
    .map(String)
    .pop();

  if (queryResource && ALLOWED_RESOURCES.has(queryResource)) {
    return queryResource;
  }

  // Fallback para distintas versiones del enrutador de Vercel.
  // En algunos despliegues el parámetro catch-all no llega en req.query.
  const requestUrl = new URL(req.url || '/', 'https://vercel.local');
  const marker = '/api/rewardix/';
  const markerIndex = requestUrl.pathname.indexOf(marker);

  if (markerIndex !== -1) {
    const resource = requestUrl.pathname
      .slice(markerIndex + marker.length)
      .split('/')[0];

    if (ALLOWED_RESOURCES.has(resource)) {
      return resource;
    }
  }

  return null;
}

function buildRewardixUrl(resource, query) {
  const url = new URL(`${REWARDIX_BASE_URL}/${resource}`);

  for (const parameter of ALLOWED_QUERY_PARAMS) {
    const value = query?.[parameter];

    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Vercel puede entregar un arreglo si el parámetro aparece varias veces.
    url.searchParams.set(
      parameter,
      Array.isArray(value) ? String(value[0]) : String(value)
    );
  }

  return url;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  if (!process.env.REWARDIX_API_KEY) {
    console.error('Falta la variable de entorno REWARDIX_API_KEY');
    return res.status(500).json({
      error: 'El proxy no está configurado correctamente'
    });
  }

  const resource = getResourcePath(req);

  if (!resource || !ALLOWED_RESOURCES.has(resource)) {
    return res.status(404).json({
      error: 'Recurso no permitido'
    });
  }

  try {
    const rewardixUrl = buildRewardixUrl(resource, req.query);

    const upstreamResponse = await fetch(rewardixUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-API-Key': process.env.REWARDIX_API_KEY
      }
    });

    const body = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('content-type');

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    return res.status(upstreamResponse.status).send(body);
  } catch (error) {
    console.error('Error comunicando con Rewardix:', error);

    return res.status(502).json({
      error: 'No se pudo conectar con Rewardix'
    });
  }
};
