import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CofeinPage from './CofeinPage.jsx';
import CofeinIntro from './CofeinIntro.jsx';
import './cofein.css';

createRoot(document.getElementById('root')).render(
  <StrictMode><CofeinIntro><CofeinPage /></CofeinIntro></StrictMode>,
);
