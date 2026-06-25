import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'

// Eager: public hot path (landing + the two most-hit public pages). These
// drive first paint / LCP, so they stay in the main chunk.
import Home from './pages/Home'
import CountryGuide from './pages/CountryGuide'
import Partner from './pages/Partner'

// Lazy: checkout pulls the Stripe SDKs, and the admin suite is 12 pages no
// public visitor ever loads. Splitting them keeps the public bundle small.
const Checkout = lazy(() => import('./pages/Checkout'))
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'))
const AdminLogin = lazy(() => import('./pages/admin/Login'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminCountry = lazy(() => import('./pages/admin/Country'))
const AdminBusinessForm = lazy(() => import('./pages/admin/BusinessForm'))
const AdminSubscribers = lazy(() => import('./pages/admin/Subscribers'))
const AdminOutreach = lazy(() => import('./pages/admin/OutreachDashboard'))
const AdminCampaignDetail = lazy(() => import('./pages/admin/CampaignDetail'))
const AdminCSVImport = lazy(() => import('./pages/admin/CSVImport'))
const AdminClassifier = lazy(() => import('./pages/admin/Classifier'))
const AdminMapsImport = lazy(() => import('./pages/admin/MapsImport'))
const AdminMapsLinks = lazy(() => import('./pages/admin/MapsLinks'))
const AdminOpportunities = lazy(() => import('./pages/admin/Opportunities'))

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="text-text-dim text-sm font-body">Loading…</span>
    </div>
  )
}

export default function App() {
  return (
    <div className="grain min-h-screen">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/partner" element={<Partner />} />
          <Route path="/partners" element={<Partner />} />
          <Route path="/for-business" element={<Partner />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/:slug" element={<CountryGuide />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/import" element={<AdminRoute><AdminCSVImport /></AdminRoute>} />
          <Route path="/admin/classifier" element={<AdminRoute><AdminClassifier /></AdminRoute>} />
          <Route path="/admin/maps-import" element={<AdminRoute><AdminMapsImport /></AdminRoute>} />
          <Route path="/admin/maps-links" element={<AdminRoute><AdminMapsLinks /></AdminRoute>} />
          <Route path="/admin/opportunities" element={<AdminRoute><AdminOpportunities /></AdminRoute>} />
          <Route path="/admin/outreach" element={<AdminRoute><AdminOutreach /></AdminRoute>} />
          <Route path="/admin/outreach/:campaignId" element={<AdminRoute><AdminCampaignDetail /></AdminRoute>} />
          <Route path="/admin/subscribers" element={<AdminRoute><AdminSubscribers /></AdminRoute>} />
          <Route path="/admin/businesses/new" element={<AdminRoute><AdminBusinessForm /></AdminRoute>} />
          <Route path="/admin/businesses/:id/edit" element={<AdminRoute><AdminBusinessForm /></AdminRoute>} />
          <Route path="/admin/:slug" element={<AdminRoute><AdminCountry /></AdminRoute>} />
        </Routes>
      </Suspense>
    </div>
  )
}
