const BASE_URL = import.meta.env.PROD
    ? 'https://leafy-epms-backend-8yvw4paho-xldplxs-projects.vercel.app/api'
    : 'http://localhost:5000/api';

function getToken() { return localStorage.getItem('token'); }

export async function apiFetch(path, options = {}) {
    const token = getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
    return data;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authApi = {
    login: (username, password) =>
        apiFetch('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    getMe: () => apiFetch('/me'),
};

// ─── USERS (User Management) ──────────────────────────────────────────────────
export const usersApi = {
    getAll:      ()            => apiFetch('/users'),
    getById:     (id)          => apiFetch(`/users/${id}`),
    create:      (payload)     => apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) }),
    update:      (id, payload) => apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deactivate:  (id)          => apiFetch(`/users/${id}/deactivate`, { method: 'PATCH' }),
    activate:    (id)          => apiFetch(`/users/${id}/activate`,   { method: 'PATCH' }),
    delete:      (id)          => apiFetch(`/users/${id}`, { method: 'DELETE' }),
};

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
export const projectsApi = {
    getAll:  ()            => apiFetch('/projects'),
    getById: (id)          => apiFetch(`/projects/${id}`),
    create:  (payload)     => apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) }),
    update:  (id, payload) => apiFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete:  (id)          => apiFetch(`/projects/${id}`, { method: 'DELETE' }),
};

// ─── TASKS ────────────────────────────────────────────────────────────────────
export const tasksApi = {
    getByProject: (projectId)               => apiFetch(`/projects/${projectId}/tasks`),
    create:       (projectId, payload)      => apiFetch(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(payload) }),
    update:       (taskId, payload)         => apiFetch(`/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete:       (taskId)                  => apiFetch(`/tasks/${taskId}`, { method: 'DELETE' }),
    bulkImport:   (projectId, tasks)        => apiFetch(`/projects/${projectId}/tasks/import`, { method: 'POST', body: JSON.stringify({ tasks }) }),
    lockBaseline: (projectId, baselineName) => apiFetch(`/projects/${projectId}/tasks/baseline`, { method: 'POST', body: JSON.stringify({ baseline_name: baselineName }) }),
};

// ─── WBS ──────────────────────────────────────────────────────────────────────
export const wbsApi = {
    getByProject: (projectId)          => apiFetch(`/projects/${projectId}/wbs`),
    create:       (projectId, payload) => apiFetch(`/projects/${projectId}/wbs`, { method: 'POST', body: JSON.stringify(payload) }),
    delete:       (projectId, wbsId)   => apiFetch(`/projects/${projectId}/wbs/${wbsId}`, { method: 'DELETE' }),
};

// ─── DAILY ACTUALS ────────────────────────────────────────────────────────────
export const dailyActualsApi = {
    getByProject: (projectId, date) => apiFetch(`/projects/${projectId}/daily-actuals${date ? `?date=${date}` : ''}`),
    submit: (projectId, entryDate, entries) => apiFetch(`/projects/${projectId}/daily-actuals`, {
        method: 'POST',
        body: JSON.stringify({ entry_date: entryDate, entries }),
    }),
};

// ─── PERSONNEL ────────────────────────────────────────────────────────────────
export const personnelApi = {
    getAll:  (projectId)   => apiFetch(`/personnel${projectId ? `?project_id=${projectId}` : ''}`),
    create:  (payload)     => apiFetch('/personnel', { method: 'POST', body: JSON.stringify(payload) }),
    update:  (id, payload) => apiFetch(`/personnel/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete:  (id)          => apiFetch(`/personnel/${id}`, { method: 'DELETE' }),
};

// ─── ALERTS & THRESHOLDS ──────────────────────────────────────────────────────
export const alertsApi = {
    getAlertsRaw:     ()          => apiFetch('/alerts/raw'),
    getAlerts:        (projectId) => apiFetch(`/alerts${projectId ? `?project_id=${projectId}` : ''}`),
    getThresholds:    (projectId) => apiFetch(`/alerts/thresholds${projectId ? `?project_id=${projectId}` : ''}`),
    updateThresholds: (payload)   => apiFetch('/alerts/thresholds', { method: 'PUT', body: JSON.stringify(payload) }),
};

// ─── EVM ──────────────────────────────────────────────────────────────────────
export const evmApi = {
    getOverview:  ()          => apiFetch('/evm/overview'),
    getByProject: (projectId) => apiFetch(`/evm/${projectId}`),
};

// ─── EQUIPMENT ────────────────────────────────────────────────────────────────
export const equipmentApi = {
    getAll:  (filters = {}) => apiFetch(`/equipment${Object.keys(filters).length ? '?' + new URLSearchParams(filters) : ''}`),
    create:  (payload)      => apiFetch('/equipment', { method: 'POST', body: JSON.stringify(payload) }),
    update:  (id, payload)  => apiFetch(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete:  (id)           => apiFetch(`/equipment/${id}`, { method: 'DELETE' }),
};

// ─── CONSUMABLES ──────────────────────────────────────────────────────────────
export const consumablesApi = {
    getAll:       ()              => apiFetch('/consumables'),
    create:       (payload)       => apiFetch('/consumables', { method: 'POST', body: JSON.stringify(payload) }),
    update:       (id, payload)   => apiFetch(`/consumables/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete:       (id)            => apiFetch(`/consumables/${id}`, { method: 'DELETE' }),
    getLogs:      (projectId)     => apiFetch(`/consumable-logs?project_id=${projectId}`),
    logUsage:     (payload)       => apiFetch('/consumable-logs', { method: 'POST', body: JSON.stringify(payload) }),
};
// ─── MATERIALS ────────────────────────────────────────────────────────────────
export const materialsApi = {
    getAll:        (filters = {}) => apiFetch(`/materials${Object.keys(filters).length ? '?' + new URLSearchParams(filters) : ''}`),
    create:        (payload)      => apiFetch('/materials', { method: 'POST', body: JSON.stringify(payload) }),
    update:        (id, payload)  => apiFetch(`/materials/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete:        (id)           => apiFetch(`/materials/${id}`, { method: 'DELETE' }),
    getReceipts:   (filters = {}) => apiFetch(`/materials/receipts${Object.keys(filters).length ? '?' + new URLSearchParams(filters) : ''}`),
    createReceipt: (payload)      => apiFetch('/materials/receipts', { method: 'POST', body: JSON.stringify(payload) }),
    verifyReceipt: (id)           => apiFetch(`/materials/receipts/${id}`, { method: 'PUT', body: JSON.stringify({ verified: true }) }),
};
// ─── BUDGET ──────────────────────────────────────────────────────────────────────
export const budgetApi = {
    getByProject: (projectId)     => apiFetch(`/budget?project_id=${projectId}`),
    create:       (payload)       => apiFetch('/budget', { method: 'POST', body: JSON.stringify(payload) }),
    update:       (id, payload)   => apiFetch(`/budget/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete:       (id)            => apiFetch(`/budget/${id}`, { method: 'DELETE' }),
};

// ─── AI INTEGRATION ──────────────────────────────────────────────────────────────
export const aiApi = {
    getInsights: (projectId)      => apiFetch(`/ai/insights/${projectId}`),
    getRisks:    (projectId)      => apiFetch(`/ai/risks/${projectId}`),
    sendMessage: (message, history) => apiFetch('/ai/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
};