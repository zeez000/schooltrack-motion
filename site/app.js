/* SchoolTrack design prototype. All data is fictional and session-only.
   Events are independent records, never inferred from a later event. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const events = [
    {id:'home',title:'At home',short:'Home',time:'07:20',source:'Parent confirmation'},
    {id:'bus',title:'Bus boarding recorded',short:'Bus boarded',time:'07:40',source:'Bus attendant check-in'},
    {id:'gate',title:'School entry recorded',short:'At school',time:'08:10',source:'School gate check-in'},
    {id:'class',title:'Classroom check-in recorded',short:'In class',time:'08:25',source:'Teacher confirmation'},
    {id:'return',title:'Return bus boarding recorded',short:'Return bus',time:'15:10',source:'Bus attendant check-in'},
    {id:'handover',title:'Handover recorded',short:'Picked up',time:'15:55',source:'Authorised handover record'}
  ];
  const students = [
    {id:'mira',name:'Mira Shah',initials:'MS',className:'Grade 3 / Section A',recorded:new Set(['home','bus','gate','class']),skipped:new Set(),stale:false},
    {id:'rohan',name:'Rohan Shah',initials:'RS',className:'Grade 1 / Section B',recorded:new Set(['home','gate']),skipped:new Set(['bus']),stale:false}
  ];
  const roster = [{name:'Mira Shah',id:'S-001',present:true},{name:'Arjun Rao',id:'S-002',present:false},{name:'Leah Thomas',id:'S-003',present:true},{name:'Kabir Das',id:'S-004',present:false},{name:'Nia Patel',id:'S-005',present:true}];
  const routes = [{name:'Route 04',bus:'Bus A',students:18,status:'Last sample: school',time:'08:10',stale:false},{name:'Route 07',bus:'Bus B',students:16,status:'Update unavailable',time:'07:55',stale:true},{name:'Route 09',bus:'Bus C',students:21,status:'Last sample: school',time:'08:18',stale:false}];
  const initial = () => ({role:'parent',tab:'today',child:'mira',notices:[],search:'',selected:new Set(),filter:''});
  let state = initial(), toastTimer = null, lastFocused = null;
  const dialog = $('#detail-dialog');
  const child = () => students.find(student => student.id === state.child);
  const recordedEvents = () => events.filter(event => child().recorded.has(event.id));
  const latest = () => recordedEvents().at(-1);
  const nextEvent = () => events.find(event => !child().recorded.has(event.id) && !child().skipped.has(event.id));
  const icons = {
    today:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    journey:'<circle cx="5" cy="6" r="3"/><circle cx="19" cy="18" r="3"/><path d="M8 6h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7"/>',
    attendance:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-14 5 3 2 5-4"/>',
    updates:'<path d="M5 9a7 7 0 0 1 14 0c0 8 2 8 2 8H3s2 0 2-8Zm4 12h6"/>',
    class:'<path d="M3 20V7l9-5 9 5v13H3Zm5 0v-7h8v7M7 8h2m6 0h2"/>',
    routes:'<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 10h16M8 3v7m8-7v7M7 18v3m10-3v3M7 14h1m8 0h1"/>'
  };
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key] || icons.today}</svg>`;
  function toast(text) {
    clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').classList.add('visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4300);
  }
  function announce(text) {
    state.notices.unshift({title:text,source:'Local demo action',time:'Just now',child:state.child});
    toast(`${text} Demo only.`); updateCount();
  }
  function updateCount() { $('#notice-count').textContent = recordedEvents().length + state.notices.filter(n => n.child === state.child).length; }
  function openDialog(content) {
    if (!dialog.open) lastFocused = document.activeElement;
    $('#dialog-content').innerHTML = content;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden'; $('[data-action="close"]',dialog).focus();
  }
  function closeDialog() { dialog.close(); }
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; if (lastFocused?.isConnected) lastFocused.focus(); else $('#app').focus({preventScroll:true}); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = $$('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]',dialog).filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) closeDialog();
  });
  function picker() {
    return `<div class="child-select"><span class="sample-avatar">${child().initials}</span><div><label for="child-select">SAMPLE CHILD</label><select id="child-select">${students.map(student => `<option value="${student.id}" ${student.id === state.child ? 'selected' : ''}>${student.name}</option>`).join('')}</select></div></div>`;
  }
  function heading(title, subtitle, showPicker = true) {
    return `<div class="dashboard-heading"><div><h3>${title}</h3><p>${subtitle}</p></div>${showPicker ? picker() : '<span class="prototype-pill">FICTIONAL SCHOOL</span>'}</div>`;
  }
  function mapCard(route = routes[0], interactive = true) {
    return `<div class="mini-map-card"><div class="mini-map-caption"><span>${route.name} / ${route.bus}</span><span>ILLUSTRATIVE</span></div><svg class="mini-map" viewBox="0 0 300 150" role="img" aria-label="Illustrated bus route, no real location"><g fill="#e5ebdc"><rect x="12" y="12" width="64" height="33" rx="7"/><rect x="93" y="8" width="74" height="43" rx="7"/><rect x="185" y="9" width="86" height="49" rx="7"/><rect x="14" y="89" width="48" height="47" rx="7"/><rect x="91" y="90" width="78" height="44" rx="7"/><rect x="193" y="93" width="86" height="44" rx="7"/></g><path d="M0 69H300M77 0V150M179 0V150" stroke="#fff" stroke-width="14" fill="none"/><path d="M37 116H77V70H179V39H244" fill="none" stroke="#8bab67" stroke-width="5" stroke-linecap="round"/><path d="M37 116H77V70H179V39H244" fill="none" stroke="#e6f0d4" stroke-width="1" stroke-dasharray="3 5"/><circle cx="37" cy="116" r="6" fill="#fff" stroke="#76995c" stroke-width="2"/><circle cx="244" cy="39" r="13" fill="#325737"/><path d="m238 40 6-5 6 5v5h-12z" fill="#d8e9b6"/><rect x="118" y="60" width="30" height="18" rx="5" fill="#d1e6a6" stroke="#52743e"/><path d="M124 65h5v6h-5m10-6h7v6h-7" fill="#638052"/></svg>${interactive ? `<button type="button" class="map-open" data-route="${route.name}">View route details &#8599;</button>` : ''}</div>`;
  }
  function timeline() {
    return `<div class="panel"><div class="panel-title"><h4>${child().name.split(' ')[0]}'s day, at a glance</h4><span>INDEPENDENT CHECK-INS</span></div><div class="event-timeline">${events.map((event,index) => {
      const recorded = child().recorded.has(event.id), skipped = child().skipped.has(event.id);
      return `<button type="button" class="event-step ${recorded ? 'recorded' : ''} ${latest()?.id === event.id ? 'current' : ''}" data-event="${event.id}" aria-label="${event.title}: ${recorded ? event.time : skipped ? 'Not applicable' : 'Awaiting record'}"><span class="event-dot">${recorded ? '&#10003;' : skipped ? '&#8212;' : index+1}</span><b>${event.short}</b><small>${recorded ? event.time : skipped ? 'Not applicable' : 'Awaiting record'}</small></button>`;
    }).join('')}</div></div>`;
  }
  function parentToday() {
    const event = latest();
    const title = {home:'Before the journey',bus:'Boarding recorded',gate:'School entry recorded',class:'Classroom check-in',return:'Return boarding',handover:'Handover recorded'}[event?.id] || 'Awaiting a record';
    return `${heading('A little peace of mind.',`${child().name}'s sample school day, all in one place.`)}${child().stale ? '<div class="stale-banner">Updates unavailable. Showing the last recorded sample, not a current location. <button type="button" class="text-link compact" data-action="retry">Retry demo</button></div>' : ''}<div class="dashboard-grid"><div class="status-card ${child().stale ? 'warning' : ''}"><span class="micro-label">${child().stale ? 'LAST KNOWN SAMPLE' : 'LATEST RECORDED MOMENT'}</span><h4 class="status-title">${title}</h4><p>${event ? `${event.source}<br>${child().className}` : 'No sample check-ins yet.'}</p><div class="status-bottom"><span class="status-check">&#10003;</span> ${event ? `${event.time} &middot; fictional check-in` : 'Demo mode'}</div></div>${mapCard()}</div>${timeline()}<div class="lower-cards"><div class="info-small"><span class="info-icon">&#9638;</span><div><strong>${child().recorded.has('class') ? 'Classroom recorded' : 'Attendance pending'}</strong><p>${child().recorded.has('class') ? 'Teacher confirmation / 08:25' : 'A gate entry is not class attendance'}</p></div></div><div class="info-small"><span class="info-icon">&#8644;</span><div><strong>Return journey</strong><p>${child().recorded.has('return') ? 'Boarding recorded / 15:10' : 'Sample schedule / 15:10'}</p></div><button type="button" class="text-link" data-event="return">Details &#8599;</button></div></div>`;
  }
  function eventList() {
    return `<ul class="event-list">${events.map(event => `<li><strong>${event.title}</strong><small>${child().recorded.has(event.id) ? `${event.time} / ${event.source}` : child().skipped.has(event.id) ? 'Not applicable / family drop-off scenario' : 'Awaiting an independent record'}</small></li>`).join('')}</ul>`;
  }
  function parentJourney() {
    return `${heading('Every step has a story.','A recorded event is not a continuous location trace.')}<div class="dashboard-grid"><div class="panel"><div class="panel-title"><h4>Thursday / sample journey</h4><span>${recordedEvents().length} RECORDS</span></div>${eventList()}</div><div>${mapCard()}<div class="drawer-tip">Each check-in has its own source and timestamp. Unrecorded steps stay unconfirmed, even when a later check-in is available.</div><button type="button" class="control-button" data-action="scenario">Try family drop-off</button></div></div>`;
  }
  function attendanceData() {
    return Array.from({length:30},(_,index) => {
      const day = index+1, weekday = new Date(Date.UTC(2026,8,day)).getUTCDay();
      return {day,status:weekday === 0 || weekday === 6 ? 'weekend' : day > 24 ? 'future' : day === 9 ? 'absent' : 'present'};
    });
  }
  function attendance() {
    const days = attendanceData(), present = days.filter(day => day.status === 'present').length, absent = days.filter(day => day.status === 'absent').length;
    return `${heading('The bigger picture.','Illustrative September history / separate from the demo day controls.')}<div class="metric-grid"><div class="metric"><span>ATTENDANCE</span><strong>${(present/(present+absent)*100).toFixed(1)}<span>%</span></strong><small>Of ${present+absent} sample school days</small></div><div class="metric"><span>PRESENT</span><strong>${present}</strong><small>Recorded in sample history</small></div><div class="metric"><span>ABSENT</span><strong>${absent}</strong><small>Illustrative absence record</small></div></div><div class="panel"><div class="panel-title"><h4>September 2026</h4><span>SAMPLE HISTORY</span></div><div class="calendar">${['MON','TUE','WED','THU','FRI','SAT','SUN'].map(day => `<span>${day}</span>`).join('')}<span aria-hidden="true"></span>${days.map(({day,status}) => `<button type="button" class="${status} ${day===24 ? 'today' : ''}" data-day="${day}" aria-label="September ${day}: ${status === 'future' ? 'Upcoming' : status}">${day}</button>`).join('')}</div><div class="calendar-legend"><span>Present</span><span>Absent</span><span>Unfilled / upcoming or weekend</span></div></div>`;
  }
  const activity = () => [...state.notices.filter(notice => notice.child === state.child),...recordedEvents().reverse()];
  const activityRows = () => activity().map(event => `<div class="activity-row"><span class="info-icon">&#10003;</span><div><strong>${escapeHTML(event.title)}</strong><p>${escapeHTML(event.source)} &middot; fictional data</p></div><time>${event.time}</time></div>`).join('');
  function updates() { return `${heading('The useful little updates.','A persistent history, not a disappearing notification.')}<div class="panel"><div class="panel-title"><h4>Sample activity</h4><span>${activity().length} ITEMS</span></div>${activityRows() || '<p class="empty-state">No demo updates recorded.</p>'}</div>`; }
  function teacherView() {
    const filtered = roster.filter(student => student.name.toLowerCase().includes(state.search.toLowerCase()));
    return `${heading('More time for the classroom.','Grade 3 / Section A / 5 fictional students',false)}<div class="metric-grid"><div class="metric"><span>IN THIS DEMO</span><strong>${roster.length}</strong><small>Sample students</small></div><div class="metric"><span>RECORDED</span><strong>${roster.filter(s => s.present).length}</strong><small>Classroom confirmations</small></div><div class="metric"><span>AWAITING</span><strong>${roster.filter(s => !s.present).length}</strong><small>Not automatically absent</small></div></div><div class="panel"><div class="toolbar-row"><input id="student-search" class="search-input" type="search" placeholder="Search sample students..." aria-label="Search sample students" value="${escapeHTML(state.search)}"><button type="button" class="control-button advance" data-action="review-attendance" ${state.selected.size === 0 ? 'disabled' : ''}>Review ${state.selected.size || ''} check-in${state.selected.size !== 1 ? 's' : ''}</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>SELECT</th><th>STUDENT</th><th>STATUS</th><th>SAMPLE TIME</th></tr></thead><tbody>${filtered.map(student => `<tr><td><input type="checkbox" data-student="${student.id}" aria-label="Select ${student.name}" ${state.selected.has(student.id) ? 'checked' : ''} ${student.present ? 'disabled' : ''}></td><td>${student.name}<small>${student.id}</small></td><td><span class="status-badge ${student.present ? '' : 'pending'}">${student.present ? 'Recorded' : 'Awaiting record'}</span></td><td>${student.present ? '08:25' : '&#8212;'}</td></tr>`).join('')}</tbody></table></div>${filtered.length ? '' : '<p class="empty-state">No sample students match this search.</p>'}</div><p class="demo-footnote">A local interaction only. This prototype does not authenticate teachers or save real school records.</p>`;
  }
  function schoolView() {
    const filtered = routes.filter(route => `${route.name} ${route.bus}`.toLowerCase().includes(state.filter.toLowerCase()));
    return `${heading('The whole circle, connected.','Transport overview / fictional school operations',false)}<div class="metric-grid"><div class="metric"><span>SAMPLE ROUTES</span><strong>${routes.length}</strong><small>Illustrative transport network</small></div><div class="metric"><span>ASSIGNED STUDENTS</span><strong>${routes.reduce((total,route) => total+route.students,0)}</strong><small>Not a live boarding count</small></div><div class="metric"><span>NEEDS REVIEW</span><strong>${routes.filter(route => route.stale).length}</strong><small>Missing sample update</small></div></div><div class="stale-banner">Route 07 has no newer sample after 07:55. Its current location and arrival are not confirmed.</div><div class="panel"><div class="toolbar-row"><h4>Transport routes</h4><input type="search" id="route-search" class="search-input" placeholder="Search routes..." aria-label="Search sample routes" value="${escapeHTML(state.filter)}"></div><div class="table-wrap"><table class="data-table"><thead><tr><th>ROUTE</th><th>ASSIGNED</th><th>LAST SAMPLE</th><th>DETAILS</th></tr></thead><tbody>${filtered.map(route => `<tr><td>${route.name}<small>${route.bus}</small></td><td>${route.students}</td><td><span class="status-badge ${route.stale ? 'pending' : ''}">${route.status}</span><small>${route.time}</small></td><td><button type="button" class="control-button" data-route="${route.name}">View</button></td></tr>`).join('')}</tbody></table></div>${filtered.length ? '' : '<p class="empty-state">No sample routes match.</p>'}</div><p class="demo-footnote">Role switching is for design review only. Real role permissions are not implemented.</p>`;
  }
  function render(animate = true) {
    $('.role-switch').style.setProperty('--role-index',['parent','teacher','school'].indexOf(state.role));
    const views = state.role === 'parent' ? [['today','Today'],['journey','Journey'],['attendance','Attendance'],['updates','Updates']] : state.role === 'teacher' ? [['class','Classroom'],['updates','Updates']] : [['routes','Transport'],['updates','Updates']];
    if (!views.some(([id]) => id === state.tab)) state.tab = views[0][0];
    $('#app-nav').innerHTML = views.map(([id,label]) => `<button type="button" class="nav-button ${id === state.tab ? 'active' : ''}" data-tab="${id}" ${id === state.tab ? 'aria-current="page"' : ''}>${icon(id)} ${label}${id === 'updates' ? `<span class="nav-number">${activity().length}</span>` : ''}</button>`).join('');
    $$('[data-role]').forEach(button => { button.classList.toggle('active',button.dataset.role === state.role); button.setAttribute('aria-pressed',String(button.dataset.role === state.role)); });
    const parentViews = {today:parentToday,journey:parentJourney,attendance,updates};
    const view = state.role === 'parent' ? parentViews[state.tab] : state.tab === 'updates' ? updates : state.role === 'teacher' ? teacherView : schoolView;
    $('#app-content').innerHTML = view();
    if (animate && !reduced.matches) { $('#app-content').classList.remove('app-view-enter'); void $('#app-content').offsetWidth; $('#app-content').classList.add('app-view-enter'); }
    updateCount(); const next = $('[data-action="next"]'); next.disabled = !nextEvent(); next.textContent = nextEvent() ? 'Next sample event \u2192' : 'Sample day complete';
    $('.sidebar-bottom strong').textContent = state.role === 'parent' ? 'The Shah family' : state.role === 'teacher' ? 'Classroom team' : 'School office';
  }
  function heroState(index) {
    const options = [['Ready for a new day.',"Parent's sample confirmation / 07:20"],['The journey has begun.','Sample bus boarding / 07:40'],['School entry recorded.','Sample gate check-in / 08:10'],['Made it to the classroom.',"Mira's sample check-in / 08:25"]];
    if (!options[index]) return;
    $('#hero-status').textContent = options[index][0]; $('#hero-status-sub').textContent = options[index][1]; $('.art-topline>span:last-child').textContent = `0${index+1} / 04`;
    $$('[data-hero]').forEach(button => { button.classList.toggle('selected',+button.dataset.hero === index); button.setAttribute('aria-pressed',String(+button.dataset.hero === index)); });
    if (!reduced.matches) $('.art-status').animate([{opacity:.45,translate:'0 6px'},{opacity:1,translate:'0 0'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
  }
  function showEvent(id) {
    const event = events.find(item => item.id === id); if (!event) return;
    const recorded = child().recorded.has(id), skipped = child().skipped.has(id);
    openDialog(`<h2 id="dialog-title">${event.title}</h2><p class="drawer-copy">An independent fictional check-in, not a continuous location measurement.</p><div class="drawer-record"><span>Sample child</span><strong>${child().name}</strong></div><div class="drawer-record"><span>Status</span><strong>${recorded ? 'Recorded (fictional)' : skipped ? 'Not applicable' : 'Awaiting a record'}</strong></div><div class="drawer-record"><span>Time recorded</span><strong>${recorded ? event.time : 'No record'}</strong></div><div class="drawer-record"><span>Source</span><strong>${recorded ? event.source : 'Not yet recorded'}</strong></div><div class="drawer-tip">${skipped ? 'This child arrived with family in this scenario. No bus boarding is implied.' : 'Check-ins are independent. A later event does not confirm an earlier one, and a recorded event is not continuous location tracking.'}</div><button type="button" class="button dark small" data-action="close">Back to the day</button>`);
  }
  function showRoute(name) {
    const route = routes.find(item => item.name === name) || routes[0];
    openDialog(`<h2 id="dialog-title">${route.name}<br><em>A sample journey.</em></h2><p class="drawer-copy">A schematic route, not a real map or child location. No GPS device is connected.</p>${mapCard(route,false)}<div class="drawer-record"><span>Vehicle</span><strong>${route.bus}</strong></div><div class="drawer-record"><span>Assigned students</span><strong>${route.students} fictional profiles</strong></div><div class="drawer-record"><span>Last sample</span><strong>${route.time}</strong></div><div class="drawer-tip">${route.stale ? 'Update unavailable. The last sample does not confirm where this bus is now.' : 'This route graphic is illustrative. A bus position would still need to be displayed separately from a child boarding confirmation.'}</div><button type="button" class="button dark small" data-action="close">Back to the demo</button>`);
  }
  const actions = {
    close:closeDialog,
    about:() => openDialog('<h2 id="dialog-title">A design to explore.<br>Not live tracking.</h2><p class="drawer-copy">SchoolTrack is a working front-end prototype for reviewing the school-day experience. The name is provisional.</p><p class="drawer-label">WHAT YOU CAN TRY</p><p class="drawer-copy">Parent, teacher and school views; independent journey check-ins; attendance history; local notifications; missing-update scenarios; and a mobile detail drawer.</p><p class="drawer-label">WHAT IS NOT CONNECTED</p><p class="drawer-copy">There is no authentication, GPS, attendance database, parent verification, background push messaging, or production role access. Role buttons are a demonstration, not a security boundary.</p><div class="drawer-tip">All names and routes are invented. Interactions stay in this browser session and reset on refresh. No personal information is collected or submitted. Optional GSAP is requested from jsDelivr on hosted pages; no student data is sent with that request.</div>'),
    notifications:() => openDialog(`<h2 id="dialog-title">The useful little updates.</h2><p class="drawer-copy">${child().name}'s fictional activity stays here after the toast disappears.</p>${activityRows()}`),
    scenario:() => openDialog('<h2 id="dialog-title">A different kind of day.</h2><p class="drawer-copy">Choose a fictional scenario. Nothing is sent or saved to a school.</p><button type="button" class="scenario-button" data-scenario="regular"><strong>The usual school run</strong><span>Home, boarding, gate arrival, and classroom check-in each have an explicit sample record.</span></button><button type="button" class="scenario-button" data-scenario="family"><strong>A family drop-off</strong><span>Gate and classroom records exist. Bus boarding is not applicable, not silently completed.</span></button><button type="button" class="scenario-button" data-scenario="missing"><strong>A missing boarding record</strong><span>School arrival is recorded. Boarding remains unconfirmed despite the later event.</span></button><button type="button" class="scenario-button" data-scenario="stale"><strong>An update is unavailable</strong><span>The last bus record is shown with an explicit warning and a local retry action.</span></button>'),
    next:() => { const event = nextEvent(); if (!event) return; child().recorded.add(event.id); child().stale = false; render(); announce(`${event.title} / ${event.time}.`); },
    reset:() => {
      students[0].recorded = new Set(['home','bus','gate','class']); students[0].skipped = new Set(); students[0].stale = false;
      students[1].recorded = new Set(['home','gate']); students[1].skipped = new Set(['bus']); students[1].stale = false;
      roster.forEach((student,index) => { student.present = [0,2,4].includes(index); }); state = initial(); render(); toast('The fictional sample day has been reset.');
    },
    retry:() => { child().stale = false; render(); announce('Demo connection restored. No new event was recorded.'); },
    'review-attendance':() => {
      const selected = roster.filter(student => state.selected.has(student.id) && !student.present); if (!selected.length) return;
      openDialog(`<h2 id="dialog-title">Review the check-in.</h2><p class="drawer-copy">Confirm a classroom record for ${selected.length} fictional student${selected.length===1 ? '' : 's'}?</p>${selected.map(student => `<div class="drawer-record"><strong>${student.name}</strong><span>${student.id}</span></div>`).join('')}<div class="drawer-tip">This updates the demonstration only. No real student attendance is submitted.</div><div class="drawer-actions"><button type="button" class="button dark small" data-action="confirm-attendance">Confirm sample check-in</button><button type="button" class="control-button" data-action="close">Cancel</button></div>`);
    },
    'confirm-attendance':() => { const count = state.selected.size; roster.forEach(student => { if (state.selected.has(student.id)) student.present = true; }); state.selected.clear(); closeDialog(); render(); announce(`${count} sample classroom check-in${count===1 ? '' : 's'} confirmed.`); }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.action && actions[button.dataset.action]) actions[button.dataset.action]();
    if (button.dataset.hero !== undefined) heroState(+button.dataset.hero);
    if (button.dataset.event) showEvent(button.dataset.event);
    if (button.dataset.route) showRoute(button.dataset.route);
    if (button.dataset.role || button.dataset.openRole) {
      state.role = button.dataset.role || button.dataset.openRole; state.tab = ''; state.selected.clear(); render();
      if (button.dataset.openRole) $('#app').scrollIntoView({behavior:reduced.matches ? 'auto' : 'smooth',block:'start'}); else $(`[data-role="${state.role}"]`).focus();
    }
    if (button.dataset.tab) { state.tab = button.dataset.tab; render(); $(`[data-tab="${state.tab}"]`).focus(); }
    if (button.dataset.day) {
      const {day,status} = attendanceData().find(item => item.day === +button.dataset.day);
      const labels = {present:'Present in sample history',absent:'Absent in sample history',future:'Upcoming / no record',weekend:'Weekend / no school session'};
      openDialog(`<h2 id="dialog-title">September ${day}, 2026</h2><p class="drawer-copy">${child().name}'s illustrative attendance history.</p><div class="drawer-record"><span>Status</span><strong>${labels[status]}</strong></div><div class="drawer-tip">This is separate fictional historical data. Changing a journey scenario does not rewrite this calendar.</div>`);
    }
    if (button.dataset.scenario) {
      const kind = button.dataset.scenario;
      child().recorded = new Set(kind === 'regular' ? ['home','bus','gate','class'] : kind === 'family' ? ['home','gate','class'] : kind === 'missing' ? ['home','gate'] : ['home','bus']);
      child().skipped = new Set(kind === 'family' ? ['bus'] : []); child().stale = kind === 'stale'; state.role = 'parent'; state.tab = 'today'; state.notices = state.notices.filter(n => n.child !== state.child);
      closeDialog(); render(); toast('Scenario changed. All events shown are fictional.');
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'child-select') { state.child = event.target.value; render(); $('#child-select')?.focus(); }
    if (event.target.matches('[data-student]')) { const id = event.target.dataset.student; if (event.target.checked) state.selected.add(id); else state.selected.delete(id); render(false); $(`[data-student="${id}"]`)?.focus(); }
  });
  document.addEventListener('input', event => {
    if (!['student-search','route-search'].includes(event.target.id)) return;
    const id = event.target.id, value = event.target.value; if (id === 'student-search') state.search = value; else state.filter = value; render(false); $(`#${id}`).focus();
  });
  render(false); heroState(3);
  if ('IntersectionObserver' in window && !reduced.matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.remove('pending'); observer.unobserve(entry.target); } }),{threshold:.1});
    $$('.reveal').forEach(element => { element.classList.add('pending'); observer.observe(element); });
  }
  reduced.addEventListener('change',() => { $$('.reveal.pending').forEach(element => element.classList.remove('pending')); });
  // Optional enhancement: a failed CDN never blocks the interface or hides its content.
  if (/^https?:$/.test(location.protocol) && !reduced.matches) {
    const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js'; script.async = true; script.referrerPolicy = 'no-referrer';
    script.onload = () => { if (window.gsap && !reduced.matches) window.gsap.fromTo('.hero-copy',{y:12},{y:0,duration:.8,ease:'power2.out'}); };
    script.onerror = () => {}; document.head.append(script);
  }
})();
