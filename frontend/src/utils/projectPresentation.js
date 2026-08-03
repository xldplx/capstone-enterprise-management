const STATUS_ORDER = { active: 0, planning: 1, completed: 2, on_hold: 3 };

export function resolveDisplayedProjectStatus(project, planningLocked = false) {
    const status = project?.status || 'planning';
    return planningLocked && status === 'planning' ? 'active' : status;
}

export function sortProjectsForSelection(projects) {
    return [...projects].sort((a, b) => {
        const statusDifference = (STATUS_ORDER[a.status || 'planning'] ?? 9) - (STATUS_ORDER[b.status || 'planning'] ?? 9);
        if (statusDifference !== 0) return statusDifference;
        return String(a.project_name || '').localeCompare(String(b.project_name || ''));
    });
}

export function formatProjectStatus(status) {
    return String(status || 'planning').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}
