import { createRoot } from 'react-dom/client';
import AdminPage from './AdminPage';
import App from './App';
import FeedbackInbox from './FeedbackInbox';
import './index.css';

// /feedback-inbox and /admin get their own pages -- nginx (and Vite in dev)
// serve this same index.html for every path, so the choice is made here.
const path = window.location.pathname.replace(/\/+$/, '');

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(path === '/feedback-inbox' ? <FeedbackInbox /> : path === '/admin' ? <AdminPage /> : <App />);
