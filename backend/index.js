const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/tiennhatro';
mongoose.set('strictQuery', false);
mongoose.connect(MONGO_URI).then(() => console.log('Connected to MongoDB')).catch(err => console.error('Mongo connect error', err));

const configSchema = new mongoose.Schema({ electric: Number, water: Number, lighting: Number }, { collection: 'config' });
const householdSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, phone: String, room: String, rent: { type: Number, default: 0 },
  priceOverrides: { electric: Number, water: Number, lighting: Number },
  initialMeters: { electric: { type: Number, default: 0 }, water: { type: Number, default: 0 } },
}, { timestamps: true });
const billSchema = new mongoose.Schema({
  householdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Household', required: true }, month: Number, year: Number,
  usage: { electricOld: Number, electricNew: Number, electricUnits: Number, waterOld: Number, waterNew: Number, waterUnits: Number, lightingUnits: Number },
  amounts: { electric: Number, water: Number, rent: Number, lighting: Number, total: Number },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' }, paidAt: Date, isDeleted: { type: Boolean, default: false },
}, { timestamps: true });
const serialize = schema => schema.set('toJSON', { virtuals: true, transform: (_, ret) => { ret.id = String(ret._id); delete ret._id; delete ret.__v; return ret; } });
serialize(householdSchema); serialize(billSchema);
const Config = mongoose.model('Config', configSchema);
const Household = mongoose.model('Household', householdSchema);
const Bill = mongoose.model('Bill', billSchema);

const app = express(); app.use(cors()); app.use(express.json());
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) { app.use(express.static(publicPath)); app.get('*', (req, res, next) => fs.existsSync(path.join(publicPath, 'index.html')) ? res.sendFile(path.join(publicPath, 'index.html')) : next()); }
const asyncRoute = fn => (req, res) => fn(req, res).catch(err => { console.error(err); res.status(500).json({ error: err.message }); });
const number = value => Number(value || 0);

async function config() { let value = await Config.findOne(); if (!value) { value = await Config.create({ electric: 2300, water: 12000, lighting: 20000 }); } return value; }
function computeBillFor(household, prices, input) {
  const usage = {
    electricOld: number(input.electricOld), electricNew: number(input.electricNew), waterOld: number(input.waterOld), waterNew: number(input.waterNew), lightingUnits: number(input.lightingUnits),
  };
  usage.electricUnits = Math.max(0, usage.electricNew - usage.electricOld);
  usage.waterUnits = Math.max(0, usage.waterNew - usage.waterOld);
  const overrides = household.priceOverrides || {};
  const electricPrice = number(overrides.electric) || number(prices.electric);
  const waterPrice = number(overrides.water) || number(prices.water);
  const lightingPrice = number(overrides.lighting) || number(prices.lighting);
  const rent = input.rent === undefined || input.rent === null || input.rent === '' ? number(household.rent) : number(input.rent);
  const amounts = { electric: usage.electricUnits * electricPrice, water: usage.waterUnits * waterPrice, rent, lighting: usage.lightingUnits * lightingPrice };
  amounts.total = amounts.electric + amounts.water + amounts.rent + amounts.lighting;
  return { usage, amounts };
}

async function ensureMonthlyBills(month, year) {
  const households = await Household.find();
  const prices = await config();
  await Promise.all(households.map(async household => {
    const existing = await Bill.findOne({ householdId: household._id, month, year });
    if (existing) return;
    const previous = await Bill.findOne({ householdId: household._id, $or: [{ year: { $lt: year } }, { year, month: { $lt: month } }] }).sort({ year: -1, month: -1 });
    const usage = previous && previous.usage ? previous.usage : {};
    const initialMeters = household.initialMeters || {};
    const electricStart = previous ? number(usage.electricNew) : number(initialMeters.electric);
    const waterStart = previous ? number(usage.waterNew) : number(initialMeters.water);
    const computed = computeBillFor(household, prices, {
      electricOld: electricStart, electricNew: electricStart,
      waterOld: waterStart, waterNew: waterStart, lightingUnits: 1,
    });
    await Bill.create({ householdId: household._id, month, year, ...computed, status: 'pending' });
  }));
}

app.get('/api/config/prices', asyncRoute(async (_, res) => res.json(await config())));
app.put('/api/config/prices', asyncRoute(async (req, res) => { const value = await config(); ['electric', 'water', 'lighting'].forEach(key => { if (req.body[key] !== undefined) value[key] = number(req.body[key]); }); await value.save(); res.json(value); }));

