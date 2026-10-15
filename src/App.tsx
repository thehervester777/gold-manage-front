import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useApp, selectLang, selectRole, selectUser } from './lib/store';
import type { Permission } from './lib/types';
import { isEmbedded } from './lib/files';
import { SmoothScroll } from './motion/smooth';
import { RouteTransition } from './motion/RouteTransition';
import { Shell } from './shell/Shell';
import { Splash } from './shell/Splash';
import { ConfirmHost, Toaster } from './components/overlays';
import { EmptyState } from './components/blocks';
import { ButtonLink } from './components/controls';
import { useT } from './lib/hooks';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/customers/Customers';
import { CustomerDetail } from './pages/customers/CustomerDetail';
import { Loans } from './pages/loans/Loans';
import { LoanDetail } from './pages/loans/LoanDetail';
import { NewLoan } from './pages/loans/NewLoan';
import { Receipts } from './pages/receipts/Receipts';
import { Payments } from './pages/payments/Payments';
import { ReceiptView } from './pages/receipts/ReceiptView';
import { Vault } from './pages/vault/Vault';
import { Reports } from './pages/reports/Reports';
import { Interest } from './pages/interest/Interest';
import { Users } from './pages/users/Users';
import { Audit } from './pages/audit/Audit';
import { Backup } from './pages/backup/Backup';
import { Settings } from './pages/settings/Settings';

// Inside the sandboxed demo frame the address bar is not ours to use, so routing stays in memory there.
const Router = isEmbedded() ? MemoryRouter : HashRouter;

function Guard({ perm, children }: { perm?: Permission; children: ReactNode }) {
  const allowed = useApp((s) => !perm || !!selectRole(s)?.permissions.includes(perm));
  const t = useT();
  if (allowed) return <>{children}</>;
  return (
    <div className="card" style={{ marginTop: 40 }}>
      <EmptyState
        title={t('guard.title')}
        body={t('guard.body')}
        action={<ButtonLink to="/" variant="primary">{t('nav.dashboard')}</ButtonLink>}
      />
    </div>
  );
}

function NotFound() {
  const t = useT();
  return (
    <div className="card" style={{ marginTop: 40 }}>
      <EmptyState title={t('notFound.title')} body={t('notFound.body')} action={<ButtonLink to="/" variant="primary">{t('nav.dashboard')}</ButtonLink>} />
    </div>
  );
}

function Authed() {
  return (
    <Shell>
      <RouteTransition>
        {(loc) => (
          <Routes location={loc}>
            <Route path="/" element={<Guard perm="dashboard.view"><Dashboard /></Guard>} />
            <Route path="/customers" element={<Guard perm="customers.view"><Customers /></Guard>} />
            <Route path="/customers/:id" element={<Guard perm="customers.view"><CustomerDetail /></Guard>} />
            <Route path="/loans" element={<Guard perm="loans.view"><Loans /></Guard>} />
            <Route path="/loans/new" element={<Guard perm="loans.create"><NewLoan /></Guard>} />
            <Route path="/loans/:id" element={<Guard perm="loans.view"><LoanDetail /></Guard>} />
            <Route path="/vault" element={<Guard perm="items.view"><Vault /></Guard>} />
            <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
            <Route path="/interest" element={<Guard perm="loans.view"><Interest /></Guard>} />
            <Route path="/users" element={<Guard perm="users.manage"><Users /></Guard>} />
            <Route path="/audit" element={<Guard perm="audit.view"><Audit /></Guard>} />
            <Route path="/backup" element={<Guard perm="backup.manage"><Backup /></Guard>} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/payments" element={<Guard perm="loans.view"><Payments /></Guard>} />
            <Route path="/receipts" element={<Guard perm="receipts.view"><Receipts /></Guard>} />
            <Route path="/receipts/:id" element={<Guard perm="receipts.view"><ReceiptView /></Guard>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </RouteTransition>
    </Shell>
  );
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const user = useApp(selectUser);
  const lang = useApp(selectLang);
  const theme = useApp((s) => s.prefs.theme);
  const [opened, setOpened] = useState(false);
  // A page that hosts us may already have asked for light or dark; "System" gives that back instead of clearing it.
  const hostTheme = useRef(document.documentElement.dataset.theme);

  useEffect(() => {
    void useApp.getState().init();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const root = document.documentElement;
    if (theme !== 'system') root.dataset.theme = theme;
    else if (hostTheme.current) root.dataset.theme = hostTheme.current;
    else delete root.dataset.theme;
  }, [theme]);

  return (
    <Router>
      <SmoothScroll />
      {opened && ready ? user ? <Authed /> : <Login /> : null}
      <Toaster />
      <ConfirmHost />
      <Splash ready={ready} onOpen={() => setOpened(true)} />
    </Router>
  );
}

