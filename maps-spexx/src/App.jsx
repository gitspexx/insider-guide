import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import CountryGuide from './pages/CountryGuide'
import AdminLogin from './pages/admin/Login'
import AdminDashboard from './pages/admin/Dashboard'
import AdminCountry from './pages/admin/Country'
import AdminBusinessForm from './pages/admin/BusinessForm'
import AdminSubscribers from './pages/admin/Subscribers'
import AdminOutreach from './pages/admin/OutreachDashboard'
import AdminCampaignDetail from './pages/admin/CampaignDetail'
import AdminRoute from './components/AdminRoute'

export default function App() {
  return (
    <div className="grain min-h-screen">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:slug" element={<CountryGuide />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/outreach" element={<AdminRoute><AdminOutreach /></AdminRoute>} />
        <Route path="/admin/outreach/:campaignId" element={<AdminRoute><AdminCampaignDetail /></AdminRoute>} />
        <Route path="/admin/subscribers" element={<AdminRoute><AdminSubscribers /></AdminRoute>} />
        <Route path="/admin/businesses/new" element={<AdminRoute><AdminBusinessForm /></AdminRoute>} />
        <Route path="/admin/businesses/:id/edit" element={<AdminRoute><AdminBusinessForm /></AdminRoute>} />
        <Route path="/admin/:slug" element={<AdminRoute><AdminCountry /></AdminRoute>} />
      </Routes>
    </div>
  )
}
