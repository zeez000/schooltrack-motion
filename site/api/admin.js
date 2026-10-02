(() => {
  "use strict";
  const root = (window.SchoolTrackAPI = window.SchoolTrackAPI || {});
  root.admin = (client) => {
    const get = (resource) => client.request(`/api/admin/${resource}`);
    const post = (resource, body) =>
      client.request(`/api/admin/${resource}`, { method: "POST", body });
    return {
      users: () => get("users"),
      createUser: (body) => post("users", body),
      setUserStatus: (id, status) =>
        client.request(`/api/admin/users/${id}/status`, {
          method: "PATCH",
          body: { status },
        }),
      students: () => get("students"),
      createStudent: (body) => post("students", body),
      guardians: () => get("guardians"),
      saveGuardian: (body) => post("guardians", body),
      classes: () => get("classes"),
      createClass: (body) => post("classes", body),
      teacherAssignments: () => get("teacher-class-assignments"),
      saveTeacherAssignment: (body) => post("teacher-class-assignments", body),
      vehicles: () => get("vehicles"),
      createVehicle: (body) => post("vehicles", body),
      routes: () => get("routes"),
      createRoute: (body) => post("routes", body),
      saveStop: ({ routeId, ...body }) => post(`routes/${routeId}/stops`, body),
      studentRouteAssignments: () => get("student-route-assignments"),
      saveStudentRouteAssignment: (body) =>
        post("student-route-assignments", body),
      transportAssignments: () => get("transport-assignments"),
      saveTransportAssignment: (body) => post("transport-assignments", body),
      devices: () => get("devices"),
      createDevice: (body) => post("devices", body),
      rotateDevice: (id) => post(`devices/${id}/rotate-token`, {}),
      setDeviceStatus: (id, status) =>
        client.request(`/api/admin/devices/${id}/status`, {
          method: "PATCH",
          body: { status },
        }),
      audits: () => get("audit"),
    };
  };
})();
