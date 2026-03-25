import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import CountryGuide from './pages/CountryGuide'

export default function App() {
  return (
    <div className="grain min-h-screen">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:slug" element={<CountryGuide />} />
      </Routes>
    </div>
  )
}
