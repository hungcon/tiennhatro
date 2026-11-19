import React, { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, InputNumber, message, Popconfirm, Row, Col, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined, SearchOutlined } from '@ant-design/icons'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || '/api'
const money = value => value ? `${Number(value).toLocaleString('vi-VN')} đ` : 'Áp dụng cấu hình'

function HouseholdForm({ open, onCancel, onSaved, initial }) {
  const [form] = Form.useForm()
  useEffect(() => { form.setFieldsValue(initial || { priceOverrides: {}, initialMeters: {} }) }, [initial, form, open])
  return <Modal open={open} onCancel={onCancel} onOk={() => form.validateFields().then(onSaved)} okText={initial ? 'Lưu thay đổi' : 'Thêm hộ'} cancelText="Huỷ" title={initial ? 'Chỉnh sửa hộ thuê' : 'Thêm hộ thuê mới'} width={660}>
    <Form form={form} layout="vertical"><Row gutter={14}>
      <Col xs={24} sm={12}><Form.Item name="name" label="Tên người thuê / hộ gia đình" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}><Input placeholder="Ví dụ: Nguyễn Văn An" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="room" label="Số phòng" rules={[{ required: true, message: 'Vui lòng nhập số phòng' }]}><Input placeholder="Ví dụ: P.101" /></Form.Item></Col>
      <Col xs={24}><Form.Item name="phone" label="Số điện thoại"><Input prefix={<PhoneOutlined />} placeholder="Nhập số điện thoại liên hệ" /></Form.Item></Col>
    </Row><div className="form-section-title">Chỉ số bàn giao đầu kỳ</div><p className="form-section-hint">Dành cho người thuê mới. Chỉ số này sẽ được dùng làm chỉ số cũ của phiếu tháng đầu tiên.</p><Row gutter={14}>
      <Col xs={24} sm={12}><Form.Item name={['initialMeters', 'electric']} label="Chỉ số điện lúc nhận phòng"><InputNumber min={0} precision={0} className="full-width" placeholder="Ví dụ: 13.500" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name={['initialMeters', 'water']} label="Chỉ số nước lúc nhận phòng"><InputNumber min={0} precision={0} className="full-width" placeholder="Ví dụ: 250" /></Form.Item></Col>
    </Row><div className="form-section-title">Giá áp dụng riêng (không bắt buộc)</div><Row gutter={14}>
      <Col xs={24} sm={8}><Form.Item name={['priceOverrides', 'electric']} label="Giá điện / kWh"><InputNumber min={0} className="full-width" placeholder="Theo cấu hình" /></Form.Item></Col>
      <Col xs={24} sm={8}><Form.Item name={['priceOverrides', 'water']} label="Giá nước / m³"><InputNumber min={0} className="full-width" placeholder="Theo cấu hình" /></Form.Item></Col>
      <Col xs={24} sm={8}><Form.Item name="rent" label="Tiền nhà mặc định"><InputNumber min={0} className="full-width" placeholder="0" /></Form.Item></Col>
    </Row></Form>
  </Modal>
}

export default function Households() {
  const [data, setData] = useState([]); const [open, setOpen] = useState(false); const [editing, setEditing] = useState(null); const [search, setSearch] = useState('')
  const load = async () => { try { const res = await axios.get(`${API}/households`); setData(res.data) } catch { message.error('Không thể tải danh sách hộ') } }
  useEffect(() => { load() }, [])
  const save = async values => { try { if (editing) await axios.put(`${API}/households/${editing.id}`, values); else await axios.post(`${API}/households`, values); message.success(editing ? 'Đã cập nhật hộ thuê' : 'Đã thêm hộ thuê'); setOpen(false); load() } catch { message.error('Không thể lưu thông tin') } }
  const del = async id => { await axios.delete(`${API}/households/${id}`); message.success('Đã xoá hộ thuê'); load() }
  const columns = [
    { title: 'Phòng', dataIndex: 'room', sorter: (a, b) => String(a.room).localeCompare(String(b.room)), render: room => <span className="room-pill">{room || '—'}</span> },
    { title: 'Người thuê', render: (_, r) => <div><b>{r.name}</b><span className="table-sub">{r.phone || 'Chưa có số điện thoại'}</span></div> },
    { title: 'Tiền nhà', dataIndex: 'rent', render: value => <b>{money(value)}</b>, responsive: ['md'] },
    { title: 'Đơn giá riêng', render: (_, r) => r.priceOverrides?.electric || r.priceOverrides?.water ? <Tag color="blue">Đã thiết lập</Tag> : <Tag>Giá chung</Tag>, responsive: ['md'] },
    { title: 'Thao tác', render: (_, r) => <div className="table-actions"><Button type="text" icon={<EditOutlined />} onClick={() => { setEditing(r); setOpen(true) }}>Sửa</Button><Popconfirm title="Xoá hộ thuê này?" description="Các phiếu cũ vẫn được giữ lại." onConfirm={() => del(r.id)} okText="Xoá" cancelText="Huỷ"><Button danger type="text" icon={<DeleteOutlined />}>Xoá</Button></Popconfirm></div> },
  ]
  const filtered = data.filter(h => `${h.name} ${h.room} ${h.phone}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <div className="page-stack"><section className="page-toolbar"><div><span className="eyebrow">DANH SÁCH NGƯỜI THUÊ</span><h2>{data.length} hộ gia đình đang quản lý</h2></div><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setOpen(true) }}>Thêm hộ thuê</Button></section>
    <Card className="surface-card" title="Danh sách hộ gia đình" extra={<Input prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, phòng..." className="household-search" allowClear />}><div className="desktop-table"><Table dataSource={filtered} columns={columns} rowKey="id" pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 680 }} /></div><div className="mobile-record-list">{filtered.map(h => <article className="mobile-record" key={h.id}><div className="mobile-record-top"><div><span className="room-pill">{h.room || '—'}</span><b>{h.name}</b></div>{h.priceOverrides?.electric || h.priceOverrides?.water ? <Tag color="blue">Giá riêng</Tag> : <Tag>Giá chung</Tag>}</div><div className="mobile-record-meta"><span>{h.phone || 'Chưa có số điện thoại'}</span><span>Tiền nhà: <b>{money(h.rent)}</b></span></div><div className="mobile-record-actions"><Button onClick={() => { setEditing(h); setOpen(true) }}>Sửa</Button><Popconfirm title="Xoá hộ thuê này?" onConfirm={() => del(h.id)}><Button danger type="text">Xoá</Button></Popconfirm></div></article>)}</div></Card>
    <HouseholdForm open={open} initial={editing} onCancel={() => setOpen(false)} onSaved={save} />
  </div>
}
