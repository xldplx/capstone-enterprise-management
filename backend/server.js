const path = require('path');

// Hanya load .env lokal jika tidak running di Vercel production
if (!process.env.VERCEL) {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
}

const express = require('express');
const cors    = require('cors');
const { PORT } = require('./config/constants');
const { authenticate, authorize, authorizeSelfOr } = require('./middleware/auth');
const { requestLogger, logger }   = require('./utils/logger');

// Multer untuk upload foto evidence (memory storage → langsung ke Supabase Storage)
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 }, // max 5 MB
});

// ── Controllers ───────────────────────────────────────────────────────────────
const auth        = require('./controllers/authController');
const projects    = require('./controllers/projectsController');
const tasks       = require('./controllers/tasksController');
const wbs         = require('./controllers/wbsController');
const daily       = require('./controllers/dailyActualsController');
const personnel   = require('./controllers/personnelController');
const alertsEvm   = require('./controllers/alertsEvmController');
const users       = require('./controllers/usersController');
const consumables = require('./controllers/consumablesController');
const budget      = require('./controllers/budgetController');
const tools       = require('./controllers/toolsController');
const audit       = require('./controllers/auditController');
const materials   = require('./controllers/materialsController');
const equipment   = require('./controllers/equipmentController');
const report      = require('./controllers/reportController');
const readiness   = require('./controllers/planningReadinessController');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'https://leafy-epms.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        // Allow all origins in local development to avoid localhost vs 127.0.0.1 or port mismatch issues
        if (process.env.NODE_ENV === 'development' || !process.env.VERCEL) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Express 5: wildcard harus pakai regex
app.options(/.*/, cors());

app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.header('Access-Control-Allow-Credentials', 'true');
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(requestLogger);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── AI Integration ────────────────────────────────────────────────────────────
const aiRoutes = require('./routes/aiRoutes');
app.use('/api/ai', aiRoutes);

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/login',   auth.login);
app.post('/api/refresh', auth.refreshToken);
app.post('/api/logout',  authenticate, auth.logout);
app.get ('/api/me',      authenticate, auth.getMe);

// ── Users ─────────────────────────────────────────────────────────────────────
app.get   ('/api/users',                authenticate, authorize('Project Manager'), users.getAllUsers);
app.get   ('/api/users/:id',            authenticate, authorizeSelfOr('Project Manager'), users.getUserById);
app.post  ('/api/users',                authenticate, authorize('Project Manager'), users.createUser);
// Semua role boleh update profil MILIKNYA sendiri (halaman My Profile);
// Project Manager tetap bisa update user siapa pun (halaman Settings)
app.put   ('/api/users/:id',            authenticate, authorizeSelfOr('Project Manager'), users.updateUser);
app.patch ('/api/users/:id/deactivate', authenticate, authorize('Project Manager'), users.deactivateUser);
app.patch ('/api/users/:id/activate',   authenticate, authorize('Project Manager'), users.activateUser);
app.delete('/api/users/:id',            authenticate, authorize('Project Manager'), users.deleteUser);

// ── Projects ──────────────────────────────────────────────────────────────────
app.get   ('/api/projects',     authenticate, projects.getAllProjects);
app.get   ('/api/projects/:id', authenticate, projects.getProjectById);
app.post  ('/api/projects',     authenticate, authorize('Project Manager'), projects.createProject);
app.put   ('/api/projects/:id', authenticate, authorize('Project Manager'), projects.updateProject);
app.delete('/api/projects/:id', authenticate, authorize('Project Manager'), projects.deleteProject);

// ── WBS ───────────────────────────────────────────────────────────────────────
app.get   ('/api/projects/:projectId/wbs',     authenticate, wbs.getWbsByProject);
app.post  ('/api/projects/:projectId/wbs',     authenticate, authorize('Project Manager', 'Planner'), wbs.createWbsNode);
app.put   ('/api/projects/:projectId/wbs/:id', authenticate, authorize('Project Manager', 'Planner'), wbs.updateWbsNode);
app.delete('/api/projects/:projectId/wbs/:id', authenticate, authorize('Project Manager'), wbs.deleteWbsNode);

