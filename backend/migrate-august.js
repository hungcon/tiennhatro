const mongoose = require('mongoose');

const year = Number(process.env.MIGRATION_YEAR || new Date().getFullYear());
const month = 8;
const rows = [
  ['Chiến Đoài', 13209, 13353, 835, 844, 388800, 126000, 1300000, 20000, 1834800],
  ['Tuyến Hà', 13149, 13405, 736, 750, 691200, 196000, 1300000, 20000, 2207200],
  ['Đại Tuyền', 6462, 6727, 592, 610, 715500, 252000, 1300000, 20000, 2287500],
  ['Thuận Huyền', 19681, 19878, 890, 900, 531900, 140000, 2000000, 20000, 2691900],
  ['Tùng', 13910, 14196, 593, 603, 772200, 140000, 1300000, 20000, 2232200],
  ['Trang', 7983, 8090, 326, 329, 288900, 42000, 1300000, 20000, 1651900],
];

const configSchema = new mongoose.Schema({ electric: Number, water: Number, lighting: Number }, { collection: 'config' });
const householdSchema = new mongoose.Schema({ name: String, phone: String, room: String, rent: Number, priceOverrides: Object });
const billSchema = new mongoose.Schema({ householdId: mongoose.Schema.Types.ObjectId, month: Number, year: Number, usage: Object, amounts: Object, status: String }, { timestamps: true });
const Config = mongoose.model('Config', configSchema);
const Household = mongoose.model('Household', householdSchema);
const Bill = mongoose.model('Bill', billSchema);

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/tiennhatro');
  await Config.findOneAndUpdate({}, { electric: 2700, water: 14000, lighting: 20000 }, { upsert: true, new: true });
  let inserted = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const [name, electricOld, electricNew, waterOld, waterNew, electric, water, rent, lighting, total] = rows[index];
    let household = await Household.findOne({ name: new RegExp(`^${name}$`, 'i') });
    if (!household) household = await Household.create({ name, room: `P.${String(index + 1).padStart(2, '0')}`, rent });
    else if (!household.rent) { household.rent = rent; await household.save(); }
    const usage = { electricOld, electricNew, electricUnits: electricNew - electricOld, waterOld, waterNew, waterUnits: waterNew - waterOld, lightingUnits: 1 };
    const amounts = { electric, water, rent, lighting, total };
    const result = await Bill.updateOne({ householdId: household._id, month, year }, { $set: { usage, amounts, status: 'pending' } }, { upsert: true });
    if (result.upsertedCount) inserted += 1;
  }
  console.log(`Đã migrate ${rows.length} phiếu tháng ${month}/${year}; tạo mới ${inserted} phiếu.`);
  await mongoose.disconnect();
}
run().catch(async error => { console.error(error); await mongoose.disconnect(); process.exitCode = 1; });
