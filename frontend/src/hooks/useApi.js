// src/hooks/useApi.js
import axios from 'axios';

const api = axios.create({
  baseURL: (process.env.REACT_APP_API_URL + '/api'),
 
  timeout: 15000,
});
console.log("API URL:", process.env.REACT_APP_API_URL);
// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('grd_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('grd_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
