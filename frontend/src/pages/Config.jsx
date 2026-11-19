import React, { useEffect } from 'react'
import { Card, Form, InputNumber, Button, message, Row, Col } from 'antd'
import { ThunderboltOutlined, DropboxOutlined, BulbOutlined, SaveOutlined } from '@ant-design/icons'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || '/api'
const items = [
  { name: 'electric', title: 'Đơn giá điện', unit: 'đồng / kWh', icon: <ThunderboltOutlined />, tone: 'electric' },
  { name: 'water', title: 'Đơn giá nước', unit: 'đồng / m³', icon: <DropboxOutlined />, tone: 'water' },
  { name: 'lighting', title: 'Phí chiếu sáng', unit: 'đồng / phần', icon: <BulbOutlined />, tone: 'lighting' },
]
export default function Config() {
  const [form] = Form.useForm()
  useEffect(() => { axios.get(`${API}/config/prices`).then(r => form.setFieldsValue(r.data)).catch(() => message.error('Không thể tải cấu hình giá')) }, [form])
  const onFinish = async values => { try { await axios.put(`${API}/config/prices`, values); message.success('Đã lưu đơn giá mặc định') } catch { message.error('Không thể lưu cấu hình') } }
  return <div className="page-stack"><section className="page-toolbar"><div><span className="eyebrow">THIẾT LẬP HỆ THỐNG</span><h2>Đơn giá mặc định</h2></div></section>
    <Card className="surface-card config-card"><p className="intro">Đơn giá này được dùng khi lập phiếu mới. Bạn vẫn có thể đặt giá điện, nước riêng cho từng hộ trong mục <b>Hộ gia đình</b>.</p><Form form={form} layout="vertical" onFinish={onFinish}><Row gutter={[18, 18]}>{items.map(item => <Col xs={24} md={8} key={item.name}><div className={`price-setting ${item.tone}`}><span className="price-icon">{item.icon}</span><div><h3>{item.title}</h3><p>{item.unit}</p></div><Form.Item name={item.name} rules={[{ required: true, message: 'Vui lòng nhập đơn giá' }]}><InputNumber min={0} precision={0} controls={false} className="full-width" formatter={v => v ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''} parser={v => v?.replace(/\./g, '')} /></Form.Item></div></Col>)}</Row><Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large">Lưu đơn giá</Button></Form></Card>
  </div>
}
