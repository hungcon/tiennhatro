import React, { useEffect, useState } from 'react'
import { Card, DatePicker, Statistic, Row, Col, Table, Button, Empty, Tag } from 'antd'
import { WalletOutlined, FileTextOutlined, ThunderboltOutlined, TeamOutlined, ArrowRightOutlined } from '@ant-design/icons'
import axios from 'axios'
import dayjs from 'dayjs'

const API = import.meta.env.VITE_API_URL || '/api'
const money = value => `${Number(value || 0).toLocaleString('vi-VN')} đ`
const disableFutureMonth = date => date && date.endOf('month').isAfter(dayjs().endOf('month'))

export default function Dashboard({ onNavigate }) {
  const [month, setMonth] = useState(dayjs())
  const [data, setData] = useState({ count: 0, total: 0, households: 0, paid: 0, electric: 0, water: 0, bills: [] })
  const load = async date => {
    const m = date || month
    try { const res = await axios.get(`${API}/dashboard`, { params: { month: m.month() + 1, year: m.year() } }); setData(res.data) } catch { setData(current => ({ ...current, bills: [] })) }
  }
  useEffect(() => { load(month) }, [month])
  const columns = [
    { title: 'Phòng / hộ', render: (_, b) => <div><b>{b.household?.room || '—'}</b><span className="table-sub">{b.household?.name || 'Hộ đã xoá'}</span></div> },
    { title: 'Tiền nhà', dataIndex: ['amounts', 'rent'], render: money, responsive: ['md'] },
    { title: 'Điện & nước', render: (_, b) => money((b.amounts?.electric || 0) + (b.amounts?.water || 0)), responsive: ['lg'] },
    { title: 'Cần thu', dataIndex: ['amounts', 'total'], render: value => <b className="total-cell">{money(value)}</b> },
    { title: 'Trạng thái', dataIndex: 'status', render: status => <Tag color={status === 'paid' ? 'success' : 'gold'}>{status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}</Tag> },
  ]
  return <div className="page-stack">
    <section className="page-toolbar"><div><span className="eyebrow">BÁO CÁO THÁNG</span><h2>Thu chi tháng {month.format('MM/YYYY')}</h2></div><DatePicker picker="month" allowClear={false} disabledDate={disableFutureMonth} value={month} onChange={setMonth} format="MM/YYYY" /></section>
    <Row gutter={[18, 18]} className="stats-row">
      <Col xs={12} lg={6}><Card className="stat-card blue"><Statistic title="Tổng cần thu" value={data.total} formatter={money} prefix={<WalletOutlined />} /><span>{data.count} phiếu đã lập</span></Card></Col>
      <Col xs={12} lg={6}><Card className="stat-card violet"><Statistic title="Đã thu" value={data.paid} formatter={money} prefix={<FileTextOutlined />} /><span>{data.count ? `${Math.round(data.paid / data.total * 100) || 0}% hoàn thành` : 'Chưa có phiếu'}</span></Card></Col>
      <Col xs={12} lg={6}><Card className="stat-card amber"><Statistic title="Tiền điện & nước" value={data.electric + data.water} formatter={money} prefix={<ThunderboltOutlined />} /><span>Điện {money(data.electric)}</span></Card></Col>
      <Col xs={12} lg={6}><Card className="stat-card green"><Statistic title="Hộ đã có phiếu" value={data.count} suffix={`/ ${data.households}`} prefix={<TeamOutlined />} /><span>Đủ dữ liệu trong tháng</span></Card></Col>
    </Row>
    <Card className="surface-card" title={<div><span className="eyebrow">DANH SÁCH GẦN ĐÂY</span><h3>Phiếu thu tháng {month.format('MM/YYYY')}</h3></div>} extra={<Button type="link" onClick={() => onNavigate('billing')}>Xem phiếu thu <ArrowRightOutlined /></Button>}>
      {data.bills?.length ? <Table columns={columns} dataSource={data.bills} rowKey="id" pagination={{ pageSize: 6, hideOnSinglePage: true }} scroll={{ x: 620 }} /> : <Empty description="Chưa có phiếu thu trong tháng này" image={Empty.PRESENTED_IMAGE_SIMPLE}><Button type="primary" onClick={() => onNavigate('billing')}>Lập phiếu đầu tiên</Button></Empty>}
    </Card>
  </div>
}