// ── Tasks ─────────────────────────────────────────────────────────────────────
// PENTING: route spesifik harus didaftarkan SEBELUM route generik (:id)
app.get   ('/api/projects/:projectId/planning-readiness', authenticate, authorize('Project Manager', 'Planner'), readiness.getPlanningReadiness);
app.post  ('/api/projects/:projectId/planning-readiness/dependency-preview', authenticate, authorize('Project Manager', 'Planner'), readiness.previewDependency);
app.get   ('/api/projects/:projectId/tasks/baseline', authenticate, tasks.getBaselineInfo);
app.post  ('/api/projects/:projectId/tasks/baseline', authenticate, authorize('Project Manager'), tasks.lockBaseline);
app.post  ('/api/projects/:projectId/tasks/import',   authenticate, authorize('Project Manager', 'Planner'), tasks.bulkImportTasks);
app.get   ('/api/projects/:projectId/tasks',          authenticate, tasks.getTasksByProject);
app.post  ('/api/projects/:projectId/tasks',          authenticate, authorize('Project Manager', 'Planner'), tasks.createTask);
app.put   ('/api/tasks/:id',                          authenticate, authorize('Project Manager', 'Planner', 'Cost Engineer'), tasks.updateTask);
app.delete('/api/tasks/:id',                          authenticate, authorize('Project Manager'), tasks.deleteTask);

// ── Report ────────────────────────────────────────────────────────────────────
app.get  ('/api/projects/:projectId/report/critical', authenticate, report.getCriticalActivities);
app.get  ('/api/projects/:projectId/report/delay',    authenticate, report.getDelayAnalysis);
app.get  ('/api/projects/:projectId/report/summary',  authenticate, report.getReportSummary);
app.patch('/api/projects/:projectId/report/refresh',  authenticate, authorize('Project Manager', 'Planner', 'Cost Engineer', 'Site Engineer'), report.refreshSchedulePct);

// ── Daily Actuals ─────────────────────────────────────────────────────────────
app.get ('/api/projects/:projectId/daily-actuals', authenticate, daily.getDailyActuals);
app.post('/api/projects/:projectId/daily-actuals', authenticate, authorize('Project Manager', 'Site Engineer'), daily.submitDailyActuals);
// Upload foto evidence ke Supabase Storage (bucket "evidence") — multipart/form-data, field "file"
app.post('/api/projects/:projectId/daily-actuals/evidence',
    authenticate, authorize('Project Manager', 'Site Engineer'),
    upload.single('file'), daily.uploadEvidencePhoto);

// ── Personnel ─────────────────────────────────────────────────────────────────
app.get   ('/api/personnel',     authenticate, personnel.getAllPersonnel);
app.post  ('/api/personnel',     authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), personnel.createPersonnel);
app.put   ('/api/personnel/:id', authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), personnel.updatePersonnel);
app.delete('/api/personnel/:id', authenticate, authorize('Project Manager'), personnel.deletePersonnel);

// ── Consumables ───────────────────────────────────────────────────────────────
app.get   ('/api/consumables',     authenticate, consumables.getAllConsumables);
app.post  ('/api/consumables',     authenticate, authorize('Project Manager', 'Planner'), consumables.createConsumable);
app.put   ('/api/consumables/:id', authenticate, authorize('Project Manager', 'Planner'), consumables.updateConsumable);
app.delete('/api/consumables/:id', authenticate, authorize('Project Manager'), consumables.deleteConsumable);
app.get   ('/api/consumable-logs', authenticate, consumables.getLogs);
app.post  ('/api/consumable-logs', authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), consumables.logConsumption);

// ── Budget ─────────────────────────────────────────────────────────────────────
// PENTING: /sync-all harus sebelum /:id
app.get   ('/api/budget',          authenticate, budget.getBudgetByProject);
app.post  ('/api/budget',          authenticate, authorize('Project Manager', 'Cost Engineer'), budget.createBudgetCategory);
app.patch ('/api/budget/sync-all', authenticate, authorize('Project Manager', 'Cost Engineer'), budget.syncAllActuals);
app.put   ('/api/budget/:id',      authenticate, authorize('Project Manager', 'Cost Engineer'), budget.updateBudgetCategory);
app.patch ('/api/budget/:id/sync', authenticate, authorize('Project Manager', 'Cost Engineer'), budget.syncActualFromTasks);
app.delete('/api/budget/:id',      authenticate, authorize('Project Manager'), budget.deleteBudgetCategory);

