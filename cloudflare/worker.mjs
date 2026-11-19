import { DurableObject } from 'cloudflare:workers';
import { ApiError, object } from './billing.mjs';
import { RentalStorage } from './storage.mjs';

const jsonRequestLimit = 64 * 1024;
const backupRequestLimit = 4 * 1024 * 1024;

export default {
  async fetch(request, env) {
    if (!env.ADMIN_PASSWORD) {
      return json({ error: 'Hãy cấu hình secret ADMIN_PASSWORD cho Worker.' }, 503);
    }
    if (!await isAuthorized(request, env.ADMIN_PASSWORD)) {
      return json({ error: 'Vui lòng đăng nhập.' }, 401, {
        'WWW-Authenticate': 'Basic realm="Tien Nha Tro", charset="UTF-8"'
      });
    }

    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
          (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)) {
        return json({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
      }
      return env.RENTAL_DATA.getByName('primary').fetch(request);
    }

    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
};

export class RentalData extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.data = new RentalStorage(ctx.storage);
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /api/config/prices': return json(this.data.getPrices());
        case 'PUT /api/config/prices': return json(this.data.updatePrices(await readJson(request)));
        case 'GET /api/households': return json(this.data.listHouseholds());
        case 'POST /api/households': return json(this.data.createHousehold(await readJson(request)), 201);
        case 'GET /api/opening-audit': return json(this.data.listOpeningAudits());
        case 'POST /api/opening-audit': return json(this.data.saveOpeningAudit(await readJson(request)), 201);
        case 'GET /api/bills': return json(this.data.listBills(url.searchParams));
        case 'POST /api/bills': return json(this.data.addBill(await readJson(request)), 201);
        case 'GET /api/dashboard': return json(this.data.dashboard(url.searchParams));
        case 'GET /api/backup': return json(this.data.exportBackup(), 200, {
          'Content-Disposition': 'attachment; filename="tiennhatro.backup.json"'
        });
        case 'POST /api/import': return json(this.data.importBackup(await readJson(request, backupRequestLimit)), 201);
      }

      const match = /^\/api\/(households|bills)\/([^/]+)$/.exec(url.pathname);
      if (match) {
        const [, collection, encodedId] = match;
        const id = decodeURIComponent(encodedId);
        if (request.method === 'PUT') {
          const input = await readJson(request);
          return json(collection === 'households' ? this.data.updateHousehold(id, input) : this.data.updateBill(id, input));
        }
        if (request.method === 'DELETE') {
          return json(collection === 'households' ? this.data.deleteHousehold(id) : this.data.deleteBill(id));
        }
      }
      return json({ error: 'Không tìm thấy API.' }, 404);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError || error instanceof URIError) {
        return json({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400);
      }

      console.error('Lỗi API tiền nhà trọ', error);
      return json({ error: 'Không thể xử lý yêu cầu.' }, 500);
    }
  }
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function isAuthorized(request, password) {
  const encoded = request.headers.get('Authorization')?.match(/^Basic ([a-z0-9+/=]+)$/i)?.[1];
  if (!encoded) return false;

  let provided;
  try {
    provided = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  } catch {
    return false;
  }

  const expected = new TextEncoder().encode(`admin:${password}`);
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', provided),
    crypto.subtle.digest('SHA-256', expected)
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

async function readJson(request, limit = jsonRequestLimit) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'Yêu cầu phải gửi dữ liệu dạng JSON.');
  }
  const sizeError = new ApiError(413, 'Dữ liệu gửi lên quá lớn.');
  if (Number(request.headers.get('Content-Length')) > limit) throw sizeError;

  let size = 0;
  const body = request.body?.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > limit) throw sizeError;
      controller.enqueue(chunk);
    }
  }));
  return object(await new Response(body).json());
}
