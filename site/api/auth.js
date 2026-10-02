(() => {
  "use strict";
  const root = (window.SchoolTrackAPI = window.SchoolTrackAPI || {});
  root.auth = (client) => ({
    login: (email, password) => client.login(email, password),
    refresh: () => client.refresh(),
    logout: () => client.logout(),
    me: () => client.request("/api/auth/me"),
    changePassword: (currentPassword, newPassword) =>
      client.request("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      }),
  });
})();
