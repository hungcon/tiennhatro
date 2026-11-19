/* Imports the repeating monthly receipt blocks in tiennhatro.xlsx.
 * Usage from the backend container: npm run import
 * Existing household/bill records are matched, so the command is safe to repeat.
 */
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const defaultFile = fs.existsSync(path.join(__dirname, 'tiennhatro.xlsx')) ? path.join(__dirname, 'tiennhatro.xlsx') : path.join(__dirname, '..', '..', 'tiennhatro.xlsx');
const cleanPlaceholders = process.argv.includes('--clean-placeholders');
const file = process.argv.find(arg => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]) || defaultFile;
if (!fs.existsSync(file)) throw new Error(`Không tìm thấy file Excel: ${file}`);
const householdSchema = new mongoose.Schema({ name: String, room: String, phone: String, rent: Number, priceOverrides: Object });
const billSchema = new mongoose.Schema({ householdId: mongoose.Schema.Types.ObjectId, month: Number, year: Number, usage: Object, amounts: Object, status: String }, { timestamps: true });
const Household = mongoose.model('Household', householdSchema);
const Bill = mongoose.model('Bill', billSchema);
const number = value => Number(value || 0);
const normal = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/tiennhatro');
  if (cleanPlaceholders) {
    const removed = await Household.deleteMany({ name: /^Household \d+$/i, phone: { $in: ['', null] }, room: { $in: ['', null] } });
    console.log(`Đã dọn ${removed.deletedCount} hộ dữ liệu mẫu cũ.`);
  }
  const workbook = XLSX.readFile(file); const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
  let imported = 0; let households = 0; let year = Number(process.env.IMPORT_YEAR || new Date().getFullYear());
  for (const row of rows) {
    // The sample repeats this header before each monthly block.
    if (normal(row[0]) === 'tháng' && normal(row[1]) === 'tên') continue;
    const month = number(row[0]); const name = String(row[1] || '').trim();
    if (!month || month > 12 || !name || normal(name) === 'tên') continue;
    const electricOld = number(row[2]); const electricNew = number(row[3]); const waterOld = number(row[4]); const waterNew = number(row[5]);
    const amounts = { electric: number(row[6]), water: number(row[7]), rent: number(row[8]), lighting: number(row[9]), total: number(row[10]) };
    // If the worksheet contains Jan-Dec plus a second sequence, allow a new year.
    if (month === 1 && imported && row[0] < 2) year += 1;
    let household = await Household.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!household) { household = await Household.create({ name, rent: amounts.rent }); households += 1; }
    else if (!household.rent && amounts.rent) { household.rent = amounts.rent; await household.save(); }
    const usage = { electricOld, electricNew, electricUnits: Math.max(0, electricNew - electricOld), waterOld, waterNew, waterUnits: Math.max(0, waterNew - waterOld), lightingUnits: amounts.lighting ? 1 : 0 };
    const existing = await Bill.findOne({ householdId: household._id, month, year });
    if (!existing) { await Bill.create({ householdId: household._id, month, year, usage, amounts, status: 'pending' }); imported += 1; }
  }
  console.log(`Đã tạo ${households} hộ và import ${imported} phiếu từ ${path.basename(file)}.`);
  await mongoose.disconnect();
}
run().catch(async error => { console.error(error); await mongoose.disconnect(); process.exitCode = 1; });
