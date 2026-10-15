import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/pages.css';
import './styles/modules.css';
import './styles/wizard.css';
import './styles/receipt.css';
import './styles/vault.css';
import './styles/report.css';
import './styles/interest.css';
import './styles/users.css';
import './styles/audit.css';
import './styles/backup.css';
import './styles/settings.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
