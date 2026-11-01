import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initWebTauriBridge } from './tauri_bridge';
import './styles.css';

initWebTauriBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
