import { createRoot } from 'react-dom/client';
import App from './App';
import FeedbackInbox from './FeedbackInbox';
import './index.css';

// /feedback-inbox gets its own page -- nginx (and Vite in dev) serve this
// same index.html for every path, so the choice is made here.
const isFeedbackInbox = window.location.pathname.replace(/\/+$/, '') === '/feedback-inbox';

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(isFeedbackInbox ? <FeedbackInbox /> : <App />);
