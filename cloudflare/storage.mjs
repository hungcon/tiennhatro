import {
  ApiError, beforeOpening, billingFields, computeBill, defaultPrices, householdInput,
  importBill, month, object, openingInput, prices, status, text, year
} from './billing.mjs';

export class RentalStorage {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS prices (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        electric REAL NOT NULL,
        water REAL NOT NULL,
        lighting REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS households (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        room TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL,
        month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 9999),
        created_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL,
        UNIQUE (household_id, year, month)
      );
      CREATE INDEX IF NOT EXISTS bills_by_period ON bills (year, month, created_at);
    `);
    this.sql.exec('INSERT OR IGNORE INTO prices VALUES (1, ?, ?, ?)',
      defaultPrices.electric, defaultPrices.water, defaultPrices.lighting);
  }

  getPrices() {
    return this.sql.exec('SELECT electric, water, lighting FROM prices WHERE id = 1').one();
  }

  updatePrices(input) {
    const result = prices(input, this.getPrices());
    if (Object.values(result).includes(null)) throw new ApiError(400, 'Vui lòng nhập đủ đơn giá.');
    this.sql.exec('UPDATE prices SET electric = ?, water = ?, lighting = ? WHERE id = 1',
      result.electric, result.water, result.lighting);
    return result;
  }

  listHouseholds() {
    return this.sql.exec('SELECT data FROM households WHERE archived = 0 ORDER BY room, name')
      .toArray().map(row => JSON.parse(row.data));
  }

  createHousehold(input) {
    const now = new Date().toISOString();
    const household = {
      id: crypto.randomUUID(), ...householdInput(input), createdAt: now, updatedAt: now
    };
    this.#writeHousehold(household);
    return household;
  }

  updateHousehold(id, input) {
    const current = this.#getHousehold(id);
    const household = { ...current, ...householdInput(input, current), updatedAt: new Date().toISOString() };
    if (current.opening && Object.keys(current.opening.initialMeters)
      .some(key => household.initialMeters[key] !== current.initialMeters[key])) {
      throw new ApiError(409, 'Vui lòng cập nhật chỉ số bàn giao trong Audit đầu kỳ.');
    }
    this.#writeHousehold(household);
    return household;
  }

  deleteHousehold(id) {
    const result = this.sql.exec('UPDATE households SET archived = 1 WHERE id = ? AND archived = 0', id);
    if (!result.rowsWritten) throw new ApiError(404, 'Không tìm thấy hộ thuê.');
    return { ok: true };
  }

  listOpeningAudits() {
    return this.sql.exec(`
      SELECT id, name, room, archived, json_extract(data, '$.opening') AS opening
      FROM households WHERE json_type(data, '$.opening') = 'object'
      ORDER BY json_extract(data, '$.opening.recordedAt') DESC, room, name
    `).toArray().map(row => ({ ...row, archived: Boolean(row.archived), opening: JSON.parse(row.opening) }));
  }

  saveOpeningAudit(input) {
    const now = new Date().toISOString();
    const opening = openingInput(input, now);
    const room = text(input.room, 'Số phòng', true);

    return this.storage.transactionSync(() => {
      const current = input.id == null ? null : this.#getHousehold(text(input.id, 'Mã hộ thuê', true));
      const id = current?.id ?? crypto.randomUUID();
      const duplicate = this.sql.exec(`
        SELECT 1 FROM households WHERE archived = 0 AND room = ? COLLATE NOCASE AND id <> ? LIMIT 1
      `, room, id).toArray().length;
      if (duplicate) throw new ApiError(409, 'Phòng này đã có hộ thuê. Hãy chọn hộ hiện có để nhập đầu kỳ.');

      const recordedBill = this.sql.exec(`
        SELECT 1 FROM bills WHERE household_id = ?
        AND (json_extract(data, '$.draft') IS NOT 1 OR json_extract(data, '$.status') = 'paid') LIMIT 1
      `, id).toArray().length;
      if (recordedBill) throw new ApiError(409, 'Hộ đã có phiếu ghi nhận. Dữ liệu đầu kỳ đã được khóa.');

      const household = {
        id, ...householdInput({ ...input, room, rent: opening.rent, initialMeters: opening.initialMeters }, current ?? {}),
        opening, createdAt: current?.createdAt ?? now, updatedAt: now
      };
      this.#writeHousehold(household);
      this.sql.exec(`
        DELETE FROM bills WHERE household_id = ? AND deleted = 0 AND json_extract(data, '$.draft') = 1
      `, id);
      return household;
    });
  }

  listBills(query) {
    const billMonth = query.has('month') ? month(query.get('month')) : null;
    const billYear = query.has('year') ? year(query.get('year')) : null;
    const householdId = query.get('householdId');

    const where = ['b.deleted = 0'];
    const params = [];
    if (billYear !== null) {
      where.push('b.year = ?');
      params.push(billYear);
    }
    if (billMonth !== null) {
      where.push('b.month = ?');
      params.push(billMonth);
    }
    if (householdId) {
      where.push('b.household_id = ?');
      params.push(householdId);
    }

    if (billYear !== null && billMonth !== null) this.#ensureMonthlyBills(billYear, billMonth, householdId);

    return this.sql.exec(`
      SELECT b.data, h.data AS household
      FROM bills b LEFT JOIN households h ON b.household_id = h.id
      WHERE ${where.join(' AND ')}
      ORDER BY b.year DESC, b.month DESC, b.created_at DESC
    `, ...params).toArray().map(row => ({
      ...JSON.parse(row.data), household: row.household ? JSON.parse(row.household) : null
    }));
  }

  addBill(input) {
    const billMonth = month(input.month);
    const billYear = year(input.year);
    const id = text(input.householdId, 'Mã hộ thuê', true);

    return this.storage.transactionSync(() => {
      const household = this.#getHousehold(id);
      if (beforeOpening(household, billYear, billMonth)) {
        throw new ApiError(409, 'Kỳ phiếu sớm hơn kỳ bắt đầu của hộ thuê.');
      }
      const [row] = this.sql.exec('SELECT data FROM bills WHERE household_id = ? AND year = ? AND month = ?',
        id, billYear, billMonth).toArray();
      const existing = row ? JSON.parse(row.data) : null;
      if (existing?.status === 'paid') throw new ApiError(409, 'Phiếu đã thanh toán, không thể thay đổi chỉ số.');

      const readings = existing && !existing.draft ? { ...existing.usage, rent: existing.amounts.rent } :
        this.#startingReadings(household, billYear, billMonth);
      const editable = input.manual === true ? billingFields : ['electricNew', 'waterNew'];
      for (const key of editable) {
        if (Object.hasOwn(input, key)) readings[key] = input[key];
      }

      const now = new Date().toISOString();
      const bill = {
        id: existing?.id ?? crypto.randomUUID(), householdId: id, month: billMonth, year: billYear,
        ...computeBill(household, this.getPrices(), readings), status: 'pending', paidAt: null,
        createdAt: existing?.createdAt ?? now, updatedAt: now, isDeleted: false
      };
      this.#writeBill(bill);
      return { ...bill, household };
    });
  }

  updateBill(id, input) {
    return this.storage.transactionSync(() => {
      const bill = this.#getBill(id);
      const now = new Date().toISOString();
      if (billingFields.some(key => Object.hasOwn(input, key))) {
        if (bill.status === 'paid') throw new ApiError(409, 'Phiếu đã thanh toán, không thể thay đổi chi phí.');
        const household = this.#getHousehold(bill.householdId, true);
        const readings = { ...bill.usage, rent: bill.amounts.rent };
        for (const key of billingFields) {
          if (Object.hasOwn(input, key)) readings[key] = input[key];
        }
        Object.assign(bill, computeBill(household, this.getPrices(), readings));
        delete bill.draft;
      }
      if (Object.hasOwn(input, 'status')) {
        bill.status = status(input.status);
        bill.paidAt = bill.status === 'paid' ? bill.paidAt ?? now : null;
        if (bill.status === 'paid') delete bill.draft;
      }
      bill.updatedAt = now;
      this.#writeBill(bill);
      return bill;
    });
  }

  deleteBill(id) {
    const bill = this.#getBill(id);
    this.#writeBill({ ...bill, isDeleted: true, updatedAt: new Date().toISOString() });
    return { ok: true };
  }

  dashboard(query) {
    const bills = this.listBills(query);
    const active = this.listHouseholds();
    const households = query.has('year') && query.has('month') ? active.filter(household =>
      !beforeOpening(household, Number(query.get('year')), Number(query.get('month')))).length : active.length;
    const totals = { total: 0, paid: 0, electric: 0, water: 0, lighting: 0, rent: 0 };
    for (const bill of bills) {
      for (const key of Object.keys(bill.amounts)) totals[key] += bill.amounts[key];
      if (bill.status === 'paid') totals.paid += bill.amounts.total;
    }
    return { count: bills.length, households, bills, ...totals };
  }

  exportBackup() {
    return {
      version: 1,
      prices: this.getPrices(),
      households: this.sql.exec('SELECT data, archived FROM households').toArray()
        .map(row => ({ ...JSON.parse(row.data), archived: Boolean(row.archived) })),
      bills: this.sql.exec('SELECT data FROM bills').toArray().map(row => JSON.parse(row.data))
    };
  }

  importBackup(input) {
    if (input.version !== 1 || !Array.isArray(input.households) || !Array.isArray(input.bills)) {
      throw new ApiError(400, 'Tệp sao lưu không hợp lệ.');
    }

    return this.storage.transactionSync(() => {
      const { populated } = this.sql.exec(`
        SELECT EXISTS(SELECT 1 FROM households) OR EXISTS(SELECT 1 FROM bills) AS populated
      `).one();
      if (populated) throw new ApiError(409, 'Chỉ có thể nhập bản sao lưu khi chưa có hộ thuê hoặc phiếu.');

      const now = new Date().toISOString();
      const householdIds = new Set();
      for (const entry of input.households) {
        const row = object(entry);
        const id = text(row.id, 'Mã hộ thuê', true);
        if (householdIds.has(id)) throw new ApiError(409, 'Bản sao lưu có mã hộ thuê trùng.');
        householdIds.add(id);
        const opening = row.opening == null ? null : openingInput(object(row.opening), row.opening.recordedAt);
        this.#writeHousehold({
          id, ...householdInput(row),
          ...(opening && { opening, initialMeters: opening.initialMeters }),
          createdAt: text(row.createdAt ?? now, 'Ngày tạo hộ thuê', true),
          updatedAt: text(row.updatedAt ?? now, 'Ngày cập nhật hộ thuê', true)
        }, row.archived === true);
      }

      const billIds = new Set();
      const periods = new Set();
      for (const entry of input.bills) {
        const bill = importBill(object(entry), now);
        const period = JSON.stringify([bill.householdId, bill.year, bill.month]);
        if (billIds.has(bill.id) || periods.has(period)) {
          throw new ApiError(409, 'Bản sao lưu có phiếu trùng. Vui lòng đối soát phiếu theo hộ và tháng trước khi nhập.');
        }
        billIds.add(bill.id);
        periods.add(period);
        this.#writeBill(bill);
      }

      this.updatePrices(object(input.prices ?? defaultPrices));
      return { households: householdIds.size, bills: billIds.size };
    });
  }

  #getHousehold(id, includeArchived = false) {
    const [row] = this.sql.exec('SELECT data FROM households WHERE id = ? AND (archived = 0 OR ? = 1)',
      id, Number(includeArchived)).toArray();
    if (!row) throw new ApiError(404, 'Không tìm thấy hộ thuê.');
    return JSON.parse(row.data);
  }

  #writeHousehold(household, archived = false) {
    this.sql.exec(`
      INSERT INTO households (id, name, room, archived, data) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, room = excluded.room, data = excluded.data
    `, household.id, household.name, household.room, Number(archived), JSON.stringify(household));
  }

  #getBill(id) {
    const [row] = this.sql.exec('SELECT data FROM bills WHERE id = ? AND deleted = 0', id).toArray();
    if (!row) throw new ApiError(404, 'Không tìm thấy phiếu.');
    return JSON.parse(row.data);
  }

  #writeBill(bill) {
    this.sql.exec(`
      INSERT INTO bills (id, household_id, month, year, created_at, deleted, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET deleted = excluded.deleted, data = excluded.data
    `, bill.id, bill.householdId, bill.month, bill.year, bill.createdAt, Number(bill.isDeleted), JSON.stringify(bill));
  }

  #startingReadings(household, billYear, billMonth) {
    const [row] = this.sql.exec(`
      SELECT data FROM bills WHERE household_id = ? AND deleted = 0 AND (year, month) < (?, ?)
      AND json_extract(data, '$.draft') IS NOT 1
      ORDER BY year DESC, month DESC LIMIT 1
    `, household.id, billYear, billMonth).toArray();
    const last = row ? JSON.parse(row.data).usage : null;
    const { opening } = household;
    const initialMeters = opening?.initialMeters ?? household.initialMeters;
    const electricOld = last?.electricNew ?? initialMeters.electric;
    const waterOld = last?.waterNew ?? initialMeters.water;
    const rent = opening?.year === billYear && opening.month === billMonth ? opening.rent : household.rent;
    return { electricOld, electricNew: electricOld, waterOld, waterNew: waterOld, lightingUnits: 1, rent };
  }

  #ensureMonthlyBills(billYear, billMonth, householdId) {
    this.storage.transactionSync(() => {
      const missing = this.sql.exec(`
        SELECT h.data FROM households h
        WHERE h.archived = 0 AND (? IS NULL OR h.id = ?)
        AND NOT EXISTS (
          SELECT 1 FROM bills b WHERE b.household_id = h.id AND b.year = ? AND b.month = ?
        )
      `, householdId, householdId, billYear, billMonth).toArray();
      if (!missing.length) return;

      const rates = this.getPrices();
      const now = new Date().toISOString();
      for (const row of missing) {
        const household = JSON.parse(row.data);
        if (beforeOpening(household, billYear, billMonth)) continue;
        const readings = this.#startingReadings(household, billYear, billMonth);
        this.#writeBill({
          id: crypto.randomUUID(), householdId: household.id, year: billYear, month: billMonth,
          ...computeBill(household, rates, readings), status: 'pending', paidAt: null,
          createdAt: now, updatedAt: now, isDeleted: false, draft: true
        });
      }
    });
  }
}
