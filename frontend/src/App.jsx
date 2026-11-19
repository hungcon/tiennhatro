import React from 'react'
import { Layout, Menu, Drawer, Button, Avatar } from 'antd'
import { AuditOutlined, BarChartOutlined, TeamOutlined, FileTextOutlined, SettingOutlined, MenuOutlined, HomeOutlined } from '@ant-design/icons'
import Config from './pages/Config'
import Households from './pages/Households'
import Billing from './pages/Billing'
import Dashboard from './pages/Dashboard'
import OpeningAudit from './pages/OpeningAudit'

const { Header, Sider, Content } = Layout
const pages = {
  dashboard: { title: 'Tổng quan', subtitle: 'Theo dõi thu chi nhà trọ theo từng tháng' },
  households: { title: 'Hộ gia đình', subtitle: 'Quản lý thông tin người thuê và giá riêng' },
  billing: { title: 'Phiếu thu hàng tháng', subtitle: 'Lập, tra cứu và gửi phiếu thanh toán' },
  opening: { title: 'Audit đầu kỳ', subtitle: 'Ghi nhận số liệu bàn giao theo hộ thuê' },
  config: { title: 'Thiết lập đơn giá', subtitle: 'Đơn giá mặc định áp dụng cho các hộ' },
}
const menuItems = [
  { key: 'dashboard', icon: <BarChartOutlined />, label: 'Tổng quan' },
  { key: 'households', icon: <TeamOutlined />, label: 'Hộ gia đình' },
  { key: 'billing', icon: <FileTextOutlined />, label: 'Phiếu thu' },
  { key: 'opening', icon: <AuditOutlined />, label: 'Đầu kỳ' },
  { key: 'config', icon: <SettingOutlined />, label: 'Thiết lập giá' },
]

export default function App() {
  const [selected, setSelected] = React.useState('dashboard')
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const go = key => { setSelected(key); setMobileOpen(false) }
  const menu = <Menu mode="inline" selectedKeys={[selected]} onClick={({ key }) => go(key)} items={menuItems} />
  const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date())
  return <Layout className="app-shell">
    <Sider className="desktop-sidebar" width={256} theme="light">
      <div className="brand"><span className="brand-mark"><HomeOutlined /></span><span><strong>Nhà Trọ</strong><small>QUẢN LÝ THU CHI</small></span></div>
      {menu}
      <div className="sidebar-profile"><Avatar size={38}>NT</Avatar><span><b>Quản lý nhà trọ</b><small>Quản trị viên</small></span></div>
    </Sider>
    <Layout>
      <Header className="app-header">
        <div className="header-leading">
          <Button className="mobile-menu-button" type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} aria-label="Mở menu" />
          <div className="header-copy"><span>{pages[selected].subtitle}</span><h1>{pages[selected].title}</h1></div>
        </div>
        <div className="header-utility"><span className="header-today"><i />{today}</span><Avatar size={34}>NT</Avatar></div>
      </Header>
      <Content className="page-content">
        {selected === 'dashboard' && <Dashboard onNavigate={go} />}
        {selected === 'households' && <Households />}
        {selected === 'billing' && <Billing />}
        {selected === 'opening' && <OpeningAudit />}
        {selected === 'config' && <Config />}
      </Content>
    </Layout>
    <Drawer placement="left" open={mobileOpen} onClose={() => setMobileOpen(false)} width={280} className="mobile-drawer" bodyStyle={{ padding: 0 }} title={<div className="brand drawer-brand"><span className="brand-mark"><HomeOutlined /></span><strong>Nhà Trọ</strong></div>}>
      {menu}
    </Drawer>
    <nav className="mobile-bottom-nav" aria-label="Điều hướng chính">
      {menuItems.map(item => <button key={item.key} className={selected === item.key ? 'active' : ''} onClick={() => go(item.key)}>{item.icon}<span>{item.label}</span></button>)}
    </nav>
  </Layout>
}
