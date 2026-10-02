(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const api = window.SchoolTrackAPI;
  const client = api.createClient(window.SchoolTrackConfig.apiBaseUrl);
  const auth = api.auth(client),
    students = api.students(client),
    attendance = api.attendance(client),
    transport = api.transport(client),
    notices = api.notifications(client),
    admin = api.admin(client);
  const shell = document.createElement("div");
  shell.id = "real-app";
  shell.className = "app-shell real-shell";
  shell.tabIndex = -1;
  const demo = $("#app");
  demo.before(shell);
  demo.hidden = true;
  const bar = document.createElement("div");
  bar.className = "mode-bar";
  bar.innerHTML =
    '<button class="control-button advance" data-mode="real">REAL APPLICATION</button><button class="control-button" data-mode="demo">DEMO PREVIEW — fictional data</button>';
  shell.before(bar);
  let mode = "real",
    user = null,
    tab = "",
    data = {},
    selection = "",
    direction = "MORNING",
    loading = false,
    error = "",
    message = "",
    generation = 0,
    streamController = null,
    liveState = "",
    vehicleLocation = null,
    search = "";
  const roles = {
    PARENT: [
      ["today", "Today"],
      ["journeys", "Journeys"],
      ["attendance", "Attendance"],
      ["updates", "Updates"],
    ],
    TEACHER: [
      ["classroom", "Classroom"],
      ["updates", "Updates"],
    ],
    TRANSPORT: [
      ["routes", "Routes"],
      ["updates", "Updates"],
    ],
    ADMIN: [
      ["users", "Users"],
      ["students", "Students"],
      ["guardians", "Guardians"],
      ["classes", "Classes"],
      ["teachers", "Teachers"],
      ["vehicles", "Vehicles"],
      ["routes", "Routes"],
      ["stops", "Route stops"],
      ["studentRoutes", "Student routes"],
      ["drivers", "Transport staff"],
      ["devices", "Devices"],
      ["audit", "Audit logs"],
      ["updates", "Updates"],
    ],
  };
  const names = {
    HOME_CONFIRMED: "Home confirmation",
    BUS_BOARDING: "Bus boarding",
    SCHOOL_GATE_ENTRY: "School gate entry",
    CLASSROOM_ENTRY: "Classroom arrival",
    RETURN_BUS_BOARDING: "Return bus boarding",
    STOP_ARRIVAL: "Stop arrival",
    GUARDIAN_HANDOVER: "Guardian handover",
    ATTENDANCE_PRESENT: "Attendance present",
    ATTENDANCE_ABSENT: "Attendance absent",
  };
  const status = (s) =>
    esc(String(s || "UPDATE_UNAVAILABLE").replaceAll("_", " "));
  const time = (v) =>
    v ? esc(new Date(v).toLocaleString()) : "No timestamp recorded";
  const name = (s) => `${s.firstName} ${s.lastName}`;
  const opts = (rows, label, selected = "", empty = "Select…") =>
    `<option value="">${esc(empty)}</option>${rows.map((r) => `<option value="${esc(r.id)}" ${r.id === selected ? "selected" : ""}>${esc(label(r))}</option>`).join("")}`;
  const select = (key, label, rows, display, selected = "") =>
    `<label>${esc(label)}<select name="${key}" required>${opts(rows, display, selected)}</select></label>`;
  const field = (key, label, type = "text", required = true, value = "") =>
    `<label>${esc(label)}<input name="${key}" type="${type}" ${required ? "required" : ""} value="${esc(value)}" ${type === "password" ? 'minlength="12" autocomplete="new-password"' : ""}></label>`;
  const enumField = (key, label, values) =>
    `<label>${esc(label)}<select name="${key}">${values.map((v) => `<option>${esc(v)}</option>`).join("")}</select></label>`;
  const header = (title, subtitle) =>
    `<div class="real-header"><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>`;
  const empty = (text) => `<p class="empty-state">${esc(text)}</p>`;
  function stopStream() {
    streamController?.abort();
    streamController = null;
    liveState = "";
    vehicleLocation = null;
  }
  function busCard() {
    const vehicle = data.today?.vehicle;
    if (!vehicle)
      return '<div class="real-bus"><span class="micro-label">BUS LOCATION</span><h4>Not applicable</h4><p>No vehicle is assigned for this view.</p></div>';
    const location = vehicleLocation || vehicle.location;
    const stale =
      location &&
      Date.now() - new Date(location.timestamp).getTime() >
        (vehicle.staleAfterSeconds || 300) * 1000;
    const state =
      vehicle.status === "NOT_ACTIVE"
        ? "NOT_ACTIVE"
        : !location
          ? "UPDATE_UNAVAILABLE"
          : stale
            ? "STALE"
            : "CURRENT";
    return `<div class="real-bus" id="real-bus"><span class="micro-label">BUS LOCATION</span><h4>${esc(vehicle.label || "Assigned vehicle")} · ${status(state)}</h4><p>${esc(vehicle.routeName)}<br>${location ? `Latitude ${esc(location.latitude)}, longitude ${esc(location.longitude)}<br>Last updated: ${time(location.timestamp)}` : "No current vehicle location is available."}</p><span class="live-status">${status(liveState || state)}</span><p>Vehicle GPS does not confirm student boarding or presence.</p></div>`;
  }
  function startStream() {
    stopStream();
    const vehicle = data.today?.vehicle;
    if (mode !== "real" || !vehicle?.id || vehicle.status === "NOT_ACTIVE")
      return;
    streamController = new AbortController();
    transport.streamLocation(vehicle.id, {
      signal: streamController.signal,
      onState: (state) => {
        liveState = state;
        renderBus();
      },
      onEvent: (event, payload) => {
        if (event === "location") {
          vehicleLocation = payload;
          renderBus();
        }
      },
    });
  }
  function renderBus() {
    const el = $("#real-bus", shell);
    if (el) el.outerHTML = busCard();
  }
  setInterval(() => {
    if (user && mode === "real") renderBus();
  }, 15000);
  function parent() {
    if (tab === "updates") return updates();
    const rows = data.children || [];
    const picker = `<label class="form-help">Your child<select id="real-child">${opts(rows, name, selection, "Select your child")}</select></label>`;
    if (!rows.length)
      return (
        header(
          "Your children",
          "Only active guardian relationships are shown.",
        ) +
        empty("No children are linked to your account. Contact your school.")
      );
    let body = "";
    if (tab === "today") {
      const p = data.today;
      if (!p) return picker + empty("Select a child to load today’s records.");
      const latest = p.latestEvent;
      const checks = { ...p.checkpoints.morning, ...p.checkpoints.return };
      body = `${header("A little peace of mind.", `${name(p.student)} — ${String(p.date).slice(0, 10)}`)}<div class="dashboard-grid"><div class="status-card ${latest ? "" : "warning"}"><span class="micro-label">STUDENT CHECKPOINT</span><h4 class="status-title">${latest ? esc(names[latest.eventType] || latest.eventType) : "Awaiting a record"}</h4><p>${latest ? esc(latest.source) : "No student checkpoint has been recorded."}</p><div class="status-bottom">${latest ? time(latest.timestamp) : "AWAITING RECORD"}</div></div>${busCard()}</div><div class="panel"><div class="panel-title"><h4>Independent checkpoints</h4><span>RECORDED EVIDENCE</span></div><div class="event-timeline">${Object.entries(
        checks,
      )
        .map(
          ([key, v], i) =>
            `<div class="event-step ${v.status === "RECORDED" ? "recorded" : ""}" data-checkpoint="${key}" data-status="${v.status}"><span class="event-dot">${v.status === "RECORDED" ? "✓" : i + 1}</span><b>${esc(names[key])}</b><small>${status(v.status)}${v.timestamp ? `<br>${time(v.timestamp)}` : ""}</small></div>`,
        )
        .join("")}</div></div>`;
    } else if (tab === "journeys")
      body =
        header(
          "Every step has a story.",
          "Checkpoints remain independent records.",
        ) +
        `<div class="real-list">${(data.journeys || []).map((j) => `<article><h4>${esc(j.direction)} · ${esc(String(j.date).slice(0, 10))}</h4><p>${esc(j.route?.name || "No route")} · ${status(j.status)}</p><ul class="event-list">${j.events.map((e) => `<li><strong>${esc(names[e.eventType] || e.eventType)}</strong><small>${time(e.timestamp)} · ${esc(e.source)}</small></li>`).join("")}</ul>${j.events.length ? "" : empty("No checkpoint events were recorded for this journey.")}</article>`).join("") || empty("No journeys have been recorded.")}</div>`;
    else if (tab === "attendance")
      body =
        header("The bigger picture.", "Attendance comes from school records.") +
        `<div class="real-list">${(data.records || []).map((r) => `<article><h4>${esc(String(r.date).slice(0, 10))} · ${status(r.status)}</h4><p>${esc(r.classroom?.name)} ${esc(r.classroom?.section)}</p>${r.corrections.map((c) => `<p>Correction: ${status(c.fromStatus)} → ${status(c.toStatus)} · ${esc(c.reason)} · ${time(c.createdAt)}</p>`).join("")}</article>`).join("") || empty("No attendance records are available for this period.")}</div>`;
    else body = updates();
    return picker + body;
  }
  function updates() {
    return (
      header(
        "The useful little updates.",
        "Saved notifications from your school.",
      ) +
      `<div class="panel">${(data.notifications || []).map((n) => `<div class="activity-row"><div><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><time>${time(n.createdAt)}</time></div>${n.readAt ? '<span class="status-badge">Read</span>' : `<button class="control-button" data-read="${n.id}">Mark read</button>`}</div>`).join("") || empty("No notifications are available.")}</div>`
    );
  }
  function teacher() {
    if (tab === "updates") return updates();
    const classes = data.classes || [],
      records = new Map((data.records || []).map((r) => [r.studentId, r]));
    return (
      header(
        "More time for the classroom.",
        "Record attendance and classroom arrivals for your assigned classes.",
      ) +
      `<div class="toolbar-row"><label class="form-help">Class<select id="real-class">${opts(classes, (c) => `${c.name} / ${c.section}`, selection)}</select></label><label class="form-help">Search students<input id="real-search" class="search-input" value="${esc(search)}" type="search"></label></div><div class="real-list">${
        (data.roster || [])
          .filter((s) => name(s).toLowerCase().includes(search.toLowerCase()))
          .map((s) => {
            const r = records.get(s.id);
            return `<article data-roster-student="${s.id}"><h4>${esc(name(s))}</h4><p>${esc(s.studentCode)} · Attendance: <span class="status-badge">${r ? status(r.status) : "AWAITING RECORD"}</span></p><form class="real-form" data-form="attendance" data-student-id="${s.id}"><label>Attendance status<select name="status">${["PRESENT", "ABSENT", "LATE", "EXCUSED"].map((v) => `<option ${r?.status === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Correction reason<input name="correctionReason" placeholder="Required when changing an existing status"></label><button class="control-button advance">Save attendance</button></form><div class="real-actions"><button class="control-button" data-classroom="${s.id}">Confirm classroom arrival</button></div>${r?.corrections?.map((c) => `<p>${esc(c.reason)} · ${time(c.createdAt)}</p>`).join("") || ""}</article>`;
          })
          .join("") ||
        empty(
          selection
            ? "No assigned students match this search."
            : "Select an assigned class.",
        )
      }</div>`
    );
  }
  function driver() {
    if (tab === "updates") return updates();
    const routes = data.routes || [],
      route = routes.find((r) => r.id === selection);
    const assignments = (route?.studentAssignments || []).filter(
      (a) => a.direction === direction || a.direction === "BOTH",
    );
    return (
      header(
        "The journey, carefully recorded.",
        "Your assigned routes and students.",
      ) +
      `<div class="toolbar-row"><label class="form-help">Route<select id="real-route">${opts(routes, (r) => r.name, selection)}</select></label><label class="form-help">Direction<select id="real-direction"><option ${direction === "MORNING" ? "selected" : ""}>MORNING</option><option ${direction === "RETURN" ? "selected" : ""}>RETURN</option></select></label></div>${route ? `<div class="panel"><h4>${esc(route.name)} · ${esc(route.vehicle?.label || "No vehicle assigned")}</h4><p class="form-help">Route actions never confirm boarding. Record each student separately.</p><div class="real-actions"><button class="control-button advance" data-route-action="start">Start ${direction.toLowerCase()} route</button><button class="control-button" data-route-action="end">Finish route</button></div></div><div class="real-list">${assignments.map((a) => `<article><h4>${esc(name(a.student))}</h4><p>${esc(a.student.studentCode)} · ${esc(a.stop?.name || "Stop unavailable")} · ${status(a.direction)}</p><p>Journey: ${status(a.student.journeys?.find((j) => j.routeId === selection && j.direction === direction)?.status || "AWAITING_RECORD")}</p><ul class="event-list">${(a.student.journeys?.find((j) => j.routeId === selection && j.direction === direction)?.events || []).map((event) => `<li>${esc(names[event.eventType] || event.eventType)} · ${time(event.timestamp)}</li>`).join("")}</ul><div class="real-actions"><button class="control-button advance" data-board="${a.student.id}">Record ${direction === "RETURN" ? "return " : ""}boarding</button></div>${direction === "RETURN" ? `<form class="real-form" data-form="handover" data-student-id="${a.student.id}"><label>Authorized pickup guardian<select name="guardianId" required>${opts(a.student.guardians || [], (g) => `${g.relationship} — ${g.user.email}`)}</select></label><label class="checkbox-label"><input name="verified" type="checkbox" required> I verified the pickup person’s identity</label><button class="control-button">Record guardian handover</button></form>` : ""}</article>`).join("") || empty("No students are assigned for this direction.")}</div>${route.vehicleId ? `<div class="panel"><h4>Bus location</h4><p class="form-help">Use your vehicle’s GPS tracker for continuous updates, or enter an observed vehicle position below. This does not record student presence.</p><form class="real-form" data-form="location">${field("latitude", "Latitude", "number")}${field("longitude", "Longitude", "number")}<button class="control-button">Record vehicle location</button></form></div>` : ""}` : empty("No active routes are assigned to your account.")}`
    );
  }
  const adminResources = {
    users: ["users", "Users"],
    students: ["students", "Students"],
    guardians: ["guardians", "Guardians"],
    classes: ["classes", "Classes"],
    teachers: ["teacherAssignments", "Teacher assignments"],
    vehicles: ["vehicles", "Vehicles"],
    routes: ["routes", "Routes"],
    stops: ["routes", "Route stops"],
    studentRoutes: ["studentRouteAssignments", "Student route assignments"],
    drivers: ["transportAssignments", "Transport assignments"],
    devices: ["devices", "Devices"],
    audit: ["audits", "Audit logs"],
  };
  function adminView() {
    if (tab === "updates") return updates();
    const users = data.users || [],
      children = data.students || [],
      classes = data.classes || [],
      vehicles = data.vehicles || [],
      routes = data.routes || [];
    const parentUsers = users.filter((u) => u.role === "PARENT"),
      teachers = users.filter((u) => u.role === "TEACHER"),
      drivers = users.filter((u) => u.role === "TRANSPORT");
    const uLabel = (u) => u.email,
      cLabel = (c) => `${c.name} / ${c.section}`,
      rLabel = (r) => r.name,
      vLabel = (v) => `${v.label} / ${v.registrationNumber}`;
    const forms = {
      users:
        field("email", "Email", "email") +
        field("password", "Initial password", "password") +
        enumField("role", "Role", ["PARENT", "TEACHER", "ADMIN", "TRANSPORT"]) +
        field("phone", "Phone", "tel", false),
      students:
        field("studentCode", "Student code") +
        field("firstName", "First name") +
        field("lastName", "Last name") +
        select("classId", "Class", classes, cLabel),
      guardians:
        select("userId", "Parent account", parentUsers, uLabel) +
        select("studentId", "Student", children, name) +
        field("relationship", "Relationship") +
        '<label class="checkbox-label"><input name="authorisedPickup" type="checkbox"> Authorized for pickup</label>',
      classes:
        field("name", "Class name") +
        field("section", "Section") +
        field("academicYear", "Academic year"),
      teachers:
        select("userId", "Teacher", teachers, uLabel) +
        select("classId", "Class", classes, cLabel),
      vehicles:
        field("label", "Vehicle label") +
        field("registrationNumber", "Registration number") +
        field("capacity", "Capacity", "number"),
      routes:
        field("name", "Route name") +
        select("vehicleId", "Vehicle", vehicles, vLabel),
      stops:
        select("routeId", "Route", routes, rLabel) +
        field("name", "Stop name") +
        field("latitude", "Latitude", "number") +
        field("longitude", "Longitude", "number") +
        field("sequence", "Stop sequence", "number") +
        field("scheduledTime", "Scheduled time", "time", false),
      studentRoutes:
        select("studentId", "Student", children, name) +
        select("routeId", "Route", routes, rLabel) +
        enumField("direction", "Direction", ["BOTH", "MORNING", "RETURN"]) +
        `<label>Stop (optional)<select name="stopId"><option value="">No stop</option>${routes.flatMap((r) => r.stops.map((s) => `<option value="${s.id}">${esc(r.name)} / ${esc(s.name)}</option>`)).join("")}</select></label>`,
      drivers:
        select("userId", "Transport account", drivers, uLabel) +
        select("routeId", "Route", routes, rLabel) +
        select("vehicleId", "Vehicle", vehicles, vLabel),
      devices:
        field("deviceKey", "Device identifier") +
        enumField("deviceType", "Device type", [
          "RFID_READER",
          "NFC_READER",
          "QR_SCANNER",
          "GPS_TRACKER",
          "TABLET",
          "OTHER",
        ]) +
        field("location", "Installed location", "text", false) +
        `<label>Vehicle (required for GPS)<select name="vehicleId">${opts(vehicles, vLabel)}</select></label><fieldset class="wide"><legend>Allowed student checkpoint types (none for GPS)</legend>${Object.keys(
          names,
        )
          .map(
            (t) =>
              `<label class="checkbox-label"><input type="checkbox" name="allowedEventTypes" value="${t}">${esc(names[t])}</label>`,
          )
          .join("")}</fieldset>`,
    };
    let rows = data.items || [];
    if (tab === "stops")
      rows = routes.flatMap((r) =>
        r.stops.map((s) => ({ ...s, routeName: r.name })),
      );
    function card(r) {
      let title = "",
        text = "",
        actions = "";
      if (tab === "users") {
        title = r.email;
        text = `${r.role} · ${r.status}`;
        actions = `<button class="control-button" data-user-status="${r.id}" data-status="${r.status === "DISABLED" ? "ACTIVE" : "DISABLED"}">${r.status === "DISABLED" ? "Enable" : "Disable"} user</button>`;
      }
      if (tab === "students") {
        title = name(r);
        text = `${r.studentCode} · ${r.classroom?.name || "No class"} ${r.classroom?.section || ""}`;
      }
      if (tab === "guardians") {
        title = `${r.user.email} → ${name(r.student)}`;
        text = `${r.relationship} · Pickup ${r.authorisedPickup ? "authorized" : "not authorized"} · ${r.active ? "Active" : "Inactive"}`;
      }
      if (tab === "classes") {
        title = `${r.name} / ${r.section}`;
        text = r.academicYear;
      }
      if (tab === "teachers") {
        title = r.user.email;
        text = `${r.classroom.name} / ${r.classroom.section} · ${r.active ? "Active" : "Inactive"}`;
      }
      if (tab === "vehicles") {
        title = r.label;
        text = `${r.registrationNumber} · Capacity ${r.capacity} · ${r.status}`;
      }
      if (tab === "routes") {
        title = r.name;
        text = `${r.vehicle?.label || "No vehicle"} · ${r.stops.length} stops · ${r.status}`;
      }
      if (tab === "stops") {
        title = `${r.routeName} / ${r.name}`;
        text = `Stop ${r.sequence} · ${r.latitude}, ${r.longitude} · ${r.scheduledTime || "Unscheduled"}`;
      }
      if (tab === "studentRoutes") {
        title = name(r.student);
        text = `${r.route.name} · ${r.direction} · ${r.stop?.name || "No stop"} · ${r.active ? "Active" : "Inactive"}`;
      }
      if (tab === "drivers") {
        title = r.user.email;
        text = `${r.route.name} · ${r.vehicle?.label || "Route vehicle"} · ${r.active ? "Active" : "Inactive"}`;
      }
      if (tab === "devices") {
        title = r.deviceKey;
        text = `${r.deviceType} · ${r.status} · ${r.allowedEventTypes.join(", ") || "Vehicle GPS only"}`;
        actions = `<button class="control-button" data-rotate="${r.id}">Rotate device token</button><button class="control-button" data-device-status="${r.id}" data-status="${r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}">${r.status === "ACTIVE" ? "Disable" : "Enable"} device</button>`;
      }
      if (tab === "audit") {
        title = r.action;
        text = `${r.entityType} / ${r.entityId} · ${new Date(r.createdAt).toLocaleString()}`;
      }
      return `<article><h4>${esc(title)}</h4><p>${esc(text)}</p>${tab === "audit" ? `<details><summary>Change details</summary><pre>${esc(JSON.stringify({ oldValue: r.oldValue, newValue: r.newValue }, null, 2))}</pre></details>` : ""}<div class="real-actions">${actions}</div></article>`;
    }
    return (
      header(
        adminResources[tab]?.[1] || "School administration",
        "School-scoped operational records.",
      ) +
      (forms[tab]
        ? `<details class="panel"><summary>Add or assign ${esc(adminResources[tab]?.[1].toLowerCase())}</summary><form class="real-form" data-form="admin" data-resource="${tab}" style="margin-top:20px">${forms[tab]}<button class="control-button advance">Save ${esc(tab === "stops" ? "stop" : "record")}</button></form></details>`
        : "") +
      `<div class="real-list">${rows.map(card).join("") || empty("No records are available.")}</div>`
    );
  }
  function render() {
    shell.innerHTML = `<div class="app-toolbar"><div class="app-wordmark"><span class="mini-mark">s.</span> schooltrack <span class="prototype-pill">REAL APPLICATION</span></div>${user ? `<span class="micro-label">${esc(user.role)}</span><button class="control-button" data-real="password">Change password</button><button class="control-button" data-real="logout">Log out</button>` : ""}</div>${user ? `<div class="app-body"><aside class="app-sidebar"><nav aria-label="Application sections">${roles[user.role].map(([id, label]) => `<button class="nav-button ${tab === id ? "active" : ""}" data-real-tab="${id}" ${tab === id ? 'aria-current="page"' : ""}>${esc(label)}</button>`).join("")}</nav></aside><div class="app-main"><div class="app-topline"><span>${esc(user.email)}</span><button class="control-button" data-real="reload">Refresh records</button></div>${error ? `<div role="alert" class="real-message error">${esc(error)}<br><button class="control-button" data-real="reload">Retry</button></div>` : ""}${message ? `<div role="status" class="real-message">${esc(message)}</div>` : ""}${loading ? '<p role="status" class="empty-state">Loading school records…</p>' : error ? "" : user.role === "PARENT" ? parent() : user.role === "TEACHER" ? teacher() : user.role === "TRANSPORT" ? driver() : adminView()}</div></div>` : `<div class="app-main"><div class="panel login-panel">${header("Welcome to SchoolTrack.", "Sign in with the account provided by your school.")}${error ? `<div class="real-message error" role="alert">${esc(error)}</div>` : ""}${message ? `<div class="real-message" role="status">${esc(message)}</div>` : ""}<form class="real-form" data-form="login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="button dark" ${loading ? "disabled" : ""}>${loading ? "Signing in…" : "Sign in"}</button></form>${!client.baseUrl ? '<p class="form-help">Your school’s API connection has not been configured. The owner must set SCHOOLTRACK_API_BASE_URL when publishing this site.</p>' : ""}<p class="form-help">This session lasts while this page is open. Closing or reloading it requires signing in again.</p></div></div>`}`;
    shell.querySelectorAll("input[type=number]").forEach((input) => {
      input.step = "any";
    });
  }
  async function load() {
    if (!user) return;
    const id = ++generation;
    loading = true;
    error = "";
    stopStream();
    render();
    try {
      let result = {};
      if (tab === "updates") {
        result.notifications = (await notices.list()).notifications;
        if (user.role === "PARENT" && selection)
          result.notifications = (
            await students.notifications(selection)
          ).notifications;
      } else if (user.role === "PARENT") {
        const children = (await students.mine()).students;
        selection = children.some((c) => c.id === selection)
          ? selection
          : children[0]?.id || "";
        result.children = children;
        if (selection) {
          if (tab === "today") {
            result.student = (await students.get(selection)).student;
            result.today = await students.today(selection);
            const vehicle = result.today.vehicle;
            if (vehicle?.id && vehicle.status !== "NOT_ACTIVE") {
              try {
                const sample = await transport.location(vehicle.id);
                vehicle.location = sample.location;
                vehicle.staleAfterSeconds = sample.staleAfterSeconds;
              } catch (e) {
                if (e.status !== 404) throw e;
              }
            }
          }
          if (tab === "journeys")
            result.journeys = (await students.journeys(selection)).journeys;
          if (tab === "attendance")
            result.records = (await students.attendance(selection)).records;
          if (tab === "updates")
            result.notifications = (
              await students.notifications(selection)
            ).notifications;
        }
      } else if (user.role === "TEACHER") {
        result.classes = (await attendance.classes()).classes;
        selection = result.classes.some((c) => c.id === selection)
          ? selection
          : result.classes[0]?.id || "";
        if (selection) {
          result.roster = (await attendance.students(selection)).students;
          const a = await attendance.get(selection);
          result.records = a.records;
          result.date = String(a.date).slice(0, 10);
        }
      } else if (user.role === "TRANSPORT") {
        result.routes = (await transport.routes()).routes;
        selection = result.routes.some((r) => r.id === selection)
          ? selection
          : result.routes[0]?.id || "";
      } else {
        const [u, s, c, v, r] = await Promise.all([
          admin.users(),
          admin.students(),
          admin.classes(),
          admin.vehicles(),
          admin.routes(),
        ]);
        result = {
          users: u.users,
          students: s.students,
          classes: c.classes,
          vehicles: v.vehicles,
          routes: r.routes,
        };
        const method = adminResources[tab][0];
        const response = await admin[method]();
        result.items = response[Object.keys(response)[0]];
      }
      if (id !== generation) return;
      data = result;
      loading = false;
      render();
      if (user.role === "PARENT" && tab === "today") startStream();
    } catch (e) {
      if (id !== generation) return;
      loading = false;
      if (e.status === 401) {
        client.clearSession();
        user = null;
        data = {};
      }
      error = errorText(e);
      render();
    }
  }
  function errorText(e) {
    return e.code === "OFFLINE"
      ? "You are offline. Reconnect to load school records."
      : e.code === "NETWORK_UNAVAILABLE"
        ? "SchoolTrack is unavailable. No new records can be confirmed. Try again when the connection returns."
        : e.status === 401
          ? "Your session has expired. Please sign in again."
          : e.status === 403
            ? "The server denied this action. Your account is not authorized."
            : e.message || "The request failed.";
  }
  async function mutate(fn, success) {
    if (loading) return;
    loading = true;
    error = "";
    render();
    try {
      const result = await fn();
      message = success;
      loading = false;
      await load();
      return result;
    } catch (e) {
      loading = false;
      error = errorText(e);
      render();
    }
  }
  client.onSessionExpired = () => {
    user = null;
    data = {};
    stopStream();
    generation++;
    loading = false;
    error = "Your session has expired. Please sign in again.";
    render();
  };
  document.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button.dataset.mode) {
      mode = button.dataset.mode;
      demo.hidden = mode !== "demo";
      shell.hidden = mode !== "real";
      if (mode === "demo") {
        stopStream();
        $(".demo-footnote").hidden = false;
      } else {
        if (user) load();
      }
      return;
    }
    if (button.dataset.openRole) {
      mode = "demo";
      demo.hidden = false;
      shell.hidden = true;
      stopStream();
      return;
    }
    if (!shell.contains(button)) return;
    if (button.dataset.realTab) {
      tab = button.dataset.realTab;
      message = "";
      selection = "";
      search = "";
      load();
    }
    if (button.dataset.real === "reload") load();
    if (button.dataset.real === "logout") {
      stopStream();
      generation++;
      auth.logout().catch(() => {
        if (!user) {
          message =
            "Signed out on this page. The server could not confirm session revocation; contact your school if this device is shared.";
          render();
        }
      });
      user = null;
      data = {};
      loading = false;
      error = "";
      message = "You have signed out.";
      render();
    }
    if (button.dataset.real === "password") {
      shell.querySelector(".app-main").innerHTML =
        header(
          "Change your password.",
          "All existing sessions will be invalidated.",
        ) +
        `<form class="real-form" data-form="password">${field("currentPassword", "Current password", "password")}${field("newPassword", "New password", "password")}<button class="control-button advance">Change password</button></form>`;
    }
    if (button.dataset.read)
      mutate(
        () => notices.markRead(button.dataset.read),
        "Notification marked read.",
      );
    if (
      button.dataset.classroom &&
      confirm("Confirm that this student has arrived in the classroom?")
    )
      mutate(
        () => attendance.classroom(button.dataset.classroom),
        "Classroom arrival recorded.",
      );
    if (
      button.dataset.routeAction &&
      confirm(
        `${button.dataset.routeAction === "start" ? "Start" : "Finish"} the ${direction.toLowerCase()} route?`,
      )
    )
      mutate(
        () => transport[button.dataset.routeAction](selection, direction),
        "Route action recorded.",
      );
    if (
      button.dataset.board &&
      confirm("Confirm that you observed this student boarding the vehicle?")
    )
      mutate(
        () => transport.board(button.dataset.board, direction),
        "Boarding checkpoint recorded.",
      );
    if (
      button.dataset.userStatus &&
      confirm(
        `${button.textContent.trim()}? Existing sessions are revoked when disabling.`,
      )
    )
      mutate(
        () =>
          admin.setUserStatus(button.dataset.userStatus, button.dataset.status),
        "User status updated.",
      );
    if (button.dataset.deviceStatus && confirm(`${button.textContent.trim()}?`))
      mutate(
        () =>
          admin.setDeviceStatus(
            button.dataset.deviceStatus,
            button.dataset.status,
          ),
        "Device status updated.",
      );
    if (
      button.dataset.rotate &&
      confirm(
        "Rotate this device credential? The previous token will stop working immediately.",
      )
    )
      mutate(
        () => admin.rotateDevice(button.dataset.rotate),
        "Device token rotated.",
      ).then(showToken);
  });
  function showToken(result) {
    if (!result?.deviceToken) return;
    const el = document.createElement("div");
    el.className = "real-secret";
    el.innerHTML = `<h4>Save this device credential now</h4><p>It is returned only on provisioning or rotation.</p><code>${esc(result.deviceToken)}</code><button class="control-button" type="button">I have saved it</button>`;
    el.querySelector("button").onclick = () => el.remove();
    shell.querySelector(".app-main").prepend(el);
  }
  shell.addEventListener("change", (e) => {
    if (["real-child", "real-class", "real-route"].includes(e.target.id)) {
      selection = e.target.value;
      message = "";
      load();
    }
    if (e.target.id === "real-direction") {
      direction = e.target.value === "RETURN" ? "RETURN" : "MORNING";
      render();
    }
  });
  shell.addEventListener("input", (e) => {
    if (e.target.id === "real-search") {
      search = e.target.value;
      const start = e.target.selectionStart;
      render();
      const input = $("#real-search", shell);
      input.focus();
      input.setSelectionRange(start, start);
    }
  });
  shell.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target,
      kind = form.dataset.form;
    if (!kind || loading) return;
    const values = Object.fromEntries(new FormData(form));
    if (kind === "login") {
      loading = true;
      error = "";
      message = "";
      render();
      try {
        const session = await auth.login(values.email, values.password);
        user = session.user;
        if (!roles[user.role])
          throw new Error("This account role is not supported.");
        user = (await auth.me()).user;
        tab = roles[user.role][0][0];
        selection = "";
        loading = false;
        await load();
      } catch (err) {
        user = null;
        client.clearSession();
        loading = false;
        error = errorText(err);
        render();
      }
      return;
    }
    if (kind === "password") {
      try {
        await auth.changePassword(values.currentPassword, values.newPassword);
        client.clearSession();
        user = null;
        data = {};
        stopStream();
        error = "";
        message = "Password changed. Please sign in again.";
        render();
      } catch (err) {
        error = errorText(err);
        render();
      }
      return;
    }
    if (kind === "attendance") {
      const existing = (data.records || []).find(
        (r) => r.studentId === form.dataset.studentId,
      );
      if (
        existing &&
        existing.status !== values.status &&
        !values.correctionReason.trim()
      ) {
        error =
          "Changing an existing attendance status requires a correction reason.";
        render();
        return;
      }
      await mutate(
        () =>
          attendance.record(selection, data.date, [
            {
              studentId: form.dataset.studentId,
              status: values.status,
              ...(values.correctionReason.trim()
                ? { correctionReason: values.correctionReason.trim() }
                : {}),
            },
          ]),
        "Attendance saved.",
      );
    }
    if (
      kind === "handover" &&
      confirm("Confirm handover to the selected, identity-verified guardian?")
    )
      await mutate(
        () => transport.handover(form.dataset.studentId, values.guardianId),
        "Guardian handover recorded.",
      );
    if (kind === "location") {
      const route = data.routes.find((r) => r.id === selection);
      await mutate(
        () =>
          transport.publishLocation(route.vehicleId, {
            latitude: Number(values.latitude),
            longitude: Number(values.longitude),
          }),
        "Vehicle location recorded independently of student checkpoints.",
      );
    }
    if (kind === "admin") {
      const key = form.dataset.resource;
      ["capacity", "latitude", "longitude", "sequence"].forEach((k) => {
        if (k in values) values[k] = Number(values[k]);
      });
      Object.keys(values).forEach((k) => {
        if (values[k] === "") delete values[k];
      });
      if (key === "guardians")
        values.authorisedPickup = form.elements.authorisedPickup.checked;
      if (key === "devices")
        values.allowedEventTypes = new FormData(form).getAll(
          "allowedEventTypes",
        );
      if (!confirm("Save this school record or assignment?")) return;
      const methods = {
        users: "createUser",
        students: "createStudent",
        guardians: "saveGuardian",
        classes: "createClass",
        teachers: "saveTeacherAssignment",
        vehicles: "createVehicle",
        routes: "createRoute",
        stops: "saveStop",
        studentRoutes: "saveStudentRouteAssignment",
        drivers: "saveTransportAssignment",
        devices: "createDevice",
      };
      const result = await mutate(
        () => admin[methods[key]](values),
        "School record saved.",
      );
      showToken(result);
    }
  });
  window.addEventListener("offline", () => {
    if (user) {
      stopStream();
      error = "You are offline. No new records can be confirmed.";
      render();
    }
  });
  window.addEventListener("online", () => {
    if (user && mode === "real") load();
  });
  render();
})();
