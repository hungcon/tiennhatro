import React, { useEffect, useMemo, useState } from 'react'
import { Card, Form, Select, InputNumber, Button, Table, Modal, DatePicker, Row, Col, Tag, message, Popconfirm, Divider } from 'antd'
import { PlusOutlined, EyeOutlined, CheckCircleOutlined, DeleteOutlined, ThunderboltOutlined, DropboxOutlined, HomeOutlined, EditOutlined } from '@ant-design/icons'
import axios from 'axios'
import QRCode from 'qrcode.react'
import dayjs from 'dayjs'

const API = import.meta.env.VITE_API_URL || '/api'
const money = value => `${Number(value || 0).toLocaleString('vi-VN')} đ`
const disableFutureMonth = date => date && date.endOf('month').isAfter(dayjs().endOf('month'))

export default function Billing() {
  const [households, setHouseholds] = useState([]); const [bills, setBills] = useState([]); const [selected, setSelected] = useState(null); const [editOnOpen, setEditOnOpen] = useState(false); const [manualOpen, setManualOpen] = useState(false)
  const [form] = Form.useForm(); const [manualForm] = Form.useForm(); const [period, setPeriod] = useState(dayjs())
  const load = async () => { try { const [h, b] = await Promise.all([axios.get(`${API}/households`), axios.get(`${API}/bills`, { params: { month: period.month() + 1, year: period.year() } })]); setHouseholds(h.data); setBills(b.data) } catch { message.error('Không thể tải dữ liệu') } }
  useEffect(() => { load() }, [period])
  const selectedHousehold = Form.useWatch('householdId', form); const draft = useMemo(() => bills.find(b => b.householdId === selectedHousehold), [bills, selectedHousehold])
  const updateReadings = async values => { try { await axios.post(`${API}/bills`, { ...values, month: period.month() + 1, year: period.year() }); message.success('Đã cập nhật chỉ số và phiếu thu'); form.resetFields(['householdId', 'electricNew', 'waterNew']); load() } catch (error) { message.error(error.response?.data?.error || 'Không thể lưu phiếu') } }
  const createManual = async values => { try { await axios.post(`${API}/bills`, { ...values, manual: true, month: period.month() + 1, year: period.year() }); message.success('Đã lưu phiếu thủ công'); setManualOpen(false); manualForm.resetFields(); load() } catch (error) { message.error(error.response?.data?.error || 'Không thể lưu phiếu') } }
  const updateStatus = async (bill, status) => { try { await axios.put(`${API}/bills/${bill.id}`, { status }); message.success(status === 'paid' ? 'Đã ghi nhận thanh toán' : 'Đã cập nhật phiếu'); load(); setSelected(current => current?.id === bill.id ? { ...current, status } : current) } catch (error) { message.error(error.response?.data?.error || 'Không thể cập nhật') } }
  const updateBill = async (bill, values) => { try { const { data } = await axios.put(`${API}/bills/${bill.id}`, values); message.success('Đã cập nhật phiếu'); setSelected({ ...data, household: bill.household }); load() } catch (error) { message.error(error.response?.data?.error || 'Không thể cập nhật phiếu') } }
  const remove = async id => { try { await axios.delete(`${API}/bills/${id}`); message.success('Đã xoá phiếu'); setSelected(null); load() } catch { message.error('Không thể xoá phiếu') } }
  const columns = [
    { title: 'Hộ thuê', render: (_, b) => <div><b>{b.household?.name || households.find(h => h.id === b.householdId)?.name || 'Hộ đã xoá'}</b><span className="table-sub">Phòng {b.household?.room || households.find(h => h.id === b.householdId)?.room || '—'}</span></div> },
    { title: 'Chỉ số điện', render: (_, b) => `${b.usage?.electricOld ?? 0} → ${b.usage?.electricNew ?? 0}`, responsive: ['md'] }, { title: 'Chỉ số nước', render: (_, b) => `${b.usage?.waterOld ?? 0} → ${b.usage?.waterNew ?? 0}`, responsive: ['lg'] },
    { title: 'Tổng cần đóng', dataIndex: ['amounts', 'total'], render: v => <b className="total-cell">{money(v)}</b> }, { title: 'Trạng thái', dataIndex: 'status', render: s => <Tag color={s === 'paid' ? 'success' : 'gold'}>{s === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}</Tag> },
    { title: 'Thao tác', render: (_, b) => <div className="table-actions"><Button type="text" icon={<EyeOutlined />} onClick={() => { setEditOnOpen(false); setSelected(b) }}>Xem</Button>{b.status !== 'paid' && <Button type="text" icon={<EditOutlined />} onClick={() => { setEditOnOpen(true); setSelected(b) }}>Sửa</Button>}<Popconfirm title="Xoá phiếu này?" description="Thao tác không thể hoàn tác." onConfirm={() => remove(b.id)}><Button danger type="text" icon={<DeleteOutlined />}>Xoá</Button></Popconfirm></div> },
  ]
  const householdOptions = households.map(h => ({ value: h.id, label: `${h.room ? `Phòng ${h.room} · ` : ''}${h.name}` }))
  return <div className="page-stack">
    <section className="page-toolbar"><div><span className="eyebrow">LẬP PHIẾU THU</span><h2>Phiếu tháng {period.format('MM/YYYY')}</h2></div><DatePicker picker="month" allowClear={false} disabledDate={disableFutureMonth} value={period} onChange={setPeriod} format="MM/YYYY" /></section>
    <Card className="surface-card bill-form-card" title="Nhập chỉ số tháng này" extra={<Button type="link" icon={<PlusOutlined />} onClick={() => setManualOpen(true)}>Tạo phiếu thủ công</Button>}>
      <Form form={form} layout="vertical" onFinish={updateReadings}><Row gutter={[14, 0]}><Col xs={24} md={8}><Form.Item name="householdId" label="Hộ thuê" rules={[{ required: true, message: 'Vui lòng chọn hộ thuê' }]}><Select showSearch optionFilterProp="label" placeholder="Chọn hộ / phòng" options={householdOptions} /></Form.Item></Col><Col xs={12} md={5}><Form.Item name="electricNew" label={`Điện mới${draft ? ` · cũ ${draft.usage?.electricOld ?? 0}` : ''}`} rules={[{ required: true, message: 'Nhập chỉ số' }]}><InputNumber min={draft?.usage?.electricOld || 0} precision={0} placeholder="Nhập chỉ số" className="full-width" /></Form.Item></Col><Col xs={12} md={5}><Form.Item name="waterNew" label={`Nước mới${draft ? ` · cũ ${draft.usage?.waterOld ?? 0}` : ''}`} rules={[{ required: true, message: 'Nhập chỉ số' }]}><InputNumber min={draft?.usage?.waterOld || 0} precision={0} placeholder="Nhập chỉ số" className="full-width" /></Form.Item></Col><Col xs={24} md={6} className="form-action"><Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Lưu chỉ số</Button></Col></Row></Form>
      <div className="form-hint">Phiếu tháng này đã được tạo sẵn. Chỉ số cũ được lấy tự động từ chỉ số mới của tháng trước; tiền nhà, chiếu sáng và đơn giá được áp dụng tự động.</div>
    </Card>
    <Card className="surface-card" title={<div><span className="eyebrow">DANH SÁCH PHIẾU</span><h3>{bills.length} phiếu trong tháng</h3></div>}><div className="desktop-table"><Table columns={columns} dataSource={bills} rowKey="id" pagination={{ pageSize: 8 }} scroll={{ x: 820 }} /></div><div className="mobile-record-list">{bills.map(b => <article className="mobile-record" key={b.id}><div className="mobile-record-top"><div><span className="room-pill">{b.household?.room || households.find(h => h.id === b.householdId)?.room || '—'}</span><b>{b.household?.name || households.find(h => h.id === b.householdId)?.name || 'Hộ đã xoá'}</b></div><Tag color={b.status === 'paid' ? 'success' : 'gold'}>{b.status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}</Tag></div><div className="mobile-record-meta"><span>⚡ {b.usage?.electricOld ?? 0} → {b.usage?.electricNew ?? 0}</span><span>💧 {b.usage?.waterOld ?? 0} → {b.usage?.waterNew ?? 0}</span></div><div className="mobile-record-total"><span>Tổng cần đóng</span><b>{money(b.amounts?.total)}</b></div><div className="mobile-record-actions"><Button onClick={() => { setEditOnOpen(false); setSelected(b) }}>Xem</Button>{b.status !== 'paid' && <Button type="primary" ghost onClick={() => { setEditOnOpen(true); setSelected(b) }}>Sửa</Button>}<Popconfirm title="Xoá phiếu này?" onConfirm={() => remove(b.id)}><Button danger type="text">Xoá</Button></Popconfirm></div></article>)}</div></Card>
    <Modal open={!!selected} onCancel={() => { setSelected(null); setEditOnOpen(false) }} footer={null} width={720} className="receipt-modal">{selected && <Receipt bill={selected} startEditing={editOnOpen} household={selected.household || households.find(h => h.id === selected.householdId)} onPaid={() => updateStatus(selected, 'paid')} onDelete={() => remove(selected.id)} onSave={values => updateBill(selected, values)} />}</Modal>
    <Modal open={manualOpen} title="Tạo phiếu thu thủ công" okText="Lưu phiếu" cancelText="Huỷ" onCancel={() => setManualOpen(false)} onOk={() => manualForm.validateFields().then(createManual)} width={700}>
      <ManualForm form={manualForm} householdOptions={householdOptions} bills={bills} households={households} />
    </Modal>
  </div>
}

