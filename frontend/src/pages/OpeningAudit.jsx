import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Row, Select, Table, Tag, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import axios from 'axios'
import dayjs from 'dayjs'

const API = import.meta.env.VITE_API_URL || '/api'
const money = value => `${value.toLocaleString('vi-VN')} đ`
const periodLabel = ({ month, year }) => `${String(month).padStart(2, '0')}/${year}`
const required = [{ required: true, message: 'Vui lòng nhập dữ liệu' }]

export default function OpeningAudit() {
  const [form] = Form.useForm()
  const [households, setHouseholds] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [householdResponse, auditResponse] = await Promise.all([
        axios.get(`${API}/households`), axios.get(`${API}/opening-audit`)
      ])
      setHouseholds(householdResponse.data)
      setRecords(auditResponse.data)
    } catch {
      message.error('Không thể tải dữ liệu đầu kỳ.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function chooseHousehold(id) {
    const household = households.find(item => item.id === id)
    const opening = household?.opening
    form.setFieldsValue({
      name: household?.name ?? '',
      phone: household?.phone ?? '',
      room: household?.room ?? '',
      rent: opening?.rent ?? household?.rent ?? null,
      initialMeters: {
        electric: household?.initialMeters?.electric ?? null,
        water: household?.initialMeters?.water ?? null
      },
      ...(opening && { period: dayjs().date(1).year(opening.year).month(opening.month - 1) })
    })
  }

  async function save({ period, id, ...values }) {
    setSaving(true)
    try {
      await axios.post(`${API}/opening-audit`, {
        ...values, id: id || undefined, month: period.month() + 1, year: period.year()
      })
      form.resetFields(['id', 'room', 'name', 'phone', 'rent', 'initialMeters'])
      message.success('Đã lưu dữ liệu đầu kỳ.')
      await load()
    } catch (error) {
      message.error(error.response?.data?.error || 'Không thể lưu dữ liệu đầu kỳ.')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: 'Phòng / hộ thuê', key: 'household',
      render: (_, row) => <div><b>{row.room} · {row.name}</b>{row.archived && <span className="table-sub">Đã lưu trữ</span>}</div>
    },
    { title: 'Kỳ bắt đầu', key: 'period', render: (_, row) => periodLabel(row.opening) },
    { title: 'Điện (kWh)', dataIndex: ['opening', 'initialMeters', 'electric'] },
    { title: 'Nước (m³)', dataIndex: ['opening', 'initialMeters', 'water'] },
    { title: 'Tiền phòng', dataIndex: ['opening', 'rent'], render: money },
    { title: 'Ghi nhận lúc', dataIndex: ['opening', 'recordedAt'], render: value => dayjs(value).format('DD/MM/YYYY HH:mm') }
  ]

  return <div className="page-stack">
    <Card className="surface-card" title="Nhập dữ liệu đầu kỳ">
      <Form form={form} layout="vertical" initialValues={{ id: '', period: dayjs() }} onFinish={save} disabled={saving}>
        <Row gutter={[16, 0]}>
          <Col xs={24} sm={12}>
            <Form.Item name="id" label="Hộ thuê">
              <Select onChange={chooseHousehold} loading={loading} options={[
                { value: '', label: 'Thêm hộ thuê mới' },
                ...households.map(household => ({
                  value: household.id, label: `${household.room || 'Chưa có phòng'} · ${household.name}`
                }))
              ]} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="period" label="Tháng bắt đầu tính phiếu" rules={required}>
              <DatePicker picker="month" format="MM/YYYY" allowClear={false} className="full-width" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}><Form.Item name="room" label="Số phòng" rules={required}><Input /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="name" label="Tên hộ thuê" rules={required}><Input /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="phone" label="Số điện thoại"><Input type="tel" /></Form.Item></Col>
          <Col xs={24} sm={8}>
            <Form.Item name="rent" label="Tiền phòng đầu kỳ (đ)" rules={required}>
              <InputNumber min={0} precision={0} className="full-width" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name={['initialMeters', 'electric']} label="Chỉ số điện (kWh)" rules={required}>
              <InputNumber min={0} className="full-width" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name={['initialMeters', 'water']} label="Chỉ số nước (m³)" rules={required}>
              <InputNumber min={0} className="full-width" />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} disabled={loading} loading={saving}>Lưu đầu kỳ</Button>
      </Form>
      <Alert className="opening-audit-note" type="info" showIcon message="Có thể chỉnh số liệu đầu kỳ đến khi hộ có phiếu đã nhập chỉ số hoặc ghi nhận thanh toán." />
    </Card>

    <Card className="surface-card" title="Dữ liệu đã ghi nhận" loading={loading}>
      {records.length ? <>
        <div className="desktop-table"><Table columns={columns} dataSource={records} rowKey="id" pagination={{ pageSize: 8 }} scroll={{ x: 720 }} /></div>
        <div className="mobile-record-list">{records.map(({ id, room, name, archived, opening }) => <article className="mobile-record" key={id}>
          <div className="mobile-record-top"><div><span className="room-pill">{room}</span><b>{name}</b></div><Tag>{periodLabel(opening)}</Tag></div>
          <div className="mobile-record-meta"><span>Điện {opening.initialMeters.electric} kWh</span><span>Nước {opening.initialMeters.water} m³</span></div>
          <div className="mobile-record-total"><span>{archived ? 'Đã lưu trữ' : 'Tiền phòng đầu kỳ'}</span><b>{money(opening.rent)}</b></div>
        </article>)}</div>
      </> : <Empty description="Chưa có dữ liệu đầu kỳ" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
    </Card>
  </div>
}
