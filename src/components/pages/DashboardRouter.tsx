import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import SessionLoader from '../common/SessionLoader'

const DashboardShellRoute = lazy(() => import('./dashboard/DashboardShellRoute'))
const HomeRouteSection = lazy(() => import('./sections/HomeRouteSection'))
const RankingRouteSection = lazy(() => import('./sections/RankingRouteSection'))

const LeadsGanadosSection = lazy(() => import('./sections/sheets/LeadsGanadosSection'))
const DataEnviosSection = lazy(() => import('./sections/sheets/DataEnviosSection'))
const RecojosSection = lazy(() => import('./sections/sheets/RecojosSection'))
const TarifasSection = lazy(() => import('./sections/sheets/TarifasSection'))
const TipoRecojoSection = lazy(() => import('./sections/sheets/TipoRecojoSection'))
const AplicativosSection = lazy(() => import('./sections/sheets/AplicativosSection'))
const CourierSection = lazy(() => import('./sections/sheets/CourierSection'))
const TiendasSection = lazy(() => import('./sections/sheets/TiendasSection'))
const FullfilmentSection = lazy(() => import('./sections/sheets/FullfilmentSection'))
const OrigenSection = lazy(() => import('./sections/sheets/OrigenSection'))
const TipoDePuntoSection = lazy(() => import('./sections/sheets/TipoDePuntoSection'))
const VendedoresSection = lazy(() => import('./sections/sheets/VendedoresSection'))
const ResultadosSection = lazy(() => import('./sections/sheets/ResultadosSection'))
const DestinosSection = lazy(() => import('./sections/sheets/DestinosSection'))

export default function DashboardRouter() {
    return (
        <BrowserRouter>
            <Suspense fallback={<SessionLoader />}>
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard/home" replace />} />

                    <Route path="/dashboard" element={<DashboardShellRoute />}>
                        <Route index element={<Navigate to="home" replace />} />
                        <Route path="home" element={<HomeRouteSection />} />
                        <Route path="ranking" element={<RankingRouteSection />} />

                        <Route path="hojas/leads-ganados" element={<LeadsGanadosSection />} />
                        <Route path="hojas/data-envios" element={<DataEnviosSection />} />
                        <Route path="hojas/recojos" element={<RecojosSection />} />
                        <Route path="hojas/tarifas" element={<TarifasSection />} />
                        <Route path="hojas/tipo-recojo" element={<TipoRecojoSection />} />
                        <Route path="hojas/aplicativos" element={<AplicativosSection />} />
                        <Route path="hojas/courier" element={<CourierSection />} />
                        <Route path="hojas/tiendas" element={<TiendasSection />} />
                        <Route path="hojas/fullfilment" element={<FullfilmentSection />} />
                        <Route path="hojas/origen" element={<OrigenSection />} />
                        <Route path="hojas/tipo-de-punto" element={<TipoDePuntoSection />} />
                        <Route path="hojas/vendedores" element={<VendedoresSection />} />
                        <Route path="hojas/resultados" element={<ResultadosSection />} />
                        <Route path="hojas/destinos" element={<DestinosSection />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    )
}
