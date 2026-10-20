import React,{useId,useRef,useState} from 'react';
import {cents,fmtDate,money} from './vault.js';
import Icon from './Icons.jsx';

export function CategoryChart({totals,total,selected='all',onSelect}) {
  const [hover,setHover]=useState(null);
  const active=totals.find(c=>c.id===(hover||selected));
  let offset=0;
  return <div className="category-chart"><div className="donut-wrap">
    <svg viewBox="0 0 180 180" className="donut" role="img" aria-label={total?`Category distribution, total ${money(total)}`:'No spending recorded'}>
      <circle cx="90" cy="90" r="70" fill="none" stroke="var(--track)" strokeWidth="17"/>
      {totals.map(c=>{const size=total?c.amount/total*100:0,start=offset;offset+=size;return <circle key={c.id} cx="90" cy="90" r="70" pathLength="100" fill="none" stroke={c.color} strokeWidth={active?.id===c.id?21:17} strokeDasharray={`${Math.max(0,size-.7)} ${100-Math.max(0,size-.7)}`} strokeDashoffset={-start} transform="rotate(-90 90 90)" className="donut-segment" opacity={active&&active.id!==c.id?'.3':1}/>})}
    </svg><div className="donut-center"><span>{active?active.name:'Total spent'}</span><strong>{money(active?active.amount:total)}</strong><small>{active?`${Math.round(active.amount/total*100)}% of spending`:`${totals.length} categories`}</small></div>
    </div><div className="category-legend">{totals.length?totals.map(c=><button key={c.id} className={`legend-row ${selected===c.id?'selected':''}`} onMouseEnter={()=>setHover(c.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(c.id)} onBlur={()=>setHover(null)} onClick={()=>onSelect?.(selected===c.id?'all':c.id)} aria-pressed={selected===c.id}><i style={{background:c.color}}/><span>{c.name}</span><strong>{money(c.amount)}</strong><small>{Math.round(c.amount/total*100)}%</small></button>):<div className="chart-empty"><Icon name="wallet" size={26}/><strong>A little clarity starts here.</strong><span>Add an expense to see where your money goes.</span></div>}</div></div>;
}

export function BudgetRing({used,budget,spent}) {
  const percent=budget>0?Math.round(used*100):0;
  return <div className={`budget-ring ${used>1?'over-budget':''}`}><svg viewBox="0 0 116 116" role="img" aria-label={budget>0?`${percent}% of budget used`:'No budget set'}><circle cx="58" cy="58" r="48" className="ring-track"/><circle cx="58" cy="58" r="48" pathLength="100" strokeDasharray={`${Math.min(100,Math.max(0,percent))} 100`} transform="rotate(-90 58 58)" className="ring-fill"/></svg><div><strong>{budget>0?`${percent}%`:'—'}</strong><span>{budget>0?'used':'set a budget'}</span></div></div>;
}

export function CashFlowChart({buckets}) {
  const [active,setActive]=useState(null);
  const step=Math.max(1,Math.ceil(buckets.length/12));
  const grouped=[];
  for(let i=0;i<buckets.length;i+=step){const group=buckets.slice(i,i+step);grouped.push({a:group[0].a,b:group.at(-1).b,items:group.flatMap(b=>b.items),amount:group.reduce((sum,b)=>sum+cents(b.amount),0)/100})}
  const periodLabel=b=>b.b-b.a>86400000?`${fmtDate(b.a)} – ${fmtDate(new Date(b.b.getTime()-1))}`:b.b-b.a<86400000?fmtDate(b.a,{hour:'numeric',minute:'2-digit'}):fmtDate(b.a);
  const values=grouped.map(b=>({...b,income:b.items.filter(t=>t.isExpense===false).reduce((s,t)=>s+Math.round(Number(t.amount)*100),0)/100}));
  const max=Math.max(1,...values.flatMap(b=>[b.amount,b.income]));
  return <div><div className="chart-key"><span><i className="key-dot income-dot"/>Income / refunds</span><span><i className="key-dot expense-dot"/>Expenses</span></div><div className="cashflow-chart" role="group" aria-label="Income and expense comparison by date"><div className="bar-grid" style={{'--bar-count':values.length}}>{values.map((b,i)=><button className={`bar-column ${active===i?'active':''}`} key={i} aria-label={`${periodLabel(b)}: income ${money(b.income)}, expenses ${money(b.amount)}`} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} onClick={()=>setActive(active===i?null:i)}><div className="bar-pair"><span className="cash-bar income-bar" style={{height:`${b.income/max*100}%`}}/><span className="cash-bar expense-bar" style={{height:`${b.amount/max*100}%`}}/></div><small>{values.length>12?(i%Math.ceil(values.length/6)===0?fmtDate(b.a,{day:'numeric'}):''):fmtDate(b.a,{month:'short',day:'numeric'})}</small></button>)}</div></div><div className="chart-readout" role="status">{active!==null?<><strong>{periodLabel(values[active])}</strong><span>In {money(values[active].income)}</span><span>Out {money(values[active].amount)}</span></>:<span>Tap or focus a bar to see the details.</span>}</div></div>;
}