function ManualForm({ form, householdOptions, bills, households }) {
  const householdId = Form.useWatch('householdId', form)
  useEffect(() => {
    if (!householdId) return
    const draft = bills.find(bill => bill.householdId === householdId)
    const household = households.find(item => item.id === householdId)
    const usage = draft?.usage || {}; const amounts = draft?.amounts || {}
    form.setFieldsValue({
      electricOld: usage.electricOld ?? household?.initialMeters?.electric ?? 0,
      electricNew: usage.electricOld ?? household?.initialMeters?.electric ?? 0,
      waterOld: usage.waterOld ?? household?.initialMeters?.water ?? 0,
      waterNew: usage.waterOld ?? household?.initialMeters?.water ?? 0,
      rent: amounts.rent ?? household?.rent ?? 0,
      lightingUnits: usage.lightingUnits ?? 1,
    })
  }, [householdId, bills, households, form])
  return <Form form={form} layout="vertical" initialValues={{ lightingUnits: 1 }}><div className="form-hint manual-prefill-hint">Sau khi chọn hộ, chỉ số cũ và các khoản cố định được lấy tự động từ phiếu tháng trước.</div><Row gutter={14}><Col xs={24}><Form.Item name="householdId" label="Hộ thuê" rules={[{ required: true, message: 'Vui lòng chọn hộ thuê' }]}><Select showSearch optionFilterProp="label" placeholder="Chọn hộ / phòng" options={householdOptions} /></Form.Item></Col><Col xs={12}><Form.Item name="electricOld" label="Điện cũ" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="electricNew" label="Điện mới" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="waterOld" label="Nước cũ" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="waterNew" label="Nước mới" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="rent" label="Tiền nhà"><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="lightingUnits" label="Số phần chiếu sáng"><InputNumber min={0} className="full-width" /></Form.Item></Col></Row></Form>
}

