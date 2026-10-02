(() => {
  'use strict';
  const root = window.SchoolTrackAPI = window.SchoolTrackAPI || {};
  root.notifications = client => ({
    list: unread => client.request(`/api/notifications${unread ? '?unread=true' : ''}`),
    markRead: id => client.request(`/api/notifications/${id}/read`,{method:'PATCH'})
  });
})();