export function WeekdayChart({days}) {
  const max=Math.max(1,...days.map(d=>d.amount)),highest=days.reduce((a,b)=>b.amount>a.amount?b:a,days[0]);
  const [active,setActive]=useState(null);
  return <><div className="weekday-chart" role="group" aria-label="Average spending by weekday">{days.map((d,i)=><button key={d.label} className={`weekday-column ${d.amount>0&&d===highest?'peak':''}`} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} onClick={()=>setActive(active===i?null:i)} aria-label={`${d.label}: ${money(d.amount)} average across ${d.count} days`}><div className="weekday-track"><span style={{height:`${d.amount/max*100}%`}}/></div><small>{d.label}</small></button>)}</div><div className="chart-readout" role="status">{active!==null?<><strong>{days[active].label}</strong><span>{money(days[active].amount)} daily average</span></>:<span>{highest.amount>0?`${highest.label} is your highest spending day on average.`:'Your weekday pattern will appear as you log expenses.'}</span>}</div></>;
}

export function BudgetPaceChart({budget}) {
  const id=useId(),max=Math.max(1,...budget.pace.flatMap(p=>[p.actual||0,p.target]));
  const points=key=>budget.pace.filter(p=>p[key]!==null).map((p)=>`${20+budget.pace.indexOf(p)/(budget.days-1)*600},${170-p[key]/max*145}`).join(' ');
  const actual=points('actual'),target=points('target');
  return <><div className="chart-key"><span><i className="key-dot expense-dot"/>Actual spending</span><span><i className="key-dot target-dot"/>Budget pace</span></div><svg className="pace-chart" viewBox="0 0 640 200" role="img" aria-label={`Cumulative spending ${money(budget.spent)} against a ${money(budget.days?budget.pace.at(-1).target:0)} cycle budget`}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".18"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>{[25,97,170].map(y=><line key={y} x1="20" x2="620" y1={y} y2={y} className="chart-grid-line"/>)}<polyline points={target} className="pace-target"/>{actual&&<><polygon points={`20,170 ${actual} ${actual.split(' ').at(-1).split(',')[0]},170`} fill={`url(#${id})`}/><polyline points={actual} className="chart-line" pathLength="1"/></>}<text x="20" y="194">{fmtDate(budget.start)}</text><text x="620" y="194" textAnchor="end">{fmtDate(new Date(budget.end.getTime()-86400000))}</text></svg><p className="chart-hint">Cumulative expenses against an even daily budget. Dashed line shows the planned pace.</p></>;
}

export function ActivityChart({days}) {
  const [active,setActive]=useState(null),max=Math.max(1,...days.map(d=>d.amount));
  const level=d=>d.amount===0?0:Math.max(1,Math.ceil(d.amount/max*4));
  return <><div className="activity-grid" role="group" aria-label="Daily spending for the last 12 weeks">{days.map((d,i)=><button key={i} className={`activity-cell level-${level(d)}`} aria-label={`${fmtDate(d.date)}: ${money(d.amount)}`} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} onClick={()=>setActive(active===i?null:i)}/>)}</div><div className="activity-footer"><span role="status">{active!==null?`${fmtDate(days[active].date)} · ${money(days[active].amount)}`:'Last 12 weeks · each square is a day'}</span><div className="heat-key">Less {[0,1,2,3,4].map(i=><i key={i} className={`level-${i}`}/>)} More</div></div></>;
}

