(() => {
  "use strict";
  const root = (window.SchoolTrackAPI = window.SchoolTrackAPI || {});
  root.transport = (client) => ({
    routes: () => client.request("/api/transport/routes/me"),
    start: (routeId, direction) =>
      client.request(`/api/routes/${routeId}/start`, {
        method: "POST",
        body: { direction },
      }),
    end: (routeId, direction) =>
      client.request(`/api/routes/${routeId}/end`, {
        method: "POST",
        body: { direction },
      }),
    board: (studentId, direction) =>
      client.request(`/api/students/${studentId}/boarding`, {
        method: "POST",
        body: {
          direction,
          sourceEventId: `web-boarding-${crypto.randomUUID()}`,
        },
      }),
    handover: (studentId, guardianId) =>
      client.request(`/api/students/${studentId}/handover`, {
        method: "POST",
        body: {
          guardianId,
          sourceEventId: `web-handover-${crypto.randomUUID()}`,
        },
      }),
    location: (vehicleId) =>
      client.request(`/api/vehicles/${vehicleId}/location`),
    publishLocation: (vehicleId, location) =>
      client.request(`/api/vehicles/${vehicleId}/location`, {
        method: "POST",
        body: location,
      }),
    streamLocation: (vehicleId, options) =>
      client.stream(`/api/vehicles/${vehicleId}/stream`, options),
  });
})();
