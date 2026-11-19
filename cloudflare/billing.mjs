export const defaultPrices = { electric: 2300, water: 12000, lighting: 20000 };
export const meterFields = ['electricOld', 'electricNew', 'waterOld', 'waterNew', 'lightingUnits'];
export const billingFields = [...meterFields, 'rent'];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'Dữ liệu phải là một đối tượng JSON.');
  }
  return value;
}

export function text(value, label, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > 1000 || (required && !value.trim())) {
    throw new ApiError(400, `${label} không hợp lệ.`);
  }
  return value.trim();
}

function numeric(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const result = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new ApiError(400, `${label} không hợp lệ.`);
  }
  return result;
}

export function month(value) {
  const result = numeric(value, 'Tháng', 1, 12);
  if (!Number.isInteger(result)) throw new ApiError(400, 'Tháng không hợp lệ.');
  return result;
}

export function year(value) {
  const result = numeric(value, 'Năm', 1, 9999);
  if (!Number.isInteger(result)) throw new ApiError(400, 'Năm không hợp lệ.');
  return result;
}

export function prices(input, previous = {}) {
  const result = { ...previous };
  for (const key of Object.keys(defaultPrices)) {
    if (Object.hasOwn(input, key)) {
      result[key] = input[key] == null || input[key] === '' ? null : numeric(input[key], 'Đơn giá');
    }
  }
  return result;
}

export function householdInput(input, previous = {}) {
  const initialMeters = { electric: 0, water: 0, ...previous.initialMeters };
  if (input.initialMeters != null) {
    const data = object(input.initialMeters);
    for (const key of Object.keys(initialMeters)) {
      if (Object.hasOwn(data, key)) initialMeters[key] = numeric(data[key] ?? 0, 'Chỉ số bàn giao');
    }
  }

  return {
    name: text(input.name ?? previous.name, 'Tên hộ thuê', true),
    phone: text(input.phone === undefined ? previous.phone : input.phone, 'Số điện thoại'),
    room: text(input.room === undefined ? previous.room : input.room, 'Số phòng'),
    rent: numeric(input.rent === undefined ? previous.rent ?? 0 : input.rent ?? 0, 'Tiền nhà'),
    priceOverrides: prices(object(input.priceOverrides ?? {}), previous.priceOverrides),
    initialMeters
  };
}

export function openingInput(input, recordedAt) {
  const meters = object(input.initialMeters);
  return {
    month: month(input.month),
    year: year(input.year),
    rent: numeric(input.rent, 'Tiền phòng đầu kỳ'),
    initialMeters: {
      electric: numeric(meters.electric, 'Chỉ số điện đầu kỳ'),
      water: numeric(meters.water, 'Chỉ số nước đầu kỳ')
    },
    recordedAt: text(recordedAt, 'Ngày ghi nhận đầu kỳ', true)
  };
}

export function beforeOpening(household, billYear, billMonth) {
  const opening = household.opening;
  return opening && (billYear < opening.year || (billYear === opening.year && billMonth < opening.month));
}

export function computeBill(household, defaultRates, input) {
  const usage = {};
  for (const name of meterFields) usage[name] = numeric(input[name], 'Chỉ số');
  if (usage.electricNew < usage.electricOld || usage.waterNew < usage.waterOld) {
    throw new ApiError(400, 'Chỉ số mới phải lớn hơn hoặc bằng chỉ số cũ.');
  }

  usage.electricUnits = usage.electricNew - usage.electricOld;
  usage.waterUnits = usage.waterNew - usage.waterOld;
  const rates = household.priceOverrides;
  const amounts = {
    electric: usage.electricUnits * (rates.electric ?? defaultRates.electric),
    water: usage.waterUnits * (rates.water ?? defaultRates.water),
    rent: numeric(input.rent ?? household.rent, 'Tiền nhà'),
    lighting: usage.lightingUnits * (rates.lighting ?? defaultRates.lighting)
  };
  amounts.total = numeric(amounts.electric + amounts.water + amounts.rent + amounts.lighting, 'Tổng tiền');
  return { usage, amounts };
}

export function status(value) {
  if (value !== 'pending' && value !== 'paid') {
    throw new ApiError(400, 'Trạng thái phiếu không hợp lệ.');
  }
  return value;
}

export function importBill(input, now) {
  const usage = object(input.usage ?? {});
  const amounts = object(input.amounts ?? {});
  const numbers = (keys, source) => Object.fromEntries(keys.map(key => [
    key, numeric(source[key] ?? 0, `Giá trị ${key}`, -Number.MAX_SAFE_INTEGER)
  ]));

  return {
    id: text(input.id, 'Mã phiếu', true),
    householdId: text(input.householdId, 'Mã hộ thuê', true),
    month: month(input.month),
    year: year(input.year),
    usage: numbers([...meterFields, 'electricUnits', 'waterUnits'], usage),
    amounts: numbers(['electric', 'water', 'rent', 'lighting', 'total'], amounts),
    status: status(input.status ?? 'pending'),
    paidAt: input.paidAt == null ? null : text(input.paidAt, 'Ngày thanh toán', true),
    createdAt: text(input.createdAt ?? now, 'Ngày tạo phiếu', true),
    updatedAt: text(input.updatedAt ?? now, 'Ngày cập nhật phiếu', true),
    isDeleted: input.isDeleted === true,
    ...(input.draft === true && { draft: true })
  };
}
