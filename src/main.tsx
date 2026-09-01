import React from 'react';
import ReactDOM from 'react-dom/client';
import App07 from './App07';

const sessions=Number(localStorage.getItem('modeldock-sessions')||'0')+1;
localStorage.setItem('modeldock-sessions',String(sessions));
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App07/></React.StrictMode>);