app.get('/api/households', asyncRoute(async (_, res) => { const rows = await Household.find().sort({ room: 1, name: 1 }); res.json(rows.map(row => row.toJSON())); }));
app.post('/api/households', asyncRoute(async (req, res) => { const row = await Household.create(req.body); res.status(201).json(row.toJSON()); }));
app.put('/api/households/:id', asyncRoute(async (req, res) => { const row = await Household.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!row) return res.status(404).json({ error: 'Không tìm thấy hộ thuê' }); res.json(row.toJSON()); }));
app.delete('/api/households/:id', asyncRoute(async (req, res) => { const row = await Household.findByIdAndDelete(req.params.id); if (!row) return res.status(404).json({ error: 'Không tìm thấy hộ thuê' }); res.json({ ok: true }); }));

app.post('/api/bills', asyncRoute(async (req, res) => {
  const { householdId, month, year } = req.body; const household = await Household.findById(householdId); if (!household) return res.status(404).json({ error: 'Không tìm thấy hộ thuê' });
  if (!month || !year) return res.status(400).json({ error: 'Tháng và năm là bắt buộc' });
  const billMonth = number(month); const billYear = number(year);
  let bill = await Bill.findOne({ householdId, month: billMonth, year: billYear });
  if (bill && bill.status === 'paid') return res.status(409).json({ error: 'Phiếu đã thanh toán, không thể thay đổi chỉ số.' });
  const oldUsage = bill && bill.usage ? bill.usage : {};
  const input = req.body.manual ? req.body : { ...oldUsage, ...req.body, electricOld: number(oldUsage.electricOld), waterOld: number(oldUsage.waterOld) };
  const computed = computeBillFor(household, await config(), input);
  if (bill) { Object.assign(bill, computed, { isDeleted: false }); await bill.save(); }
  else bill = await Bill.create({ householdId, month: billMonth, year: billYear, ...computed });
  res.status(201).json((await bill.populate('householdId')).toJSON());
}));
app.get('/api/bills', asyncRoute(async (req, res) => { const q = { isDeleted: { $ne: true } }; if (req.query.month) q.month = number(req.query.month); if (req.query.year) q.year = number(req.query.year); if (q.month && q.year) await ensureMonthlyBills(q.month, q.year); if (req.query.householdId) q.householdId = req.query.householdId; const rows = await Bill.find(q).populate('householdId').sort({ year: -1, month: -1, createdAt: -1 }); res.json(rows.map(row => { const json = row.toJSON(); json.household = json.householdId && typeof json.householdId === 'object' ? json.householdId : null; if (json.household) json.householdId = json.household.id; return json; })); }));
app.put('/api/bills/:id', asyncRoute(async (req, res) => {
  const row = await Bill.findById(req.params.id); if (!row) return res.status(404).json({ error: 'Không tìm thấy phiếu' });
  const fields = ['electricOld', 'electricNew', 'waterOld', 'waterNew', 'lightingUnits', 'rent'];
  const hasBillingUpdate = fields.some(field => req.body[field] !== undefined);
  if (hasBillingUpdate) {
    if (row.status === 'paid') return res.status(409).json({ error: 'Phiếu đã thanh toán, không thể thay đổi chi phí.' });
    const household = await Household.findById(row.householdId); if (!household) return res.status(404).json({ error: 'Không tìm thấy hộ thuê' });
    const computed = computeBillFor(household, await config(), { ...(row.usage || {}), ...(row.amounts || {}), ...req.body });
    row.usage = computed.usage; row.amounts = computed.amounts;
  }
  if (req.body.status) { row.status = req.body.status; row.paidAt = req.body.status === 'paid' ? new Date() : null; }
  await row.save(); res.json(row.toJSON());
}));
app.delete('/api/bills/:id', asyncRoute(async (req, res) => { const row = await Bill.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true }); if (!row) return res.status(404).json({ error: 'Không tìm thấy phiếu' }); res.json({ ok: true }); }));

app.get('/api/dashboard', asyncRoute(async (req, res) => {
  const q = { isDeleted: { $ne: true } }; if (req.query.month) q.month = number(req.query.month); if (req.query.year) q.year = number(req.query.year); if (q.month && q.year) await ensureMonthlyBills(q.month, q.year); const rows = await Bill.find(q).populate('householdId').sort({ createdAt: -1 });
  const totals = rows.reduce((out, row) => { const a = row.amounts || {}; out.total += number(a.total); out.electric += number(a.electric); out.water += number(a.water); out.lighting += number(a.lighting); out.rent += number(a.rent); if (row.status === 'paid') out.paid += number(a.total); return out; }, { total: 0, paid: 0, electric: 0, water: 0, lighting: 0, rent: 0 });
  const households = await Household.countDocuments(); const bills = rows.map(row => { const json = row.toJSON(); json.household = json.householdId && typeof json.householdId === 'object' ? json.householdId : null; if (json.household) json.householdId = json.household.id; return json; }); res.json({ count: rows.length, households, bills, ...totals });
}));
const port = process.env.PORT || 4000; app.listen(port, () => console.log(`Backend listening on ${port}`));
