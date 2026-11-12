import { createRoot } from 'react-dom/client';
import AdminPage from './AdminPage';
import App from './App';
import FeedbackInbox from './FeedbackInbox';
import { startHeartbeat, trackVisit } from './usage';
import './index.css';

// /feedback-inbox and /admin get their own pages -- nginx (and Vite in dev)
// serve this same index.html for every path, so the choice is made here.
const path = window.location.pathname.replace(/\/+$/, '');

const root = createRoot(document.getElementById('root') as HTMLElement);
if (path === '/feedback-inbox') root.render(<FeedbackInbox />);
else if (path === '/admin') root.render(<AdminPage />);
else {
  trackVisit();
  startHeartbeat();
  root.render(<App />);
}
