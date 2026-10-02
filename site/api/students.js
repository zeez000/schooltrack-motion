(() => {
  'use strict';
  const root = window.SchoolTrackAPI = window.SchoolTrackAPI || {};
  root.students = client => ({
    mine: () => client.request('/api/me/students'),
    get: id => client.request(`/api/students/${id}`),
    today: id => client.request(`/api/students/${id}/today`),
    journeys: id => client.request(`/api/students/${id}/journeys`),
    attendance: (id,query='') => client.request(`/api/students/${id}/attendance${query}`),
    notifications: id => client.request(`/api/students/${id}/notifications`)
  });
})();