// ── Tools ─────────────────────────────────────────────────────────────────────
app.get   ('/api/tools',              authenticate, tools.getAllTools);
app.post  ('/api/tools',              authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), tools.createTool);
app.put   ('/api/tools/:id',          authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), tools.updateTool);
app.delete('/api/tools/:id',          authenticate, authorize('Project Manager'), tools.deleteTool);
app.patch ('/api/tools/:id/checkout', authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), tools.checkoutTool);
app.patch ('/api/tools/:id/return',   authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), tools.returnTool);

// ── Materials ─────────────────────────────────────────────────────────────────
// PENTING: /materials/receipts harus SEBELUM /materials/:id
app.get   ('/api/materials/receipts',     authenticate, materials.getReceipts);
app.post  ('/api/materials/receipts',     authenticate, authorize('Project Manager', 'Planner', 'Site Engineer'), materials.createReceipt);
app.put   ('/api/materials/receipts/:id', authenticate, authorize('Project Manager', 'Planner'), materials.verifyReceipt);
app.get   ('/api/materials',     authenticate, materials.getAllMaterials);
app.post  ('/api/materials',     authenticate, authorize('Project Manager', 'Planner'), materials.createMaterial);
app.put   ('/api/materials/:id', authenticate, authorize('Project Manager', 'Planner'), materials.updateMaterial);
app.delete('/api/materials/:id', authenticate, authorize('Project Manager'), materials.deleteMaterial);

// ── Equipment ─────────────────────────────────────────────────────────────────
app.get   ('/api/equipment',     authenticate, equipment.getAllEquipment);
app.post  ('/api/equipment',     authenticate, authorize('Project Manager', 'Planner'), equipment.createEquipment);
app.put   ('/api/equipment/:id', authenticate, authorize('Project Manager', 'Planner'), equipment.updateEquipment);
app.delete('/api/equipment/:id', authenticate, authorize('Project Manager'), equipment.deleteEquipment);

// ── Audit Log ─────────────────────────────────────────────────────────────────
app.get('/api/audit',      authenticate, authorize('Project Manager'), audit.getAuditLogs);
app.get('/api/audit/meta', authenticate, authorize('Project Manager'), audit.getAuditMeta);

// ── Alerts & EVM ─────────────────────────────────────────────────────────────
app.get('/api/alerts/raw',        authenticate, alertsEvm.getAlertsRaw);
app.get('/api/alerts/thresholds', authenticate, alertsEvm.getThresholds);
app.put('/api/alerts/thresholds', authenticate, authorize('Project Manager'), alertsEvm.updateThresholds);
app.get('/api/alerts',            authenticate, alertsEvm.getAlerts);
app.get('/api/evm/overview',      authenticate, alertsEvm.getPortfolioOverview);
app.get('/api/evm/:projectId',    authenticate, alertsEvm.getProjectEvm);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: `${req.method} ${req.path} not found.` });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    logger.error('Unhandled error', {
        requestId: req.requestId,
        error:     err.message,
        stack:     err.stack,
        route:     req.originalUrl,
        user:      req.user?.username || 'anonymous',
    });
    if (process.env.NODE_ENV === 'production') {
        res.status(500).json({ success: false, message: 'Internal server error.' });
    } else {
        res.status(500).json({ success: false, message: err.message, stack: err.stack });
    }
});

// ── Start Server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
    logger.info('🚀 EPMS backend started', { port: PORT, env: process.env.NODE_ENV || 'development' });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
let isShuttingDown = false;

const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('Graceful shutdown initiated', { signal });
    server.close((err) => {
        if (err) { logger.error('Shutdown error', { error: err.message }); process.exit(1); }
        logger.info('All connections drained. Shutting down.');
        process.exit(0);
    });
    setTimeout(() => { logger.warn('Forcing shutdown.'); process.exit(1); }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
});

module.exports = app;
