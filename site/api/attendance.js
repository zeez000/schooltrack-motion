(() => {
  "use strict";
  const root = (window.SchoolTrackAPI = window.SchoolTrackAPI || {});
  root.attendance = (client) => ({
    classes: () => client.request("/api/teacher/classes"),
    students: (classId) => client.request(`/api/classes/${classId}/students`),
    get: (classId, date = "") =>
      client.request(
        `/api/classes/${classId}/attendance${date ? `?date=${encodeURIComponent(date)}` : ""}`,
      ),
    record: (classId, date, records) =>
      client.request(`/api/classes/${classId}/attendance`, {
        method: "POST",
        body: { ...(date ? { date } : {}), records },
      }),
    classroom: (studentId) =>
      client.request(`/api/students/${studentId}/checkpoints/classroom`, {
        method: "POST",
        body: { sourceEventId: `web-classroom-${crypto.randomUUID()}` },
      }),
  });
})();
