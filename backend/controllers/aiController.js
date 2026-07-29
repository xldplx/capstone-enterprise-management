const supabase = require('../config/db');

function computeEvm(tasks, schedulePct) {
    const BAC = tasks.reduce((s, t) => s + parseFloat(t.planned_cost || 0), 0);
    const EV = tasks.reduce((s, t) => s + parseFloat(t.planned_cost || 0) * (parseFloat(t.pct_complete || 0) / 100), 0);
    const AC = tasks.reduce((s, t) => s + parseFloat(t.actual_cost || 0), 0);
    const PV = BAC * parseFloat(schedulePct || 0);
    const CPI = AC > 0 ? EV / AC : null;
    const SPI = PV > 0 ? EV / PV : null;
    const EAC = CPI && CPI > 0 ? BAC / CPI : null;
    const overallPct = BAC > 0 ? (EV / BAC) * 100 : 0;
    return {
        BAC, EV, AC, PV, CPI, SPI, EAC, overallPct,
        CV: EV - AC, SV: EV - PV,
        ETC: EAC !== null ? EAC - AC : null,
        VAC: EAC !== null ? BAC - EAC : null,
        TCPI: (BAC - AC) > 0 ? (BAC - EV) / (BAC - AC) : null,
    };
}

// Helper function to call the Gemini API directly via fetch
async function callGemini(prompt, systemInstruction = '') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('API_KEY_MISSING');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
    const payload = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ],
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800
        }
    };

    if (systemInstruction) {
        payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    try {
        return data.candidates[0].content.parts[0].text;
    } catch (e) {
        throw new Error('Failed to parse Gemini response structure.');
    }
}

