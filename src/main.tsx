import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Diagnostics from './Diagnostics';
import SmartLab from './SmartLab';
import './styles.css';
import './smartlab.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /><Diagnostics /><SmartLab /></React.StrictMode>
);
