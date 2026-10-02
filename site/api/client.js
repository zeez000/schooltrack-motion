(() => {
  'use strict';
  const root = window.SchoolTrackAPI = window.SchoolTrackAPI || {};

  class ApiError extends Error {
    constructor(message, {status = 0, code = 'REQUEST_FAILED', details, cause} = {}) {
      super(message, {cause});
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  class ApiClient {
    constructor(baseUrl, fetchImpl = window.fetch.bind(window)) {
      this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
      this.fetchImpl = fetchImpl;
      this.accessToken = '';
      this.refreshToken = '';
      this.user = null;
      this.refreshPromise = null;
      this.onSessionExpired = null;
    }

    setBaseUrl(value) { this.baseUrl = String(value || '').trim().replace(/\/$/, ''); }
    setSession(session) {
      this.accessToken = session.accessToken || '';
      this.refreshToken = session.refreshToken || this.refreshToken || '';
      this.user = session.user || this.user;
    }
    clearSession() { this.accessToken = ''; this.refreshToken = ''; this.user = null; }

    async request(path, options = {}) {
      const {auth = true, retry = true, body, headers = {}, ...fetchOptions} = options;
      if (!this.baseUrl) throw new ApiError('The SchoolTrack API URL is not configured.', {code:'API_NOT_CONFIGURED'});
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('You appear to be offline.', {code:'OFFLINE'});
      const requestHeaders = {...headers};
      if (body !== undefined) requestHeaders['content-type'] = 'application/json';
      if (auth && this.accessToken) requestHeaders.authorization = `Bearer ${this.accessToken}`;
      let response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {...fetchOptions, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body)});
      } catch (cause) {
        throw new ApiError('SchoolTrack could not reach the server.', {code:'NETWORK_UNAVAILABLE', cause});
      }
      if (response.status === 401 && auth && retry && this.refreshToken) {
        await this.refresh();
        return this.request(path, {...options, retry:false});
      }
      if (response.status === 204) return null;
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : await response.text();
      if (!response.ok) {
        const error = payload && typeof payload === 'object' ? payload.error : null;
        throw new ApiError(error?.message || `SchoolTrack request failed (${response.status}).`, {status:response.status, code:error?.code || 'REQUEST_FAILED', details:error?.details});
      }
      return payload;
    }

    async login(email, password) {
      const session = await this.request('/api/auth/login', {method:'POST', auth:false, body:{email, password}});
      this.setSession(session);
      return session;
    }

    async refresh() {
      if (!this.refreshToken) throw new ApiError('Your session has expired.', {status:401, code:'SESSION_EXPIRED'});
      if (!this.refreshPromise) {
        this.refreshPromise = this.request('/api/auth/refresh', {method:'POST', auth:false, retry:false, body:{refreshToken:this.refreshToken}})
          .then(session => { this.setSession(session); return session; })
          .catch(error => { this.clearSession(); this.onSessionExpired?.(error); throw error; })
          .finally(() => { this.refreshPromise = null; });
      }
      return this.refreshPromise;
    }

    async logout() {
      const refreshToken = this.refreshToken;
      this.clearSession();
      if (refreshToken) await this.request('/api/auth/logout', {method:'POST', auth:false, retry:false, body:{refreshToken}});
    }

    async stream(path, {onEvent, onState, signal} = {}) {
      let attempt = 0;
      while (!signal?.aborted) {
        onState?.(attempt ? 'RECONNECTING' : 'CONNECTING');
        try {
          const headers = this.accessToken ? {authorization:`Bearer ${this.accessToken}`} : {};
          let response = await this.fetchImpl(`${this.baseUrl}${path}`, {headers, signal});
          if (response.status === 401 && this.refreshToken) {
            await this.refresh();
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {headers:{authorization:`Bearer ${this.accessToken}`}, signal});
          }
          if (!response.ok || !response.body) throw new ApiError(`Live updates failed (${response.status}).`, {status:response.status, code:'STREAM_FAILED'});
          onState?.('CONNECTED'); attempt = 0;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!signal?.aborted) {
            const {value, done} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream:true});
            const frames = buffer.split('\n\n'); buffer = frames.pop() || '';
            for (const frame of frames) {
              const event = frame.match(/^event:\s*(.+)$/m)?.[1] || 'message';
              const data = frame.match(/^data:\s*(.*)$/m)?.[1];
              if (data !== undefined) onEvent?.(event, JSON.parse(data));
            }
          }
        } catch (error) {
          if (signal?.aborted) return;
          onState?.('UNAVAILABLE', error);
          if (error.status === 401 || error.status === 403 || !this.accessToken) return;
        }
        attempt += 1;
        await new Promise(resolve => {
          const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort',finish); resolve(); };
          const timer = setTimeout(finish, Math.min(1000 * (2 ** attempt), 15000));
          signal?.addEventListener('abort',finish,{once:true});
          if(signal?.aborted)finish();
        });
      }
    }
  }

  root.ApiError = ApiError;
  root.ApiClient = ApiClient;
  root.createClient = (baseUrl, fetchImpl) => new ApiClient(baseUrl, fetchImpl);
})();