export function SpendingChart({buckets,selectionIndex=null,onSelect=()=>{}}) {
  const id=useId(),targets=useRef([]),[hover,setHover]=useState(null);
  const index=hover??selectionIndex,active=index===null?null:buckets[index];
  const max=Math.max(1,...buckets.map(b=>b.amount)),w=720,baseline=166;
  const points=buckets.map((b,i)=>({x:24+(w-48)*(i/Math.max(1,buckets.length-1)),y:baseline-b.amount/max*128}));
  const line=points.map((p,i)=>i?`C ${(points[i-1].x+p.x)/2} ${points[i-1].y} ${(points[i-1].x+p.x)/2} ${p.y} ${p.x} ${p.y}`:`M ${p.x} ${p.y}`).join(' ');
  const area=points.length?`${line} L ${points.at(-1).x} ${baseline} L ${points[0].x} ${baseline} Z`:'';
  const label=b=>b.b-b.a<86400000?fmtDate(b.a,{hour:'numeric',minute:'2-digit'}):fmtDate(b.a,{day:'numeric',month:'short'});
  const ticks=[0,Math.floor((buckets.length-1)/2),buckets.length-1].filter((v,i,a)=>v>=0&&a.indexOf(v)===i);
  const move=(e,i)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buckets.length-1:Math.max(0,Math.min(buckets.length-1,i+(e.key==='ArrowRight'?1:-1)));targets.current[next]?.focus({preventScroll:true})};
  return <div className="chart-block"><div className="chart-shell" role="group" aria-label="Spending over time. Use arrow keys to explore, Enter to select a date." onMouseLeave={()=>setHover(null)}>
    <span className="chart-scale">{money(max===1&&buckets.every(b=>b.amount===0)?0:max)}</span>
    <svg className="chart-svg" viewBox="0 0 720 200" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".19"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>{[38,102,166].map(y=><line key={y} x1="24" x2="696" y1={y} y2={y} className="chart-grid-line"/>)}{area&&<path d={area} fill={`url(#${id})`}/>}{line&&<path d={line} className="chart-line" pathLength="1"/>}{active&&<><line x1={points[index].x} x2={points[index].x} y1="30" y2={baseline} className="chart-crosshair"/><circle cx={points[index].x} cy={points[index].y} r="8" className="chart-point-halo"/><circle cx={points[index].x} cy={points[index].y} r="4" className="chart-point"/></>}</svg>
    {active&&<div className="chart-tooltip" style={{left:`${Math.max(18,Math.min(82,points[index].x/w*100))}%`}} role="status"><span>{label(active)}</span><strong>{money(active.amount)}</strong><small>{active.items.length} {active.items.length===1?'transaction':'transactions'}</small></div>}
    <div className="chart-targets" style={{gridTemplateColumns:`repeat(${buckets.length},minmax(0,1fr))`}}>{buckets.map((b,i)=><button key={b.a.getTime()} ref={el=>targets.current[i]=el} className={`chart-target ${selectionIndex===i?'selected':''}`} tabIndex={i===(hover??selectionIndex??0)?0:-1} aria-label={`${label(b)}: ${money(b.amount)}, ${b.items.length} transactions. Select to filter activity.`} aria-pressed={selectionIndex===i} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} onMouseEnter={()=>setHover(i)} onKeyDown={e=>move(e,i)} onClick={()=>onSelect(selectionIndex===i?null:i)}/>)}</div>
    <div className="chart-axis" aria-hidden="true">{ticks.map(i=><span key={i}>{label(buckets[i])}</span>)}</div>
  </div><p className="chart-hint">Tap a point to explore · Arrow keys to move between dates</p></div>;
}
