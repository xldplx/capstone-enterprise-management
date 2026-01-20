import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import Main from './pages/dashboard/features/Main';
import Manpower from './pages/dashboard/features/Manpower';
import Empty from './pages/dashboard/features/Empty';
import About from './pages/About';
import Contact from './pages/Contact';
import Layout from './layout/Layout';

function App() {
  return (
    <>
      <Routes>
        {/* public routes */}
        <Route path="/" element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
        </Route>

        <Route path="/dashboard" element={<Dashboard />} />

        {/* protected dashboard routes (nested) */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          {/* this renders inside the outlet tag from the DashboardLayout */}
          <Route path="main" element={<Main />} />
          <Route path="manpower" element={<Manpower />} />
          <Route path="empty" element={<Empty />} />
        </Route>

      </Routes>
    </>
  );
}

export default App;