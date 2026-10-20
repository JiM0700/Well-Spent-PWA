import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../styles.css';
import './react.css';

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = {error: null}; }
  static getDerivedStateFromError(error) { return {error}; }
  componentDidCatch(error, details) { console.error('Well Spent could not render:', error, details); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main style={{minHeight:'100vh',display:'grid',placeContent:'center',padding:24,fontFamily:'system-ui,sans-serif',background:'#f5f6f8',color:'#232838'}} role="alert">
      <h1>Well Spent could not open</h1>
      <p>Your saved data is still on this device. Reload the page after starting the Vite server.</p>
      <pre style={{maxWidth:500,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{this.state.error.message}</pre>
      <button type="button" onClick={() => location.reload()} style={{padding:12}}>Reload</button>
    </main>;
  }
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    try { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.warn); }
    catch (error) { console.warn('Offline support could not start:', error); }
  } else {
    navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister())).catch(console.warn);
  }
}
