export function previewRemediesForFinding(finding) {
    if (finding?.code !== 'DATE_ORDER_CONFLICT') return [];
    return finding.previewAvailable
        ? ['shift_successor_chain', 'remove_dependency']
        : ['remove_dependency'];
}

export function taskIdForFinding(finding, affectedTasks) {
    if (finding?.edge?.successorId != null) {
        const successor = affectedTasks.find(task => String(task.id) === String(finding.edge.successorId));
        if (successor) return successor.id;
    }
    return affectedTasks[0]?.id ?? null;
}