const getInsights = async (req, res) => {
    const { projectId } = req.params;
    try {
        let projectSummary = '';
        let progressPct = 0;
        let cpiVal = 1.0;
        let spiVal = 1.0;
        let isMock = false;
        let insightsText = '';

        if (projectId === 'portfolio') {
            // Portfolio-wide calculation
            const { data: projs } = await supabase.from('projects').select('*');
            const { data: allTasks } = await supabase.from('tasks').select('*');

            const pList = projs || [];
            const tList = allTasks || [];

            let totalBAC = 0, totalEV = 0, totalAC = 0, totalPV = 0;
            pList.forEach(p => {
                const pTasks = tList.filter(t => t.project_id === p.id);
                const evm = computeEvm(pTasks, p.schedule_pct || 0);
                totalBAC += evm.BAC;
                totalEV += evm.EV;
                totalAC += evm.AC;
                totalPV += evm.PV;
            });

            cpiVal = totalAC > 0 ? totalEV / totalAC : 1.0;
            spiVal = totalPV > 0 ? totalEV / totalPV : 1.0;
            progressPct = totalBAC > 0 ? (totalEV / totalBAC) * 100 : 0;

            projectSummary = `
                Scope: Overall Project Portfolio
                Total Active Projects: ${pList.length}
                Portfolio BAC: ${totalBAC}
                Portfolio EV: ${totalEV}
                Portfolio AC: ${totalAC}
                Portfolio PV: ${totalPV}
                Portfolio CPI: ${cpiVal.toFixed(2)}
                Portfolio SPI: ${spiVal.toFixed(2)}
                Portfolio Progress: ${progressPct.toFixed(1)}%
                Total Tasks: ${tList.length}
            `;
        } else {
            // Single project calculation
            const { data: project, error: pErr } = await supabase
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();

            if (pErr || !project) {
                return res.status(404).json({ success: false, message: 'Project not found.' });
            }

            const { data: tasks } = await supabase
                .from('tasks')
                .select('*')
                .eq('project_id', projectId);

            const taskList = tasks || [];
            const evm = computeEvm(taskList, project.schedule_pct || 0);

            cpiVal = evm.CPI !== null ? evm.CPI : 1.0;
            spiVal = evm.SPI !== null ? evm.SPI : 1.0;
            progressPct = evm.overallPct;

            projectSummary = `
                Project: ${project.project_name} (${project.project_code})
                Status: ${project.status}
                BAC: ${evm.BAC}
                EV: ${evm.EV}
                AC: ${evm.AC}
                PV: ${evm.PV}
                CPI: ${cpiVal.toFixed(2)}
                SPI: ${spiVal.toFixed(2)}
                CV: ${evm.CV}
                SV: ${evm.SV}
                Overall Progress: ${progressPct.toFixed(1)}%
                Total Tasks: ${taskList.length}
            `;
        }

        const prompt = `Here is the current state of our construction data:\n${projectSummary}\nWrite a professional, concise executive summary (strictly 2 sentences) in English outlining the budget performance, schedule health, and highlighting any major concerns or positive trends.`;
        const systemInstruction = 'You are a senior construction project management executive. Provide highly professional, dense, and objective analytical summaries. Write strictly in English. Do not write in Indonesian.';

        try {
            insightsText = await callGemini(prompt, systemInstruction);
        } catch (err) {
            console.error("Gemini getInsights Error:", err.message);
            isMock = true;
            const budgetStatus = cpiVal >= 1.0 ? 'under budget' : 'over budget';
            const scheduleStatus = spiVal >= 1.0 ? 'ahead of schedule' : 'behind schedule';
            
            insightsText = `The scope evaluated is currently running at ${progressPct.toFixed(1)}% physical completion. Operational metrics indicate budget performance is ${budgetStatus} (CPI: ${cpiVal.toFixed(2)}) and schedule progression is running ${scheduleStatus} (SPI: ${spiVal.toFixed(2)}). Recommend continuous monitoring of resource allocation to maintain schedule alignment.`;
        }

        res.json({ success: true, isMock, data: insightsText });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── GET /api/ai/risks/:projectId ─────────────────────────────────────────────
const getRisks = async (req, res) => {
    const { projectId } = req.params;
    try {
        const { data: project, error: pErr } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (pErr || !project) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const { data: tasks, error: tErr } = await supabase
            .from('tasks')
            .select('*')
            .eq('project_id', projectId);

        const taskList = tasks || [];
        const evm = computeEvm(taskList, project.schedule_pct || 0);

        // Filter out delayed tasks
        const delayedTasks = taskList.filter(t => (t.pct_complete || 0) < ((t.schedule_pct || 0) * 100));

        const delayDetails = delayedTasks.slice(0, 5).map(t =>
            `- Task: "${t.task_name}" (WBS: ${t.wbs_code}, Complete: ${t.pct_complete}%, Planned Cost: ${t.planned_cost}, Actual Cost: ${t.actual_cost})`
        ).join('\n');

        const prompt = `Project: ${project.project_name}
        EVM CPI: ${evm.CPI !== null ? evm.CPI.toFixed(2) : '1.00'}
        EVM SPI: ${evm.SPI !== null ? evm.SPI.toFixed(2) : '1.00'}
        
        Currently Delayed Tasks:\n${delayDetails || 'None'}\n
        Provide exactly 3 simple, actionable tips (1 sentence per tip) to get the project back on track. Use very simple, plain English words. Do not use business jargon or complex words. Format as a clean list with short headers.`;

        const systemInstruction = 'You are a project assistant. Provide actionable, simple, and realistic mitigations. Write strictly in English, using simple, clear, and easy-to-understand words. Do not use complex jargon or hard vocabulary. Keep the response extremely brief and summarized.';

        let risksText = '';
        let isMock = false;

        try {
            risksText = await callGemini(prompt, systemInstruction);
        } catch (err) {
            console.error("Gemini getRisks Error:", err.message);
            isMock = true;
            risksText = `### 1. Move workers to late tasks
Move workers from finished tasks to help with late tasks and speed up progress.

### 2. Check costs carefully
Check material costs to stop spending more money than planned.

### 3. Do tasks at the same time
Review which tasks can be done together to save time.`;
        }

        res.json({ success: true, isMock, data: risksText });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
const chat = async (req, res) => {
    const { message, history } = req.body;
    if (!message) {
        return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    try {
        // Fetch simple context about all projects to feed to the chatbot
        const { data: projects } = await supabase.from('projects').select('id, project_name, project_code, status, total_budget');
        const projContext = (projects || []).map(p =>
            `- Project "${p.project_name}" (Code: ${p.project_code}, Status: ${p.status}, Budget: ${p.total_budget})`
        ).join('\n');

        const systemInstruction = `You are "Leafy Assistant", an expert AI Project Analyst for Leafy-EPMS (Enterprise Project Management System). 
        You help users understand project execution, EVM metrics (Earned Value, Cost/Schedule Performance Index), and task schedules.
        
        Here is the portfolio of projects in the system:
        ${projContext}
        
        Respond professionally, concisely, and strictly stay within the context of project management. Keep answers under 2-3 sentences. Write strictly in English. Do not write in Indonesian.`;

        // Format history for the single prompt call to maintain conversation state
        const conversationHistory = (history || []).map(h =>
            `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`
        ).join('\n');

        const fullPrompt = `${conversationHistory}\nUser: ${message}\nAssistant:`;

        let chatResponse = '';
        let isMock = false;

        try {
            chatResponse = await callGemini(fullPrompt, systemInstruction);
        } catch (err) {
            console.error("Gemini Chat Error:", err.message);
            isMock = true;
            // Simple rule-based local keyword parser for realistic offline chatting
            const msgLower = message.toLowerCase();
            if (msgLower.includes('project') || msgLower.includes('list')) {
                chatResponse = `Currently, the Leafy portfolio has ${projects ? projects.length : 0} projects. You can select any project from the dashboard drop-down to view its detailed Earned Value cost and schedule performance.`;
            } else if (msgLower.includes('hello') || msgLower.includes('hi')) {
                chatResponse = "Hello! I am Leafy Assistant, your offline project advisor. How can I help you manage your construction schedules or budget controls today?";
            } else if (msgLower.includes('cpi') || msgLower.includes('spi') || msgLower.includes('evm')) {
                chatResponse = "CPI (Cost Performance Index) indicates cost efficiency (values > 1.0 represent under-budget status). SPI (Schedule Performance Index) indicates schedule progress (values > 1.0 represent ahead-of-schedule status).";
            } else {
                chatResponse = "I am currently running in offline mock mode because the Google Gemini API key is not configured. I can answer questions about general EVM indices and project structures!";
            }
        }

        res.json({ success: true, isMock, data: chatResponse });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    getInsights,
    getRisks,
    chat
};