function Receipt({ bill, household, onPaid, onDelete, onSave, startEditing }) {
  const [editing, setEditing] = useState(startEditing); const [editForm] = Form.useForm(); const a = bill.amounts || {}; const u = bill.usage || {}
  useEffect(() => { if (startEditing) { editForm.setFieldsValue({ electricOld: u.electricOld, electricNew: u.electricNew, waterOld: u.waterOld, waterNew: u.waterNew, rent: a.rent, lightingUnits: u.lightingUnits }); setEditing(true) } }, [startEditing, bill.id])
  const startEdit = () => { editForm.setFieldsValue({ electricOld: u.electricOld, electricNew: u.electricNew, waterOld: u.waterOld, waterNew: u.waterNew, rent: a.rent, lightingUnits: u.lightingUnits }); setEditing(true) }
  const unitPrice = (amount, units) => units ? Math.round(Number(amount || 0) / units) : 0
  const electricUnits = Math.max(0, Number(u.electricNew || 0) - Number(u.electricOld || 0)); const waterUnits = Math.max(0, Number(u.waterNew || 0) - Number(u.waterOld || 0)); const lightingUnits = Number(u.lightingUnits || 0)
  const rows = [
    [<ThunderboltOutlined />, 'Tiền điện', `${u.electricOld ?? 0} → ${u.electricNew ?? 0} kWh · ${electricUnits} kWh × ${money(unitPrice(a.electric, electricUnits))}/kWh`, a.electric],
    [<DropboxOutlined />, 'Tiền nước', `${u.waterOld ?? 0} → ${u.waterNew ?? 0} m³ · ${waterUnits} m³ × ${money(unitPrice(a.water, waterUnits))}/m³`, a.water],
    [<HomeOutlined />, 'Tiền nhà', 'Theo thỏa thuận', a.rent],
    ['✦', 'Chiếu sáng', `${lightingUnits} phần × ${money(unitPrice(a.lighting, lightingUnits))}/phần`, a.lighting],
  ]
  const transfer = `Chuyen khoan tien tro ${String(household?.room || '')} ${bill.month}/${bill.year} ${a.total || 0}`
  return <div className="receipt"><div className="receipt-heading"><div><span className="eyebrow">PHIẾU THANH TOÁN</span><h2>Tháng {String(bill.month).padStart(2, '0')}/{bill.year}</h2><p>Phòng {household?.room || '—'} · {household?.name || 'Hộ thuê'}</p></div><Tag color={bill.status === 'paid' ? 'success' : 'gold'}>{bill.status === 'paid' ? 'ĐÃ THANH TOÁN' : 'CHỜ THANH TOÁN'}</Tag></div>
    {editing ? <><Divider /><ManualFields form={editForm} /><div className="receipt-actions"><Button onClick={() => setEditing(false)}>Huỷ</Button><Button type="primary" onClick={() => editForm.validateFields().then(values => { onSave(values); setEditing(false) })}>Lưu thay đổi</Button></div></> : <><div className="receipt-lines">{rows.map(([icon, label, detail, amount]) => <div className="receipt-line" key={label}><span className="line-icon">{icon}</span><span><b>{label}</b><small>{detail}</small></span><b>{money(amount)}</b></div>)}</div><div className="receipt-total"><span>Tổng tiền cần thanh toán</span><strong>{money(a.total)}</strong></div><Divider /><div className="payment-box"><div className="qr-wrap"><QRCode value={transfer} size={126} /></div><div><span className="eyebrow">THANH TOÁN CHUYỂN KHOẢN</span><h3>Quét mã QR để thanh toán</h3><p>Nội dung: <b>{transfer}</b></p><p className="muted">Vui lòng kiểm tra số tiền trước khi xác nhận.</p></div></div><div className="receipt-actions">{bill.status !== 'paid' && <><Button icon={<EditOutlined />} onClick={startEdit}>Sửa phiếu</Button><Button type="primary" icon={<CheckCircleOutlined />} onClick={onPaid}>Xác nhận đã thanh toán</Button></>}<Popconfirm title="Xoá phiếu này?" description="Thao tác không thể hoàn tác." onConfirm={onDelete}><Button danger icon={<DeleteOutlined />}>Xoá phiếu</Button></Popconfirm></div></>}
  </div>
}

function ManualFields({ form }) { return <Form form={form} layout="vertical"><Row gutter={14}><Col xs={12}><Form.Item name="electricOld" label="Điện cũ" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="electricNew" label="Điện mới" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="waterOld" label="Nước cũ" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="waterNew" label="Nước mới" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="rent" label="Tiền nhà"><InputNumber min={0} className="full-width" /></Form.Item></Col><Col xs={12}><Form.Item name="lightingUnits" label="Số phần chiếu sáng"><InputNumber min={0} className="full-width" /></Form.Item></Col></Row></Form> }
