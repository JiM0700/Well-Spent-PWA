import React from 'react';

const paths={
  home:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  bills:<><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
  trends:<><path d="M4 4v16h16M8 15l4-5 4 2 4-7"/><path d="M16 5h4v4"/></>,
  settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,up:<path d="M6 16 18 4M6 4h12v12"/>,down:<path d="m6 8 12 12M6 20h12V8"/>,
  wallet:<><path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7"/><path d="M20 12h-5v4h5"/></>,
  shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M8 15h2m4 0h2"/></>,
  spark:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></>,
  edit:<><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14l-1 6Z"/></>,
  close:<path d="m6 6 12 12M6 18 18 6"/>,check:<path d="m5 12 4 4L19 6"/>,
  coffee:<><path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm12 1h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2"/></>,
  chevron:<path d="m9 5 7 7-7 7"/>,moon:<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>,
  download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></>,
  activity:<><path d="M4 6h16M4 12h10M4 18h16"/><circle cx="19" cy="12" r="1"/></>,
  health:<><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/></>,
  bag:<><path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
  house:<><path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/></>,
  filter:<><path d="M4 5h16l-6 7v7l-4 2v-9L4 5Z"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
  sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
};
export default function Icon({name,size=20,...props}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]||paths.spark}</svg>}
