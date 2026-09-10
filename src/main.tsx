import React from 'react';
import ReactDOM from 'react-dom/client';
import App07 from './App07';
import TaskCenter from './TaskCenter';

const sessions=Number(localStorage.getItem('modeldock-sessions')||'0')+1;
localStorage.setItem('modeldock-sessions',String(sessions));

function OfficialOllamaLink(){
 return <a
  href="https://ollama.com/"
  target="_blank"
  rel="noreferrer"
  aria-label="Open the official Ollama website"
  style={{
   position:'fixed',right:18,bottom:18,zIndex:10000,
   padding:'9px 12px',borderRadius:10,
   border:'1px solid rgba(127,127,127,.35)',
   background:'rgba(20,20,20,.88)',color:'#fff',
   textDecoration:'none',fontSize:12,fontWeight:700,
   backdropFilter:'blur(10px)'
  }}
 >Official Ollama ↗</a>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode>
  <App07/>
  <TaskCenter/>
  <OfficialOllamaLink/>
 </React.StrictMode>
);
